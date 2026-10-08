---
objective: 64-estimate-accuracy-validation
trd: "08"
subsystem: estimation
tags: [estimate, calibrate, EST-08, recency-window, rolling-backtest, gap-closure]
requirements-completed: []
---

# Objective 64 TRD 08: calibrate --window and the rolling harness Summary

Checkpoint in progress: the TRD is not complete until `## Self-Check` appears below.

## Progress
- [x] Task 1: The window in the library (helpers, applyWindow, block, note, digest; scripts take the library windowing) — (this commit)
- [ ] Task 2: `calibrate --window <N|all>` flag, validation, summary line, help — next step: add the RED tests 11-15 to plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, then add `window` to VALUE_FLAGS in calibrate-cli.cjs
- [ ] Task 3: scripts/estimate-rolling-backtest.cjs — next step: write scripts/estimate-rolling-backtest.test.cjs items 20, 16-19, 21 (RED), then the script
