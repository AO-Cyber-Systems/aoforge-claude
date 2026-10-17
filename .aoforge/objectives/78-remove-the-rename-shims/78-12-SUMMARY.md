---
objective: 78-remove-the-rename-shims
trd: "12"
status: checkpoint
---

# Objective 78 TRD 12: Close-out Summary

## Progress
- [x] Task 1: RED + GREEN — last shim, name map, SC-4 end to end — RED 25dcd014, GREEN b26635e5
- [x] Refactor: the stale "or a legacy one" planning-directory comments and the 0012/0014-user comments handed over by 78-07/78-08/78-11 — 8d9b81ac
- [x] Task 2: Docs — guide (+ site mirror), USER-GUIDE, CHANGELOG, CLAUDE.md, doctor-checks README, gen-docs-data — (this commit)
- [ ] Task 3: Full suite and the decisions roll-up — next step: run the full suite (git ls-files of the npm test globs minus watcher-shell.test.cjs through node --test, in the background, 10-minute budget), record the counts, then write the objective-wide decisions table into this draft
