---
objective: 70-cli-defects-and-hook-shape
job: "02"
subsystem: hooks
tags: [hooks, SubagentStop, verify-commits, hook-output-schema, coexistence, TOOL-08]
requires:
  - phase: 63-todo-store-hook-coexistence-and-built-in-inventory
    provides: hook-runner.js model, hook-coexistence.test.js contract, the 63-05 finding
provides:
  - "stopFamilyProblems(event, json): cited model of the Stop/SubagentStop output schema"
  - "verify-commits.js blocks with top-level {decision, reason}, scoped to devflow:executor"
affects: [70-03 dogfood-and-docs, any hook that prints Stop-family JSON]
tech-stack:
  added: []
  patterns: [cited-schema validator in __fixtures__, shape-pinning subprocess test]
key-files:
  created:
    - plugins/devflow/hooks/__fixtures__/hook-output-schema.js
  modified:
    - plugins/devflow/hooks/verify-commits.js
    - plugins/devflow/hooks/verify-commits.test.js
    - plugins/devflow/hooks/hook-coexistence.test.js
    - plugins/devflow/hooks/gate-executor-stop.js
    - docs/built-in-integration-status.md
key-decisions:
  - "The block is scoped to agent_type devflow:executor (the constant gate-executor-stop.js uses); every other agent type returns before the marker is written"
  - "The validator pins Claude Code's documented schema, not a house style: reason without decision is legal, and nothing beyond hookEventName and additionalContext is allowed inside hookSpecificOutput"
patterns-established:
  - "A hook's output shape is pinned by validating its real stdout against a cited model, and the coexistence contract runs the same model over every Stop and SubagentStop hook"
requirements-completed: [TOOL-08]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 6min
completed: 2026-10-08
tokens_input: 5750570
tokens_output: 32020
tokens_cache_read: 5598128
tokens_cache_write: 152344
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 70 TRD 02: verify-commits.js speaks the SubagentStop output schema Summary

verify-commits.js now blocks an executor's first stop with a top-level `{decision, reason}` (the documented SubagentStop decision control) instead of the nested `hookSpecificOutput` form that never took effect, scoped to `devflow:executor`, and a cited schema model pins the shape in both its own tests and the cross-hook coexistence contract.

## Progress
- [x] Task 1: Cited SubagentStop schema model, a shape-pinning test, and a top-level block scoped to the executor — RED d0da9584, GREEN 597d3f95
- [x] Task 2: The cross-hook contract uses the validator; the 63-05 finding and its doc trail are closed — 28128a30

## Accomplishments

- `hooks/__fixtures__/hook-output-schema.js` exports `stopFamilyProblems(event, json)`, `STOP_FAMILY_EVENTS`, `UNIVERSAL_FIELDS` and `STOP_FIELDS`. Each rule carries the sentence it implements from https://code.claude.com/docs/en/hooks (checked 2026-10-08). It rejects the pre-70 nested shape (`hookSpecificOutput.decision`, `hookSpecificOutput.reason`), a `block` without a non-empty `reason`, a `decision` other than `block`, a wrong `hookEventName`, unknown keys and mistyped universal fields. It accepts `{}`, `{systemMessage}` and `{hookSpecificOutput:{hookEventName,additionalContext}}`, and throws for any event outside Stop and SubagentStop.
- `verify-commits.js` prints `{decision:'block', reason}` (reason text unchanged, hoisted to `BLOCK_REASON`) and returns before writing a marker unless `payload.agent_type === EXECUTOR_AGENT_TYPE` (`'devflow:executor'`, exported). The retry-once logic, marker store, stale sweep, 10-minute window and non-autonomous stderr warning are untouched. The header comment now explains the top-level shape and the executor scope.
- `verify-commits.test.js`: nine existing tests that reach the autonomous path now send `agent_type: 'devflow:executor'` (Test 2 included, so its "no block" comes from the marker). New: Shape 1 (exact keys `['decision','reason']`, `stopFamilyProblems` deep-equals `[]`, marker exists), Shape 2 (Explore), Shape 3 (planner, empty, missing), Shape 4 (yolo stderr warning unchanged for a non-executor), and Schema 5-12 (validator sensitivity, plus the exported constant).
- `hook-coexistence.test.js`: `verify-commits.js@SubagentStop` is now `expect: 'block'`, and `contractProblems` runs `stopFamilyProblems` for Stop and SubagentStop JSON. All six Stop-family hooks (auto-continue, verify-completion, gh-flush, todo-sync, gate-executor-stop, verify-commits) pass it.
- Doc trail closed: the `gate-executor-stop.js` header comment (comment lines only) and the `docs/built-in-integration-status.md` `SubagentStop` row and cleanup bullet.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: schema model, shape test, top-level scoped block | `node --test plugins/devflow/hooks/verify-commits.test.js` | 0 (30 pass, 0 fail) | PASS |
| 2: contract uses the validator, doc trail closed | `node --test plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs` | 0 (392 pass, 0 fail) | PASS |

