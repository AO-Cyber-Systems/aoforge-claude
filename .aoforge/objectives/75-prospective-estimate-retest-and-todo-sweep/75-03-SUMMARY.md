---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-03"
subsystem: roadmap-reconcile
tags: [reconcile, summary-completion, progress-checkpoint, todo-01]
requires: []
provides:
  - "_summaryNotComplete also returns true for a progress checkpoint (unticked Progress task, no Self-Check)"
  - "summary-completion-fixtures.cjs: hand-built SUMMARY texts for every completion shape"
affects: [roadmap-reconcile, objective-complete, roadmap-analyze, state-advance-job]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/summary-completion-fixtures.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.cjs
    - plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs
    - plugins/aoforge/aoforge/bin/lib/objective.test.cjs
    - plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs
    - plugins/aoforge/aoforge/bin/lib/objective.cjs
    - plugins/aoforge/aoforge/bin/lib/roadmap.cjs
    - plugins/aoforge/aoforge/bin/lib/state.cjs
decisions:
  - "The rule is: an unticked task inside ## Progress and no ## Self-Check heading anywhere. A Self-Check verdict decides completion; all-ticked with no Self-Check (09-03) stays complete."
  - "No new export: the status rule and the progress rule are internal helpers behind the existing _summaryNotComplete, so EX1's locked list is unchanged."
metrics:
  duration: "about 90 minutes wall clock, most of it waiting on full-suite runs on a loaded machine"
  completed: 2026-10-10
tokens_input: 9756084
tokens_output: 52245
tokens_cache_read: 9027166
tokens_cache_write: 728768
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 75 TRD 03: A mid-TRD progress checkpoint is not a completed SUMMARY

One-liner: `_summaryNotComplete` now also treats a `summary checkpoint` file (an unticked `## Progress` task, no `## Self-Check`) as not complete, so reconcile, the roadmap counts, `objective complete` and `state advance-job` / `update-progress` all agree, and no recorded objective's count moves.

## Progress
- [x] Task 1: Hand-built SUMMARY completion fixtures — 8092b23c
- [x] Task 2: _summaryNotComplete recognises a progress checkpoint (cases 3-8) — RED ed1ef0f4, GREEN 73144415
- [x] Task 3: Repository regression proof (cases 1-2) — evidence only, recorded below, no commit needed

## What changed

`roadmap-reconcile.cjs`: `_summaryNotComplete` is now `_statusSaysNotComplete(text) || _progressCheckpointOnly(text)` after the existing non-string and empty guards. `_progressCheckpointOnly` returns false when a `## Self-Check` heading exists, otherwise reads the text from the `## Progress` heading to the next `## ` heading (or end of file) and returns true when that section has a `- [ ]` line. The heading regexes are copied from `token-coverage.cjs`, which is untouched. The JSDoc, the reconcile rule list (Rule 1b) and the module.exports banner name the new case.

Comment-only edits (no behaviour change), as the TRD allowed: `objective.cjs` (`completedSummaryFiles` JSDoc and the `objective complete` Jobs comment), `roadmap.cjs` (two comments), `state.cjs` (two comments). Each now says a progress checkpoint is also not completion.

