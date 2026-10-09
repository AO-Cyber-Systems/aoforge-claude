/**
 * Tests for gh-flush.js — the store-mode outbox flush hook (TRD 50-05, GEN-02).
 *
 * One script, two events: PostToolUse(Bash, only after `aof-tools commit`) and Stop. Every test spawns the
 * real hook with a JSON payload on stdin. Nothing reaches GitHub or the real ~/.claude:
 *   - `gh` is the PATH shim (aoforge/bin/lib/__fixtures__/gh-shim.cjs); it records every call, so "zero gh
 *     calls" is an assertion, not a hope;
 *   - HOME, AOFORGE_GH_CACHE_DIR, AOFORGE_OUTBOX_DIR and AOFORGE_HOOK_MARKER_DIR all point under one temp root;
 *   - a few tests swap CLAUDE_PLUGIN_ROOT for a fake plugin whose aof-tools.cjs only records argv and exits with a
 *     chosen code, which proves "no child process was spawned" and pins the exit-code mapping.
 *
 * Test numbers follow the TRD test list (1-9); the rest are the mapping and trigger edges.
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gh-flush.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const LIB = path.join(PLUGIN_ROOT, 'aoforge', 'bin', 'lib');

const { installGhShim } = require(path.join(LIB, '__fixtures__', 'gh-shim.cjs'));
const { offlineTable } = require(path.join(LIB, '__fixtures__', 'store-cli-fixtures.cjs'));
const outbox = require(path.join(LIB, 'gh-outbox.cjs'));
const ghTrd = require(path.join(LIB, 'gh-trd.cjs'));

const REPO = 'acme/hook-demo';
const COMMENTS_GET = `api --paginate --slurp repos/${REPO}/issues/207/comments`;
const COMMENTS_POST = `api --method POST repos/${REPO}/issues/207/comments`;

const tmpRoots = [];

function mkTmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpRoots.push(dir);
  return dir;
}

after(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A project under a temp root, its hermetic environment and a recording `gh` shim (offline by default: every
 * call fails with the network wording the flusher classifies as `offline`).
 */
function makeScenario({ store = true } = {}) {
  const base = mkTmp('gh-flush-hook-');
  const root = path.join(base, 'project');
  const planning = path.join(root, '.aoforge');
  fs.mkdirSync(planning, { recursive: true });

  const github = { enabled: true, repo: REPO };
  if (store) github.store = true;
  fs.writeFileSync(path.join(planning, 'config.json'), `${JSON.stringify({ github }, null, 2)}\n`);
  fs.writeFileSync(path.join(planning, '.gh-mapping.json'), `${JSON.stringify({
    version: 3,
    repo: REPO,
    milestones: {},
    objectives: {},
    // gh-mapping keys a TRD by its normalised id (`7-01`, no leading zero); an op may spell it `07-01`.
    trds: { '7-01': { issue_number: 207, rest_id: 9207, role: 'trd', comment_ids: {} } },
  }, null, 2)}\n`);

  const shim = installGhShim({ dir: path.join(base, 'shim'), table: offlineTable(), defaultCode: 1 });
  const env = shim.env({
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    AOFORGE_OUTBOX_DIR: path.join(base, 'outbox'),
    AOFORGE_HOOK_MARKER_DIR: path.join(base, 'markers'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  });
  delete env.AOFORGE_SKIP_GH_FLUSH_HOOK;
  delete env.AOFORGE_GH_FLUSH_TIMEOUT_MS;

  return { base, root, planning, shim, env };
}

/** Queue one cheap op (a TRD summary comment) in the scenario's outbox. */
function enqueueComment(s, text = 'hook test summary') {
  const r = outbox.enqueue(s.root, [{
    kind: 'upsert-comment',
    target: { id: '07-01', kind: 'summary' },
    payload: { mode: 'replace', text },
  }], { env: s.env });
  assert.equal(r.ok, true, `enqueue failed: ${JSON.stringify(r)}`);
}

/** The shim answers the two calls a one-comment flush makes: list comments (none), post a comment. */
function shimOnline(s) {
  s.shim.setTable({
    [COMMENTS_GET]: { code: 0, stdout: '[[]]' },
    [COMMENTS_POST]: {
      code: 0,
      stdout: JSON.stringify({ id: 9001, body: 'posted', updated_at: '2026-10-01T00:00:00Z' }),
    },
  });
}

const pending = (s) => outbox.status(s.root, { env: s.env }).pending;

const postCommit = (s, command = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "feat(50-05): x" --files a.js') => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  cwd: s.root,
  session_id: 'gh-flush-test',
});

