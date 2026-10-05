---
objective: 56-objective-number-correctness
trd: "01"
---

# Objective 56 TRD 01: One regex escape, guarded in CI Summary

## Progress
- [x] Task 1: Hand-built planted fixtures + the regex-escape repo guard (RED) — 8b78d6bc
- [x] Task 2: Delete the five module-level escapeRe lambdas — (this commit)
- [ ] Task 3: Inline escapes and unescaped interpolations to GREEN — next step: commit the RED tests already written (state.test.cjs 56-01 #6, stack-ci.test.cjs C17, watcher-daemon.test.cjs TP-11, hooks/gate-executor-stop.test.js 56-01 #10), then in state.cjs require escapeRegExp and swap lines 106/129/200/241/276 plus wrap fieldName at :100 and :607; watcher-daemon.cjs:187; hooks/gate-executor-stop.js:300 via '../devflow/bin/lib/text-escape.cjs'; stack-ci.cjs:304 expandsAny; planning-import.cjs:111 frontmatterField.
