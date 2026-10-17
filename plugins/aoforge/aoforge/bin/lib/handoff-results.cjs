'use strict';

/**
 * Handoff result delivery: the one library every hook that hands a completed watcher command back to Claude uses.
 *
 * When the aoforge-watch daemon finishes a queued command it writes `.aoforge-handoff/done/<id>.json`. Several hook
 * events deliver such a record (UserPromptSubmit through route-results.js, PostToolUse and Stop through
 * inject-handoff-results.js), and Claude Code runs hooks in parallel, so delivery has to be safe against two
 * processes reading the same record at the same moment. Two rules do that:
 *
 *   - Exactly once. A process takes a record only by creating `done/<id>.claim` with O_EXCL (`wx`). Exactly one
 *     creator wins across processes; every other process renders nothing for that record. A read-then-write
 *     `consumed: true` flag cannot do this, so the flag is only the durable "delivered" mark that follows the claim.
 *     A record claimed but never marked (a crash in between) stays claimed and is not delivered again, which is the
 *     safe side for a result that may hold command output.
 *   - Addressed. A record carries the `session_id` and `agent_id` of the hook payload that queued it. A record with
 *     no session_id belongs to the main loop of any session; one with a session_id belongs to that session and
 *     that agent (absent agent_id = the main loop). `mode: 'all'` ignores the address, for the catch-all.
 *
 * Every export fails open: bad input or a filesystem error returns the empty answer, never throws. Hooks must not
 * block a prompt or a tool call.
 *
 * Rendering is shared with route-results.js (moved here, not copied) and stays byte-identical for the records it
 * rendered before. New: a record written by `aof-tools handoff complete` carries `output` instead of
 * `stdout`/`stderr`, and the whole block is capped at MAX_RENDER_CHARS.
 */

const fs = require('fs');
const path = require('path');

const HANDOFF_DIR = '.aoforge-handoff';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_OUTPUT_CHARS = 4000; // per stdout / stderr / output field
const MAX_RENDER_CHARS = 9000; // the whole block, exclusive
const ID_RE = /^[A-Za-z0-9_-]+$/; // a record id becomes a file name; the record file is user-writable input
const HANDOFF_GET = 'node ~/.claude/aoforge/bin/aof-tools.cjs handoff get';
const HANDOFF_LIST = 'node ~/.claude/aoforge/bin/aof-tools.cjs handoff list';
const OVERFLOW_IDS_LISTED = 40;

// ---------------------------------------------------------------------------
// finding and selecting
// ---------------------------------------------------------------------------

/** Nearest ancestor (exclusive of the filesystem root) holding `.aoforge-handoff/` -> its path, else null. */
function findHandoffDir(start) {
  try {
    if (typeof start !== 'string' || !start) return null;
    let dir = start;
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, HANDOFF_DIR))) return path.join(dir, HANDOFF_DIR);
      dir = path.dirname(dir);
    }
    return null;
  } catch {
    return null;
  }
}

