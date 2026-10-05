---
objective: 58-estimation-engine-and-surfacing
trd: "03"
subsystem: telemetry
tags: [calibration, agent-overhead, estimation]
---

# Objective 58 TRD 03: Calibration v2 Summary

**calibration.json version 2: per-spawn agent overhead and objective-level history.**

## Progress
- [x] Task 1: agent_overhead block, version 2, notes and digest — (this commit) (RED 3507760d)
- [ ] Task 2: objective_level history — next step: add test 10 to plugins/devflow/devflow/bin/lib/calibrator.test.cjs (BETA objective_level numbers), commit RED, then group TRDs by objective in calibrator.cjs buildCalibration
- [ ] Task 3: calibrate --root / --no-overhead, help and header — next step: write CLI tests 1-6 in calibrate-cli.test.cjs
