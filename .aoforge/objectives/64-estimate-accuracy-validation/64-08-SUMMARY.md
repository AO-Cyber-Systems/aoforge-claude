---
objective: 64-estimate-accuracy-validation
trd: "08"
subsystem: estimation
tags: [estimate, calibrate, EST-08, recency-window, rolling-backtest, ship-rule, gap-closure]

requires:
  - objective: 64-estimate-accuracy-validation (64-07)
    provides: the frozen decision build_window (window_objectives 10), the validation protocol and the ship rule in 64-DIAGNOSIS.md

provides:
  - "calibration-inputs.cjs: objectiveNumber, rankObjectives, hasOutcome, windowObjectives (pure helpers; one ranking and one cut shared by the calibrator and the scripts)"
  - "calibrator.cjs: the opt-in `window` option (applyWindow), the `window` block, one extra note and a digest component, all present only when a window dropped something; DEFAULT_WINDOW_OBJECTIVES is null"
  - "df-tools calibrate --window <N|all> (off by default; help, header and summary line updated)"
  - "scripts/estimate-rolling-backtest.cjs: rollingBacktest (one calibration per objective through buildBacktest), shipRule (the pre-registered ship rule as tested code) and the CLI 64-09 will drive"

affects: [64-09, 64-10]

tech-stack:
  added: []
  patterns:
    - "single source of the windowing: the calibrator and scripts/estimate-window-eval.cjs call calibration-inputs.windowObjectives, so a calibration with window W equals a calibration over a directory holding only the retained objectives"
    - "no trace when a window drops nothing: no key, no note, no digest change"
    - "a missing calibration is an exclusion in the rolling harness, never a fallback"

key-files:
  created:
    - scripts/estimate-rolling-backtest.cjs
    - scripts/estimate-rolling-backtest.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
    - plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - scripts/estimate-window-eval.cjs

key-decisions:
  - "The window is applied to a filtered COPY of each project right after collectProject; sources, samples, trd_level, task_classes, objective_level, probabilities and data_as_of follow the retained TRDs, while metrics and counts (whole-history) and agent overhead (transcripts) are not windowed"
  - "calibration.version stays 2: `window` is optional metadata the estimator ignores"
  - "In the CLI the flag absent is undefined (library default) and `all` is null (explicitly no window)"
  - "The rolling harness requires the --new set to name the same objectives as --old, so the before/after table and the ship rule compare like with like"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-08
tokens_input: 20341767
tokens_output: 110120
tokens_cache_read: 20086821
tokens_cache_write: 254732
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 08: calibrate --window and the rolling harness Summary

**`calibrate --window <N|all>` (off by default, byte-identical output when unset or when it drops nothing) now exists on a library helper shared with the evaluation script, and `scripts/estimate-rolling-backtest.cjs` scores one calibration per objective through `buildBacktest` and applies the pre-registered `shipRule`; the pre-59 selection reproduces to the frozen digest `fdf60e66...e516`, and no objective 59-63 was scored.**

## Progress

- [x] Task 1: The window in the library (helpers, applyWindow, block, note, digest; scripts take the library windowing) — RED 013a803f, GREEN 3768e5e6
- [x] Task 2: `calibrate --window <N|all>` flag, validation, summary line, help — RED 979661e4, GREEN 5cf665de
- [x] Task 3: scripts/estimate-rolling-backtest.cjs (rollingBacktest, shipRule, CLI) — RED cbb629b3, GREEN 0d5ac157

## Performance

- **Duration:** 14min
- **Started:** 2026-10-08T00:52:58Z
- **Completed:** 2026-10-08T01:07:00Z
- **Tasks:** 3 (each as RED then GREEN)
- **Files modified:** 2 created, 9 modified (1 of them a script)

## Hash gate (mandatory, Task 1)

The `report` JSON from `scripts/estimate-window-eval.cjs` over the pre-59 snapshot (`git archive 401a9145^ .planning`, commit `cce70b30945f358faa0c848f6f3a95f5423a1b59`, 61 objective directories, `rg "^(59|6[0-9])-"` over the listing printed nothing) was re-run through the library helpers, with `--eval 46-58 --grid 10,15,20,30,40 --label pre59`:

| | sha256 |
|---|---|
| `selection_output_sha256` frozen in 64-DIAGNOSIS.md | `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516` |
| reproduced after Task 1 (library windowing in place) | `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516` |
| reproduced again at the end of the TRD (final code) | `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516` |

All three are equal. 64-DIAGNOSIS.md was not edited (one commit, 34515181).

## Accomplishments

