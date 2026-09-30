'use strict';

// Doctor engine (objective 45, DOC-04). `df-tools doctor` diagnoses DevFlow environment problems
// and, only under `--fix`, applies the fixes the checks themselves mark safe.
//
// The engine owns NO check logic. Checks are modules in ./doctor-checks/NN-<id>.cjs, loaded in
// filename order (registry pattern of upgrade.loadRegistry). The contract is documented in
// ./doctor-checks/README.md and as the typedefs below.
//
// Rules:
//   - Read-only by default: without `fix`, no check's fix() is ever called.
//   - Under `fix`: fix() runs only for results with fixable:true, in registry order; each applied
//     fix's project-relative `changed` paths join ctx.changedThisRun before the next fix runs; then
//     every check is re-run and the report carries the post-fix results.
//   - A contract violation, a throwing run() or a throwing fix() becomes an error result / a
//     refused fix entry. The run never crashes and later checks still run.
//   - Composition, not duplication: checks call the existing validate-health, upgrade,
//     backup-prune and telemetry modules and translate their answers. This file never
//     re-implements any of them.
//   - DOC-06 safety lives in the checks: a check decides `fixable` with its safety guard already
//     applied (e.g. no index-changing fix while unrelated changes are staged, where paths in
//     ctx.changedThisRun count as the doctor's own work, not foreign work).
//
// `userHome` is always injected (the CLI passes os.homedir(), tests a fake home) and every
// machine path derives from it in buildContext, so a test never touches the real ~/.claude.
// Nothing here calls helpers.output()/error() (they process.exit); everything returns values.

const fs = require('fs');
const path = require('path');
const helpers = require('./helpers.cjs');

const DEFAULT_CHECKS_DIR = path.join(__dirname, 'doctor-checks');
const DEFAULT_DF_TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// NN-<kebab slug>.cjs. The slug admits no '.', so `10-x.test.cjs` never matches.
const CHECK_FILE_RE = /^(\d{2})-([a-z0-9-]+)\.cjs$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCOPES = ['global', 'project'];
const SEVERITIES = ['ok', 'warn', 'error'];
const SCHEMA_VERSION = 1;

/**
 * @typedef {Object} DoctorPaths
 * @property {string} claudeDir            <home>/.claude
 * @property {string} mirrorDir            <home>/.claude/devflow
 * @property {string} installedPluginsJson <home>/.claude/plugins/installed_plugins.json
 * @property {string} pluginCacheRoot      <home>/.claude/plugins/cache/aocyber/devflow
 * @property {string} progressGuardDir     env.DEVFLOW_PROGRESS_GUARD_DIR || <mirrorDir>/state/progress-guard
 * @property {string} awarenessDir         env.DEVFLOW_AWARENESS_DIR || <mirrorDir>/state/awareness
 * @property {string} backupsDir           <mirrorDir>/backups
 */

/**
 * @typedef {Object} DoctorContext
 * @property {string|null} projectRoot     absolute realpath of the DevFlow project root, or null
 * @property {string} userHome             absolute; CLI passes os.homedir(); tests pass a fake home
 * @property {Object} env                  process.env or injected (DEVFLOW_* overrides live here)
 * @property {Date} now
 * @property {string} pluginVersion        running engine version (helpers.pluginVersion())
 * @property {string} dfToolsPath          absolute path to df-tools.cjs (for checks that spawn it)
 * @property {Set<string>} changedThisRun  project-relative posix paths changed by EARLIER fixes in
 *                                         this --fix run; safety guards (DOC-06) treat these as the
 *                                         doctor's own, not foreign work
 * @property {DoctorPaths} paths           all derived from userHome/env — single place to override
 */

/**
 * @typedef {Object} CheckResult           what run(ctx) returns
 * @property {'ok'|'warn'|'error'} severity
 * @property {string} finding              one line
 * @property {boolean} fixable             true only if fix() is safe + reversible NOW (DOC-06 considered)
 * @property {string} [fix_command]        exact command for report-only / refused cases
 * @property {Object} [details]
 */

/**
 * @typedef {Object} FixOutcome            what fix(ctx, result) returns
 * @property {boolean} applied
 * @property {string} [refused]
 * @property {string[]} [changed]
 * @property {string} [backup]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} DoctorCheck           module.exports of doctor-checks/NN-<id>.cjs
 * @property {string} id                   unique kebab id; also the result id
 * @property {string} title
 * @property {'global'|'project'} scope    project checks only run when ctx.projectRoot is set
 * @property {(ctx: DoctorContext) => CheckResult} run
 * @property {(ctx: DoctorContext, result: CheckResult) => FixOutcome} [fix]
 */

