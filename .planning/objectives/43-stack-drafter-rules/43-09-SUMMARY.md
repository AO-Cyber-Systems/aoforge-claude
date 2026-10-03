# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — 3a5dee4b
- [x] Task 2 RED: K27 (isDriftCheck raw shapes, driftCheckAt) and E22 (check suffix on writer bodies, captured and snapshot checks) — a625034b
- [x] Task 2 GREEN: captured and snapshot drift checks are the check form; body-key check suffix — cddc1cc3
- [x] Task 3 RED: C14 env substitution, K28 version probes, contract test re-baselined for `envSubstituted` — (this commit)
- [ ] Task 3 GREEN: workflow env substitution; version probes — next step: in plugins/devflow/devflow/bin/lib/stack-ci.cjs collect workflow/job/step `env:` scalars in parseDoc and substitute them into runLines (quote-aware) before normalizeScript, recording `envSubstituted`; in stack-classify.cjs return null from classifyOne for a version probe before classifyArgv
