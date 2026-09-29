'use strict';

// stack-evidence.cjs — command evidence for `df-tools stack init` (TRD 35-04, recomposed in 42-07).
//
// `collectEvidence(root, { from })` returns every command the repository itself declares or runs,
// as STRUCTURED items:
//
//   { key, command, form, source, sourceFile, cwd, area, runner, confidence, weak, tool }
//
//   key         what the command does, by TOOL SEMANTICS (stack-classify), never an English token
//   command     the text to run, runnable from `cwd` (a runner target is `make test` in its own dir)
//   form        check | apply | build | mutate (stack-classify)
//   source      declared | runner | ci | manifest | docs — the kind of evidence, in preference order
//   sourceFile  the repo-relative file the item came from
//   cwd         repo-relative directory the command runs in; null = the repo root
//   area        the longest detected language area dir (`svc/`) containing cwd; '' = the root
//   runner      make | task | just | npm | script when the command goes through one, else null
//   confidence  high (a recognised tool) | low (only a target/script NAME said what it does)
//   weak        reasons the gate looks stricter than it is (`--no-fatal-infos`, `continue-on-error`)
//   tool        the tool that decided the key (`gosec`, `go`), for the drafter's collapse rules
//
// It composes the 42-03..05 readers instead of scraping lines: `.planning/<from>/STACK.md`
// Commands rows (declared), stack-runners targets whose BODY is normalised and classified
// (runner, and package.json scripts as manifest), stack-ci workflow steps (ci; a `make x` or
// `./scripts/x.sh` step is classified by the body it runs), and TESTING.md fenced blocks (docs).
// Shell text always goes through stack-shell.normalizeScript first, so a `\` continuation is one
// command and a comment, `echo`, `test -f x || {` or `${{ }}` fragment is never an item.
//
// This module MAY name file formats; stack-profile.cjs (the loader) stays free of them (P11).

const fs = require('fs');
const path = require('path');
const { normalizeScript } = require('./stack-shell.cjs');
const { classifyInvocation } = require('./stack-classify.cjs');
const { parseWorkflows } = require('./stack-ci.cjs');
const { readRunners } = require('./stack-runners.cjs');
const { detectAreas } = require('./stack-detect.cjs');
const { describeInvocation } = require('./stack-verify.cjs');

const STANDARD_KEYS = ['build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps'];

/** Evidence kinds, most trusted first. The drafter ranks candidates by this before anything else. */
const SOURCE_RANK = Object.freeze({ declared: 0, runner: 1, ci: 2, manifest: 3, docs: 4, detected: 5 });

// Profile command keys (schema `^[a-z][a-z0-9_]*$`).
const KEY_RE = /^[a-z][a-z0-9_]*$/;
const MAX_SCRIPT_BYTES = 64 * 1024;
const RUNNER_MAX_DEPTH = 2;

// ─── legacy token classifier (35-04) ──────────────────────────────────────────
//
// Kept for callers of the old export; collectEvidence no longer uses it. Its English-token
// matching is what classified `# run the tests` as test and `gosec -fmt` as format.

const TOKEN_MAP = [
  ['test', /\btests?\b/],
  ['lint', /\blint\b/],
  ['format', /\b(fmt|format)\b/],
  ['build', /\bbuild\b/],
  ['typecheck', /\btype-?check\b/],
  ['audit', /\baudit\b/],
  ['codegen', /\b(generate|codegen)\b/],
  ['fix', /\bfix\b/],
];

/** classifyCommand(cmd, hint) -> a STANDARD_KEYS member or null. LEGACY: use stack-classify. */
function classifyCommand(cmd, hint) {
  if (hint) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(hint)) return key;
    }
  }
  if (cmd) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(cmd)) return key;
    }
  }
  return null;
}

// ─── path helpers ─────────────────────────────────────────────────────────────

function rel(projectRoot, full) {
  return path.relative(projectRoot, full).split(path.sep).join('/');
}

