'use strict';

/**
 * project-state.cjs — Project substantiveness detection for DevFlow auto-init (Phase C, C1)
 *
 * Implements `df-tools project-state [<cwd>]`:
 * - Pure logic helpers (isSubstantive, isScratchDir, detectManifest, countSourceFiles, gitAgeDays)
 * - I/O assembly (getProjectState)
 * - CLI entry (cmdProjectState)
 *
 * Output schema (locked per #28, `state` added by 37-04):
 * {
 *   "has_planning":       boolean,   — .planning/ exists
 *   "has_git":            boolean,   — .git/ exists
 *   "git_age_days":       number|null, — days since first commit; null = no git history
 *   "code_files":         number,    — source files (excluding node_modules/.git/.planning etc.)
 *   "primary_lang":       string|null, — detected from manifest file
 *   "is_substantive":     boolean,   — ((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir
 *   "previously_declined": boolean,  — user declined DevFlow init for this cwd
 *   "decline_expires":    string|null — ISO 8601 expiry timestamp or null
 *   "state":              'devflow'|'greenfield'|'brownfield'|'scratch' — 37-04, from repo-state.cjs
 * }
 *
 * Substantive heuristic (locked per #28 + 17-CONTEXT §"Locked decisions"):
 *   is_substantive = ((git_age_days > 7) OR (code_files > 10))
 *                    AND has_manifest
 *                    AND NOT is_scratch_dir
 *
 * Phase C integration: classify-session.js (17-03) consumes getProjectState() JSON
 * to decide between init-offer mode and skip mode for non-DevFlow projects.
 *
 * 37-04 (ADP-01): this module is now a thin adapter over repo-state.cjs's `detectRepoState` —
 * the one detector shared with brownfield-detector.cjs and init.cjs. `detectManifest`,
 * `gitAgeDays` and `countSourceFiles` are re-exported straight from repo-state.cjs (same function
 * objects); only `isScratchDir` is a wrapper (it defaults `userHome` to `os.homedir()` here, to
 * preserve this module's historical single-argument public signature and behaviour).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');
const { readDecline } = require('./decline-tracker.cjs');

const repoState = require('./repo-state.cjs');
const { detectManifest, gitAgeDays, countSourceFiles } = repoState;

// ─── Pure functions (testable without filesystem) ─────────────────────────────

/**
 * Determine if the given absolute path is a scratch/ephemeral directory.
 * Scratch dirs are excluded from the substantiveness heuristic.
 *
 * Scratch prefixes (locked per #28):
 *   - /tmp/... (Linux + macOS Linux compat)
 *   - /var/folders/... (macOS default os.tmpdir())
 *   - ~/Downloads/... (resolved via os.homedir() + '/Downloads')
 *
 * GOTCHA: /tmp on macOS is a symlink to /private/tmp. We check the path AS PROVIDED
 * (no realpath resolution) — tests should use the same form.
 *
 * 37-04: delegates to repo-state.cjs's `isScratchDir`, passing `os.homedir()` as both `userHome`
 * and (implicitly, since `downloadsHome` defaults to it) the Downloads-join home — this keeps
 * the module's original single-argument, always-real-home behaviour unchanged.
 *
 * @param {string} absPath - absolute path to check (not normalized via realpath)
 * @returns {boolean}
 */
function isScratchDir(absPath) {
  return repoState.isScratchDir(absPath, { userHome: os.homedir() });
}

/**
 * Evaluate the substantiveness heuristic from already-evaluated inputs.
 * No filesystem I/O — takes pre-computed values.
 *
 * Heuristic (locked per #28):
 *   is_substantive = ((git_age_days > 7) OR (code_files > 10))
 *                    AND has_manifest
 *                    AND NOT is_scratch_dir
 *
 * Kept as a standalone pure function (37-04 does not migrate it) — `getProjectState` no longer
 * calls it directly (it takes `is_substantive` from repo-state's `derive()`, which reproduces
 * this exact formula), but it remains exported for direct callers/tests.
 *
 * @param {object} opts
 * @param {number|null} opts.git_age_days  - days since first commit; null treated as 0 (not age-substantive)
 * @param {number}      opts.code_files    - source file count
 * @param {boolean}     opts.has_manifest  - manifest file detected
 * @param {boolean}     opts.is_scratch_dir - is a scratch/ephemeral directory
 * @returns {boolean}
 */
