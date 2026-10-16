---
objective: 64-estimate-accuracy-validation
type: accuracy-report
requirement: EST-08
verdict: not met
verdict_before: not met (frozen calibration, 64-05)
validation: 64-VALIDATION.md
diagnosis: 64-DIAGNOSIS.md
window_objectives: 10
default_changed: true
live_calibration_regenerated: true
live_calibration_sha256_before: 5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea
live_calibration_sha256_after: 9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648
generated: 2026-10-07
calibration_sha256: 5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea
---

# Objective 64: Estimate accuracy against objectives 59-63

## Verdict

**EST-08 not met.** SC1 met (this report: rows for 59, 60, 61, 62 and 63). SC2 **fail** for agent minutes (median ratio
1.51, 2 of 5 objectives within ±30%) and pass for cost (median ratio 0.86, 4 of 5 within ±30%). SC3 **pass** for both
(agent minutes: P90 covers 5 of 5 objectives and 40 of 41 TRDs; cost: 4 of 5 objectives and 34 of 41 TRDs).

The verdict is what `df-tools estimate backtest 59,60,61,62,63` printed from the rules pinned in 64-01 (median ratio
within 0.70-1.30; P90 covering at least 80% of objectives and of TRDs; for agent minutes and for cost; no threshold,
input or estimator code was changed after seeing the data). The estimate reads agent minutes about 1.5 times high.
The classes the verb flags are code_tdd (1.80), prompt_tdd (1.88) and other (2.54) on the high side and test (0.68)
and prompt (0.53) on the low side for minutes, and prompt_tdd, test, test_tdd and prompt for cost. The follow-up is
recorded in the pending todos named under "Miscalibrated classes and follow-up".

**Gap closure, added afterwards (plans 64-07 to 64-10): default changed but EST-08 not met.** The numbers above are the
64-05 result on the frozen calibration and stay as they are. A recency window of 10 objectives was then chosen on
pre-59 history, scored once on 59-63 out of sample and shipped as the `calibrate` default; EST-08 is still not met. See
"Gap closure" below.

## Gap closure (plans 64-07 to 64-10): default changed but EST-08 not met

**Default changed but EST-08 not met.** The `calibrate` default is now a recency window of the most recent 10
objectives, and the live calibration was regenerated with it. The agent-minutes median ratio fell from 1.348 to 1.238
and agent-minutes SC2 passes, but the number of objectives inside the band stayed at 2 of 5 and cost SC3 is unchanged at
32 of 41 TRDs (78%, target 80%). EST-08 stays unchecked.

**Why and how.** After 64-05 the user chose to fix the minutes estimate and re-run the backtest, under two locked rules:
fix the method, not the target (no multiplier fitted to 59-63, no change to the EST-08 thresholds, the inputs or the
actuals), and validate honestly (a parameter is chosen on a history that excludes 59-63 and is frozen in a committed
document before 59-63 is scored). 64-07 tested seven suspects on the pre-59 snapshot (`git archive 401a9145^ .planning`,
commit `cce70b30`) and froze the method in 64-DIAGNOSIS.md; 64-08 built `calibrate --window` and the rolling harness; 64-09
scored the frozen protocol once, after a positive control reproduced 64-05's old-method rolling table at every printed
digit; this plan acted on the result.

**Diagnosis (pre-59 evidence only, 64-DIAGNOSIS.md section 3).**

| Suspect | Verdict | Deciding number |
|---|---|---|
| S1 older or slower history | supported | Four equal-count eras have median actual 7.0, 20.0, 14.0 and 11.0 min and median ratio 1.50, 0.66, 0.88 and 1.24 while the calibration's median p50 per TRD is 10.5-12.0 in every era: one set of medians serves a non-stationary history |
| S2 duration source | not supported | 9 of 257 TRDs use a STATE_ARCHIVE metric row; their median ratio is 0.60, the opposite of the bias |
| S3 executor overhead counted twice | not supported | a characterization test shows `execution.agent_minutes` equals the correlated sum of the TRD minutes exactly; the verifier appears only in `overhead` and `total` |
| S4 class `other` | supported, small | 9 of 587 tasks; the whole class moves the selection-set total by about 3.2% against a 12% median bias |
| S5 minutes against task count | supported, second order | median ratio 0.62 (1 task, 12 TRDs), 0.91 (2 tasks, 160), 1.29 (3 tasks, 85); the groups cancel in sample, not a candidate here (the existing todo stays open) |
| S6 composition of TRDs (rho 0.5) | supported as the amplifier, not shown to be a defect | rolling: median F/P 1.14, median P/A 0.98, median F/A 1.12; in sample F/A is 0.99 |
| S7 drift in the per-objective ratios | supported | all-history rolling ratio median 0.94 for objectives 46-52 and 1.60 for 53-58; 54, 55, 56 and 57 are 2.15, 1.55, 2.42 and 1.64 |

