---
objective: 57-estimation-data-foundation
trd: "05"
subsystem: estimation
tags: [calibration, percentiles, model-rates, deterministic-output, node-test]
---

# Objective 57 TRD 05: Calibrator Summary

## Progress
- [x] Task 1: nearestRank, statBlock, sampleCost, buildCalibration — (this commit) (RED 601830e2)
- [ ] Task 2: stableStringify, inputs_digest, writeCalibration, defaultCalibrationPath — next step: add tests 4-7 (determinism after utimesSync, writeCalibration changed:false with unchanged mtime, defaultCalibrationPath HOME/env, inputs_digest) to plugins/devflow/devflow/bin/lib/calibrator.test.cjs, run them RED, commit, then add the four functions to calibrator.cjs
