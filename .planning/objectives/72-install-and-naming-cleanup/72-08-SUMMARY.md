---
objective: 72-install-and-naming-cleanup
trd: "08"
---

# Objective 72 TRD 08: Planning-dir and config-key migrations Summary

## Progress
- [x] Task 1: Fixture builder: legacy git projects in each state — b6ae4d34
- [x] Task 2: Migration 0012 and the 0010 block's legacy markers — c0a7f0ea (RED), c86531ce (GREEN)
- [ ] Task 3: 0013, the runner, the hook, W067 — RED (this commit); next step: write `migrations/0013-config-key-rename.cjs`, then `upgrade.cjs` (readStamp both keys, changedSoFar, deferred, collapse), the hook (legacy fast path, deferral notice, dir-aware skipReason, HEAD-aware keep) and validate Check 22 W067; run tests 1-13 (GREEN), commit