// ─── Registry ─────────────────────────────────────────────────────────────────

function firstLine(value) {
  return String(value === undefined || value === null ? '' : value).split('\n')[0].trim();
}

function errorMessage(e) {
  return firstLine(e && e.message !== undefined ? e.message : e) || 'unknown error';
}

/** Contract problems of one module, as a list of short phrases. [] = valid. */
function contractIssues(mod) {
  if (!mod || typeof mod !== 'object') return ['does not export an object'];
  const issues = [];
  if (typeof mod.id !== 'string' || !ID_RE.test(mod.id)) {
    issues.push(`id must be a kebab-case string (got ${JSON.stringify(mod.id)})`);
  }
  if (typeof mod.title !== 'string' || !mod.title.trim()) {
    issues.push('missing title (must be a non-empty string)');
  }
  if (!SCOPES.includes(mod.scope)) {
    issues.push(`scope must be one of ${SCOPES.join('|')} (got ${JSON.stringify(mod.scope)})`);
  }
  if (typeof mod.run !== 'function') issues.push('missing run (must be a function)');
  if (mod.fix !== undefined && typeof mod.fix !== 'function') issues.push('fix must be a function when present');
  return issues;
}

/**
 * Validate entries in order and mark a repeated id invalid (the first owner keeps it).
 * Entries: {file, id, mod} | {file, id, invalid}. Mutates and returns the array.
 */
function vetEntries(entries) {
  const owners = new Map();
  for (const entry of entries) {
    if (entry.invalid !== undefined) continue;
    const issues = contractIssues(entry.mod);
    if (issues.length) {
      entry.invalid = issues.join('; ');
      delete entry.mod;
      continue;
    }
    if (owners.has(entry.mod.id)) {
      entry.invalid = `duplicate id ${entry.mod.id} (also in ${owners.get(entry.mod.id)})`;
      delete entry.mod;
      continue;
    }
    owners.set(entry.mod.id, entry.file);
  }
  return entries;
}

/**
 * loadChecks({ checksDir }) -> [{file, id, mod} | {file, id, invalid: reason}], sorted by filename.
 *
 * Only `NN-<slug>.cjs` files load; `*.test.cjs`, README.md and anything else are ignored. A
 * missing dir is an empty registry. A module that fails to load or violates the contract is
 * returned as `{file, id: <filename slug>, invalid}` — never thrown — so the engine can report it
 * as one error result and keep going.
 */
function loadChecks({ checksDir = DEFAULT_CHECKS_DIR } = {}) {
  if (!checksDir || !fs.existsSync(checksDir) || !fs.statSync(checksDir).isDirectory()) return [];

  const files = fs.readdirSync(checksDir).filter((name) => CHECK_FILE_RE.test(name)).sort();
  const entries = [];
  for (const file of files) {
    const abs = path.join(checksDir, file);
    if (!fs.statSync(abs).isFile()) continue;
    const id = CHECK_FILE_RE.exec(file)[2];
    let mod;
    try {
      delete require.cache[require.resolve(abs)];
      mod = require(abs);
    } catch (e) {
      entries.push({ file, id, invalid: `failed to load: ${errorMessage(e)}` });
      continue;
    }
    entries.push({ file, id, mod });
  }
  return vetEntries(entries);
}

/**
 * Normalize `opts.checks` (preloaded) into loader entries. Accepts loader entries
 * ({file, mod} / {file, invalid}) or bare check modules, which are validated like loaded ones.
 */
function normalizeProvidedChecks(checks) {
  const entries = checks.map((c, i) => {
    if (c && typeof c === 'object' && ('mod' in c || 'invalid' in c) && 'file' in c) {
      const slug = CHECK_FILE_RE.exec(String(c.file));
      const fallbackId = slug ? slug[2] : String(c.file);
      const entry = { file: c.file, id: c.id || fallbackId };
      if (c.invalid !== undefined) entry.invalid = c.invalid;
      else entry.mod = c.mod;
      return entry;
    }
    const id = c && typeof c.id === 'string' && c.id ? c.id : `check-${i + 1}`;
    return { file: `<provided:${id}>`, id, mod: c };
  });
  return vetEntries(entries);
}

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * buildContext({projectRoot, userHome, env, now, pluginVersion, dfToolsPath}) -> DoctorContext
 *
 * `userHome` must be an absolute path (throws otherwise). `projectRoot` is resolved to its
 * realpath when it exists. Every machine path is derived here from userHome/env.
 */
