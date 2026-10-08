---
objective: 72-install-and-naming-cleanup
job: "03"
subsystem: tooling
tags: [aoforge-rename, codemod]
---

# Objective 72 TRD 03: Rename codemod Summary

**In progress.**

## Progress
- [x] Task 1: Fixture builders: sample files and a scratch repo shaped like this one — fcaf94a0
- [x] Task 2: Pure rules: paths, names, planning, preserves, skips — 6e6df03b (RED e2de11cf)
- [ ] Task 3: CLI (inventory, dry run, write, report) and a clean inventory of this repo — ca5ee0a1 (RED), (this commit) (GREEN CLI); next step: run `node scripts/aoforge-rename.cjs --rules names --inventory` and `--rules planning --inventory` in the worktree root, read each unclassified token's lines, add rules to PRESERVE/NAME_RULES and a pure test per new rule shape until both print unclassified=0