**The frozen window and how strong its support was.** The pre-registered rule over {all, 10, 15, 20, 30, 40} on
objectives 46-58 (13 objectives, 109 TRD rows) selected a window of 10 objectives: S = |ln median ratio| of 0.047 against
0.113 for all history, 6 of 13 objectives in band against 5 of 13. The support is weak and 64-DIAGNOSIS.md says so: the
sweep was not monotone (15, 20 and 30 were worse than all history at S 0.210, 0.216 and 0.215, 40 slightly worse at
0.130), the advantage of 0.066 is small against per-objective ratios that run from 0.45 to 2.42, the in-band gain is one
objective, and the window does not remove the late-objective drift (objectives 53-58 have a median ratio of 1.32 under
it, 1.60 under all history). **Noise floor** (64-DIAGNOSIS.md section 5, by enumeration of the 1287 five-objective subsets
of the 13 ratios): an estimator with the all-history spread passes SC2 on a random five-objective sample 58.7% of the
time and one with window 10's spread 75.1% of the time, so a single five-objective verdict is noisy in both directions.

**Before and after.**

| Run | Calibration | Agent minutes median ratio / in band | P90 objectives / TRDs | Cost median ratio / in band | P90 objectives / TRDs | EST-08 |
|---|---|---|---|---|---|---|
| 64-05 primary (reconstructed) | frozen 5cf42c4b, all history | 1.51 / 2 of 5 | 5 of 5 / 40 of 41 | 0.86 / 4 of 5 | 4 of 5 / 34 of 41 | not met |
| Rolling, old method (64-09 control) | per-cut, `--window all` | 1.348 / 2 of 5 | 5 of 5 / 40 of 41 | 0.839 / 4 of 5 | 4 of 5 / 32 of 41 | not met |
| Rolling, new method | per-cut, `--window 10` | 1.238 / 2 of 5 | 5 of 5 / 40 of 41 | 0.797 / 3 of 5 | 4 of 5 / 32 of 41 | not met |

