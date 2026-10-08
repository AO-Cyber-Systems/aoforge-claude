/**
 * BLTN-05 — DevFlow's hooks coexist with a user's own hooks (objective 63, TRD 63-05).
 *
 * Claude Code runs every matching hook for an event in parallel, plugin hooks and
 * ~/.claude/settings.json hooks alike, and then combines the results by documented
 * rules (https://code.claude.com/docs/en/hooks). There is no way to run Claude
 * Code's own runner in a unit test, so this file has two halves:
 *
 *   1. MODEL: a small, cited model of that composition (__fixtures__/hook-runner.js),
 *      tested on its own. If Claude Code changes the rules, the model is what changes.
 *   2. MATRIX: every hook registered in hooks.json, run solo and then in parallel
 *      with each of nine user-hook stubs, through the model. Plus degraded input and
 *      duplicate-copy runs.
 *
 * Nothing here touches the real ~/.claude: every run gets a temp HOME, TMPDIR and
 * every DevFlow store override (see coexistence-fixtures.js `hookEnv`).
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const runner = require('./__fixtures__/hook-runner.js');
const fx = require('./__fixtures__/coexistence-fixtures.js');
const todoTranscripts = require('../devflow/bin/lib/__fixtures__/todo-transcript-fixtures.cjs');

// ─── 1. The composition model ────────────────────────────────────────────────

describe('composition model', () => {
  const { classifyOutput, composeEvent, runParallel } = runner;

  const run = (event, code, stdout = '', stderr = '', timedOut = false) =>
    classifyOutput(event, { code, stdout, stderr, timedOut });
  const ok = (event, stdout) => run(event, 0, stdout);
  const decision = (decision, extra = {}) =>
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, ...extra },
    });
  const pre = (decisionName) => ok('PreToolUse', decision(decisionName));

  test('1. exit 0: stdout is JSON, plain text or a parse error, by the documented rules', () => {
    // 'Starts with { and ends with }' and parses: a JSON output object.
    const json = ok('Stop', '{"systemMessage":"a"}');
    assert.equal(json.kind, 'ok');
    assert.deepEqual(json.json, { systemMessage: 'a' });
    assert.equal(json.text, null);

    // Anything else that does not start with '{' is plain text.
    const text = ok('Stop', 'plain');
    assert.equal(text.kind, 'ok');
    assert.equal(text.json, null);
    assert.equal(text.text, 'plain');

    // Surrounding whitespace is ignored before the test.
    assert.deepEqual(ok('Stop', '  \n{"systemMessage":"a"}\n').json, { systemMessage: 'a' });

    // Empty stdout is no output at all.
    const empty = ok('Stop', '');
    assert.equal(empty.kind, 'ok');
    assert.equal(empty.json, null);
    assert.equal(empty.text, null);

    // Starts with { and ends with }, but is not JSON: a non-blocking parse error.
    const bad = ok('Stop', '{not json}');
    assert.equal(bad.kind, 'error');
    assert.match(bad.error, /parse/i);

    // Two or more lines that each parse on their own, none setting a field: plain text.
    const lines = ok('Stop', '{"a":1}\n{"b":2}');
    assert.equal(lines.kind, 'ok');
    assert.equal(lines.json, null);
    assert.equal(lines.text, '{"a":1}\n{"b":2}');

    // ...but when one of those lines does set a field, the whole output is a parse failure.
    const field = ok('Stop', '{"systemMessage":"x"}\n{"b":2}');
    assert.equal(field.kind, 'error');
    assert.match(field.error, /parse/i);

    // Starts with { but does not end with }: plain text.
    const open = ok('Stop', '{"x": 1');
    assert.equal(open.kind, 'ok');
    assert.equal(open.json, null);
    assert.equal(open.text, '{"x": 1');
  });

  test('2. exit 2 blocks, and no JSON can lift it', () => {
    const blocked = run('PreToolUse', 2, '', 'no');
    assert.equal(blocked.kind, 'blocking');
    assert.equal(blocked.reason, 'no');

    // "even a JSON permissionDecision of allow can't override it"
    const overridden = run('PreToolUse', 2, decision('allow'), 'no');
    assert.equal(overridden.kind, 'blocking');
    assert.equal(overridden.reason, 'no');

    // The reason is the JSON's blocking reason when it makes one, else stderr.
    const withReason = run('PreToolUse', 2, decision('deny', { permissionDecisionReason: 'json says' }), 'stderr says');
    assert.equal(withReason.kind, 'blocking');
    assert.equal(withReason.reason, 'json says');

    // Exit 2 only blocks on events that can block; elsewhere it is a non-blocking error.
    assert.equal(run('SessionStart', 2, '', 'nope').kind, 'error');
    assert.equal(run('PostToolUse', 2, '', 'nope').kind, 'error');
    for (const event of ['PreToolUse', 'UserPromptSubmit', 'UserPromptExpansion', 'Stop', 'SubagentStop']) {
      assert.equal(run(event, 2, '', 'nope').kind, 'blocking', event);
    }
  });

  test('3. any other exit code: valid JSON decides alone, otherwise a non-blocking error', () => {
    const silent = run('PreToolUse', 1);
    assert.equal(silent.kind, 'error');
    assert.equal(composeEvent('PreToolUse', [silent]).blocked, false, 'exit 1 never blocks on its own');

    assert.equal(run('PreToolUse', 1, 'plain text', 'boom').kind, 'error');
    assert.equal(run('PreToolUse', 1, '{not json}', 'boom').kind, 'error');

    const json = run('PreToolUse', 1, decision('deny', { permissionDecisionReason: 'why' }));
    assert.equal(json.kind, 'ok', 'a valid JSON object decides, whatever the exit code');
    const composed = composeEvent('PreToolUse', [json]);
    assert.equal(composed.permissionDecision, 'deny');
    assert.equal(composed.blocked, true);
    assert.deepEqual(composed.errors, []);
  });

  test('4. a timed-out hook is cancelled and its output discarded', () => {
    const late = run('PreToolUse', null, decision('deny'), '', true);
    assert.equal(late.kind, 'timeout');
    assert.equal(late.json, null);
    const composed = composeEvent('PreToolUse', [late, pre('allow')]);
    assert.equal(composed.permissionDecision, 'allow', 'only the hook that finished decides');
    assert.equal(composed.blocked, false);
    assert.equal(composed.errors.length, 1);
    assert.equal(composed.errors[0].kind, 'timeout');
  });

  test('5. PreToolUse precedence is deny > defer > ask > allow, and any block wins', () => {
    const decide = (...names) => composeEvent('PreToolUse', names.map(pre)).permissionDecision;
    assert.equal(decide('allow', 'deny'), 'deny');
    assert.equal(decide('deny', 'allow'), 'deny');
    assert.equal(decide('ask', 'allow'), 'ask');
    assert.equal(decide('defer', 'ask'), 'defer');
    assert.equal(decide('defer', 'deny', 'ask', 'allow'), 'deny');
    assert.equal(decide('allow'), 'allow');
    assert.equal(composeEvent('PreToolUse', []).permissionDecision, null);

    assert.equal(composeEvent('PreToolUse', [pre('allow'), pre('ask')]).blocked, false);
    assert.equal(composeEvent('PreToolUse', [pre('allow'), pre('deny')]).blocked, true);

    const withExit2 = composeEvent('PreToolUse', [pre('deny'), run('PreToolUse', 2, '', 'stop')]);
    assert.equal(withExit2.blocked, true);
    assert.deepEqual(withExit2.reasons, ['stop']);

    // An allow beside an exit 2 still blocks.
    assert.equal(composeEvent('PreToolUse', [pre('allow'), run('PreToolUse', 2, '', 'stop')]).blocked, true);
  });

  test('6. Stop: one decision block among silent hooks blocks; continue:false anywhere stops', () => {
    const silent = ok('Stop', '');
    const block = ok('Stop', JSON.stringify({ decision: 'block', reason: 'keep going' }));
    const composed = composeEvent('Stop', [silent, block, ok('Stop', '{"systemMessage":"hi"}')]);
    assert.equal(composed.blocked, true);
    assert.deepEqual(composed.reasons, ['keep going']);
    assert.equal(composed.continue, true);

    const two = composeEvent('Stop', [block, ok('Stop', JSON.stringify({ decision: 'block', reason: 'and this' }))]);
    assert.deepEqual(two.reasons, ['keep going', 'and this']);

    assert.equal(composeEvent('Stop', [silent]).blocked, false);

    const halted = composeEvent('Stop', [silent, ok('Stop', '{"continue":false,"stopReason":"enough"}'), block]);
    assert.equal(halted.continue, false, '"Takes precedence over any event-specific decision fields"');
    assert.equal(composeEvent('Stop', [silent]).continue, true);
  });

  test('7. context and system messages from every hook are kept, in handler order', () => {
    const a = ok(
      'UserPromptSubmit',
      JSON.stringify({ systemMessage: 'sys a', hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'ctx a' } })
    );
    const b = ok(
      'UserPromptSubmit',
      JSON.stringify({ systemMessage: 'sys b', hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'ctx b' } })
    );
    const composed = composeEvent('UserPromptSubmit', [a, ok('UserPromptSubmit', 'plain c'), b]);
    assert.deepEqual(composed.additionalContext, ['ctx a', 'ctx b']);
    assert.deepEqual(composed.systemMessages, ['sys a', 'sys b']);
    assert.deepEqual(composed.context, ['plain c']);

    // Plain stdout becomes context only on SessionStart, UserPromptSubmit, UserPromptExpansion (and PostModelSwitch).
    for (const event of ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion']) {
      assert.deepEqual(composeEvent(event, [ok(event, 'plain')]).context, ['plain'], event);
    }
    for (const event of ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']) {
      assert.deepEqual(composeEvent(event, [ok(event, 'plain')]).context, [], event);
    }

    // A failing hook adds an error entry and removes nothing.
    const withError = composeEvent('UserPromptSubmit', [a, run('UserPromptSubmit', 1, '', 'bad'), b]);
    assert.deepEqual(withError.additionalContext, ['ctx a', 'ctx b']);
    assert.equal(withError.errors.length, 1);
  });

  test('8. runParallel starts handlers at once, feeds each the same stdin and bounds every one', async () => {
    const env = { PATH: process.env.PATH };
    // Prints when it started, when it finished and the stdin it read.
    const stamped = (name, ms) => ({
      name,
      args: [
        '-e',
        `const start=Date.now();let b='';process.stdin.on('data',d=>b+=d).on('end',()=>setTimeout(()=>process.stdout.write(JSON.stringify({start,end:Date.now(),body:b})),${ms}))`,
      ],
    });

    // Two 400 ms sleepers overlap in time: neither waited for the other to finish. Overlap, not a
    // wall-clock bound, so a loaded machine (the full suite runs many files at once) cannot flake it.
    const payload = { hook_event_name: 'Stop', n: 7 };
    const both = await runParallel([stamped('a', 400), stamped('b', 400)], payload, { cwd: process.cwd(), env });
    assert.deepEqual(both.map((r) => r.name), ['a', 'b'], 'results come back in handler order');
    const [a, b] = both.map((r) => JSON.parse(r.stdout));
    assert.ok(a.start < b.end && b.start < a.end, `the handlers ran one after the other: ${JSON.stringify([a, b])}`);
    for (const [i, r] of both.entries()) {
      assert.equal(r.code, 0);
      assert.equal(r.timedOut, false);
      assert.equal([a, b][i].body, JSON.stringify(payload), 'each handler reads the same stdin payload');
    }

    // A raw string payload is written as is (degraded-input runs rely on this).
    const [raw] = await runParallel([stamped('raw', 0)], '{bad json', { cwd: process.cwd(), env });
    assert.equal(JSON.parse(raw.stdout).body, '{bad json');

    // A child that never reads stdin must not hang the runner or throw EPIPE.
    const big = { blob: 'x'.repeat(1024 * 1024) };
    const deaf = await runParallel(
      [
        { name: 'exits-at-once', args: ['-e', 'process.exit(0)'] },
        { name: 'sleeps-unread', args: ['-e', 'setTimeout(()=>{},150)'] },
      ],
      big,
      { cwd: process.cwd(), env, timeoutMs: 5000 }
    );
    assert.deepEqual(deaf.map((r) => r.code), [0, 0]);
    assert.deepEqual(deaf.map((r) => r.timedOut), [false, false]);

    // One past its timeout is killed; the others are untouched. A per-handler timeout wins over the default.
    const t1 = Date.now();
    const mixed = await runParallel(
      [
        { name: 'hangs', args: ['-e', 'setTimeout(()=>{},10000)'], timeoutMs: 200 },
        { name: 'fast', args: ['-e', "process.stdout.write('done')"] },
        { name: 'in-process', inProcess: async () => ({ code: 0, stdout: '{}', stderr: '' }) },
      ],
      payload,
      { cwd: process.cwd(), env, timeoutMs: 5000 }
    );
    assert.ok(Date.now() - t1 < 3000, 'the hung child was killed at its timeout');
    assert.equal(mixed[0].timedOut, true);
    assert.equal(mixed[1].timedOut, false);
    assert.equal(mixed[1].stdout, 'done');
    assert.equal(mixed[2].stdout, '{}');
    assert.equal(typeof mixed[2].ms, 'number');
  });

  test('8. runParallel keeps output that drains after the child exits', async () => {
    const env = { PATH: process.env.PATH };
    // The child writes 'A' and exits. A grandchild on the inherited stdout writes 200000 bytes 400 ms later, after the
    // child's exit event. 200000 bytes are more than a 64 KB pipe buffer, so draining them takes several reads.
    const child = `process.stdout.write('A');require('child_process').spawn(process.execPath,['-e',"setTimeout(()=>process.stdout.write('B'.repeat(200000)),400)"],{stdio:['ignore','inherit','inherit']}).unref();`;
    const [r] = await runParallel([{ name: 'late', args: ['-e', child] }], {}, { cwd: process.cwd(), env, timeoutMs: 10000 });
    // Length first, so a failure message stays short.
    assert.equal(r.stdout.length, 200001, `only ${r.stdout.length} of 200001 bytes were kept`);
    assert.equal(r.stdout, 'A' + 'B'.repeat(200000));
    assert.equal(r.code, 0);
    assert.equal(r.timedOut, false);
  });

  test('8. a pipe leaked to a detached grandchild is released after the drain grace', async () => {
    const GRACE = runner.EXIT_DRAIN_GRACE_MS;
    // The handler writes 'early', starts a detached grandchild that holds the inherited stdout/stderr for 10 s, reports
    // the grandchild's pid on stderr and exits.
    const LEAK = `process.stdout.write('early');const g=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{detached:true,stdio:['ignore','inherit','inherit']});process.stderr.write(String(g.pid));g.unref();`;
    // A subprocess runs the runner, so that a pipe the runner still holds keeps that subprocess alive and shows in the
    // wall time. It exits naturally: process.exit() right after a pipe write can truncate the write.
    const script =
      `const m=require(${JSON.stringify(path.join(__dirname, '__fixtures__', 'hook-runner.js'))});` +
      `m.runParallel([{name:'leak',args:['-e',${JSON.stringify(LEAK)}]}],{},` +
      `{cwd:process.cwd(),env:{PATH:process.env.PATH},timeoutMs:20000})` +
      `.then(([r])=>process.stdout.write(JSON.stringify(r)));`;

    const t0 = Date.now();
    const out = await new Promise((resolve) => {
      execFile(process.execPath, ['-e', script], { timeout: 20000, env: { PATH: process.env.PATH } }, (err, stdout, stderr) =>
        resolve({ err, stdout, stderr })
      );
    });
    const wall = Date.now() - t0;

    let r = null;
    try {
      r = JSON.parse(out.stdout);
    } catch {
      // asserted below
    }
    try {
      assert.equal(out.err, null, `the subprocess failed: ${out.err && out.err.message}; stderr: ${out.stderr}`);
      assert.ok(r, `the subprocess printed no result: ${JSON.stringify(out.stdout)}`);
      // Only upper bounds, with margin: the grandchild sleeps 10 s, so a runner that still holds the pipe fails this.
      assert.ok(wall < GRACE + 4000, `the subprocess took ${wall} ms: the runner kept the leaked pipe`);
      assert.equal(r.stdout, 'early');
      assert.equal(r.code, 0);
      assert.equal(r.timedOut, false);
      assert.ok(r.ms < GRACE + 3000, `the handler settled after ${r.ms} ms`);
    } finally {
      // The grandchild must not outlive the test, pass or fail.
      const pid = r ? Number.parseInt(r.stderr, 10) : NaN;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
    }
  });
});

// ─── 2. The matrix ───────────────────────────────────────────────────────────

const { HOOKS_DIR, USER_HOOKS, makeWorld, disposeWorld, hookEnv } = fx;
const classify = runner.classifyOutput;
const compose = runner.composeEvent;
const spawnAll = runner.runParallel;

/** DevFlow hooks get a generous bound: upgrade-project and the git-reading hooks are slow on a loaded machine. */
const DEVFLOW_TIMEOUT_MS = 30000;

