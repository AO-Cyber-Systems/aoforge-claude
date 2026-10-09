'use strict';

// skill-marker-health — inspect and repair `.aoforge/.skill-active` (TRD 69-02, TOOL-09).
//
// hooks/gate-edits.js lets every edit through while `.aoforge/.skill-active` says a skill is running.
// Two failure modes keep that gate open when no skill is:
//
//   1. A stale marker. The gate skips a marker whose `expires_at` has passed, but a marker with no
//      `expires_at` (pre-27-01) never expires there, and an unparseable one counts as live (the gate
//      fails open). A crashed skill leaves one behind (11 of 30 repos in the 2026-07-31 fleet audit).
//   2. A TRACKED marker. Committed to git, it holds the gate open in every clone and checkout (two
//      repos, 66 and 77 days old, in the same audit).
//
// This module is the one place that knows how to look at the marker and how to repair it; both
// `validate health` (Check 19) and doctor check 23 (69-04) call it. It never prints, never exits and
// never reads the home directory: the callers own output and the seams.
//
// Staleness is `classifySkillActive`: an expired `expires_at`; an unparseable file (empty or truncated
// JSON, or not a JSON object); or no usable `expires_at` and a `started_at` (else the file mtime) older
// than skill-active.DEFAULT_TTL_MS. Classification fails CLOSED: an unparseable marker is stale and
// removable, never live. Process liveness is deliberately not used: the pid in the marker is the
// aof-tools subprocess that wrote it, which exits within milliseconds, so it is always dead.
//
// Decision table (planRepair):
//
//   marker state                              finding   repair does
//   untracked, live                           none      nothing
//   untracked, stale                          W064      unlink the file (no guard: it is not in the index)
//   tracked, stale                            E006      git rm --cached + unlink      (guarded)
//   tracked, missing from the working tree    E006      git rm --cached               (guarded)
//   tracked, live, ignored                    E006      git rm --cached, keep the file (guarded)
//   tracked, live, NOT ignored                E006      nothing: the removal would leave the file one
//                                                       `git add -A` from being tracked again; the fix
//                                                       text says to ignore it first
//   tracked, unrelated change staged or
//   .gitignore dirty                          E006      nothing (indexChangeGuard's reason)
//
// An index change goes through doctor-git.indexChangeGuard (DOC-06): `aof-tools commit` refuses when
// anything outside `--files` is staged, so a repair that mixed with the user's staged work would sweep
// it into the "untrack" commit. The repair touches no other file, and never edits `.gitignore`.

const fs = require('fs');
const path = require('path');

const skillActive = require('./skill-active.cjs');
const dg = require('./doctor-git.cjs');
const { planningRoot, planningRel } = require('./compat.cjs');

const MARKER_FILE = '.skill-active';
// The default-layout path; every check names the marker under the project's resolved planning directory (markerRel).
const MARKER_REL = `.aoforge/${MARKER_FILE}`;

/** The marker's root-relative posix path under the resolved planning directory (`.aoforge/`, or a legacy one). */
function markerRel(root) {
  return planningRel(root, MARKER_FILE);
}
const CODES = Object.freeze({ TRACKED: 'E006', STALE: 'W064' });
const DF = 'node ~/.claude/aoforge/bin/aof-tools.cjs';

function hours(ms) {
  return `${Math.round((ms / 3600000) * 10) / 10}h`;
}

function statQuiet(abs) {
  try { return fs.statSync(abs); } catch { return null; }
}

/**
 * -> null (absent or live) | reason string (stale).
 * Copied verbatim from doctor check 23 (69-04 deletes that copy and calls this one).
 */
function classifySkillActive(root, nowMs) {
  const abs = skillActive.markerPath(planningRoot(root));
  const st = statQuiet(abs);
  if (!st || !st.isFile()) return null;

  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  } catch {
    return 'unparseable marker (the edit gate treats it as live forever)';
  }
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
    return 'unparseable marker (not a JSON object)';
  }

  if (marker.expires_at && Number.isFinite(Date.parse(marker.expires_at))) {
    return skillActive.isExpired(marker, nowMs) ? `expired at ${marker.expires_at}` : null;
  }

  // No usable expires_at: a pre-27-01 marker that never expires on its own. Age it by started_at,
  // falling back to the file's mtime.
  const started = Date.parse(marker.started_at);
  const age = nowMs - (Number.isFinite(started) ? started : st.mtimeMs);
  if (age > skillActive.DEFAULT_TTL_MS) {
    const since = Number.isFinite(started) ? `started ${hours(age)} ago` : `file ${hours(age)} old`;
    return `no expires_at and ${since} (older than the ${hours(skillActive.DEFAULT_TTL_MS)} TTL)`;
  }
  return null;
}

/**
 * inspect(root, {nowMs, env}) -> {rel, git, present, tracked, ignored, stale, live}
 *   git      root is inside a git work tree
 *   present  the marker is a file in the working tree
 *   tracked  the marker is in the index (false outside git)
 *   ignored  this repository's ignore rules cover it (global excludes off); null outside git
 *   stale    null | the classifySkillActive reason (null when the file is absent)
 *   live     present and not stale
 */
