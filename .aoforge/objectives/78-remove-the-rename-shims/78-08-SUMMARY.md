---
objective: 78-remove-the-rename-shims
trd: "08"
subsystem: managed-block
status: checkpoint
---

# Objective 78 TRD 08: CLAUDE.md managed blocks under the AOFORGE markers only Summary

## Progress
- [x] Task 1: Fixtures and RED tests — (this commit)
- [ ] Task 2: GREEN — managed-block one tag + refusal; 0014 deleted; 0005/0007 skip — next step: in plugins/aoforge/aoforge/bin/lib/managed-block.cjs drop the pre-rename tag from TAGS, add LEGACY_START_RE and the ELEGACYBLOCK refusal at the top of read (lazy planning-layout.legacyBlockMessage, read(text, { label })), then `git rm` migration 0014 and its test, and make 0005/0007 skip with a W069 reason; verify with `node --test managed-block.legacy.test.cjs`.
- [ ] Task 3: GREEN — global upgrade: no pre-rename move, no outside rewrite, one notice
