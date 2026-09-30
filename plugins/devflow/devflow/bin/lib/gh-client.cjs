'use strict';

/**
 * gh-client: the ONLY place DevFlow spawns `gh` (TRD 46-01, GSF-08).
 *
 * - One seam: every invocation goes through `_runGh`, replaceable with `_setRunGh(fn)` and
 *   restored with `_setRunGh(null)`. The exported `_runGh` is a forwarding wrapper so a
 *   consumer that captured it before an injection still sees the injection.
 * - Pacing: `ghWrite` keeps consecutive writes at least MIN_WRITE_INTERVAL_MS apart. df-tools
 *   is synchronous and single-process, so "no overlapping writes" holds as long as every
 *   mutation goes through here and nothing spawns gh asynchronously.
 * - Retry: secondary-rate-limit failures (and only those; a bare 403 is a permission error)
 *   are retried honouring `retry-after`, else the rate-limit reset, else >= 60 s with
 *   exponential growth, up to MAX_RETRIES.
 * - Budget: a per-process write counter stops a runaway loop well under GitHub's 500/h.
 *
 * Nothing in this module may spawn gh except through the runner below.
 */

const { spawnSync } = require('child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_WRITE_INTERVAL_MS = 1000;
const MAX_RETRIES = 4;
const BASE_RETRY_MS = 60000;
const MAX_RETRY_MS = 900000;
const WRITE_BUDGET_PER_RUN = 450;

// ─── Runner seam ─────────────────────────────────────────────────────────────

/**
 * The default runner: the single spawn site. Never throws; a missing gh becomes
 * `{ok:false, status:null, stderr:'gh: command not found'}`.
 */
function defaultRunGh(args, opts = {}) {
  let r;
  try {
    r = spawnSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
      ...opts,
    });
  } catch (err) {
    return { ok: false, status: null, stdout: '', stderr: String((err && err.message) || err) };
  }
  if (r.error) {
    const missing = r.error.code === 'ENOENT';
    return {
      ok: false,
      status: null,
      stdout: (r.stdout || '').trim(),
      stderr: missing ? 'gh: command not found' : ((r.stderr || '').trim() || String(r.error.message || r.error)),
    };
  }
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function defaultSleep(ms) {
  if (!(ms > 0)) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let runGhImpl = defaultRunGh;
let sleepImpl = defaultSleep;
let nowImpl = Date.now;
let lastWriteAt = -Infinity;
let writeCount = 0;

function _setRunGh(fn) { runGhImpl = (fn != null) ? fn : defaultRunGh; }
function _setSleep(fn) { sleepImpl = (fn != null) ? fn : defaultSleep; }
function _setNow(fn) { nowImpl = (fn != null) ? fn : Date.now; }

/** Restore the runner, clock, sleep, write timer and write counter. Tests call this in afterEach. */
function _resetClient() {
  runGhImpl = defaultRunGh;
  sleepImpl = defaultSleep;
  nowImpl = Date.now;
  lastWriteAt = -Infinity;
  writeCount = 0;
}

// ─── Write classification ────────────────────────────────────────────────────

// `gh <noun> <sub>`: anything other than a known read subcommand mutates.
const NOUN_COMMANDS = new Set(['issue', 'label', 'release', 'pr']);
const READ_SUBCOMMANDS = new Set(['view', 'list', 'status', 'download', 'diff', 'checks']);

// `gh api` flags that consume the following token as their value.
const API_VALUE_FLAGS = new Set([
  '-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '-q', '--jq',
  '-t', '--template', '--hostname', '-p', '--preview', '--cache', '--input',
]);
const API_FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field']);
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * True when the gh invocation mutates GitHub state (and so is paced and budgeted).
 * @param {string[]} args
 */
function isWriteArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return false;
  const a0 = args[0];

  if (NOUN_COMMANDS.has(a0)) {
    const a1 = args[1];
    if (a1 === undefined || String(a1).startsWith('-')) return false;
    return !READ_SUBCOMMANDS.has(a1);
  }

  if (a0 !== 'api') return false;

  let method = null;
  let hasInput = false;
  let endpoint = null;
  const fields = [];
  for (let i = 1; i < args.length; i++) {
    const tok = String(args[i]);
    if (tok === '-X' || tok === '--method') {
      method = String(args[i + 1] || '').toUpperCase();
      i++;
    } else if (tok.startsWith('--method=')) {
      method = tok.slice('--method='.length).toUpperCase();
    } else if (API_FIELD_FLAGS.has(tok)) {
      fields.push(String(args[i + 1] || ''));
      i++;
    } else if (tok.startsWith('--field=') || tok.startsWith('--raw-field=')) {
      fields.push(tok.slice(tok.indexOf('=') + 1));
    } else if (tok === '--input') {
      hasInput = true;
      i++;
    } else if (API_VALUE_FLAGS.has(tok)) {
      i++;
    } else if (!tok.startsWith('-') && endpoint === null) {
      endpoint = tok;
    }
  }

  // GraphQL is always POSTed and always carries -f/-F, so judge it by the operation instead.
  if (endpoint === 'graphql') {
    const q = fields.find((f) => f.startsWith('query='));
    return q !== undefined && /^\s*mutation\b/i.test(q.slice('query='.length));
  }

  if (method) return WRITE_METHODS.has(method);
  // With no explicit method, gh api switches to POST as soon as it is given a body.
  return fields.length > 0 || hasInput;
}

