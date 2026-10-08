'use strict';

// todo-sync.test.cjs (TRD 63-02) — merge a session's replayed todos into the durable archive through the existing
// `todo add` / `todo complete` verb functions, in local mode (`.planning/todos/`) and store mode (`aoforge:todo` issues).
//
// Numbering follows the TRD's test list:
//   library, local   1 archive a metadata todo   2 a second sync is a no-op   3 completion parity with `todo complete`
//                    6 pending_commit            9 planSync table             10 title dedupe
//                    11 one stem, furthest status wins   12 readArchive   13 buildTodoText   15 a failing op
//                    17 a missing transcript   18 no planning dir   19 the module writes through the verbs only
//   library, store   14 idempotent queueing, and a flushed add + completion   16 nothing to merge makes no gh call
// Everything is hand-built from todo-transcript-fixtures (63-01) and todo-archive-fixtures (63-02); the store tests copy
// the planning-entity-verbs harness (hermeticEnv, fake GitHub through the gh-client seam, a fake clock).

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sync = require('./todo-sync.cjs');
const session = require('./todo-session.cjs');
const entityVerbs = require('./planning-entity-verbs.cjs');
const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const fx = require('./__fixtures__/todo-transcript-fixtures.cjs');
const af = require('./__fixtures__/todo-archive-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const NOW = Date.UTC(2026, 9, 6, 12, 30, 0); // completed: 2026-10-06
const SESSION = 'sess0001-aaaa';
const STEM = '2026-10-06-add-auth-token-refresh';
const TITLE = 'Add auth token refresh';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cleanups = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

function project(opts) {
  const p = af.makeTodoProject(opts);
  cleanups.push(p.cleanup);
  return p;
}

function scratch() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sync-scratch-')));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A TaskCreate for a marked todo whose identity is the metadata stem. */
const created = (title, stem, { description = '', taskId = 1, at = fx.ts(1) } = {}) =>
  fx.taskCreate({ subject: `Todo: ${title}`, description, metadata: { aoforge_todo: stem }, taskId, ts: at });
const completedUpdate = (taskId, at = fx.ts(30)) => fx.taskUpdate({ taskId, status: 'completed', ts: at });

function transcriptFile(dir, name, ...groups) {
  return af.writeTranscript(dir, name, fx.transcriptOf(...groups));
}

const planningPath = (root, ...rel) => path.join(root, '.planning', ...rel);
const read = (root, ...rel) => fs.readFileSync(planningPath(root, ...rel), 'utf8');
const present = (root, ...rel) => fs.existsSync(planningPath(root, ...rel));

/** An item as `replayTranscript` emits it, for the pure planner tests. */
function item(stem, status, extra = {}) {
  return {
    key: `todowrite:${stem}`,
    source: 'todowrite',
    task_id: null,
    title: `Title of ${stem}`,
    stem,
    stem_source: 'metadata',
    status,
    description: null,
    created_at: '2026-10-06T12:00:01.000Z',
    updated_at: '2026-10-06T12:00:01.000Z',
    ...extra,
  };
}

/** The archive `readArchive` reads from a hand-built project holding `todos`. */
function archiveOf(todos) {
  const p = project({ todos });
  return sync.readArchive(p.root);
}

const opsOf = (plan) => plan.ops.map((o) => `${o.op}:${o.stem}`);

// ─── Library, local mode ─────────────────────────────────────────────────────

describe('63-02 syncTodos in local mode', () => {
  test('1: a metadata todo in the transcript is archived as todos/pending/<stem>.md holding exactly buildTodoText(item)', () => {
    const p = project();
    const text = fx.transcriptOf(created(TITLE, STEM, { description: 'Tokens expire mid-session.' }));
    const t = af.writeTranscript(scratch(), `${SESSION}.jsonl`, text);

    const r = sync.syncTodos(p.root, { transcripts: [t], sessionId: SESSION, now: NOW });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.mode, 'local');
    assert.deepEqual(r.added, [STEM]);
    assert.deepEqual(r.completed, []);
    assert.deepEqual(r.changed_paths, [`.planning/todos/pending/${STEM}.md`]);
    const replayed = session.replayTranscript(text).items[0];
    assert.equal(read(p.root, 'todos', 'pending', `${STEM}.md`), sync.buildTodoText(replayed, { sessionId: SESSION }));
  });

  test('2: a second identical sync adds and completes nothing and leaves the file bytes and mtime alone', () => {
    const p = project();
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM));
    assert.equal(sync.syncTodos(p.root, { transcripts: [t], now: NOW }).ok, true);

    const file = planningPath(p.root, 'todos', 'pending', `${STEM}.md`);
    const aged = new Date('2026-01-01T00:00:00.000Z');
    fs.utimesSync(file, aged, aged);
    const before = fs.readFileSync(file, 'utf8');

    const again = sync.syncTodos(p.root, { transcripts: [t], now: NOW });

    assert.equal(again.ok, true, JSON.stringify(again));
    assert.deepEqual(again.added, []);
    assert.deepEqual(again.completed, []);
    assert.deepEqual(again.changed_paths, []);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.statSync(file).mtimeMs, aged.getTime(), 'the file was not rewritten');
  });

  test('3: a transcript that completes an archived todo moves it to completed/ with the bytes `todo complete` writes', () => {
    const todos = [{ stem: STEM, title: TITLE, state: 'pending' }];
    const viaSync = project({ todos });
    const viaCli = project({ todos });
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM), completedUpdate(1));
    const original = read(viaSync.root, 'todos', 'pending', `${STEM}.md`);

    const r = sync.syncTodos(viaSync.root, { transcripts: [t], now: NOW });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.added, []);
    assert.deepEqual(r.completed, [STEM]);
    assert.equal(present(viaSync.root, 'todos', 'pending', `${STEM}.md`), false);
    assert.equal(read(viaSync.root, 'todos', 'completed', `${STEM}.md`), `completed: 2026-10-06\n${original}`, 'the fixed-clock golden');
    assert.deepEqual([...r.changed_paths].sort(), [`.planning/todos/completed/${STEM}.md`, `.planning/todos/pending/${STEM}.md`]);

    // Byte parity (D-01) with the unchanged local command, run on an identical copy; both read the real date.
    const viaSyncToday = project({ todos });
    assert.equal(sync.syncTodos(viaSyncToday.root, { transcripts: [t] }).ok, true);
    const cli = spawnSync(process.execPath, [DF_TOOLS, 'todo', 'complete', `${STEM}.md`], {
      cwd: viaCli.root,
      encoding: 'utf8',
      env: { ...process.env, HOME: scratch(), NOTIFIER_DISABLE: '1' },
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(read(viaSyncToday.root, 'todos', 'completed', `${STEM}.md`), read(viaCli.root, 'todos', 'completed', `${STEM}.md`));
  });

  test('6: pending_commit lists the new and moved todo paths in a git project, and is empty with commit_docs false or no git', () => {
    const archive = [{ stem: '2026-10-05-old-one', title: 'Old one', state: 'pending' }];
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`,
      created('Old one', '2026-10-05-old-one', { taskId: 1 }), completedUpdate(1),
      created(TITLE, STEM, { taskId: 2, at: fx.ts(5) }));

    const tracked = project({ git: true, todos: archive });
    const r = sync.syncTodos(tracked.root, { transcripts: [t], now: NOW });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([...r.pending_commit].sort(), [
      '.planning/todos/completed/2026-10-05-old-one.md',
      `.planning/todos/pending/${STEM}.md`,
      '.planning/todos/pending/2026-10-05-old-one.md',
    ].sort());
    assert.match(r.prose, /uncommitted: /);

    const noDocs = project({ git: true, commitDocs: false, todos: archive });
    assert.deepEqual(sync.syncTodos(noDocs.root, { transcripts: [t], now: NOW }).pending_commit, []);

    const noGit = project({ todos: archive });
    const plain = sync.syncTodos(noGit.root, { transcripts: [t], now: NOW });
    assert.deepEqual(plain.pending_commit, []);
    assert.deepEqual(plain.warnings, [], 'a project outside git is not a warning');
  });

  test('11: the same todo in two transcripts folds into one op set, in either order, and a rerun is a no-op', () => {
    const dir = scratch();
    const first = transcriptFile(dir, 'sess0001-first.jsonl', created(TITLE, STEM, { at: fx.ts(1) }));
    const second = transcriptFile(dir, 'sess0001-second.jsonl', created(TITLE, STEM, { at: fx.ts(60) }), completedUpdate(1, fx.ts(90)));

    const forward = project();
    const r = sync.syncTodos(forward.root, { transcripts: [first, second], now: NOW });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.added, [STEM]);
    assert.deepEqual(r.completed, [STEM]);
    assert.equal(present(forward.root, 'todos', 'pending', `${STEM}.md`), false);
    assert.equal(present(forward.root, 'todos', 'completed', `${STEM}.md`), true);

    const again = sync.syncTodos(forward.root, { transcripts: [first, second], now: NOW });
    assert.deepEqual([again.added, again.completed, again.changed_paths], [[], [], []]);

    const backward = project();
    assert.equal(sync.syncTodos(backward.root, { transcripts: [second, first], now: NOW }).ok, true);
    assert.equal(
      read(backward.root, 'todos', 'completed', `${STEM}.md`),
      read(forward.root, 'todos', 'completed', `${STEM}.md`),
      'the furthest status wins whatever the transcript order, so the archived bytes agree',
    );
  });

  test('15: one failing op is a warning, the other ops still apply, and the result is ok:false with exit 1', () => {
    const p = project({ todos: [{ stem: '2026-10-05-gone-soon', title: 'Gone soon', state: 'pending' }] });
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`,
      created('Gone soon', '2026-10-05-gone-soon', { taskId: 1 }), completedUpdate(1),
      created(TITLE, STEM, { taskId: 2, at: fx.ts(5) }));

    // Another session completes the todo between planning and the write: the file is gone when todoComplete reads it.
    const realComplete = entityVerbs.todoComplete;
    entityVerbs.todoComplete = (root, opts) => {
      fs.rmSync(planningPath(p.root, 'todos', 'pending', `${opts.stem}.md`), { force: true });
      return realComplete(root, opts);
    };
    let r;
    try {
      r = sync.syncTodos(p.root, { transcripts: [t], now: NOW });
    } finally {
      entityVerbs.todoComplete = realComplete;
    }

    assert.equal(r.ok, false);
    assert.equal(r.exit, 1);
    assert.deepEqual(r.added, [STEM], 'the later add still applied');
    assert.deepEqual(r.completed, []);
    assert.equal(r.warnings.length, 1, JSON.stringify(r.warnings));
    assert.match(r.warnings[0], /^complete 2026-10-05-gone-soon: .*Todo not found/);
    assert.equal(present(p.root, 'todos', 'pending', `${STEM}.md`), true);
  });

  test('17: a transcript path that does not exist is a warning, never an error, and nothing is written', () => {
    const p = project();
    const missing = path.join(scratch(), 'nope.jsonl');

    const r = sync.syncTodos(p.root, { transcripts: [missing], now: NOW });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.deepEqual(r.warnings, [`transcript not found: ${missing}`]);
    assert.equal(r.skipped, 'no session todos');
    assert.equal(present(p.root, 'todos'), false);
  });

  test('18: a directory with no .planning/ above it is a failure naming the problem', () => {
    const r = sync.syncTodos(scratch(), { transcripts: [], now: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 1);
    assert.match(r.error, /no \.planning\/ directory/);
  });

  test('19: todo-sync.cjs writes nothing itself: no direct file write, rename, unlink or rm', () => {
    const source = fs.readFileSync(path.join(__dirname, 'todo-sync.cjs'), 'utf8');
    assert.doesNotMatch(source, /writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|mkdirSync/);
  });
});

