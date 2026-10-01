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
 *   validation | permission | not_found | error -> the op is blocked and the flush halts for a human
 */

const client = require('./gh-client.cjs');

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

module.exports = {
  classifyFailure,
};
