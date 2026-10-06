# Objective 60 TRD 05: Replay false positives Summary (in progress)

## Progress
- [x] Task 1: Hand-built replay fixtures — (this commit)
- [ ] Task 2: The replay in session-audit — next step: write the `bash_edit_gate replay` describe block in session-audit.test.cjs (tests 1-11), commit RED, then add trackBashGate/newHistoryTracker/summarizeBashGate to session-audit.cjs
- [ ] Task 3: session-audit --raw and JSON carry bash_edit_gate — next step: update audit-cli.test.cjs test 10 and C-3, add the JSON key-order test, then add the line to formatSessionAuditRaw
