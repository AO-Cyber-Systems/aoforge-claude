'use strict';

// gh-wiki.cjs (TRD 47-04, GST-06 / GST-08 wiki half / GST-02 revision pin) — the wiki store.
//
// GitHub is the system of record for long-form planning documents (PROJECT, REQUIREMENTS, the
// objective OBJECTIVE/CONTEXT/RESEARCH bodies and other objective docs such as UAT/EVIDENCE/ROLLOUT,
// codebase docs, research notes, milestone entries and archives, ADRs, retros). They live in the repo's
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

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { toObjectiveId } = require('./gh-mapping.cjs');
const { atomicWrite } = require('./sync-state.cjs');
const { readConfig, resolveRepo } = require('./gh-client.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

const WIKI_DIR_REL = '.planning/wiki';
const DOCS_DIR_REL = 'docs/devflow';
const WIKI_BRANCH = 'master';
const WIKI_EXCLUDE_LINE = `/${WIKI_DIR_REL}/`;
const MAX_PUSH_RETRIES = 3;
const GIT_TIMEOUT_MS = 120000;

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
    toPage: (r) => (r === rel ? page : null),
    invert: (p) => (p === page ? rel : null),
  };
}

// Uppercase codebase doc names only (STACK, TECH_STACK): that is what the mapper writes, and it is what
// makes `Codebase-Stack` invert to exactly one cache path.
const CODEBASE_RE = /^codebase\/([A-Z0-9]+(?:[_-][A-Z0-9]+)*)\.md$/;
const ADR_RE = /^adr\/(\d{4,})-([A-Za-z0-9_-]+)\.md$/;
const RETRO_RE = /^retros\/v(\d+(?:\.\d+)*)\.md$/;

