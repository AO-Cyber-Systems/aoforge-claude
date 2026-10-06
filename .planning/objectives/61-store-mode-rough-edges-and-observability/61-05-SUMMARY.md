---
objective: 61-store-mode-rough-edges-and-observability
trd: "05"
subsystem: hooks
tags: [transcript-export, sessionstart, throttle, observability]
requirements: [OBS-03]
---

# Objective 61 TRD 05: transcript-export schedule Summary

In progress.

## Progress
- [x] Task 1: transcript-export-schedule.cjs, the throttle, claim and arguments (tests 1-5) — RED e00ede14, GREEN f097b886
- [x] Task 2: upgrade-project.js step 0b, the SessionStart wiring (tests 6-12) — RED (this commit)
- [ ] Task 2 GREEN — next step: add step 0b after the prune in main() of plugins/devflow/hooks/upgrade-project.js, update its header comment, then run the three test files and the planning-writes audit
