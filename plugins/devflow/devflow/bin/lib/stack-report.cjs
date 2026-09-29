'use strict';

// stack-report.cjs — CI/CD + local-testing recommendations: `stack report` (TRD 42-08, SDR-06).
//
// Compares what a repository's CI and task runners actually RUN against the stacks it contains,
// and writes the result as `.planning/STACK-REPORT.md`: proposals only. Nothing here edits a
// workflow, a runner file or STACK.md.
//
// Every source is first normalised into the same INVOCATION RECORDS (buildRecords):
//
//   { origin, scope, file, job?, target?, runner?, ciFile?, cwd, area, text, tool,
//     continueOnError, weakMarkers, scheduled }
//
//   origin          ci | runner | script — what produced the text
//   scope           ci (runs in CI, directly or through a runner target / wrapper script the CI
//                   step calls) | local (a runner target a developer can run)
//   file            the file the text came from (a workflow, a Makefile, a script)
//   job / ciFile    the CI job and workflow file (ci scope only)
//   target / runner the runner target and its runner (make | task | just | npm | script)
//   cwd             repo-relative directory the command runs in; null = the repo root
//   area            the longest detected language area dir (`svc/`) containing cwd; '' = root
//   text / tool     the logical invocation (stack-shell) and its first word; `uses:<owner/repo>`
//                   with tool `uses` for an action step
//   continueOnError the step (or job) sets `continue-on-error: true`
//   weakMarkers     why the command cannot fail: `--no-fatal-infos`, `|| true`, `bare gofmt -l`…
//   scheduled       the workflow has a `schedule:` trigger
//
// A CI step calling make / task / just / an npm script expands into the target body (depth <= 2,
// cycle guard keyed on runner|dir|name). A CI step running `./scripts/x.sh` or `bash x.sh` has
// the script's body read once. The checks (REPORT_CHECKS) are DATA over these records.

const fs = require('fs');
const path = require('path');
const { normalizeScript, splitWords } = require('./stack-shell.cjs');
const { WEAK_MARKERS } = require('./stack-classify.cjs');
const { parseWorkflows } = require('./stack-ci.cjs');
const { readRunners } = require('./stack-runners.cjs');
const { detectAreas } = require('./stack-detect.cjs');
const { describeInvocation } = require('./stack-verify.cjs');

const RUNNER_MAX_DEPTH = 2;
const MAX_EXPAND_DEPTH = 2;
const MAX_SCRIPT_BYTES = 64 * 1024;
const GO_FMT_TOOLS = new Set(['gofmt', 'gofumpt', 'goimports']);

// ─── path helpers ─────────────────────────────────────────────────────────────

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

function languageAreaDirs(areas) {
  return (areas || []).filter((a) => a && Array.isArray(a.kinds) && a.kinds.length).map((a) => a.dir).filter(Boolean);
}

