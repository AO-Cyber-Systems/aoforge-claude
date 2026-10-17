---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
status: checkpoint
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

## Progress
- [x] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED b7a8dad1, GREEN (this commit)
- [ ] Task 2: the SessionStart hook tells a legacy-only project once — next step: rewrite hooks/upgrade-project.legacy.test.js as cases 1-2 (global notice key `legacy-layout:<realpath>` from the root and a subdir; pre-rename-only stamp upgraded in place), commit RED, then change upgrade-project.js main() (legacy root -> global notice, fast path `stamp === to`)
- [ ] Task 3: the aof-tools guard
