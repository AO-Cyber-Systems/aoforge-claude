---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN (this commit)
- [ ] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — next step: rewrite run() in plugins/aoforge/hooks/coexistence-guard.js over coexistence.legacyNotices (one/several findings, status 'nothing'), then `node --test plugins/aoforge/hooks/coexistence-guard.legacy.test.js`
- [ ] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path
