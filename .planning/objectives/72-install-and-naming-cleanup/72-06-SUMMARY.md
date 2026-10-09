---
objective: 72-install-and-naming-cleanup
trd: "06"
---

# Objective 72 TRD 06: Hooks and prose speak `.aoforge/` Summary

## Progress
- [x] Task 1: Fixture builder: main checkout plus worktree in each layout — 6afc9662
- [ ] Task 2: Hooks resolve both layouts — RED (this commit); next step: run `node scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/hooks --write`, then fix the 8 residuals (gate-edits regex + storeMode precheck, gate-executor-stop findUp/summaryRelPath/summaryLocation, route-intent message, upgrade-project NOTICES_REL, verify-completion message) and remove the 72-05 legacy pins
- [ ] Task 3: Prose pass and the guard's planning token
