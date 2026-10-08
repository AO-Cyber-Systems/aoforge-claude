#!/usr/bin/env node
'use strict';

/**
 * aoforge-rename: the one-shot DevFlow -> AOForge codemod.
 *
 * This script is the record of the objective 72 rename. It stays in the repository
 * after the rename lands, and because it has to spell the old names to find them it
 * is on the allow-list for legacy spellings (`scripts/aoforge-rename*` and
 * `scripts/__fixtures__/legacy-*`).
 *
 * It is self-contained on purpose: it requires nothing from `plugins/`, because the
 * paths under `plugins/` are exactly what it moves.
 *
 * Two independent passes, so the repository can stay green between them:
 *
 *   --rules names     Path moves (`git mv`) and content rewrites for the product
 *                     name: DevFlow/devflow/DEVFLOW, df-tools, the `DF` banner.
 *   --rules planning  The project directory `.planning` -> `.aoforge`. Code that
 *                     builds the path becomes `planningRoot(<expr>)` from compat.cjs
 *                     (which resolves `.aoforge` first and falls back to `.planning`);
 *                     every other occurrence is renamed in place.
 *
 * Name rules run from the most specific to the least, because a general rule that
 * ran first would swallow the specific one (`DevFlow` lowercased by the `devflow`
 * rule first would leave `Aoforge` in prose):
 *
 *   preserves (masked), /devflow:, devflow:<agent>, df-tools, DF-TOOLS, the DF
 *   banner, DEVFLOW, DevFlow, Devflow, devflow
 *
 * Why each preserve exists:
 *   devflowops, devFlowOps, DevFlowOps  A different product (the devflowops repository).
 *   devflow-desktop                     A separate desktop app with its own name.
 *   devflow.cloud                       The domain; it stays until objective 74.
 *   quoted 'devflow', 'devflow-test'    Fleet repository names in the stack fixtures
 *                                       (data about other repositories, not our name).
 *   '.devflow' in monorepo-doctor       The doctor skips directories by name; the new
 *                                       name is ADDED beside the old ones by hand.
 *
 * Preserved tokens are swapped for placeholders that cannot occur in source
 * (`\u0000P<n>\u0000`), the rules run, and the placeholders are swapped back.
 *
 * Nothing is rewritten in: the planning tree itself (`.planning/**`, `.aoforge/**`,
 * history under either name), CHANGELOG.md, NOTICE.md, LICENSE*, docs/** except
 * LIVE_DOCS (the user guide and the two built-in inventories), legacy-names.cjs, `__fixtures__/legacy-*`, `*.legacy.test.*`,
 * this script and its test, node_modules and site/public. A skipped file that lives
 * under a moved directory is still moved (the directory moves as a whole).
 *
 * Files come from `git ls-files`, so untracked files are never touched, and moves use
 * `git mv` so history and the executable bit follow the file.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const posix = path.posix;
const base = (rel) => rel.slice(rel.lastIndexOf('/') + 1);

// ─── SKIP: content that is never rewritten ───────────────────────────────────

/** The docs/ files that describe the current tree; every other docs/ file is history. */
const LIVE_DOCS = new Set([
  'docs/USER-GUIDE.md',
  // builtin-sweep.repo.test.cjs and builtin-status.repo.test.cjs check every path these cite
  'docs/built-in-sweep.md',
  'docs/built-in-integration-status.md',
]);

const SKIP = [
  {
    id: 'planning-tree',
    why: 'the planning tree is history under either name; objective 72-21 moves it',
    test: (r) => r.startsWith('.planning/') || r.startsWith('.aoforge/'),
  },
  {
    id: 'changelog',
    why: 'past entries keep their DevFlow wording',
    test: (r) => base(r) === 'CHANGELOG.md',
  },
  {
    id: 'attribution',
    why: 'fork attribution and licences stay intact',
    test: (r) => r === 'NOTICE.md' || /^LICENSE[^/]*$/.test(r),
  },
  {
    id: 'docs-history',
    why: 'design documents are history; the user guide and the built-in inventories (pinned to the tree by repo tests) are live',
    test: (r) => r.startsWith('docs/') && !LIVE_DOCS.has(r),
  },
  {
    id: 'legacy-names',
    why: 'the one module that spells legacy names',
    test: (r) => base(r) === 'legacy-names.cjs',
  },
  {
    id: 'legacy-fixture',
    why: 'fixtures built from legacy names',
    test: (r) => /(^|\/)__fixtures__\/legacy-[^/]*$/.test(r),
  },
  {
    id: 'legacy-test',
    why: 'tests of the shims spell legacy names',
    test: (r) => /\.legacy\.test\.[^/]*$/.test(r),
  },
  {
    id: 'this-tool',
    why: 'the codemod and its test spell the old names to find them',
    test: (r) => /^scripts\/aoforge-rename/.test(r),
  },
  {
    id: 'vendored',
    why: 'not our source',
    test: (r) => /(^|\/)node_modules\//.test(r) || r.startsWith('site/public/'),
  },
];

