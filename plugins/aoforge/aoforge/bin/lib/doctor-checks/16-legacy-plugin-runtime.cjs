'use strict';

// Doctor check: legacy-plugin-runtime (objective 72, TRD 72-15, INST-03; report-only since objective 78, TRD 78-06).
//
// What the rename leaves in the user's home besides legacy skills and agents (check 15). Each is one entry in
// details.findings; the check's severity is the worst of them, and every one is a report-only warning:
//
//   plugin-enabled        the old plugin (LEGACY.plugin) is installed and enabled beside AOForge, so its hooks may
//                         run twice. fix_command is `claude plugin disable <old plugin>`. The doctor never edits Claude
//                         Code's settings and never runs a `claude plugin` command.
//   runtime-not-migrated  the old runtime home exists and no 3.0.x session migrated it (no LEGACY_STATE_MARKER under the
//                         new home). 3.1 no longer migrates it: the finding names AOForge SHIM_RELEASE (one session
//                         carries it over) or the manual copy in the migration guide.
//   runtime-leftover      the old runtime home is still there after a 3.0.x migration. fix_command is the manual move
//                         into ~/.claude/aoforge/backups/legacy-<old runtime dir>-runtime-<date>/ (backup-prune never
//                         enters a legacy-* directory), after disabling the old plugin when it is enabled (it keeps
//                         writing there).
//   legacy-env            variables with the old prefix are set (ctx.env). They are no longer read since 3.1.0; the
//                         finding names each with its AOForge form. Renaming them is the user's shell profile or launch
//                         environment, not a file the doctor may edit.
//
// Decision (TRD 78-06): KEEP, report-only (the fix is removed). The old plugin enabled beside AOForge runs its gates
// twice, the pre-rename runtime home holds calibration and the GitHub outbox that 3.1 no longer carries over, and the
// old variables now silently stop working: each needs one report. The conversions belong to 3.0.x (a 3.0.x session,
// or `doctor --global --fix` under 3.0.x) or to the documented manual steps. The SessionStart coexistence-guard notice
// reports the same findings except the leftover after a migration.
//
// Detection is coexistence.cjs's (the one module for global pre-rename detection). Reads only ctx.userHome, ctx.paths,
// ctx.env and ctx.now. Every legacy name comes from legacy-names.cjs.

const path = require('path');

const coexistence = require('../coexistence.cjs');
const { NAMES, LEGACY, SHIM_RELEASE } = require('../legacy-names.cjs');

const DISABLE_COMMAND = `claude plugin disable ${LEGACY.plugin}`;
const BACKUP_PREFIX = `legacy-${LEGACY.runtimeDir}-runtime`;

/** A shell word: as is when it holds only safe characters, else single-quoted. */
function shellWord(s) {
  return /^[A-Za-z0-9_./,:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The current state of the home: the old plugin, the old runtime home and its marker, the old variables. */
function discover(ctx) {
  const runtime = coexistence.legacyRuntimeState(ctx.userHome);
  return {
    plugin: coexistence.detectLegacyPlugin({ userHome: ctx.userHome }),
    legacyHome: ctx.paths.legacyMirrorDir,
    present: runtime.present,
    migrated: runtime.migrated,
    variables: coexistence.legacyEnvVariables(ctx.env),
  };
}

/** The manual move of the leftover old home into the backups directory, dated by ctx.now. */
function moveCommand(ctx, legacyHome) {
  const target = path.join(ctx.paths.backupsDir, `${BACKUP_PREFIX}-${ctx.now.toISOString().slice(0, 10)}`);
  return `mkdir -p ${shellWord(target)} && mv ${shellWord(legacyHome)} ${shellWord(target)}/`;
}

function findingsFor(ctx, state) {
  const findings = [];
  const { plugin } = state;
  const enabled = plugin.installed && plugin.enabled;

  if (enabled) {
    findings.push({
      kind: 'plugin-enabled',
      severity: 'warn',
      message: coexistence.coexistenceMessage(plugin),
      fixable: false,
      fix_command: DISABLE_COMMAND,
    });
  }

  if (state.present && !state.migrated) {
    findings.push({
      kind: 'runtime-not-migrated',
      severity: 'warn',
      message: `the ${LEGACY.product} runtime home ${state.legacyHome} was never migrated to ${ctx.paths.mirrorDir} `
        + `(calibration, estimates, backups and the GitHub outbox); ${NAMES.product} ${coexistence.REMOVED_IN} no longer `
        + `migrates it: run ${NAMES.product} ${SHIM_RELEASE} once (one session migrates it), or copy what you need by `
        + `hand (see ${coexistence.MIGRATION_GUIDE})`,
      fixable: false,
    });
  } else if (state.present) {
    const move = moveCommand(ctx, state.legacyHome);
    findings.push({
      kind: 'runtime-leftover',
      severity: 'warn',
      message: `the ${LEGACY.product} runtime home ${state.legacyHome} is left over after a ${SHIM_RELEASE} migration; `
        + `move it yourself into ${ctx.paths.backupsDir}/${BACKUP_PREFIX}-<date>/ (nothing reads it)`
        + (enabled ? `, after disabling ${LEGACY.plugin}: it keeps writing there` : ''),
      fixable: false,
      fix_command: enabled ? `${DISABLE_COMMAND} && ${move}` : move,
    });
  }

  if (state.variables.length > 0) {
    findings.push({
      kind: 'legacy-env',
      severity: 'warn',
      message: `legacy environment variables are set: ${state.variables.map((v) => `${v.name} (use ${v.aoforge})`).join(', ')}; `
        + `no longer read since ${coexistence.REMOVED_IN}: rename each where it is set (shell profile or launch environment)`,
      fixable: false,
      variables: state.variables,
    });
  }
  return findings;
}

function run(ctx) {
  const state = discover(ctx);
  const findings = findingsFor(ctx, state);
  const details = {
    findings,
    legacy_home: state.legacyHome,
    legacy_home_present: state.present,
    migrated: state.migrated,
    plugin: state.plugin,
  };

  if (findings.length === 0) {
    return {
      severity: 'ok',
      finding: `no ${LEGACY.product} plugin, runtime home or environment variables left behind`,
      fixable: false,
      details,
    };
  }

  const result = {
    severity: findings.some((f) => f.severity === 'error') ? 'error' : 'warn',
    finding: findings.map((f) => f.message).join('; '),
    fixable: false,
    details,
  };
  // The leftover's command already starts with the disable command when the plugin is enabled: name it once.
  const commands = findings.map((f) => f.fix_command).filter(Boolean);
  const manual = commands.filter((c) => !commands.some((other) => other !== c && other.startsWith(`${c} && `)));
  if (manual.length) result.fix_command = [...new Set(manual)].join('; ');
  return result;
}

module.exports = {
  id: 'legacy-plugin-runtime',
  title: 'Legacy plugin, runtime home and environment left by the rename',
  scope: 'global',
  run,
};
