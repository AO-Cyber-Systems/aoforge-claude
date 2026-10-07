'use strict';

// todo-session.cjs (TRD 63-01) — replay a Claude Code session transcript into the session's DevFlow todo items.
//
// Pure: it takes transcript TEXT and returns data. No fs, no spawn, no stdout; reading the file is the caller's job
// (todo-sync.cjs). Deterministic: the same text always gives the same items, because a derived stem uses the
// timestamp of the record that created the item, never the current time.
//
// Why a transcript and not the host's task store: the hooks docs give a hook only `transcript_path` and `session_id`.
// Every TaskCreate / TaskUpdate / TodoWrite call is an assistant `tool_use` block, and its result (with the id the host
// assigned) is on the next user record, so replaying those pairs rebuilds the session's list exactly.
//
// Record shapes, observed in a live `claude -p` run on Claude Code 2.1.292 (the recorded cassettes sit beside the tests):
//   assistant { message.content: [{ type: 'tool_use', id, name, input }] }          one block per record
//   user      { message.content: [{ type: 'tool_result', tool_use_id, content, is_error? }],
//               toolUseResult: <structured output> }                               (`tool_use_result` in the SDK stream)
//   TaskCreate  result { task: { id: "1", subject } }, text "Task #1 created successfully: <subject>"
//   TaskUpdate  result { success, taskId, updatedFields, statusChange? }
//   TodoWrite   result { oldTodos, newTodos }  (oldTodos forgets an all-completed list, so it is never read)

const { generateSlugInternal } = require('./helpers.cjs');

const TODO_PREFIX = 'Todo: '; // case-sensitive
const STEM_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUFFIX_RE = /\s*\[todo:([^\]\s]+)\]\s*$/;
const CREATED_TEXT_RE = /^Task #(\S+) created successfully/;
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

const TASK_CALLS = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite']);
const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted']);
const TODOWRITE_STATUSES = new Set(['pending', 'in_progress', 'completed']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * parseTodoSubject(subject) — `Todo: <title>` or `Todo: <title> [todo:<stem>]` -> { title, stem }, else null.
 * `stem` is null without a suffix or when the suffix is not a valid stem (the suffix is stripped from the title either way).
 */
function parseTodoSubject(subject) {
  if (typeof subject !== 'string' || !subject.startsWith(TODO_PREFIX)) return null;
  let rest = subject.slice(TODO_PREFIX.length).trim();
  let stem = null;
  const suffix = SUFFIX_RE.exec(rest);
  if (suffix) {
    stem = STEM_RE.test(suffix[1]) ? suffix[1] : null;
    rest = rest.slice(0, suffix.index).trim();
  }
  return rest === '' ? null : { title: rest, stem };
}

/** formatTodoSubject(title, stem?) — the inverse of parseTodoSubject. */
function formatTodoSubject(title, stem) {
  return stem ? `${TODO_PREFIX}${title} [todo:${stem}]` : `${TODO_PREFIX}${title}`;
}

/**
 * deriveStem(title, iso) — `<UTC date of iso>-<slug(title)>`, the name `todo add` gives a todo
 * (`${dateOf(now)}-${generateSlugInternal(title) || 'todo'}`). null when `iso` is not a date.
 */
function deriveStem(title, iso) {
  if (typeof iso !== 'string' || !DATE_PREFIX_RE.test(iso)) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const slug = typeof title === 'string' ? generateSlugInternal(title) : '';
  return `${new Date(at).toISOString().slice(0, 10)}-${slug || 'todo'}`;
}

function newStats() {
  return {
    records: 0,
    task_creates: 0,
    task_updates: 0,
    todowrites: 0,
    unknown_task_updates: 0,
    errors_skipped: 0,
    unresolved_uses: 0,
    sidechain_skipped: 0,
    malformed_lines: 0,
    no_stem_skipped: 0,
  };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (isObject(b) && typeof b.text === 'string' ? b.text : '')).join('');
}

