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
- [x] Task 1: transcript-export-schedule.cjs, the throttle, claim and arguments (tests 1-5) — RED e00ede14, GREEN (this commit)
- [ ] Task 2: upgrade-project.js step 0b, the SessionStart wiring (tests 6-12) — next step: add the `describe('objective 61 — transcript export')` block to plugins/devflow/hooks/upgrade-project.test.js and the DEVFLOW_SKIP_TRANSCRIPT_EXPORT entry to ESCAPES, then run it RED
