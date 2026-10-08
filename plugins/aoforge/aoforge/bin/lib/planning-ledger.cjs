'use strict';

/**
 * planning-ledger.cjs — the verb-write ledger (objective 48, D-15).
 *
 * Every planning verb that writes a cache file records `rel -> contentHash(text)` here. `validate health` W055 (48-09) can
 * then tell a pending verb write (the file matches the ledger) from a direct write that bypassed the verbs (the file matches
 * neither the ledger nor the cache-index baseline). Baselines are recorded only after a completed flush; the flush settles
 * the ledger: `settleCandidates` names the rels whose bytes still match, the caller baselines them and `forget`s them.
 *
 * Location: `<stateDir>/<repoKey>.verb-writes.json`, the same `<repoKey><suffix>` scheme gh-outbox `repoFile()` uses for
 * the journal (`.json`), its lock (`.lock`) and the cache index (`.cache.json`). Never under the repo. Built from the
 * exported `stateDir` + `repoKey`, so `AOFORGE_OUTBOX_DIR` (and `opts.env` / `opts.home`, as in the outbox) move it too.
 * `root` is used as given: callers resolve the MAIN checkout first (planning-mode.resolveMainRoot, D-14), exactly as they
 * do for the journal, so a worktree and its main checkout share one ledger.
 *
 * Shape: `{version: 1, entries: {<rel>: {hash, at, verb}}}`, entries sorted by rel, written with sync-state.atomicWrite.
 * Hashes are gh-trd `contentHash`, the cache index's hash, so the two compare directly. The cache-index format is not
 * touched here.
 *
 * Failure policy (the outbox journal's): reading never writes, and a corrupt ledger reads as
 * `{entries: {}, corrupt: true}` with the file left byte-identical. A WRITE over a corrupt ledger first moves it to
 * `<file>.corrupt-<ms>` and returns `recovered.corrupt_path`, so it is never overwritten silently.
 *
 * No lock is taken here, so a verb may call it while holding the outbox lock. Never spawns anything.
 */

const fs = require('fs');
const path = require('path');

const outbox = require('./gh-outbox.cjs');
const ghTrd = require('./gh-trd.cjs');
const { atomicWrite } = require('./sync-state.cjs');
const planningPaths = require('./planning-paths.cjs');

const LEDGER_VERSION = 1;
const LEDGER_SUFFIX = '.verb-writes.json';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isSafeRel(rel) {
  try {
    planningPaths.classify(rel);
    return true;
  } catch {
    return false;
  }
}

function validEntry(e) {
  return (
    isPlainObject(e) &&
    typeof e.hash === 'string' &&
    e.hash !== '' &&
    typeof e.at === 'string' &&
    (e.verb === null || typeof e.verb === 'string')
  );
}

function validLedger(v) {
  return (
    isPlainObject(v) &&
    v.version === LEDGER_VERSION &&
    isPlainObject(v.entries) &&
    Object.entries(v.entries).every(([rel, e]) => isSafeRel(rel) && validEntry(e))
  );
}

/** epoch ms from a Date, epoch ms or ISO string; the current time when absent. */
function toMs(now) {
  if (now === undefined || now === null) return Date.now();
  const ms = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : typeof now === 'string' ? Date.parse(now) : NaN;
  if (!Number.isFinite(ms)) throw new TypeError(`now must be a Date, epoch ms or an ISO string, got ${JSON.stringify(now)}`);
  return ms;
}

/** @returns {string} absolute path of this project's ledger (outside the project). */
function ledgerPath(root, opts = {}) {
  return path.join(outbox.stateDir(opts.env || process.env, opts.home), `${outbox.repoKey(root)}${LEDGER_SUFFIX}`);
}

/** `{state: 'missing'|'ok'|'corrupt', entries}`. Only a missing file is tolerated; any other I/O error throws. */
function load(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { state: 'missing', entries: {} };
    throw e;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'corrupt', entries: {} };
  }
  return validLedger(parsed) ? { state: 'ok', entries: { ...parsed.entries } } : { state: 'corrupt', entries: {} };
}

/** Move an unreadable ledger aside (the outbox's `quarantine`). Throws if it cannot, rather than overwrite it. */
function quarantine(file, nowMs) {
  let dest = `${file}.corrupt-${nowMs}`;
  for (let i = 1; fs.existsSync(dest); i++) dest = `${file}.corrupt-${nowMs}-${i}`;
  fs.renameSync(file, dest);
  return dest;
}

/** The entries to modify, quarantining a corrupt ledger first. */
function loadForWrite(file, nowMs) {
  const loaded = load(file);
  if (loaded.state !== 'corrupt') return { state: loaded.state, entries: loaded.entries, recovered: null };
  return { state: 'corrupt', entries: {}, recovered: { corrupt_path: quarantine(file, nowMs) } };
}

