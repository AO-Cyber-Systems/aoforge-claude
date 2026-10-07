---
objective: 64-estimate-accuracy-validation
job: "01"
subsystem: estimation
tags: [estimate, backtest, calibration, EST-08, verdict, node-test]

requires:
  - objective: 58-estimation-engine-and-surfacing
    provides: estimate-rollup objective estimates, calibrator.sampleCost pricing, calibration-inputs.collectProject records
provides:
  - "lib/estimate-backtest.cjs: a pure, tested comparison of objective estimates with recorded actuals and the EST-08 verdict (SC2 median within 30%, SC3 P90 covers 80%)"
  - "__fixtures__/backtest-fixtures.cjs: hand-built builders plus makeBacktestProject/removeBacktestProject for the 64-04 CLI tests"
affects: [64-04 estimate backtest CLI, 64-05 live backtest run]

tech-stack:
  added: []
  patterns:
    - "Verdict thresholds are exported constants fixed before any live data; no option can loosen them"
    - "An actual that cannot be fully measured is null and names the TRDs that lack it, never an undercounted sum"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
    - plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs
  modified: []

key-decisions:
  - "A TRD with no SUMMARY has no recorded outcome: its minutes are missing even when a STATE_ARCHIVE metric row exists"
  - "SC3 is insufficient, not fail, when no TRD comparison exists to judge TRD-level coverage"
  - "A missing P90 counts as not covered in every coverage figure (denominator is the compared count)"
  - "An unfinished run state reports 'run not finished', distinct from 'no run state recorded'"

patterns-established:
  - "Rounding happens once at output (64-04); every boolean is decided on unrounded values"
  - "Test helper names must avoid the substrings 'const EXCLUDE' and 'const EXTS' (repo-state-delegation guard scans every lib .cjs)"

requirements-completed: []  # 64-05 alone sets EST-08 from the measured verdict

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-07
tokens_input: 11602889
tokens_output: 103038
tokens_cache_read: 11394085
tokens_cache_write: 208648
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 01: Backtest comparison library Summary

**A pure `estimate-backtest.cjs` that compares objective estimates with SUMMARY actuals (minutes and priced tokens), prefers a run state's persisted estimate, flags miscalibrated task classes, and returns the EST-08 verdict from rules pinned as exported constants (band 0.30, coverage 0.80, minimum 3 objectives, minimum 3 tasks per class).**

## Progress
- [x] Task 1: Hand-built backtest fixtures, then objectiveActuals, compareMetric and median (RED then GREEN) — b9dcf472
- [x] Task 2: compareObjective, classRows, summarize and buildBacktest with the fixed verdict (RED then GREEN) — (this commit)

## Performance

- **Duration:** about 25 min
- **Started:** 2026-10-07T11:52:49Z
- **Completed:** 2026-10-07
- **Tasks:** 2 of 2
- **Files modified:** 3 created, none modified

## Accomplishments

