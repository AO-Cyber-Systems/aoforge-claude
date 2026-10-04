---
objective: 54-codeql-cleanup
trd: "02"
---

# Objective 54 TRD 02: Single-site CodeQL fixes Summary

## Progress
- [x] Task 1 (RED): failing tests for HTML comment terminators in stack notes — (this commit)
- [ ] Task 1 (GREEN): noteLine neutralises every HTML comment terminator — next step: in plugins/devflow/devflow/bin/lib/stack-profile.cjs noteLine (line ~903) replace `.replace(/-->/g, '-- >')` with `.replace(/(--!?)>/g, '$1 >')`, update the comment, run `node --test` on stack-profile.test.cjs and stack-drafter-e2e.test.cjs
- [ ] Task 2: config-set refuses __proto__, constructor and prototype segments
- [ ] Task 3: document the intended prompt_match regex in handoff.cjs
