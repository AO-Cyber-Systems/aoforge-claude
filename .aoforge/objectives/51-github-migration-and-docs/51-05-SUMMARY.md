---
objective: 51-github-migration-and-docs
trd: "05"
subsystem: github-store
tags: [backfill, planning-import, estimate, preview, history, outbox, tdd]
requires:
  - objective: 51-github-migration-and-docs
    provides: "51-02 makeBackfillProject / useBackfillEnv; 51-03 gh-backfill historyOps / estimate / renderEstimate"
provides:
  - "planImport report.estimate {objectives, trds, history_closes, ops, writes_max, reads_approx, minutes_min, hour_windows, hours_min, by_kind, writes_by_kind, live_creates, wiki_pushes, milestones, unknown_kinds}"
  - "planImport report.history {closed_completed, closed_not_planned}"
  - "planImport report.preview: a store-off dry run with github.enabled previews the backfill (a real store-off import still refuses)"
  - "planImport(root, {noFlush:true}): queues everything including the history closes, skips the flush, leaves the ledger unsettled (for migration 0011)"
  - "planImport queues history close ops after every create, and closes each MILESTONES.md milestone it puts"
  - "planning import prose: preview banner, counts, `estimate:` line, `history:` line, `will stay local:` table"
affects: [51-06, 51-07, 51-08, 51-10]
tech-stack:
  added: []
  patterns: [one importer as the single source of the backfill plan, close ops folded over a pending patch-issue, upper-bound estimate pinned by a calibration test]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/planning-import.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
key-decisions:
  - "An objective's history close is folded over the objective's own pending `patch-issue {type: Objective}` ({...prior, ...close}) before enqueue. outbox.enqueue coalesces a pending op with the same kind + target by REPLACING its payload, so an unfolded close would have wiped the Objective type. Effect: the objective is typed and closed by one PATCH at the hierarchy's earlier seq. Every TRD close has no pending patch-issue, so it is appended after every create."
  - "The milestone close is a direct `gh-milestone-store.closeMilestone` after `milestonePut` (a list + one PATCH). milestone put never sets a state, and planning-entity-verbs.cjs was outside this TRD's files. A failed close is a warning, not an error: the milestone and its page already exist."
  - "report.estimate is computed on real runs too, priced from what was actually queued; a dry run prices what would be queued."
  - "COST table unchanged: on the 20-objective fixture a drained real import made 639 writes against writes_max 770 (0.83), within [0.6, 1]."
requirements-completed: [GMD-01, GMD-02]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 35min
completed: 2026-10-01
tokens_input: 19424372
tokens_output: 78173
tokens_cache_read: 19182167
tokens_cache_write: 242013
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 05: `planning import` prices and previews the backfill Summary

**Running `planning import --dry-run` now shows the whole GitHub backfill and its cost before anything is written. It reports an upper-bound write estimate and the history closes, and it also previews before `github.store` is turned on. A real import closes the shipped and cancelled work it creates. `noFlush` lets migration 0011 queue without draining. A calibration test on the 20-objective fixture pins the estimate to what a real drain writes (639 of 770).**

## What was built

- `planning-import.cjs`
  - **Preview.** With store off, `dryRun` and `github.enabled === true` (read through `planningMode.readPlanningConfig`), the run continues with `report.preview = true`. Any other local-mode run returns the same refusal as before.
  - **The plan.** Each importable objective folds the pure `ghHierarchy.buildOps(pushPlan)` into the op list. An unmapped objective adds one live create. Decisions add upsert + block, and comment + close when answered. Entities add the ops `importEntity` builds, derived from `planningPaths.classify` (`entityOpKinds`). Docs add one wiki push. Each MILESTONES.md section adds one milestone put. Then `gh-backfill.historyOps(main, importedIds)` runs. `report.estimate` is `{objectives, trds, history_closes, ...estimate()}`, and `report.history` is `{closed_completed, closed_not_planned}`.
  - **History queuing.** After step 6 and before the flush, `outbox.enqueue(main, foldOverPending(main, history))` runs. It carries no ledger bytes. A second import imports nothing, so it closes nothing.
  - **Milestones.** After a successful `milestonePut`, the import calls `closeMilestone`.
  - **`noFlush`.** Step 7 is skipped. `report.flush` is absent, `exit` is 0, and the ledger is not settled.
  - The JSDoc report shape and the module header are updated. Existing report keys keep their meaning: `queued` counts are unchanged.
- `planning-verbs-cli.cjs`
  - `importProse` prints, in order: a preview banner, the counts, `estimate: <renderEstimate>`, `history: N closed (completed), M closed (not planned)`, a `will stay local:` table (refused + kept_local rows, `|` escaped), then `Skipped:`.
  - A successful import now prints its own prose instead of going through `report()` (see Deviation 2).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: estimate, history and preview in the dry run | `node --test planning-import-backfill.test.cjs planning-import.test.cjs` | 0 | PASS (5/5) |
