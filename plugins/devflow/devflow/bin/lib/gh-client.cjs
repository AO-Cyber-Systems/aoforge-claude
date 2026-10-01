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
 * - Retry policy (47-07): `withRetryPolicy({maxRetries}, fn)` scopes the retry count for the duration of
 *   `fn`. A flush running inside a hook uses 0 so a secondary limit never sleeps for minutes. The policy
 *   is module state, never a key of `opts`: `opts` still goes to `spawnSync` untouched.
 *
 * Nothing in this module may spawn gh except through the runner below.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_WRITE_INTERVAL_MS = 1000;
const MAX_RETRIES = 4;
const BASE_RETRY_MS = 60000;
const MAX_RETRY_MS = 900000;
const WRITE_BUDGET_PER_RUN = 450;
const MAX_PAGES = 100;
const PER_PAGE = 100;

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
let activePolicy = { maxRetries: MAX_RETRIES };

function _setRunGh(fn) { runGhImpl = (fn != null) ? fn : defaultRunGh; }
function _setSleep(fn) { sleepImpl = (fn != null) ? fn : defaultSleep; }
function _setNow(fn) { nowImpl = (fn != null) ? fn : Date.now; }

/** Restore the runner, clock, sleep, write timer, write counter and retry policy. Tests call this in afterEach. */
function _resetClient() {
  runGhImpl = defaultRunGh;
  sleepImpl = defaultSleep;
  nowImpl = Date.now;
  lastWriteAt = -Infinity;
  writeCount = 0;
  activePolicy = { maxRetries: MAX_RETRIES };
}

// ─── Retry policy ────────────────────────────────────────────────────────────

/**
 * Run `fn` with a different secondary-limit retry count, then restore the previous policy (also when `fn`
 * throws). Scopes nest: the innermost wins while it runs. Every helper `fn` calls (for example
 * gh-issue.ensureMilestone) inherits it, which is why it is module state and not an argument.
 * `policy.maxRetries` must be a non-negative integer; `{maxRetries: 0}` never sleeps on a limit.
 * @template T
 * @param {{maxRetries:number}} policy
 * @param {() => T} fn
 * @returns {T} whatever `fn` returns
 */
function withRetryPolicy(policy, fn) {
  if (!policy || typeof policy !== 'object' || !Number.isInteger(policy.maxRetries) || policy.maxRetries < 0) {
    throw new TypeError('withRetryPolicy: policy.maxRetries must be a non-negative integer');
  }
  if (typeof fn !== 'function') throw new TypeError('withRetryPolicy: fn must be a function');
  const previous = activePolicy;
  activePolicy = { maxRetries: policy.maxRetries };
  try {
    return fn();
  } finally {
    activePolicy = previous;
  }
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
    if (r.ok || !isSecondaryLimit(r) || attempt >= activePolicy.maxRetries) {
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

// ─── Pagination ──────────────────────────────────────────────────────────────

function paginateFailure(r) {
  return {
    ok: false,
    error: r.error || r.stderr || r.stdout || 'gh api failed',
    stderr: r.stderr || '',
    status: r.status,
  };
}

function unparseablePage(stdout) {
  return { ok: false, error: 'unparseable page', stdout };
}

/** Older gh: no --slurp. Walk `?per_page=100&page=N` until a short (or empty) page. */
function paginateByPage(apiPath, opts) {
  const sep = apiPath.includes('?') ? '&' : '?';
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = ghRead(['api', `${apiPath}${sep}per_page=${PER_PAGE}&page=${page}`], opts);
    if (!r.ok) return paginateFailure(r);
    let rows;
    try {
      rows = JSON.parse(r.stdout);
    } catch {
      return unparseablePage(r.stdout);
    }
    if (!Array.isArray(rows)) return unparseablePage(r.stdout);
    for (const row of rows) items.push(row);
    if (rows.length < PER_PAGE) break;
  }
  return { ok: true, items };
}

/**
 * Every item of a REST list endpoint as one flat array.
 * `gh api --paginate` alone prints concatenated arrays (`[..][..]`), which JSON.parse
 * rejects; `--slurp` wraps every page in one outer array so the result parses.
 * @returns {{ok:true, items:any[]} | {ok:false, error:string, stderr?:string, stdout?:string}}
 */
function ghPaginate(apiPath, opts) {
  const r = ghRead(['api', '--paginate', '--slurp', apiPath], opts);
  if (!r.ok) {
    if (/unknown flag: --slurp/i.test(`${r.stderr}\n${r.stdout}`)) return paginateByPage(apiPath, opts);
    return paginateFailure(r);
  }
  let pages;
  try {
    pages = JSON.parse(r.stdout);
  } catch {
    return unparseablePage(r.stdout);
  }
  if (!Array.isArray(pages)) return unparseablePage(r.stdout);
  const items = [];
  for (const page of pages) {
    if (Array.isArray(page)) {
      for (const row of page) items.push(row);
    } else {
      items.push(page);
    }
  }
  return { ok: true, items };
}

// ─── Enabled gate and repo resolution ────────────────────────────────────────

const REPO_SLUG = /^[^/\s]+\/[^/\s]+$/;

/** `.planning/config.json` as an object, or null when missing, invalid or not an object. */
function readConfig(cwd) {
  const cfgPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    return cfg && typeof cfg === 'object' ? cfg : null;
  } catch {
    return null;
  }
}

