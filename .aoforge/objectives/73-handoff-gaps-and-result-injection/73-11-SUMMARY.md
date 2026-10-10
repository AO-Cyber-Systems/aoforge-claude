---
objective: 73-handoff-gaps-and-result-injection
trd: "11"
subsystem: compat
tags: [compat, user-files, runtime-home, watcher-allowlist, gap-closure, G5]
---

# Objective 73 TRD 11: User files resolve from the runtime home Summary

## Progress
- [x] Task 1: RED, the resolver order and the watch directory — (this commit)
- [ ] Task 2: GREEN, resolveUserFile, watchStateDir and the comments that named ~/.aoforge — next step: add watchStateDir and resolveUserFile after runtimeHome in plugins/aoforge/aoforge/bin/lib/compat.cjs, make userDotFile a thin wrapper, export both, update the header and the comments in watcher-allowlist.cjs, config.cjs 94-101 and init.cjs 681, then run the Task 2 verify command and npm test