| 2: history queuing, noFlush, calibration | `node --test planning-import-backfill.test.cjs gh-backfill.test.cjs planning-import.test.cjs` | 0 | PASS (38/38) |
| 3: CLI prose | `node --test planning-verbs-cli.test.cjs dispatch-completeness.test.cjs` | 0 | PASS (17/17) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test planning-import-backfill.test.cjs` | 1 | FAIL: no `report.estimate`; preview refused (772b979b) |
| GREEN (T1) | same + `planning-import.test.cjs` | 0 | PASS 5/5 (d7490733) |
| RED (T2) | `node --test planning-import-backfill.test.cjs` | 1 | FAIL: tests 3 and 4 (no history ops queued, objectives open). Test 5 passed at RED: without the closes the drain made 551 writes, already inside [0.6, 1] x 770 (9645f0fc) |
| GREEN (T2) | same + `gh-backfill.test.cjs` | 0 | PASS 38/38 (cc7f4d0e) |
| RED (T3) | `node --test --test-name-pattern "^(5\|6)\. " planning-verbs-cli.test.cjs` | 1 | FAIL: no preview banner / estimate prose (b1af2fc5) |
| GREEN (T3) | `node --test planning-verbs-cli.test.cjs dispatch-completeness.test.cjs` | 0 | PASS 17/17 (e545ee23) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-import-backfill.test.cjs` | 0 | PASS (5/5) |
| regression | `node --test planning-import.test.cjs planning-verbs-cli.test.cjs gh-seam.repo.test.cjs` (+ the new file) | 0 | PASS (28/28) |
| full suite | `npm test` | 1 | 8321 pass / 2 fail / 32 skipped of 8355. Neither failure is in this TRD's code. `handoff-e2e.test.cjs` MA-7 (doctl auth init) is the known pre-existing daemon failure. `roadmap-reconcile.test.cjs` E2E1 is a self-test that reads this repo's ROADMAP.md and reports `trd_summary_exists` drift for 51-01..51-04 (SUMMARYs exist, boxes unticked); the orchestrator owns that ROADMAP update after the wave merges. |
| related modules | `node --test gh-backfill-fixtures gh-hierarchy gh-outbox gh-milestone-store planning-entity-verbs` | 0 | PASS (164/164) |

## Calibration (test 5, measured)

Fixture: 20 objectives, 100 TRDs. The dry-run estimate is 623 ops and writes_max 770 (2 hour windows). By kind: patch-issue 124, set-fields 40, upsert-issue 212, link-sub-issue 100, block 121, upsert-comment 89, patch-body 20, live-create 60, milestone 4.

The real import plus one hourly re-flush made **639 writes, 0.83 of writes_max**. The upper bound has slack in three places:
- set-fields degrades to body metadata on the fake, so 40 priced writes become 20.
- The 16 objective closes are folded into the type PATCH, so they cost nothing extra.
- upsert-issue is priced at 2, while the fake does one create plus amortised labels.

The COST table is unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] An objective's history close would have erased its Objective type.**
- **Found during:** Task 2, reading `outbox.enqueue`.
- **Issue:** `outbox.enqueue` coalesces a pending op with the same kind + target by replacing its payload. A `patch-issue {id: <objective>}` close would have replaced the hierarchy's pending `patch-issue {type: 'Objective'}`.
- **Fix:** `foldOverPending` merges each close over the pending patch-issue on the same id, the rule `planning-entity-verbs.closeOp` already uses. Test 3 asserts the merged payload `{type, state, state_reason}`. Only the TRD closes are "after every create". An objective's close shares its type patch's earlier seq, and one PATCH carries both.
- **Commit:** cc7f4d0e

**2. [Rule 1 - Bug] Every successful `planning import` printed `planning import: nothing to do ().`**
- **Found during:** Task 3 RED.
- **Issue:** `report()`'s headline reads `res.skipped` as truthy, and the import's `skipped` is always an array.
- **Fix:** A successful import prints its own prose: warnings to stderr, `importProse`, then the flush prose. Failures still go through `report()`.
- **Commit:** e545ee23

**3. [Plan conflict] An existing assertion in `planning-verbs-cli.test.cjs` test 5 contradicted the TRD's preview decision.**
- **Issue:** Test 5 ran `planning import --dry-run` on a store-off project with `github.enabled: true` and expected exit 1. The preview decision makes that run exit 0, so "existing tests pass unchanged" (test 7) could not hold for this one line. It failed from d7490733 until b1af2fc5.
- **Fix:** Test 5 now asserts that a real `planning import` still exits 1 with the `github.store` message, and that the dry run previews (exit 0, banner).
- **Commit:** b1af2fc5

### Notes

- `help.cjs` still describes `planning import` as "store mode only ... (--dry-run: count only)". It was out of this TRD's files and is left for 51-10 (docs).
- On the full fixture, `planning import` alone stops `pending` at the per-run client cap (450 writes). The rest drains on a later `gh outbox flush`. Test 5 simulates that with a new run per hour window. Migration 0011 (51-06/07) owns the multi-hour drain and the live-write booking (`recordLiveWrites`).

## Post-TRD Verification

- Auto-fix cycles used: 0 (no verify failure needed a retry)
- Must-haves verified: 6/6
  - estimate, history, refused and kept_local in the dry run, with zero calls and an unchanged tree (test 1)
  - store-off preview, and refusals unchanged (test 2)
  - noFlush ordering, no flush and an unsettled ledger (test 3)
  - a default import closes shipped work (test 4)
  - calibration (test 5)
  - prose (test 6), with existing tests passing apart from Deviation 3
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs
- FOUND commits: 772b979b, d7490733, 9645f0fc, cc7f4d0e, b1af2fc5, e545ee23