const stopEvent = (s) => ({
  hook_event_name: 'Stop',
  cwd: s.root,
  session_id: 'gh-flush-test',
  stop_hook_active: false,
});

function runHook(payload, s, { env = {}, cwd } = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd: cwd || s.root,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...s.env, ...env },
    timeout: 60000,
  });
}

function assertSilent(r, label) {
  assert.equal(r.status, 0, `${label}: exit ${r.status}, stderr=${r.stderr}`);
  assert.equal(r.stdout, '', `${label}: expected no output, got ${r.stdout}`);
}

function parseOut(r, label) {
  assert.equal(r.status, 0, `${label}: exit ${r.status}, stderr=${r.stderr}`);
  assert.notEqual(r.stdout, '', `${label}: expected output`);
  return JSON.parse(r.stdout);
}

/** `{rel: text}` of every file under the project's `.aoforge/`, for "the hook wrote nothing there" checks. */
function snapshotPlanning(s) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out[r] = fs.readFileSync(path.join(dir, e.name), 'utf8');
    }
  };
  walk(s.planning, '');
  return out;
}

/**
 * A plugin root whose aof-tools.cjs records its argv (one JSON line per call in `calls.jsonl`) and then exits with
 * `exit`, printing `stdout` / `stderr`, after sleeping `sleepMs`. The real lib directory is symlinked in, so the
 * hook's in-process pre-check is the real one.
 */
