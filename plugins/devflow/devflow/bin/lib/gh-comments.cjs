'use strict';

// gh-comments.cjs (TRD 47-08) — the comment protocol on top of the gh-trd codec.
//
// Four kinds of comment live on a DevFlow issue besides its body:
//
//   summary       a TRD's SUMMARY file, on the TRD issue          `<!-- devflow:id=7-01 kind=summary -->`
//   verification  an objective's VERIFICATION file, on the        `<!-- devflow:id=7 kind=verification -->`
//                 OBJECTIVE issue
//   spec-rev      the sticky, append-only log of a TRD's spec     `<!-- devflow:id=7-01 kind=spec-rev -->`
//   scope         a numbered change to a TRD's spec               `<!-- devflow:scope n=K -->`
//
// A file comment is its marker line, then `<!-- devflow:file=<name> -->`, then the verbatim file. A long
// one is split by the flusher into numbered parts (gh-trd.splitParts); `decodeFileComment` reads either
// shape back byte-exactly.
//
// WRITES. This module performs reads only. Every change is a logical op queued in the outbox (gh-outbox);
// the flusher (gh-outbox-flush) is the only thing that talks to GitHub with a write. Reads go through
// gh-client (`ghRead`, `ghPaginate`). A static test pins that none of the client's write paths appear here.
//
// OP CONTRACT (what the flusher receives):
//   upsert-comment  {id, kind}        {mode:'replace', text}   text = fileLine + '\n' + verbatim file;
//                                                              the flusher adds the marker line and splits
//   upsert-comment  {id:'7-01', kind:'spec-rev'}  {mode:'append-spec-rev', entry:{at, event, hash, chars}}
//   post-scope      {id, n}           {text}                   text = the RAW scope text, no marker: the
//                                                              flusher builds the comment with
//                                                              gh-trd.buildScopeComment(n, text)
//   patch-body      {id}              {mode:'replace', body}   a fold: body = the encoded effective spec
//   upsert-comment  {id, kind:'scope-confirm-<n spelled in letters>'}  {mode:'replace', text}
//                                                              text = `<!-- devflow:scope-confirm n=K hash=H -->` (49-06)
//   patch-issue     {id}              {labels_add:[...]}       a TRD starts: the in-progress label (49-06)
//
// STORE MODE ONLY (49-06, GPR-05). With `github.store` on, a scope comment changes a TRD's effective spec only when
// it is accepted (gh-trd.scopeAcceptance): its author is an assignee of the objective issue, or the DevFlow App,
// or a hash-bound `scope n=K scope_hash=H` spec-rev row names its CURRENT text, or an assignee confirmed it. The
// rest are pending: listed, never applied. With the store off none of that runs and every function below behaves
// exactly as before objective 49 (D-01).

