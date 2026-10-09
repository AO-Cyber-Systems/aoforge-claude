---
objective: 67-minutes-recalibration
trd: "02"
subsystem: estimation
tags: [calibrate, calibration-v3, method-identity, cutoff, EST-10]
requires:
  - phase: 67-01
    provides: DECISION-003 (method option-b, fallback option-a; calibration version 3 names the method)
provides:
  - "calibration version 3 with a `method {minutes, window_objectives, through_objective}` block, part of inputs_digest"
  - "collectProject(root, {through}): the cutoff applied at collection, before anything is read or counted"
  - "df-tools calibrate --minutes <task_sum|trd_level> --through <N>"
  - "FUTURE_SPEC / pastSpec fixtures: the hand-built 64-72 project for the cutoff proof"
affects: [67-03, 67-04, 67-05, 67-09]
tech-stack:
  added: []
  patterns: ["option validated up front, recorded in the output and the digest (copied from the 64-08 window)"]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
    - scripts/estimate-window-eval.cjs
key-decisions:
  - "The calibrator records the minutes method and computes nothing new for it; task_sum and trd_level builds share every statistic block and differ only in method, notes and inputs_digest."
  - "method holds the REQUESTED window and cutoff even when nothing was dropped, so a window of 99 and a window of 10 are different calibrations by identity although they hold the same statistics."
  - "DEFAULT_MINUTES_METHOD stays task_sum here; 67-05 sets it from the pre-registered ship rule of DECISION-003."
requirements-completed: []
duration: 23min
completed: 2026-10-08
tokens_input: 18644625
tokens_output: 78401
tokens_cache_read: 18183610
tokens_cache_write: 460801
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 02: calibrate names its method and enforces a cutoff Summary

**Calibration version 3 names its minutes method, window and cutoff in a `method` block that is part of `inputs_digest`, and `--through N` cuts the project inside collection so objectives 67-72 provably cannot reach a through-66 calibration.**

## Performance

- Duration: 23 min (2026-10-08T13:30Z to 13:53Z)
- Tasks: 3 of 3, each as a RED commit then a GREEN commit
- Files: 10 modified (4 library or CLI sources, the df-tools header, 3 test files, the fixture and the 64 selection script); 603 insertions, 54 deletions including the SUMMARY checkpoints

## Progress
- [x] Task 1: FUTURE_SPEC fixture builder and the collection cutoff in calibration-inputs — RED 9b08035b, GREEN 0f9f40a4
- [x] Task 2: Calibration v3 method block, minutes and through options, digest and notes; pin the 64 selection script — RED a4b95176, GREEN 58f01e34
- [x] Task 3: calibrate --minutes and --through flags, summary text, help and header — RED 29804229, GREEN 4f1b937c

## Accomplishments

- **Cutoff at collection.** `collectProject(root, {through})` filters the objective directory list right after listing it (before any TRD or SUMMARY file is read) and filters the STATE_ARCHIVE and state.json metric rows before any count or join. A directory with no number is out under a cutoff. The `counts` and `metrics` blocks of a cut project equal those of a project that never had the later objectives.
- **Method identity.** `buildCalibration({minutes, through})` adds `method: {minutes, window_objectives, through_objective}` (the requested values), puts the same object in the digest payload, and appends the through note and the trd_level note after the window note.
- **CLI.** `calibrate --minutes <task_sum|trd_level> --through <N>`: validated as usage errors that name the flag, passed through, named in the summary line (` · minutes M`, then ` · through objective N` when set) and in the result JSON (`method`). USAGE, header comment, help usage and details, the df-tools header and the `case 'calibrate'` comment name both flags.
- **64 selection pinned.** The three `buildCalibration` calls in `scripts/estimate-window-eval.cjs` pass `minutes: 'task_sum'`.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1: FUTURE_SPEC fixture and collection cutoff | 9b08035b | 0f9f40a4 |
| 2: calibration v3 method block, options, digest, notes; pin the 64 script | a4b95176 | 58f01e34 |
| 3: `--minutes` and `--through` flags, summary text, help, header | 29804229 | 4f1b937c |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: cutoff in calibration-inputs | `node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` (96 tests) | 0 | PASS |
| 1: no behaviour change without `through` | `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` (before the version bump) | 0 | PASS |
| 2: calibrator v3 | `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` (72 tests) | 0 | PASS |
| 2: 64 selection script pinned | `node --test scripts/estimate-window-eval.test.cjs` (41 tests, unchanged); `rg -n "minutes: 'task_sum'" scripts/estimate-window-eval.cjs` shows 3 call sites | 0 | PASS |
| 2: constants present | `rg -n "CALIBRATION_VERSION = 3\|DEFAULT_MINUTES_METHOD = 'task_sum'" plugins/devflow/devflow/bin/lib/calibrator.cjs` finds both | 0 | PASS |
| 3: CLI end to end | `node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs` (36 tests) | 0 | PASS |
| 3: bad flag | `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --minutes nope --no-overhead --out <scratch>/never.json`: exit 1, `--minutes must be task_sum or trd_level, got "nope"`, nothing written | 1 (expected) | PASS |
| 3: dispatch | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test --test-name-pattern="67-02" plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` | 1 | FAIL (correct: `objectives` held all ten directories, `ci.assertThrough` was not a function) |
| GREEN (task 1) | same file, whole | 0 | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="67-02" plugins/devflow/devflow/bin/lib/calibrator.test.cjs` | 1 | FAIL (correct: `through` ignored, 10 TRDs against 3; no `method`) |
| GREEN (task 2) | same file, whole | 0 | PASS (correct, after the deliberate changes below) |
| RED (task 3) | `node --test --test-name-pattern="67-02" plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs` | 1 | FAIL (correct: `unknown flag --minutes for calibrate`) |
| GREEN (task 3) | same file, whole | 0 | PASS (36/36, after the deliberate changes below) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on calibrate-cli, calibrator, calibration-inputs and estimate-window-eval tests | 0 | PASS (96 + 72 + 36 + 41 tests) |
| test (full) | `npm test` | 1 | PASS with the known environment failures only (see below) |

