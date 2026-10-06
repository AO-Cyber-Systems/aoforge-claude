---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data (in progress)

## Progress
- [x] Task 1: model-currency.cjs and the current pins — RED 3c1c15e7, GREEN (this commit)
- [ ] Task 2: Doctor check 13 flags stale and unpriced pinned ids — next step: in __fixtures__/doctor-fixtures.cjs set MODEL_PROFILES_JSON to claude-opus-5-5/claude-sonnet-5-5 and export a literal MODEL_RATES_JSON, then add tests 7-11 to doctor-checks/13-model-profiles.test.cjs and run it (RED)
- [ ] Task 3: validate health Check 18 (W063) and its deferral
