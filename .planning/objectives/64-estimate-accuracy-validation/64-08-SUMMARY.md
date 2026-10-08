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
- [x] Task 2: `calibrate --window <N|all>` flag, validation, summary line, help — 979661e4 (RED), 5cf665de
- [x] Task 3: scripts/estimate-rolling-backtest.cjs — cbb629b3 (RED), (this commit)
- [ ] Gates: run the scoped test command and `npm test`, then write the final SUMMARY sections — next step: `node --test` on the five scoped test files, then `npm test`
