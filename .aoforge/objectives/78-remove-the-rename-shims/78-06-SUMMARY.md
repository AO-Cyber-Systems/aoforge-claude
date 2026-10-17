---
objective: 78-remove-the-rename-shims
trd: "06"
status: checkpoint
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN 000134fa
- [x] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — RED d5b76293, GREEN (this commit)
- [ ] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path — RED (this commit); next step: rewrite plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs and 16-legacy-plugin-runtime.cjs without fix (16 over coexistence detectors), switch 17-user-dot-dir.cjs to coexistence's TO_RUNTIME/TO_WATCH with the "no longer reads them there" wording, point doctor.cjs legacyMirrorDir at coexistence.legacyRuntimeHome
