---
objective: 73-handoff-gaps-and-result-injection
trd: "12"
subsystem: watcher
tags: [watcher, aoforge-watch, runtime-home, watcher-allowlist, gap-closure, G5]
---

# Objective 73 TRD 12: The watch daemon's pid file and log live in the watch state directory Summary

## Progress

- [x] Task 1: RED, the daemon's files in the watch directory, the 3.0.0 read, and hook/daemon agreement — c2121c3f
- [x] Task 2: GREEN, watcher-state and aoforge-watch on the watch directory; the allowlist on the shared matcher — 058ba810 (pid file and log), (this commit) (allowlist)
- [ ] Task 3: neighbours follow the layout; gate-interactive pinned on it — next step: add test list item 14 to plugins/aoforge/hooks/gate-interactive.test.js (new-location, 3.0.0-only and pre-rename-only pid files with the override unset), then move handoff-e2e.test.cjs's pid waits (177, 363, 521), log path (362) and allowlist writers (55, 474) to watchStateDir/runtimeHome, flutter-ui-setup.test.cjs buildFakePidFile to watchStateDir, and rewrite file-identities.legacy.test.cjs test 6b