Pooled agent-minutes ratio: 1.45 (64-05 primary), 1.274 (rolling old), 1.112 (rolling new). Statuses, rolling old then
new: agent minutes SC2 fail then pass (1.348, 1.238), agent minutes SC3 pass then pass, cost SC2 pass then pass (0.839,
0.797), cost SC3 fail then fail (32 of 41 TRDs both times). Each rolling row estimates an objective from its own
leave-future-out cut (today's code on `git archive <first commit>^ .planning`), the same input 64-05's secondary analysis
used; the old-method row equals that analysis exactly and is the control. Source: 64-VALIDATION.md sections 2 to 4.

Per objective, full precision (same objectives, same actuals):

| Objective | Minutes ratio old | Minutes ratio new | Cost ratio old | Cost ratio new |
|---|---|---|---|---|
| 59 | 1.291 | 0.959 | 0.839 | 0.797 |
| 60 | 1.348 | 1.238 | 1.071 | 1.009 |
| 61 | 1.758 | 1.437 | 0.993 | 0.941 |
| 62 | 1.475 | 1.394 | 0.637 | 0.664 |
| 63 | 0.739 | 0.697 | 0.715 | 0.665 |

Minutes move toward 1 for 59, 60, 61 and 62 and away from 1 for 63 (0.739 to 0.697). Objectives in band are 59 and 63
under the old method and 59 and 60 under the new: the count did not change. 61 (1.437) and 62 (1.394) stay above the band.

**Flagged classes, before and after** (64-VALIDATION.md section 5, small samples of 1 to 41 tasks per class). Agent minutes:
`code_tdd` (biased high, median ratio 1.59 old) is no longer flagged under the window (1.29) and `prompt` (biased low, 0.53)
is no longer flagged (0.97); `prompt_tdd` stays biased high at 1.88; `test_tdd` becomes biased low (0.79 old, 0.65 new, on 5
tasks). Cost: `code` is no longer flagged; `test` and `test_tdd` move further below 1 (test 0.78 to 0.53, test_tdd 0.65
to 0.58) and `test` P90 coverage falls from 69% to 8%.

**Ship decision.** The pre-registered rule (`shipRule`, 64-DIAGNOSIS.md section 7) returned `ship_default: true`: "the
agent-minutes median ratio is closer to 1 (new 1.238, old 1.348) and no passing status regresses". It was not recomputed
by hand. What it changed: `DEFAULT_WINDOW_OBJECTIVES` in `calibrator.cjs` went from null (all history) to 10, so
`calibrate` with no flag keeps the 10 most recent objectives that have samples per project and `--window all` restores all
history; `scripts/estimate-window-eval.cjs` now passes `window: null` where it cuts its own windows so its frozen selection
still reproduces; and the live `~/.claude/devflow/calibration.json` was regenerated by TRD 64-10 after 64-VALIDATION.md was
committed (sha256 `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` before,
`9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648` after; 80 TRDs, 190 tasks, 79 with tokens, window
objectives 55 to 64). The frozen copy `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` and the run history are
untouched.

**The ship rests on a small move, and the rule weighs two things that went the wrong way.** The minutes median moved by
0.110 and the number of objectives in band did not move. The cost median moved further below 1 (0.839 to 0.797) and cost
objectives in band went from 4 of 5 to 3 of 5 (63 leaves the band at 0.665). Objective 63's minutes ratio moved away from 1
(0.739 to 0.697). The ship rule looks at neither. Cost SC3 (TRD P90 coverage 78%) is the status that keeps EST-08 at not
met; the window was not designed for it, and objective 62's cost actual ($45.75) is above P90 under both methods.

**Prospective point (reported, never judged).** Objective 63's persisted wall estimate, unchanged by any of this, was
1h 37m / 4h 50m against an actual of 1h 51m (ratio 0.87, inside P90; run state sha256
`08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`).

**What would confirm it.** This is a five-objective, leave-future-out reconstruction on a window chosen with weak support on
pre-59 history; it is not prospective evidence and `met` would not have been proof either. True prospective confirmation needs
the next five objectives executed after this one, estimated from the calibration that exists before each starts (the
regenerated live file) and recorded by the run history that 64-02 now keeps in
`~/.claude/devflow/state/estimates/history/`, then `df-tools estimate backtest` over them. Follow-ups that stay open: the
todo `recalibrate-estimate-minutes-est-08-not-met` (now with this evidence) and the forward token stamp todo
`ship-executor-token-stamp-forward-stamp-8-of-41`, which needs a plugin release and a runtime re-sync, not code.

## What was compared

**Reconstructed, not prospective, for every number in the verdict.** Objective 63's persisted run state predates
`estimate.execution`, so no executor-level estimate was recorded before 59-63 executed. Each objective's executor
estimate is therefore rebuilt today by `estimate objective N --all` on the exact calibration those objectives were
planned from, over the TRDs as executed (no TRD of 59-63 was edited after execution started: the only changes after
`docs(NN): create objective TRDs` are two checker revisions made before execution began). The one **prospective**
figure is 63's wall time (and its five wave times), persisted in its run state before execution; it is reported and
never judged.

- **Frozen calibration.** `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`, sha256
  `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`, identical to the live
  `~/.claude/devflow/calibration.json` when this report was written (TRD 64-10 regenerated the live file afterwards, with
  the 10-objective window, to `9ef7d108…`; the frozen copy is untouched and stays the baseline of every 64-05 number);
  mtime 2026-10-05 15:48 local, 1h 53m before 59's first commit (`401a9145`, 17:41);
  version 2, `data_as_of` 2026-10-05, 323 TRDs, 746 tasks, 236 with tokens; `inputs_digest`
  `sha256:254f7950caf2a37e8d3159dc80f6e9505de46eecdee5d440f3e3a70121091f89`. It holds no 59-63 data, so it is out of
  sample for all five objectives (64-03 proved hash and age).
- **Reproduction of 63.** The reconstruction from that calibration reproduces 63's persisted estimate exactly:
  12 of 12 objective and wave p50/P90 cells, every difference 0.00 minutes (64-03), and again in this run
  (`Reproduced yes`, within 0.05 minutes). So a reconstruction of 59-62 is what the engine would have printed at
  planning time, provided the estimator code did not drift.
- **Estimator drift and the current-code caveat.** The reconstruction runs today's estimator. Between the frozen
  calibration's build and today (`git log cce70b30..HEAD`, 58's completion onward) the objective-estimate path changed
  in two files only, and neither change
  can touch `estimateObjective` (64-03): `objective.cjs` (`cmdObjectiveRemove` and `cmdObjectiveComplete` write
  ROADMAP.md only on a text change; `047730ea`, `e67dd32d`) and `roadmap.cjs` (`cmdMilestoneComplete` scoped to the
  milestone; `a49e8b16`). Nine other files on the path are byte-identical. The caveat stands for anything outside that
  path and for the secondary analyses, which use today's `calibrate` on old data.