const client = require('./gh-client.cjs');
const ghBody = require('./gh-body.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const outbox = require('./gh-outbox.cjs');
const planningMode = require('./planning-mode.cjs');

// ─── Ids ─────────────────────────────────────────────────────────────────────

const DECISION_ID_RE = /-d\d+$/;

/** Canonical TRD id (`07-01` -> `7-01`) or null. A Decision id (`47-01-d1`) is not a TRD id here. */
function trdIdOf(arg) {
  const id = ghMapping.toTrdId(arg);
  return id === null || DECISION_ID_RE.test(id) ? null : id;
}

function invalidTrdId(arg) {
  return { ok: false, error: `invalid TRD id ${JSON.stringify(arg === undefined ? null : arg)} (expected <objective>-<NN>, e.g. 07-01)` };
}

// ─── File comments (SUMMARY, VERIFICATION) ───────────────────────────────────

/**
 * fileCommentText(file, text) — the payload text of a file comment: the `devflow:file` line, a newline,
 * then `text` verbatim. The flusher stamps the marker line and splits an oversized text; it never trims.
 * Throws TypeError for an unsafe file name or a non-string text (gh-trd.fileLine's rule).
 */
function fileCommentText(file, text) {
  if (typeof text !== 'string') {
    throw new TypeError(`file comment text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  return ghTrd.fileLine(file) + '\n' + text;
}

/** Everything after the first line of a comment body (CRLF-safe); '' when it has only a marker line. */
function afterMarkerLine(commentBody) {
  const s = ghTrd.normalise(commentBody);
  const nl = s.indexOf('\n');
  return nl === -1 ? '' : s.slice(nl + 1);
}

/**
 * decodeFileComment(comments, id, kind) — rebuild `{file, text}` from the comments of one issue.
 *
 * `comments` is `[{id, body}]` as GitHub returns them. Every comment whose first line is the marker for
 * `id` with comment kind `kind` is a part; they are joined in PART order (never comment id or time order)
 * with gh-trd.joinParts. Parts the flusher re-marked `<kind>-superseded` do not match and are ignored.
 *
 * -> {ok:true, file, text, comment_ids:[...]}
 *  | {ok:false, notFound:true, error}                 no comment carries the marker
 *  | {ok:false, missing:[i...], error}                a part is missing (never partial text)
 *  | {ok:false, error}                                the parts disagree, or there is no file line
 */
function decodeFileComment(comments, id, kind) {
  let found;
  try {
    found = ghBody.findCommentsByMarker(comments, id, kind);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (found.length === 0) {
    return { ok: false, notFound: true, error: `no ${kind} comment found for ${String(id)}` };
  }

  const joined = ghTrd.joinParts(found.map((f) => afterMarkerLine(f.comment.body)));
  if (!joined.ok) {
    return { ok: false, missing: joined.missing, error: `${kind} comment for ${String(id)}: ${joined.error}` };
  }

  const nl = joined.text.indexOf('\n');
  const file = ghTrd.parseFileLine(nl === -1 ? joined.text : joined.text.slice(0, nl));
  if (file === null) {
    return { ok: false, error: `${kind} comment for ${String(id)} has no valid devflow:file line` };
  }
  return {
    ok: true,
    file,
    text: nl === -1 ? '' : joined.text.slice(nl + 1),
    comment_ids: found.map((f) => f.comment.id),
  };
}

// ─── Enqueue helpers ─────────────────────────────────────────────────────────

/** The outbox's own "disabled" answer (46's contract: disabled is not an error). */
function skippedResult() {
  return {
    ok: true,
    skipped: true,
    reason: 'github.enabled is not true in .planning/config.json',
    enqueued: [],
    coalesced: [],
  };
}

/** The queue-or-skip core shared by the two file-comment enqueuers. */
function enqueueFileComment(root, { id, kind, file, text, now }) {
  let payloadText;
  try {
    payloadText = fileCommentText(file, text);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const r = outbox.enqueue(
    root,
    [{ kind: 'upsert-comment', target: { id, kind }, payload: { mode: 'replace', text: payloadText } }],
    { now }
  );
  return { ...r, id, kind };
}

/**
 * enqueueSummary(root, {trdId, file, text, now}) — queue a SUMMARY as the `summary` comment of its TRD
 * issue. A second call for the same TRD before a flush replaces the pending text (latest wins).
 * Reads nothing from GitHub: the flusher resolves the issue.
 */
function enqueueSummary(root, { trdId, file, text, now } = {}) {
  const id = trdIdOf(trdId);
  if (id === null) return invalidTrdId(trdId);
  return enqueueFileComment(root, { id, kind: 'summary', file, text, now });
}

/**
 * enqueueVerification(root, {objectiveId, file, text, now}) — queue a VERIFICATION as the sticky
 * `verification` comment of the OBJECTIVE issue (the target is the objective id, e.g. `7`).
 */
function enqueueVerification(root, { objectiveId, file, text, now } = {}) {
  const id = ghMapping.toObjectiveId(objectiveId);
  if (id === null) {
    return { ok: false, error: `invalid objective id ${JSON.stringify(objectiveId === undefined ? null : objectiveId)}` };
  }
  return enqueueFileComment(root, { id, kind: 'verification', file, text, now });
}

// ─── TRD state (reads) ───────────────────────────────────────────────────────

/** `2026-10-01T10:00:00Z`: ISO time to the second, a single-line cell for the spec-rev table. */
function isoAt(now) {
  return new Date(now === undefined || now === null ? Date.now() : now).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** What `gh` said went wrong, on one line. */
function failureText(r) {
  const text = String((r && (r.stderr || r.error || r.stdout)) || 'gh failed').trim();
  return text.split('\n')[0];
}

/** Every issue of the repo whose body is the TRD body for `id`: the fallback when the mapping has no entry. */
function scanForTrdIssue(repo, id) {
  const list = client.ghPaginate(`repos/${repo}/issues?state=all`);
  if (!list.ok) return { ok: false, error: `could not list issues to find TRD ${id}: ${failureText(list)}` };
  for (const issue of list.items) {
    if (!issue || issue.pull_request || typeof issue.body !== 'string') continue;
    const d = ghTrd.decodeTrdBody(issue.body);
    if (d.ok && d.id === id) return { ok: true, issue };
  }
  return { ok: true, issue: null };
}

// ─── Scope acceptance (store mode, 49-06) ────────────────────────────────────

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/**
 * scopeConfirmKind(n) — the sticky comment kind of scope `n`'s confirmation: `scope-confirm-two`, `scope-confirm-one-zero`.
 * A comment kind is `[a-z-]+` (gh-body), so a digit cannot appear in it and `n` is spelled with letters.
 */
function scopeConfirmKind(n) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`scope n must be a positive integer, got ${JSON.stringify(n)}`);
  }
  return `scope-confirm-${String(n).split('').map((d) => DIGIT_WORDS[Number(d)]).join('-')}`;
}

/**
 * The text a scope is bound by (its spec-rev row hash and its confirm hash): CRLF-normalised and with trailing
 * whitespace dropped, because GitHub may strip it and a scope must not fall back to pending for that.
 */
const boundText = (text) => ghTrd.normalise(text).trimEnd();

/** The login of the DevFlow GitHub App (`github.app_login`), or null when none is configured. */
function appLoginOf(gate) {
  const v = gate && gate.config && gate.config.app_login;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * The assignees of the objective issue a TRD belongs to: ONE read of that issue.
 * -> {ok:true, assignees:[login]|null}   null: the mapping has no issue for the objective (nothing was read)
 *  | {ok:false, error}                   the read failed: never mistaken for "no assignee"
 */
function readObjectiveAssignees(root, repo, id) {
  const entry = ghMapping.getEntry(ghMapping.readMappingV3(root), id);
  if (!entry || !Number.isInteger(entry.issue_id)) return { ok: true, assignees: null };
  const r = client.ghRead(['api', `repos/${repo}/issues/${entry.issue_id}`]);
  if (!r.ok) {
    return { ok: false, error: `could not read the objective issue #${entry.issue_id} (its assignees decide who may change TRD ${id}): ${failureText(r)}` };
  }
  const issue = parseJson(r.stdout);
  if (!issue || !Number.isInteger(issue.number)) {
    return { ok: false, error: `the objective issue #${entry.issue_id} (for TRD ${id}) came back unreadable` };
  }
  const list = Array.isArray(issue.assignees) ? issue.assignees : [];
  return { ok: true, assignees: list.map((a) => (typeof a === 'string' ? a : a && a.login)).filter((l) => typeof l === 'string' && l !== '') };
}

/**
 * Every scope confirmation on a TRD's issue: a marker opening a person's own comment, and the sticky comments
 * DevFlow posts (`devflow:id=... kind=scope-confirm-<n>`, the confirm marker on the line after its own marker).
 * Authors and timestamps are carried through; the caller's predicate decides whether each counts.
 */
function gatherConfirms(all, id, scopes) {
  const confirms = ghTrd.parseScopeConfirms(all);
  for (const s of scopes) {
    for (const f of ghBody.findCommentsByMarker(all, id, scopeConfirmKind(s.n))) {
      confirms.push(...ghTrd.parseScopeConfirms([{ ...f.comment, body: afterMarkerLine(f.comment.body) }]));
    }
  }
  return confirms;
}

/** The acceptance facts of one TRD (one objective-issue read) and the predicate built from them. */
function readAcceptance(root, { repo, id, gate, comments: all, scopes, rev }) {
  const read = readObjectiveAssignees(root, repo, id);
  if (!read.ok) return read;
  const appLogin = appLoginOf(gate);
  const confirms = gatherConfirms(all, id, scopes);
  const base = ghTrd.scopeAcceptance({
    assignees: read.assignees || [],
    appLogin,
    devflowScopes: ghTrd.devflowScopesFrom(rev),
    confirms,
  });
  // The hashes bind `boundText`, so the predicate sees the scope the same way.
  const accept = (scope) => base({ ...scope, text: boundText(scope.text) });
  return { ok: true, fields: { assignees: read.assignees, appLogin, confirms, accept } };
}

/**
 * readTrdState(root, trdId) — one TRD's issue as GitHub holds it, with ONE issue GET and ONE paginated
 * comments read (the mapping names the issue; a TRD the mapping lacks is found by scanning issue bodies for
 * its `devflow:id` header instead, which costs a list read and writes nothing to the mapping).
 *
 * -> { ok:true, id, repo, number, rest_id, state:'open'|'closed', body, decoded, comments,
 *      scopes:[{n, text, body, comment_id, author, created_at}], scopeErrors:[string],
 *      specRevText, specRevCommentId, frozen, foldedThrough }
 *    plus, with `{acceptance:true}` in STORE mode only (one more read: the objective issue):
 *      assignees:[login]|null, appLogin, confirms, accept:(scope)=>'accepted'|'pending'
 *  | { ok:false, error }                       the TRD has no issue yet, a read failed, a bad id
 *  | { ok:false, skipped:true, reason, error } github is not enabled (no gh call was made)
 *
 * `decoded` is gh-trd.decodeTrdBody(body): `ok:false` for an issue a human wrote. `specRevText` is the whole
 * spec-rev comment, or '' when there is none (a missing log is an empty log, not an error).
 */
function readTrdState(root, trdArg, { acceptance = false } = {}) {
  const id = trdIdOf(trdArg);
  if (id === null) return invalidTrdId(trdArg);
  const gate = client.requireEnabled(root);
  if (gate.skipped) return { ok: false, skipped: true, reason: gate.reason, error: gate.reason };
  const repo = gate.repo;
  const label = String(trdArg).trim();

  let issue;
  const entry = ghMapping.getTrd(ghMapping.readMappingV3(root), id);
  if (entry) {
    const r = client.ghRead(['api', `repos/${repo}/issues/${entry.issue_number}`]);
    if (!r.ok) {
      return { ok: false, error: `could not read issue #${entry.issue_number} for TRD ${label}: ${failureText(r)}` };
    }
    issue = parseJson(r.stdout);
    if (!issue || !Number.isInteger(issue.number)) {
      return { ok: false, error: `issue #${entry.issue_number} for TRD ${label} came back unreadable` };
    }
  } else {
    const found = scanForTrdIssue(repo, id);
    if (!found.ok) return found;
    if (found.issue === null) return { ok: false, error: `TRD ${label} has no issue yet; run gh sync first` };
    issue = found.issue;
  }

  const listed = client.ghPaginate(`repos/${repo}/issues/${issue.number}/comments`);
  if (!listed.ok) {
    return { ok: false, error: `could not read the comments of issue #${issue.number} (TRD ${label}): ${failureText(listed)}` };
  }
  const all = listed.items.filter((c) => c && typeof c.body === 'string');

  const issueBody = typeof issue.body === 'string' ? issue.body : '';
  const scoped = ghTrd.parseScopeComments(all);
  const specRevs = ghBody.findCommentsByMarker(all, id, 'spec-rev');
  const specRevText = specRevs.length > 0 ? ghTrd.normalise(specRevs[0].comment.body) : '';
  const rev = ghTrd.parseSpecRev(specRevText);

  let acceptanceFields = null;
  if (acceptance === true && planningMode.isStoreMode(root)) {
    const gated = readAcceptance(root, { repo, id, gate, comments: all, scopes: scoped.scopes, rev });
    if (!gated.ok) return gated;
    acceptanceFields = gated.fields;
  }

  return {
    ok: true,
    id,
    repo,
    number: issue.number,
    rest_id: Number.isInteger(issue.id) ? issue.id : null,
    state: String(issue.state).toLowerCase() === 'closed' ? 'closed' : 'open',
    body: issueBody,
    decoded: ghTrd.decodeTrdBody(issueBody),
    comments: all,
    scopes: scoped.scopes,
    scopeErrors: scoped.errors,
    specRevText,
    specRevCommentId: specRevs.length > 0 ? specRevs[0].comment.id : null,
    frozen: rev.frozen,
    foldedThrough: rev.folded_through,
    ...acceptanceFields,
  };
}

/** null when the issue's body is this TRD's DevFlow body; otherwise the refusal to return. */
function requireTrdBody(st) {
  if (!st.decoded.ok) {
    return { ok: false, error: `issue #${st.number} (TRD ${st.id}) is ${st.decoded.error}` };
  }
  if (st.decoded.id !== st.id) {
    return { ok: false, error: `issue #${st.number} carries the devflow id ${st.decoded.id}, not ${st.id}; the mapping is stale` };
  }
  return null;
}

/**
 * The effective spec of an already-read state: the body text plus every scope comment in `n` order, skipping
 * what a fold already put in the body. `extra` is `[{id, body}]` scope comments not on GitHub yet (queued, or
 * the one being checked), so a budget decision sees them.
 */
function effectiveFromState(st, extra = [], { gated = false } = {}) {
  const bad = requireTrdBody(st);
  if (bad) return bad;
  // Store mode with the acceptance facts read: only accepted scopes apply. Otherwise every scope does, as before.
  const accept = gated && typeof st.accept === 'function' ? st.accept : undefined;
  const eff = ghTrd.effectiveSpec(st.decoded.text, [...st.comments, ...extra], {
    foldedThrough: st.foldedThrough,
    id: st.decoded.id,
    file: st.decoded.file,
    accept,
  });
  const encoded = ghTrd.encodeTrdBody({ id: st.decoded.id, file: st.decoded.file, text: eff.text });
  return {
    ok: true,
    id: st.id,
    number: st.number,
    state: st.state,
    file: st.decoded.file,
    text: eff.text,
    encoded,
    chars: eff.chars,
    applied: eff.applied,
    overflow: eff.overflow,
    errors: eff.errors,
    foldedThrough: st.foldedThrough,
    ...(accept ? { pending: eff.pending, assignees: st.assignees } : {}),
  };
}

/**
 * readEffectiveSpec(root, trdId) — the TRD as an executor must read it: body plus scope comments in `n`
 * order, honouring `folded_through`.
 *
 * -> { ok:true, id, number, state, file, text, encoded, chars, applied:[n], overflow, errors, foldedThrough }
 *  | the readTrdState failure, or {ok:false, error} when the issue is not a devflow TRD body
 *
 * `text` is the effective TRD text; `encoded` is the issue body it would have (header lines included), the
 * figure the 60,000-char limit applies to (`chars`). `errors` reports scope gaps and duplicates; the spec is
 * still returned.
 *
 * STORE MODE (49-06) adds `pending:[{n, author, comment_id}]` and `assignees` and applies only accepted scopes;
 * a pending scope's text is in neither `text`, `encoded` nor `chars`. With the store off the shape is the one
 * above, with no `pending` key and no objective-issue read.
 */
function readEffectiveSpec(root, trdArg) {
  const st = readTrdState(root, trdArg, { acceptance: true });
  return st.ok ? effectiveFromState(st, [], { gated: true }) : st;
}

// ─── Queued scope changes ────────────────────────────────────────────────────

const specRevAppendOp = (id, entry) => ({
  kind: 'upsert-comment',
  target: { id, kind: 'spec-rev' },
  payload: { mode: 'append-spec-rev', entry },
});

/**
 * Scope changes for `id` that are queued but not on GitHub yet (pending, or blocked and still owed), as
 * `[{n, text}]`. A reader that only looks at GitHub would hand the same `n` out twice and the second
 * `post-scope` would coalesce over the first.
 */
function queuedScopes(root, id) {
  const { journal } = outbox.readJournal(root);
  return journal.ops
    .filter((o) => o.kind === 'post-scope' && o.target.id === id && (o.status === 'pending' || o.status === 'blocked'))
    .map((o) => ({ n: o.target.n, text: o.payload.text }));
}

const sameText = (a, b) => ghTrd.normalise(a).trimEnd() === ghTrd.normalise(b).trimEnd();

/**
 * enqueueScope(root, {trdId, n?, text, now}) — queue a scope change to a TRD's spec.
 *
 * `n` defaults to one more than the highest scope number already on GitHub or queued. An `n` that is already
 * used with the same text is a no-op (a replay); with different text it is refused. The comment is refused
 * with `overflow:true` when it alone is over 60,000 chars, or when the effective spec including it would be:
 * the overflow becomes a new TRD (the TRD-creating verb is objective 48).
 *
 * Queues, in one enqueue: `post-scope {id, n} {text}` and a spec-rev row whose hash is the encoded effective
 * spec after this comment (every scope counts, accepted or not: a size check must hold if a pending scope is
 * later confirmed). The row's event is `scope n=K`; in STORE mode it is `scope n=K scope_hash=H` (49-03
 * scopeEvent, H = the hash of the scope text), which is what lets DevFlow's own scope be accepted whoever posts
 * it, and only while the comment still matches.
 *
 * -> {ok:true, id, n, chars, hash, enqueued, coalesced}   | {ok:true, noop:true, id, n}
 *  | {ok:false, overflow:true, chars, max, error, message} | {ok:false, error}
 *  | {ok:true, skipped:true, reason}                       github is not enabled
 */
function enqueueScope(root, { trdId, n, text, now } = {}) {
  const id = trdIdOf(trdId);
  if (id === null) return invalidTrdId(trdId);
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'scope text must be a non-empty string' };
  }
  if (n !== undefined && n !== null && (!Number.isSafeInteger(n) || n < 1)) {
    return { ok: false, error: `scope n must be a positive integer, got ${JSON.stringify(n)}` };
  }
  if (!outbox.isEnabled(root)) return skippedResult();

  const st = readTrdState(root, trdId);
  if (!st.ok) return st;
  const bad = requireTrdBody(st);
  if (bad) return bad;

  const clean = ghTrd.normalise(text);
  const queued = queuedScopes(root, id);
  const known = new Map(queued.map((q) => [q.n, q.text]));
  for (const s of st.scopes) known.set(s.n, s.text); // what GitHub holds wins over what is queued

  const chosen = n === undefined || n === null
    ? Math.max(0, ...known.keys()) + 1
    : n;
  if (known.has(chosen)) {
    if (sameText(known.get(chosen), clean)) return { ok: true, noop: true, id, n: chosen };
    return { ok: false, error: `scope n=${chosen} already used with different text` };
  }

  const comment = ghTrd.buildScopeComment(chosen, clean);
  if (typeof comment !== 'string') {
    return { ok: false, overflow: true, chars: comment.chars, max: comment.max, error: comment.error, message: comment.error };
  }

  const pendingComments = queued
    .map((q) => ghTrd.buildScopeComment(q.n, q.text))
    .filter((body) => typeof body === 'string')
    .map((body) => ({ id: Infinity, body }));
  const eff = effectiveFromState(st, [...pendingComments, { id: Infinity, body: comment }]);
  if (eff.overflow) {
    const message =
      `scope n=${chosen} would make the effective spec ${eff.chars} chars (limit ${ghTrd.TRD_MAX_CHARS}); ` +
      'the overflow becomes a new TRD';
    return { ok: false, overflow: true, chars: eff.chars, max: ghTrd.TRD_MAX_CHARS, error: message, message };
  }

  const event = planningMode.isStoreMode(root) ? ghTrd.scopeEvent(chosen, ghTrd.scopeHash(boundText(clean))) : `scope n=${chosen}`;
  const entry = { at: isoAt(now), event, hash: ghTrd.contentHash(eff.encoded), chars: eff.encoded.length };
  const r = outbox.enqueue(
    root,
    [{ kind: 'post-scope', target: { id, n: chosen }, payload: { text: clean } }, specRevAppendOp(id, entry)],
    { now }
  );
  if (!r.ok) return r;
  return { ...r, id, n: chosen, chars: eff.chars, hash: entry.hash };
}

