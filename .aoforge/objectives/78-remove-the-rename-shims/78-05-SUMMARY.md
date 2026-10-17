---
objective: 78-remove-the-rename-shims
trd: "05"
subsystem: watch-daemon
tags: [rename, shims, aoforge-watch, watcher-state, pid-file]
---

# Objective 78 TRD 05: The watch daemon reads its pid and log from the runtime home only Summary

## Progress
- [x] Task 1: Fixtures and RED tests — 1170213c
- [x] Task 2: GREEN — watcher-state and aoforge-watch — (this commit)
- [ ] Task 3: GREEN — consumers stop testing for a legacy record — next step: drop `!info.legacy` in hooks/gate-interactive.js readWatcherInfo, `|| info.legacy` in lib/handoff-results.cjs watcherWatching, `!pidInfo.legacy &&` in lib/watcher-daemon.cjs tick, and the legacy advisory branch in lib/flutter-ui-setup.cjs; reword handoff-results.test.cjs 14d and the inject-handoff-results.test.js case-12 comment; run the Task 3 verify command
