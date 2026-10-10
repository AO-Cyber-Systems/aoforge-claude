---
objective: 75-prospective-estimate-retest-and-todo-sweep
job: "02"
status: checkpoint
---

# Objective 75 TRD 02: Two upgrade migration defects from the 72-25 fleet sweep (in progress)

## Progress
- [x] Task 1: Hand-built fixture builders for the two cases — (this commit)
- [ ] Task 2: 0012 stages the run's own removals before git mv (cases 1-5) — next step: add the `describe('0012 after 0002 in one run')` block to 0012-planning-dir-move.legacy.test.cjs using legacyProject({jobFiles}) and confirm RED with `bad source`
- [ ] Task 3: 0008 covers .dup-detect-log.jsonl (cases 6-10)
