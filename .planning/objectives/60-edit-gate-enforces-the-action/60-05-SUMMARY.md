# Objective 60 TRD 05: Replay false positives Summary (in progress)

## Progress
- [x] Task 1: Hand-built replay fixtures — 05d19a7d
- [ ] Task 2: The replay in session-audit (RED committed in this commit: tests 1-11 in session-audit.test.cjs) — next step: add trackBashGate, newHistoryTracker, summarizeBashGate, findPlanningRoot to session-audit.cjs, the devflow-bash-edit-gate RULE and DEVFLOW_OWNED entry, and read .meta.json in analyze()
- [ ] Task 3: session-audit --raw and JSON carry bash_edit_gate — next step: update audit-cli.test.cjs test 10 and C-3, add the JSON key-order test, then add the line to formatSessionAuditRaw
