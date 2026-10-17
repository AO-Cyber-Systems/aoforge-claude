---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN 000134fa
- [ ] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — RED for case 6 (this commit); next step: rewrite run() in plugins/aoforge/hooks/coexistence-guard.js over coexistence.legacyNotices, delete migrateLegacyRuntimeOnce from plugins/aoforge/hooks/sync-runtime.js, move copyNoClobber into state-rekey.cjs and `git rm` runtime-state-migrate.cjs and its test
- [ ] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path
