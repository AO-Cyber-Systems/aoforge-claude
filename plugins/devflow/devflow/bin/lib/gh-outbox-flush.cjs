'use strict';

/**
 * gh-outbox-flush.cjs — TRD 47-07 (GST-05, executor half)
 *
 * The single executor for the outbox (47-03). It takes the flush lock, checks the cross-process write
 * budget, and runs the journal's LOGICAL ops strictly in `seq` order through one idempotent handler per
 * `OP_KINDS` kind. It stops cleanly when GitHub is unreachable or rate-limited (the op stays `pending`),
 * and it halts for a human when an issue or comment was edited on GitHub inside DevFlow's managed
 * regions since the last sync (D-24).
 *
 * Every gh call goes through gh-client (`ghRead`, `ghWrite`, `ghPaginate`); git is spoken only through
 * gh-wiki. Nothing here spawns a process.
 *
 * Failure classes (`classifyFailure`) decide what a failed call means for the queue:
 *   offline | rate_limited  -> the op stays pending, the flush stops with status `pending`
 *   already_exists          -> success (a 422 that says the thing is already there)
 *   validation | permission | not_found | error | blocked | conflict -> the op is blocked and the flush
 *                              halts for a human
 *
 * Idempotence: a handler re-resolves the world before it writes (marker scan, the existing links, the
 * comments already there), so replaying an op after a crash creates nothing twice. A handler that has
 * nothing to change writes nothing at all.
 *
 * Remote-edit detection (D-24, Pitfall 2): `updated_at` is only a pre-filter, because DevFlow's own link,
 * dependency and comment writes bump it. The body hash decides. For an objective body the hash of the
 * managed-section text (criteria ticks normalised) tells an edit INSIDE DevFlow's regions, which halts,
 * from human text outside them, which is merged. After every write the base is stored from the body
 * GitHub RETURNED, never from a locally recomputed one.
 *
 * Results of a handler: `{ok:true, warnings, note?}`, `{ok:false, class, error, retry_after_ms?}` or
 * `{ok:false, halt:true, issue_number, detail}`.
 */

const fs = require('fs');
const path = require('path');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const trd = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');
const issueLib = require('./gh-issue.cjs');
const wikiLib = require('./gh-wiki.cjs');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

// ─── Failure classification (pure) ────────────────────────────────────────────

const OFFLINE_RE = /could not resolve host|connection refused|timed out|network is unreachable|dial tcp|\bEOF\b/i;
const ALREADY_RE = /already[ _]exists|already been taken|duplicate|already blocked/i;
const BUDGET_RE = /write budget exhausted/i;

/** The HTTP status gh prints (`gh: Not Found (HTTP 404)`); the process exit code is not an HTTP status. */
function httpStatus(text) {
  const m = /HTTP (\d{3})\b/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Classify a failed gh call (or a `{ok:false, error, stderr, stdout, status}` shaped like one).
 *
 * | class          | rule                                                                              |
 * |----------------|-----------------------------------------------------------------------------------|
 * | rate_limited   | the client's write-budget refusal, or `client.isSecondaryLimit(r)`                |
 * | offline        | `status === null`, or the stderr names a network failure                          |
 * | already_exists | 422 that says "already exists / already been taken / duplicate / already blocked" |
 * | validation     | any other 422                                                                     |
 * | permission     | 401, or a 403 that is not a secondary limit                                       |
 * | not_found      | 404                                                                               |
 * | error          | anything else                                                                     |
 *
 * A rate-limit message wins over the network words it may contain, and the client's budget refusal (which
 * has `status: null` because gh was never run) is a rate limit, not an outage.
 * @param {{ok?:boolean, status?:number|null, stdout?:string, stderr?:string, error?:string}|null|undefined} r
 * @returns {'offline'|'rate_limited'|'already_exists'|'validation'|'permission'|'not_found'|'error'}
 */
function classifyFailure(r) {
  if (!r || typeof r !== 'object') return 'error';
  const text = `${r.stderr || ''}\n${r.stdout || ''}\n${r.error || ''}`;
  if (BUDGET_RE.test(text) || client.isSecondaryLimit({ ok: false, stderr: r.stderr, stdout: r.stdout })) return 'rate_limited';
  if (r.status === null) return 'offline';
  if (OFFLINE_RE.test(text)) return 'offline';
  const http = httpStatus(text);
  if (http === 422) return ALREADY_RE.test(text) ? 'already_exists' : 'validation';
  if (http === 401 || http === 403) return 'permission';
  if (http === 404) return 'not_found';
  return 'error';
}

// ─── Results ──────────────────────────────────────────────────────────────────

const ok = (warnings, extra = {}) => ({ ok: true, warnings, ...extra });
const failWith = (klass, error) => ({ ok: false, class: klass, error });

/** A handler failure from a failed gh result. A rate limit carries how long to wait (ms). */
function failFrom(r, what) {
  const klass = classifyFailure(r);
  const detail = String((r && (r.error || r.stderr || r.stdout)) || 'unknown failure').trim();
  const out = failWith(klass, `${what}: ${detail}`);
  if (klass === 'rate_limited') {
    const wait = client.parseRetryAfter(r);
    out.retry_after_ms = wait !== null ? wait : client.retryDelayMs(r, 0);
  }
  return out;
}

function haltResult(ref, op, what) {
  return {
    ok: false,
    halt: true,
    issue_number: ref.number,
    detail: `${what} #${ref.number} (${ref.id}) was edited on GitHub inside DevFlow-managed content since DevFlow last wrote it; `
      + `nothing was written. Resolve with \`df-tools gh outbox resolve ${op.seq} --accept-remote\` or \`--overwrite\`.`,
  };
}

// ─── gh helpers (every call goes through the client) ──────────────────────────

const unparseable = (what, r) => ({ ok: false, status: 1, stdout: str(r && r.stdout), stderr: `unparseable response from ${what}` });

/** GET a REST endpoint as JSON: `{ok:true, json}` or `{ok:false, r}` (r is classifiable). */
function getJson(endpoint) {
  const r = client.ghRead(['api', endpoint]);
  if (!r.ok) return { ok: false, r };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, r: unparseable(`gh api ${endpoint}`, r) };
  }
}

