'use strict';

/**
 * 32-backups.cjs — TRD 45-07 (DOC-05)
 *
 * `aof-tools upgrade` snapshots a project before it writes, under
 * `<home>/.claude/aoforge/backups/<slug>-<hash8>/<timestamp>/` (`ctx.paths.backupsDir`). Retention
 * is backup-prune's job (`backups.retain_days` / `backups.keep_min` in
 * `<home>/.claude/aoforge/global-config.json`); this check never re-plans it. It asks
 * `runPrune({dryRun: true})` what would go and translates the answer:
 *
 *   anything past retention        -> warn, fixable (the fix IS runPrune, so exactly that set goes)
 *   nothing prunable but too big   -> warn, NOT fixable, fix_command names the retention keys
 *   otherwise                      -> ok, details {bytes, repos, kept}
 *
 * Global scope; `userHome` and every path come from ctx (never os.homedir()). The only deletion
 * is runPrune's, which is confined to real directories under the backups root.
 */

const fs = require('fs');
const path = require('path');
const backupPrune = require('../backup-prune.cjs');

const DEFAULT_WARN_BYTES = 500 * 1024 * 1024;
const WARN_BYTES_ENV = 'AOFORGE_DOCTOR_BACKUP_WARN_BYTES';

function warnThreshold(env) {
  const raw = env && env[WARN_BYTES_ENV];
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n > 0) return n;
  }
  return DEFAULT_WARN_BYTES;
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

/** Recursive byte size. lstat, so a symlink is counted as a link and never followed; per-entry try. */
function dirSize(dir) {
  let total = 0;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const st = fs.lstatSync(full);
      if (st.isDirectory()) total += dirSize(full);
      else total += st.size;
    } catch { /* one unreadable entry must not stop the walk */ }
  }
  return total;
}

function repoCount(userHome) {
  try {
    return new Set(backupPrune.listBackups(userHome).map((b) => b.repo)).size;
  } catch {
    return 0;
  }
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function run(ctx) {
  const root = ctx.paths.backupsDir;
  if (!fs.existsSync(root)) {
    return { severity: 'ok', finding: 'no backups', fixable: false, details: { bytes: 0, repos: 0, kept: 0 } };
  }

  const dry = backupPrune.runPrune({ userHome: ctx.userHome, now: ctx.now, dryRun: true });
  const bytes = dirSize(root);
  const repos = repoCount(ctx.userHome);
  const details = { bytes, repos, kept: dry.kept };
  if (dry.warnings && dry.warnings.length) details.warnings = dry.warnings;

  if (dry.removed.length > 0) {
    return {
      severity: 'warn',
      finding: `${plural(dry.removed.length, 'backup', 'backups')} past retention ` +
        `(older than ${dry.retain_days} days, beyond the newest ${dry.keep_min} per repo)`,
      fixable: true,
      details: { ...details, removable: dry.removed, retain_days: dry.retain_days, keep_min: dry.keep_min },
    };
  }

  const threshold = warnThreshold(ctx.env);
  if (bytes > threshold) {
    const config = path.join(ctx.paths.mirrorDir, 'global-config.json');
    return {
      severity: 'warn',
      finding: `backups use ${formatBytes(bytes)} across ${plural(repos, 'repo', 'repos')} ` +
        `(over the ${formatBytes(threshold)} threshold) and none are past retention`,
      fixable: false,
      fix_command: `edit ${config} and lower backups.retain_days (now ${dry.retain_days}) and/or ` +
        `backups.keep_min (now ${dry.keep_min}), then run: node ${ctx.dfToolsPath} upgrade --prune`,
      details: { ...details, retain_days: dry.retain_days, keep_min: dry.keep_min },
    };
  }

  return {
    severity: 'ok',
    finding: `${formatBytes(bytes)} of backups across ${plural(repos, 'repo', 'repos')}, all within retention`,
    fixable: false,
    details,
  };
}

function fix(ctx) {
  const report = backupPrune.runPrune({ userHome: ctx.userHome, now: ctx.now });
  // Absolute, not backups-root-relative: the engine treats relative `changed` entries as
  // project paths (ctx.changedThisRun), and none of these are.
  const changed = report.removed.map((rel) => path.join(ctx.paths.backupsDir, ...rel.split('/')));
  if (report.failed.length > 0) {
    return {
      applied: false,
      refused: `could not remove ${plural(report.failed.length, 'backup', 'backups')}: ` +
        report.failed.map((f) => `${f.path} (${f.error})`).join('; '),
      changed,
    };
  }
  return {
    applied: true,
    changed,
    notes: `removed ${plural(report.removed.length, 'backup', 'backups')} past retention ` +
      `(retain_days ${report.retain_days}, keep_min ${report.keep_min}); kept ${report.kept}`,
  };
}

module.exports = {
  id: 'backups',
  title: 'Upgrade backups',
  scope: 'global',
  run,
  fix,
  DEFAULT_WARN_BYTES,
  WARN_BYTES_ENV,
};