function write(file, entries) {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  atomicWrite(file, `${JSON.stringify({ version: LEDGER_VERSION, entries: sorted }, null, 2)}\n`);
}

/**
 * `{version, entries, corrupt}`. A missing ledger is `{entries: {}, corrupt: false}`; a corrupt one is
 * `{entries: {}, corrupt: true}` and stays on disk untouched. Never creates a file or a directory.
 */
function readLedger(root, opts = {}) {
  const loaded = load(ledgerPath(root, opts));
  return { version: LEDGER_VERSION, entries: loaded.entries, corrupt: loaded.state === 'corrupt' };
}

/**
 * Record a verb write of `text` to `.planning/<rel>`. Replaces any earlier entry for `rel`.
 * Throws TypeError, before writing anything, for an unsafe rel, non-string text, a non-string verb or a bad `now`.
 * @param {{verb?: string|null, now?: Date|number|string, env?: object, home?: string}} [opts]
 * @returns {{path: string, entry: {hash: string, at: string, verb: string|null}, recovered: null|{corrupt_path: string}}}
 */
function record(root, rel, text, opts = {}) {
  planningPaths.classify(rel); // throws TypeError for an unsafe rel
  if (typeof text !== 'string') throw new TypeError(`text must be a string, got ${text === null ? 'null' : typeof text}`);
  const verb = opts.verb === undefined ? null : opts.verb;
  if (verb !== null && typeof verb !== 'string') throw new TypeError('verb must be a string or null');
  const nowMs = toMs(opts.now);

  const entry = { hash: ghTrd.contentHash(text), at: new Date(nowMs).toISOString(), verb };
  const file = ledgerPath(root, opts);
  const { entries, recovered } = loadForWrite(file, nowMs);
  entries[rel] = entry;
  write(file, entries);
  return { path: file, entry, recovered };
}

/**
 * Drop entries (the settle step after a flush has baselined them). `rels` is a rel or an array of rels. Writes only when
 * something was removed, so forgetting nothing never creates a ledger.
 * @returns {{path: string, removed: string[], recovered: null|{corrupt_path: string}}}
 */
function forget(root, rels, opts = {}) {
  const list = typeof rels === 'string' ? [rels] : rels;
  if (!Array.isArray(list)) throw new TypeError('rels must be a string or an array of strings');
  const file = ledgerPath(root, opts);
  const { entries, recovered } = loadForWrite(file, toMs(opts.now));
  const removed = [];
  for (const rel of list) {
    if (typeof rel === 'string' && Object.hasOwn(entries, rel) && !removed.includes(rel)) {
      delete entries[rel];
      removed.push(rel);
    }
  }
  if (removed.length > 0) write(file, entries);
  return { path: file, removed, recovered };
}

/** True when `text` is exactly what a verb last recorded for `rel`. A null text (deleted file) never matches. */
function matches(root, rel, text, opts = {}) {
  if (typeof text !== 'string') return false;
  const { entries } = readLedger(root, opts);
  return Object.hasOwn(entries, rel) && entries[rel].hash === ghTrd.contentHash(text);
}

/** The current text of `.planning/<rel>`, or null when the file does not exist. Other errors propagate. */
function readPlanningFile(root, rel) {
  try {
    return fs.readFileSync(path.join(root, '.planning', ...rel.split('/')), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Split the ledger's rels by the file's current bytes: `matching` still hashes to the recorded value (safe to baseline
 * after a flush, then `forget`), `drifted` was edited, deleted or could not be read since the verb wrote it.
 * `readFile(rel) -> string | Buffer | null` defaults to reading `<root>/.planning/<rel>`; a reader that throws counts as drifted.
 * @returns {{matching: string[], drifted: string[]}} both sorted
 */
function settleCandidates(root, readFile, opts = {}) {
  const reader = typeof readFile === 'function' ? readFile : (rel) => readPlanningFile(root, rel);
  const { entries } = readLedger(root, opts);
  const matching = [];
  const drifted = [];
  for (const rel of Object.keys(entries).sort()) {
    let text;
    try {
      text = reader(rel);
    } catch {
      text = null;
    }
    if (Buffer.isBuffer(text)) text = text.toString('utf8');
    if (typeof text === 'string' && ghTrd.contentHash(text) === entries[rel].hash) matching.push(rel);
    else drifted.push(rel);
  }
  return { matching, drifted };
}

module.exports = {
  LEDGER_VERSION,
  ledgerPath,
  readLedger,
  record,
  forget,
  matches,
  settleCandidates,
};
