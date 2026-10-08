'use strict';

// upgrade-cli.cjs — `aof-tools upgrade` (TRD 36-03).
//
//   aof-tools upgrade [--check|--apply] [--only id[,id]] [--confirm] [--path dir]
//                    [--kind k] [--default-work w] [--global] [--raw]
//
// Project mode drives upgrade.cjs: `--check` (the default) lists what is pending and never writes;
// `--apply` runs the applicable `auto` migrations, backs up outside the repo first, and stamps
// .planning/config.json. `confirm` migrations run only when named with `--only <id>` or allowed by
// `--apply --confirm`; their inputs arrive as `--kind` / `--default-work` (migration 0006).
//
// `--global` drives global-upgrade.cjs against ~/.claude instead: alone it only plans (dry run);
// `--global --apply` moves legacy files and updates the managed CLAUDE.md block but never adopts a
// hand-written section; `--global --confirm` does the same and also adopts.
//
// userHome is os.homedir() and pluginVersion is helpers.pluginVersion(), so a spawned test controls
// both with HOME=<fake> and the checkout's plugin.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

const helpers = require('./helpers.cjs');

const BOOL_FLAGS = {
  '--check': 'check',
  '--apply': 'apply',
  '--confirm': 'confirm',
  '--global': 'global',
  '--prune': 'prune',
  '--dry-run': 'dryRun',
  '--register': 'register',
};
const VALUE_FLAGS = {
  '--only': 'only',
  '--path': 'path',
  '--kind': 'kind',
  '--default-work': 'defaultWork',
};
const VALID_FLAGS = [...Object.keys(BOOL_FLAGS), ...Object.keys(VALUE_FLAGS), '--raw', '--help'];
const PROJECT_ONLY_FLAGS = ['--only', '--path', '--kind', '--default-work'];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * parseUpgradeArgs(args) -> { mode: 'check'|'apply', global, confirm, only, path, kind, defaultWork }
 *
 * `args` excludes the `upgrade` word and `--raw` (aof-tools strips it). Accepts `--flag value` and
 * `--flag=value`; `--only` takes a comma list and may repeat. Throws UsageError on an unknown flag,
 * a missing value, `--check` with `--apply`, project-only flags with `--global`, or a project
 * `--confirm` without `--apply`.
 */
function parseUpgradeArgs(args = []) {
  const seen = { check: false, apply: false, confirm: false, global: false, prune: false, dryRun: false, register: false };
  const values = { path: null, kind: null, defaultWork: null };
  const only = [];
  const used = new Set();

  for (let i = 0; i < args.length; i++) {
    const token = String(args[i]);
    let flag = token;
    let inline = null;
    const eq = token.indexOf('=');
    if (token.startsWith('--') && eq > 2) {
      flag = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }

    if (Object.prototype.hasOwnProperty.call(BOOL_FLAGS, flag)) {
      if (inline !== null) throw new UsageError(`${flag} takes no value`);
      seen[BOOL_FLAGS[flag]] = true;
      used.add(flag);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(VALUE_FLAGS, flag)) {
      let value = inline;
      if (value === null) {
        value = args[i + 1];
        if (value !== undefined && String(value).startsWith('--')) value = undefined;
        if (value !== undefined) i++;
      }
      if (value === undefined || String(value).trim() === '') {
        throw new UsageError(`${flag} needs a value`);
      }
      used.add(flag);
      if (flag === '--only') {
        only.push(...String(value).split(',').map((s) => s.trim()).filter(Boolean));
      } else {
        values[VALUE_FLAGS[flag]] = String(value);
      }
      continue;
    }

    const what = token.startsWith('-') ? 'flag' : 'argument';
    throw new UsageError(`unknown ${what} ${token}; valid flags: ${VALID_FLAGS.join(', ')}`);
  }

  if (seen.check && seen.apply) {
    throw new UsageError('--check and --apply cannot be used together; --check lists what is pending, --apply runs it');
  }

  if (seen.global) {
    const bad = PROJECT_ONLY_FLAGS.filter((f) => used.has(f));
    if (bad.length) {
      throw new UsageError(`--global upgrades ~/.claude and does not take ${bad.join(', ')} (those are project flags)`);
    }
  } else if (seen.confirm && !seen.apply) {
    throw new UsageError('--confirm only means something with --apply (or --global); use --apply --confirm');
  }

  if (seen.prune) {
    if (seen.apply || seen.check || seen.global) {
      throw new UsageError('--prune stands alone: it does not take --apply, --check or --global');
    }
  } else if (seen.dryRun) {
    throw new UsageError('--dry-run only means something with --prune; use --prune --dry-run');
  }

  // Project: --apply writes, anything else checks. Global: --apply or --confirm writes unless
  // --check asks for a preview (`--global --check --confirm` previews the adoption).
  const writes = seen.apply || (seen.global && seen.confirm && !seen.check);
  return {
    mode: writes ? 'apply' : 'check',
    global: seen.global,
    confirm: seen.confirm,
    only: only.length ? only : null,
    path: values.path,
    kind: values.kind,
    defaultWork: values.defaultWork,
    prune: seen.prune,
    dryRun: seen.dryRun,
    register: seen.register,
  };
}

// ─── Summaries (--raw) ────────────────────────────────────────────────────────

function idList(items) {
  return items.map((x) => x.id).join(',');
}

