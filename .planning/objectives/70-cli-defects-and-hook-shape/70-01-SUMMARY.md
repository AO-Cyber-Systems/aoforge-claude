---
objective: 70-cli-defects-and-hook-shape
trd: "01"
status: in-progress
---

# Objective 70 TRD 01: cli defects Summary

## Progress
- [x] Task 1: Fixture builders, then `state update-progress` updates, inserts or exits 1 — RED 573fbb08, GREEN (this commit)
- [ ] Task 2: `verify trd-pre` resolves the objective from anywhere inside the project, and not-found exits 1 — RED (this commit); next step: add resolveTarget (findProjectRoot) and the not-found exit 1 to lib/trd-pre-check.cjs cmdVerifyTrdPre
- [ ] Task 3: `objective-job-index` reports `gap_closure` from frontmatter, and execute-objective reads it
