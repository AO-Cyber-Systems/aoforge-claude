---
objective: 44-autonomy-hardening
trd: "06"
status: in-progress
---

# Objective 44 TRD 06: Migration 0008 untracks DevFlow runtime state files (in progress)

## Progress

- [x] Task 1 step 1: `makeTrackedRuntimeStateProject` fixture builder in `upgrade-fixtures.cjs`
- [x] Task 1 step 2: RED tests 5-8 (`0008-runtime-state-untrack.test.cjs`) — 2af55e3
- [x] Task 1 step 3: GREEN migration 0008 (138/138 across migrations + upgrade + upgrade-cli)
- [x] Task 2: RED tests 2-4 (`commit-staged-removal.test.cjs`) — 5d98d40; GREEN in `cmdCommit` (150/150 incl. df-tools.test.cjs)
- [ ] Task 3: RED hook test 1 + `skipReason` unit test, then GREEN in `upgrade-project.js`
- [ ] Validation gates, `npm test`, final SUMMARY with Self-Check

Next step: commit Task 3 RED (tests already written in upgrade-project.test.js), then GREEN.