/** Every item of a REST list endpoint: `{ok:true, items}` or `{ok:false, r}`. */
function getList(endpoint) {
  const p = client.ghPaginate(endpoint);
  return p.ok ? { ok: true, items: p.items } : { ok: false, r: p };
}

/** POST/PATCH a JSON body on stdin (`--input -`): the body never travels in argv. */
function sendJson(method, endpoint, payload) {
  const r = client.ghWrite(['api', '--method', method, endpoint, '--input', '-'], { input: JSON.stringify(payload) });
  if (!r.ok) return { ok: false, r };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, r: unparseable(`gh api ${method} ${endpoint}`, r) };
  }
}

const labelNames = (issue) => (Array.isArray(issue && issue.labels) ? issue.labels : [])
  .map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * One flush's shared state. Makes no gh call.
 *
 * Options: `modes` (resolved capability modes: `{types, fields, hierarchy, pages, writable, types_by_name?,
 * pages_message?, field_ids?}`), `caps` (the capability record, for `issue_fields.ids`), `getModes(root)`
 * (returns modes, or `{modes, caps}`), `capability` (a gh-capability-shaped module, default lazily
 * required), `wikiRemote` (the wiki remote URL; default `gh-wiki.resolveWikiRemote`).
 *
 * @returns {object|{error:string, skipped?:true}}
 */
function createContext(root, opts = {}) {
  const gate = client.requireEnabled(root);
  if (gate.skipped) return { skipped: true, error: gate.reason };
  const runCtx = issueLib.createRunContext(root);
  if (runCtx.skipped) return { skipped: true, error: runCtx.reason };
  if (runCtx.ok === false) return { error: runCtx.error };
  return {
    root,
    repo: runCtx.repo,
    runCtx,
    mapping: runCtx.mapping,
    labels: isObject(gate.labels) ? gate.labels : {},
    modes: isObject(opts.modes) ? opts.modes : null,
    caps: isObject(opts.caps) ? opts.caps : null,
    getModes: typeof opts.getModes === 'function' ? opts.getModes : null,
    capability: opts.capability || null,
    wikiRemote: typeof opts.wikiRemote === 'string' ? opts.wikiRemote : undefined,
    cache: { subIssues: new Map(), blockedBy: new Map(), scans: new Map(), labels: new Set() },
    store: null,
    current: null,
  };
}

/** Re-read the mapping before every op, so a change made by another process (or a test) is seen. */
function refreshMapping(ctx) {
  const report = mappingLib.readMappingV3WithReport(ctx.root);
  if (report.error) return report.error;
  const m = report.mapping;
  for (const key of ['milestones', 'objectives', 'conflicts']) {
    if (!isObject(m[key])) m[key] = {};
  }
  ctx.mapping = m;
  ctx.runCtx.mapping = m;
  ctx.runCtx.conflicts = m.conflicts;
  return null;
}

const DEFAULT_WIKI_BLOCK = 'the wiki is not available: create the first wiki page in the GitHub web UI, then run `df-tools gh outbox flush`';

/** Capabilities for this repo: gh-capability's detection (re-detected once when provisional or stale). */
function defaultGetModes(root, { capability } = {}) {
  let cap = capability;
  if (!cap) {
    try {
      cap = require('./gh-capability.cjs'); // lazy: this module does not depend on it being loadable
    } catch (e) {
      throw new Error(`gh-capability.cjs is not available (${e && e.message ? e.message : e}); pass modes explicitly`);
    }
  }
  const mapping = mappingLib.readMappingV3(root);
  const first = Object.values(isObject(mapping.objectives) ? mapping.objectives : {})[0];
  const probeIssue = first && Number.isInteger(first.issue_id) ? first.issue_id : undefined;
  let caps = cap.detectCapabilities(root, { probeIssue });
  if (caps && caps.ok === false) throw new Error(caps.error || 'capability detection failed');
  if (caps && (caps.provisional || caps.stale)) {
    const fresh = cap.detectCapabilities(root, { probeIssue, refresh: true });
    if (fresh && fresh.ok !== false && !fresh.provisional) caps = fresh;
  }
  return { modes: cap.resolveModes(caps), caps };
}

/** Resolve modes once per context. Returns a failure result, or null when `ctx.modes` is ready. */
function ensureModes(ctx) {
  if (!ctx.modes) {
    let got;
    try {
      got = (ctx.getModes || defaultGetModes)(ctx.root, { capability: ctx.capability });
    } catch (e) {
      return failWith('error', `could not resolve repository capabilities: ${e && e.message ? e.message : e}`);
    }
    if (isObject(got) && isObject(got.modes)) {
      ctx.modes = got.modes;
      ctx.caps = isObject(got.caps) ? got.caps : ctx.caps;
    } else if (isObject(got)) {
      ctx.modes = got;
    } else {
      return failWith('error', 'could not resolve repository capabilities: no modes returned');
    }
  }
  if (ctx.modes.writable === false) {
    return failWith('permission', 'this token has no push access to the repository; nothing can be written');
  }
  return null;
}

/** `types_by_name[Name]` when the capability record is per type, else the repo-wide `types` mode. */
function typeMode(modes, name) {
  const by = modes.types_by_name;
  if (isObject(by) && typeof by[name] === 'string') return by[name];
  return modes.types || 'native';
}

function fieldIds(ctx) {
  if (isObject(ctx.modes.field_ids)) return ctx.modes.field_ids;
  const f = ctx.caps && ctx.caps.issue_fields;
  return f && isObject(f.ids) ? f.ids : {};
}

// ─── Issue references ─────────────────────────────────────────────────────────

/**
 * Resolve a DevFlow id to its GitHub issue through the mapping. A TRD or Decision has `issue_number` and
 * `rest_id`; an objective only a number (46's `issue_id` IS the number), so `rest_id` is null for it.
 * @returns {{number:number, rest_id:number|null, kind:'trd'|'objective', id:string}|{error:string}}
 */
function issueRef(ctx, id) {
  const tid = mappingLib.toTrdId(id);
  if (tid !== null) {
    const e = mappingLib.getTrd(ctx.mapping, tid);
    if (!e) return { error: `TRD ${tid} has no issue yet; run gh sync first` };
    return { number: e.issue_number, rest_id: e.rest_id, kind: 'trd', id: tid };
  }
  const oid = mappingLib.toObjectiveId(id);
  if (oid === null) return { error: `${JSON.stringify(id)} is not an objective, TRD or Decision id` };
  const e = mappingLib.getEntry(ctx.mapping, oid);
  if (!e) return { error: `objective ${oid} has no issue yet; run gh sync first` };
  return { number: e.issue_id, rest_id: null, kind: 'objective', id: oid };
}

