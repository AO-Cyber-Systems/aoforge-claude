---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN 000134fa
- [x] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — RED d5b76293, GREEN (this commit)
- [ ] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path — next step: write RED cases 7-9 in plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs, 16-legacy-plugin-runtime.legacy.test.cjs and 17-user-dot-dir.test.cjs (no fix export in 15/16, new texts, check 17 "no longer read"); check 16 does not load until then (it still requires the deleted runtime-state-migrate.cjs)