Task 1 done-criteria also checked: `rg -n "hookSpecificOutput" plugins/devflow/hooks/verify-commits.js` finds only the header comment's history note, and `stopFamilyProblems('SubagentStop', <pre-70 nested block>)` printed `['hookSpecificOutput.decision is not a SubagentStop field', 'hookSpecificOutput.reason is not a SubagentStop field']`. Task 2 done-criteria: no `expect: 'output'` and no `63-05 finding, open` remain; the `gate-executor-stop.js` diff is 2 insertions and 2 deletions, all comment lines.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/verify-commits.test.js` | 1 (9 fail: Test 1, 3, 8, 6b, 7 shape reads, Shape 1-3, Schema 12; the validator tests Schema 5-11 passed) | FAIL (correct) |
| GREEN | `node --test plugins/devflow/hooks/verify-commits.test.js` | 0 (30 pass) | PASS (correct) |
| REFACTOR | not needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` | 0 | PASS |
| test (full suite) | `npm test` | 1 (11418 tests, 11358 pass, 10 fail, 50 skipped) | PASS for this TRD: no failure is in a file this TRD touches; see below |

The 10 failures in the full run, none caused by this TRD's changes:
- 9 are `devflow-watch.test.cjs` (3) and `handoff-e2e.test.cjs` (6). The watch daemon exits 3 in `session.spawn()` because `lib/watcher-shell.cjs` requires `node-pty`, and this worktree has no `node_modules`. The same `devflow-watch.test.cjs` passes 22/22 in the main checkout (which has `node_modules`) and fails 4/22 in the worktree. They are environmental to the worktree, not regressions.
- 1 is `roadmap-reconcile.test.cjs` E2E1 (self-test): the repo's ROADMAP still showed `70-02` unticked while this TRD's SUMMARY existed. It is closed by `roadmap update-job-progress`, run after the task commits.

## Deviations from Plan

None - TRD executed exactly as written.

Two small additions inside the plan's intent: the RED set also carries a non-autonomous test (Shape 4, the stderr warning is unchanged for a non-executor agent) and a constant test (Schema 12, `EXECUTOR_AGENT_TYPE === 'devflow:executor'`), both from the TRD's "do not change" list and the `files_modified` export contract.

## Issues Encountered

None in the code. The full suite cannot be a clean baseline from a worktree without `node_modules`; see the gate table.

## Discovered commands

None: the `test` command came from the stack profile (`npm test`, scoped `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (top-level `{decision, reason}` with no `hookSpecificOutput`; `stopFamilyProblems` returns `[]` for it; the validator rejects the nested shape, a reasonless block, a non-`block` decision, a wrong `hookEventName` and an unknown key, and accepts `{}`, `{systemMessage}` and `{hookSpecificOutput:{hookEventName,additionalContext}}`; Explore, planner, empty and missing `agent_type` never block and write no marker; the retry-once marker behaviour and `.planning/` dotfile checks are unchanged and pass; the coexistence entry is `expect: 'block'` and its contract runs the validator)
- Gate failures: none attributable to this TRD (9 worktree-environment failures needing `node-pty`, 1 ROADMAP drift closed by the roadmap update)
- The installed plugin keeps the old hook until a release re-syncs it, so a live SubagentStop cannot be observed from here; 70-03 records that as a post-release check.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/__fixtures__/hook-output-schema.js
- FOUND: plugins/devflow/hooks/verify-commits.js
- FOUND: plugins/devflow/hooks/verify-commits.test.js
- FOUND: d0da9584, 597d3f95, 28128a30 (git log)
