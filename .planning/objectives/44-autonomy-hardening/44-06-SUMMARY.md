---
objective: 44-autonomy-hardening
trd: "06"
status: in-progress
---

# Objective 44 TRD 06: Migration 0008 untracks DevFlow runtime state files (in progress)

## Progress

- [x] Task 1 step 1: `makeTrackedRuntimeStateProject` fixture builder in `upgrade-fixtures.cjs`
- [ ] Task 1 step 2: RED tests 5-8 (`0008-runtime-state-untrack.test.cjs`)
- [ ] Task 1 step 3: GREEN migration 0008
- [ ] Task 2: RED tests 2-4 (`commit-staged-removal.test.cjs`), then GREEN in `cmdCommit`
- [ ] Task 3: RED hook test 1 + `skipReason` unit test, then GREEN in `upgrade-project.js`
- [ ] Validation gates, `npm test`, final SUMMARY with Self-Check

Next step: write the RED tests for migration 0008.
