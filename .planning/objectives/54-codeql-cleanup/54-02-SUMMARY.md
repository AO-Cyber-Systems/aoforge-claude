---
objective: 54-codeql-cleanup
trd: "02"
---

# Objective 54 TRD 02: Single-site CodeQL fixes Summary

## Progress
- [x] Task 1 (RED): failing tests for HTML comment terminators in stack notes — f635ebcd
- [x] Task 1 (GREEN): noteLine neutralises every HTML comment terminator — 6c9efc67
- [x] Task 2 (RED): failing tests for config-set prototype-pollution guard — (this commit)
- [ ] Task 2 (GREEN): config-set refuses __proto__, constructor and prototype segments — next step: in plugins/devflow/devflow/bin/lib/config.cjs cmdConfigSet add RESERVED_KEY_SEGMENTS + the guard right after the usage check (before reading config.json), move hasOwn above cmdConfigSet, make the walk own-property based, run `node --test plugins/devflow/devflow/bin/lib/config.test.cjs`
- [ ] Task 3: document the intended prompt_match regex in handoff.cjs
