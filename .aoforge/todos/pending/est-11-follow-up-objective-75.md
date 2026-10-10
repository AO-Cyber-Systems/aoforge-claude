---
created: 2026-10-10T06:35:00.000Z
title: Follow up EST-11 not met (objective 75)
area: estimation
files: [.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md, plugins/aoforge/aoforge/bin/lib/estimate-cli.cjs, plugins/aoforge/aoforge/workflows/execute-objective.md]
disposition: follow-up
disposition_reason: "EST-11 not met in objective 75: only 4 of the 5 candidates (68-71) had a pre-recorded objective-level estimate, 72 was unscored; the four scored objectives pass the EST-08 rule, so this todo carries the next step"
disposition_target: "the next estimation objective (next milestone)"
disposition_date: 2026-10-10
disposition_by: objective 75 (TODO-01)
---

## Problem

Objective 75 (TRD 75-01) scored the prospective retest once, under the rule pre-registered in OBJECTIVE.md. EST-11 is **not met**: the scored set S is 68, 69, 70, 71 (four of the five candidates), and rule 4 requires all five. Objective 72 is unscored: its original run state has no objective-level estimate (it was started by `estimate wave 72 1 --start`, its line reads `No estimate: objective 72 has no minutes data in the calibration`, and the user accepted `unscored` in 72-01), and its only archived file was started after 72-01..72-25 had run (check E5).

On S the verb's verdict (the EST-08 rule, reported, not decisive) is met, with nothing failing:
- Agent minutes: median ratio 1.086, pooled 1.063, 4 of 4 in the 0.70-1.30 band, P90 covers 4 of 4 objectives (100%) and 21 of 21 TRDs (100%).
- Cost: median ratio 1.14, pooled 1.117, 4 of 4 in band, P90 covers 4 of 4 objectives (100%) and 19 of 21 TRDs (90.48%).

Classes the verb flagged (follow_up_required is false, the list is informational):
- minutes, other: P90 too narrow (4 tasks, median ratio 0.968, P90 coverage 75%)
- minutes, test_tdd: biased high (3 tasks, median ratio 1.425, coverage 100%)
- cost, code_tdd: biased high (31 tasks, median ratio 1.345, coverage 93.55%)
- cost, other: P90 too narrow (4 tasks, median ratio 0.841, coverage 75%)

## Solution

1. **Guarantee an objective-level estimate before the first wave.** Record `estimate start <N>` before wave 1 of every objective. 72's run state was created by `estimate wave --start` with no objective estimate, so either the execute-objective workflow must run `estimate start` first, or `wave --start` must refuse (or build one) when the run state has no objective-level estimate. A gate in the workflow that stops when `estimate.execution.agent_minutes.p50` is not a finite number would have kept 72 scoreable.
2. **Make `estimate backtest` robust to a later partial `estimate start`.** It takes each objective's latest finished run, so a re-started one-TRD run replaces the pre-execution one. Pick the run that was started before the first SUMMARY commit, or label a run that was not.
3. **Re-run the retest on the next five agent-only objectives** executed after this one, with the same pre-registered style of rule (eligibility fixed and committed before any score). Objectives whose minutes are dominated by human wait stay out, as 73-75 did.
4. **Flagged classes, each with its direction:** cost for `code_tdd` is biased high (estimate about 1.34 times the actual); minutes for `test_tdd` is biased high (about 1.43 times); `other` has a P90 that is too narrow for both minutes and cost (75% coverage on 4 tasks). The class samples for `test_tdd` and `other` are 3 and 4 tasks, so treat them as small-sample signals and look at them again on the next five before changing anything. Never tune to pass a number.

## Disposition

Follow-up recorded by objective 75 (TODO-01). EST-11 stays reported, not met. The four scored objectives meet the EST-08 criterion, so the calibration itself is not shown to be wrong; the miss is the missing fifth estimate for objective 72. The next step belongs to the next estimation objective, which should guarantee the objective-level estimate before wave 1 and then score the next five objectives. The calibration (`f4d1ffa9...`) was not rebuilt here.