Tests: the NC-P group (NC-P1 to NC-P10) in `roadmap-reconcile.test.cjs`, two `completedSummaryFiles` tests and an `objective complete` Jobs-count test in `objective.test.cjs`, and test 7c in `state-advance-job.test.cjs`. They use the Task 1 presets: `PROGRESS_CHECKPOINT` (72-26's shape), `COMPLETE_PASSED`, `COMPLETE_FAILED`, `COMPLETE_ALL_TICKED_NO_SELF_CHECK` (09-03's shape), `LEGACY_NO_PROGRESS`, `UNTICKED_OUTSIDE_PROGRESS`, `STATUS_DEFERRED` and `STATUS_CHECKPOINT`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "console.log(Object.keys(require('<abs>/summary-completion-fixtures.cjs')).join(' '))"`, then `node --test rename-guard.repo.test.cjs` | 0 / 0 | PASS (builder plus eight presets listed; rename guard 20 of 20) |
| 2: predicate | `node --test roadmap-reconcile.test.cjs objective.test.cjs state-advance-job.test.cjs roadmap.test.cjs state.test.cjs` | 0 | PASS (240 tests, 0 fail, E2E1 and EX1 included) |
| 3: regression proof | `roadmap analyze --raw` before and after, SUMMARY scan, `node --test --test-name-pattern E2E1 roadmap-reconcile.test.cjs` | 0 | PASS (see Repository regression proof) |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED | the three test files, run before the fix | 6 progress-checkpoint tests failed: NC-P1, NC-P7, NC-P8, the `objective complete` Jobs-count test, `completedSummaryFiles` keeps-PASSED test, 7c. All guard cases passed (NC-P2 to NC-P6, NC-P10, the legacy and unreadable `completedSummaryFiles` case) | FAIL (correct) |
| GREEN | the five scoped test files | 240 tests, 0 fail | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

The RED run's output was filtered through `grep`, so the process exit code was not captured. The failing and passing test names above are read from that output. A first RED run also showed NC-P9 failing; that was a defect in the test (a one-TRD objective that becomes all ticked also emits an `objective_rollup_status` change), fixed to assert on the `trd_*` change before the RED commit.

## Repository regression proof

Case 1, `roadmap analyze --raw` (repo copy, this worktree), saved before Task 2 and again after the fix: 11 objectives, every one identical in `job_count`, `summary_count`, `disk_status` and `roadmap_complete`, and the whole document byte-identical (`completed_objectives` 9, `total_jobs` 93, `total_summaries` 87, `progress_percent` 94). Objective 75 reads 0/5 in both, because this TRD's own checkpoint is excluded by the new rule. The baseline was taken before the first checkpoint SUMMARY was written into the tree.

Scan of every `*-SUMMARY.md` under `.aoforge/` with the new predicate: 577 files, 2 not complete.

| File | Reason |
|---|---|
| `.aoforge/objectives/74-operations-decisions/74-06-SUMMARY.md` | frontmatter `status: deferred` (objective 74's rule) |
| `.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-03-SUMMARY.md` | progress checkpoint (this TRD, in progress at scan time) |

No completed SUMMARY matches, including 09-03.

Case 2, E2E1 (reconcile dry run over this ROADMAP) run from the worktree with the in-progress checkpoint on disk: pass, zero drift. The todo's own failure reproduces on the pre-fix module (the RED commit, `ed1ef0f4`) over the same tree: one drift entry, `trd_summary_exists 75-03`, which would tick an unfinished TRD on `--apply`. After the fix there is none.

`git diff 5a9b8551..HEAD -- plugins/aoforge/aoforge/bin/lib/token-coverage.cjs` is empty, so the EST-09 measurement method has not moved.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over the five files above | 0 | PASS (240 of 240) |
| test (full) | `NODE_PATH=<main checkout>/node_modules npm test`, output to a file | 0 | PASS (12,569 tests, 12,537 pass, 0 fail, 32 skipped) |
| guards | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs` | 0 | PASS (38 of 38) |

## Discovered commands

None. The `test` command came from the general stack profile (`npm test`, scoped `node --test {files}`).

## Deviations from Plan

**1. [Rule 3 - Blocking] Full suite fails in a bare worktree: `node-pty` is not installed there**
- **Found during:** Task 2 gate (first full `npm test` from the worktree)
- **Issue:** 10 failures, 9 of them in `aoforge-watch.test.cjs` and `handoff-e2e.test.cjs`. The daemon exits with code 3 at startup (`Cannot find module 'node-pty'`) because the worktree has no `node_modules`; it is gitignored and exists only in the main checkout. The tenth, a merge-driver wave-merge test, passed when run alone and in later runs. At the wave base in the main checkout the same daemon files pass (46 of 46).
- **Fix:** nothing installed and no code changed. The affected files were re-run in the worktree with `NODE_PATH=<main checkout>/node_modules` (59 of 59 pass), then the full suite (0 fail). A first full run also showed `hook-coexistence.test.js` subprocess timeouts under load from the parallel wave suites; it passes alone (253 of 253).
- **Files modified:** none
- **Note for later waves:** a worktree-run full suite needs `node_modules` resolvable or it reports about nine false daemon failures.

**2. [Scope] Reconcile tests overwrite the fixture SUMMARY instead of extending `awareness-fixtures.cjs`**
- `awareness-fixtures.cjs` is not in this TRD's `files_modified`, so the NC-P reconcile tests build a project with `summary: 'present'` and then write the preset text over the SUMMARY file.

**3. [Detail] The `roadmap analyze` baseline was taken after Task 1, not at the start of Task 2**
- Task 1 only added a fixture module, so nothing in the analyze output could change. The baseline was still taken before the first checkpoint SUMMARY landed, which is what matters.

Otherwise the TRD was executed as written. No new export was needed, so EX1 was not changed.

## Auth gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (progress checkpoint is not completion evidence; all-ticked-no-Self-Check, PASSED, FAILED and frontmatter deferred/checkpoint unchanged; E2E1 zero drift and identical `roadmap analyze` counts; `token-coverage.cjs` untouched)
- Gate failures: none after Deviation 1 was explained and re-verified

## For 75-04

The todo `2026-10-09-make-roadmap-reconcile-treat-a-checkpoint-summary-no-self-check-as-incomplete` can be completed on this evidence. The fix is commit `73144415`, preceded by RED `ed1ef0f4` and fixtures `8092b23c`.

Commits: `8092b23c` (fixtures), `ed1ef0f4` (RED), `73144415` (fix).

## Self-Check: PASSED

- All eight files named in `key-files` exist.
- Commits `8092b23c`, `ed1ef0f4` and `73144415` exist.
- The scoped gate, the full suite and the rename and doc-refs guards ran green.
