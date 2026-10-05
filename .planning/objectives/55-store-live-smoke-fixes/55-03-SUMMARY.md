# Objective 55 TRD 03: Unpushed-commit guard Summary

(in progress)

## Progress
- [x] Task 1: objective-branch.unpushedCommits through the git seam — 5e19c4ae (RED), bd12bf98 (GREEN)
- [ ] Task 2: gh pr merge refuses an unpushed linked branch — (this commit: RED tests 3b-3d), next step: add unpushedRefusal to objective-branch.cjs, re-export from gh-pr.cjs, and guard mergeObjectivePr after the draft check
- [ ] Task 3: verification post refuses before writing when the linked branch is ahead — next step: add tests 4-7 to planning-verbs-pr.test.cjs