- **Actuals.** Agent minutes are the SUMMARY `duration` summed over a TRD (37 of 41 TRDs; 4 from the metric-row
  fallback: 61-03, 62-02, 62-04, 62-09), the same field the calibration is built from, so the comparison is like for
  like. Cost is priced from the SUMMARY token fields with `references/model-rates.json` (per-model entries `as_of`
  2026-10-05). All 41 TRDs carry token fields: 8 stamped live (61-02, 61-04, 61-05, 62-01, 62-05, 62-08, 63-01, 63-02)
  and 33 recovered by `tokens backfill` (64-03). SUMMARY minutes run a median 0.91 of the executor transcript span, about
  10% low.
- **Exclusions.** None: all five objectives and all 41 TRDs are compared for both metrics. Wall time is excluded (no
  run state recorded) for 59, 60, 61 and 62.

## Results

Output of `df-tools estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw`,
unedited:

### Verdict

- Agent minutes: SC2 fail (median ratio 1.51, 2 of 5 objectives in ±30%) · SC3 pass (P90 covers 5 of 5 objectives (100%) and 40 of 41 TRDs (98%); target 80%)
- Cost: SC2 pass (median ratio 0.86, 4 of 5 objectives in ±30%) · SC3 pass (P90 covers 4 of 5 objectives (80%) and 34 of 41 TRDs (83%); target 80%)

EST-08: not met

### Executor estimates against actuals

| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 59 State and merge plumbing | 7 | reconstructed | 1h 48m / 5h 34m | 1h 24m | 1.29 | yes | $20.59 / $29.43 | $23.88 | 0.86 | yes |
| 60 Edit gate enforces the action | 7 | reconstructed | 1h 52m / 5h 25m | 1h 14m | 1.51 | yes | $22.55 / $32.37 | $19.79 | 1.14 | yes |
| 61 Store-mode rough edges and observability | 9 | reconstructed | 2h 28m / 6h 41m | 1h 10m | 2.11 | yes | $27.92 / $40.55 | $27.57 | 1.01 | yes |
| 62 Built-in sweep | 11 | reconstructed | 2h 37m / 8h 14m | 1h 36m | 1.63 | yes | $29.28 / $41.18 | $45.75 | 0.64 | no |
| 63 Todo store, hook coexistence and built-in inventory | 7 | reconstructed | 1h 46m / 5h 31m | 1h 52m | 0.95 | yes | $20.56 / $30.50 | $27.16 | 0.76 | yes |

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.51 | 1.45 | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 4 of 5 (80%) |
| Cost | 5 | 0.86 | 0.84 | 4 of 5 | 4 of 5 (80%) | 34 of 41 (83%) | 2 of 5 (40%) |

### Wall time (prospective run states)

Compares `estimate.wall_minutes` of the run state (execution only: the waves, not the verifier or planning, so not the total the estimate line prints) with the measured time from `estimate start` to `estimate finish`. Reproduced: the estimate rebuilt now from this calibration matches the recorded one within 0.05 minutes. Reported, never judged.

| Objective | Estimate p50 / P90 | Reconstructed p50 / P90 | Actual | Ratio | <= P90 | Reproduced |
|---|---|---|---|---|---|---|
| 63 Todo store, hook coexistence and built-in inventory | 1h 37m / 4h 50m | 1h 37m / 4h 50m | 1h 51m | 0.87 | yes | yes |

| Objective | Wave | TRDs | Estimate p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|
| 63 Todo store, hook coexistence and built-in inventory | 1 | 63-01, 63-05 | 20 min / 1h 07m | 19 min | 1.06 | yes |
| 63 Todo store, hook coexistence and built-in inventory | 2 | 63-02 | 15 min / 54 min | 12 min | 1.19 | yes |
| 63 Todo store, hook coexistence and built-in inventory | 3 | 63-03, 63-04 | 16 min / 43 min | 8 min | 1.92 | yes |
| 63 Todo store, hook coexistence and built-in inventory | 4 | 63-06 | 10 min / 37 min | 51 min | 0.19 | no |
| 63 Todo store, hook coexistence and built-in inventory | 5 | 63-07 | 25 min / 1h 43m | 19 min | 1.30 | yes |

No finished run state: 59, 60, 61, 62 (no run state recorded).

### Task classes

**Agent minutes**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 41 | 1.80 | 100% | miscalibrated: biased_high |
| prompt_tdd | 19 | 1.88 | 100% | miscalibrated: biased_high |
| test | 13 | 0.68 | 100% | miscalibrated: biased_low |
| other | 9 | 2.54 | 100% | miscalibrated: biased_high |
| code | 6 | 0.97 | 100% | ok |
| test_tdd | 5 | 0.79 | 80% | ok |
| prompt | 3 | 0.53 | 100% | miscalibrated: biased_low |
| doc | 2 | 1.09 | 100% | too_few |
| doc_tdd | 1 | 0.22 | 0% | too_few |

