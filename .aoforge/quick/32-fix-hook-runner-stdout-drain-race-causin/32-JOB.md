---
objective: quick-32
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/__fixtures__/hook-runner.js
  - plugins/devflow/hooks/hook-coexistence.test.js
autonomous: true
must_haves:
  truths:
    - "When a child exits before its stdout/stderr have drained, runParallel waits for 'close' and returns the full output, not the part read in the first 150 ms"
    - "A child that leaks its stdout pipe to a detached grandchild still settles, about EXIT_DRAIN_GRACE_MS (2000 ms) after it exits, with the output it wrote, code 0 and timedOut false"
    - "After the drain fallback or a timeout kill, the runner destroys the child's stdout/stderr, so a leaked pipe cannot keep the parent process alive"
    - "Test 8's existing checks still pass: a hung child is killed at its 200 ms timeout (< 3000 ms wall clock), handlers overlap, a deaf child gets no EPIPE"
    - "`node --test plugins/devflow/hooks/hook-coexistence.test.js` passes 3 runs in a row, and `npm test` has no failures beyond the baseline recorded before the change"
  artifacts:
    - path: plugins/devflow/hooks/__fixtures__/hook-runner.js
      provides: "runHandler settles on 'close', or at once on 'exit' when both streams have ended, or after EXIT_DRAIN_GRACE_MS; exported EXIT_DRAIN_GRACE_MS = 2000"
    - path: plugins/devflow/hooks/hook-coexistence.test.js
      provides: "two new tests in the 'composition model' describe, after test 8: late-drain output is kept; a leaked pipe is released after the grace"
  key_links:
    - from: "runHandler child.on('exit') (hook-runner.js ~line 306)"
      to: "settle() / the 'close' handler"
      via: "settle immediately only if child.stdout.readableEnded && child.stderr.readableEnded; otherwise arm the EXIT_DRAIN_GRACE_MS fallback and let 'close' win"
    - from: "new tests in hook-coexistence.test.js"
      to: "runner.EXIT_DRAIN_GRACE_MS"
      via: "time bounds are written relative to the exported constant"
---

# Quick 32: fix the hook-runner stdout drain race that flakes hook-coexistence in CI

## Objective

`runHandler` in `plugins/devflow/hooks/__fixtures__/hook-runner.js` settles 150 ms after the child's `exit` event,
whether or not the stdout/stderr pipes have finished draining. On a loaded CI runner the event loop is often blocked
for longer than that. The matrix runs four describes at once, and `makeWorld` makes synchronous `execFileSync('git', ...)`
calls. When the loop comes back, the timers phase runs before the poll phase, so the 150 ms timer settles with `stdout`
still `''` before the pending pipe data is read. PR #126 CI shows the result in two runs. Tests 10 and 11 got `''` for
`auto-continue.js@Stop` and `changelog-on-tag.js@PreToolUse`. A re-run failed a different case: user-garbage expected 1
error and got 0. Locally the suite passes 3/3.

The fix is to stop guessing. On `exit`, settle at once only when both streams have already ended. Otherwise wait for
`close`, and keep a long fallback (2000 ms) only for a hook that leaked its pipe to a detached grandchild.

This is a test-harness fix. No shipped hook changes, so there is no CHANGELOG entry.

## Confirmed by probe (2026-10-08, against HEAD 82ecabfe)

The planner ran both regression scenarios against the current runner and against a patched copy:

| Scenario | Current runner | Patched (readableEnded + close + 2000 ms grace + destroy) |
|---|---|---|
| child writes `A`, a grandchild on the inherited stdout writes `B`x200000 at +400 ms | settles at 173 ms, **stdout length 1** | settles at 441 ms, stdout length 200001 |
| child writes `early`, a detached grandchild holds stdout for 4 s | settles at 186 ms, then **the parent process stays alive another 3873 ms** | settles at 2024 ms, the parent exits at once |

Both new tests are therefore deterministic RED on the current code. They do not depend on CI load.

## Test list (outermost first: a subprocess running the runner, then runParallel in-process)

Hand-built child scripts only (`node -e` strings), the same pattern as test 8. No generated data, no property-based libs.