// ─── planSync (pure) ─────────────────────────────────────────────────────────

describe('63-02 planSync', () => {
  const none = () => archiveOf([]);
  const holding = (state) => archiveOf([{ stem: 'a', title: 'Title of a', state }]);

  const table = [
    ['absent + pending adds', none, 'pending', ['add:a']],
    ['absent + in_progress adds', none, 'in_progress', ['add:a']],
    ['absent + completed adds then completes', none, 'completed', ['add:a', 'complete:a']],
    ['pending + completed completes', () => holding('pending'), 'completed', ['complete:a']],
    ['pending + pending does nothing', () => holding('pending'), 'pending', []],
    ['pending + in_progress does nothing', () => holding('pending'), 'in_progress', []],
    ['completed + pending is never reopened', () => holding('completed'), 'pending', []],
    ['completed + completed does nothing', () => holding('completed'), 'completed', []],
    ['pending + deleted is never removed', () => holding('pending'), 'deleted', []],
    ['completed + deleted is never removed', () => holding('completed'), 'deleted', []],
  ];
  for (const [name, archive, status, expected] of table) {
    test(`9: ${name}`, () => {
      assert.deepEqual(opsOf(sync.planSync([item('a', status)], archive())), expected);
    });
  }

  test('9: absent + deleted is skipped with the reason, and adds nothing', () => {
    const plan = sync.planSync([item('a', 'deleted', { title: 'Gone before it was kept' })], none());
    assert.deepEqual(plan.ops, []);
    assert.deepEqual(plan.skipped, [{ stem: 'a', title: 'Gone before it was kept', reason: 'deleted in the session before it was archived' }]);
  });

  test('9: a completed todo found in done/ counts as completed', () => {
    const archive = archiveOf([{ stem: 'a', title: 'Title of a', state: 'done' }]);
    assert.deepEqual(opsOf(sync.planSync([item('a', 'pending')], archive)), []);
  });

  test('10: a derived-stem item whose normalized title matches a pending archive todo targets that stem', () => {
    const archive = archiveOf([{ stem: '2026-10-05-fix-flaky-test', title: 'Fix flaky test', state: 'pending' }]);
    const derived = (status) => item('2026-10-06-fix-flaky-test', status, { title: '  fix  FLAKY test ', stem_source: 'derived' });

    assert.deepEqual(opsOf(sync.planSync([derived('pending')], archive)), [], 'no second copy under the new date');
    assert.deepEqual(opsOf(sync.planSync([derived('completed')], archive)), ['complete:2026-10-05-fix-flaky-test']);
  });

  test('10: a metadata-stem item with the same title but a new stem is its own todo and is added', () => {
    const archive = archiveOf([{ stem: '2026-10-05-fix-flaky-test', title: 'Fix flaky test', state: 'pending' }]);
    const plan = sync.planSync([item('2026-10-06-fix-flaky-test', 'pending', { title: 'Fix flaky test' })], archive);
    assert.deepEqual(opsOf(plan), ['add:2026-10-06-fix-flaky-test']);
  });

  test('10: a derived item that matches no archive title is added under its own derived stem; a match in completed/ is already done', () => {
    const archive = archiveOf([{ stem: '2026-10-01-old-job', title: 'Old job', state: 'completed' }]);
    const plan = sync.planSync([
      item('2026-10-06-new-job', 'pending', { title: 'New job', stem_source: 'derived' }),
      item('2026-10-06-old-job', 'pending', { title: 'Old job', stem_source: 'derived' }),
    ], archive);
    assert.deepEqual(opsOf(plan), ['add:2026-10-06-new-job']);
  });

  test('11: two items for one stem make one op set and the furthest status wins, whatever their order', () => {
    const empty = none();
    assert.deepEqual(opsOf(sync.planSync([item('a', 'pending'), item('a', 'completed')], empty)), ['add:a', 'complete:a']);
    assert.deepEqual(opsOf(sync.planSync([item('a', 'completed'), item('a', 'pending')], empty)), ['add:a', 'complete:a']);
    assert.deepEqual(opsOf(sync.planSync([item('a', 'deleted'), item('a', 'in_progress')], empty)), ['add:a']);

    const plan = sync.planSync([item('a', 'pending', { description: 'early' }), item('a', 'completed', { description: 'late' })], empty);
    assert.equal(plan.ops[0].item.status, 'completed', 'the add carries the winning item');
    assert.equal(plan.ops[0].item.description, 'late');
  });

  test('11: ops follow the order the todos first appear in', () => {
    const plan = sync.planSync([item('b', 'pending'), item('a', 'pending'), item('b', 'in_progress')], none());
    assert.deepEqual(opsOf(plan), ['add:b', 'add:a']);
  });

  test('9: an item with no usable stem is left alone', () => {
    assert.deepEqual(sync.planSync([item(null, 'pending'), item('', 'pending')], none()), { ops: [], skipped: [] });
  });
});