function isSubstantive({ git_age_days, code_files, has_manifest, is_scratch_dir }) {
  // Guard: scratch dirs are never substantive
  if (is_scratch_dir) return false;

  // Guard: no manifest → not a recognized project
  if (!has_manifest) return false;

  // Heuristic: at least one of (old enough git history OR enough source files)
  // git_age_days = null means no commits → null > 7 is false in JS → treat as 0
  const ageOk = (git_age_days !== null && git_age_days > 7);
  const filesOk = (code_files > 10);

  return ageOk || filesOk;
}

// ─── I/O wrappers ────────────────────────────────────────────────────────────

/**
 * Assemble the full project state for the given directory.
 * Composes repo-state.cjs's detector + decline tracking.
 *
 * @param {string} cwd - absolute path to the project directory
 * @param {object} [opts]
 * @param {string} [opts.now] - ISO 8601 timestamp for decline expiry check (default: current time)
 * @param {string|null} [opts.userHome] - org profile home for detectManifest's marker fallback
 * @returns {{
 *   has_planning: boolean,
 *   has_git: boolean,
 *   git_age_days: number|null,
 *   code_files: number,
 *   primary_lang: string|null,
 *   is_substantive: boolean,
 *   previously_declined: boolean,
 *   decline_expires: string|null,
 *   state: 'devflow'|'greenfield'|'brownfield'|'scratch'
 * }}
 */
function getProjectState(cwd, { now = new Date().toISOString(), userHome = null } = {}) {
  const root = path.resolve(cwd);

  // 37-04: one detector call replaces the has_planning/has_git/code_files/detectManifest/
  // isScratchDir assembly. `downloadsHome: os.homedir()` keeps the ~/Downloads scratch rule
  // always consulting the real home (this module's historical behaviour), independent of
  // `userHome` (which only ever drove detectManifest's org-marker fallback).
  const { state, signals, derived } = repoState.detectRepoState(root, {
    userHome,
    downloadsHome: os.homedir(),
  });

  // Decline tracking (from 17-02 decline-tracker)
  let decline = { declined: false, expires_at: null };
  try {
    decline = readDecline(root, { now });
  } catch (e) {
    // fail-open: decline tracking is best-effort; don't crash the whole command
    process.stderr.write(`[project-state] decline read failed: ${e.message}\n`);
  }

  return {
    has_planning: signals.has_planning,
    has_git: signals.has_git,
    git_age_days: signals.git_age_days,
    code_files: signals.code_files,
    primary_lang: signals.primary_lang,
    is_substantive: derived.is_substantive,
    previously_declined: decline.declined,
    decline_expires: decline.expires_at,
    state,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools project-state [<cwd>] [--raw]`
 *
 * @param {string} cwd       - process.cwd() (default root for resolution)
 * @param {string} targetCwd - optional override path (args[1] from CLI)
 * @param {boolean} raw      - --raw flag (true = compact JSON, false = pretty JSON)
 */
function cmdProjectState(cwd, targetCwd, raw) {
  const root = targetCwd ? path.resolve(targetCwd) : cwd;

  if (!fs.existsSync(root)) {
    process.stderr.write(`Error: cwd not found: ${root}\n`);
    process.exit(1);
    return; // unreachable — process.exit throws in test harness
  }

  const state = getProjectState(root, { userHome: os.homedir() });
  output(state, raw, JSON.stringify(state));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  isSubstantive,
  isScratchDir,
  detectManifest,
  countSourceFiles,
  gitAgeDays,
  getProjectState,
  cmdProjectState,
};
