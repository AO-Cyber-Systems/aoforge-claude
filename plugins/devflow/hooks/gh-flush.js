#!/usr/bin/env node
/**
 * gh-flush.js — store-mode outbox flush and drift report (TRD 50-05, GEN-02).
 *
 * In store mode a planning write is queued in the outbox and sent to GitHub by `df-tools gh outbox flush`. Left to
 * the developer, a queued write can sit for a whole session. This hook sends it soon after it is made, and makes
 * a stuck outbox or a hand-edited cache visible. One script, two events (branching on `hook_event_name`):
 *
 *   PostToolUse (matcher Bash)  only when the command ran `df-tools commit`; any other Bash command returns at
 *                               once (PostToolUse fires for every Bash call). Reports through
 *                               `hookSpecificOutput.additionalContext`, so Claude sees it.
 *   Stop                        flushes what is queued, and reports pending, halted and cache drift (W055).
 *                               Reports through `systemMessage`, so the user sees it.
 *
 * Cheap in-process pre-check first, with no spawn and no gh call: store mode (`planning-mode`), then the outbox
 * counts (`gh-outbox.status`), then, at Stop only, `planning-drift.findCacheDrift` (it hashes every cache file, so
 * it is not run after every commit). The flush is spawned only when ops are pending or blocked and the outbox is
 * not halted:
 *
 *   df-tools --cwd <root> gh outbox flush --no-wait --raw        bounded: 20 s (PostToolUse) / 30 s (Stop)
 *
 * Local mode (the default), an empty queue with no drift, an unrelated Bash command, a skipped hook: exit 0, no
 * output, no gh call, no child process (D-01).
 *
 * NEVER BLOCKS. No `decision` key is ever emitted, so it cannot fight auto-continue.js's one Stop block. Exit is 0
 * on every path; offline, rate limited, a held lock, a timeout or a thrown error becomes a one-line notice or
 * nothing. The flush is never retried inside the hook. It writes nothing itself and keeps no state, so nothing
 * lands under `.planning/` (planning-writes.audit.test.js).
 *
 * Escape hatch: DEVFLOW_SKIP_GH_FLUSH_HOOK=1. Timeout override: DEVFLOW_GH_FLUSH_TIMEOUT_MS (milliseconds).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const POST_TIMEOUT_MS = 20 * 1000;
const STOP_TIMEOUT_MS = 30 * 1000;

/** `df-tools commit` and `df-tools.cjs [--cwd <dir>] commit`, wherever it sits in the command line. */
const COMMIT_RE = /df-tools(?:\.cjs)?["']?\s+(?:--cwd\s+\S+\s+)?commit(?=\s|$)/;

/** @returns {boolean} true when a Bash command line runs `df-tools commit`. */
function isDfToolsCommit(command) {
  return typeof command === 'string' && COMMIT_RE.test(command);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parsePayload(text) {
  try {
    const payload = JSON.parse(text);
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

const writes = (n) => `${n} GitHub write${n === 1 ? '' : 's'}`;

function timeoutMs(isStop) {
  const override = Number(process.env.DEVFLOW_GH_FLUSH_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return isStop ? STOP_TIMEOUT_MS : POST_TIMEOUT_MS;
}

function duration(ms) {
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}

const PENDING_REASONS = {
  offline: 'offline',
  rate_limited: 'rate limited',
  budget: 'write budget reached',
  retry_after: 'waiting to retry',
  max_ops: 'more to send',
  pending: 'not ready yet',
};

function haltLine(halted) {
  const reason = halted && typeof halted.reason === 'string' && halted.reason ? halted.reason : 'blocked';
  return `outbox halted: ${reason} — run df-tools gh outbox status`;
}

/**
 * Run the bounded flush and turn its outcome into a notice, or null when there is nothing to say.
 * `st` is the pre-check status, used for the count when the flush result carries none.
 */
function flushNotice(dfTools, root, ms, st) {
  const r = spawnSync(
    process.execPath,
    [dfTools, '--cwd', root, 'gh', 'outbox', 'flush', '--no-wait', '--raw'],
    { encoding: 'utf8', timeout: ms, killSignal: 'SIGKILL', windowsHide: true },
  );

  const failed = (why) => `GitHub sync failed: ${why}; queued writes are kept`;
  if (r.error) {
    return failed(r.error.code === 'ETIMEDOUT' ? `flush timed out after ${duration(ms)}` : firstLine(r.error.message) || 'could not run df-tools');
  }
  if (r.status === null) return failed(`flush was stopped (${r.signal || 'signal'})`);

  const body = parseJson(r.stdout);
  const result = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};

  if (r.status === 0) {
    const done = Array.isArray(result.done) ? result.done.length : 0;
    return result.status === 'flushed' && done > 0 ? `synced ${writes(done)}` : null;
  }
  if (r.status === 3) {
    const n = Number.isInteger(result.pending) && result.pending > 0 ? result.pending : st.pending + st.blocked;
    const why = PENDING_REASONS[result.reason] || 'pending';
    return `${writes(n)} queued (${why}); they will retry`;
  }
  if (r.status === 2) return haltLine(result.halted);
  return failed(firstLine(result.error) || firstLine(r.stderr) || firstLine(r.stdout) || `df-tools exited ${r.status}`);
}

function emit(isStop, lines) {
  if (lines.length === 0) return;
  const text = lines.map((l) => `DevFlow: ${l}`).join('\n');
  const out = isStop
    ? { systemMessage: text }
    : { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

function main() {
  if (process.env.DEVFLOW_SKIP_GH_FLUSH_HOOK === '1') return;

  const payload = parsePayload(readStdin());
  if (!payload) return;

  const event = payload.hook_event_name;
  const isStop = event === 'Stop';
  if (event === 'PostToolUse') {
    if (payload.tool_name !== undefined && payload.tool_name !== 'Bash') return;
    const input = payload.tool_input;
    if (!isDfToolsCommit(input && input.command)) return;
  } else if (!isStop) {
    return;
  }

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  const lib = path.join(pluginRoot, 'devflow', 'bin', 'lib');
  const dfTools = path.join(pluginRoot, 'devflow', 'bin', 'df-tools.cjs');

  const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd();
  const planningMode = require(path.join(lib, 'planning-mode.cjs'));
  if (!planningMode.isStoreMode(cwd)) return;

  const root = planningMode.resolveMainRoot(cwd) || cwd;
  const outbox = require(path.join(lib, 'gh-outbox.cjs'));
  const st = outbox.status(root);

  const lines = [];
  if (st.halted) {
    lines.push(haltLine(st.halted));
  } else if (st.pending + st.blocked > 0) {
    const notice = flushNotice(dfTools, root, timeoutMs(isStop), st);
    if (notice) lines.push(notice);
  }

  if (isStop) {
    try {
      const { drift } = require(path.join(lib, 'planning-drift.cjs')).findCacheDrift(root);
      if (drift.length > 0) {
        lines.push(`${drift.length} planning cache file${drift.length === 1 ? '' : 's'} changed outside a verb (W055) — run df-tools validate health`);
      }
    } catch {
      // an unreadable index or ledger is `validate health`'s W056 to report, not this hook's
    }
  }

  emit(isStop, lines);
}

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open: a hook must never block the developer
  }
  process.exitCode = 0;
}

module.exports = { isDfToolsCommit };
