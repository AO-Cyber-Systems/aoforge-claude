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
- [ ] Task 2: Archive in the run verbs, enrich the estimate block, render a done objective's --all estimate — next step: write the RED test 5 in estimate-cli.test.cjs (start 80 records estimate.execution/total/calibration; null with no calibration), then GREEN in planObjective; then the format fix (items 7-8) and extending the tree/no-.tmp test (item 6). Done so far: finish archives (RED cfc3a5e8, GREEN), start/wave --start archive a finished previous run (RED eeb80870, GREEN this commit)
