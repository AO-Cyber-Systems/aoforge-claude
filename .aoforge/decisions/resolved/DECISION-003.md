---
id: DECISION-003
objective: 67
wave: 1
trd: 67-01
type: "checkpoint:decision"
created: "2026-10-08T13:27:45.812Z"
status: resolved
blocks: []
independent: []
recommendation:
resolution: |-
  option-b: TRD-level minutes, window 10, through objective 66; option-a is the pre-registered fallback.

  Method (named in the calibration identity, calibration version 3):
    method: {minutes: trd_level, window_objectives: 10, through_objective: 66}
  A TRD with at least one auto task gets the calibration's trd_level.minutes distribution (p50, P90) as its minutes,
  whatever its task count or classes; a TRD with no auto task has no minutes, as today. Objectives compose TRDs as today
  (correlated sum, rho 0.5; the maximum within a parallel wave). Tokens and cost stay the per-task sum. Nothing is tuned:
  10 is the window 64 froze on pre-59 history, kept and not re-chosen; 66 is the last objective before this one.

  Fallback: if the ship rule (V4) returns ship_default false, the frozen method is
    method: {minutes: task_sum, window_objectives: 10, through_objective: 66}
  and trd_level stays an opt-in calibrate flag.

  Provenance:
  - Chosen by the objective-67 planner (an agent), under the build orchestrator's instruction to decide when the
    objective-64 evidence separates the candidates and to record the rationale. It is not a user decision. The user sees
    it at the release checkpoints (67-07, 67-08) and can stop the release there.
  - Read: 64-DIAGNOSIS.md, 64-ACCURACY-REPORT.md, 64-VALIDATION.md, the todo recalibrate-estimate-minutes-est-08-not-met,
    and the identity block of the live calibration (sha256 9ef7d108…, version 2, window objectives 55-64, trd_level
    minutes p50 10 / P90 20 over 79 TRDs; aggregate figures only).
  - Also seen: the SUMMARY durations of 64-66, to check which TRDs carry minutes. No estimate of any objective after 63
    was computed or read before this decision.
  - Why option-b: the per-task split makes the estimate grow with the task count while actual TRD time does not (E4, E5),
    measured on two separate sets; it is the todo's first option (E9) and the one 64 never tried; it adds no parameter.
  - Why not the others: option-a was scored on 59-63 and is not met (E2); option-c needs a decay parameter with no
    support (E3); option-d would fit strata on data, with too few samples per stratum (E5); option-e fixes no shown
    defect (E7). Cost P90 width is outside EST-10.
  - Not blind: the family was suggested by data from objectives <= 63, which are in the validation set below. That is
    acceptable only because option-b has no free parameter; EST-11 on 68-72 is the honest test.

  Validation protocol (run once, by TRD 67-04; nothing else scores the method):
  V1 Snapshot: git archive <the commit that records this decision> .planning, extracted to a scratch directory. Leak
     check: its objectives listing has no directory numbered 68 to 72.
  V2 Cuts: for every objective N from 46 to 66 with a directory in the snapshot, two calibrations of the snapshot with
     --through N-1 --window 10 --no-overhead: old --minutes task_sum, new --minutes trd_level. Every calibration's
     method.through_objective is at most 65.
  V3 Positive controls, before any score (either failing means nothing is scored and the harness is reported
     defective): PC1, 64's pre-59 selection (64-DIAGNOSIS.md section 8) reproduces selection_output_sha256
     fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516; PC2, 64-09's new-method rolling rows (git-archive
     cuts of 59-63, --window 10, now with --minutes task_sum) reproduce 64-VALIDATION.md section 3 to its printed digits.
  V4 Score once: scripts/estimate-rolling-backtest.cjs with every old and new file over the full set, --repo <snapshot>.
     Its verdict and shipRule (64's code, unchanged) decide: ship_default true -> the frozen method is option-b and
     calibrate's default minutes method becomes trd_level; false -> the frozen method is option-a and the default stays
     task_sum. No other method, window, cut, set or rule after the result. Secondary, descriptive only, never deciding:
     the same files over 46-58, 59-63 and 64-66.
  V5 EST-11 exclusion: EST-11 scores 68-72, and no calibration of this protocol reads an objective above 65. The EST-11
     calibration is built once, with through_objective 66, by the installed runtime after the release (67-09), copied to
     ~/.claude/devflow/state/backtest/, and not rebuilt until objective 75 has scored 68-72; 75 checks each 68-72 run
     state's calibration.inputs_digest against it. Checks: a fixture test that objectives 67-72 (with SUMMARYs and
     STATE_ARCHIVE rows) leave a through-66 calibration byte-identical (67-02), and the same check on a snapshot of this
     repository with synthetic 68-72 directories (67-09).
  V6 Limits: a leave-future-out reconstruction with today's code; the method family is not blind to objectives <= 63;
     per-objective spread is wide (E8). EST-11 on 68-72 with the frozen calibration is the prospective test, and nothing
     is tuned to pass it.
