---
objective: 72-install-and-naming-cleanup
trd: "07"
subsystem: runtime
---

# Objective 72 TRD 07: Runtime home move and rekey Summary

## Progress
- [x] Task 1: Fixture builder: a populated legacy runtime home — a99024be
- [x] Task 2: Runtime state migration and its sync-runtime wiring — RED 4de991ff, GREEN (this commit)
- [ ] Task 3: `aof-tools state rekey` — next step: write state-rekey.test.cjs (tests 12-15, plus a test pinning KEYED_STATE to each store's own path function), run RED, commit; then state-rekey.cjs, export backupsRoot/registryPath from backup-prune.cjs, dispatch in aof-tools.cjs state arm, help.cjs + flag-spec.cjs + flag-guard-fixtures PROBES