function safeAreas(root) {
  try {
    return detectAreas(root);
  } catch (_) {
    return [];
  }
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

// ─── weak markers ─────────────────────────────────────────────────────────────

/** The first pipeline stage: `a | b`, `a || b`, `a && b` and `a ; b` are judged by `a`. */
function firstStage(argv) {
  const cut = argv.findIndex((x) => x === '|' || x === '||' || x === '&&' || x === ';');
  return cut === -1 ? argv : argv.slice(0, cut);
}

/**
 * weakMarkersOf(inv) -> string[]. stack-classify's WEAK_MARKERS (flags and `|| true`), plus
 * `bare gofmt -l`: a `gofmt|gofumpt|goimports -l/-d` that is neither piped into an exit
 * condition nor wrapped in `test -z "$(…)"` lists files and exits 0.
 */
function weakMarkersOf(inv) {
  const text = String(inv.text || '');
  const argv = Array.isArray(inv.argv) && inv.argv.length ? inv.argv.map(String) : splitWords(text);
  if (!argv.length) return [];
  const stage = firstStage(argv);
  const out = [];
  for (const m of WEAK_MARKERS) {
    try {
      if (m.test(stage, text) && !out.includes(m.id)) out.push(m.id);
    } catch (_) {
      // a marker that cannot read this argv does not apply
    }
  }
  const tool = path.posix.basename(String(stage[0] || ''));
  const piped = stage.length < argv.length && argv[stage.length] === '|';
  if (GO_FMT_TOOLS.has(tool) && stage.some((a) => a === '-l' || a === '-d') && !stage.includes('-w') && !piped) {
    out.push('bare gofmt -l');
  }
  return out;
}

// ─── runner index ─────────────────────────────────────────────────────────────

function targetKey(runner, dir, name) {
  return `${runner}|${normDir(dir) || ''}|${name}`;
}

function buildRunnerIndex(targets) {
  const index = new Map();
  for (const t of targets) {
    if (t.runner === 'script') continue;
    for (const name of [t.name, ...(Array.isArray(t.aliases) ? t.aliases : [])]) {
      const k = targetKey(t.runner, t.dir, name);
      if (!index.has(k)) index.set(k, t);
    }
  }
  return index;
}

function targetBody(t) {
  return Array.isArray(t.body) ? t.body.join('\n') : String(t.body || '');
}

function targetCwd(t) {
  return normDir(t.cwd) || normDir(t.dir);
}

// ─── buildRecords ─────────────────────────────────────────────────────────────

/**
 * buildRecords(root, { areas }) -> invocation records (see the header), in source order: CI
 * steps (sorted workflow files, file order), each followed by its expansion; then every runner
 * target's body (local). `areas` is detectAreas output, read when not supplied. Never throws on
 * an unreadable or malformed file: stack-ci, stack-runners and stack-shell all tolerate them.
 */
function buildRecords(root, { areas = null } = {}) {
  const abs = path.resolve(String(root));
  const detected = Array.isArray(areas) ? areas : safeAreas(abs);
  const areaDirs = languageAreaDirs(detected);

  let targets = [];
  try {
    targets = readRunners(abs, { maxDepth: RUNNER_MAX_DEPTH });
  } catch (_) {
    targets = [];
  }
  const index = buildRunnerIndex(targets);
  const scriptCache = new Map();
  const records = [];

  const push = (base, fields, inv) => {
    const cwd = normDir(inv.cwd);
    records.push({
      ...base,
      ...fields,
      cwd,
      area: areaFor(cwd, areaDirs),
      text: String(inv.text),
      tool: String(inv.tool),
      weakMarkers: weakMarkersOf(inv),
    });
  };

  const readScript = (fileRel) => {
    if (!scriptCache.has(fileRel)) scriptCache.set(fileRel, readSmall(path.join(abs, fileRel)));
    return scriptCache.get(fileRel);
  };

  // One level (then a second) of expansion: a runner call into its target body, a wrapper
  // script into its file. `seen` guards cycles; scripts are read once and not expanded further.
  const expand = (inv, base, depth, seen, { runners = true } = {}) => {
    if (depth > MAX_EXPAND_DEPTH) return;
    const d = safeDescribe(inv);
    if (d.kind === 'runner' && runners) {
      if (d.unresolvable || d.info || !Array.isArray(d.names)) return;
      for (const name of d.names) {
        const k = targetKey(d.runner, d.dir, name);
        if (seen.has(k)) continue;
        const t = index.get(k);
        if (!t) continue;
        const nextSeen = new Set(seen).add(k);
        for (const sub of safeNormalize(targetBody(t), targetCwd(t))) {
          push(base, { origin: 'runner', file: t.file, target: t.name, runner: t.runner }, sub);
          expand(sub, base, depth + 1, nextSeen, { runners });
        }
      }
      return;
    }
    if (d.kind === 'script' && d.file) {
      const fileRel = joinDir(d.cwd, d.file);
      if (!fileRel) return;
      const k = `script|${fileRel}`;
      if (seen.has(k)) return;
      const text = readScript(fileRel);
      if (text === null) return;
      for (const sub of safeNormalize(text, normDir(inv.cwd))) {
        push(base, { origin: 'script', file: fileRel, runner: 'script' }, sub);
      }
    }
  };

  // CI: every step of every workflow, `uses:` included.
  let steps = [];
  try {
    steps = parseWorkflows(abs);
  } catch (_) {
    steps = [];
  }
  for (const step of steps) {
    const base = {
      scope: 'ci',
      ciFile: step.file,
      job: step.job,
      continueOnError: step.continueOnError === true,
      scheduled: step.scheduled === true,
    };
    if (step.uses) {
      const ref = String(step.uses).split('@')[0].trim();
      if (ref) {
        push(base, { origin: 'ci', file: step.file }, { text: `uses:${ref}`, tool: 'uses', argv: [], cwd: step.cwd });
      }
    }
    for (const inv of step.invocations || []) {
      push(base, { origin: 'ci', file: step.file }, inv);
      expand(inv, base, 1, new Set());
    }
  }

  // Local: every runner target's body. Other targets are already listed on their own, so only
  // wrapper scripts are followed from here.
  for (const t of targets) {
    const base = { scope: 'local', continueOnError: false, scheduled: false };
    const own = targetKey(t.runner, t.dir, t.name);
    for (const inv of safeNormalize(targetBody(t), targetCwd(t))) {
      push(base, { origin: 'runner', file: t.file, target: t.name, runner: t.runner }, inv);
      expand(inv, base, 1, new Set([own]), { runners: false });
    }
  }

  return records;
}

module.exports = {
  buildRecords,
  // exported for tests and for the report builder
  _weakMarkersOf: weakMarkersOf,
  _areaFor: areaFor,
};
