---
objective: 54-codeql-cleanup
trd: "02"
---

# Objective 54 TRD 02: Single-site CodeQL fixes Summary

## Progress
- [x] Task 1 (RED): failing tests for HTML comment terminators in stack notes — f635ebcd
- [x] Task 1 (GREEN): noteLine neutralises every HTML comment terminator — 6c9efc67
- [x] Task 2 (RED): failing tests for config-set prototype-pollution guard — e56b6a29
- [x] Task 2 (GREEN): config-set refuses __proto__, constructor and prototype segments — (this commit)
- [ ] Task 3: document the intended prompt_match regex in handoff.cjs — next step: in plugins/devflow/devflow/bin/lib/handoff.cjs replace the one-line comment above `new RegExp(s.prompt_match)` (line ~49) with the 5-line block from the TRD, run `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs`, confirm `git diff --stat` shows comment lines only
