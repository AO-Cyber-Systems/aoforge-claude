---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data (in progress)

## Progress
- [ ] Task 1: model-currency.cjs and the current pins — RED committed in (this commit); next step: create plugins/devflow/devflow/bin/lib/model-currency.cjs (parseModelId, compareModelVersions, currentByFamily, staleModelIds), set opus/sonnet to claude-opus-5-5/claude-sonnet-5-5 in references/model-profiles.json and .md, then run `node --test plugins/devflow/devflow/bin/lib/model-currency.test.cjs`
- [ ] Task 2: Doctor check 13 flags stale and unpriced pinned ids
- [ ] Task 3: validate health Check 18 (W063) and its deferral