function buildContext({ projectRoot = null, userHome, env = process.env, now, pluginVersion, dfToolsPath } = {}) {
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome)) {
    throw new TypeError(`doctor: userHome must be an absolute path (got ${JSON.stringify(userHome)})`);
  }
  const theEnv = env || {};

  let root = null;
  if (projectRoot) {
    root = path.resolve(projectRoot);
    try { root = fs.realpathSync(root); } catch { /* keep the resolved path */ }
  }

  const claudeDir = path.join(userHome, '.claude');
  const mirrorDir = path.join(claudeDir, 'devflow');
  const paths = {
    claudeDir,
    mirrorDir,
    installedPluginsJson: path.join(claudeDir, 'plugins', 'installed_plugins.json'),
    pluginCacheRoot: path.join(claudeDir, 'plugins', 'cache', 'aocyber', 'devflow'),
    progressGuardDir: theEnv.DEVFLOW_PROGRESS_GUARD_DIR || path.join(mirrorDir, 'state', 'progress-guard'),
    awarenessDir: theEnv.DEVFLOW_AWARENESS_DIR || path.join(mirrorDir, 'state', 'awareness'),
    backupsDir: path.join(mirrorDir, 'backups'),
  };

  let when = now instanceof Date ? now : (now !== undefined && now !== null ? new Date(now) : new Date());
  if (Number.isNaN(when.getTime())) when = new Date();

  return {
    projectRoot: root,
    userHome,
    env: theEnv,
    now: when,
    pluginVersion: pluginVersion || helpers.pluginVersion({ homeDir: userHome }),
    dfToolsPath: dfToolsPath ? path.resolve(dfToolsPath) : DEFAULT_DF_TOOLS_PATH,
    changedThisRun: new Set(),
    paths,
  };
}

// ─── Running ──────────────────────────────────────────────────────────────────

/** Should this entry run for this scope/ctx? Invalid entries always report. */
function inScope(entry, ctx, scope) {
  if (entry.invalid !== undefined) return true;
  if (scope === 'global') return entry.mod.scope === 'global';
  if (entry.mod.scope === 'project') return ctx.projectRoot !== null;
  return true;
}

function invalidResult(entry) {
  return {
    id: entry.id,
    title: `Invalid doctor check (${entry.file})`,
    scope: 'global',
    severity: 'error',
    finding: `invalid doctor check: ${entry.file}: ${entry.invalid}`,
    fixable: false,
  };
}

/** Normalize whatever run() returned into a full result. */
function normalizeResult(mod, raw) {
  const base = { id: mod.id, title: mod.title, scope: mod.scope };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...base, severity: 'error', finding: `check returned no result (got ${raw === null ? 'null' : typeof raw})`, fixable: false };
  }
  let finding = String(raw.finding === undefined || raw.finding === null ? '' : raw.finding)
    .replace(/\s*\n\s*/g, ' ').trim() || '(no finding)';
  let severity = raw.severity;
  if (!SEVERITIES.includes(severity)) {
    finding = `${finding} [unknown severity ${JSON.stringify(severity)} coerced to error]`;
    severity = 'error';
  }
  const result = {
    ...base,
    severity,
    finding,
    // A check cannot advertise a fix it does not have.
    fixable: raw.fixable === true && typeof mod.fix === 'function',
  };
  if (typeof raw.fix_command === 'string' && raw.fix_command) result.fix_command = raw.fix_command;
  if (raw.details && typeof raw.details === 'object') result.details = raw.details;
  return result;
}

/** Run one check; a throw becomes an error result. */
function runOne(entry, ctx) {
  if (entry.invalid !== undefined) return invalidResult(entry);
  const mod = entry.mod;
  try {
    return normalizeResult(mod, mod.run(ctx));
  } catch (e) {
    return {
      id: mod.id,
      title: mod.title,
      scope: mod.scope,
      severity: 'error',
      finding: `check threw: ${errorMessage(e)}`,
      fixable: false,
    };
  }
}

/** [{entry, result}] in registry order, scope-filtered. The entry is kept for the fix pass. */
function runEntries(ctx, entries, scope) {
  return entries.filter((entry) => inScope(entry, ctx, scope))
    .map((entry) => ({ entry, result: runOne(entry, ctx) }));
}

