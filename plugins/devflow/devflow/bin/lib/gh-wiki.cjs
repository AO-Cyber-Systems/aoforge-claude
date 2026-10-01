'use strict';

// gh-wiki.cjs (TRD 47-04, GST-06 / GST-08 wiki half / GST-02 revision pin) — the wiki store.
//
// GitHub is the system of record for long-form planning documents (PROJECT, REQUIREMENTS, the
// objective OBJECTIVE/CONTEXT/RESEARCH bodies, codebase docs, ADRs, retros). They live in the repo's
// wiki, a git repository at `<repo>.wiki.git`. This module is the whole interface to it:
//
//   - ONE page table (`PAGE_TABLE`) maps a `.planning/` cache path to a wiki page name and back.
//   - `.planning/wiki/` is a local clone of the wiki. It is excluded locally through the repo's
//     `info/exclude` (never `.gitignore`: that is repo content, this is per-checkout cache).
//   - Writes are: add -> commit (skipped when nothing is staged) -> `pull --rebase origin master` ->
//     `push origin HEAD:master`. A rebase conflict aborts the rebase and is REPORTED; this module never
//     force-pushes and never resolves a conflict for the human.
//   - The `docs` backend has the same interface and writes `docs/devflow/<Page>.md` into the working
//     tree. It is repo content, committed by the user's normal flow; `push` on it is a no-op.
//
// Which backend a repo gets is decided by the capability probe (47-06): `disabled` selects `docs`, an
// `uninitialised` wiki is REPORTED ("create the first wiki page in the web UI") and never silently
// replaced. This module only provides both backends.
//
// `git` is spawned ONLY through `runGit` below (argv array, never a shell string). `_setRunGit(fn)`
// replaces it for tests; `_setRunGit(null)` restores it. Nothing here shells out to anything else.

const { toObjectiveId } = require('./gh-mapping.cjs');
const { readConfig, resolveRepo } = require('./gh-client.cjs');

const WIKI_DIR_REL = '.planning/wiki';
const DOCS_DIR_REL = 'docs/devflow';
const WIKI_BRANCH = 'master';

// ─── Page mapping (pure) ──────────────────────────────────────────────────────

// An objective directory name: "07-store-demo" -> prefix "07", slug "store-demo";
// "02.1-b" -> prefix "02.1", slug "b"; "02-1-b" -> prefix "02", slug "1-b" (a different objective).
const OBJECTIVE_DIR_RE = /^(\d+(?:\.\d+)?)(?:-(.+))?$/;

function parseObjectiveDir(dir) {
  if (typeof dir !== 'string') return null;
  const m = dir.trim().match(OBJECTIVE_DIR_RE);
  if (!m) return null;
  const id = toObjectiveId(m[1]);
  if (id === null) return null;
  return { prefix: m[1], id, slug: m[2] || '' };
}

/** A slug is part of a page name and a file name: dots become `_`, anything else odd becomes `-`. */
function pageSlug(slug) {
  return slug.replace(/\./g, '_').replace(/[^A-Za-z0-9_-]+/g, '-');
}

/**
 * The wiki page for an objective directory (or any spelling `toObjectiveId` understands).
 *   "07-store-demo" -> "Objective-7-store-demo"      "02.1-b" -> "Objective-2_1-b"
 *   "02-1-b"        -> "Objective-2-1-b"             "007"    -> "Objective-7"
 * The `.` in a decimal id becomes `_`, so `2.1` and `2-1` never collide. Null for junk.
 */
function objectivePage(dir) {
  const p = parseObjectiveDir(dir);
  if (!p) return null;
  const n = p.id.replace(/\./g, '_');
  return p.slug ? `Objective-${n}-${pageSlug(p.slug)}` : `Objective-${n}`;
}

