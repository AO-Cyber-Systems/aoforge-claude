'use strict';

/**
 * 30-guard-state.cjs — TRD 45-07 (DOC-05)
 *
 * Per-session no-progress-guard state (hooks/guard-no-progress.js, quick-25) lives outside the
 * repos in `ctx.paths.progressGuardDir`, one `*.json` per session. The hook prunes stale files on
 * a session's first call, but a machine that stopped running sessions never triggers that, and a
 * hook that failed open leaves files behind. This check counts the files past the hook's own TTL
 * and prunes them by composing progress-guard-store.pruneStale — the same predicate, never a
 * re-implementation of the sweep.
 *
 * Global scope; every path comes from ctx. The fix deletes only `*.json` regular files directly
 * inside the state dir (the store never recurses and never touches other file kinds).
 */

const fs = require('fs');
const path = require('path');
const store = require('../progress-guard-store.cjs');

// Mirrors SESSION_TTL_MS in hooks/guard-no-progress.js. The hook is not requirable from here:
// the doctor runs from the ~/.claude/devflow mirror, which does not ship hooks/. The test file
// requires the hook and asserts the two values are equal.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The same predicate progress-guard-store.pruneStale applies: a top-level `*.json` regular file
 * whose mtime is more than ttlMs before now.
 * @returns {{ total: number, stale: string[] }|null} null when the dir does not exist
 */
function scan(dir, nowMs) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let total = 0;
  const stale = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      total++;
      if (nowMs - st.mtimeMs > SESSION_TTL_MS) stale.push(full);
    } catch { /* one unreadable entry must not stop the scan */ }
  }
  return { total, stale };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function run(ctx) {
  const dir = ctx.paths.progressGuardDir;
  const scanned = scan(dir, ctx.now.getTime());
  if (scanned === null) {
    return { severity: 'ok', finding: 'no guard state', fixable: false, details: { dir, sessions: 0 } };
  }
  const { total, stale } = scanned;
  if (stale.length === 0) {
    return {
      severity: 'ok',
      finding: `${plural(total, 'guard session file', 'guard session files')}, none stale`,
      fixable: false,
      details: { dir, sessions: total },
    };
  }
  return {
    severity: 'warn',
    finding: `${plural(stale.length, 'stale guard session file', 'stale guard session files')} in ${dir} (older than 24h)`,
    fixable: true,
    details: { dir, sessions: total, stale: stale.map((f) => path.basename(f)) },
  };
}

function fix(ctx) {
  const dir = ctx.paths.progressGuardDir;
  const scanned = scan(dir, ctx.now.getTime());
  const planned = scanned ? scanned.stale : [];
  if (planned.length === 0) {
    return { applied: true, changed: [], notes: 'no stale guard session files to remove' };
  }
  const removed = store.pruneStale(dir, ctx.now.getTime(), SESSION_TTL_MS);
  const changed = planned.filter((f) => !fs.existsSync(f));
  if (removed === 0 && changed.length === 0) {
    return { applied: false, refused: `could not remove any stale guard session file in ${dir}` };
  }
  const left = planned.length - changed.length;
  return {
    applied: true,
    changed,
    notes: `removed ${plural(removed, 'stale guard session file', 'stale guard session files')} from ${dir}` +
      (left > 0 ? `; ${left} could not be removed` : ''),
  };
}

module.exports = {
  id: 'guard-state',
  title: 'No-progress guard state',
  scope: 'global',
  run,
  fix,
  SESSION_TTL_MS,
};
