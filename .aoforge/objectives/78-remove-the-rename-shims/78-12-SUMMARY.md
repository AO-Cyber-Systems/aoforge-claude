---
objective: 78-remove-the-rename-shims
trd: "12"
status: checkpoint
---

# Objective 78 TRD 12: Close-out Summary

## Progress
- [ ] Task 1: RED + GREEN — last shim, name map, SC-4 end to end — RED (this commit); next step: GREEN — delete aliasLegacyEnv from compat.cjs (inline NAMES constants, drop the legacy-names require), remove compat.legacy.test cases 5-8, set SHIM_REMOVAL='3.1.0', drop LEGACY.commandDash, rewrite the legacy-names header and the rename-guard ALLOW reasons, then run the Task 1 verify set
- [ ] Task 2: Docs — guide (+ site mirror), USER-GUIDE, CHANGELOG, CLAUDE.md, doctor-checks README
- [ ] Task 3: Full suite and the decisions roll-up
