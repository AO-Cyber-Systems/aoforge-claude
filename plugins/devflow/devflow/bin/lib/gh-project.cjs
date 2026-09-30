'use strict';

/**
 * gh-project.cjs — Projects v2 field discovery with an out-of-repo TTL cache (TRD 46-04, GSF-07).
 *
 * The board's field ids, single-select options and iterations are read from GitHub at run time
 * (GraphQL, addressed by the project node id) instead of being frozen into the module. Option names
 * are never hardcoded: whatever the board offers today (a new quarter, a renamed status) resolves
 * without a release.
 *
 * gh access is dependency-injected as `opts.run(args) -> { ok, status, stdout, stderr }`, so this
 * module has no dependency on the gh client. Nothing here throws on a GitHub-side failure: every
 * entry point returns `{ ok:false, error, warnings }` and callers treat that as a warning.
 *
 * Cache: `$DEVFLOW_GH_CACHE_DIR/<projectId>.json`, default `~/.claude/devflow/state/gh-project/`.
 * It is runtime state, so it lives under the home state directory and never inside a repo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWrite } = require('./sync-state.cjs');

const DEFAULT_TTL_MINUTES = 360;
const MAX_PAGES = 20;

// Classified by __typename; only fields verified against the public schema are requested
// (no dataType / duration / completedIterations).
const FIELDS_QUERY = 'query($id: ID!, $cursor: String) { node(id: $id) { ... on ProjectV2 { '
  + 'fields(first: 50, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { __typename '
  + '... on ProjectV2Field { id name } '
  + '... on ProjectV2SingleSelectField { id name options { id name } } '
  + '... on ProjectV2IterationField { id name configuration { iterations { id title startDate } } } '
  + '} } } } }';

// ─── gh invocation ────────────────────────────────────────────────────────────

/**
 * Run one `gh api graphql` call and normalise every failure mode into { ok:false, error }:
 * a throwing runner, a non-zero exit, a `{"errors":[...]}` body (gh may print it on stdout while
 * exiting non-zero, so GraphQL errors win over the exit status) and unparseable output.
 */
function callGraphql(run, args) {
  let r;
  try {
    r = run(args);
  } catch (err) {
    return { ok: false, error: `gh invocation failed: ${err && err.message ? err.message : err}` };
  }
  if (!r || typeof r !== 'object') return { ok: false, error: 'gh returned no result' };

  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  let body = null;
  if (stdout.trim()) {
    try { body = JSON.parse(stdout); } catch { body = null; }
  }

  if (body && Array.isArray(body.errors) && body.errors.length > 0) {
    const message = body.errors
      .map((e) => (e && e.message ? e.message : String(e)))
      .join('; ');
    return { ok: false, error: message };
  }
  const failed = r.ok === false || (typeof r.status === 'number' && r.status !== 0);
  if (failed) {
    const stderr = typeof r.stderr === 'string' ? r.stderr.trim() : '';
    return { ok: false, error: stderr || `gh exited ${r.status}` };
  }
  if (!body) return { ok: false, error: 'unparseable gh graphql response' };
  return { ok: true, body };
}

// ─── discovery ────────────────────────────────────────────────────────────────

function toFieldEntry(node) {
  if (node.__typename === 'ProjectV2SingleSelectField') {
    const options = {};
    for (const o of node.options || []) {
      if (o && o.name && o.id) options[o.name] = o.id;
    }
    return { id: node.id, kind: 'single_select', options };
  }
  if (node.__typename === 'ProjectV2IterationField') {
    const iterations = {};
    const list = (node.configuration && node.configuration.iterations) || [];
    for (const it of list) {
      if (it && it.title && it.id) iterations[it.title] = it.id;
    }
    return { id: node.id, kind: 'iteration', iterations };
  }
  return { id: node.id, kind: 'field' };
}

/**
 * discoverProjectFields(projectId, { run, now }) -> { ok, model, warnings } | { ok:false, error, warnings }
 * model: { project_id, fetched_at, fields: { <name>: { id, kind, options? | iterations? } } }
 * Follows pageInfo; a runaway hasNextPage loop stops at MAX_PAGES and is an error so a partial
 * model is never cached.
 */
