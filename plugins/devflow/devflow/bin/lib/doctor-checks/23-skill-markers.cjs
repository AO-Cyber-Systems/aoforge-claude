'use strict';

// Doctor check: skill-markers (TRD 45-06, DOC-05; tracked case TRD 69-04, TOOL-09).
//
// Two runtime markers in `.planning/` open the edit gate (gate-edits.js):
//
//   .skill-active   a skill is running. Inspected and repaired by lib/skill-marker-health.cjs, the one
//                   place that classifies it (expired, unparseable, or an aged marker with no
//                   expires_at is stale) and knows whether it is tracked in git. validate health
//                   (Check 19) renders the same module. This check owns the codes:
//                     E006  the marker is TRACKED: committed, it holds the gate open in every clone
//                           (error). The fix is `git rm --cached` (plus removal when stale), an index
//                           change, so it sits behind the DOC-06 guard and returns the commit command.
//                     W064  an UNTRACKED marker is stale (warn). The fix unlinks that one file.
//                   Check 22 (validate-health) defers both codes, so the problem shows once.
//   .edit-override  a single-turn override. Stale when its mtime is older than the 5-minute TTL
//                   the edit gate itself applies (hooks/lib/edit-override.js). Untracked runtime
//                   file; the fix unlinks it.
//
// A live marker is never removed. A live TRACKED marker is untracked (its working file kept) only when
// the repository ignores it; otherwise the check reports it and refuses, naming the .gitignore step.
// The git guard applies to the tracked case only: an untracked marker is not in the index.
// fix() re-inspects right before acting, so a marker that became live since run() is left alone, and
// it never unlinks a tracked marker it could not untrack.

const fs = require('fs');
const path = require('path');

const smh = require('../skill-marker-health.cjs');
const legacy = require('./20-legacy-runtime-state.cjs');

// Mirrors hooks/lib/edit-override.js EDIT_OVERRIDE_TTL_MS. That file lives in the plugin's hooks/
// dir, which sync-runtime does not mirror into ~/.claude/devflow, so it cannot be required from a
// mirrored df-tools; the test pins the two values equal.
const EDIT_OVERRIDE_TTL_MS = 5 * 60 * 1000;

const SKILL_ACTIVE_REL = smh.MARKER_REL;
const EDIT_OVERRIDE_REL = '.planning/.edit-override';
const DF = 'node ~/.claude/devflow/bin/df-tools.cjs';

function minutes(ms) {
  return `${Math.round(ms / 60000)} min`;
}

function statQuiet(abs) {
  try { return fs.statSync(abs); } catch { return null; }
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

// The markers this check unlinks itself. .skill-active is not here: every action on it goes through
// skill-marker-health, which untracks before removing and refuses when the index guard does.
const MARKERS = [
  { file: EDIT_OVERRIDE_REL, classify: classifyEditOverride },
];

function nowMsOf(ctx) {
  return ctx.now instanceof Date ? ctx.now.getTime() : Date.now();
}

/** True for the refusal that is not the index guard: a live marker the repository does not ignore. */
function liveNotIgnored(skill) {
  return Boolean(skill.tracked && skill.live && !skill.ignored);
}

function run(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { severity: 'ok', finding: 'no project', fixable: false };
  const nowMs = nowMsOf(ctx);

  const skill = smh.inspect(root, { nowMs, env: ctx.env });
  const plan = smh.planRepair(root, skill, { env: ctx.env, exclude: ctx.changedThisRun });
  const overrideReason = classifyEditOverride(root, nowMs);

  const stale = [];
  if (skill.stale) stale.push({ file: SKILL_ACTIVE_REL, reason: skill.stale });
  if (overrideReason) stale.push({ file: EDIT_OVERRIDE_REL, reason: overrideReason });

  const tracked = skill.tracked ? [SKILL_ACTIVE_REL] : [];
  const codes = smh.findings(skill, plan).map((f) => f.code);
  const details = { stale, tracked, codes, skill, skill_plan: plan };

  if (!tracked.length && !stale.length) {
    return { severity: 'ok', finding: 'no stale skill or edit-override marker', fixable: false, details };
  }

  // A tracked stale marker is described by the tracked sentence only.
  const staleOnly = stale.filter((s) => !(skill.tracked && s.file === SKILL_ACTIVE_REL));
  const parts = [];
  if (skill.tracked) {
    parts.push(`tracked edit-gate marker: ${SKILL_ACTIVE_REL} is in the git index (E006), so it holds the edit gate open in every clone`
      + (skill.stale ? ` and is stale (${skill.stale})` : ''));
  }
  if (staleOnly.length) {
    parts.push(`stale edit-gate marker(s) holding the gate open: ${staleOnly.map((s) => `${s.file} (${s.reason})`).join('; ')}`);
  }
  let finding = parts.join('; ');

  const result = {
    severity: skill.tracked ? 'error' : 'warn',
    finding,
    fixable: plan.fixable || Boolean(overrideReason),
    details,
  };

  if (skill.tracked && !plan.fixable) {
    finding += ` — skill marker fix refused: ${plan.refused}`;
    result.finding = finding;
    result.fix_command = liveNotIgnored(skill)
      ? plan.refused
      : `commit or unstage your changes (${plan.refused}), then re-run \`${DF} doctor --fix\``;
  }
  return result;
}

function fix(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { applied: false, refused: 'no project' };
  const nowMs = nowMsOf(ctx);
  const changed = [];
  const skipped = [];
  const notes = [];

  // .skill-active: skill-marker-health re-inspects, untracks (guarded) and removes. The commit that
  // records an untrack is the user's: the doctor never commits, so the command goes in the notes.
  const r = smh.repair(root, { nowMs, env: ctx.env, exclude: ctx.changedThisRun });
  if (r.untracked.length) {
    notes.push(`untracked: ${SKILL_ACTIVE_REL}`);
    notes.push(legacy.commitNote(root, [SKILL_ACTIVE_REL]));
  }
  if (r.removed.length) notes.push(`removed: ${SKILL_ACTIVE_REL}`);
  if (r.untracked.length || r.removed.length) {
    changed.push(SKILL_ACTIVE_REL);
  } else if (r.refused) {
    notes.push(`skill marker left alone: ${r.refused}`);
  } else if (fs.existsSync(path.join(root, ...SKILL_ACTIVE_REL.split('/')))) {
    skipped.push(SKILL_ACTIVE_REL);
  }

  for (const m of MARKERS) {
    // Race-safe: re-classify right before unlinking; a marker that is now live stays.
    const reason = m.classify(root, nowMs);
    const abs = path.join(root, ...m.file.split('/'));
    if (!reason) {
      if (fs.existsSync(abs)) skipped.push(m.file);
      continue;
    }
    try {
      fs.unlinkSync(abs);
      changed.push(m.file);
      notes.push(`removed: ${m.file}`);
    } catch (e) {
      if (!e || e.code !== 'ENOENT') throw e;
    }
  }

  if (skipped.length) notes.push(`left live marker(s) alone: ${skipped.join(', ')}`);
  if (!changed.length) {
    return { applied: false, refused: r.refused || undefined, notes: notes.join('; ') || 'no stale marker to remove' };
  }
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
