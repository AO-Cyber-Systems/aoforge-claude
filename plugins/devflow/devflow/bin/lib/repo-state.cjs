'use strict';

// repo-state.cjs — the one project-state detector (objective 37, ADP-01).
// state: 'devflow' | 'greenfield' | 'brownfield' | 'scratch'. Pure classify(); IO in collectSignals().
//
// This is the detector the three existing heuristics (project-state.cjs, brownfield-detector.cjs,
// init.cjs:597-622) delegate to as of 37-04. `userHome` is injected everywhere — this module never
// calls `os.homedir()`, so a caller with `userHome: null` gets org-profile markers and the
// `~/Downloads` scratch rule turned off rather than falling back to the real home.

const fs = require('fs');
const path = require('path');

const { detectManifest, gitAgeDays } = require('./project-state.cjs');

const STATES = Object.freeze(['devflow', 'greenfield', 'brownfield', 'scratch']);

const DEFAULT_SCRATCH_PREFIXES = Object.freeze(['/tmp/', '/var/folders/']);

// Moved-by-copy (verbatim) from project-state.cjs :174-193 — kept here too, rather than required,
// so 37-04 can invert project-state.cjs's dependency onto this module without a load cycle.
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.planning',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
]);

const EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.py', '.go', '.rs', '.rb', '.java',
  '.dart', '.kt', '.kts', '.swift',
]);

/**
 * isScratchDir(absPath, { userHome, prefixes }) -> boolean
 *
 * Checks the path AS PROVIDED (no realpath resolution) — matches project-state.cjs's own rule,
 * which 37-04's parity test depends on. `userHome: null` turns the `~/Downloads` rule off instead
 * of falling back to `os.homedir()`.
 */
function isScratchDir(absPath, { userHome = null, prefixes = DEFAULT_SCRATCH_PREFIXES } = {}) {
  for (const prefix of prefixes) {
    if (absPath.startsWith(prefix)) return true;
  }

  if (userHome) {
    const homeDownloads = path.join(userHome, 'Downloads');
    if (absPath === homeDownloads || absPath.startsWith(homeDownloads + path.sep)) {
      return true;
    }
  }

  return false;
}

/**
 * countSourceFiles(root, { extraExts }) -> number
 *
 * Mirrors brownfield-detector.cjs:countSourceFiles exactly, including its `extraExts` (35-09 org
 * `*.ext` markers) extension. Dotdirs (`.git`, `.dart_tool`, `.vscode`, ...) are skipped generically
 * by name — only EXCLUDE's named dirs need an explicit entry.
 */
function countSourceFiles(root, { extraExts = [] } = {}) {
  const extSet = extraExts.length ? new Set([...EXTS, ...extraExts]) : EXTS;
  let count = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // ENOENT, EACCES, etc. — skip this directory, continue walk
      return;
    }

    for (const e of entries) {
      if (EXCLUDE.has(e.name)) continue;
      if (e.isDirectory() && e.name.startsWith('.')) continue;

      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && extSet.has(path.extname(e.name))) {
        count++;
      }
      // Symlinks: isDirectory() and isFile() both false → ignored, no circular following.
    }
  }

  walk(root);
  return count;
}

/**
 * collectSignals(root, { userHome, scratchPrefixes }) -> signals
 *
 * IO half of the detector. `scratchPrefixes` defaults to DEFAULT_SCRATCH_PREFIXES — tests that
 * expect `brownfield` on a fixture living under `os.tmpdir()` (which is itself under
 * `/var/folders/` on macOS) must pass `scratchPrefixes: []` explicitly.
 */
function collectSignals(root, { userHome = null, scratchPrefixes = DEFAULT_SCRATCH_PREFIXES } = {}) {
  const has_planning = fs.existsSync(path.join(root, '.planning'));
  const has_codebase_map = fs.existsSync(path.join(root, '.planning', 'codebase'));
  const has_git = fs.existsSync(path.join(root, '.git'));

  const { has_manifest, primary_lang } = detectManifest(root, { userHome });

  // Org `*.ext` detect markers extend the counted extension set (35-09 parity). `[]` when
  // userHome is null, via stack-profile's own listOrgProfiles contract. Lazy require avoids a
  // load cycle (project-state.cjs already lazy-requires stack-profile.cjs at load time).
  let extraExts = [];
  if (userHome) {
    const { detectMarkers, matchMarkersAt } = require('./stack-profile.cjs');
    const matched = matchMarkersAt(root, detectMarkers({ userHome }));
    extraExts = matched
      .map((m) => m.marker)
      .filter((marker) => typeof marker === 'string' && marker.startsWith('*.'))
      .map((marker) => marker.slice(1));
  }

  const code_files = countSourceFiles(root, { extraExts });
  const git_age_days = has_git ? gitAgeDays(root) : null;
  const is_scratch_dir = isScratchDir(root, { userHome, prefixes: scratchPrefixes });

  return {
    has_planning,
    has_codebase_map,
    has_git,
    git_age_days,
    code_files,
    has_manifest,
    primary_lang,
    is_scratch_dir,
  };
}

/**
 * classify(signals) -> 'devflow' | 'greenfield' | 'brownfield' | 'scratch'
 *
 * Pure and total. Precedence: devflow outranks everything; greenfield outranks scratch;
 * brownfield is the default.
 */
function classify(signals) {
  const { has_planning, code_files, has_manifest, is_scratch_dir } = signals;

  if (has_planning) return 'devflow';
  if (code_files === 0 && !has_manifest) return 'greenfield';
  if (is_scratch_dir) return 'scratch';
  return 'brownfield';
}

/**
 * derive(signals, { mapThreshold }) -> { is_substantive, has_code_or_manifest, should_offer_map }
 *
 * Pure. Reproduces the two legacy formulas exactly:
 *   is_substantive     = ((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir
 *   should_offer_map   = has_planning AND NOT has_codebase_map AND code_files >= threshold (default 50)
 */
function derive(signals, { mapThreshold = 50 } = {}) {
  const { git_age_days, code_files, has_manifest, is_scratch_dir, has_planning, has_codebase_map } = signals;

  const ageOk = git_age_days !== null && git_age_days !== undefined && git_age_days > 7;
  const filesOk = code_files > 10;
  const is_substantive = (ageOk || filesOk) && !!has_manifest && !is_scratch_dir;

  const has_code_or_manifest = code_files > 0 || !!has_manifest;

  const should_offer_map = !!has_planning && !has_codebase_map && code_files >= mapThreshold;

  return { is_substantive, has_code_or_manifest, should_offer_map };
}

/**
 * detectRepoState(root, opts) -> { state, signals, derived }
 *
 * opts: { userHome, scratchPrefixes, mapThreshold } — forwarded to collectSignals/derive.
 */
function detectRepoState(root, opts = {}) {
  const signals = collectSignals(root, opts);
  return {
    state: classify(signals),
    signals,
    derived: derive(signals, opts),
  };
}

module.exports = {
  STATES,
  DEFAULT_SCRATCH_PREFIXES,
  EXCLUDE,
  EXTS,
  isScratchDir,
  countSourceFiles,
  collectSignals,
  classify,
  derive,
  detectRepoState,
};
