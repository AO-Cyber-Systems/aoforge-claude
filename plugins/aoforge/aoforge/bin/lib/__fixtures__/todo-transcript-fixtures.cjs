'use strict';

// todo-transcript-fixtures.cjs (TRD 63-01) — hand-built Claude Code transcript records for the todo replay tests.
//
// Record shapes follow what was OBSERVED in a live `claude -p` run (Claude Code 2.1.292, 2026-10-06; the two
// cassettes below are trimmed recordings of it):
//   - Every content block is its own record: an assistant record holds one `tool_use` block, and the user record that
//     follows holds the matching `tool_result` block. Timestamps are ISO strings with milliseconds.
//   - The structured tool output sits on the USER record as `toolUseResult` (camelCase in the transcript file; the
//     stream-json output calls the same object `tool_use_result`).
//   - TaskCreate result: { task: { id: "1", subject } }, text "Task #1 created successfully: <subject>".
//   - TaskUpdate result: { success: true, taskId: "1", updatedFields: ["status"], statusChange: { from, to } },
//     text "Updated task #1 status".
//   - TodoWrite result: { oldTodos: [...], newTodos: [...] }.
//   - A disabled task tool answers is_error: true with a string `toolUseResult` (the shape in older transcripts too).
// Literal values only, a fixed clock and deterministic tool-use ids: no generated data.

const path = require('path');

/** The fixed clock every builder counts from: 2026-10-06T12:00:00.000Z. */
const T0 = Date.UTC(2026, 9, 6, 12, 0, 0);

const SESSION_ID = 'fixture-session';
const HOST_VERSION = '2.1.292';
const RESULT_LAG_MS = 50;

let toolUseCounter = 0;

/** Restart the deterministic `toolu_fixture_<n>` ids. Call it at the top of a test that compares whole transcripts. */
function resetIds() {
  toolUseCounter = 0;
}

function nextToolUseId() {
  toolUseCounter += 1;
  return `toolu_fixture_${toolUseCounter}`;
}

/** ISO timestamp `n` seconds after T0. */
function ts(n = 0) {
  return new Date(T0 + n * 1000).toISOString();
}

function lagged(iso) {
  return new Date(Date.parse(iso) + RESULT_LAG_MS).toISOString();
}

/** An assistant record carrying exactly one tool_use block. */
function assistantToolUse({ id, name, input, ts: at = ts(0), sidechain = false }) {
  return {
    type: 'assistant',
    isSidechain: sidechain,
    timestamp: at,
    sessionId: SESSION_ID,
    version: HOST_VERSION,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input, caller: { type: 'direct' } }] },
  };
}

/** A user record carrying exactly one tool_result block, plus the structured `toolUseResult` when given. */
function userToolResult({ toolUseId, ts: at = ts(0), content = 'ok', isError = false, toolUseResult, sidechain = false }) {
  const block = { tool_use_id: toolUseId, type: 'tool_result', content };
  if (isError) block.is_error = true;
  const rec = {
    type: 'user',
    isSidechain: sidechain,
    timestamp: at,
    sessionId: SESSION_ID,
    version: HOST_VERSION,
    message: { role: 'user', content: [block] },
  };
  if (toolUseResult !== undefined) rec.toolUseResult = toolUseResult;
  return rec;
}

/**
 * A TaskCreate call and (unless withResult is false, a transcript cut at Stop) its result.
 * `ts` stamps the call; the result lands 50ms later, so a test can tell which record a timestamp came from.
 */
function taskCreate({ subject, description = '', activeForm, metadata, taskId, ts: at = ts(0), toolUseId, withResult = true, sidechain = false }) {
  const id = toolUseId || nextToolUseId();
  const input = { subject, description };
  if (activeForm !== undefined) input.activeForm = activeForm;
  if (metadata !== undefined) input.metadata = metadata;
  const group = [assistantToolUse({ id, name: 'TaskCreate', input, ts: at, sidechain })];
  if (withResult) {
    group.push(userToolResult({
      toolUseId: id,
      ts: lagged(at),
      content: `Task #${taskId} created successfully: ${subject}`,
      toolUseResult: { task: { id: String(taskId), subject } },
      sidechain,
    }));
  }
  return group;
}

/** The is_error shape a session answers when the task tools are disabled for it (observed). */
function taskCreateDisabled({ subject, ts: at = ts(0) }) {
  const id = nextToolUseId();
  const message = 'Error: No such tool available: TaskCreate. TaskCreate is disabled for this session, in subagents as well as here.';
  return [
    assistantToolUse({ id, name: 'TaskCreate', input: { subject, description: '' }, ts: at }),
    userToolResult({ toolUseId: id, ts: lagged(at), content: `<tool_use_error>${message}</tool_use_error>`, isError: true, toolUseResult: message }),
  ];
}

