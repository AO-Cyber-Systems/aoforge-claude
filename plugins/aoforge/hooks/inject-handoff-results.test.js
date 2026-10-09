/**
 * Tests for inject-handoff-results.js (PostToolUse and Stop), TRD 73-04.
 *
 * Outermost first: the hook is spawned (asynchronously, so a test's own timer can write a done record while the
 * hook waits) over a hand-built project, pid file and payload from `handoff-fixtures.cjs`. HOME and
 * AOFORGE_HANDOFF_PID_FILE point into a temp dir, so the real ~/.aoforge is never read.
 *
 * Covers (test list items in brackets):
 *   - PostToolUse delivery as additionalContext, the consumed mark and the claim [1], addressing by session [2]
 *     and by agent [3], a `handoff complete` record [4], two copies delivering once [5], the size cap [6]
 *   - Stop: a top-level block that passes stopFamilyProblems [7], silence with nothing to do [8], the bounded
 *     wait that ends on a result [9] or gives up silently [10], never waiting under stop_hook_active [11],
 *     and the six cases where no wait starts [12]
 *   - every event: both escape hatches [13], degraded input and other events [14]
 *   - the exported surface (constants, stopWaitMs, decide)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const {
  makeHandoffProject,
  doneRecord,
  pendingRecord,
  writeDone,
  writePending,
  writePidFile,
  hookPayload,
} = require('../aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs');
const { stopFamilyProblems } = require('./__fixtures__/hook-output-schema.js');

const HOOK_PATH = path.join(__dirname, 'inject-handoff-results.js');
const BY_POST = 'inject-handoff-results@PostToolUse';

// A hook that does not wait is far from the 10 s wait these tests give it. 1,500 ms keeps a loaded machine from
// failing a "returns at once" check while still being a fraction of the wait it would otherwise take.
const NO_WAIT_MS = 1500;
const LONG_WAIT = '10000';

let project;
let home;

beforeEach(() => {
  project = makeHandoffProject();
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'inject-home-')));
});

afterEach(() => {
  project.cleanup();
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spawn the hook and resolve when it exits. Runs from `home`, not the project, so the hook has to find the
 * project through the payload's `cwd`. `elapsed` is measured from the spawn.
 */
function runHook(stdin, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK_PATH], {
      cwd: cwd || home,
      env: { PATH: process.env.PATH, HOME: home, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr, elapsed: Date.now() - started }));
    child.stdin.on('error', () => { /* a hook that exits before reading stdin is fine */ });
    child.stdin.end(typeof stdin === 'string' ? stdin : JSON.stringify(stdin));
  });
}

const post = (overrides = {}) => hookPayload('PostToolUse', { cwd: project.root, tool_name: 'Bash', ...overrides });
const stop = (overrides = {}) => hookPayload('Stop', { cwd: project.root, stop_hook_active: false, ...overrides });

const done = (overrides = {}) => doneRecord({ session_id: 's-fixture', ...overrides }, Date.now());
const pending = (overrides = {}) => pendingRecord({ session_id: 's-fixture', ...overrides }, Date.now());

function readDone(id) {
  return JSON.parse(fs.readFileSync(path.join(project.doneDir, `${id}.json`), 'utf8'));
}

const claimPath = (id) => path.join(project.doneDir, `${id}.claim`);

/** The way the daemon lands a result: done record first, then the pending file goes. Atomic, so a poll never reads half. */
function landResult(rec) {
  const target = path.join(project.doneDir, `${rec.id}.json`);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(rec, null, 2) + '\n');
  fs.renameSync(`${target}.tmp`, target);
  try { fs.unlinkSync(path.join(project.pendingDir, `${rec.id}.json`)); } catch { /* none queued */ }
}

/** A live daemon that watches the project: a pid file naming this test process and the project root. */
function liveDaemon(extra = {}) {
  return { AOFORGE_HANDOFF_PID_FILE: writePidFile(home, { pid: process.pid, watching: [project.root] }), ...extra };
}

// ---------------------------------------------------------------------------
// PostToolUse
// ---------------------------------------------------------------------------