// ─── Scope confirmation and TRD start (store mode, 49-06) ────────────────────

/**
 * readViewerLogin() — the login the `gh` token belongs to (`gh api user`), the identity a confirm is posted
 * with. One read.
 * -> {ok:true, login} | {ok:false, error}
 */
function readViewerLogin() {
  const r = client.ghRead(['api', 'user']);
  if (!r.ok) return { ok: false, error: `could not read who is signed in to GitHub: ${failureText(r)}` };
  const user = parseJson(r.stdout);
  if (!user || typeof user.login !== 'string' || user.login === '') {
    return { ok: false, error: 'GitHub did not say who is signed in (gh api user returned no login)' };
  }
  return { ok: true, login: user.login };
}

/**
 * readScopeForConfirm(root, trdId, n) — what `confirm-scope` needs to know about scope `n`, in STORE mode.
 * Reads the TRD's issue and comments and the objective issue (assignees).
 *
 * -> {ok:true, id, n, number, assignees:[login]|null, accepted, text, hash, author}
 *      `accepted` is true when the scope already applies (or a fold put it in the body); `hash` is what a confirm binds
 *  | {ok:false, notFound:true, error}        the TRD has no scope n
 *  | {ok:false, error}                       a read failed, a bad id, or the store is off
 */
function readScopeForConfirm(root, trdArg, n) {
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, error: `scope n must be a positive integer, got ${JSON.stringify(n)}` };
  const st = readTrdState(root, trdArg, { acceptance: true });
  if (!st.ok) return st;
  const bad = requireTrdBody(st);
  if (bad) return bad;
  if (typeof st.accept !== 'function') {
    return { ok: false, error: 'scope confirmation is a store-mode feature (github.store is not true in .planning/config.json)' };
  }
  const scope = st.scopes.find((s) => s.n === n);
  if (!scope) return { ok: false, notFound: true, error: `TRD ${st.id} has no scope n=${n}` };
  return {
    ok: true,
    id: st.id,
    n,
    number: st.number,
    assignees: st.assignees,
    accepted: n <= st.foldedThrough || st.accept(scope) === 'accepted',
    text: scope.text,
    hash: ghTrd.scopeHash(boundText(scope.text)),
    author: scope.author,
  };
}

