---
objective: 64-estimate-accuracy-validation
trd: "09"
subsystem: estimation
tags: [estimate, calibrate, EST-08, recency-window, rolling-backtest, validation, gap-closure]

requires:
  - objective: 64-estimate-accuracy-validation (64-07)
    provides: the frozen decision build_window (window_objectives 10), the validation protocol and the ship rule in 64-DIAGNOSIS.md
  - objective: 64-estimate-accuracy-validation (64-08)
    provides: calibrate --window and scripts/estimate-rolling-backtest.cjs (rollingBacktest, shipRule)

provides:
  - "64-VALIDATION.md: the recorded result of the pre-registered rolling validation on 59-63, est08 `not met` and ship_default `true`"

affects: [64-10]

tech-stack:
  added: []
  patterns:
    - "positive control before scoring: the old method's rolling rows reproduced 64-05's published table at its printed digits before the new method was scored"

key-files:
  created:
    - .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md
  modified: []

key-decisions:
  - "The frozen protocol ran once; the result (EST-08 not met, ship_default true) is recorded as printed, with no second attempt"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 7min
completed: 2026-10-08
---

# Objective 64 TRD 09: Rolling validation of the recency window on 59-63 Summary

**The frozen protocol ran once: the positive control reproduced 64-05's old-method table exactly, the new method (`--window 10`) leaves EST-08 `not met` (agent-minutes median ratio 1.348 to 1.238, cost SC3 unchanged at 32 of 41 TRDs under P90), and the pre-registered ship rule returns `ship_default: true`.**

## Progress

- [x] Task 1: Five cuts, both calibration sets, positive control on the old method — no commit (changes no repository file; control reproduced)
- [x] Task 2: Score the new method once, apply the ship rule, record 64-VALIDATION.md and commit — 13785e72

## Performance

- **Duration:** 7min
- **Started:** 2026-10-08T01:10:37Z
- **Completed:** 2026-10-08T01:18:00Z
- **Tasks:** 2
- **Files modified:** 1 created (the validation document); no repository code touched

## Result

| | Old (`--window all`) | New (`--window 10`) |
|---|---|---|
| Agent minutes median / pooled ratio | 1.348 / 1.274 | 1.238 / 1.112 |
| Agent minutes in band (+-30%) | 2 of 5 (59, 63) | 2 of 5 (59, 60) |
| Agent minutes P90 covers | 5 of 5 objectives, 40 of 41 TRDs | 5 of 5 objectives, 40 of 41 TRDs |
| Agent minutes SC2 / SC3 | fail / pass | pass / pass |
| Cost median / pooled ratio | 0.839 / 0.813 | 0.797 / 0.787 |
| Cost in band | 4 of 5 | 3 of 5 |
| Cost P90 covers | 4 of 5 objectives, 32 of 41 TRDs | 4 of 5 objectives, 32 of 41 TRDs |
| Cost SC2 / SC3 | pass / fail | pass / fail |
| EST-08 | not met | **not met** |

- `est08: not met`, `ship_default: true` (frontmatter of 64-VALIDATION.md, read back with `frontmatter get`).
- Ship rule output: `Ship default: true (the agent-minutes median ratio is closer to 1 (new 1.238, old 1.348) and no passing status regresses)`; `improved: true`, `regressions: []`.
- Per-objective minutes ratios old to new: 59 1.291 to 0.959, 60 1.348 to 1.238, 61 1.758 to 1.437, 62 1.475 to 1.394, 63 0.739 to 0.697 (the only one that moves away from 1).
- Positive control: every one of 50 compared figures (per-objective minutes and cost p50/P90 and ratios, the calibration sizes 324/331/338/347/358, and the aggregates and statuses) equals 64-05's published table.
- Prospective point: objective 63's wall row unchanged (1h 37m / 4h 50m estimate, actual 1h 51m, ratio 0.87, within P90, `Reproduced yes`); run state sha256 `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee` before and after.
- Windows built: every new calibration keeps 10 objectives (cut 59: 49 to 58; 60: 50 to 59; 61: 51 to 60; 62: 52 to 61; 63: 53 to 62) and drops 310, 325, 338, 348 and 354 TRDs.

## Calibration summary lines

