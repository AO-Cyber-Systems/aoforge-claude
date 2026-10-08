---
objective: 72-install-and-naming-cleanup
trd: "04"
subsystem: tooling
tags: [aoforge-rename, rename-guard, compat, git-mv]
---

# Objective 72 TRD 04: Apply the names rename Summary

## Progress
- [x] Task 1: The rename guard, RED against today's tree — (this commit)
- [ ] Task 2: Run the names codemod, fix manifests and residuals — next step: confirm a clean tree, run `node scripts/aoforge-rename.cjs --rules names --write --report <scratchpad>/names-report.json`, then fix package.json/marketplace/plugin.json, `.gitignore` legacy lines and the monorepo-doctor skip list
- [ ] Task 3: Entry points alias legacy env; CLAUDE.md transition note
