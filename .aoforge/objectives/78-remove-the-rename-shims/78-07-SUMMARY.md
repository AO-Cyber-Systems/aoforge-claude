---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
status: checkpoint
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

## Progress
- [x] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED b7a8dad1, GREEN cb3e6582, deferred-path coverage 7f245202
- [x] Task 2: the SessionStart hook tells a legacy-only project once — RED 3005f4ff, GREEN (this commit)
- [ ] Task 3: the aof-tools guard — next step: write legacy-layout-guard.legacy.test.cjs (cases 5-8) and rewrite planning-layout.legacy.test.cjs cases 3, 4 and 6 (layout legacy) to the refusal, commit RED, then add lib/legacy-layout-guard.cjs (EXEMPT_COMMANDS with reasons, legacyLayoutGuard) and wire it into aof-tools.cjs main() after the flag check
