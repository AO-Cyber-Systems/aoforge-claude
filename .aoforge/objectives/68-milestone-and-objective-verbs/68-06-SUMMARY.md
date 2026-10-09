---
objective: 68-milestone-and-objective-verbs
trd: "06"
subsystem: planning-verbs
tags: [milestone, dry-run, store-mode, heading-rule]
requires:
  - 68-01 (text-escape.milestoneHeadingPattern, local milestone complete dry run)
  - 68-03 (unknown-flag guard accepts --dry-run on milestone complete)
provides:
  - "store-mode `milestone complete --dry-run`: previews the GitHub milestone close and the archives it would publish with zero gh calls"
  - "`milestone put` finds a version's MILESTONES.md entry with the shared heading rule (1.0 and v1.0 are one version, v1.0.1 is another)"
affects:
  - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
tech-stack:
  added: []
  patterns:
    - "dry-run return placed after the version check and before any gh-client call, computed from config and cache only"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
decisions:
  - "A store dry run's headline is suppressed when the result carries dry_run and prose, so stdout opens with the DRY RUN banner (as the local dry run does) rather than a misleading 'done (store mode).' line"
  - "entryWithHeading is exported so its behaviour (test 8) is tested directly"
metrics:
  duration: 8 min
  completed: 2026-10-08
requirements-completed: [TOOL-01, TOOL-02]
tokens_input: 4917716
tokens_output: 27062
tokens_cache_read: 4805155
tokens_cache_write: 112473
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 06: Store-mode `milestone complete --dry-run` and one MILESTONES.md heading rule Summary

**Store-mode `milestone complete <v> --dry-run` now previews the milestone close and archive publish with zero gh calls (offline-safe), and `milestone put` finds a version's MILESTONES.md entry with `milestoneHeadingPattern`, the same rule `milestone complete` uses.**

## Performance

- **Duration:** about 8 minutes
- **Tasks:** 2 of 2
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments

- `milestoneComplete(root, { version, dryRun: true })` in store mode returns `{ ok, mode: 'store', dry_run, version, milestone_title, would_close, would_publish, warnings: [], prose, exit: 0 }` straight after the version check and before `closeMilestone`. It reads only config (`milestoneTitleFor`) and the cache directory (`milestoneArchives`, the helper now shared with the real run), so it makes no gh call, queues no outbox op, writes no ledger entry and touches no cache file. It exits 0 offline, where the real run exits 1.
- `cmdMilestoneVerb`'s store branch passes `dryRun: has(rest, '--dry-run')`. 68-03's guard already accepted the flag there; it is no longer an accepted-but-ignored flag.
- `spliceMilestoneEntry` and `entryWithHeading` build their RegExp from `milestoneHeadingPattern(version)`. `milestone put v1.0` replaces a legacy `## 1.0 ...` section instead of adding a second entry and leaves a `## v1.0.1 ...` entry byte-identical. `escapeRegExp(version)` no longer appears in `planning-entity-verbs.cjs`.

## Task Commits

1. Task 1 RED: `227e046e` test(68-06): store-mode milestone complete --dry-run touches nothing
2. Task 1 GREEN: `3a038783` feat(68-06): milestone complete --dry-run in store mode previews without GitHub
3. Task 2 RED: `d0f5d379` test(68-06): milestone put treats 1.0 and v1.0 as one entry
4. Task 2 GREEN: `b735fdf0` fix(68-06): milestone put finds a version's entry with the shared heading rule

## Progress
- [x] Task 1: Store-mode dry run of milestone complete — 3a038783
- [x] Task 2: milestone put uses the shared heading rule — b735fdf0

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Store-mode dry run | `node --test planning-verbs-cli.test.cjs planning-entity-verbs.test.cjs` (RED: 3 failures, tests 1, 3, 4; GREEN: 34/34) | 0 | PASS |
| 2: shared heading rule | `node --test planning-entity-verbs.test.cjs milestone-complete.test.cjs planning-verbs-cli.test.cjs` (RED: tests 6 and 8 fail; GREEN: 65/65) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test planning-verbs-cli.test.cjs planning-entity-verbs.test.cjs --test-name-pattern=68-06` | 1 | FAIL (correct: `dry_run` undefined; CLI exit 1 offline from `closeMilestone`) |
| GREEN (task 1) | same files, full | 0 | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="68-06 #[678]" planning-entity-verbs.test.cjs` | 1 | FAIL (correct: two entries for 1.0; `## v1.0` prepended above `## 1.0 Old`) |
| GREEN (task 2) | scoped files, full | 0 | PASS (correct) |

Tests 5 and 7 and the offline control (CLI test 2) already passed at RED. They pin behaviour that must not change (a non-version still errors under `dryRun`; `v1.0.1` is not matched by `v1.0`; the real run reaches gh).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test planning-entity-verbs.test.cjs planning-verbs-cli.test.cjs milestone-complete.test.cjs` | 0 | PASS (65/65) |
| test | `npm test` | 1 | PASS at baseline (11 failures, all known/environmental, see below) |

Full suite: 11252 tests, 11191 pass, 11 fail. The failures are the devflow-watch daemon and handoff e2e tests (9, known environment failures), E2E1 reconcile, and `50-06 5b` in `misc-commit-gate.test.cjs`. E2E1 reports the 68-06 ROADMAP checkbox as unticked now that a SUMMARY exists; `roadmap update-job-progress` closes that. `5b` passes (28/28) when `misc-commit-gate.test.cjs` runs alone, so it is load-dependent flakiness in the full run and unrelated to this change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Store dry-run headline would read "done (store mode)."**
- **Found during:** Task 1 GREEN
- **Issue:** `headline()` prints `milestone complete: done (store mode).` for any ok result without `rel`. Above a `DRY RUN` banner that reads as if the milestone had been closed.
- **Fix:** `headline()` returns null when `res.dry_run === true && res.prose`, so stdout opens with `DRY RUN — nothing has been modified.`. CLI test 3 asserts the first stdout line.
- **Files modified:** `planning-verbs-cli.cjs`, `planning-verbs-cli.test.cjs`
- **Commit:** `3a038783`

**2. [Rule 3 - Blocking] `entryWithHeading` was not exported**
- **Found during:** Task 2 RED
- **Issue:** Test 8 calls `entryWithHeading` directly and the module did not export it.
- **Fix:** Added it to `module.exports` (no behaviour change), committed with the RED tests.
- **Files modified:** `planning-entity-verbs.cjs`
- **Commit:** `d0f5d379`

The `escapeRegExp` import in `planning-entity-verbs.cjs` was replaced by `milestoneHeadingPattern` because it had no other use.

## Auth gates

None.

## Discovered commands

None (the general profile's `test` command `npm test` and scoped `node --test {files}` were used as given).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (store dry run reports and touches nothing; offline success against the offline-failing real run; `milestone put` uses `milestoneHeadingPattern`; 48-12 milestone and planning-verbs-cli test 7 cases pass unchanged)
- Gate failures: none attributable to this TRD (see Validation Gate Results)

## Self-Check: PASSED

- Commits `227e046e`, `3a038783`, `d0f5d379`, `b735fdf0` exist.
- All four files in `key-files.modified` changed since `b1210f7f` (`git diff --stat`).
- `rg "escapeRegExp\(version\)" planning-entity-verbs.cjs` finds nothing.
