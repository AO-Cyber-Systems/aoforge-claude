---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data (in progress)

## Progress
- [x] Task 1: model-currency.cjs and the current pins — RED 3c1c15e7, GREEN 0f154068
- [x] Task 2: Doctor check 13 flags stale and unpriced pinned ids — RED 2daa7e94, GREEN (this commit)
- [ ] Task 3: validate health Check 18 (W063) and its deferral — next step: write plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs (tests 12-15, runHealth capture with modelProfilesPath/modelRatesPath options) and add 'W063' to the DEFERRED pin and a W063-only test in doctor-checks/21-22-project.test.cjs; run them (RED)
