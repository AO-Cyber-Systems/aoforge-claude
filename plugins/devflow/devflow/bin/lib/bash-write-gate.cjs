'use strict';

/**
 * bash-write-gate.cjs — TRD 60-03
 *
 * The decision the edit gate makes about a Bash command: of the files it
 * writes (bash-write-detect.cjs, 60-02), which does the gate stop, and which
 * pass. It is the ONE decision shared by the hook (60-04, live file system and
 * git) and the transcript replay (60-05, historical predicates), so both make
 * the same call from the same code. The predicates are injected for that reason.
 *
 *   evaluateBashWrites(cmd, { cwd, projectRoot, home, isOutside, isDirectory, isTracked })
 *     -> { writes, gated, passed }
 *
 *   writes  what detectBashWrites reported, untouched
 *   gated   absolute paths of tracked project files the command writes, each once,
 *           in command order
 *   passed  [{ path, form, reason }] for every write that is not gated
 *
 * Pass reasons, checked in this order for each target:
 *   unresolvable     the target cannot be resolved statically ($VAR, backticks)
 *   outside-project  not under the project root (tmp, scratchpad, other repos)
 *   planning         any `.planning` segment below the project root
 *   markdown         `*.md`
 *   untracked        a candidate that git does not track (new files, ignored files)
 *
 * What is left after those four is a candidate, and ONE tracked-set lookup turns
 * candidates into `gated` (tracked) or `untracked` (passed). The lookup is not
 * made when there is no candidate, so a command that only touches tmp or
 * markdown never costs a git call.
 *
 * cp and mv into a directory (trailing slash, -t, `.`, or a destination that
 * isDirectory says exists) are judged on <dir>/<basename(source)>, the file that
 * is actually written.
 *
 * The defaults fail open: with no `isTracked` nothing is tracked, so nothing is
 * gated; with no `isDirectory` a bare destination is a file. A gate that cannot
 * ask git must not stop work.
 *
 * Severity (GATE-04, GATE-05). `gates.bashEditGate` (strict|warn|off) is the
 * Bash rule's own knob; unset or invalid means BASH_EDIT_GATE_DEFAULT. The mode
 * the hook applies is effectiveBashMode(editGate, bashEditGate): the LEAST severe
 * of that knob and the existing `gates.editGate`, so editGate warn or off always
 * softens or disables the Bash rule. This lib does not read the editGate config:
 * the hook already has gate-edits' reader and passes the value in, and a second
 * reader would drift. The strict-vs-warn rule is code, not prose: FP_THRESHOLD
 * and recommendDefault.
 *
 * Live tracked check: gitTrackedSet asks git ONCE per evaluation, and only when a
 * candidate exists. It fails open: any failure is an empty set.
 *
 * Mirrors gate-edits.js for Edit/Write (planning artifact, markdown doc) but does
 * not require it: this lib is mirrored to ~/.claude/devflow without hooks/.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { detectBashWrites } = require('./bash-write-detect.cjs');

/** Order-preserving unique. */
function unique(list) {
  return [...new Set(list)];
}

/** True when `abs` is not inside `projectRoot`. */
function defaultIsOutside(projectRoot) {
  return (abs) => {
    const rel = path.relative(projectRoot, abs);
    return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  };
}

/**
 * The files one detected write lands on. A cp or mv into a directory lands each
 * source under it; every other write lands on its own path. A null entry is a
 * target that cannot be resolved.
 */
function targetsOf(w, isDirectory) {
  const copiesInto = (w.form === 'cp' || w.form === 'mv') && w.path && (w.into || isDirectory(w.path));
  if (copiesInto) {
    return (w.sources || []).map((s) => (s ? path.join(w.path, path.basename(s)) : null));
  }
  return [w.path];
}

/**
 * @param {string} cmd
 * @param {{
 *   cwd?: string,
 *   projectRoot?: string,
 *   home?: string,
 *   isOutside?: (abs: string) => boolean,
 *   isDirectory?: (abs: string) => boolean,
 *   isTracked?: (abs: string[]) => Set<string>,
 * }} [ctx] projectRoot defaults to cwd; isOutside to the path.relative test
 * @returns {{
 *   writes: Array<object>,
 *   gated: string[],
 *   passed: Array<{path: string|null, form: string, reason: string}>,
 * }}
 */
