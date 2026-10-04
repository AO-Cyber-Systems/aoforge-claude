# Quick 29: fix the 8 new CodeQL alerts on release PR #121 (in progress)

## Progress
- [x] Task 1: Remove the exponential backtracking in GIT_DIFF and TRAILING_CONNECTIVE (alerts 138, 139) — 1099ba85
- [x] Task 2: Rename the gh-wiki rule method and escape backslash in table cells (alerts 143, 144, 145) — (this commit)
- [ ] Task 3: Replace regex-built test assertions with substring checks, CHANGELOG bullet, full suite (alerts 140, 141, 142) — next step: in frontmatter.test.cjs lines ~482/484 and gh-setup.test.cjs line ~723 swap the `new RegExp(...replace(/[.]/g...))` matches for `.includes`, add the `### Fixed` bullet before `### Deprecated` in `## [2.13.0]` of CHANGELOG.md, then run `npm test`
