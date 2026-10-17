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
- [x] Task 3A: pre-bash drops the env alias objective 78 removed — (this commit)
- [ ] Task 3B-D: retire the legacy ignore lines, smoke, triage the full suite — next step: run `git status --porcelain --ignored` to list what only a legacy .gitignore line matches, append those paths to .git/info/exclude, then remove the `.planning/` and pre-rename lines from .gitignore, the rename-guard `.gitignore` ALLOW entry and awareness G2's legacy twin