/** True when the content of `rel` is never rewritten. */
function isSkipped(rel) {
  return SKIP.some((s) => s.test(rel));
}

// ─── PATH_RULES: what moves ──────────────────────────────────────────────────

const PATH_RULES = [
  { kind: 'prefix', from: 'plugins/devflow', to: 'plugins/aoforge', why: 'the plugin directory' },
  {
    kind: 'prefix',
    from: 'plugins/aoforge/devflow',
    to: 'plugins/aoforge/aoforge',
    why: 'the runtime directory inside the plugin',
  },
  {
    kind: 'basename',
    why: 'a basename naming df-tools or devflow follows NAME_RULES (devflowops and devflow-desktop are preserved)',
  },
];

/** Paths whose location never changes, whatever they are called. */
function isPathExempt(rel) {
  return (
    rel.startsWith('.planning/') ||
    rel.startsWith('.aoforge/') ||
    base(rel) === 'CHANGELOG.md' ||
    /(^|\/)node_modules\//.test(rel) ||
    rel.startsWith('site/public/')
  );
}

/** The directory moves, in the order they must run (each acts on the result of the last). */
function dirMoves() {
  return PATH_RULES.filter((r) => r.kind === 'prefix');
}

/** The new path of `rel` after every path rule; `rel` itself when nothing applies. */
function mapPath(rel) {
  if (isPathExempt(rel)) return rel;
  let p = rel;
  for (const r of dirMoves()) {
    if (p === r.from || p.startsWith(r.from + '/')) p = r.to + p.slice(r.from.length);
  }
  const i = p.lastIndexOf('/');
  const b = p.slice(i + 1);
  return p.slice(0, i + 1) + rewriteNames(b, b).text;
}

// ─── PRESERVE: tokens that look like the old name but are not ────────────────

const FLEET_FILES = new Set([
  'stack-fleet-tables.cjs',
  'stack-golden-fixtures.cjs',
  'stack-realshape-fixtures.cjs',
]);

const isFleetFile = (rel) => FLEET_FILES.has(base(rel)) || /^stack-.*\.test\.cjs$/.test(base(rel));

const isMonorepoDoctor = (rel) => /(^|\/)monorepo-standards\//.test(rel) && base(rel) === 'doctor.js';