**Cost**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 41 | 1.19 | 98% | ok |
| prompt_tdd | 19 | 0.78 | 68% | miscalibrated: p90_too_narrow |
| test | 13 | 0.81 | 69% | miscalibrated: p90_too_narrow |
| other | 9 | 0.77 | 89% | ok |
| code | 6 | 0.98 | 100% | ok |
| test_tdd | 5 | 0.65 | 80% | miscalibrated: biased_low |
| prompt | 3 | 0.27 | 33% | miscalibrated: biased_low, p90_too_narrow |
| doc | 2 | 0.71 | 50% | too_few |
| doc_tdd | 1 | 0.59 | 0% | too_few |

### Miscalibrated classes

- code_tdd (minutes): biased_high, median ratio 1.80, coverage 100%
- prompt_tdd (minutes): biased_high, median ratio 1.88, coverage 100%
- test (minutes): biased_low, median ratio 0.68, coverage 100%
- other (minutes): biased_high, median ratio 2.54, coverage 100%
- prompt (minutes): biased_low, median ratio 0.53, coverage 100%
- prompt_tdd (cost): p90_too_narrow, median ratio 0.78, coverage 68%
- test (cost): p90_too_narrow, median ratio 0.81, coverage 69%
- test_tdd (cost): biased_low, median ratio 0.65, coverage 80%
- prompt (cost): biased_low, p90_too_narrow, median ratio 0.27, coverage 33%

### Exclusions

none

Calibration `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`, data as of 2026-10-05, samples 323 TRDs / 746 tasks / 236 with tokens, inputs_digest sha256:254f7950caf2a37e8d3159dc80f6e9505de46eecdee5d440f3e3a70121091f89. Band ±30%, coverage target 80%.

