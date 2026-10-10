---
objective: 75-prospective-estimate-retest-and-todo-sweep
job: "02"
subsystem: upgrade
tags: [upgrade, migrations, 0002, 0008, 0012, git-mv, runtime-state, dup-detect]

requires:
  - objective: 72-rename-to-aoforge
    provides: migration 0012 (planning-dir move) and the 72-25 fleet sweep that found both defects
  - objective: 44-runtime-state
    provides: migration 0008 and its isRuntimeStatePath predicate that the upgrade hook and doctor reuse
provides:
  - "0012 stages only the removals the run itself made (tracked, missing from disk, inside ctx.changedSoFar) before git mv, so 0002 + 0012 in one upgrade run no longer fails with `bad source`"
  - "0008 covers .dup-detect-log.jsonl and, after the dotfile audit, .check-todos-cache.json, .deprecation-log.jsonl and .override-log.jsonl"
  - "A recorded audit of every dotfile the runtime writes under the planning directory (table below), which 75-04 cites"
affects: [75-04-todo-sweep, 75-05-coverage-and-close-out]

tech-stack:
  added: []
  patterns:
    - "A migration reuses the runner's changedSoFar predicate for both its dirty guard and its staging rule, so the two can never disagree about what 'the run's own change' means"
    - "Existing .gitignore-body expectations derive from RUNTIME_STATE_FILES, so growing the basename list no longer edits them"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0008-runtime-state-untrack.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/upgrade-fixtures.cjs

key-decisions:
  - "0012 fixes the general case (any earlier migration's own deletions), not 0002: 0002 also runs outside git and on untracked JOB.md files, so it keeps fs.renameSync"
  - "Only removals inside ctx.changedSoFar are staged. A file the user deleted still defers the move as `dirty` and is never staged"
  - "If staging leaves git tracking nothing under the legacy directory, 0012 falls back to the fs rename (git mv cannot move an untracked directory)"
  - "Three audited dotfiles joined 0008's list under the TRD's own step-2 rule; the notices store, skill and edit markers and autonomous markers stay with their own owners"
  - "TODO-01 is NOT marked complete by this TRD: both todos' fleet steps need a release and per-repository approval, and are 75-04's re-scope"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 88min
completed: 2026-10-10
tokens_input: 13581976
tokens_output: 79191
tokens_cache_read: 12553100
tokens_cache_write: 1028700
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 75 TRD 02: Two upgrade migration defects from the 72-25 fleet sweep Summary

One upgrade run on a legacy repository that tracks `NN-JOB.md` files now takes 0002 and 0012 through together, and `.dup-detect-log.jsonl` (plus three other local runtime dotfiles) no longer blocks or pollutes an upgrade. Only the code steps of the two todos are done; the fleet steps wait for a release and per-repository approval.

## Progress
- [x] Task 1: Hand-built fixture builders for the two cases — 165a01ed
- [x] Task 2: 0012 stages the run's own removals before git mv (cases 1-5) — c1080db5 (RED 92e5e671)
- [x] Task 3: 0008 covers .dup-detect-log.jsonl (cases 6-10) and the audited dotfiles — db76dcb0 (RED 58bea6e7), dfb15a97 (RED 985ca558)

## What changed, per todo

**Todo 1, `fix-0012-failing-after-0002-in-the-same-upgrade-run-then-finish-or-undo-trades`** (code step 1 done)
- `0012-planning-dir-move.cjs`: new `stageOwnRemovals(ctx)` runs `git ls-files --deleted` under the legacy directory, keeps the paths `changedSoFarPredicate(ctx)` says this run changed, and stages them with `git --literal-pathspecs rm --cached` before `git mv`. `moveDirectory` now returns `{ via, staged }`; `apply` returns `staged` and names the staged paths in `notes`. The header comment states the one exception to "never stages anything beyond what git mv stages".
- Commits: RED `92e5e671`, GREEN `c1080db5`. Fixtures `165a01ed`.
- `git rm --cached` worked, so the TRD's `git update-index --remove` fallback was not needed.

**Todo 2, `make-migration-0008-gitignore-and-untrack-dup-detect-log-jsonl`** (code steps 1 and 2 done)
- `0008-runtime-state-untrack.cjs`: `RUNTIME_STATE_BASENAMES` now holds six names. `RUNTIME_STATE_FILES`, `GLOB_PATHSPECS`, `ALL_ROOT_FILES`, `isRuntimeStatePath`, the upgrade hook's dirty-before exemption (`runtimeStatePredicate`) and doctor check 20 all derive from it, so no hook or doctor edit was needed.
- Commits: RED `58bea6e7` and GREEN `db76dcb0` (dup-detect log); RED `985ca558` and GREEN `dfb15a97` (audited dotfiles).