/** How long a finished record stays deliverable. `AOFORGE_HANDOFF_RESULT_TTL_MS`, else one hour. */
function ttlMs(env) {
  const source = env && typeof env === 'object' ? env : process.env;
  const n = parseInt(source.AOFORGE_HANDOFF_RESULT_TTL_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function readRecord(filePath) {
  try {
    const rec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return rec && typeof rec === 'object' && !Array.isArray(rec) ? rec : null;
  } catch {
    return null;
  }
}

/** True when the record finished more than `ttl` ms before `now`. A record with no usable completed_at is kept. */
function isStale(record, now, ttl) {
  try {
    if (!record || !record.completed_at) return false;
    const t = new Date(record.completed_at).getTime();
    if (Number.isNaN(t)) return false;
    return (now - t) > ttl;
  } catch {
    return false;
  }
}

/**
 * Fresh, unconsumed, unclaimed records in `doneDir`, oldest first, each with an in-memory `_path`.
 * Skips: `consumed: true`, older than the TTL, malformed JSON, a `<id>.claim` beside it, a file name that is not a
 * safe id, and anything that is not `.json`.
 *
 * @param {string} doneDir
 * @param {{ now?: number, ttl?: number, env?: object }} [opts]
 */
function selectUnconsumed(doneDir, opts) {
  try {
    const o = opts || {};
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const ttl = Number.isFinite(o.ttl) && o.ttl > 0 ? o.ttl : ttlMs(o.env);
    const records = [];
    for (const filePath of listJsonFiles(doneDir)) {
      const id = path.basename(filePath, '.json');
      if (!ID_RE.test(id)) continue;
      if (fs.existsSync(path.join(doneDir, `${id}.claim`))) continue;
      const rec = readRecord(filePath);
      if (!rec) continue;
      if (rec.consumed === true) continue;
      if (isStale(rec, now, ttl)) continue;
      rec._path = filePath;
      records.push(rec);
    }
    records.sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || ''));
    return records;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// addressing and claiming
// ---------------------------------------------------------------------------

function agentOf(x) {
  return x && typeof x.agent_id === 'string' && x.agent_id ? x.agent_id : null;
}

/**
 * Is `record` addressed to the hook `payload`? A record with no session_id is addressed to the main loop of any
 * session (a payload with no agent_id); one with a session_id is addressed to that session and to that agent
 * (absent or empty agent_id = the main loop, on both sides).
 */
function isAddressedTo(record, payload) {
  try {
    if (!record || typeof record !== 'object') return false;
    const p = payload && typeof payload === 'object' ? payload : {};
    if (!record.session_id) return agentOf(p) === null;
    if (record.session_id !== p.session_id) return false;
    return agentOf(record) === agentOf(p);
  } catch {
    return false;
  }
}

/**
 * Take a record: create `<doneDir>/<id>.claim` with O_EXCL. True for the one process that created it; false for
 * every other process and for any error (a missing or read-only directory, a bad id). The open is the only
 * arbiter; there is deliberately no existsSync pre-check.
 *
 * @param {string} doneDir
 * @param {string} id
 * @param {{ by?: string }} [opts]
 */
function claimRecord(doneDir, id, opts) {
  try {
    if (typeof doneDir !== 'string' || !doneDir) return false;
    if (typeof id !== 'string' || !ID_RE.test(id)) return false;
    const claimPath = path.join(doneDir, `${id}.claim`);
    const fd = fs.openSync(claimPath, 'wx'); // O_CREAT | O_EXCL: one winner across processes
    try {
      fs.writeSync(fd, JSON.stringify({
        claimed_at: new Date().toISOString(),
        pid: process.pid,
        by: (opts && opts.by) || null,
      }));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch {
    return false; // EEXIST: someone else has it. Anything else: fail open, deliver nothing from here.
  }
}

/** Mark records delivered: `consumed`, `consumed_at`, `consumed_by`, through tmp + rename. `_path` is never written. */
function markConsumed(records, opts) {
  if (!Array.isArray(records)) return;
  const by = opts && opts.by ? opts.by : null;
  const now = new Date().toISOString();
  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || typeof rec._path !== 'string') continue;
    try {
      rec.consumed = true;
      rec.consumed_at = now;
      if (by) rec.consumed_by = by;
      const out = { ...rec };
      delete out._path;
      const tmp = `${rec._path}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
      fs.renameSync(tmp, rec._path);
    } catch {
      // non-fatal: the claim already stops a second delivery
    }
  }
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function truncate(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, ${s.length - max} more chars)`;
}

/**
 * One record as markdown. With the default `maxChars` (MAX_OUTPUT_CHARS) the text is what route-results.js has
 * always rendered. A smaller `maxChars` is the whole-block budget at work: a record that it cuts ends with a pointer
 * to `handoff get <id>`.
 *
 * @param {object} rec
 * @param {{ maxChars?: number }} [opts]
 */
function renderRecord(rec, opts) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const requested = opts && Number.isFinite(opts.maxChars) ? Math.max(0, Math.floor(opts.maxChars)) : MAX_OUTPUT_CHARS;
  const max = Math.min(requested, MAX_OUTPUT_CHARS);
  const limited = max < MAX_OUTPUT_CHARS;
  let cut = false;
  const clip = (s) => {
    if (typeof s === 'string' && s.length > max) cut = true;
    return truncate(s, max);
  };
  const finish = (lines) => {
    if (limited && cut) lines.push('', `Output cut short. Full record: ${HANDOFF_GET} ${r.id}`);
    return lines.join('\n');
  };

  const lines = [];
  let header;
  if (r.status === 'rejected') {
    header = `### ${r.id} — \`${r.cmd}\` — ✗ rejected by daemon`;
  } else if (r.status === 'timeout') {
    header = `### ${r.id} — \`${r.cmd}\` — ✗ timeout`;
  } else if (r.status === 'error') {
    header = `### ${r.id} — \`${r.cmd}\` — ✗ daemon error`;
  } else if (r.exit_code === 0) {
    header = `### ${r.id} — \`${r.cmd}\` — ✓ exit 0`;
  } else {
    header = `### ${r.id} — \`${r.cmd}\` — ✗ exit ${r.exit_code != null ? r.exit_code : '?'}`;
  }
  lines.push(header);
  if (r.completed_at) lines.push(`*completed ${r.completed_at}*`);

  if (r.status === 'rejected') {
    lines.push('');
    lines.push('**The daemon refused this command.** Do NOT retry it as-is — its allowlist excluded it. ' +
      'If the user genuinely needs this run, ask them to run it manually or extend the allowlist.');
    if (r.stderr) {
      lines.push('');
      lines.push('```');
      lines.push(clip(r.stderr));
      lines.push('```');
    }
    return finish(lines);
  }

  if (r.status === 'timeout') {
    lines.push('');
    lines.push('**Command exceeded the daemon timeout.** Consider whether to retry, increase ' +
      '`timeout_ms` on the next handoff, or surface the slow operation to the user.');
    return finish(lines);
  }

  // Normal output rendering for done/failed/error. A record written by `handoff complete` has `output`, no stdout.
  const stdoutSource = (!r.stdout && !r.stderr && typeof r.output === 'string') ? r.output : (r.stdout || '');
  const stdout = clip(stdoutSource);
  const stderr = clip(r.stderr || '');
  if (stdout) {
    lines.push('');
    lines.push('stdout:');
    lines.push('```');
    lines.push(stdout);
    lines.push('```');
  }
  if (stderr) {
    lines.push('');
    lines.push('stderr:');
    lines.push('```');
    lines.push(stderr);
    lines.push('```');
  }
  if (!stdout && !stderr) {
    lines.push('');
    lines.push('*(no output captured)*');
  }
  return finish(lines);
}

// A record is a text plus two joining characters inside the block (see renderResults).
const RECORD_OVERHEAD = 2;

/** The largest per-field cap whose rendering of `rec` fits `maxLen`; the shortest rendering when none does. */
function fitRecord(rec, maxLen) {
  let lo = 0;
  let hi = MAX_OUTPUT_CHARS;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (renderRecord(rec, { maxChars: mid }).length <= maxLen) lo = mid; else hi = mid - 1;
  }
  return renderRecord(rec, { maxChars: lo });
}

/**
 * The block Claude sees: a heading, then each record. Under MAX_RENDER_CHARS the block is exactly what route-results
 * has always emitted. Over it, records that fit their share stay whole and the others are cut to the share they
 * leave, each cut record ending with a `handoff get <id>` pointer. If even the shortest renderings do not fit, the
 * records that do fit are shown and the rest are named in one closing note, never dropped silently.
 *
 * @param {object[]} records
 * @param {{ maxChars?: number }} [opts]
 */
function renderResults(records, opts) {
  try {
    const list = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
    const budget = opts && Number.isFinite(opts.maxChars) ? opts.maxChars : MAX_RENDER_CHARS;
    const head = [
      '## Deferred command results',
      '',
      `${list.length} command${list.length === 1 ? '' : 's'} the watcher ran out-of-band ` +
        'since your last turn. Use these to continue any work that was deferred.',
      '',
    ];
    const assemble = (texts) => {
      const lines = head.slice();
      for (const t of texts) lines.push(t, '');
      return lines.join('\n');
    };

    const full = list.map((r) => renderRecord(r));
    const whole = assemble(full);
    if (whole.length < budget) return whole;

    const room = budget - 1 - assemble([]).length; // characters left for records, so the block stays under budget
    const minTexts = list.map((r) => renderRecord(r, { maxChars: 0 }));
    const minCost = minTexts.map((t) => t.length + RECORD_OVERHEAD);
    const minTotal = minCost.reduce((a, b) => a + b, 0);

    if (minTotal <= room) {
      // Water-filling: the smallest records keep their full text, the rest split what is left.
      const order = list.map((_, i) => i).sort((a, b) => full[a].length - full[b].length);
      const texts = new Array(list.length);
      let remaining = room;
      let reserve = minTotal;
      let left = list.length;
      for (const i of order) {
        reserve -= minCost[i];
        const share = Math.max(minCost[i], Math.min(Math.floor(remaining / left), remaining - reserve));
        texts[i] = full[i].length + RECORD_OVERHEAD <= share ? full[i] : fitRecord(list[i], share - RECORD_OVERHEAD);
        remaining -= texts[i].length + RECORD_OVERHEAD;
        left--;
      }
      return assemble(texts);
    }

    // Overflow: show the oldest records at their shortest, name the rest.
    const note = (from) => {
      const ids = list.slice(from).map((r) => r.id);
      const shown = ids.slice(0, OVERFLOW_IDS_LISTED).join(', ');
      const more = ids.length > OVERFLOW_IDS_LISTED
        ? `, and ${ids.length - OVERFLOW_IDS_LISTED} more (list them with ${HANDOFF_LIST})`
        : '';
      return `${ids.length} more results not shown. Read each with ${HANDOFF_GET} <id>: ${shown}${more}`;
    };
    for (let k = list.length - 1; k >= 0; k--) {
      const used = minCost.slice(0, k).reduce((a, b) => a + b, 0);
      const closing = note(k);
      if (used + closing.length + RECORD_OVERHEAD <= room || k === 0) {
        return assemble([...minTexts.slice(0, k), closing]);
      }
    }
    return whole;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// taking results
// ---------------------------------------------------------------------------

/**
 * Deliver the fresh results for a hook: select, address, claim, render, mark. Returns `{ records, text }`, or null
 * when there is nothing to deliver (no handoff directory, nothing fresh, nothing addressed, every claim lost).
 *
 * Render happens before marking, so a render bug cannot leave a record marked but never shown.
 *
 * @param {{ cwd: string, payload?: object, mode?: 'addressed'|'all', by?: string, now?: number, env?: object }} opts
 *   `mode: 'all'` skips the address check (route-results, the catch-all); anything else takes only the records
 *   addressed to `payload`.
 */
function takeResults(opts) {
  try {
    const o = opts || {};
    const handoffDir = findHandoffDir(o.cwd);
    if (!handoffDir) return null;
    const doneDir = path.join(handoffDir, 'done');
    let records = selectUnconsumed(doneDir, { now: o.now, ttl: ttlMs(o.env) });
    if (o.mode !== 'all') records = records.filter((r) => isAddressedTo(r, o.payload));

    const won = [];
    for (const rec of records) {
      if (claimRecord(doneDir, path.basename(rec._path, '.json'), { by: o.by })) won.push(rec);
    }
    if (won.length === 0) return null;

    const text = renderResults(won);
    markConsumed(won, { by: o.by });
    return { records: won, text };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// pending lookup and watcher check (for a Stop hook that waits on a running command)
// ---------------------------------------------------------------------------

/**
 * Fresh pending records addressed to `payload`, oldest first. "Fresh" is a `created_at` within `maxAgeMs`
 * (default: the delivery TTL); a record with no usable created_at is kept.
 *
 * @param {string} handoffDir  the `.aoforge-handoff` directory
 * @param {object} payload
 * @param {{ now?: number, maxAgeMs?: number }} [opts]
 */
function pendingAddressedTo(handoffDir, payload, opts) {
  try {
    if (typeof handoffDir !== 'string' || !handoffDir) return [];
    const o = opts || {};
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const maxAge = Number.isFinite(o.maxAgeMs) && o.maxAgeMs > 0 ? o.maxAgeMs : ttlMs();
    const out = [];
    for (const filePath of listJsonFiles(path.join(handoffDir, 'pending'))) {
      if (!ID_RE.test(path.basename(filePath, '.json'))) continue;
      const rec = readRecord(filePath);
      if (!rec) continue;
      const created = rec.created_at ? new Date(rec.created_at).getTime() : NaN;
      if (!Number.isNaN(created) && (now - created) > maxAge) continue;
      if (!isAddressedTo(rec, payload)) continue;
      rec._path = filePath;
      out.push(rec);
    }
    out.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    return out;
  } catch {
    return [];
  }
}

// Run fn with HOME and AOFORGE_HANDOFF_PID_FILE taken from `env` (watcher-state reads process.env directly).
// A key `env` does not carry is unset for the call. Synchronous, so the swap is restored before anything else runs.
function withEnv(env, fn) {
  if (!env || typeof env !== 'object') return fn();
  const keys = ['HOME', 'AOFORGE_HANDOFF_PID_FILE'];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    if (typeof env[k] === 'string') process.env[k] = env[k]; else delete process.env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

function realOrResolved(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * Is the AOForge watcher daemon running AND watching `projectRoot`? True only when its pid file exists, names a live
 * pid, and lists the project root. Paths are compared by realpath on both sides (macOS `/var` is a symlink to
 * `/private/var`).
 *
 * @param {string} projectRoot
 * @param {{ env?: object }} [opts]  `env` stands in for process.env's HOME and AOFORGE_HANDOFF_PID_FILE
 */
function watcherWatching(projectRoot, opts) {
  try {
    if (typeof projectRoot !== 'string' || !projectRoot) return false;
    const state = require('./watcher-state.cjs');
    const info = withEnv(opts && opts.env, () => state.readPidFile());
    if (!info) return false;
    if (!Number.isInteger(info.pid) || info.pid <= 0) return false;
    try { process.kill(info.pid, 0); } catch { return false; }
    if (!Array.isArray(info.watching)) return false;
    const root = realOrResolved(projectRoot);
    return info.watching.some((w) => typeof w === 'string' && realOrResolved(w) === root);
  } catch {
    return false;
  }
}

module.exports = {
  HANDOFF_DIR,
  DEFAULT_TTL_MS,
  MAX_OUTPUT_CHARS,
  MAX_RENDER_CHARS,
  findHandoffDir,
  ttlMs,
  isStale,
  selectUnconsumed,
  isAddressedTo,
  claimRecord,
  markConsumed,
  truncate,
  renderRecord,
  renderResults,
  takeResults,
  pendingAddressedTo,
  watcherWatching,
};
