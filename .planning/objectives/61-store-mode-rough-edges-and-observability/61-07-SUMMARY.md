---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data (in progress)

## Progress
- [x] Task 1: model-currency.cjs and the current pins — RED 3c1c15e7, GREEN 0f154068
- [ ] Task 2: Doctor check 13 flags stale and unpriced pinned ids — RED (this commit); next step: in doctor-checks/13-model-profiles.cjs resolve the rate table (same copy, else installed, else calibration-inputs RATES_PATH), append staleModelIds findings to issues, set details.rates_source/details.stale, rewrite the header; run `node --test plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs`
- [ ] Task 3: validate health Check 18 (W063) and its deferral
