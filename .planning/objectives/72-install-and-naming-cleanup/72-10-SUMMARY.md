---
objective: 72-install-and-naming-cleanup
trd: "10"
subsystem: hooks
tags: [aoforge-rename, coexistence, legacy-agent-types, transcript-readers]
---

# Objective 72 TRD 10: AOForge beside the old plugin, and old identities still recognised Summary

## Progress
- [x] Task 1: Fixture builder: fake homes with plugin installs — 7f5c52b7
- [x] Task 2: Coexistence detection and the SessionStart guard — 35e2a155 (RED), (this commit) (GREEN)
- [ ] Task 3: Old agent types in the gates, old names in the transcript readers — next step: run `node --test plugins/aoforge/hooks/agent-types.legacy.test.js plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs` (RED; tests 10-16 are written, untracked), commit RED, then compat.isOwnExecutor + gate-edits/verify-commits/gate-executor-stop/agent-overhead/session-audit.
