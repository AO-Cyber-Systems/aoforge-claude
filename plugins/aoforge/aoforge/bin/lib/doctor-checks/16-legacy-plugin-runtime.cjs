'use strict';

// Doctor check: legacy-plugin-runtime (objective 72, TRD 72-15, INST-03).
//
// What the rename leaves in the user's home besides legacy skills and agents (check 15). Each is one entry in
// details.findings; the check's severity is the worst of them, and every one is a warning:
//
//   plugin-enabled        the old plugin (LEGACY.plugin) is installed and enabled beside AOForge, so its hooks may
//                         run twice. REPORT-ONLY: fix_command is `claude plugin disable <old plugin>`. The doctor
//                         never edits Claude Code's settings and never runs a `claude plugin` command.
//   runtime-not-migrated  the old runtime home (ctx.paths.legacyMirrorDir) exists and the new home has no migration
//                         marker. FIXABLE: the fix runs 72-07's migrateLegacyRuntime, the same one-time migration
//                         sync-runtime runs on the first AOForge session (copy, never overwrite; marker last).
//   runtime-leftover      the old runtime home is still there after the migration. FIXABLE only while the old plugin
//                         is not enabled (an enabled one keeps mirroring into it): the fix moves the whole directory
//                         into ~/.claude/aoforge/backups/legacy-<old runtime dir>-runtime-<ts>/ through
//                         global-upgrade.moveLegacy (rename, or a verified copy across devices). Nothing is deleted,
//                         and backup-prune never enters a legacy-* directory. While the old plugin is enabled the fix
//                         is refused and names the disable command.
//   legacy-env            variables with the old prefix are set (ctx.env). AOForge honors them for one release
//                         (compat.aliasLegacyEnv). REPORT-ONLY: names each and its AOForge form; renaming them is the
//                         user's shell profile or launch environment, not a file the doctor may edit.
//
// The check is fixable when at least one finding has a fix and every finding that has one is safe now; report-only
// findings never block it. A fix takes one step per run (migrate, or move the leftover), so after a migration the
// re-run reports the leftover and the next `doctor --fix` cleans it up.
//
// Reads only ctx.userHome, ctx.paths and ctx.env. Every legacy name comes from legacy-names.cjs.

const fs = require('fs');
const path = require('path');

const { detectLegacyPlugin, coexistenceMessage } = require('../coexistence.cjs');
const { migrateLegacyRuntime, migrationPending, MARKER_FILE } = require('../runtime-state-migrate.cjs');
const globalUpgrade = require('../global-upgrade.cjs');
const { NAMES, LEGACY, SHIM_REMOVAL } = require('../legacy-names.cjs');

const DOCTOR_FIX = 'node ~/.claude/aoforge/bin/aof-tools.cjs doctor --global --fix';
const DISABLE_COMMAND = `claude plugin disable ${LEGACY.plugin}`;
const BACKUP_PREFIX = `legacy-${LEGACY.runtimeDir}-runtime`;

/** Kinds whose finding a fix() can act on. */
const FIX_KINDS = new Set(['runtime-not-migrated', 'runtime-leftover']);