/**
 * enqueueScopeConfirm(root, {trdId, n, text, note, now}) — queue the confirmation of scope `n` whose CURRENT text is
 * `text`: the sticky `upsert-comment` of kind scopeConfirmKind(n) on the TRD issue, holding
 * `<!-- devflow:scope-confirm n=K hash=H -->` (H = the hash of `text`). It is posted with the caller's own token,
 * so the comment's author is the confirmer, and every read re-checks that author against the assignees. A second
 * confirm of the same n before a flush, or after the scope was edited, replaces the first. Reads nothing.
 *
 * -> {ok:true, id, n, hash, enqueued, coalesced} | {ok:false, error} | {ok:true, skipped:true, reason}
 */
function enqueueScopeConfirm(root, { trdId, n, text, note, now } = {}) {
  const id = trdIdOf(trdId);
  if (id === null) return invalidTrdId(trdId);
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, error: `scope n must be a positive integer, got ${JSON.stringify(n)}` };
  if (typeof text !== 'string') return { ok: false, error: 'the scope text to confirm must be a string' };
  if (!outbox.isEnabled(root)) return skippedResult();

  const hash = ghTrd.scopeHash(boundText(text));
  const comment = ghTrd.buildScopeConfirm({ n, hash, note });
  if (typeof comment !== 'string') return { ok: false, overflow: true, error: comment.error };
  const r = outbox.enqueue(
    root,
    [{ kind: 'upsert-comment', target: { id, kind: scopeConfirmKind(n) }, payload: { mode: 'replace', text: comment } }],
    { now }
  );
  if (!r.ok) return r;
  return { ...r, id, n, hash };
}

