---
objective: 54-codeql-cleanup
trd: "01"
subsystem: tooling
status: in-progress
---

# Objective 54 TRD 01: Shared text-escape module Summary (checkpoint)

## Progress
- [x] Task 1: Create lib/text-escape.cjs with escapeRegExp, objectiveNumPattern and mdCell — RED 86c32ae0, GREEN (this commit)
- [ ] Task 2: Replace the duplicate escape helpers with imports from text-escape.cjs — next step: in roadmap-progress.cjs (lines ~18-28) delete the local escapeRegExp and add `const { escapeRegExp } = require('./text-escape.cjs');`, then repeat for gh-wiki.cjs, watcher-shell.cjs, migrations/0011-github-store-backfill.cjs and planning-verbs-cli.cjs, running each module's existing test after its edit