/**
 * user-slow waits 1500 ms. Giving it a 700 ms timeout exercises the documented rule that a hook
 * past its timeout is cancelled and its output discarded, without making the suite slow.
 */
const USER_SLOW_TIMEOUT_MS = 700;

const STUB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'coexist-stubs-'));
const STUBS = fx.writeUserHooks(STUB_DIR);
process.on('exit', () => {
  try { fs.rmSync(STUB_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ─── Registered hooks ────────────────────────────────────────────────────────

function readHooksJson() {
  return JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
}

/**
 * Every `{script, event, matcher, key}` registered in a hooks.json, once per script and event
 * (gate-skill-requires and gh-flush are registered on two events each).
 */
function registrations(hooksJson = readHooksJson()) {
  const out = [];
  const seen = new Set();
  for (const [event, groups] of Object.entries(hooksJson.hooks || {})) {
    for (const group of groups) {
      for (const h of group.hooks || []) {
        const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([\w.-]+\.js)/.exec(String(h.command || ''));
        if (!m) continue;
        const key = `${m[1]}@${event}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ script: m[1], event, matcher: group.matcher === undefined ? null : group.matcher, key });
      }
    }
  }
  return out;
}

/** Registrations with no RUNS entry, and RUNS entries with no registration. */
function tableGaps(regs, runs) {
  const keys = new Set(regs.map((r) => r.key));
  return {
    missing: regs.map((r) => r.key).filter((k) => !runs[k]),
    stale: Object.keys(runs).filter((k) => !keys.has(k)),
  };
}

/** Claude Code matches a tool event on its matcher: `*` (or none) matches all, otherwise an exact-name alternation. */
function matcherFires(matcher, toolName) {
  if (!matcher || matcher === '*') return true;
  return new RegExp(`^(?:${matcher})$`).test(toolName || '');
}

// ─── One entry per registered hook and event ─────────────────────────────────
//
// `payload(ctx)` builds the stdin payload for a world; `world` shapes the world (skillActive,
// notices, ...); `expect` is the outcome the solo run must reach, so the matrix cannot pass
// vacuously on a payload that never reaches a hook's decision branch: 'silent', 'deny', 'ask',
// 'block' or 'context'. `inProcess` runs awareness-cache-populate in this process with a stubbed
// spawn (its real path forks a detached df-tools scan that would outlive the test). `sharedHome`
// puts the solo run and every paired run on one HOME, and `warmup` runs the hook once unscored
// first: sync-runtime mirrors 14 MB of runtime the first time it meets a HOME. `normalize` maps
// run-dependent text in stdout to a stable form before runs are compared. `readsStdin: false`
// marks a hook that ignores its payload; it still gets the degraded inputs. `writesState: true`
// marks a hook that leaves a JSON state file behind, so test 14's "the shared file still parses"
// check is known to have something to look at.

/** A PATH with nothing on it, so a skill that requires `gh` is refused whatever this machine has installed. */
const noToolsOnPath = (world) => ({ PATH: path.join(world.base, 'empty-bin') });

/**
 * A session transcript holding one `/devflow:todo` item, written into the world's home; returns its path. The todo
 * carries an explicit stem, so the hook's message names the same relative path in every world.
 */
function todoTranscript(world) {
  const file = path.join(world.home, 'todo-transcript.jsonl');
  todoTranscripts.resetIds();
  fs.writeFileSync(
    file,
    todoTranscripts.transcriptOf(
      todoTranscripts.taskCreate({
        subject: 'Todo: Coexist with the user hooks',
        metadata: { devflow_todo: '2026-10-06-coexist-with-the-user-hooks' },
        taskId: 1,
        ts: todoTranscripts.ts(0),
      })
    )
  );
  return file;
}

const RUNS = {
  'sync-runtime.js@SessionStart': {
    label: 'session start on a warm runtime mirror',
    expect: 'silent',
    payload: fx.sessionStart,
    sharedHome: true,
    warmup: true,
    readsStdin: false,
  },
  'upgrade-project.js@SessionStart': {
    label: 'fast path (project already stamped)',
    expect: 'silent',
    payload: fx.sessionStart,
    readsStdin: false,
  },
  'awareness-cache-populate.js@SessionStart': {
    label: 'no cache, spawn stubbed',
    expect: 'silent',
    payload: fx.sessionStart,
    inProcess: 'awareness-populate',
    readsStdin: false,
  },
  'classify-session.js@SessionStart': {
    label: 'session start',
    expect: 'context',
    payload: fx.sessionStart,
    readsStdin: false,
  },
  'verify-completion.js@Stop': {
    label: 'autonomous, mid-execution',
    expect: 'block',
    writesState: true, // the resume counter under hook-markers/
    payload: fx.stop(),
  },
  'auto-continue.js@Stop': {
    label: 'live skill marker, announced next step',
    expect: 'block',
    world: { skillActive: true },
    payload: fx.stop({ last_assistant_message: 'Tests are green.\n\nWriting the predicate.' }),
  },
  'gh-flush.js@Stop': {
    label: 'session stop, local mode',
    expect: 'silent',
    payload: fx.stop(),
  },
  'todo-sync.js@Stop': {
    label: 'session todo archived, local mode',
    // Archives the todo and says so in one systemMessage. The message holds only paths relative to the project
    // (`.planning/todos/pending/<stem>.md`), so it needs no `normalize`. It never blocks, so a user deny or block
    // beside it is the user's alone.
    expect: 'context',
    payload: (ctx) => fx.stop({ transcript_path: todoTranscript(ctx.world) })(ctx),
  },
  'verify-commits.js@SubagentStop': {
    label: 'autonomous, mid-execution, no recent commits',
    // FINDING (63-05): this hook nests decision and reason inside hookSpecificOutput, a shape the hooks
    // reference does not define for SubagentStop (it reads a top-level decision), so under the documented
    // model its nudge composes to nothing. Its own tests pin the nested shape, so it is left alone here
    // and recorded in the SUMMARY. 'output' proves the hook reached its branch and spoke.
    expect: 'output',
    writesState: true, // the retry marker under hook-markers/
    payload: fx.subagentStop(),
  },
  'gate-executor-stop.js@SubagentStop': {
    label: 'executor stops without a SUMMARY',
    expect: 'block',
    payload: (ctx) => fx.subagentStop({ agent_transcript_path: fx.executorTranscript(ctx.world) })(ctx),
  },
  'route-intent.js@UserPromptSubmit': {
    label: 'intent match',
    expect: 'context',
    payload: fx.prompt('build a login page for the app'),
  },
  'route-results.js@UserPromptSubmit': {
    label: 'pending upgrade notice',
    expect: 'context',
    writesState: true, // marks the seeded notice consumed in .devflow-notices.json
    world: { notices: true },
    payload: fx.prompt('continue'),
    readsStdin: false,
  },
  'gate-skill-requires.js@UserPromptExpansion': {
    label: 'typed /devflow:gh-sync with gh off PATH',
    expect: 'block',
    env: noToolsOnPath,
    payload: fx.expansion('devflow:gh-sync', 'status'),
  },
  'gate-skill-requires.js@PreToolUse': {
    label: 'Skill tool devflow:gh-sync with gh off PATH',
    expect: 'deny',
    env: noToolsOnPath,
    payload: fx.preTool('Skill', { skill: 'devflow:gh-sync' }),
  },
  'gate-commits.js@PreToolUse': {
    label: 'raw git commit',
    expect: 'deny',
    payload: fx.preTool('Bash', { command: 'git commit -m "wip"' }),
  },
  'changelog-on-tag.js@PreToolUse': {
    label: 'annotated release tag with no CHANGELOG entry',
    expect: 'deny',
    world: { changelog: true },
    payload: fx.preTool('Bash', { command: 'git tag -a v9.9.9 -m "release"' }),
  },
  'gate-interactive.js@PreToolUse': {
    label: 'TTY-only command',
    expect: 'deny',
    // The handoff id in the reason is minted per run.
    normalize: (s) => s.replace(/handoff id: \S+/g, 'handoff id: <ID>').replace(/pending\/[^\s"]+?\.json/g, 'pending/<ID>.json'),
    payload: fx.preTool('Bash', { command: 'npm login' }),
  },
  'gate-bash-writes.js@PreToolUse': {
    label: 'ambient Bash write to a tracked file',
    expect: 'ask',
    payload: fx.preTool('Bash', { command: "sed -i 's/1/2/' src/x.js" }),
  },
  'gate-edits.js@PreToolUse': {
    label: 'ambient edit, no marker',
    expect: 'deny',
    payload: (ctx) => fx.preTool('Edit', { file_path: path.join(ctx.world.root, 'src', 'x.js') })(ctx),
  },
  'guard-no-progress.js@PreToolUse': {
    label: 'fifth identical read in a session',
    expect: 'ask',
    writesState: true, // the per-session file under progress-guard/
    world: { stuckGuard: { tool: 'Read', args: { file_path: '/nonexistent/file' } } },
    payload: fx.preTool('Read', { file_path: '/nonexistent/file' }),
  },
  'gh-flush.js@PostToolUse': {
    label: 'df-tools commit just ran, local mode',
    expect: 'silent',
    payload: fx.postTool('Bash', {
      command: 'node ~/.claude/devflow/bin/df-tools.cjs commit "feat(50-05): x" --files a.js',
    }),
  },
};

// ─── Running a hook, alone and beside a user hook ────────────────────────────

/** Warmed shared-HOME worlds, one per registration that asks for one; disposed after the suite. */
const warmWorlds = new Map();

function devflowHandler(reg, run, world, name = 'devflow') {
  if (run.inProcess === 'awareness-populate') {
    return {
      name,
      inProcess: async () => {
        const hook = require(path.join(HOOKS_DIR, 'awareness-cache-populate.js'));
        hook._main({
          cwd: world.root,
          env: hookEnv(world),
          _spawn: () => ({ unref() {} }),
        });
        return { code: 0, stdout: '', stderr: '' };
      },
    };
  }
  return { name, script: path.join(HOOKS_DIR, reg.script) };
}

/** The warmed world for a registration with `sharedHome`, else null. Warm-up is one unscored run. */
function getWarm(reg, run) {
  if (!run.sharedHome) return Promise.resolve(null);
  if (!warmWorlds.has(reg.key)) {
    warmWorlds.set(
      reg.key,
      (async () => {
        const world = makeWorld(run.world);
        if (run.warmup) {
          const ctx = { world, cwd: world.root };
          await spawnAll([devflowHandler(reg, run, world, 'warmup')], run.payload(ctx), {
            cwd: world.root,
            env: hookEnv(world),
            timeoutMs: 120000,
          });
        }
        return world;
      })()
    );
  }
  return warmWorlds.get(reg.key);
}

async function withWorld(reg, run, fn) {
  const warm = await getWarm(reg, run);
  const world = makeWorld({ ...run.world, ...(warm ? { sharedHomeFrom: warm } : {}) });
  try {
    return await fn(world);
  } finally {
    disposeWorld(world);
  }
}

/** hookEnv plus a RUNS entry's own overrides. */
function envFor(run, world) {
  return { ...hookEnv(world), ...(run.env ? run.env(world) : {}) };
}

/** Map run-dependent text (the temp world, the temp home) to a stable form before runs are compared. */
function normalized(result, world, run) {
  const clean = (text) => {
    let s = String(text || '').split(world.home).join('<HOME>').split(world.base).join('<WORLD>');
    if (run.normalize) s = run.normalize(s);
    return s;
  };
  return { ...result, stdout: clean(result.stdout), stderr: clean(result.stderr) };
}

/** The DevFlow hook alone (stub null) or beside one user stub, in a fresh world, on the same payload. */
function runScenario(reg, run, stub) {
  return withWorld(reg, run, async (world) => {
    const payload = run.payload({ world, cwd: world.root });
    const handlers = [devflowHandler(reg, run, world)];
    if (stub) {
      handlers.push({
        name: stub,
        script: STUBS[stub],
        timeoutMs: stub === 'user-slow' ? USER_SLOW_TIMEOUT_MS : undefined,
      });
    }
    const [devflow, user] = await spawnAll(handlers, payload, {
      cwd: world.root,
      env: envFor(run, world),
      timeoutMs: DEVFLOW_TIMEOUT_MS,
    });
    return { devflow: normalized(devflow, world, run), user: user || null, payload };
  });
}

/** Solo plus every pairing, each in its own world, all at once. */
async function runMatrix(reg, run) {
  const names = Object.keys(USER_HOOKS);
  const [solo, ...pairs] = await Promise.all([runScenario(reg, run, null), ...names.map((n) => runScenario(reg, run, n))]);
  return { solo, paired: Object.fromEntries(names.map((n, i) => [n, pairs[i]])) };
}

// ─── The output contract (test 12) ───────────────────────────────────────────

const ALLOWED_TOP_LEVEL_KEYS = ['systemMessage', 'decision', 'reason', 'hookSpecificOutput', 'suppressOutput'];
const PLAIN_TEXT_EVENTS = ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion'];
const STRING_LIMIT = 10000;

function longStrings(value, trail = '$') {
  if (typeof value === 'string') return value.length >= STRING_LIMIT ? [`${trail} (${value.length} chars)`] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => longStrings(v, `${trail}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => longStrings(v, `${trail}.${k}`));
  }
  return [];
}

/**
 * What is wrong with one DevFlow hook run, if anything: exit 0 and either no output, one JSON
 * object (the whole stdout parses) with only the keys DevFlow uses, or plain text on an event
 * that accepts it.
 */
function contractProblems(event, r) {
  const problems = [];
  if (r.timedOut) problems.push('timed out');
  else if (r.code !== 0) problems.push(`exit code ${r.code} (stderr: ${String(r.stderr).trim().split('\n')[0]})`);

  const out = String(r.stdout || '');
  if (out.trim() === '') return problems;

  let json;
  try { json = JSON.parse(out); } catch { json = undefined; }

  if (json === undefined || json === null || typeof json !== 'object' || Array.isArray(json)) {
    if (!PLAIN_TEXT_EVENTS.includes(event)) problems.push(`plain text on ${event}: ${out.slice(0, 80)}`);
    if (out.length >= STRING_LIMIT) problems.push(`plain text of ${out.length} chars`);
    return problems;
  }

  for (const key of Object.keys(json)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.includes(key)) problems.push(`unexpected top-level key "${key}"`);
  }
  if (json.hookSpecificOutput !== undefined) {
    const h = json.hookSpecificOutput;
    if (!h || typeof h !== 'object' || h.hookEventName !== event) {
      problems.push(`hookSpecificOutput.hookEventName is ${JSON.stringify(h && h.hookEventName)}, not "${event}"`);
    } else if (h.permissionDecision !== undefined && !runner.PRECEDENCE.includes(h.permissionDecision)) {
      problems.push(`unknown permissionDecision "${h.permissionDecision}"`);
    }
  }
  if (json.decision !== undefined && json.decision !== 'block') problems.push(`unknown decision "${json.decision}"`);
  for (const where of longStrings(json)) problems.push(`string over ${STRING_LIMIT} characters at ${where}`);
  return problems;
}

// ─── What each user stub is meant to contribute (so the user side is not vacuous either) ─────────

const CONTEXT_STUB_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse'];

/** `U` is the user stub composed alone on this event. */
const STUB_CONTRIBUTION = {
  'user-context': (event, U) => {
    assert.deepEqual(U.systemMessages, [`user: ${event}`]);
    assert.deepEqual(U.additionalContext, CONTEXT_STUB_EVENTS.includes(event) ? ['user context'] : []);
    assert.equal(U.blocked, false);
  },
  'user-allow': (event, U) => {
    assert.equal(U.permissionDecision, event === 'PreToolUse' ? 'allow' : null);
    assert.equal(U.blocked, false);
  },
  'user-deny': (event, U) => {
    if (event === 'PreToolUse') {
      assert.equal(U.permissionDecision, 'deny');
      assert.equal(U.blocked, true);
    } else if (['Stop', 'SubagentStop', 'UserPromptSubmit', 'UserPromptExpansion'].includes(event)) {
      assert.equal(U.blocked, true);
    } else {
      assert.equal(U.blocked, false);
    }
    assert.deepEqual(U.reasons, U.blocked ? ['user deny'] : []);
  },
  'user-plain': (event, U) => {
    assert.deepEqual(U.context, runner.CONTEXT_EVENTS.includes(event) ? ['user plain text'] : []);
    assert.equal(U.blocked, false);
  },
  'user-fail': (event, U) => {
    assert.equal(U.errors.length, 1);
    assert.equal(U.blocked, false, 'exit 1 is a non-blocking error');
  },
  'user-exit2': (event, U) => {
    if (runner.EXIT2_BLOCKS.includes(event)) {
      assert.equal(U.blocked, true);
      assert.deepEqual(U.reasons, ['user hook blocked']);
    } else {
      assert.equal(U.blocked, false, `exit 2 does not block on ${event}`);
      assert.equal(U.errors.length, 1);
    }
  },
  'user-garbage': (event, U) => {
    assert.equal(U.errors.length, 1);
    assert.match(U.errors[0].error, /parse/);
    assert.equal(U.blocked, false);
  },
  'user-slow': (event, U) => {
    assert.equal(U.errors.length, 1);
    assert.equal(U.errors[0].kind, 'timeout');
    assert.deepEqual(U.systemMessages, [], 'a timed-out hook contributes nothing');
  },
  'user-no-stdin': (event, U) => {
    assert.deepEqual(U, compose(event, []));
  },
};

/** What the solo DevFlow run must have done, per RUNS `expect`. */
function assertExpected(expect, D, solo, label) {
  const contributed = D.additionalContext.length + D.systemMessages.length + D.context.length;
  switch (expect) {
    case 'silent':
      assert.deepEqual(D, compose('X', []), `${label}: expected the hook to say nothing`);
      break;
    case 'deny':
      assert.equal(D.permissionDecision, 'deny', `${label}: expected a deny`);
      assert.equal(D.blocked, true);
      break;
    case 'ask':
      assert.equal(D.permissionDecision, 'ask', `${label}: expected an ask`);
      break;
    case 'block':
      assert.equal(D.blocked, true, `${label}: expected a block`);
      break;
    case 'context':
      assert.ok(contributed > 0, `${label}: expected context or a system message`);
      break;
    case 'output':
      assert.notEqual(solo.stdout.trim(), '', `${label}: expected the hook to print something`);
      break;
    default:
      assert.fail(`${label}: RUNS entry has no recognised expect ("${expect}")`);
  }
}

const strongest = (a, b) => runner.PRECEDENCE.find((d) => d === a || d === b) || null;
const rank = (d) => (d ? runner.PRECEDENCE.length - runner.PRECEDENCE.indexOf(d) : 0);

// ─── JSON state files (test 14) ──────────────────────────────────────────────

// `all`: every file in the directory must parse as JSON. The retry markers are bare counters (`3`, an epoch in
// milliseconds), which are valid JSON, and a torn or empty write is not.
const STATE_DIRS = [
  { rel: 'hook-markers', all: true },
  { rel: 'progress-guard', all: false },
  { rel: 'awareness', all: false },
  { rel: 'outbox', all: false },
  { rel: path.join('.claude', 'devflow', 'state'), all: false },
];
const PLANNING_STATE_FILES = ['.skill-active', '.edit-override', '.devflow-notices.json', '.progress-guard.json', '.awareness-cache.json'];

function walkFiles(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.git' ? [] : walkFiles(full);
    return [full];
  });
}

/** Every JSON state file a hook may have written in a world: its HOME stores and its .planning dotfiles. */
function stateFilesOf(world) {
  const files = [];
  for (const { rel, all } of STATE_DIRS) {
    files.push(...walkFiles(path.join(world.home, rel)).filter((f) => all || f.endsWith('.json')));
  }
  for (const f of walkFiles(world.root)) {
    if (f.includes(`${path.sep}.planning${path.sep}`) && PLANNING_STATE_FILES.includes(path.basename(f))) files.push(f);
  }
  return files;
}

function unparseableStateFiles(world) {
  const bad = [];
  for (const file of stateFilesOf(world)) {
    try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { bad.push(`${file}: ${e.message}`); }
  }
  return bad;
}

// ─── The tests ───────────────────────────────────────────────────────────────

describe('coexistence matrix', () => {
  const REGS = registrations();

  after(async () => {
    for (const pending of warmWorlds.values()) disposeWorld(await pending);
  });

  describe('9. table completeness', () => {
    test('9. every registration in hooks.json has a RUNS entry, and every entry is a registration', () => {
      const gaps = tableGaps(REGS, RUNS);
      assert.deepEqual(
        gaps.missing,
        [],
        'registered in hooks.json but not in the coexistence suite: add a RUNS entry for each (new hooks must join the suite)'
      );
      assert.deepEqual(gaps.stale, [], 'in RUNS but no longer registered in hooks.json: remove the entry');
    });

    test('9. a registration added to a copy of hooks.json without a RUNS entry is reported', () => {
      const copy = readHooksJson();
      copy.hooks.Stop.push({
        hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/a-future-hook.js' }],
      });
      copy.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-edits.js' }],
      });
      // Relative to the real file, so this test does not also fail when the real table is the one with a gap.
      const already = tableGaps(REGS, RUNS).missing;
      const gaps = tableGaps(registrations(copy), RUNS);
      assert.deepEqual(gaps.missing, [...already, 'a-future-hook.js@Stop'], 'a second registration of a known script and event is not a new pair');
      assert.deepEqual(tableGaps(REGS, { ...RUNS, 'gone.js@Stop': {} }).stale, ['gone.js@Stop']);
    });

    test('9. registrations are read from hooks.json and every script exists', () => {
      assert.ok(REGS.length >= 20, `only ${REGS.length} registrations were read from hooks.json`);
      assert.ok(REGS.every((r) => fs.existsSync(path.join(HOOKS_DIR, r.script))), 'a registered script is missing');
    });
  });

  describe('10-12. beside each of nine user hooks', { concurrency: 4 }, () => {
    for (const reg of REGS) {
      const run = RUNS[reg.key];
      if (!run) continue; // test 9 reports it

      describe(`${reg.key} [${run.label}]`, () => {
        let data;
        before(async () => {
          data = await runMatrix(reg, run);
        });

        test('10. the DevFlow hook is independent of the user hook beside it', () => {
          assert.ok(matcherFires(reg.matcher, data.solo.payload.tool_name), `${reg.key}: the payload would not match matcher "${reg.matcher}"`);
          const solo = data.solo.devflow;
          for (const [stub, p] of Object.entries(data.paired)) {
            assert.equal(p.devflow.code, solo.code, `${reg.key} beside ${stub}: exit code changed (stderr: ${p.devflow.stderr})`);
            assert.equal(
              p.devflow.stdout,
              solo.stdout,
              `${reg.key} beside ${stub}: output differs from the solo run. If it is run-dependent text, give the RUNS entry a normalize().\nsolo:   ${solo.stdout}\npaired: ${p.devflow.stdout}`
            );
          }
        });

        test('11. the composed result keeps both sides and never lifts a decision', () => {
          const event = reg.event;
          const D = compose(event, [classify(event, data.solo.devflow)]);
          assertExpected(run.expect, D, data.solo.devflow, reg.key);

          for (const [stub, p] of Object.entries(data.paired)) {
            const label = `${reg.key} beside ${stub}`;
            const dev = classify(event, p.devflow);
            const usr = classify(event, p.user);
            const U = compose(event, [usr]);
            const C = compose(event, [dev, usr]);

            // The user stub does what it is meant to (so the checks below are not vacuous on its side).
            STUB_CONTRIBUTION[stub](event, U);

            // The composed result is the sum of both sides, in handler order.
            assert.equal(C.blocked, D.blocked || U.blocked, `${label}: blocked`);
            assert.equal(C.permissionDecision, strongest(D.permissionDecision, U.permissionDecision), `${label}: permissionDecision`);
            assert.deepEqual(C.additionalContext, [...D.additionalContext, ...U.additionalContext], `${label}: additionalContext`);
            assert.deepEqual(C.systemMessages, [...D.systemMessages, ...U.systemMessages], `${label}: systemMessages`);
            assert.deepEqual(C.context, [...D.context, ...U.context], `${label}: context`);
            assert.deepEqual(C.reasons, [...D.reasons, ...U.reasons], `${label}: reasons`);
            assert.equal(C.continue, D.continue && U.continue, `${label}: continue`);
            assert.equal(C.errors.length, D.errors.length + U.errors.length, `${label}: errors`);

            // A DevFlow deny, ask or block is never lifted by the user, and the reverse.
            if (D.blocked) assert.equal(C.blocked, true, `${label}: a DevFlow block was lifted`);
            assert.ok(rank(C.permissionDecision) >= rank(D.permissionDecision), `${label}: DevFlow's decision was weakened`);
            if (U.blocked) assert.equal(C.blocked, true, `${label}: a user block was lifted`);
            assert.ok(rank(C.permissionDecision) >= rank(U.permissionDecision), `${label}: the user's decision was weakened`);
            if (stub === 'user-allow' && D.permissionDecision) {
              assert.equal(C.permissionDecision, D.permissionDecision, `${label}: a user allow changed DevFlow's decision`);
            }
          }
        });

        test('12. every DevFlow run follows the output contract', () => {
          const runs = [['solo', data.solo.devflow], ...Object.entries(data.paired).map(([s, p]) => [`beside ${s}`, p.devflow])];
          for (const [label, r] of runs) {
            assert.deepEqual(contractProblems(reg.event, r), [], `${reg.key} ${label}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
          }
        });
      });
    }
  });

  describe('13. degraded input', { concurrency: 4 }, () => {
    const DEGRADED = [
      ['empty stdin', () => ''],
      ['malformed JSON', () => '{bad json'],
      ['null', () => 'null'],
      ['an array', () => '[]'],
      ['a string', () => '"str"'],
      ['a payload whose cwd does not exist', (reg) => ({ hook_event_name: reg.event, cwd: '/nonexistent/x' })],
    ];

    for (const reg of REGS) {
      const run = RUNS[reg.key];
      if (!run || run.inProcess) continue; // an in-process hook has no stdin to degrade

      for (const [name, make] of DEGRADED) {
        test(`13. ${reg.key} survives ${name}`, async () => {
          const r = await withWorld(reg, run, async (world) => {
            const [res] = await spawnAll([devflowHandler(reg, run, world)], make(reg), {
              cwd: world.root,
              env: envFor(run, world),
              timeoutMs: DEVFLOW_TIMEOUT_MS,
            });
            return normalized(res, world, run);
          });
          assert.deepEqual(contractProblems(reg.event, r), [], `${reg.key} on ${name}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
        });
      }
    }
  });

  describe('14. two copies of the same hook at once', { concurrency: 4 }, () => {
    for (const reg of REGS) {
      const run = RUNS[reg.key];
      if (!run) continue;

      test(`14. ${reg.key}`, async () => {
        await withWorld(reg, run, async (world) => {
          const payload = run.payload({ world, cwd: world.root });
          const results = await spawnAll(
            [devflowHandler(reg, run, world, 'copy-a'), devflowHandler(reg, run, world, 'copy-b')],
            payload,
            { cwd: world.root, env: envFor(run, world), timeoutMs: DEVFLOW_TIMEOUT_MS }
          );
          for (const r of results) {
            const n = normalized(r, world, run);
            assert.deepEqual(contractProblems(reg.event, n), [], `${reg.key} ${r.name}\nstdout: ${n.stdout}\nstderr: ${n.stderr}`);
          }
          if (run.writesState) {
            assert.ok(stateFilesOf(world).length > 0, `${reg.key}: marked writesState but left no state file to check`);
          }
          assert.deepEqual(unparseableStateFiles(world), [], `${reg.key}: a state file the two copies share no longer parses`);
        });
      });
    }
  });
});