function evaluateBashWrites(cmd, ctx = {}) {
  const { cwd, home, isDirectory = () => false, isTracked = () => new Set() } = ctx;
  const projectRoot = ctx.projectRoot || cwd;
  const isOutside = ctx.isOutside || defaultIsOutside(projectRoot);

  const writes = detectBashWrites(cmd, { cwd, home });
  const passed = [];
  const candidates = [];

  for (const w of writes) {
    for (const target of targetsOf(w, isDirectory)) {
      if (target === null) {
        passed.push({ path: null, form: w.form, reason: 'unresolvable' });
      } else if (isOutside(target)) {
        passed.push({ path: target, form: w.form, reason: 'outside-project' });
      } else if (path.relative(projectRoot, target).split(path.sep).includes('.planning')) {
        passed.push({ path: target, form: w.form, reason: 'planning' });
      } else if (/\.md$/i.test(target)) {
        passed.push({ path: target, form: w.form, reason: 'markdown' });
      } else {
        candidates.push({ path: target, form: w.form });
      }
    }
  }

  const tracked = candidates.length > 0 ? isTracked(unique(candidates.map((c) => c.path))) : new Set();
  const gated = unique(candidates.filter((c) => tracked.has(c.path)).map((c) => c.path));
  for (const c of candidates) {
    if (!tracked.has(c.path)) passed.push({ path: c.path, form: c.form, reason: 'untracked' });
  }

  return { writes, gated, passed };
}

/** The values `gates.bashEditGate` (and `gates.editGate`) may take. */
const VALID_BASH_MODES = new Set(['strict', 'warn', 'off']);

/**
 * What `gates.bashEditGate` means when it is unset or invalid.
 *
 * Set by TRD 60-06 from `recommendDefault(false_positive_rate)` of the
 * session-audit replay over every retained transcript. The evidence is
 * references/bash-edit-gate-evidence.json: 633/17957 = 0.035251 (an upper bound),
 * threshold 0.02, so the measured recommendation is warn. The agreement of this
 * constant, the evidence and recommendDefault is pinned by a test, so a new
 * measurement that supports strict must change all three together.
 */
const BASH_EDIT_GATE_DEFAULT = 'warn';

/** The highest false-positive rate at which the Bash rule may default to strict (GATE-05). */
const FP_THRESHOLD = 0.02;

/**
 * The default the measured false-positive rate supports: strict at or under
 * FP_THRESHOLD, otherwise warn. A rate that is not a finite number in [0, 1] is
 * no evidence, so it is warn.
 *
 * @param {number} rate
 * @returns {'strict'|'warn'}
 */
function recommendDefault(rate) {
  return Number.isFinite(rate) && rate >= 0 && rate <= FP_THRESHOLD ? 'strict' : 'warn';
}

/**
 * Reads `.planning/config.json` -> `gates.bashEditGate`. A valid mode comes back
 * verbatim; unset, invalid, a missing or malformed file and a null dir are all
 * null, which means "use BASH_EDIT_GATE_DEFAULT". gate-edits falls back to strict
 * for editGate because strict IS its default; falling back to the shipped default
 * is the same principle. Never throws.
 *
 * @param {string|null|undefined} planningDir
 * @returns {'strict'|'warn'|'off'|null}
 */
function readBashEditGate(planningDir) {
  try {
    if (!planningDir) return null;
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    const mode = config && config.gates && config.gates.bashEditGate;
    return VALID_BASH_MODES.has(mode) ? mode : null;
  } catch {
    // A config we cannot read says nothing, which means the shipped default.
    return null;
  }
}

const SEVERITY = { off: 0, warn: 1, strict: 2 };

/**
 * The mode the hook applies: the less severe of `gates.editGate` and
 * `gates.bashEditGate`. An editGate outside strict|warn|off counts as strict, as
 * in gate-edits. A bashEditGate that is null or invalid is BASH_EDIT_GATE_DEFAULT.
 *
 * @param {string|null|undefined} editGate
 * @param {string|null|undefined} bashEditGate
 * @returns {'strict'|'warn'|'off'}
 */
function effectiveBashMode(editGate, bashEditGate) {
  const edit = VALID_BASH_MODES.has(editGate) ? editGate : 'strict';
  const bash = VALID_BASH_MODES.has(bashEditGate) ? bashEditGate : BASH_EDIT_GATE_DEFAULT;
  return SEVERITY[edit] <= SEVERITY[bash] ? edit : bash;
}

