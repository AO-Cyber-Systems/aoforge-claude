---
objective: 72-install-and-naming-cleanup
trd: "04"
subsystem: tooling
tags: [aoforge-rename, rename-guard, compat, git-mv]
---

# Objective 72 TRD 04: Apply the names rename Summary

## Progress
- [x] Task 1: The rename guard, RED against today's tree — bb8f1c40
- [x] Task 2: Run the names codemod, fix manifests and residuals — (this commit)
- [ ] Task 3: Entry points alias legacy env; CLAUDE.md transition note — next step: write `plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs` (tests 7-8), run it RED, commit, then add `require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv();` after the core requires of every registered hook, statusline.js, aof-tools.cjs and aoforge-watch.cjs
