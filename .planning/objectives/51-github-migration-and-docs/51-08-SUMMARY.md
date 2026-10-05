---
objective: 51-github-migration-and-docs
trd: "08"
subsystem: migrations
tags: [upgrade, migration-0011, backfill, store-mode, outbox, resume, e2e, seam-guard, tdd]

requires:
  - objective: 51-github-migration-and-docs
    provides: "51-04 0010 deferral; 51-05 planImport estimate; 51-06/51-07 migration 0011 phases 0-6"
provides:
  - "SC1 resume scenarios: maxOps, offline, lost mapping, secondary limit (slept through / outlasting the retries), remote-edit halt + accept-remote, G4 bare --apply --confirm"
  - "a CLI end to end through child df-tools processes against a stateful gh PATH shim"
  - "0011 phase 3b: a mapping that lost entries is re-adopted from GitHub by devflow:id marker on a resume"
  - "0011 queue phase: a remote-edit base for every objective issue the import wrote live"
  - "0011 phase 4b: an objective body that lost its devflow:dir marker gets its derived sections re-queued"
  - "seam guard over migrations/0011 (no child_process, no ghWrite(, no runGh()"
affects: [51-09, 51-10]

tech-stack:
  added: []
  patterns:
    - "end-state equality by devflow:id (stateOf) against an uninterrupted control run, plus a successful-write recorder (no create sent twice, same write count)"
    - "stateful gh PATH shim: each gh process replays the recorded successful writes into a fresh gh-fake, answers, records"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "A lost .gh-mapping.json is repaired in 0011 (phase 3b, on a resume only), not in the flusher: one paginated list per DevFlow label, reads only; an entry the mapping still has wins; an id two issues claim is left out (its ops block and the drain halts for a human)."
  - "Objective issues created live by planImport get their remote-edit base in the queue phase (one list of the objective label). Without it the first queued body patch adopted whatever GitHub held, so a human edit between runs was merged over silently instead of halting."
  - "After --accept-remote drops an objective's body patch, the objective loses its devflow:dir marker and gh pull cannot place its TRDs. Phase 4b re-queues the same patch-body (gh-hierarchy.buildOps) with no caller sections, so wiki/trds/meta come back and the accepted summary edit survives."
  - "0011 reads git through objective-branch.runGit (the named git seam) with the redirect variables unset, so the migration spawns nothing."
  - "The CLI e2e uses ONE objective, not three: the child process paces writes on the real clock (>= 1 s apart), so three objectives would cost ~2 min of sleeps. One objective is ~50 writes and ~56 s."

