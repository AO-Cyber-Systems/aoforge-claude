# Objective 54 TRD 03: Workflow token permissions and two test leftovers Summary

Checkpoint, not complete. The final SUMMARY replaces this file.

## Progress
- [ ] Task 1: Least-privilege permissions for the two workflows, guarded by a repo test (alerts 125, 137) — RED half committed (this commit: scripts/workflow-permissions.test.cjs); next step: add the top-level `permissions:` / `contents: read` block with its comment to .github/workflows/test.yml (after `concurrency:`) and .github/workflows/agent-shell-harness.yml (after `on:`), then commit as `ci(54-03): ...`
- [ ] Task 2: Fix the PJ-6 identity replace by intent and the doctor e2e regex (alerts 124, 134) — next step: add a `status: 'error'` branch to `buildTestCase` in scripts/ci-unit-gate.test.cjs and rebuild PJ-6 from it
