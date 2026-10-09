---
created: 2026-10-07T12:37:00.000Z
title: Recalibrate estimate minutes (EST-08 not met)
area: estimation
files: [plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/estimate.cjs]
---

## Problem

Objective 64's out-of-sample backtest (`.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md`, `df-tools estimate backtest 59,60,61,62,63` on the frozen calibration `5cf42c4b`) says EST-08 is **not met** because agent minutes fail SC2: median estimate / actual = **1.51**, outside 0.70-1.30, with 2 of 5 objectives in band (59 1.29, 60 1.51, 61 2.11, 62 1.63, 63 0.95; pooled 1.45). P90 covers (5 of 5 objectives, 40 of 41 TRDs) because the P90 is about three times the p50. Cost passes (median 0.86, P90 covers 4 of 5 and 34 of 41), but with thin margins.

Classes the verb flags (task shares of each TRD's actual):
- minutes, biased high: code_tdd 1.80 (41 tasks), prompt_tdd 1.88 (19), other 2.54 (9); biased low: test 0.68 (13), prompt 0.53 (3).
- cost, P90 too narrow: prompt_tdd 68% coverage, test 69%, prompt 33% (also biased low 0.27); test_tdd biased low 0.65. Five of the seven TRDs outside their cost P90 are in 62.

Diagnostics (all secondary, in the report):
- The 41 TRDs of 59-63 have two or three tasks and ran a median 9 min against a median estimate of 12. Actual time does not grow with task count (corr 0.00); the sum-of-task-medians estimate does (0.76). 3-task TRDs: 10 min actual vs 15 estimated (1.80). code_tdd's median actual share is 3.3 min per task against the calibration's p50 of 6.0.
- Rolling leave-future-out calibrations (recalibrating before each objective) still fail minutes SC2 (median 1.35) and would break cost SC3 (32 of 41 TRDs = 78.0%). Fresher data of the same kind does not fix it.
- A window of objectives 42-58 only (186 TRDs) gives minutes median 1.27 (inside the band, narrowly; pooled 1.34) and cost median 0.91, but the large classes stay flagged (code_tdd 1.65, prompt_tdd 2.63, test 0.41).
- SUMMARY minutes run a median 0.91 of the transcript span (about 10% low), and the calibration shares that bias; correcting for it would still leave the median near 1.38.

## Solution

Options the diagnostics support, in order of expected payoff (change the estimator only after choosing one, and never to pass a number):
1. Estimate a TRD's minutes from TRD-level history (a per-TRD median by task count or class mix) instead of summing per-task medians, since TRD time does not scale with task count in recent work. Compare on the 59-63 rows with `df-tools estimate backtest 59,60,61,62,63 --calibration <new>`.
2. Add a recency window or recency weighting to `calibrate` (the 42-58 window is the test case), and report window length in the calibration identity.
3. Widen cost P90 for the prompt_tdd, test and prompt classes, or fall back to a TRD-level cost distribution where class samples are small.

Next check: run `df-tools estimate backtest` on the next five objectives executed after this change. 64-02's run history makes their estimate prospective, so the verdict will no longer rest on a reconstruction. Re-open EST-08 on that evidence.
