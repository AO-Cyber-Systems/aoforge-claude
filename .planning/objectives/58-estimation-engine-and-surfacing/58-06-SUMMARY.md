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
- [x] Task 1: Remaining TRDs, waves and execution totals — RED 3b052e88, GREEN b8e59661
- [ ] Task 2: Agent overhead, gap-closure mixture, unplanned fallback, confidence — RED (this commit); next step: in estimate-rollup.cjs add objectiveOverhead, estimateUnplanned and the per-metric mixture in estimateObjective, then run the 15 tests
