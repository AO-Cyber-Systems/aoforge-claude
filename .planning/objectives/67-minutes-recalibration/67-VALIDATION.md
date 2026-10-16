---
objective: 67-minutes-recalibration
type: validation
requirement: EST-10
decision: DECISION-003
decision_sha: d888f55790f4b7144a33c514767467627bced9ba
eval_objectives: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66]
harness_control: reproduced
est08_old: met
est08_new: met
minutes_median_old: 1.021
minutes_median_new: 1.051
ship_default: true
method_selected: trd_level
frozen_method: {minutes: trd_level, window_objectives: 10, through_objective: 66}
generated: 2026-10-08
---

# Objective 67: validation of the frozen minutes method (EST-10)

## 1. Result in one paragraph

DECISION-003's protocol (V1 to V5) ran once, after the decision's commit `d888f55790f4b7144a33c514767467627bced9ba`, with no change to any repository file. Both positive controls passed first (PC1 digest `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516` reproduced; all 53 PC2 cells equal). Then 42 calibrations of the decision snapshot (objectives 46-66, each cut `--through N-1`, window 10, old `task_sum` and new `trd_level`) were scored by `scripts/estimate-rolling-backtest.cjs` with 64's `shipRule` unchanged. Both methods return EST-08 `met` on this set. The pre-registered rule returned **`ship_default: true`** with the reason "the new method meets EST-08": it fired on its first clause. Its second clause did not: `improved` is `false`, because the new agent-minutes median ratio (1.051) is farther from 1 than the old (1.021). What the new method changes is the spread, not the centre: agent minutes in band 7 of 13 against 5 of 13, and P90 covering 160 of 165 TRDs against 152 of 165. The selected method is therefore **`trd_level`**, and the frozen method is `{minutes: trd_level, window_objectives: 10, through_objective: 66}`. This is a leave-future-out reconstruction with today's code and the family was suggested by data from objectives up to 63 (section 8); EST-11 on objectives 68-72 is the real test, and nothing here is tuned to pass it.

## 2. What ran

DECISION-003 V1 to V5, as executed. Scratch directory: a subdirectory of the session scratchpad, outside the repository and outside `~/.claude`. Every `calibrate` had `--out <scratch>/…`; the harness `--json` went to `<scratch>`.

Preconditions (all held before anything ran): DECISION_SHA is the last commit that touched `.planning/decisions/resolved/DECISION-003.md` and is an ancestor of HEAD; `git log --oneline -- …/67-VALIDATION.md` printed nothing; `CALIBRATION_VERSION = 3` and `KNOWN_MINUTES_METHODS` are present, and the six test files named in the TRD pass (290 tests, 0 failures); `~/.claude/devflow/calibration.json` hashed to `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`; `git status --short plugins scripts` printed nothing.

**V1 Snapshot.** `git archive --format=tar d888f55790f4b7144a33c514767467627bced9ba .planning` extracted to `<scratch>/snap`. It lists 70 objective directories; the last is `67-minutes-recalibration`. The leak check `rg -n "^(6[89]|7[0-2])-" <scratch>/snap-objectives.txt` printed nothing. Every N from 46 to 66 has a directory in the listing (21 of 21, none excluded by hand).

**Eval set.** 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66.

**V2 Cuts.** For each N, two calibrations of the snapshot: `calibrate --paths <scratch>/snap --through N-1 --window 10 --no-overhead --minutes task_sum --out <scratch>/cal-old-N.json --raw` and the same with `--minutes trd_level --out <scratch>/cal-new-N.json`. 42 files. The check script (`<scratch>/check.cjs`) exited 0: every file is `version` 3, window 10, `through_objective` equal to N-1 (at most 65), the expected minutes method, and a last kept objective at most N-1; each old/new pair has equal `samples`, `trd_level`, `task_classes` and `window` (only `method` and so `inputs_digest` differ, as the method is part of the calibration identity).

| N | set | version | method.minutes | window_objectives | through_objective | window last | samples.trds | trd_level.minutes p50 / p90 |
|---|---|---|---|---|---|---|---|---|
| 46 | old | 3 | task_sum | 10 | 45 | 45-devflow-doctor | 98 | 20 / 55 |
| 46 | new | 3 | trd_level | 10 | 45 | 45-devflow-doctor | 98 | 20 / 55 |
| 47 | old | 3 | task_sum | 10 | 46 | 46-github-sync-foundations | 101 | 20 / 55 |
| 47 | new | 3 | trd_level | 10 | 46 | 46-github-sync-foundations | 101 | 20 / 55 |
| 48 | old | 3 | task_sum | 10 | 47 | 47-github-authoritative-store | 99 | 15 / 45 |
| 48 | new | 3 | trd_level | 10 | 47 | 47-github-authoritative-store | 99 | 15 / 45 |
| 49 | old | 3 | task_sum | 10 | 48 | 48-planning-write-path-migration | 110 | 15 / 45 |
| 49 | new | 3 | trd_level | 10 | 48 | 48-planning-write-path-migration | 110 | 15 / 45 |
| 50 | old | 3 | task_sum | 10 | 49 | 49-objective-branch-and-pr-lifecycle | 120 | 15 / 45 |
| 50 | new | 3 | trd_level | 10 | 49 | 49-objective-branch-and-pr-lifecycle | 120 | 15 / 45 |
| 51 | old | 3 | task_sum | 10 | 50 | 50-github-enforcement-and-setup | 127 | 15 / 45 |
| 51 | new | 3 | trd_level | 10 | 50 | 50-github-enforcement-and-setup | 127 | 15 / 45 |
| 52 | old | 3 | task_sum | 10 | 51 | 51-github-migration-and-docs | 134 | 16 / 45 |
| 52 | new | 3 | trd_level | 10 | 51 | 51-github-migration-and-docs | 134 | 16 / 45 |
| 53 | old | 3 | task_sum | 10 | 52 | 52-store-mode-polish | 126 | 15 / 45 |
| 53 | new | 3 | trd_level | 10 | 52 | 52-store-mode-polish | 126 | 15 / 45 |
| 54 | old | 3 | task_sum | 10 | 53 | 53-worktree-and-health-hygiene | 118 | 14 / 45 |
| 54 | new | 3 | trd_level | 10 | 53 | 53-worktree-and-health-hygiene | 118 | 14 / 45 |
| 55 | old | 3 | task_sum | 10 | 54 | 54-codeql-cleanup | 117 | 14 / 45 |
| 55 | new | 3 | trd_level | 10 | 54 | 54-codeql-cleanup | 117 | 14 / 45 |
| 56 | old | 3 | task_sum | 10 | 55 | 55-store-live-smoke-fixes | 115 | 14 / 40 |
| 56 | new | 3 | trd_level | 10 | 55 | 55-store-live-smoke-fixes | 115 | 14 / 40 |
| 57 | old | 3 | task_sum | 10 | 56 | 56-objective-number-correctness | 110 | 13 / 40 |
| 57 | new | 3 | trd_level | 10 | 56 | 56-objective-number-correctness | 110 | 13 / 40 |
| 58 | old | 3 | task_sum | 10 | 57 | 57-estimation-data-foundation | 103 | 12 / 40 |
| 58 | new | 3 | trd_level | 10 | 57 | 57-estimation-data-foundation | 103 | 12 / 40 |
| 59 | old | 3 | task_sum | 10 | 58 | 58-estimation-engine-and-surfacing | 90 | 11 / 35 |
| 59 | new | 3 | trd_level | 10 | 58 | 58-estimation-engine-and-surfacing | 90 | 11 / 35 |
| 60 | old | 3 | task_sum | 10 | 59 | 59-state-and-merge-plumbing | 82 | 10 / 35 |
| 60 | new | 3 | trd_level | 10 | 59 | 59-state-and-merge-plumbing | 82 | 10 / 35 |
| 61 | old | 3 | task_sum | 10 | 60 | 60-edit-gate-enforces-the-action | 76 | 10 / 28 |
| 61 | new | 3 | trd_level | 10 | 60 | 60-edit-gate-enforces-the-action | 76 | 10 / 28 |
| 62 | old | 3 | task_sum | 10 | 61 | 61-store-mode-rough-edges-and-observability | 75 | 10 / 23 |
| 62 | new | 3 | trd_level | 10 | 61 | 61-store-mode-rough-edges-and-observability | 75 | 10 / 23 |
| 63 | old | 3 | task_sum | 10 | 62 | 62-built-in-sweep | 80 | 9 / 23 |
| 63 | new | 3 | trd_level | 10 | 62 | 62-built-in-sweep | 80 | 9 / 23 |
| 64 | old | 3 | task_sum | 10 | 63 | 63-todo-store-hook-coexistence-and-built-in-inventory | 80 | 9 / 20 |
| 64 | new | 3 | trd_level | 10 | 63 | 63-todo-store-hook-coexistence-and-built-in-inventory | 80 | 9 / 20 |
| 65 | old | 3 | task_sum | 10 | 64 | 64-estimate-accuracy-validation | 81 | 10 / 20 |
| 65 | new | 3 | trd_level | 10 | 64 | 64-estimate-accuracy-validation | 81 | 10 / 20 |
| 66 | old | 3 | task_sum | 10 | 65 | 65-release-v1-5 | 76 | 10 / 19 |
| 66 | new | 3 | trd_level | 10 | 65 | 65-release-v1-5 | 76 | 10 / 19 |

