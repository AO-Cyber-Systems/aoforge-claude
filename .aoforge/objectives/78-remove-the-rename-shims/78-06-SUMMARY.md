---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [ ] Task 1: Fixtures, RED tests and the coexistence detectors — RED (this commit); next step: add legacyEnvVariables, legacyRuntimeHome, LEGACY_STATE_MARKER, legacyRuntimeState, TO_RUNTIME/TO_WATCH, interimUserFiles and legacyNotices to plugins/aoforge/aoforge/bin/lib/coexistence.cjs, then `node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs`
- [ ] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration
- [ ] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path
