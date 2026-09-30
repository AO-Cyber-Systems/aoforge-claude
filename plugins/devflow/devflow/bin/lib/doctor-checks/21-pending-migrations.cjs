'use strict';

// Doctor check: pending-migrations (TRD 45-06, DOC-05).
//
// Translates `upgrade.check()` into a doctor result — it never re-implements migration logic:
//
//   failed (a detect threw, config.json unreadable)        → error, not fixable
//   pending auto migrations, or stamp behind the engine     → warn, fixable (fix = upgrade.apply, auto only)
//   pending_confirm only                                    → warn, not fixable; fix_command = the exact
//                                                             `df-tools upgrade --apply --only <id> --confirm`
//                                                             (0006 also needs `--kind <kind>`)
//   up to date                                              → ok
//
// Safety: upgrade.apply writes under `.planning/` (it always stamps config.json), CLAUDE.md and
// `.gitignore`, so the fix is refused while any of those has uncommitted changes (worktreeGuard).
// When 0008 is among the pending migrations, apply would also change the INDEX, so the same DOC-06
// indexChangeGuard as the legacy check applies — pending-migrations must never re-apply 0008 behind
// the legacy check's back. Both guards exclude the doctor's own earlier changes
// (ctx.changedThisRun); the worktree guard also excludes legacy runtime-state files, which hooks
// rewrite constantly and which are the doctor's to clean, never user work.

const upgrade = require('../upgrade.cjs');
const dg = require('../doctor-git.cjs');
const legacy = require('./20-legacy-runtime-state.cjs');

const DF_TOOLS = 'node ~/.claude/devflow/bin/df-tools.cjs';
const APPLY_COMMAND = `${DF_TOOLS} upgrade --apply`;
const CHECK_COMMAND = `${DF_TOOLS} upgrade --check`;
const GUARDED_PATHS = ['.planning', 'CLAUDE.md', '.gitignore'];

function confirmCommand(id) {
  const base = `${DF_TOOLS} upgrade --apply --only ${id} --confirm`;
  return id === '0006' ? `${base} --kind <kind>` : base;
}

function checkReport(ctx) {
  return upgrade.check({ projectRoot: ctx.projectRoot, userHome: ctx.userHome, pluginVersion: ctx.pluginVersion });
}

function isBehind(r) {
  return r.pending.length > 0 || r.from !== r.to;
}

function ownOrRuntime(ctx) {
  const own = ctx.changedThisRun instanceof Set ? ctx.changedThisRun : new Set(ctx.changedThisRun || []);
  return (rel) => own.has(rel) || legacy.isLegacyRuntimePath(rel);
}

/** -> {ok} | {ok:false, reason}: may upgrade.apply run now without touching the user's work? */
function guard(ctx, r) {
  const wt = dg.worktreeGuard(ctx.projectRoot, GUARDED_PATHS, { env: ctx.env, exclude: ownOrRuntime(ctx) });
  if (!wt.ok) return wt;
  if (r.pending.some((p) => p.id === '0008')) {
    const idx = dg.indexChangeGuard(ctx.projectRoot, { env: ctx.env, exclude: ctx.changedThisRun });
    if (!idx.ok) return idx;
  }
  return { ok: true };
}

function failedText(failed) {
  return failed.map((f) => `${f.id} (${f.phase}): ${f.error}`).join('; ');
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const r = checkReport(ctx);
  const behind = isBehind(r);
  const details = {
    from: r.from,
    to: r.to,
    up_to_date: r.up_to_date,
    pending: r.pending.map((p) => p.id),
    pending_confirm: r.pending_confirm.map((p) => p.id),
    failed: r.failed,
  };

  if (r.failed.length === 0 && !behind && r.pending_confirm.length === 0) {
    return { severity: 'ok', finding: `project is up to date (v${r.to})`, fixable: false, details };
  }

  const parts = [];
  if (r.failed.length) parts.push(`migration check failed: ${failedText(r.failed)}`);
  if (r.from !== r.to) parts.push(`project stamped ${r.from ? `v${r.from}` : '(unstamped)'}, DevFlow v${r.to}`);
  if (r.pending.length) parts.push(`pending auto migrations: ${r.pending.map((p) => `${p.id} (${p.title})`).join(', ')}`);
  if (r.pending_confirm.length) {
    parts.push(`need confirmation: ${r.pending_confirm.map((p) => `${p.id} (${p.title})`).join(', ')}`);
  }

  let fixable = false;
  let refusal = null;
  if (behind && r.failed.length === 0) {
    const g = guard(ctx, r);
    fixable = g.ok;
    if (!g.ok) refusal = g.reason;
  }

  const result = {
    severity: r.failed.length ? 'error' : 'warn',
    finding: parts.join('; ') + (refusal ? ` — fix refused: ${refusal}` : ''),
    fixable,
    details,
  };

  const commands = [];
  if (r.failed.length) commands.push(CHECK_COMMAND);
  else if (behind && !fixable) commands.push(APPLY_COMMAND);
  commands.push(...r.pending_confirm.map((p) => confirmCommand(p.id)));
  if (commands.length) result.fix_command = commands.join(' && ');
  return result;
}

function fix(ctx) {
  if (!ctx.projectRoot) return { applied: false, refused: 'no project' };

  // Re-check: the state may have moved since run() (an earlier fix in this run, or the user).
  const r = checkReport(ctx);
  if (r.failed.length) return { applied: false, refused: `migration check failed: ${failedText(r.failed)}` };
  if (!isBehind(r)) return { applied: false, notes: 'nothing to apply' };
  const g = guard(ctx, r);
  if (!g.ok) return { applied: false, refused: g.reason };

  const rep = upgrade.apply({
    projectRoot: ctx.projectRoot,
    userHome: ctx.userHome,
    pluginVersion: ctx.pluginVersion,
    now: ctx.now,
  });
  const out = { changed: rep.changed_files };
  if (rep.backup) out.backup = rep.backup;

  if (rep.failed.length) {
    return { ...out, applied: false, refused: `upgrade failed: ${failedText(rep.failed)}` };
  }

  const notes = [];
  const appliedIds = rep.applied.map((a) => a.id);
  notes.push(appliedIds.length ? `applied: ${appliedIds.join(', ')}` : 'no migration needed');
  notes.push(`stamped v${ctx.pluginVersion}`);
  if (rep.pending_confirm.length) {
    notes.push(`still needs confirmation: ${rep.pending_confirm.map((p) => confirmCommand(p.id)).join(' && ')}`);
  }
  if (rep.changed_files.length) {
    notes.push(`commit with: ${DF_TOOLS} commit "chore: upgrade DevFlow project to v${ctx.pluginVersion}" --files ${rep.changed_files.join(' ')}`);
  }
  return { ...out, applied: true, notes: notes.join('; ') };
}

module.exports = {
  id: 'pending-migrations',
  title: 'Pending DevFlow project migrations',
  scope: 'project',
  run,
  fix,
  confirmCommand,
};