function makeFakePlugin({ exit = 0, stdout = '', stderr = '', sleepMs = 0 } = {}) {
  const dir = mkTmp('gh-flush-plugin-');
  const bin = path.join(dir, 'aoforge', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(LIB, path.join(bin, 'lib'), 'dir');
  const callsFile = path.join(dir, 'calls.jsonl');
  const script = [
    "'use strict';",
    "const fs = require('fs');",
    `fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
    `if (${Number(sleepMs)} > 0) { const end = Date.now() + ${Number(sleepMs)}; while (Date.now() < end) { /* spin */ } }`,
    `process.stdout.write(${JSON.stringify(stdout)});`,
    `process.stderr.write(${JSON.stringify(stderr)});`,
    `process.exitCode = ${Number(exit)};`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(bin, 'aof-tools.cjs'), script);
  return {
    dir,
    calls() {
      return fs.existsSync(callsFile)
        ? fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
        : [];
    },
  };
}

// ─── trigger recognition (unit) ──────────────────────────────────────────────

describe('isDfToolsCommit', () => {
  const { isDfToolsCommit } = (() => {
    try {
      return require('./gh-flush.js');
    } catch {
      return {};
    }
  })();

  test('matches the ways AOForge is invoked to commit', () => {
    assert.equal(typeof isDfToolsCommit, 'function', 'gh-flush.js must export isDfToolsCommit');
    for (const cmd of [
      'node ~/.claude/aoforge/bin/aof-tools.cjs commit "feat: x" --files a',
      'node /p/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd /p/wt commit "feat: x"',
      'aof-tools commit "docs: y"',
      'cd /repo && node $HOME/.claude/aoforge/bin/aof-tools.cjs commit "z"',
      'node aof-tools.cjs commit',
    ]) {
      assert.equal(isDfToolsCommit(cmd), true, cmd);
    }
  });

  test('does not match anything else', () => {
    assert.equal(typeof isDfToolsCommit, 'function');
    for (const cmd of [
      'git commit -m "x"',
      'git status',
      'node ~/.claude/aoforge/bin/aof-tools.cjs state load',
      'node ~/.claude/aoforge/bin/aof-tools.cjs gh outbox flush',
      'echo aof-tools',
      '',
      undefined,
      42,
    ]) {
      assert.equal(isDfToolsCommit(cmd), false, String(cmd));
    }
  });
});

// ─── 1-3, 9: nothing to do ───────────────────────────────────────────────────

describe('silent paths: zero gh calls, no child process', () => {
  test('1. local-mode project, aof-tools commit payload', () => {
    const s = makeScenario({ store: false });
    enqueueComment(s); // a journal exists, but local mode must never look at it
    const fake = makeFakePlugin();
    const r = runHook(postCommit(s), s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } });
    assertSilent(r, 'local mode');
    assert.deepEqual(s.shim.readCalls(), []);
    assert.deepEqual(fake.calls(), [], 'no aof-tools child in local mode');
  });

  test('1b. local mode with the real plugin: still silent, still zero gh calls', () => {
    const s = makeScenario({ store: false });
    enqueueComment(s);
    assertSilent(runHook(postCommit(s), s), 'local mode, real plugin');
    assertSilent(runHook(stopEvent(s), s), 'local mode, Stop');
    assert.deepEqual(s.shim.readCalls(), []);
  });

  test('2. store mode, empty queue, no drift', () => {
    const s = makeScenario();
    const fake = makeFakePlugin();
    const before = snapshotPlanning(s);
    assertSilent(runHook(postCommit(s), s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } }), 'PostToolUse');
    assertSilent(runHook(stopEvent(s), s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } }), 'Stop');
    assert.deepEqual(s.shim.readCalls(), []);
    assert.deepEqual(fake.calls(), [], 'nothing queued: no flush child');
    assert.deepEqual(snapshotPlanning(s), before, 'the hook writes nothing under .aoforge/');
  });

  test('3. store mode, pending ops, but the Bash command is not aof-tools commit', () => {
    const s = makeScenario();
    enqueueComment(s);
    const fake = makeFakePlugin();
    for (const command of ['git status', 'git commit -m "raw"', 'node ~/.claude/aoforge/bin/aof-tools.cjs state load']) {
      assertSilent(runHook(postCommit(s, command), s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } }), command);
    }
    assert.deepEqual(s.shim.readCalls(), []);
    assert.deepEqual(fake.calls(), []);
    assert.equal(pending(s), 1, 'the queued op is untouched');
  });

  test('3b. a PostToolUse for a tool other than Bash is ignored', () => {
    const s = makeScenario();
    enqueueComment(s);
    const fake = makeFakePlugin();
    const payload = { ...postCommit(s), tool_name: 'Edit' };
    assertSilent(runHook(payload, s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } }), 'Edit tool');
    assert.deepEqual(fake.calls(), []);
  });

  test('9. AOFORGE_SKIP_GH_FLUSH_HOOK=1 disables both events', () => {
    const s = makeScenario();
    enqueueComment(s);
    const fake = makeFakePlugin();
    const env = { AOFORGE_SKIP_GH_FLUSH_HOOK: '1', CLAUDE_PLUGIN_ROOT: fake.dir };
    assertSilent(runHook(postCommit(s), s, { env }), 'PostToolUse');
    assertSilent(runHook(stopEvent(s), s, { env }), 'Stop');
    assert.deepEqual(s.shim.readCalls(), []);
    assert.deepEqual(fake.calls(), []);
    assert.equal(pending(s), 1);
  });
});

// ─── 4-6: the flush itself (real aof-tools child, shim gh) ────────────────────

describe('flush through the real aof-tools and the gh shim', () => {
  test('4. PostToolUse after aof-tools commit flushes one pending op and reports it as additionalContext', () => {
    const s = makeScenario();
    enqueueComment(s);
    shimOnline(s);
    const r = runHook(postCommit(s), s);
    const out = parseOut(r, 'flushed');

    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /synced 1 GitHub write\b/);
    assert.equal(Object.hasOwn(out, 'decision'), false);
    assert.equal(pending(s), 0, 'the queue is empty afterwards');
    const calls = s.shim.readCalls().map((c) => c.join(' '));
    assert.ok(calls.some((c) => c.startsWith(COMMENTS_GET)), `expected a comment list read, got ${JSON.stringify(calls)}`);
    assert.ok(calls.some((c) => c.startsWith(COMMENTS_POST)), `expected a comment post, got ${JSON.stringify(calls)}`);
  });

  test('5. offline: a one-line "queued (offline)" notice, exit 0, the op stays pending', () => {
    const s = makeScenario();
    enqueueComment(s);
    const before = snapshotPlanning(s);
    const r = runHook(postCommit(s), s);
    const out = parseOut(r, 'offline');

    assert.match(out.hookSpecificOutput.additionalContext, /1 GitHub write queued \(offline\); they will retry/);
    assert.equal(out.hookSpecificOutput.additionalContext.trim().split('\n').length, 1, 'one line');
    assert.equal(pending(s), 1, 'still pending');
    assert.deepEqual(snapshotPlanning(s), before, 'the hook writes nothing under .aoforge/');
  });

  test('6. Stop with pending ops: systemMessage, never a decision', () => {
    const s = makeScenario();
    enqueueComment(s);
    const r = runHook(stopEvent(s), s);
    const out = parseOut(r, 'Stop');

    assert.equal(typeof out.systemMessage, 'string');
    assert.match(out.systemMessage, /queued \(offline\)/);
    assert.equal(Object.hasOwn(out, 'decision'), false, 'Stop must never block');
    assert.equal(Object.hasOwn(out, 'hookSpecificOutput'), false);
    assert.equal(pending(s), 1);
  });

  test('6b. Stop flushes pending ops when GitHub is reachable', () => {
    const s = makeScenario();
    enqueueComment(s);
    shimOnline(s);
    const out = parseOut(runHook(stopEvent(s), s), 'Stop flushed');
    assert.match(out.systemMessage, /synced 1 GitHub write\b/);
    assert.equal(pending(s), 0);
  });
});

// ─── 7: drift ────────────────────────────────────────────────────────────────

describe('cache drift (W055)', () => {
  test('7. a cache file edited outside a verb is reported at Stop, and only then', () => {
    const s = makeScenario();
    const file = path.join(s.planning, 'PROJECT.md');
    fs.writeFileSync(file, '# Project\n\nas written by a verb\n');
    const written = ghTrd.contentHash(fs.readFileSync(file, 'utf8'));
    assert.equal(outbox.writeCacheIndex(s.root, { 'PROJECT.md': written }, { env: s.env }).ok, true);
    const fake = makeFakePlugin();
    const env = { CLAUDE_PLUGIN_ROOT: fake.dir };

    assertSilent(runHook(stopEvent(s), s, { env }), 'baseline matches: no drift');

    fs.writeFileSync(file, '# Project\n\nhand edited\n');
    const before = snapshotPlanning(s);
    const out = parseOut(runHook(stopEvent(s), s, { env }), 'drift');
    assert.match(out.systemMessage, /1 planning cache file changed outside a verb \(W055\)/);
    assert.match(out.systemMessage, /aof-tools validate health/);
    assert.equal(Object.hasOwn(out, 'decision'), false);
    assert.deepEqual(fake.calls(), [], 'drift alone never spawns a flush');
    assert.deepEqual(snapshotPlanning(s), before, 'the hook does not repair the drift or write .aoforge/');

    assertSilent(runHook(postCommit(s), s, { env }), 'PostToolUse does not report drift');
  });
});

// ─── exit-code mapping and bounds (fake aof-tools) ────────────────────────────

describe('flush result mapping', () => {
  function withPending(fakeOpts, { event = 'post', env = {} } = {}) {
    const s = makeScenario();
    enqueueComment(s);
    const fake = makeFakePlugin(fakeOpts);
    const payload = event === 'post' ? postCommit(s) : stopEvent(s);
    const r = runHook(payload, s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir, ...env } });
    return { s, fake, r };
  }

  const text = (r) => {
    const out = JSON.parse(r.stdout);
    return out.systemMessage || out.hookSpecificOutput.additionalContext;
  };

  test('spawns exactly `aof-tools --cwd <root> gh outbox flush --no-wait --raw`', () => {
    const { s, fake, r } = withPending({ exit: 0, stdout: JSON.stringify({ status: 'flushed', done: [1], pending: 0 }) });
    assert.equal(r.status, 0);
    assert.deepEqual(fake.calls(), [['--cwd', s.root, 'gh', 'outbox', 'flush', '--no-wait', '--raw']]);
  });

  test('exit 0 with nothing sent is silent', () => {
    const { r } = withPending({ exit: 0, stdout: JSON.stringify({ status: 'flushed', done: [], pending: 0 }) });
    assertSilent(r, 'flushed, nothing sent');
  });

  test('a held lock (status running) is silent', () => {
    const { r } = withPending({ exit: 0, stdout: JSON.stringify({ status: 'running', done: [], pending: 1 }) });
    assertSilent(r, 'running');
  });

  test('exit 3 rate limited names the reason', () => {
    const { r } = withPending({ exit: 3, stdout: JSON.stringify({ status: 'pending', reason: 'rate_limited', done: [], pending: 2 }) });
    assert.match(text(r), /2 GitHub writes queued \(rate limited\); they will retry/);
  });

  test('exit 2 halted points at gh outbox status', () => {
    const { r } = withPending({
      exit: 2,
      stdout: JSON.stringify({ status: 'halted', done: [], pending: 0, halted: { reason: 'remote-edit', seq: 1 } }),
    });
    assert.match(text(r), /outbox halted: remote-edit — run aof-tools gh outbox status/);
    assert.equal(Object.hasOwn(JSON.parse(r.stdout), 'decision'), false);
  });

  test('exit 1 reports the first line of the failure and that queued writes are kept', () => {
    const { r } = withPending({ exit: 1, stderr: 'boom: could not reach the repo\nsecond line\n' });
    assert.match(text(r), /GitHub sync failed: boom: could not reach the repo; queued writes are kept/);
    assert.doesNotMatch(text(r), /second line/);
  });

  test('a flush that outlives the timeout is killed and reported, exit 0', () => {
    const t0 = Date.now();
    const { r } = withPending({ exit: 0, sleepMs: 5000 }, { env: { AOFORGE_GH_FLUSH_TIMEOUT_MS: '300' } });
    assert.equal(r.status, 0);
    assert.match(text(r), /GitHub sync failed: .*timed out.*; queued writes are kept/);
    assert.ok(Date.now() - t0 < 4500, 'returned well before the child would have finished');
  });

  test('a halted outbox is reported at Stop even though nothing is spawned', () => {
    const s = makeScenario();
    enqueueComment(s);
    outbox.setHalted(s.root, { reason: 'remote-edit', seq: 1, target: { id: '07-01', kind: 'summary' }, detail: 'edited on GitHub' }, { env: s.env });
    const fake = makeFakePlugin();
    const out = parseOut(runHook(stopEvent(s), s, { env: { CLAUDE_PLUGIN_ROOT: fake.dir } }), 'halted');
    assert.match(out.systemMessage, /outbox halted: remote-edit — run aof-tools gh outbox status/);
    assert.deepEqual(fake.calls(), [], 'a halted queue is not flushed');
  });
});

// ─── 8: fail open ────────────────────────────────────────────────────────────

describe('8. fail open', () => {
  test('malformed or empty stdin', () => {
    const s = makeScenario();
    enqueueComment(s);
    for (const input of ['not json {', '', '[]', 'null', '42']) {
      assertSilent(runHook(input, s), `stdin ${JSON.stringify(input)}`);
    }
    assert.deepEqual(s.shim.readCalls(), []);
  });

  test('a payload with no hook_event_name or an unknown one', () => {
    const s = makeScenario();
    enqueueComment(s);
    assertSilent(runHook({ cwd: s.root }, s), 'no event');
    assertSilent(runHook({ hook_event_name: 'SessionStart', cwd: s.root }, s), 'unknown event');
    assert.deepEqual(s.shim.readCalls(), []);
  });

  test('CLAUDE_PLUGIN_ROOT with no lib', () => {
    const s = makeScenario();
    enqueueComment(s);
    const missing = path.join(s.base, 'no-such-plugin');
    assertSilent(runHook(postCommit(s), s, { env: { CLAUDE_PLUGIN_ROOT: missing } }), 'missing plugin root');
    assertSilent(runHook(stopEvent(s), s, { env: { CLAUDE_PLUGIN_ROOT: missing } }), 'missing plugin root (Stop)');
  });

  test('a lib that throws on load', () => {
    const s = makeScenario();
    enqueueComment(s);
    const dir = mkTmp('gh-flush-throwing-');
    const lib = path.join(dir, 'aoforge', 'bin', 'lib');
    fs.mkdirSync(lib, { recursive: true });
    for (const name of ['planning-mode.cjs', 'gh-outbox.cjs', 'planning-drift.cjs']) {
      fs.writeFileSync(path.join(lib, name), "throw new Error('boom');\n");
    }
    assertSilent(runHook(postCommit(s), s, { env: { CLAUDE_PLUGIN_ROOT: dir } }), 'throwing lib');
    assertSilent(runHook(stopEvent(s), s, { env: { CLAUDE_PLUGIN_ROOT: dir } }), 'throwing lib (Stop)');
  });

  test('a cwd that does not exist', () => {
    const s = makeScenario();
    enqueueComment(s);
    const payload = { ...stopEvent(s), cwd: path.join(s.base, 'gone') };
    assertSilent(runHook(payload, s, { cwd: s.base }), 'missing cwd');
  });

  test('a corrupt outbox journal does not make the hook throw', () => {
    const s = makeScenario();
    enqueueComment(s);
    fs.writeFileSync(outbox.journalPath(s.root, { env: s.env }), '{ this is not json');
    const r = runHook(stopEvent(s), s);
    assert.equal(r.status, 0, `exit ${r.status}, stderr=${r.stderr}`);
    if (r.stdout) assert.equal(Object.hasOwn(JSON.parse(r.stdout), 'decision'), false);
  });
});
