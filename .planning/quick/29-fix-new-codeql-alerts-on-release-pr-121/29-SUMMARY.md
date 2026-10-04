# Quick 29: fix the 8 new CodeQL alerts on release PR #121 (in progress)

## Progress
- [x] Task 1: Remove the exponential backtracking in GIT_DIFF and TRAILING_CONNECTIVE (alerts 138, 139) — 1099ba85
- [x] Task 2: Rename the gh-wiki rule method and escape backslash in table cells (alerts 143, 144, 145) — 70a22d24
- [x] Task 3: Replace regex-built test assertions with substring checks, CHANGELOG bullet, full suite (alerts 140, 141, 142) — (this commit)