// ─── readArchive, buildTodoText, normalizeTitle, resolveSessionTranscript ────

describe('63-02 archive reading and todo text', () => {
  test('12: readArchive reads pending, completed and done files, finds the title of a `completed:`-first file, ignores the rest', () => {
    const p = project({
      todos: [
        { stem: '2026-10-01-alpha', title: 'Alpha', state: 'pending' },
        { stem: '2026-10-02-beta', title: 'Beta', state: 'completed' },
        { stem: '2026-10-03-gamma', title: '"Quoted: gamma"', state: 'done' },
      ],
    });
    fs.writeFileSync(planningPath(p.root, 'todos', 'pending', 'notes.txt'), 'title: Not a todo\n');

    const a = sync.readArchive(p.root);

    assert.deepEqual([...a.pending.keys()], ['2026-10-01-alpha']);
    assert.deepEqual([...a.completed.keys()].sort(), ['2026-10-02-beta', '2026-10-03-gamma']);
    assert.equal(a.pending.get('2026-10-01-alpha').title, 'Alpha');
    assert.equal(a.completed.get('2026-10-02-beta').title, 'Beta');
    assert.equal(a.byTitle.get('alpha').stem, '2026-10-01-alpha');
    assert.equal(a.byTitle.get('alpha').state, 'pending');
    assert.equal(a.byTitle.get('quoted: gamma').state, 'completed', 'the surrounding quotes are not part of the title');
  });

  test('12: a missing todos/ directory reads as an empty archive', () => {
    const a = sync.readArchive(project().root);
    assert.deepEqual([a.pending.size, a.completed.size, a.byTitle.size], [0, 0, 0]);
  });

  test('12: a title shared by a pending and a completed todo resolves to the completed one', () => {
    const a = archiveOf([
      { stem: '2026-10-01-same', title: 'Same', state: 'pending' },
      { stem: '2026-10-02-same', title: 'Same', state: 'completed' },
    ]);
    assert.deepEqual(a.byTitle.get('same'), { stem: '2026-10-02-same', state: 'completed' });
  });

  test('12: a todo file with no title is still listed by its stem and is not findable by title', () => {
    const a = archiveOf([{ stem: '2026-10-01-untitled', title: 'x', state: 'pending', body: 'just text, no frontmatter\n' }]);
    assert.equal(a.pending.has('2026-10-01-untitled'), true);
    assert.equal(a.byTitle.size, 0);
  });

  test('normalizeTitle drops one pair of surrounding quotes, lowercases and collapses whitespace', () => {
    assert.equal(sync.normalizeTitle('  "Fix   the\tThing"  '), 'fix the thing');
    assert.equal(sync.normalizeTitle("'Mixed Case'"), 'mixed case');
    assert.equal(sync.normalizeTitle('plain'), 'plain');
  });

  test('13: buildTodoText of a hand-built item is exactly the golden todo file', () => {
    const text = sync.buildTodoText({ title: TITLE, created_at: '2026-10-06T12:00:01.000Z', description: 'Tokens expire mid-session.' }, { sessionId: SESSION });
    assert.equal(text, [
      '---',
      'created: 2026-10-06T12:00:01.000Z',
      `title: ${TITLE}`,
      'area: general',
      'files: []',
      '---',
      '',
      '## Problem',
      '',
      'Tokens expire mid-session.',
      '',
      '## Solution',
      '',
      'TBD',
      '',
    ].join('\n'));
  });

  test('13: with no description the Problem line names the session id; without an id it says unknown', () => {
    const base = { title: TITLE, created_at: '2026-10-06T12:00:01.000Z', description: null };
    assert.match(sync.buildTodoText(base, { sessionId: SESSION }), /\nCaptured in Claude Code session sess0001-aaaa through the session task list\.\n/);
    assert.match(sync.buildTodoText(base, {}), /session unknown through the session task list\./);
  });

  test('13: a title or description holding newlines is flattened to one line each', () => {
    const text = sync.buildTodoText({ title: 'Two\nline  title', created_at: '2026-10-06T12:00:01.000Z', description: 'first\r\n\nsecond' }, {});
    assert.match(text, /^title: Two line title$/m);
    assert.match(text, /## Problem\n\nfirst second\n/);
  });

  test('13: an item with no created_at is stamped from the supplied clock', () => {
    const text = sync.buildTodoText({ title: TITLE, created_at: null, description: 'x' }, { now: NOW });
    assert.match(text, /^created: 2026-10-06T12:30:00\.000Z$/m);
  });

  test('5 (library): resolveSessionTranscript finds <projects>/<project-dir>/<id>.jsonl and nothing in subagents/', () => {
    const root = af.makeProjectsRoot(SESSION, fx.transcriptOf(created(TITLE, STEM)));
    cleanups.push(root.cleanup);
    fs.mkdirSync(path.join(root.root, '-tmp-scratch-project', 'subagents'));
    fs.writeFileSync(path.join(root.root, '-tmp-scratch-project', 'subagents', 'sess0002-bbbb.jsonl'), '\n');

    assert.deepEqual(sync.resolveSessionTranscript(SESSION, { projectsRoot: root.root }), { path: root.transcript });
    assert.match(sync.resolveSessionTranscript('sess0002-bbbb', { projectsRoot: root.root }).error, /^transcript not found for session sess0002-bbbb$/);
  });

  test('5 (library): an unsubstituted placeholder or a non-id is refused as a usage error before any search', () => {
    const placeholder = sync.resolveSessionTranscript('${CLAUDE_SESSION_ID}', { projectsRoot: scratch() });
    assert.equal(placeholder.usage, true);
    assert.match(placeholder.error, /session id was not substituted: \$\{CLAUDE_SESSION_ID\}/);

    const bad = sync.resolveSessionTranscript('../etc/passwd', { projectsRoot: scratch() });
    assert.equal(bad.usage, true);
    assert.equal(bad.path, undefined);
  });

  test('5 (library): the default projects root is read at call time from CLAUDE_CONFIG_DIR, else ~/.claude', () => {
    const config = scratch();
    fs.mkdirSync(path.join(config, 'projects', '-p'), { recursive: true });
    const file = path.join(config, 'projects', '-p', `${SESSION}.jsonl`);
    fs.writeFileSync(file, '\n');
    const saved = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = config;
    try {
      assert.deepEqual(sync.resolveSessionTranscript(SESSION), { path: file });
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = saved;
    }
  });
});

// ─── Library, store mode ─────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
let S;

function useStoreProject() {
  beforeEach(() => {
    const envh = hermeticEnv();
    const proj = makeStoreProject({ store: true });
    const fake = createFakeGitHub({ ...proj.fakeOptions, types: [
      { id: 1, name: 'Objective', is_enabled: true },
      { id: 2, name: 'TRD', is_enabled: true },
      { id: 3, name: 'Decision', is_enabled: true },
    ] });
    const clock = { t: T0 };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();
    const savedNotifier = process.env.NOTIFIER_DISABLE;
    process.env.NOTIFIER_DISABLE = '1';
    S = { envh, proj, root: proj.root, fake, savedNotifier };
  });
  afterEach(() => {
    client._resetClient();
    if (S.savedNotifier === undefined) delete process.env.NOTIFIER_DISABLE;
    else process.env.NOTIFIER_DISABLE = S.savedNotifier;
    S.envh.restore();
    S.proj.cleanup();
  });
}

const journalOps = (id) => {
  if (!fs.existsSync(outbox.journalPath(S.root))) return [];
  return outbox.readJournal(S.root).journal.ops.filter((op) => op.target && op.target.id === id);
};
const issueOf = (id) => S.fake.issues.find((i) => i.number === mappingLib.getEntity(mappingLib.readMappingV3(S.root), id).issue_number);

describe('63-02 syncTodos in store mode', () => {
  useStoreProject();

  test('14: a sync add queues one upsert-issue for todo-<stem> with role todo; a completion queues the close; a rerun queues nothing new', () => {
    const dir = scratch();
    const id = `todo-${STEM}`;
    const open = transcriptFile(dir, 'sess0001-open.jsonl', created(TITLE, STEM));
    const shut = transcriptFile(dir, 'sess0001-shut.jsonl', created(TITLE, STEM), completedUpdate(1));

    const added = sync.syncTodos(S.root, { transcripts: [open], now: NOW, noFlush: true });
    assert.equal(added.ok, true, JSON.stringify(added));
    assert.equal(added.mode, 'store');
    assert.deepEqual(added.added, [STEM]);
    assert.equal(added.queued.enqueued, 1);
    assert.deepEqual(added.pending_commit, [], 'store mode commits nothing: .planning/ is a cache');
    const upserts = journalOps(id).filter((op) => op.kind === 'upsert-issue');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].target.role, 'todo');
    assert.ok(upserts[0].payload.labels.includes('aoforge:todo'));

    const calls = S.fake.calls().length;
    const again = sync.syncTodos(S.root, { transcripts: [open], now: NOW, noFlush: true });
    assert.deepEqual([again.added, again.completed, again.queued.enqueued], [[], [], 0]);
    assert.equal(journalOps(id).length, 1, 'the second sync queued nothing');
    assert.equal(S.fake.calls().length, calls, 'and made no gh call');

    const closed = sync.syncTodos(S.root, { transcripts: [shut], now: NOW, noFlush: true });
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.deepEqual(closed.completed, [STEM]);
    const kinds = journalOps(id).map((op) => op.kind);
    assert.ok(kinds.includes('upsert-issue'), kinds.join());
    assert.ok(kinds.includes('patch-issue'), `a close is queued: ${kinds.join()}`);

    const settled = journalOps(id).length;
    const last = sync.syncTodos(S.root, { transcripts: [open, shut], now: NOW, noFlush: true });
    assert.deepEqual([last.added, last.completed], [[], []]);
    assert.equal(journalOps(id).length, settled, 'a completed todo is never reopened or re-queued');
  });

  test('14: a flushed sync of a finished todo leaves a closed aoforge:todo issue, and the rerun makes no gh call', () => {
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM), completedUpdate(1));

    const r = sync.syncTodos(S.root, { transcripts: [t], now: NOW });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.added, [STEM]);
    assert.deepEqual(r.completed, [STEM]);
    const issue = issueOf(`todo-${STEM}`);
    assert.ok(issue.labels.includes('aoforge:todo'));
    assert.equal(issue.state, 'CLOSED');
    assert.equal(issue.stateReason, 'completed');
    assert.equal(fs.existsSync(planningPath(S.root, 'todos', 'completed', `${STEM}.md`)), true);

    const calls = S.fake.calls().length;
    const again = sync.syncTodos(S.root, { transcripts: [t], now: NOW });
    assert.deepEqual([again.added, again.completed], [[], []]);
    assert.equal(S.fake.calls().length, calls);
  });

  test('16: a transcript with no todo items returns the skipped result, writes nothing and makes no gh call', () => {
    const t = af.writeTranscript(scratch(), `${SESSION}.jsonl`, fx.transcriptOf(fx.userText('hello'), fx.assistantText('hi')));

    const r = sync.syncTodos(S.root, { transcripts: [t], now: NOW });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.skipped, 'no session todos');
    assert.deepEqual([r.added, r.completed, r.changed_paths, r.pending_commit], [[], [], [], []]);
    assert.equal(r.todo_items, 0);
    assert.equal(S.fake.calls().length, 0);
    assert.equal(fs.existsSync(outbox.journalPath(S.root)), false);
    assert.equal(fs.existsSync(planningPath(S.root, 'todos')), false);
  });

  test('4 (library): a dry run reports the same added and completed lists and writes and queues nothing', () => {
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM), completedUpdate(1));

    const r = sync.syncTodos(S.root, { transcripts: [t], now: NOW, dryRun: true });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.dry_run, true);
    assert.deepEqual(r.added, [STEM]);
    assert.deepEqual(r.completed, [STEM]);
    assert.deepEqual(r.changed_paths, []);
    assert.equal(S.fake.calls().length, 0);
    assert.equal(fs.existsSync(planningPath(S.root, 'todos')), false);
    assert.equal(fs.existsSync(outbox.journalPath(S.root)), false);
  });
});