const PRESERVE = {
  /** Masked in every file. */
  global: [
    {
      id: 'devflowops',
      re: /devflowops/gi,
      reason: 'DevFlowOps is a different product (the devflowops repository)',
    },
    {
      id: 'devflow-desktop',
      re: /devflow-desktop/gi,
      reason: 'the desktop app is a separate product with its own name',
    },
    {
      id: 'devflow.cloud',
      re: /devflow\.cloud/gi,
      reason: 'the devflow.cloud domain stays until objective 74',
    },
  ],
  /** Masked only in the files `files(rel)` accepts; keyed by basename so a directory move cannot leak them. */
  scoped: [
    {
      id: 'fleet-repo-names',
      files: isFleetFile,
      // not after `'.claude',`: that is the runtime directory ~/.claude/devflow/stacks, which is renamed
      re: /(?<!\.claude['"],\s*)(['"])devflow(?:-test)?\1/g,
      reason: 'fleet repository names in the stack fixtures are data about other repositories',
    },
  ],
  /** Left unchanged and reported for a human; `rules` says which pass reports it. */
  manual: [
    {
      id: 'monorepo-doctor-devflow-dir',
      rules: 'names',
      files: isMonorepoDoctor,
      re: /(['"])\.devflow\1/g,
      reason: "monorepo-doctor skips directories by name: ADD '.aoforge' beside '.devflow', keep the legacy entries",
    },
    {
      id: 'monorepo-doctor-planning-dir',
      rules: 'planning',
      files: isMonorepoDoctor,
      re: /(['"])\.planning\1/g,
      reason: "monorepo-doctor skips directories by name: ADD '.aoforge' beside '.planning', keep the legacy entries",
    },
  ],
};

// ─── masking ─────────────────────────────────────────────────────────────────

const placeholder = (n) => `\u0000P${n}\u0000`;
const PLACEHOLDER_RE = /\u0000P(\d+)\u0000/g;

const lineOf = (text, index) => {
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

/**
 * Swap every preserved or manual span for a placeholder.
 * `saved` receives { text, kind, reason }; manual spans also push a residual.
 */
function maskText(text, rel, rules, saved, residuals) {
  const origLines = text.split('\n');
  const run = (patterns, kind) => {
    for (const p of patterns) {
      if (p.rules && p.rules !== rules) continue;
      if (p.files && !p.files(rel)) continue;
      let out = '';
      let last = 0;
      for (const m of text.matchAll(p.re)) {
        const n = saved.push({ text: m[0], kind, reason: p.reason }) - 1;
        out += text.slice(last, m.index) + placeholder(n);
        last = m.index + m[0].length;
        if (kind === 'manual' && residuals) {
          const line = lineOf(text, m.index);
          residuals.push({ line, text: origLines[line - 1].trim(), reason: p.reason });
        }
      }
      text = out + text.slice(last);
    }
  };
  run(PRESERVE.manual, 'manual');
  run(PRESERVE.scoped, 'preserve');
  run(PRESERVE.global, 'preserve');
  return text;
}

const restore = (text, saved) => text.replace(PLACEHOLDER_RE, (_, i) => saved[Number(i)].text);

// ─── NAME_RULES ──────────────────────────────────────────────────────────────

/**
 * Most specific first. The replacements never match a later rule.
 * `silent` rules change text without counting as a rename (the article fix).
 */
const NAME_RULES = [
  {
    id: 'article',
    // "a DevFlow project" -> "an AOForge project": the new names start with a vowel sound
    re: /\b([Aa]) (?=[`*_"'(]{0,2}(?:DevFlow|Devflow|DEVFLOW|devflow|df-tools|DF-TOOLS))/g,
    to: (m, a) => `${a}n `,
    silent: true,
  },
  { id: 'slash-command', re: /\/devflow:/g, to: '/aoforge:' },
  { id: 'agent-type', re: /\bdevflow:(?=[a-z])/g, to: 'aoforge:' },
  { id: 'cli', re: /df-tools/g, to: 'aof-tools' },
  { id: 'cli-upper', re: /DF-TOOLS/g, to: 'AOF-TOOLS' },
  { id: 'banner', re: /DF ►/g, to: 'AOF ►' },
  { id: 'env-and-marker', re: /DEVFLOW/g, to: 'AOFORGE' },
  { id: 'product', re: /DevFlow/g, to: 'AOForge' },
  { id: 'camel', re: /Devflow/g, to: 'Aoforge' },
  { id: 'identifier', re: /devflow/g, to: 'aoforge' },
];

function applyNameRules(text) {
  let count = 0;
  for (const rule of NAME_RULES) {
    text = text.replace(rule.re, (...args) => {
      if (!rule.silent) count++;
      return typeof rule.to === 'function' ? rule.to(...args) : rule.to;
    });
  }
  return { text, count };
}

/**
 * Rewrite the product name in `text`, the content of `rel`.
 * @returns {{ text: string, count: number, residuals: {line:number,text:string,reason:string}[] }}
 */
function rewriteNames(text, rel = '') {
  const saved = [];
  const residuals = [];
  const masked = maskText(text, rel, 'names', saved, residuals);
  const r = applyNameRules(masked);
  return { text: restore(r.text, saved), count: r.count, residuals };
}

// ─── PLANNING_RULES ──────────────────────────────────────────────────────────

/** path.join|resolve(<identifier or dotted member>, '.planning' [)] */
const PLANNING_ROOT_RE =
  /\bpath\.(join|resolve)\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*,\s*(['"])\.planning\3(\s*\))?/g;

/** `.planning` not followed by an identifier character (so `.planningDir` is not one). */
const PLANNING_OCC = /\.planning(?![A-Za-z0-9_])/g;

const PLANNING_RULES = {
  call: PLANNING_ROOT_RE,
  occurrence: PLANNING_OCC,
};

const isTestFile = (rel) =>
  /\.test\.[cm]?js$/.test(base(rel)) || /(^|\/)__fixtures__\//.test(rel);

/** 'test' | 'code' | 'other': tests get a plain rename, code gets residual review. */
function fileKind(rel) {
  if (isTestFile(rel)) return 'test';
  if (/\.(cjs|mjs|js)$/.test(base(rel))) return 'code';
  return 'other';
}

const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/**
 * What a `.planning` at `index` in `text` is:
 *   path       a directory name (start of a segment, after a quote, space or punctuation)
 *   regex      the escaped dot of a regular expression literal (`\.planning`)
 *   property   member access such as `cfg.planning` (a config key, not the directory)
 *   ambiguous  after a closing bracket: cannot tell without reading the line
 */
function occurrenceKind(text, index) {
  const prev = text[index - 1];
  if (prev === undefined) return 'path';
  if (prev === '\\') return text[index - 2] === '\\' ? 'path' : 'regex';
  if (/[A-Za-z0-9_$]/.test(prev)) {
    // `\n.planning/x` and `\t.planning/x` inside a string literal
    if (/[ntr]/.test(prev) && text[index - 2] === '\\' && text[index - 3] !== '\\') return 'path';
    return 'property';
  }
  // `:(exclude).planning` is a git pathspec; `${root}.planning` is text after an interpolation
  if (prev === ')') return /:\([a-z,]+\)$/.test(text.slice(Math.max(0, index - 16), index)) ? 'path' : 'ambiguous';
  if (prev === '}') return closesInterpolation(text, index - 1) ? 'path' : 'ambiguous';
  if (prev === ']' || prev === '.') return 'ambiguous';
  return 'path';
}

/** True when the `}` at `closeIndex` closes a `${` on the same line. */
function closesInterpolation(text, closeIndex) {
  let depth = 0;
  for (let i = closeIndex - 1; i >= 0; i--) {
    const c = text[i];
    if (c === '\n') return false;
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) return text[i - 1] === '$';
      depth--;
    }
  }
  return false;
}

const importsPlanningRootFromCompat =
  /\{[^}]*\bplanningRoot\b[^}]*\}\s*=\s*require\(\s*(['"])[^'"]*\/compat\.cjs\1\s*\)/;

/** The require specifier from `rel` to compat.cjs, or null when no resolver is in reach. */
function compatSpecifier(rel, opts) {
  let target = opts.compatPath;
  if (target === null) return null;
  if (target === undefined) {
    const m = /^plugins\/([^/]+)\//.exec(rel);
    if (!m) return null;
    target = `plugins/${m[1]}/${m[1]}/bin/lib/compat.cjs`;
  }
  if (rel === target) return null;
  const spec = posix.relative(posix.dirname(rel), target);
  return spec.startsWith('.') ? spec : `./${spec}`;
}

/** Index of the line after which a new require goes, -1 for "at the top". */
function importInsertAfter(lines) {
  let after = -1;
  let strict = -1;
  let inMulti = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inMulti) {
      if (/^\}\s*=\s*require\(.*\)\s*;?\s*$/.test(l)) {
        inMulti = false;
        after = i;
      }
      continue;
    }
    if (/^\s*$/.test(l) || /^#!/.test(l) || /^\s*(\/\/|\/\*|\*)/.test(l)) continue;
    if (/^(['"])use strict\1;?\s*$/.test(l)) {
      strict = i;
      continue;
    }
    if (/^(?:const|let|var)\s+[^=]+=\s*require\([^)]*\)[^;]*;?\s*$/.test(l)) {
      after = i;
      continue;
    }
    if (/^(?:const|let|var)\s+\{\s*$/.test(l)) {
      inMulti = true;
      continue;
    }
    break;
  }
  return after >= 0 ? after : strict;
}

/**
 * Make `planningRoot` available in `text` from `spec`.
 * @returns {{ text: string, insertedLine: number }} insertedLine is 1-based, 0 when no line was added
 */
function ensurePlanningRootImport(text, spec) {
  if (importsPlanningRootFromCompat.test(text)) return { text, insertedLine: 0 };

  const merged = /((?:const|let|var)\s*\{)([^}]*)(\}\s*=\s*require\(\s*(['"])[^'"]*\/compat\.cjs\4\s*\))/.exec(text);
  if (merged) {
    const inner = merged[2];
    const trimmed = inner.replace(/\s+$/, '');
    const tail = inner.slice(trimmed.length);
    let added;
    if (inner.includes('\n')) {
      added = `${trimmed}${trimmed.endsWith(',') ? '' : ','}\n  planningRoot,${tail}`;
    } else {
      added = `${trimmed}, planningRoot${tail}`;
    }
    const out = text.slice(0, merged.index) + merged[1] + added + merged[3] + text.slice(merged.index + merged[0].length);
    return { text: out, insertedLine: 0 };
  }

  const crlf = text.includes('\r\n');
  const lines = text.split('\n');
  let at = importInsertAfter(lines);
  if (at < 0) at = lines[0] !== undefined && lines[0].startsWith('#!') ? 0 : -1;
  const line = `const { planningRoot } = require('${spec}');${crlf ? '\r' : ''}`;
  lines.splice(at + 1, 0, line);
  return { text: lines.join('\n'), insertedLine: at + 2 };
}

/**
 * Rewrite the project directory name in `text`, the content of `rel`.
 *
 * In non-test code, `path.join|resolve(<expr>, '.planning'...)` becomes a `planningRoot(<expr>)`
 * form with one import from compat.cjs. Every other `.planning` that names the directory becomes
 * `.aoforge`; in non-test code that is also a residual for review, except in comments.
 *
 * @param {string} text
 * @param {string} rel   repo-relative posix path of the file
 * @param {{ compatPath?: string|null }} [opts] compatPath: repo path of compat.cjs, null when none is in reach
 */
function rewritePlanning(text, rel = '', opts = {}) {
  if (!text.includes('.planning')) return { text, count: 0, residuals: [] };

  const kind = fileKind(rel);
  const saved = [];
  const residuals = [];
  let work = maskText(text, rel, 'planning', saved, residuals);
  let count = 0;
  let spec = null;
  let needImport = false;
  const noCompatLines = new Set();

  if (kind === 'code' && new RegExp(PLANNING_ROOT_RE.source).test(work)) {
    spec = compatSpecifier(rel, opts);
    if (spec === null) {
      work.split('\n').forEach((l, i) => {
        if (new RegExp(PLANNING_ROOT_RE.source).test(l)) noCompatLines.add(i);
      });
    } else if (!importsPlanningRootFromCompat.test(work) && /\bplanningRoot\b/.test(work)) {
      const first = work.split('\n').findIndex((l) => new RegExp(PLANNING_ROOT_RE.source).test(l));
      return {
        text,
        count: 0,
        residuals: [
          {
            line: first + 1,
            text: text.split('\n')[first].trim(),
            reason: 'the file already declares planningRoot: left alone, convert by hand',
          },
        ],
      };
    } else {
      work = work.replace(PLANNING_ROOT_RE, (m, fn, expr, q, close) => {
        count++;
        return close ? `planningRoot(${expr})` : `path.${fn}(planningRoot(${expr})`;
      });
      needImport = count > 0;
    }
  }

  const lines = work.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.includes('.planning')) continue;
    let reason = null;
    const out = line.replace(PLANNING_OCC, (m, offset) => {
      const k = occurrenceKind(line, offset);
      if (k === 'property') return m;
      if (k === 'ambiguous') {
        reason = reason || 'ambiguous: directory name or property access? decide by reading the line';
        return m;
      }
      if (k === 'regex' && kind === 'code') {
        reason = reason || 'regex literal: left alone, build it from the legacy name (72-06)';
        return m;
      }
      count++;
      if (kind === 'code' && !isCommentLine(line)) {
        reason =
          reason ||
          (noCompatLines.has(li)
            ? 'no compat.cjs in reach for this file: renamed in place, add the fallback by hand'
            : 'string literal in code now names .aoforge: prefer planningRoot() so the .planning fallback applies');
      }
      return '.aoforge';
    });
    lines[li] = out;
    if (reason) residuals.push({ line: li + 1, text: out.trim(), reason });
  }
  work = lines.join('\n');

  let result = restore(work, saved);
  if (needImport) {
    const injected = ensurePlanningRootImport(result, spec);
    result = injected.text;
    if (injected.insertedLine > 0) {
      for (const r of residuals) if (r.line >= injected.insertedLine) r.line += 1;
    }
  }
  residuals.sort((a, b) => a.line - b.line);
  return { text: result, count, residuals };
}

// ─── file-level wrapper ──────────────────────────────────────────────────────

const isBinary = (buf) => buf.includes(0);

/**
 * Rewrite one file's content for `rules` ('names' | 'planning').
 * `skipped` is 'skip' (policy), 'binary' (NUL byte or not UTF-8) or null.
 */
function processFile(rel, buf, rules, opts = {}) {
  const none = { changed: false, count: 0, residuals: [] };
  if (isSkipped(rel)) return { skipped: 'skip', ...none };
  if (isBinary(buf)) return { skipped: 'binary', ...none };
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return { skipped: 'binary', ...none };
  const r = rules === 'planning' ? rewritePlanning(text, rel, opts) : rewriteNames(text, rel);
  return { skipped: null, changed: r.text !== text, text: r.text, count: r.count, residuals: r.residuals };
}

// ─── classifyToken ───────────────────────────────────────────────────────────

const LEGACY_WORD = /devflow|df-tools/gi;

/** True when the match at [start, end) is glued to letters or digits that make it part of another word. */
function isGlued(str, start, end) {
  const before = str[start - 1];
  const after = str[end];
  if (before !== undefined && /[A-Za-z0-9]/.test(before)) {
    const camel = /[a-z0-9]/.test(before) && /[A-Z]/.test(str[start]);
    if (!camel) return true;
  }
  if (after !== undefined && /[A-Za-z0-9]/.test(after)) {
    const camel = /[A-Z]/.test(after) && /[a-z]/.test(str[end - 1]);
    if (!camel) return true;
  }
  return false;
}

/**
 * Glued spellings that are known and fine. Each is renamed by the blind rules like any other
 * occurrence; listing it here only stops the glue check from calling it unclassified.
 */
const KNOWN_GLUED = [
  {
    token: 'devflowx',
    reason: 'negative test vector: gate tests feed `devflowx:y` to prove the agent-type match needs the exact prefix',
  },
];

function classifyNameToken(token, rel) {
  const saved = [];
  const masked = maskText(token, rel, 'names', saved, null);
  const known = KNOWN_GLUED.some((k) => k.token === token);

  for (const m of masked.matchAll(LEGACY_WORD)) {
    if (!known && isGlued(masked, m.index, m.index + m[0].length)) {
      return { action: 'unclassified', reason: `"${m[0]}" is glued to other letters; no rule covers this spelling` };
    }
  }
  const rewritten = applyNameRules(masked).text;
  if (/devflow|df-tools/i.test(rewritten)) {
    return { action: 'unclassified', reason: 'a spelling of the old name that no rule rewrites' };
  }

  const manual = saved.find((s) => s.kind === 'manual');
  if (manual) return { action: 'manual', reason: manual.reason };
  const target = restore(rewritten, saved);
  if (target !== token) return { action: 'rename', target };
  const kept = saved.find((s) => s.kind === 'preserve');
  if (kept) return { action: 'preserve', reason: kept.reason };
  return { action: 'unclassified', reason: 'no rule applies' };
}

/** Classify the `.planning` occurrences inside text[start, end). `code` says regex literals need a human. */
function classifyPlanningSpan(text, start, end, code) {
  const slice = text.slice(start, end);
  let ambiguous = false;
  let regex = false;
  let path_ = false;
  let target = '';
  let last = 0;
  for (const m of slice.matchAll(PLANNING_OCC)) {
    const k = occurrenceKind(text, start + m.index);
    target += slice.slice(last, m.index);
    last = m.index + m[0].length;
    if (k === 'ambiguous') {
      ambiguous = true;
      target += m[0];
    } else if (k === 'property') {
      target += m[0];
    } else if (k === 'regex' && code) {
      regex = true;
      target += m[0];
    } else {
      path_ = true;
      target += '.aoforge';
    }
  }
  target += slice.slice(last);
  if (ambiguous) {
    return { action: 'unclassified', reason: 'follows a closing bracket: directory name or property access?' };
  }
  if (regex) return { action: 'manual', reason: 'regex literal: build it from the legacy name (72-06)' };
  if (path_) return { action: 'rename', target };
  return { action: 'preserve', reason: 'member access or identifier that merely contains "planning"' };
}

/**
 * Classify one legacy token.
 * @param {string} token
 * @param {string} [rel]   file the token came from (file-scoped preserves)
 * @param {'names'|'planning'} [rules]
 * @returns {{ action: 'rename'|'preserve'|'manual'|'unclassified', target?: string, reason?: string }}
 */
function classifyToken(token, rel = '', rules = 'names') {
  if (rules === 'planning') {
    const saved = [];
    const masked = maskText(token, rel, 'planning', saved, null);
    if (saved.some((s) => s.kind === 'manual')) {
      return { action: 'manual', reason: saved.find((s) => s.kind === 'manual').reason };
    }
    return classifyPlanningSpan(masked, 0, masked.length, fileKind(rel) === 'code');
  }
  return classifyNameToken(token, rel);
}

// ─── inventory ───────────────────────────────────────────────────────────────

/** A run of token characters that contains a legacy word (case-insensitive). */
const NAME_TOKEN = /[A-Za-z0-9_.~/@-]*(?:devflow|df-tools)[A-Za-z0-9_.~/@-]*/gi;
const PLANNING_TOKEN = /[A-Za-z0-9_.~/@-]*\.planning[A-Za-z0-9_.~/@-]*/g;
const BANNER = /DF ►/g;

/**
 * Spans of `text` covered by a file-scoped entry (quoted names the token regex cannot see).
 * @returns {{ start: number, end: number, kind: string, reason: string, text: string }[]}
 */
function scopedSpans(text, rel, rules) {
  const spans = [];
  const collect = (patterns, kind) => {
    for (const p of patterns) {
      if (p.rules && p.rules !== rules) continue;
      if (!p.files || !p.files(rel)) continue;
      for (const m of text.matchAll(p.re)) {
        spans.push({ start: m.index, end: m.index + m[0].length, kind, reason: p.reason, text: m[0] });
      }
    }
  };
  collect(PRESERVE.manual, 'manual');
  collect(PRESERVE.scoped, 'preserve');
  return spans;
}

/**
 * Strip what the broad token regex picks up that is not part of the name: the digits of an ANSI
 * `ESC[1m` sequence and the letter of a regex or string escape (`\b`, `\n`).
 */
function trimToken(text, index, token) {
  const prev = text[index - 1];
  if (prev === '[') return token.replace(/^\d{1,3}m(?=[A-Za-z.])/, '');
  if (prev === '\\') return token.replace(/^[bntr](?=df-tools|devflow|\.planning)/i, '');
  return token;
}

/**
 * Classify every legacy token in `entries`.
 * @param {{ rel: string, text: string|null }[]} entries  text is null for files that are not rewritten as text
 * @param {'names'|'planning'} rules
 * @returns {{ rows: { token: string, action: string, detail: string, count: number }[], unclassified: number }}
 */
function inventory(entries, rules) {
  const rows = new Map();
  const add = (token, cls) => {
    const detail = cls.action === 'rename' ? cls.target : cls.reason || '';
    const key = `${token}\t${cls.action}\t${detail}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { token, action: cls.action, detail, count: 1 });
  };

  for (const { rel, text } of entries) {
    if (rules === 'names' && !isPathExempt(rel)) {
      const mapped = mapPath(rel);
      const masked = maskText(mapped, base(mapped), 'names', [], null);
      if (/devflow|df-tools/i.test(masked)) {
        add(`path:${rel}`, { action: 'unclassified', reason: 'the path still names the old product after the path rules' });
      }
    }
    if (text === null || isSkipped(rel)) continue;

    const spans = scopedSpans(text, rel, rules);
    const covering = (start, end) => spans.find((s) => s.start <= start && end <= s.end);
    const code = fileKind(rel) === 'code';

    if (rules === 'names') {
      for (const m of text.matchAll(NAME_TOKEN)) {
        const token = trimToken(text, m.index, m[0]);
        const start = m.index + (m[0].length - token.length);
        const span = covering(start, start + token.length);
        if (span) add(span.text, { action: span.kind, reason: span.reason });
        else add(token, classifyNameToken(token, rel));
      }
      const banners = (text.match(BANNER) || []).length;
      for (let i = 0; i < banners; i++) add('DF ►', { action: 'rename', target: 'AOF ►' });
    } else {
      for (const m of text.matchAll(PLANNING_TOKEN)) {
        const token = trimToken(text, m.index, m[0]);
        const start = m.index + (m[0].length - token.length);
        const span = covering(start, start + token.length);
        if (span) add(span.text, { action: span.kind, reason: span.reason });
        else add(token, classifyPlanningSpan(text, start, start + token.length, code));
      }
    }
  }

  const list = [...rows.values()].sort((a, b) => {
    if (a.token !== b.token) return a.token < b.token ? -1 : 1;
    if (a.action !== b.action) return a.action < b.action ? -1 : 1;
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
  return { rows: list, unclassified: list.filter((r) => r.action === 'unclassified').length };
}

// ─── move planning ───────────────────────────────────────────────────────────

const underPrefix = (p, prefix) => p === prefix || p.startsWith(prefix.replace(/\/+$/, '') + '/');
const matchesOnly = (only, p) => only.length === 0 || only.some((o) => underPrefix(p, o));

/**
 * The moves to run, in order, and the moves that cannot run.
 * A directory move happens only when an `--only` prefix covers the whole directory; file moves
 * follow the files that match.
 */
function planMoves(files, only) {
  const moves = [];
  const conflicts = [];
  let cur = files.slice();

  for (const r of dirMoves()) {
    if (!cur.some((f) => f.startsWith(r.from + '/'))) continue;
    if (!matchesOnly(only, r.from) || (only.length && !only.some((o) => underPrefix(r.from, o)))) continue;
    if (cur.some((f) => f.startsWith(r.to + '/'))) {
      conflicts.push({ from: r.from, to: r.to, reason: `cannot move ${r.from} -> ${r.to}: the target already holds tracked files` });
      continue;
    }
    moves.push({ kind: 'dir', from: r.from, to: r.to });
    cur = cur.map((f) => (f.startsWith(r.from + '/') ? r.to + f.slice(r.from.length) : f));
  }

  const taken = new Set(cur);
  for (const f of cur) {
    if (isPathExempt(f) || !matchesOnly(only, f)) continue;
    const i = f.lastIndexOf('/');
    const to = f.slice(0, i + 1) + rewriteNames(f.slice(i + 1), f.slice(i + 1)).text;
    if (to === f) continue;
    if (taken.has(to)) {
      conflicts.push({ from: f, to, reason: `cannot rename ${f} -> ${to}: the target already exists` });
      continue;
    }
    taken.add(to);
    moves.push({ kind: 'file', from: f, to });
  }
  return { moves, conflicts };
}

/** Where `file` ends up after `moves` have run in order. */
function applyMoves(file, moves) {
  let p = file;
  for (const m of moves) {
    if (m.kind === 'dir') {
      if (p.startsWith(m.from + '/')) p = m.to + p.slice(m.from.length);
    } else if (p === m.from) {
      p = m.to;
    }
  }
  return p;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `usage: node scripts/aoforge-rename.cjs --rules names|planning [--inventory | --dry-run | --write]
                                      [--report <file>] [--only <prefix>]...

  --rules names|planning   which pass to run (required)
  --inventory              classify every legacy token; exit 1 if any is unclassified
  --dry-run                print the planned moves and rewrites, change nothing (default)
  --write                  git mv the paths, then rewrite the contents
  --report <file>          also write { rules, moves, rewrites, residuals } as JSON
  --only <prefix>          restrict to tracked files under this path prefix (repeatable)
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { rules: null, inventory: false, write: false, dryRun: false, report: null, only: [] };
  const value = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--rules':
        o.rules = value(i, a);
        i++;
        break;
      case '--report':
        o.report = value(i, a);
        i++;
        break;
      case '--only':
        o.only.push(value(i, a));
        i++;
        break;
      case '--inventory':
        o.inventory = true;
        break;
      case '--write':
        o.write = true;
        break;
      case '--dry-run':
        o.dryRun = true;
        break;
      default:
        throw new UsageError(a.startsWith('--') ? `unknown flag: ${a}` : `unexpected argument: ${a}`);
    }
  }
  if (o.rules !== 'names' && o.rules !== 'planning') throw new UsageError('--rules names|planning is required');
  if (o.write && o.dryRun) throw new UsageError('--write and --dry-run are mutually exclusive');
  if (o.inventory && (o.write || o.dryRun)) throw new UsageError('--inventory cannot be combined with --write or --dry-run');
  return o;
}

/** Tracked regular files under `cwd`, as posix paths relative to it. */
function trackedFiles(cwd) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd, maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : String(r.stderr).trim();
    throw new Error(`git ls-files failed in ${cwd}: ${why}`);
  }
  return r.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((f) => {
      try {
        return fs.lstatSync(path.join(cwd, f)).isFile();
      } catch {
        return false;
      }
    });
}

function gitMove(cwd, from, to) {
  const r = spawnSync('git', ['mv', from, to], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git mv ${from} ${to} failed: ${(r.stderr || r.error || '').toString().trim()}`);
}

const clip = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/**
 * Run the codemod.
 * @param {string[]} argv
 * @param {{ cwd?: string, out?: (s: string) => void, err?: (s: string) => void }} [io]
 * @returns {number} the exit code
 */
function main(argv = process.argv.slice(2), io = {}) {
  const cwd = io.cwd || process.cwd();
  const out = io.out || ((s) => process.stdout.write(s));
  const err = io.err || ((s) => process.stderr.write(s));

  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`aoforge-rename: ${e.message}\n${USAGE}`);
    return 1;
  }

  try {
    const files = trackedFiles(cwd);
    const { moves, conflicts } = o.rules === 'names' ? planMoves(files, o.only) : { moves: [], conflicts: [] };
    const entries = files.map((orig) => ({ orig, cur: applyMoves(orig, moves) }));
    const selected = entries.filter((e) => matchesOnly(o.only, e.orig) || matchesOnly(o.only, e.cur));

    if (o.inventory) {
      const inv = inventory(
        selected.map((e) => {
          const buf = fs.readFileSync(path.join(cwd, e.orig));
          const text = isBinary(buf) ? null : buf.toString('utf8');
          return { rel: e.orig, text: text !== null && Buffer.from(text, 'utf8').equals(buf) ? text : null };
        }),
        o.rules,
      );
      for (const r of inv.rows) out(`${r.token}\t${r.action}\t${r.detail}\t${r.count}\n`);
      out(`unclassified=${inv.unclassified}\n`);
      return inv.unclassified > 0 ? 1 : 0;
    }

    if (o.write) {
      for (const m of moves) gitMove(cwd, m.from, m.to);
    }

    const present = new Set(entries.map((e) => e.cur));
    const rewrites = [];
    const residuals = conflicts.map((c) => ({ file: c.from, line: 0, text: '', reason: c.reason }));
    for (const e of selected) {
      const buf = fs.readFileSync(path.join(cwd, o.write ? e.cur : e.orig));
      const conv = /^plugins\/([^/]+)\//.exec(e.cur);
      const compat = conv ? `plugins/${conv[1]}/${conv[1]}/bin/lib/compat.cjs` : null;
      const r = processFile(e.cur, buf, o.rules, { compatPath: compat && present.has(compat) ? compat : null });
      if (r.skipped) continue;
      for (const x of r.residuals) residuals.push({ file: e.cur, line: x.line, text: x.text, reason: x.reason });
      if (r.changed) {
        rewrites.push({ file: e.cur, count: r.count });
        if (o.write) fs.writeFileSync(path.join(cwd, e.cur), r.text);
      }
    }
    rewrites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    residuals.sort((a, b) => (a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line - b.line));

    for (const m of moves) out(`move ${m.from} -> ${m.to}\n`);
    for (const r of rewrites) out(`rewrite ${r.file} (${r.count})\n`);
    for (const r of residuals) out(`residual ${r.file}:${r.line} ${r.reason}${r.text ? ` | ${clip(r.text)}` : ''}\n`);
    out(`moves=${moves.length} rewrites=${rewrites.length} residuals=${residuals.length}\n`);

    if (o.report) {
      fs.writeFileSync(o.report, `${JSON.stringify({ rules: o.rules, moves, rewrites, residuals }, null, 2)}\n`);
    }
    return 0;
  } catch (e) {
    err(`aoforge-rename: ${e.message}\n`);
    return 1;
  }
}

module.exports = {
  PATH_RULES,
  NAME_RULES,
  PLANNING_RULES,
  PRESERVE,
  KNOWN_GLUED,
  SKIP,
  isSkipped,
  mapPath,
  rewriteNames,
  rewritePlanning,
  processFile,
  classifyToken,
  inventory,
  planMoves,
  main,
  occurrenceKind,
  fileKind,
  base,
};

if (require.main === module) process.exitCode = main();
