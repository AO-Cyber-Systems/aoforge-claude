---
objective: 51-github-migration-and-docs
trd: "07"
subsystem: migrations
tags: [upgrade, migration-0011, backfill, store-mode, outbox, drain, verify, tdd]

requires:
  - objective: 51-github-migration-and-docs
    provides: "51-02 useBackfillEnv; 51-03 hasPendingOps / recordLiveWrites; 51-04 0010 deferral + STORE_COMMIT_STEPS; 51-05 planImport {dryRun, noFlush}; 51-06 0011 phases 0-3"
provides:
  - "migration 0011 phases 4-6: drain (bounded flush loop, resumable `pending` / `halted` stops), verify (`gh pull --all` + orphan report per objective), the in-process 0010 hand-off"
  - "a `pending` refusal carrying {reason, budget, remaining, total, done, wait_ms, resume_at}, with the text 'not an error: N of M ops remain'"
  - "phase 5b: the files the confirmed plan keeps local get a baseline, so 0010 can untrack the cache"
  - "a completed apply records 0010 in `devflow.migrations_applied`"
affects: [51-08, 51-09, 51-10]

tech-stack:
  added: []
  patterns:
    - "drain = flush + gh-store-cli.flushResult per round, so only a drained flush settles the ledger"
    - "the client's per-run write cap (a rate_limited result) is reported as a budget stop from the journal's rolling window, never slept through"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs

key-decisions:
  - "The wiki clone (`.planning/wiki/**`) is excluded from 0010's cache check and from 0011's un-baselined list, as gh-cache.listOwnedLocal already excludes it. It is cache-class, but nothing ever baselines it, so 0010 refused every real backfill."
  - "Kept-local files (planImport `kept_local`, for example a decision with no `trd:`) get a baseline after verify, because the user confirmed the plan that lists them (OQ5). They are named in the notes. If the import would still queue anything, nothing is baselined and the apply refuses `verify`."
  - "Verify treats only a TRD file with no issue as a pull-orphan gap. An OBJECTIVE.md orphan is not a gap: pull reads OBJECTIVE.md from a wiki page. A missing objective issue shows up in reportOrphans instead."
  - "When the client's 450-writes-per-run cap is hit, the stop is reported from the journal's budgetCheck: budget `hour` and its wait, or `run` with wait 0. A rate limit caused by the cap is never slept through."
  - "maxOps is counted across every round of the drain, not per flush call."
  - "0010 is recorded in the stamp by `apply` (`recordHandoff`) and not by `migrate`, so a direct `migrate` call never writes the stamp."
  - "A 0010 refusal after verify stops with a new code, `handoff`."

