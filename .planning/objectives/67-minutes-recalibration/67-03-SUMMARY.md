---
objective: 67-minutes-recalibration
job: "03"
subsystem: estimation
tags: [EST-10, minutes-method, estimator, calibration-v3]
---

# Objective 67 TRD 03: The estimator takes a TRD's minutes from TRD-level history when the calibration says so Summary

## Progress
- [x] Task 1: Version 3 fixture builder, loader checks and minutesMethod — (this commit)
- [ ] Task 2: TRD-level minutes in estimateTrdText, the confidence cap, and the rollup proof — next step: add test 4 (three code_tdd tasks under makeCalibrationV3({minutes: 'trd_level'}) give minutes {p50: 12, p90: 45}) to /Users/justin/dev/.df-worktrees/devflow-claude/67-03-estimator-trd-level-minutes/plugins/devflow/devflow/bin/lib/estimate.test.cjs and watch it fail
- [ ] Task 3: Name the method in every estimate result, the run state and the text