**V3 Positive controls**: section 3, before any score. **V4 Score once**: sections 4 to 6. `score.sh` ran exactly once (exit 0, no mechanical error, no re-run). **V5**: no calibration of this protocol reads an objective above 65 (the largest `through_objective` is 65), and the snapshot has no directory numbered 68 to 72.

## 3. Positive controls

**PC1.** The pre-59 snapshot (`git archive 401a9145^ .planning`: 61 objective directories, the last `58-estimation-engine-and-surfacing`; leak check `^(59|6[0-9])-` printed nothing) was run through `scripts/estimate-window-eval.cjs report --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/pc1.json --raw`. `shasum -a 256 pc1.json` printed `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`, equal to the frozen `selection_output_sha256`.

**PC2.** 64-09's five cuts (`git archive FIRST^ .planning` with FIRST 59 `401a9145`, 60 `05a5b5f4`, 61 `d7b9c938`, 62 `9ad19b1c`, 63 `26e4e57f`), calibrated with `--no-overhead --window 10 --minutes task_sum`, scored with `estimate-rolling-backtest.cjs --old …`. Each pc2 file is `version` 3, `method.minutes` `task_sum`, window 10, `through_objective` null. The calibration sizes equal 64-VALIDATION section 1 (90/200/83, 82/187/68, 76/178/55, 75/174/48, 80/186/45 TRDs, tasks, tasks with tokens). Compared with 64-VALIDATION section 3, new method, at full precision (53 cells): all equal.

| Cell | Expected | Got | Equal |
|---|---|---|---|
| 59 minutes p50 | 80.6 | 80.6 | yes |
| 59 minutes P90 | 223.4 | 223.4 | yes |
| 59 minutes actual | 84 | 84 | yes |
| 59 minutes ratio | 0.959 | 0.959 | yes |
| 59 cost p50 | 19.0268 | 19.0268 | yes |
| 59 cost P90 | 25.7994 | 25.7994 | yes |
| 59 cost actual | 23.8786 | 23.8786 | yes |
| 59 cost ratio | 0.797 | 0.797 | yes |
| 60 minutes p50 | 91.6 | 91.6 | yes |
| 60 minutes P90 | 214.4 | 214.4 | yes |
| 60 minutes actual | 74 | 74 | yes |
| 60 minutes ratio | 1.238 | 1.238 | yes |
| 60 cost p50 | 19.9731 | 19.9731 | yes |
| 60 cost P90 | 28.2953 | 28.2953 | yes |
| 60 cost actual | 19.7921 | 19.7921 | yes |
| 60 cost ratio | 1.009 | 1.009 | yes |
| 61 minutes p50 | 100.6 | 100.6 | yes |
| 61 minutes P90 | 224.9 | 224.9 | yes |
| 61 minutes actual | 70 | 70 | yes |
| 61 minutes ratio | 1.437 | 1.437 | yes |
| 61 cost p50 | 25.9458 | 25.9458 | yes |
| 61 cost P90 | 37.5934 | 37.5934 | yes |
| 61 cost actual | 27.5684 | 27.5684 | yes |
| 61 cost ratio | 0.941 | 0.941 | yes |
| 62 minutes p50 | 133.8 | 133.8 | yes |
| 62 minutes P90 | 285.2 | 285.2 | yes |
| 62 minutes actual | 96 | 96 | yes |
| 62 minutes ratio | 1.394 | 1.394 | yes |
| 62 cost p50 | 30.3968 | 30.3968 | yes |
| 62 cost P90 | 44.0281 | 44.0281 | yes |
| 62 cost actual | 45.7525 | 45.7525 | yes |
| 62 cost ratio | 0.664 | 0.664 | yes |
| 63 minutes p50 | 78.1 | 78.1 | yes |
| 63 minutes P90 | 171.8 | 171.8 | yes |
| 63 minutes actual | 112 | 112 | yes |
| 63 minutes ratio | 0.697 | 0.697 | yes |
| 63 cost p50 | 18.0529 | 18.0529 | yes |
| 63 cost P90 | 27.8531 | 27.8531 | yes |
| 63 cost actual | 27.1594 | 27.1594 | yes |
| 63 cost ratio | 0.665 | 0.665 | yes |
| summary minutes median | 1.238 | 1.238 | yes |
| summary minutes pooled | 1.112 | 1.112 | yes |
| summary minutes in band | 2 | 2 | yes |
| summary minutes P90 objectives covered (coverage) | 1 | 1 | yes |
| summary minutes TRDs compared | 41 | 41 | yes |
| summary minutes TRD coverage | 0.9756 | 0.9756 | yes |
| summary cost median | 0.797 | 0.797 | yes |
| summary cost pooled | 0.787 | 0.787 | yes |
| summary cost in band | 3 | 3 | yes |
| summary cost P90 objectives covered (coverage) | 0.8 | 0.8 | yes |
| summary cost TRDs compared | 41 | 41 | yes |
| summary cost TRD coverage | 0.7805 | 0.7805 | yes |
| verdict est08 | not met | not met | yes |

