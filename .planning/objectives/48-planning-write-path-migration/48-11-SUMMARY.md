---
objective: 48-planning-write-path-migration
trd: "11"
subsystem: planning-verbs
tags: [gwp-01, gwp-05, write-through, ledger, outbox, store-mode, local-invariant, worktree, tdd]

requires:
  - objective: 48-01
    provides: "planning-mode (planningMode, resolveMainRoot), planning-paths classify, planning-ledger record/forget/settleCandidates"
  - objective: 48-03
    provides: "trd-bulk.checkTrd (budget + linked-bulk findings)"
  - objective: 48-05
    provides: "gh-wiki PAGE_TABLE rules (research, milestone, objective-doc) consulted by doc put"
  - objective: 47
    provides: "pushHierarchy/planPush, enqueueSummary/enqueueVerification/readTrdState, assertEditable, outbox enqueue/flush, recordCacheBaseline, gh.syncObjective"
provides:
  - "lib/planning-verbs.cjs: writeThrough, putTrd, planPush, objectivePut, objectiveSetStatus, summaryPost, summaryCheckpoint, verificationPost, docPut, draftPath, STATUSES, DRAFTS_DIR"
  - "gh-store-cli exports queuedResult, flushResult, settleLedger, UNQUEUED_MARK; a drained flush settles the verb-write ledger (payload.settled)"
affects: [48-12, 48-15, 48-16, 48-17, 48-18, 48-19, 48-20, 48-21, 48-22]

tech-stack:
  added: []
  patterns:
    - "One write primitive with a local branch (atomic write only) and a store branch (write, ledger, enqueue, flush, baseline after a drained flush)"
    - "Writes the verb did not queue carry a `(not queued)` ledger mark so no flush ever baselines bytes GitHub does not have"
    - "Ops on a shared coalescing target (wiki-push, objective patch-issue) are merged with the pending op at enqueue time"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs

key-decisions:
  - "A write that was not queued (plan put-trd --no-push, or an enqueue that failed) is ledgered as `<verb> (not queued)`; W055 stays quiet (same hash), settleLedger skips it, the next verb that queues the file (or plan push) clears the mark"
  - "Verbs that queue a wiki-push union their pages with the pending wiki-push, and status patches merge over a pending objective patch-issue: both coalesce on one target with latest-payload-wins, which would otherwise drop pages or fields"
  - "putTrd (without --no-push), planPush and objectivePut baseline every file the hierarchy push carried (TRDs, SUMMARYs, VERIFICATION, pages) after a drained flush, not only the file they wrote"
  - "A TRD with no issue yet ('has no issue yet') is not frozen and gives no freeze warning; any other readTrdState failure warns 'freeze state unknown (offline); proceeding'"
  - "doc put accepts a rel only when it has a wiki page AND planning-paths names `doc put` as its verb, so OBJECTIVE.md is refused naming `objective put`"
  - "objective put calls gh.syncObjective with deferFlush and lets writeThrough flush once; when the github_issue write-back (D-16) changes OBJECTIVE.md, the ledger is re-recorded with the new bytes"
  - "objectiveSetStatus edits `status:` through frontmatter.setFrontmatterField on a temp copy (one frontmatter grammar); store mode does not return the `objective complete` delegate, local mode does"
  - "settleLedger settles the ledger of the root the flush drained, as given (not the resolved main), so a worktree flush never baselines main's entries against a journal it did not drain"
  - "Default file names: SUMMARY reuses an existing `<prefix>-[...-]SUMMARY.md`, else `<prefix>-SUMMARY.md` (prefix from the TRD file); VERIFICATION reuses an existing one, else `<NN>-VERIFICATION.md`"

patterns-established:
  - "48-12 entity verbs call writeThrough(root, {rel, text, verb, enqueue, covers, noFlush}) and get mode handling, ledger, flush, settle and exit codes for free"

