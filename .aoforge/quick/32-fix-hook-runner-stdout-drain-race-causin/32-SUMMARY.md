---
objective: quick-32
trd: 01
subsystem: hooks-test-harness
tags: [hooks, flake, test-harness, child_process]
requires: []
provides:
  - "hook-runner settles on close, not 150 ms after exit"
  - "EXIT_DRAIN_GRACE_MS = 2000 exported from the runner"
affects: [plugins/devflow/hooks/hook-coexistence.test.js]
key-files:
  modified:
    - plugins/devflow/hooks/__fixtures__/hook-runner.js
    - plugins/devflow/hooks/hook-coexistence.test.js
decisions:
  - "No CHANGELOG entry: test-harness fix, no shipped hook changed"
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-08
---

# Quick 32: hook-runner stdout drain race Summary

`runHandler` now settles a child on `close` (or at once on `exit` when both streams have ended), with a 2000 ms fallback only for a pipe leaked to a detached process, and it destroys the pipes after a fallback or a timeout.

## Progress
- [x] Task 1: RED, late-drain and leaked-pipe regression tests, 433e6804
- [x] Task 2: GREEN, settle on close with a 2000 ms drain grace and stream release, 1e12f7f0

## What changed

`plugins/devflow/hooks/__fixtures__/hook-runner.js`
- Added and exported `EXIT_DRAIN_GRACE_MS = 2000`.
- `exit` handler: sets `exitCode`, clears the kill timer (the process is gone, so a hook that exits but leaks a pipe is not reported `timedOut`), settles at once if `stdout.readableEnded && stderr.readableEnded`, otherwise arms an unref'd `EXIT_DRAIN_GRACE_MS` fallback that settles and then releases the pipes. `close` stays the normal settle path.
- Kill timer: still `SIGKILL` plus an immediate `settle({ timedOut: true })`, now followed by `release()` (destroy stdout and stderr).
- `settle` is unchanged and idempotent, so `close` and the fallback cannot double-resolve.
- JSDoc on `runHandler` and `runParallel` states the drain rule and the grace.

`plugins/devflow/hooks/hook-coexistence.test.js`
- `execFile` import.
- Two tests after test 8, both named under item 8:
  - `8. runParallel keeps output that drains after the child exits`: 200000 bytes written by a grandchild 400 ms after the child exits; asserts the full `'A' + 'B'x200000`, code 0, `timedOut` false.
  - `8. a pipe leaked to a detached grandchild is released after the drain grace`: a subprocess runs the runner against a handler that leaks a 10 s detached grandchild; asserts only upper bounds (subprocess wall time `< GRACE + 4000`, `r.ms < GRACE + 3000`), `r.stdout === 'early'`, code 0, `timedOut` false. The grandchild is SIGKILLed in `finally`.

## Deviations from Plan

None. The TRD was executed as written.

One note on the baseline: the TRD's error_recovery lists MA-7 handoff-e2e and devflow-watch/handoff-e2e as known pre-existing failures. The baseline run before any edit had **0 failures**, so there were none to compare against.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 1 | PASS (correct: exactly the 2 new tests failed) |
| 2: GREEN | `node --test plugins/devflow/hooks/hook-coexistence.test.js` (x3) | 0, 0, 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 1 | FAIL (correct) |
| GREEN | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 0 | PASS (correct) |

RED output (217 tests, 215 pass, 2 fail):
- D-1: `only 1 of 200001 bytes were kept` (the 150 ms timer settled before the late output drained).
- D-2: `the subprocess took 10072 ms: the runner kept the leaked pipe` (the parent stayed alive until the 10 s grandchild exited).

## Validation Gate Results

| Gate | Command | Result | Status |
|---|---|---|---|
| test | `npm test` | 11073 tests, 11039 pass, 0 fail, 34 skipped | PASS |
| scoped | `node --test plugins/devflow/hooks/hook-coexistence.test.js` | 217/217, 3 consecutive runs | PASS |
| lint | none defined for this repo | not_available | n/a |

### npm test against the pre-edit baseline

| | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline (HEAD 82ecabfe, before any edit) | 11071 | 11037 | 0 | 34 |
| After the fix | 11073 | 11039 | 0 | 34 |

The only difference is the two new tests, both passing. No failures before or after. Full-suite wall time went from 86 s to 146 s, but the machine load average was 22 at the time (other work running), and the runner fixture is used by `hook-coexistence.test.js` alone (`rg hook-runner`), so the change is not the cause.

### Coexistence suite after the fix

| Run | Condition | tests | pass | fail | duration |
|---|---|---|---|---|---|
| 1 | sequential | 217 | 217 | 0 | 10.2 s |
| 2 | sequential | 217 | 217 | 0 | 10.1 s |
| 3 | sequential | 217 | 217 | 0 | 10.2 s |
| L1 | 3 copies in parallel + 6 CPU-spinning node processes | 217 | 217 | 0 | 19.7 s |
| L2 | same | 217 | 217 | 0 | 19.2 s |
| L3 | same | 217 | 217 | 0 | 19.6 s |

Every run exited 0. The loaded runs took about twice as long as the unloaded ones, so the load was real. The late-drain test took about 446 ms and the leaked-pipe test about 2051 ms in every loaded run.

Not done: I did not re-run the loaded scenario against the unfixed runner to see whether the original CI flake reproduces under it. The deterministic RED tests (D-1, D-2) cover the mechanism instead, so the fix does not rely on load to show it.

## Hooks that leak a pipe

None found. The matrix describe takes 6.7 to 6.8 s after the fix, against 6.76 s before it. A registered hook that leaked a pipe would add about 2 s per handler.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
- Gate failures: None

## Notes for the orchestrator

- Both commits went through `df-tools commit`. Nothing was pushed.
- Quick tasks do not touch ROADMAP.md, and no state verbs were run; this draft is saved by `quick summary`.
- The scratch output of the runs above is under the session scratchpad, not in the repo.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/__fixtures__/hook-runner.js
- FOUND: plugins/devflow/hooks/hook-coexistence.test.js
- FOUND commit 433e6804 (test RED), FOUND commit 1e12f7f0 (fix GREEN); `git log -3` shows both above 82ecabfe
- Only the two listed files changed in `plugins/`
- No leftover grandchild processes after the RED run (`pgrep` empty)
