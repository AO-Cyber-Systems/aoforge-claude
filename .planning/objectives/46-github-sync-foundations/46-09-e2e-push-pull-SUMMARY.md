---
objective: 46-github-sync-foundations
trd: "09"
subsystem: github-sync
tags: [gh, e2e, push-pull, mapping-v3, markers, rate-limit, legacy-mapping, tdd]
requires: [46-06-pull-syncstate-rewire, 46-07-sync-core-rewire, 46-08-command-surface]
provides:
  - "gh-e2e.test.cjs: success criteria 1-4 as named end-to-end tests on one stateful fake GitHub, plus the legacy mapping-shape x command matrix"
  - "gh-fake `now` option and `writeTimes()`: write timestamps on the caller's clock, for pacing assertions"
  - "syncObjective records GitHub's real updatedAt as the sync-state baseline (pull after push reports no drift)"
affects: [46-10-sync-step-and-docs]
tech-stack:
  added: []
  patterns:
    - "One `gh._setRunGh(fake.runGh)` call drives gh.cjs, gh-pull.cjs and every gh-* module through the gh-client seam"
    - "Fake clock via gh-client _setNow/_setSleep; the fake stamps each call with the same clock"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
decisions:
  - "Push records the issue's real GitHub updatedAt (one extra `issue view --json updatedAt` read after the last write) as sync-state gh_updated_at. A failed read falls back to local now with a warning, so the sync still succeeds."
  - "Only updatedAt is taken from the live read. label_set, milestone, assignees and status keep their 46-07 values; widening the baseline is a separate decision."
  - "The fake is extended with an optional `now` clock rather than wrapping runGh in the test, so the fake stays the only thing installed on the seam."
requirements-completed: [GSF-01, GSF-02, GSF-06, GSF-08]
metrics:
  duration: "~10 min"
  completed: 2026-09-30
---

# Objective 46 TRD 09: End-to-end push -> pull on one fake GitHub Summary

**Result:** Success criteria 1-4 are each demonstrated by a named, passing end-to-end test on one fake GitHub. The scenario pushes with `sync --all`, acts with `comment` and `close-issue`, reads back with `pull`, loses the mapping, takes a human edit, and hits a secondary rate limit. It found one product defect, fixed under TDD: push recorded local "now" as the sync-state `gh_updated_at`, so every pull after a push reported drift. Push now records GitHub's own `updatedAt`.

## Commits

