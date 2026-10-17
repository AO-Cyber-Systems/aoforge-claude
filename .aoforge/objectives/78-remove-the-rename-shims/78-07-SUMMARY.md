---
objective: 78-remove-the-rename-shims
trd: "07"
subsystem: upgrade
status: checkpoint
---

# Objective 78 TRD 07: Retire planning migrations and guard Summary

## Progress
- [ ] Task 1: retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs — RED (this commit); next step: delete migrations 0012/0013 with their tests and legacy-migration-fixtures.cjs, then change upgrade.cjs (stampObject/writeStamp, RETIRED_MIGRATIONS in assertKnownIds, legacy_layout in apply/check) and the git-busy.cjs comment
- [ ] Task 2: the SessionStart hook tells a legacy-only project once
- [ ] Task 3: the aof-tools guard
