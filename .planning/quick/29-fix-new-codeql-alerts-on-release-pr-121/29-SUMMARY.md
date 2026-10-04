# Quick 29: fix the 8 new CodeQL alerts on release PR #121 (in progress)

## Progress
- [x] Task 1: Remove the exponential backtracking in GIT_DIFF and TRAILING_CONNECTIVE (alerts 138, 139) — (this commit)
- [ ] Task 2: Rename the gh-wiki rule method and escape backslash in table cells (alerts 143, 144, 145) — next step: add RED tests for planText (0011 migration) and stayLocalTable (planning-verbs-cli, export it) in their test files, then rename PAGE_TABLE `match` to `toPage` in gh-wiki.cjs
- [ ] Task 3: Replace regex-built test assertions with substring checks, CHANGELOG bullet, full suite (alerts 140, 141, 142)
