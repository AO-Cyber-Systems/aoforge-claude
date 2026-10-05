---
objective: 53-worktree-and-health-hygiene
job: "02"
subsystem: df-tools planning readers
tags: [summary-pairing, validate-health, objective-job-index, gate-executor-stop, trdKey]

requires:
  - objective: 52-store-mode-polish
    provides: the executors and `summary post` that write NN-MM-SUMMARY.md beside named TRDs
provides:
  - "helpers.trdKey: one NN-MM pairing key for TRD/JOB/SUMMARY file names"
  - "validate health I001, the consistency orphan warning, objective-job-index has_summary, find-objective incomplete_jobs, verify objective-completeness and gate-executor-stop summaryExists all pair on that key"
  - "summary-pairing.test.cjs: six readers agree on one fixture"
affects: [execute-objective resume and completion, validate health, gate-executor-stop]

tech-stack:
  added: []
  patterns: ["pair TRD and SUMMARY on the extracted NN-MM key, never on string prefix"]

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/helpers.cjs
    - plugins/devflow/devflow/bin/lib/helpers.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs
    - plugins/devflow/devflow/bin/lib/verify.cjs
    - plugins/devflow/hooks/gate-executor-stop.js
    - plugins/devflow/hooks/gate-executor-stop.test.js

key-decisions:
  - "trdKey is exported from helpers.cjs; the hook inlines its own regex so it stays self-contained and fast"
  - "Reported id shapes are unchanged: job-index `id` and verify `incomplete_jobs` stay stripPlanSuffix names, `orphan_summaries` stay summary names minus -SUMMARY.md; only the comparison moved to the key"
  - "The consistency orphan warning now names the summary file as it exists, so a long-name orphan reads correctly"
  - "gate-executor-stop keeps the exact <id>-SUMMARY.md existsSync path first and uses readdir only as the fallback, so old fsImpl mocks keep working"

