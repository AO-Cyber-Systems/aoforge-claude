---
objective: 75-prospective-estimate-retest-and-todo-sweep
job: "02"
status: checkpoint
---

# Objective 75 TRD 02: Two upgrade migration defects from the 72-25 fleet sweep (in progress)

## Progress
- [x] Task 1: Hand-built fixture builders for the two cases — 165a01ed
- [x] Task 2: 0012 stages the run's own removals before git mv (cases 1-5) — c1080db5; RED was 92e5e671
- [ ] Task 3: 0008 covers .dup-detect-log.jsonl (cases 6-10) — dup-detect log done (RED 58bea6e7, GREEN this commit); next step: finish the todo's step-2 dotfile audit by adding named RED tests to 0008-runtime-state-untrack.test.cjs for .check-todos-cache.json, .deprecation-log.jsonl and .override-log.jsonl, then extend RUNTIME_STATE_BASENAMES in 0008-runtime-state-untrack.cjs, and write the audit table into this SUMMARY