/** A clean repo-relative posix dir, or null for the root ('', '.', './'). */
function normDir(dir) {
  if (dir === null || dir === undefined) return null;
  const raw = String(dir).replace(/\\/g, '/');
  if (raw === '') return null;
  const norm = path.posix.normalize(raw).replace(/\/+$/, '');
  return norm === '.' || norm === '' ? null : norm;
}

/** `dir` joined onto `base` (both repo-relative); null = the root. */
function joinDir(base, dir) {
  const b = normDir(base);
  const d = dir === null || dir === undefined ? null : String(dir);
  if (!d) return b;
  if (path.posix.isAbsolute(d)) return normDir(d);
  return normDir(b ? path.posix.join(b, d) : d);
}

/** The longest language-area dir (`svc/`) that contains `cwd`; '' when none does. */
function areaFor(cwd, areaDirs) {
  const c = cwd ? `${cwd}/` : '';
  let best = '';
  for (const d of areaDirs) {
    if (d && c.startsWith(d) && d.length > best.length) best = d;
  }
  return best;
}

function shq(s) {
  const str = String(s);
  return /^[\w@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, `'\\''`)}'`;
}

function safeNormalize(text, cwd) {
  try {
    return normalizeScript(String(text), { cwd: cwd || null });
  } catch (_) {
    return [];
  }
}

function safeDescribe(inv) {
  try {
    return describeInvocation(inv);
  } catch (_) {
    return { kind: 'binary', tool: inv.tool };
  }
}

function readSmall(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_SCRIPT_BYTES) return null;
    return fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return null;
  }
}

// ─── classification of bodies and runner calls ────────────────────────────────

/**
 * The first classified invocation of a body (runner recipe lines, a script file). `empty` is true
 * when the body normalises to nothing at all (only comments, echo, control words): such a body
 * runs no gate, so the target is not evidence even if its NAME sounds like one.
 */
function classifyBody(text, cwd) {
  const invs = safeNormalize(text, cwd);
  for (const inv of invs) {
    const r = classifyInvocation(inv);
    if (r) return { result: r, inv, empty: false };
  }
  return { result: null, inv: null, empty: invs.length === 0 };
}

/** How a runner target is invoked from ITS OWN directory (`make test`, `pnpm run lint`, `./bin/test.sh`). */
function localInvocation(t) {
  const q = shq(t.name);
  switch (t.runner) {
    case 'make': return `make ${q}`;
    case 'task': return `task ${q}`;
    case 'just': return `just ${q}`;
    case 'npm': {
      const m = t.manager || 'npm';
      return t.name === 'test' && m !== 'bun' ? `${m} test` : `${m} run ${q}`;
    }
    case 'script': return `./${t.name}`;
    default: return t.invocation;
  }
}

function hintFor(t) {
  if (t.runner !== 'script') return t.name;
  return path.posix.basename(String(t.name)).replace(/\.[^.]+$/, '');
}

/**
 * classifyTarget(target) -> classification | null. The BODY decides the key and form; the target
 * name is a low-confidence tiebreaker only when the body is empty (prerequisites only) or runs
 * nothing the classifier recognises. A body that normalises to nothing (`@echo done`) is not a gate.
 */
function classifyTarget(t) {
  const cwd = normDir(t.cwd) || normDir(t.dir);
  const body = Array.isArray(t.body) ? t.body : [];
  const b = classifyBody(body.join('\n'), cwd);
  if (b.result) return { ...b.result, resolvesTo: b.inv.text };
  if (body.length && b.empty) return null;
  return classifyInvocation(localInvocation(t), { hint: hintFor(t) });
}

function buildRunnerIndex(targets) {
  const index = new Map();
  for (const t of targets) {
    if (t.runner === 'script') continue;
    const dir = normDir(t.dir) || '';
    for (const name of [t.name, ...(Array.isArray(t.aliases) ? t.aliases : [])]) {
      const k = `${t.runner}|${dir}|${name}`;
      if (!index.has(k)) index.set(k, t);
    }
  }
  return index;
}