requirements-completed: ["53-2"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 23min
completed: 2026-10-04
tokens_input: 9505860
tokens_output: 57216
tokens_cache_read: 9210436
tokens_cache_write: 295286
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 53 TRD 02: One rule for which TRDs have a summary Summary

**A shared `trdKey` (the `NN-MM` prefix) now pairs `NN-MM-<slug>-TRD.md` with `NN-MM-SUMMARY.md` or `NN-MM-<slug>-SUMMARY.md` in validate health, the consistency check, objective-job-index, find-objective, verify objective-completeness and gate-executor-stop, matching roadmap-reconcile.**

## Progress
- [x] Task 1: trdKey helper; health I001, consistency and objective-job-index pair on it — RED 3f8f4425, GREEN 3235b127
- [x] Task 2: find-objective, verify objective-completeness and gate-executor-stop agree — RED 463a435e, GREEN ce4b6832

## Accomplishments

- Added `trdKey(filename)` to `helpers.cjs` (regex `^(\d+(?:\.\d+)?-\d+)(?:-.+)?-(?:TRD|JOB|SUMMARY)\.md$`, case-insensitive, legacy suffix-strip fallback for names without an `NN-MM` prefix). `07-1-x-TRD.md` and `07-10-SUMMARY.md` key differently, so there is no string-prefix pairing.
- `validate health` Check 7 (I001) and the `validate consistency` orphan-summary warning pair on the key.
- `objective-job-index` computes `has_summary` on the key. This was the serious one: execute-objective uses it for resume and completion, and it reported `has_summary: false` for every completed named TRD. The checkpoint rule (`_isCheckpointOnlySummary`) is untouched: a short-name SUMMARY with `## Progress` and no `## Self-Check` is still `has_summary: false`.
- `findObjectiveInternal` (`incomplete_jobs`) and `verify objective-completeness` (incomplete plans, orphan summaries) pair on the key.
- `gate-executor-stop.js` `summaryExists` accepts `<id>-SUMMARY.md` and `<id>-<slug>-SUMMARY.md` via an inline regex with an escaped id; `blockReason` and `summaryRelPath` are unchanged.
- `summary-pairing.test.cjs` runs health, objective-job-index, find-objective, verify objective-completeness, validate consistency, roadmap-reconcile `_checkSummaryExists` and the hook on one fixture and asserts they agree on which TRDs have a summary.

## This repo, smoke (Test list item 7)

`validate health` I001 count over this repo's `.planning/`, before (home mirror 2.12.0, unfixed engine, run against this worktree) and after (repo df-tools at ce4b6832):

| | I001 total | Objectives 47-52 | Objective 53 |
|---|---|---|---|
| Before | 151 | 81 | 7 |
| After | 13 | 0 | 6 |

The 13 left are real missing summaries: objective 09 (`09-03-cli-skill-and-integration-TRD.md`, 1), the `UI-VISUAL-EVAL-*` dirs (6), and objective 53's six TRDs still to run (53-02 now has its summary). The TRD quoted 145 lines; this run counted 151, and that count includes objective 53's own seven TRDs. I did not reconcile the difference further.

`objective-job-index 52`, before and after:

| TRD | Before | After |
|---|---|---|
| 52-01-commit-follow-ups | false | true |
| 52-02-gate-remedies | false | true |
| 52-03-micro-store-mode | false | true |
| 52-04-mirror-only-opt-out | false | true |
| 52-05-multiline-decision-answer | false | true |
| 52-06-docs-and-full-suite | false | true |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: trdKey; health, consistency, job-index | `node --test helpers.test.cjs validate.test.cjs validate-gh-health.test.cjs` (124 tests) | 0 | PASS |
| 1: existing job-index CLI tests unchanged | `node --test --test-name-pattern="objective-job-index" df-tools.test.cjs` (13 tests) | 0 | PASS |
| 2: find-objective, completeness, hook | `node --test summary-pairing.test.cjs objective.test.cjs gate-executor-stop.test.js roadmap-reconcile.test.cjs` (179 tests) | 0 | PASS |
| 2: other CLI tests on the changed readers | `node --test --test-name-pattern="completeness\|find-objective\|consistency\|init execute-objective\|incomplete" df-tools.test.cjs` (7 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test helpers.test.cjs`, `validate.test.cjs --test-name-pattern=53-02`, `summary-pairing.test.cjs` | 1 | FAIL (correct): trdKey undefined, 2a/2e-decimal/3a/3c, health/job-index/consistency/checkpoint/decimal agreement assertions |
| GREEN (task 1) | same files plus `validate-gh-health.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern=53-02 objective.test.cjs gate-executor-stop.test.js` | 1 | FAIL (correct): named-TRD/short-summary in incomplete_jobs, named and decimal summaryExists |
| GREEN (task 2) | the four-file verify command | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 1, scoped) | `node --test {files}` per the task `<verify>` | 0 | PASS |
| test (task 2, scoped) | `node --test {files}` per the task `<verify>` | 0 | PASS |
| test (objective gate) | `npm test` | not run | not_available: runs once in 53-07 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preflight ran against the wrong checkout on the first attempt**
- **Found during:** repo_base_preflight
- **Issue:** The first `exec-context check` ran with the Bash cwd on the main checkout, so it reported SHARED INDEX against 53-01's claim. The dispatch said to run it from the worktree; that was my omission, not a dispatch defect.
- **Fix:** Re-ran it with the global `--cwd` flag pointing at the worktree. It returned `ok: true`, `base_visible: true`, `is_worktree: true`. No other executor's claim was released or touched.

**2. [Rule 1 - Test adjustment] `find-objective` has no `incomplete_jobs` field**
- **Found during:** writing the agreement test
- **Issue:** The test list names `find-objective 07`'s `incomplete_jobs`, but the CLI `find-objective` returns only `jobs` and `summaries`. `incomplete_jobs` comes from `findObjectiveInternal` (via `searchObjectiveInDir`), which `init execute-objective` reads.
- **Fix:** The agreement test and `objective.test.cjs` call `findObjectiveInternal` directly. The reader the TRD cares about is the one changed.

**3. [Rule 1 - Test fix] Consistency tests first parsed `passed` as JSON**
- **Found during:** Task 1 RED
- **Issue:** `cmdValidateConsistency(root, true)` prints the raw word, not the report.
- **Fix:** The tests pass `raw=false`. Done before the RED commit.

None of these changed production behaviour beyond the TRD.

## Notes for the orchestrator

- Used the repo df-tools (`plugins/devflow/devflow/bin/df-tools.cjs`) for `commit`, `state` and `roadmap`. The SUMMARY was written straight into this worktree's objective directory; the `summary` verb was not called, so no stray copy was left in the main checkout.
- `state advance-job` and `state update-progress` were no-ops (`reason: last_job`, `Progress field not found`): STATE.md is the narrative style with no current-job or progress fields. `state record-metric` takes `--job` in this build, not `--trd`.
- `requirements mark-complete 53-2` reported `REQUIREMENTS.md not found` (no top-level file in this repo), so requirement 53-2 was not ticked anywhere.
- `roadmap update-job-progress 53` ticked the 53-02 checkbox and set the table row to `1/7 In Progress`. It counted only this worktree's SUMMARY, so expect that line and the STATE.md session lines to conflict with the sibling TRDs at merge.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (health, job-index, find-objective/completeness/consistency, hook, agreement test, legacy shapes)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/summary-pairing.test.cjs
- FOUND: trdKey exported from helpers.cjs and wired into validate.cjs, misc.cjs, objective.cjs and verify.cjs
- FOUND: gate-executor-stop.js summaryExists widened
- FOUND commits: 3f8f4425, 3235b127, 463a435e, ce4b6832
