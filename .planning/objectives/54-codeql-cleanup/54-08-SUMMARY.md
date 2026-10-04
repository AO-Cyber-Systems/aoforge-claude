---
objective: 54-codeql-cleanup
trd: "08"
---

# Objective 54 TRD 08: Markdown table cells (in progress)

## Progress
- [x] Task 1 RED: failing tests for pipes and backslashes in ADOPT-REPORT tables — (this commit)
- [ ] Task 1 GREEN: adopt.cjs escapes every table cell once at render — next step: in plugins/devflow/devflow/bin/lib/adopt.cjs import mdCell from ./text-escape.cjs, apply it to every data cell in renderNeedsReviewTable and renderHighTable, change the high table delimiter to |---|---|---|, and delete the four `.replace(/\|/g, '\\|')` calls near lines 979, 981, 1024, 1025
- [ ] Task 2: stack-report cell escapes via mdCell (alert 135)
