---
objective: 60-edit-gate-enforces-the-action
job: "03"
subsystem: hooks
tags: [bash-write-gate, edit-gate, git-tracked, severity]
---

# Objective 60 TRD 03: The Bash write gate decision Summary

## Progress
- [x] Task 1: Hermetic tracked-repo fixture builder — 1bcb9e05
- [x] Task 2: evaluateBashWrites and target classification (tests 1-4) — 141038c1 (RED), be0a4b47 (GREEN)
- [ ] Task 3: Severity, strict-vs-warn rule, reason text and live tracked check (tests 5-10) — RED committed (this commit); next step: add VALID_BASH_MODES, BASH_EDIT_GATE_DEFAULT, FP_THRESHOLD, recommendDefault, readBashEditGate, effectiveBashMode, bashGateReason, BASH_GATE_CLASSIFIER, realpathDeep and gitTrackedSet to plugins/devflow/devflow/bin/lib/bash-write-gate.cjs and make the test file pass