function normaliseRel(rel) {
  if (typeof rel !== 'string' || rel === '') return null;
  return rel.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

function fixedRule(name, rel, page) {
  return {
    name,
    match: (r) => (r === rel ? page : null),
    invert: (p) => (p === page ? rel : null),
  };
}

// Uppercase codebase doc names only (STACK, TECH_STACK): that is what the mapper writes, and it is what
// makes `Codebase-Stack` invert to exactly one cache path.
const CODEBASE_RE = /^codebase\/([A-Z0-9]+(?:[_-][A-Z0-9]+)*)\.md$/;
const ADR_RE = /^adr\/(\d{4,})-([A-Za-z0-9_-]+)\.md$/;
const RETRO_RE = /^retros\/v(\d+(?:\.\d+)*)\.md$/;

/** Rule for `objectives/<dir>/[<NN>-]<KIND>.md` -> `<ObjectivePage>-<Suffix>`. */
function objectiveDocRule(kind, suffix) {
  const fileRe = new RegExp(`^objectives/([^/]+)/(?:\\d+(?:\\.\\d+)?-)?${kind}\\.md$`);
  return {
    name: `objective-${kind.toLowerCase()}`,
    match(rel) {
      const m = rel.match(fileRe);
      const base = m && objectivePage(m[1]);
      return base ? `${base}-${suffix}` : null;
    },
    invert(page, ctx) {
      for (const dir of ctx.objectiveDirs) {
        const base = objectivePage(dir);
        if (base && page === `${base}-${suffix}`) {
          // The repo convention is `<dir prefix>-CONTEXT.md`; a bare CONTEXT.md round-trips as that.
          return `objectives/${dir}/${parseObjectiveDir(dir).prefix}-${kind}.md`;
        }
      }
      return null;
    },
  };
}

/**
 * THE page-mapping table (single source for both directions). An ordered rule list; each rule is
 *   { name, match(relCachePath) -> page | null, invert(page, {objectiveDirs}) -> relCachePath | null }.
 * `relCachePath` is relative to `.planning/` with `/` separators. Anything no rule matches is not a wiki
 * document (STATE.md, config.json, TRDs, SUMMARYs...), and maps to null.
 */
const PAGE_TABLE = [
  fixedRule('project', 'PROJECT.md', 'Project'),
  fixedRule('requirements', 'REQUIREMENTS.md', 'Requirements'),
  fixedRule('roadmap', 'ROADMAP.md', 'Roadmap'),
  {
    name: 'codebase',
    match(rel) {
      const m = rel.match(CODEBASE_RE);
      if (!m) return null;
      return 'Codebase-' + m[1].toLowerCase().replace(/(^|[_-])([a-z0-9])/g, (_, sep, c) => sep + c.toUpperCase());
    },
    invert(page) {
      const m = page.match(/^Codebase-([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)$/);
      return m ? `codebase/${m[1].toUpperCase()}.md` : null;
    },
  },
  objectiveDocRule('CONTEXT', 'Context'),
  objectiveDocRule('RESEARCH', 'Research'),
  {
    name: 'objective',
    match(rel) {
      const m = rel.match(/^objectives\/([^/]+)\/OBJECTIVE\.md$/);
      return m ? objectivePage(m[1]) : null;
    },
    invert(page, ctx) {
      for (const dir of ctx.objectiveDirs) {
        if (objectivePage(dir) === page) return `objectives/${dir}/OBJECTIVE.md`;
      }
      return null;
    },
  },
  {
    name: 'adr',
    match(rel) {
      const m = rel.match(ADR_RE);
      return m ? `ADR-${m[1]}-${m[2]}` : null;
    },
    invert(page) {
      const m = page.match(/^ADR-(\d{4,})-([A-Za-z0-9_-]+)$/);
      return m ? `adr/${m[1]}-${m[2]}.md` : null;
    },
  },
  {
    name: 'retro',
    match(rel) {
      const m = rel.match(RETRO_RE);
      return m ? `Retro-v${m[1].replace(/\./g, '_')}` : null;
    },
    invert(page) {
      const m = page.match(/^Retro-v(\d+(?:_\d+)*)$/);
      return m ? `retros/v${m[1].replace(/_/g, '.')}.md` : null;
    },
  },
];

/** The wiki page a `.planning/`-relative cache path belongs to, or null when it is not a wiki document. */
function pageForCachePath(rel) {
  const r = normaliseRel(rel);
  if (r === null) return null;
  for (const rule of PAGE_TABLE) {
    const page = rule.match(r);
    if (page) return page;
  }
  return null;
}

/**
 * The cache path (relative to `.planning/`) for a wiki page, or null. Objective pages cannot be inverted
 * without the objective directory names (`{objectiveDirs}`): the page name drops the zero padding. A
 * candidate must map forward to the same page, so the two directions can never drift apart.
 */
function cachePathForPage(page, opts = {}) {
  if (typeof page !== 'string' || page === '') return null;
  const ctx = { objectiveDirs: Array.isArray(opts.objectiveDirs) ? opts.objectiveDirs : [] };
  for (const rule of PAGE_TABLE) {
    const rel = rule.invert(page, ctx);
    if (rel && pageForCachePath(rel) === page) return rel;
  }
  return null;
}

// ─── Revision URL (GST-02) ────────────────────────────────────────────────────

/**
 * The browsable link to a page at a pinned wiki revision. This is the ONLY place the format lives: it is
 * widely used for wiki page history but is not in the documented API surface (LOW confidence), so a
 * correction is a one-line change here.
 */
function pageRevisionUrl(repo, page, sha) {
  return `https://github.com/${repo}/wiki/${page}/${sha}`;
}

// ─── Remote resolution ────────────────────────────────────────────────────────

/**
 * Where the wiki lives: `DEVFLOW_WIKI_REMOTE` (tests and overrides) -> `.planning/config.json`
 * `github.wiki.remote` -> `https://github.com/<repo>.wiki.git` from `github.repo`. Null when none apply.
 */
function resolveWikiRemote(cwd, opts = {}) {
  const env = opts.env || process.env;
  const fromEnv = env.DEVFLOW_WIKI_REMOTE;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();

  const cfg = readConfig(cwd);
  const fromConfig = cfg && cfg.github && cfg.github.wiki && cfg.github.wiki.remote;
  if (typeof fromConfig === 'string' && fromConfig.trim() !== '') return fromConfig.trim();

  const repo = resolveRepo(cwd);
  return repo ? `https://github.com/${repo}.wiki.git` : null;
}

module.exports = {
  WIKI_DIR_REL,
  DOCS_DIR_REL,
  WIKI_BRANCH,
  PAGE_TABLE,
  objectivePage,
  pageForCachePath,
  cachePathForPage,
  pageRevisionUrl,
  resolveWikiRemote,
  // temporary until Task 2 lands the git seam
  _setRunGit: () => {},
};
