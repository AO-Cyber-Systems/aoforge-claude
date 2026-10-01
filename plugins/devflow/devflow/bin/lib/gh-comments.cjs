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

const client = require('./gh-client.cjs');
const ghBody = require('./gh-body.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const outbox = require('./gh-outbox.cjs');

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

module.exports = {
  fileCommentText,
  decodeFileComment,
  enqueueSummary,
  enqueueVerification,
};