const IN_PROGRESS_LABEL = 'devflow:in-progress';

/**
 * enqueueTrdStart(root, {trdId, now}) — queue the in-progress label (`github.labels.in_progress`, default
 * `devflow:in-progress`) on a TRD issue: `patch-issue {id} {labels_add:[label]}`. Reads nothing from GitHub, so it
 * queues offline; the flusher resolves the issue. `summary post` takes the label off again.
 *
 * -> {ok:true, id, label, enqueued, coalesced} | {ok:false, error} | {ok:true, skipped:true, reason}
 */
function enqueueTrdStart(root, { trdId, now } = {}) {
  const id = trdIdOf(trdId);
  if (id === null) return invalidTrdId(trdId);
  if (!outbox.isEnabled(root)) return skippedResult();
  const gate = client.requireEnabled(root);
  if (gate.skipped) return { ok: false, error: gate.reason };
  const configured = gate.labels && gate.labels.in_progress;
  const label = typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : IN_PROGRESS_LABEL;
  const r = outbox.enqueue(root, [{ kind: 'patch-issue', target: { id }, payload: { labels_add: [label] } }], { now });
  if (!r.ok) return r;
  return { ...r, id, label };
}

// ─── Freeze, fold, drift ─────────────────────────────────────────────────────

/**
 * freezeTrd(root, trdId, {now}) — queue a `freeze` spec-rev row carrying the current body hash. From then on
 * the body must not be edited (record a scope comment instead); a later change to it reads as drift.
 * Idempotent: a TRD that already logged a freeze is a no-op, and a freeze queued twice is one row.
 *
 * -> {ok:true, id, hash, chars, enqueued, coalesced} | {ok:true, noop:true, frozen:true, id, drift}
 *  | {ok:false, error} | {ok:true, skipped:true, reason}
 */
