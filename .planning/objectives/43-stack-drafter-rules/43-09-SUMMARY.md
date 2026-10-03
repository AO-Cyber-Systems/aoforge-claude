# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — (this commit)
- [ ] Task 2: captured and snapshot drift checks; body-key check suffix — next step: add K27 (isDriftCheck raw-text shapes) to plugins/devflow/devflow/bin/lib/stack-classify.test.cjs and E22 (check-suffixed writer bodies, captured-diff check after a name-only writer prerequisite) to stack-evidence.test.cjs, then widen isDriftCheck and run driftCheckOf before classifyTarget's empty-body return
- [ ] Task 3: workflow env substitution; version probes