- **D-1 late drain is kept** (in-process `runParallel`): the child writes `'A'`, then spawns a grandchild with
  `stdio: ['ignore', 'inherit', 'inherit']` that does `setTimeout(() => process.stdout.write('B'.repeat(200000)), 400)`.
  The child unrefs the grandchild and exits naturally. Use `timeoutMs: 10000`. Assert
  `r.stdout === 'A' + 'B'.repeat(200000)` (check the length first so a failure message stays short), `r.code === 0` and
  `r.timedOut === false`. The 200000 bytes are larger than a 64 KB pipe buffer, so the drain takes several reads.
- **D-2 leaked pipe is released** (subprocess): a `node -e` subprocess requires the runner and runs one handler. That
  handler writes `'early'`, spawns a grandchild with `detached: true` and `stdio: ['ignore', 'inherit', 'inherit']`
  running `setTimeout(()=>{},10000)`, writes the grandchild's pid to stderr, unrefs it and exits naturally. The
  subprocess writes `JSON.stringify(result)` to its own stdout and then exits naturally (no `process.exit`). The test
  measures the subprocess's wall time to exit and asserts:
  - the subprocess exits with code 0 within `EXIT_DRAIN_GRACE_MS + 4000` ms. The grandchild sleeps 10000 ms, so a
    runner that still holds the pipe fails this.
  - `r.stdout === 'early'`, `r.code === 0`, `r.timedOut === false`.
  - `r.ms < EXIT_DRAIN_GRACE_MS + 3000`.
  - Cleanup in `finally`: `process.kill(Number(r.stderr), 'SIGKILL')` inside try/catch, so the grandchild never
    outlives the test, pass or fail.

<embedded_context>
<codebase_examples>
Current settle logic (hook-runner.js lines 304-314). This is the code being replaced:

```js
    child.on('error', (e) => settle({ code: 1, stderr: `${stderr}${e.message}` }));
    let exitCode = null;
    child.on('exit', (code, signal) => {
      exitCode = code === null ? (signal ? 1 : 0) : code;
      // The streams normally close with the process; a hook that leaks a pipe to a detached child must not hang us.
      setTimeout(() => settle({ code: exitCode, stdout, stderr }), 150).unref();
    });
    child.on('close', (code, signal) => {
      settle({ code: code === null ? (signal ? 1 : 0) : code, stdout, stderr });
    });
```

The kill timer (lines 295-298) is armed at spawn. `settle` clears `timer` and is idempotent (`if (settled) return`).

Test 8's handler shape and env, to copy for D-1 (hook-coexistence.test.js ~207-260):

```js
    const env = { PATH: process.env.PATH };
    const mixed = await runParallel(
      [
        { name: 'hangs', args: ['-e', 'setTimeout(()=>{},10000)'], timeoutMs: 200 },
        { name: 'fast', args: ['-e', "process.stdout.write('done')"] },
        ...
      ],
      payload,
      { cwd: process.cwd(), env, timeoutMs: 5000 }
    );
    assert.ok(Date.now() - t1 < 3000, 'the hung child was killed at its timeout');
```

The test file imports `fs`, `os`, `path` and `node:test`/`node:assert/strict`. It does not import `child_process` yet.
Inside `describe('composition model')` the runner is destructured as `const { classifyOutput, composeEvent, runParallel } = runner;`.
The tests are numbered by spec item. Name the new ones `'8. runParallel keeps output that drains after the child exits'`
and `'8. a pipe leaked to a detached grandchild is released after the drain grace'`, so they sit under item 8 (runParallel).
</codebase_examples>

<anti_patterns>
- Do not just raise the 150 ms timer. Any fixed delay after `exit` loses the race on a slow enough runner. `close` is the
  only real "all output read" signal.
- Do not call `process.exit()` in a child or subprocess right after `stdout.write`. Pipe writes can be async on macOS
  and get truncated. Let the process exit naturally.
- Do not assert a lower time bound on D-2 ("waited at least 2000 ms"). Only upper bounds, and only with generous margins.
  test 8 already sets that standard so a loaded machine cannot flake it.
- Do not use port 8080 or start any server. None is needed.
- Do not leave the 10 s grandchild running. Always kill it in `finally`.
</anti_patterns>

<error_recovery>
- If D-1 passes on the current code (it should not), check that the grandchild really inherits the child's stdout
  (`'inherit'` for fd 1) and that the child does not wait for it. The probe got 1 byte with exactly this shape.
