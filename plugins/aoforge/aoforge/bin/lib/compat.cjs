'use strict';

// compat.cjs — where AOForge names its planning directory, project root, $HOME, agent types and
// user files. Every library under bin/ and every hook resolves these here (TRDs 72-05, 72-06).
//
//   - planningDirName    a project's planning directory: always `.aoforge`
//   - planningRoot / planningRel / PLANNING_DIR_NAMES / isPlanningDirName / planningDirLabel
//                        the same name as an absolute path, a posix relative path, a list,
//                        a segment test and a "not found" label
//   - findProjectRoot    a project root is a directory holding `.aoforge/`, never $HOME (the
//                        walk stops there: TRD 73-09, gap G5)
//   - userHomeDir        $HOME as the hooks see it, read per call
//   - isUserHome         a directory is $HOME, in any symlinked form
//   - isOwnAgentType     an agent type in the `aoforge:` namespace (isOwnExecutor: the executor role)
//   - userDotFile        a file AOForge keeps for the user, in the runtime home only (TRD 73-11)
//   - runtimeHome        the runtime mirror, ~/.claude/aoforge
//   - watchStateDir      the watch daemon's runtime directory under the runtime home
//
// Why the name stays `compat.cjs`: until AOForge 3.1.0 this module held the one-release shims of
// the rename (objective 72): a legacy planning directory, the pre-rename agent namespace, the
// pre-rename and 3.0.0 user dot directories and the pre-rename environment prefix were read beside
// the new names. Objective 78 removed them (TRD 78-11 the readers, TRD 78-12 the environment alias);
// the module keeps its name and every surviving signature because ~80 modules and every hook import
// it, and renaming it would only multiply conflicts with `main`. Detecting a pre-rename layout to
// REPORT it is planning-layout.cjs's job, never this module's.
//
// Nothing here caches a result: tests and spawned hooks change HOME per process. This module
// spells no old name and requires nothing from legacy-names.cjs (TRD 78-12): the three current names
// it needs are held below, and compat.legacy.test.cjs (16c) pins them equal to NAMES there.

const fs = require('fs');
const os = require('os');
const path = require('path');

// The current names this module resolves: the planning directory, the agent namespace and the runtime directory
// (the planningDir, agentNs and runtimeDir keys of NAMES; written as key names, never as dotted access, because a
// dotted access to the directory key would contain the legacy directory's spelling and trip test 16).
const NEW_PLAN_DIR = '.aoforge';
const AGENT_NS = 'aoforge:';
const RUNTIME_DIR = 'aoforge';

// ─── stat helpers ─────────────────────────────────────────────────────────────

/**
 * stat that reports absence as null. A path below a non-directory (ENOTDIR) is
 * absence too; any other error propagates.
 */
function statOrNull(p, fsImpl) {
  try {
    return fsImpl.statSync(p, { throwIfNoEntry: false }) || null;
  } catch (err) {
    if (err && err.code === 'ENOTDIR') return null;
    throw err;
  }
}

function isDir(p, fsImpl) {
  const st = statOrNull(p, fsImpl);
  return st !== null && st.isDirectory();
}

// ─── planning directory ───────────────────────────────────────────────────────

function hasNewPlanDir(root, fsImpl) {
  return isDir(path.join(root, NEW_PLAN_DIR), fsImpl);
}

/**
 * The name of a project's planning directory: always `.aoforge`. `root` and `fsImpl` are kept
 * so every caller's signature stays (TRD 78-11): nothing is read from the disk.
 */
function planningDirName(root, fsImpl = fs) {
  return NEW_PLAN_DIR;
}

function planningRoot(root, fsImpl = fs) {
  return path.join(root, planningDirName(root, fsImpl));
}

/**
 * A path inside the root's planning directory, relative to the root and in posix form: what git pathspecs,
 * `--files` lists and JSON output name. `planningRel(root)` is the directory name itself.
 */
function planningRel(root, ...segments) {
  return path.posix.join(planningDirName(root), ...segments.flatMap((s) => String(s).split(/[\\/]+/)));
}

/** The planning-directory name as a list (`['.aoforge']`): for exclusion lists, scans and attribute lines. */
const PLANNING_DIR_NAMES = Object.freeze([NEW_PLAN_DIR]);

/** True for a path segment that names the planning directory. */
function isPlanningDirName(name) {
  return name === NEW_PLAN_DIR;
}

/** The planning directory as a "not found" message names it, when there is none to resolve. */
function planningDirLabel() {
  return `${NEW_PLAN_DIR}/`;
}

// ─── $HOME ────────────────────────────────────────────────────────────────────

/**
 * $HOME as the hooks see it, read on every call (tests and spawned hooks set HOME per
 * process): `env.HOME` when it is a non-empty string, else `os.homedir()`, else ''.
 * '' means "no home": nothing is $HOME and no walk stops.
 *
 * @param {object} [env=process.env]
 * @returns {string}
 */
function userHomeDir(env = process.env) {
  if (env && typeof env.HOME === 'string' && env.HOME !== '') return env.HOME;
  try {
    return os.homedir() || '';
  } catch {
    return '';
  }
}