function projectSummary(report, mode) {
  const parts = [];
  if (mode === 'apply' && !(report.applied.length === 0 && report.up_to_date)) {
    parts.push(report.applied.length
      ? `applied ${report.applied.length} (${idList(report.applied)})`
      : 'applied 0');
    parts.push(`${report.changed_files.length} file(s) changed`);
    if (report.backup) parts.push(`backup ${report.backup}`);
  }
  if (report.pending.length) parts.push(`${report.pending.length} pending (${idList(report.pending)})`);
  if (report.pending_confirm.length) {
    const n = report.pending_confirm.length;
    parts.push(`${n} ${n === 1 ? 'needs' : 'need'} confirmation (${idList(report.pending_confirm)})`);
  }
  if (report.failed.length) {
    parts.push(`${report.failed.length} failed (${report.failed.map((f) => `${f.id} ${f.phase}: ${f.error}`).join(' | ')})`);
  }
  if (report.up_to_date) {
    parts.push(`up to date (v${report.to})`);
  } else if (mode === 'check' && parts.length === 0) {
    parts.push(`nothing pending; stamped v${report.from || 'never'}, AOForge v${report.to} (run --apply to stamp)`);
  }
  return parts.join('; ');
}

function pruneSummary(report) {
  if (report.skipped === 'no-backups') return 'no backups';
  return report.dry_run ? `would prune ${report.removed.length}` : `pruned ${report.removed.length} backup(s)`;
}

function globalSummary(result) {
  const parts = [];
  const moved = result.legacy.moved.length;
  parts.push(moved ? `legacy: ${result.dryRun ? 'would move' : 'moved'} ${moved} file(s)` : 'legacy: none');
  parts.push(`CLAUDE.md block: ${result.block.action}${result.block.backup ? ` (backup ${result.block.backup})` : ''}`);
  if (result.block.action === 'adopt_pending') {
    parts.push('run `aof-tools upgrade --global --confirm` to adopt the managed block');
  }
  if (result.dryRun) parts.push('check only; nothing written');
  return parts.join('; ');
}

// ─── Command ──────────────────────────────────────────────────────────────────

function isAoforgeProject(root) {
  try {
    return fs.statSync(path.join(root, '.planning')).isDirectory();
  } catch {
    return false;
  }
}

function runPruneCmd(opts, raw) {
  const { runPrune } = require('./backup-prune.cjs');
  const report = runPrune({ userHome: os.homedir(), dryRun: !!opts.dryRun });
  helpers.output(report, raw, pruneSummary(report), 0);
}

function runRegister(cwd, opts, raw) {
  const { register } = require('./backup-prune.cjs');
  const projectRoot = path.resolve(cwd, opts.path || '.');
  const result = register({ userHome: os.homedir(), projectRoot });
  helpers.output(result, raw, `registered ${result.key}${result.created ? '' : ' (already registered)'}`, 0);
}

function runGlobal(opts, raw) {
  const { runGlobalUpgrade } = require('./global-upgrade.cjs');
  let result;
  try {
    result = runGlobalUpgrade({
      userHome: os.homedir(),
      pluginVersion: helpers.pluginVersion(),
      confirm: opts.confirm,
      dryRun: opts.mode !== 'apply',
    });
  } catch (e) {
    helpers.error(`upgrade --global: ${e.message}`);
    return;
  }
  helpers.output(result, raw, globalSummary(result), 0);
}

function runProject(cwd, opts, raw) {
  const upgrade = require('./upgrade.cjs');
  const projectRoot = path.resolve(cwd, opts.path || '.');
  if (!isAoforgeProject(projectRoot)) {
    helpers.error(`not an AOForge project: ${projectRoot} has no .planning/ directory`);
    return;
  }

  const options = {};
  if (opts.kind) options.kind = opts.kind;
  if (opts.defaultWork) options.defaultWork = opts.defaultWork;
  const common = {
    projectRoot,
    userHome: os.homedir(),
    pluginVersion: helpers.pluginVersion(),
    only: opts.only,
    options,
  };

  let report;
  try {
    report = opts.mode === 'apply'
      ? upgrade.apply({ ...common, confirm: opts.confirm })
      : upgrade.check(common);
  } catch (e) {
    if (e instanceof upgrade.RegistryError) {
      const failure = { mode: opts.mode, project_root: projectRoot, error: 'registry', message: e.message, problems: e.problems };
      helpers.output(failure, raw, `upgrade registry invalid: ${e.problems.join('; ')}`, 1);
      return;
    }
    helpers.error(`upgrade: ${e.message}`);
    return;
  }

  const result = { mode: opts.mode, project_root: projectRoot, ...report };
  helpers.output(result, raw, projectSummary(report, opts.mode), report.failed.length ? 1 : 0);
}

/**
 * cmdUpgrade(cwd, args, raw) — the `aof-tools upgrade` entry point. Exits via helpers.output/error:
 * 0 on success, 1 on a usage error, a non-project path, a RegistryError or any failed migration.
 */
function cmdUpgrade(cwd, args, raw) {
  let opts;
  try {
    opts = parseUpgradeArgs(args);
  } catch (e) {
    if (e instanceof UsageError) {
      helpers.error(`upgrade: ${e.message}`);
      return;
    }
    throw e;
  }
  if (opts.prune) runPruneCmd(opts, raw);
  else if (opts.register) runRegister(cwd, opts, raw);
  else if (opts.global) runGlobal(opts, raw);
  else runProject(cwd, opts, raw);
}

module.exports = {
  cmdUpgrade,
  parseUpgradeArgs,
  projectSummary,
  globalSummary,
  UsageError,
  VALID_FLAGS,
};
