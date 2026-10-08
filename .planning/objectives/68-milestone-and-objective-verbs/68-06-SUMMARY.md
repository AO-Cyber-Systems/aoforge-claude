---
objective: 68-milestone-and-objective-verbs
trd: "06"
subsystem: planning-verbs
tags: [milestone, dry-run, store-mode, heading-rule]
requires:
  - 68-01 (text-escape.milestoneHeadingPattern, local milestone complete dry run)
  - 68-03 (unknown-flag guard accepts --dry-run on milestone complete)
provides:
  - "store-mode `milestone complete --dry-run`: previews the GitHub milestone close and the archives it would publish with zero gh calls"
  - "`milestone put` finds a version's MILESTONES.md entry with the shared heading rule"
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
---

# Objective 68 TRD 06: Store-mode `milestone complete --dry-run` and one MILESTONES.md heading rule Summary

Work in progress.

## Progress
- [x] Task 1: Store-mode dry run of milestone complete — 3a038783
- [x] Task 2: milestone put uses the shared heading rule — (this commit)