**Reading the numbers (from the verb's JSON rows, same run).**

- The minutes failure is a bias, not a spread problem: the estimate is above the actual for 4 of 5 objectives (59-62), and
  the pooled ratio is 1.45 (sum of p50 over sum of actuals). Only 13 of 41 TRDs fall inside ±30% on minutes, against 25
  of 41 on cost. P90 covers anyway because the P90 is wide (about three times the p50 at objective level).
- Even if every minute actual were raised by the 10% SUMMARY undercount (transcript span ratio 0.91), the median would be
  about 1.38, still outside the band. That is an arithmetic bound, not a run of the verb.
- Cost is inside the band but with thin margins: objective coverage is 4 of 5, exactly the 80% target, and TRD coverage
  passes by one TRD (33 of 41 = 80.5% would pass, 32 of 41 = 78.0% would fail). Seven TRDs sit outside their cost P90,
  five of them in 62 (62-02, 62-08, 62-09, 62-10, 62-11) plus 59-05 and 63-01. The one TRD outside its minutes P90 is
  63-06 (p50 9.5 and P90 36.6 minutes against 45 actual); it is also the wave 4 miss in the wall table (51 min against
  10 / 37).
- 63's wall time (prospective, execution only) ran at 0.87 of the estimate's median, inside P90; four of five waves were
  covered. Wall time stays outside the verdict.

## Miscalibrated classes and follow-up

Flagged on the primary run (frozen calibration), by the verb:

| Metric | Class | Tasks | Median ratio | P90 coverage | Flag |
|---|---|---|---|---|---|
| minutes | code_tdd | 41 | 1.80 | 100% | biased_high |
| minutes | prompt_tdd | 19 | 1.88 | 100% | biased_high |
| minutes | other | 9 | 2.54 | 100% | biased_high |
| minutes | test | 13 | 0.68 | 100% | biased_low |
| minutes | prompt | 3 | 0.53 | 100% | biased_low |
| cost | prompt_tdd | 19 | 0.78 | 68% | p90_too_narrow |
| cost | test | 13 | 0.81 | 69% | p90_too_narrow |
| cost | test_tdd | 5 | 0.65 | 80% | biased_low |
| cost | prompt | 3 | 0.27 | 33% | biased_low, p90_too_narrow |

What the diagnostics say about the cause (all secondary; none is the verdict):

1. **Per-task medians overstate the recent TRDs.** The 41 TRDs of 59-63 have two or three non-checkpoint tasks each
   (24 with two, 17 with three), and ran a median 9 minutes against a median estimate of 12. The actual time does not
   grow with the task count (correlation 0.00 over 41 TRDs) while the estimate does (0.76): 3-task TRDs ran a median 10
   minutes against a median estimate of 15 (ratio 1.80), 2-task TRDs 8 against 10 (1.21). For the dominant class,
   code_tdd, the median actual share per task is 3.3 minutes against the calibration's p50 of 6.0 (P90 18.3). Two task
   counts is thin evidence for the scaling claim; the class medians are not.
2. **Recalibrating before each objective does not fix it.** Rolling leave-future-out calibrations (one per objective,
   from the repository as it stood before that objective's first commit) give a minutes median of 1.35, still SC2 fail
   (2 of 5 in band), and they would have broken cost SC3 (TRD coverage 32 of 41 = 78.0%).
3. **A recency window moves the objective median into the band, narrowly.** Calibrating from objectives 42-58 only
   (186 TRDs) gives minutes median 1.27 (3 of 5 in band, pooled 1.34) and the verb prints `EST-08: met` for that
   calibration. Class-level bias remains in it (code_tdd 1.65, prompt_tdd 2.63, test 0.41), so old history is not the
   whole story, and the window result is a diagnostic from a calibration that never existed, selected after the frozen
   run failed.
4. **Cost p90_too_narrow concentrates in prompt_tdd (68%), test (69%) and prompt (33%)** and in 62, whose five TRDs outside
   the cost P90 account for five of the seven TRD-level cost misses. This is a P90-width problem on a small number of
   classes, not a bias in the median (median 0.86 overall).

Follow-ups (pending todos created with this report; none changes estimator code here):

- **Recalibrate estimate minutes** (`.planning/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md`): make `calibrate` derive
  minutes from recent history (a recency window, or per-TRD minutes instead of an equal split across tasks) and
  re-check against the bias above, then re-run `df-tools estimate backtest` on the next five objectives, which 64-02's run
  history now records prospectively. Gap closure tried the recency-window half of this (see "Gap closure"): it moved the
  minutes median from 1.348 to 1.238 and did not meet EST-08, so the todo stays open, with that evidence added; the
  per-TRD-minutes half (S5) has not been tried.
- **Forward token stamp reaches 8 of 41 SUMMARYs** (`.planning/todos/pending/ship-executor-token-stamp-forward-stamp-8-of-41.md`):
  ship the current `agents/executor.md` (the repository already has the `tokens stamp` step) so EST-06 stamps every
  SUMMARY and the backtest does not depend on `tokens backfill`.

## Secondary analyses

These use calibrations that never existed at the time. They are information for the follow-up, not the verdict, and a
`Reproduced` value from them means nothing (only the frozen-calibration run reproduces what was shown live).

### Rolling leave-future-out

For each objective N: `git archive --format=tar -o <scratch>/cut-N.tar <first commit>^ .planning`, extract, `calibrate
--paths <scratch>/cut-N --no-overhead --window all --out <scratch>/cal-cut-N.json` (all history was the default when this
was run; `--window all` keeps it so since TRD 64-10), `estimate backtest N --calibration
<scratch>/cal-cut-N.json`. The snapshots carry only the token fields stamped at that moment (59 and 60 have none), so
237 to 243 TRDs with tokens throughout. Executor metrics only (no overhead in these calibrations).

| Obj | Cutoff | Calibration | Agent min p50 / P90 | Actual | Ratio | In band | Cost p50 / P90 | Actual | Ratio | In band | TRDs covered (min / cost) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 59 | 401a9145^ | 324 TRDs, 749 tasks | 108.4 / 334.3 | 84 | 1.291 | yes | $20.04 / $28.48 | $23.88 | 0.839 | yes | 7 of 7 / 6 of 7 |
| 60 | 05a5b5f4^ | 331 TRDs, 766 tasks | 99.8 / 288.0 | 74 | 1.348 | no | $21.19 / $29.63 | $19.79 | 1.071 | yes | 7 of 7 / 7 of 7 |
| 61 | d7b9c938^ | 338 TRDs, 784 tasks | 123.0 / 383.9 | 70 | 1.758 | no | $27.37 / $39.61 | $27.57 | 0.993 | yes | 9 of 9 / 8 of 9 |
| 62 | 9ad19b1c^ | 347 TRDs, 805 tasks | 141.6 / 403.9 | 96 | 1.475 | no | $29.13 / $41.16 | $45.75 | 0.637 | no | 11 of 11 / 6 of 11 |
| 63 | 26e4e57f^ | 358 TRDs, 831 tasks | 82.8 / 294.1 | 112 | 0.739 | yes | $19.43 / $29.51 | $27.16 | 0.715 | yes | 6 of 7 / 5 of 7 |

All five P90s cover the minute actual at objective level (5 of 5) and four of five cover the cost actual (62 does not).
Aggregate over the five rows (the library's `summarize`, medians at 3-decimal precision because the rows were rounded at
output): agent minutes median ratio 1.348, pooled 1.274, 2 of 5 in band, P90 covers 5 of 5 objectives and 40 of 41 TRDs
(SC2 fail, SC3 pass); cost median 0.839, pooled 0.813, 4 of 5 in band, P90 covers 4 of 5 objectives and 32 of 41 TRDs
(SC2 pass, SC3 fail). **Recalibrating before each objective would not have changed the minutes verdict and would have
failed cost SC3.** Flagged classes: minutes code_tdd 1.59, prompt_tdd 1.88 (high), prompt 0.53 (low); cost prompt_tdd,
test, code (17% coverage), test_tdd, prompt.

### Window: objectives 42-58

The pre-59 snapshot restricted to objectives 42-58 (v1.4 onward, about a week of history; 186 TRDs, 449 tasks, 179 with
tokens; inputs_digest `sha256:bf347cbd91eed15f2dd0a54c60f11d33652dde47390f87a41caaadb6695bd19a`). One window, the one specified in
the plan; no other window was tried.

| Metric | Median ratio | Pooled | In band | P90 covers objectives | P90 covers TRDs | SC2 | SC3 |
|---|---|---|---|---|---|---|---|
| Agent minutes | 1.27 | 1.34 | 3 of 5 | 5 of 5 | 40 of 41 (98%) | pass | pass |
| Cost | 0.91 | 0.90 | 5 of 5 | 5 of 5 | 35 of 41 (85%) | pass | pass |

Per objective, minutes ratio / cost ratio: 59 1.08 / 0.91, 60 1.27 / 1.19, 61 1.77 / 1.08, 62 1.91 / 0.71, 63 0.82 / 0.81.
The verb prints `EST-08: met` for this calibration. That is not the verdict: it is a calibration built after the fact
from a window chosen after the frozen run failed, inside the band by 0.03 on the median, with the pooled ratio (1.34)
outside it and the same large classes still flagged (minutes code_tdd 1.65, prompt_tdd 2.63, code 1.44 high; test 0.41
low; cost prompt_tdd, test, test_tdd, prompt). It says recent history carries part of the minutes bias, not all of it.

### In-sample reference (55-57)

`estimate backtest 55,56,57 --calibration <frozen> --raw`: these three objectives are inside the frozen calibration. The
estimates and cost columns reproduce 58-10's table to the printed digit.

| Objective | Agent min p50 / P90 | Actual today (58-10) | Median / actual today (58-10) | Cost p50 / P90 | Actual | Median / actual |
|---|---|---|---|---|---|---|
| 55 | 133.6 / 395.7 | excluded: 55-06 has no minutes (68 over 6 of 8 TRDs) | n/a (1.96) | $21.66 / $32.67 | $23.06 | 0.94 (0.94) |
| 56 | 74.6 / 218.5 | 36 (27 over 4 of 5 TRDs) | 2.07 (2.76) | $15.83 / $23.58 | $15.72 | 1.01 (1.01) |
| 57 | 109.5 / 302.7 | 72 (72) | 1.52 (1.52) | $22.61 / $32.81 | $21.41 | 1.06 (1.06) |

Verdict block of that run: agent minutes `insufficient (2 objectives compared, 3 needed)`; cost SC2 pass (median 1.01, 3 of
3 in band), SC3 pass (3 of 3 objectives, 20 of 20 TRDs). The minutes already ran high in sample (median 1.80 over two
objectives), so the bias on 59-63 is not new: it predates the out-of-sample window.

### How good are the actuals

64-03's audit of SUMMARY minutes against executor transcript spans (41 of 41 TRDs have exactly one transcript):

- Median SUMMARY / transcript ratio **0.91** (P25 0.83, P75 0.96); aggregate 0.89 with 60-02's idle gap removed. SUMMARY
  minutes are a consistent ~10% undercount of measured executor time, and the calibration is built from the same field.
- One outlier: **60-02** (25 minutes in the SUMMARY, a 1,035.7 minute transcript span, ratio 0.02). A stream stall and an
  interruption left it idle 16.7 hours before a resume; without the gap the span is 33.3 minutes (ratio 0.75). Raw
  transcript spans are not usable as actuals.
- 63's measured wave times (run state) against its TRDs: SUMMARY minutes are 0.87 of the measured wave total (0.73 on wave
  5); executor transcript spans are 0.98.
- Provenance of the token side: 8 SUMMARYs forward-stamped live, 33 backfilled from transcripts; token and cost actuals
  come from the transcripts directly and carry no such undercount.

## Defects found

1. **EST-06's forward stamp reached 8 of 41 SUMMARYs (19.5%)** and none in 59 or 60. The step exists in the repository's
   `agents/executor.md` (the `tokens stamp --draft` line), in the mirrored `execute-trd.md` workflow and in the SUMMARY
   template, but no installed executor agent prompt carries it (checked over plugin cache versions 2.7.1, 2.10.1, 2.11.0,
   2.12.0, 2.13.1 and the marketplace copy). The 33 other TRDs were recovered by `tokens backfill` (EST-07). The fix is a
   release of the current `agents/executor.md`; a todo records it.
2. **64-01's `buildBacktest` could not join actuals to real estimates**: `estimateObjective` carries `dir` as a relative
   path (`.planning/objectives/90-alpha`) and `collectProject` keys by the bare name, so every real objective would have
   been excluded as `incomplete actuals`. Hand-built fixtures hid it; 64-04 found and fixed it (`1bb18b88`).
3. **The run store kept one run per repository, so each `estimate start` destroyed the previous objective's prospective
   estimate** (63's survives only because the planner kept a copy), and `estimate objective N --all` printed `all TRDs done` instead of the
   estimate. Both fixed in 64-02 (finished runs are archived to a history; `--all` renders a done objective).
4. **No prospective executor estimate exists for 59-62, and 63's has no `estimate.execution`.** EST-08 as worded ("across
   the next 5 executed objectives") was therefore evaluated on reconstructed numbers, validated by the exact 63
   reproduction. The next five objectives run with run history and an enriched estimate block (64-02), so the same verb
   can be prospective next time.
5. **Run state `estimate.wall_minutes` is execution-only (96.6 / 290.4 for 63) while the printed estimate line is the
   total with verifier overhead (102.8 / 304.2).** The backtest names which one it compares.
6. **`df-tools objective complete` ticks `- [ ] **EST-08**` for every requirement on the objective's ROADMAP
   `Requirements` line, regardless of a verdict**; only the traceability status (`Not met ...`) survives it. See Status.
7. **Fresh worktrees have no `node_modules`**, so 9 daemon tests fail in a provisioned worktree (64-02, 64-03); not related
   to estimation.

## Status

**Default changed but EST-08 not met.** EST-08 stays **unchecked** in `REQUIREMENTS.md`, with the traceability row `Not met:
see objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md and 64-VALIDATION.md` and the follow-up todo stem
`recalibrate-estimate-minutes-est-08-not-met`, which stays open. The recency window of 10 objectives is the `calibrate`
default and the live calibration was regenerated with it (hashes under "Gap closure"). The local `objective complete 64`
will tick the `- [ ] **EST-08**` box on its own; whoever completes the objective must re-open that checkbox or record the
decision to accept the verdict.

## Reproduce

All from the repository checkout; `<scratch>` is any scratch directory outside the repository. Nothing here writes
`~/.claude/devflow/calibration.json` (every `calibrate` has `--out`, every estimate has `--calibration`). The verb must
run from the repository's `df-tools`, not the installed mirror. Since TRD 64-10 `calibrate` windows to the 10 most recent
objectives by default, so the `calibrate` commands below carry `--window all` to rebuild the all-history calibrations that
64-05 used. The gap-closure result (the old and new methods side by side, the positive control and the ship rule) is
reproduced by 64-VALIDATION.md section 10, and the pre-59 selection by 64-DIAGNOSIS.md section 8.

```
# hashes (frozen calibration, 63 run state)
shasum -a 256 ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json
shasum -a 256 ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json

# primary verdict (JSON: omit --raw; large JSON is written to a temp file and printed as @file:<path>)
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 \
  --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 55,56,57 \
  --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw

# rolling leave-future-out, per objective N with its first commit F (59 401a9145, 60 05a5b5f4, 61 d7b9c938, 62 9ad19b1c, 63 26e4e57f)
mkdir -p <scratch>/cut-N
git archive --format=tar -o <scratch>/cut-N.tar F^ .planning
tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window all --out <scratch>/cal-cut-N.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest N --calibration <scratch>/cal-cut-N.json

# window 42-58: copy <scratch>/cut-59/.planning/objectives/4[2-9]-* and 5[0-8]-* and STATE_ARCHIVE.md into <scratch>/win-42-58/.planning/
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/win-42-58 --no-overhead --window all --out <scratch>/cal-win.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 --calibration <scratch>/cal-win.json --raw
```

The verdict rules (band 0.30, coverage target 0.80, at least 3 objectives, at least 3 tasks per class) are the exported
constants of `plugins/devflow/devflow/bin/lib/estimate-backtest.cjs`.
