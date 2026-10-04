---
objective: 51-github-migration-and-docs
trd: "06"
subsystem: migrations
tags: [upgrade, migration-0011, backfill, store-mode, outbox, preflight, tdd]

requires:
  - objective: 51-github-migration-and-docs
    provides: "51-02 useBackfillEnv / makeBackfillProject; 51-03 gh-backfill hasPendingOps / recordLiveWrites / renderEstimate; 51-04 0010 deferral; 51-05 planImport {dryRun, noFlush}, report.estimate / history / preview"
provides:
  - "migration 0011-github-store-backfill (confirm, since 2.13.0): detect, apply, migrate (phases 0-3), preflightLocal, preflightRemote, ensureStoreSwitch, queue"
  - "an offline detect whose reason is the backfill plan summary (counts, history closes, renderEstimate, the `planning import --dry-run` pointer)"
  - "a zero-write dry run (`ctx.dryRun`) whose notes are the full plan plus any blocker apply would refuse on today"
  - "typed stops: apply throws err.refusal = {code, details, notes, ...}; codes preflight and not_implemented used here"
affects: [51-07, 51-08, 51-09, 51-10]

tech-stack:
  added: []
  patterns:
    - "re-entrant phase machine over library calls; the journal and the cache index are the only state"
    - "detect reads the journal raw (outbox.status would quarantine a corrupt journal, a write)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-backfill-fixtures.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-enforcement-parity.test.cjs

key-decisions:
  - "A disabled wiki refuses in the remote preflight, with 'enable it (Settings > General > Features > Wikis), create its first page'. The TRD test list and research section 7 name hasWiki:false as a refusal. The store's degraded `docs/devflow/` mode is not used for a backfill."
  - "ensureStoreSwitch takes its own upgrade.backup (plus `0011-config.json.before`) when it flips the switch. The runner's report.backup never reaches a migration's ctx, so this is how the rollback note can name an exact path. On a resumed run the note names the repo's backup directory instead."
  - "Phase 0 (local preflight) also runs in the dry run, and its blockers are listed under 'apply would refuse now'. The dry run never refuses."
  - "Refusals carry every detail in the one-line `refused` message, which the runner reports. The not_implemented stop's details hold the queue note, the switch note, the P5 partial-window note, the rollback note and 'drain lands in TRD 51-07'. The will-stay-local table (OQ5) goes in `notes`."
  - "detect with the store on: a pending/blocked/halted/unreadable journal → applies (resume); else un-baselined cache files → applies (plan summary); else 0010 still applies → applies (the hand-off is ahead); else 'already on GitHub (backfill complete)'."
  - "The legacy-name and journal blockers are implemented locally. 0010 does not export them, and this TRD does not edit 0010."