/**
 * runChecks(ctx, entries, scope = 'all') -> results, in registry order, scope-filtered.
 * `entries` are loadChecks() output. Read-only: never calls fix().
 */
function runChecks(ctx, entries, scope = 'all') {
  return runEntries(ctx, entries, scope).map(({ result }) => result);
}

function isProjectRelative(p) {
  return typeof p === 'string' && p !== '' && !path.isAbsolute(p) && !/^[A-Za-z]:[\\/]/.test(p);
}

/** Normalize whatever fix() returned into a fix entry. */
function normalizeFix(id, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { id, applied: false, refused: `fix returned no result (got ${raw === null ? 'null' : typeof raw})` };
  }
  const out = { id, applied: raw.applied === true };
  if (typeof raw.refused === 'string' && raw.refused) out.refused = raw.refused;
  if (Array.isArray(raw.changed)) {
    out.changed = raw.changed.filter((c) => typeof c === 'string' && c).map((c) => c.replace(/\\/g, '/'));
  }
  if (typeof raw.backup === 'string' && raw.backup) out.backup = raw.backup;
  if (typeof raw.notes === 'string' && raw.notes) out.notes = raw.notes;
  return out;
}

function applyFix(entry, result, ctx) {
  try {
    return normalizeFix(result.id, entry.mod.fix(ctx, result));
  } catch (e) {
    return { id: result.id, applied: false, refused: `fix threw: ${errorMessage(e)}` };
  }
}

/**
 * summarize(results) -> { status, summary: {ok, warn, error, fixable} }
 * error → broken, else warn → degraded, else healthy. `fixable` counts fixable:true results.
 */
function summarize(results) {
  const summary = { ok: 0, warn: 0, error: 0, fixable: 0 };
  for (const r of results) {
    if (SEVERITIES.includes(r.severity)) summary[r.severity] += 1;
    if (r.fixable === true) summary.fixable += 1;
  }
  const status = summary.error > 0 ? 'broken' : (summary.warn > 0 ? 'degraded' : 'healthy');
  return { status, summary };
}

/**
 * runDoctor(opts) -> report
 *
 * opts: { projectRoot, userHome, env, now, fix, scope: 'global'|'all', checksDir, checks,
 *         pluginVersion, dfToolsPath }
 * `checks` (preloaded entries or bare modules) bypasses loading from `checksDir`.
 *
 * report: { engine_version, schema_version: 1, mode: 'report'|'fix',
 *           scope: {project: <root|null>, global: true}, status, summary, checks, fixes }
 */
function runDoctor(opts = {}) {
  const scope = opts.scope === 'global' ? 'global' : 'all';
  const ctx = buildContext({
    projectRoot: scope === 'global' ? null : opts.projectRoot,
    userHome: opts.userHome,
    env: opts.env,
    now: opts.now,
    pluginVersion: opts.pluginVersion,
    dfToolsPath: opts.dfToolsPath,
  });

  const entries = Array.isArray(opts.checks)
    ? normalizeProvidedChecks(opts.checks)
    : loadChecks({ checksDir: opts.checksDir || DEFAULT_CHECKS_DIR });

  let ran = runEntries(ctx, entries, scope);
  const fixes = [];

  if (opts.fix) {
    for (const { entry, result } of ran) {
      if (result.fixable !== true || entry.invalid !== undefined || typeof entry.mod.fix !== 'function') continue;
      const outcome = applyFix(entry, result, ctx);
      fixes.push(outcome);
      if (outcome.applied && outcome.changed) {
        for (const p of outcome.changed) if (isProjectRelative(p)) ctx.changedThisRun.add(p);
      }
    }
    ran = runEntries(ctx, entries, scope);
  }

  const checks = ran.map(({ result }) => result);
  const { status, summary } = summarize(checks);
  return {
    engine_version: ctx.pluginVersion,
    schema_version: SCHEMA_VERSION,
    mode: opts.fix ? 'fix' : 'report',
    scope: { project: ctx.projectRoot, global: true },
    status,
    summary,
    checks,
    fixes,
  };
}

module.exports = {
  DEFAULT_CHECKS_DIR,
  CHECK_FILE_RE,
  SCHEMA_VERSION,
  SCOPES,
  SEVERITIES,
  contractIssues,
  loadChecks,
  buildContext,
  runChecks,
  runDoctor,
  summarize,
};
