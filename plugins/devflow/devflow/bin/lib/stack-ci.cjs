'use strict';

// stack-ci.cjs — structural GitHub Actions reader for `df-tools stack init` (TRD 42-03, SDR-02).
//
// Reads `.github/workflows/*.y{a,}ml` as WORKFLOWS — job, step, working directory, `uses:` — and
// hands every `run:` body to stack-shell.cjs so what comes out is a list of logical invocations,
// not physical lines. It replaces the line-at-a-time regex scrape in stack-evidence.cjs.
//
// Deliberately NOT a YAML parser (see the stack-evidence.cjs header): real workflows use anchors,
// multi-document files, a bare `on:` key and flow maps that yaml-lite rejects. This is an
// indentation-tracking line reader that recognises exactly the handful of shapes it needs:
//
//   on: / schedule:                              -> `scheduled`
//   defaults: run: working-directory:            -> workflow cwd
//   jobs: <job>: defaults: run: working-directory:, continue-on-error:, steps:
//   - name: / uses: / run: (inline, `|` or `>`) / working-directory: / continue-on-error:
//
// Anything else is skipped, never thrown on: `_parseWorkflowText` returns whatever it could read.
//
// PURE apart from the directory read in parseWorkflows(). Names no language or framework.

const fs = require('fs');
const path = require('path');
const { normalizeScript } = require('./stack-shell.cjs');

