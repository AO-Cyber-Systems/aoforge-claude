---
objective: 72-install-and-naming-cleanup
trd: "06"
---

# Objective 72 TRD 06: Hooks and prose speak `.aoforge/` Summary

## Progress
- [x] Task 1: Fixture builder: main checkout plus worktree in each layout — 6afc9662
- [x] Task 2: Hooks resolve both layouts — e8ab54ec (RED), e5f40291 (GREEN)
- [ ] Task 3: Prose pass and the guard's planning token — RED (this commit); next step: commit the codemod ignore-region implementation with the prose pass (`node scripts/aoforge-rename.cjs --rules planning --only ... --write`), add `.aoforge/` lines to .gitignore, fix the remaining guard findings (docs/built-in-*.md, five bin tests), run the repo gates and the full suite