/** realpath of `p`, or `p` itself when it cannot be resolved (or the injected fs has no realpathSync). */
function realOr(p, fsImpl) {
  if (typeof fsImpl.realpathSync !== 'function') return p;
  try {
    return fsImpl.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * One matcher per walk, with two checks of different cost:
 *   stopsAt(dir)  runs on EVERY directory of a walk: the exact resolved path, or (only when
 *                 the basename equals home's) a realpath comparison. An ordinary walk costs
 *                 no extra syscalls.
 *   isHome(dir)   runs only on a CANDIDATE, a directory found to hold a planning directory,
 *                 right before it would be returned: the exact path, else realpath(dir) ===
 *                 realpath(home). One realpath per candidate, so a home reached under another
 *                 name (`<base>/link -> <base>/real`) is still refused.
 * home's own realpath is computed lazily, at most once per matcher, and shared by both.
 * An empty or non-string home matches nothing.
 */
function homeMatcher(home, fsImpl) {
  if (typeof home !== 'string' || home === '') return { stopsAt: () => false, isHome: () => false };
  const resolved = path.resolve(home);
  const base = path.basename(resolved);
  let real;
  const homeReal = () => (real === undefined ? (real = realOr(resolved, fsImpl)) : real);
  return {
    stopsAt: (dir) => dir === resolved || (path.basename(dir) === base && realOr(dir, fsImpl) === homeReal()),
    isHome: (dir) => dir === resolved || realOr(dir, fsImpl) === homeReal(),
  };
}

/**
 * True when `dir` is the user's home directory, in any symlinked form and under any name.
 * One realpath of `dir` (plus one of home) when the paths are not already equal.
 *
 * @param {string} dir
 * @param {object} [opts]
 * @param {string} [opts.home=userHomeDir()] '' means no home: always false
 * @param {object} [opts.fsImpl=fs]
 * @returns {boolean}
 */
function isUserHome(dir, { home = userHomeDir(), fsImpl = fs } = {}) {
  if (typeof dir !== 'string' || dir === '') return false;
  return homeMatcher(home, fsImpl).isHome(path.resolve(dir));
}

/**
 * The nearest directory, from `start` upward, that holds `.aoforge/`. A directory holding only the
 * pre-rename planning directory is not a project (TRD 78-11): the walk passes it by.
 * `maxUp` bounds how many parents are inspected after `start`.
 *
 * $HOME is never a project root, and nothing above it is searched (TRD 73-09, gap G5): the
 * user's dot directory has the planning directory's name, so `~/.aoforge/` (the watcher's
 * log and pid file) would otherwise make every repository below $HOME a project. A walk
 * that reaches $HOME returns null. A start outside $HOME walks to the filesystem root as
 * before; `home: ''` (no home) disables the stop.
 *
 * @param {string} start
 * @param {object} [opts]
 * @param {object} [opts.fsImpl=fs]
 * @param {number} [opts.maxUp=64]
 * @param {string} [opts.home=userHomeDir()] read per call, never cached
 * @returns {string|null}
 */
function findProjectRoot(start, { fsImpl = fs, maxUp = 64, home = userHomeDir() } = {}) {
  const atHome = homeMatcher(home, fsImpl);
  let dir = path.resolve(start);
  for (let i = 0; i <= maxUp; i++) {
    // CRITICAL: $HOME is never a project root, and nothing above it is searched (G5, objective 73).
    if (atHome.stopsAt(dir)) return null;
    if (hasNewPlanDir(dir, fsImpl)) {
      // GOTCHA: the stop check misses a home whose symlinked name differs; the candidate check
      // catches it. A candidate that IS $HOME ends the walk: it never continues above $HOME.
      return atHome.isHome(dir) ? null : dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

// ─── agents ───────────────────────────────────────────────────────────────────

/**
 * True for an agent type in the `aoforge:` namespace with a non-empty agent name. The exact, case-sensitive prefix
 * is required: `x:<ns>:y`, an upper-case namespace and a bare namespace are all rejected (TRD 72-10). The
 * pre-rename namespace is not ours (TRD 78-11).
 */
function isOwnAgentType(t) {
  if (typeof t !== 'string') return false;
  return t.startsWith(AGENT_NS) && t.length > AGENT_NS.length;
}

const EXECUTOR_AGENT = 'executor';

/** `aoforge:executor` exactly: what verify-commits and gate-executor-stop act on (TRD 72-10). */
function isOwnExecutor(t) {
  return isOwnAgentType(t) && t === AGENT_NS + EXECUTOR_AGENT;
}

// ─── user files and runtime home ──────────────────────────────────────────────

/** The runtime mirror and the home of every file AOForge keeps for the user: <home>/.claude/aoforge. */
function runtimeHome(home) {
  return path.join(home, '.claude', RUNTIME_DIR);
}

/**
 * Path of a file AOForge keeps for the user (defaults.json, the Brave API key, the watch allowlist):
 * <home>/.claude/aoforge/<name>, the runtime home (TRD 73-11). There is no fallback (TRD 78-11): a copy left in
 * ~/.aoforge/ by AOForge 3.0.0 or in the pre-rename dot directory is not read; doctor check 17 moves 3.0.0's files
 * into the runtime home on request. A path builder only: nothing is read, created, copied or moved.
 */
function userDotFile(home, name) {
  return path.join(runtimeHome(home), name);
}

/** The watch daemon's runtime directory (pid, log, service logs): <home>/.claude/aoforge/state/watch (TRD 73-11). */
function watchStateDir(home) {
  return path.join(runtimeHome(home), 'state', 'watch');
}

module.exports = {
  planningDirName,
  planningRoot,
  planningRel,
  PLANNING_DIR_NAMES,
  isPlanningDirName,
  planningDirLabel,
  findProjectRoot,
  userHomeDir,
  isUserHome,
  isOwnAgentType,
  isOwnExecutor,
  userDotFile,
  runtimeHome,
  watchStateDir,
};