// indent, optional `- `, key (bare or quoted), `:`, optional value.
const KEY_RE = /^(\s*)(-\s+)?(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*:(?:\s+(.*?))?\s*$/;
// A list item, whether or not its content is a `key: value` pair.
const DASH_RE = /^(\s*)-(?:\s+|$)/;
const COMMENT_RE = /^\s*#/;
// `|`, `>`, with optional chomping / indentation indicators and a trailing comment.
const BLOCK_RE = /^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/;

const asString = (t) => (t == null ? '' : String(t));

/** A YAML scalar as text: quotes removed, `&anchor` stripped, a trailing ` # comment` dropped. */
function scalar(v) {
  let s = asString(v).trim();
  if (!s) return '';
  s = s.replace(/^&\S+\s*/, '');
  if (s.startsWith('*')) return ''; // an alias: its target is not knowable here
  const q = s[0];
  if (q === '"' || q === "'") {
    let end = -1;
    for (let k = 1; k < s.length; k++) {
      if (q === '"' && s[k] === '\\') { k++; continue; }
      if (s[k] === q) {
        if (q === "'" && s[k + 1] === "'") { k++; continue; } // '' is an escaped quote
        end = k;
        break;
      }
    }
    if (end === -1) return s.slice(1); // unterminated: take what follows the quote
    const inner = s.slice(1, end);
    return q === '"' ? inner.replace(/\\(["\\/])/g, '$1') : inner.replace(/''/g, "'");
  }
  return s.replace(/\s+#.*$/, '').trim();
}

const isTrue = (v) => scalar(v).toLowerCase() === 'true';

const firstSet = (values) => {
  for (const v of values) if (v != null && v !== '') return v;
  return null;
};

/** Remove the common leading indentation of a block scalar body; blank lines stay empty. */
function dedent(lines) {
  let min = Infinity;
  for (const l of lines) {
    if (l.trim() === '') continue;
    min = Math.min(min, l.length - l.trimStart().length);
  }
  if (!Number.isFinite(min)) return lines.map(() => '');
  return lines.map((l) => (l.trim() === '' ? '' : l.slice(min)));
}

/** `>` folded style: adjacent lines join with a space; a blank line starts a new paragraph. */
function fold(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) { out.push(cur.join(' ')); cur = []; }
    } else {
      cur.push(l.trim());
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

/** A one-line YAML flow map (`{ a: x, b: 'y' }`) as `{ key: scalar }`; anything else gives `{}`. */
function flowMap(v) {
  const s = asString(v).trim();
  const out = {};
  if (!s.startsWith('{')) return out;
  const end = s.lastIndexOf('}');
  const body = s.slice(1, end === -1 ? undefined : end);
  const parts = [];
  let cur = '';
  let q = null;
  for (const ch of body) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(part);
    if (m) out[m[1]] = scalar(m[2]);
  }
  return out;
}

/** An `actions/checkout` `with:` key (block or flow spelling) recorded on the raw step. */
function applyWithKey(step, key, value) {
  if (key === 'path') step.withPath = scalar(value) || null;
  else if (key === 'repository') step.withRepo = scalar(value) || null;
}

// ─── working-directory normalisation (TRD 42-14, D1) ──────────────────────
//
// CI often checks THIS repo out into a subdir (`actions/checkout … with: { path: svcrepo }`) and
// then says `working-directory: svcrepo/go`, which is `go` in the repo. Other checkout steps put a
// DIFFERENT repo (`repository:` + `path:`) beside it; a cwd inside one of those is not this repo.

const WORKSPACE_RE = /^(?:\$\{\{\s*github\.workspace\s*\}\}|\$\{?GITHUB_WORKSPACE\}?)(?:\/+|$)/;
const SELF_REPOSITORY = /^\$\{\{\s*github\.repository\s*\}\}$/;

/** A repo-relative posix dir: `${{ github.workspace }}/` and `./` stripped; null for the root. */
function cleanRel(p) {
  if (p == null) return null;
  let s = asString(p).trim().replace(/\\/g, '/');
  if (!s) return null;
  const ws = WORKSPACE_RE.exec(s);
  if (ws) s = s.slice(ws[0].length);
  s = s.replace(/^(?:\.\/+)+/, '');
  if (!s) return null;
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  return n === '.' || n === '' ? null : n;
}

const under = (p, base) => p === base || p.startsWith(`${base}/`);
const stripBase = (p, base) => (p === base ? null : p.slice(base.length + 1));

function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * normaliseWorkingDirectory(raw, { root, repoName, selfCheckoutPath, otherCheckoutPaths }) -> { cwd, external }
 *
 * In order: `${{ github.workspace }}/` (or `$GITHUB_WORKSPACE/`) and a leading `./` are stripped;
 * a cwd at or under another checkout's `path:` is returned as-is with `external: true`; a leading
 * `<p>/` is stripped when `<p>` is the job's self-checkout `path:`; else, only when the job has no
 * self-checkout path, a leading `<repoName>/` is stripped when `<root>/<repoName>` does NOT exist
 * (a real dir of that name is never stripped). Anything undecidable is kept as written; the
 * verifier's `cwd_missing` catches a wrong guess. `cwd` is null for the repo root.
 */
function normaliseWorkingDirectory(raw, { root = null, repoName = null, selfCheckoutPath = null, otherCheckoutPaths = [] } = {}) {
  const s = cleanRel(raw);
  if (s === null) return { cwd: null, external: false };
  for (const other of Array.isArray(otherCheckoutPaths) ? otherCheckoutPaths : []) {
    const o = cleanRel(other);
    if (o && under(s, o)) return { cwd: s, external: true };
  }
  const self = cleanRel(selfCheckoutPath);
  if (self) {
    if (under(s, self)) return { cwd: stripBase(s, self), external: false };
    return { cwd: s, external: false };
  }
  const name = repoName || (root ? path.basename(String(root)) : null);
  if (name && root && under(s, name) && !isDir(path.join(String(root), name))) {
    return { cwd: stripBase(s, name), external: false };
  }
  return { cwd: s, external: false };
}

/** The job's checkouts -> { selfCheckoutPath, otherCheckoutPaths } for normaliseWorkingDirectory. */
function checkoutContext(checkouts) {
  let selfCheckoutPath = null;
  const otherCheckoutPaths = [];
  for (const c of checkouts) {
    if (!c.path) continue;
    const self = !c.repository || SELF_REPOSITORY.test(c.repository);
    if (self) {
      if (selfCheckoutPath === null) selfCheckoutPath = c.path;
    } else {
      otherCheckoutPaths.push(c.path);
    }
  }
  return { selfCheckoutPath, otherCheckoutPaths };
}

function applyStepKey(step, key, value, block) {
  switch (key) {
    case 'name': step.name = scalar(value) || null; break;
    case 'uses': step.uses = scalar(value) || null; break;
    case 'with': {
      const m = flowMap(value);
      for (const k of Object.keys(m)) applyWithKey(step, k, m[k]);
      break;
    }
    case 'working-directory': step.cwd = scalar(value) || null; break;
    case 'continue-on-error': step.coe = isTrue(value); break;
    case 'run':
      if (block) {
        step.runLines = block.style === '>' ? fold(block.lines) : block.lines;
      } else {
        const v = scalar(value);
        step.runLines = v ? [v] : [];
      }
      break;
    default: break;
  }
}

/**
 * parseDoc(doc, file) -> steps[]
 *
 * One YAML document. Two phases: (1) walk the lines collecting raw steps plus the workflow / job
 * defaults, (2) once the whole document is read, resolve each step's effective cwd and normalise its
 * `run:` body — so key ORDER never matters (`defaults:` may follow `jobs:`, `working-directory:`
 * may follow `run:`).
 */
function parseDoc(doc, file, { root = null, repoName = null } = {}) {
  const lines = doc.split('\n').map((l) => l.replace(/\r$/, ''));
  const stack = []; // open mapping keys: { col, key }
  let wfCwd = null;
  let scheduled = false;
  const jobCwd = new Map();
  const jobCoe = new Map();
  const rawSteps = [];
  let cur = null;
  let stepsDash = null; // indent of the current job's `steps:` list dashes

  try {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i++];
      if (!line.trim() || COMMENT_RE.test(line)) continue;
      const dm = DASH_RE.exec(line);
      const km = KEY_RE.exec(line);
      if (!dm && !km) continue;

      const indent = line.length - line.trimStart().length;
      const col = dm ? dm[0].length : indent; // the column the key itself starts at

      // A dash at the steps-list indent ALWAYS opens a sibling step, however tangled the lines
      // before it were: re-sync to the `steps:` frame instead of trusting the popped stack.
      const inSteps = stack.length >= 3 && stack[0].key === 'jobs' && stack[2].key === 'steps';
      if (dm && inSteps && stepsDash !== null && indent === stepsDash) {
        while (stack.length > 3) stack.pop();
      } else {
        while (stack.length && stack[stack.length - 1].col >= col) stack.pop();
      }
      const p = stack.map((f) => f.key);

      const key = km ? (km[3] !== undefined ? km[3] : km[4] !== undefined ? km[4] : km[5]) : null;
      const value = km && km[6] !== undefined ? km[6] : '';

      // A block scalar is consumed wholesale, whatever key owns it, so its body is never
      // mistaken for structure (a `script: |` under `with:` may contain `run:` look-alikes).
      let block = null;
      if (km && BLOCK_RE.test(value)) {
        const body = [];
        while (i < lines.length) {
          const l = lines[i];
          if (l.trim() === '') { body.push(''); i++; continue; }
          if (l.length - l.trimStart().length <= col) break;
          body.push(l);
          i++;
        }
        while (body.length && body[body.length - 1] === '') body.pop();
        block = { style: value[0], lines: dedent(body) };
      }

      if (km) {
        if (p.length === 0) {
          if ((key === 'on' || key === 'true') && /\bschedule\b/.test(value)) scheduled = true;
        } else if (p.length === 1 && p[0] === 'on' && key === 'schedule') {
          scheduled = true;
        } else if (p.length === 2 && p[0] === 'defaults' && p[1] === 'run' && key === 'working-directory') {
          wfCwd = scalar(value) || null;
        } else if (p[0] === 'jobs' && p.length >= 2) {
          const job = p[1];
          if (p.length === 2 && key === 'continue-on-error') jobCoe.set(job, isTrue(value));
          else if (p.length === 2 && key === 'steps') stepsDash = null;
          else if (p.length === 4 && p[2] === 'defaults' && p[3] === 'run' && key === 'working-directory') {
            jobCwd.set(job, scalar(value) || null);
          }
        }
      } else if (p.length === 1 && p[0] === 'on' && /^\s*-\s*schedule\s*$/.test(line)) {
        scheduled = true; // `on:` written as a list: `- schedule`
      }

      const atStepLevel = p.length === 3 && p[0] === 'jobs' && p[2] === 'steps';
      if (dm && atStepLevel) {
        if (stepsDash === null) stepsDash = indent;
        if (indent === stepsDash) {
          cur = { job: p[1], name: null, uses: null, cwd: null, coe: null, runLines: null, keyCol: col };
          rawSteps.push(cur);
        }
      }
      if (km && cur && atStepLevel && cur.job === p[1] && col === cur.keyCol) {
        applyStepKey(cur, key, value, block);
      }
      // A direct child of the current step's own `with:` (block spelling).
      if (km && cur && p.length === 4 && p[0] === 'jobs' && p[2] === 'steps' && p[3] === 'with'
        && cur.job === p[1] && stack[3].col === cur.keyCol) {
        applyWithKey(cur, key, value);
      }
      if (km) stack.push({ col, key });
    }
  } catch (_) {
    // A shape this reader does not understand: keep whatever was read so far.
  }

  // Per-job `actions/checkout` steps, in declaration order (TRD 42-14).
  const jobCheckouts = new Map();
  for (const s of rawSteps) {
    if (!s.uses || !/^actions\/checkout(?:@|$)/.test(s.uses)) continue;
    if (!jobCheckouts.has(s.job)) jobCheckouts.set(s.job, []);
    jobCheckouts.get(s.job).push({ path: cleanRel(s.withPath), repository: s.withRepo || null });
  }

  const steps = [];
  for (const s of rawSteps) {
    if (s.uses == null && s.runLines == null) continue; // a step with nothing to run or use
    const rawCwd = firstSet([s.cwd, jobCwd.get(s.job), wfCwd]);
    const checkouts = (jobCheckouts.get(s.job) || []).map((c) => ({ ...c }));
    const ctx = { root, repoName, ...checkoutContext(checkouts) };
    const continueOnError = s.coe !== null ? s.coe : jobCoe.get(s.job) === true;
    let invocations = [];
    if (s.runLines) {
      try {
        // The RAW cwd seeds the block so a `cd` composes against what CI really ran in; each
        // resulting cwd is then normalised on its own (a `cd ../libs/x` can reach a sibling).
        invocations = normalizeScript(s.runLines, { cwd: rawCwd });
      } catch (_) {
        invocations = [];
      }
    }
    for (const inv of invocations) {
      const n = normaliseWorkingDirectory(inv.cwd, ctx);
      inv.cwd = n.cwd;
      inv.external = n.external;
    }
    const { cwd, external } = normaliseWorkingDirectory(rawCwd, ctx);
    steps.push({ file, job: s.job, name: s.name, uses: s.uses, cwd, external, checkouts, continueOnError, scheduled, invocations });
  }
  return steps;
}

/**
 * _parseWorkflowText(text, file) -> steps[]
 *
 * Exported for unit tests. Splits multi-document files on `---` so workflow-level state (defaults,
 * schedule) never leaks from one document to the next, and never throws.
 */
function _parseWorkflowText(text, file, opts = {}) {
  const out = [];
  let src;
  try {
    src = asString(text).replace(/^﻿/, '');
  } catch (_) {
    return out;
  }
  for (const doc of src.split(/^---[ \t]*\r?$/m)) {
    if (!doc.trim()) continue;
    try {
      for (const step of parseDoc(doc, file, opts || {})) out.push(step);
    } catch (_) {
      // skip an unreadable document
    }
  }
  return out;
}

/**
 * parseWorkflows(root) -> [{ file, job, name, uses, cwd, external, checkouts, continueOnError, scheduled, invocations }]
 *
 * `file` is repo-relative (`.github/workflows/ci.yml`). Files are read in sorted order; `.yml` and
 * `.yaml` both count. `cwd` is the effective step directory — step `working-directory`, else job
 * `defaults.run.working-directory`, else workflow-level — NORMALISED against the job's checkouts
 * (normaliseWorkingDirectory, TRD 42-14), or null for the repo root. `external` is true when that
 * cwd is inside another repo's checkout. `checkouts` lists the job's `actions/checkout` steps as
 * `{ path, repository }`. Each invocation additionally carries any `cd` made inside the block, and
 * its own normalised `cwd` + `external`. `scheduled` is per WORKFLOW. A `uses:` step is recorded
 * with `uses` set and `invocations: []`.
 */
function parseWorkflows(root) {
  const dir = path.join(root, '.github', 'workflows');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const out = [];
  for (const name of entries.filter((f) => /\.ya?ml$/.test(f)).sort()) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf-8');
    } catch (_) {
      continue;
    }
    const opts = { root, repoName: path.basename(path.resolve(String(root))) };
    for (const step of _parseWorkflowText(text, `.github/workflows/${name}`, opts)) out.push(step);
  }
  return out;
}

module.exports = { parseWorkflows, _parseWorkflowText, normaliseWorkingDirectory };