/**
 * A CI (or docs) invocation -> { cls, runner }. A `make x` / `npm run x` / `task x` step is
 * classified by the target body it runs; a wrapper script by its file's text; anything else by
 * its own tool. With no body to read, the target or script NAME is the (low-confidence) hint.
 */
function classifyStep(inv, index, projectRoot) {
  const d = safeDescribe(inv);
  if (d.kind === 'runner') {
    const name = Array.isArray(d.names) && d.names.length === 1 ? d.names[0] : null;
    const target = name && !d.unresolvable ? index.get(`${d.runner}|${normDir(d.dir) || ''}|${name}`) : null;
    if (target) return { cls: classifyTarget(target), runner: d.runner };
    const direct = classifyInvocation(inv, { hint: name || undefined });
    return { cls: direct, runner: d.runner };
  }
  if (d.kind === 'script' && d.file) {
    const fileRel = joinDir(d.cwd, d.file);
    const text = fileRel ? readSmall(path.join(projectRoot, fileRel)) : null;
    const hint = path.posix.basename(String(d.file)).replace(/\.[^.]+$/, '');
    if (text !== null) {
      const b = classifyBody(text, normDir(inv.cwd));
      if (b.result) return { cls: { ...b.result, resolvesTo: b.inv.text }, runner: 'script' };
      if (b.empty) return { cls: null, runner: 'script' };
    }
    return { cls: classifyInvocation(inv, { hint }), runner: 'script' };
  }
  return { cls: classifyInvocation(inv), runner: null };
}

// ─── readers ──────────────────────────────────────────────────────────────────

