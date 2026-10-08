---
objective: 64-estimate-accuracy-validation
trd: "07"
subsystem: estimation
tags: [estimate, calibrate, EST-08, diagnosis, recency-window]
requirements-completed: []
---

# Objective 64 TRD 07: Diagnose the minutes bias and freeze the method (in progress)

## Progress
- [ ] Task 1: Selection core of scripts/estimate-window-eval.cjs — next step: implement objectiveNumber, rankObjectives, sampleObjectives, recentObjectives, cutProject, trdRows, objectiveRow, summarizeCandidate, rollingSweep, selectWindow and noiseFloor in /Users/justin/dev/devflow-claude/scripts/estimate-window-eval.cjs until the Task 1 tests pass
- [ ] Task 2: The diagnostic tables, the report renderer and the CLI
- [ ] Task 3: Run the diagnosis on the pre-59 snapshot, freeze the decision, write and commit 64-DIAGNOSIS.md