describe('inject-handoff-results, PostToolUse', () => {
  test('1. an addressed done record is delivered as additionalContext, marked consumed and claimed', async () => {
    writeDone(project, done({ id: 'h-post1', cmd: 'npm login', stdout: 'Logged in as fixture-user\n' }));

    const r = await runHook(post());

    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
    assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    const ctx = out.hookSpecificOutput.additionalContext;
    assert.match(ctx, /## Deferred command results/);
    assert.match(ctx, /h-post1/);
    assert.match(ctx, /Logged in as fixture-user/);

    const rec = readDone('h-post1');
    assert.equal(rec.consumed, true);
    assert.equal(rec.consumed_by, BY_POST);
    assert.ok(fs.existsSync(claimPath('h-post1')), 'done/<id>.claim must exist');
  });

  test('2. a record for another session is left untouched', async () => {
    const rec = done({ id: 'h-other', session_id: 'other' });
    writeDone(project, rec);

    const r = await runHook(post());

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.deepEqual(readDone('h-other'), rec);
    assert.ok(!fs.existsSync(claimPath('h-other')), 'an unaddressed record must not be claimed');
  });

  test('3. a subagent takes only its own record; the main loop record stays for the main loop', async () => {
    writeDone(project, done({ id: 'h-mainloop', stdout: 'main loop output\n' }));

    const first = await runHook(post({ agent_id: 'a1', agent_type: 'aoforge:executor' }));
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, '', 'a subagent must not take the main loop record');
    assert.ok(!fs.existsSync(claimPath('h-mainloop')));

    writeDone(project, done({ id: 'h-agent', agent_id: 'a1', stdout: 'agent output\n' }));

    const second = await runHook(post({ agent_id: 'a1', agent_type: 'aoforge:executor' }));
    const ctx = JSON.parse(second.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /h-agent/);
    assert.match(ctx, /agent output/);
    assert.ok(!/h-mainloop/.test(ctx), 'the main loop record must not ride along');
    assert.ok(!fs.existsSync(claimPath('h-mainloop')));
  });

  test('4. a record written by `handoff complete` (output, no stdout, no session) reaches the main loop', async () => {
    writeDone(project, doneRecord({
      id: 'h-cli', session_id: undefined, stdout: undefined, stderr: undefined, output: 'logged in\n',
    }, Date.now()));

    const r = await runHook(post());

    assert.equal(r.code, 0, r.stderr);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /h-cli/);
    assert.match(ctx, /logged in/);
  });

  test('5. two copies started together over one record deliver it once between them', async () => {
    for (let round = 0; round < 4; round++) {
      const id = `h-race${round}`;
      writeDone(project, done({ id, stdout: `race ${round}\n` }));

      const [a, b] = await Promise.all([runHook(post()), runHook(post())]);

      const emitters = [a, b].filter((x) => x.stdout.trim() !== '');
      assert.equal(emitters.length, 1, `round ${round}: expected one emitter, got ${emitters.length}`);
      assert.match(emitters[0].stdout, new RegExp(id));
      assert.equal(readDone(id).consumed, true);
    }
  });

  test('6. three 4,000-character records still make one additionalContext under 10,000 characters', async () => {
    const big = (tag) => `${tag}:${'x'.repeat(3990)}\n`.slice(0, 4000);
    writeDone(project, done({ id: 'h-big1', stdout: big('one'), completed_at: new Date(Date.now() - 3000).toISOString() }));
    writeDone(project, done({ id: 'h-big2', stdout: big('two'), completed_at: new Date(Date.now() - 2000).toISOString() }));
    writeDone(project, done({ id: 'h-big3', stdout: big('thr'), completed_at: new Date(Date.now() - 1000).toISOString() }));

    const r = await runHook(post());

    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.hookSpecificOutput.additionalContext.length < 10000,
      `additionalContext is ${out.hookSpecificOutput.additionalContext.length} characters`);
    for (const id of ['h-big1', 'h-big2', 'h-big3']) assert.match(out.hookSpecificOutput.additionalContext, new RegExp(id));
  });
});