## 4. Old method (task_sum)

The harness markdown for the `--old` set, unedited (`<scratch>/score.md`), from its Verdict through its Calibrations table.

### Verdict

- Agent minutes: SC2 pass (median ratio 1.02, 5 of 13 objectives in ±30%) · SC3 pass (P90 covers 13 of 13 objectives (100%) and 152 of 165 TRDs (92%); target 80%)
- Cost: SC2 pass (median ratio 0.94, 15 of 18 objectives in ±30%) · SC3 pass (P90 covers 17 of 18 objectives (94%) and 168 of 192 TRDs (88%); target 80%)

EST-08: met

### Executor estimates against actuals

| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 46 github-sync-foundations | 10 | reconstructed | 3h 48m / 9h 14m | excluded: incomplete actuals (46-07, 46-08, 46-09, 46-10) | n/a | n/a | $40.73 / $68.83 | $31.70 | 1.28 | yes |
| 47 github-authoritative-store | 14 | reconstructed | 5h 21m / 12h 28m | excluded: incomplete actuals (47-02, 47-04, 47-06, 47-07, 47-09, 47-10, 47-11, 47-12, 47-13, 47-14) | n/a | n/a | $56.69 / $95.64 | $39.20 | 1.45 | yes |
| 48 planning-write-path-migration | 23 | reconstructed | 7h 43m / 17h 36m | excluded: incomplete actuals (48-03, 48-04, 48-05, 48-17, 48-18, 48-21, 48-23) | n/a | n/a | $74.93 / $122.14 | $83.08 | 0.90 | yes |
| 49 objective-branch-and-pr-lifecycle | 15 | reconstructed | 3h 44m / 7h 51m | excluded: incomplete actuals (49-10, 49-12, 49-14, 49-15) | n/a | n/a | $42.33 / $68.53 | $39.34 | 1.08 | yes |
| 50 github-enforcement-and-setup | 13 | reconstructed | 3h 03m / 7h 06m | 4h 21m | 0.70 | yes | $37.83 / $60.00 | $30.38 | 1.25 | yes |
| 51 github-migration-and-docs | 10 | reconstructed | 3h 27m / 6h 42m | excluded: incomplete actuals (51-03) | n/a | n/a | $34.09 / $68.67 | $49.05 | 0.69 | yes |
| 52 store-mode-polish | 6 | reconstructed | 2h 03m / 4h 10m | 1h 02m | 1.98 | yes | $19.25 / $27.12 | $24.68 | 0.78 | yes |
| 53 worktree-and-health-hygiene | 7 | reconstructed | 2h 17m / 4h 35m | 2h 14m | 1.02 | yes | $20.73 / $38.87 | $20.30 | 1.02 | yes |
| 54 codeql-cleanup | 10 | reconstructed | 2h 21m / 5h 13m | excluded: incomplete actuals (54-02, 54-10) | n/a | n/a | $28.38 / $38.70 | excluded: incomplete actuals (54-10) | n/a | n/a |
| 55 store-live-smoke-fixes | 8 | reconstructed | 1h 48m / 4h 00m | excluded: incomplete actuals (55-06) | n/a | n/a | $21.77 / $29.58 | $23.06 | 0.94 | yes |
| 56 objective-number-correctness | 5 | reconstructed | 1h 22m / 2h 38m | 36 min | 2.27 | yes | $14.68 / $20.58 | $15.72 | 0.93 | yes |
| 57 estimation-data-foundation | 7 | reconstructed | 1h 57m / 3h 47m | 1h 12m | 1.62 | yes | $21.29 / $28.93 | $21.41 | 0.99 | yes |
| 58 estimation-engine-and-surfacing | 10 | reconstructed | 2h 15m / 5h 08m | 2h 27m | 0.92 | yes | $31.15 / $40.75 | $24.60 | 1.27 | yes |
| 59 state-and-merge-plumbing | 7 | reconstructed | 1h 21m / 3h 43m | 1h 24m | 0.96 | yes | $18.91 / $25.58 | $23.88 | 0.79 | yes |
| 60 edit-gate-enforces-the-action | 7 | reconstructed | 1h 32m / 3h 34m | 1h 14m | 1.24 | yes | $20.70 / $35.02 | $19.79 | 1.05 | yes |
| 61 store-mode-rough-edges-and-observability | 9 | reconstructed | 1h 41m / 3h 45m | 1h 10m | 1.44 | yes | $25.93 / $36.88 | $27.57 | 0.94 | yes |
| 62 built-in-sweep | 11 | reconstructed | 2h 14m / 4h 45m | 1h 36m | 1.39 | yes | $30.73 / $39.43 | $45.75 | 0.67 | no |
| 63 todo-store-hook-coexistence-and-built-in-inventory | 7 | reconstructed | 1h 18m / 2h 52m | 1h 52m | 0.70 | yes | $21.06 / $30.47 | $27.16 | 0.78 | yes |
| 64 estimate-accuracy-validation | 10 | reconstructed | 1h 34m / 3h 08m | 2h 28m | 0.64 | yes | $28.25 / $48.27 | excluded: incomplete actuals (64-09, 64-10) | n/a | n/a |
| 65 Release v1.5 | 4 | reconstructed | 21 min / 31 min | excluded: incomplete actuals (65-02, 65-03, 65-04) | n/a | n/a | $6.32 / $9.18 | excluded: incomplete actuals (65-02, 65-03) | n/a | n/a |
| 66 Executor token stamp | 4 | reconstructed | 37 min / 1h 02m | 41 min | 0.90 | yes | $11.73 / $18.56 | $12.71 | 0.92 | yes |

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 13 | 1.02 | 1.04 | 5 of 13 | 13 of 13 (100%) | 152 of 165 (92%) | 7 of 13 (54%) |
| Cost | 18 | 0.94 | 0.97 | 15 of 18 | 17 of 18 (94%) | 168 of 192 (88%) | 7 of 18 (39%) |

### Wall time (prospective run states)

none recorded

### Task classes

