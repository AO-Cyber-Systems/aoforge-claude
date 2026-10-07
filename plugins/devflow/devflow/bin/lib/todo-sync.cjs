'use strict';

/**
 * todo-sync.cjs (TRD 63-02) — merge a session's todos into the durable todo archive.
 *
 * The session side is todo-session.cjs (63-01): a transcript in, stable-stem todo items out. The archive side already
 * exists and speaks both planning modes: `todo add` puts `.planning/todos/pending/<stem>.md` (and, with github.store
 * on, a `devflow:todo` issue), `todo complete` moves it to `todos/completed/` (and closes the issue). This module adds no
 * storage. It is three small parts:
 *
 *   readArchive(main)       what the archive holds, by stem and by normalized title
 *   planSync(items, archive) a pure planner: which todos to add and which to complete
 *   syncTodos(cwd, opts)    replay the transcripts, plan, and apply the plan through the verb functions
 *
 * The merge is monotonic: a todo only moves absent -> pending -> completed. A todo the session deleted is never removed
 * from the archive and a completed archive todo is never reopened, so running the sync any number of times, from the
 * Stop hook and from the CLI, over one transcript or several that share items, neither duplicates nor loses a todo.
 *
 * Every archive change is made by planning-entity-verbs `todoAdd` / `todoComplete`, called through the module object so
 * a test can stand between planning and writing. This module itself writes no file and makes no gh call: with
 * github.store off the bytes on disk are those of `todo add --from` / `todo complete` (D-01), and with nothing to merge
 * nothing is touched at all. It never commits; the caller commits `pending_commit` (local mode).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const planningMode = require('./planning-mode.cjs');
const entity = require('./planning-entity-verbs.cjs');
const session = require('./todo-session.cjs');
const { loadConfig } = require('./config.cjs');

/** Furthest status wins when two items name one todo. */
const RANK = { deleted: -1, pending: 0, in_progress: 1, completed: 2 };

/** What a session id looks like: a UUID, or any id of 8+ characters made of letters, digits and dashes. */
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{7,}$/;

const SKIP_DELETED = 'deleted in the session before it was archived';
const NO_TODOS = 'no session todos';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const noQueued = () => ({ enqueued: 0, coalesced: 0 });

/** A todo title as compared for de-duplication: one pair of surrounding quotes dropped, lowercased, whitespace collapsed. */
function normalizeTitle(title) {
  return String(title).trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── The archive ─────────────────────────────────────────────────────────────

/** `*.md` file names directly inside `dir`, sorted; a missing or unreadable directory is empty. */
function markdownFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name).sort();
}

/**
 * The `title:` of a todo file, read the way `init todos` reads it, so it also finds the title of a completed file whose
 * first line is `completed: <date>`. null when the file has none or cannot be read.
 */
function titleOf(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = /^title:\s*(.+)$/m.exec(text);
  return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : null;
}

/**
 * readArchive(main) -> { pending: Map<stem, {title}>, completed: Map<stem, {title}>, byTitle: Map<normalized, {stem, state}> }
 * `main` is the MAIN checkout (where `.planning/` lives). `todos/done/` is the old spelling of `todos/completed/`.
 * When a pending and a completed todo share a title, the completed one is the one found by title.
 */
function readArchive(main) {
  const base = path.join(main, '.planning', 'todos');
  const pending = new Map();
  const completed = new Map();
  for (const name of markdownFiles(path.join(base, 'pending'))) {
    pending.set(name.slice(0, -3), { title: titleOf(path.join(base, 'pending', name)) });
  }
  for (const dir of ['completed', 'done']) {
    for (const name of markdownFiles(path.join(base, dir))) {
      const stem = name.slice(0, -3);
      if (!completed.has(stem)) completed.set(stem, { title: titleOf(path.join(base, dir, name)) });
    }
  }

  const byTitle = new Map();
  for (const [stem, { title }] of pending) {
    const key = title ? normalizeTitle(title) : '';
    if (key && !byTitle.has(key)) byTitle.set(key, { stem, state: 'pending' });
  }
  const claimed = new Set();
  for (const [stem, { title }] of completed) {
    const key = title ? normalizeTitle(title) : '';
    if (key && !claimed.has(key)) {
      byTitle.set(key, { stem, state: 'completed' });
      claimed.add(key);
    }
  }
  return { pending, completed, byTitle };
}

