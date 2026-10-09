#!/usr/bin/env node

/**
 * AOForge Handoff Result Injection (PostToolUse, Stop)
 *
 * route-results.js delivers a finished handoff only when the user types their next prompt. This hook delivers at the
 * two points where Claude can act on a result without the user:
 *
 *   PostToolUse (every tool, matcher `*`)
 *     A fresh completed handoff addressed to this payload enters the context as `additionalContext` right after
 *     Claude's next tool call:
 *       { "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "## Deferred command results ..." } }
 *
 *   Stop (the main loop)
 *     A fresh completed handoff addressed to this session blocks the stop, with the rendered results as the reason
 *     and an instruction to continue the deferred work. Stop's `decision` and `reason` are top-level fields (not
 *     hookSpecificOutput):
 *       { "decision": "block", "reason": "Handoff results arrived ... continue ..." }
 *     If no result is ready yet but a command this session queued is still running in the user's aoforge-watch
 *     terminal, the hook waits for it (below) and blocks with the result the moment it lands.
 *
 * Addressing (handoff-results.cjs, TRD 73-02): a record carries the `session_id` and `agent_id` of the PreToolUse
 * payload that queued it (gate-interactive.js writes them). A record with no session_id belongs to the main loop of
 * any session; one with a session_id belongs to that session and that agent (absent agent_id = the main loop). So a
 * subagent never takes the main loop's result, and another session's result is left where it is. A record is taken by
 * creating done/<id>.claim with O_EXCL, so two copies of this hook running at once over one record deliver it once.
 * route-results.js stays the catch-all on UserPromptSubmit and delivers whatever no other hook delivered; this hook
 * never delivers on that event.
 *
 * The Stop wait. It exists for one case: this turn queued a command the user is answering right now. It starts only
 * when all of these hold:
 *   - no addressed result is ready yet, and `stop_hook_active` is false (a stop this hook already blocked once never
 *     waits again; it still delivers a result that is already complete)
 *   - a pending record addressed to this session's main loop was created in the last 15 minutes (PENDING_MAX_AGE_MS)
 *   - the AOForge daemon is live and its pid file lists this project (a legacy daemon, a dead pid or a daemon that
 *     watches another project would never produce the result)
 *   - AOFORGE_HANDOFF_STOP_WAIT_MS is not 0 (default STOP_WAIT_DEFAULT_MS, 120000)
 * It polls every POLL_MS (250 ms) until the deadline, ends the moment the result lands or the pending record
 * disappears without one, and on timeout exits 0 silently (route-results delivers the result on the next prompt).
 * The hooks.json entry sets a longer timeout than the default wait (TRD 73-06 registers it with 150 seconds).
 *
 * Skipped, with exit 0 and no output, when:
 *   - AOFORGE_SKIP_HANDOFF_INJECT=1 (this hook) or AOFORGE_SKIP_HANDOFF_RESULTS=1 (every handoff delivery)
 *   - stdin is empty, malformed, or not a plain object (null, an array, a string)
 *   - the event is anything other than PostToolUse or Stop
 *   - no .aoforge-handoff/ exists in the payload's cwd or any parent (the common case, kept to one walk up)
 *
 * Never throws and never blocks a tool call: any error exits 0 silently.
 *
 * Not registered in hooks.json yet: TRD 73-06 registers it with its coexistence entry and the PostToolUse schema model.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

const handoffResults = require('../aoforge/bin/lib/handoff-results.cjs');

const STOP_WAIT_DEFAULT_MS = 120000;
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const POLL_MS = 250;

const BY_POST_TOOL_USE = 'inject-handoff-results@PostToolUse';
const BY_STOP = 'inject-handoff-results@Stop';

const SILENT = Object.freeze({ kind: 'silent' });

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Milliseconds the Stop hook may wait. `AOFORGE_HANDOFF_STOP_WAIT_MS`: a non-negative integer is taken (`0` disables), anything else is the default. */
function stopWaitMs(env) {
  const source = isPlainObject(env) ? env : process.env;
  const raw = source.AOFORGE_HANDOFF_STOP_WAIT_MS;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return STOP_WAIT_DEFAULT_MS;
  return parseInt(raw.trim(), 10);
}

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** The payload's cwd when it names an existing directory, else the hook process's own. */
function resolveCwd(payloadCwd, fallback) {
  if (typeof payloadCwd === 'string' && path.isAbsolute(payloadCwd) && isDirectory(payloadCwd)) return payloadCwd;
  return fallback || process.cwd();
}