**Agent minutes**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 219 | 1.18 | 91% | ok |
| prompt_tdd | 40 | 1.41 | 95% | miscalibrated: biased_high |
| doc | 26 | 0.60 | 100% | miscalibrated: biased_low |
| test_tdd | 25 | 0.67 | 84% | miscalibrated: biased_low |
| other | 22 | 1.13 | 82% | ok |
| test | 20 | 0.86 | 100% | ok |
| schema_tdd | 14 | 0.79 | 86% | ok |
| prompt | 10 | 0.69 | 90% | miscalibrated: biased_low |
| code | 8 | 1.12 | 100% | ok |
| config | 2 | 2.52 | 100% | too_few |
| doc_tdd | 2 | 0.78 | 50% | too_few |
| schema | 1 | 3.00 | 100% | too_few |

**Cost**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 254 | 1.06 | 91% | ok |
| prompt_tdd | 49 | 0.77 | 65% | miscalibrated: p90_too_narrow |
| test_tdd | 38 | 0.90 | 89% | ok |
| doc | 27 | 1.09 | 96% | ok |
| test | 23 | 0.83 | 74% | miscalibrated: p90_too_narrow |
| other | 22 | 0.94 | 86% | ok |
| schema_tdd | 14 | 0.63 | 100% | miscalibrated: biased_low |
| prompt | 12 | 0.64 | 42% | miscalibrated: biased_low, p90_too_narrow |
| code | 9 | 1.01 | 89% | ok |
| config | 3 | 1.46 | 100% | miscalibrated: biased_high |
| doc_tdd | 3 | 0.89 | 67% | miscalibrated: p90_too_narrow |
| schema | 1 | 1.28 | 100% | too_few |

### Miscalibrated classes

- prompt_tdd (minutes): biased_high, median ratio 1.41, coverage 95%
- doc (minutes): biased_low, median ratio 0.60, coverage 100%
- test_tdd (minutes): biased_low, median ratio 0.67, coverage 84%
- prompt (minutes): biased_low, median ratio 0.69, coverage 90%
- prompt_tdd (cost): p90_too_narrow, median ratio 0.77, coverage 65%
- test (cost): p90_too_narrow, median ratio 0.83, coverage 74%
- schema_tdd (cost): biased_low, median ratio 0.63, coverage 100%
- prompt (cost): biased_low, p90_too_narrow, median ratio 0.64, coverage 42%
- config (cost): biased_high, median ratio 1.46, coverage 100%
- doc_tdd (cost): p90_too_narrow, median ratio 0.89, coverage 67%

### Exclusions

- Agent minutes, objective 46: incomplete actuals (46-07, 46-08, 46-09, 46-10)
- Agent minutes, objective 47: incomplete actuals (47-02, 47-04, 47-06, 47-07, 47-09, 47-10, 47-11, 47-12, 47-13, 47-14)
- Agent minutes, objective 48: incomplete actuals (48-03, 48-04, 48-05, 48-17, 48-18, 48-21, 48-23)
- Agent minutes, objective 49: incomplete actuals (49-10, 49-12, 49-14, 49-15)
- Agent minutes, objective 51: incomplete actuals (51-03)
- Agent minutes, objective 54: incomplete actuals (54-02, 54-10)
- Agent minutes, objective 55: incomplete actuals (55-06)
- Agent minutes, objective 65: incomplete actuals (65-02, 65-03, 65-04)
- Cost, objective 54: incomplete actuals (54-10)
- Cost, objective 64: incomplete actuals (64-09, 64-10)
- Cost, objective 65: incomplete actuals (65-02, 65-03)

---

Calibration rolling: one calibration per objective, data as of 2026-10-08, samples n/a TRDs / n/a tasks / n/a with tokens, inputs_digest sha256:71fa8eb29da07f26101bee00fb5cd2f2b7c68ebfe6779b4d29a4cfbbe317f1f6. Band ±30%, coverage target 80%.

### Calibrations

| Objective | Data as of | Samples (TRDs) | Window | inputs_digest |
|---|---|---|---|---|
| 46 | 2026-10-03 | 98 | 10 | sha256:039aa2775d44dbc511b1b54796217c7bc85aac16226d9dcbb1518958e604ff70 |
| 47 | 2026-10-03 | 101 | 10 | sha256:540e4c35d5dc7f5cb76f6262267a98e4fbe196028cebca33af452ec0e8b88bf3 |
| 48 | 2026-10-03 | 99 | 10 | sha256:aed279663cf9a3a79e9654cd550cad1c4959bae4343dfbfda6a5fab58d059fe0 |
| 49 | 2026-10-03 | 110 | 10 | sha256:df40233bdc545ebbcea60d16ddfa6acaa343407d26b43fc9a8bffb3be3a88b0a |
| 50 | 2026-10-03 | 120 | 10 | sha256:28ec21c758ac04fb797826c132649606123dc77a961686b93d433dec7f444320 |
| 51 | 2026-10-03 | 127 | 10 | sha256:47450bf0a906751f3af17cf7c330c50212749905a7649ec7854d380f616460b2 |
| 52 | 2026-10-03 | 134 | 10 | sha256:784ba8568c9971a038862501e495de15501d66e8ac39ad070ec0168f93499fa4 |
| 53 | 2026-10-04 | 126 | 10 | sha256:830bb51f1df52f9b6f038327dd3681c6d4dec5ab1505cd51ae1fcb63fe945574 |
| 54 | 2026-10-04 | 118 | 10 | sha256:99cfe65ddeb95428326df38abc6e7f86e07c45c509bf26419d576203754fcbef |
| 55 | 2026-10-04 | 117 | 10 | sha256:7e8eeaa7d3746ec7e299677837c778cfa7e1a5aa9efa20e76def3ea833b86f06 |
| 56 | 2026-10-05 | 115 | 10 | sha256:e73304ca74dba08355f2286c051085fbd917da72c9a4d02737ca6d25f55038dc |
| 57 | 2026-10-05 | 110 | 10 | sha256:12aa0830176eb4fdba88edb7f6b6c296fb8567d1d4d0567aec756aea2a9e593d |
| 58 | 2026-10-05 | 103 | 10 | sha256:27fd541230e99be7e91e5fa0adb1a06e4f4121bbc9ef0083ee9bd3d3ba0b8539 |
| 59 | 2026-10-05 | 90 | 10 | sha256:dc9d4aefa8e586aff18527c55f362058ff0fc1745fdaaabb44f50386c749e496 |
| 60 | 2026-10-05 | 82 | 10 | sha256:430cc1fdf236e9b6ff046a9c4b102bbffb207e8a1ff9cbc68cda097ba821eee3 |
| 61 | 2026-10-06 | 76 | 10 | sha256:c730996105547f801bcc81c78d33df75e913b40ca8bb8e765135cda4828ce115 |
| 62 | 2026-10-06 | 75 | 10 | sha256:031c6946265ef91926b3e7c2b8524710bc645e211d3ab6d09f75e5604b641271 |
| 63 | 2026-10-06 | 80 | 10 | sha256:bd253a8a009f456bc4ab3690532ba7162babae4c2504db4e1b6db9bd7e167b57 |
| 64 | 2026-10-07 | 80 | 10 | sha256:5669347f3f25912909219b59ffeb77f38e5625b03c563c89df91f23420ec259f |
| 65 | 2026-10-08 | 81 | 10 | sha256:c701c0464711c0d7eee5f22d8c5f8402b2f7b462421353616d37762ce63d3e6d |
| 66 | 2026-10-08 | 76 | 10 | sha256:6cd4f4773a799a5e20357d79f8b13ea523d445b30aeef03e4c299eb511fb4a22 |

