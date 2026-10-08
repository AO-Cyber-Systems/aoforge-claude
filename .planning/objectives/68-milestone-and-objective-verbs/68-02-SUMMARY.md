---
objective: 68-milestone-and-objective-verbs
trd: "02"
subsystem: df-tools
tags: [milestone-scope, helpers, objective-dir-resolution]
requirements: [TOOL-05]
---

# Objective 68 TRD 02: milestone-scope resolves objective directories through the shared helpers Summary

## Progress
- [x] Task 1: Fixture builder for directory-resolution projects — e5407736
- [x] Task 2: parseObjectiveDirName and canonicalObjectiveNumber in helpers.cjs — RED 9379ae9b, GREEN (this commit)
- [ ] Task 3: milestone-scope.cjs on the shared helpers — RED committed (this commit); next step: edit plugins/devflow/devflow/bin/lib/milestone-scope.cjs (shared helpers in objectiveDirectories, canonicalObjectiveNumber in roadmapSections, export roadmapSections, exact decimal singles in selectMilestoneObjectives), then run the five scoped suites GREEN
