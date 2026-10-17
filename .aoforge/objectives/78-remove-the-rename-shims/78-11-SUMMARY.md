---
objective: 78-remove-the-rename-shims
trd: "11"
subsystem: compat
status: checkpoint
---

# Objective 78 TRD 11: compat single name Summary

## Progress
- [x] Task 1: RED — the shims are gone (unit, hooks, user files) — (this commit)
- [ ] Task 2: GREEN — planning directory, project root and agent namespace — next step: in plugins/aoforge/aoforge/bin/lib/compat.cjs remove OLD_PLAN_DIR/hasOldPlanDir/isLegacyPlanning/bothPlanningDirs, make planningDirName/PLANNING_DIR_NAMES/isPlanningDirName/planningDirLabel/findProjectRoot/isOwnAgentType/isOwnExecutor single-name, re-point gh-rebrand.cjs to planning-layout.isLegacyPlanning, then run the full suite
- [ ] Task 3: GREEN — user files from the runtime home only
