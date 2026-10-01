'use strict';

// Doctor check: legacy-runtime-state (TRD 45-06, DOC-05 + DOC-06).
//
// DevFlow hook state no longer lives in `.planning/` (45-01 moved the awareness cache, quick-25 the
// progress guard, 45-10 the autonomous retry/resume markers), but projects still carry the old
// copies — the aodex evidence: a tracked `.planning/.progress-guard.json` AND a tracked
// `flutter/.planning/.progress-guard.json`, plus an unignored awareness cache. This check finds them
// at any `.planning/` depth and cleans them up:
//
//   tracked (in the index)              → error
//   present on disk (ignored or not)    → warn (a dead file: nothing reads it any more)
//
// Discovery of the two 0008 files is migration 0008's `discover()` (never re-implemented here).
// The autonomous markers (`.autonomous-retry-*`, `.autonomous-resume-*`) are not 0008's, so they
// are discovered here through the same git-pathspec approach and kept in a separate list; they
// need no ignore rule because nothing writes them in-tree any more.
//
// `.planning/.devflow-notices.json` is a legitimate in-tree file (the one documented exception in
// the 45-10 audit) and is never matched.
//
// The fix: back up (upgrade.backup + nested copies) → m0008.apply when anything is tracked or
// unignored → `git rm --cached` tracked markers → delete every working copy. The index-changing
// part runs only behind doctor-git.indexChangeGuard (DOC-06). The doctor never commits: the fix
// returns the exact `df-tools commit` command for the user (in GitHub store mode, the branch +
// logged-escape + pull-request sequence the commit gate accepts; TRD 51-04).

const fs = require('fs');
const path = require('path');

const m0008 = require('../migrations/0008-runtime-state-untrack.cjs');
const upgrade = require('../upgrade.cjs');
const dg = require('../doctor-git.cjs');
const planningMode = require('../planning-mode.cjs');

const MARKER_PREFIXES = ['.autonomous-retry-', '.autonomous-resume-'];
const MARKER_PATHSPECS = MARKER_PREFIXES.map((p) => `:(glob)**/.planning/${p}*`);
const COMMIT_COMMAND = 'node ~/.claude/devflow/bin/df-tools.cjs commit "chore: untrack DevFlow runtime state" --files';
const DOCTOR_FIX_COMMAND = 'node ~/.claude/devflow/bin/df-tools.cjs doctor --fix';
const STORE_BRANCH = 'devflow-untrack-runtime-state';

/**
 * The follow-up commit note for `files`. Local mode: `commit with: <COMMIT_COMMAND> <files>`, byte-identical to before
 * 51-04. Store mode (TRD 51-04, G6): objective 50's gate refuses that line on the default branch and on any branch no
 * objective PR names, so print a new branch, the logged escape (gate `gh`), push and a pull request instead.
 * `planningMode.isStoreMode` is the only reader of `github.store`.
 */
function commitNote(root, files) {
  const list = files.join(' ');
  if (!planningMode.isStoreMode(root)) return `commit with: ${COMMIT_COMMAND} ${list}`;
  return [
    'commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked ' +
      'branches), then merge it through a pull request:',
    `  git switch -c ${STORE_BRANCH}`,
    `  DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="untrack DevFlow runtime state" ${COMMIT_COMMAND} ${list}`,
    `  git push -u origin ${STORE_BRANCH}`,
    '  then open a pull request for that branch',
  ].join('\n');
}

/** True for `<anything>/.planning/.autonomous-{retry,resume}-*` at any depth. Lexical. */
function isAutonomousMarkerPath(rel) {
  if (typeof rel !== 'string') return false;
  const segments = rel.split('/');
  const n = segments.length;
  return n >= 2 && segments[n - 2] === '.planning' &&
    MARKER_PREFIXES.some((p) => segments[n - 1].startsWith(p) && segments[n - 1].length > p.length);
}

/** Any path this check owns (the 0008 files or an autonomous marker), at any `.planning/` depth. */
function isLegacyRuntimePath(rel) {
  return m0008.isRuntimeStatePath(rel) || isAutonomousMarkerPath(rel);
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

function gitOpts(ctx) {
  return { env: ctx.env };
}

function m8ctx(ctx, dryRun) {
  return { projectRoot: ctx.projectRoot, userHome: ctx.userHome, pluginVersion: ctx.pluginVersion, dryRun, options: {} };
}

/**
 * The full picture:
 *   runtime  {tracked, present, unignored} for the 0008 files (m0008.discover)
 *   markers  {tracked, present} for the autonomous markers
 *   isRepo
 * Outside a git repo, only the root `.planning/` is looked at, on disk.
 */
function discover(ctx) {
  const root = ctx.projectRoot;
  const isRepo = dg.isGitRepo(root, gitOpts(ctx));

  if (!isRepo) {
    const planning = path.join(root, '.planning');
    let names = [];
    try { names = fs.readdirSync(planning); } catch { names = []; }
    const present = names.map((n) => `.planning/${n}`).filter((rel) => {
      try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; }
    });
    return {
      isRepo,
      runtime: { tracked: [], present: uniqueSorted(present.filter(m0008.isRuntimeStatePath)), unignored: [] },
      markers: { tracked: [], present: uniqueSorted(present.filter(isAutonomousMarkerPath)) },
    };
  }

  const runtime = m0008.discover(m8ctx(ctx, true));
  const markerTracked = dg.lsFiles(root, MARKER_PATHSPECS, gitOpts(ctx)).filter(isAutonomousMarkerPath);
  const markerUntracked = dg.lsFiles(root, MARKER_PATHSPECS, { ...gitOpts(ctx), others: true }).filter(isAutonomousMarkerPath);
  const trackedOnDisk = markerTracked.filter((rel) => fs.existsSync(path.join(root, rel)));
  return {
    isRepo,
    runtime,
    markers: { tracked: markerTracked, present: uniqueSorted([...trackedOnDisk, ...markerUntracked]) },
  };
}

