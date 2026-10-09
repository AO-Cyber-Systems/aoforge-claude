'use strict';

// Upgrade runner (objective 36). Migrations live in ./migrations/NNNN-<slug>.cjs and export
//   { id, title, since, safety: 'auto'|'confirm', detect(ctx) -> {applies, reason},
//     apply(ctx) -> {changed: [relative posix paths], notes, deferred?: <reason code>} }.
// ctx = { projectRoot, userHome, pluginVersion, dryRun, options, changedSoFar }.
// `changedSoFar` (TRD 72-08): the paths earlier migrations of this run changed, so a migration that refuses to run on
// a dirty tree (0012) can tell the run's own changes from the user's.
//
// An apply that returns `deferred` did not run and wrote nothing (0012 on a dirty or busy tree): the migration stays
// pending, later writes are held as after a failure, the stamp is not advanced, and `report.deferred` names it. A
// backup the runner claimed only for it is removed.
//
// Migrations are detection-based and idempotent: `detect` reads the files and decides; the
// config.json `aoforge` stamp is only a record of what ran. For one release (until SHIM_REMOVAL) the stamp is also
// read from the legacy key (LEGACY.configKey) when the new one is absent; every stamp write leaves only the new key
// (migration 0013 renames it outright). The planning directory is never cached: every migration, and the final stamp
// write, resolves it afresh, so after 0012 moves a legacy directory everything lands in `.aoforge/`.
//
// `userHome` is always injected by the caller (CLI, hook, tests). This module never resolves the
// operator's home directory itself, so a test can never touch the real one.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { planningRoot, planningRel } = require('./compat.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');

const STAMP_KEY = NAMES.configKey;
const LEGACY_STAMP_KEY = LEGACY.configKey;

const DEFAULT_REGISTRY_DIR = path.join(__dirname, 'migrations');

const MIGRATION_FILE_RE = /^(\d{4})-[a-z0-9-]+\.cjs$/;
const ID_RE = /^\d{4}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SAFETY_VALUES = ['auto', 'confirm'];