function freezeTrd(root, trdArg, { now } = {}) {
  const id = trdIdOf(trdArg);
  if (id === null) return invalidTrdId(trdArg);
  if (!outbox.isEnabled(root)) return skippedResult();

  const st = readTrdState(root, trdArg);
  if (!st.ok) return st;
  const bad = requireTrdBody(st);
  if (bad) return bad;
  if (st.frozen) return { ok: true, noop: true, frozen: true, id, drift: ghTrd.detectDrift(st.body, st.specRevText) };

  const entry = { at: isoAt(now), event: 'freeze', hash: ghTrd.contentHash(st.body), chars: ghTrd.normalise(st.body).length };
  const r = outbox.enqueue(root, [specRevAppendOp(id, entry)], { now });
  if (!r.ok) return r;
  return { ...r, id, hash: entry.hash, chars: entry.chars };
}

/**
 * What a fold may see of `st`'s comments (49-06). Without the acceptance facts (store off) that is every comment and
 * `pending` is null. With them, the scope comments from the first pending unfolded scope on are left out, so the
 * fold stops short of it; `pending` lists the pending unfolded scopes.
 */
function foldGate(st) {
  if (typeof st.accept !== 'function') return { comments: st.comments, pending: null };
  const pending = st.scopes
    .filter((s) => s.n > st.foldedThrough && st.accept(s) !== 'accepted')
    .map((s) => ({ n: s.n, author: s.author, comment_id: s.comment_id }));
  if (pending.length === 0) return { comments: st.comments, pending };
  const cutoff = pending[0].n;
  const beyond = (c) => {
    const [scope] = ghTrd.parseScopeComments([c]).scopes;
    return scope !== undefined && scope.n >= cutoff;
  };
  return { comments: st.comments.filter((c) => !beyond(c)), pending };
}

