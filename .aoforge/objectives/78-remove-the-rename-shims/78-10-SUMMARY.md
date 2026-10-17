---
objective: 78-remove-the-rename-shims
trd: "10"
subsystem: hooks
tags: [rename-shims, env-alias, hooks, gate-edits, entry-points]
requires: ["78-02", "78-04", "78-05", "78-06", "78-07"]
provides: []
affects: [78-11, 78-12]
status: checkpoint
---

# Objective 78 TRD 10: Env Alias Removal Summary

## Progress
- [x] Task 1: RED — invert the entry-point contract — 3ed49991
- [x] Task 2: GREEN — remove every alias call; single planning segment; comments — (this commit)
