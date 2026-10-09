'use strict';

// state-rekey.cjs (objective 72, TRD 72-07, INST-06): `aof-tools state rekey --from <old checkout path> [--to <new
// path>] [--dry-run] [--raw]`.
//
// Every per-repository file AOForge keeps outside a project is named by the repo key of the checkout's path
// (upgrade.repoKey: the basename slug and the first 8 hex of sha1(realpath)). When a checkout moves (72-26 moves this
// one), the new path has a new key and the state under the old key is orphaned. This copies it to the new key:
//   - nothing under the old key is deleted (the old path may come back, and a copy is the reversible choice);
//   - nothing under the new key is overwritten: a file already there is `skip`, and a directory is merged (only the
//     files it lacks are copied, `merge`; `skip` when it lacks none);
//   - the old path need not exist any more: keyForPath realpaths the nearest existing ancestor and appends the rest,
//     which reproduces the key the checkout had as long as the moved directory itself was not a symlink.
//
// KEYED_STATE holds one entry per store. Its directory comes from the store's own path function (asked for the home
// directory's entry, so the store's env override and the injected home apply), and its name follows the store's
// `<key><suffix>` scheme; state-rekey.test.cjs test 12b pins every entry to the store's per-project path. The outbox
// entry matches every `<key>.*` file the outbox family writes (journal, base, cache, the planning ledger, the drift
// cache index) except the `.lock`, which belongs to a live process. Copying the journal is safe because the old
// checkout is gone; while both paths are live checkouts, run this only once the old one is retired, or both would
// flush the same queued writes. The backups registry is an entry of its own: the new key gains
// `{ path: <new realpath>, registered_at: <now> }` and the old key's entry is kept.
//
// userHome is always injected. The drafts root is <tmpDir>/<DRAFTS_DIR>, tmpDir defaulting to os.tmpdir() exactly as
// planning-drafts.cjs resolves it.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const estimateRunStore = require('./estimate-run-store.cjs');
const hookMarkerStore = require('./hook-marker-store.cjs');
const awarenessStore = require('./awareness-store.cjs');
const outbox = require('./gh-outbox.cjs');
const backupPrune = require('./backup-prune.cjs');
const { DRAFTS_DIR } = require('./planning-drafts.cjs');
const { findProjectRoot } = require('./compat.cjs');
const { copyNoClobber } = require('./runtime-state-migrate.cjs');

const USAGE = 'Usage: aof-tools state rekey --from <old checkout path> [--to <new path>] [--dry-run] [--raw]';

// ─── keys ───────────────────────────────────────────────────────────────────────

/**
 * The realpath of `p`; when `p` (or the tail of it) no longer exists, the realpath of its nearest existing ancestor
 * joined with the rest; the resolved string itself when nothing on the way resolves.
 */
function resolveReal(p, fsImpl = fs) {
  const abs = path.resolve(p);
  const rest = [];
  let cur = abs;
  for (;;) {
    try {
      return path.join(fsImpl.realpathSync(cur), ...rest);
    } catch {
      // `cur` cannot be resolved (gone, not a directory, unreadable): its parent may be.
    }
    const parent = path.dirname(cur);
    if (parent === cur) return abs;
    rest.unshift(path.basename(cur));
    cur = parent;
  }
}

/** upgrade.repoKey's formula over resolveReal(p): the same key for an existing path, and one for a vanished path. */
function keyForPath(p, fsImpl = fs) {
  const real = resolveReal(p, fsImpl);
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}

// ─── the keyed stores ───────────────────────────────────────────────────────────

/** The directory a store keeps one repository's entry in: ask the store for the home's entry and drop the name. */
const storeDir = (pathFn) => (ctx) => path.dirname(pathFn(ctx.userHome, { env: ctx.env, home: ctx.userHome }));

/** An entry named exactly `<key><suffix>` (a file or a directory). */
function exactEntry(kind, dir, suffix) {
  return Object.freeze({
    kind,
    dir,
    name: (key) => `${key}${suffix}`,
    match: (name, key) => name === `${key}${suffix}`,
    rename: (name, fromKey, toKey) => `${toKey}${suffix}`,
  });
}