function discoverProjectFields(projectId, opts = {}) {
  const run = opts.run;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  if (!projectId) return { ok: false, error: 'projectId is required', warnings: [] };
  if (typeof run !== 'function') return { ok: false, error: 'a gh runner (opts.run) is required', warnings: [] };

  const fields = {};
  let cursor = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const args = ['api', 'graphql', '-f', `query=${FIELDS_QUERY}`, '-F', `id=${projectId}`];
    if (cursor) args.push('-F', `cursor=${cursor}`);

    const r = callGraphql(run, args);
    if (!r.ok) return { ok: false, error: r.error, warnings: [] };

    const node = r.body && r.body.data && r.body.data.node;
    const conn = node && node.fields;
    if (!conn) {
      return {
        ok: false,
        error: `project ${projectId} not found or not accessible (does the token have the read:project scope?)`,
        warnings: [],
      };
    }
    for (const f of conn.nodes || []) {
      if (!f || !f.id || !f.name) continue;
      fields[f.name] = toFieldEntry(f);
    }

    const info = conn.pageInfo || {};
    if (!info.hasNextPage) {
      return {
        ok: true,
        model: { project_id: projectId, fetched_at: new Date(now()).toISOString(), fields },
        warnings: [],
      };
    }
    if (!info.endCursor) {
      return { ok: false, error: 'pageInfo reported another page without an endCursor', warnings: [] };
    }
    cursor = info.endCursor;
  }
  return {
    ok: false,
    error: `discoverProjectFields: aborted at ${MAX_PAGES} pages — likely an infinite loop`,
    warnings: [],
  };
}

// ─── cache ────────────────────────────────────────────────────────────────────

/** Read lazily: os.homedir() is evaluated per call, never at module load. */
function cacheDir(env = process.env) {
  const override = env && env.DEVFLOW_GH_CACHE_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.claude', 'devflow', 'state', 'gh-project');
}

function cacheFile(projectId, env) {
  return path.join(cacheDir(env), `${String(projectId).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

/**
 * readCache(projectId, { env }) -> model | null. TTL is not applied here. Missing, corrupt,
 * malformed, or belonging to a different project id (two ids can sanitise to one file name)
 * all read as a miss.
 */
function readCache(projectId, opts = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cacheFile(projectId, opts.env), 'utf-8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.project_id !== projectId) return null;
  if (!parsed.fields || typeof parsed.fields !== 'object') return null;
  if (typeof parsed.fetched_at !== 'string' || Number.isNaN(Date.parse(parsed.fetched_at))) return null;
  return parsed;
}

/** writeCache(projectId, model, { env }) -> { ok:true, file } | { ok:false, error }. Atomic; never throws. */
function writeCache(projectId, model, opts = {}) {
  const file = cacheFile(projectId, opts.env);
  try {
    atomicWrite(file, JSON.stringify(model, null, 2) + '\n');
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function isFresh(model, nowMs, ttlMinutes) {
  return nowMs <= Date.parse(model.fetched_at) + ttlMinutes * 60 * 1000;
}

function normaliseTtl(ttlMinutes) {
  return typeof ttlMinutes === 'number' && Number.isFinite(ttlMinutes) && ttlMinutes >= 0
    ? ttlMinutes
    : DEFAULT_TTL_MINUTES;
}

// ─── getProjectFields ─────────────────────────────────────────────────────────

/** Discover from GitHub and cache the result; a cache write failure is a warning. */
function discoverAndCache(projectId, ctx, warnings) {
  const d = discoverProjectFields(projectId, { run: ctx.run, now: ctx.now });
  if (!d.ok) return { ok: false, error: d.error, warnings };
  const w = writeCache(projectId, d.model, { env: ctx.env });
  if (!w.ok) warnings.push(`cache write failed: ${w.error}`);
  return { ok: true, model: d.model, source: 'github', warnings };
}

/**
 * getProjectFields(projectId, { run, env, now, ttlMinutes, refresh })
 *   -> { ok, model, source: 'cache' | 'github', warnings } | { ok:false, error, warnings }
 * A fresh cache makes zero gh calls.
 */
function getProjectFields(projectId, opts = {}) {
  const warnings = [];
  if (!projectId) return { ok: false, error: 'projectId is required', warnings };

  const env = opts.env || process.env;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const ttl = normaliseTtl(opts.ttlMinutes === undefined ? DEFAULT_TTL_MINUTES : opts.ttlMinutes);
  const ctx = { run: opts.run, env, now };

  if (!opts.refresh) {
    const cached = readCache(projectId, { env });
    if (cached && isFresh(cached, now(), ttl)) {
      return { ok: true, model: cached, source: 'cache', warnings };
    }
  }
  return discoverAndCache(projectId, ctx, warnings);
}

module.exports = {
  DEFAULT_TTL_MINUTES,
  cacheDir,
  readCache,
  writeCache,
  discoverProjectFields,
  getProjectFields,
};
