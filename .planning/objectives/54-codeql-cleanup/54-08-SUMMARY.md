---
objective: 54-codeql-cleanup
trd: "08"
---

# Objective 54 TRD 08: Markdown table cells (in progress)

## Progress
- [x] Task 1: adopt.cjs escapes every table cell once at render (alerts 130-133) — RED 9e956d1a, GREEN (this commit)
- [ ] Task 2: stack-report cell escapes via mdCell (alert 135) — next step: in plugins/devflow/devflow/bin/lib/stack-report.test.cjs add a cellsOf helper plus a test where a finding text `a\|b` renders a 5-cell row with Finding cell `a\\\|b` and a guard test for the `—` and `(root)` placeholders, then commit RED before editing stack-report.cjs `cell` (around line 1102)
