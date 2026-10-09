/**
 * Tests for todo-sync.js — the Stop hook that merges a session's `/aoforge:todo` items into the todo archive
 * (TRD 63-03, BLTN-04).
 *
 * Every test but the last spawns the real hook as Claude Code runs it: a JSON payload on stdin, a temp project, a
 * hermetic environment (nothing inherited, so a developer's AOFORGE_SKIP_* cannot mask a behaviour). Transcripts
 * come from the 63-01 builders, projects from the 63-02 archive builders; this file adds no new fixture builder.
 *
 * Test numbers follow the TRD test list (1-12). The pinned wording is the user-visible contract: one `systemMessage`
 * of `AOForge: todo sync: ...` lines, and silence when nothing changed.
 */

'use strict';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'todo-sync.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const LIB = path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'lib');

const T = require(path.join(LIB, '__fixtures__', 'todo-transcript-fixtures.cjs'));
const A = require(path.join(LIB, '__fixtures__', 'todo-archive-fixtures.cjs'));
const { makeStoreProject } = require(path.join(LIB, '__fixtures__', 'gh-store-fixtures.cjs'));
// This hook resolves only the legacy planning directory until 72-06 moves it onto the resolver (TRD 72-05).
for (const fx of ['todo-archive-fixtures.cjs', 'gh-store-fixtures.cjs']) {
  require(path.join(LIB, '__fixtures__', fx)).setPlanningDir(require(path.join(LIB, 'legacy-names.cjs')).LEGACY.planningDir);
}
const { installGhShim } = require(path.join(LIB, '__fixtures__', 'gh-shim.cjs'));
const outbox = require(path.join(LIB, 'gh-outbox.cjs'));

const SESSION = 'sess-hook-0001';
const TITLE = 'Add auth token refresh';
const STEM = '2026-10-06-add-auth-token-refresh';
// The replay stamps a todo with its creation RESULT's timestamp, which the 63-01 builders place 50 ms after the call.
const CREATED_AT = '2026-10-06T12:00:00.050Z';

const cleanups = [];
after(() => {
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* best effort */ }
  }
});

function scratch(prefix = 'todo-sync-hook-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function project(opts = {}) {
  const p = A.makeTodoProject(opts);
  cleanups.push(p.cleanup);
  return p;
}

/** The environment Claude Code gives a plugin hook, reduced to what the hook needs. */
function hookEnv(extra = {}) {
  return { PATH: process.env.PATH, HOME: scratch('todo-sync-home-'), CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...extra };
}

function runHook(payload, { cwd, env } = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: env || hookEnv(),
    timeout: 60000,
  });
}

const stopPayload = (proj, transcript, extra = {}) => ({
  session_id: SESSION,
  transcript_path: transcript,
  cwd: proj.root,
  hook_event_name: 'Stop',
  stop_hook_active: false,
  ...extra,
});

/** A metadata todo created in the session. */
const createdGroup = (title = TITLE, stem = STEM) =>
  T.taskCreate({ subject: `Todo: ${title}`, metadata: { aoforge_todo: stem }, taskId: 1, ts: T.ts(0) });

function createdTranscript() {
  T.resetIds();
  return T.transcriptOf(createdGroup());
}

function completedTranscript() {
  T.resetIds();
  return T.transcriptOf(createdGroup(), T.taskUpdate({ taskId: 1, status: 'completed', ts: T.ts(5) }));
}

function writeTranscript(text, name = `${SESSION}.jsonl`) {
  return A.writeTranscript(scratch('todo-sync-transcript-'), name, text);
}

const porcelain = (root) => spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).stdout;
const pendingFile = (proj, stem = STEM) => path.join(proj.root, '.planning', 'todos', 'pending', `${stem}.md`);
const completedFile = (proj, stem = STEM) => path.join(proj.root, '.planning', 'todos', 'completed', `${stem}.md`);

