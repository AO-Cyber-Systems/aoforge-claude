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
- [ ] Task 3: the aof-tools guard — RED (this commit); next step: add lib/legacy-layout-guard.cjs (EXEMPT_COMMANDS with reasons, legacyLayoutGuard({ command, args, cwd, commands, home })) and wire it into aof-tools.cjs main() after the flag check, then run the full suite
