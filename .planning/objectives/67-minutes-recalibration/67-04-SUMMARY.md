---
objective: 67-minutes-recalibration
job: "04"
subsystem: estimation
tags: [EST-10, validation, positive-controls]
requirements-completed: []
---

# Objective 67 TRD 04: Positive controls, then the once-only validation of the frozen method Summary

In progress: positive controls PC1 and PC2 passed on the task-sum path; the once-only score has not run yet.

## Progress
- [x] Task 1: Positive controls PC1 and PC2 on the task-sum path — f0e46e5f
- [x] Task 2: Score once: old (task_sum) against new (trd_level) on cuts of 46-66 of the decision snapshot — 5de8dec8
- [x] Task 3: Write and commit 67-VALIDATION.md — (this commit)

## Positive controls (Task 1)

Scratch: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/479a0889-ce59-4c31-8887-a62c6f15eab4/scratchpad/s67-04` (a subdirectory of the session scratchpad instead of a bare `mktemp -d`; it is outside the repository and outside ~/.claude).

PC1: the pre-59 snapshot (`git archive 401a9145^ .planning`, 61 objective directories, last `58-estimation-engine-and-surfacing`, leak check `^(59|6[0-9])-` printed nothing) re-ran `estimate-window-eval.cjs report --eval 46-58 --grid 10,15,20,30,40 --label pre59`. `shasum -a 256 pc1.json` printed `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`: equal to the frozen selection_output_sha256.

PC2: five window-10 cut calibrations with `--minutes task_sum`, scored by `estimate-rolling-backtest.cjs --old …`. Every pc2 file is `version: 3`, `method.minutes: task_sum`, `method.window_objectives: 10`, `method.through_objective: null`. Calibration sizes equal 64-VALIDATION section 1 (90/200/83, 82/187/68, 76/178/55, 75/174/48, 80/186/45 TRDs/tasks/tasks with tokens). The comparison script compared 53 cells; all 53 equal.

| Cell | Expected | Got | Equal |
|---|---|---|---|
| 59 minutes p50 / P90 / actual / ratio | 80.6 / 223.4 / 84 / 0.959 | 80.6 / 223.4 / 84 / 0.959 | yes |
| 59 cost p50 / P90 / actual / ratio | 19.0268 / 25.7994 / 23.8786 / 0.797 | 19.0268 / 25.7994 / 23.8786 / 0.797 | yes |
| 60 minutes p50 / P90 / actual / ratio | 91.6 / 214.4 / 74 / 1.238 | 91.6 / 214.4 / 74 / 1.238 | yes |
| 60 cost p50 / P90 / actual / ratio | 19.9731 / 28.2953 / 19.7921 / 1.009 | 19.9731 / 28.2953 / 19.7921 / 1.009 | yes |
| 61 minutes p50 / P90 / actual / ratio | 100.6 / 224.9 / 70 / 1.437 | 100.6 / 224.9 / 70 / 1.437 | yes |
| 61 cost p50 / P90 / actual / ratio | 25.9458 / 37.5934 / 27.5684 / 0.941 | 25.9458 / 37.5934 / 27.5684 / 0.941 | yes |
| 62 minutes p50 / P90 / actual / ratio | 133.8 / 285.2 / 96 / 1.394 | 133.8 / 285.2 / 96 / 1.394 | yes |
| 62 cost p50 / P90 / actual / ratio | 30.3968 / 44.0281 / 45.7525 / 0.664 | 30.3968 / 44.0281 / 45.7525 / 0.664 | yes |
| 63 minutes p50 / P90 / actual / ratio | 78.1 / 171.8 / 112 / 0.697 | 78.1 / 171.8 / 112 / 0.697 | yes |
| 63 cost p50 / P90 / actual / ratio | 18.0529 / 27.8531 / 27.1594 / 0.665 | 18.0529 / 27.8531 / 27.1594 / 0.665 | yes |
| summary minutes: median / pooled / in band / P90 objectives / TRDs covered | 1.238 / 1.112 / 2 / 1 (5 of 5) / 0.9756 (40 of 41) | 1.238 / 1.112 / 2 / 1 (5 of 5) / 0.9756 (40 of 41) | yes |
| summary cost: median / pooled / in band / P90 objectives / TRDs covered | 0.797 / 0.787 / 3 / 0.8 (4 of 5) / 0.7805 (32 of 41) | 0.797 / 0.787 / 3 / 0.8 (4 of 5) / 0.7805 (32 of 41) | yes |
| verdict est08 | not met | not met | yes |

## Score (Task 2)

Snapshot of DECISION_SHA d888f55790f4b7144a33c514767467627bced9ba: 70 objective directories, last `67-minutes-recalibration`, leak check `^(6[89]|7[0-2])-` printed nothing; 21 of 21 eval objectives (46-66) present. 42 calibrations (`--through N-1 --window 10 --no-overhead`, `task_sum` and `trd_level`); check script exit 0. `score.sh` ran once (exit 0, no mechanical error). `ship`: est08_old `met`, est08_new `met`, minutes_median_old 1.021, minutes_median_new 1.051, improved `false`, regressions `[]`, ship_default `true`, reason "the new method meets EST-08". method_selected `trd_level`.

After Task 1: `git status --short plugins scripts` printed nothing; `~/.claude/devflow/calibration.json` still hashes to `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`.
