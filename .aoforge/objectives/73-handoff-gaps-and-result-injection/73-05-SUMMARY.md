---
objective: 73-handoff-gaps-and-result-injection
job: "05"
subsystem: handoff-watcher
---

# Objective 73 TRD 05: Attended watch terminal Summary

## Progress
- [x] Task 1: Fakes and RED tests for the facade and the terminal attachment - (this commit)
- [ ] Task 2: GREEN, watcher-attend.cjs - next step: create plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs with createSessionHandle and attachTerminal and run node --test on watcher-attend.test.cjs
- [ ] Task 3: runForeground attended, and the end-to-end PTY test that plays the user - next step: add test items 1-5 to aoforge-watch.test.cjs, then wire runForeground
