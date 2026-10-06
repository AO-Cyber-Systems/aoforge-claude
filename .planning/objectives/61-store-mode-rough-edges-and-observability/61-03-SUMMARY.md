# Objective 61 TRD 03: Objective PR titles use the objective name Summary

## Progress
- [x] Task 1: objective-name.cjs, and gh.cjs's issue name moves onto it (tests 1-3) — RED 5191a004, GREEN c6bf4cdd
- [ ] Task 2: gh-pr's PR title uses the objective name (tests 4-8) — RED committed (this commit); next step: in plugins/devflow/devflow/bin/lib/gh-pr.cjs make objectiveName(root, id, info) (line 115) call objectiveDisplayName from ./objective-name.cjs with roadmapName, objDir, dirName, number
