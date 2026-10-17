---
objective: 79-reconcile-and-release-3-1-0
trd: "07"
subsystem: docs
tags: [CLAUDE.md, context-budget, AOF-TOOLS-REFERENCE, HOOKS-REFERENCE, USER-GUIDE, migration-guide, rename]
requires:
  - 79-01 (merged integrate/3.1.0 tree; triage rows 1 and 2 routed here)
  - 79-02..79-05 (wave 2: reconcile guard, pre-bash equivalence, worktree resolver, objective 75 records)
provides:
  - "CLAUDE.md on main's slim structure within the 200-line / 20,000-character budget, carrying the 3.1 facts"
  - "docs/AOF-TOOLS-REFERENCE.md and docs/HOOKS-REFERENCE.md holding the detail CLAUDE.md dropped, on 3.1 facts"
affects: [79-08]
tech-stack:
  added: []
  patterns: ["one line per family in CLAUDE.md, the detail in the reference doc it links"]
key-files:
  created: []
  modified:
    - CLAUDE.md
    - docs/AOF-TOOLS-REFERENCE.md
    - docs/HOOKS-REFERENCE.md
key-decisions: []
requirements-completed: []
metrics:
  duration: TBD
  started: 2026-10-17T03:37:52Z
  completed: TBD
  tasks: 2
  files: TBD
---

# Objective 79 TRD 07: CLAUDE.md within main's context budget, and the guides on 3.1 facts Summary

## Progress
- [x] Task 1: CLAUDE.md on main's structure, within budget, carrying the 3.1 facts — (this commit)
- [ ] Task 2: USER-GUIDE, the migration guide and site pages on 3.1 facts — next step: run the TRD's sweep (`rg -n -e "for one release" -e "only 0012" ... docs/USER-GUIDE.md docs/MIGRATING-TO-AOFORGE.md site/content/docs`), rewrite each present-tense shim claim to the 78-12 decision, then compare the migration guide body with its site mirror by node script and run `validate docs --raw`
