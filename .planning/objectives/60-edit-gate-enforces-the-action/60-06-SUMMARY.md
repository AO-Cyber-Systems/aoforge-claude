---
objective: 60-edit-gate-enforces-the-action
trd: "06"
subsystem: telemetry
tags: [bash-write-gate, session-audit, false-positive-rate, gate-05, evidence]
requirements-completed: [GATE-05]
---

# Objective 60 TRD 06: Measure and set default Summary

## Progress
- [x] Task 1: Replay over the real corpus, triage, detector fixes — (no commit: 633 would-denies triaged, 0 misparses)
- [ ] Task 2: Evidence file, BASH_EDIT_GATE_DEFAULT and the agreement test — next step: RED is written in bash-write-gate.test.cjs describe 11 (fails with ENOENT); write plugins/devflow/devflow/references/bash-edit-gate-evidence.json from the scratchpad's bash-gate-audit-1.json (aggregates only) and set BASH_EDIT_GATE_DEFAULT in bash-write-gate.cjs
