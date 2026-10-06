---
objective: 62-built-in-sweep
trd: "09"
subsystem: skills-and-workflows
tags: [built-ins, AskUserQuestion, BLTN-03]
---

# Objective 62 TRD 09: Questions in todo, status, objective, decide, handoff and workstreams Summary

## Progress
- [x] Task 1 RED: todo and status entries leave the baseline — a73a1a21
- [x] Task 1 GREEN (todo): check-todos asks with AskUserQuestion — 4eeae608
- [x] Task 1 GREEN (status): health, pause-work, resume-project — ecf4b7f5
- [x] Task 2 RED: objective, decide, handoff, workstreams entries leave the baseline — 41ef5bd1
- [x] Task 2 GREEN (objective): remove-objective — 55ec1f1f
- [x] Task 2 GREEN (decide) — c29b2840
- [x] Task 2 GREEN (handoff) — (this commit)
- [ ] Task 2 GREEN (workstreams) and baseline deleted — next step: in plugins/devflow/devflow/workflows/workstreams-merge.md replace the printed Options list and `Wait for user decision.` with the "Merge" AskUserQuestion (BS-093), then workstreams-setup.md BS-094 (Workstreams), BS-095 (delete printed question), BS-096 (Worktrees, Not yet first, yolo unchanged); `git rm` the empty baseline and commit
