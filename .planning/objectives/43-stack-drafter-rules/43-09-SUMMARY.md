# Objective 43 TRD 09: Evidence-shape fixes from real repos (Make comments, drift checks, CI env, version probes) Summary

## Progress
- [x] Task 1 RED: realshape scaffold (3 shapes) and the four KNOWN_DRIFT rows removed — 633bbd2c
- [x] Task 1 GREEN: Makefile help comments never start an inline recipe — 3a5dee4b
- [x] Task 2 RED: K27 (isDriftCheck raw shapes, driftCheckAt) and E22 (check suffix on writer bodies, captured and snapshot checks) — a625034b
- [x] Task 2 GREEN: captured and snapshot drift checks are the check form; body-key check suffix — (this commit)
- [ ] Task 3: workflow env substitution; version probes — next step: add RED tests for workflow/job/step `env:` substitution (step > job > workflow, `${{ }}` and in-step assignments untouched, quoted word unquoted) to plugins/devflow/devflow/bin/lib/stack-ci.test.cjs and K28 version probes (`kubeconform -v`, `helm version`, `golangci-lint --version`, `go version` null; `kubeconform -strict … f.yaml` lint_helm) to stack-classify.test.cjs