function isDir(p) {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Legacy-prefixed variables in ctx.env, sorted, each with its AOForge form. The bare prefix is not a variable. */
function legacyEnvVariables(env) {
  return Object.keys(env || {})
    .filter((k) => k.startsWith(LEGACY.envPrefix) && k.length > LEGACY.envPrefix.length && env[k] !== undefined)
    .sort()
    .map((name) => ({ name, aoforge: NAMES.envPrefix + name.slice(LEGACY.envPrefix.length) }));
}

/** The current state of the home: the old plugin, the old runtime home, the marker. */
function discover(ctx) {
  const plugin = detectLegacyPlugin({ userHome: ctx.userHome });
  const legacyHome = ctx.paths.legacyMirrorDir;
  const marker = path.join(ctx.paths.mirrorDir, MARKER_FILE);
  return {
    plugin,
    legacyHome,
    marker,
    legacyHomePresent: isDir(legacyHome),
    pending: migrationPending({ userHome: ctx.userHome }),
  };
}

function findingsFor(ctx, state) {
  const findings = [];
  const { plugin } = state;

  if (plugin.installed && plugin.enabled) {
    findings.push({
      kind: 'plugin-enabled',
      severity: 'warn',
      message: coexistenceMessage(plugin),
      fixable: false,
      fix_command: DISABLE_COMMAND,
    });
  }

  if (state.legacyHomePresent && state.pending) {
    findings.push({
      kind: 'runtime-not-migrated',
      severity: 'warn',
      message: `the ${LEGACY.product} runtime home ${state.legacyHome} has not been migrated to ${ctx.paths.mirrorDir} `
        + '(calibration, estimates, backups and the outbox); the fix runs the one-time migration',
      fixable: true,
      fix_command: DOCTOR_FIX,
    });
  } else if (state.legacyHomePresent) {
    const enabled = plugin.installed && plugin.enabled;
    findings.push({
      kind: 'runtime-leftover',
      severity: 'warn',
      message: `the ${LEGACY.product} runtime home ${state.legacyHome} is left over after the migration`
        + (enabled
          ? `; it cannot be moved while ${LEGACY.plugin} is enabled (it keeps writing there)`
          : `; the fix moves it whole into ${ctx.paths.backupsDir}/${BACKUP_PREFIX}-<timestamp>/`),
      fixable: !enabled,
      fix_command: enabled ? `${DISABLE_COMMAND}, then ${DOCTOR_FIX}` : DOCTOR_FIX,
    });
  }

  const variables = legacyEnvVariables(ctx.env);
  if (variables.length) {
    findings.push({
      kind: 'legacy-env',
      severity: 'warn',
      message: `legacy environment variables are set: ${variables.map((v) => `${v.name} (use ${v.aoforge})`).join(', ')}; `
        + `${NAMES.product} honors them until ${SHIM_REMOVAL}, so rename them where they are set (shell profile or launch environment)`,
      fixable: false,
      variables,
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
    legacy_home_present: state.legacyHomePresent,
    migrated: !state.pending && fs.existsSync(state.marker),
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

  const withFix = findings.filter((f) => FIX_KINDS.has(f.kind));
  const fixable = withFix.length > 0 && withFix.every((f) => f.fixable);
  const result = {
    severity: findings.some((f) => f.severity === 'error') ? 'error' : 'warn',
    finding: findings.map((f) => f.message).join('; '),
    fixable,
    details,
  };
  const manual = [...new Set(findings.filter((f) => !f.fixable && f.fix_command).map((f) => f.fix_command))];
  if (manual.length) result.fix_command = manual.join('; ');
  else if (!fixable && withFix.length) result.fix_command = DOCTOR_FIX;
  return result;
}

function fix(ctx) {
  // Re-discover: the home may have changed since run().
  const state = discover(ctx);

  if (state.legacyHomePresent && state.pending) {
    const r = migrateLegacyRuntime({ userHome: ctx.userHome, now: ctx.now });
    if (!r.ran) return { applied: false, notes: `migration did not run (${r.reason})` };
    return {
      applied: true,
      changed: [r.marker],
      notes: `migrated ${state.legacyHome} to ${ctx.paths.mirrorDir}: ${r.copied.length} copied, ${r.moved.length} moved, `
        + `${r.skipped.length} skipped; marker ${r.marker}. Run the doctor again to move the old home into the backups`,
    };
  }

  if (state.legacyHomePresent) {
    if (state.plugin.installed && state.plugin.enabled) {
      return {
        applied: false,
        refused: `${LEGACY.plugin} is still enabled and keeps writing ${state.legacyHome}; disable it first: ${DISABLE_COMMAND}`,
      };
    }
    const { moved, backupDir } = globalUpgrade.moveLegacy(ctx.userHome, [LEGACY.runtimeDir], {
      now: ctx.now,
      prefix: BACKUP_PREFIX,
    });
    if (moved.length === 0) return { applied: false, notes: 'nothing moved' };
    return {
      applied: true,
      changed: [state.legacyHome],
      backup: backupDir,
      notes: `moved ${state.legacyHome} into ${backupDir} (nothing deleted; move it back to restore it)`,
    };
  }

  return { applied: false, notes: `nothing to fix: no ${LEGACY.product} runtime home` };
}

module.exports = {
  id: 'legacy-plugin-runtime',
  title: 'Legacy plugin, runtime home and environment left by the rename',
  scope: 'global',
  run,
  fix,
  legacyEnvVariables,
};
