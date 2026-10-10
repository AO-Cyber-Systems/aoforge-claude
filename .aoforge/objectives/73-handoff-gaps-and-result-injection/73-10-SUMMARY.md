---
objective: 73-handoff-gaps-and-result-injection
trd: "10"
---

# Objective 73 TRD 10: gate-interactive reads invocations, not mentions Summary

## Progress
- [x] Task 1: RED, the shared case table and invocation-aware detection tests — 8944efc4
- [x] Task 2: GREEN, the shared matcher on parseCommand segments — (this commit)
- [ ] Task 3: the daemon is read through watcher-state — next step: in hooks/gate-interactive.test.js write items 4 (pid file at watcher-state.pidFilePath() under a temp HOME, override unset, gives the daemon-live reason) and 5 (handoff-fixtures.writePidFile(home, { legacy: true }) only gives the daemon-absent reason) plus a pidFilePath equality unit test; then replace pidFilePath/readWatcherInfo/isWatcherLive in hooks/gate-interactive.js with watcher-state reads and delete the duplicate '.aoforge' entry in hooks/planning-writes.audit.test.js NOT_UNDER_PLANNING