requirements-completed: [GMD-01, GMD-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 3
  tdd_evidence: true
  test_pairing: true

duration: 75min
completed: 2026-10-01
tokens_input: 18491660
tokens_output: 103611
tokens_cache_read: 18231064
tokens_cache_write: 260400
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 08: backfill resilience and CLI end to end (SC1 resume) Summary

**The backfill now survives every interruption the research named. It drives end to end through the real `df-tools` CLI. Four defects in 0011 turned up along the way and are fixed.**
- Each scenario interrupts the backfill one way, resumes it through the upgrade runner, and compares GitHub with an uninterrupted control run by `devflow:id`.
- Every scenario sends no create twice. The scenarios that do not lose the mapping also send exactly as many successful writes as the control.

## What was built

**`migrations/0011-github-store-backfill.resume.test.cjs`** (8 tests plus the shared control run, on the 2-objective fixture of 70 ops):
- **1:** `maxOps: 40` stops `pending` with 40 done and the rest pending. The resume skips the import (the journal's last seq is unchanged) and ends equal to the control.
- **2:** GitHub goes offline after the third TRD create. The apply stops `pending` ("GitHub could not be reached"). Back online, it completes.
- **3:** `.gh-mapping.json` is deleted after a partial run. The resume re-adopts the issues by marker and completes with the control's issue count.
- **4a:** a secondary limit with `retry-after: 30` is slept through by the client. The limit is met once and no done op is re-sent.
- **4b:** a 120 s secondary limit outlasts the client's 4 retries. The op stays pending with `retry_after`, the stop says "GitHub rate limited the writes" with a resume time, and the resume after the clock moves completes.
- **5:** a human rewrites objective 2's managed summary between runs. The next apply stops `halted` with `gh outbox status` / `gh outbox resolve <seq> --accept-remote` guidance; `.gitignore` is unchanged and 0010 never applies. An apply before resolving writes nothing. After `resolveHalt(..., 'accept-remote')`, the next apply completes, keeps the human's edit and restores the `devflow:dir` marker.
- **6 (G4):** an interrupted store-on project, then a bare `upgrade.apply({confirm:true})`. 0010 is skipped with a reason naming 0011, 0011 completes, both are stamped, and the end state equals the control.

**`gh-backfill.e2e.test.cjs`** (test 7) runs child `df-tools` processes against a stateful `gh` PATH shim, on the 1-objective fixture:
- **The shim:** each call replays the recorded writes into a fresh `gh-fake`, and `offlineAfterWrites` simulates an outage.
- **Check:** `upgrade --check` (JSON) lists 0011 in `pending_confirm` with a reason containing `writes`. `--raw` prints the "needs confirmation (…0011)" summary.
- **Dry run:** `planning import --dry-run` prints `estimate:`.
- **Offline:** offline after 20 writes, `upgrade --apply --only 0011 --confirm` exits 1 and prints the resume command.
- **Online:** the same command exits 0, with only `.planning/config.json` tracked, `DEVFLOW_SKIP_GH_GATE=1` in the notes, one Objective issue and five TRD issues.
- **Re-run:** a second `--check` no longer lists 0011.

**`gh-seam.repo.test.cjs`:** `migrations/0011-github-store-backfill.cjs` is in `GUARDED` and `NO_DIRECT_WRITE`. The new test 24b checks that 0011 has no `child_process`, `ghWrite(` or `runGh(`.

**0011 fixes:** see Deviations 1-4.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: interruption, lost mapping, secondary limit (tests 1-4) | `node --test .../migrations/0011-github-store-backfill.resume.test.cjs` | 0 | PASS (6/6 incl. control) |
| 2: halt and runner resume (tests 5-6) | `node --test .../0011-github-store-backfill.resume.test.cjs .../0010-store-gitignore.test.cjs` | 0 | PASS (resume 9/9, 72/72 with the 0011/0010/backfill regression) |
| 3: CLI end to end and seam guard (tests 7-8) | `node --test .../gh-backfill.e2e.test.cjs .../gh-seam.repo.test.cjs` | 0 | PASS (e2e ~56 s; seam 12/12) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1, 198fd623) | `node --test 0011...resume.test.cjs` | 1 | FAIL 2: test 3 halted (`TRD 2-04 has no issue yet`), and 4b reported "the drain used all 20 of its flushes". Tests 1, 2 and 4a passed on the first run (no code commit needed for them). |
| GREEN (T1, 688fe6a4) | `node --test 0011 resume/test/apply + 0010` | 0 | PASS 57/57 |
| RED (T2, e972c7b1) | `node --test --test-name-pattern "^(5\|6):" 0011...resume.test.cjs` (fix stashed) | 1 | FAIL 1: test 5 never halted, because the edit was adopted. Test 6 (G4) passed on the first run: 51-04's deferral holds. |
| GREEN (T2, c6094d47) | `node --test 0011 resume/test/apply + 0010 + planning-import-backfill + gh-backfill-fixtures` | 0 | PASS 72/72 |
| RED (T3, 0e27d6db) | `node --test gh-seam.repo.test.cjs gh-backfill.e2e.test.cjs` | 1 | FAIL 2: seam 20 and 24b, because 0011 spawned git. The e2e (7) passed on the first run once the test's own `--raw` usage was right. |
| GREEN (T3, a54be166) | `node --test 0011 resume/apply + 0010 + e2e + seam + objective-branch` | 0 | PASS 76/76 |
| REFACTOR | none | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../0011-github-store-backfill.resume.test.cjs .../gh-backfill.e2e.test.cjs` | 0 | PASS |
| regression | `node --test .../0011-github-store-backfill.test.cjs .../0011-github-store-backfill.apply.test.cjs .../gh-seam.repo.test.cjs` | 0 | PASS (SC1 20-objective run included) |
| full suite | `npm test` (worktree) | 1 | 8392 tests: 8333 pass, 9 fail, 50 skipped. All 9 failures are the known worktree-only devflow-watch / handoff-e2e daemon tests (no node-pty). They are unrelated and were not fixed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A lost mapping halted the resume.**
- **Found during:** Task 1 (test 3).
- **Issue:** `upsert-issue` re-finds an issue by marker, but `block`, `link-sub-issue`, `upsert-comment`, `patch-issue`, `set-fields` and `patch-body` resolve ids only through the mapping. The op blocked with "TRD 2-04 has no issue yet; run gh sync first" and the drain halted.
- **Fix:** 0011 phase 3b, `readoptMapping` (described under key decisions).
- **Commit:** 688fe6a4

**2. [Rule 1 - Bug] A long retry-after was misreported.**
- **Found during:** Task 1 (test 4b).
- **Issue:** `exhausted` treated any `rate_limited` / `retry_after` / minute-budget stop as "the drain used all 20 of its flushes", even when the loop broke after one round.
- **Fix:** `exhausted` is now `round === DRAIN_ROUNDS`. The stop says "GitHub rate limited the writes" and resumes at `retry_after`.
- **Commit:** 688fe6a4

**3. [Rule 1 - Bug] A human edit between runs was merged over silently.**
- **Found during:** Task 2 (test 5).
- **Issue:** objective issues are created live by planImport and get no remote-edit base until their first patch-body. That patch adopted the human-edited body instead of halting.
- **Fix:** `recordObjectiveBases` in the queue phase. Then, after `--accept-remote` dropped the body patch whole, the objective had no `devflow:dir` marker and verify refused its TRDs ("no objective to place it under"). Phase 4b, `repairObjectiveBodies`, re-queues the derived-only patch-body and drains it.
- **Commit:** c6094d47

**4. [Rule 3 - Blocking] 0011 spawned git, which breaks the must-have "spawns neither gh nor git".**
- **Found during:** Task 3 (seam guard test 20).
- **Fix:** git reads go through `objective-branch.runGit`.
- **Commit:** a54be166

### Plan adjustments

**5. The TRD's regexes do not match the real argv or output.**
- `failNext(/POST .*issues$/...)` does not match the real argv (`api --method POST repos/o/r/issues --input -`). The tests use an argv matcher (`ISSUE_CREATE`) instead.
- For `upgrade`, `--raw` prints the one-line summary and no flag prints JSON; for `planning import`, `--raw` prints JSON. Test 7 asserts each command's real form.

**6. The CLI e2e uses `objectives: 1`, not 3.** The reason is real-clock write pacing in the child process (see key decisions).

**7. Test 5's human edit keeps the `devflow:id` marker.** It rewrites only the summary section. A body with no marker is no longer a DevFlow issue: after accept-remote, verify correctly refuses its TRDs. The test documents this in a comment.

**8. Test 1's write equality is exact.** The interrupted run sends as many successful writes as the control, so no done op is re-sent. Test 3 (lost mapping) asserts only the end state and that no create was sent twice.

### Notes

- **A halted journal before it is resolved:** `upgrade --apply --only 0011 --confirm` fails on 0010 first, with "outbox: halted (remote-edit)". `--confirm` selects every applicable confirm migration, and 51-04 deliberately keeps 0010 applicable on a halt. Nothing is written. 0010's refusal points at `planning import` / `outbox flush` rather than `gh outbox resolve`, so its guidance is weaker than 0011's. Left for 51-10 to consider.
- **The runner's `--only X --confirm`** still selects every applicable confirm migration, not just X. This is existing behaviour and is not changed here.
- **Stray SUMMARY copy:** the SUMMARY was written straight into the worktree and committed there. `summary post` was not run, so no stray copy exists in the main checkout.

## Post-TRD Verification

- Auto-fix cycles used: 3 (T1 lost mapping + retry-after; T2 objective bases + repair; T3 git seam)
- Must-haves verified: 7/7
  - maxOps resume (1)
  - lost mapping (3)
  - secondary limit (4a/4b)
  - remote-edit halt + accept-remote (5)
  - G4 (6)
  - CLI through the shim (7)
  - seam guard (24b + 20)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.resume.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-backfill.e2e.test.cjs
- FOUND commits: 198fd623, 688fe6a4, e972c7b1, c6094d47, 0e27d6db, a54be166
