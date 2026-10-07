---
objective: 64-estimate-accuracy-validation
job: "02"
subsystem: estimation
tags: [estimate, run-state, history]
requirements-completed: []
started: 2026-10-07T11:47:13Z
---

# Objective 64 TRD 02: Run history and --all text fix Summary

**In progress.**

## Progress
- [x] Task 1: Run-state fixture builders, then the history store API — (this commit)
- [ ] Task 2: Archive in the run verbs, enrich the estimate block, render a done objective's --all estimate — next step: write the RED format tests (items 7-8): estimate-format.test.cjs objectiveLine/objectiveTable with all: true on a done objective, and estimate-cli.test.cjs `objective 82 --all --line`; GREEN is `r.status === 'done' && !r.all` in the two short-circuits of estimate-format.cjs; then extend the tree/no-.tmp test (item 6) to recurse into history/. Done so far: finish archives, start/wave --start archive a finished previous run, enriched estimate block (5f13f400, 8f8a704e, this commit)
