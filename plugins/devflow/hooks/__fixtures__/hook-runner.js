'use strict';

/**
 * A small, cited model of how Claude Code runs and combines hooks
 * (objective 63, TRD 63-05, BLTN-05).
 *
 * Claude Code's own runner cannot be driven from a unit test, so this file encodes
 * the rules it documents, and every rule carries the sentence it implements. The
 * source is https://code.claude.com/docs/en/hooks (hooks reference, checked
 * 2026-10-06, v2.1.292): the "Exit code output", "JSON output", "Timeouts",
 * "PreToolUse decision control" and "Stop decision control" sections. If Claude
 * Code changes a rule, the citation is what gets updated, and the suite with it.
 *
 * The model is deliberately no more permissive than the docs: exit 1 never blocks.
 *
 *   classifyOutput(event, {code, stdout, stderr, timedOut}) -> one hook's outcome
 *   runParallel(handlers, payload, opts)                    -> spawn every handler at once
 *   composeEvent(event, outcomes)                           -> the combined result
 *
 * Not a test file: no `*.test.js` glob picks it up.
 */

const { spawn } = require('child_process');

/** How long to wait after a hook exits for its stdout/stderr to end, for a hook that leaks a pipe to a process that outlives it. */
const EXIT_DRAIN_GRACE_MS = 2000;

/**
 * "Plain-text stdout becomes context only on UserPromptSubmit, UserPromptExpansion,
 * SessionStart and PostModelSwitch" (the JSON-output section's plain-text rule).
 */
const CONTEXT_EVENTS = ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'PostModelSwitch'];

/**
 * The fields a JSON output object may set at the top level. Used by the multi-line
 * rule: "no line is a JSON output object that sets a field".
 */
const KNOWN_FIELDS = [
  'continue',
  'stopReason',
  'suppressOutput',
  'systemMessage',
  'terminalSequence',
  'decision',
  'reason',
  'hookSpecificOutput',
];

/**
 * "Exit code 2 behavior per event", the rows with "Can block? Yes" for the events
 * DevFlow registers on. Elsewhere (SessionStart: "Shows stderr to user only";
 * PostToolUse: "Shows stderr to Claude; the tool already ran") exit 2 is not a block.
 */
const EXIT2_BLOCKS = ['PreToolUse', 'UserPromptSubmit', 'UserPromptExpansion', 'Stop', 'SubagentStop'];

/** "When multiple PreToolUse hooks return different decisions, precedence is deny > defer > ask > allow." */
const PRECEDENCE = ['deny', 'defer', 'ask', 'allow'];

// ─── classifyOutput ──────────────────────────────────────────────────────────

function tryParse(text) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Exit-0 stdout, by the documented rules.
 * @returns {{type: 'empty'|'json'|'text'|'parse-error', json?: object, text?: string, message?: string}}
 */
function parseStdout(out) {
  if (out === '') return { type: 'empty' };

  // "Starts with anything else: Claude Code treats it as plain text, a JSON array or a quoted JSON string included."
  if (!out.startsWith('{')) return { type: 'text', text: out };

  // "Starts with { but doesn't end with }: Claude Code treats it as plain text."
  if (!out.endsWith('}')) return { type: 'text', text: out };

  // "Starts with { and ends with }: Claude Code parses it as JSON."
  const whole = tryParse(out);
  if (whole && isPlainObject(whole.value)) return { type: 'json', json: whole.value };

  // "When the output is two or more lines that each parse as JSON on their own, and no line is a JSON output
  //  object that sets a field, Claude Code treats the whole output as plain text. When one of those lines does
  //  set a field, the whole output is a parse failure."
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const parsed = lines.map(tryParse);
    if (parsed.every(Boolean)) {
      const setsAField = parsed.some(
        (p) => isPlainObject(p.value) && KNOWN_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(p.value, f))
      );
      if (!setsAField) return { type: 'text', text: out };
    }
  }
  return { type: 'parse-error', message: 'stdout starts with { and ends with } but is not a JSON object' };
}

/** "The blocking message is the reason from your JSON's blocking decision when it makes one, and your stderr text otherwise." */
function blockingReasonOf(json) {
  if (!json) return null;
  if (json.decision === 'block' && typeof json.reason === 'string') return json.reason;
  const h = json.hookSpecificOutput;
  if (isPlainObject(h) && h.permissionDecision === 'deny' && typeof h.permissionDecisionReason === 'string') {
    return h.permissionDecisionReason;
  }
  return null;
}

