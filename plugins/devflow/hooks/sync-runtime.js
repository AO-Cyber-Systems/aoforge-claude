#!/usr/bin/env node
// Mirror plugin-bundled devflow runtime to ~/.claude/devflow/.
// Skills and agents reference @~/.claude/devflow/* paths which are not
// interpolated against ${CLAUDE_PLUGIN_ROOT}, so the runtime is mirrored
// to the home location on each session start when the bundled plugin is
// newer (never downgrades — Quick 21).
//
// Design (TRD 23-01):
//  - Atomic per-subdirectory swap via temp dir + fs.renameSync (POSIX-atomic)
//  - Exclusion filter: *.test.cjs, *.test.js, __fixtures__/ never mirrored
//  - Content sentinel: early-exit requires bin/df-tools.cjs present (not just targetDir)
//  - .plugin-version written ONLY after ALL four subdir swaps succeed
//  - On any error: stderr warning, best-effort tmp cleanup, exit 0 (retry next session)
//  - After a good mirror, runs the bundled global upgrade (TRD 36-06); failure-isolated,
//    skipped with DEVFLOW_SKIP_GLOBAL_UPGRADE=1
//  - Quick 21: a session running an OLDER plugin cache never downgrades a NEWER mirror.
//    The mirror decision is semver-gated (parseSemver/compareSemver below), not a bare
//    string-equality early exit.

const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  process.exit(0);
}

const sourceDir = path.join(pluginRoot, 'devflow');
const targetDir = path.join(os.homedir(), '.claude', 'devflow');
const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
const versionFile = path.join(targetDir, '.plugin-version');

let pluginVersion = 'unknown';
try {
  pluginVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || 'unknown';
} catch {
  process.exit(0);
}

let installedVersion = null;
try {
  installedVersion = fs.readFileSync(versionFile, 'utf8').trim();
} catch {}

// ---------------------------------------------------------------------------
// Quick 21: semver-gated mirror decision (never downgrade the mirror)
// ---------------------------------------------------------------------------

/**
 * Parse a (possibly `v`-prefixed, possibly `+build`-suffixed) semver string.
 * Returns { nums: [major, minor, patch] (Number), pre: string[] } or null when
 * the string is missing, empty, or does not match semver shape.
 */
function parseSemver(v) {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return {
    nums: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.') : [],
  };
}

/**
 * Compare two parsed semver values. Numeric per part first; then prerelease
 * (no-prerelease outranks any prerelease; otherwise identifier-by-identifier,
 * numeric identifiers compare numerically, numeric < alphanumeric, alphanumeric
 * compares by ASCII, and a shorter identifier list loses when all shared
 * identifiers are equal). Returns -1, 0, or 1.
 */
function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i] ? 1 : -1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1; // release > prerelease
  if (b.pre.length === 0) return -1;
  const len = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < len; i++) {
    if (i >= a.pre.length) return -1; // fewer identifiers, all equal so far → lower
    if (i >= b.pre.length) return 1;
    const ai = a.pre[i];
    const bi = b.pre[i];
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1; // numeric identifiers < alphanumeric
    } else if (ai !== bi) {
      return ai > bi ? 1 : -1;
    }
  }
  return 0;
}

const mirrorSv = parseSemver(installedVersion);
const pluginSv = parseSemver(pluginVersion);
const sentinelOk = fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'));

if (mirrorSv) {
  if (!pluginSv) {
    // Unparseable plugin version never overwrites a parseable mirror.
    process.exit(0);
  }
  const cmp = compareSemver(pluginSv, mirrorSv);
  if (cmp < 0) {
    process.stderr.write(
      `[devflow] sync-runtime: plugin ${pluginVersion} is older than mirror ${installedVersion}; not downgrading ~/.claude/devflow\n`
    );
    process.exit(0);
  }
  if (cmp === 0 && sentinelOk) {
    // Equal versions + intact mirror — nothing to do.
    process.exit(0);
  }
  // cmp > 0 (plugin newer), or equal + sentinel missing (self-heal) → fall through and mirror.
}
// mirror missing/unparseable → fall through and mirror (fresh install / broken version file).

if (!fs.existsSync(sourceDir)) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Exclusion filter
// ---------------------------------------------------------------------------

