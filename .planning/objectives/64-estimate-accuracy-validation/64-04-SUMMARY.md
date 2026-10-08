---
objective: 64-estimate-accuracy-validation
job: "04"
subsystem: estimation
tags: [estimate, backtest, EST-08, cli, markdown-report, run-history, node-test]

requires:
  - objective: 64-estimate-accuracy-validation (64-01)
    provides: estimate-backtest.buildBacktest and the backtest fixtures
  - objective: 64-estimate-accuracy-validation (64-02)
    provides: run history (store.latestRun) and the run-state fixtures
provides:
  - "df-tools estimate backtest <N[,N...]> [--calibration <file>] [--raw]: the EST-08 comparison as one rerunnable command (JSON by default, markdown report with --raw)"
  - "estimate-format backtestLine and backtestReport, plus DECIMALS for ratio (3) and shares (4)"
  - "estimate-cli backtestRunRoot(base, deps): the run history is read from the main checkout, so a worktree backtest finds the run"
affects: [64-05 live backtest run and EST-08 verdict, 64-06 docs]

tech-stack:
  added: []
  patterns:
    - "A renderer prints verdicts, it never decides them: every figure beside a verdict is counted from the result rows"
    - "A test seam instead of a global: runEstimate takes ratesFile, backtestRunRoot takes resolveMainRoot"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
    - plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Joining actuals on the directory name belongs in buildBacktest: estimateObjective carries dir as `.planning/objectives/90-alpha`, collectProject keys by `90-alpha`"
  - "A duplicate objective in the list is a usage error, so one objective can never be counted twice in a median"
  - "The report footer is separated by a `---` rule so a section reader (and the tests) stop before it"
  - "The wall-time section states which figure it compares: the run state's execution-only estimate.wall_minutes, not the total the estimate line prints"

patterns-established:
  - "Test seams are named options of the pure entry point (ratesFile on runEstimate, deps on the handler), never environment variables"

requirements-completed: []  # 64-05 alone sets EST-08 from the measured verdict

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-07
tokens_input: 16242895
tokens_output: 99775
tokens_cache_read: 16003725
tokens_cache_write: 238994
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 04: estimate backtest verb Summary

**`df-tools estimate backtest 59,60,61` estimates every TRD of each objective as the engine would before execution, prices the recorded actuals, looks up the prospective run in the main checkout's run history, and prints the EST-08 verdict as JSON or as the markdown report 64-05 pastes; the live read-only smoke on Objective 63 renders its prospective wall row with `reproduced: yes`.**

## Progress
- [x] Task 1: The backtest subcommand: parsing, inputs, run-history lookup and JSON (RED then GREEN) — 1c242cb0 (checkpoint 50fbe923)
- [x] Task 2: backtestLine, backtestReport and the rounding rules, then the spawned --raw report (RED then GREEN) — 689c6355

## Performance

- **Duration:** about 14 min
- **Started:** 2026-10-07T12:15Z
- **Completed:** 2026-10-07
- **Tasks:** 2 of 2
- **Files modified:** 9 (none created)

## Accomplishments

- **The verb.** `estimate backtest <N[,N...]>` takes a comma list (each piece an objective number, no empty piece, no duplicate), `--calibration` and `--raw`. Per objective it calls `estimateObjective(cal, base, N, {all: true})`, reads `collectProject(runRoot(base))`, loads the shipped rates (`ci.loadRates`), looks up `store.latestRun(historyRoot, N)` and hands all of it to `buildBacktest`. The JSON carries the calibration identity (`path, version, data_as_of, samples, inputs_digest`), rows, class tables, summary and verdict, plus `line` and `report`; it is rounded once at output and every boolean was decided on unrounded values (a ratio of 1.3004 prints 1.3 and stays `within_band: false`).
- **Run history from the main checkout.** `backtestRunRoot(base, deps)` takes `planning-mode.resolveMainRoot(base)` and falls back to the nearest `.planning` root. A test creates a real `git worktree` of the fixture project and finds the run archived under the main checkout's key from inside it; a mutation that ignores the main checkout fails that test.
- **No calibration, bad input.** No usable calibration is `No estimate: <reason>`, exit 0, `available: false`. A malformed list, an unknown flag, two positionals, an unknown objective (`objective 99 not found`) and an unreadable rates file exit 1.
- **Renderers.** `backtestLine` prints `Backtest 90, 91, 92, 93, 94: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 5 of 5 TRDs) · cost median ratio 1.00 (5 of 5, P90 5 of 5, 5 of 5) · EST-08 not met`, an insufficient metric as `insufficient (2 objectives)`. `backtestReport` is the six sections in the specified order (Verdict, Executor estimates against actuals with a summary table, Wall time, Task classes, Miscalibrated classes, Exclusions) and a footer with the calibration path, `data_as_of`, samples, `inputs_digest`, band and coverage target. It names prospective vs reconstructed per objective (and a mixed `minutes prospective, cost reconstructed`), every exclusion with its TRD ids, and says which wall figure it compares.
- **Rounding.** `DECIMALS` gains `ratio`, `median_ratio`, `pooled_ratio` (3) and `coverage`, `trd_coverage`, `under_median_share` (4); an `actual` takes the decimals of the metric it sits under (minutes 1, dollars 4). No existing result used those key names.
- **Help and docs in code.** `help.cjs` names `backtest` in the usage and details (and that `finish` archives the run), the `df-tools.cjs` header and dispatcher comment list it, and the estimate-cli module header documents it.

