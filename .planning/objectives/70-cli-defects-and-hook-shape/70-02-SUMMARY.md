---
objective: 70-cli-defects-and-hook-shape
trd: "02"
subsystem: hooks
tags: [hooks, SubagentStop, verify-commits, schema, TOOL-08]
---

# Objective 70 TRD 02: verify-commits.js speaks the SubagentStop output schema Summary

(In progress: checkpoint draft.)

## Progress
- [x] Task 1: Cited SubagentStop schema model, a shape-pinning test, and a top-level block scoped to the executor — RED d0da9584, GREEN (this commit)
- [ ] Task 2: The cross-hook contract uses the validator; the 63-05 finding and its doc trail are closed — next step: in plugins/devflow/hooks/hook-coexistence.test.js set RUNS verify-commits.js@SubagentStop to expect 'block' and call stopFamilyProblems from contractProblems, then run the file
