---
objective: 72-install-and-naming-cleanup
trd: "10"
subsystem: hooks
tags: [aoforge-rename, coexistence, legacy-agent-types, transcript-readers]
---

# Objective 72 TRD 10: AOForge beside the old plugin, and old identities still recognised Summary

## Progress
- [x] Task 1: Fixture builder: fake homes with plugin installs — (this commit)
- [ ] Task 2: Coexistence detection and the SessionStart guard — next step: run `node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs plugins/aoforge/hooks/coexistence-guard.legacy.test.js` (RED, tests 1-9 already written), commit RED, then write bin/lib/coexistence.cjs and hooks/coexistence-guard.js.
- [ ] Task 3: Old agent types in the gates, old names in the transcript readers