// ─── The planner (pure) ──────────────────────────────────────────────────────

const statusOf = (item) => (Object.hasOwn(RANK, item.status) ? item.status : 'pending');

/**
 * The archive stem a session item stands for. An item whose stem was only derived (no metadata, no suffix) that is not
 * in the archive under that stem may be the same todo under another day's name: match it by normalized title. An item
 * with an explicit stem is its own todo, whatever its title.
 */
function targetStemOf(item, archive) {
  const own = item.stem;
  if (archive.pending.has(own) || archive.completed.has(own) || item.stem_source !== 'derived') return own;
  const hit = archive.byTitle.get(normalizeTitle(item.title));
  return hit ? hit.stem : own;
}

/**
 * planSync(items, archive) -> { ops, skipped }
 *   ops:     [{op: 'add', stem, item} | {op: 'complete', stem}] in the order the todos first appear
 *   skipped: [{stem, title, reason}]
 *
 *   absent  + pending|in_progress -> add            pending + completed -> complete
 *   absent  + completed           -> add, complete  everything else    -> nothing
 *   absent  + deleted             -> skipped
 *
 * Items that name one stem (a todo in two transcripts, a forked session, a todo created twice) fold into one; the item
 * with the furthest status wins and the first seen wins a tie. An item with no usable stem is ignored.
 */
function planSync(items, archive) {
  const targets = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!isObject(item) || typeof item.stem !== 'string' || item.stem === '') continue;
    const stem = targetStemOf(item, archive);
    const status = statusOf(item);
    const held = targets.get(stem);
    if (!held || RANK[status] > RANK[held.status]) targets.set(stem, { item, status });
  }

  const ops = [];
  const skipped = [];
  for (const [stem, { item, status }] of targets) {
    const state = archive.completed.has(stem) ? 'completed' : archive.pending.has(stem) ? 'pending' : 'absent';
    if (state === 'absent') {
      if (status === 'deleted') {
        skipped.push({ stem, title: item.title, reason: SKIP_DELETED });
        continue;
      }
      ops.push({ op: 'add', stem, item });
      if (status === 'completed') ops.push({ op: 'complete', stem });
    } else if (state === 'pending' && status === 'completed') {
      ops.push({ op: 'complete', stem });
    }
  }
  return { ops, skipped };
}

// ─── The todo text ───────────────────────────────────────────────────────────

const oneLine = (value) => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

/**
 * buildTodoText(item, {sessionId?, now?}) -> the file `todo add` takes for a session todo: today's frontmatter and
 * Problem/Solution skeleton. Title and description are flattened to one line each. With no description the Problem line
 * names the session; an item with no `created_at` is stamped from `now` (ms) or the clock.
 */
function buildTodoText(item, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const it = isObject(item) ? item : {};
  const created = typeof it.created_at === 'string' && it.created_at !== ''
    ? it.created_at
    : new Date(Number.isFinite(o.now) ? o.now : Date.now()).toISOString();
  const sessionId = o.sessionId || it.session_id || 'unknown';
  const description = oneLine(it.description);
  const problem = description || `Captured in Claude Code session ${sessionId} through the session task list.`;
  return [
    '---',
    `created: ${created}`,
    `title: ${oneLine(it.title)}`,
    'area: general',
    'files: []',
    '---',
    '',
    '## Problem',
    '',
    problem,
    '',
    '## Solution',
    '',
    'TBD',
    '',
  ].join('\n');
}

// ─── Finding a session's transcript ──────────────────────────────────────────