/** `config.github.repo` if it is an `owner/name` slug, else PROJECT.md `github_repo`, else null. */
function resolveRepo(cwd) {
  const cfg = readConfig(cwd);
  const fromConfig = cfg && cfg.github && cfg.github.repo;
  if (typeof fromConfig === 'string' && REPO_SLUG.test(fromConfig)) return fromConfig;

  const projectPath = path.join(cwd, '.planning', 'PROJECT.md');
  if (!fs.existsSync(projectPath)) return null;
  let fm;
  try {
    fm = extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  } catch {
    return null;
  }
  const fromProject = fm.github_repo;
  return typeof fromProject === 'string' && REPO_SLUG.test(fromProject) ? fromProject : null;
}

/**
 * The one enabled gate. Makes zero gh calls. Commands that write to GitHub call this first
 * and return the `skipped` result unchanged when it is present.
 * @returns {{enabled:true, repo:string, labels:object, milestone_prefix:string, config:object}
 *          | {skipped:true, ok:false, enabled:false, reason:string}}
 */
function requireEnabled(cwd) {
  const cfg = readConfig(cwd);
  const gh = cfg && cfg.github && typeof cfg.github === 'object' ? cfg.github : null;
  if (!gh || gh.enabled !== true) {
    return {
      skipped: true,
      ok: false,
      enabled: false,
      reason: 'github.enabled is not true in .planning/config.json',
    };
  }
  const repo = resolveRepo(cwd);
  if (!repo) {
    return {
      skipped: true,
      ok: false,
      enabled: false,
      reason: 'github.repo is not set (need an owner/name in .planning/config.json github.repo or PROJECT.md github_repo)',
    };
  }
  return {
    enabled: true,
    repo,
    labels: gh.labels || {},
    milestone_prefix: gh.milestone_prefix || 'v',
    config: gh,
  };
}

// ─── Result emission ─────────────────────────────────────────────────────────

/**
 * Print a command result and exit. `skipped` is not a failure (exit 0); any other `ok:false`
 * is (exit 1). The JSON is printed either way so callers can read the reason.
 * Callers must return immediately after this: `output` calls process.exit, but tests stub it.
 */
function emitResult(result, raw, rawValue) {
  const code = (result && result.ok === false && !result.skipped) ? 1 : 0;
  output(result, raw, rawValue, code);
}

module.exports = {
  // constants
  MIN_WRITE_INTERVAL_MS,
  MAX_RETRIES,
  BASE_RETRY_MS,
  MAX_RETRY_MS,
  WRITE_BUDGET_PER_RUN,
  MAX_PAGES,
  // seam (forwarding wrapper: later injections are visible to earlier importers)
  _runGh: (...a) => runGhImpl(...a),
  _setRunGh,
  _setSleep,
  _setNow,
  _resetClient,
  // the injected clock, for callers that must share the client's seam (47-07 flusher)
  now: () => nowImpl(),
  sleep: (ms) => sleepImpl(ms),
  // retry policy and write counter
  withRetryPolicy,
  writeCount: () => writeCount,
  // classification and delay
  isWriteArgs,
  isSecondaryLimit,
  parseRetryAfter,
  retryDelayMs,
  // calls
  ghRead,
  ghWrite,
  ghRun,
  ghPaginate,
  // enabled gate and result emission
  readConfig,
  resolveRepo,
  requireEnabled,
  emitResult,
};
