---
objective: 75-prospective-estimate-retest-and-todo-sweep
job: "02"
status: checkpoint
---

# Objective 75 TRD 02: Two upgrade migration defects from the 72-25 fleet sweep (in progress)

## Progress
- [x] Task 1: Hand-built fixture builders for the two cases — 165a01ed
- [x] Task 2: 0012 stages the run's own removals before git mv (cases 1-5) — (this commit); RED was 92e5e671
- [ ] Task 3: 0008 covers .dup-detect-log.jsonl (cases 6-10) — next step: add cases 6-8 and 10 to 0008-runtime-state-untrack.test.cjs and case 9 to 0012-planning-dir-move.legacy.test.cjs, confirm RED, then add '.dup-detect-log.jsonl' to RUNTIME_STATE_BASENAMES in 0008-runtime-state-untrack.cjs and update the two existing expectations that hard-code the two-item list (tests 8 and nested-1) and the .gitignore bodies in 6a/6c/6d