- `calibration-inputs.cjs` gains `objectiveNumber`, `rankObjectives`, `hasOutcome` and `windowObjectives(project, window) -> {kept, dropped, cutoff}`. `calibrator.trdSample` now calls `ci.hasOutcome`, so the sample predicate and the window predicate cannot drift.
- `buildCalibration({paths, window})` validates the window first (`window must be a positive integer or null`), applies it to a filtered copy of each project right after `collectProject`, and emits the `window` block (objectives; per project first, last, kept and dropped objective counts, dropped TRD count), one extra note and a digest component only when something was dropped. Verified byte-for-byte against the pre-change code (extracted from `git archive HEAD` into scratch): the pre-change calibrator and the new one produce identical text for this repository's own history with `window` unset, `null` and 100000; the pre-change CLI and the new CLI write identical files for the full pre-59 snapshot, with and without `--window all` (all `b49f0e54fcb8...`).
- Real-data sanity (pre-59 snapshot, scratch output only): `--window 10` keeps objectives 49-58 (91 of 401 TRDs, 90 samples) and prints `window 10 objectives (dropped 310 TRDs)`.
- `scripts/estimate-window-eval.cjs` takes `objectiveNumber` and `rankObjectives` from the library and cuts with `ci.windowObjectives`; its 39 tests pass unchanged and its report hashes to the frozen digest.
- `calibrate --window <N|all>`: `all` is `null`, a positive integer a number, anything else (0, -3, 2.5, abc, empty, no value) a usage error naming `--window`; the result JSON carries `window`; the summary line ends ` · window N objectives (dropped D TRDs)` only when a window cut something; `help.cjs`, the `df-tools.cjs` header and the case comment name `[--window <N|all>]`.
- `scripts/estimate-rolling-backtest.cjs`: `rollingBacktest` estimates each objective from its OWN calibration file (`estimateObjective(cal, repo, N, {all: true})`) and sends the estimates through `buildBacktest` with the project root chosen as `estimate-cli` does; `shipRule` is section 7 of 64-DIAGNOSIS.md as code (`improved` by strictly smaller |ln ratio|, `regressions` over agent minutes and cost times SC2 and SC3, `insufficient` is never a pass, decided on unrounded values); the CLI prints JSON by default or markdown with `--raw`, the before/after table and `Ship default: true|false (reason)`, refuses `--json` under `~/.claude`, and its source names neither the calibration writer nor the default path.
- Mutation check on the harness tests: inverting the `improved` comparison fails 11 tests and using one calibration for every objective fails 3.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Library window (RED 013a803f, GREEN 3768e5e6) | `node --test` calibration-inputs, calibrator, estimate-window-eval tests; pre-59 `report` hash vs `selection_output_sha256` | 0 (186 tests); hashes equal | PASS |
| 2: calibrate --window (RED 979661e4, GREEN 5cf665de) | `node --test` calibrate-cli, dispatch-completeness, help tests; `calibrate --window 0`; `calibrate --help` lists the flag; `--window all` vs no flag on the pre-59 snapshot | 0 (47 tests); 1 naming `--window`; help lists `--window <N|all>`; `cmp` identical | PASS |
| 3: Rolling harness (RED cbb629b3, GREEN 0d5ac157) | `node --test scripts/estimate-rolling-backtest.test.cjs`; `node scripts/estimate-rolling-backtest.cjs`; `git status --short estimate-backtest.cjs` | 0 (33 tests); 1 with a usage line; prints nothing | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` calibration-inputs, calibrator, calibrate-cli, estimate-window-eval, estimate-rolling-backtest tests | 0 (246 tests, 0 fail) | PASS |
| test (full) | `npm test` | 1, then 0 | PASS after the ROADMAP tick (see below) |

First full run (exit 1): 11062 tests, 11027 pass, 1 fail, 34 skipped. The one failure was `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` (roadmap-reconcile.test.cjs): with the 64-08 SUMMARY checkpoint on disk the ROADMAP still had `- [ ] 64-08-...`. That is the expected transition of finishing a TRD, not a defect of this change; `roadmap update-job-progress 64` ticked the line (`trd_checkboxes_ticked: 1`) and the file then passed 63 of 63. Second full run after the tick (exit 0): 11062 tests, 11028 pass, 0 fail, 34 skipped.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test` calibration-inputs and calibrator tests (implementation reverted) | 1 (20 of 147 fail: helpers and the `window` option do not exist) | FAIL (correct) |
| GREEN (Task 1) | `node --test` calibration-inputs, calibrator, estimate-window-eval tests | 0 (186 pass) | PASS (correct) |
| RED (Task 2) | `node --test calibrate-cli.test.cjs` | 1 (6 of 27 fail: `--window` is an unknown flag) | FAIL (correct) |
| GREEN (Task 2) | `node --test` calibrate-cli, dispatch-completeness, help tests | 0 (47 pass) | PASS (correct) |
| RED (Task 3) | `node --test scripts/estimate-rolling-backtest.test.cjs` | 1 (module `./estimate-rolling-backtest.cjs` not found) | FAIL (correct) |
| GREEN (Task 3) | `node --test scripts/estimate-rolling-backtest.test.cjs` | 0 (33 pass) | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (window semantics and downstream blocks follow the retained TRDs; unset, `null` and a no-op window leave no trace and the default output is byte-identical; the CLI flag, its validation, summary line and help; the windowing is the library's and the pre-59 report hashes to the frozen digest with the scripts' tests unchanged; the rolling harness estimates each objective from its own calibration, excludes rather than falls back, and never reads or writes a default calibration path; nothing in this TRD scored 59-63)
- Gate failures: None
- `~/.claude/devflow/calibration.json` still hashes to `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`; `estimate-backtest.cjs` does not appear in `git diff --stat 05f34d57..HEAD`; `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` and `~/.claude/devflow/state/estimates/history/` are untouched.
- Nothing about objectives 59-63 was scored: every test uses hand-built fixtures, `estimate backtest` was not run, no 59-63 cut was calibrated and the harness was never run on real data. The only real-data commands were the pre-59 `report` re-runs and calibrate runs over the pre-59 snapshot into scratch files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The TRD's verify line names a command that does not exist**
- **Found during:** Task 2 (test item 15)
- **Issue:** the verify text says `df-tools.cjs help calibrate`; this repository has no `help` command (`Error: Unknown command: help`). Help is `calibrate --help`.
- **Fix:** test 15 and the manual check use `calibrate --help`, which lists `--window <N|all>`. No code change.
- **Files modified:** plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
- **Commit:** 5cf665de

