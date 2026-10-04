---
objective: 52-store-mode-polish
trd: "03"
status: in-progress
---

# Objective 52 TRD 03: micro leaves STATE.md alone in store mode (checkpoint)

## Progress
- [ ] Task 1: commitMicro skips the STATE.md row in store mode — RED tests (this commit); next step: GREEN in plugins/devflow/devflow/bin/lib/micro.cjs commitMicro — compute `store = isStoreMode(path.dirname(planningDir))` after the marker check, apply the `no-state-file` check only when `!store`, and after the source commit + hash run endSkill, unlink `.micro-description` and return `{ok, commit_hash, state_commit_hash: null, state_row: 'skipped_store_mode', removed_marker: true}`; then run `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs plugins/devflow/devflow/bin/lib/planning-drift.test.cjs`
- [ ] Task 2: micro prose says the row is local mode only