const MIRROR_EXCLUDE = [
  /\.test\.cjs$/,
  /\.test\.js$/,
  /(^|\/)__fixtures__(\/|$)/,
];

/**
 * Returns true if the entry should be excluded from the mirror.
 * @param {string} entryName  — basename of the entry (file or dir)
 * @param {string} relPath    — path relative to the subdir root (e.g. "lib/helper.test.cjs")
 */
function shouldExclude(entryName, relPath) {
  return MIRROR_EXCLUDE.some(
    r => r.test(entryName) || r.test(relPath)
  );
}

// ---------------------------------------------------------------------------
// copyDir with exclusion filter
// ---------------------------------------------------------------------------

/**
 * Recursively copy src → dest, skipping excluded entries.
 * @param {string} src
 * @param {string} dest
 * @param {string} [relBase]  — relative path from the subdir root (for relPath tests)
 */
function copyDir(src, dest, relBase) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const relPath = relBase ? relBase + '/' + entry.name : entry.name;
    if (shouldExclude(entry.name, relPath)) {
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

// ---------------------------------------------------------------------------
// removeDir helper
// ---------------------------------------------------------------------------

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Atomic per-subdir swap
// ---------------------------------------------------------------------------

const SUBDIRS = ['workflows', 'references', 'templates', 'bin', 'schemas', 'stack-profiles'];

// Sweep any stale devflow-tmp-* entries left by a previously crashed run.
function sweepStaleTmpDirs() {
  try {
    if (!fs.existsSync(targetDir)) return;
    for (const entry of fs.readdirSync(targetDir)) {
      if (entry.startsWith('devflow-tmp-')) {
        removeDir(path.join(targetDir, entry));
      }
    }
  } catch (err) {
    process.stderr.write(`[devflow] sweep stale tmp warning: ${err.message}\n`);
  }
}

const tmpDirsCreated = [];

try {
  fs.mkdirSync(targetDir, { recursive: true });

  sweepStaleTmpDirs();

  for (const sub of SUBDIRS) {
    const source = path.join(sourceDir, sub);
    const target = path.join(targetDir, sub);
    const tmpPath = path.join(targetDir, `devflow-tmp-${sub}-${process.pid}`);

    if (!fs.existsSync(source)) {
      // Source subdir absent — remove target subdir if present
      removeDir(target);
      continue;
    }

    // Copy source into a fresh temp dir (with exclusions applied)
    copyDir(source, tmpPath, '');
    tmpDirsCreated.push(tmpPath);

    // POSIX-atomic swap: remove old target then rename tmp into place.
    // On POSIX, renameSync onto a non-existent path is atomic.
    // On Windows, renameSync over an existing dir fails — we removeDir first (best-effort).
    removeDir(target);
    fs.renameSync(tmpPath, target);

    // Remove from cleanup list once successfully renamed
    tmpDirsCreated.pop();
  }

  // Write version marker ONLY after all swaps succeed
  fs.writeFileSync(versionFile, pluginVersion);
  process.stderr.write(`[devflow] runtime synced to ~/.claude/devflow (v${pluginVersion})\n`);

  // TRD 36-06: bring the global ~/.claude state forward (legacy install → backup, managed block in
  // ~/.claude/CLAUDE.md). Only after a good mirror, from the BUNDLED module (never the mirror), in its
  // own try/catch: a missing module or a thrown error never changes the mirror result or exit code.
  if (process.env.DEVFLOW_SKIP_GLOBAL_UPGRADE !== '1') {
    const gu = path.join(sourceDir, 'bin', 'lib', 'global-upgrade.cjs');
    if (fs.existsSync(gu)) {
      try {
        require(gu).runGlobalUpgrade({
          userHome: os.homedir(),
          pluginVersion,
          templatePath: path.join(sourceDir, 'templates', 'global-claude-md.md'),
        });
      } catch (e) {
        process.stderr.write(`[devflow] global upgrade skipped: ${e.message}\n`);
      }
    }
  }
} catch (err) {
  process.stderr.write(`[devflow] sync-runtime failed: ${err.message}\n`);
  // Best-effort cleanup of any tmp dirs that were created but not yet renamed
  for (const tmp of tmpDirsCreated) {
    try { removeDir(tmp); } catch {}
  }
  // Do NOT write versionFile — preserve retry-next-session semantics
  process.exit(0);
}
