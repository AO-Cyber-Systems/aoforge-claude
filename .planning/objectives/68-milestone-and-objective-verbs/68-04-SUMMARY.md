---
objective: 68-milestone-and-objective-verbs
job: "04"
subsystem: df-tools
tags: [objective-remove, objective-complete, renumber, next-objective]
---

# Objective 68 TRD 04: objective remove keeps dates, objective complete sees ROADMAP-only objectives Summary

## Progress
- [x] Task 1: Fixture builders for dated ROADMAPs and next-objective projects — a85acf07
- [ ] Task 2: The renumber pass leaves dates and metadata alone (tests 1-7) — RED committed (this commit); next step: in objective.cjs extract the renumber loop of cmdObjectiveRemove into exported renumberRoadmapText(text, removedInt) with the bounded TRD-reference rule, then run objective-remove-renumber, objective and objective-change-flags tests
- [ ] Task 3: One next-objective lookup over directories and ROADMAP sections (tests 8-15)
