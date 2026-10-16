---
objective: 51-github-migration-and-docs
trd: "03"
subsystem: github-store
tags: [backfill, outbox, estimate, history, gh]
requires: [gh-outbox, gh-hierarchy, gh-mapping, planning-mode]
provides: [gh-backfill.historyOf, gh-backfill.historyOps, gh-backfill.COST, gh-backfill.estimate, gh-backfill.renderEstimate, gh-backfill.hasPendingOps, gh-backfill.recordLiveWrites, gh-backfill.parseProgress, gh-backfill.progressStateOf, gh-hierarchy.findSummaries]
affects: [51-05, 51-06, 51-07]
tech-stack:
  added: []
  patterns: [pure planning module returning outbox ops, upper-bound cost table, journal-only bookkeeping]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-backfill.cjs
    - plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
decisions:
  - "Close ops target {id} only: outbox.validateOp rejects any extra target field on patch-issue, so the TRD's {role, id} shape could not be used"
  - "OBJECTIVE.md status wins over the Progress row, which wins over 'all TRDs summarised'; status: reopened is an explicit open"
  - "An un-summarised TRD in a cancelled objective is classified 'cancelled' (a fourth TRD state) and closes not_planned; a summarised TRD there still closes completed"
  - "hasPendingOps reports halted as 0/1 using outbox.status, so a blocked op at the head of the queue counts as halted"
  - "Outbox kinds the COST table does not price (upsert-pr, post-scope, ...) cost 2 and are listed in unknown_kinds"
metrics:
  duration: 12min
  started: 2026-10-01T20:14:40Z
  completed: 2026-10-01T20:26:20Z
  tasks: 2
  files: 4
tokens_input: 8896034
tokens_output: 71474
tokens_cache_read: 8716795
tokens_cache_write: 179103
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 03: gh-backfill core Summary

**gh-backfill.cjs, a pure local-only module. It classifies ROADMAP Progress, objective and TRD history and returns patch-issue close ops whose ids match `buildOps` (G1). It also provides an upper-bound write estimate paced by `outbox.BUDGET` (G3), resume detection from the outbox journal, and booking of live writes into the budget window (G5).**

## What was built

- `parseProgress(text)` / `progressStateOf(rows, id)`: reads every `## Progress` table that has a `Status` column. Code fences are skipped. It parses the three first-cell shapes: `42. Name`, `27–41 (15 objectives)` (en dash, em dash or hyphen) and `0–9, 6, 8, 24 (13 objectives)`. A status starting `Complete` maps to complete and one starting `Cancelled` maps to cancelled. A row that names an objective directly beats a range row, and among equals the later row wins.
- `historyOf(root)` returns `{objectives:[{id, dir, state, source, trds:[{id, file, summary, state}]}], warnings}`. Objectives come from `ghMapping.listObjectiveIndex`. TRDs come from `ghHierarchy.readObjectiveTrds` and are paired with SUMMARYs by `ghHierarchy.findSummaries`, the same pairing a push uses. Legacy file names are skipped with a warning.
- `historyOps(root, ids, {history})` returns `patch-issue {state: closed, state_reason}` ops in objective-id order, with each objective's op after its TRD ops. Open work gets no op.
- `COST` (frozen), `estimate(input)` (pure and total) and `renderEstimate(e)`, which renders one line.
- `hasPendingOps(root, opts)` returns `{pending, blocked, halted, any}` from the main checkout's journal. It makes no gh call and never creates the journal.
- `recordLiveWrites(root, n, now, opts)` calls `outbox.recordWrite` n times and then `outbox.writeJournal`. When n <= 0 or n is not a number it writes nothing.
- The seam guard covers the new module: `gh-backfill.cjs` is in `GUARDED` and `NO_DIRECT_WRITE`, and test 24 asserts it has no ghWrite/ghRead/runGh, no spawn or exec, and no enqueue or flush.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] patch-issue target shape**
- **Found during:** Task 1
- **Issue:** The TRD specified `target:{role, id}` "exactly as outbox.validateOp accepts". validateOp's patch-issue spec allows only `target:['id']` and rejects extra fields, and every existing patch-issue producer uses `{id}`.
- **Fix:** Ops use `target:{id}`, and every op is validated with `outbox.validateOp` in the tests.
- **Files modified:** gh-backfill.cjs
- **Commit:** 655bd3c9