class RegistryError extends Error {
  constructor(problems) {
    const list = (Array.isArray(problems) ? problems : [problems]).map(String);
    super(`upgrade registry invalid:\n- ${list.join('\n- ')}`);
    this.name = 'RegistryError';
    this.problems = list;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

function contractIssues(mod, fileId) {
  if (!mod || typeof mod !== 'object') return ['does not export an object'];
  const issues = [];
  if (mod.id === undefined) {
    issues.push('missing id');
  } else if (typeof mod.id !== 'string' || !ID_RE.test(mod.id)) {
    issues.push(`id must be a 4-digit string (got ${JSON.stringify(mod.id)})`);
  } else if (mod.id !== fileId) {
    issues.push(`id ${mod.id} does not match filename id ${fileId} (id/filename mismatch)`);
  }
  if (typeof mod.title !== 'string' || !mod.title.trim()) {
    issues.push('missing title (must be a non-empty string)');
  }
  if (typeof mod.since !== 'string' || !SEMVER_RE.test(mod.since)) {
    issues.push(`since must be X.Y.Z (got ${JSON.stringify(mod.since)})`);
  }
  if (!SAFETY_VALUES.includes(mod.safety)) {
    issues.push(`safety must be one of ${SAFETY_VALUES.join('|')} (got ${JSON.stringify(mod.safety)})`);
  }
  if (typeof mod.detect !== 'function') issues.push('missing detect (must be a function)');
  if (typeof mod.apply !== 'function') issues.push('missing apply (must be a function)');
  return issues;
}

/**
 * loadRegistry({ registryDir }) -> migrations sorted by numeric id.
 *
 * Only `NNNN-<slug>.cjs` files are loaded; `*.test.cjs` and anything else is ignored. A missing
 * dir is an empty registry. Every contract violation, load failure and duplicate id is collected
 * and thrown as ONE RegistryError with one `problems` entry per bad file.
 */
function loadRegistry({ registryDir = DEFAULT_REGISTRY_DIR } = {}) {
  if (!fs.existsSync(registryDir) || !fs.statSync(registryDir).isDirectory()) return [];

  const files = fs.readdirSync(registryDir)
    .filter((name) => !name.endsWith('.test.cjs') && MIGRATION_FILE_RE.test(name))
    .sort();

  const issuesByFile = new Map();
  const addIssue = (file, issue) => {
    if (!issuesByFile.has(file)) issuesByFile.set(file, []);
    issuesByFile.get(file).push(issue);
  };

  const loaded = [];
  for (const file of files) {
    const abs = path.join(registryDir, file);
    if (!fs.statSync(abs).isFile()) continue;
    const fileId = MIGRATION_FILE_RE.exec(file)[1];
    let mod;
    try {
      delete require.cache[require.resolve(abs)];
      mod = require(abs);
    } catch (e) {
      addIssue(file, `failed to load: ${e.message.split('\n')[0]}`);
      continue;
    }
    const issues = contractIssues(mod, fileId);
    if (issues.length) {
      for (const issue of issues) addIssue(file, issue);
      continue;
    }
    loaded.push({
      id: mod.id,
      title: mod.title,
      since: mod.since,
      safety: mod.safety,
      detect: mod.detect,
      apply: mod.apply,
      file: abs,
    });
  }

  const byId = new Map();
  for (const m of loaded) {
    if (!byId.has(m.id)) byId.set(m.id, []);
    byId.get(m.id).push(path.basename(m.file));
  }
  for (const [id, owners] of byId) {
    if (owners.length < 2) continue;
    for (const file of owners) {
      const others = owners.filter((f) => f !== file).join(', ');
      addIssue(file, `duplicate id ${id} (also in ${others})`);
    }
  }

  if (issuesByFile.size) {
    const problems = [...issuesByFile.keys()].sort()
      .map((file) => `${file}: ${issuesByFile.get(file).join('; ')}`);
    throw new RegistryError(problems);
  }

  return loaded.sort((a, b) => Number(a.id) - Number(b.id));
}

// ─── Stamp (config.json `aoforge`) ────────────────────────────────────────────


function configPath(projectRoot) {
  return path.join(planningRoot(projectRoot), 'config.json');
}

// -> { exists, config, error } — never throws.
function readConfig(projectRoot) {
  const p = configPath(projectRoot);
  if (!fs.existsSync(p)) return { exists: false, config: null, error: null };
  try {
    const config = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { exists: true, config: null, error: `${planningRel(projectRoot, 'config.json')} is not a JSON object` };
    }
    return { exists: true, config, error: null };
  } catch (e) {
    return { exists: true, config: null, error: `${planningRel(projectRoot, 'config.json')} is not valid JSON: ${e.message}` };
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The stamp object in a parsed config: the `aoforge` object, else (for one release) the legacy key's object, else null.
 */
function stampObject(config) {
  if (!config) return null;
  if (isPlainObject(config[STAMP_KEY])) return config[STAMP_KEY];
  if (isPlainObject(config[LEGACY_STAMP_KEY])) return config[LEGACY_STAMP_KEY];
  return null;
}

/**
 * readStamp(projectRoot) -> null | { version, migrations_applied, upgraded_at }
 * null when config.json is absent, unreadable, or carries no stamp object under either key (`aoforge` first).
 */
function readStamp(projectRoot) {
  const { config } = readConfig(projectRoot);
  const d = stampObject(config);
  if (!d) return null;
  return {
    version: typeof d.version === 'string' ? d.version : null,
    migrations_applied: Array.isArray(d.migrations_applied) ? d.migrations_applied.map(String) : [],
    upgraded_at: typeof d.upgraded_at === 'string' ? d.upgraded_at : null,
  };
}

/**
 * writeStamp(projectRoot, stamp) — sets config.json `aoforge` to `stamp`, preserving every other
 * key and the key order; 2-space JSON + trailing newline. Creates `{ "aoforge": ... }` when
 * config.json is absent. Throws when config.json exists but is not a JSON object. A legacy stamp key is removed; when
 * it was the only one, the new key takes its place in the key order.
 */
function writeStamp(projectRoot, stamp) {
  const { exists, config, error } = readConfig(projectRoot);
  if (error) throw new Error(error);
  const current = exists ? config : {};
  let next = current;
  if (Object.prototype.hasOwnProperty.call(current, LEGACY_STAMP_KEY)) {
    const inPlace = !Object.prototype.hasOwnProperty.call(current, STAMP_KEY);
    next = {};
    for (const key of Object.keys(current)) {
      if (key === LEGACY_STAMP_KEY) {
        if (inPlace) next[STAMP_KEY] = null;
        continue;
      }
      next[key] = current[key];
    }
  }
  next[STAMP_KEY] = stamp;
  fs.mkdirSync(path.dirname(configPath(projectRoot)), { recursive: true });
  fs.writeFileSync(configPath(projectRoot), JSON.stringify(next, null, 2) + '\n', 'utf-8');
}

// ─── Backup (always outside the repo) ─────────────────────────────────────────

// realpath of the deepest existing ancestor, with the missing tail re-appended. macOS mkdtemp
// paths under /var realpath to /private/var; comparing un-resolved paths would miss a nesting.
function realpathLoose(p) {
  const abs = path.resolve(p);
  const tail = [];
  let cur = abs;
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return abs;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  return path.join(fs.realpathSync(cur), ...tail);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
}

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value)) {
    throw new TypeError(`upgrade: ${name} must be an absolute path (got ${JSON.stringify(value)})`);
  }
}