/**
 * A TaskUpdate call. `idKey` is the input key the id is sent under ('taskId', or the 'id' / 'task_id' spellings the
 * host repairs before running but does not rewrite in the transcript); `taskId` may be a number or a string.
 */
function taskUpdate({ taskId, status, idKey = 'taskId', subject, ts: at = ts(0), withResult = true, sidechain = false }) {
  const id = nextToolUseId();
  const input = { [idKey]: taskId };
  const updatedFields = [];
  if (status !== undefined) {
    input.status = status;
    updatedFields.push('status');
  }
  if (subject !== undefined) {
    input.subject = subject;
    updatedFields.push('subject');
  }
  const group = [assistantToolUse({ id, name: 'TaskUpdate', input, ts: at, sidechain })];
  if (withResult) {
    const structured = { success: true, taskId: String(taskId), updatedFields };
    if (status !== undefined) structured.statusChange = { from: 'pending', to: status };
    group.push(userToolResult({
      toolUseId: id,
      ts: lagged(at),
      content: `Updated task #${taskId} ${updatedFields.join(', ')}`,
      toolUseResult: structured,
      sidechain,
    }));
  }
  return group;
}

/**
 * A TodoWrite call: `todos` is the whole list as written. The result carries `newTodos` unless
 * resultHasNewTodos is false (then only `oldTodos`, which the replay must not mistake for the new list).
 */
function todoWrite({ todos, oldTodos = [], ts: at = ts(0), resultHasNewTodos = true, withResult = true }) {
  const id = nextToolUseId();
  const group = [assistantToolUse({ id, name: 'TodoWrite', input: { todos }, ts: at })];
  if (withResult) {
    group.push(userToolResult({
      toolUseId: id,
      ts: lagged(at),
      content: 'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable',
      toolUseResult: resultHasNewTodos ? { oldTodos, newTodos: todos } : { oldTodos },
    }));
  }
  return group;
}

/** Noise: a plain user prompt (message.content is a string, as the host writes it). */
function userText(text, at = ts(0)) {
  return { type: 'user', isSidechain: false, timestamp: at, sessionId: SESSION_ID, version: HOST_VERSION, message: { role: 'user', content: text } };
}

/** Noise: an assistant text block. */
function assistantText(text, at = ts(0)) {
  return {
    type: 'assistant',
    isSidechain: false,
    timestamp: at,
    sessionId: SESSION_ID,
    version: HOST_VERSION,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

/** Noise: an attachment record (no `message`). */
function attachment(at = ts(0)) {
  return { type: 'attachment', isSidechain: false, timestamp: at, sessionId: SESSION_ID, version: HOST_VERSION, attachment: { type: 'hook_success', hookName: 'SessionStart' } };
}

/** JSONL text from records and groups of records (a group is what taskCreate / taskUpdate / todoWrite return). */
function transcriptOf(...groups) {
  return groups.flat(Infinity).map((rec) => JSON.stringify(rec)).join('\n') + '\n';
}

// Recorded cassettes: trimmed, sanitized recordings of the real host, never edited to change behaviour.
// Recorded 2026-10-06 with Claude Code 2.1.292 (model claude-sonnet-5-5), in an empty scratch directory with the real
// HOME and no --plugin-dir:
//   CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p "<TaskCreate x2, TaskUpdate, TaskList prompt>" --model sonnet --max-turns 8
//     --output-format stream-json --verbose --allowedTools "TaskCreate,TaskUpdate,TaskList"
//   CLAUDE_CODE_ENABLE_TASKS=0 CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude -p "<TodoWrite x2 prompt>" ... --allowedTools "TodoWrite"
// then the session's transcript (~/.claude/projects/<project-key>/<session_id>.jsonl) was reduced to the task-call
// records (assistant tool_use + user tool_result, keeping type, isSidechain, timestamp, version, message.{role,content}
// and toolUseResult), with sessionId, the scratch path and $HOME replaced by placeholders.
const CASSETTES = {
  taskTools: path.join(__dirname, 'todo-transcripts', 'task-tools.cassette.jsonl'),
  todoWrite: path.join(__dirname, 'todo-transcripts', 'todowrite.cassette.jsonl'),
  // One TodoWrite family run of its own: a single item in_progress, then completed, then an empty list. It records that
  // the host's `oldTodos` forgets an all-completed list (so replay never reads it) and that `newTodos` still carries the
  // completed item as written.
  todoWriteClear: path.join(__dirname, 'todo-transcripts', 'todowrite-clear.cassette.jsonl'),
};

module.exports = {
  T0,
  ts,
  resetIds,
  assistantToolUse,
  userToolResult,
  taskCreate,
  taskCreateDisabled,
  taskUpdate,
  todoWrite,
  userText,
  assistantText,
  attachment,
  transcriptOf,
  CASSETTES,
};