requirements-completed: [GWP-01, GWP-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 16min
completed: 2026-10-01
---

# Objective 48 TRD 11: Core planning verbs Summary

**`planning-verbs.cjs` gives every skill one call per artifact: in local mode it is exactly today's file write (same path, same bytes, zero gh calls, no journal, no ledger); in store mode it writes the cache, records the ledger, queues the right op, flushes, and baselines only after a flush that drained the journal. `plan put-trd` refuses a TRD over 60,000 encoded chars and a frozen TRD before writing anything. `gh outbox flush` now settles pending verb writes.**

## Performance

- Started 2026-10-01T12:06Z (preflight claim), finished 2026-10-01T12:22Z (about 16 min)
- 3 tasks, 6 commits (RED and GREEN for each), 2 files created, 2 modified

## Accomplishments

- **writeThrough** is the single primitive. Local mode does an atomic write and returns. Store mode does the atomic write, then `ledger.record`, then `enqueue(main)`, then flushes unless `noFlush`. After a drained flush it records the cache baseline for the written file and every rel the queued op covers, then forgets them in the ledger. Exit codes come from gh-store-cli `EXIT` via `flushResult`. A failing enqueue leaves the file written and ledgered (marked not queued) and returns exit 1.
- **putTrd**: file name and objective validated against the same TRD regex and `ghMapping.resolveObjective` call gh-hierarchy uses. `trd-bulk.checkTrd` warnings in both modes. In store mode, `over` is refused with nothing written and zero gh calls. The freeze check is `readTrdState` → `assertEditable`, and a frozen TRD is refused naming `gh trd scope`. `noPush` writes the cache only.
- **planPush**: hierarchy push and flush in store mode, then baseline and forget everything the push carried. Local mode returns `skipped: 'local mode'`.
- **objectivePut / objectiveSetStatus**: `STATUSES = planned, in_progress, verifying, complete, cancelled, reopened`. Store mode runs `gh.syncObjective` (deferFlush), a wiki-push of the objective page, and a `patch-issue` for complete (closed/completed), cancelled (closed/not_planned) and reopened (open). Local `complete` returns `{delegate:'objective complete'}`.
- **summaryPost / summaryCheckpoint / verificationPost / docPut**: the summary and verification comments go through 47's `enqueueSummary`/`enqueueVerification`. In store mode the checkpoint is a plain write of `.trd-progress/<trd>.md` (D-12), and summary post removes it. doc put queues a wiki-push of the page.
- **draftPath**: `os.tmpdir()/devflow-drafts/<repoKey(main)>/<rel>`, seeded once from the cache file (D-13).
- **gh-store-cli**: exports `queuedResult`, `flushResult`, `settleLedger`, `UNQUEUED_MARK`. On a `flushed` result, `flushResult` settles matching, queued ledger entries and reports `settled` in the payload. Drifted and not-queued entries stay. A settle error becomes `settle_warning` and never fails the flush.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1: writeThrough, put-trd, plan push, drafts, exports | bd870e7 test(48-11): writeThrough and put-trd | 2242876 feat(48-11): writeThrough, plan put-trd, plan push, drafts |
| 2: objective, summary, verification, doc verbs | 8a0b77e test(48-11): objective, summary, verification and doc verbs | 8d8a751 feat(48-11): objective, summary, verification and doc verbs |
| 3: flush settles the ledger | 96332d1 test(48-11): flush settles the ledger | b499b04 feat(48-11): outbox flush settles verb writes |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test planning-verbs.test.cjs gh-store-cli.test.cjs` | 0 | PASS (11 verbs tests + gh-store-cli incl. 17) |
| 2 | `node --test planning-verbs.test.cjs` | 0 | PASS (20/20) |
| 3 | `node --test gh-store-cli.test.cjs planning-verbs.test.cjs gh-store-e2e.test.cjs` | 0 | PASS (84/84, 47 store e2e green) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test planning-verbs.test.cjs` / `gh-store-cli.test.cjs` | 1 (module missing; `queuedResult` undefined) | FAIL (correct) |
| GREEN 1 | `node --test planning-verbs.test.cjs gh-store-cli.test.cjs` | 0 | PASS (correct) |
| RED 2 | `node --test planning-verbs.test.cjs` | 1 (9 new tests fail: verbs missing) | FAIL (correct) |
| GREEN 2 | `node --test planning-verbs.test.cjs` | 0 (20/20) | PASS (correct) |
| RED 3 | `node --test planning-verbs.test.cjs gh-store-cli.test.cjs` | 1 (14, 14b fail: no `settled`) | FAIL (correct) |
| GREEN 3 | `node --test gh-store-cli.test.cjs planning-verbs.test.cjs gh-store-e2e.test.cjs` | 0 (84/84) | PASS (correct) |

14c (a flush that is not drained settles nothing) was already true in RED. It guards the new code path rather than driving it.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-verbs.test.cjs gh-store-cli.test.cjs` | 0 | PASS |
| regression | `node --test 'lib/gh-*.test.cjs' 'lib/planning-*.test.cjs'` | 0 | PASS |
| verification | `rg -n "spawnSync\|execSync\|process\.exit\|console\.log" planning-verbs.cjs` | 1 (no match) | PASS |
| full suite | `npm test` | 1 | PASS except the known flaky MA-7: 7201 tests, 7168 pass, 1 fail, 32 skipped |

**Full suite:** the one failure is **MA-7** in `handoff-e2e.test.cjs` (doctl auth init PTY race, TRD 19-05). It is the documented pre-existing flake, unrelated to these files, noted and not fixed as instructed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Unqueued writes are never settled**
- **Found during:** Task 1 design (the `settleLedger` the TRD specifies for Task 3)
- **Issue:** As specified, settle-after-drain baselines every ledger entry whose bytes match. That includes a `plan put-trd --no-push` write and a write whose enqueue failed, neither of which GitHub holds. Baselining them is the TRD's own anti-pattern (48-RESEARCH pitfall 1): a later `gh pull --all` would treat the edited local file as unchanged and overwrite it.
- **Fix:** Such writes are ledgered as `<verb> (not queued)` (`UNQUEUED_MARK`), and `settleLedger` skips them. `promote()` clears the mark when a later queued push carries the file. W055 is unaffected because it compares hashes only. Tests 6, 14 and 14b cover this.
- **Files:** planning-verbs.cjs, gh-store-cli.cjs
- **Commits:** 2242876, b499b04

**2. [Rule 1 - Bug] wiki-push / patch-issue coalescing would drop data**
- **Found during:** Task 2
- **Issue:** The outbox coalesces a pending op with the same kind and target, and the latest payload wins. Every wiki-push has the one target `{store:'pages'}`, so a doc put or objective put op would replace the pending hierarchy wiki-push and drop its other pages. The same applies to a status `patch-issue` over a pending one.
- **Fix:** `wikiPushOp` unions pages with the pending wiki-push. `patchIssueOp` merges over the pending patch-issue payload. This uses the TRD's verbatim `wiki-push` schema: target `{store:'pages'}` (not `{}` as the TRD text said), payload `{pages, message}`.
- **Commit:** 8d8a751

**3. [Rule 3 - Blocking] gh-hierarchy does not export `resolveObjectiveDir` / `parseTrdFile` / `TRD_FILE_RE`, and gh-trd does not export `isSafeFileName`**
- **Fix:** planning-verbs mirrors them locally: the same regexes and the same `ghMapping.resolveObjective` call and error text. This keeps the change out of files other wave-2 TRDs may edit.
- **Commit:** 2242876

**4. [Rule 2] doc put also refuses OBJECTIVE.md**
- OBJECTIVE.md has a wiki page, but `objective put` owns it. Writing it through doc put would skip the objective issue sync. docPut now requires `classify(rel).verb === 'doc put'` as well as a page, and its refusals name the class and the owning verb (test 5).

### Test-list adjustments

- Test 5 (doc put refusal) moved from Task 1 to Task 2, so docPut's RED and GREEN stayed in one task.
- Additive tests: 1b (bad file, other objective, unknown objective), 2b (planPush skipped locally), 7b (40,000+ warns in store mode), 13b (cancelled → not_planned; in_progress only edits frontmatter), 14b and 14c (settle matching/drifted/unqueued; no settle without a drain).
- Test 6 strips the fixture's TRD files before the initial sync, so `plan push` creates exactly the 3 TRD sub-issues the test names.

## Known limitations / notes for later TRDs

- **48-15 (CLI):** the results carry `prose` (the flush prose), `note` (queued-only) and `delegate` (local `objective set-status complete` → run today's cmdObjectiveComplete). Pass the resolved root to `gh outbox flush` if a worktree call should settle main's ledger, because settleLedger uses the root it is given.
- **objective put:** syncObjective runs with `deferFlush`, so the Roadmap page refresh that 47 does after its own flush (`completeStorePush`) does not run on this path. The next `gh sync` refreshes it, since the page is a view.
- **Ledger concurrency:** `ledger.record` takes no lock (48-01 note). Two verbs writing at once could lose an entry, and W055 would then report that file as a direct write. Not addressed here.
- **48-12:** reuse `writeThrough` with `enqueue` returning `{ok, enqueued, coalesced, covers?}`. Use `wikiPushOp`-style merging for any op on a shared target.

## Invariant check (github.store off)

This repo's config has `github.store` off. Tests 1, 2, 2b, 3, 4 and 5 run with `github.enabled: true, store: false`, with the fake installed. Every verb writes the same `.planning/` file with the input bytes, makes zero gh calls, and creates no outbox journal and no ledger. `summaryCheckpoint` writes the SUMMARY file itself, and nothing goes to `.trd-progress/`. `.planning/` tracking and the edit gate are untouched: this TRD adds a library with no caller yet (48-15 wires it).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (D-01 local invariant; store pipeline with baseline-after-drain; put-trd budget refuse/warn, bulk warnings, noPush, planPush; frozen refusal + offline warning; checkpoint split; doc put page check naming the verb; draftPath; main-checkout resolution from a worktree; flush settles the ledger)
- Gate failures: none from this TRD

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/planning-verbs.cjs, planning-verbs.test.cjs (20 tests run above)
- FOUND: commits bd870e7, 2242876, 8a0b77e, 8d8a751, 96332d1, b499b04 (`git log fdfb4b4..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merging the wave
