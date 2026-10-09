'use strict';

// One-release shim primitives for the rename to AOForge (objective 72, INST-03).
//
// Each primitive keeps one old surface working next to its new name:
//   - aliasLegacyEnv     the old environment-variable prefix is still honored
//   - planningDirName    a project's planning directory may be the new one or the legacy one
//   - findProjectRoot    a project root is a directory holding either planning directory
//   - isOwnAgentType     gates treat both agent-type namespaces as their own (isOwnExecutor: the executor role)
//   - userDotFile        a file under the user's dot directory is read from the old
//                        location when the new one has none
//   - runtimeHome        the runtime mirror under ~/.claude, new and old
//
// The new name always wins: when both exist, the new one is used. Nothing here caches a
// result (a migration can move the planning directory mid-process). The libraries under
// bin/ resolve their planning paths here (TRD 72-05); hooks and prose follow in 72-06.
//
// This module spells no old name. Every one is built from LEGACY in legacy-names.cjs,
// which is also where SHIM_REMOVAL records when the shims go (the release after 3.0.0).

const fs = require('fs');
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

/**
 * The nearest directory, from `start` upward, that holds either planning directory.
 * `maxUp` bounds how many parents are inspected after `start`.
 *
 * @returns {string|null}
 */
function findProjectRoot(start, { fsImpl = fs, maxUp = 64 } = {}) {
  let dir = path.resolve(start);
  for (let i = 0; i <= maxUp; i++) {
    if (hasNewPlanDir(dir, fsImpl) || hasOldPlanDir(dir, fsImpl)) return dir;
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
  isOwnAgentType,
  isOwnExecutor,
  userDotFile,
  runtimeHome,
  legacyRuntimeHome,
};
