---
objective: 73-handoff-gaps-and-result-injection
job: "03"
subsystem: handoff-watcher
tags: [pty, shell, listeners, prompt-detector]
requires:
  - objective: 73-01
    provides: the in-band PTY dispatch script and sentinelMarkers
affects: [73-05 attended watch terminal]
---

# Objective 73 TRD 03: Live-window listeners Summary

**In progress.**

## Progress
- [x] Task 1: RED, the late-match regressions and the live-only listener tests - (this commit)
- [ ] Task 2: GREEN, makeLiveFilter, liveOnly listeners and the live-only detector - next step: add makeLiveFilter and the { fn, liveOnly } listener list to watcher-shell.cjs, then pass { liveOnly: true } in processOnce
- [ ] Task 3: The e2e tests assert instead of skipping, and the gates