### Live read-only smoke (Objective 63, frozen calibration copy)

`node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw` exits 0 and prints:

```
Backtest 63: agent minutes insufficient (1 objective) · cost insufficient (1 objective) · EST-08 not met
```

as the JSON `line`; the `--raw` report shows, for 63, agent minutes p50 1h 46m / P90 5h 31m against 1h 52m (ratio 0.95, reconstructed), cost $20.56 / $30.50 against $27.16 (ratio 0.76), and the Wall time row `1h 37m / 4h 50m` estimate, `1h 37m / 4h 50m` reconstructed, `1h 51m` actual, ratio 0.87, `<= P90 yes`, `Reproduced yes`, with its five wave rows. Objective 63's run state has no `estimate.execution`, so its executor rows are reconstructed and only its wall time is prospective, as 64-02 warned. Nothing was written: no `estimate start|wave|finish`, no calibration write, the preserved backups untouched.

## Task Commits

| Group | RED | GREEN |
|---|---|---|
| dir join bug (Rule 1) | e2154cee | 1bb18b88 |
| subcommand, usage, history lookup, help | 6c3419db | c888df1e |
| JSON result, rounding, no calibration, rates failure | | 934f0f9f (tests only, see process notes) |
| run history and worktree lookup | | 1c242cb0 (tests only, see process notes) |
| Task 1 checkpoint | | 50fbe923 |
| backtestLine | dee72965 | 76b09ad8 |
| roundResult for the backtest keys | 31f53bc1 | 3ecb9191 |
| backtestReport | 8e7a6c1e | 0e3ba573 |
| spawned `--raw`, `line`/`report` equality, 3-decimal wall ratio | | 689c6355 (tests only, see process notes) |

## Decisions Made

- **Join on the directory name, in the library.** `estimateObjective` returns `dir` as the relative path it found (`.planning/objectives/90-alpha`); `collectProject` records each TRD under the bare name (`90-alpha`); `objectiveActuals` compares them for equality. 64-01's hand-built estimates used the bare name, so its tests passed while every real objective would have been excluded as `incomplete actuals`. `buildBacktest` now reduces `estimate.dir` to its last path segment (a bare name is unchanged) and the row still reports the dir the estimate carried.
- **Duplicates are rejected.** `backtest 90,91,90` is a usage error naming the objective; a median must not count an objective twice.
- **The wall comparison is stated.** `run.estimate.wall_minutes` is the execution estimate (waves only; 96.6 for 63) and the run's start-to-finish time is execution time; the printed estimate line is the total including the verifier (102.8). The Wall time section says so in its first paragraph.
- **`MIN_OBJECTIVES` and `REPRODUCE_TOLERANCE` are imported into the renderer** (constants only) so the report can say `3 needed` and `within 0.05 minutes` from the one definition.
- **`ratesFile` is an option of `runEstimate`**, not an environment variable, so a test can prove an unreadable rates file exits 1 while `DEVFLOW_CALIBRATION_PATH` stays the calibration's alone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `buildBacktest` could not join actuals to a real estimate**
- **Found during:** Task 1 (writing the first test that runs the verb on the fixture project)
- **Issue:** `objectiveActuals(project, estimate.dir, rates)` compared `.planning/objectives/90-alpha` with `90-alpha`, so every objective of a real backtest had no TRD actuals and was excluded.
- **Fix:** `directoryName(estimate.dir)` in `estimate-backtest.cjs`, with a RED test in `estimate-backtest.test.cjs` first (e2154cee, fix 1bb18b88).
- **Files modified:** estimate-backtest.cjs, estimate-backtest.test.cjs
- **Commit:** 1bb18b88

**2. [Rule 3 - Blocking] The surfacing guard pinned seven estimate subcommands**
- **Found during:** Task 1 scoped gate (`estimate-surfacing.repo.test.cjs` test 5)
- **Issue:** the guard lists the subcommands in `USAGE` and expected exactly seven; the eighth form this TRD adds broke it.
- **Fix:** the expected list and its message now name eight, `backtest` included. The file is not in the TRD's `files_modified`.
- **Files modified:** estimate-surfacing.repo.test.cjs
- **Commit:** c888df1e

### Process notes (not fixes)

