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
- [ ] Task 1: WRONG CHECKOUT guard and the `preflight` field (tests 1-8) — RED committed (this commit); next step: add `worktreeForId` and the guard to `plugins/devflow/devflow/bin/lib/exec-context.cjs` `cmdExecContextCheck`, plus the `preflight` field in `cmdExecContextWorktree`, then run `node --test plugins/devflow/devflow/bin/lib/exec-context.test.cjs`.
- [ ] Task 2: CHECKOUT and `--cwd` in the dispatch and the executor's first step (tests 9-12)