// ─── Rate-limit classification and delay ─────────────────────────────────────

function responseText(r) {
  return `${(r && r.stderr) || ''}\n${(r && r.stdout) || ''}`;
}

/**
 * True for a failed call that GitHub's secondary / abuse limits rejected. A bare 403
 * ("Resource not accessible by integration") is a permission error and is NOT retryable.
 */
function isSecondaryLimit(r) {
  if (!r || r.ok) return false;
  const t = responseText(r);
  return /secondary rate limit|abuse detection|temporarily blocked from content creation/i.test(t)
    || (/HTTP (403|429)/.test(t) && /rate limit/i.test(t));
}

/** `retry-after: N` header line (seconds) from stdout/stderr, as milliseconds; null when absent. */
function parseRetryAfter(r) {
  const m = /^\s*retry-after:\s*(\d+)\b/im.exec(responseText(r));
  return m ? parseInt(m[1], 10) * 1000 : null;
}

/** Milliseconds to wait before retry number `attempt` (0-based). Always capped at MAX_RETRY_MS. */
function retryDelayMs(r, attempt) {
  const retryAfter = parseRetryAfter(r);
  if (retryAfter !== null) return Math.min(retryAfter, MAX_RETRY_MS);

  const text = responseText(r);
  const remaining = /^\s*x-ratelimit-remaining:\s*(\d+)\b/im.exec(text);
  const reset = /^\s*x-ratelimit-reset:\s*(\d+)\b/im.exec(text);
  if (remaining && parseInt(remaining[1], 10) === 0 && reset) {
    const untilReset = parseInt(reset[1], 10) * 1000 - nowImpl();
    return Math.min(Math.max(untilReset, 1000), MAX_RETRY_MS);
  }

  return Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
}

// ─── ghWrite / ghRead / ghRun ────────────────────────────────────────────────

function budgetExhausted(attempts) {
  return {
    ok: false,
    status: null,
    stdout: '',
    stderr: '',
    error: `write budget exhausted (${WRITE_BUDGET_PER_RUN} gh writes per run); refusing further writes`,
    attempts,
  };
}

/**
 * The shared attempt loop. `paced` adds the write budget and the >= MIN_WRITE_INTERVAL_MS
 * spacing; every retry attempt is itself paced because it re-enters the loop head.
 */
function attemptLoop(args, opts, paced) {
  for (let attempt = 0; ; attempt++) {
    if (paced) {
      if (writeCount >= WRITE_BUDGET_PER_RUN) return budgetExhausted(attempt);
      const wait = lastWriteAt + MIN_WRITE_INTERVAL_MS - nowImpl();
      if (wait > 0) sleepImpl(wait);
    }
    const r = runGhImpl(args, opts);
    if (paced) {
      writeCount++;
      lastWriteAt = nowImpl();
    }
    if (r.ok || !isSecondaryLimit(r) || attempt >= MAX_RETRIES) {
      return { ...r, attempts: attempt + 1 };
    }
    sleepImpl(retryDelayMs(r, attempt));
  }
}

/** Any mutating gh invocation: budgeted, paced, retried on secondary limits. */
function ghWrite(args, opts) {
  return attemptLoop(args, opts, true);
}

/** A read-only gh invocation: retried on the same classifier, never paced or budgeted. */
function ghRead(args, opts) {
  return attemptLoop(args, opts, false);
}

/** Convenience for callers that do not know whether their args mutate. */
function ghRun(args, opts) {
  return isWriteArgs(args) ? ghWrite(args, opts) : ghRead(args, opts);
}

module.exports = {
  // constants
  MIN_WRITE_INTERVAL_MS,
  MAX_RETRIES,
  BASE_RETRY_MS,
  MAX_RETRY_MS,
  WRITE_BUDGET_PER_RUN,
  // seam (forwarding wrapper: later injections are visible to earlier importers)
  _runGh: (...a) => runGhImpl(...a),
  _setRunGh,
  _setSleep,
  _setNow,
  _resetClient,
  // classification and delay
  isWriteArgs,
  isSecondaryLimit,
  parseRetryAfter,
  retryDelayMs,
  // calls
  ghRead,
  ghWrite,
  ghRun,
};