/**
 * repoKey(projectRoot) -> <slug>-<hash8>
 * slug = basename(realpath(projectRoot)) lowercased, non [a-z0-9] runs → '-';
 * hash8 = sha1(realpath(projectRoot)).slice(0, 8). Shared with backup-prune.cjs (objective 37,
 * TRD 37-03) so a backup dir and its registry/prune entry always agree on the same repo key.
 */
function repoKey(projectRoot) {
  const real = fs.realpathSync(projectRoot);
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}

/**
 * backupDirFor({ projectRoot, userHome, now }) ->
 *   <userHome>/.claude/aoforge/backups/<repo-slug>-<hash8>/<ts>[-N]/
 * ts = now ISO with ':' and '.' → '-'. An existing dir gets '-1', '-2', … appended — a backup is
 * never overwritten. Throws if the computed dir would sit inside the project.
 */
function backupDirFor({ projectRoot, userHome, now = new Date() }) {
  assertAbsolute('userHome', userHome);
  const real = fs.realpathSync(projectRoot);
  const key = repoKey(projectRoot);
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const base = path.join(userHome, '.claude', 'aoforge', 'backups', key);

  if (isInside(real, realpathLoose(base))) {
    throw new Error(`upgrade: refusing to back up inside the project (${base} is inside ${real})`);
  }

  let dir = path.join(base, ts);
  for (let n = 1; fs.existsSync(dir); n++) dir = path.join(base, `${ts}-${n}`);
  return dir;
}

/**
 * backup({ projectRoot, userHome, now }) -> absolute backup dir
 * Copies the planning directory (`.aoforge/`, or a legacy one, under its own name) and `CLAUDE.md` (when present). The dir is claimed with a non-recursive
 * mkdir, so two runs racing for the same timestamp still get distinct dirs.
 */
function backup({ projectRoot, userHome, now = new Date() }) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const dir = backupDirFor({ projectRoot, userHome, now });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
    const planning = planningRoot(projectRoot);
    if (fs.existsSync(planning)) {
      fs.cpSync(planning, path.join(dir, path.basename(planning)), { recursive: true });
    }
    const claudeMd = path.join(projectRoot, 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) fs.copyFileSync(claudeMd, path.join(dir, 'CLAUDE.md'));
    return dir;
  }
  throw new Error('upgrade: could not claim a unique backup dir');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function emptyReport(from, to) {
  return {
    from,
    to,
    up_to_date: false,
    applied: [],
    pending: [],
    pending_confirm: [],
    skipped: [],
    failed: [],
    deferred: [],
    changed_files: [],
    backup: null,
  };
}

/** `paths` without any path that lies under another listed path (a moved directory covers its contents). */
function collapseUnderDirectories(paths) {
  const all = [...new Set(paths)];
  return all.filter((p) => !all.some((q) => q !== p && p.startsWith(`${q}/`)));
}

function normalizeOnly(only) {
  if (only === undefined || only === null) return null;
  const list = Array.isArray(only) ? only : String(only).split(',');
  const ids = list.map((x) => String(x).trim()).filter(Boolean);
  return ids.length ? ids : null;
}

function assertKnownIds(registry, only) {
  if (!only) return;
  const known = new Set(registry.map((m) => m.id));
  const unknown = only.filter((id) => !known.has(id));
  if (unknown.length) throw new RegistryError(unknown.map((id) => `unknown migration id ${id}`));
}

function errorText(e) {
  return e && e.message ? e.message : String(e);
}

function makeCtx({ projectRoot, userHome, pluginVersion, dryRun, options, changedSoFar }) {
  return {
    projectRoot, userHome, pluginVersion, dryRun, options: { ...(options || {}) }, changedSoFar: [...(changedSoFar || [])],
  };
}