- If test 8's "hung child was killed at its timeout" check regresses, the kill-timer path changed. Timeout settling must
  stay immediate (SIGKILL + `settle({ timedOut: true })`), not wait for `close`.
- If `npm test` shows new failures outside hook-coexistence.test.js, compare them with the baseline names from Task 1
  step 0. Known pre-existing failures (STATE.md): MA-7 handoff-e2e and devflow-watch/handoff-e2e.
</error_recovery>
</embedded_context>

<validation_gates>
- task: `npm test` (from `df-tools stack command test`)
- scoped: `node --test plugins/devflow/hooks/hook-coexistence.test.js` (the stack's `test_scoped` is empty, so this is the file-level form)
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>RED: add late-drain and leaked-pipe regression tests for runParallel</name>
  <files>plugins/devflow/hooks/hook-coexistence.test.js, plugins/devflow/hooks/__fixtures__/hook-runner.js</files>
  <action>
Step 0 (baseline): run `npm test 2>&1 | tail -40` once before any edit and write down the names of the failing tests.
These are the known failures that Task 2's gate compares against.

1. In hook-runner.js, add only the constant so the tests can import it, with no behaviour change yet:
   `const EXIT_DRAIN_GRACE_MS = 2000;` near the top (after the `spawn` require), with a one-line comment saying it is
   the bound for a hook that leaks its stdout/stderr pipe to a process that outlives it. Add it to `module.exports`.
2. In hook-coexistence.test.js, add `const { execFile } = require('child_process');` with the other requires. Add
   D-1 and D-2 from the Test list as two new `test(...)` blocks right after test 8, inside `describe('composition model')`.
   Read the constant as `runner.EXIT_DRAIN_GRACE_MS`.
   - D-1 child script (one `-e` string):
     `process.stdout.write('A');require('child_process').spawn(process.execPath,['-e',"setTimeout(()=>process.stdout.write('B'.repeat(200000)),400)"],{stdio:['ignore','inherit','inherit']}).unref();`
   - D-2: build the subprocess script with `JSON.stringify(path.join(__dirname, '__fixtures__', 'hook-runner.js'))` as
     the require path. The subprocess runs `runParallel([{ name: 'leak', args: ['-e', LEAK] }], {}, { cwd: process.cwd(),
     env: { PATH: process.env.PATH }, timeoutMs: 20000 })` and then `.then(([r]) => process.stdout.write(JSON.stringify(r)))`.
     LEAK is
     `process.stdout.write('early');const g=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{detached:true,stdio:['ignore','inherit','inherit']});process.stderr.write(String(g.pid));g.unref();`
     Run it with `execFile(process.execPath, ['-e', script], { timeout: 20000, env: { PATH: process.env.PATH } }, cb)`
     wrapped in a Promise. Measure `Date.now()` around it. Parse the pid defensively (`Number.parseInt(r.stderr, 10)`)
     and kill it in `finally`.
3. Run `node --test plugins/devflow/hooks/hook-coexistence.test.js`. Both new tests must FAIL. D-1 gets a stdout length
   of 1. D-2 sees the subprocess exit at about 10000 ms, past the `EXIT_DRAIN_GRACE_MS + 4000` bound. Every other test
   must still pass.
4. Commit RED: `node ~/.claude/devflow/bin/df-tools.cjs commit "test(hooks): runParallel loses output that drains after exit (RED)" --files plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/hooks/__fixtures__/hook-runner.js`
  </action>
  <verify>`node --test plugins/devflow/hooks/hook-coexistence.test.js 2>&1 | grep -E "^not ok|# (pass|fail)"` shows exactly the two new tests failing, everything else passing. The commit exists (`git log -1 --oneline`).</verify>
  <done>Two new item-8 tests exist, both fail for the documented reasons on the current runner, the constant is exported, and the RED commit is made through df-tools.</done>
  <recovery>If either test passes on the unfixed runner, the scenario is not exercising the race. Re-check the stdio inheritance (see error_recovery) before committing. A RED that is not red proves nothing.</recovery>
</task>

<task type="auto" tdd="true">
  <name>GREEN: settle on close, with a 2000 ms drain grace and stream release</name>
  <files>plugins/devflow/hooks/__fixtures__/hook-runner.js</files>
  <action>
Rewrite the child-process half of `runHandler` (lines ~294-313). Keep the `inProcess` path, `settle`, stdin handling
and the `error` handler as they are.

Approach:
1. Add `const release = () => { child.stdout.destroy(); child.stderr.destroy(); };`.
2. Kill timer: `child.kill('SIGKILL'); settle({ timedOut: true }); release();`. Timeout settling stays immediate, and
   releasing also drops a pipe a killed hook may have leaked.
3. `child.on('exit', (code, signal) => { ... })`:
   - set `exitCode` as now.
   - `clearTimeout(timer)`. The process is gone, so its timeout no longer applies, and a hook that exits but leaks a
     pipe must not be reported as `timedOut`.
   - if `child.stdout.readableEnded && child.stderr.readableEnded`, call `settle({ code: exitCode, stdout, stderr })`
     and return.
   - otherwise `setTimeout(() => { settle({ code: exitCode, stdout, stderr }); release(); }, EXIT_DRAIN_GRACE_MS).unref();`
4. Keep the `close` handler as the normal path: `settle({ code: ..., stdout, stderr })`.
5. Replace the old comment with one that says why. `exit` can arrive before the pipes drain, and on a loaded runner a
   short timer fires before the pending data is read. `close` is the real end of output, and the grace only bounds a
   pipe leaked to a process that outlives the hook.
6. Update the JSDoc on `runParallel`/`runHandler` with one sentence on the drain rule and the grace.

# CRITICAL: `settle` must stay idempotent. `close` and the fallback can both fire, and the first one wins.
# GOTCHA: `.unref()` on the grace timer is fine. The ref'd pipes keep the loop alive until it fires, and once the
#         streams are destroyed nothing holds the process.

Then:
- `node --test plugins/devflow/hooks/hook-coexistence.test.js` 3 times in a row (separate runs). All must pass,
  including test 8's timeout check and both new tests.
- `npm test 2>&1 | tail -40`. The failing-test names must be a subset of the Task 1 step 0 baseline.
- Commit GREEN: `node ~/.claude/devflow/bin/df-tools.cjs commit "fix(hooks): hook-runner waits for stdout to drain before settling" --files plugins/devflow/hooks/__fixtures__/hook-runner.js`
- Do NOT push.
  </action>
  <verify>`for i in 1 2 3; do node --test plugins/devflow/hooks/hook-coexistence.test.js 2>&1 | grep -E "^# (pass|fail)"; done` prints `# fail 0` three times. `npm test` failures are all in the baseline set. `git log -2 --oneline` shows the RED and GREEN commits and `git status` shows nothing unpushed-but-uncommitted for these two files.</verify>
  <done>runHandler never settles a non-timed-out child before its output has ended (or the 2000 ms leak grace has passed), destroys the streams after a fallback or timeout, the coexistence suite is green 3/3, the full suite shows only baseline failures, and the fix is committed but not pushed.</done>
  <recovery>If test 8's 'hung child was killed at its timeout' fails, the kill-timer path is waiting on `close`. Restore the immediate `settle({ timedOut: true })`. If a matrix test now takes about 2 s longer per handler, some registered hook leaks a pipe: find it with a temporary `console.error(name)` in the grace callback, remove the log, and report the hook in the SUMMARY rather than shortening the grace.</recovery>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/hooks/hook-coexistence.test.js` passes 3 consecutive runs.
- `npm test` shows no failures beyond the Task 1 baseline.
- `git log -2 --oneline` shows `test(hooks): ...` then `fix(hooks): ...`, both made through df-tools commit. Nothing pushed.
</verification>

<success_criteria>
- Output that drains after `exit` is captured in full (D-1 green).
- A leaked pipe settles in about 2000 ms and no longer holds the parent process (D-2 green).
- Existing test 8 behaviour unchanged: overlap, raw payload, deaf child, hung child killed at its timeout.
- Only the two listed files changed.
</success_criteria>

<output>
Write `.planning/quick/32-fix-hook-runner-stdout-drain-race-causin/32-SUMMARY.md` through the quick summary verb. Include the
baseline failing-test names, the 3 coexistence run results, the full-suite counts and both commit hashes. If any
registered hook was found leaking a pipe, name it.
</output>
