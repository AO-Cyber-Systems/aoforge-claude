---
objective: 70-cli-defects-and-hook-shape
trd: "01"
status: in-progress
---

# Objective 70 TRD 01: cli defects Summary

## Progress
- [x] Task 1: Fixture builders, then `state update-progress` updates, inserts or exits 1 — RED 573fbb08, GREEN 817d0af9
- [x] Task 2: `verify trd-pre` resolves the objective from anywhere inside the project, and not-found exits 1 — RED a3430a8c, GREEN (this commit)
- [ ] Task 3: `objective-job-index` reports `gap_closure` from frontmatter, and execute-objective reads it — next step: create lib/misc-job-index.test.cjs (cases 16-18) with makeProject/trdText/runDfTools, watch it fail, commit RED
