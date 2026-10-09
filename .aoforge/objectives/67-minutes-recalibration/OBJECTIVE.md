---
work: feature
status: verifying
---

# Minutes recalibration

## Goal

Minute estimates use a method chosen and frozen before any objective is scored with it, so the next accuracy test is honest.

Requirement: EST-10. Minutes estimates are recalibrated by a method chosen and frozen before it is scored. The choice,
its provenance and its validation protocol are recorded, and nothing is fitted to the objectives it is scored on
(EST-11 scores objectives 68-72; tuning to pass EST-11 is out of scope).

## Success criteria (ROADMAP)

1. A recorded decision names the method (TRD-level history, a recency window or weighting, or another option from the
   64 report), its provenance and its validation protocol, and is committed before any scoring run.
2. `calibrate` writes a calibration whose identity names the method and its parameters, byte-identical on unchanged
   inputs.
3. The validation protocol excludes the objectives that EST-11 will score (68-72), and a check shows no input from them
   reached the calibration.
4. `df-tools estimate` run from the installed runtime uses the new calibration.

## Findings at planning time (2026-10-08)

**What 64 left.** EST-08 is not met. On 59-63 the minutes estimate runs high: frozen all-history calibration 1.51,
rolling all-history 1.348, rolling with the 10-objective window 1.238 (2 of 5 objectives in band). The window was
chosen on pre-59 history with weak support (a non-monotone sweep) and shipped as the `calibrate` default by 64-10's
pre-registered ship rule. The live calibration (`9ef7d108…`, version 2) is that window over objectives 55-64.

**The structural finding nobody has tried.** `calibrate` splits each TRD's minutes equally over its auto tasks, and
`estimate` adds the task medians back up quantile by quantile, so an estimate grows with the task count. Actual TRD
time does not: on 59-63 the correlation of actual minutes with task count is 0.00 over 41 TRDs while the estimate's is
0.76; 3-task TRDs ran a median 10 minutes against 15 estimated (1.80), 2-task TRDs 8 against 10 (1.21). Pre-59, in
sample, the ratio by task count was 0.62 (1 task), 0.91 (2) and 1.29 (3) (64-DIAGNOSIS S5). The todo
`recalibrate-estimate-minutes-est-08-not-met` ranks "estimate a TRD's minutes from TRD-level history" first; 64 says
"the per-TRD-minutes half (S5) has not been tried".

**The method, decided at planning (orchestrator guidance: decide when the evidence separates the candidates).**
TRD-level minutes: a TRD's minutes are the calibration's `trd_level.minutes` distribution whatever its task count,
over the 10-objective window 64 froze, with a data cutoff at objective 66. It adds no tuned parameter. Tokens and cost
stay per task. If the pre-registered ship rule (64's `shipRule`, unchanged code) rejects it on the validation set, the
frozen method falls back to the status quo (task sum, window 10) with the same cutoff. Recency weighting, per-stratum
TRD medians and a different composition rho were considered and rejected (DECISION-003 records why).

**Why a release is in scope.** SC-4 needs the installed estimator to read the new calibration, which means new
estimator code in the installed plugin. The installed runtime is 2.14.0 and is byte-identical to the repository for
every estimation lib today; 32 unreleased commits (objective 66: the stop-gate token check and the every-TRD-in-an-
executor rule) also need to be installed before 68-72 run. Every live step (push, PR, merge, tag) is a
`checkpoint:human-action` that runs only on the user's explicit per-action approval.

**Why a cutoff, not an accident.** 68-72 do not exist yet, so any calibration built today excludes them trivially.
The cutoff makes the exclusion a recorded parameter (`method.through_objective: 66`) applied at collection, before any
statistic or count (including STATE_ARCHIVE metric rows), so a rebuild after 68 exists is byte-identical. The frozen
calibration is built once, by the installed runtime, after the release, and is not rebuilt until objective 75 has
scored 68-72; 75 checks each 68-72 run state's `calibration.inputs_digest` against it.

## Scope decisions

- Minutes only. Cost and tokens keep the per-task sum (cost passed SC2 on 59-63; its P90 width is a separate todo).
- Calibration version 3 always carries `method {minutes, window_objectives, through_objective}` with the requested
  parameters. The 2.14.0 estimator refuses a version-3 file rather than silently misreading it.
- The validation reuses 64's instruments unchanged (`scripts/estimate-rolling-backtest.cjs` and its `shipRule`), on
  leave-future-out cuts (`--through N-1`) of objectives 46-66. Positive controls reproduce 64's published numbers
  before anything is scored, and no objective above 65 enters any validation calibration.

---
*Created: 2026-10-08 (auto-scaffold via bootstrapObjectiveMd); goal, criteria and findings added at planning, 2026-10-08*
