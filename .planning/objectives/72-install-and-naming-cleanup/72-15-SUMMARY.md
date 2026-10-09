---
objective: 72-install-and-naming-cleanup
trd: "15"
subsystem: doctor
---

# Objective 72 TRD 15: Doctor legacy checks Summary

## Progress
- [x] Task 1: Fixture builder: homes and projects with leftovers — 489d2ef5
- [ ] Task 2: Checks 15 and 16 (global) — RED committed (this commit); next step: write doctor-checks/15-legacy-df-install.cjs (findLegacy/moveLegacy) and 16-legacy-plugin-runtime.cjs (detectLegacyPlugin, migrateLegacyRuntime, moveLegacy with a backup-dir prefix option), add both ids to doctor.e2e.test.cjs GLOBAL_IDS, run the two legacy tests green
- [ ] Task 3: Check 27, check 22 deferral, check 26 legacy callers, README