- **TDD granularity.** RED then GREEN per behaviour group, not per test-list item. The dir-join fix, the subcommand skeleton (usage), `backtestLine`, the rounding keys and `backtestReport` each have a failing test committed before the code.
- **Three groups have no RED commit, and a mutation check stands in.** The subcommand's GREEN commit (c888df1e) implemented `runBacktest` whole, because its success path is one function, so the JSON/rounding tests (934f0f9f), the run-history and worktree tests (1c242cb0) and the spawned report tests (689c6355) passed on their first run. Each was shown to fail for the right reason by mutation: removing `fmt.roundResult` fails the 1.3004 test (`1.3003999999999998 !== 1.3`); making `backtestRunRoot` ignore the main checkout fails the worktree test (`null` instead of `prospective`) and the root-choice test. The spawned `--raw` tests would have failed against the empty placeholder renderers committed in c888df1e.
- **Temporary placeholders.** c888df1e committed `backtestLine`/`backtestReport` as `() => ''` (the TRD allows stubs until Task 2); both are replaced in 76b09ad8 and 0e3ba573.
- **One of my own test expectations was wrong** (a wave ratio of 50 against 100 minutes written as 1.00; the code printed the correct 0.50) and was corrected in the GREEN commit of the report; the code was not changed for it.
- **Extras beyond the test list**, each with a test: duplicate objective, rates failure, `backtestRunRoot` unit, mixed prospective/reconstructed source, run state without a wall estimate, an empty objective, a report that leaves its input unchanged.

**Total deviations:** 2 auto-fixed (Rule 1, Rule 3). **Impact:** the Rule 1 fix is what makes the verb produce numbers on a real project at all.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: subcommand, history, JSON | `node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs` (77 tests) | 0 | PASS |
| 1: help lists backtest | `node plugins/devflow/devflow/bin/df-tools.cjs estimate --help` | 0 | PASS (usage and details name `backtest`) |
| 2: renderers and rounding | `node --test estimate-format.test.cjs estimate-cli.test.cjs estimate-backtest.test.cjs` (174 tests) | 0 | PASS |
| 2: live smoke on 63 | `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw` | 0 | PASS (Wall time row for 63, `Reproduced yes`) |
| dispatch, help, surfacing guards | `node --test dispatch-completeness.test.cjs help.test.cjs help-delegation.test.cjs estimate-surfacing.repo.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (dir join) | `node --test estimate-backtest.test.cjs` | 1 (`'incomplete actuals'` instead of null) | FAIL (correct) |
| GREEN (dir join) | same | 0 | PASS (correct) |
| RED (usage, eight forms) | `node --test estimate-cli.test.cjs` | 1 (4 failing) | FAIL (correct) |
| GREEN (subcommand) | same | 0 | PASS (correct) |
| RED (backtestLine) | `node --test estimate-format.test.cjs` | 1 (5 failing, `''` returned) | FAIL (correct) |
| GREEN (backtestLine) | same | 0 | PASS (correct) |
| RED (roundResult keys) | same | 1 (ratio kept one decimal) | FAIL (correct) |
| GREEN (DECIMALS) | same | 0 | PASS (correct) |
| RED (backtestReport) | same | 1 (14 failing) | FAIL (correct) |
| GREEN (backtestReport) | same | 0 | PASS (correct) |
| Mutation (no roundResult) | `node --test estimate-cli.test.cjs` | 1 | FAIL (correct), then restored |
| Mutation (no main-checkout lookup) | same | 1 (2 failing) | FAIL (correct), then restored |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test estimate-cli.test.cjs estimate-format.test.cjs` | 0 | PASS |
| test (full) | `npm test` (main checkout) | 1 | PASS except `roadmap-reconcile` E2E1: 10,963 tests, 10,928 pass, 1 fail, 34 skipped; the failure is the unticked ROADMAP box for 64-04 beside its SUMMARY, cleared by `roadmap update-job-progress 64` |

## Discovered commands

None: the `general` profile's `npm test` and `node --test {files}` were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the directory join); the surfacing guard update was a Rule 3 test edit
- Must-haves verified: 5/5 (verb and JSON shape; calibration identity and one-time rounding; main-checkout history lookup; no-calibration and exit-1 cases; report content)
- Gate failures: `roadmap-reconcile` E2E1 until the ROADMAP box is ticked (see above)

## Issues for the orchestrator

- **64-01 shipped with a join bug that its fixtures hid** (see Deviations 1). Fixed here in `buildBacktest`; 64-05 should run the verb, not a script that calls `buildBacktest` with hand-built estimates.
- **EST-08 not decided here.** `requirements-completed` is `[]`; `requirements mark-complete EST-08` was not run.
- **Objective 63's executor rows are reconstructed.** Its run state predates `estimate.execution`, so only wall time is prospective (ratio 0.87 against the execution-only estimate, reproduced). A real EST-08 verdict needs the other objectives (59 to 62) and their SUMMARY minutes and tokens; this TRD did not run them.
- **Nothing touched** `~/.claude/devflow/calibration.json`, the preserved 63 run archive, `calibration-5cf42c4b.json`, or the live estimate run state for Objective 64.

## Self-Check: PASSED

- FOUND: all nine modified files under `plugins/devflow/devflow/bin/` (estimate-cli, estimate-format, estimate-backtest, their tests, estimate-surfacing.repo.test, help, df-tools)
- FOUND: the 14 task commits `e2154cee` through `689c6355` on `feat/stack-profile-loader` (`git log 8457761f..HEAD`)
