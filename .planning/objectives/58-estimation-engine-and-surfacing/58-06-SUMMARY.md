---
objective: 58-estimation-engine-and-surfacing
job: "06"
subsystem: estimation
tags: [estimate, objective-rollup, waves, agent-overhead, gap-closure]

requires: [58-03, 58-05]
affects: [58-07 milestone rollup, 58-08 estimate CLI, 58-09 planning surfacing]
---

# Objective 58 TRD 06: Objective rollup Summary

## Progress
- [ ] Task 1: Remaining TRDs, waves and execution totals — RED (this commit); next step: add estimate-rollup.cjs (remainingTrds, estimateObjective with waves and execution) and export isCheckpointOnlySummary from misc.cjs
- [ ] Task 2: Agent overhead, gap-closure mixture, unplanned fallback, confidence — next step: add the Task 2 tests (1 totals, 2, 4, 7) to estimate-rollup.test.cjs and commit RED