| Cut | Old | New |
|---|---|---|
| 59 | 324 TRDs, 749 tasks, 237 with tokens | 90 TRDs, 200 tasks, 83 with tokens, window 10 (dropped 310 TRDs) |
| 60 | 331 TRDs, 766 tasks, 237 with tokens | 82 TRDs, 187 tasks, 68 with tokens, window 10 (dropped 325 TRDs) |
| 61 | 338 TRDs, 784 tasks, 237 with tokens | 76 TRDs, 178 tasks, 55 with tokens, window 10 (dropped 338 TRDs) |
| 62 | 347 TRDs, 805 tasks, 240 with tokens | 75 TRDs, 174 tasks, 48 with tokens, window 10 (dropped 348 TRDs) |
| 63 | 358 TRDs, 831 tasks, 243 with tokens | 80 TRDs, 186 tasks, 45 with tokens, window 10 (dropped 354 TRDs) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Cuts, calibrations, positive control | `node scripts/estimate-rolling-backtest.cjs --old 59=… --old 63=… --json roll-old.json --raw`; five leak checks (`rg` on each listing); control comparison over `roll-old.json` | 0; leak checks printed nothing; 50 of 50 figures equal; `old.verdict.est08` is `not met` | PASS |
| 2: Score once, ship rule, VALIDATION.md | `node scripts/estimate-rolling-backtest.cjs --old … --new … --json roll-both.json --raw`; `frontmatter get … --field est08` and `--field ship_default`; `git show --stat HEAD` | 0; `not met` and `true`; one file, 13785e72 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (11062 tests, 11028 pass, 0 fail, 34 skipped) | PASS |

The suite ran after `roadmap update-job-progress 64` had ticked the 64-09 line (the same ordering 64-08 found necessary for the roadmap-reconcile self-test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] My scratch comparison script read the wrong field for the calibration size**
- **Found during:** Task 1 (positive control)
- **Issue:** the first run of the scratch script `control-compare.cjs` took the calibration size from a field that does not exist (`samples` is an object `{tasks, trds, with_tokens}`), printed `NaN` in the five `cal TRDs` rows and ended with `CONTROL: FAILED`. Every harness figure in the same output was equal, and the harness markdown already listed 324/331/338/347/358.
- **Fix:** the script now reads `samples.trds`; re-run over the same unchanged `roll-old.json`: 50 of 50 equal. No harness input, library or script of the repository changed, and no number of the protocol was affected.
- **Files modified:** none in the repository (scratch script only)
- **Commit:** none

### Other departures from the TRD text (no effect on the protocol)

- **Task 1 has no commit.** Its `<files>` is "none"; the TRD's own verify for Task 2 requires `git show --stat HEAD` to list only 64-VALIDATION.md, so the `## Progress` checkpoint (SUMMARY) is carried by the closing docs commit rather than by a task commit.
- **Selection digest re-confirmed (as 64-DIAGNOSIS.md section 8 asks, the TRD does not list it).** `scripts/estimate-window-eval.cjs report` over `git archive 401a9145^ .planning` with `--eval 46-58 --grid 10,15,20,30,40 --label pre59` hashes to `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`, equal to the frozen `selection_output_sha256`, before anything was scored.
- **`state update-progress` reported "Progress field not found in STATE.md"** and changed nothing (`advance-job` had already set the position text). `state record-metric` takes `--job`, not `--trd`.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one defect in a scratch script, outside the repository)
- Must-haves verified: 5/5 (protocol run exactly as frozen with no repository change; positive control reproduced before scoring; new method scored once through the harness and its `est08` and `shipRule` output recorded; 64-VALIDATION.md has the control, verdict block, old against new, classes, windows, ship rule, prospective point and limits; live calibration unwritten, frozen copy and run history intact, snapshots removed)
- Gate failures: None
- `shasum -a 256 ~/.claude/devflow/calibration.json` and the frozen copy `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` are both `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` before and after; `git status --short plugins scripts` printed nothing at the start and the end; the five cut directories, five tars and the pre-59 snapshot were removed (calibrations, JSON and markdown kept in the scratchpad, uncommitted).

## Issues for the orchestrator

- 64-10 reads `est08: not met` and `ship_default: true` from 64-VALIDATION.md. EST-08 is therefore not satisfied; `requirements-completed` stays empty here.
- The ship rule says `true` on a minutes-median move from 1.348 to 1.238 (SC2 flips by crossing the 1.3 line while the count of objectives in band stays 2 of 5 and 61 and 62 stay above the band). The cost median moves further below 1 (0.839 to 0.797) and objective 63's minutes ratio moves away from 1 (0.739 to 0.697); the rule does not weigh either. 64-10 should state these in the report next to the decision.
- Cost SC3 (TRD P90 coverage 32 of 41, 78%) is what keeps EST-08 not met under both methods; the window does not address it.
- `state update-progress` finds no `Progress` field in the current STATE.md (benign here; a doc-hygiene item).

## Self-Check: PASSED

- Created file exists: `.planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md` (frontmatter `harness_control: reproduced`, `est08: not met`, `ship_default: true`, `window_objectives: 10`).
- Commit exists: 13785e72 (`docs(64-09): pre-registered rolling validation of the recency window on objectives 59-63 (EST-08 not met)`), one file.
- Hash gates: live calibration and frozen copy `5cf42c4b…` (unchanged); objective 63 run state `08f88f9f…` (unchanged); selection digest `fdf60e66…e516` reproduced.
