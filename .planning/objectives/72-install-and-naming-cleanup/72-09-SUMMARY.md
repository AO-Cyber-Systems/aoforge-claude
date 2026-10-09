---
objective: 72-install-and-naming-cleanup
trd: "09"
subsystem: upgrade
tags: [aoforge-rename, claude-md, managed-block, migrations, global-upgrade, shims]
---

# Objective 72 TRD 09: CLAUDE.md blocks: old markers recognised, project blocks migrated, the global file changed only with approval Summary

## Progress
- [x] Task 1: Fixture builder: legacy CLAUDE.md shapes; PRESERVE in legacy-names — 7ca9b197
- [ ] Task 2: legacy-rewrite, managed-block dual markers, migration 0014 — RED (this commit); next step: GREEN — write bin/lib/legacy-rewrite.cjs (mask PRESERVE, pairs longest first, unifiedDiff/diffLines), dual-tag regexes plus `tag` and legacy-tag isStale in managed-block.cjs, migrations/0014-claude-md-rebrand.cjs; run the five suites in the TRD verify line
- [ ] Task 3: Global template v4 and diff-then-confirm for outside text