const KEYED_STATE = Object.freeze([
  exactEntry('estimate-run', storeDir(estimateRunStore.statePath), '.json'),
  exactEntry('estimate-history', storeDir(estimateRunStore.historyDir), ''),
  exactEntry('awareness', storeDir(awarenessStore.cacheFile), '.json'),
  exactEntry('hook-markers', storeDir(hookMarkerStore.markerDir), ''),
  Object.freeze({
    kind: 'outbox',
    dir: storeDir(outbox.journalPath),
    name: (key) => `${key}.json`,
    match: (name, key) => name.startsWith(`${key}.`) && !name.endsWith('.lock'),
    rename: (name, fromKey, toKey) => `${toKey}${name.slice(fromKey.length)}`,
  }),
  exactEntry('backups', (ctx) => backupPrune.backupsRoot(ctx.userHome), ''),
  exactEntry('drafts', (ctx) => path.join(ctx.tmpDir, DRAFTS_DIR), ''),
]);

// ─── plan ───────────────────────────────────────────────────────────────────────

function lstatOrNull(p, fsImpl) {
  try {
    return fsImpl.lstatSync(p);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

/** True when some file or directory under `src` has no counterpart under `dst`. */
function hasMissing(src, dst, fsImpl) {
  for (const name of fsImpl.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const dSt = lstatOrNull(d, fsImpl);
    if (!dSt) return true;
    if (fsImpl.lstatSync(s).isDirectory() && dSt.isDirectory() && hasMissing(s, d, fsImpl)) return true;
  }
  return false;
}

function actionFor(src, dst, fsImpl) {
  const dSt = lstatOrNull(dst, fsImpl);
  if (!dSt) return 'copy';
  if (fsImpl.lstatSync(src).isDirectory() && dSt.isDirectory()) return hasMissing(src, dst, fsImpl) ? 'merge' : 'skip';
  return 'skip';
}

/** The parsed registry, or `{ registry: null, note }` when it cannot be read as one. */
function readRegistry(regPath, fsImpl) {
  let text;
  try {
    text = fsImpl.readFileSync(regPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { registry: null, note: null };
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.repos && typeof parsed.repos === 'object') {
      return { registry: parsed, note: null };
    }
    return { registry: null, note: `backups registry ${regPath} has no repos map; its entry was not rekeyed` };
  } catch (err) {
    return { registry: null, note: `backups registry ${regPath} is not JSON (${err.message}); its entry was not rekeyed` };
  }
}

/**
 * What `applyRekey` would do. Reads only.
 *
 * @param {{from: string, to: string, userHome: string, env?: object, tmpDir?: string, fsImpl?: typeof fs}} opts
 * @returns {{from: string, to: string, from_key: string, to_key: string, notes: string[],
 *            entries: Array<{kind: string, src: string, dst: string, action: 'copy'|'merge'|'skip'}>}}
 */
function planRekey({ from, to, userHome, env = process.env, tmpDir = os.tmpdir(), fsImpl = fs } = {}) {
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome)) {
    throw new TypeError(`state rekey: userHome must be an absolute path (got ${JSON.stringify(userHome)})`);
  }
  if (typeof from !== 'string' || !from || typeof to !== 'string' || !to) {
    throw new TypeError('state rekey: from and to are required paths');
  }
  const fromKey = keyForPath(from, fsImpl);
  const toKey = keyForPath(to, fsImpl);
  if (fromKey === toKey) {
    throw new Error(`${path.resolve(from)} and ${path.resolve(to)} have the same repo key ${fromKey}: nothing to rekey`);
  }

  const ctx = { userHome, env, tmpDir };
  const entries = [];
  for (const store of KEYED_STATE) {
    const dir = store.dir(ctx);
    let names;
    try {
      names = fsImpl.readdirSync(dir);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) continue;
      throw err;
    }
    for (const name of names.sort()) {
      if (!store.match(name, fromKey)) continue;
      const src = path.join(dir, name);
      const dst = path.join(dir, store.rename(name, fromKey, toKey));
      entries.push({ kind: store.kind, src, dst, action: actionFor(src, dst, fsImpl) });
    }
  }

  const notes = [];
  const regPath = backupPrune.registryPath(userHome);
  const { registry, note } = readRegistry(regPath, fsImpl);
  if (note) notes.push(note);
  if (registry && registry.repos[fromKey]) {
    entries.push({
      kind: 'backups-registry',
      src: regPath,
      dst: regPath,
      from_key: fromKey,
      to_key: toKey,
      path: resolveReal(to, fsImpl),
      action: registry.repos[toKey] ? 'skip' : 'copy',
    });
  }

  return { from: path.resolve(from), to: path.resolve(to), from_key: fromKey, to_key: toKey, notes, entries };
}

