---
objective: 64-estimate-accuracy-validation
type: diagnosis
requirement: EST-08
decision: build_window
window_objectives: 10
grid: [10, 15, 20, 30, 40]
snapshot_ref: 401a9145^
snapshot_sha: cce70b30945f358faa0c848f6f3a95f5423a1b59
selection_set: objectives 46-58, rolling origin by objective number inside the snapshot
selection_output_sha256: fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516
generated: 2026-10-07
---

# Objective 64: why agent minutes run high (pre-59 evidence) and the frozen method

## 1. Question and constraints

64-05 measured EST-08 as not met on objectives 59-63: the median estimate of agent minutes is 1.51 times the actual (2 of 5 objectives within +-30%, SC2 fail); cost passes (median ratio 0.86); the P90 covers. The user chose to fix the minutes estimate now and re-run the backtest. Two rules bind everything in 64-07 to 64-10:

1. Fix the method, not the target. Diagnose before changing anything. No fudge multiplier fitted to 59-63, no change to the EST-08 thresholds in `estimate-backtest.cjs`, no change to the actuals.
2. Validation must be honest. A calibration that contains 59-63 is in-sample and does not count. Any parameter the fix introduces is chosen on a history that excludes 59-63 and frozen, in a committed document, before 59-63 is scored.