/**
 * resolveSessionTranscript(sessionId, {projectsRoot?}) -> {path} | {error, usage?}
 * The main transcript is `<projects root>/<project dir>/<id>.jsonl` (never a subagent's). The root is the argument, else
 * `$CLAUDE_CONFIG_DIR/projects`, else `~/.claude/projects`, read at call time. An id that is not an id, such as the
 * `${CLAUDE_SESSION_ID}` placeholder a host leaves unsubstituted, is refused before anything is searched.
 */
function resolveSessionTranscript(sessionId, opts = {}) {
  const o = isObject(opts) ? opts : {};
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    const shown = typeof sessionId === 'string' ? sessionId : String(sessionId);
    if (/\$\{[^}]*\}/.test(shown)) {
      return { error: `session id was not substituted: ${shown} (pass --transcript <path>, or run this where the session id is known)`, usage: true };
    }
    return { error: `not a session id: ${JSON.stringify(shown)} (pass --transcript <path> for a transcript file)`, usage: true };
  }

  const root = typeof o.projectsRoot === 'string' && o.projectsRoot !== ''
    ? o.projectsRoot
    : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    dirs = [];
  }
  for (const dir of dirs) {
    const candidate = path.join(root, dir, `${sessionId}.jsonl`);
    try {
      if (fs.statSync(candidate).isFile()) return { path: candidate };
    } catch {
      // not in this project directory
    }
  }
  return { error: `transcript not found for session ${sessionId}` };
}

// ─── Git: what is left to commit ─────────────────────────────────────────────

/**
 * The `.md` todo files under `.planning/todos` that git sees as changed, relative to `main`: new, modified, removed and
 * moved. [] when git is missing or `main` is not in a repository; any other git failure is a warning.
 */
function uncommittedTodos(main, warnings) {
  const run = (args) => spawnSync('git', ['-C', main, ...args], { encoding: 'utf8' });
  const status = run(['status', '--porcelain', '-z', '--untracked-files=all', '--', '.planning/todos']);
  if (status.error) {
    if (status.error.code !== 'ENOENT') warnings.push(`could not run git to list uncommitted todos: ${status.error.message}`);
    return [];
  }
  if (status.status !== 0) {
    if (!/not a git repository/i.test(status.stderr || '')) {
      warnings.push(`git status failed, so uncommitted todos are not listed: ${String(status.stderr || '').trim()}`);
    }
    return [];
  }

  const tokens = String(status.stdout).split('\0');
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    found.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      i += 1; // a rename or copy carries its origin as the next token
      if (tokens[i]) found.push(tokens[i]);
    }
  }
  if (found.length === 0) return [];

  // Porcelain paths are relative to the repository root; the commit command takes paths relative to `main`.
  const prefixRun = run(['rev-parse', '--show-prefix']);
  const prefix = prefixRun.status === 0 ? String(prefixRun.stdout).trim() : '';
  const rel = found.map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p));
  return [...new Set(rel)].filter((p) => p.endsWith('.md')).sort();
}

// ─── The sync ────────────────────────────────────────────────────────────────

const unique = (list) => [...new Set(list)];

function sessionIdOfFile(file) {
  const id = path.basename(file, '.jsonl');
  return SESSION_ID_RE.test(id) ? id : null;
}

/** Replay every readable transcript; unreadable ones are warnings. -> { items, read } */
function replayAll(transcripts, warnings) {
  const items = [];
  let read = 0;
  for (const file of transcripts) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      warnings.push(e && e.code === 'ENOENT' ? `transcript not found: ${file}` : `could not read transcript ${file}: ${e && e.message ? e.message : e}`);
      continue;
    }
    read += 1;
    const id = sessionIdOfFile(file);
    for (const item of session.replayTranscript(text).items) items.push({ ...item, session_id: id });
  }
  return { items, read };
}

const stemsOf = (ops, kind) => ops.filter((o) => o.op === kind).map((o) => o.stem);

function summaryProse(added, completed, pendingCommit) {
  const lines = [`added ${added.length}, completed ${completed.length}`];
  if (pendingCommit.length > 0) lines.push(`uncommitted: ${pendingCommit.join(' ')}`);
  return lines.join('\n');
}

