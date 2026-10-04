---
objective: 54-codeql-cleanup
trd: "08"
---

# Objective 54 TRD 08: Markdown table cells (in progress)

## Progress
- [x] Task 1: adopt.cjs escapes every table cell once at render (alerts 130-133) — RED 9e956d1a, GREEN b559274d
- [x] Task 2 RED: failing test for backslash-pipe in STACK-REPORT cells — (this commit)
- [ ] Task 2 GREEN: stack-report cell escapes via mdCell (alert 135) — next step: in plugins/devflow/devflow/bin/lib/stack-report.cjs replace `cell` (line 1102) with the placeholder plus mdCell form and add the `require('./text-escape.cjs')` import next to the other top-of-file requires, then run stack-report.test.cjs and adopt-report.test.cjs
