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
- [x] Task 1: The window in the library (helpers, applyWindow, block, note, digest; scripts take the library windowing) — 013a803f (RED), 3768e5e6
- [x] Task 2: `calibrate --window <N|all>` flag, validation, summary line, help — 979661e4 (RED), (this commit)
- [ ] Task 3: scripts/estimate-rolling-backtest.cjs — next step: write scripts/estimate-rolling-backtest.test.cjs items 20, 16-19, 21 (RED), then the script