const issueEndpoint = (ctx, number) => `repos/${ctx.repo}/issues/${number}`;

/** The database id of an objective issue (not kept in the mapping), from one read. */
function ensureRestId(ctx, ref) {
  if (ref.rest_id !== null) return null;
  const got = getJson(issueEndpoint(ctx, ref.number));
  if (!got.ok) return failFrom(got.r, `read issue #${ref.number}`);
  ref.rest_id = got.json.id;
  return null;
}

// ─── Base store and remote-edit detection (D-24) ──────────────────────────────

const TICK_RE = /^(\s*[-*+]\s+)\[[xX]\]/gm;
const normaliseTicks = (text) => text.replace(TICK_RE, '$1[ ]');

/**
 * Hash of the DevFlow-managed section text of a body: every managed section present, in a fixed order, with
 * checkboxes normalised (`- [x]` -> `- [ ]`) in `criteria` and `trds`. A verifier or a human ticking a
 * criterion is therefore NOT an edit of the managed text (the tick is carried forward by preserve_ticks),
 * while any other change inside a managed region is.
 */
function managedHash(body) {
  const parts = [];
  for (const name of [...bodyLib.SECTION_ORDER, ...bodyLib.OPTIONAL_SECTIONS]) {
    const inner = bodyLib.extractSection(str(body), name);
    if (inner === null) continue;
    parts.push(`${name}\n${name === 'criteria' || name === 'trds' ? normaliseTicks(inner) : inner}`);
  }
  return trd.contentHash(parts.join('\n\u0000\n'));
}

/** The base entry for an issue, from the issue GitHub returned. `frozen` is carried over from `prev`. */
function baseFromIssue(issue, prev) {
  const body = str(issue.body);
  const entry = {
    issue_number: issue.number,
    issue_id: issue.id,
    body_hash: trd.contentHash(body),
    updated_at: typeof issue.updated_at === 'string' ? issue.updated_at : null,
    managed_hash: managedHash(body),
  };
  if (prev && prev.frozen) entry.frozen = true;
  return entry;
}

/** Store the base for `key` from a returned issue; a refusal becomes a warning, never a failed op. */
function saveBase(ctx, key, issue, warnings) {
  const prev = outbox.getBase(ctx.root, key);
  const r = outbox.setBase(ctx.root, key, baseFromIssue(issue, prev));
  if (!r.ok) warnings.push(`could not record the base for ${key}: ${r.error}`);
}

/**
 * Has someone edited what DevFlow manages since it last wrote? `managed` selects the objective rule
 * (compare the managed-section hash; human text outside is fine) over the TRD rule (the whole body is
 * DevFlow's). `updated_at` equal to the base's is only a pre-filter that skips the hashing.
 * @returns {{halt:boolean, adopt?:boolean, note?:string}}
 */
function remoteEditCheck(base, current, managed) {
  if (!base) return { halt: false, adopt: true };
  if (current.updated_at === base.updated_at) return { halt: false };
  const body = str(current.body);
  if (trd.contentHash(body) === base.body_hash) return { halt: false };
  if (!managed) return { halt: true };
  if (base.managed_hash === undefined || base.managed_hash === null) {
    return { halt: false, adopt: true, note: 'the recorded base has no managed-section hash; adopting the current body as the base' };
  }
  return { halt: managedHash(body) !== base.managed_hash };
}

// ─── Labels, milestones, scans ────────────────────────────────────────────────

/** `gh label create`, once per context per label; an existing label is success. Null, or a failed gh result. */
function ensureLabel(ctx, name) {
  if (ctx.cache.labels.has(name)) return null;
  const r = client.ghWrite([
    'label', 'create', name, '--repo', ctx.repo, '--color', '1d76db', '--description', 'DevFlow tracking',
  ]);
  if (r.ok || /already exists/i.test(`${r.stderr}\n${r.stdout}`)) {
    ctx.cache.labels.add(name);
    return null;
  }
  return r;
}

const labelFor = (ctx, role) => (role === 'decision' ? ctx.labels.decision || 'devflow:decision' : ctx.labels.trd || 'devflow:trd');
const typeLabel = (name) => `devflow:type/${String(name).toLowerCase()}`;

/** The issues carrying `label`, listed once per context and indexed by their `devflow:id` marker. */
function scanByLabel(ctx, label) {
  if (ctx.cache.scans.has(label)) return ctx.cache.scans.get(label);
  const list = getList(`repos/${ctx.repo}/issues?labels=${encodeURIComponent(label)}&state=all`);
  let scan;
  if (!list.ok) {
    scan = { ok: false, r: list.r };
  } else {
    const issues = list.items.filter((i) => i && !i.pull_request);
    scan = { ok: true, ...bodyLib.indexByMarker(issues) };
  }
  ctx.cache.scans.set(label, scan);
  return scan;
}

