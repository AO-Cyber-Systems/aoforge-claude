---
objective: 72-install-and-naming-cleanup
trd: "09"
subsystem: upgrade
tags: [aoforge-rename, claude-md, managed-block, migrations, global-upgrade, shims]
---

# Objective 72 TRD 09: CLAUDE.md blocks: old markers recognised, project blocks migrated, the global file changed only with approval Summary

## Progress
- [x] Task 1: Fixture builder: legacy CLAUDE.md shapes; PRESERVE in legacy-names — 7ca9b197
- [x] Task 2: legacy-rewrite, managed-block dual markers, migration 0014 — 120812b6 (RED), 883b1a46 (GREEN)
- [x] Task 3: Global template v4 and diff-then-confirm for outside text — 088569df (RED), (this commit) (GREEN)
- [ ] Deviation (Rule 2): 0014 keeps the legacy planning directory name while the project still uses it — next step: add test 9d to migrations/0014-claude-md-rebrand.legacy.test.cjs (a project with only the legacy planning dir: markers, product, slash and CLI rewritten, the block's planning-dir path kept; after the dir is moved, 0014 applies again and rewrites it), see it fail, then add `{ planningDir }` to rewriteLegacyNames/hasLegacyNames and pass `!compat.isLegacyPlanning(root)` from 0014