// -> { applies, reason } or throws with a message suitable for `failed`.
function runDetect(migration, ctx) {
  const res = migration.detect(ctx);
  if (res && typeof res.then === 'function') throw new Error('detect must be synchronous');
  if (!res || typeof res !== 'object' || typeof res.applies !== 'boolean') {
    throw new Error('detect must return { applies: boolean, reason }');
  }
  return { applies: res.applies, reason: res.reason === undefined || res.reason === null ? '' : String(res.reason) };
}

// A changed path must be relative, posix, and stay inside the project.
function normalizeChanged(p) {
  if (typeof p !== 'string' || !p) throw new Error(`invalid changed path ${JSON.stringify(p)}`);
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p)) {
    throw new Error(`changed path must be relative to the project (got absolute path ${JSON.stringify(p)})`);
  }
  if (p.split(/[\\/]/).includes('..')) {
    throw new Error(`changed path must not contain '..' (got path ${JSON.stringify(p)})`);
  }
  const norm = path.posix.normalize(p).replace(/^(\.\/)+/, '');
  if (!norm || norm === '.') throw new Error(`changed path names the project root (got path ${JSON.stringify(p)})`);
  return norm;
}

// -> { changed, notes, deferred } or throws with a message suitable for `failed`. `deferred` is a non-empty reason
// code or null.
function runApply(migration, ctx) {
  const res = migration.apply(ctx);
  if (res && typeof res.then === 'function') throw new Error('apply must be synchronous');
  if (!res || typeof res !== 'object' || !Array.isArray(res.changed)) {
    throw new Error('apply must return { changed: [relative paths], notes }');
  }
  const changed = [...new Set(res.changed.map(normalizeChanged))];
  const deferred = typeof res.deferred === 'string' && res.deferred ? res.deferred : null;
  if (deferred && changed.length) throw new Error(`a deferred apply must change nothing (got ${changed.join(', ')})`);
  return { changed, notes: res.notes === undefined ? null : res.notes, deferred };
}

/**
 * check(opts) -> report. Never writes. `only` narrows the migrations considered.
 * detect() receives ctx with dryRun: true.
 */
function check({ projectRoot, userHome, pluginVersion, registryDir, only, options } = {}) {
  assertAbsolute('userHome', userHome);
  const root = path.resolve(projectRoot);
  const ids = normalizeOnly(only);
  let registry = loadRegistry({ registryDir });
  assertKnownIds(registry, ids);
  if (ids) registry = registry.filter((m) => ids.includes(m.id));

  const conf = readConfig(root);
  const stamp = readStamp(root);
  const report = emptyReport(stamp ? stamp.version : null, pluginVersion);
  if (conf.error) report.failed.push({ id: 'stamp', phase: 'stamp', error: conf.error });

  for (const m of registry) {
    let det;
    try {
      det = runDetect(m, makeCtx({ projectRoot: root, userHome, pluginVersion, dryRun: true, options }));
    } catch (e) {
      report.failed.push({ id: m.id, phase: 'detect', error: errorText(e) });
      continue;
    }
    if (!det.applies) report.skipped.push({ id: m.id, reason: det.reason });
    else if (m.safety === 'auto') report.pending.push({ id: m.id, title: m.title, safety: 'auto', reason: det.reason });
    else report.pending_confirm.push({ id: m.id, title: m.title, reason: det.reason });
  }

  report.up_to_date = report.failed.length === 0 && report.pending.length === 0 &&
    report.pending_confirm.length === 0 && report.from === report.to;
  return report;
}

/**
 * apply(opts) -> report. Runs applicable `auto` migrations (narrowed by `only`) and applicable
 * `confirm` migrations named in `only` or allowed by `confirm: true`, in id order, each detected
 * immediately before it runs. Backs up outside the repo before the first write, then stamps
 * config.json. The first failure halts every later write. Only RegistryError (and a missing or
 * relative userHome) throws; migration failures are reported.
 */