/** Fold a ticked line of the existing `trds` task list into freshly rendered text, keyed by `#number`. */
function carryTaskTicks(existing, rendered) {
  if (existing === null) return rendered;
  const ticked = new Set();
  for (const line of existing.split('\n')) {
    const m = /^\s*[-*+]\s+\[[xX]\]\s+#(\d+)\b/.exec(line);
    if (m) ticked.add(m[1]);
  }
  if (ticked.size === 0) return rendered;
  return rendered.split('\n').map((line) => {
    const m = /^(\s*[-*+]\s+)\[ \](\s+#(\d+)\b.*)$/.exec(line);
    return m && ticked.has(m[3]) ? `${m[1]}[x]${m[2]}` : line;
  }).join('\n');
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const MAX_COMMENT_BODY = trd.COMMENT_MAX_CHARS;

/**
 * upsert-issue: find (mapping, else marker scan), then create or update one TRD / Decision issue.
 * Create is one REST POST (`--input -`) that stores BOTH number and rest id. Update patches only what
 * changed and only writes the body after the remote-edit check; a frozen TRD body is never patched.
 */
function handleUpsertIssue(ctx, op) {
  const w = [];
  const { role } = op.target;
  const p = op.payload;
  const id = mappingLib.toTrdId(op.target.id);
  if (id === null) return failWith('error', `upsert-issue: ${JSON.stringify(op.target.id)} is not a TRD or Decision id`);
  const modeErr = ensureModes(ctx);
  if (modeErr) return modeErr;
  if (trd.budget(p.body).status === 'over') {
    return failWith('validation', `issue body for ${id} is ${p.body.length} characters; the limit is ${trd.TRD_MAX_CHARS}`);
  }

  const typeName = role === 'decision' ? 'Decision' : 'TRD';
  const native = typeMode(ctx.modes, typeName) === 'native';
  const wantType = p.type && native ? p.type : null;
  const labels = [...new Set([...p.labels, ...(p.type && !native ? [typeLabel(p.type)] : [])])];

  const entry = mappingLib.getTrd(ctx.mapping, id);
  let number = entry ? entry.issue_number : null;
  if (number === null) {
    const scan = scanByLabel(ctx, labelFor(ctx, role));
    if (!scan.ok) return failFrom(scan.r, `scan ${labelFor(ctx, role)} issues`);
    if (Object.hasOwn(scan.duplicates, id)) {
      return failWith('error', `duplicate issues claim ${id}: ${scan.duplicates[id].map((n) => `#${n}`).join(', ')}; close all but one, then flush again`);
    }
    number = Object.hasOwn(scan.byId, id) ? scan.byId[id] : null;
  }

  if (number === null) return createTrdIssue(ctx, id, role, p, labels, wantType, w);

  const got = getJson(issueEndpoint(ctx, number));
  if (!got.ok) return failFrom(got.r, `read issue #${number}`);
  const cur = got.json;
  mappingLib.setTrd(ctx.mapping, id, { issue_number: cur.number, rest_id: cur.id, role });
  const base = outbox.getBase(ctx.root, id);
  const ref = { number: cur.number, id };

  const sameBody = trd.normalise(str(cur.body)) === trd.normalise(p.body);
  const frozen = (base && base.frozen === true) || (!sameBody && frozenByLog(ctx, cur.number));
  if (frozen) {
    if (base && trd.contentHash(str(cur.body)) !== base.body_hash) {
      w.push(`drift: frozen TRD ${id} (#${cur.number}) differs from its last recorded body; it was not patched`);
    } else if (!sameBody) {
      w.push(`frozen: TRD ${id} (#${cur.number}) is frozen; its local text differs from GitHub and the body was not patched`);
    }
    if (!base || base.frozen !== true) {
      const r = outbox.setBase(ctx.root, id, { ...baseFromIssue(cur, base), frozen: true });
      if (!r.ok) w.push(`could not record the base for ${id}: ${r.error}`);
    }
    return ok(w, { issue_number: cur.number });
  }

  const changes = {};
  if (!sameBody) changes.body = p.body;
  if (cur.title !== p.title) changes.title = p.title;
  const have = labelNames(cur);
  const missing = labels.filter((l) => !have.includes(l));
  if (p.milestone_title && !(cur.milestone && cur.milestone.title === p.milestone_title)) {
    const n = issueLib.ensureMilestone(ctx.runCtx, p.milestone_title);
    if (n === null) w.push(`milestone "${p.milestone_title}" could not be resolved; ${id} was left as it is`);
    else changes.milestone = n;
  }
  if (missing.length > 0) {
    for (const l of missing) {
      const failed = ensureLabel(ctx, l);
      if (failed) return failFrom(failed, `create label ${l}`);
    }
    changes.labels = [...have, ...missing];
  }

  if (Object.keys(changes).length === 0) {
    if (!base || sameBody) saveBase(ctx, id, cur, w);
    return ok(w, { issue_number: cur.number });
  }
  if (changes.body !== undefined) {
    const chk = remoteEditCheck(base, cur, false);
    if (chk.halt) return haltResult(ref, op, 'issue');
  }
  const sent = sendJson('PATCH', issueEndpoint(ctx, cur.number), changes);
  if (!sent.ok) return failFrom(sent.r, `update issue #${cur.number}`);
  const clean = changes.body !== undefined || !base || trd.contentHash(str(sent.json.body)) === base.body_hash;
  if (clean) saveBase(ctx, id, sent.json, w);
  return ok(w, { issue_number: cur.number });
}

/** Create one TRD / Decision issue. Labels and the milestone are ensured first; the type is verified after. */
function createTrdIssue(ctx, id, role, p, labels, wantType, w) {
  for (const l of labels) {
    const failed = ensureLabel(ctx, l);
    if (failed) return failFrom(failed, `create label ${l}`);
  }
  const body = { title: p.title, body: p.body, labels };
  if (p.milestone_title) {
    const n = issueLib.ensureMilestone(ctx.runCtx, p.milestone_title);
    if (n === null) w.push(`milestone "${p.milestone_title}" could not be resolved; ${id} was created without one`);
    else body.milestone = n;
  }
  if (wantType) body.type = wantType;

  const sent = sendJson('POST', `repos/${ctx.repo}/issues`, body);
  if (!sent.ok) return failFrom(sent.r, `create issue for ${id}`);
  const made = sent.json;
  mappingLib.setTrd(ctx.mapping, id, { issue_number: made.number, rest_id: made.id, role });
  if (wantType && !(made.type && made.type.name === wantType)) {
    w.push(`type ${wantType} not applied to #${made.number} (${id}): GitHub dropped it (no push access, or the org has no such issue type); the ${labelFor(ctx, role)} label still identifies it`);
  }
  saveBase(ctx, id, made, w);
  const scan = ctx.cache.scans.get(labelFor(ctx, role));
  if (scan && scan.ok) scan.byId[id] = made.number;
  return ok(w, { created: true, issue_number: made.number });
}

/** Is the TRD frozen according to its spec-rev comment? A read only; a read failure means "not known frozen". */
function frozenByLog(ctx, number) {
  const list = getList(`${issueEndpoint(ctx, number)}/comments`);
  if (!list.ok) return false;
  const tid = ctx.current && ctx.current.trdId;
  if (!tid) return false;
  const found = bodyLib.findCommentsByMarker(list.items, tid, 'spec-rev');
  return found.length > 0 && trd.isFrozen(found[0].comment.body);
}

/** patch-body: managed sections merged onto the fresh body, or a whole-body replace (the fold). */
function handlePatchBody(ctx, op) {
  const w = [];
  const p = op.payload;
  const ref = issueRef(ctx, op.target.id);
  if (ref.error) return failWith('error', ref.error);
  const got = getJson(issueEndpoint(ctx, ref.number));
  if (!got.ok) return failFrom(got.r, `read issue #${ref.number}`);
  const cur = got.json;
  const base = outbox.getBase(ctx.root, ref.id);

  let next;
  let unchanged;
  if (p.mode === 'replace') {
    if (trd.budget(p.body).status === 'over') {
      return failWith('validation', `replacement body for ${ref.id} is ${p.body.length} characters; the limit is ${trd.TRD_MAX_CHARS}`);
    }
    next = p.body;
    unchanged = trd.normalise(str(cur.body)) === trd.normalise(next);
  } else {
    const modeErr = ensureModes(ctx);
    if (modeErr) return modeErr;
    const derived = deriveSections(ctx, p, ref.id, str(cur.body));
    w.push(...derived.warnings);
    const merged = bodyLib.mergeManaged(str(cur.body), { ...derived.sections, ...p.sections }, ref.id, { preserveTicks: p.preserve_ticks === true });
    if (!merged.ok) return failWith('validation', merged.error);
    w.push(...merged.warnings);
    next = merged.body;
    unchanged = !merged.changed;
  }

  if (unchanged) {
    saveBase(ctx, ref.id, cur, w);
    return ok(w, { issue_number: ref.number });
  }
  const chk = remoteEditCheck(base, cur, p.mode === 'managed');
  if (chk.halt) return haltResult(ref, op, 'issue');
  if (chk.note) w.push(chk.note);

  const sent = sendJson('PATCH', issueEndpoint(ctx, ref.number), { body: next });
  if (!sent.ok) return failFrom(sent.r, `patch issue #${ref.number}`);
  saveBase(ctx, ref.id, sent.json, w);
  return ok(w, { issue_number: ref.number });
}

const DIR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function wikiStore(ctx) {
  if (!ctx.store) {
    const remote = ctx.wikiRemote !== undefined ? { remote: ctx.wikiRemote } : {};
    ctx.store = wikiLib.openStore(ctx.root, { mode: 'wiki', ...remote });
  }
  return ctx.store;
}

/**
 * Build the derived managed sections of an objective body: `wiki` (page link at the clone's pinned
 * revision plus the cache-dir marker), `trds` (native count line or a task list, by hierarchy mode) and
 * `meta` (only for a degraded types/fields mode, and only the keys that mode needs).
 * @returns {{sections:object, warnings:string[]}}
 */
function deriveSections(ctx, payload, id, currentBody) {
  const out = { sections: {}, warnings: [] };
  const d = payload && payload.derive;
  if (!isObject(d)) return out;
  const objectiveId = mappingLib.toObjectiveId(id !== undefined ? id : ctx.current && ctx.current.id);

  if (d.wiki) {
    const { dir } = d.wiki;
    const page = wikiLib.objectivePage(dir);
    if (!page || !DIR_RE.test(dir) || dir.includes('..')) {
      out.warnings.push(`wiki: ${JSON.stringify(dir)} is not a usable objective directory name; the wiki section was left alone`);
    } else if (ctx.modes.pages === 'docs') {
      out.sections.wiki = `<!-- devflow:dir=${dir} -->\nDetail: \`${wikiLib.DOCS_DIR_REL}/${page}.md\` (docs backend)`;
    } else if (ctx.modes.pages === 'wiki') {
      const sha = wikiStore(ctx).headSha();
      if (!sha) {
        out.warnings.push('wiki: no wiki clone revision is known yet (nothing pushed); the wiki section was left alone');
      } else {
        try {
          out.sections.wiki = bodyLib.buildWikiSection({ dir, page, url: wikiLib.pageRevisionUrl(ctx.repo, page, sha), sha });
        } catch (e) {
          out.warnings.push(`wiki: ${e.message}`);
        }
      }
    } else {
      out.warnings.push('wiki: pages are blocked; the wiki section was left alone');
    }
  }

  if (d.trds === true && objectiveId !== null) {
    const items = mappingLib.listTrds(ctx.mapping, objectiveId).map((tid) => ({
      id: tid, number: mappingLib.getTrd(ctx.mapping, tid).issue_number,
    }));
    const mode = ctx.modes.hierarchy === 'tasklist' ? 'tasklist' : 'native';
    const text = bodyLib.buildTrdsSection({ mode, trds: items });
    out.sections.trds = mode === 'tasklist' ? carryTaskTicks(bodyLib.extractSection(currentBody, 'trds'), text) : text;
  }

  if (d.meta) {
    const keep = {};
    if (typeMode(ctx.modes, 'Objective') === 'labels' && d.meta.type !== undefined) keep.type = d.meta.type;
    if (ctx.modes.fields === 'meta') {
      for (const k of ['work', 'kind']) if (d.meta[k] !== undefined) keep[k] = d.meta[k];
    }
    const text = bodyLib.buildMetaSection(keep);
    if (text !== '') out.sections.meta = text;
  }
  return out;
}

/** patch-issue: type (native, or the degraded label), state and reason, extra labels. One PATCH, or none. */
function handlePatchIssue(ctx, op) {
  const w = [];
  const p = op.payload;
  const ref = issueRef(ctx, op.target.id);
  if (ref.error) return failWith('error', ref.error);
  const modeErr = ensureModes(ctx);
  if (modeErr) return modeErr;
  const got = getJson(issueEndpoint(ctx, ref.number));
  if (!got.ok) return failFrom(got.r, `read issue #${ref.number}`);
  const cur = got.json;

  const changes = {};
  const have = labelNames(cur);
  const wantLabels = [...(p.labels_add || [])];
  if (p.type !== undefined) {
    const typeName = ref.kind === 'objective' ? 'Objective' : (/-d\d+$/.test(ref.id) ? 'Decision' : 'TRD');
    if (typeMode(ctx.modes, typeName) === 'native') {
      if (!(cur.type && cur.type.name === p.type)) changes.type = p.type;
    } else {
      wantLabels.push(typeLabel(p.type));
    }
  }
  if (p.state !== undefined && cur.state !== p.state) changes.state = p.state;
  if (p.state_reason !== undefined && (changes.state !== undefined || cur.state_reason !== p.state_reason)) {
    changes.state_reason = p.state_reason;
  }
  const missing = wantLabels.filter((l, i) => !have.includes(l) && wantLabels.indexOf(l) === i);
  if (missing.length > 0) {
    for (const l of missing) {
      const failed = ensureLabel(ctx, l);
      if (failed) return failFrom(failed, `create label ${l}`);
    }
    changes.labels = [...have, ...missing];
  }
  if (Object.keys(changes).length === 0) return ok(w);

  const sent = sendJson('PATCH', issueEndpoint(ctx, ref.number), changes);
  if (!sent.ok) return failFrom(sent.r, `patch issue #${ref.number}`);
  if (changes.type !== undefined && !(sent.json.type && sent.json.type.name === changes.type)) {
    w.push(`type ${changes.type} not applied to #${ref.number} (${ref.id}): GitHub dropped it`);
  }
  return ok(w);
}

/** The numbers already linked under `parent` (or already blocking `issue`), read once per context. */
function knownNumbers(ctx, cache, number, tail) {
  if (cache.has(number)) return { ok: true, set: cache.get(number) };
  const list = getList(`${issueEndpoint(ctx, number)}/${tail}`);
  if (!list.ok) return { ok: false, r: list.r };
  const set = new Set(list.items.map((i) => i.number));
  cache.set(number, set);
  return { ok: true, set };
}

/** link-sub-issue: the child's REST ID with -F (never its number). The task-list fallback writes nothing. */
function handleLink(ctx, op) {
  const w = [];
  const modeErr = ensureModes(ctx);
  if (modeErr) return modeErr;
  if (ctx.modes.hierarchy === 'tasklist') return ok(w, { note: 'tasklist' });
  const parent = issueRef(ctx, op.target.parent);
  if (parent.error) return failWith('error', parent.error);
  const child = issueRef(ctx, op.target.child);
  if (child.error) return failWith('error', child.error);
  if (child.rest_id === null) return failWith('error', `${op.target.child} is not a TRD or Decision: only those carry a REST id to link`);

  const known = knownNumbers(ctx, ctx.cache.subIssues, parent.number, 'sub_issues');
  if (!known.ok) return failFrom(known.r, `list sub-issues of #${parent.number}`);
  if (known.set.has(child.number)) return ok(w);

  const r = client.ghWrite([
    'api', '--method', 'POST', `repos/${ctx.repo}/issues/${parent.number}/sub_issues`, '-F', `sub_issue_id=${child.rest_id}`,
  ]);
  if (!r.ok && classifyFailure(r) !== 'already_exists') return failFrom(r, `link #${child.number} under #${parent.number}`);
  known.set.add(child.number);
  return ok(w);
}

/** block: the blocker's REST ID with -F on the blocked issue's number. */
function handleBlock(ctx, op) {
  const w = [];
  const blocked = issueRef(ctx, op.target.blocked);
  if (blocked.error) return failWith('error', blocked.error);
  const blocker = issueRef(ctx, op.target.blocker);
  if (blocker.error) return failWith('error', blocker.error);
  if (blocker.rest_id === null) return failWith('error', `${op.target.blocker} is not a TRD or Decision: only those carry a REST id to block on`);

  const known = knownNumbers(ctx, ctx.cache.blockedBy, blocked.number, 'dependencies/blocked_by');
  if (!known.ok) return failFrom(known.r, `list blockers of #${blocked.number}`);
  if (known.set.has(blocker.number)) return ok(w);

  const r = client.ghWrite([
    'api', '--method', 'POST', `repos/${ctx.repo}/issues/${blocked.number}/dependencies/blocked_by`, '-F', `issue_id=${blocker.rest_id}`,
  ]);
  if (!r.ok && classifyFailure(r) !== 'already_exists') return failFrom(r, `block #${blocked.number} on #${blocker.number}`);
  known.set.add(blocker.number);
  return ok(w);
}

const fieldIdOf = (v) => (isObject(v) ? (v.field_id !== undefined ? v.field_id : v.field && v.field.id) : undefined);
const fieldValueOf = (v) => {
  const raw = isObject(v) ? v.value : undefined;
  return isObject(raw) ? (raw.name !== undefined ? raw.name : raw.value) : raw;
};

/** set-fields: org issue-field values by field id, only those not already set; `meta` mode writes nothing. */
function handleSetFields(ctx, op) {
  const w = [];
  const modeErr = ensureModes(ctx);
  if (modeErr) return modeErr;
  if (ctx.modes.fields === 'meta') return ok(w, { note: 'meta' });
  const ref = issueRef(ctx, op.target.id);
  if (ref.error) return failWith('error', ref.error);
  const ids = fieldIds(ctx);
  const desired = [];
  for (const [key, value] of Object.entries(op.payload.values)) {
    if (!Number.isInteger(ids[key])) {
      return failWith('error', `no issue field id is known for "${key}"; refresh the capability cache (df-tools gh outbox status) or use the meta fallback`);
    }
    desired.push({ field_id: ids[key], value });
  }
  const got = getJson(`${issueEndpoint(ctx, ref.number)}/issue-field-values`);
  if (!got.ok) return failFrom(got.r, `read field values of #${ref.number}`);
  const have = Array.isArray(got.json) ? got.json : [];
  const pending = desired.filter((d) => !have.some((h) => fieldIdOf(h) === d.field_id && fieldValueOf(h) === d.value));
  if (pending.length === 0) return ok(w);
  const sent = sendJson('POST', `${issueEndpoint(ctx, ref.number)}/issue-field-values`, { issue_field_values: pending });
  if (!sent.ok) return failFrom(sent.r, `set field values on #${ref.number}`);
  return ok(w);
}

// Comments --------------------------------------------------------------------

const stripMarker = (body) => {
  const at = body.indexOf('\n');
  return at === -1 ? '' : body.slice(at + 1);
};

/** The text carried by a set of marker-stamped comments (marker line stripped, parts joined). */
function textOfComments(bodies) {
  return trd.joinParts(bodies.map(stripMarker));
}

function readComments(ctx, ref) {
  const list = getList(`${issueEndpoint(ctx, ref.number)}/comments`);
  return list.ok ? { ok: true, items: list.items.map((c) => ({ id: c.id, body: str(c.body), updated_at: c.updated_at })) } : list;
}

/** Record the comment ids of `kind` for a TRD in the mapping (objectives keep none). */
function recordCommentIds(ctx, ref, kind, ids) {
  if (ref.kind !== 'trd') return;
  const e = mappingLib.getTrd(ctx.mapping, ref.id);
  if (!e) return;
  const have = (e.comment_ids && e.comment_ids[kind]) || [];
  if (JSON.stringify(have) === JSON.stringify(ids)) return;
  mappingLib.setTrd(ctx.mapping, ref.id, { comment_ids: { [kind]: ids } });
}

/** Mark a TRD frozen in the base store (the push must never patch its body again). */
function markFrozen(ctx, ref, warnings) {
  if (ref.kind !== 'trd') return;
  const prev = outbox.getBase(ctx.root, ref.id);
  if (prev && prev.frozen === true) return;
  if (prev) {
    const r = outbox.setBase(ctx.root, ref.id, { ...prev, frozen: true });
    if (!r.ok) warnings.push(`could not record the freeze for ${ref.id}: ${r.error}`);
    return;
  }
  const got = getJson(issueEndpoint(ctx, ref.number));
  if (!got.ok) {
    warnings.push(`could not record the freeze for ${ref.id}: ${got.r.error || got.r.stderr}`);
    return;
  }
  const r = outbox.setBase(ctx.root, ref.id, { ...baseFromIssue(got.json, null), frozen: true });
  if (!r.ok) warnings.push(`could not record the freeze for ${ref.id}: ${r.error}`);
}

function handleUpsertComment(ctx, op) {
  const ref = issueRef(ctx, op.target.id);
  if (ref.error) return failWith('error', ref.error);
  const idErr = ensureRestId(ctx, ref);
  if (idErr) return idErr;
  const read = readComments(ctx, ref);
  if (!read.ok) return failFrom(read.r, `read comments of #${ref.number}`);
  try {
    return op.payload.mode === 'append-spec-rev'
      ? appendSpecRevComment(ctx, op, ref, read.items)
      : replaceComment(ctx, op, ref, read.items);
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) return failWith('validation', e.message);
    throw e;
  }
}

/**
 * upsert-comment (replace): one comment, or numbered parts when the text is over the limit. Existing parts
 * are patched in order, missing ones posted, surplus older parts re-marked `<kind>-superseded` (never
 * deleted). A comment edited on GitHub since DevFlow last wrote it halts instead of being overwritten.
 */
function replaceComment(ctx, op, ref, items) {
  const w = [];
  const { kind } = op.target;
  const text = trd.normalise(op.payload.text);
  const marker = bodyLib.commentMarker(ref.id, kind);
  const existing = bodyLib.findCommentsByMarker(items, ref.id, kind);
  const key = `${ref.id}#${kind}`;
  const base = outbox.getBase(ctx.root, key);

  let currentText = null;
  if (existing.length > 0) {
    const joined = textOfComments(existing.map((f) => f.comment.body));
    currentText = joined.ok ? joined.text : null;
    if (base && !(currentText !== null && trd.contentHash(currentText) === base.body_hash)) {
      return haltResult(ref, op, `${kind} comment on issue`);
    }
  }

  const parts = trd.splitParts(text, MAX_COMMENT_BODY, { reserve: marker.length + 1 });
  const bodies = parts.map((part) => `${marker}\n${part}`);

  const saveCommentBase = (finalBodies, updatedAt) => {
    const joined = textOfComments(finalBodies);
    const r = outbox.setBase(ctx.root, key, {
      issue_number: ref.number, issue_id: ref.rest_id, body_hash: trd.contentHash(joined.ok ? joined.text : text), updated_at: updatedAt || null,
    });
    if (!r.ok) w.push(`could not record the base for ${key}: ${r.error}`);
  };

  if (existing.length === bodies.length && existing.every((f, i) => trd.normalise(f.comment.body) === bodies[i])) {
    saveCommentBase(bodies, existing[existing.length - 1].comment.updated_at);
    return ok(w);
  }

  const ids = [];
  const finals = [];
  let updatedAt = null;
  for (let i = 0; i < bodies.length; i++) {
    if (i < existing.length) {
      const c = existing[i].comment;
      if (trd.normalise(c.body) === bodies[i]) {
        ids.push(c.id);
        finals.push(c.body);
        continue;
      }
      const sent = sendJson('PATCH', `repos/${ctx.repo}/issues/comments/${c.id}`, { body: bodies[i] });
      if (!sent.ok) return failFrom(sent.r, `update ${kind} comment ${c.id} on #${ref.number}`);
      ids.push(c.id);
      finals.push(str(sent.json.body) || bodies[i]);
      updatedAt = sent.json.updated_at || updatedAt;
    } else {
      const sent = sendJson('POST', `${issueEndpoint(ctx, ref.number)}/comments`, { body: bodies[i] });
      if (!sent.ok) return failFrom(sent.r, `post ${kind} comment on #${ref.number}`);
      ids.push(sent.json.id);
      finals.push(str(sent.json.body) || bodies[i]);
      updatedAt = sent.json.updated_at || updatedAt;
    }
  }
  const superseded = bodyLib.commentMarker(ref.id, `${kind}-superseded`);
  for (let i = bodies.length; i < existing.length; i++) {
    const c = existing[i].comment;
    const sent = sendJson('PATCH', `repos/${ctx.repo}/issues/comments/${c.id}`, { body: `${superseded}\n${stripMarker(c.body)}` });
    if (!sent.ok) return failFrom(sent.r, `supersede ${kind} comment ${c.id} on #${ref.number}`);
  }
  recordCommentIds(ctx, ref, kind, ids);
  saveCommentBase(finals, updatedAt);
  return ok(w);
}

/** upsert-comment (append-spec-rev): one more row in the append-only log; never halts, never loses a row. */
function appendSpecRevComment(ctx, op, ref, items) {
  const w = [];
  const { kind } = op.target;
  const existing = bodyLib.findCommentsByMarker(items, ref.id, kind);
  const comment = existing.length > 0 ? existing[0].comment : null;
  const raw = comment ? comment.body : `${bodyLib.commentMarker(ref.id, kind)}\n`;
  const next = trd.appendSpecRev(raw, op.payload.entry);

  if (!comment || next !== raw) {
    const sent = comment
      ? sendJson('PATCH', `repos/${ctx.repo}/issues/comments/${comment.id}`, { body: next })
      : sendJson('POST', `${issueEndpoint(ctx, ref.number)}/comments`, { body: next });
    if (!sent.ok) return failFrom(sent.r, `${comment ? 'update' : 'post'} ${kind} comment on #${ref.number}`);
    if (!comment) recordCommentIds(ctx, ref, kind, [sent.json.id]);
  }
  if (trd.parseSpecRev(next).frozen) markFrozen(ctx, ref, w);
  return ok(w);
}

/** post-scope: scope comment number `n` on the TRD issue, once (an existing `n` is never posted again). */
function handlePostScope(ctx, op) {
  const w = [];
  const ref = issueRef(ctx, op.target.id);
  if (ref.error) return failWith('error', ref.error);
  const { n } = op.target;
  const read = readComments(ctx, ref);
  if (!read.ok) return failFrom(read.r, `read comments of #${ref.number}`);
  const have = trd.parseScopeComments(read.items).scopes.find((s) => s.n === n);
  if (have) return ok(w);

  const { text } = op.payload;
  const comment = text.startsWith(trd.scopeMarker(n)) ? text : trd.buildScopeComment(n, text);
  if (typeof comment !== 'string') return failWith('validation', comment.error);
  const sent = sendJson('POST', `${issueEndpoint(ctx, ref.number)}/comments`, { body: comment });
  if (!sent.ok) return failFrom(sent.r, `post scope n=${n} on #${ref.number}`);
  const e = mappingLib.getTrd(ctx.mapping, ref.id);
  if (e) recordCommentIds(ctx, ref, 'scope', [...((e.comment_ids && e.comment_ids.scope) || []), sent.json.id]);
  return ok(w);
}

/** A wiki store failure, as a handler result. */
function wikiFailure(r, what) {
  if (r.offline) return failWith('offline', `${what}: ${r.error}`);
  if (r.uninitialised) return failWith('blocked', `${what}: ${DEFAULT_WIKI_BLOCK}`);
  if (r.auth) return failWith('permission', `${what}: ${r.error}`);
  if (r.conflict) {
    const files = Array.isArray(r.files) && r.files.length ? ` (${r.files.join(', ')})` : '';
    return failWith('conflict', `${what}: the wiki has a rebase conflict${files}; resolve it in .planning/wiki, then flush again`);
  }
  return failWith('error', `${what}: ${r.error}`);
}

/**
 * wiki-push: write the CURRENT cache files named by the op as wiki pages (or `docs/devflow/` pages) and
 * publish. `pages:'blocked'` blocks the op with the capability message; an uninitialised wiki is a human
 * step, never a silent switch to docs.
 */
function handleWikiPush(ctx, op) {
  const w = [];
  const modeErr = ensureModes(ctx);
  if (modeErr) return modeErr;
  const { pages } = ctx.modes;
  if (pages === 'blocked') return failWith('blocked', ctx.modes.pages_message || DEFAULT_WIKI_BLOCK);

  const mode = pages === 'docs' ? 'docs' : 'wiki';
  const remote = ctx.wikiRemote !== undefined ? { remote: ctx.wikiRemote } : {};
  if (mode === 'wiki') {
    const cloned = wikiLib.ensureClone(ctx.root, remote);
    if (!cloned.ok) return wikiFailure(cloned, 'open the wiki clone');
  }
  const store = wikiLib.openStore(ctx.root, { mode, ...remote });
  for (const rel of op.payload.pages) {
    const page = wikiLib.pageForCachePath(rel);
    if (!page) {
      w.push(`${rel} is not a wiki document; skipped`);
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(path.join(ctx.root, '.planning', rel), 'utf8');
    } catch {
      w.push(`${rel}: the source file is missing; skipped`);
      continue;
    }
    const written = store.writePage(page, text);
    if (!written.ok) return failWith('error', `write page ${page}: ${written.error}`);
  }
  const pushed = store.push({ message: op.payload.message });
  if (!pushed.ok) return wikiFailure(pushed, 'push the wiki');
  return ok(w, { sha: pushed.sha === undefined ? null : pushed.sha });
}

/** One handler per `OP_KINDS` kind. `(ctx, op) -> {ok, warnings, ...} | {ok:false, class|halt, ...}`. */
const HANDLERS = Object.freeze({
  'upsert-issue': handleUpsertIssue,
  'patch-body': handlePatchBody,
  'patch-issue': handlePatchIssue,
  'link-sub-issue': handleLink,
  block: handleBlock,
  'set-fields': handleSetFields,
  'upsert-comment': handleUpsertComment,
  'post-scope': handlePostScope,
  'wiki-push': handleWikiPush,
});

// ─── Executing one op ─────────────────────────────────────────────────────────

/**
 * Run one op through its handler: re-read the mapping, run, and persist a mapping that changed. A handler
 * that throws becomes `{ok:false, class:'error'}`. Never touches the journal (the flush loop does).
 */
function executeOp(ctx, op) {
  const mappingErr = refreshMapping(ctx);
  if (mappingErr) return failWith('error', mappingErr);
  const handler = Object.hasOwn(HANDLERS, op.kind) ? HANDLERS[op.kind] : null;
  if (!handler) return failWith('error', `no handler for op kind ${JSON.stringify(op.kind)}`);

  const target = op.target || {};
  ctx.current = { seq: op.seq, id: target.id, trdId: mappingLib.toTrdId(target.id) };
  const before = JSON.stringify(ctx.mapping);
  let res;
  try {
    res = handler(ctx, op);
  } catch (e) {
    res = failWith('error', `${op.kind} failed: ${e && e.message ? e.message : e}`);
  }
  if (JSON.stringify(ctx.mapping) !== before) {
    const written = mappingLib.writeMappingV3(ctx.root, ctx.mapping);
    if (!written.ok) {
      res.warnings = [...(res.warnings || []), `could not save .planning/.gh-mapping.json: ${written.error}`];
    }
  }
  if (!Array.isArray(res.warnings)) res.warnings = [];
  return res;
}

module.exports = {
  classifyFailure,
  HANDLERS,
  createContext,
  executeOp,
  deriveSections,
  managedHash,
  baseFromIssue,
};
