---
objective: 72-install-and-naming-cleanup
trd: "15"
subsystem: doctor
---

# Objective 72 TRD 15: Doctor legacy checks Summary

## Progress
- [x] Task 1: Fixture builder: homes and projects with leftovers — 489d2ef5
- [x] Task 2: Checks 15 and 16 (global) — RED f8156b6d, GREEN e27f9151
- [ ] Task 3: Check 27, check 22 deferral, check 26 legacy callers, README — RED (this commit); next step: add legacyConfigKeyIssue to planning-layout.cjs (validate.cjs Check 22 calls it), write doctor-checks/27-legacy-planning-layout.cjs, add W066/W067 to check 22 DEFERRED (+ the pinned list in 21-22-project.test.cjs), add the legacy branch to check 26, README rows, then run every doctor suite and the full suite
