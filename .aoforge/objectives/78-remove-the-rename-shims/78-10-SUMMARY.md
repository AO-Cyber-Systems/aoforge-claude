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
- [x] Task 1: RED — invert the entry-point contract — (this commit)
- [ ] Task 2: GREEN — remove every alias call; single planning segment; comments — next step: delete the `aliasLegacyEnv` line (and its "Objective 72" comment) from aof-tools.cjs, aoforge-watch.cjs and each hook named in hooks.json, then set gate-edits `PLANNING_DIR_NAMES = [NAMES.planningDir]` and the single-name `PLANNING_SEGMENT_RE`, then run `node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs 'plugins/aoforge/hooks/*.test.js'`.
