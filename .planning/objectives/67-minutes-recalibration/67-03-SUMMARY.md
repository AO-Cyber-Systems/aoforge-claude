---
objective: 67-minutes-recalibration
job: "03"
subsystem: estimation
tags: [EST-10, minutes-method, estimator, calibration-v3, trd-level-minutes]

requires:
  - objective: 67-minutes-recalibration
    provides: "DECISION-003 (resolved): method {minutes: trd_level, window_objectives: 10, through_objective: 66}, fallback task_sum"
provides:
  - "estimate.cjs reads calibration versions 1, 2 and 3; refuses a version 3 file without a method block or with an unknown minutes method, naming df-tools calibrate"
  - "estimate.cjs exports KNOWN_MINUTES_METHODS and minutesMethod(cal); under trd_level a TRD with an auto task gets exactly the calibration's trd_level.minutes p50/P90"
  - "every TRD estimate carries minutes_basis and minutes_samples; every df-tools estimate result carries calibration.method (null for version 1 or 2); the run state of estimate start records it beside inputs_digest"
  - "estimate-format names the minutes method in the calibration sentence and in the backtest footer"
  - "makeCalibrationV3 fixture builder in __fixtures__/estimate-fixtures.cjs"
affects: [67-05, 67-09]

tech-stack:
  added: []
  patterns:
    - "method-selected minutes: the calibration names how a TRD's minutes are made, and every result names the method that made them"
    - "no data, no number: a trd_level calibration with no TRD-level minutes samples gives null minutes, never the task sum"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/estimate.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/estimate.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs

key-decisions:
  - "minutes_basis reports the calibration's method on every TRD estimate, including a TRD with no minutes (checkpoint-only, or no TRD-level samples); minutes_samples is the TRD-level count only when a stat exists"
  - "The calibration sentence is part of the objective and milestone --table text (the plain --raw line carries no calibration sentence), so the method is named there"
  - "In the backtest footer the method is written as ', minutes <m>' before inputs_digest, without the window and cut parts"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-08
tokens_input: 9984200
tokens_output: 58636
tokens_cache_read: 9804179
tokens_cache_write: 179879
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 03: The estimator takes a TRD's minutes from TRD-level history when the calibration says so Summary

**With a version 3 calibration whose `method.minutes` is `trd_level`, a TRD's minutes are exactly the calibration's `trd_level.minutes` p50 and P90 whatever its task count (a one-task and a three-task TRD both give 12 / 45); tokens, cost and the objective composition are unchanged, version 1 and 2 files estimate as before, and every estimate result, the run state and the text name the minutes method.**

## Progress
- [x] Task 1: Version 3 fixture builder, loader checks and minutesMethod — 122c2b6c (RED), 79e7b602 (GREEN)
- [x] Task 2: TRD-level minutes in estimateTrdText, the confidence cap, and the rollup proof — 3d3be91d (RED), 19c2819d (GREEN)
- [x] Task 3: Name the method in every estimate result, the run state and the text — a2d0d0e4 (RED), 4b3eaced (GREEN)

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-08T13:30:16Z
- **Completed:** 2026-10-08T13:40:30Z
- **Tasks:** 3 (6 commits: three RED, three GREEN)
- **Files modified:** 8 (4 source/fixture, 4 test files; plus this SUMMARY)

## What changed