| Phase | Commit | Message |
|---|---|---|
| fixture | b20490c | test(46-09): gh-fake stamps writes with the caller's clock (writeTimes) for pacing assertions |
| Task 1 RED | 5227825 | test(46-09): add failing e2e push/pull scenario (SC1 pull finds push's baseline with no drift) and lost-mapping tests 1-5 |
| defect RED | fd40ba7 | test(46-09): add failing test that push records GitHub's real updatedAt as the sync-state baseline |
| defect GREEN | e7d18f3 | fix(46-09): push records GitHub's real updatedAt as the sync-state baseline so pull after push reports no drift |
| Task 2 | e9de556 | test(46-09): e2e human-edit, secondary rate limit, legacy mapping matrix and disabled scenarios (SC3, SC4) |

## Test to success-criterion map (`gh-e2e.test.cjs`)

| TRD test | Test name | Criterion |
|---|---|---|
| 1 | `sync --all` pushes both objectives; mapping v3, frontmatter and sync-state share the ids | setup for SC1 |
| 2 | (SC1) sync-objectives, pull (any spelling), comment and close-issue all resolve the same issue | **SC1** |
| 3 | drift round trip, label added on GitHub shows in pull, `--apply` writes it | SC1 (pull side) |
| 4 | (SC2) losing `.gh-mapping.json` and `.gh-sync-state.json` re-syncs onto the same issues, zero creates | **SC2** |
| 5 | (SC2) losing the mapping and the `github_issue` refs still finds the issues by marker | **SC2** |
| 6 | (SC3) human text above, between and below the managed sections survives two syncs byte for byte | **SC3** |
| 7 | (SC4) a secondary-limit 403 mid-run is retried after `retry-after`; writes at least 1000 ms apart | **SC4** |
| 8 | legacy matrix: v1 and v2 x `sync`, `comment`, `close-issue`, `pull` x objectives `2` and `2.1` (16 tests) | SC1 for legacy mappings |
| 9 | `github.enabled:false`: `sync --all`, `sync 2`, `comment`, `close-issue`, `pull` skipped, exit 0, zero gh calls | GSF-08 gate |

What each scenario test asserts beyond the TRD text:
- **Test 2** also runs the deprecated `sync-objectives` alias: zero creates, mapping file byte-identical. Every `issue view` from `pull 02-a` and `pull 2` targets `o/r` issue 1. Comments go to issues 1 and 2, and `close-issue 2` closes only issue 1.
- **Test 4** runs after issue 1 was closed in test 2, so it also proves the marker scan covers closed issues. The rebuilt mapping has the same numbers as before the delete.
- **Test 6** compares the body with the managed blocks masked out before and after the sync. That is the byte-for-byte check. The second sync leaves the body identical and sends no `issue edit` for issue 1.
- **Test 7** checks the recorded sleeps include 3000 ms, the rejected `issue edit` and its retry are at least 3000 ms apart, and every write in the run is at least 1000 ms after the previous one. The timestamps come from the fake, not from wrapping the seam.
- **Test 8** has every argv scanned for `[object Object]` in the shared teardown. Each test touches only the expected issue number. After `sync`, the mapping file is v3.

## Deviations from Plan

**1. [Rule 1 - Bug] Push recorded local "now" as the sync-state baseline, so every pull after a push reported drift**
- **Found during:** Task 1, test 2. `pull 02-a` returned `drift: true` with `first_sync: false` straight after `sync --all`. The baseline was found, but `gh_updated_at` was local time (`nowIso`).
- **Cause:** `detectDrift` and the conflict detector compare `ghIssue.updatedAt` to `gh_updated_at` verbatim. The two never matched, so the "GitHub unchanged since last sync" shortcut could not apply. This was flagged as an open question in the 46-07 SUMMARY.
- **Fix:** `gh.cjs` `syncObjective` step 11 reads `issue view N --json updatedAt` after the last write and records that value. A failed or unparsable read falls back to local now and adds the warning `sync-state baseline uses local time: could not read updatedAt for #N`. Only `updatedAt` changed; `label_set`, `milestone`, `assignees` and `status` are as before.
- **Tests:** gh-sync.test 3b (baseline equals the issue's `updatedAt`) and 3c (failed read degrades with a warning). Both failed at RED (fd40ba7), and e2e test 2 was RED at 5227825.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.cjs`
- **Commit:** e7d18f3

**2. [Rule 3 - Blocking] gh-fake extended with an optional clock**
- **Found during:** Task 2. Test 7 needs write timestamps in fake time. The TRD allows extending the fake.
- **Fix:** `createFakeGitHub({now})` stamps each call with `now()`, and `writeTimes()` returns the stamps of the mutating calls, aligned with `writes()`. Test 8g in `gh-fake.test.cjs` was written first (RED) and committed with the change in b20490c.

**3. Test order differs from the TRD list.** The TRD runs `comment`, then `pull`, then `close-issue`. Here `pull` runs before `comment` and `close-issue`. A comment or a close advances the issue's `updatedAt` on GitHub, and disk frontmatter carries none of the pulled fields (`status`, `labels`, `assignees`, `milestone`), so a pull after a comment correctly reports drift. "No drift" is asserted straight after a push; the later drift in test 3 is asserted deliberately. This is gh-pull's existing design, not changed here.

**4. Scope notes.**
- **Test 6 placement:** the "above" human paragraph is placed above the `devflow:id` marker line, not just above the first section. It survived, so the marker scan does not depend on the marker being on line 1.
- **Test 8 size:** the matrix also covers objective `2.1` (issue 2), so it is 16 tests rather than 8.
- **ROADMAP fixture:** it carries the TRD's `## Milestones` section with v1.4 in progress. No test asserts the milestone itself; 46-07 covers that.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: tests 1-5 | `node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` | 0 (tests 1-5 green after e7d18f3) | PASS |
| 2: tests 6-9 | `node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` | 0 (24 tests: 8 scenario + 16 matrix, 0 fail) | PASS |
| defect fix | `node --test gh-sync gh-e2e gh-commands gh gh-pull` test files | 0 (200 tests, 196 pass, 0 fail, 4 live-only skipped) | PASS |
| fake | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 (22 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (fake clock) | `node --test gh-fake.test.cjs` | 1 (`fake.writeTimes is not a function`) | FAIL (correct) |
| GREEN (fake clock) | `node --test gh-fake.test.cjs` | 0 (22/22) | PASS (correct) |
| RED (e2e SC1) | `node --test gh-e2e.test.cjs` | 1 (test 2: `pull 02-a` drift true) | FAIL (correct) |
| RED (unit) | `node --test --test-name-pattern="3b\|3c" gh-sync.test.cjs` | 1 (both fail) | FAIL (correct) |
| GREEN | `node --test gh-sync gh-e2e gh-commands gh gh-pull` | 0 (0 fail) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` | 0 (24 pass) | PASS |
| seam check | `rg -n "setRunGh" plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` | only `gh._setRunGh(fake.runGh)` and `gh._setRunGh(null)` (plus a comment) | PASS |
| full suite | `npm test` | 0: 6173 tests, 6140 pass, 0 fail, 33 skipped | PASS |

The accepted flakes (MA-7, J1 tui, 45-02 test 10) did not fail on this run.

## Post-TRD Verification

- Auto-fix cycles used: 0 beyond the one defect fix above.
- Must-haves verified: 5/5.
  - Same issue everywhere and pull finds push's baseline: test 2.
  - Zero creates after losing the mapping and sync-state: tests 4 and 5.
  - A human edit survives two syncs byte for byte: test 6.
  - A 403 secondary limit is retried after `retry-after`, with writes at least 1000 ms apart: test 7.
  - v1 and v2 legacy files hit the right issue and no argv carries `[object Object]`: test 8.
- Gate failures: none.

## Notes for 46-10

- The real `updatedAt` read adds one `issue view` read call per synced objective. `--all` with N objectives makes N extra reads, and none are paced writes.
- `gh sync` results now carry a `sync-state baseline uses local time` warning only when that read fails.

## Self-Check: PASSED

- `gh-e2e.test.cjs` exists and ran green alone and in the full suite.
- All five commits (b20490c, 5227825, fd40ba7, e7d18f3, e9de556) are in `git log 0ead7d4..HEAD`.
- The unrelated untracked files (docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, references/codex-agent-policy.md and the .gitkeep files) were not staged.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched; the orchestrator reconciles them. Requirements to mark complete: GSF-01, GSF-02, GSF-06, GSF-08.
