# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — 3a5dee4b
- [x] Task 2 RED: K27 (isDriftCheck raw shapes, driftCheckAt) and E22 (check suffix on writer bodies, captured and snapshot checks) — a625034b
- [x] Task 2 GREEN: captured and snapshot drift checks are the check form; body-key check suffix — cddc1cc3
- [x] Task 3 RED: C14 env substitution, K28 version probes, contract test re-baselined for `envSubstituted` — 8163ec76
- [x] Task 3 GREEN: workflow env literals substituted; version probes are not gates — (this commit)
- [ ] Final: SUMMARY via `summary post`, STATE and ROADMAP — next step: run `roadmap update-job-progress 43`, then `npm test`, then write the full SUMMARY with Self-Check and post it
