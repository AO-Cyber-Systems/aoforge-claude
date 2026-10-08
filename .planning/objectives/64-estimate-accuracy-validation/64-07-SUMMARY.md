---
objective: 64-estimate-accuracy-validation
trd: "07"
subsystem: estimation
tags: [estimate, calibrate, EST-08, diagnosis, recency-window]
requirements-completed: []
---

# Objective 64 TRD 07: Diagnose the minutes bias and freeze the method (in progress)

## Progress
- [x] Task 1: Selection core of scripts/estimate-window-eval.cjs — RED 61af511e, GREEN 6a1e9442
- [x] Task 2: The diagnostic tables, the report renderer and the CLI — RED ab405fec, GREEN (this commit)
- [ ] Task 3: Run the diagnosis on the pre-59 snapshot, freeze the decision, write and commit 64-DIAGNOSIS.md — next step: git archive 401a9145^ .planning into <scratchpad>/pre59, run the leak check, then node scripts/estimate-window-eval.cjs report --snapshot <scratchpad>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratchpad>/diagnosis.json --raw