/** What session-audit matches to count this text as its own category. */
const BASH_GATE_CLASSIFIER = /Bash write to tracked source (?:denied|needs approval)/;

/**
 * The deny (strict) or ask (warn) text for gated Bash writes. One line. Paths
 * are relative to the project root: the first three are listed, then `(+N more)`.
 *
 * @param {string[]} gatedAbs
 * @param {string} projectRoot
 * @param {'strict'|'warn'} mode
 * @returns {string}
 */
function bashGateReason(gatedAbs, projectRoot, mode) {
  const verb = mode === 'warn' ? 'needs approval' : 'denied';
  const rels = gatedAbs.map((abs) => path.relative(projectRoot, abs));
  const shown = rels.slice(0, 3).join(', ');
  const more = rels.length > 3 ? ` (+${rels.length - 3} more)` : '';
  return [
    `DevFlow ambient mode active — Bash write to tracked source ${verb}: ${shown}${more}.`,
    'Edit and Write are gated the same way.',
    'Route through a /devflow: skill (for a small fix, /devflow:quick or /devflow:micro).',
    'To bypass once, include "skip devflow" or "just edit" in your prompt.',
    'Never gated: .planning/, *.md, untracked files and paths outside the project.',
    'Severity: gates.bashEditGate (strict|warn|off) in .planning/config.json.',
  ].join(' ');
}

/**
 * realpath of the deepest existing ancestor plus the remaining segments, so a
 * path that does not exist yet still resolves the way its directory does (macOS
 * /var -> /private/var). The same algorithm as gate-edits.js, copied rather than
 * required: that file lives in hooks/, which is not mirrored to ~/.claude/devflow
 * with this lib.
 *
 * @param {string} p
 * @returns {string}
 */
function realpathDeep(p) {
  let cur = path.resolve(p);
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail);
    } catch {
      // keep walking up to the deepest ancestor that exists
    }
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p);
    tail.unshift(path.basename(cur));
    cur = parent;
  }
}

/**
 * Which of `absPaths` git tracks, as a Set of the paths as given. One
 * `git ls-files` for all of them.
 *
 * Each path is made relative to the project root after both are resolved through
 * realpathDeep, so `/var/...` and `/private/var/...` spellings agree. The
 * output is relative to the `-C` directory, not the repository top (no
 * `--full-name`), so a project nested below the repository top works.
 * `--literal-pathspecs` makes a name such as `src/[x].js` a name, not a glob.
 * A path outside the root, and an empty ask, never reach git.
 *
 * Fails open: a spawn error, a timeout or a non-zero exit (not a repository, no
 * such directory) is an empty set, so a gate that cannot ask git does not stop work.
 *
 * `env` exists for tests that must run git hermetically without changing
 * process.env; the hook never passes it.
 *
 * @param {string} root the project root, passed to `git -C` exactly as given
 * @param {string[]} absPaths
 * @param {{timeoutMs?: number, env?: NodeJS.ProcessEnv}} [opts]
 * @returns {Set<string>}
 */
function gitTrackedSet(root, absPaths, { timeoutMs = 2000, env } = {}) {
  const tracked = new Set();
  const base = realpathDeep(root);
  const byRel = new Map();
  for (const abs of absPaths) {
    const rel = path.relative(base, realpathDeep(abs));
    if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
    const name = rel.split(path.sep).join('/');
    byRel.set(name, [...(byRel.get(name) || []), abs]);
  }
  if (byRel.size === 0) return tracked;

  const r = spawnSync('git', ['--literal-pathspecs', '-C', root, 'ls-files', '-z', '--', ...byRel.keys()], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 << 20,
    env: { ...(env || process.env), GIT_OPTIONAL_LOCKS: '0' },
  });
  if (r.error || r.status !== 0) return tracked;

  for (const name of r.stdout.split('\0')) {
    for (const abs of byRel.get(name) || []) tracked.add(abs);
  }
  return tracked;
}

module.exports = {
  evaluateBashWrites,
  gitTrackedSet,
  realpathDeep,
  readBashEditGate,
  effectiveBashMode,
  recommendDefault,
  bashGateReason,
  BASH_GATE_CLASSIFIER,
  BASH_EDIT_GATE_DEFAULT,
  FP_THRESHOLD,
  VALID_BASH_MODES,
};