## 5. New method (trd_level)

The harness markdown for the `--new` set, unedited (`<scratch>/score.md`).

### Verdict

- Agent minutes: SC2 pass (median ratio 1.05, 7 of 13 objectives in ±30%) · SC3 pass (P90 covers 13 of 13 objectives (100%) and 160 of 165 TRDs (97%); target 80%)
- Cost: SC2 pass (median ratio 0.94, 15 of 18 objectives in ±30%) · SC3 pass (P90 covers 17 of 18 objectives (94%) and 168 of 192 TRDs (88%); target 80%)

EST-08: met

### Executor estimates against actuals

| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 46 github-sync-foundations | 10 | reconstructed | 3h 45m / 8h 20m | excluded: incomplete actuals (46-07, 46-08, 46-09, 46-10) | n/a | n/a | $40.73 / $68.83 | $31.70 | 1.28 | yes |
| 47 github-authoritative-store | 14 | reconstructed | 5h 16m / 11h 37m | excluded: incomplete actuals (47-02, 47-04, 47-06, 47-07, 47-09, 47-10, 47-11, 47-12, 47-13, 47-14) | n/a | n/a | $56.69 / $95.64 | $39.20 | 1.45 | yes |
| 48 planning-write-path-migration | 23 | reconstructed | 6h 38m / 15h 39m | excluded: incomplete actuals (48-03, 48-04, 48-05, 48-17, 48-18, 48-21, 48-23) | n/a | n/a | $74.93 / $122.14 | $83.08 | 0.90 | yes |
| 49 objective-branch-and-pr-lifecycle | 15 | reconstructed | 4h 19m / 10h 15m | excluded: incomplete actuals (49-10, 49-12, 49-14, 49-15) | n/a | n/a | $42.33 / $68.53 | $39.34 | 1.08 | yes |
| 50 github-enforcement-and-setup | 13 | reconstructed | 3h 44m / 8h 54m | 4h 21m | 0.86 | yes | $37.83 / $60.00 | $30.38 | 1.25 | yes |
| 51 github-migration-and-docs | 10 | reconstructed | 2h 51m / 6h 52m | excluded: incomplete actuals (51-03) | n/a | n/a | $34.09 / $68.67 | $49.05 | 0.69 | yes |
| 52 store-mode-polish | 6 | reconstructed | 1h 47m / 4h 08m | 1h 02m | 1.73 | yes | $19.25 / $27.12 | $24.68 | 0.78 | yes |
| 53 worktree-and-health-hygiene | 7 | reconstructed | 1h 59m / 4h 50m | 2h 14m | 0.89 | yes | $20.73 / $38.87 | $20.30 | 1.02 | yes |
| 54 codeql-cleanup | 10 | reconstructed | 2h 42m / 6h 55m | excluded: incomplete actuals (54-02, 54-10) | n/a | n/a | $28.38 / $38.70 | excluded: incomplete actuals (54-10) | n/a | n/a |
| 55 store-live-smoke-fixes | 8 | reconstructed | 2h 09m / 5h 33m | excluded: incomplete actuals (55-06) | n/a | n/a | $21.77 / $29.58 | $23.06 | 0.94 | yes |
| 56 objective-number-correctness | 5 | reconstructed | 1h 18m / 3h 05m | 36 min | 2.17 | yes | $14.68 / $20.58 | $15.72 | 0.93 | yes |
| 57 estimation-data-foundation | 7 | reconstructed | 1h 44m / 4h 18m | 1h 12m | 1.44 | yes | $21.29 / $28.93 | $21.41 | 0.99 | yes |
| 58 estimation-engine-and-surfacing | 10 | reconstructed | 2h 20m / 6h 10m | 2h 27m | 0.95 | yes | $31.15 / $40.75 | $24.60 | 1.27 | yes |
| 59 state-and-merge-plumbing | 7 | reconstructed | 1h 28m / 3h 47m | 1h 24m | 1.05 | yes | $18.91 / $25.58 | $23.88 | 0.79 | yes |
| 60 edit-gate-enforces-the-action | 7 | reconstructed | 1h 22m / 3h 49m | 1h 14m | 1.10 | yes | $20.70 / $35.02 | $19.79 | 1.05 | yes |
| 61 store-mode-rough-edges-and-observability | 9 | reconstructed | 1h 41m / 3h 50m | 1h 10m | 1.45 | yes | $25.93 / $36.88 | $27.57 | 0.94 | yes |
| 62 built-in-sweep | 11 | reconstructed | 2h 00m / 3h 48m | 1h 36m | 1.25 | yes | $30.73 / $39.43 | $45.75 | 0.67 | no |
| 63 todo-store-hook-coexistence-and-built-in-inventory | 7 | reconstructed | 1h 09m / 2h 27m | 1h 52m | 0.62 | yes | $21.06 / $30.47 | $27.16 | 0.78 | yes |
| 64 estimate-accuracy-validation | 10 | reconstructed | 1h 37m / 3h 00m | 2h 28m | 0.66 | yes | $28.25 / $48.27 | excluded: incomplete actuals (64-09, 64-10) | n/a | n/a |
| 65 Release v1.5 | 4 | reconstructed | 42 min / 1h 14m | excluded: incomplete actuals (65-02, 65-03, 65-04) | n/a | n/a | $6.32 / $9.18 | excluded: incomplete actuals (65-02, 65-03) | n/a | n/a |
| 66 Executor token stamp | 4 | reconstructed | 42 min / 1h 10m | 41 min | 1.02 | yes | $11.73 / $18.56 | $12.71 | 0.92 | yes |

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 13 | 1.05 | 1.03 | 7 of 13 | 13 of 13 (100%) | 160 of 165 (97%) | 8 of 13 (62%) |
| Cost | 18 | 0.94 | 0.97 | 15 of 18 | 17 of 18 (94%) | 168 of 192 (88%) | 7 of 18 (39%) |

### Wall time (prospective run states)

none recorded

### Task classes

**Agent minutes**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 219 | 1.18 | 91% | ok |
| prompt_tdd | 40 | 1.41 | 95% | miscalibrated: biased_high |
| doc | 26 | 0.60 | 100% | miscalibrated: biased_low |
| test_tdd | 25 | 0.67 | 84% | miscalibrated: biased_low |
| other | 22 | 1.13 | 82% | ok |
| test | 20 | 0.86 | 100% | ok |
| schema_tdd | 14 | 0.79 | 86% | ok |
| prompt | 10 | 0.69 | 90% | miscalibrated: biased_low |
| code | 8 | 1.12 | 100% | ok |
| config | 2 | 2.52 | 100% | too_few |
| doc_tdd | 2 | 0.78 | 50% | too_few |
| schema | 1 | 3.00 | 100% | too_few |

