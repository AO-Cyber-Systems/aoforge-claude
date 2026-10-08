---
objective: 64-estimate-accuracy-validation
trd: "07"
subsystem: estimation
tags: [estimate, calibrate, EST-08, diagnosis, recency-window]
requirements-completed: []
---

# Objective 64 TRD 07: Diagnose the minutes bias and freeze the method (in progress)

## Progress
- [x] Task 1: Selection core of scripts/estimate-window-eval.cjs — RED 61af511e, GREEN (this commit)
- [ ] Task 2: The diagnostic tables, the report renderer and the CLI — next step: restore the Task 2 tests (scratchpad test-task2.part) into scripts/estimate-window-eval.test.cjs, see them fail, then add eraTable, taskCountTable, otherClassTable, durationSourceTable, compositionTable, classCounts, report, formatReport and main to scripts/estimate-window-eval.cjs
- [ ] Task 3: Run the diagnosis on the pre-59 snapshot, freeze the decision, write and commit 64-DIAGNOSIS.md