// 1. Explicit table: .planning/<from>/STACK.md `## Commands` rows (declared).
function readCommandsTable(projectRoot, from, push) {
  const full = path.join(projectRoot, '.planning', from, 'STACK.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const sourceFile = rel(projectRoot, full);
  let inSection = false;
  for (const line of text.split('\n')) {
    if (/^##\s+Commands\b/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const m = /^\|\s*([A-Za-z][A-Za-z0-9_-]*)\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'key' || !KEY_RE.test(key)) continue;
    const command = m[2].trim();
    const invs = safeNormalize(command, null);
    if (!invs.length) continue; // an echo / comment / fragment row declares nothing runnable
    const cls = classifyInvocation(command);
    const agrees = cls && cls.key === key;
    push({
      key,
      command,
      form: agrees ? cls.form : 'check',
      source: 'declared',
      sourceFile,
      cwd: null,
      runner: null,
      confidence: 'high',
      weak: agrees ? cls.weak : [],
      tool: agrees ? cls.tool : invs[0].tool,
    });
  }
}

// 2. Task runners: Makefile / Taskfile / justfile / scripts (runner) and package.json (manifest).
function readRunnerTargets(targets, push) {
  for (const t of targets) {
    const cls = classifyTarget(t);
    if (!cls) continue;
    push({
      key: cls.key,
      command: localInvocation(t),
      form: cls.form,
      source: t.runner === 'npm' ? 'manifest' : 'runner',
      sourceFile: t.file,
      cwd: normDir(t.dir),
      runner: t.runner,
      confidence: cls.confidence,
      weak: cls.weak,
      tool: cls.tool,
      resolvesTo: cls.resolvesTo,
    });
  }
}

// 3. CI: every logical invocation of every workflow step (stack-ci).
function readCi(projectRoot, index, push) {
  for (const step of parseWorkflows(projectRoot)) {
    for (const inv of step.invocations || []) {
      const { cls, runner } = classifyStep(inv, index, projectRoot);
      if (!cls) continue;
      const weak = [...(cls.weak || [])];
      if (step.continueOnError && !weak.includes('continue-on-error')) weak.push('continue-on-error');
      push({
        key: cls.key,
        command: inv.text,
        form: cls.form,
        source: 'ci',
        sourceFile: step.file,
        cwd: normDir(inv.cwd),
        runner,
        confidence: cls.confidence,
        weak,
        tool: cls.tool,
        resolvesTo: cls.resolvesTo,
      });
    }
  }
}

// 4. .planning/codebase/TESTING.md fenced bash/sh blocks (docs; from=codebase only).
function readTestingMd(projectRoot, index, push) {
  const full = path.join(projectRoot, '.planning', 'codebase', 'TESTING.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const sourceFile = rel(projectRoot, full);
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const fence = /^\s*```(\w*)/.exec(raw);
    if (fence) {
      if (cur === null) {
        const lang = fence[1];
        cur = lang === '' || lang === 'bash' || lang === 'sh' || lang === 'shell' ? [] : false;
      } else {
        if (cur) blocks.push(cur.join('\n'));
        cur = null;
      }
      continue;
    }
    if (cur) cur.push(raw);
  }
  for (const block of blocks) {
    for (const inv of safeNormalize(block, null)) {
      const { cls, runner } = classifyStep(inv, index, projectRoot);
      if (!cls) continue;
      push({
        key: cls.key,
        command: inv.text,
        form: cls.form,
        source: 'docs',
        sourceFile,
        cwd: normDir(inv.cwd),
        runner,
        confidence: cls.confidence,
        weak: cls.weak,
        tool: cls.tool,
      });
    }
  }
}

/**
 * collectEvidence(projectRoot, { from = 'codebase', areas }) -> items (see the header)
 *
 * Items come back grouped by source in preference order — declared, runner, ci, manifest, docs —
 * and in file order within a source. Every item is kept (a draft shows its work); choosing one per
 * key, verifying it and deciding what reaches the profile is stack-draft.assembleDraft's job.
 * `areas` (detectAreas output) is read when not supplied. Never throws on an unreadable file.
 */
function collectEvidence(projectRoot, { from = 'codebase', areas = null } = {}) {
  const detected = Array.isArray(areas) ? areas : safeAreas(projectRoot);
  const areaDirs = detected.filter((a) => a && Array.isArray(a.kinds) && a.kinds.length).map((a) => a.dir).filter(Boolean);

  const buckets = { declared: [], runner: [], ci: [], manifest: [], docs: [] };
  const push = (raw) => {
    if (!raw || !raw.key || !raw.command) return;
    const cwd = raw.cwd === undefined ? null : raw.cwd;
    const out = {
      key: raw.key,
      command: raw.command,
      form: raw.form || 'check',
      source: raw.source,
      sourceFile: raw.sourceFile,
      cwd,
      area: areaFor(cwd, areaDirs),
      runner: raw.runner || null,
      confidence: raw.confidence || 'high',
      weak: Array.isArray(raw.weak) ? [...raw.weak] : [],
      tool: raw.tool || null,
    };
    if (raw.resolvesTo) out.resolvesTo = raw.resolvesTo;
    (buckets[raw.source] || buckets.docs).push(out);
  };

  let targets = [];
  try {
    targets = readRunners(projectRoot, { maxDepth: RUNNER_MAX_DEPTH });
  } catch (_) {
    targets = [];
  }
  const index = buildRunnerIndex(targets);

  readCommandsTable(projectRoot, from, push);
  readRunnerTargets(targets, push);
  readCi(projectRoot, index, push);
  if (from === 'codebase') readTestingMd(projectRoot, index, push);

  return [...buckets.declared, ...buckets.runner, ...buckets.ci, ...buckets.manifest, ...buckets.docs];
}

function safeAreas(projectRoot) {
  try {
    return detectAreas(projectRoot);
  } catch (_) {
    return [];
  }
}

module.exports = {
  STANDARD_KEYS,
  SOURCE_RANK,
  classifyCommand,
  collectEvidence,
  localInvocation,
};