function apply({
  projectRoot, userHome, pluginVersion, registryDir, only, confirm = false, dryRun = false,
  now = new Date(), options,
} = {}) {
  assertAbsolute('userHome', userHome);
  const root = path.resolve(projectRoot);
  const ids = normalizeOnly(only);
  const registry = loadRegistry({ registryDir });
  assertKnownIds(registry, ids);

  const initialConf = readConfig(root);
  const stamp = readStamp(root);
  const from = stamp ? stamp.version : null;
  const report = emptyReport(from, pluginVersion);
  const changed = new Set();
  let halted = false;
  if (initialConf.error) {
    report.failed.push({ id: 'stamp', phase: 'stamp', error: initialConf.error });
    halted = true;
  }

  const ctxFor = () => makeCtx({
    projectRoot: root, userHome, pluginVersion, dryRun: !!dryRun, options, changedSoFar: [...changed],
  });
  const leavePending = (m, reason) => {
    if (m.safety === 'auto') report.pending.push({ id: m.id, title: m.title, safety: 'auto', reason });
    else report.pending_confirm.push({ id: m.id, title: m.title, reason });
  };

  for (const m of registry) {
    let det;
    try {
      det = runDetect(m, ctxFor());
    } catch (e) {
      report.failed.push({ id: m.id, phase: 'detect', error: errorText(e) });
      halted = true;
      continue;
    }
    if (!det.applies) {
      report.skipped.push({ id: m.id, reason: det.reason });
      continue;
    }

    const named = ids ? ids.includes(m.id) : false;
    const selected = m.safety === 'auto' ? (!ids || named) : (named || !!confirm);
    if (!selected || halted) {
      leavePending(m, det.reason);
      continue;
    }

    let backupClaimedHere = false;
    if (!dryRun && report.backup === null) {
      try {
        report.backup = backup({ projectRoot: root, userHome, now });
        backupClaimedHere = true;
      } catch (e) {
        report.failed.push({ id: 'backup', phase: 'backup', error: errorText(e) });
        halted = true;
        leavePending(m, det.reason);
        continue;
      }
    }

    try {
      const res = runApply(m, ctxFor());
      if (res.deferred) {
        // Nothing was written: hold the later writes (they may assume this one ran) and keep it pending.
        const notes = res.notes === null ? '' : String(res.notes);
        report.deferred.push({ id: m.id, title: m.title, reason: res.deferred, notes });
        leavePending(m, notes || `deferred: ${res.deferred}`);
        halted = true;
        if (backupClaimedHere && report.applied.length === 0) {
          fs.rmSync(report.backup, { recursive: true, force: true });
          report.backup = null;
        }
        continue;
      }
      report.applied.push({ id: m.id, title: m.title, changed: res.changed, notes: res.notes });
      for (const f of res.changed) changed.add(f);
    } catch (e) {
      report.failed.push({ id: m.id, phase: 'apply', error: errorText(e) });
      halted = true;
    }
  }

  // Stamp: advance the version only when nothing failed and no applicable auto migration was left
  // unrun; write only when something changes (a no-op apply leaves config.json byte-identical).
  const advance = report.failed.length === 0 && report.pending.length === 0;
  const newVersion = advance ? pluginVersion : from;
  const appliedIds = report.applied.map((a) => a.id);
  const shouldStamp = appliedIds.length > 0 || newVersion !== from;
  let versionAfter = from;

  if (shouldStamp && !initialConf.error) {
    const current = readConfig(root);
    if (current.error) {
      report.failed.push({ id: 'stamp', phase: 'stamp', error: current.error });
    } else {
      const prev = stampObject(current.config) || {};
      const prevApplied = Array.isArray(prev.migrations_applied) ? prev.migrations_applied.map(String) : [];
      const next = { ...prev };
      if (newVersion) next.version = newVersion; else delete next.version;
      next.migrations_applied = [...new Set([...prevApplied, ...appliedIds])].sort();
      next.upgraded_at = now.toISOString();
      // Keep the documented field order: version, migrations_applied, upgraded_at, then extras.
      const ordered = {};
      for (const k of ['version', 'migrations_applied', 'upgraded_at']) if (k in next) ordered[k] = next[k];
      for (const k of Object.keys(next)) if (!(k in ordered)) ordered[k] = next[k];

      let written = false;
      if (!dryRun) {
        try {
          writeStamp(root, ordered);
          written = true;
          versionAfter = newVersion;
        } catch (e) {
          report.failed.push({ id: 'stamp', phase: 'stamp', error: errorText(e) });
        }
      }
      // dryRun lists config.json as a file that WOULD change.
      if (dryRun || written) changed.add(planningRel(root, 'config.json'));
    }
  }

  // A path under a directory the run moved (0012 lists both directory names) is covered by that directory.
  report.changed_files = collapseUnderDirectories([...changed]).sort();
  report.up_to_date = report.failed.length === 0 && report.pending.length === 0 &&
    report.pending_confirm.length === 0 && versionAfter === pluginVersion &&
    !(dryRun && report.applied.length > 0);
  return report;
}

module.exports = {
  loadRegistry,
  readStamp,
  writeStamp,
  repoKey,
  backupDirFor,
  backup,
  check,
  apply,
  RegistryError,
  DEFAULT_REGISTRY_DIR,
};
