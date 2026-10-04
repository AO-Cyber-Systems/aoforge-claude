---
objective: 54-codeql-cleanup
trd: "01"
subsystem: tooling
status: in-progress
---

# Objective 54 TRD 01: Shared text-escape module Summary (checkpoint)

## Progress
- [ ] Task 1: Create lib/text-escape.cjs with escapeRegExp, objectiveNumPattern and mdCell — next step: create plugins/devflow/devflow/bin/lib/text-escape.cjs (zero requires, module shape from the TRD codebase_examples) so `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs` goes green; RED test commit is in (this commit)
- [ ] Task 2: Replace the duplicate escape helpers with imports from text-escape.cjs