**Cost**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 254 | 1.06 | 91% | ok |
| prompt_tdd | 49 | 0.77 | 65% | miscalibrated: p90_too_narrow |
| test_tdd | 38 | 0.90 | 89% | ok |
| doc | 27 | 1.09 | 96% | ok |
| test | 23 | 0.83 | 74% | miscalibrated: p90_too_narrow |
| other | 22 | 0.94 | 86% | ok |
| schema_tdd | 14 | 0.63 | 100% | miscalibrated: biased_low |
| prompt | 12 | 0.64 | 42% | miscalibrated: biased_low, p90_too_narrow |
| code | 9 | 1.01 | 89% | ok |
| config | 3 | 1.46 | 100% | miscalibrated: biased_high |
| doc_tdd | 3 | 0.89 | 67% | miscalibrated: p90_too_narrow |
| schema | 1 | 1.28 | 100% | too_few |

### Miscalibrated classes

- prompt_tdd (minutes): biased_high, median ratio 1.41, coverage 95%
- doc (minutes): biased_low, median ratio 0.60, coverage 100%
- test_tdd (minutes): biased_low, median ratio 0.67, coverage 84%
- prompt (minutes): biased_low, median ratio 0.69, coverage 90%
- prompt_tdd (cost): p90_too_narrow, median ratio 0.77, coverage 65%
- test (cost): p90_too_narrow, median ratio 0.83, coverage 74%
- schema_tdd (cost): biased_low, median ratio 0.63, coverage 100%
- prompt (cost): biased_low, p90_too_narrow, median ratio 0.64, coverage 42%
- config (cost): biased_high, median ratio 1.46, coverage 100%
- doc_tdd (cost): p90_too_narrow, median ratio 0.89, coverage 67%

### Exclusions

- Agent minutes, objective 46: incomplete actuals (46-07, 46-08, 46-09, 46-10)
- Agent minutes, objective 47: incomplete actuals (47-02, 47-04, 47-06, 47-07, 47-09, 47-10, 47-11, 47-12, 47-13, 47-14)
- Agent minutes, objective 48: incomplete actuals (48-03, 48-04, 48-05, 48-17, 48-18, 48-21, 48-23)
- Agent minutes, objective 49: incomplete actuals (49-10, 49-12, 49-14, 49-15)
- Agent minutes, objective 51: incomplete actuals (51-03)
- Agent minutes, objective 54: incomplete actuals (54-02, 54-10)
- Agent minutes, objective 55: incomplete actuals (55-06)
- Agent minutes, objective 65: incomplete actuals (65-02, 65-03, 65-04)
- Cost, objective 54: incomplete actuals (54-10)
- Cost, objective 64: incomplete actuals (64-09, 64-10)
- Cost, objective 65: incomplete actuals (65-02, 65-03)

---

Calibration rolling: one calibration per objective, data as of 2026-10-08, samples n/a TRDs / n/a tasks / n/a with tokens, inputs_digest sha256:8980480cece504a5a86840c3f93286bffcaf62887c1bfc979d152cfe025d1121. Band ±30%, coverage target 80%.

### Calibrations

| Objective | Data as of | Samples (TRDs) | Window | inputs_digest |
|---|---|---|---|---|
| 46 | 2026-10-03 | 98 | 10 | sha256:8f3d9402654d26eed031d7dd56cb415fc4461d43f39f64b37193aeaa074e7015 |
| 47 | 2026-10-03 | 101 | 10 | sha256:530122e33c742a1f1eb15d6eda44cafe7c55d602ff47613a487cd32460ceb03b |
| 48 | 2026-10-03 | 99 | 10 | sha256:6cfc5de89204ae5d1fdcd8ed6c632b0f86600a7a3bfc0d6999772180c13c34d7 |
| 49 | 2026-10-03 | 110 | 10 | sha256:95fd732d36f963cea6356009f0065be2ffb56bd402e75408605acb35515a16a8 |
| 50 | 2026-10-03 | 120 | 10 | sha256:4bbef58454d49c767b1717f034f2dd070f0870095a733bdd4528047c03244d29 |
| 51 | 2026-10-03 | 127 | 10 | sha256:a80f939da311aa0f3ab65ebebe93d472ee3498eca56487ab51e0014ced09fefb |
| 52 | 2026-10-03 | 134 | 10 | sha256:5f563442def4bfd2480e42f64c2db0ac47ab61d9fee0774aee729eb65503a170 |
| 53 | 2026-10-04 | 126 | 10 | sha256:3101a1f49dcd0f2e275d2793a3920bf91121e613d9e5ef73d33aadfa1ba5a528 |
| 54 | 2026-10-04 | 118 | 10 | sha256:4f6805d15600e0c64c24a634462d36c8e084f45e23bfc643ec3ba1d493b35368 |
| 55 | 2026-10-04 | 117 | 10 | sha256:fd61cbf6e52b4fda432805bedbde75403dd58a8fb362b9b0eaca72ccdef8359a |
| 56 | 2026-10-05 | 115 | 10 | sha256:82355b614036b89436562981f2cc410e33d734959467d9778377b792856b75ae |
| 57 | 2026-10-05 | 110 | 10 | sha256:451aa316623c6d475fc5cc8005b4677b204fbac09702668768390f1d7f4aea07 |
| 58 | 2026-10-05 | 103 | 10 | sha256:97ebc006441b0e81de6390f59823cd2b86b2632481a15c85e56a0c6b079713b3 |
| 59 | 2026-10-05 | 90 | 10 | sha256:cf7d340efd8b3c71082619dce9b0133cb1d6f1a6da3df1e0959ce6e0aac350a4 |
| 60 | 2026-10-05 | 82 | 10 | sha256:b97567ae6d3c9b002eb53d9f37c1cad71e1d135162fae3750fb73639a5c1a703 |
| 61 | 2026-10-06 | 76 | 10 | sha256:412748d772c15e88a4c16c2c993c71adbe6922b76b62c6f793c67615e0cd6bed |
| 62 | 2026-10-06 | 75 | 10 | sha256:7a63b6a3915cffba4c06d69a8e8244affbd799bf7a5feebcfea5e5d352afbc03 |
| 63 | 2026-10-06 | 80 | 10 | sha256:33f1ce5dabfc5ad78990874cc36c50532de8c1febaa356f02bd0df5b53b7a2aa |
| 64 | 2026-10-07 | 80 | 10 | sha256:0c094407516af5dc519d7e9ad3e260698bb420bc5f23d2e3c3e5579511af7662 |
| 65 | 2026-10-08 | 81 | 10 | sha256:ad81e8d8791873cac04b205b5c64cdbf59e64a6e856738d3503cc49be1874b29 |
| 66 | 2026-10-08 | 76 | 10 | sha256:34bd4b5ae9cf2c4bcd56f25da541107f37b5c8e0b033a92806ce1a5be8b0fbb7 |