/** The structured tool output of a user record: `toolUseResult` in a transcript, `tool_use_result` in the SDK stream. */
function structuredOf(rec) {
  if (isObject(rec.toolUseResult)) return rec.toolUseResult;
  if (isObject(rec.tool_use_result)) return rec.tool_use_result;
  return null;
}

function idOf(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function itemOf({ key, source, taskId = null, title, stem, stemSource, status, description = null, at }) {
  return {
    key,
    source,
    task_id: taskId,
    title,
    stem,
    stem_source: stemSource,
    status,
    description,
    created_at: at,
    updated_at: at,
  };
}

/** The identity of a task-tool todo: an explicit metadata stem, then the subject's suffix, then the derived name. */
function stemForTask(meta, parsed, title, at) {
  if (typeof meta === 'string' && STEM_RE.test(meta)) return { stem: meta, stemSource: 'metadata' };
  if (parsed && parsed.stem) return { stem: parsed.stem, stemSource: 'subject' };
  return { stem: deriveStem(title, at), stemSource: 'derived' };
}

function replayInto(text, stats) {
  const pending = new Map(); // tool_use id -> { name, input, ts }: calls still waiting for their result
  const tasks = new Map(); // task id -> { item } (item null for a task that is not a todo): the latest task with that id
  const listItems = new Map(); // TodoWrite lookup key (stem, else content) -> item
  const born = new Map(); // item -> sequence number of its first appearance
  let sequence = 0;

  const adopt = (item) => {
    sequence += 1;
    born.set(item, sequence);
    return item;
  };

  const applyTaskCreate = (use, block, structured, at) => {
    let id =structured && isObject(structured.task) ? idOf(structured.task.id) : null;
    if (id === null) {
      const named = CREATED_TEXT_RE.exec(textOf(block.content));
      if (named) id = named[1];
    }
    if (id === null || id === '') {
      stats.unresolved_uses += 1;
      return;
    }
    const subject = typeof use.input.subject === 'string' ? use.input.subject : '';
    const meta = isObject(use.input.metadata) ? use.input.metadata.devflow_todo : undefined;
    const parsed = parseTodoSubject(subject);
    if (typeof meta !== 'string' && parsed === null) {
      tasks.set(id, { item: null });
      return;
    }
    const title = parsed ? parsed.title : subject.trim();
    const { stem, stemSource } = stemForTask(meta, parsed, title, at);
    const description = typeof use.input.description === 'string' && use.input.description !== '' ? use.input.description : null;
    const item = adopt(itemOf({ key: `task:${id}`, source: 'task', taskId: id, title, stem, stemSource, status: 'pending', description, at }));
    tasks.set(id, { item });
  };

  const applyTaskUpdate = (use, structured, at) => {
    if (structured && structured.success === false) {
      stats.errors_skipped += 1;
      return;
    }
    const id = idOf(use.input.taskId ?? use.input.id ?? use.input.task_id); // the host repairs these spellings, the stream does not show it
    const task = id === null ? undefined : tasks.get(id);
    if (!task) {
      stats.unknown_task_updates += 1;
      return;
    }
    if (!task.item) return; // a known task that is not a todo
    if (TASK_STATUSES.has(use.input.status)) task.item.status = use.input.status;
    task.item.updated_at = at;
  };

  const applyTodoWrite = (use, structured, at) => {
    let list = [];
    if (structured && Array.isArray(structured.newTodos)) list = structured.newTodos;
    else if (Array.isArray(use.input.todos)) list = use.input.todos;
    const seen = new Set();
    for (const entry of list) {
      if (!isObject(entry) || typeof entry.content !== 'string') continue;
      const parsed = parseTodoSubject(entry.content);
      if (parsed === null) continue;
      const lookup = parsed.stem || entry.content;
      let item = listItems.get(lookup);
      if (!item) {
        const stem = parsed.stem || deriveStem(parsed.title, at);
        item = adopt(itemOf({
          key: `todowrite:${stem || entry.content}`,
          source: 'todowrite',
          title: parsed.title,
          stem,
          stemSource: parsed.stem ? 'subject' : 'derived',
          status: 'pending',
          at,
        }));
        listItems.set(lookup, item);
      }
      item.title = parsed.title;
      if (TODOWRITE_STATUSES.has(entry.status)) item.status = entry.status;
      item.updated_at = at;
      seen.add(lookup);
    }
    // Dropped from the list: unfinished work was abandoned, but finished work is cleared by the host (and often by the
    // model) once everything is done, so a completed item that disappears stays completed.
    for (const [lookup, item] of listItems) {
      if (seen.has(lookup) || item.status === 'deleted' || item.status === 'completed') continue;
      item.status = 'deleted';
      item.updated_at = at;
    }
  };

  const onAssistant = (rec, content) => {
    for (const block of content) {
      if (!isObject(block) || block.type !== 'tool_use' || !TASK_CALLS.has(block.name) || typeof block.id !== 'string') continue;
      pending.set(block.id, { name: block.name, input: isObject(block.input) ? block.input : {}, ts: typeof rec.timestamp === 'string' ? rec.timestamp : null });
      if (block.name === 'TaskCreate') stats.task_creates += 1;
      else if (block.name === 'TaskUpdate') stats.task_updates += 1;
      else stats.todowrites += 1;
    }
  };

  const onUser = (rec, content) => {
    for (const block of content) {
      if (!isObject(block) || block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
      const use = pending.get(block.tool_use_id);
      if (!use) continue;
      pending.delete(block.tool_use_id);
      if (block.is_error === true) {
        stats.errors_skipped += 1;
        continue;
      }
      const structured = structuredOf(rec);
      const at = typeof rec.timestamp === 'string' ? rec.timestamp : use.ts;
      if (use.name === 'TaskCreate') applyTaskCreate(use, block, structured, at);
      else if (use.name === 'TaskUpdate') applyTaskUpdate(use, structured, at);
      else applyTodoWrite(use, structured, at);
    }
  };

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      stats.malformed_lines += 1;
      continue;
    }
    if (!isObject(rec)) continue;
    stats.records += 1;
    const content = isObject(rec.message) && Array.isArray(rec.message.content) ? rec.message.content : null;
    if (!content) continue;
    if (rec.isSidechain === true) {
      stats.sidechain_skipped += content.filter((b) => isObject(b) && b.type === 'tool_use' && TASK_CALLS.has(b.name)).length;
      continue;
    }
    if (rec.type === 'assistant') onAssistant(rec, content);
    else if (rec.type === 'user') onUser(rec, content);
  }

  stats.unresolved_uses += pending.size;

  const all = [];
  for (const { item } of tasks.values()) if (item) all.push(item);
  for (const item of listItems.values()) all.push(item);
  const items = all.filter((item) => {
    if (item.stem) return true;
    stats.no_stem_skipped += 1; // no date on the record and no explicit stem: nothing stable to key it on
    return false;
  });
  items.sort((a, b) => {
    const byTime = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    return byTime !== 0 ? byTime : born.get(a) - born.get(b);
  });
  return items;
}

/**
 * replayTranscript(text) — { items, stats } for a transcript's text. Never throws; on an unexpected failure it returns
 * `{ items: [], stats }` with `stats.error` set. Only calls whose result is present and not an error take effect.
 *
 * item: { key, source: 'task'|'todowrite', task_id, title, stem, stem_source: 'metadata'|'subject'|'derived',
 *         status: 'pending'|'in_progress'|'completed'|'deleted', description, created_at, updated_at }
 */
function replayTranscript(text) {
  const stats = newStats();
  if (typeof text !== 'string') return { items: [], stats };
  try {
    return { items: replayInto(text, stats), stats };
  } catch (err) {
    stats.error = err && err.message ? String(err.message) : String(err);
    return { items: [], stats };
  }
}

module.exports = { TODO_PREFIX, STEM_RE, parseTodoSubject, formatTodoSubject, deriveStem, replayTranscript };