/**
 * One hook's outcome.
 *
 * kind: 'ok' (json or text or nothing), 'blocking' (exit 2 on an event that can
 * block), 'error' (a non-blocking error: the action proceeds) or 'timeout'
 * (cancelled, output discarded).
 *
 * @param {string} event
 * @param {{code: number|null, stdout?: string, stderr?: string, timedOut?: boolean, name?: string}} run
 * @returns {{name?: string, kind: string, json: object|null, text: string|null, reason: string|null, error: string|null}}
 */
function classifyOutput(event, run) {
  const out = String(run.stdout || '').trim();
  const err = String(run.stderr || '').trim();
  const base = { name: run.name, kind: 'ok', json: null, text: null, reason: null, error: null };

  // "Claude Code cancels a command hook that reaches its timeout, discarding the hook's output, so on most
  //  events a timed-out hook renders no decision."
  if (run.timedOut) return { ...base, kind: 'timeout', error: 'timed out; output discarded' };

  const parsed = parseStdout(out);

  if (run.code === 2) {
    // "Exit 2 means a blocking error. On events that can block, exit 2 blocks whether or not you print JSON:
    //  even a JSON permissionDecision of "allow" can't override it."
    if (EXIT2_BLOCKS.includes(event)) {
      const json = parsed.type === 'json' ? parsed.json : null;
      return { ...base, kind: 'blocking', json, reason: blockingReasonOf(json) || err };
    }
    // "Shows stderr to user only" / "Shows stderr to Claude; the tool already ran": not a block here.
    return { ...base, kind: 'error', error: `exit 2 does not block on ${event}: ${err}`.trim() };
  }

  if (run.code === 0) {
    switch (parsed.type) {
      case 'json':
        return { ...base, json: parsed.json };
      case 'text':
        return { ...base, text: parsed.text };
      case 'parse-error':
        // "unparseable JSON is a non-blocking error (<hook name> hook error)"
        return { ...base, kind: 'error', error: `parse: ${parsed.message}` };
      default:
        return base;
    }
  }

  // "Any other exit code doesn't block on its own. With a parsed object that passes schema validation, Claude
  //  Code ignores the exit code and the JSON alone decides the outcome." Without JSON it is a non-blocking error.
  if (parsed.type === 'json') return { ...base, json: parsed.json };
  return { ...base, kind: 'error', error: `exit ${run.code}${err ? `: ${err}` : ''}` };
}

// ─── composeEvent ────────────────────────────────────────────────────────────

/**
 * What the user and the model see after every matching hook for one event has run.
 * Handler order is preserved for every list.
 *
 * @param {string} event
 * @param {Array<ReturnType<typeof classifyOutput>>} outcomes
 */
function composeEvent(event, outcomes) {
  const result = {
    blocked: false,
    reasons: [],
    permissionDecision: null,
    additionalContext: [],
    systemMessages: [],
    context: [],
    continue: true,
    errors: [],
  };
  const decisions = [];

  const applyJson = (json, { decides }) => {
    // "continue: If false, Claude stops processing entirely after the hook runs. Takes precedence over any
    //  event-specific decision fields"
    if (json.continue === false) result.continue = false;

    // additionalContext and systemMessage are kept from every hook.
    if (typeof json.systemMessage === 'string') result.systemMessages.push(json.systemMessage);
    const h = isPlainObject(json.hookSpecificOutput) ? json.hookSpecificOutput : null;
    if (h && typeof h.additionalContext === 'string') result.additionalContext.push(h.additionalContext);

    if (!decides) return;

    if (event === 'PreToolUse') {
      let decision = h ? h.permissionDecision : undefined;
      let reason = h ? h.permissionDecisionReason : undefined;
      // "PreToolUse previously used top-level decision and reason fields, but these are deprecated for this
      //  event. The deprecated values "approve" and "block" map to "allow" and "deny" respectively."
      if (decision === undefined && json.decision !== undefined) {
        decision = { approve: 'allow', block: 'deny' }[json.decision];
        reason = json.reason;
      }
      if (PRECEDENCE.includes(decision)) {
        decisions.push(decision);
        if (decision === 'deny' && typeof reason === 'string') result.reasons.push(reason);
      }
      return;
    }

    // Stop, SubagentStop, UserPromptSubmit, UserPromptExpansion, PostToolUse: "decision: block".
    if (json.decision === 'block') {
      result.blocked = true;
      if (typeof json.reason === 'string') result.reasons.push(json.reason);
    }
  };

  for (const o of outcomes) {
    if (o.kind === 'timeout' || o.kind === 'error') {
      result.errors.push({ name: o.name, kind: o.kind, error: o.error });
      continue;
    }
    if (o.kind === 'blocking') {
      // Any block blocks, and a JSON decision beside an exit 2 cannot lift it, so its decision fields are not read.
      result.blocked = true;
      if (o.reason) result.reasons.push(o.reason);
      if (o.json) applyJson(o.json, { decides: false });
      continue;
    }
    if (o.json) {
      applyJson(o.json, { decides: true });
    } else if (o.text && CONTEXT_EVENTS.includes(event)) {
      result.context.push(o.text);
    }
  }

  if (decisions.length > 0) {
    result.permissionDecision = PRECEDENCE.find((d) => decisions.includes(d));
    if (result.permissionDecision === 'deny') result.blocked = true;
  }
  return result;
}

