---
objective: 44-autonomy-hardening
trd: "10"
job: 44-10
subsystem: hooks
tags: [gate-commits, subagent-stop, gap-closure, rebase, tdd, fail-open]

requires:
  - objective: 44-autonomy-hardening (44-03)
    provides: "gate-commits gitOpInProgress() + hand-built git-state fixtures (gate-fixtures.js)"
  - objective: 44-autonomy-hardening (44-04)
    provides: "gate-executor-stop.js decide()/candidateRoots()/summaryExists() + subagent-stop-fixtures.js"
provides:
  - "gate-commits gitOpInProgress(): a rebase counts only via rebase-merge/ or rebase-apply/; a bare (stale) REBASE_HEAD no longer bypasses the gate"
  - "gate-executor-stop: trdDirFor(id, roots), summaryRelPath(id, roots), blockReason(id, summaryRel?) — the block reason names .planning/objectives/<dir>/<id>-SUMMARY.md when the TRD file is found"
affects: [44-VERIFICATION (closes the AUT-04 gap), execute-objective executor resume path]

tech-stack:
  added: []
  patterns:
    - "Rebase-in-progress detection mirrors git's own status code: rebase-merge/ and rebase-apply/ dirs, never REBASE_HEAD"
    - "trdDirFor mirrors summaryExists: same roots, same skip-on-unreadable, first root in candidate order wins"

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/gate-commits.js
    - plugins/devflow/hooks/gate-commits.test.js
    - plugins/devflow/hooks/gate-executor-stop.js
    - plugins/devflow/hooks/gate-executor-stop.test.js

key-decisions:
  - "REBASE_HEAD is dropped as a signal entirely rather than required together with a rebase dir: with a rebase dir present it adds nothing, and on its own it is exactly the stale-leftover case"
  - "The SUMMARY path is repo-relative (.planning/objectives/<dir>/<id>-SUMMARY.md) and built from the located TRD dir's basename, so it is right in whichever checkout (main or worktree) the executor writes"
  - "The generic reason text is kept byte-for-byte when no TRD file is found; a test pins the exact string"
  - "Concrete-path wording has its own sentence ('(a path relative to your checkout root), listing the tasks done with hashes and the next concrete step. Commit it, then stop.') to avoid two stacked parentheticals"

patterns-established:
  - "A regression test is named for the field scenario it reproduces (stale REBASE_HEAD, no rebase-merge/, no rebase-apply/)"

