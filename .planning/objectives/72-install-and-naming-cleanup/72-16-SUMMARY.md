---
objective: 72-install-and-naming-cleanup
trd: "16"
subsystem: github-store
---

# Objective 72 TRD 16: `aof-tools gh rebrand` Summary

## Progress
- [x] Task 1: Fixture builder: a legacy store-mode repository snapshot — 9be0af0e
- [x] Task 2: Plan and dry run — 33219075 (RED), ef3ede76 (GREEN)
- [ ] Task 3: Apply, idempotence and resume — RED committed (this commit); next step: restore the apply half (applyLocal, baseRefresher, applyRebrand, applied) in gh-rebrand.cjs and wire runRebrand --apply, run gh-rebrand.legacy + gh-*.test.cjs + the full gate