// 48-05 (D-04, D-05). An UPPER-CASE kind (`MILESTONE-AUDIT`, `UAT`) is title-cased per hyphen part in the page
// name (`Milestone-Audit`, `Uat`) and upper-cased back, so each page inverts to exactly one cache path.
const RESEARCH_RE = /^research\/([A-Za-z0-9][A-Za-z0-9_-]*)\.md$/;
const MILESTONE_RE = /^milestones\/v(\d+(?:\.\d+)*)\.md$/;
const MILESTONE_ARCHIVE_RE = /^milestones\/v(\d+(?:\.\d+)*)-([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)\.md$/;
const OBJECTIVE_DOC_RE = /^objectives\/([^/]+)\/(\d+(?:\.\d+)?)-([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)\.md$/;
const TITLE_KIND_RE = /^[A-Z][a-z0-9]*(?:-[A-Z][a-z0-9]*)*$/;
// Issue-backed (TRD, SUMMARY, VERIFICATION) or already owned by a 47 rule (CONTEXT, RESEARCH).
const OBJECTIVE_DOC_EXCLUDED = new Set(['TRD', 'SUMMARY', 'VERIFICATION', 'CONTEXT', 'RESEARCH']);

/** `MILESTONE-AUDIT` -> `Milestone-Audit`. */
const titleKind = (kind) => kind.split('-').map((p) => p[0] + p.slice(1).toLowerCase()).join('-');
/** `1.3` -> `1_3` (like Retro-v1_3) and back. */
const versionToPage = (v) => v.replace(/\./g, '_');
const versionFromPage = (v) => v.replace(/_/g, '.');

// js/regex-injection (CodeQL alert 145): `kind` is an in-code constant, so escaping it (text-escape.cjs) is defensive only.

/** Rule for `objectives/<dir>/[<NN>-]<KIND>.md` -> `<ObjectivePage>-<Suffix>`. */
function objectiveDocRule(kind, suffix) {
  const fileRe = new RegExp(`^objectives/([^/]+)/(?:\\d+(?:\\.\\d+)?-)?${escapeRegExp(kind)}\\.md$`);
  return {
    name: `objective-${kind.toLowerCase()}`,
    toPage(rel) {
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
 *   { name, toPage(relCachePath) -> page | null, invert(page, {objectiveDirs}) -> relCachePath | null }.
 * `relCachePath` is relative to `.planning/` with `/` separators. Anything no rule matches is not a wiki
 * document (STATE.md, config.json, TRDs, SUMMARYs, VERIFICATIONs...), and maps to null.
 *
 * The classes, in order (order is significant: an earlier rule wins):
 *   PROJECT / REQUIREMENTS / ROADMAP         -> Project / Requirements / Roadmap
 *   codebase/STACK.md                        -> Codebase-Stack
 *   research/<stem>.md                       -> Research-<stem>                     (48-05, D-04)
 *   milestones/vX.Y.md                       -> Milestone-vX_Y                      (48-05, D-05)
 *   milestones/vX.Y-<KIND>.md                -> Milestone-vX_Y-<Kind>               (48-05, D-05)
 *   objectives/<dir>/[<N>-]CONTEXT|RESEARCH  -> <ObjectivePage>-Context|Research
 *   objectives/<dir>/OBJECTIVE.md            -> <ObjectivePage>
 *   objectives/<dir>/<N>-<SUFFIX>.md         -> <ObjectivePage>-<Suffix>            (48-05, D-04: UAT, EVIDENCE,
 *                                               ROLLOUT, DISCOVERY...; never TRD/SUMMARY/VERIFICATION)
 *   adr/NNNN-<slug>.md                       -> ADR-NNNN-<slug>
 *   retros/vX.Y.md                           -> Retro-vX_Y
 */
const PAGE_TABLE = [
  fixedRule('project', 'PROJECT.md', 'Project'),
  fixedRule('requirements', 'REQUIREMENTS.md', 'Requirements'),
  fixedRule('roadmap', 'ROADMAP.md', 'Roadmap'),
  {
    name: 'codebase',
    toPage(rel) {
      const m = rel.match(CODEBASE_RE);
      if (!m) return null;
      return 'Codebase-' + m[1].toLowerCase().replace(/(^|[_-])([a-z0-9])/g, (_, sep, c) => sep + c.toUpperCase());
    },
    invert(page) {
      const m = page.match(/^Codebase-([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)$/);
      return m ? `codebase/${m[1].toUpperCase()}.md` : null;
    },
  },
  {
    name: 'research',
    toPage(rel) {
      const m = rel.match(RESEARCH_RE);
      return m ? `Research-${m[1]}` : null;
    },
    invert(page) {
      const m = page.match(/^Research-([A-Za-z0-9][A-Za-z0-9_-]*)$/);
      return m ? `research/${m[1]}.md` : null;
    },
  },
  {
    name: 'milestone',
    toPage(rel) {
      const m = rel.match(MILESTONE_RE);
      return m ? `Milestone-v${versionToPage(m[1])}` : null;
    },
    invert(page) {
      const m = page.match(/^Milestone-v(\d+(?:_\d+)*)$/);
      return m ? `milestones/v${versionFromPage(m[1])}.md` : null;
    },
  },
  {
    name: 'milestone-archive',
    toPage(rel) {
      const m = rel.match(MILESTONE_ARCHIVE_RE);
      return m ? `Milestone-v${versionToPage(m[1])}-${titleKind(m[2])}` : null;
    },
    invert(page) {
      const m = page.match(/^Milestone-v(\d+(?:_\d+)*)-([A-Z][a-z0-9]*(?:-[A-Z][a-z0-9]*)*)$/);
      return m ? `milestones/v${versionFromPage(m[1])}-${m[2].toUpperCase()}.md` : null;
    },
  },
  objectiveDocRule('CONTEXT', 'Context'),
  objectiveDocRule('RESEARCH', 'Research'),
  {
    name: 'objective',
    toPage(rel) {
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
    // Any other `<N>-<SUFFIX>.md` beside an objective: N must be the directory's own objective prefix, so a
    // TRD (`NN-MM-...-TRD.md`) can never match, and the issue-backed suffixes are refused outright.
    name: 'objective-doc',
    toPage(rel) {
      const m = rel.match(OBJECTIVE_DOC_RE);
      if (!m || OBJECTIVE_DOC_EXCLUDED.has(m[3])) return null;
      const dir = parseObjectiveDir(m[1]);
      if (!dir || dir.prefix !== m[2]) return null;
      const base = objectivePage(m[1]);
      return base ? `${base}-${titleKind(m[3])}` : null;
    },
    invert(page, ctx) {
      for (const dir of ctx.objectiveDirs) {
        const base = objectivePage(dir);
        if (!base || !page.startsWith(`${base}-`)) continue;
        const kind = page.slice(base.length + 1);
        if (!TITLE_KIND_RE.test(kind)) continue;
        const suffix = kind.toUpperCase();
        if (OBJECTIVE_DOC_EXCLUDED.has(suffix)) continue;
        return `objectives/${dir}/${parseObjectiveDir(dir).prefix}-${suffix}.md`;
      }
      return null;
    },
  },
  {
    name: 'adr',
    toPage(rel) {
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
    toPage(rel) {
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
    const page = rule.toPage(r);
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

// ─── The git seam ─────────────────────────────────────────────────────────────

/**
 * Run one git command. Never throws; always `{ok, status, stdout, stderr}` (output is NOT trimmed).
 * argv is an array (no shell). `opts = {cwd, env}`; env is `process.env` + `GIT_TERMINAL_PROMPT=0` + opts.env.
 */
function realRunGit(args, opts = {}) {
  const cwd = opts.cwd;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) };
  const r = spawnSync('git', args, {
    cwd,
    env,
    encoding: 'utf-8',
    timeout: opts.timeout || GIT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      // A missing cwd also surfaces as ENOENT; do not blame git for it.
      if (cwd && !fs.existsSync(cwd)) {
        return { ok: false, status: null, stdout: '', stderr: `working directory does not exist: ${cwd}` };
      }
      return { ok: false, status: null, stdout: '', stderr: 'git: command not found' };
    }
    if (r.error.code === 'ETIMEDOUT') {
      return { ok: false, status: null, stdout: r.stdout || '', stderr: 'git: timed out' };
    }
    return { ok: false, status: null, stdout: r.stdout || '', stderr: String(r.error.message || r.error) };
  }
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

let runGitImpl = realRunGit;

/** Replace the git runner (tests); `_setRunGit(null)` restores the real one. */
function _setRunGit(fn) {
  runGitImpl = typeof fn === 'function' ? fn : realRunGit;
}

// ─── Failure classification ───────────────────────────────────────────────────

const AUTH_RE = /requested url returned error: (?:401|403)|authentication failed|could not read username|invalid credentials|bad credentials|permission denied/i;
const UNINIT_RE = /repository .* not found|does not appear to be a git repository/i;
const OFFLINE_RE = /could not resolve host|unable to access|connection (?:refused|reset|timed out)|timed out|network is unreachable|no route to host|temporary failure in name resolution|failed to connect|couldn't connect/i;
const CONFLICT_RE = /\bCONFLICT\b|could not apply|resolve all conflicts|merge conflict/i;
const NON_FF_RE = /non-fast-forward|fetch first|\[rejected\]|updates were rejected|remote contains work/i;

/** auth | uninitialised | offline | conflict | non_fast_forward | error — from a failed git result. */
function classifyGitFailure(r) {
  const text = `${r.stderr || ''}\n${r.stdout || ''}`;
  if (AUTH_RE.test(text)) return 'auth';
  if (UNINIT_RE.test(text)) return 'uninitialised';
  if (OFFLINE_RE.test(text)) return 'offline';
  if (CONFLICT_RE.test(text)) return 'conflict';
  if (NON_FF_RE.test(text)) return 'non_fast_forward';
  return 'error';
}

function failureResult(kind, r, extra = {}) {
  const error = (r.stderr || '').trim() || (r.stdout || '').trim() || `git exited ${r.status}`;
  const base = { ok: false, error, ...extra };
  if (kind === 'offline') return { ...base, offline: true };
  if (kind === 'uninitialised') return { ...base, uninitialised: true };
  if (kind === 'auth') return { ...base, auth: true };
  return base;
}

// ─── Plumbing shared by the wiki operations ───────────────────────────────────

const CREDENTIAL_ARGS = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];

function isHttps(remote) {
  return typeof remote === 'string' && /^https:\/\//i.test(remote);
}

/** `-c credential.helper=...` for https remotes only; never a token in a URL. */
function withCredentials(remote, args) {
  return isHttps(remote) ? [...CREDENTIAL_ARGS, ...args] : args;
}

function normaliseRemote(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '');
}

function cloneDir(root) {
  return path.join(root, WIKI_DIR_REL);
}

function local(dir, args) {
  return runGitImpl(args, { cwd: dir });
}

function remoteCall(dir, remote, args) {
  return runGitImpl(withCredentials(remote, args), { cwd: dir });
}

/** Commits on HEAD that origin/master does not have, or null when git cannot tell. */
function aheadCount(dir) {
  const r = local(dir, ['rev-list', '--count', `origin/${WIKI_BRANCH}..HEAD`]);
  if (!r.ok) return null;
  const n = parseInt(String(r.stdout).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * `pull --rebase origin master`. Null on success, else a failure result. A rebase conflict is aborted
 * (after the conflicted files are read) and reported; it is never resolved and never forced.
 */
function rebasePull(dir, remote) {
  const r = remoteCall(dir, remote, ['pull', '--rebase', 'origin', WIKI_BRANCH]);
  if (r.ok) return null;
  const kind = classifyGitFailure(r);
  if (kind !== 'offline' && kind !== 'uninitialised' && kind !== 'auth') {
    const u = local(dir, ['diff', '--name-only', '--diff-filter=U']);
    const files = u.ok ? String(u.stdout).split('\n').map((l) => l.trim()).filter(Boolean) : [];
    if (kind === 'conflict' || files.length > 0) {
      local(dir, ['rebase', '--abort']);
      return failureResult('conflict', r, { conflict: true, files });
    }
  }
  return failureResult(kind, r);
}

// ─── Remote probe, clone and exclude ──────────────────────────────────────────

/**
 * Classify the wiki remote: `ok`, `uninitialised` (repository not found: the wiki has no first page yet,
 * and there is no API to create it) or `unavailable` (any other git failure, stderr included).
 * `{state, remote?, stderr?, error?, offline?, auth?}`. Never throws.
 */
function probeRemote(remote, opts = {}) {
  if (!remote) {
    return { state: 'unavailable', stderr: '', error: 'no wiki remote configured', offline: false, auth: false };
  }
  const r = runGitImpl(withCredentials(remote, ['ls-remote', remote, 'HEAD']), { cwd: opts.cwd });
  if (r.ok) return { state: 'ok', remote };
  const kind = classifyGitFailure(r);
  const stderr = String(r.stderr || '').trim();
  if (kind === 'uninitialised') {
    return {
      state: 'uninitialised',
      remote,
      stderr,
      error: 'the wiki repository does not exist yet: create the first wiki page in the web UI',
    };
  }
  return { state: 'unavailable', remote, stderr, error: stderr || `git exited ${r.status}`, offline: kind === 'offline', auth: kind === 'auth' };
}

/** Append `/.planning/wiki/` to the repo's `info/exclude` once. `--git-path` makes worktrees work. */
function ensureExcluded(root) {
  const r = runGitImpl(['rev-parse', '--git-path', 'info/exclude'], { cwd: root });
  const rel = String(r.stdout || '').trim();
  if (!r.ok || rel === '') {
    return { ok: false, error: (r.stderr || '').trim() || 'not a git repository' };
  }
  const file = path.resolve(root, rel);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    text = '';
  }
  if (text.split(/\r?\n/).some((l) => l.trim() === WIKI_EXCLUDE_LINE)) {
    return { ok: true, added: false, path: file };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lead = text === '' || text.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(file, `${lead}${WIKI_EXCLUDE_LINE}\n`);
  return { ok: true, added: true, path: file };
}

/**
 * Make sure `.planning/wiki/` is a clone of the wiki. An existing clone is left alone (and never
 * deleted) when its `origin` matches; a different `origin`, or a non-empty directory that is not a
 * clone, is an error. `{ok, cloned, dir}` or a failure result (`uninitialised` / `offline` / `auth`).
 */
function ensureClone(root, opts = {}) {
  const remote = opts.remote !== undefined ? opts.remote : resolveWikiRemote(root);
  if (!remote) {
    return { ok: false, error: 'no wiki remote: set github.repo (or github.wiki.remote) in .planning/config.json' };
  }
  const dir = cloneDir(root);

  if (fs.existsSync(path.join(dir, '.git'))) {
    const o = local(dir, ['config', '--get', 'remote.origin.url']);
    const have = String(o.stdout || '').trim();
    if (!o.ok || normaliseRemote(have) !== normaliseRemote(remote)) {
      return { ok: false, error: `wiki clone points at ${have || '(no origin)'}, expected ${remote}` };
    }
    const ex = ensureExcluded(root);
    return { ok: true, cloned: false, dir, excluded: ex.ok === true };
  }

  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    return { ok: false, error: `${WIKI_DIR_REL} exists and is not a git clone; move it aside` };
  }

  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const c = runGitImpl(withCredentials(remote, ['clone', '--branch', WIKI_BRANCH, remote, dir]), { cwd: root });
  if (!c.ok) return failureResult(classifyGitFailure(c), c);
  const ex = ensureExcluded(root);
  return { ok: true, cloned: true, dir, excluded: ex.ok === true };
}

// ─── Write, fetch, revision ───────────────────────────────────────────────────

/** The wiki clone's HEAD sha (the revision to pin, GST-02), or null. */
function headSha(root) {
  const dir = cloneDir(root);
  if (!fs.existsSync(dir)) return null;
  const r = local(dir, ['rev-parse', 'HEAD']);
  const sha = String(r.stdout || '').trim();
  return r.ok && sha !== '' ? sha : null;
}

/** A sha, branch or ref for `diff`: no leading dash (`--output=<file>` would write a file), no range syntax, no spaces. */
function validRevision(x) {
  return typeof x === 'string' && /^[0-9A-Za-z_][0-9A-Za-z_./^~@{}-]*$/.test(x) && !x.includes('..');
}

/**
 * The unified diff of the wiki clone between two revisions (`git diff --no-color <from>..<to> --`), for the PR
 * lifecycle's wiki-diff comment (GPR-03). `toSha` defaults to HEAD.
 *   success: the diff TEXT, a plain string (untrimmed). `''` is a valid result: nothing changed.
 *   failure: `{ok:false, reason, error}`, reason `no-wiki-clone` (no `.planning/wiki/.git`; git is not run),
 *            `bad-revision` (refused before git runs) or `git-failed` (git exited non-zero, e.g. an unknown sha).
 * Callers tell the two apart with `typeof result === 'string'`.
 */
function diff(root, fromSha, toSha = 'HEAD') {
  const dir = cloneDir(root);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    return { ok: false, reason: 'no-wiki-clone', error: `no wiki clone at ${WIKI_DIR_REL}` };
  }
  if (!validRevision(fromSha) || !validRevision(toSha)) {
    return { ok: false, reason: 'bad-revision', error: `invalid revision: ${JSON.stringify([fromSha, toSha])}` };
  }
  const r = local(dir, ['diff', '--no-color', `${fromSha}..${toSha}`, '--']);
  if (!r.ok) return failureResult(classifyGitFailure(r), r, { reason: 'git-failed' });
  return String(r.stdout);
}

/**
 * Publish local page changes: add -> commit (skipped when nothing is staged) -> pull --rebase ->
 * push HEAD:master. A non-fast-forward push is retried (pull + push) up to 3 more times. Never forces.
 *   ok:      {ok:true, committed, pushed, rounds?, sha}
 *   failure: {ok:false, error, committed?, rounds?, offline?|uninitialised?|auth?|conflict?+files}
 */
function push(root, opts = {}) {
  const dir = cloneDir(root);
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `no wiki clone at ${WIKI_DIR_REL}; run ensureClone first` };
  }
  const remote = opts.remote !== undefined ? opts.remote : resolveWikiRemote(root);
  const message = opts.message || 'devflow: update planning pages';

  const added = local(dir, ['add', '-A']);
  if (!added.ok) return failureResult(classifyGitFailure(added), added);

  let committed = false;
  const staged = local(dir, ['diff', '--cached', '--quiet']);
  if (!staged.ok) {
    if (staged.status !== 1) return failureResult(classifyGitFailure(staged), staged);
    const who = local(dir, ['config', 'user.email']);
    const identity = String(who.stdout || '').trim() === ''
      ? ['-c', 'user.name=DevFlow', '-c', 'user.email=devflow@users.noreply.github.com']
      : [];
    const c = local(dir, [...identity, 'commit', '-m', message]);
    if (!c.ok) return failureResult(classifyGitFailure(c), c);
    committed = true;
  } else if (aheadCount(dir) === 0) {
    return { ok: true, committed: false, pushed: false, sha: headSha(root) };
  }

  let rounds = 0;
  for (;;) {
    rounds += 1;
    const pulled = rebasePull(dir, remote);
    if (pulled) return { ...pulled, committed, rounds };

    const pushed = remoteCall(dir, remote, ['push', 'origin', `HEAD:${WIKI_BRANCH}`]);
    if (pushed.ok) return { ok: true, committed, pushed: true, rounds, sha: headSha(root) };

    const kind = classifyGitFailure(pushed);
    if (kind === 'non_fast_forward') {
      if (rounds <= MAX_PUSH_RETRIES) continue;
      return failureResult('error', pushed, {
        committed,
        rounds,
        error: `push rejected (non-fast-forward) after ${rounds} attempts: ${(pushed.stderr || '').trim()}`,
      });
    }
    return failureResult(kind, pushed, { committed, rounds });
  }
}

/**
 * Bring the clone up to date with the wiki. Nothing ahead: `reset --hard origin/master`. Local commits
 * ahead: `pull --rebase` (never a reset, which would destroy them) and report `ahead` so the pending
 * `wiki-push` op can finish the job. `{ok:true, ahead, updated, sha}` or a failure result.
 */
function fetch(root, opts = {}) {
  const dir = cloneDir(root);
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `no wiki clone at ${WIKI_DIR_REL}; run ensureClone first` };
  }
  const remote = opts.remote !== undefined ? opts.remote : resolveWikiRemote(root);

  const f = remoteCall(dir, remote, ['fetch', 'origin']);
  if (!f.ok) return failureResult(classifyGitFailure(f), f);

  const ahead = aheadCount(dir);
  if (ahead === null) return { ok: false, error: `cannot compare the wiki clone with origin/${WIKI_BRANCH}` };

  // A page written but not yet committed is invisible to `ahead`; reset --hard or a rebase would
  // destroy or refuse it. Leave the clone alone and say so: the pending push op will commit it.
  const dirty = local(dir, ['status', '--porcelain']);
  if (dirty.ok && String(dirty.stdout).trim() !== '') {
    return { ok: true, ahead, dirty: true, updated: false, sha: headSha(root) };
  }

  const before = headSha(root);
  if (ahead === 0) {
    const reset = local(dir, ['reset', '--hard', `origin/${WIKI_BRANCH}`]);
    if (!reset.ok) return failureResult(classifyGitFailure(reset), reset);
  } else {
    const pulled = rebasePull(dir, remote);
    if (pulled) return { ...pulled, ahead };
  }
  const after = headSha(root);
  return { ok: true, ahead, updated: before !== after, sha: after };
}

// ─── Page files (wiki clone or docs/devflow) ──────────────────────────────────

const PAGE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/;

function validPage(page) {
  return typeof page === 'string' && PAGE_NAME_RE.test(page);
}

function checkMode(mode) {
  if (mode !== 'wiki' && mode !== 'docs') {
    throw new TypeError(`unknown wiki store mode ${JSON.stringify(mode)} (expected 'wiki' or 'docs')`);
  }
  return mode;
}

function storeDir(root, mode) {
  return mode === 'docs' ? path.join(root, DOCS_DIR_REL) : cloneDir(root);
}

/** The text of a page, or null when it does not exist (or the name is not a legal page name). */
function readPage(root, page, opts = {}) {
  const mode = checkMode(opts.mode || 'wiki');
  if (!validPage(page)) return null;
  try {
    return fs.readFileSync(path.join(storeDir(root, mode), `${page}.md`), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write a page. Bytes are compared first: identical text is `{changed:false}` and the file is not
 * touched (no mtime churn, nothing new for git or the file watcher). The wiki backend needs the clone to
 * exist; the docs backend creates `docs/devflow/` on first write. `{ok, changed, path}` or `{ok:false, error}`.
 */
function writePage(root, page, text, opts = {}) {
  const mode = checkMode(opts.mode || 'wiki');
  if (!validPage(page)) return { ok: false, error: `invalid page name ${JSON.stringify(page)}` };
  if (typeof text !== 'string') return { ok: false, error: 'page text must be a string' };
  const dir = storeDir(root, mode);
  if (mode === 'wiki' && !fs.existsSync(dir)) {
    return { ok: false, error: `no wiki clone at ${WIKI_DIR_REL}; run ensureClone first` };
  }
  const file = path.join(dir, `${page}.md`);
  let previous = null;
  try {
    previous = fs.readFileSync(file);
  } catch {
    previous = null;
  }
  if (previous !== null && Buffer.compare(previous, Buffer.from(text, 'utf-8')) === 0) {
    return { ok: true, changed: false, path: file };
  }
  atomicWrite(file, text);
  return { ok: true, changed: true, path: file };
}

/** Page names (no `.md`) in the store, sorted. Dotfiles, subdirectories and non-markdown files are skipped. */
function listPages(root, opts = {}) {
  const mode = checkMode(opts.mode || 'wiki');
  let entries;
  try {
    entries = fs.readdirSync(storeDir(root, mode), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -3))
    .filter(validPage)
    .sort();
}

/**
 * One interface over both backends:
 *   mode 'wiki' -> `.planning/wiki/` (a clone; push publishes it; the revision is the clone HEAD sha)
 *   mode 'docs' -> `docs/devflow/` (repo content; push is a no-op; the revision is the file path)
 * `{mode, readPage, writePage, listPages, push, fetch, headSha, revisionRef}`. Callers never branch on mode.
 */
function openStore(root, opts = {}) {
  const mode = checkMode(opts.mode || 'wiki');
  const remote = opts.remote;
  const remoteOpts = remote !== undefined ? { remote } : {};

  if (mode === 'docs') {
    return {
      mode,
      readPage: (page) => readPage(root, page, { mode }),
      writePage: (page, text) => writePage(root, page, text, { mode }),
      listPages: () => listPages(root, { mode }),
      push: () => ({
        ok: true,
        committed: false,
        pushed: false,
        note: `docs backend: ${DOCS_DIR_REL}/ is repo content, committed by your normal git flow`,
      }),
      fetch: () => ({
        ok: true,
        ahead: 0,
        updated: false,
        note: `docs backend: ${DOCS_DIR_REL}/ is read from the working tree`,
      }),
      headSha: () => null,
      revisionRef: (page) => `${DOCS_DIR_REL}/${page}.md`,
    };
  }

  return {
    mode,
    readPage: (page) => readPage(root, page, { mode }),
    writePage: (page, text) => writePage(root, page, text, { mode }),
    listPages: () => listPages(root, { mode }),
    push: (pushOpts = {}) => push(root, { ...remoteOpts, ...pushOpts }),
    fetch: (fetchOpts = {}) => fetch(root, { ...remoteOpts, ...fetchOpts }),
    headSha: () => headSha(root),
    revisionRef: () => headSha(root),
  };
}

module.exports = {
  WIKI_DIR_REL,
  DOCS_DIR_REL,
  WIKI_BRANCH,
  PAGE_TABLE,
  objectivePage,
  validPage,
  pageForCachePath,
  cachePathForPage,
  pageRevisionUrl,
  resolveWikiRemote,
  // seam (forwarding wrapper: later injections are visible to earlier importers)
  runGit: (...a) => runGitImpl(...a),
  _setRunGit,
  // remote and clone
  probeRemote,
  ensureClone,
  ensureExcluded,
  // write / read side
  push,
  fetch,
  headSha,
  diff,
  readPage,
  writePage,
  listPages,
  openStore,
};
