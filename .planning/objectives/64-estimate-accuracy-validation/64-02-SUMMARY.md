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
- [ ] Task 1: Run-state fixture builders, then the history store API — next step: write RED tests 15a-15e (archiveRunState, plus the byte-exact sha256 of Objective 63's archive) in estimate-run-store.test.cjs; history paths (item 9) done: RED 1014b150, GREEN (this commit)
- [ ] Task 2: Archive in the run verbs, enrich the estimate block, render a done objective's --all estimate — next step: write the RED estimate-cli tests for items 1-5 in estimate-cli.test.cjs
