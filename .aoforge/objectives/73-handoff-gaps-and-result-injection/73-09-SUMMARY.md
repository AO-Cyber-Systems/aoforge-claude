---
objective: 73-handoff-gaps-and-result-injection
trd: "09"
---

# Objective 73 TRD 09: $HOME is never an AOForge project root Summary

## Progress
- [x] Task 1: Fixture builders for temp homes — (this commit)
- [ ] Task 2: RED, the $HOME regression tests — next step: write plugins/aoforge/hooks/home-project-detection.test.js (spawned classify-session, gate-edits, gate-commits, route-intent under a temp HOME holding the watcher's log vs a control HOME), then compat.home.test.cjs items 7-16 and the planning-mode describe for items 17-18; run them against the unchanged code and commit the tests alone
- [ ] Task 3: GREEN, the $HOME stop in compat and planning-mode