requirements-completed: [AUT-04, AUT-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0

metrics:
  duration: 5min
  started: 2026-09-29T15:07:39Z
  completed: 2026-09-29T15:12:25Z
  tasks: 2
  files_modified: 4
---

# Objective 44 TRD 10: gap closure (stale REBASE_HEAD, SUMMARY path in gate reason) Summary

gate-commits now detects a rebase only from `rebase-merge/` or `rebase-apply/`, so a leftover `.git/REBASE_HEAD` no longer silently disables the raw-commit gate. The executor-stop block reason now names the exact repo-relative `.planning/objectives/<dir>/<id>-SUMMARY.md` whenever it can locate the TRD file.

## Progress

- Task 1 RED (300c4b0): gate-commits tests for the stale REBASE_HEAD case written and failing (4 fail / 80 pass, exit 1).
- Task 1 GREEN (0673c95): `gitOpInProgress()` detects a rebase only via `rebase-merge/` or `rebase-apply/`, and the header comment is updated. Gate tests pass 170/170. Live check: the fixed hook DENIES a raw commit in the main checkout, which has a stale REBASE_HEAD.
- Task 2 RED (000a160): `trdDirFor` unit tests, decide() reason tests and an e2e case, all failing (7 fail / 57 pass, exit 1).
- Task 2 GREEN (a879736): added `trdDirFor(id, roots)` and `summaryRelPath()`, and `blockReason(id, summaryRel)` now names `.planning/objectives/<dir>/<id>-SUMMARY.md` when the TRD file is found. Executor-stop and verify-commits tests pass 80/80.
- Full `npm test` run: 5387 tests, 5326 pass, 11 fail, 50 skipped. All 11 failures are expected (see Validation Gate Results).
- Next: none. The TRD is complete. The orchestrator ticks 44-10 in ROADMAP.md.

## Performance

- **Duration:** about 5 minutes (15:07:39Z to 15:12:25Z)
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- **Stale REBASE_HEAD bypass closed (AUT-04 gap).** In `gitOpInProgress()`, `has('REBASE_HEAD') || has('rebase-merge') || has('rebase-apply')` is now `has('rebase-merge') || has('rebase-apply')`. The function doc and the file header both explain why REBASE_HEAD is ignored: git leaves it behind after a rebase finishes. MERGE_HEAD and CHERRY_PICK_HEAD handling is unchanged.
- **Regression tests named for the field scenario.** There are tests for a stale REBASE_HEAD in the repo and in a linked worktree's git dir (both deny, for `-m` and `--no-edit`), and for REBASE_HEAD together with `rebase-merge/` or `rebase-apply/` (allow, e2e and unit). The `rebase-head` row of the `gitOpInProgress` unit matrix now expects `null`, and `rebase-head` has been removed from the `OP_STATES` allow matrix.
- **Concrete SUMMARY path in the executor-stop reason (AUT-02).** `trdDirFor(id, roots)` returns the first `<root>/.planning/objectives/<dir>` that holds `<id>-TRD.md`. `summaryRelPath()` turns that into `.planning/objectives/<dir>/<id>-SUMMARY.md`. `decide()` passes it to `blockReason(id, summaryRel)`. The once-guard (`stop_hook_active`), the SUMMARY-present short-circuit and every fail-open path are unchanged, and the lookup runs only after `summaryExists` has returned false.

Example reason when the TRD is found:

> DevFlow: you are stopping, but TRD 99-01 has no 99-01-SUMMARY.md. If work remains, continue it now (commit each finished task with df-tools commit). If you must stop, first write the ## Progress checkpoint to .planning/objectives/99-demo/99-01-SUMMARY.md (a path relative to your checkout root), listing the tasks done with hashes and the next concrete step. Commit it, then stop. If you stopped on purpose (checkpoint, escalation, exec-context hard stop), repeat that structured return verbatim and stop without writing files. Never use port 8080.

## Task Commits

1. **Task 1 RED:** `300c4b0`, test(44-10): bare REBASE_HEAD is not a rebase in progress (RED)
2. **Task 1 GREEN:** `0673c95`, fix(44-10): gate-commits detects rebase via rebase-merge/rebase-apply only
3. **Task 2 RED:** `000a160`, test(44-10): executor-stop reason names SUMMARY path (RED)
4. **Task 2 GREEN:** `a879736`, feat(44-10): executor-stop reason names the concrete SUMMARY path

## Files Modified

- `plugins/devflow/hooks/gate-commits.js`: the `gitOpInProgress()` rebase signal, its function doc, and the header comment.
- `plugins/devflow/hooks/gate-commits.test.js`: `OP_STATES` without `rebase-head`, 4 new e2e tests, the `rebase-head` → `null` unit row, and 1 new unit test.
- `plugins/devflow/hooks/gate-executor-stop.js`: `trdDirFor`, `summaryRelPath`, a parameterized `blockReason`, the `decide()` wiring, and new exports (`trdDirFor`, `summaryRelPath`, `blockReason`).
- `plugins/devflow/hooks/gate-executor-stop.test.js`: 4 `trdDirFor` unit tests, 4 decide() reason tests and 1 e2e test. No new fixture files; it reuses `makePlanningRepo`, `executorPrompt`, `writeAgentTranscript` and `subagentStopPayload`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: gate-commits ignores a bare REBASE_HEAD | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS (170/170) |
| 1: live check against the main checkout's stale `.git/REBASE_HEAD` (no rebase dirs) | scratch script piping a `git commit -m "x"` PreToolUse payload with `cwd: /Users/justin/dev/devflow-claude` into the worktree hook (read-only) | 0 | PASS (`decision=deny`) |
| 2: executor-stop reason names the concrete SUMMARY path | `node --test plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/verify-commits.test.js` | 0 | PASS (80/80) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/hooks/gate-commits.test.js` | 1 | FAIL (correct): 4 fail / 80 pass. `'rebase' !== null` and "expected deny JSON, got: (empty)" |
| Task 1 GREEN | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS (correct): 170/170 |
| Task 2 RED | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` | 1 | FAIL (correct): 7 fail / 57 pass. `trdDirFor is not a function` ×4, and the reason still carries the generic text ×3 |
| Task 2 GREEN | `node --test plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/verify-commits.test.js` | 0 | PASS (correct): 80/80 |
| Task 2 REFACTOR (wording: concrete branch gets its own sentence, generic lines untouched) | same as GREEN | 0 | PASS (correct): 80/80, folded into the GREEN commit |

Two guard tests passed in RED on purpose: REBASE_HEAD plus a rebase dir → allow, and no TRD file → exact generic text. They pin current behaviour so the fix can't over-correct.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Task 1 verify | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS |
| Task 2 verify | `node --test plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/verify-commits.test.js` | 0 | PASS |
| Full suite | `npm test` (in the worktree) | 1 | 5387 tests: 5326 pass, 11 fail, 50 skipped. All 11 failures are expected and none is in a file this TRD touched |

The 11 `npm test` failures:

- **devflow-watch (4) and handoff-e2e (6):** the known environmental failures. `node-pty` is not installed in this worktree (`node_modules/node-pty` is absent), and the MA-* tests are skipped as "node-pty unavailable". MA-7 (doctl) did not run for the same reason, so it did not fail.
- **roadmap-reconcile E2E1 (1):** "SELF-TEST: reconcile dry-run against this repo ROADMAP shows zero drift". The only drift it reports is `trd_summary_exists` for 44-10: `44-10-SUMMARY.md` exists while ROADMAP.md line 130 still reads `- [ ] 44-10-TRD.md`. This is an ordering artifact of this dispatch, which forbids editing ROADMAP.md. 44-01 through 44-09 are all `[x]`, so the test passes once the orchestrator ticks 44-10. It is not a code defect.

## Decisions Made

- Drop REBASE_HEAD as a signal rather than require it together with a rebase dir. With `rebase-merge/` or `rebase-apply/` present it adds nothing, and on its own it is exactly the stale case.
- Keep the SUMMARY path repo-relative, built from the located TRD dir's basename. A worktree and the main checkout share the same `.planning/objectives/<dir>` layout, so the path is right wherever the executor writes.
- Keep the generic reason byte-for-byte when no TRD is found, and pin it with an exact-string test.

## Deviations from Plan

None. The TRD was executed as written. The TRD asked for `trdDirFor` and `blockReason(id, summaryRel)`, and I added one small helper beyond that, `summaryRelPath()`, to turn the located dir into the repo-relative path. `blockReason` is also exported now, so it can be unit-checked. Neither changes behaviour beyond the specification.

Not changed, noted for follow-up: the comment block in `hooks/__fixtures__/gate-fixtures.js` still lists REBASE_HEAD among the markers "git leaves while an operation is in progress", and the `rebase-head` state is kept because the tests use it to simulate the stale marker. The fixture file was outside this TRD's `files_modified`, and the binding rules say to reuse it unchanged.

## Issues Encountered

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3
  - A bare `.git/REBASE_HEAD` (no rebase dirs) → gate-commits DENIES a raw commit. Verified by e2e tests and by the live main-checkout check.
  - `rebase-merge/` or `rebase-apply/` (with or without REBASE_HEAD) → allowed. MERGE_HEAD and CHERRY_PICK_HEAD are unchanged, and the `OP_STATES` matrix still passes.
  - TRD file found → the reason names `.planning/objectives/<dir>/<id>-SUMMARY.md`. Not found → the generic wording, exactly, and the hook still blocks.
- Gate failures: none in the targeted gates. The full-suite failures are explained above.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/gate-commits.js
- FOUND: plugins/devflow/hooks/gate-commits.test.js
- FOUND: plugins/devflow/hooks/gate-executor-stop.js
- FOUND: plugins/devflow/hooks/gate-executor-stop.test.js
- FOUND: .planning/objectives/44-autonomy-hardening/44-10-SUMMARY.md
- FOUND commits: 300c4b0, 0673c95, 000a160, a879736

---
*Objective: 44-autonomy-hardening*
*Completed: 2026-09-29*