/**
 * foldTrd(root, trdId, {now, force}) — on a CLOSED TRD, queue a body replace with the effective spec (scope
 * comments stay, they are never deleted) and a `fold folded_through=K from=<hash>` row. Only when the encoded
 * result fits in 60,000 chars; otherwise `{ok:true, fits:false}` and nothing is queued. A scope gap or
 * duplicate refuses the fold. `force` folds an open TRD.
 *
 * -> {ok:true, fits:true, id, folded_through, entry, chars, enqueued, coalesced}
 *  | {ok:true, fits:true, noop:true, id}            no scope comment is waiting to be folded
 *  | {ok:true, fits:false, id, message}
 *  | {ok:false, reason:'open', error} | {ok:false, error} | {ok:true, skipped:true, reason}
 *
 * STORE MODE (49-06): a fold never goes past a pending scope. It folds through the highest n for which every
 * scope up to n is accepted; the pending scopes (and anything after them) stay comments, so a later confirm
 * still applies in order. Every result then carries `pending:[{n, author, comment_id}]` (empty when none).
 * With the store off the fold is as it was: every scope folds and there is no `pending` key.
 */
function foldTrd(root, trdArg, { now, force = false } = {}) {
  const id = trdIdOf(trdArg);
  if (id === null) return invalidTrdId(trdArg);
  if (!outbox.isEnabled(root)) return skippedResult();

  const st = readTrdState(root, trdArg, { acceptance: true });
  if (!st.ok) return st;
  const bad = requireTrdBody(st);
  if (bad) return bad;
  const gate = foldGate(st);
  const withPending = (r) => (gate.pending === null ? r : { ...r, pending: gate.pending });
  if (st.state !== 'closed' && force !== true) {
    return {
      ok: false,
      reason: 'open',
      error: `TRD ${id} is open: a fold runs on a closed TRD (pass force to fold it anyway)`,
    };
  }

  const plan = ghTrd.planFold(st.body, gate.comments, st.specRevText, isoAt(now));
  if (!plan.ok) return { ok: false, error: plan.error };
  if (plan.noop) return withPending({ ok: true, fits: true, noop: true, id });
  if (!plan.fits) {
    return withPending({
      ok: true,
      fits: false,
      id,
      message:
        `the effective spec is over ${ghTrd.TRD_MAX_CHARS.toLocaleString('en-US')} chars, so the body is left as it is; ` +
        'the scope comments stay authoritative (the overflow becomes a new TRD)',
    });
  }

  const r = outbox.enqueue(
    root,
    [
      { kind: 'patch-body', target: { id }, payload: { mode: 'replace', body: plan.newBody } },
      specRevAppendOp(id, plan.entry),
    ],
    { now }
  );
  if (!r.ok) return r;
  const through = /folded_through=(\d+)/.exec(plan.entry.event);
  return withPending({
    ...r,
    id,
    fits: true,
    folded_through: through ? Number(through[1]) : null,
    entry: plan.entry,
    chars: plan.newBody.length,
  });
}

/**
 * detectTrdDrift(root, trdId) — has the live issue body changed since freeze or fold last logged it? Reported,
 * never repaired. Scope rows hash the effective spec, not the body, so they are never the reference.
 *
 * -> {ok:true, id, number, drift:false} | {ok:true, drift:false, unlogged:true}
 *  | {ok:true, drift:true, expected, actual} | the readTrdState failure
 */
function detectTrdDrift(root, trdArg) {
  const st = readTrdState(root, trdArg);
  if (!st.ok) return st;
  const bad = requireTrdBody(st);
  if (bad) return bad;
  return { ok: true, id: st.id, number: st.number, ...ghTrd.detectDrift(st.body, st.specRevText) };
}

module.exports = {
  fileCommentText,
  decodeFileComment,
  enqueueSummary,
  enqueueVerification,
  readTrdState,
  readEffectiveSpec,
  scopeConfirmKind,
  readViewerLogin,
  readScopeForConfirm,
  enqueueScopeConfirm,
  enqueueTrdStart,
  enqueueScope,
  freezeTrd,
  foldTrd,
  detectTrdDrift,
};