// ─── apply ──────────────────────────────────────────────────────────────────────

function applyRegistryEntry(entry, now, fsImpl) {
  const { registry } = readRegistry(entry.src, fsImpl);
  if (!registry || !registry.repos[entry.from_key] || registry.repos[entry.to_key]) return { copied: 0, skipped: 1 };
  registry.repos[entry.to_key] = { path: entry.path, registered_at: now.toISOString() };
  fsImpl.writeFileSync(entry.src, `${JSON.stringify(registry, null, 2)}\n`);
  return { copied: 1, skipped: 0 };
}

/**
 * Carry out a plan from planRekey: copy every `copy`/`merge` entry without replacing anything at its destination, and
 * add the registry entry. Nothing is deleted.
 *
 * @param {ReturnType<typeof planRekey>} plan
 * @param {{fsImpl?: typeof fs, now?: Date}} [opts]
 */
function applyRekey(plan, { fsImpl = fs, now = new Date() } = {}) {
  const entries = [];
  for (const entry of plan.entries) {
    if (entry.action === 'skip') {
      entries.push({ ...entry, copied: 0, skipped: 0 });
    } else if (entry.kind === 'backups-registry') {
      entries.push({ ...entry, ...applyRegistryEntry(entry, now, fsImpl) });
    } else {
      fsImpl.mkdirSync(path.dirname(entry.dst), { recursive: true });
      const r = copyNoClobber(entry.src, entry.dst, { fsImpl, rel: path.basename(entry.src) });
      entries.push({ ...entry, copied: r.copied.length, skipped: r.skipped.length });
    }
  }
  return { ...plan, applied: true, entries };
}

// ─── CLI ────────────────────────────────────────────────────────────────────────

function parseRekeyArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    const eq = /^--(from|to)=(.*)$/.exec(arg);
    if (eq) {
      out[eq[1]] = eq[2];
      continue;
    }
    if (arg === '--from' || arg === '--to') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { ok: false, message: `${arg} needs a path. ${USAGE}` };
      out[arg.slice(2)] = value;
      i++;
      continue;
    }
    return { ok: false, message: `unexpected argument ${arg}. ${USAGE}` };
  }
  if (!out.from) return { ok: false, message: USAGE };
  if (out.to === '') return { ok: false, message: `--to needs a path. ${USAGE}` };
  return { ok: true, ...out };
}

function formatResult(result) {
  const lines = [
    `state rekey ${result.dry_run ? 'dry run' : 'applied'}: ${result.from_key} -> ${result.to_key}`,
    `  from ${result.from}`,
    `  to   ${result.to}`,
  ];
  if (result.entries.length === 0) lines.push(`nothing to copy: no state under ${result.from_key}`);
  for (const e of result.entries) {
    const what = e.kind === 'backups-registry'
      ? `${e.src}: repos.${e.from_key} -> repos.${e.to_key} (${e.path})`
      : `${e.src} -> ${e.dst}`;
    const counts = result.applied && e.action !== 'skip' ? ` (${e.copied} copied, ${e.skipped} kept)` : '';
    lines.push(`${e.action.padEnd(6)} ${e.kind.padEnd(16)} ${what}${counts}`);
  }
  for (const n of result.notes) lines.push(`note: ${n}`);
  return `${lines.join('\n')}\n`;
}

/**
 * `aof-tools state rekey` (argv = the tokens after `rekey`). `--to` defaults to the project root above `cwd` (or `cwd`).
 * @returns {{ok: true, result: object, text: string}|{ok: false, message: string}}
 */
function runStateRekey({ argv = [], cwd, userHome, env = process.env, tmpDir = os.tmpdir(), now = new Date() }) {
  const parsed = parseRekeyArgs(argv);
  if (!parsed.ok) return parsed;
  const from = path.resolve(cwd, parsed.from);
  const to = parsed.to !== undefined ? path.resolve(cwd, parsed.to) : (findProjectRoot(cwd) || cwd);

  let plan;
  try {
    plan = planRekey({ from, to, userHome, env, tmpDir });
  } catch (err) {
    return { ok: false, message: err.message };
  }
  const result = parsed.dryRun ? { dry_run: true, ...plan } : { dry_run: false, ...applyRekey(plan, { now }) };
  return { ok: true, result, text: formatResult(result) };
}

module.exports = { keyForPath, resolveReal, planRekey, applyRekey, runStateRekey, KEYED_STATE, USAGE };
