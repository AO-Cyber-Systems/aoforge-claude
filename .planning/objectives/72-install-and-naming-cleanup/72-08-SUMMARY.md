---
objective: 72-install-and-naming-cleanup
trd: "08"
---

# Objective 72 TRD 08: Planning-dir and config-key migrations Summary

## Progress
- [x] Task 1: Fixture builder: legacy git projects in each state — b6ae4d34
- [ ] Task 2: Migration 0012 and the 0010 block's legacy markers — RED (this commit); next step: write `migrations/0012-planning-dir-move.cjs` and `lib/git-busy.cjs`, teach 0010 `readBlock` both slugs, run the 0012 + 0010 suites (GREEN), commit
- [ ] Task 3: 0013, the runner, the hook, W067