/** The one JSON object on stdout, with the never-blocks contract asserted: only `systemMessage`, never a decision. */
function messageOf(r) {
  assert.equal(r.status, 0, `exit ${r.status}, stderr=${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['systemMessage'], 'the hook speaks through systemMessage alone');
  for (const key of ['decision', 'continue', 'stopReason']) assert.equal(Object.hasOwn(out, key), false, `no ${key}`);
  assert.equal(r.stdout.trim().split('\n').length, 1, 'one JSON line');
  return out.systemMessage;
}

function assertSilent(r, label) {
  assert.equal(r.status, 0, `${label}: exit ${r.status}, stderr=${r.stderr}`);
  assert.equal(r.stdout, '', `${label}: expected no stdout, got ${r.stdout}`);
}

const archived = (n) => `AOForge: todo sync: archived ${n} todo(s) from this session`;
const notCommitted = (paths) => `AOForge: todo sync: not committed yet: ${paths.join(' ')} (/aoforge:todo list commits them)`;

describe('63-03 todo-sync Stop hook', () => {
  test('1: a pending metadata todo is archived, and the message names it as uncommitted', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());

    const r = runHook(stopPayload(proj, transcript), { cwd: proj.root });

    assert.equal(
      messageOf(r),
      [archived(1), notCommitted([`.planning/todos/pending/${STEM}.md`])].join('\n')
    );
    assert.equal(
      fs.readFileSync(pendingFile(proj), 'utf8'),
      A.todoFileText({
        title: TITLE,
        created: CREATED_AT,
        problem: `Captured in Claude Code session ${SESSION} through the session task list.`,
      })
    );
  });

  test('2: a second Stop over the same transcript changes nothing and prints nothing', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());
    const env = hookEnv();
    assert.ok(messageOf(runHook(stopPayload(proj, transcript), { cwd: proj.root, env })));
    const file = pendingFile(proj);
    const before = { bytes: fs.readFileSync(file), mtimeMs: fs.statSync(file).mtimeMs, status: porcelain(proj.root) };

    const again = runHook(stopPayload(proj, transcript), { cwd: proj.root, env });

    assertSilent(again, 'second run');
    assert.deepEqual(fs.readFileSync(file), before.bytes);
    assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
    assert.equal(porcelain(proj.root), before.status);
  });

  test('3: a todo the archive holds pending is completed by the session', () => {
    const proj = project({ git: true, todos: [{ stem: STEM, title: TITLE, state: 'pending' }] });
    const transcript = writeTranscript(completedTranscript());

    const message = messageOf(runHook(stopPayload(proj, transcript), { cwd: proj.root }));

    const lines = message.split('\n');
    assert.equal(lines[0], 'AOForge: todo sync: completed 1 todo(s)');
    assert.match(lines[1], /^AOForge: todo sync: not committed yet: .*\.planning\/todos\/completed\/2026-10-06-add-auth-token-refresh\.md/);
    assert.equal(lines.length, 2);
    assert.equal(fs.existsSync(completedFile(proj)), true);
    assert.equal(fs.existsSync(pendingFile(proj)), false);
  });

  test('4: progress tasks with no `Todo: ` text are a fast no-op that writes nothing', () => {
    const proj = project({ git: true });
    T.resetIds();
    const progress = T.transcriptOf(
      T.taskCreate({ subject: 'Plan: Draft the migration', taskId: 1, ts: T.ts(0) }),
      T.taskUpdate({ taskId: 1, status: 'completed', ts: T.ts(3) }),
      T.taskCreate({ subject: 'Micro: tweak the copy', taskId: 2, ts: T.ts(4) })
    );
    assertSilent(runHook(stopPayload(proj, writeTranscript(progress)), { cwd: proj.root }), 'progress tasks only');
    assert.equal(porcelain(proj.root), '');

    // The prefilter passes (a task call and the words `Todo: `) but no task is a todo: still silent, still nothing written.
    T.resetIds();
    const prose = T.transcriptOf(T.taskCreate({ subject: 'Plan: Draft', taskId: 1, ts: T.ts(0) }), T.assistantText('Todo: this is only prose'));
    assertSilent(runHook(stopPayload(proj, writeTranscript(prose, 'prose.jsonl')), { cwd: proj.root }), 'prose mention');
    assert.equal(porcelain(proj.root), '');
  });

  test('5: not an AOForge project: no output', () => {
    const dir = scratch('todo-sync-plain-');
    const transcript = writeTranscript(createdTranscript());

    const r = runHook(stopPayload({ root: dir }, transcript), { cwd: dir });

    assertSilent(r, 'no .planning/');
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  test('6: AOFORGE_SKIP_TODO_SYNC=1 does nothing', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());

    const r = runHook(stopPayload(proj, transcript), { cwd: proj.root, env: hookEnv({ AOFORGE_SKIP_TODO_SYNC: '1' }) });

    assertSilent(r, 'skipped');
    assert.equal(porcelain(proj.root), '');
  });

  test('7: bad stdin, a missing or unreadable transcript, or another event: exit 0 and no output', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());
    const ok = stopPayload(proj, transcript);
    const cases = [
      ['empty stdin', ''],
      ['malformed JSON', '{bad'],
      ['null', 'null'],
      ['an array', '[]'],
      ['no transcript_path', { ...ok, transcript_path: undefined }],
      ['a numeric transcript_path', { ...ok, transcript_path: 7 }],
      ['an empty transcript_path', { ...ok, transcript_path: '' }],
      ['a transcript that does not exist', { ...ok, transcript_path: path.join(proj.root, 'no-such.jsonl') }],
      ['a directory as the transcript', { ...ok, transcript_path: scratch('todo-sync-dir-') }],
      ['SubagentStop', { ...ok, hook_event_name: 'SubagentStop' }],
      ['no event name', { ...ok, hook_event_name: undefined }],
    ];
    for (const [label, payload] of cases) assertSilent(runHook(payload, { cwd: proj.root }), label);
    assert.equal(porcelain(proj.root), '', 'nothing was written by any of them');
  });

  test('8: a plugin root without the bundled library: exit 0 and no output', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());
    const emptyRoot = scratch('todo-sync-noroot-');

    const r = runHook(stopPayload(proj, transcript), { cwd: proj.root, env: hookEnv({ CLAUDE_PLUGIN_ROOT: emptyRoot }) });

    assertSilent(r, 'missing library');
    assert.equal(porcelain(proj.root), '');
  });

  test('9: store mode: the cache file is written, the upsert is queued, nothing reaches gh', () => {
    const proj = makeStoreProject({ store: true });
    cleanups.push(proj.cleanup);
    const base = scratch('todo-sync-store-');
    const shim = installGhShim({ dir: path.join(base, 'shim'), table: {}, defaultCode: 1 });
    const env = shim.env({
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      AOFORGE_OUTBOX_DIR: path.join(base, 'outbox'),
      AOFORGE_HOOK_MARKER_DIR: path.join(base, 'markers'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    });
    delete env.AOFORGE_SKIP_TODO_SYNC;
    const transcript = writeTranscript(createdTranscript());

    const r = runHook(stopPayload(proj, transcript), { cwd: proj.root, env });

    assert.equal(messageOf(r), [archived(1), 'AOForge: todo sync: queued for GitHub; gh-flush sends them'].join('\n'));
    assert.equal(fs.existsSync(pendingFile(proj)), true, 'the cache file is written');
    const ops = outbox.readJournal(proj.root, { env }).journal.ops;
    const upserts = ops.filter((op) => op.kind === 'upsert-issue' && op.target && op.target.id === `todo-${STEM}`);
    assert.equal(upserts.length, 1, JSON.stringify(ops.map((op) => [op.kind, op.target])));
    assert.deepEqual(shim.readCalls(), [], 'the hook makes no gh call');

    const again = runHook(stopPayload(proj, transcript), { cwd: proj.root, env });
    assertSilent(again, 'store rerun');
    assert.deepEqual(shim.readCalls(), []);
  });

  test('10: stop_hook_active behaves like false: it still merges once and stays idempotent', () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());
    const env = hookEnv();
    const payload = stopPayload(proj, transcript, { stop_hook_active: true });

    assert.match(messageOf(runHook(payload, { cwd: proj.root, env })), /archived 1 todo\(s\)/);
    assertSilent(runHook(payload, { cwd: proj.root, env }), 'stop_hook_active rerun');
    assert.equal(fs.existsSync(pendingFile(proj)), true);
  });

  test('11: a failed write is one failure line, still exit 0 and no decision', { skip: typeof process.getuid === 'function' && process.getuid() === 0 }, () => {
    const proj = project({ git: true });
    const transcript = writeTranscript(createdTranscript());
    const planning = path.join(proj.root, '.planning');
    fs.chmodSync(planning, 0o555); // no `todos/` can be made, so the add fails
    cleanups.push(() => fs.chmodSync(planning, 0o755));

    const message = messageOf(runHook(stopPayload(proj, transcript), { cwd: proj.root }));
    fs.chmodSync(planning, 0o755);

    assert.match(message, /^AOForge: todo sync failed: add 2026-10-06-add-auth-token-refresh: .+; nothing is lost, the session task list still holds them$/);
    assert.equal(message.split('\n').length, 1);
  });

  test('12: TodoWrite items count: a todo written to the session list is archived', () => {
    const proj = project({ git: true });
    T.resetIds();
    const stem = '2026-10-06-rotate-the-signing-keys';
    const transcript = writeTranscript(T.transcriptOf(
      T.todoWrite({ todos: [{ content: `Todo: Rotate the signing keys [todo:${stem}]`, status: 'pending', activeForm: 'Rotating the signing keys' }], ts: T.ts(0) })
    ));

    const message = messageOf(runHook(stopPayload(proj, transcript), { cwd: proj.root }));

    assert.equal(message.split('\n')[0], archived(1));
    assert.equal(fs.existsSync(pendingFile(proj, stem)), true);
  });

  test('exports run(payload, {env, pluginRoot}); a payload that is not a Stop returns null', () => {
    const hook = require(HOOK);
    assert.equal(typeof hook.run, 'function');
    assert.equal(hook.run({}, { env: {}, pluginRoot: PLUGIN_ROOT }), null);
    assert.equal(hook.run(null, { env: {}, pluginRoot: PLUGIN_ROOT }), null);
    assert.equal(hook.run({ hook_event_name: 'Stop', transcript_path: '/x' }, { env: { AOFORGE_SKIP_TODO_SYNC: '1' }, pluginRoot: PLUGIN_ROOT }), null);
  });
});
