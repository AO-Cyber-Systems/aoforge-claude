---
objective: 54-codeql-cleanup
trd: "02"
---

# Objective 54 TRD 02: Single-site CodeQL fixes Summary

## Progress
- [x] Task 1 (RED): failing tests for HTML comment terminators in stack notes — f635ebcd
- [x] Task 1 (GREEN): noteLine neutralises every HTML comment terminator — (this commit)
- [ ] Task 2 (RED): failing tests for config-set prototype-pollution guard — next step: add `runConfigSet` helper and `describe('config-set reserved key segments (54-E)')` with test-list items 5-10 to plugins/devflow/devflow/bin/lib/config.test.cjs, confirm 5-8 fail, commit `test(54-02): ...`
- [ ] Task 2 (GREEN): config-set refuses __proto__, constructor and prototype segments
- [ ] Task 3: document the intended prompt_match regex in handoff.cjs
