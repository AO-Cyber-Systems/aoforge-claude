---
objective: 67-minutes-recalibration
job: "03"
subsystem: estimation
tags: [EST-10, minutes-method, estimator, calibration-v3]
---

# Objective 67 TRD 03: The estimator takes a TRD's minutes from TRD-level history when the calibration says so Summary

## Progress
- [x] Task 1: Version 3 fixture builder, loader checks and minutesMethod — 122c2b6c (RED), 79e7b602 (GREEN)
- [x] Task 2: TRD-level minutes in estimateTrdText, the confidence cap, and the rollup proof — 3d3be91d (RED), (this commit) (GREEN)
- [ ] Task 3: Name the method in every estimate result, the run state and the text — next step: add test 12 (estimate trd --calibration <v3 file>, JSON carries calibration.method) to /Users/justin/dev/.df-worktrees/devflow-claude/67-03-estimator-trd-level-minutes/plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs and watch it fail
