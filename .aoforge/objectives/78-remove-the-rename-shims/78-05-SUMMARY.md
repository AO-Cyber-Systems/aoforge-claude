---
objective: 78-remove-the-rename-shims
trd: "05"
subsystem: watch-daemon
tags: [rename, shims, aoforge-watch, watcher-state, pid-file]
---

# Objective 78 TRD 05: The watch daemon reads its pid and log from the runtime home only Summary

## Progress
- [x] Task 1: Fixtures and RED tests — (this commit)
- [ ] Task 2: GREEN — watcher-state and aoforge-watch — next step: in plugins/aoforge/aoforge/bin/lib/watcher-state.cjs delete readablePidFile, legacyDaemonError and the compat/LEGACY requires, make readPidFile/removePidFile use pidFilePath() only, add interimDaemon(); in aoforge-watch.cjs swap readableLogFile for logFilePath and refuse start / warn in status on a live interimDaemon(); run node --test on watcher-state.test.cjs, aoforge-watch.test.cjs and file-identities.legacy.test.cjs
- [ ] Task 3: GREEN — consumers stop testing for a legacy record
