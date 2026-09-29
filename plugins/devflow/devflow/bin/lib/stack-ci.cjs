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

function applyStepKey(step, key, value, block) {
  switch (key) {
    case 'name': step.name = scalar(value) || null; break;
    case 'uses': step.uses = scalar(value) || null; break;
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
function parseDoc(doc, file) {
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
      if (km) stack.push({ col, key });
    }
  } catch (_) {
    // A shape this reader does not understand: keep whatever was read so far.
  }

  const steps = [];
  for (const s of rawSteps) {
    if (s.uses == null && s.runLines == null) continue; // a step with nothing to run or use
    const cwd = firstSet([s.cwd, jobCwd.get(s.job), wfCwd]);
    const continueOnError = s.coe !== null ? s.coe : jobCoe.get(s.job) === true;
    let invocations = [];
    if (s.runLines) {
      try {
        invocations = normalizeScript(s.runLines, { cwd });
      } catch (_) {
        invocations = [];
      }
    }
    steps.push({ file, job: s.job, name: s.name, uses: s.uses, cwd, continueOnError, scheduled, invocations });
  }
  return steps;
}

/**
 * _parseWorkflowText(text, file) -> steps[]
 *
 * Exported for unit tests. Splits multi-document files on `---` so workflow-level state (defaults,
 * schedule) never leaks from one document to the next, and never throws.
 */
function _parseWorkflowText(text, file) {
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
      for (const step of parseDoc(doc, file)) out.push(step);
    } catch (_) {
      // skip an unreadable document
    }
  }
  return out;
}

/**
 * parseWorkflows(root) -> [{ file, job, name, uses, cwd, continueOnError, scheduled, invocations }]
 *
 * `file` is repo-relative (`.github/workflows/ci.yml`). Files are read in sorted order; `.yml` and
 * `.yaml` both count. `cwd` is the effective step directory — step `working-directory`, else job
 * `defaults.run.working-directory`, else workflow-level — or null for the repo root. Each invocation
 * additionally carries any `cd` made inside the block. `scheduled` is per WORKFLOW. A `uses:` step is
 * recorded with `uses` set and `invocations: []`.
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
    for (const step of _parseWorkflowText(text, `.github/workflows/${name}`)) out.push(step);
  }
  return out;
}

module.exports = { parseWorkflows, _parseWorkflowText };
