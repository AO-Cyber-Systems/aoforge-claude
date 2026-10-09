'use strict';

/**
 * progress-guard-store.cjs — quick task 25
 *
 * Per-session persistence for the no-progress guard (hooks/guard-no-progress.js).
 *
 * Why this exists: the guard used to rewrite <project>/.aoforge/.progress-guard.json
 * on every tool call. Claude Code's file watcher attached that whole file (~2.5KB,
 * ~800 tokens) to the next tool result as "Updated .aoforge/.progress-guard.json",
 * on every call, and because one file was shared by every session, concurrent
 * sessions raced on read-modify-write. State now lives outside the repo, one file
 * per session, so nothing the watcher sees changes and no two sessions share a file.
 *
 * Location: $AOFORGE_PROGRESS_GUARD_DIR, else ~/.claude/aoforge/state/progress-guard/.
 *
 * Loaded from a hook, so node builtins only (fs, os, path) — never helpers.cjs or
 * anything else that reads JSON at module load. Same rule as progress-guard.cjs.
 * Every function that touches the disk fails open: a broken state dir must never
 * break a session.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_ID_LENGTH = 128;

/** @param {NodeJS.ProcessEnv} [env] */
function stateDir(env = process.env) {
  const override = env && env.AOFORGE_PROGRESS_GUARD_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.claude', 'aoforge', 'state', 'progress-guard');
}

/**
 * Allowlist sanitizer: only [A-Za-z0-9_-] survives, so an id can never carry a
 * path separator or a dot-segment out of the state dir.
 * @param {unknown} id
 * @returns {string}
 */
function sanitizeSessionId(id) {
  if (id === undefined || id === null) return 'unknown';
  const cleaned = String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_ID_LENGTH);
  // Empty, or nothing but filler characters -> no identifying content left.
  if (!cleaned || /^[_-]+$/.test(cleaned)) return 'unknown';
  return cleaned;
}

function sessionFile(dir, id) {
  return path.join(dir, `${sanitizeSessionId(id)}.json`);
}

/** @returns {object|null} the parsed session object, or null. Never throws. */
function readSession(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {boolean} whether the write landed. Never throws. */
function writeSession(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete `*.json` files whose mtime is older than ttlMs. Leaves non-json files,
 * subdirectories and `keepFile` alone. Each entry has its own try so one
 * unremovable file cannot stop the sweep.
 * @returns {number} how many files were removed
 */
function pruneStale(dir, nowMs, ttlMs, keepFile) {
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
    if (keepFile && path.resolve(full) === path.resolve(keepFile)) continue;
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (nowMs - st.mtimeMs > ttlMs) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch { /* one bad entry must not stop the sweep */ }
  }
  return removed;
}

/**
 * @returns {Array<{session: string, guard: *, updated: *, project: *}>}
 *   readable, parseable json files only; [] for a missing dir.
 */
function listSessions(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const entry = readSession(path.join(dir, name));
    if (!entry || typeof entry !== 'object') continue;
    out.push({
      session: name.slice(0, -'.json'.length),
      guard: entry.guard,
      updated: entry.updated,
      project: entry.project,
    });
  }
  return out;
}

module.exports = {
  stateDir,
  sanitizeSessionId,
  sessionFile,
  readSession,
  writeSession,
  pruneStale,
  listSessions,
};