- `objectiveActuals` sums an objective's executor minutes and prices its SUMMARY tokens with `calibrator.sampleCost`. A metric that any TRD lacks is `null` and the TRD ids are named (`missing`, `human_wait`, `unpriced`); a partial sum is never returned.
- `compareMetric` gives `ratio = p50 / actual`, `within_band` (0.70 to 1.30 inclusive), `covered`, `at_or_under_median`, or an `excluded` reason with no number. The boundary tests are exact in IEEE doubles (13/10 and 7/10).
- `compareObjective` prefers a run state's persisted `estimate.execution` (`source: 'prospective'`), else the reconstructed estimate; it adds the measured wall time per objective and per wave, and whether the reconstructed wall estimate `reproduced` the persisted one within 0.05 minutes. Objective 63's real run-state shape (no `estimate.execution`) is covered.
- `classRows` splits each TRD actual equally across non-checkpoint tasks (the calibrator's rule) and flags a class of at least 3 tasks `biased_high`, `biased_low` and/or `p90_too_narrow`; smaller classes are `too_few` and never judged.
- `summarize` and `buildBacktest` return the documented shape and the verdict: `est08` is `met` only when SC2 and SC3 pass for both `agent_minutes` and `cost_usd`; `miscalibrated` names the failing classes and `follow_up_required` follows.
- The library has one require (`./calibrator.cjs`), no file, environment or clock access, and no rounding.

## Task Commits

Strict RED then GREEN, one pair per function group (16 commits):

| Group | RED | GREEN |
|---|---|---|
| constants, median, fixtures | 3cc26cac | 2ee57220 |
| compareMetric | a51438c0 | 7ce81c02 |
| objectiveActuals | 05cc5b0d | effcffa7 |
| (Task 1 close: collectProject integration test, SUMMARY checkpoint) | b9dcf472 | |
| classRows | 36f98bd7 | e12cd4d6 |
| summarize | 46aef341 | c79ebeb5 |
| compareObjective | 35ef34be | 40a9532e |
| buildBacktest | 71b91263 | 96e0be1c |
| guard rename (fix) | | fabb7491 |

## Decisions Made

- **No SUMMARY means missing minutes.** The TRD lists "no SUMMARY" among the reasons a metric is missing, and a TRD with no SUMMARY has no recorded outcome, so `objectiveActuals` marks its minutes missing even when a STATE_ARCHIVE metric row gave it a duration. The metric-row fallback applies to a SUMMARY with no duration (the `duration_source: 'metric'` case). A test pins this. If 64-05 finds a real objective this excludes, the exclusion names the TRD.
- **SC3 with no TRD comparison is `insufficient`.** The TRD text gives only the below-minimum-objectives case; with objectives compared but zero TRD comparisons the TRD half cannot be judged, and `fail` would be a verdict without data.
- **Coverage denominators are the compared count.** A comparison with no P90 has `covered: null` and counts as not covered in every coverage figure (objective, TRD, class), so a missing P90 can never help a metric pass.
- **`unfinished run` is its own reason.** A run state without `finished_at` gives `wall_minutes: {source: null, excluded: 'run not finished'}` (the TRD specified only 'no run state recorded').
- **`miscalibrated[].metric` uses the primary metric names** (`agent_minutes`, `cost_usd`), not the class-table key `minutes`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper name tripped the repo-state delegation guard**
- **Found during:** Task 2 full-suite gate
- **Issue:** `repo-state-delegation.test.cjs` test 9 scans every `.cjs` under `bin/lib` for the substring `const EXCLUDE`; my summarize test helper `const EXCLUDED` matched it, so the suite failed with `estimate-backtest.test.cjs` listed as an unexpected declaration.
- **Fix:** Renamed the helper to `excludedCell`.
- **Files modified:** plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
- **Commit:** fabb7491

### Process notes (not fixes)

- **TDD granularity.** The TRD asks for one test at a time; RED and GREEN commits are per function group (the tests for one function written together, shown failing, committed, then the implementation), 16 commits rather than one per test-list item. Every GREEN follows its RED; every RED was run and failed for the right reason (module or function not defined).
- **Order.** Implementation went bottom-up (median, compareMetric, objectiveActuals, classRows, summarize, compareObjective, buildBacktest) rather than outermost first, because the outer function composes the others; the Task 1 / Task 2 partition in the TRD already implies it. All 19 test-list items are covered (items 1-3 by the buildBacktest tests, 4-7 by compareObjective and buildBacktest, 8-12 objectiveActuals, 13-15 compareMetric, 16-17 classRows, 18 summarize, 19 median).
- **Extras beyond the test list**, each with a test: the no-SUMMARY-with-metric-row case, the collectProject round trip over `makeBacktestProject`, the unfinished and unparseable run-state cases, "thresholds cannot be loosened, inputs not modified" (frozen inputs), a per-metric fallback when a persisted metric is missing, `miscalibrated_classes` count in the summary.

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on the delivered behaviour.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures, objectiveActuals, compareMetric, median | `node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` (14 tests at Task 1 close) | 0 | PASS |
| 2: compareObjective, classRows, summarize, buildBacktest | `node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` (46 tests) | 0 | PASS |
| 2: module hygiene | `rg -n "require\(" estimate-backtest.cjs` shows only `./calibrator.cjs`; `rg -n "process\.env\|Date\.now\|readFileSync" estimate-backtest.cjs` finds nothing | 0 | PASS |
| 2: exports | `node -e "...Object.keys(b).sort()"` lists BAND, COVERAGE_TARGET, MIN_CLASS_TASKS, MIN_OBJECTIVES, PRIMARY_METRICS, REPRODUCE_TOLERANCE, buildBacktest, classRows, compareMetric, compareObjective, median, objectiveActuals, summarize | 0 | PASS |
| 2: ordering | `git log --format=%s 20a4f37d..HEAD` shows each `test(64-01)` before its `feat(64-01)` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (constants, median) | `node --test estimate-backtest.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (constants, median) | same | 0 | PASS (correct) |
| RED (compareMetric) | same | 1 (3 failing, not a function) | FAIL (correct) |
| GREEN (compareMetric) | same | 0 | PASS (correct) |
| RED (objectiveActuals) | same | 1 (8 failing) | FAIL (correct) |
| GREEN (objectiveActuals) | same | 0 | PASS (correct) |
| RED (classRows) | same | 1 (5 failing) | FAIL (correct) |
| GREEN (classRows) | same | 0 | PASS (correct) |
| RED (summarize) | same | 1 (7 failing) | FAIL (correct) |
| GREEN (summarize) | same | 0 | PASS (correct) |
| RED (compareObjective) | same | 1 (11 failing) | FAIL (correct) |
| GREEN (compareObjective) | same | 0 | PASS (correct) |
| RED (buildBacktest) | same | 1 (9 failing) | FAIL (correct) |
| GREEN (buildBacktest) | same | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` | 0 | PASS (46/46) |
| test (guards touching lib) | `node --test repo-state-delegation.test.cjs roadmap-reconcile.test.cjs` | 0 | PASS (after fabb7491 and the roadmap tick) |
| test (full) | `npm test` | 1 | FAIL, unrelated: 10 of 10,881 tests, all `devflow-watch` daemon / handoff tests (see below) |

`npm test` final run: 10,881 tests, 10,819 pass, 12 fail, 50 skipped. Of the 12: one was `repo-state-delegation` test 9 (mine, fixed in fabb7491) and one was `roadmap-reconcile` E2E1 (the ROADMAP box for 64-01 was unticked while a SUMMARY existed; `roadmap update-job-progress 64` ticked it and E2E1 passes). The other 10 are `devflow-watch start|multi-project` and `handoff pipeline` tests. They fail because the worktree has no `node_modules` (the daemon cannot start there): the same `devflow-watch.test.cjs` passes 22 of 22 in the main checkout and fails 4 of 22 in this worktree. No file this TRD touches is involved.

## Discovered commands

None: the `general` profile's `npm test` and `node --test {files}` were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 5/5 (objectiveActuals names missing TRDs; compareMetric boundaries; buildBacktest sources and wall reproduction; classRows split and flags; fixed verdict constants)
- Gate failures: the full-suite `npm test` has 10 environmental `devflow-watch` failures (worktree lacks `node_modules`); none relate to this TRD

## Issues for the orchestrator

- **Worktree full-suite noise.** A worktree provisioned without `node_modules` fails the 10 `devflow-watch` daemon and handoff-pipeline tests; any wave gate that runs `npm test` inside a worktree will see them. Run that gate in the main checkout after the wave merge.
- **E2E1 transient.** `roadmap-reconcile` E2E1 fails whenever a SUMMARY (even a `## Progress` checkpoint) exists beside an unticked ROADMAP checkbox. `roadmap update-job-progress 64` ticks it; this commit includes the ROADMAP change.
- **EST-08 not decided here.** `requirements-completed` is `[]`; `requirements mark-complete EST-08` was not run. 64-05 sets EST-08 from the measured verdict.
- Nothing touched `~/.claude/devflow/calibration.json`, the preserved backups, or the live estimate run state for objective 64.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs
- FOUND: 16 commits `3cc26cac` through `fabb7491` on `df/exec-64-01` (`git log 20a4f37d..HEAD`)