## Dotfile audit (todo 2, step 2)

Every dotfile the runtime writes under the planning directory, with its writer and decision. Evidence: the writers' own code and this repository's `.gitignore`, which already lists the local ones.

| Dotfile | Writer | Lifecycle | Decision |
|---|---|---|---|
| `.progress-guard.json` | guard-no-progress.js | rewritten on every tool call | already in 0008 |
| `.awareness-cache.json` | awareness-cache-populate.js | refreshed each session | already in 0008 |
| `.dup-detect-log.jsonl` | dup-detect.cjs `recordResolution` | appended per resolution | added (todo step 1, case 6-10) |
| `.check-todos-cache.json` | check-todos.cjs, read by init.cjs | cache rewritten, 10 minute TTL | runtime state, added (test 12a) |
| `.deprecation-log.jsonl` | skill-route.cjs | appended local audit trail, gitignored by locked decision | runtime state, added (test 12b) |
| `.override-log.jsonl` | override.cjs | appended, bounded to 500 entries | runtime state, added (test 12c) |
| `.gh-mapping.json` | gh-mapping.cjs | the GitHub issue mapping; tracked in this repository | committed by design, left (test 12d) |
| `.gh-sync-state.json` | sync-state.cjs | last-synced GitHub state for drift detection; not ignored here | left. Not shown to be per-machine, so it needs a human call (open question for 75-04) |
| `.micro-description` | micro.cjs | transient, removed by micro commit and abort | left (test 12d) |
| `.adopt-inferences.json` | adopt.cjs | one-shot; adopt excludes it from its own commit (`TRANSIENT_COMMIT_EXCLUDES`) | left (test 12d) |
| `.aoforge-notices.json` / legacy `.devflow-notices.json` | notices.cjs | queue pruned after 7 days; adopt also treats it as transient | left. The upgrade hook writes it around the same run, so it was not widened here (test 12d) |
| `.skill-active`, `.edit-override` | skill and edit-gate markers | session-local | left. `validate health` E006/W064 and doctor check 23 own them (test 12d) |
| `.autonomous-retry-*`, `.autonomous-resume-*` | verify-commits.js, now in `~/.claude/aoforge/state/hook-markers/` | legacy markers only | left. Doctor check 20 owns the legacy copies |
| `.verb-writes.json`, `.base.json`, `.cache.json` | planning-ledger.cjs, gh-outbox.cjs | live under `~/.claude/aoforge/state/`, not the planning directory | not applicable |
| `.legacy-state-migrated.json`, `.last-prune.json`, `.registry.json` | runtime home | outside the project | not applicable |
| `.mcp.json` | stack-mcp.cjs | repository root, opt-in, committed | not applicable |

## What remains for the fleet (75-04 re-scopes these)