**2. [Rule 1 - Bug] Test 13 passed for the wrong reason**
- **Found during:** Task 2 RED run
- **Issue:** the first version of the usage-error test passed before the flag existed, because an unknown flag also exits 1 with the usage line and mentions `--window`.
- **Fix:** it now asserts the message is not `unknown flag`, and that it is `--window needs a value` or `--window must be a positive integer or all`.
- **Files modified:** plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
- **Commit:** 979661e4

### Interpretation choices (no behaviour outside the TRD)

- **`recentObjectives` and `cutProject` in scripts/estimate-window-eval.cjs.** `recentObjectives` stays exported (its test is unchanged) but is now an adapter over `ci.windowObjectives`. `cutProject` copies the sample-bearing directories among the library's `kept` (an objective with no outcome after the cutoff is kept by the library but is not copied, exactly as before), which is why the frozen digest reproduces.
- **Summary line position.** The TRD says the window text is appended "after the counts"; it is appended at the end of the line (after the overhead part), so a line without a window is unchanged.
- **`--new` must name the same objectives as `--old`.** The TRD does not say; a before/after table and a ship rule over different objective sets would not compare like with like, so the CLI refuses it as a usage error.
- **The harness imports `isUnderClaudeHome`** from `estimate-window-eval.cjs` instead of duplicating it.
- **Library-level exclusion.** A missing calibration is expressed either as an absent key with an explicit `objectives` list or as a key set to `null`; a calibration file that fails to load stops the CLI with the loader's reason (exit 1) rather than excluding silently.
- **Test count.** The TRD speaks of 18 tests in `estimate-window-eval.test.cjs`; the file has 39 and all 39 pass unchanged.

## Discovered commands

None. The stack profile supplied the test commands (`node --test {files}`, `npm test`).

## Issues for the orchestrator

- 64-09 should pass `--old N=<file>` and `--new N=<file>` for exactly the same five objectives, and read the verdict from `old.verdict.est08` / `new.verdict.est08` plus `ship`.
- `rollingBacktest` reports `window` per calibration from `cal.window.objectives`; a cut built with `--window all` therefore shows `window: null`.
- The ROADMAP checkbox for 64-08 was ticked by `roadmap update-job-progress 64`; EST-08 is deliberately not marked complete (`requirements-completed: []`), because the validation is 64-09 and 64-10.

## Self-Check: PASSED

- Created files exist: scripts/estimate-rolling-backtest.cjs, scripts/estimate-rolling-backtest.test.cjs.
- Commits exist: 013a803f, 3768e5e6, 979661e4, 5cf665de, cbb629b3, 0d5ac157.
- Hash gate: reproduced `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516` equals the frozen `selection_output_sha256`.
