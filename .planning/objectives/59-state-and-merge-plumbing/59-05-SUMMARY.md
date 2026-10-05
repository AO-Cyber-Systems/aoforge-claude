---
objective: 59-state-and-merge-plumbing
trd: "05"
subsystem: objective-ops
tags: [df-tools, objective, roadmap, tool-02]
---

# Objective 59 TRD 05: objective change flags Summary

## Progress
- [x] Task 1: Fixture builder for remove/complete projects — 11550f94
- [ ] Task 2: roadmap_updated reports a real change (tests 1-7) — RED committed (this commit; tests 2 and 5 fail on roadmap_updated); next step: in plugins/devflow/devflow/bin/lib/objective.cjs make cmdObjectiveRemove and cmdObjectiveComplete compare ROADMAP text before/after, write only on change, and report that as roadmap_updated
