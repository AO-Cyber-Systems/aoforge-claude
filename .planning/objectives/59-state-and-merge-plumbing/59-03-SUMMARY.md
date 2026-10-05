---
objective: 59-state-and-merge-plumbing
job: "03"
trd: "03"
subsystem: exec-context
tags: [exec-context, worktree, preflight, wrong-checkout]
---

# Objective 59 TRD 03: Worktree preflight Summary

**In progress.**

## Progress
- [x] Task 1: WRONG CHECKOUT guard and the `preflight` field (tests 1-8) — RED 7a7a82ea, GREEN 5bb6a9c9
- [ ] Task 2: CHECKOUT and `--cwd` in the dispatch and the executor's first step (tests 9-12) — RED committed (this commit); next step: edit `plugins/devflow/agents/executor.md` `repo_base_preflight` (command with `--cwd <CHECKOUT>`, `git -C <checkout>` guidance, WRONG CHECKOUT table row) and `plugins/devflow/devflow/workflows/execute-objective.md` (step 0 CHECKOUT, spawn prompt CHECKOUT line and `--cwd {CHECKOUT}` preflight), then run `node --test plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs`.