requirements-completed: [GMD-01, GMD-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-10-01
---

# Objective 51 TRD 06: migration 0011, part 1 (detect, dry run, preflight, switch, queue) Summary

**`0011-github-store-backfill` is a confirm-only migration.**
- **`upgrade --check`** shows the backfill plan and its request estimate. It makes no gh call and writes nothing.
- **A dry run** prints the full plan (counts, estimate, history closes, the will-stay-local table, and any blocker an apply would refuse on today) and writes nothing.
- **An apply** first refuses on every local blocker, then on every remote blocker, listing each with its fix. Next it flips `github.store` on, after a backup. It then queues the whole backfill exactly once, and a resume skips the import while ops are pending. Live creates are booked into the journal's budget window.
- **The rest (drain, verify, 0010 hand-off)** is 51-07's. Until then the apply stops with the typed code `not_implemented`.

## What was built

`migrations/0011-github-store-backfill.cjs`:

- **detect** (offline, zero gh calls, no writes):
  - `client.requireEnabled` is the gate. When GitHub is disabled or `github.repo` is unset, it returns `applies:false` with the reason `GitHub integration not enabled (...)`.
  - **Store off:** the reason is the plan sentence built from `planImport({dryRun:true})`, for example: `GitHub backfill not started (github.store is off): 20 objectives, 100 TRDs and N history closes to put on GitHub: ~770 writes (upper bound) in 623 ops; ...; K files will stay local. Full plan: \`df-tools planning import --dry-run\`; run it with \`df-tools upgrade --apply --only 0011 --confirm\`.`
  - **Store on:** see the key decisions above. The journal is read raw and is never quarantined.
- **migrate** (phases 0-3):
  - The gate runs first, then one `planImport` dry run.
  - **Phase 0:** `preflightLocal`. The dry run returns `planText(plan, blockers)`.
  - **Phase 1:** `preflightRemote`.
  - **Phase 2:** `ensureStoreSwitch`.
  - **Phase 3:** `queue`.
  - It then stops with `not_implemented`.
- **preflightLocal** returns every blocker:
  - not a git work tree;
  - a merge, rebase, cherry-pick or revert in progress (per-worktree git dir);
  - a halted, blocked or unreadable journal;
  - legacy-named TRDs, with the rename;
  - TRDs over `gh-trd.TRD_MAX_CHARS` (60,000), read from `planImport`'s `refused`, with the split hint;
  - a plan that cannot be computed.
- **preflightRemote** (GitHub reads only):
  - `gh.requireGhAuth(['repo'])` (offline reported as offline);
  - `ghCapability.detectCapabilities(main, {refresh:true})`;
  - `resolveModes(...).writable`;
  - the wiki states disabled, uninitialised and unavailable, each with its fix.
- **ensureStoreSwitch:**
  - A no-op when `planningMode.isStoreMode` is already true.
  - Otherwise it backs up, then rewrites config.json with `github.store = true`. The key order, the indent and the trailing newline are kept.
- **queue:**
  - When `backfill.hasPendingOps(main).any`, it skips (P3).
  - Otherwise it measures `client.writeCount()` before and after `planImport(main, {noFlush:true})`, then calls `backfill.recordLiveWrites(main, delta, now)`. `now` is `ctx.options.now`, else `client.now()`.
  - A `planImport` error becomes a `preflight` stop that also carries the switch and rollback notes.
- **apply** throws `Error(res.refused)` with `err.refusal = res` on any stop, as 0010 does, so the runner marks the migration failed and never stamps it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: contract, detect, dry run (tests 1-3) | `node --test .../migrations/0011-github-store-backfill.test.cjs .../upgrade.test.cjs` (+ gh-backfill-fixtures.test.cjs) | 0 | PASS (49/49) |
| 2: preflight (tests 4-5) | `node --test .../migrations/0011-github-store-backfill.test.cjs .../migrations/0010-store-gitignore.test.cjs` | 0 | PASS (41/41) |
| 3: store switch and queue (tests 6-8) | `node --test .../migrations/0011-github-store-backfill.test.cjs .../planning-import-backfill.test.cjs` (+ the regression gates) | 0 | PASS (112/112) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1, 3b377c9c) | `node --test 0011...test.cjs gh-backfill-fixtures.test.cjs` | 1 | FAIL 7 (module missing; the fixture's pending_confirm is now `['0011']`) |
| GREEN (T1, a27fe0d2) | `node --test 0011...test.cjs upgrade.test.cjs gh-backfill-fixtures.test.cjs` | 0 | PASS 49/49 |
| RED (T2, 5dc64b59) | `node --test 0011...test.cjs` | 1 | FAIL 11 (tests 4a-4g, 5a-5d) |
| GREEN (T2, 164b2e1d) | `node --test 0011...test.cjs 0010-store-gitignore.test.cjs` | 0 | PASS 41/41 |
| RED (T3, 6b19e450) | `node --test --test-name-pattern "^(6\|7\|8):" 0011...test.cjs` | 1 | FAIL 3 |
| GREEN (T3, 0a8ca9ab) | `node --test 0011 planning-import-backfill upgrade upgrade-cli 0010 gh-backfill-fixtures` | 0 | PASS 112/112 |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs` | 0 | PASS (20/20) |
| regression | `node --test upgrade.test.cjs upgrade-cli.test.cjs migrations/0010-store-gitignore.test.cjs` (run with 0011, planning-import-backfill and gh-backfill-fixtures: 112/112) | 0 | PASS |
| full suite | `npm test` | 1 | 8375 tests, 8342 pass, 1 fail, 32 skipped. The one failure is the known pre-existing `handoff-e2e.test.cjs` MA-7 (doctl auth init); it is unrelated and was not fixed. The first full run found 3 more failures, which deviation 3 fixed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The 51-02 fixture test pinned `pending_confirm: []`.**
- **Found during:** Task 1 RED.
- **Issue:** `gh-backfill-fixtures.test.cjs` test 3 asserts that `upgrade --check` on the fixture leaves nothing pending. The fixture has GitHub enabled with the store off, so 0011 is now pending_confirm by design.
- **Fix:** In the RED commit, the test now expects `['0011']`, with a comment. The TRD's done criterion allows this: "any test that pins the migration count or list is updated in the RED commit". The file is outside files_modified.
- **Commit:** 3b377c9c

**2. [Rule 1 - Bug in my test] Test 6 counted entity closes as history closes.**
- **Found during:** Task 3 GREEN.
- **Issue:** The count was 14 closes where 12 were expected. The completed todo's close and the quick task's close are `patch-issue` closes that the import queues, not history.
- **Fix:** The test's `TRD_CLOSE` predicate now requires an `NN-MM` target id.
- **Commit:** 0a8ca9ab

**3. [Rule 3 - Blocking] Validate and parity tests pinned the W040 output that 0011 now changes.**
- **Found during:** the full `npm test` run after Task 3.
- **Issue:** Three tests pin `validate health` output: `validate.test.cjs` 9 (github enabled, store absent) and 12 (store on, un-baselined), and `gh-enforcement-parity.test.cjs` 8c ("nothing a github block adds"). Check 13 calls `upgrade.check`, and 0011 applies to those shapes by design (must-have: store off applies; store on with un-baselined cache files applies). So W040 gains "1 need confirmation".
- **Fix:** Test 9 expects W001+W040 (`0 pending, 1 need confirmation`) only for the github-enabled shape. The no-github and github-disabled shapes keep the old pin. Test 12 expects W040 alongside W056. Test 8c asserts the confirm count is the baseline's +1 and everything else is identical.
- **Commit:** 9eddabe6
- **For the orchestrator / 51-10:** a project that enables GitHub only for the objective-46 sync, and never wants the store, now gets a permanent W040 and a doctor check-21 warning naming 0011. The confirm migration 0006 behaves the same way. It follows from the TRD's must-have (`applies:true` when the store is off). If it is unwanted, a follow-up could add an opt-out such as `github.store: false` written explicitly. That is not changed here.

### Notes

- **Edit gate:** this session had no `.planning/.skill-active` marker, and the first Write was denied. I ran `df-tools skill-active --start execute-objective`, the mechanism the gate names for a running skill. The marker is a gitignored runtime file.
- **`snapshot()` is a local test helper:** the TRD's test 3 says "`snapshot()` unchanged", but the fake GitHub has no `snapshot()`. The test hashes every project file outside `.git/`, and also checks that the hermetic outbox dir stays empty.
- **Wiki with no first page:** this is simulated as `DEVFLOW_WIKI_REMOTE = wiki.missingUrl`, which gh-wiki classifies as `uninitialised`. A `wikiSeed: {}` remote still has an empty commit and probes `ok`.

## For 51-07

- Replace the `not_implemented` stop at the end of `migrate` with phases 4-6: drain, verify and the 0010 hand-off.
  - `ctx.options.{now, sleep, maxOps}` is read only by `nowOf` so far.
  - `stop(code, details, {changed, notes})` and `NOT_YET` are the pieces to change.
  - Test 6's `not_implemented` assertion and test 8's `res.code` assertion need updating.
- `0010.STORE_COMMIT_STEPS` is exported for printing after the hand-off.

## Post-TRD Verification

- Auto-fix cycles used: 2 (the test predicate in Task 3; the validate/parity pins after the full suite)
- Must-haves verified: 7/7
  - registry contract (test 1)
  - offline detect and matrix (2a-2d)
  - plan-summary reason (2b)
  - zero-write dry run (3)
  - every preflight blocker with its fix (4a-4g, 5a-5c)
  - switch + queue once with live writes booked (6, 7)
  - empty plan (8)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
- FOUND: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
- FOUND commits: 3b377c9c, a27fe0d2, 5dc64b59, 164b2e1d, 6b19e450, 0a8ca9ab, 9eddabe6