// ---------------------------------------------------------------------------
// Stop
// ---------------------------------------------------------------------------

describe('inject-handoff-results, Stop', () => {
  test('7. an addressed done record blocks the stop with the results as the reason', async () => {
    writeDone(project, done({ id: 'h-stop1', cmd: 'gh auth login', stdout: 'Logged in to github.com\n' }));

    const r = await runHook(stop());

    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /## Deferred command results/);
    assert.match(out.reason, /h-stop1/);
    assert.match(out.reason, /Logged in to github\.com/);
    assert.match(out.reason, /continue/);
    // stopFamilyProblems models the Stop schema: decision/reason are top level and nothing else is.
    assert.deepEqual(stopFamilyProblems('Stop', out), []);

    const rec = readDone('h-stop1');
    assert.equal(rec.consumed, true);
    assert.equal(rec.consumed_by, 'inject-handoff-results@Stop');
  });

  test('7b. a record for another session does not block the stop', async () => {
    writeDone(project, done({ id: 'h-stop-other', session_id: 'other' }));

    const r = await runHook(stop());

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(!fs.existsSync(claimPath('h-stop-other')));
  });

  test('8. nothing done and nothing pending: no output, no wait', async () => {
    const r = await runHook(stop(), { env: liveDaemon({ AOFORGE_HANDOFF_STOP_WAIT_MS: LONG_WAIT }) });

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(r.elapsed < 1000, `took ${r.elapsed} ms`);
  });

  test('9. the wait ends the moment the result lands, and blocks with it', async () => {
    writePending(project, pending({ id: 'h-wait1', cmd: 'op signin' }));
    const env = liveDaemon({ AOFORGE_HANDOFF_STOP_WAIT_MS: '4000' });

    const running = runHook(stop(), { env });
    await sleep(400);
    landResult(done({ id: 'h-wait1', cmd: 'op signin', stdout: 'signed in to op\n' }));
    const r = await running;

    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /h-wait1/);
    assert.match(out.reason, /signed in to op/);
    assert.deepEqual(stopFamilyProblems('Stop', out), []);
    assert.ok(r.elapsed >= 400, `returned after ${r.elapsed} ms, before the record landed`);
    assert.ok(r.elapsed < 4000, `took ${r.elapsed} ms`);
    assert.equal(readDone('h-wait1').consumed, true);
  });

  test('10. the wait gives up silently when no result lands in time', async () => {
    writePending(project, pending({ id: 'h-wait2' }));
    const env = liveDaemon({ AOFORGE_HANDOFF_STOP_WAIT_MS: '600' });

    const r = await runHook(stop(), { env });

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(r.elapsed >= 600, `returned after ${r.elapsed} ms, before the wait was up`);
    assert.ok(r.elapsed < 3000, `took ${r.elapsed} ms`);
  });

  test('10b. the wait ends early, silently, when the pending command vanishes without a result', async () => {
    writePending(project, pending({ id: 'h-gone' }));
    const env = liveDaemon({ AOFORGE_HANDOFF_STOP_WAIT_MS: '8000' });

    const running = runHook(stop(), { env });
    await sleep(400);
    fs.unlinkSync(path.join(project.pendingDir, 'h-gone.json'));
    const r = await running;

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(r.elapsed < 4000, `kept waiting ${r.elapsed} ms for a command that no longer exists`);
  });

  test('11. stop_hook_active never waits', async () => {
    writePending(project, pending({ id: 'h-active' }));
    const env = liveDaemon({ AOFORGE_HANDOFF_STOP_WAIT_MS: LONG_WAIT });

    const r = await runHook(stop({ stop_hook_active: true }), { env });

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.ok(r.elapsed < NO_WAIT_MS, `took ${r.elapsed} ms`);
  });

  test('11b. stop_hook_active still delivers a result that is already complete', async () => {
    writeDone(project, done({ id: 'h-active-done', stdout: 'already finished\n' }));

    const r = await runHook(stop({ stop_hook_active: true }));

    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /already finished/);
  });

  describe('12. no wait starts when', () => {
    const cases = [
      {
        name: 'the daemon watches another root',
        setup: () => ({ AOFORGE_HANDOFF_PID_FILE: writePidFile(home, { pid: process.pid, watching: [path.join(home, 'elsewhere')] }) }),
      },
      {
        name: 'the daemon pid is dead',
        setup: () => ({ AOFORGE_HANDOFF_PID_FILE: writePidFile(home, { pid: 999999, watching: [project.root] }) }),
      },
      {
        name: 'the pid file is the pre-rename daemon\'s',
        setup: () => {
          writePidFile(home, { pid: process.pid, watching: [project.root], legacy: true });
          return {}; // HOME is the temp dir and the override is unset, so watcher-state falls back to the legacy file
        },
      },
      {
        name: 'the pending record is for another session',
        pending: { session_id: 'other' },
        setup: () => liveDaemon(),
      },
      {
        name: 'the pending record is older than 15 minutes',
        pending: { created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() },
        setup: () => liveDaemon(),
      },
      {
        name: 'AOFORGE_HANDOFF_STOP_WAIT_MS is 0',
        setup: () => liveDaemon(),
        wait: '0',
      },
    ];
    for (const c of cases) {
      test(c.name, async () => {
        writePending(project, pending({ id: 'h-nowait', ...(c.pending || {}) }));
        const env = { ...c.setup(), AOFORGE_HANDOFF_STOP_WAIT_MS: c.wait || LONG_WAIT };

        const r = await runHook(stop(), { env });

        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, '');
        assert.ok(r.elapsed < NO_WAIT_MS, `took ${r.elapsed} ms`);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// every event
// ---------------------------------------------------------------------------

describe('inject-handoff-results, every event', () => {
  for (const hatch of ['AOFORGE_SKIP_HANDOFF_INJECT', 'AOFORGE_SKIP_HANDOFF_RESULTS']) {
    for (const event of ['PostToolUse', 'Stop']) {
      test(`13. ${hatch}=1 on ${event}: no output, record untouched`, async () => {
        const rec = done({ id: 'h-skip' });
        writeDone(project, rec);
        const payload = event === 'Stop' ? stop() : post();

        const r = await runHook(payload, { env: { [hatch]: '1' } });

        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, '');
        assert.deepEqual(readDone('h-skip'), rec);
        assert.ok(!fs.existsSync(claimPath('h-skip')));

        // Control: the same record is deliverable once the hatch is off, so the silence above was the hatch.
        const control = await runHook(payload);
        assert.match(control.stdout, /h-skip/, 'without the hatch the record must be delivered');
      });
    }
  }

  const degraded = [
    ['empty stdin', ''],
    ['malformed JSON', '{bad'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"s"'],
  ];
  for (const [label, stdin] of degraded) {
    test(`14. ${label}: exit 0, no output`, async () => {
      writeDone(project, done({ id: 'h-degraded' }));

      const r = await runHook(stdin, { cwd: project.root });

      assert.equal(r.code, 0, r.stderr);
      assert.equal(r.stdout, '');
      assert.ok(!fs.existsSync(claimPath('h-degraded')));
    });
  }

  test('14. a payload whose cwd does not exist: exit 0, no output', async () => {
    const r = await runHook(post({ cwd: path.join(home, 'no', 'such', 'dir') }));

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
  });

  test('14. an event other than PostToolUse or Stop is left to route-results', async () => {
    const rec = done({ id: 'h-prompt' });
    writeDone(project, rec);

    const r = await runHook(hookPayload('UserPromptSubmit', { cwd: project.root, prompt: 'go on' }));

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.deepEqual(readDone('h-prompt'), rec);
    assert.ok(!fs.existsSync(claimPath('h-prompt')));
  });

  test('no .aoforge-handoff/ anywhere above the cwd: exit 0, no output', async () => {
    const r = await runHook(post({ cwd: home }));

    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
  });
});

// ---------------------------------------------------------------------------
// the exported surface
// ---------------------------------------------------------------------------

describe('inject-handoff-results, exports', () => {
  const hook = require('./inject-handoff-results.js');

  test('the wait constants are the documented ones and fit the registered timeout', () => {
    assert.equal(hook.STOP_WAIT_DEFAULT_MS, 120000);
    assert.equal(hook.PENDING_MAX_AGE_MS, 15 * 60 * 1000);
    assert.equal(hook.POLL_MS, 250);
    // 73-06 registers the Stop command with timeout 150 s; the default wait plus render time must stay under it.
    assert.ok(hook.STOP_WAIT_DEFAULT_MS < 150 * 1000);
  });

  test('stopWaitMs reads AOFORGE_HANDOFF_STOP_WAIT_MS: a number is taken, 0 disables, anything else is the default', () => {
    assert.equal(hook.stopWaitMs({}), hook.STOP_WAIT_DEFAULT_MS);
    assert.equal(hook.stopWaitMs({ AOFORGE_HANDOFF_STOP_WAIT_MS: '4000' }), 4000);
    assert.equal(hook.stopWaitMs({ AOFORGE_HANDOFF_STOP_WAIT_MS: '0' }), 0);
    assert.equal(hook.stopWaitMs({ AOFORGE_HANDOFF_STOP_WAIT_MS: 'soon' }), hook.STOP_WAIT_DEFAULT_MS);
    assert.equal(hook.stopWaitMs({ AOFORGE_HANDOFF_STOP_WAIT_MS: '' }), hook.STOP_WAIT_DEFAULT_MS);
    assert.equal(hook.stopWaitMs({ AOFORGE_HANDOFF_STOP_WAIT_MS: '-5' }), hook.STOP_WAIT_DEFAULT_MS);
  });

  test('decide: silent for a skip hatch, a non-object payload and another event', () => {
    const env = {};
    assert.equal(hook.decide(post(), { env: { AOFORGE_SKIP_HANDOFF_INJECT: '1' } }).kind, 'silent');
    assert.equal(hook.decide(post(), { env: { AOFORGE_SKIP_HANDOFF_RESULTS: '1' } }).kind, 'silent');
    assert.equal(hook.decide(null, { env }).kind, 'silent');
    assert.equal(hook.decide([], { env }).kind, 'silent');
    assert.equal(hook.decide('s', { env }).kind, 'silent');
    assert.equal(hook.decide(hookPayload('UserPromptSubmit', { cwd: project.root }), { env }).kind, 'silent');
  });

  test('decide: context on PostToolUse, block on Stop, wait on Stop with a pending command and a live daemon', () => {
    writeDone(project, done({ id: 'h-decide1' }));
    const ctx = hook.decide(post(), { env: {} });
    assert.equal(ctx.kind, 'context');
    assert.match(ctx.result.text, /h-decide1/);

    writeDone(project, done({ id: 'h-decide2' }));
    const blocked = hook.decide(stop(), { env: {} });
    assert.equal(blocked.kind, 'block');
    assert.match(blocked.result.text, /h-decide2/);

    writePending(project, pending({ id: 'h-decide3' }));
    const pidFile = writePidFile(home, { pid: process.pid, watching: [project.root] });
    const env = { HOME: home, AOFORGE_HANDOFF_PID_FILE: pidFile };
    const waiting = hook.decide(stop(), { env });
    assert.equal(waiting.kind, 'wait');
    assert.equal(waiting.waitMs, hook.STOP_WAIT_DEFAULT_MS);
    assert.equal(hook.decide(stop({ stop_hook_active: true }), { env }).kind, 'silent');
    assert.equal(hook.decide(stop(), { env: { ...env, AOFORGE_HANDOFF_STOP_WAIT_MS: '0' } }).kind, 'silent');
  });

  test('the file no longer carries the DRAFT marker or the UserPromptSubmit emitter', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(!/DRAFT/.test(src));
    assert.ok(!/hookEventName: 'UserPromptSubmit'/.test(src));
    assert.match(src, /handoff-results\.cjs/);
  });
});
