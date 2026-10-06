---
objective: 60-edit-gate-enforces-the-action
job: "03"
subsystem: hooks
tags: [bash-write-gate, edit-gate, git-tracked, severity]
---

# Objective 60 TRD 03: The Bash write gate decision Summary

## Progress
- [x] Task 1: Hermetic tracked-repo fixture builder — 1bcb9e05
- [ ] Task 2: evaluateBashWrites and target classification (tests 1-4) — RED committed (this commit); next step: create plugins/devflow/devflow/bin/lib/bash-write-gate.cjs with evaluateBashWrites per the TRD gotchas and make bash-write-gate.test.cjs pass
- [ ] Task 3: Severity, strict-vs-warn rule, reason text and live tracked check (tests 5-10) — next step: add tests 5-10 to bash-write-gate.test.cjs, with 9 and 10 on makeTrackedRepo
