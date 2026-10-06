---
objective: 60-edit-gate-enforces-the-action
job: "02"
subsystem: hooks
tags: [bash-write-detector, shell-parsing, edit-gate]
requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "lib/shell-words.cjs and the shared WRITE/MENTION cases (60-01)"
provides:
  - "lib/bash-write-detect.cjs: detectBashWrites, mayWrite, inlineWrites"
affects: [60-03, 60-04, 60-05]
---

# Objective 60 TRD 02: Bash write detector Summary

Checkpoint draft: not complete.

## Progress
- [x] Task 1: Shell forms (redirect, tee, sed -i, perl -i, cp/mv, cd tracking, wrappers, shell recursion, mayWrite) — 08b48c13 (RED), (this commit) (GREEN)
- [ ] Task 2: Inline python and node writes — next step: remove the `todo` on the python/node table rows in bash-write-detect.test.cjs, add tests 11-12, then implement inlineWrites and the interpreter arm in bash-write-detect.cjs
