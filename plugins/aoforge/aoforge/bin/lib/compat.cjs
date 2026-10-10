'use strict';

// One-release shim primitives for the rename to AOForge (objective 72, INST-03).
//
// Each primitive keeps one old surface working next to its new name:
//   - aliasLegacyEnv     the old environment-variable prefix is still honored
//   - planningDirName    a project's planning directory may be the new one or the legacy one
//   - findProjectRoot    a project root is a directory holding either planning directory,
//                        never $HOME (the walk stops there: TRD 73-09, gap G5)
//   - userHomeDir        $HOME as the hooks see it, read per call
//   - isUserHome         a directory is $HOME, in any symlinked form
//   - isOwnAgentType     gates treat both agent-type namespaces as their own (isOwnExecutor: the executor role)
//   - userDotFile        a file under the user's dot directory is read from the old
//                        location when the new one has none
//   - runtimeHome        the runtime mirror under ~/.claude, new and old
//
// The new name always wins: when both exist, the new one is used. Nothing here caches a
// result (a migration can move the planning directory mid-process, and tests and spawned
// hooks change HOME per process). The libraries under bin/ resolve their planning paths
// here (TRD 72-05); hooks and prose follow in 72-06.
//
// This module spells no old name. Every one is built from LEGACY in legacy-names.cjs,
// which is also where SHIM_REMOVAL records when the shims go (the release after 3.0.0).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NAMES, LEGACY } = require('./legacy-names.cjs');

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

function isFile(p, fsImpl) {
  const st = statOrNull(p, fsImpl);
  return st !== null && st.isFile();
}

// ─── environment ──────────────────────────────────────────────────────────────

/**
 * Copy each old-prefix variable to the new prefix when the new one is unset.
 * The new-prefix value wins when both are set. The old key is never deleted.
 *
 * @param {object} [env=process.env]
 * @returns {string[]} the sorted names that were set
 */
function aliasLegacyEnv(env = process.env) {
  const aliased = [];
  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY.envPrefix)) continue;
    const suffix = key.slice(LEGACY.envPrefix.length);
    if (suffix === '' || env[key] === undefined) continue;
    const target = NAMES.envPrefix + suffix;
    if (env[target] !== undefined) continue;
    env[target] = env[key];
    aliased.push(target);
  }
  return aliased.sort();
}

// ─── planning directory ───────────────────────────────────────────────────────

// Destructured so the literal-name source guard stays meaningful: a dotted access to the
// directory key would itself contain the legacy directory's spelling as a substring.
const { planningDir: NEW_PLAN_DIR } = NAMES;
const { planningDir: OLD_PLAN_DIR } = LEGACY;

function hasNewPlanDir(root, fsImpl) {
  return isDir(path.join(root, NEW_PLAN_DIR), fsImpl);
}

function hasOldPlanDir(root, fsImpl) {
  return isDir(path.join(root, OLD_PLAN_DIR), fsImpl);
}

/**
 * The name of a project's planning directory: the new one when it is a directory,
 * else the legacy one when that is a directory, else the new one (where a new
 * project is created).
 */
function planningDirName(root, fsImpl = fs) {
  if (hasNewPlanDir(root, fsImpl)) return NEW_PLAN_DIR;
  if (hasOldPlanDir(root, fsImpl)) return OLD_PLAN_DIR;
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

/** Both planning-directory names, the new one first: for exclusion lists, scans and attribute lines. */
const PLANNING_DIR_NAMES = Object.freeze([NEW_PLAN_DIR, OLD_PLAN_DIR]);

/** True for a path segment that names either planning directory. */
function isPlanningDirName(name) {
  return name === NEW_PLAN_DIR || name === OLD_PLAN_DIR;
}

/** The planning directory as a "not found" message names it, when there is none to resolve. */
function planningDirLabel() {
  return `${NEW_PLAN_DIR}/ (or legacy ${OLD_PLAN_DIR}/)`;
}

/** True only for a root that has the legacy planning directory and not the new one. */
function isLegacyPlanning(root, fsImpl = fs) {
  return !hasNewPlanDir(root, fsImpl) && hasOldPlanDir(root, fsImpl);
}

/** True when a root holds both planning directories (an unfinished migration). */
function bothPlanningDirs(root, fsImpl = fs) {
  return hasNewPlanDir(root, fsImpl) && hasOldPlanDir(root, fsImpl);
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
 * The nearest directory, from `start` upward, that holds either planning directory.
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
    if (hasNewPlanDir(dir, fsImpl) || hasOldPlanDir(dir, fsImpl)) {
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
 * True for an agent type in either namespace with a non-empty agent name. The exact, case-sensitive prefix is
 * required: `x:<ns>:y`, an upper-case namespace and a bare namespace are all rejected (gate-edits trusted only a
 * non-empty name before the shim, TRD 72-10).
 */
function isOwnAgentType(t) {
  if (typeof t !== 'string') return false;
  for (const ns of [NAMES.agentNs, LEGACY.agentNs]) {
    if (t.startsWith(ns) && t.length > ns.length) return true;
  }
  return false;
}

const EXECUTOR_AGENT = 'executor';

/**
 * The executor in either namespace (`<ns>executor` exactly): what verify-commits and gate-executor-stop act on
 * (TRD 72-10).
 */
function isOwnExecutor(t) {
  return isOwnAgentType(t) && (t === NAMES.agentNs + EXECUTOR_AGENT || t === LEGACY.agentNs + EXECUTOR_AGENT);
}

// ─── user dot directory and runtime home ──────────────────────────────────────

/**
 * Path of a file under the user's dot directory: the new location when the file
 * exists there, else the old one when it exists there, else the new location.
 * `legacyName` is the file's name under the old directory when the name itself was
 * renamed too (the watch daemon's files); it defaults to `name`. A read-path resolver
 * only: a writer joins the new directory itself and never writes the old one.
 */
function userDotFile(home, name, fsImpl = fs, legacyName = name) {
  const current = path.join(home, NAMES.userDotDir, name);
  if (isFile(current, fsImpl)) return current;
  const legacy = path.join(home, LEGACY.userDotDir, legacyName);
  if (isFile(legacy, fsImpl)) return legacy;
  return current;
}

function runtimeHome(home) {
  return path.join(home, '.claude', NAMES.runtimeDir);
}

function legacyRuntimeHome(home) {
  return path.join(home, '.claude', LEGACY.runtimeDir);
}

module.exports = {
  aliasLegacyEnv,
  planningDirName,
  planningRoot,
  planningRel,
  PLANNING_DIR_NAMES,
  isPlanningDirName,
  planningDirLabel,
  isLegacyPlanning,
  bothPlanningDirs,
  findProjectRoot,
  userHomeDir,
  isUserHome,
  isOwnAgentType,
  isOwnExecutor,
  userDotFile,
  runtimeHome,
  legacyRuntimeHome,
};
