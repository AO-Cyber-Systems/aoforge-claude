# Objective 54 TRD 03: Workflow token permissions and two test leftovers Summary

Checkpoint, not complete. The final SUMMARY replaces this file.

## Progress
- [x] Task 1: Least-privilege permissions for the two workflows, guarded by a repo test (alerts 125, 137) — RED 3cd2d788; GREEN (this commit)
- [ ] Task 2: Fix the PJ-6 identity replace by intent and the doctor e2e regex (alerts 124, 134) — next step: add a `status: 'error'` branch to `buildTestCase` in scripts/ci-unit-gate.test.cjs (next to the `skip` branch) and rebuild PJ-6 from `buildJunit([{ name: 'E', file: 'plugins/devflow/e.test.cjs', status: 'error' }])`, then replace the regex at doctor.e2e.test.cjs:273 with `includes`
