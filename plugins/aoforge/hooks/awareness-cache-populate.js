#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — populate awareness cache lazily when stale or missing.
 *
 * Where the cache lives (TRD 45-01): OUT of the repo, in
 * $AOFORGE_AWARENESS_DIR, else ~/.claude/aoforge/state/awareness/<repo-key>.json
 * (see lib/awareness-store.cjs). Staleness is decided from that file. This hook never
 * creates or reads anything under <cwd>/.planning/ except to test that the directory
 * exists. A legacy in-tree .planning/.awareness-cache.json is dead state and ignored.
 *
 * Fire-and-forget: spawns child process as detached + unref() so the parent
 * exits within milliseconds regardless of how long the scan takes (30s+).
 * Never blocks session start.
 *
 * Staleness strategy (read-path only):
 * - Both fresh (within TTL)  → no-op
 * - Peer stale + org fresh   → spawns `aof-tools awareness scan-peer --no-fetch`
 *   NOTE: --no-fetch is deliberate. When only the peer cache is stale, skipping
 *   git fetch avoids a potentially slow remote call that would keep the child
 *   process running far longer than necessary. Local refs are still walked,
 *   giving useful peer data without blocking on the network. If the user wants
 *   a full fetch they can run `aof-tools awareness show --refresh` manually.
 * - Org stale + peer fresh   → spawns `aof-tools awareness scan-org`
 * - Both stale (or no cache) → spawns `aof-tools awareness show --refresh --raw`
 *   (single process, covers both sections)
 *
 * Escape hatches:
 * - AOFORGE_SKIP_AWARENESS_POPULATE=1  → bypass entirely
 * - .planning/ absent in cwd          → not an AOForge project, no-op
 *
 * @module awareness-cache-populate
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const { spawn } = require('child_process');
const store = require('../aoforge/bin/lib/awareness-store.cjs');

const DEFAULT_TTL_MINUTES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to aof-tools.cjs.
 *
 * Priority:
 *   1. ${CLAUDE_PLUGIN_ROOT}/aoforge/bin/aof-tools.cjs  (hook runtime context)
 *   2. ~/.claude/aoforge/bin/aof-tools.cjs              (mirror fallback)
 *
 * @param {object} env - process.env or injected env
 * @returns {string}
 */
function _findDfTools(env) {
  const root = env.CLAUDE_PLUGIN_ROOT;
  if (root) {
    return path.join(root, 'aoforge', 'bin', 'aof-tools.cjs');
  }
  return path.join(os.homedir(), '.claude', 'aoforge', 'bin', 'aof-tools.cjs');
}

/**
 * Read the awareness cache from the out-of-tree store (lib/awareness-store.cjs).
 * Returns only the { peer, org } sections — the store's own bookkeeping
 * (project, updated) is stripped. Returns null on missing / empty / parse error
 * (silent; regeneration is cheap). A legacy in-tree cache file is never consulted.
 *
 * @param {string} cwd
 * @param {object} [env] - environment carrying AOFORGE_AWARENESS_DIR (defaults to process.env)
 * @returns {{ peer?: object, org?: object } | null}
 */
function _readCache(cwd, env = process.env) {
  const entry = store.readEntry(store.cacheFile(cwd, { env }));
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const out = {};
  if (entry.peer !== undefined) out.peer = entry.peer;
  if (entry.org !== undefined) out.org = entry.org;
  return out;
}

/**
 * Returns true when fetched_at is stale relative to ttl_minutes.
 *
 * Rules (mirrors lib/awareness.cjs::isStale):
 * - null / undefined / non-string → stale
 * - non-parseable ISO string → stale
 * - future timestamp → fresh (clock-skew tolerance)
 * - age > ttl * 60_000 ms → stale
 *
 * @param {string|null|undefined} fetched_at
 * @param {number} ttl_minutes
 * @returns {boolean}
 */
function _isStale(fetched_at, ttl_minutes) {
  if (fetched_at == null || typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false; // future timestamp → treat as fresh
  return age_ms > (ttl_minutes * 60_000);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Main hook logic — testable via injection.
 *
 * @param {object} opts
 * @param {string}   [opts.cwd]    - working directory (defaults to process.cwd())
 * @param {object}   [opts.env]    - environment object (defaults to process.env)
 * @param {function} [opts._spawn] - child_process.spawn replacement for testing
 */
function _main({ cwd = process.cwd(), env = process.env, _spawn = spawn } = {}) {
  // Escape hatch: allow bypassing entirely for CI or testing environments
  if (env.AOFORGE_SKIP_AWARENESS_POPULATE === '1') return;

  // Not an AOForge project — no .planning/ directory
  if (!fs.existsSync(path.join(cwd, '.planning'))) return;

  const cache  = _readCache(cwd, env) || {};
  const ttl    = DEFAULT_TTL_MINUTES;
  const peerStale = _isStale(cache.peer && cache.peer.fetched_at, ttl);
  const orgStale  = _isStale(cache.org  && cache.org.fetched_at,  ttl);

  // Both sections fresh — no-op, respect TTL
  if (!peerStale && !orgStale) return;

  const dfTools = _findDfTools(env);
  let spawnArgs;

  if (peerStale && !orgStale) {
    // Peer stale, org fresh → scan peer only.
    // --no-fetch: skip git fetch to avoid slow network call on session start.
    // See module-level JSDoc for the full trade-off rationale.
    spawnArgs = [dfTools, 'awareness', 'scan-peer', '--no-fetch'];
  } else if (!peerStale && orgStale) {
    // Org stale, peer fresh → scan org only
    spawnArgs = [dfTools, 'awareness', 'scan-org'];
  } else {
    // Both stale (or no cache at all) → single combined refresh
    spawnArgs = [dfTools, 'awareness', 'show', '--refresh', '--raw'];
  }

  // The env is handed to the child unchanged, so an AOFORGE_AWARENESS_DIR override
  // reaches the scan and it writes the same store file this hook just read.
  // Fire-and-forget: detached + stdio:'ignore' + unref().
  // - detached:true   — child runs in its own process group
  // - stdio:'ignore'  — no open pipe fd's that would prevent parent exit
  // - unref()         — parent event loop does not wait for child to finish
  const child = _spawn('node', spawnArgs, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  _main();
}

module.exports = { _main, _isStale, _readCache, _findDfTools };
