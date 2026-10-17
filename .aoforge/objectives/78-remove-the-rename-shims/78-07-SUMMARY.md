---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
status: checkpoint
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

## Progress
- [x] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED b7a8dad1, GREEN cb3e6582, deferred-path coverage 7f245202
- [ ] Task 2: the SessionStart hook tells a legacy-only project once — RED (this commit); next step: in hooks/upgrade-project.js add loadLayout() + exported legacyRootFor(start, { find }), queue the global `legacy-layout:<realpath>` notice and return after the AOFORGE_SKIP_UPGRADE check, make the fast path `stamp === to`, drop compat isLegacyPlanning and rewrite the 0012 comments; skip the legacy variant of hooks/planning-layout.legacy.test.js case 7 naming 78-11
- [ ] Task 3: the aof-tools guard