function inspect(root, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const env = opts.env || process.env;
  const git = dg.isGitRepo(root, { env });
  const rel = markerRel(root);
  const st = statQuiet(path.join(root, ...rel.split('/')));
  const present = Boolean(st && st.isFile());
  const tracked = git && dg.lsFiles(root, [rel], { env }).includes(rel);
  const ignored = git ? dg.checkIgnored(root, [rel], { env }).has(rel) : null;
  const stale = present ? classifySkillActive(root, nowMs) : null;
  return { rel, git, present, tracked, ignored, stale, live: present && !stale };
}

/**
 * planRepair(root, state, {env, exclude}) -> {actions, fixable, refused}
 * actions is a subset of ['untrack', 'remove'], in the order repair runs them. `exclude` is the
 * doctor's own earlier changes (doctor-git.toExcluder); it only matters to the index guard.
 */
function planRepair(root, state, opts = {}) {
  const refuse = (refused) => ({ actions: [], fixable: false, refused });

  if (state.tracked) {
    if (state.live && !state.ignored) {
      return refuse(`${state.rel} is live and this repository does not ignore it, so untracking it would leave it one `
        + `\`git add -A\` from being tracked again; add ${state.rel} to .gitignore and commit that first`);
    }
    const guard = dg.indexChangeGuard(root, { env: opts.env, exclude: opts.exclude });
    if (!guard.ok) return refuse(guard.reason);
    return { actions: state.stale ? ['untrack', 'remove'] : ['untrack'], fixable: true, refused: null };
  }

  if (state.present && state.stale) return { actions: ['remove'], fixable: true, refused: null };
  return { actions: [], fixable: false, refused: null };
}

/**
 * findings(state, plan) -> [] | [{severity, code, message, fix, repairable}]
 * One finding at most: a tracked marker is E006 (and carries the stale reason), an untracked stale one
 * is W064, never both.
 */
function findings(state, plan) {
  if (state.tracked) {
    const message = `skill-marker-tracked: ${state.rel} is tracked in git, so a committed marker holds the edit gate `
      + 'open in every clone and checkout' + (state.stale ? ` (it is also stale: ${state.stale})` : '');
    const fix = plan.fixable
      ? `Run \`${DF} validate health --repair\` or \`${DF} doctor --fix\` (git rm --cached; the file is removed when `
        + `stale), then commit the removal: \`${DF} commit "chore: untrack ${state.rel}" --files ${state.rel}\``
        + (state.ignored ? '' : `. Add ${state.rel} to .gitignore so it is not tracked again`)
      : `${plan.refused}; then run \`${DF} validate health --repair\``;
    return [{ severity: 'error', code: CODES.TRACKED, message, fix, repairable: plan.fixable }];
  }
  if (state.stale) {
    return [{
      severity: 'warning',
      code: CODES.STALE,
      message: `skill-marker-stale: ${state.rel} (${state.stale}); the edit gate stays open until it is removed`,
      fix: `Run \`${DF} validate health --repair\` or \`${DF} doctor --fix\` (removes only this file)`,
      repairable: plan.fixable,
    }];
  }
  return [];
}

/**
 * repair(root, {nowMs, env, exclude}) -> {applied, untracked, removed, refused, notes}
 * Re-inspects first, so a marker that became live (or was removed) since the caller's inspect is not
 * touched. The untrack comes before the unlink: a failed `git rm --cached` leaves the file in place,
 * never a tracked file deleted from the working tree.
 */
function repair(root, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const env = opts.env || process.env;
  const state = inspect(root, { nowMs, env });
  const plan = planRepair(root, state, { env, exclude: opts.exclude });

  const untracked = [];
  const removed = [];
  const notes = [];

  if (!plan.actions.length) {
    notes.push(plan.refused || (state.live ? `left the live ${state.rel} alone` : `no stale ${state.rel} to repair`));
    return { applied: false, untracked, removed, refused: plan.refused, notes: notes.join('; ') };
  }

  if (plan.actions.includes('untrack')) {
    dg.rmCached(root, [state.rel], { env });
    untracked.push(state.rel);
    notes.push(`untracked ${state.rel} (git rm --cached; commit the removal)`);
  }
  if (plan.actions.includes('remove')) {
    // Race-safe: classify again right before unlinking; a marker that is live now stays.
    if (classifySkillActive(root, nowMs)) {
      try {
        fs.unlinkSync(path.join(root, ...state.rel.split('/')));
        removed.push(state.rel);
        notes.push(`removed ${state.rel}`);
      } catch (e) {
        if (!e || e.code !== 'ENOENT') throw e;
      }
    } else {
      notes.push(`left ${state.rel} alone (it is live now)`);
    }
  }
  return { applied: untracked.length > 0 || removed.length > 0, untracked, removed, refused: null, notes: notes.join('; ') };
}

module.exports = { MARKER_REL, markerRel, CODES, classifySkillActive, inspect, planRepair, findings, repair };
