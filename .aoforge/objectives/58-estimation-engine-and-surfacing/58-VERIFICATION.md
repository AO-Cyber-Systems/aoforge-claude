---
objective: 58-estimation-engine-and-surfacing
verified: 2026-10-05T00:00:00Z
status: passed
score: 4/4 must-haves verified
notes:
  - kind: defect_advisory
    path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
    note: "objectiveLine (~line 229) returns 'all TRDs done' when r.status === 'done' without checking r.all, so `estimate objective N --all --table` on a completed objective prints no backtest table. --all is documented in 58-08 truths; success criteria do not depend on it. Fix: skip the done short-circuit when r.all (and ensure estimate-rollup reports a non-done status or the formatter ignores it under all)."
  - kind: defect_advisory
    path: plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
    note: "`estimate objective 59` exits 1 'objective 59 not found' when the roadmap objective has no directory; only `estimate milestone` has the ROADMAP-only unplanned fallback (estimateUnplanned). No 58-06/58-08 must-have requires the objective form to handle it (58-06 covers an objective with no TRDs; 58-07 covers no directory in milestone). plan-objective and build run after the directory exists, so criteria 3-4 are unaffected. Fix: in estimateObjective, fall back to estimateUnplanned when remainingTrds finds no directory but ROADMAP lists the objective."
---

# Objective 58: Estimation engine and surfacing - Verification Report

**Goal:** Users see an honest time, token and dollar estimate, with its confidence, when planning and when building.
**Status:** passed (two advisory defects, neither blocks a success criterion)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `estimate task` returns median/P90 minutes, tokens, dollars, sample count, confidence | VERIFIED | Live: `Task code_tdd: 6 min (P90 18 min) - tokens 3.6M in / 29K out - $1.35 (P90 $2.20) - n=332, confidence high`; `--class other` JSON carries p50/p90/n per metric |
| 2 | `estimate trd/objective/milestone` compose tasks + agent overhead + gap-closure | VERIFIED | Live trd 58-05, milestone v1.5 line and table (8h 25m median, 6 unplanned, integration-checker spawn included, weakest component named). rollup code carries overhead and gap-closure mixture; tests pass |
| 3 | plan-objective PLANNING COMPLETE includes estimate table | VERIFIED | agents/planner.md step `estimate` (line ~1157) and `**Estimate:**` block; workflows/plan-objective.md line 736 re-runs after revisions |
| 4 | build prints one-line estimate; status line shows time remaining; wave reports show actual vs estimate | VERIFIED | build.md lines 66/175/240; execute-objective.md lines 295/666/891; hooks/statusline.js estimate segment reading estimate-run-store; statusline-estimate tests pass |

**Score:** 4/4

## Requirements Coverage

| Req | Plans | Status |
|-----|-------|--------|
| EST-02 | 58-05, 58-08, 58-10 | SATISFIED (checkbox deliberately left for orchestrator) |
| EST-03 | 58-01,02,03,05,06,07,08,10 | SATISFIED |
| EST-04 | 58-09, 58-10 | SATISFIED |
| EST-05 | 58-04, 58-08, 58-09, 58-10 | SATISFIED |

No orphaned requirements.

## Tests

261 tests pass, 0 fail (estimate*.test.cjs, agent-overhead, calibrator, calibrate-cli, estimate-run-store, estimate-surfacing.repo, statusline-estimate).

## Assessment of the two reported deviations

1. `--all` backtest on a done objective: real defect in a documented flag, advisory (not in the 4 success criteria; the backtest is informational per 58-10 truth 4).
2. `estimate objective <no-dir>`: not required by any 58-06/08 must-have; milestone covers it and 58-10 truth 2's "unplanned objective (59)" is satisfied via the milestone table. Advisory.

## Human Verification

None required.