/**
 * What the hook should do for this payload, up to (not including) any waiting.
 *
 * Returns one of:
 *   { kind: 'silent' }
 *   { kind: 'context', result }                 PostToolUse: print `result.text` as additionalContext
 *   { kind: 'block', result }                   Stop: block with `result.text` as the reason
 *   { kind: 'wait', waitMs, cwd, handoffDir }   Stop: nothing ready, but a command this session queued is running
 *
 * Delivering a result (`context`, `block`) has already claimed and marked it. Pure apart from that and from reading
 * the handoff directory and the pid file.
 *
 * @param {*} payload  the parsed hook payload
 * @param {{ env?: object, now?: number, cwd?: string, lib?: object }} [opts]
 */
function decide(payload, opts) {
  const o = opts || {};
  const env = isPlainObject(o.env) ? o.env : process.env;
  const lib = o.lib || handoffResults;
  if (env.AOFORGE_SKIP_HANDOFF_INJECT === '1' || env.AOFORGE_SKIP_HANDOFF_RESULTS === '1') return SILENT;
  if (!isPlainObject(payload)) return SILENT;
  const event = payload.hook_event_name;
  if (event !== 'PostToolUse' && event !== 'Stop') return SILENT;

  const cwd = resolveCwd(payload.cwd, o.cwd);
  const take = (by) => lib.takeResults({ cwd, payload, mode: 'addressed', by, now: o.now, env });

  if (event === 'PostToolUse') {
    const result = take(BY_POST_TOOL_USE);
    return result ? { kind: 'context', result } : SILENT;
  }

  // Stop, always the main loop (a subagent's stop is SubagentStop, which this hook is not registered for).
  const result = take(BY_STOP);
  if (result) return { kind: 'block', result };

  const waitMs = stopWaitMs(env);
  if (payload.stop_hook_active === true || waitMs === 0) return SILENT;
  const handoffDir = lib.findHandoffDir(cwd);
  if (!handoffDir) return SILENT;
  if (lib.pendingAddressedTo(handoffDir, payload, { now: o.now, maxAgeMs: PENDING_MAX_AGE_MS }).length === 0) return SILENT;
  if (!lib.watcherWatching(path.dirname(handoffDir), { env })) return SILENT;
  return { kind: 'wait', waitMs, cwd, handoffDir };
}

/**
 * Poll for the result of the commands this session queued. Resolves to the delivered `{ records, text }`, or null
 * when the deadline passes or the pending records vanish without a result.
 *
 * The pending check comes before the take on purpose: the daemon writes the done record and then removes the pending
 * one, so a pending record that is already gone means the done record was written before the take that follows.
 */
async function waitForResult(payload, plan, opts) {
  const o = opts || {};
  const env = isPlainObject(o.env) ? o.env : process.env;
  const lib = o.lib || handoffResults;
  const deadline = Date.now() + plan.waitMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_MS, remaining)));
    const stillPending = lib.pendingAddressedTo(plan.handoffDir, payload, { maxAgeMs: PENDING_MAX_AGE_MS }).length > 0;
    const result = lib.takeResults({ cwd: plan.cwd, payload, mode: 'addressed', by: BY_STOP, env });
    if (result) return result;
    if (!stillPending) return null;
  }
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function emitContext(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
  }));
}

function emitBlock(text) {
  const reason = 'Handoff results arrived for commands you queued to the watcher. ' +
    'Read them below and continue the work that was waiting on them.\n\n' + text;
  // TOP-LEVEL shape, the verified Stop form. Not hookSpecificOutput.
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

async function main() {
  try {
    let payload;
    try { payload = JSON.parse(readStdin() || 'null'); } catch { return; }
    let outcome = decide(payload, { env: process.env });
    if (outcome.kind === 'wait') {
      const result = await waitForResult(payload, outcome, { env: process.env });
      outcome = result ? { kind: 'block', result } : SILENT;
    }
    if (outcome.kind === 'context') emitContext(outcome.result.text);
    else if (outcome.kind === 'block') emitBlock(outcome.result.text);
  } catch {
    // Never throw: a delivery problem must not break a tool call or a stop. route-results catches the record next prompt.
  }
}

if (require.main === module) {
  main().then(() => { process.exitCode = 0; }, () => { process.exitCode = 0; });
}

module.exports = {
  STOP_WAIT_DEFAULT_MS,
  PENDING_MAX_AGE_MS,
  POLL_MS,
  stopWaitMs,
  decide,
  main,
};