Full suite: 11163 tests, 11103 pass, 10 fail, 0 cancelled, 50 skipped. The 10 failures are the environment failures the TRD names for a provisioned worktree: nine node-pty tests (3 in `devflow-watch.test.cjs`, 6 in `handoff-e2e.test.cjs`; no `node_modules` here) and `roadmap-reconcile.test.cjs` E2E1, which reports this TRD's own ROADMAP box as unticked while its SUMMARY exists (re-checked after the roadmap update, below). No other failure.

## Deliberate test changes (before and after)

`calibrator.test.cjs`
- 57-05 test 1, 58-03 test 7 and 64-08 test 1: `assert.equal(cal.version, 2)` became `assert.equal(cal.version, CALIBRATION_VERSION)`.
- 57-05 "exports CALIBRATION_VERSION 2": retitled "3" and `assert.equal(CALIBRATION_VERSION, 2)` became `3`. (Not on the TRD's list; it asserts the version, so it is a deliberate change by the TRD's own rule.)
- 64-08 test 2 (a window that drops nothing): the whole-text equality of `window: null`, `7` and `99` with the default build became, per window, equality of everything except `method` and `inputs_digest` (`withoutIdentity`), `method.window_objectives` equal to the requested value, a different `inputs_digest`; plus whole-text equality of `{}` and `{window: 10}`. The absent-`window`-key, notes-length and omitted-arguments assertions are unchanged.
- 64-08 test 4 (an objective with no outcome consumes no window slot): `stableStringify(three) === stableStringify(build([root]))` between `window: 3` and the default became `withoutIdentity` equality plus `three.method.window_objectives === 3`. (Not on the TRD's list; same cause as test 2.)
- 64-10 test 3: whole-text equality of `window: null` with `window: 15` became `withoutIdentity` equality, `method.window_objectives` null and 15, and whole-text equality of two `window: 15` builds. The `notEqual` against the default build is unchanged.
- 64-10 test 5: whole-text equality of the default with `window: null` became `withoutIdentity` equality, `method.window_objectives` 10 and null, and whole-text equality of the default with `window: 10`.

`calibrate-cli.test.cjs`
- Test 1 (line 191): `written.version, 2` became `3`; added `written.method` and `result.method` assertions.
- Tests 12 and 12b: byte equality of files built with `--window all` or `--window 50` against the default became equality of everything except `method` and `inputs_digest`, with `method.window_objectives` null and 50; 12b also asserts the files are no longer byte-equal. (Not on the TRD's list; same cause.)
- Tests 8, 58-03/1, 58-03/2 and 58-03/4: summary-text endings gained ` · minutes task_sum` (the TRD says the minutes text is appended always).

No assertion was loosened: each replaced equality is split into equality of the statistics plus an assertion on the identity that now differs.

## Decisions Made

- `assertThrough` lives in `calibration-inputs.cjs` and is called by both `collectProject` and `buildCalibration`, so a bad cutoff fails before any file is read, from either entry point.
- `--through` accepts a decimal (for example 65.5) because objective numbers can be decimal; the regex is the TRD's `/^\d+(?:\.\d+)?$/` plus a safe-magnitude check.
- The through-note text and the trd_level note are the TRD's strings, verbatim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The `notes-x` fixture TRD would not have counted as a sample**
- **Found during:** Task 1 (designing FUTURE_SPEC)
- **Issue:** The fixture writes a no-number directory's files as `notes-x-01-work-TRD.md`, which does not match the TRD key shape, so it would be counted as `unkeyed` and never reach `samples.trds`. The TRD's control ("`samples.trds` is 10 against 3") and the point of the `notes-x` case (a no-number directory with a real 90-minute TRD that only the cutoff keeps out) would both have been vacuous.
- **Fix:** Added an optional `trdName` override to `makeCalibrationProject` (beside the existing `summaryName`) and gave `notes-x` keyed names `99-01-work-TRD.md` and `99-01-SUMMARY.md`. No existing spec uses it.
- **Files modified:** `__fixtures__/calibration-fixtures.cjs`
- **Commit:** 9b08035b

**2. [Rule 3 - Blocking] A help string broke on an apostrophe**
- **Found during:** Task 3
- **Issue:** The new `details` text in `help.cjs` used "TRD's" and "calibration's" inside a single-quoted string; every spawned df-tools call failed to load (36 failures).
- **Fix:** Reworded both phrases. `node --check` on the file passes.
- **Commit:** 4f1b937c

**3. [Rule 1 - Bug] Help text said a window that drops nothing "leaves the file unchanged"**
- **Issue:** False under version 3: the file now names the requested window in `method`.
- **Fix:** Reworded to "leaves no `window` block in the file" and described `method`, `--minutes` and `--through` in the same details string (Principle 13, keep docs true).
- **Commit:** 4f1b937c

### Scope notes

- **Docs not touched.** `CLAUDE.md`, `docs/USER-GUIDE.md` and `CHANGELOG.md` still describe calibration version 2 and the `calibrate` flags without the two new ones. They are outside this TRD's file list; objective 67's TRD 67-05 ("ship default and docs") owns them.
- **Nothing real was scored.** No `estimate backtest`, no `estimate-*` script on real data, no `calibrate` of this repository. `~/.claude/devflow/calibration.json` is `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648` before and after.
- The installed runtime at `~/.claude/devflow/` is the pre-change mirror, so `calibrate --minutes` against it still says `unknown flag`. The new flags exist in this branch's `plugins/devflow/devflow/bin/` only; the release TRDs re-sync the runtime.

## Auth gates

None.

## Discovered commands

None: the profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## Issues Encountered

- `npm test -- --test-reporter-destination=...` passes the flags after the quoted globs and the destination is not honoured; the run printed to stdout and was read from the task output instead. No effect on the result.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the apostrophe in `help.cjs`)
- Must-haves verified: 6/6 (see below)
- Gate failures: none beyond the known environment failures

Must-haves:
1. `buildCalibration` writes version 3 with `method` naming the requested minutes, window and cutoff, inside `inputs_digest`: calibrator tests 7, 10, 13.
2. `through: N` drops later and no-number directories and their archive and state.json rows at collection; a project with objectives 67-72, a no-number directory, their archive rows and a metrics_log entry gives a through-66 calibration byte-identical to the project without them, for both methods and both window settings, while without the cutoff the two differ (10 against 3 TRDs): calibrator test 6, inputs tests 1 and 2.
3. Unchanged inputs and options are byte-identical, a second `writeCalibration` reports `changed: false`; the two methods share every statistic block: tests 6, 8, 10.
4. `calibrate --minutes <m> --through <N>` passes both through, names them in the summary and the result JSON; bad values are usage errors naming the flag; help and the header name both: CLI tests 15 to 20.
5. `scripts/estimate-window-eval.cjs` pins `minutes: 'task_sum'` at all three calls; its 41 tests pass unchanged.
6. No real objective scored; the live calibration hash is unchanged.

## Self-Check: PASSED

- Files exist: all ten modified files and `.planning/objectives/67-minutes-recalibration/67-02-SUMMARY.md` (FOUND).
- Commits exist: 9b08035b, 0f9f40a4, a4b95176, 58f01e34, 29804229, 4f1b937c (FOUND in `git log 73358ced..HEAD`).
- Live calibration hash unchanged.
