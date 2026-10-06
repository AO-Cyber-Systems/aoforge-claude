---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data (in progress)

## Progress
- [x] Task 1: model-currency.cjs and the current pins — RED 3c1c15e7, GREEN 0f154068
- [x] Task 2: Doctor check 13 flags stale and unpriced pinned ids — RED 2daa7e94, GREEN 82c51e04
- [ ] Task 3: validate health Check 18 (W063) and its deferral — RED (this commit); next step: add Check 18 after Check 17 in bin/lib/validate.cjs (options.modelProfilesPath / options.modelRatesPath, staleModelIds, W063 never repairable) and 'W063' to DEFERRED in doctor-checks/22-validate-health.cjs with check 13 named as owner; run `node --test plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs`