- **Loader (`estimate.cjs`).** `SUPPORTED_VERSIONS` is `[1, 2, 3]`, so the refusal for any other version reads `reads versions 1, 2 and 3`. A version 3 file needs a plain-object `method` whose `minutes` is in `KNOWN_MINUTES_METHODS` (`['task_sum', 'trd_level']`, frozen, local to the file): no block gives `version 3 without a method block`, an unknown one gives `names minutes method "median", which this estimator does not know`, and both name `df-tools calibrate`. Versions 1 and 2 need no `method`. `minutesMethod(cal)` is `cal.method.minutes`, else `task_sum`.
- **TRD minutes (`estimateTrdText`).** Totals are built as before; under `trd_level` with at least one auto task `totals.minutes` is replaced by the exact `{p50, p90}` of `usableStat(cal.trd_level, 'minutes')` (not refitted, not scaled), with the note `minutes from TRD-level history (n=<n> TRDs), not the sum of task minutes`. With no usable TRD-level stat minutes is null, lands in `missing` and in the existing `no samples for minutes` note; there is no task-sum fallback. `missing` is now built after this step. `tasks[]` keep their class minutes.
- **Confidence cap.** With a stat, if `confidenceFor(stat.n)` is below the tasks' verdict the TRD takes it and `weakest` becomes `{name: 'TRD-level minutes', label, p50, class: null, n}`. With n 40 the tasks decide, as under task_sum.
- **Result fields.** Every TRD estimate gains `minutes_basis` and `minutes_samples`.
- **CLI.** `loadCal` meta gains `method` (the file's block, or null); JSON results, the `estimate start` run state and the backtest identity inherit it.
- **Text.** The calibration sentence reads `Calibration 2026-10-05, 50 TRDs, minutes trd_level (window 10, through objective 66).` (only the non-null parts; `, minutes task_sum.` when both are null; byte-identical with no method block). The backtest footer gains `minutes <m>, ` before `inputs_digest`.
- **Not touched:** `estimate-rollup.cjs`, `estimate-backtest.cjs`, every calibrator file, `help.cjs`, `df-tools.cjs` (confirmed with `git diff --stat 73358ced..HEAD`). The rollup composes `trd.minutes` whatever produced it; test 9 in `estimate-rollup.test.cjs` proves it (agent minutes of a two-TRD objective equal `em.summarize(em.sumCorrelated([fit(12,45), fit(12,45)]))`, 26.244139884112773 / 87.62100705046149 within 1e-9).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder, loader checks, minutesMethod | `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` | 0 (17 tests, 17 pass) | PASS |
| 2: TRD-level minutes, confidence cap, rollup proof | `node --test estimate.test.cjs estimate-rollup.test.cjs estimate-milestone.test.cjs estimate-backtest.test.cjs` | 0 (104 tests, 104 pass); `git diff --stat 73358ced..HEAD -- estimate-rollup.cjs` empty | PASS |
| 3: method in results, run state, text | `node --test estimate-cli.test.cjs estimate-format.test.cjs estimate-run-store.test.cjs estimate-surfacing.repo.test.cjs`, then `npm test` | 0 (216 tests, 216 pass); `npm test` 11160 tests, 11101 pass, 9 fail (all known environment failures, below) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../estimate.test.cjs` | 1 (2 of 17 failing: 1d, 1e) | FAIL (correct) |
| GREEN (task 1) | `node --test .../estimate.test.cjs` | 0 (17 of 17) | PASS (correct) |
| RED (task 2) | `node --test .../estimate.test.cjs` | 1 (6 of 25 failing: 11, 12, 14, 15, 16, 17) | FAIL (correct) |
| GREEN (task 2) | the four task 2 files | 0 (104 of 104) | PASS (correct) |
| RED (task 3) | `node --test .../estimate-cli.test.cjs .../estimate-format.test.cjs` | 1 (8 of 141 failing) | FAIL (correct) |
| GREEN (task 3) | the four task 3 files | 0 (216 of 216) | PASS (correct) |

Test 1c (the fixture) passes in RED by construction because the fixture was written first, as the TRD's action says. Tests 13 and 18 (tokens and cost unchanged, task estimate unchanged) pass in RED on purpose: they pin behaviour that must not change.

The rollup test (`estimate-rollup.test.cjs` test 9) cannot be RED against production code, because `estimate-rollup.cjs` needs no change and `estimateTrdText` already carried the method when it was written. To show the test is not vacuous I stashed the `estimate.cjs` change, ran it (it failed: the TRD minutes were `{6, 18}` and `{18, 54}` instead of `{12, 45}`), and restored the change.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` | 0 | PASS |
| test (full) | `npm test` | 1 | PASS for this TRD: 11160 tests, 11101 pass, 9 fail, 50 skipped; all 9 failures are the known environment failures (below) |

Known environment failures in a provisioned worktree (66-01 SUMMARY), none touching the estimator: 8 `node-pty` tests (2 in `devflow-watch.test.cjs`, 6 in `handoff-e2e.test.cjs`; the TRD expected up to ten) and `roadmap-reconcile.test.cjs` E2E1 (this TRD's own SUMMARY exists and its ROADMAP box is unticked). No other test failed.

## Deviations from Plan

### Deliberate changes to existing tests

1. `estimate-cli.test.cjs` test `12b: 5` deep-equals the recorded run-state calibration block; it gains `method: null` for its version 2 file (named in the TRD).
2. `estimate-cli.test.cjs` backtest test `2` lists the sorted keys of `result.calibration`; the list gains `'method'`. The TRD does not name this one, but it follows from its own design ("the backtest block inherits it"), so it is the same kind of change as (1).

No other existing expectation changed. The existing `estimate.test.cjs` test 1 (a `version: 3` file with no method block, `/version 3/`) still passes unchanged: that file is now refused for its missing method block rather than for being an unsupported version. No existing test deep-equalled a whole TRD estimate, so the error-recovery path for `minutes_basis` / `minutes_samples` was not needed.

### Auto-fixed issues

None (no Rule 1-3 deviations).

### Differences from the TRD's wording

- **Test 15 wording.** The TRD says `estimate objective <N> --raw` ends with the calibration sentence. The calibration sentence is only part of the `--table` text (the plain `--raw` text is the one-line estimate and carries no calibration sentence), and in the table it ends the footer line, after the overhead and confidence sentences. The CLI tests therefore use `objective 80 --table --raw` and match the sentence at the end of its line, and `estimate-format.test.cjs` checks the literal last line. The code is as the Design describes.
- **Test numbering.** The TRD's list is 1-16; in the files the tests are labelled after each file's own sequence. Mapping: TRD 1 is `estimate.test.cjs` 1c; 2 is 1d; 3 is 1e; 4 is 11; 5 is 12; 6 is 13; 7 is 14; 8 is 15; 9 is 16; 10 is 17; 11 is `estimate-rollup.test.cjs` 9; 12-14 are `estimate-cli.test.cjs` `12c` tests 12-14; 15 is `12c` tests 15 and 15b plus the `estimate-format.test.cjs` method test; 16 is the backtest test `2b` plus the `estimate-format.test.cjs` backtest-footer test.
- **Extra tests beyond the list:** `estimate.test.cjs` 18 (a task estimate does not change with the method), an `n: 15` (medium) cap case and a `task_sum` calibration with a thin TRD-level sample (never capped) inside test 17, a non-object `method` in 1d, partial window/cut sentences and the milestone table in the format test, and the task / objective / milestone verbs in CLI test 12.
- **`minutes_basis` with no minutes.** For a checkpoint-only TRD, or a trd_level calibration with no TRD-level samples, `minutes_basis` is still `'trd_level'` (it names the calibration's method) and `minutes_samples` is null. The Design says `minutes_samples` is `stat.n` only "for trd_level with a stat, else null"; `minutes_basis` was not specified for these cases.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (truths 1-5 each have a named test above)
- Gate failures: none beyond the 9 known environment failures
- No scoring was done: no `estimate backtest` on real objectives, no `scripts/estimate-*.cjs` run, and the real `~/.claude/devflow/calibration.json` and run-state directory were never read or written (tests use temp files and `DEVFLOW_ESTIMATE_STATE_DIR`).
- SC-4 is not met by this TRD alone: the installed 2.14.0 estimator still refuses version 3, which is the intended guard; SC-4 is met after 67-06 to 67-09 put this code into the installed plugin.

## Next Phase Readiness

- 67-05 can add the test that `KNOWN_MINUTES_METHODS` equals `calibrator.MINUTES_METHODS` once 67-02's calibrator export is merged (this TRD kept the list local to `estimate.cjs` as required).
- 67-09 can read `calibration.method` from any `df-tools estimate` result and from the run state to prove the method on the installed runtime.

## Self-Check: PASSED

- Files: all eight listed files exist (`ls` confirmed), `git diff --stat 73358ced..HEAD` shows only those eight plus this SUMMARY.
- Commits: 122c2b6c, 79e7b602, 3d3be91d, 19c2819d, a2d0d0e4, 4b3eaced all present in `git log 73358ced..HEAD`.
- Working tree clean after the last task commit.
