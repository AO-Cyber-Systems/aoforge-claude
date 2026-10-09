---
objective: 72-install-and-naming-cleanup
trd: "16"
subsystem: github-store
---

# Objective 72 TRD 16: `aof-tools gh rebrand` Summary

## Progress
- [x] Task 1: Fixture builder: a legacy store-mode repository snapshot — 9be0af0e
- [x] Task 2: Plan and dry run — 33219075 (RED), (this commit) (GREEN)
- [ ] Task 3: Apply, idempotence and resume — next step: add tests 8, 9, 10 (+12 base refresh) to gh-rebrand.legacy.test.cjs using stubClient state and localRepo, run RED (applyRebrand exists, so assert on the behaviours it lacks), commit RED
