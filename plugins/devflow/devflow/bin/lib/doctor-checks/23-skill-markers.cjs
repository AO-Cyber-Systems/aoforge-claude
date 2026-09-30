'use strict';

// Doctor check: skill-markers (TRD 45-06, DOC-05).
//
// Two untracked runtime markers in `.planning/` open the edit gate (gate-edits.js):
//
//   .skill-active   a skill is running. Stale when expired (skill-active.isExpired), unparseable
//                   (gate-edits fails OPEN on an unparseable marker, so garbage holds the gate open
//                   forever), or without a usable expires_at and started more than DEFAULT_TTL_MS ago.
//   .edit-override  a single-turn override. Stale when its mtime is older than the 5-minute TTL
//                   the edit gate itself applies (hooks/lib/edit-override.js).
//
// Stale → warn, fixable (fix = unlink). A live marker is never touched: fix() re-classifies each
// marker immediately before unlinking it, so one that became live since run() is skipped. The
// markers are untracked runtime files, so no git guard is involved.

const fs = require('fs');
const path = require('path');

const skillActive = require('../skill-active.cjs');

// Mirrors hooks/lib/edit-override.js EDIT_OVERRIDE_TTL_MS. That file lives in the plugin's hooks/
// dir, which sync-runtime does not mirror into ~/.claude/devflow, so it cannot be required from a
// mirrored df-tools; the test pins the two values equal.
const EDIT_OVERRIDE_TTL_MS = 5 * 60 * 1000;

const SKILL_ACTIVE_REL = '.planning/.skill-active';
const EDIT_OVERRIDE_REL = '.planning/.edit-override';

function hours(ms) {
  return `${Math.round((ms / 3600000) * 10) / 10}h`;
}

function minutes(ms) {
  return `${Math.round(ms / 60000)} min`;
}

function statQuiet(abs) {
  try { return fs.statSync(abs); } catch { return null; }
}

/** -> null (absent or live) | reason string (stale) */
function classifySkillActive(root, nowMs) {
  const abs = skillActive.markerPath(path.join(root, '.planning'));
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

/** -> null (absent or fresh) | reason string (stale). Age by mtime, as the edit gate does. */
function classifyEditOverride(root, nowMs) {
  const st = statQuiet(path.join(root, '.planning', '.edit-override'));
  if (!st || !st.isFile()) return null;
  const age = nowMs - st.mtimeMs;
  return age > EDIT_OVERRIDE_TTL_MS
    ? `older than the ${minutes(EDIT_OVERRIDE_TTL_MS)} edit-override TTL (${minutes(age)} old)`
    : null;
}

const MARKERS = [
  { file: SKILL_ACTIVE_REL, classify: classifySkillActive },
  { file: EDIT_OVERRIDE_REL, classify: classifyEditOverride },
];

function staleMarkers(root, nowMs) {
  const stale = [];
  for (const m of MARKERS) {
    const reason = m.classify(root, nowMs);
    if (reason) stale.push({ file: m.file, reason });
  }
  return stale;
}

function nowMsOf(ctx) {
  return ctx.now instanceof Date ? ctx.now.getTime() : Date.now();
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };
  const stale = staleMarkers(ctx.projectRoot, nowMsOf(ctx));
  if (!stale.length) {
    return { severity: 'ok', finding: 'no stale skill or edit-override marker', fixable: false, details: { stale } };
  }
  return {
    severity: 'warn',
    finding: `stale edit-gate marker(s) holding the gate open: ${stale.map((s) => `${s.file} (${s.reason})`).join('; ')}`,
    fixable: true,
    details: { stale },
  };
}

function fix(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { applied: false, refused: 'no project' };
  const nowMs = nowMsOf(ctx);
  const changed = [];
  const skipped = [];

  for (const m of MARKERS) {
    // Race-safe: re-classify right before unlinking; a marker that is now live stays.
    const reason = m.classify(root, nowMs);
    if (!reason) {
      if (fs.existsSync(path.join(root, ...m.file.split('/')))) skipped.push(m.file);
      continue;
    }
    try {
      fs.unlinkSync(path.join(root, ...m.file.split('/')));
      changed.push(m.file);
    } catch (e) {
      if (!e || e.code !== 'ENOENT') throw e;
    }
  }

  const notes = [];
  if (changed.length) notes.push(`removed: ${changed.join(', ')}`);
  if (skipped.length) notes.push(`left live marker(s) alone: ${skipped.join(', ')}`);
  if (!changed.length) return { applied: false, notes: notes.join('; ') || 'no stale marker to remove' };
  return { applied: true, changed, notes: notes.join('; ') };
}

module.exports = {
  id: 'skill-markers',
  title: 'Stale edit-gate markers (.skill-active / .edit-override)',
  scope: 'project',
  run,
  fix,
  EDIT_OVERRIDE_TTL_MS,
};