// ─── runParallel ─────────────────────────────────────────────────────────────

/**
 * Run one handler. A handler is either
 *   {name, script?, args?, cwd?, env?, timeoutMs?}   a node child: `node [script] [...args]`
 *   {name, inProcess: async () => ({code, stdout, stderr}), timeoutMs?}
 *
 * A node child settles when its output has ended (`close`), never at a fixed delay after `exit`. If the streams
 * have not ended EXIT_DRAIN_GRACE_MS after `exit` (a pipe leaked to a process that outlives the hook), it settles
 * with the output read so far and the runner drops the pipes. A timeout settles at once.
 */
function runHandler(handler, stdinData, opts) {
  const startedAt = Date.now();
  const timeoutMs = handler.timeoutMs || opts.timeoutMs || 10000;
  const name = handler.name;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const settle = (fields) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ name, code: null, stdout: '', stderr: '', timedOut: false, ...fields, ms: Date.now() - startedAt });
    };

    if (typeof handler.inProcess === 'function') {
      timer = setTimeout(() => settle({ timedOut: true }), timeoutMs);
      Promise.resolve()
        .then(() => handler.inProcess())
        .then(
          (r) => settle({ code: r.code === undefined ? 0 : r.code, stdout: r.stdout || '', stderr: r.stderr || '' }),
          (e) => settle({ code: 1, stderr: String((e && e.stack) || e) })
        );
      return;
    }

    const argv = [...(handler.script ? [handler.script] : []), ...(handler.args || [])];
    const child = spawn(process.execPath, argv, {
      cwd: handler.cwd || opts.cwd,
      env: handler.env || opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    // Drop our end of both pipes. A pipe leaked to a process that outlives the hook would otherwise keep this
    // process alive for as long as that process holds it.
    const release = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };

    // "All matching hooks run in parallel": nothing here waits on another handler.
    // A timeout settles at once and never waits for `close`.
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ timedOut: true });
      release();
    }, timeoutMs);

    // A handler that never reads stdin makes the write fail with EPIPE; that is not the hook's failure.
    child.stdin.on('error', () => {});
    child.stdin.end(stdinData);

    child.on('error', (e) => settle({ code: 1, stderr: `${stderr}${e.message}` }));
    let exitCode = null;
    child.on('exit', (code, signal) => {
      exitCode = code === null ? (signal ? 1 : 0) : code;
      // The process is gone, so its timeout no longer applies, and a hook that exits but leaks a pipe is not timed out.
      clearTimeout(timer);
      // `exit` can arrive before the pipes have drained, and on a loaded runner a short timer fires before the
      // pending data is read. `close` is the real end of output, so settle here only when both streams have
      // already ended. Otherwise `close` settles, and the grace only bounds a pipe leaked to a process that
      // outlives the hook.
      if (child.stdout.readableEnded && child.stderr.readableEnded) {
        settle({ code: exitCode, stdout, stderr });
        return;
      }
      setTimeout(() => {
        settle({ code: exitCode, stdout, stderr });
        release();
      }, EXIT_DRAIN_GRACE_MS).unref();
    });
    child.on('close', (code, signal) => {
      settle({ code: code === null ? (signal ? 1 : 0) : code, stdout, stderr });
    });
  });
}

/**
 * Spawn every handler at once with the same stdin payload. Each result carries the child's full output: it is
 * returned once the streams end, or EXIT_DRAIN_GRACE_MS after exit for a leaked pipe (see runHandler).
 *
 * @param {Array<object>} handlers
 * @param {object|string} payload an object is sent as JSON; a string is sent verbatim (degraded-input runs)
 * @param {{cwd?: string, env?: object, timeoutMs?: number}} [opts] timeoutMs defaults to 10000
 * @returns {Promise<Array<{name: string, code: number|null, stdout: string, stderr: string, timedOut: boolean, ms: number}>>}
 */
function runParallel(handlers, payload, opts = {}) {
  const stdinData = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return Promise.all(handlers.map((h) => runHandler(h, stdinData, opts)));
}

module.exports = {
  EXIT_DRAIN_GRACE_MS,
  CONTEXT_EVENTS,
  KNOWN_FIELDS,
  EXIT2_BLOCKS,
  PRECEDENCE,
  classifyOutput,
  composeEvent,
  runParallel,
};
