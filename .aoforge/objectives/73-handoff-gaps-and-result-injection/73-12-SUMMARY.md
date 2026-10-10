---
objective: 73-handoff-gaps-and-result-injection
trd: "12"
subsystem: watcher
tags: [watcher, aoforge-watch, runtime-home, watcher-allowlist, gap-closure, G5]
---

# Objective 73 TRD 12: The watch daemon's pid file and log live in the watch state directory Summary

## Progress

- [x] Task 1: RED, the daemon's files in the watch directory, the 3.0.0 read, and hook/daemon agreement — (this commit)
- [ ] Task 2: GREEN, watcher-state and aoforge-watch on the watch directory; the allowlist on the shared matcher — next step: in plugins/aoforge/aoforge/bin/lib/watcher-state.cjs replace PID_DIR_NAME with WATCH_DIR_SEGMENTS and INTERIM_DOT_DIR, rewrite pidFilePath/readablePidFile (compat.resolveUserFile with currentDir)/removePidFile, make add/remove write readablePidFile().file, then run node --test on watcher-state.test.cjs and aoforge-watch.test.cjs
- [ ] Task 3: neighbours follow the layout; gate-interactive pinned on it