// ─── The CLI: aof-tools todo sync ─────────────────────────────────────────────

/** Run aof-tools in `root` with a hermetic HOME and no inherited config dir. */
function cli(root, args) {
  const env = { ...process.env, HOME: scratch(), NOTIFIER_DISABLE: '1' };
  delete env.CLAUDE_CONFIG_DIR;
  return spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd: root, encoding: 'utf8', env });
}

const syncRaw = (root, args) => {
  const r = cli(root, ['todo', 'sync', ...args, '--raw']);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  return { r, json };
};

describe('63-02 aof-tools todo sync', () => {
  test('1: --transcript archives a metadata todo as todos/pending/<stem>.md holding exactly buildTodoText(item)', () => {
    const p = project();
    const text = fx.transcriptOf(created(TITLE, STEM, { description: 'Tokens expire mid-session.' }));
    const t = af.writeTranscript(scratch(), `${SESSION}.jsonl`, text);

    const { r, json } = syncRaw(p.root, ['--transcript', t]);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(json.added, [STEM]);
    assert.deepEqual(json.completed, []);
    const replayed = session.replayTranscript(text).items[0];
    assert.equal(read(p.root, 'todos', 'pending', `${STEM}.md`), sync.buildTodoText(replayed, { sessionId: SESSION }));
  });

  test('2: the same command again exits 0, adds and completes nothing, and leaves the file bytes and mtime alone', () => {
    const p = project();
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM));
    assert.equal(syncRaw(p.root, ['--transcript', t]).r.status, 0);
    const file = planningPath(p.root, 'todos', 'pending', `${STEM}.md`);
    const aged = new Date('2026-01-01T00:00:00.000Z');
    fs.utimesSync(file, aged, aged);
    const before = fs.readFileSync(file, 'utf8');

    const { r, json } = syncRaw(p.root, ['--transcript', t]);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual([json.added, json.completed], [[], []]);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.statSync(file).mtimeMs, aged.getTime());
  });

  test('3: a transcript that completes an archived todo moves the file to completed/ with the bytes `todo complete` writes', () => {
    const todos = [{ stem: STEM, title: TITLE, state: 'pending' }];
    const viaSync = project({ todos });
    const viaComplete = project({ todos });
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM), completedUpdate(1));

    const { r, json } = syncRaw(viaSync.root, ['--transcript', t]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(json.completed, [STEM]);
    const done = cli(viaComplete.root, ['todo', 'complete', `${STEM}.md`]);
    assert.equal(done.status, 0, done.stderr);

    assert.equal(present(viaSync.root, 'todos', 'pending', `${STEM}.md`), false);
    assert.equal(read(viaSync.root, 'todos', 'completed', `${STEM}.md`), read(viaComplete.root, 'todos', 'completed', `${STEM}.md`));
  });

  test('4: --dry-run reports the same added and completed lists and writes nothing', () => {
    const p = project();
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM), completedUpdate(1));

    const dry = syncRaw(p.root, ['--transcript', t, '--dry-run']);

    assert.equal(dry.r.status, 0, dry.r.stderr);
    assert.equal(dry.json.dry_run, true);
    assert.deepEqual([dry.json.added, dry.json.completed], [[STEM], [STEM]]);
    assert.equal(present(p.root, 'todos'), false, 'nothing was written');

    const real = syncRaw(p.root, ['--transcript', t]);
    assert.deepEqual([real.json.added, real.json.completed], [dry.json.added, dry.json.completed], 'the real run does what the dry run said');
  });

  test('5: --session <id> --projects-root <dir> finds <dir>/<project-dir>/<id>.jsonl', () => {
    const p = project();
    const found = af.makeProjectsRoot(SESSION, fx.transcriptOf(created(TITLE, STEM)));
    cleanups.push(found.cleanup);

    const { r, json } = syncRaw(p.root, ['--session', SESSION, '--projects-root', found.root]);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(json.added, [STEM]);
    assert.match(read(p.root, 'todos', 'pending', `${STEM}.md`), /^title: Add auth token refresh$/m);
  });

  test('5: an unsubstituted ${CLAUDE_SESSION_ID} exits 1 naming the placeholder; an unknown id exits 1 saying the transcript is not found', () => {
    const p = project();
    const found = af.makeProjectsRoot(SESSION, fx.transcriptOf(created(TITLE, STEM)));
    cleanups.push(found.cleanup);

    const placeholder = cli(p.root, ['todo', 'sync', '--session', '${CLAUDE_SESSION_ID}', '--projects-root', found.root]);
    assert.equal(placeholder.status, 1);
    assert.match(placeholder.stderr, /session id was not substituted: \$\{CLAUDE_SESSION_ID\}/);

    const unknown = cli(p.root, ['todo', 'sync', '--session', 'sess9999-zzzz', '--projects-root', found.root]);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /transcript not found for session sess9999-zzzz/);
    assert.equal(present(p.root, 'todos'), false);
  });

  test('6: pending_commit lists the new and moved todo paths in a git project with commit_docs true, and is [] with commit_docs false', () => {
    const archive = [{ stem: '2026-10-05-old-one', title: 'Old one', state: 'pending' }];
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`,
      created('Old one', '2026-10-05-old-one', { taskId: 1 }), completedUpdate(1),
      created(TITLE, STEM, { taskId: 2, at: fx.ts(5) }));

    const on = project({ git: true, todos: archive });
    const listed = syncRaw(on.root, ['--transcript', t]);
    assert.equal(listed.r.status, 0, listed.r.stderr);
    assert.deepEqual([...listed.json.pending_commit].sort(), [
      '.planning/todos/completed/2026-10-05-old-one.md',
      '.planning/todos/pending/2026-10-05-old-one.md',
      `.planning/todos/pending/${STEM}.md`,
    ].sort());

    const off = project({ git: true, commitDocs: false, todos: archive });
    assert.deepEqual(syncRaw(off.root, ['--transcript', t]).json.pending_commit, []);
  });

  test('7: human output is one headline, `added N, completed M`, and the pending-commit paths', () => {
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM));

    const tracked = project({ git: true });
    const out = cli(tracked.root, ['todo', 'sync', '--transcript', t]);
    assert.equal(out.status, 0, out.stderr);
    const lines = out.stdout.trimEnd().split('\n');
    assert.match(lines[0], /^todo sync: /);
    assert.equal(lines[1], 'added 1, completed 0');
    assert.equal(lines[2], `uncommitted: .planning/todos/pending/${STEM}.md`);
    assert.equal(lines.length, 3, out.stdout);

    const plain = project();
    const noGit = cli(plain.root, ['todo', 'sync', '--transcript', t]);
    assert.equal(noGit.status, 0, noGit.stderr);
    assert.deepEqual(noGit.stdout.trimEnd().split('\n').slice(1), ['added 1, completed 0']);
  });

  test('7: with nothing to merge the headline says so and nothing is written', () => {
    const p = project();
    const t = af.writeTranscript(scratch(), `${SESSION}.jsonl`, fx.transcriptOf(fx.userText('hello')));

    const out = cli(p.root, ['todo', 'sync', '--transcript', t]);

    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.trimEnd(), 'todo sync: nothing to do (no session todos).');
    assert.equal(present(p.root, 'todos'), false);
  });

  test('7: a failed write prints the warning and the error on stderr and exits 1', () => {
    const p = project();
    // A directory where the todo file must go: the add cannot write, and the sync says so instead of throwing.
    fs.mkdirSync(planningPath(p.root, 'todos', 'pending', `${STEM}.md`), { recursive: true });
    const t = transcriptFile(scratch(), `${SESSION}.jsonl`, created(TITLE, STEM));

    const out = cli(p.root, ['todo', 'sync', '--transcript', t]);

    assert.equal(out.status, 1, out.stdout);
    assert.match(out.stderr, /Warning: add /);
    assert.match(out.stderr, /Error: 1 of 1 todo write\(s\) failed/);
  });

  test('8: --transcript may repeat, and the --flag=value spelling works', () => {
    const p = project();
    const dir = scratch();
    const one = transcriptFile(dir, 'sess0001-one.jsonl', created('First thing', '2026-10-06-first-thing'));
    const two = transcriptFile(dir, 'sess0001-two.jsonl', created('Second thing', '2026-10-06-second-thing'));

    const { r, json } = syncRaw(p.root, ['--transcript', one, `--transcript=${two}`]);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual([...json.added].sort(), ['2026-10-06-first-thing', '2026-10-06-second-thing']);
    assert.equal(json.transcripts, 2);
  });

  test('8: no --transcript and no --session is a usage error naming both', () => {
    const p = project();
    const out = cli(p.root, ['todo', 'sync']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /usage: aof-tools todo sync \(--transcript <path>\.\.\. \| --session <id>\)/);
  });

  test('8: todo add and todo complete print and write what they always did; an unknown subcommand lists add, complete, sync', () => {
    const p = project();
    const draft = af.writeTranscript(scratch(), 'todo.md', af.todoFileText({ title: 'Fix thing', created: '2026-10-06T10:00:00.000Z' }));

    const add = cli(p.root, ['todo', 'add', '--from', draft, '--stem', 'fix-thing']);
    assert.equal(add.status, 0, add.stderr);
    assert.equal(add.stdout.trimEnd(), 'todo add: wrote .planning/todos/pending/fix-thing.md (local mode).');
    assert.equal(read(p.root, 'todos', 'pending', 'fix-thing.md'), fs.readFileSync(draft, 'utf8'));

    const complete = cli(p.root, ['todo', 'complete', 'fix-thing']);
    assert.equal(complete.status, 0, complete.stderr);
    assert.equal(present(p.root, 'todos', 'completed', 'fix-thing.md'), true);

    const bogus = cli(p.root, ['todo', 'bogus']);
    assert.equal(bogus.status, 1);
    assert.match(bogus.stderr, /Unknown todo subcommand: bogus\. Available: add, complete, sync/);
  });

  test('8: the help for todo names the sync form', () => {
    const p = project();
    const out = cli(p.root, ['todo', '--help']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /todo sync \(--transcript <path>\.\.\. \| --session <id>\) \[--projects-root <dir>\] \[--dry-run\] \[--no-flush\] \[--no-wait\]/);
    assert.match(out.stdout, /merge a session's task-list todos into the archive/);
  });
});