**2. [Rule 3 - Blocking] findSummaries was not exported**
- **Found during:** Task 1
- **Issue:** The TRD requires reusing the hierarchy's TRD/SUMMARY pairing, but `findSummaries` was module-private.
- **Fix:** Added a one-line export to gh-hierarchy.cjs with a `// objective 51 (TRD 51-03)` comment. This file is outside the TRD's files_modified, and no other objective-51 TRD touches it. The gh-hierarchy suite still passes (28/28).
- **Files modified:** gh-hierarchy.cjs
- **Commit:** 655bd3c9

**3. [Rule 2 - Correctness] Explicit status precedence and the cancelled TRD state**
- **Found during:** Task 1
- **Issue:** Under the literal rules, an objective whose OBJECTIVE.md says `status: reopened` would be closed again by a stale `Complete` Progress row. A cancelled objective's un-summarised TRDs also had no named state.
- **Fix:** Explicit frontmatter status is decisive (`complete`, `cancelled`, `reopened`). Un-summarised TRDs of a cancelled objective get state `cancelled` and close as `not_planned`. Tests cover both cases.
- **Commit:** 655bd3c9

### Notes

- **Test fix:** One test expected the SUMMARY name `1-01-SUMMARY.md`, but its own fixture writes `01-01-SUMMARY.md`. The assertion was corrected in the GREEN commit.
- **Seam test 24 passed at RED:** Test 24 was written after the module existed, and the module already conformed, so the test had nothing to fail on. It is a regression guard.
- **Window where test 23 failed:** Between commits 655bd3c9 and fb7b9d73, gh-seam test 23 ("every gh-*.cjs is guarded") failed. This was the window between creating the module (Task 1) and adding it to the guard list (Task 2 RED), as the TRD's task split prescribes.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: history classification and close ops | `node --test plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs` | 0 | PASS (14/14) |
| 2: estimate, journal helpers, seam guard | `node --test gh-backfill.test.cjs gh-seam.repo.test.cjs gh-outbox.test.cjs` (+ gh-hierarchy.test.cjs) | 0 | PASS (170/170) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../gh-backfill.test.cjs` | 1 | FAIL: module missing (correct), commit a1670ba9 |
| GREEN (Task 1) | `node --test .../gh-backfill.test.cjs` | 0 | PASS 14/14, commit 655bd3c9 |
| RED (Task 2) | `node --test .../gh-backfill.test.cjs .../gh-seam.repo.test.cjs` | 1 | FAIL 16 (estimate, hasPendingOps and recordLiveWrites not exported), commit fb7b9d73 |
| GREEN (Task 2) | `node --test gh-backfill gh-seam gh-outbox gh-hierarchy` | 0 | PASS 170/170, commit ddec0111 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs` | 0 | PASS |
| regression | `node --test gh-seam.repo.test.cjs gh-outbox.test.cjs gh-hierarchy.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 | 8270 pass / 10 fail / 50 skipped of 8330. All 10 failures are in `bin/devflow-watch.test.cjs` and `bin/handoff-e2e.test.cjs`: the foreground daemon never writes its PID file in this sandbox. They also fail when run in isolation, they are unrelated to this TRD, and they were not fixed. |

## Post-TRD Verification

- Auto-fix cycles used: 1 (the test fixture name in Task 1 GREEN)
- Must-haves verified: 6/6
  - historyOf classifies objectives and TRDs from local files only (tests 2a-2d; gh runner replaced with a thrower)
  - historyOps reasons and order, every op passing validateOp, and ids equal to buildOps targets (test 3)
  - estimate is pure and total with the upper-bound table, and its time fields come from outbox.BUDGET (tests 4 and 5)
  - hasPendingOps reports pending, blocked and halted counts, and zeros with no journal (test 6)
  - recordLiveWrites goes through recordWrite and writeJournal, and n <= 0 leaves the file untouched (test 7)
  - seam guard (gh-seam test 24)
- Gate failures: None in scope. The full-suite daemon failures are environmental and pre-existing.
- On this repo, a sanity run of historyOf found 52 objectives and produced 362 close ops; objectives 26, 43 and 51 are open.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-backfill.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-backfill.test.cjs
- FOUND commits: a1670ba9, 655bd3c9, fb7b9d73, ddec0111