This document is that committed record. Every number in it comes from `git archive 401a9145^ .planning` (commit `cce70b30945f358faa0c848f6f3a95f5423a1b59`, the parent of objective 59's first commit); the extracted snapshot lists no objective numbered 59 or above (section 8). No SUMMARY, actual, calibration or backtest of objectives 59-63 was read to produce it. The one parameter the fix can introduce is a recency window for `calibrate`; `stop` (no candidate beats the current method) was a valid outcome, and the pre-registered rule selected a window instead (section 4).

## 2. Provenance of this protocol

The recency family was suggested by 64-05's diagnostics on 59-63 (its 42-58 window run) and by the gap-closure request,
so the family is not blind to 59-63; the parameter value is. The grid, the statistic and the eligibility rule were fixed
by the planner after a dry run on the pre-59 snapshot only (a rolling-origin sweep of windows all, 40, 30, 20, 15, 10, 8
and 5 over objectives 46-58) and before any windowed calibration was scored on 59-63. That sweep gave W=5 and W=8 a
lower or similar statistic S than W=10; they are excluded by a sample-size floor (when the planner counted classes at
the end of the snapshot, W=5 left prompt, prompt_tdd and test_tdd under the estimator's 5-sample class floor; W=8 did
not, so 10 is a round-number lower bound, not a derived one; section 4 reports the same counts at the last selection
cut). No 59-63 actual was used to choose anything in this document.

## 3. Suspects

Each suspect for the minutes bias was tested with a number printed by `scripts/estimate-window-eval.cjs report` on the pre-59 snapshot (section 8). "In sample" means the calibration of the whole snapshot against its own 257 TRDs that have minutes; "rolling" means the rolling-origin estimates of section 4.

| Suspect | Deciding number (from the run) | Verdict |
|---|---|---|
| S1 older or slower history (eras) | Four equal-count eras of 64-65 TRDs: objectives 0-20 median actual 7.0 min, median ratio 1.50, pooled 0.88; 20-43 median actual 20.0, ratio 0.66, pooled 0.47; 43-50 median actual 14.0, ratio 0.88, pooled 0.71; 50-58 median actual 11.0, ratio 1.24, pooled 0.85. The calibration's median p50 per TRD is 10.5-12.0 in every era, so the same medians serve a history whose median actual runs 7, 20, 14, 11. | supported. History is not stationary and the all-history medians are too high for the latest era (median ratio 1.24); the oldest era is over-estimated too (1.50), so it is the mix of eras, not age alone, that shows. |
| S2 duration source | 248 TRDs take their minutes from the SUMMARY duration (median 12.0 min, median ratio 1.00); 9 take them from a STATE_ARCHIVE metric row (median 20.0 min, median ratio 0.60). | not supported. Only 9 of 257 TRDs use the metric source and their estimates sit below the actual (0.60), the opposite of the bias. |
| S3 executor overhead counted twice | Test item 17 in `scripts/estimate-window-eval.test.cjs` (a characterization test against the current code, passing without any change to plugins/): with a calibration that has planner and verifier `agent_overhead` samples, `estimateObjective(...).execution.agent_minutes` equals `summarize(sumCorrelated(<the two TRD minutes distributions>))` exactly, and the verifier appears only in `overhead` and `total`. | not supported. No overhead term is in `execution.agent_minutes`. |
| S4 classifier, class `other` | Class `other` (tasks with no `<files>`): n 9, p50 11.0, P90 45.0 minutes per task; 4 of its 9 samples sit in TRDs of 45 minutes or more (37-11 to 37-14, shares 45.0, 35.0, 27.5, 22.5); the five later samples have shares 3.0, 11.0, 5.0, 5.0, 5.0. In the all-history rolling rows the four selection-set TRDs that hold an `other` task are estimated at 9.0, 31.5, 45.0, 19.5 minutes against actuals 6, 22, 10, 15, an excess of 52 minutes over 1628.4 estimated TRD minutes (3.2%). The class is 9 of 587 tasks (1.5%). | supported, small. The class median is inflated by four adopt-smoke TRDs and one TRD (55-07) is over-estimated 4.5 times, but the whole class moves the selection-set total by about 3%, far less than the 12% median bias. At W=10 the class has 4 samples (below the floor of 5) and falls back to the all-task figures. |
| S5 TRD minutes against task count | In-sample median ratio by auto tasks per TRD: 1 task 0.62 (12 TRDs), 2 tasks 0.91 (160 TRDs), 3 tasks 1.29 (85 TRDs); no TRD has 4 or more. | supported, second order. A TRD's minutes do not grow in proportion to its task count (the estimate splits minutes equally over tasks), but the groups cancel in sample and the effect is not a candidate here (scope). The existing todo stays open for it. |
| S6 composition of TRDs into an objective (rho 0.5) | In sample (47 objectives): median F/P 1.13, median P/A 0.91, median F/A 0.99, pooled F/A 0.78. Rolling, all history (13 objectives): median F/P 1.14, median P/A 0.98, median F/A 1.12, pooled F/A 0.97. (P is the sum of the TRD medians, F the correlated-sum median of the objective, A the actual.) | supported as the amplifier, not shown to be a defect. The rolling objective ratio 1.12 is the sum of medians (0.98 of actual) times the 1.14 inflation of the correlated sum over it; the inflation is what a median of a sum of right-skewed parts should show, and in sample it leaves the composed median centred (F/A 0.99). |
| S7 drift in the per-objective ratios | All-history rolling ratios of objectives 46-58 (section 4): objectives 46-52 median 0.94, objectives 53-58 median 1.60; 8 of 13 above 1.0, 6 above 1.3 (objective 47 by a hair), 2 below 0.7; range 0.45 to 2.42, 4th and 10th sorted values 0.75 and 1.64. | supported. The all-history estimate drifts high in the latest objectives (54, 55, 56, 57 are 2.15, 1.55, 2.42, 1.64), and the spread across objectives is wide. |

Read together: the all-history medians were set by slower, larger-TRD eras (S1), the latest objectives run faster than that history (S7), and the correlated sum carries the TRD-level excess into the objective total (S6). The first two are what a recency window addresses; S4 and S5 are real but small or second order, and S2 and S3 are cleared.

## 4. Selection

### 4.1 Selection rule (fixed before the run)

Selection set: the pre-59 snapshot (`git archive 401a9145^ .planning`), objectives numbered 46 to 58 that have at least
one autonomous TRD with SUMMARY minutes. For each such objective N and each candidate W in {all, 10, 15, 20, 30, 40}
the calibration is built in memory (no overhead) from the snapshot objectives numbered below N, keeping the W most
recent that have samples (all of them for `all`). N's TRDs that have minutes are estimated from their text with that
calibration; the objective row sums those TRDs only: actual = their minutes, p50 and P90 = the correlated sum (rho 0.5)
exactly as estimateObjective composes execution.agent_minutes. Per candidate: S = |ln(median of the objective ratios
p50/actual)|; in_band = objectives with ratio in [1-BAND, 1+BAND]; obj_coverage = share of objectives with actual <= P90;
trd_coverage = the same over TRD rows; trd_bias = |ln(median TRD ratio)|.
A window W != all is eligible only if obj_coverage >= COVERAGE_TARGET, trd_coverage >= COVERAGE_TARGET,
trd_bias <= all's trd_bias, in_band >= all's in_band, and S < all's S. The decision is the eligible window with the
smallest S; windows whose S differ by at most 0.02 resolve to the larger W. No eligible window means decision `stop`.

(Implementation notes, coded and tested before the run: BAND is 0.3 and COVERAGE_TARGET 0.8, imported from `estimate-backtest.cjs`. "Windows whose S differ by at most 0.02" is coded as: eligible windows whose S is within 0.02 of the smallest eligible S resolve to the largest of them (test 2e). `actual <= P90` tolerates a relative 1e-9 of floating-point noise, which changes no coverage on real data. The partial-sum rule applies: the selection objectives have minutes on only some of their TRDs, so the objective row sums the TRDs that have minutes, estimate and actual alike.)

### 4.2 Candidate table

Evaluation objectives: 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58 (13 objectives, 109 TRD rows).

| Window | S | In band | Obj coverage | TRD coverage | TRD bias | Median ratio | Per-objective ratios |
|---|---|---|---|---|---|---|---|
| all | 0.113 | 5 of 13 | 1.00 | 0.94 | 0.182 | 1.12 | 46: 1.12, 47: 1.30, 48: 0.94, 49: 0.69, 50: 0.73, 51: 0.45, 52: 1.77, 53: 0.75, 54: 2.15, 55: 1.55, 56: 2.42, 57: 1.64, 58: 1.05 |
| 10 | 0.047 | 6 of 13 | 1.00 | 0.92 | 0.101 | 1.05 | 46: 1.23, 47: 1.42, 48: 1.05, 49: 0.74, 50: 0.70, 51: 0.63, 52: 1.98, 53: 1.02, 54: 1.60, 55: 1.04, 56: 2.27, 57: 1.62, 58: 0.92 |
| 15 | 0.210 | 7 of 13 | 1.00 | 0.95 | 0.170 | 1.23 | 46: 1.25, 47: 1.42, 48: 0.79, 49: 0.81, 50: 0.78, 51: 0.66, 52: 1.96, 53: 0.73, 54: 1.98, 55: 1.23, 56: 2.63, 57: 1.92, 58: 0.96 |
| 20 | 0.216 | 6 of 13 | 1.00 | 0.95 | 0.251 | 1.24 | 46: 1.24, 47: 1.42, 48: 0.79, 49: 0.81, 50: 0.79, 51: 0.57, 52: 1.99, 53: 0.93, 54: 2.39, 55: 1.66, 56: 2.69, 57: 1.90, 58: 1.05 |
| 30 | 0.215 | 6 of 13 | 1.00 | 0.94 | 0.223 | 1.24 | 46: 1.13, 47: 1.30, 48: 0.95, 49: 0.74, 50: 0.79, 51: 0.51, 52: 1.87, 53: 0.85, 54: 2.34, 55: 1.62, 56: 2.42, 57: 1.72, 58: 1.24 |
| 40 | 0.130 | 5 of 13 | 1.00 | 0.94 | 0.223 | 1.14 | 46: 1.12, 47: 1.30, 48: 0.94, 49: 0.69, 50: 0.73, 51: 0.45, 52: 1.77, 53: 0.74, 54: 2.15, 55: 1.56, 56: 2.40, 57: 1.70, 58: 1.14 |

Eligibility, as printed by the run:

| Window | Eligible | Failed conditions |
|---|---|---|
| 10 | yes | none |
| 15 | no | S 0.210 is not below all's 0.113 |
| 20 | no | TRD bias 0.251 is worse than all's 0.182; S 0.216 is not below all's 0.113 |
| 30 | no | TRD bias 0.223 is worse than all's 0.182; S 0.215 is not below all's 0.113 |
| 40 | no | TRD bias 0.223 is worse than all's 0.182; S 0.130 is not below all's 0.113 |

### 4.3 Class sample counts at the last selection cut

Minutes samples per task class in the calibration built before objective 58 (the last selection cut), for W=10 and W=5. The estimator falls back to the all-task figures for a class with fewer than 5 samples.

| Class | W=10 | W=5 |
|---|---|---|
| code | 0 (below 5) | 0 (below 5) |
| code_tdd | 123 | 48 |
| config | 1 (below 5) | 1 (below 5) |
| doc | 15 | 9 |
| doc_tdd | 1 (below 5) | 0 (below 5) |
| other | 4 (below 5) | 3 (below 5) |
| prompt | 7 | 3 (below 5) |
| prompt_tdd | 16 | 3 (below 5) |
| schema | 1 (below 5) | 1 (below 5) |
| schema_tdd | 13 | 0 (below 5) |
| test | 5 | 5 |
| test_tdd | 18 | 3 (below 5) |

The planner's note in section 2 holds: at W=5 the classes prompt, prompt_tdd and test_tdd fall under the floor of 5 (3 samples each); at W=10 all three clear it (7, 16, 18).

### 4.4 Decision and how strong the evidence is

**decision: build_window, window_objectives: 10.** Window 10 is the only candidate that passes all five eligibility conditions, so the tie rule (S within 0.02) is not exercised. This is the output of the rule written before the run; nothing was changed after the table was seen.

The evidence for it is weak, and 64-09 should be read with that in mind:

- The sweep is not monotone in W. Against all-history S 0.113, the windows 15, 20 and 30 are far worse (S 0.210, 0.216, 0.215), 40 is slightly worse (0.130), and only 10 is better (0.047). A smooth recency effect would not produce a single good grid point surrounded by worse ones; part of W=10's advantage may come from where its edge falls rather than from recency as such, and this run cannot tell the two apart.
- The advantage is small against the spread. W=10's S is 0.066 below all-history's (median objective ratio 1.05 against 1.12). The per-objective ratios run from 0.45 to 2.42 for all-history (4th and 10th sorted values 0.75 and 1.64) and from 0.63 to 2.27 for W=10 (0.92 and 1.60); the difference in medians is a fraction of that spread.
- In band is 6 of 13 against 5 of 13: one objective. W=10 improves |ln ratio| for 8 of the 13 objectives and worsens it for 5. Its large gains are objectives 54 (ratio 2.15 to 1.60), 55 (1.55 to 1.04), 53 (0.75 to 1.02) and 51 (0.45 to 0.63); it is worse on 52 (1.77 to 1.98), 47 (1.30 to 1.42), 46 (1.12 to 1.23), 50 (0.73 to 0.70) and 58 (1.05 to 0.92).
- It does not remove the late-objective drift (S7): under W=10 the median ratio of objectives 53-58 is 1.32 (all-history 1.60) and of 46-52 is 1.05 (all-history 0.94).
- The pooled TRD ratio over the 109 selection TRD rows is 0.91 for W=10 and 0.86 for all-history (sum of estimated minutes 1725.5 and 1628.4 against 1904 actual): window 10 moves TRD totals toward the actual, and TRD coverage (0.92) stays above 0.8.
- The selection set is also the evidence: there is no hold-out inside objectives 46-58. The hold-out is 59-63, scored once under section 6.

## 5. Noise floor

Share of the 5-objective subsets of the 13 per-objective ratios whose median lies in the band [0.7, 1.3] (the SC2 test applied to a random 5-objective sample), by enumeration of all 1287 subsets (no random numbers):

| Ratios of | 5-subsets | Median in band | Share |
|---|---|---|---|
| all history | 1287 | 756 | 58.7% |
| window 10 | 1287 | 966 | 75.1% |

An estimator whose ratios have the spread of the all-history ratios passes SC2 on a random 5-objective sample 58.7% of the time; one with the centre and spread of window 10's ratios, 75.1% of the time. So a single five-objective verdict is noisy: even with window 10's pre-59 centre (median 1.05), about one random five-objective sample in four fails SC2 by chance, and a pass is not strong evidence that the window is right. The subsets overlap (they are 1287 draws from the same 13 ratios), so the shares describe the spread, not independent trials. Section 6 takes the single five-objective verdict as the result, with no second attempt.

## 6. Validation protocol (pre-registered; run once by 64-09)

V1 Cuts: for N = 59, 60, 61, 62, 63 with first commits 401a9145, 05a5b5f4, d7b9c938, 9ad19b1c, 26e4e57f, the data is
`git archive <first>^ .planning`. No other cut and no later data.
V2 Methods: old = `calibrate --paths <cut> --no-overhead --window all`; new = the same with `--window <window_objectives>`
(the value frozen above). No other window is run, before or after.
V3 Positive control: the old-method rolling rows must reproduce 64-05's published rolling table to its printed digits
(minutes p50/P90 and cost p50/P90 per objective, and the aggregate medians and pooled ratios). If they do not, nothing
is scored and the harness is reported defective.
V4 Verdict: each objective is estimated from its own cut calibration (estimateObjective, every TRD) and the five
estimates go through buildBacktest; its est08 is the verdict of the new method (met only when SC2 and SC3 pass for agent
minutes and for cost; thresholds are the unchanged constants of estimate-backtest.cjs). A met result is the EST-08
verdict; anything else leaves EST-08 not met. There is no second attempt: no other window, cut or rule after the result.
V5 Prospective point: objective 63's persisted wall estimate (run state sha256
08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee) is reported unchanged and never judged.
V6 Limits to state: five objectives is a small sample (see the noise floor), the cuts are leave-future-out
reconstructions (today's code on old data), and true prospective confirmation needs the next five objectives run with
the run history from 64-02.

## 7. Ship rule (pre-registered; coded as `shipRule` in scripts/estimate-rolling-backtest.cjs, read by 64-10)

ship_default is true when the new method's rolling verdict is `met`, or when its agent-minutes median ratio is closer to
1 than the old method's rolling one (smaller |ln ratio|) and none of the four verdict statuses (SC2 and SC3, agent
minutes and cost) that passes under the old method fails under the new. Then 64-10 makes the window the default of
`calibrate` and regenerates the live calibration, saying so. Otherwise the window stays an opt-in flag and the live
calibration is not touched.