requirements-completed: [GMD-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 21min
completed: 2026-10-01
tokens_input: 13883729
tokens_output: 111095
tokens_cache_read: 13629801
tokens_cache_write: 253776
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 07: migration 0011, part 2 (drain, verify, hand-off to 0010) Summary

**`upgrade --apply --only 0011 --confirm` now finishes the backfill.**
- It drains the outbox within the 80/min and 450/h budgets, and stops resumably on the hour budget with "not an error: N of M ops remain", the resume time, and the command to re-run.
- It then checks that GitHub holds every TRD (`gh pull --all` plus the orphan report) and hands off to 0010, which gitignores and untracks the cache.
- It prints the store-mode commit steps and the `gh setup` ordering.
- On the 20-objective fixture it completes across one hour-budget resume. Running it again changes nothing.

## What was built

`migrations/0011-github-store-backfill.cjs`:

- **Drain (phase 4):** up to 20 rounds of `flush({wait:true, now, sleep, maxOps})`, each followed by `gh-store-cli.flushResult`.
  - It continues on a minute-budget pending result, and on a rate limit whose retry-after is 60 s or less (slept through the injected sleep).
  - It stops `pending` on the hour budget, the per-run write cap, offline, maxOps, a longer retry-after, a busy lock or an error.
  - It stops `halted` on a halt, with `gh outbox status` / `gh outbox resolve <seq>` guidance.
  - The ledger is settled only by a drained flush.
- **Verify (phase 5):** `gh-cache.pullAll` (the library behind `gh pull --all`).
  - Exit 0 and exit 2 pass; attention items are listed in the notes. Exit 1 refuses.
  - Then, for each local objective: a TRD file with no issue, a TRD issue with no file (`missing_local` or pull `orphan_trds`), an unlinked TRD issue, or an objective with TRDs but no issue each refuse `verify`.
- **Phase 5b:** kept-local files get a baseline, as described in the key decisions.
- **Hand-off (phase 6):** `0010.migrate(ctx)` runs in-process.
  - Its `changed` is merged into 0011's, and its notes are added.
  - `STORE_COMMIT_STEPS` is added if 0010's notes lack it, followed by the P7 `gh setup` order note.
  - A 0010 refusal stops with `handoff`.
- **`apply`:** records 0010 in the stamp when the hand-off applied it.
- **Removed:** the `not_implemented` code and `NOT_YET`.
- **`detect`:** unchanged apart from the `wiki/` exclusion in `unbaselined()`, which is what lets the completed state read "already on GitHub (backfill complete)".

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: drain, verify, hand-off (tests 1, 4) | `node --test .../0011-github-store-backfill.apply.test.cjs .../0011-github-store-backfill.test.cjs` (+ 0010-store-gitignore.test.cjs) | 0 | PASS (46/46) |
| 2: SC1 full run, pacing (tests 2-3) | `node --test .../0011-github-store-backfill.apply.test.cjs` | 0 | PASS (the SC1 test takes about 8 s of wall clock, on fake time) |
| 3: SC2 no-op, store-off parity (tests 5-6) | `node --test .../0011-github-store-backfill.apply.test.cjs .../upgrade.test.cjs` | 0 | PASS (42/42) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1, cd42ee76) | `node --test 0011...apply.test.cjs` | 1 | FAIL 2: the apply stopped `not_implemented` |
| GREEN (T1, 33aac936) | `node --test 0011...apply.test.cjs 0011...test.cjs 0010...test.cjs` | 0 | PASS 46/46 |
| RED (T2, 6df0445d) | `node --test --test-name-pattern "SC1\|^2:\|^3:" 0011...apply.test.cjs` | 0 | Green against T1's GREEN. The full-run defects (the wiki clone, kept-local files) had already been exposed by test 1 and fixed in 33aac936. The two failures seen while writing this test were bugs in the test: the Decision's blocked-by edge, and the quick task's summary comment. No `fix(51-07)` commit was needed. |
| RED (T3, 7027d723) | `node --test 0011...apply.test.cjs upgrade.test.cjs` | 0 | Green on the first run: `detect` needed no change beyond T1's `wiki/` exclusion. No fix commit. |
| REFACTOR | none | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../migrations/0011-github-store-backfill.apply.test.cjs` | 0 | PASS (8 tests including subtests) |
| regression | `node --test 0011...test.cjs 0010-store-gitignore.test.cjs gh-outbox-flush.test.cjs planning-import.test.cjs` (+ planning-import-backfill, gh-backfill-fixtures) | 0 | PASS 205/205 |
| full suite | `npm test` | 1 | 8382 tests: 8349 pass, 1 fail, 32 skipped. The one failure is the known pre-existing `handoff-e2e` MA-7 (doctl auth init). It is unrelated and was not fixed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 0010 refused every real backfill on the wiki clone.**
- **Found during:** Task 1 GREEN (test 1).
- **Issue:** `planning-paths` classifies `.planning/wiki/**` as cache, so 0010's `cacheBlockers` reported every wiki page as "not on GitHub yet (no baseline)". Nothing baselines the wiki clone, and gh-cache.listOwnedLocal already says it is "never a cache file". Every import pushes docs through that clone, so the hand-off could never pass.
- **Fix:** 0010 `cacheBlockers` and 0011 `unbaselined()` skip `wiki/`. 0010 is outside files_modified; the change is a one-line filter with a comment citing 51-07. The 0010 suite still passes.
- **Files modified:** 0010-store-gitignore.cjs, 0011-github-store-backfill.cjs
- **Commit:** 33aac936

**2. [Rule 1 - Bug] Kept-local files blocked the hand-off forever.**
- **Found during:** Task 1 GREEN (test 1).
- **Issue:** The fixture's DECISION-001 has no `trd:`, so `planImport` keeps it local and nothing baselines it. 0010 refused it. Research OQ5 assumed kept-local items "block nothing", and SC1 requires the fixture to complete with the cache untracked.
- **Fix:** Phase 5b, described in the key decisions.
- **Commit:** 33aac936

**3. [Plan] The 51-06 tests 6-8 pinned `not_implemented`.**
- **Fix:** In the GREEN commit, as the TRD directs.
  - Tests 6 and 7 hold the drain at `maxOps: 0` and expect `pending` / `max_ops`; their switch, queue and no-re-import assertions are unchanged.
  - Test 8 (empty plan) now runs every phase and expects `applied: true`.
- **Commit:** 33aac936

### Notes

- **TRD test 4 setup:** a first apply at `maxOps: 0` queues everything. A second apply at `maxOps: queued - 1` leaves only the last history close. The test then deletes TRD 1-01's issue, links and comments from the fake, and the third apply refuses `verify` naming `01-01-step-01-TRD.md`.
- **Test 2, apply #1:** called through `apply` directly so the refusal object can be asserted. An immediate runner re-run checks that the runner reports `failed`, makes no write inside the spent hour, and stamps nothing. Between apply #1 and apply #2, `nextRun` resets the gh client (a new process gets a new 450-write budget) on the same fake and clock.
- **Observed, not changed (for 51-10 or a follow-up):** after a drained import of the 2-objective fixture, `gh pull --all` lists `objectives/01-objective-01/OBJECTIVE.md` as an orphan even though objective 1's issue exists. Objective 2's OBJECTIVE.md is not listed. OBJECTIVE.md comes from a wiki page, so objective 1's page is probably not pushed or not mapped. It is an attention item (exit 2), not a verify gap.
- **Edit gate:** no write was denied, so no skill marker was set.

## Post-TRD Verification

- Auto-fix cycles used: 2 (the wiki clone and kept-local files, both in T1 GREEN)
- Must-haves verified: 6/6
  - drain continue/stop rules and the refusal shapes (tests 2 and 4; halted is 51-08's)
  - verify refuses on a missing TRD issue, and 0010 does not run (test 4)
  - hand-off returns 0010's changed/notes plus the commit steps and the P7 note (test 1)
  - SC1 end state (test 2)
  - pacing (test 3)
  - SC2 and store-off parity (tests 5-6)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.apply.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
- FOUND commits: cd42ee76, 33aac936, 6df0445d, 7027d723
