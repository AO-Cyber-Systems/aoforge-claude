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
 * Cache: `$AOFORGE_GH_CACHE_DIR/<projectId>.json`, default `~/.claude/aoforge/state/gh-project/`.
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
  const override = env && env.AOFORGE_GH_CACHE_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.claude', 'aoforge', 'state', 'gh-project');
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

// ─── value resolution ─────────────────────────────────────────────────────────

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * resolveFieldValue(model, name, value)
 *   -> { fieldId, value: { singleSelectOptionId } | { iterationId } } | null
 * Null when the field is unknown, is not a single-select/iteration field, or the board does not
 * offer that option/iteration. Option names come from the discovered model only.
 */
function resolveFieldValue(model, name, value) {
  const fields = model && model.fields;
  if (!fields || !hasOwn(fields, name)) return null;
  const field = fields[name];
  if (field.kind === 'single_select' && field.options && hasOwn(field.options, value)) {
    return { fieldId: field.id, value: { singleSelectOptionId: field.options[value] } };
  }
  if (field.kind === 'iteration' && field.iterations && hasOwn(field.iterations, value)) {
    return { fieldId: field.id, value: { iterationId: field.iterations[value] } };
  }
  return null;
}

/** Warnings for every wanted (field, value) pair the model cannot resolve. */
function unresolvedWarnings(model, want) {
  const out = [];
  for (const [name, value] of Object.entries(want || {})) {
    if (resolveFieldValue(model, name, value)) continue;
    const known = model && model.fields && hasOwn(model.fields, name);
    out.push(known ? `unknown option for ${name}: ${value}` : `unknown field: ${name}`);
  }
  return out;
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
 * getProjectFields(projectId, { run, env, now, ttlMinutes, refresh, want })
 *   -> { ok, model, source: 'cache' | 'github', warnings } | { ok:false, error, warnings }
 *
 * A fresh cache makes zero gh calls. `want` is { fieldName: optionOrIterationName }: when a fresh
 * cache cannot resolve every wanted pair the board has probably changed (a new quarter), so it is
 * refreshed exactly once; pairs still unresolved afterwards are warnings, never a failure. A cache
 * miss or expiry is already a discovery, so it is not followed by a second one. If that single
 * refresh fails the cached model is kept and the failure is a warning.
 */
function getProjectFields(projectId, opts = {}) {
  const warnings = [];
  if (!projectId) return { ok: false, error: 'projectId is required', warnings };

  const env = opts.env || process.env;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const ttl = normaliseTtl(opts.ttlMinutes === undefined ? DEFAULT_TTL_MINUTES : opts.ttlMinutes);
  const ctx = { run: opts.run, env, now };
  const want = opts.want || {};
  const finish = (result) => {
    warnings.push(...unresolvedWarnings(result.model, want));
    return result;
  };

  if (!opts.refresh) {
    const cached = readCache(projectId, { env });
    if (cached && isFresh(cached, now(), ttl)) {
      const satisfied = unresolvedWarnings(cached, want).length === 0;
      if (satisfied) return { ok: true, model: cached, source: 'cache', warnings };

      const refreshed = discoverAndCache(projectId, ctx, warnings);
      if (refreshed.ok) return finish(refreshed);
      warnings.push(`project field refresh failed: ${refreshed.error}`);
      return finish({ ok: true, model: cached, source: 'cache', warnings });
    }
  }
  const discovered = discoverAndCache(projectId, ctx, warnings);
  return discovered.ok ? finish(discovered) : discovered;
}

// ─── item updates ─────────────────────────────────────────────────────────────

const ISSUE_REF_RE = /^([^/]+)\/([^#]+)#(\d+)$/;

const ISSUE_ID_QUERY = 'query($owner: String!, $name: String!, $number: Int!) { '
  + 'repository(owner: $owner, name: $name) { issue(number: $number) { id } } }';
const ADD_ITEM_MUTATION = 'mutation($projectId: ID!, $contentId: ID!) { '
  + 'addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }';
const PROJECT_ITEMS_QUERY = 'query($owner: String!, $name: String!, $number: Int!) { '
  + 'repository(owner: $owner, name: $name) { issue(number: $number) { '
  + 'projectItems(first: 20) { nodes { id project { id } } } } } }';
const SET_SELECT_MUTATION = 'mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) { '
  + 'updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, '
  + 'value: { singleSelectOptionId: $optionId } }) { projectV2Item { id } } }';
const SET_ITERATION_MUTATION = 'mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) { '
  + 'updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, '
  + 'value: { iterationId: $iterationId } }) { projectV2Item { id } } }';

// GOTCHA: -F (typed) is right for GraphQL variables. The values here are owners, repo names, numbers
// and node ids, never free text, so gh's "@file" expansion of -F values cannot trigger.
function graphqlArgs(query, vars) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push('-F', `${k}=${v}`);
  return args;
}

/**
 * Put the issue on the project and return its item id. addProjectV2ItemById cannot be combined with
 * a field update, and the item must exist before any update. If the add fails, fall back to the
 * issue's existing item on THIS project (never an item from another board).
 */
function ensureProjectItem(run, issueRef, projectId) {
  const [, owner, name, number] = issueRef.match(ISSUE_REF_RE);
  const vars = { owner, name, number };

  const idR = callGraphql(run, graphqlArgs(ISSUE_ID_QUERY, vars));
  if (!idR.ok) return { ok: false, error: idR.error };
  const issue = idR.body.data && idR.body.data.repository && idR.body.data.repository.issue;
  if (!issue || !issue.id) return { ok: false, error: `issue not found: ${issueRef}` };

  const addR = callGraphql(run, graphqlArgs(ADD_ITEM_MUTATION, { projectId, contentId: issue.id }));
  const added = addR.ok && addR.body.data && addR.body.data.addProjectV2ItemById
    && addR.body.data.addProjectV2ItemById.item;
  if (added && added.id) return { ok: true, item_id: added.id };

  const itemsR = callGraphql(run, graphqlArgs(PROJECT_ITEMS_QUERY, vars));
  if (itemsR.ok) {
    const repo = itemsR.body.data && itemsR.body.data.repository;
    const nodes = (repo && repo.issue && repo.issue.projectItems && repo.issue.projectItems.nodes) || [];
    const existing = nodes.find((n) => n && n.project && n.project.id === projectId);
    if (existing && existing.id) return { ok: true, item_id: existing.id };
  }
  const cause = addR.ok ? 'no item id in the response' : addR.error;
  return { ok: false, error: `issue not found in project and could not be added (${cause})` };
}

/**
 * updateItemFields({ issueRef, projectId, fields, run, env, now, ttlMinutes })
 *   -> { ok, item_id, fields_updated, warnings, errors? } | { ok:false, error, fields_updated, warnings }
 *
 * `fields` is { fieldName: optionOrIterationName }. Fields come from getProjectFields (cache, one
 * refresh for an unseen option). The issue is added to the project first, then each resolvable
 * field gets its own updateProjectV2ItemFieldValue mutation. Unknown fields/options are warnings;
 * per-field mutation failures are collected in `errors` and do not stop the remaining fields.
 */
function updateItemFields(opts = {}) {
  const { issueRef, projectId, run } = opts;
  const fields = opts.fields || {};
  const fail = (error, warnings = []) => ({ ok: false, error, fields_updated: [], warnings });

  if (!projectId) return fail('no projectId; cannot update fields');
  if (typeof issueRef !== 'string' || !ISSUE_REF_RE.test(issueRef)) return fail(`malformed issueRef: ${issueRef}`);
  if (typeof run !== 'function') return fail('a gh runner (opts.run) is required');

  const pf = getProjectFields(projectId, {
    run, env: opts.env, now: opts.now, ttlMinutes: opts.ttlMinutes, want: fields,
  });
  if (!pf.ok) return fail(pf.error, pf.warnings);
  const warnings = pf.warnings.slice();

  const item = ensureProjectItem(run, issueRef, projectId);
  if (!item.ok) return fail(item.error, warnings);

  const fields_updated = [];
  const errors = [];
  for (const [name, value] of Object.entries(fields)) {
    const resolved = resolveFieldValue(pf.model, name, value);
    if (!resolved) continue; // already reported in pf.warnings

    const byIteration = Object.prototype.hasOwnProperty.call(resolved.value, 'iterationId');
    const r = callGraphql(run, graphqlArgs(
      byIteration ? SET_ITERATION_MUTATION : SET_SELECT_MUTATION,
      {
        projectId,
        itemId: item.item_id,
        fieldId: resolved.fieldId,
        ...(byIteration ? { iterationId: resolved.value.iterationId } : { optionId: resolved.value.singleSelectOptionId }),
      },
    ));
    if (r.ok) fields_updated.push(name);
    else errors.push({ field: name, error: r.error || 'mutation failed' });
  }

  return {
    ok: errors.length === 0,
    item_id: item.item_id,
    fields_updated,
    warnings,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

module.exports = {
  DEFAULT_TTL_MINUTES,
  cacheDir,
  readCache,
  writeCache,
  discoverProjectFields,
  getProjectFields,
  resolveFieldValue,
  updateItemFields,
};
