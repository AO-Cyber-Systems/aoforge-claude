---
objective: 55-store-live-smoke-fixes
trd: "04"
---

# Objective 55 TRD 04: Store issue naming Summary

## Progress
- [x] Task 1: Objective issue title falls back to the OBJECTIVE.md heading, then the bare slug — 433a9dd5 (RED), 08bcd1a7 (GREEN)
- [ ] Task 2: Store-mode footer on objective issue bodies — RED tests committed in this commit; next step: add the `store` flag to `buildObjectiveSections` (gh-body.cjs:259-262) and `buildIssueBody` (gh.cjs:958-959), and pass `store: storeMode` at gh.cjs syncObjective (the `buildObjectiveSections({ ...state, objectiveId, dir })` call)
