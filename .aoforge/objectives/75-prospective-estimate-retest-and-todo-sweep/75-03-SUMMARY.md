---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-03"
---

# Objective 75 TRD 03: A mid-TRD progress checkpoint is not a completed SUMMARY

## Progress
- [x] Task 1: Hand-built SUMMARY completion fixtures — (this commit)
- [ ] Task 2: _summaryNotComplete recognises a progress checkpoint (cases 3-8) — next step: add the NC-P tests to roadmap-reconcile.test.cjs, objective.test.cjs and state-advance-job.test.cjs, run them RED, commit, then add progressCheckpointOnly to roadmap-reconcile.cjs
- [ ] Task 3: Repository regression proof (cases 1-2) — next step: save `roadmap analyze --raw` before the fix as the baseline (Task 2 does this) and compare after
