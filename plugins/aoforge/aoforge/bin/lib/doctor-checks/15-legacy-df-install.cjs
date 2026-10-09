'use strict';

// Doctor check: legacy-df-install (objective 72, TRD 72-15, INST-01).
//
// The pre-plugin installer copied skills and agents named with the legacy install prefix into
// ~/.claude/skills and ~/.claude/agents. The global upgrade (TRD 36-06, run by sync-runtime after a good mirror) moves
// them into a backup, but one can reappear: an old installer re-run, a dotfiles restore, a copy from another machine.
// Claude Code then loads a second, stale set of commands beside the plugin's. INST-01 asks the doctor to flag that.
//
//   no legacy-prefixed entry under skills/ or agents/   -> ok
//   one or more                                          -> warn, fixable
//
// Discovery and the fix are global-upgrade's findLegacy / moveLegacy: there is no second mover. Every entry is MOVED
// into ~/.claude/aoforge/backups/legacy-<ts>/{skills,agents}/ (a rename, or a verified copy across devices), never
// deleted, so the fix is reversible by moving it back. Entries without the prefix (the user's own skills) are never
// listed or touched. findLegacy also reports a stuck runtime VERSION file; that is the global upgrade's own business
// and is not part of this check's skills-and-agents question.
//
// Reads the home only through ctx.userHome. The install prefix comes from LEGACY (legacy-names.cjs).

const path = require('path');

const globalUpgrade = require('../global-upgrade.cjs');
const { LEGACY } = require('../legacy-names.cjs');

const DIRS = ['skills', 'agents'];
const FIX_COMMAND = 'node ~/.claude/aoforge/bin/aof-tools.cjs doctor --global --fix';

/** Legacy-prefixed skills and agents, relative to ~/.claude (posix), in findLegacy's order. */
function legacyEntries(ctx) {
  return globalUpgrade.findLegacy(ctx.userHome).filter((rel) => {
    const [dir, name] = rel.split('/');
    return DIRS.includes(dir) && typeof name === 'string' && name.startsWith(LEGACY.installPrefix);
  });
}

function run(ctx) {
  const entries = legacyEntries(ctx);
  const details = { entries, claude_dir: ctx.paths.claudeDir };
  if (entries.length === 0) {
    return {
      severity: 'ok',
      finding: `no legacy ${LEGACY.installPrefix}* skills or agents under ~/.claude`,
      fixable: false,
      details,
    };
  }
  return {
    severity: 'warn',
    finding: `legacy ${LEGACY.installPrefix}* skills or agents under ~/.claude load beside the plugin: ${entries.join(', ')} `
      + '(the fix moves them into ~/.claude/aoforge/backups/legacy-<timestamp>/, nothing is deleted)',
    fixable: true,
    fix_command: FIX_COMMAND,
    details,
  };
}

function fix(ctx) {
  // Re-discover: the home may have changed since run().
  const entries = legacyEntries(ctx);
  if (entries.length === 0) return { applied: false, notes: 'nothing to move: no legacy skills or agents found' };

  const { moved, backupDir } = globalUpgrade.moveLegacy(ctx.userHome, entries, { now: ctx.now });
  // Absolute: the engine treats a relative `changed` entry as a project path (ctx.changedThisRun).
  const changed = moved.map((rel) => path.join(ctx.paths.claudeDir, ...rel.split('/')));
  return {
    applied: moved.length > 0,
    changed,
    backup: backupDir,
    notes: `moved ${moved.length} legacy entr${moved.length === 1 ? 'y' : 'ies'} to ${backupDir}: ${moved.join(', ')}`,
  };
}

module.exports = {
  id: 'legacy-df-install',
  title: 'Legacy skills and agents from the pre-plugin installer',
  scope: 'global',
  run,
  fix,
};
