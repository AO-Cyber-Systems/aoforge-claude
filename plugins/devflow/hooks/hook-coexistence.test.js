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

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const runner = require('./__fixtures__/hook-runner.js');

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
    const echoAfter = (name, ms) => ({
      name,
      args: [
        '-e',
        `let b='';process.stdin.on('data',d=>b+=d).on('end',()=>setTimeout(()=>process.stdout.write(b),${ms}))`,
      ],
    });

    // Two 300 ms sleepers finish in well under 600 ms: they ran concurrently.
    const payload = { hook_event_name: 'Stop', n: 7 };
    const t0 = Date.now();
    const both = await runParallel([echoAfter('a', 300), echoAfter('b', 300)], payload, { cwd: process.cwd(), env });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 600, `two 300 ms handlers took ${elapsed} ms: they ran one after the other`);
    assert.deepEqual(both.map((r) => r.name), ['a', 'b'], 'results come back in handler order');
    for (const r of both) {
      assert.equal(r.code, 0);
      assert.equal(r.timedOut, false);
      assert.equal(r.stdout, JSON.stringify(payload), 'each handler reads the same stdin payload');
    }

    // A raw string payload is written as is (degraded-input runs rely on this).
    const [raw] = await runParallel([echoAfter('raw', 0)], '{bad json', { cwd: process.cwd(), env });
    assert.equal(raw.stdout, '{bad json');

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
});
