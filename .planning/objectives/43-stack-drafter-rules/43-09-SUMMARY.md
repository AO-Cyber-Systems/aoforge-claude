# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — 3a5dee4b
- [x] Task 2 RED: K27 (isDriftCheck raw shapes, driftCheckAt) and E22 (check suffix on writer bodies, captured and snapshot checks) — (this commit)
- [ ] Task 2 GREEN: captured and snapshot drift checks; body-key check suffix — next step: add driftCheckAt (raw text, `$$` or `$`) to plugins/devflow/devflow/bin/lib/stack-classify.cjs and have isDriftCheck use it for strings; in stack-evidence.cjs pass the raw body to driftCheckOf so it runs before classifyTarget's empty-body return, and apply hintForm to a body-classified writer under a check-suffixed name
- [ ] Task 3: workflow env substitution; version probes
