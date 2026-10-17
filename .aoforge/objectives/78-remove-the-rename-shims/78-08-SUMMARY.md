---
objective: 78-remove-the-rename-shims
trd: "08"
subsystem: managed-block
status: checkpoint
---

# Objective 78 TRD 08: CLAUDE.md managed blocks under the AOFORGE markers only Summary

## Progress
- [x] Task 1: Fixtures and RED tests — 26d2d22c
- [x] Task 2: GREEN — managed-block one tag + refusal; 0014 deleted; 0005/0007 skip — 71f6d744
- [x] Task 3: GREEN — global upgrade: no pre-rename move, no outside rewrite, one notice — (this commit)

Next step: run the full suite (npm test globs minus watcher-shell.test.cjs) with the node_modules symlink, compare failures with the wave base 5eb8c38e, then finish this SUMMARY, stamp tokens and post it.