## 6. Ship rule

`shipRule(oldResult, newResult)` is 64's code, unchanged. Its answer, as `score.json` prints it (`ship`):

```json
{
  "est08_old": "met",
  "est08_new": "met",
  "minutes_median_old": 1.021,
  "minutes_median_new": 1.051,
  "improved": false,
  "regressions": [],
  "ship_default": true,
  "reason": "the new method meets EST-08"
}
```

The harness's closing section (its heading demoted one level, otherwise unedited):

### Before and after

| Objective | Minutes ratio old | Minutes ratio new | Cost ratio old | Cost ratio new |
|---|---|---|---|---|
| 46 | n/a | n/a | 1.28 | 1.28 |
| 47 | n/a | n/a | 1.45 | 1.45 |
| 48 | n/a | n/a | 0.90 | 0.90 |
| 49 | n/a | n/a | 1.08 | 1.08 |
| 50 | 0.70 | 0.86 | 1.25 | 1.25 |
| 51 | n/a | n/a | 0.69 | 0.69 |
| 52 | 1.98 | 1.73 | 0.78 | 0.78 |
| 53 | 1.02 | 0.89 | 1.02 | 1.02 |
| 54 | n/a | n/a | n/a | n/a |
| 55 | n/a | n/a | 0.94 | 0.94 |
| 56 | 2.27 | 2.17 | 0.93 | 0.93 |
| 57 | 1.62 | 1.44 | 0.99 | 0.99 |
| 58 | 0.92 | 0.95 | 1.27 | 1.27 |
| 59 | 0.96 | 1.05 | 0.79 | 0.79 |
| 60 | 1.24 | 1.10 | 1.05 | 1.05 |
| 61 | 1.44 | 1.45 | 0.94 | 0.94 |
| 62 | 1.39 | 1.25 | 0.67 | 0.67 |
| 63 | 0.70 | 0.62 | 0.78 | 0.78 |
| 64 | 0.64 | 0.66 | n/a | n/a |
| 65 | n/a | n/a | n/a | n/a |
| 66 | 0.90 | 1.02 | 0.92 | 0.92 |

EST-08 old: met; new: met

Ship default: true (the new method meets EST-08)

- `ship_default`: **true**. Reason, verbatim: "the new method meets EST-08".
- `method_selected`: **trd_level**.
- Frozen method: `{minutes: trd_level, window_objectives: 10, through_objective: 66}`. `calibrate`'s default minutes method becomes `trd_level` in 67-05, and 67-09 builds the one frozen EST-11 calibration with this method.

Reading of the rule's inputs, from the same output: the first clause (the new verdict is `met`) is what fired. `improved` is `false`: the agent-minutes median ratio is 1.021 for the old method and 1.051 for the new, so the new is not closer to 1. `regressions` is empty: no status that passes under the old method fails under the new. Cost is identical under both methods (median 0.943, pooled 0.973, 15 of 18 in band, P90 covers 168 of 192 TRDs) because the method changes minutes only.

## 7. Subsets (descriptive only)

The same harness, the same 42 files and `--repo <scratch>/snap`, over three subsets. **Descriptive; does not decide.** None of these changes `method_selected`. The aggregates below are verbatim from `<scratch>/sub-46-58.md`, `sub-59-63.md` and `sub-64-66.md`.

### 46-58

**Old method (task_sum)**

- Agent minutes: SC2 fail (median ratio 1.32, 2 of 6 objectives in ±30%) · SC3 pass (P90 covers 6 of 6 objectives (100%) and 100 of 109 TRDs (92%); target 80%)
- Cost: SC2 pass (median ratio 1.01, 10 of 12 objectives in ±30%) · SC3 pass (P90 covers 12 of 12 objectives (100%) and 125 of 137 TRDs (91%); target 80%)

EST-08: not met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 6 | 1.32 | 1.09 | 2 of 6 | 6 of 6 (100%) | 100 of 109 (92%) | 4 of 6 (67%) |
| Cost | 12 | 1.01 | 1.03 | 10 of 12 | 12 of 12 (100%) | 125 of 137 (91%) | 6 of 12 (50%) |

**New method (trd_level)**

- Agent minutes: SC2 pass (median ratio 1.20, 3 of 6 objectives in ±30%) · SC3 pass (P90 covers 6 of 6 objectives (100%) and 106 of 109 TRDs (97%); target 80%)
- Cost: SC2 pass (median ratio 1.01, 10 of 12 objectives in ±30%) · SC3 pass (P90 covers 12 of 12 objectives (100%) and 125 of 137 TRDs (91%); target 80%)

EST-08: met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 6 | 1.20 | 1.08 | 3 of 6 | 6 of 6 (100%) | 106 of 109 (97%) | 3 of 6 (50%) |
| Cost | 12 | 1.01 | 1.03 | 10 of 12 | 12 of 12 (100%) | 125 of 137 (91%) | 6 of 12 (50%) |

EST-08 old: not met; new: met

Ship default: true (the new method meets EST-08)

### 59-63

**Old method (task_sum)**

- Agent minutes: SC2 pass (median ratio 1.24, 2 of 5 objectives in ±30%) · SC3 pass (P90 covers 5 of 5 objectives (100%) and 40 of 41 TRDs (98%); target 80%)
- Cost: SC2 pass (median ratio 0.79, 4 of 5 objectives in ±30%) · SC3 pass (P90 covers 4 of 5 objectives (80%) and 33 of 41 TRDs (80%); target 80%)

EST-08: met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.24 | 1.11 | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 3 of 5 (60%) |
| Cost | 5 | 0.79 | 0.81 | 4 of 5 | 4 of 5 (80%) | 33 of 41 (80%) | 1 of 5 (20%) |

**New method (trd_level)**

- Agent minutes: SC2 pass (median ratio 1.10, 3 of 5 objectives in ±30%) · SC3 pass (P90 covers 5 of 5 objectives (100%) and 40 of 41 TRDs (98%); target 80%)
- Cost: SC2 pass (median ratio 0.79, 4 of 5 objectives in ±30%) · SC3 pass (P90 covers 4 of 5 objectives (80%) and 33 of 41 TRDs (80%); target 80%)

EST-08: met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.10 | 1.06 | 3 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 4 of 5 (80%) |
| Cost | 5 | 0.79 | 0.81 | 4 of 5 | 4 of 5 (80%) | 33 of 41 (80%) | 1 of 5 (20%) |

EST-08 old: met; new: met

Ship default: true (the new method meets EST-08)

### 64-66

**Old method (task_sum)**

- Agent minutes: SC2 insufficient (2 objectives compared, 3 needed) · SC3 insufficient (2 objectives compared, 3 needed)
- Cost: SC2 insufficient (1 objective compared, 3 needed) · SC3 insufficient (1 objective compared, 3 needed)

