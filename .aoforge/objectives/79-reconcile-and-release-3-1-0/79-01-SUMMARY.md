---
objective: 79-reconcile-and-release-3-1-0
trd: "01"
subsystem: release-integration
tags: [merge, reconcile, 3.1.0]
---

# Objective 79 TRD 01: Merge and resolve Summary

## Progress
- [x] Task 1: Start the merge and resolve the nine code, manifest and data conflicts — afbe19a4 (staged into the merge commit)
- [x] Task 2: Resolve the six docs/planning conflicts, move main's planning records, commit the merge — afbe19a4
- [x] Task 3A: pre-bash drops the env alias objective 78 removed — ef2dae22
- [x] Task 3B: legacy ignore lines, their rename-guard ALLOW entry and awareness G2's twin removed; machine leftovers excluded locally — (this commit)
- [ ] Task 3C-D: smoke and full-suite triage — next step: run `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load` and `validate health --raw`, then build the triage file list in /private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/S.HaY4Ib and run the suite in the background with watcher-shell.test.cjs excluded
