'use strict';

// repo-state.cjs — the one project-state detector (objective 37, ADP-01).
// state: 'devflow' | 'greenfield' | 'brownfield' | 'scratch'. Pure classify(); IO in collectSignals().
//
// This is the detector the three existing heuristics (project-state.cjs, brownfield-detector.cjs,
// init.cjs:597-622) delegate to as of 37-04. `userHome` is injected everywhere — this module never
// calls `os.homedir()`, so a caller with `userHome: null` gets org-profile markers and the
// `~/Downloads` scratch rule turned off rather than falling back to the real home.
//
// 37-04: MANIFEST_LANG/detectManifest/gitAgeDays moved here (verbatim) from project-state.cjs,
// inverting the dependency so project-state.cjs now requires this module instead of the reverse
// (37-01 had it backwards to avoid ordering the two TRDs). project-state.cjs re-exports both.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
 * Locked manifest→language mapping (moved verbatim from project-state.cjs, 37-04).
 * Order matters: first match wins. package.json checked first.
 */
const MANIFEST_LANG = [
  ['package.json',   'javascript'],  // refined to 'typescript' when tsconfig.json present
  ['Cargo.toml',     'rust'],
  ['pyproject.toml', 'python'],
  ['go.mod',         'go'],
  ['Gemfile',        'ruby'],
  ['pom.xml',        'java'],
  // 35-09 additions — APPENDED after the original six so first-match order (and therefore
  // every pre-existing detector result) for existing repos is unchanged.
  ['pubspec.yaml',        'dart'],
  ['build.gradle.kts',    'kotlin'],
  ['settings.gradle.kts', 'kotlin'],
  ['build.gradle',        'java'],
  ['Package.swift',       'swift'],
];

/**
 * Detect the primary language from manifest files in the project root.
 * First match wins (per MANIFEST_LANG order).
 *
 * Special case: package.json + tsconfig.json → 'typescript' (not 'javascript').
 *
 * 35-09: when no built-in manifest matches, falls back to the union of installed org
 * profiles' `detect` markers (via stack-profile's `detectMarkers`/`matchMarkersAt`) — the
 * first matching marker's `languages[0]` (or its `profile` id when `languages` is empty)
 * becomes `primary_lang`. `[]` when `userHome` is null, so this is a no-op without it.
 * Lazy `require` avoids a load cycle with stack-profile.cjs.
 *
 * @param {string} rootDir - absolute path to the project root
 * @param {{userHome?: string|null}} [opts]
 * @returns {{ has_manifest: boolean, primary_lang: string|null }}
 */
function detectManifest(rootDir, { userHome = null } = {}) {
  for (const [filename, lang] of MANIFEST_LANG) {
    if (fs.existsSync(path.join(rootDir, filename))) {
      // Refine package.json → 'typescript' when tsconfig.json is also present
      if (filename === 'package.json' && fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
        return { has_manifest: true, primary_lang: 'typescript' };
      }
      return { has_manifest: true, primary_lang: lang };
    }
  }
  const { detectMarkers, matchMarkersAt } = require('./stack-profile.cjs');
  const matched = matchMarkersAt(rootDir, detectMarkers({ userHome }));
  if (matched.length) {
    const m = matched[0];
    return { has_manifest: true, primary_lang: m.languages[0] || m.profile };
  }
  return { has_manifest: false, primary_lang: null };
}

/**
 * Compute the number of days since the first git commit in the repo at cwd.
 * Returns null when: no git binary, not a git repo, no commits, or timeout (2s hard limit).
 * Moved verbatim from project-state.cjs, 37-04.
 *
 * @param {string} cwd - absolute path to the git repository root
 * @returns {number|null}
 */
function gitAgeDays(cwd) {
  try {
    const r = spawnSync('git', ['log', '--reverse', '--format=%ct', '-n', '1'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (r.error || r.status !== 0) return null;

    const firstCommitUnix = parseInt(r.stdout.trim(), 10);
    if (isNaN(firstCommitUnix)) return null;

    const nowUnix = Math.floor(Date.now() / 1000);
    return Math.floor((nowUnix - firstCommitUnix) / 86400);
  } catch {
    // ENOENT (no git binary), permission errors, etc.
    return null;
  }
}

/**
 * isScratchDir(absPath, { userHome, prefixes, downloadsHome }) -> boolean
 *
 * Checks the path AS PROVIDED (no realpath resolution) — matches project-state.cjs's own rule,
 * which 37-04's parity test depends on. `userHome: null` turns the `~/Downloads` rule off instead
 * of falling back to `os.homedir()`.
 *
 * `downloadsHome` (37-04) is the home used ONLY for the `~/Downloads` join; it defaults to
 * `userHome` so every existing caller (repo-state.test.cjs, detectRepoState with a single
 * `userHome` option) is unaffected. project-state.cjs's adapter passes `downloadsHome:
 * os.homedir()` explicitly so `getProjectState`'s scratch/substantive computation keeps its
 * legacy behaviour of always consulting the real home for the Downloads rule, even when its own
 * `userHome` (which only ever fed the org-marker manifest fallback) is null.
 */
function isScratchDir(absPath, { userHome = null, prefixes = DEFAULT_SCRATCH_PREFIXES, downloadsHome = userHome } = {}) {
  for (const prefix of prefixes) {
    if (absPath.startsWith(prefix)) return true;
  }

  if (downloadsHome) {
    const homeDownloads = path.join(downloadsHome, 'Downloads');
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
 * collectSignals(root, { userHome, scratchPrefixes, downloadsHome }) -> signals
 *
 * IO half of the detector. `scratchPrefixes` defaults to DEFAULT_SCRATCH_PREFIXES — tests that
 * expect `brownfield` on a fixture living under `os.tmpdir()` (which is itself under
 * `/var/folders/` on macOS) must pass `scratchPrefixes: []` explicitly.
 */
function collectSignals(root, { userHome = null, scratchPrefixes = DEFAULT_SCRATCH_PREFIXES, downloadsHome = userHome } = {}) {
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
  const is_scratch_dir = isScratchDir(root, { userHome, prefixes: scratchPrefixes, downloadsHome });

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
 * opts: { userHome, scratchPrefixes, downloadsHome, mapThreshold } — forwarded to
 * collectSignals/derive.
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
  MANIFEST_LANG,
  detectManifest,
  gitAgeDays,
  isScratchDir,
  countSourceFiles,
  collectSignals,
  classify,
  derive,
  detectRepoState,
};