EST-08: not met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 2 | 0.77 | 0.69 | 1 of 2 | 2 of 2 (100%) | 12 of 15 (80%) | 0 of 2 (0%) |
| Cost | 1 | 0.92 | 0.92 | 1 of 1 | 1 of 1 (100%) | 10 of 14 (71%) | 0 of 1 (0%) |

**New method (trd_level)**

- Agent minutes: SC2 insufficient (2 objectives compared, 3 needed) · SC3 insufficient (2 objectives compared, 3 needed)
- Cost: SC2 insufficient (1 objective compared, 3 needed) · SC3 insufficient (1 objective compared, 3 needed)

EST-08: not met

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 2 | 0.84 | 0.74 | 1 of 2 | 2 of 2 (100%) | 14 of 15 (93%) | 1 of 2 (50%) |
| Cost | 1 | 0.92 | 0.92 | 1 of 1 | 1 of 1 (100%) | 10 of 14 (71%) | 0 of 1 (0%) |

EST-08 old: not met; new: not met

Ship default: true (the agent-minutes median ratio is closer to 1 (new 0.838, old 0.769) and no passing status regresses)

Two observations, neither of which is acted on. First, on 59-63 this protocol's old method returns EST-08 `met` with cost P90 covering 33 of 41 TRDs (80%), where 64-VALIDATION reported `not met` with 32 of 41 (78%) on the same five objectives. The agent-minutes p50, P90 and actual of 59-63 are identical to the PC2 values at full precision (59: 80.6 / 223.4 / 84; 60: 91.6 / 214.4 / 74; 61: 100.6 / 224.9 / 70; 62: 133.8 / 285.2 / 96; 63: 78.1 / 171.8 / 112), but the cost p50 / P90 differ (59: 18.9121 / 25.5815 here and 19.0268 / 25.7994 in the PC2 cut; 60: 20.6954 / 35.0158 and 19.9731 / 28.2953; 61: 25.9349 / 36.8783 and 25.9458 / 37.5934; 62: 30.7335 / 39.4277 and 30.3968 / 44.0281; 63: 21.0551 / 30.4747 and 18.0529 / 27.8531). The two use different data: 64's cut is `git archive FIRST^` and this protocol's is the decision snapshot with `--through N-1`. The cause of the cost difference was not investigated. Second, 64-66 holds too few compared objectives (2 for minutes, 1 for cost) for SC2 and SC3 to be evaluated.

## 8. Limits

DECISION-003 V6: this is a leave-future-out reconstruction with today's code; the method family is not blind to objectives up to 63 (it was suggested by data from objectives up to 63, which are in this set), acceptable only because `trd_level` has no free parameter; per-objective spread is wide. EST-11 on 68-72 with the frozen calibration is the prospective test, and nothing is tuned to pass it.

Also from the harness output:

- **Agent minutes: 13 of 21 objectives compared, 8 excluded** for incomplete actuals (some TRD of the objective has no minutes in its SUMMARY): 46 (46-07, 46-08, 46-09, 46-10), 47 (47-02, 47-04, 47-06, 47-07, 47-09, 47-10, 47-11, 47-12, 47-13, 47-14), 48 (48-03, 48-04, 48-05, 48-17, 48-18, 48-21, 48-23), 49 (49-10, 49-12, 49-14, 49-15), 51 (51-03), 54 (54-02, 54-10), 55 (55-06), 65 (65-02, 65-03, 65-04). The minutes verdict therefore rests mostly on 50, 52, 53, 56-64 and 66.
- **Cost: 18 of 21 objectives compared, 3 excluded** for incomplete actuals: 54 (54-10), 64 (64-09, 64-10), 65 (65-02, 65-03).
- The two methods give the same score on the full set at the verdict level (both `met`); the ship rule's decision comes from the new method's own verdict, not from an improvement over the old. The in-band count (7 of 13 against 5 of 13) and the TRD coverage (97% against 92%) favour the new method; the median ratio (1.051 against 1.021) does not. These are reported, not weighed: the rule was fixed before the numbers.
- The objective's miscalibrated-classes tables and exclusions are in the verbatim sections 4 and 5.
- `wall_minutes` is not scored here (no prospective run states for these objectives).

## 9. Reproduce

`<scratch>` is an empty directory outside the repository and outside `~/.claude`. The repository's own `df-tools` and `scripts/` are used (the home mirror predates `--minutes` and `--through`). Run from the repository root; nothing here writes `~/.claude/devflow/calibration.json` (it hashes to `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648` before and after).

```
# preconditions
git log -1 --format=%H -- .planning/decisions/resolved/DECISION-003.md        # d888f55790f4b7144a33c514767467627bced9ba
git merge-base --is-ancestor d888f55790f4b7144a33c514767467627bced9ba HEAD
git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md   # nothing, before this document was committed
shasum -a 256 ~/.claude/devflow/calibration.json

# PC1
mkdir -p <scratch>/pre59
git archive --format=tar -o <scratch>/pre59.tar 401a9145^ .planning
tar -xf <scratch>/pre59.tar -C <scratch>/pre59
node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/pc1.json --raw > <scratch>/pc1.md
shasum -a 256 <scratch>/pc1.json     # fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516

# PC2, per N with FIRST = 59 401a9145, 60 05a5b5f4, 61 d7b9c938, 62 9ad19b1c, 63 26e4e57f
mkdir -p <scratch>/cut-N
git archive --format=tar -o <scratch>/cut-N.tar FIRST^ .planning
tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window 10 --minutes task_sum --out <scratch>/pc2-N.json --raw
node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/pc2-59.json … --old 63=<scratch>/pc2-63.json --json <scratch>/pc2.json --raw > <scratch>/pc2.md

# V1 snapshot and leak check
mkdir -p <scratch>/snap
git archive --format=tar -o <scratch>/snap.tar d888f55790f4b7144a33c514767467627bced9ba .planning
tar -xf <scratch>/snap.tar -C <scratch>/snap
ls <scratch>/snap/.planning/objectives > <scratch>/snap-objectives.txt
rg -n "^(6[89]|7[0-2])-" <scratch>/snap-objectives.txt          # prints nothing, exit 1

# V2 cuts, per N from 46 to 66
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/snap --through N-1 --window 10 --no-overhead --minutes task_sum --out <scratch>/cal-old-N.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/snap --through N-1 --window 10 --no-overhead --minutes trd_level --out <scratch>/cal-new-N.json --raw

# V4 score, once
node scripts/estimate-rolling-backtest.cjs --old 46=<scratch>/cal-old-46.json … --old 66=<scratch>/cal-old-66.json --new 46=<scratch>/cal-new-46.json … --new 66=<scratch>/cal-new-66.json --repo <scratch>/snap --json <scratch>/score.json --raw > <scratch>/score.md

# secondary, descriptive only: the same command over 46-58, 59-63 and 64-66
```

The cut check and the PC2 comparison are two short Node scripts that read the JSON files named above; they were run from `<scratch>` and are not part of the repository.
