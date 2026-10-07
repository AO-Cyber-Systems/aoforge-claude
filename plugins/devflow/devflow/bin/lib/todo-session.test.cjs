'use strict';

// todo-session.test.cjs (TRD 63-01) — the replay contract: a Claude Code session transcript in, the session's
// DevFlow todo items out. Cassette tests replay recordings of the real host (Claude Code 2.1.292) and skip, saying
// so, when a cassette file is absent; every other case is hand-built from the fixture builders.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const session = require('./todo-session.cjs');
const ev = require('./planning-entity-verbs.cjs');
const fx = require('./__fixtures__/todo-transcript-fixtures.cjs');

const replay = (...groups) => session.replayTranscript(fx.transcriptOf(...groups));
const todoEntry = (content, status = 'pending') => ({ content, status, activeForm: 'Working' });
const DAY = 24 * 60 * 60;

function cassetteTest(name, file, body) {
  test(name, (t) => {
    if (!fs.existsSync(file)) {
      t.skip('cassette not recorded');
      return;
    }
    body(fs.readFileSync(file, 'utf8'));
  });
}

/** The stem `todo add` gives `text` at `iso`, asked of the real verb in a bare local project. */
function todoAddStem(text, iso) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-session-ref-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    const r = ev.todoAdd(dir, { text, now: Date.parse(iso) });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.stem;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('63-01 host contract: recorded cassettes', () => {
  cassetteTest('1: the task-tools cassette replays to the one marked todo, completed; the unmarked task is not an item', fx.CASSETTES.taskTools, (text) => {
    const { items, stats } = session.replayTranscript(text);
    assert.equal(items.length, 1, JSON.stringify(items));
    assert.equal(items[0].title, 'Probe alpha');
    assert.equal(items[0].stem, '2026-10-06-probe-alpha');
    assert.equal(items[0].stem_source, 'metadata');
    assert.equal(items[0].status, 'completed');
    assert.equal(items[0].task_id, '1');
    assert.equal(stats.task_creates, 2);
    assert.equal(stats.task_updates, 1);
    assert.equal(stats.unresolved_uses, 0);
    assert.equal(stats.errors_skipped, 0);
    assert.equal(stats.unknown_task_updates, 0);
  });

  cassetteTest('2: the TodoWrite cassette replays to the one suffixed todo, completed; the plan item is not an item', fx.CASSETTES.todoWrite, (text) => {
    const { items, stats } = session.replayTranscript(text);
    assert.equal(items.length, 1, JSON.stringify(items));
    assert.equal(items[0].title, 'Probe gamma');
    assert.equal(items[0].stem, '2026-10-06-probe-gamma');
    assert.equal(items[0].stem_source, 'subject');
    assert.equal(items[0].status, 'completed');
    assert.equal(items[0].source, 'todowrite');
    assert.equal(stats.todowrites, 2);
    assert.equal(stats.unresolved_uses, 0);
  });
});

