#!/usr/bin/env node
/**
 * todo-sync.js — merge the session's `/devflow:todo` items into the todo archive at every Stop (TRD 63-03, BLTN-04).
 *
 * A todo added or completed through the session task list (TaskCreate / TaskUpdate, or TodoWrite) lives only as long as
 * the session. This hook replays the session transcript at Stop and merges what it finds into the durable archive with
 * the library behind `df-tools todo sync` (todo-sync.cjs, TRD 63-02): `.planning/todos/` in local mode, a queued
 * `devflow:todo` issue in store mode. The merge is monotonic and idempotent, so running it at every Stop, on
 * `stop_hook_active` too, over the same transcript, changes nothing the second time.
 *
 * Cheap exits first, with no library loaded until it is needed and no gh call anywhere:
 *   - DEVFLOW_SKIP_TODO_SYNC=1, stdin that is not a plain object, an event other than Stop, no `transcript_path`
 *   - not a DevFlow project (no `.planning/` at or above the cwd)
 *   - an unreadable transcript, or one that never mentions a task call AND the todo markers (`Todo: `, `devflow_todo`)
 * Only then is the sync library loaded and called in-process (not `df-tools todo sync`: no second node start per Stop).
 *
 * It tells the user what it did in ONE `systemMessage` and says nothing when nothing changed. Lines: archived N,
 * completed N, the uncommitted todo files (local mode), "queued for GitHub" (store mode), or a failure line. It never
 * commits: a commit at an arbitrary Stop can raise a signing prompt, and the `/devflow:todo list` flow commits.
 *
 * NEVER BLOCKS. No `decision`, `continue` or `stopReason` key is ever emitted, so it cannot fight auto-continue.js's one
 * Stop block. Exit is 0 on every path; a missing bundled library or a thrown error is silence. In store mode the writes
 * are queued with `noFlush`: gh-flush.js sends them at this same Stop (in parallel) and after each `df-tools commit`.
 * It keeps no state of its own, so the only thing written under `.planning/` is a todo file, through the todo verbs
 * (planning-writes.audit.test.js).
 *
 * Registered on Stop only. Not on SessionEnd: its hooks get 1.5 s by default, so a store-mode sync could be cut
 * mid-write, and Stop already runs after every completed turn. Not on SubagentStop: subagents do not own todos.
 *
 * Escape hatch: DEVFLOW_SKIP_TODO_SYNC=1.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** A transcript that has none of these cannot hold a task call; one that has none of the second set holds no todo. */
const TASK_CALL_MARKERS = ['"TaskCreate"', '"TaskUpdate"', '"TodoWrite"'];
const TODO_MARKERS = ['Todo: ', 'devflow_todo'];

const MAX_WARNING_CHARS = 200;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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
    return isObject(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** True when the transcript text could hold a todo: a task call and a todo marker both appear in it. */
function mayHoldTodos(text) {
  return TASK_CALL_MARKERS.some((m) => text.includes(m)) && TODO_MARKERS.some((m) => text.includes(m));
}

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

function shorten(text) {
  const line = oneLine(text);
  return line.length > MAX_WARNING_CHARS ? `${line.slice(0, MAX_WARNING_CHARS - 3)}...` : line;
}

/** The lines that say what the sync did, from its result. Empty when it changed nothing and did not fail. */
function linesOf(r) {
  const added = Array.isArray(r.added) ? r.added : [];
  const completed = Array.isArray(r.completed) ? r.completed : [];
  const changed = added.length + completed.length > 0;
  const lines = [];
  if (added.length > 0) lines.push(`todo sync: archived ${added.length} todo(s) from this session`);
  if (completed.length > 0) lines.push(`todo sync: completed ${completed.length} todo(s)`);

  // Only when this run wrote something: a rerun finds the same files still uncommitted, and must stay silent.
  if (changed && r.mode === 'local' && Array.isArray(r.pending_commit) && r.pending_commit.length > 0) {
    lines.push(`todo sync: not committed yet: ${r.pending_commit.join(' ')} (/devflow:todo list commits them)`);
  }
  if (changed && r.mode === 'store') lines.push('todo sync: queued for GitHub; gh-flush sends them');

  if (r.ok === false) {
    const why = (Array.isArray(r.warnings) && r.warnings[0]) || r.error || 'unknown error';
    lines.push(`todo sync failed: ${shorten(why)}; nothing is lost, the session task list still holds them`);
  }
  return lines;
}

/**
 * run(payload, {env, pluginRoot}) -> `{ systemMessage }` | null.
 * Null means "say nothing". It throws only when the bundled library does; main() turns that into silence too.
 */
function run(payload, { env = process.env, pluginRoot } = {}) {
  if (env.DEVFLOW_SKIP_TODO_SYNC === '1') return null;
  if (!isObject(payload) || payload.hook_event_name !== 'Stop') return null;

  const transcript = payload.transcript_path;
  if (typeof transcript !== 'string' || transcript === '') return null;

  const lib = path.join(pluginRoot || path.resolve(__dirname, '..'), 'devflow', 'bin', 'lib');
  const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd();

  const planningMode = require(path.join(lib, 'planning-mode.cjs'));
  if (!planningMode.resolveMainRoot(cwd)) return null;

  let text;
  try {
    text = fs.readFileSync(transcript, 'utf8');
  } catch {
    return null;
  }
  if (!mayHoldTodos(text)) return null;

  const { syncTodos } = require(path.join(lib, 'todo-sync.cjs'));
  let result;
  try {
    result = syncTodos(cwd, { transcripts: [transcript], sessionId: payload.session_id, noFlush: true });
  } catch (e) {
    result = { ok: false, warnings: [e && e.message ? e.message : String(e)] };
  }

  const lines = linesOf(result);
  if (lines.length === 0) return null;
  return { systemMessage: lines.map((l) => `DevFlow: ${l}`).join('\n') };
}

function main() {
  const payload = parsePayload(readStdin());
  if (!payload) return;
  const out = run(payload, {
    env: process.env,
    pluginRoot: process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..'),
  });
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open: a hook must never block the developer
  }
  process.exitCode = 0;
}

module.exports = { run };