## 8. Reproduce

`<scratch>` is any empty directory outside the repository. The run reads the snapshot and builds calibrations in memory; it writes only the two files named by `--json` and `>`, plus temporary cut directories it removes. It never writes `~/.claude/devflow/calibration.json` (which still hashes to `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`).

```
git rev-parse 401a9145^        # cce70b30945f358faa0c848f6f3a95f5423a1b59
mkdir -p <scratch>/pre59
git archive --format=tar -o <scratch>/pre59.tar 401a9145^ .planning
tar -xf <scratch>/pre59.tar -C <scratch>/pre59
ls <scratch>/pre59/.planning/objectives > <scratch>/pre59-objectives.txt
rg -n "^(59|6[0-9])-" <scratch>/pre59-objectives.txt     # leak check: prints nothing, exit 1
node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/diagnosis.json --raw > <scratch>/diagnosis.md
node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/diagnosis-2.json > /dev/null
shasum -a 256 <scratch>/diagnosis.json <scratch>/diagnosis-2.json     # two equal digests = selection_output_sha256
node --test scripts/estimate-window-eval.test.cjs
```

The leak check printed nothing; the snapshot lists 61 objective directories, the last being `58-estimation-engine-and-surfacing`. The two JSON outputs have the equal digest `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`, and the JSON holds no filesystem path and no date. The digest is of the script as committed in `f02f5536` running on the library code of that commit; 64-08 and 64-09 must reproduce it before they use `window_objectives`.

Figures in section 3 and 4.4 that the markdown does not print are plain reads of `diagnosis.json`: the medians of the all-history and window-10 per-objective ratios for objectives 46-52 and 53-58 (S7), the quartiles and counts of those ratios, the sums of `actual` and `p50` over the 109 `candidates[].objectives[].rows` (4.4), and, for S4, the rows whose `id` is in `other_class.tasks` (the sum of p50 minus actual over them is 52). The other-class and task-count totals come from the same file (`task_count` sums to 587 tasks over 257 TRDs).

Item 17 of the test list is a characterization test: it passes against the current code and has no RED commit. The test fixture passes the objective to `estimateObjective` as the string `'90'` (the library rejects a number).
