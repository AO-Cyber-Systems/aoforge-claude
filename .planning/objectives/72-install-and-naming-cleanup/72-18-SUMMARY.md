---
objective: 72-install-and-naming-cleanup
trd: "18"
subsystem: release
tags: [aoforge-rename, release, 3.0.0, changelog, version-sync, rehearsal]
---

# Objective 72 TRD 18: Build and validate the 3.0.0 release artifacts Summary

## Progress
- [x] Task 1: Versions and the CHANGELOG 3.0.0 entry — (this commit)
- [ ] Task 2: Validation without live steps — next step: run the full suite (excluding micro.test.cjs), `claude plugin validate` for each of the 7 plugins and `.`, `gen-pointer-skills --check`, the installed changelog-on-tag dry run, and both `aoforge-rename --inventory` passes, one Bash call each
- [ ] Task 3: Rehearse the user's upgrade on a scratch clone
