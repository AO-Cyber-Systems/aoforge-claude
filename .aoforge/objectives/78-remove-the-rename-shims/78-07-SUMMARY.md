---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
status: checkpoint
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

## Progress
- [x] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED b7a8dad1, GREEN cb3e6582, deferred-path coverage 7f245202
- [x] Task 2: the SessionStart hook tells a legacy-only project once — RED 3005f4ff, GREEN 043ba685
- [x] Task 3: the aof-tools guard — RED 05fadeea, GREEN (this commit)
- next step: run the full suite (excluding watcher-shell.test.cjs), fix any suite that relied on a legacy-only fixture, then write the final SUMMARY
