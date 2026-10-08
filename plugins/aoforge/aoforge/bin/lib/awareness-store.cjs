'use strict';

/**
 * awareness-store.cjs — TRD 45-01 (DOC-01)
 *
 * Out-of-tree, per-repo persistence for the cross-repo awareness cache.
 *
 * Why this exists: awareness-cache-populate.js (SessionStart) and `aof-tools awareness`
 * used to rewrite <project>/.planning/.awareness-cache.json on every scan. On a busy
 * workspace that file runs to ~640KB, and Claude Code's file watcher attaches any
 * in-tree file that changes to the next tool result. Repos that committed it also
 * churned on every session. Same lesson, same fix as progress-guard-store.cjs
 * (quick-25): runtime state lives outside the repo, so nothing the watcher sees changes.
 *
 * Location: $AOFORGE_AWARENESS_DIR, else ~/.claude/aoforge/state/awareness/.
 * One file per repo, named <repo-key>.json, where repo-key is the same
 * `<slug>-<hash8>` of the realpath that upgrade.cjs uses for backups. It is
 * re-implemented here rather than required, because upgrade.cjs is far too heavy for a hook.
 *
 * Entry body: { project: <realpath>, updated: <ISO>, peer?: {...}, org?: {...} }.
 * `project` lets doctor (45-07) find orphans: entries whose project no longer exists.
 *
 * Loaded from a hook, so node builtins only (fs, os, path, crypto) — never helpers.cjs
 * or anything else that reads JSON at module load. Every function that touches the
 * disk fails open: a broken state dir must never break a session. Writes are atomic
 * (tmp + rename) because concurrent sessions on one repo share the file.
 *
 * There is deliberately NO fallback read of the legacy in-tree
 * .planning/.awareness-cache.json. It is dead state; LEGACY_CACHE_REL is exported
 * only so migration and doctor can name it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LEGACY_CACHE_REL = '.planning/.awareness-cache.json';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home] - defaults to os.homedir(); a parameter so tests never depend on the real home
 */
function stateDir(env = process.env, home) {
  const override = env && env.AOFORGE_AWARENESS_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'aoforge', 'state', 'awareness');
}

/**
 * repoKey(projectRoot) -> <slug>-<hash8>. Mirrors upgrade.repoKey exactly (a test asserts
 * they agree). Unlike upgrade.repoKey it never throws: an unresolvable path falls back
 * to path.resolve, so a cache lookup for a vanished directory just misses.
 * @param {string} projectRoot
 * @returns {string}
 */
function repoKey(projectRoot) {
  let real;
  try {
    real = fs.realpathSync(projectRoot);
  } catch {
    real = path.resolve(projectRoot);
  }
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}

/**
 * @param {string} projectRoot
 * @param {{ env?: NodeJS.ProcessEnv, home?: string }} [opts]
 * @returns {string} absolute path of the cache file for this project (outside the project)
 */
function cacheFile(projectRoot, opts = {}) {
  const env = opts.env || process.env;
  return path.join(stateDir(env, opts.home), `${repoKey(projectRoot)}.json`);
}

/** @returns {object|null} the parsed entry, or null. Never throws. */
function readEntry(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Atomic write: <file>.<pid>.tmp then rename, so a concurrent reader sees the old
 * entry or the new one and never a torn one.
 * @returns {boolean} whether the write landed. Never throws.
 */
function writeEntry(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
    return false;
  }
}

/**
 * @returns {Array<{file: string, project: *, size: number, mtimeMs: number}>}
 *   parseable `*.json` entries only; [] for a missing dir.
 */
function listEntries(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) continue;
      const entry = readEntry(file);
      if (!entry || typeof entry !== 'object') continue;
      out.push({ file, project: entry.project, size: st.size, mtimeMs: st.mtimeMs });
    } catch { /* one bad entry must not stop the listing */ }
  }
  return out;
}

/**
 * Delete `*.json` entries whose mtime is older than ttlMs. With `{orphans: true}` also
 * delete entries whose recorded `project` path no longer exists — an entry with no
 * `project` field is not provably orphaned and is kept. Leaves non-json files and
 * subdirectories alone. Each entry has its own try so one unremovable file cannot stop
 * the sweep.
 * @param {string} dir
 * @param {number} nowMs
 * @param {number} ttlMs
 * @param {{ orphans?: boolean }} [opts]
 * @returns {number} how many files were removed
 */
function pruneStale(dir, nowMs, ttlMs, opts = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      let drop = nowMs - st.mtimeMs > ttlMs;
      if (!drop && opts && opts.orphans) {
        const entry = readEntry(full);
        const project = entry && typeof entry === 'object' ? entry.project : undefined;
        if (typeof project === 'string' && project && !fs.existsSync(project)) drop = true;
      }
      if (drop) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch { /* one bad entry must not stop the sweep */ }
  }
  return removed;
}

/** @returns {number} summed byte size of `*.json` files in dir; 0 for a missing dir. */
function totalSize(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.isFile()) total += st.size;
    } catch { /* skip unreadable entry */ }
  }
  return total;
}

module.exports = {
  stateDir,
  repoKey,
  cacheFile,
  readEntry,
  writeEntry,
  listEntries,
  pruneStale,
  totalSize,
  LEGACY_CACHE_REL,
};
