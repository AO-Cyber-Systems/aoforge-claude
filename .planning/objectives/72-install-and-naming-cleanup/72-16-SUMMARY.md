---
objective: 72-install-and-naming-cleanup
trd: "16"
subsystem: github-store
---

# Objective 72 TRD 16: `aof-tools gh rebrand` Summary

## Progress
- [x] Task 1: Fixture builder: a legacy store-mode repository snapshot — 9be0af0e
- [ ] Task 2: Plan and dry run — RED committed (this commit); next step: write plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs (snapshotRepo, snapshotLocal, planRebrand, renderPlan, runRebrand), dispatch `gh rebrand` in aof-tools.cjs, add help/flag-spec/PROBES/seam entries, run the Task 2 verify suites
- [ ] Task 3: Apply, idempotence and resume
