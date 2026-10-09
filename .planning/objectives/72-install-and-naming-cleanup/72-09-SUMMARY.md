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
- [ ] Task 3: Global template v4 and diff-then-confirm for outside text — RED (this commit); next step: GREEN: template_version "4", ROUTING_RE from NAMES/LEGACY product, planOutside + `outside` result + KEYS.outside notice in global-upgrade.cjs, outside_diff + prose diff in upgrade-cli.cjs, unpin v=3 in global-upgrade.test/upgrade-cli.test/sync-runtime.test and copy legacy-rewrite.cjs there