/**
 * syncTodos(cwd, {transcripts?, sessionId?, now?, dryRun?, noFlush?, noWait?})
 *
 * Replays each transcript, plans against the archive of the MAIN checkout and applies the plan through the todo verbs.
 * A failed op is a warning and the next op still runs. With nothing to merge it writes nothing and queues nothing.
 *
 * -> { ok, exit, mode, dry_run, transcripts, todo_items, added, completed, skipped, changed_paths, pending_commit,
 *      queued, warnings, prose }
 *    `skipped` is the planner's list of todos left alone, or the string 'no session todos' when no transcript held one.
 *    `queued` counts the GitHub writes queued (store mode; zeros locally). `pending_commit` is, in local mode with
 *    commit_docs on and git present, every changed todo file left to commit; it is [] otherwise and on a dry run.
 */
function syncTodos(cwd, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const main = planningMode.resolveMainRoot(cwd);
  if (!main) {
    return { ok: false, mode: null, error: `no .planning/ directory at or above ${cwd}`, warnings: [], exit: 1 };
  }
  const mode = planningMode.planningMode(main).mode;
  const dryRun = o.dryRun === true;
  const warnings = [];

  const transcripts = unique((Array.isArray(o.transcripts) ? o.transcripts : []).filter((t) => typeof t === 'string' && t !== ''));
  const { items, read } = replayAll(transcripts, warnings);
  const base = { ok: true, exit: 0, mode, dry_run: dryRun, transcripts: read, todo_items: items.length, queued: noQueued(), warnings };

  if (items.length === 0) {
    return { ...base, skipped: NO_TODOS, added: [], completed: [], changed_paths: [], pending_commit: [], prose: '' };
  }

  const plan = planSync(items, readArchive(main));
  if (dryRun) {
    const added = stemsOf(plan.ops, 'add');
    const completed = stemsOf(plan.ops, 'complete');
    return { ...base, skipped: plan.skipped, added, completed, changed_paths: [], pending_commit: [], prose: summaryProse(added, completed, []) };
  }

  const added = [];
  const completed = [];
  const changed = [];
  const queued = noQueued();
  let failed = 0;
  for (const op of plan.ops) {
    const flags = { now: o.now, noFlush: o.noFlush === true, noWait: o.noWait === true };
    let r;
    try {
      r = op.op === 'add'
        ? entity.todoAdd(main, { text: buildTodoText(op.item, { sessionId: o.sessionId, now: o.now }), stem: op.stem, ...flags })
        : entity.todoComplete(main, { stem: op.stem, ...flags });
    } catch (e) {
      r = { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (r.ok === false) {
      failed += 1;
      warnings.push(`${op.op} ${op.stem}: ${r.error || 'failed'}`);
    }
    // A write that reached its flush happened even when the flush then failed: the file is in the archive.
    if (r.ok === false && r.flush === undefined) continue;
    (op.op === 'add' ? added : completed).push(op.stem);
    if (r.rel) changed.push(`.planning/${r.rel}`);
    if (r.from) changed.push(`.planning/${r.from}`);
    if (r.queued) {
      queued.enqueued += Array.isArray(r.queued.enqueued) ? r.queued.enqueued.length : 0;
      queued.coalesced += Array.isArray(r.queued.coalesced) ? r.queued.coalesced.length : 0;
    }
  }

  let pendingCommit = [];
  if (mode === 'local' && loadConfig(main).commit_docs !== false) pendingCommit = uncommittedTodos(main, warnings);

  const result = {
    ...base,
    ok: failed === 0,
    exit: failed === 0 ? 0 : 1,
    skipped: plan.skipped,
    added,
    completed,
    changed_paths: unique(changed),
    pending_commit: pendingCommit,
    queued,
    prose: summaryProse(added, completed, pendingCommit),
  };
  if (failed > 0) result.error = `${failed} of ${plan.ops.length} todo write(s) failed (see the warnings)`;
  return result;
}

module.exports = {
  RANK,
  SESSION_ID_RE,
  normalizeTitle,
  readArchive,
  planSync,
  buildTodoText,
  resolveSessionTranscript,
  syncTodos,
};
