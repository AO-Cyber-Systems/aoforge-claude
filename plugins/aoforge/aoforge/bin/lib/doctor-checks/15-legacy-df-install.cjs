'use strict';

// Doctor check: legacy-df-install (objective 72, TRD 72-15, INST-01; report-only since objective 78, TRD 78-06).
//
// The pre-plugin installer copied skills and agents named with the legacy install prefix into
// ~/.claude/skills and ~/.claude/agents. The global upgrade (TRD 36-06, run by sync-runtime after a good mirror) moves
// them into a backup, but one can reappear: an old installer re-run, a dotfiles restore, a copy from another machine.
// Claude Code then loads a second, stale set of commands beside the plugin's. INST-01 asks the doctor to flag that.
//
//   no legacy-prefixed entry under skills/ or agents/   -> ok
//   one or more                                          -> warn, report-only
//
// Decision (TRD 78-06): KEEP, report-only (the fix is removed). Pre-plugin `df-*` skills and agents shadow AOForge
// commands for any 2.x user, and detection is one readdir per directory. The move itself remains in the global
// upgrade (objective 36, not a rename shim): it runs at session start after a plugin update and on demand with
// `aof-tools upgrade --global --apply`, so a doctor fix only duplicated it. The finding names that path and the
// manual move; fix_command is the on-demand global upgrade.
//
// Discovery is global-upgrade's findLegacy. Entries without the prefix (the user's own skills) are never listed.
// findLegacy also reports a stuck runtime VERSION file; that is the global upgrade's own business and is not part of
// this check's skills-and-agents question.
//
// Reads the home only through ctx.userHome. The install prefix comes from LEGACY (legacy-names.cjs).

const globalUpgrade = require('../global-upgrade.cjs');
const { NAMES, LEGACY } = require('../legacy-names.cjs');

const DIRS = ['skills', 'agents'];
const UPGRADE_COMMAND = `${NAMES.cli} upgrade --global --apply`;
const FIX_COMMAND = `node ~/.claude/${NAMES.runtimeDir}/bin/${NAMES.cli}.cjs upgrade --global --apply`;
const BACKUP_LABEL = `~/.claude/${NAMES.runtimeDir}/backups/legacy-<timestamp>/`;

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
    finding: `legacy ${LEGACY.installPrefix}* skills or agents under ~/.claude load beside the plugin: ${entries.join(', ')}; `
      + `the global upgrade moves them into ${BACKUP_LABEL} (nothing is deleted): it runs at session start after a `
      + `plugin update, or now with \`${UPGRADE_COMMAND}\`; or move them yourself`,
    fixable: false,
    fix_command: FIX_COMMAND,
    details,
  };
}

module.exports = {
  id: 'legacy-df-install',
  title: 'Legacy skills and agents from the pre-plugin installer',
  scope: 'global',
  run,
};
