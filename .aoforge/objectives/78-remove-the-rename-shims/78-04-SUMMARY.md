---
objective: 78-remove-the-rename-shims
trd: "04"
subsystem: rename-shims
tags: [rename, shims, stack-mcp, todo-sync, adopt, migration-0010]
---

# Objective 78 TRD 04: Identities in users' files Summary

## Progress
- [x] Task 1: RED — identities are ignored or reported — (this commit)
- [ ] Task 2: GREEN — stack-mcp ownership, todo key, hook prefilter, 0010 slug — next step: in plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs make OWNED_KEYS the AOForge key only, add and export legacyOwnedEntries(doc) and a `warnings` array on every stackMcp result; then todo-session TODO_META_KEYS, the todo-sync.js prefilter and 0010 START/END_MARKERS; run the Task 2 verify command
- [ ] Task 3: GREEN — adopt forgets the pre-rename branch and marker
