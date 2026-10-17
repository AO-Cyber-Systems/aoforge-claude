---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN 000134fa
- [x] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — RED d5b76293, GREEN (this commit)
- [x] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path — RED 7d622593, GREEN (this commit)

Next step: run the full suite (npm test globs minus plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs), then finish this SUMMARY, `tokens stamp 78-06`, `summary post 78-06`, and the state/roadmap updates.