resolved_at: "2026-10-08T13:27:51.899Z"
---

## Decision: Objective 67 (EST-10): which minutes method is frozen for EST-11 (objectives 68…

**Context:** Objective 67 (EST-10): which minutes method is frozen for EST-11 (objectives 68-72), on what evidence, and how is it validated before anything scores it?

## Context

EST-08 is not met (objective 64): agent minutes run high on 59-63 and the 10-objective recency window that 64 shipped
as the `calibrate` default did not fix it. EST-10 asks for a method chosen and frozen before it is scored; EST-11 then
scores it prospectively on 68-72, and tuning the estimator to pass EST-11 is out of scope (REQUIREMENTS.md).

## Evidence (objectives <= 63 only)

| # | Finding | Source |
|---|---|---|
| E1 | Frozen all-history calibration on 59-63: minutes median ratio 1.51, 2 of 5 in band, pooled 1.45 | 64-ACCURACY-REPORT, Verdict (median, band); Gap closure (pooled) |
| E2 | Rolling leave-future-out: all history 1.348, 10-objective window 1.238; both 2 of 5 in band; EST-08 not met either way | 64-ACCURACY-REPORT, Gap closure |
| E3 | The window's support was weak: S 0.047 at W=10, 0.210-0.216 at 15-30, 0.130 at 40, against 0.113 for all history (not monotone) | 64-DIAGNOSIS 4.2, 4.4 |
| E4 | Pre-59 in sample, median ratio by auto tasks per TRD: 0.62 (1 task, 12 TRDs), 0.91 (2, 160), 1.29 (3, 85) | 64-DIAGNOSIS S5 |
| E5 | 59-63: actual TRD minutes correlate 0.00 with task count over 41 TRDs, the estimate 0.76; 3-task TRDs 10 actual vs 15 estimated (1.80), 2-task 8 vs 10 (1.21); code_tdd median actual share 3.3 min vs calibration p50 6.0 | 64-ACCURACY-REPORT, Miscalibrated classes item 1 |
| E6 | A 42-58 window gives median 1.27 but code_tdd 1.65, prompt_tdd 2.63 and test 0.41 stay flagged: recency is not the whole story | 64-ACCURACY-REPORT, item 3 |
| E7 | Composition (rho 0.5) is centred in sample (F/A 0.99); rolling F/P 1.14 is what a median of a sum of skewed parts shows | 64-DIAGNOSIS S6 |
| E8 | Noise floor: a five-objective SC2 sample passes 58.7% (all-history spread) to 75.1% (window-10 spread) of the time by spread alone | 64-DIAGNOSIS 5 |
| E9 | The follow-up todo ranks "estimate a TRD's minutes from TRD-level history" first; 64 never tried it | todo recalibrate-estimate-minutes-est-08-not-met; 64-ACCURACY-REPORT, Follow-ups |

## Options

- option-a — Status quo plus a cutoff: per-task sum, window 10, through objective 66. Already scored on 59-63 (E2): not met.
- option-b — TRD-level minutes: a TRD's minutes are the calibration's `trd_level.minutes` distribution whatever its task
  count; window 10 (kept as 64 froze it); through objective 66. Untried. No tuned parameter.
- option-c — Recency weighting (exponential decay): needs a decay parameter; E3 gives no support for any smooth value.
- option-d — TRD-level minutes stratified by task count or dominant class: the strata would be chosen on data, most class
  strata hold under 5 TRDs at window 10, and task count predicted nothing on 59-63 (E5).
- option-e — Change the composition rho: E7 shows no defect.

## Recommendation

option-b, with option-a as the pre-registered fallback if the validation's ship rule rejects option-b.


**Options:**


## To Resolve

Reply: `/devflow:decide DECISION-003 `