describe('63-01 task tools (TaskCreate / TaskUpdate)', () => {
  test('3: a TaskCreate with metadata.devflow_todo gives one pending item with the id and time of its result', () => {
    fx.resetIds();
    const group = fx.taskCreate({
      subject: 'Todo: Add auth token refresh',
      description: 'Wire the refresh endpoint',
      metadata: { devflow_todo: '2026-10-06-add-auth-token-refresh' },
      taskId: 1,
      ts: fx.ts(5),
    });
    const { items, stats } = replay(group);
    assert.deepEqual(items, [
      {
        key: 'task:1',
        source: 'task',
        task_id: '1',
        title: 'Add auth token refresh',
        stem: '2026-10-06-add-auth-token-refresh',
        stem_source: 'metadata',
        status: 'pending',
        description: 'Wire the refresh endpoint',
        created_at: group[1].timestamp,
        updated_at: group[1].timestamp,
      },
    ]);
    assert.notEqual(group[0].timestamp, group[1].timestamp, 'the call and its result carry different timestamps');
    assert.equal(stats.task_creates, 1);
  });

  test('4: a todo with no metadata and no suffix gets <UTC date of the record>-<slug>; replaying twice is identical', () => {
    fx.resetIds();
    const text = fx.transcriptOf(fx.taskCreate({ subject: 'Todo: Fix the modal z-index', taskId: 1, ts: fx.ts(1) }));
    const first = session.replayTranscript(text);
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].stem, `${new Date(fx.T0).toISOString().slice(0, 10)}-fix-the-modal-z-index`);
    assert.equal(first.items[0].stem, '2026-10-06-fix-the-modal-z-index');
    assert.equal(first.items[0].stem_source, 'derived');
    assert.equal(first.items[0].description, null, 'an empty description is null');
    assert.deepEqual(session.replayTranscript(text), first);
  });

  test('5: tasks that are not DevFlow todos give no items: Plan:, Micro:, and a lowercase todo: prefix', () => {
    fx.resetIds();
    const { items, stats } = replay(
      fx.taskCreate({ subject: 'Plan: X', taskId: 1, ts: fx.ts(1) }),
      fx.taskCreate({ subject: 'Micro: fix typo', taskId: 2, ts: fx.ts(2) }),
      fx.taskCreate({ subject: 'todo: lowercase prefix', taskId: 3, ts: fx.ts(3) }),
    );
    assert.deepEqual(items, []);
    assert.equal(stats.task_creates, 3);
  });

  test('6: TaskUpdate in_progress then completed moves the item; updated_at is the last applied result', () => {
    fx.resetIds();
    const create = fx.taskCreate({ subject: 'Todo: Ship it', taskId: 1, ts: fx.ts(0) });
    const started = fx.taskUpdate({ taskId: 1, status: 'in_progress', ts: fx.ts(10) });
    const done = fx.taskUpdate({ taskId: 1, status: 'completed', ts: fx.ts(20) });

    const mid = replay(create, started);
    assert.equal(mid.items[0].status, 'in_progress');
    assert.equal(mid.items[0].updated_at, started[1].timestamp);

    const end = replay(create, started, done);
    assert.equal(end.items.length, 1);
    assert.equal(end.items[0].status, 'completed');
    assert.equal(end.items[0].updated_at, done[1].timestamp);
    assert.equal(end.items[0].created_at, create[1].timestamp, 'created_at is not touched by an update');
  });

  test('7: a TaskUpdate keyed taskId, id or task_id, with a numeric or string id, is applied', () => {
    for (const [idKey, taskId] of [['taskId', 3], ['id', '3'], ['task_id', 3], ['id', 3], ['taskId', '3']]) {
      fx.resetIds();
      const { items, stats } = replay(
        fx.taskCreate({ subject: 'Todo: Keyed update', taskId: 3, ts: fx.ts(0) }),
        fx.taskUpdate({ taskId, idKey, status: 'completed', ts: fx.ts(5) }),
      );
      assert.equal(items[0].status, 'completed', `${idKey}=${JSON.stringify(taskId)}`);
      assert.equal(stats.unknown_task_updates, 0, `${idKey}=${JSON.stringify(taskId)}`);
    }
  });

  test('8: a TaskUpdate to deleted sets status deleted and the item stays in the output', () => {
    fx.resetIds();
    const { items } = replay(
      fx.taskCreate({ subject: 'Todo: Drop me', taskId: 1, ts: fx.ts(0) }),
      fx.taskUpdate({ taskId: 1, status: 'deleted', ts: fx.ts(5) }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'deleted');
    assert.equal(items[0].title, 'Drop me');
  });

  test('9: a TaskUpdate subject change keeps the stem and the title the task was created with', () => {
    fx.resetIds();
    const { items } = replay(
      fx.taskCreate({ subject: 'Todo: Original title', taskId: 1, ts: fx.ts(0) }),
      fx.taskUpdate({ taskId: 1, subject: 'Todo: A completely new title', ts: fx.ts(5) }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Original title');
    assert.equal(items[0].stem, '2026-10-06-original-title');
    assert.equal(items[0].status, 'pending');
  });

  test('10: a TaskUpdate for an id no TaskCreate here produced is ignored and counted', () => {
    fx.resetIds();
    const { items, stats } = replay(
      fx.taskCreate({ subject: 'Todo: Known', taskId: 1, ts: fx.ts(0) }),
      fx.taskUpdate({ taskId: 99, status: 'completed', ts: fx.ts(5) }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'pending');
    assert.equal(stats.unknown_task_updates, 1);
  });

  test('11: the disabled-tool TaskCreate (is_error result) gives no item and is counted', () => {
    fx.resetIds();
    const { items, stats } = replay(fx.taskCreateDisabled({ subject: 'Todo: Never made', ts: fx.ts(0) }));
    assert.deepEqual(items, []);
    assert.equal(stats.errors_skipped, 1);
    assert.equal(stats.task_creates, 1);
  });

  test('12: a call with no result line (a transcript cut at Stop) is not applied and is counted as unresolved', () => {
    fx.resetIds();
    const { items, stats } = replay(
      fx.taskCreate({ subject: 'Todo: Has a result', taskId: 1, ts: fx.ts(0) }),
      fx.taskCreate({ subject: 'Todo: Cut off', taskId: 2, ts: fx.ts(1), withResult: false }),
      fx.taskUpdate({ taskId: 1, status: 'completed', ts: fx.ts(2), withResult: false }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Has a result');
    assert.equal(items[0].status, 'pending', 'the update without a result did not take effect');
    assert.equal(stats.unresolved_uses, 2);
  });

  test('13: sidechain records are ignored and their task calls counted', () => {
    fx.resetIds();
    const { items, stats } = replay(
      fx.taskCreate({ subject: 'Todo: Main thread', taskId: 1, ts: fx.ts(0) }),
      fx.taskCreate({ subject: 'Todo: Subagent task', taskId: 2, ts: fx.ts(1), sidechain: true }),
      fx.taskUpdate({ taskId: 1, status: 'completed', ts: fx.ts(2), sidechain: true }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Main thread');
    assert.equal(items[0].status, 'pending');
    assert.equal(stats.sidechain_skipped, 2);
    assert.equal(stats.task_creates, 1, 'sidechain calls are not counted as the session\'s own');
  });

  test('14: an invalid metadata stem falls back to the subject suffix, then to the derived stem', () => {
    fx.resetIds();
    const withSuffix = replay(fx.taskCreate({ subject: 'Todo: Foo [todo:2026-10-06-foo]', metadata: { devflow_todo: '../etc' }, taskId: 1, ts: fx.ts(0) }));
    assert.equal(withSuffix.items[0].stem, '2026-10-06-foo');
    assert.equal(withSuffix.items[0].stem_source, 'subject');
    assert.equal(withSuffix.items[0].title, 'Foo');

    for (const bad of ['x/y', '', '../etc']) {
      const r = replay(fx.taskCreate({ subject: 'Todo: Foo', metadata: { devflow_todo: bad }, taskId: 1, ts: fx.ts(0) }));
      assert.equal(r.items.length, 1, `metadata ${JSON.stringify(bad)} still marks a todo`);
      assert.equal(r.items[0].stem, '2026-10-06-foo', JSON.stringify(bad));
      assert.equal(r.items[0].stem_source, 'derived', JSON.stringify(bad));
    }
  });

  test('24: a TaskUpdate whose result says success false did not take effect and is counted', () => {
    fx.resetIds();
    const failed = fx.taskUpdate({ taskId: 1, status: 'completed', ts: fx.ts(5) });
    failed[1].toolUseResult = { success: false, taskId: '1', updatedFields: [], error: 'Task not found' };
    const { items, stats } = replay(fx.taskCreate({ subject: 'Todo: Stays pending', taskId: 1, ts: fx.ts(0) }), failed);
    assert.equal(items[0].status, 'pending');
    assert.equal(stats.errors_skipped, 1);
  });

  test('25: without the structured result the id is read from the observed "Task #<id> created successfully" text', () => {
    fx.resetIds();
    const bare = fx.taskCreate({ subject: 'Todo: Text only', taskId: 7, ts: fx.ts(0) });
    delete bare[1].toolUseResult;
    const read = replay(bare, fx.taskUpdate({ taskId: 7, status: 'completed', ts: fx.ts(5) }));
    assert.equal(read.items.length, 1);
    assert.equal(read.items[0].task_id, '7');
    assert.equal(read.items[0].status, 'completed');

    const unreadable = fx.taskCreate({ subject: 'Todo: No id anywhere', taskId: 8, ts: fx.ts(0) });
    delete unreadable[1].toolUseResult;
    unreadable[1].message.content[0].content = 'created';
    const lost = replay(unreadable);
    assert.deepEqual(lost.items, []);
    assert.equal(lost.stats.unresolved_uses, 1);
  });

  test('26: the stream spelling tool_use_result is read like toolUseResult', () => {
    fx.resetIds();
    const group = fx.taskCreate({ subject: 'Todo: Stream spelling', taskId: 1, ts: fx.ts(0) });
    group[1].tool_use_result = group[1].toolUseResult;
    delete group[1].toolUseResult;
    const { items } = replay(group);
    assert.equal(items.length, 1);
    assert.equal(items[0].task_id, '1');
  });
});

describe('63-01 TodoWrite', () => {
  const GAMMA = 'Todo: Probe gamma [todo:2026-10-06-probe-gamma]';

  test('15: a suffixed todo keeps its stem; a later snapshot with the same content completed completes it', () => {
    fx.resetIds();
    const first = fx.todoWrite({ todos: [todoEntry(GAMMA, 'pending'), todoEntry('Plan: probe delta', 'in_progress')], ts: fx.ts(0) });
    const second = fx.todoWrite({ todos: [todoEntry(GAMMA, 'completed'), todoEntry('Plan: probe delta', 'in_progress')], ts: fx.ts(30) });

    const early = replay(first);
    assert.equal(early.items.length, 1);
    assert.equal(early.items[0].stem, '2026-10-06-probe-gamma');
    assert.equal(early.items[0].stem_source, 'subject');
    assert.equal(early.items[0].status, 'pending');
    assert.equal(early.items[0].title, 'Probe gamma');

    const late = replay(first, second);
    assert.equal(late.items.length, 1);
    assert.equal(late.items[0].status, 'completed');
    assert.equal(late.items[0].created_at, first[1].timestamp);
    assert.equal(late.items[0].updated_at, second[1].timestamp);
  });

  test('16: the result newTodos is used when present, and input.todos when the result has none', () => {
    fx.resetIds();
    const fromResult = fx.todoWrite({ todos: [todoEntry('Todo: From input')], ts: fx.ts(0) });
    fromResult[1].toolUseResult.newTodos = [todoEntry('Todo: From result')];
    assert.deepEqual(replay(fromResult).items.map((i) => i.title), ['From result']);

    const fromInput = fx.todoWrite({ todos: [todoEntry('Todo: From input')], ts: fx.ts(0), resultHasNewTodos: false });
    assert.deepEqual(replay(fromInput).items.map((i) => i.title), ['From input']);
  });

  test('17: an item present in one snapshot and absent from the next becomes deleted', () => {
    fx.resetIds();
    const keep = 'Todo: Keep me [todo:2026-10-06-keep-me]';
    const drop = 'Todo: Drop me [todo:2026-10-06-drop-me]';
    const one = fx.todoWrite({ todos: [todoEntry(keep), todoEntry(drop)], ts: fx.ts(0) });
    const two = fx.todoWrite({ todos: [todoEntry(keep)], ts: fx.ts(10) });
    const { items } = replay(one, two);
    assert.deepEqual(items.map((i) => [i.stem, i.status]), [['2026-10-06-keep-me', 'pending'], ['2026-10-06-drop-me', 'deleted']]);
    assert.equal(items[1].updated_at, two[1].timestamp);

    const three = fx.todoWrite({ todos: [todoEntry(keep), todoEntry(drop)], ts: fx.ts(20) });
    const back = replay(one, two, three).items;
    assert.equal(back.length, 2);
    assert.equal(back[1].status, 'pending', 'an item written again after a deletion is live again');
  });

  test('18: content without a suffix gets a derived stem from the first snapshot that held it', () => {
    fx.resetIds();
    const one = fx.todoWrite({ todos: [todoEntry('Todo: Write the docs')], ts: fx.ts(0) });
    const two = fx.todoWrite({ todos: [todoEntry('Todo: Write the docs', 'completed')], ts: fx.ts(2 * DAY) });
    assert.notEqual(one[1].timestamp.slice(0, 10), two[1].timestamp.slice(0, 10), 'the snapshots are on different UTC days');
    const { items } = replay(one, two);
    assert.equal(items.length, 1);
    assert.equal(items[0].stem, '2026-10-06-write-the-docs');
    assert.equal(items[0].stem_source, 'derived');
    assert.equal(items[0].status, 'completed');
    assert.equal(items[0].created_at, one[1].timestamp);
  });

  test('19: a rename that keeps the [todo:<stem>] suffix is the same item with the new title', () => {
    fx.resetIds();
    const { items } = replay(
      fx.todoWrite({ todos: [todoEntry('Todo: Old title [todo:2026-10-06-thing]')], ts: fx.ts(0) }),
      fx.todoWrite({ todos: [todoEntry('Todo: New title [todo:2026-10-06-thing]')], ts: fx.ts(5) }),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'New title');
    assert.equal(items[0].stem, '2026-10-06-thing');
  });
});

describe('63-01 both families and robustness', () => {
  test('20: a transcript with both families gives items from each, in order of first appearance', () => {
    fx.resetIds();
    const { items, stats } = replay(
      fx.taskCreate({ subject: 'Todo: First via tasks', taskId: 1, ts: fx.ts(0) }),
      fx.todoWrite({ todos: [todoEntry('Todo: Second via TodoWrite')], ts: fx.ts(10) }),
      fx.taskCreate({ subject: 'Todo: Third via tasks', taskId: 2, ts: fx.ts(20) }),
    );
    assert.deepEqual(items.map((i) => [i.source, i.title]), [
      ['task', 'First via tasks'],
      ['todowrite', 'Second via TodoWrite'],
      ['task', 'Third via tasks'],
    ]);
    assert.equal(stats.task_creates, 2);
    assert.equal(stats.todowrites, 1);
  });

  test('21: replayTranscript never throws and returns empty items for malformed or odd input', () => {
    const odd = [
      '',
      'null',
      '[]',
      '42',
      '"just a string"',
      'not json at all\n{broken',
      JSON.stringify({ type: 'assistant' }),
      JSON.stringify({ type: 'assistant', message: null }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'a string, not blocks' } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'a prompt' } }),
      JSON.stringify({ type: 'assistant', message: { content: [null, 7, 'x', { type: 'tool_use' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_x', name: 'TaskCreate', input: null }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'ok' }] }, toolUseResult: null }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_y', name: 'TodoWrite', input: { todos: 'nope' } }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_y', content: 'ok' }] }, toolUseResult: { newTodos: [null, 3, { content: 5 }] } }),
    ];
    for (const text of odd) {
      let r;
      assert.doesNotThrow(() => { r = session.replayTranscript(text); }, JSON.stringify(text));
      assert.deepEqual(r.items, [], JSON.stringify(text));
      assert.equal(typeof r.stats, 'object', JSON.stringify(text));
    }
    assert.equal(session.replayTranscript(odd.join('\n')).items.length, 0, 'all of it together');
    for (const notText of [undefined, null, 42, {}, []]) {
      assert.deepEqual(session.replayTranscript(notText).items, [], `non-string ${JSON.stringify(notText)}`);
    }
  });

  test('27: noise records around real calls are skipped and malformed lines are counted', () => {
    fx.resetIds();
    const text = fx.transcriptOf(
      fx.userText('please add a todo', fx.ts(0)),
      fx.attachment(fx.ts(1)),
      fx.assistantText('On it.', fx.ts(2)),
      fx.taskCreate({ subject: 'Todo: Real one', taskId: 1, ts: fx.ts(3) }),
    ) + 'this line is not json\n';
    const { items, stats } = session.replayTranscript(text);
    assert.equal(items.length, 1);
    assert.equal(stats.malformed_lines, 1);
    assert.equal(stats.records, 6);
    assert.equal(stats.task_creates, 1);
  });

  test('28: a todo whose record has no usable timestamp has no stable stem, so it is skipped and counted', () => {
    fx.resetIds();
    const group = fx.taskCreate({ subject: 'Todo: Undated', taskId: 1, ts: fx.ts(0) });
    for (const rec of group) delete rec.timestamp;
    const { items, stats } = replay(group);
    assert.deepEqual(items, []);
    assert.equal(stats.no_stem_skipped, 1);

    const marked = fx.taskCreate({ subject: 'Todo: Undated but marked', metadata: { devflow_todo: '2026-10-06-undated-but-marked' }, taskId: 2, ts: fx.ts(0) });
    for (const rec of marked) delete rec.timestamp;
    assert.equal(replay(marked).items.length, 1, 'an explicit stem needs no date');
  });
});

describe('63-01 subject grammar and stems', () => {
  test('22: parseTodoSubject and formatTodoSubject round-trip the Todo: grammar', () => {
    assert.deepEqual(session.parseTodoSubject('Todo: Add X'), { title: 'Add X', stem: null });
    assert.deepEqual(session.parseTodoSubject('Todo: Add X [todo:2026-10-06-add-x]'), { title: 'Add X', stem: '2026-10-06-add-x' });
    assert.deepEqual(session.parseTodoSubject('Todo:   Padded   '), { title: 'Padded', stem: null });
    assert.deepEqual(session.parseTodoSubject('Todo: Bad stem [todo:NOT_A_STEM]'), { title: 'Bad stem', stem: null });
    for (const notTodo of ['Plan: Y', 'Todo:', 'Todo:  ', 'Todo: ', 'todo: Z', 'Todo: [todo:2026-10-06-x]', '', null, undefined, 7, {}]) {
      assert.equal(session.parseTodoSubject(notTodo), null, JSON.stringify(notTodo));
    }
    const formatted = session.formatTodoSubject('Add X', '2026-10-06-add-x');
    assert.equal(formatted, 'Todo: Add X [todo:2026-10-06-add-x]');
    assert.deepEqual(session.parseTodoSubject(formatted), { title: 'Add X', stem: '2026-10-06-add-x' });
    assert.equal(session.formatTodoSubject('Add X'), 'Todo: Add X');
    assert.deepEqual(session.parseTodoSubject(session.formatTodoSubject('Add X')), { title: 'Add X', stem: null });
    assert.equal(session.TODO_PREFIX, 'Todo: ');
    assert.ok(session.STEM_RE.test('2026-10-06-add-x'));
    assert.ok(!session.STEM_RE.test('../etc') && !session.STEM_RE.test('x/y') && !session.STEM_RE.test('') && !session.STEM_RE.test('add-x'));
  });

  test('23: deriveStem names a todo exactly as `todo add` does, from the UTC date of the instant', () => {
    const iso = '2026-10-06T23:59:59.000Z';
    assert.equal(session.deriveStem('Add auth token refresh', iso), '2026-10-06-add-auth-token-refresh');
    assert.equal(
      session.deriveStem('Add auth token refresh', iso),
      todoAddStem('---\ntitle: Add auth token refresh\n---\nbody\n', iso),
      'the same title and UTC instant give todo add\'s stem',
    );
    assert.equal(session.deriveStem('!!!', iso), '2026-10-06-todo');
    assert.equal(session.deriveStem('!!!', iso), todoAddStem('!!!', iso));
    assert.equal(session.deriveStem('Just past midnight UTC', '2026-10-07T00:00:00.000Z'), '2026-10-07-just-past-midnight-utc');
    assert.equal(session.deriveStem('Anything', 'not a date'), null);
    assert.equal(session.deriveStem('Anything', undefined), null);
    assert.equal(session.deriveStem('Anything', null), null);
  });
});