- **Todo 1.** Redo trades after a release and a runtime re-sync, with a fresh approval: re-check it is clean, `aof-tools upgrade --apply --path ~/dev/trades`, then `aof-tools --cwd ~/dev/trades commit "chore: move to AOForge (3.0.0 upgrade)" --files <changed_files>`. recycling-oracle no longer hits `bad source` through the SessionStart hook once the fix ships, so the todo's two-step workaround and the `AOFORGE_SKIP_UPGRADE=1` advice go away.
- **Todo 2.** After a release, devflowops and eden-biz become movable without anyone touching the log; eden-press and aoinference will have the log ignored instead of swept into an upgrade commit. EdenDocs already committed the log (121d2b35aa8): `git rm --cached .aoforge/.dup-detect-log.jsonl` there needs the user's approval.
- Neither fix reaches a project until the bundled runtime is released and re-synced: the hook and doctor run the bundled aof-tools.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders | `node --test` on the 0012 legacy, 0008 and 0002 suites (47 tests, the same count as before the edit) and `rename-guard.repo.test.cjs` (20) | 0 | PASS |
| 2: 0012 stages own removals | `node --test` on the 0012 legacy, 0002 and upgrade suites (61 tests) and `rename-guard.repo.test.cjs` | 0 | PASS |
| 3: 0008 covers the log and audited files | `node --test` on the 0008, 0012 legacy and 0002 suites (61 tests); upgrade-project hook suites and doctor suites (122 tests; the one failure was my invocation passing a directory); `doctor-checks/*.test.cjs` (258) | 0 | PASS |
| Final scoped | `node --test` on the 0008, 0012 legacy and 0002 suites plus `rename-guard.repo.test.cjs` and `doc-refs.repo.test.cjs` (99 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (92e5e671) | `node --test .../0012-planning-dir-move.legacy.test.cjs`: 10a, 10b, 10d failed with `git mv ... failed: fatal: bad source`, 10c passed as the guard | 1 | FAIL (correct) |
| GREEN (c1080db5) | same, plus 0002 and upgrade suites: 61 pass | 0 | PASS (correct) |
| RED (58bea6e7) | `node --test .../0008-runtime-state-untrack.test.cjs`: 6, 7a, 7b, 8, 10 failed; the 0012 legacy suite's 10e failed with `deferred: dirty` on `.dup-detect-log.jsonl` | 1 | FAIL (correct) |
| GREEN (db76dcb0) | 0008, 0012 legacy and 0002 suites: 57 pass | 0 | PASS (correct) |
| RED (985ca558) | 0008 suite: 12a, 12b, 12c and five derived expectations failed; 12d passed as the guard | 1 | FAIL (correct) |
| GREEN (dfb15a97) | 0008, 0012 legacy and 0002 suites: 61 pass | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the 0008, 0012 legacy and 0002 suites, rename guard and doc-refs | 0 | PASS (99 tests) |
| test (full) | `npm test` | 1 | FAIL, pre-existing and environmental: 12472 pass, 13 fail, 84 skipped |

The 13 failures are all `aoforge-watch` daemon and handoff end-to-end tests (`aoforge-watch.test.cjs`, `lib/watcher-state.test.cjs`, `lib/file-identities.legacy.test.cjs`, `handoff-e2e.test.cjs`). In this environment the daemon never starts (`PID file should be created`, `kill ESRCH`). The same files fail on the unmodified base commit 5a9b8551, extracted to the scratchpad and run there (9 and 5 failures across two runs; the exact set varies with timing). None touch migrations, upgrade, hooks or doctor. No failure outside the watch and handoff daemon tests.

## Discovered commands

None. `npm test` and the scoped `node --test {files}` form come from the general stack profile and `package.json`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing tests hard-coded the old two-item list**
- **Found during:** Task 3, first GREEN run
- **Issue:** `RUNTIME_STATE_FILES`, `RUNTIME_STATE_BASENAMES` and the `.gitignore` bodies in 6a, 6c and 6d asserted exactly two entries. Adding a basename legitimately changes all of them; the TRD's recovery note anticipated this.
- **Fix:** Updated with comments naming 75-02. After the audit additions the `.gitignore` expectations derive from `RUNTIME_STATE_FILES` (an `ALL_RUNTIME` constant), so a later addition does not edit them again.
- **Files modified:** `0008-runtime-state-untrack.test.cjs`
- **Commits:** db76dcb0, 985ca558

**2. [Judgement under the TRD's step-2 rule] Three basenames added beyond the dup-detect log**
- The TRD says to add files that are appended or rewritten at runtime on every machine and never shared, each with a named test. `.check-todos-cache.json`, `.deprecation-log.jsonl` and `.override-log.jsonl` meet it and are already ignored in this repository's own `.gitignore`. The notices store and the markers were left with their owners.
- **Consequence:** the `.gitignore` block 0008 writes into every project it applies to grows from two lines to six. Worth a CHANGELOG line (75-05).
- **Commits:** 985ca558, dfb15a97

**3. [Test detail] 10b adds only the reported paths that still exist**
- `git add` rejects a pathspec that matches nothing, and the legacy directory is gone from disk with its removals already staged. Production commits through `aof-tools commit --files`, which handles staged removals. The test asserts the final tree (`git status --porcelain` empty), as the TRD's gotcha asks.

**4. [Scope] Two docs left stale on purpose**
- `docs/USER-GUIDE.md` line 378 and `CLAUDE.md` line 63 name 0008's old two-file list. Neither is in this TRD's file list, so they are flagged for 75-05's close-out rather than edited from a parallel worktree.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (both-pending run applies both; own removals only; 0008 covers the log; 0008 + 0012 together move instead of deferring; every new test was RED before its fix)
- Gate failures: full `npm test` has 13 pre-existing, environmental watch/handoff daemon failures, identical on the base commit

## Self-Check: PASSED

All six modified files and this SUMMARY exist. Commits 165a01ed, 92e5e671, c1080db5, 58bea6e7, db76dcb0, 985ca558 and dfb15a97 are in `git log`, each RED commit before its GREEN commit.
