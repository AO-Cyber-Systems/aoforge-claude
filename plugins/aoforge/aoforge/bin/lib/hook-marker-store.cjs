'use strict';

/**
 * hook-marker-store.cjs — objective 45, TRD 45-10 (success criterion SC1)
 *
 * Where the autonomous-mode hooks keep their small bookkeeping markers:
 *   - verify-commits.js   `autonomous-retry-<agent>`      (SubagentStop, block once per agent)
 *   - verify-completion.js `autonomous-resume-<objective>` (Stop, resume-attempt counter)
 *
 * Why this exists: both used to be written as `<project>/.planning/.autonomous-*`.
 * SC1 says no hook writes runtime state into a project's `.planning/` per call or per
 * session, because Claude Code's file watcher attaches every changed in-tree file to the
 * next tool result and the repo shows up dirty. Same lineage as quick-25
 * (progress-guard-store.cjs) and TRD 45-01 (awareness-store.cjs): state lives outside the
 * repo, keyed by repo, so nothing the watcher sees changes and two projects never share a file.
 *
 * Location: $AOFORGE_HOOK_MARKER_DIR, else <home>/.claude/aoforge/state/hook-markers/,
 * then one directory per project named by upgrade.repoKey(<dir that contains .planning>)
 * (`<slug>-<hash8>` of the realpath, the same key backups and the prune registry use).
 *
 * Loaded from a hook, so node builtins only, plus upgrade.cjs, which itself loads only
 * fs/path/crypto and reads nothing at module load. Every function fails open: a broken
 * state dir must never break a session. A marker that cannot be written just means the
 * hook does not block, never that it blocks forever.
 *
 * Leftover in-tree markers from older versions are neither read nor written here; the
 * doctor's legacy-runtime-state check (TRD 45-06) reports and removes them.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_NAME_LENGTH = 200;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home] defaults to os.homedir(); injected by tests
 */
function markerRoot(env = process.env, home) {
  const override = env && env.AOFORGE_HOOK_MARKER_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'aoforge', 'state', 'hook-markers');
}

/**
 * Allowlist sanitizer: only [A-Za-z0-9_-] survives, so a name can never carry a path
 * separator or a dot-segment out of the marker directory. agent_id and objective keys
 * arrive from outside (hook payloads, STATE.md), so this is a security boundary.
 * @param {unknown} name
 * @returns {string}
 */
function sanitize(name) {
  if (name === undefined || name === null) return 'unknown';
  const cleaned = String(name).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_NAME_LENGTH);
  return cleaned || 'unknown';
}

/** upgrade.repoKey, falling back to the sanitized directory name when the path cannot be resolved. */
function repoKeyOf(projectRoot) {
  try {
    return require('./upgrade.cjs').repoKey(projectRoot);
  } catch {
    return sanitize(path.basename(String(projectRoot)));
  }
}

/**
 * The per-project marker directory: <markerRoot>/<repo-key>. Never inside the project.
 * @param {string} projectRoot the directory that CONTAINS `.planning/`
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function markerDir(projectRoot, opts) {
  const { env, home } = opts || {};
  return path.join(markerRoot(env, home), repoKeyOf(projectRoot));
}

/**
 * <markerDir>/<sanitized name>.
 * @param {string} projectRoot
 * @param {string} name e.g. `autonomous-retry-<agent>`
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function markerFile(projectRoot, name, opts) {
  return path.join(markerDir(projectRoot, opts), sanitize(name));
}

/**
 * Delete regular files in `dir` whose name starts with `prefix` and whose mtime is older
 * than ttlMs. Leaves everything else alone, subdirectories included. Each entry has its own
 * try so one unremovable file cannot stop the sweep.
 * @returns {number} how many files were removed; 0 for a missing directory
 */
function cleanStale(dir, nowMs, ttlMs, prefix) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(dir, name);
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

module.exports = {
  markerRoot,
  markerDir,
  markerFile,
  sanitize,
  cleanStale,
};