function summarizeFound(found) {
  const tracked = uniqueSorted([...found.runtime.tracked, ...found.markers.tracked]);
  const present = uniqueSorted([...found.runtime.present, ...found.markers.present]);
  const unignored = found.runtime.unignored;
  // Index work: untracking anything tracked, and (via 0008) adding ignore rules for unignored files.
  const needsIndex = tracked.length > 0 || unignored.length > 0;
  return { tracked, present, unignored, needsIndex };
}

function guardFor(ctx) {
  return dg.indexChangeGuard(ctx.projectRoot, { ...gitOpts(ctx), exclude: ctx.changedThisRun });
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const found = discover(ctx);
  const { tracked, present, unignored, needsIndex } = summarizeFound(found);
  const details = {
    tracked,
    present,
    unignored,
    markers: found.markers,
    git: found.isRepo,
  };

  if (tracked.length === 0 && present.length === 0) {
    return { severity: 'ok', finding: 'no legacy DevFlow runtime state in .planning/', fixable: false, details };
  }

  const parts = [];
  if (tracked.length) parts.push(`tracked runtime state (must not be committed): ${tracked.join(', ')}`);
  const loose = present.filter((p) => !tracked.includes(p));
  if (unignored.length) parts.push(`present and not ignored: ${unignored.join(', ')}`);
  const dead = loose.filter((p) => !unignored.includes(p));
  if (dead.length) parts.push(`leftover files nothing reads any more: ${dead.join(', ')}`);

  const severity = tracked.length ? 'error' : 'warn';
  // No index change needed → deleting working files is always safe (and backed up).
  const guard = needsIndex ? guardFor(ctx) : { ok: true };
  const result = { severity, finding: parts.join('; '), fixable: guard.ok, details };
  if (!guard.ok) {
    result.finding += ` — fix refused: ${guard.reason}`;
    result.fix_command = `commit or unstage your changes (${guard.reason}), then re-run \`${DOCTOR_FIX_COMMAND}\``;
  }
  return result;
}

function unlinkQuiet(abs) {
  try {
    fs.unlinkSync(abs);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    throw e;
  }
}

function fix(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { applied: false, refused: 'no project' };

  // Re-discover: the state may have moved since run().
  const found = discover(ctx);
  const { tracked, present, unignored, needsIndex } = summarizeFound(found);
  if (tracked.length === 0 && present.length === 0) {
    return { applied: false, notes: 'nothing to fix: no legacy runtime state found' };
  }
  if (needsIndex) {
    const guard = guardFor(ctx);
    if (!guard.ok) return { applied: false, refused: guard.reason };
  }

  // 1. Back up: root .planning/ (+ CLAUDE.md) through upgrade.backup, nested copies alongside.
  const bk = upgrade.backup({ projectRoot: root, userHome: ctx.userHome, now: ctx.now });
  for (const rel of present) {
    if (rel.startsWith('.planning/')) continue; // already inside the .planning/ copy
    const dest = path.join(bk, 'nested', ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, ...rel.split('/')), dest);
  }

  // 2. Index work (DOC-06-guarded above).
  const changed = [];
  const indexRemoved = [];
  let gitignoreChanged = false;
  if (found.runtime.tracked.length || unignored.length) {
    const r = m0008.apply(m8ctx(ctx, false));
    gitignoreChanged = r.changed.includes('.gitignore');
    if (gitignoreChanged) changed.push('.gitignore');
    indexRemoved.push(...r.changed.filter((p) => p !== '.gitignore'));
  }
  if (found.markers.tracked.length) {
    dg.rmCached(root, found.markers.tracked, gitOpts(ctx));
    indexRemoved.push(...found.markers.tracked);
  }

  // 3. Delete every working copy.
  const deleted = [];
  for (const rel of present) {
    if (unlinkQuiet(path.join(root, ...rel.split('/')))) deleted.push(rel);
  }

  const removed = uniqueSorted(indexRemoved);
  changed.push(...uniqueSorted([...removed, ...deleted]));

  const notes = [];
  if (removed.length) notes.push(`untracked: ${removed.join(', ')}`);
  if (deleted.length) notes.push(`deleted: ${deleted.join(', ')}`);
  const commitFiles = [...(gitignoreChanged ? ['.gitignore'] : []), ...removed];
  if (commitFiles.length) notes.push(commitNote(root, commitFiles));
  else notes.push('nothing to commit (working files only)');

  return { applied: true, changed, backup: bk, notes: notes.join('; ') };
}

module.exports = {
  id: 'legacy-runtime-state',
  title: 'Legacy DevFlow runtime state in .planning/',
  scope: 'project',
  run,
  fix,
  // Shared with 21-pending-migrations / 22-validate-health: these paths are the doctor's to clean,
  // never user work, so a modified tracked copy must not block a worktree guard.
  isAutonomousMarkerPath,
  isLegacyRuntimePath,
  MARKER_PREFIXES,
  COMMIT_COMMAND,
};
