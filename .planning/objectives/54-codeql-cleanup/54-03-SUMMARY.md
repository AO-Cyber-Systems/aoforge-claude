---
objective: 54-codeql-cleanup
trd: "03"
subsystem: ci
tags: [github-actions, codeql, least-privilege, node-test]

requires: []
provides:
  - top-level contents-read GITHUB_TOKEN permissions on the unit-suite and agent-shell-harness workflows
  - repo guard that fails when any workflow falls back to the default token grant
  - PJ-6 built through the fixture builder (no identity replace)
  - doctor e2e version note checked with includes, not a regex built from the version
affects: [54-09, 54-10]

tech-stack:
  added: []
  patterns:
    - "text-level workflow guard (no YAML dependency), same style as agent-shell-harness Case C1"

key-files:
  created:
    - scripts/workflow-permissions.test.cjs
  modified:
    - .github/workflows/test.yml
    - .github/workflows/agent-shell-harness.yml
    - scripts/ci-unit-gate.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs

key-decisions:
  - "Both workflows get a top-level `permissions: contents: read`, nothing broader: neither job reads a secret or calls the API"
  - "The guard scans only after the `jobs:` line, because devflow-checks.yml has a 2-space `workflow_call:` key under `on:`"

requirements-completed: ["54-F", "54-H"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 3min
completed: 2026-10-04
---

# Objective 54 TRD 03: Workflow token permissions and two test leftovers Summary

**Unit-suite and agent-shell-harness workflows now run on a read-only `GITHUB_TOKEN` (CodeQL 125, 137), a text-level repo test keeps every workflow from regressing to default permissions, and PJ-6 and the doctor e2e no longer carry an identity replace or a regex built from a version (CodeQL 124, 134).**

## Progress
- [x] Task 1: Least-privilege permissions for the two workflows, guarded by a repo test (alerts 125, 137) — RED 3cd2d788, GREEN 187f893e
- [x] Task 2: Fix the PJ-6 identity replace by intent and the doctor e2e regex (alerts 124, 134) — 7b2e8e4b

## Performance

- Duration: about 3 minutes
- Tasks: 2 of 2, 3 commits (Task 1 is test-first, so two)
- Files: 5 touched (1 created, 4 modified), exactly the TRD's `files_modified`

## Accomplishments

- `scripts/workflow-permissions.test.cjs` (new): for every `.github/workflows/*.y?ml`, requires a column-0 `permissions:` or one in every job, naming the file and job on failure. A second pair of tests pins `test.yml` and `agent-shell-harness.yml` to exactly `permissions:` / `  contents: read` with no `: write` anywhere. The other four workflows (`auto-label-issues`, `devflow-checks`, `docs`, `release`) pass it unedited.
- `test.yml` and `agent-shell-harness.yml`: top-level `permissions: contents: read` with a comment saying why, placed after `concurrency:` and after `on:` respectively, so the `^on:$` / `^jobs:$` / path-filter assertions in Case C1 are unaffected.
- `scripts/ci-unit-gate.test.cjs`: `buildTestCase` gained a `status: 'error'` shape (an `<error type="harness" message="load failed"/>` child). PJ-6 now builds from it, asserts the fixture really carries the child, then keeps the original `parseJunit` + `failures === 1` assertion. Both `.replace` calls are gone. The new fixture output is byte-identical to what the old string surgery produced.
- `doctor.e2e.test.cjs`: the `stamped v<version>` check is a plain `includes` with a failure message that prints the notes.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: guard fails on the two workflows | `node --test scripts/workflow-permissions.test.cjs` | 1 | PASS (expected fail: names test.yml job `test`, agent-shell-harness.yml job `harness`) |
| 1 GREEN: permissions added | `node --test scripts/workflow-permissions.test.cjs plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs` | 0 | PASS (41/41, includes Cases C1 and C2) |
| 1 done check | `rg -n "^permissions:" .github/workflows/test.yml .github/workflows/agent-shell-harness.yml` | 0 | PASS (two lines) |
| 2: PJ-6 and doctor e2e | `node --test scripts/ci-unit-gate.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` | 0 | PASS (96/96, none skipped) |
| 2 done check | `rg -n "\.replace\('<testcase name=\"E\"" scripts/ci-unit-gate.test.cjs` and `rg -n "ENGINE_VERSION\.replace" .../doctor.e2e.test.cjs` | 1 | PASS (no matches, as required) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test scripts/workflow-permissions.test.cjs` | 1 | FAIL (correct) |
| GREEN | `node --test scripts/workflow-permissions.test.cjs plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs` | 0 | PASS (correct) |

Task 2 is tests-only and not TDD (the TRD marks it `type="auto"` without `tdd`).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (full suite) | `npm test` | not run | not_available: the dispatch scopes this TRD to its own files and runs the full suite in 54-09 |
| test (scoped, stack loop) | `node --test {files}` on the five touched files | 0 | PASS (see Task Evidence) |

## Deviations from Plan

None - TRD executed exactly as written.

The TRD's test-list item 2 regex is stricter than the prose in one place, and I followed the stricter reading: the pinned block must be followed by a blank line, a comment, a new column-0 key or EOF, so an extra indented scope under `permissions:` fails the test.

## Auth gates

None.

## Execution notes

- The first `exec-context check` ran with the Bash cwd at the main checkout (the cwd resets between calls) and reported SHARED INDEX against 54-01's claim on `/Users/justin/dev/devflow-claude`. That checkout is not mine to work in. I re-ran the check against the assigned worktree with the global `--cwd` flag and it passed (`checkout` = the 54-03 worktree, HEAD = WAVE_BASE, `base_visible: true`). No claim was released or altered. Worth fixing in the dispatch or the preflight: a worktree-dispatched executor cannot `cd`, so the check should either take the checkout from `--cwd` or the dispatch should say to pass it.
- Every df-tools call used `--cwd <worktree>`; nothing was written to the main checkout (verified by listing its objective directory).

## Discovered commands

None. All commands came from `.planning/STACK.md`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (permissions on both workflows; guard fails on a workflow with neither form; PJ-6 via the fixture builder with no identity replace; doctor e2e without a version-built regex)
- Gate failures: None. The full-suite `npm test` gate was not run here by instruction and is covered by 54-09.
- `git diff --stat 8ff8401a HEAD`: the five `files_modified` plus this SUMMARY.

## Self-Check: PASSED

- FOUND: scripts/workflow-permissions.test.cjs, .github/workflows/test.yml, .github/workflows/agent-shell-harness.yml, scripts/ci-unit-gate.test.cjs, plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs
- FOUND commits: 3cd2d788, 187f893e, 7b2e8e4b
