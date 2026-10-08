---
objective: 66-executor-token-stamp
job: "01"
subsystem: estimation
tags: [tokens, coverage, df-tools, EST-09, read-only, forward-stamp]

requires:
  - objective: 57-token-usage
    provides: token-usage.cjs transcript index, tokensForTrd, tokenFrontmatterFields and the tokens CLI
provides:
  - "df-tools tokens coverage: read-only forward-stamp coverage (live/counted) over a milestone or an objective"
  - "lib/token-coverage.cjs: classifySummary, collectSummaries, coverageOf, explainMissing, formatCoverage, buildCoverage"
affects: [66-03, 66-04]

tech-stack:
  added: []
  patterns:
    - "exact fraction plus a decimal floored with integer arithmetic; target compared as live*100 >= 95*counted"
    - "lazy transcript index factory: the scan runs at most once and only when a SUMMARY is missing"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/token-coverage.cjs
    - plugins/devflow/devflow/bin/lib/token-coverage.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
    - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "A SUMMARY with no token fields is missing whether or not it has a Self-Check; only a Progress checkpoint without Self-Check is in_progress (listed, not counted)"
  - "token-coverage.cjs copies the 3-line filled/frontmatterOf helpers instead of importing token-backfill.cjs, so the read-only module never loads the writers"
  - "readRootFor (store mode: main checkout, local mode: the checkout holding cwd) is exported so the rule is unit-tested without a store-mode fixture"

requirements-completed: [EST-09]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-08
tokens_input: 13896449
tokens_output: 78458
tokens_cache_read: 13654407
tokens_cache_write: 241876
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 66 TRD 01: tokens coverage command Summary

**`df-tools tokens coverage` reports forward-stamp coverage (live / counted) for a milestone or an objective with an exact fraction, a decimal floored at 6 places, an integer 95% target check and a reason for every missing SUMMARY, and writes nothing.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-08T12:10:36Z
- **Completed:** 2026-10-08T12:25:00Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `lib/token-coverage.cjs` classifies every TRD SUMMARY exactly once (live, backfill, unlabeled, missing, in_progress), so the orchestrator-written 65-02 shape counts as missing and is never excluded.
- `ratio_text` is floored with integer arithmetic (37/39 prints 0.948717, 5/7 prints 0.714285) and `met` is `live * 100 >= 95 * counted`; no `toFixed`, `Math.round` or float comparison exists in the module.
- The `coverage` subcommand resolves the scope (current milestone by default, `--milestone`, or `--objective`, including archived objective directories), maps every usage problem to exit 1 and every report to exit 0.
- Missing entries carry `stamp_skipped` when an executor transcript of that TRD exists for the repository, else tokensForTrd's reason; the transcript index is built once and only when something is missing.

## Progress
- [x] Task 1: Hand-built coverage fixtures — a1e39b06
- [x] Task 2: token-coverage.cjs library (tests 8-14) — RED 151c9fee, GREEN c2de67b7
- [x] Task 3: tokens coverage subcommand, help and header (tests 1-7), smoke run — RED 22a0d6fe, GREEN bbc0d369

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Hand-built coverage fixtures | `node -e "...makeCoverageProject(V16_FIXTURE)...readdirSync(...)"` printed `65-release,66-stamp` | 0 | PASS |
| 2: token-coverage.cjs library | `node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` (26 tests, 0 skipped) | 0 | PASS |
| 3: tokens coverage subcommand | `node --test` on tokens-cli, token-coverage, help and dispatch-completeness tests (79 tests, 0 failed) | 0 | PASS |

## Task Commits

1. **Task 1: Hand-built coverage fixtures** - `a1e39b06` (test)
2. **Task 2: token-coverage library** - `151c9fee` (test, RED, module missing), `c2de67b7` (feat, GREEN)
3. **Task 3: tokens coverage subcommand** - `22a0d6fe` (test, RED, `unknown tokens subcommand "coverage"`), `bbc0d369` (feat, GREEN)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` | 0 | PASS |
| test (scoped, help and dispatch) | `node --test .../help.test.cjs .../dispatch-completeness.test.cjs` | 0 | PASS |
| test (full) | `npm test` from the worktree (11111 tests, 11050 pass, 50 skipped, 11 fail) | 1 | 10 `node-pty` environment failures plus E2E1 (passes after `roadmap update-job-progress`); none from this TRD |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (library) | `node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` | 1 | FAIL (correct): `Cannot find module './token-coverage.cjs'` |
| GREEN (library) | `node --test plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` | 0 | PASS (correct): 26/26 |
| RED (CLI) | `node --test --test-name-pattern "66-01 [0-9]" plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` | 1 | FAIL (correct): 10/10 failed, `unknown tokens subcommand "coverage"` |
| GREEN (CLI) | `node --test --test-name-pattern "66-01" plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` | 0 | PASS (correct): 10/10 |

No REFACTOR commit was needed.

## Smoke run on this repository

Run with the repository copy (the installed 2.14.0 runtime has no `coverage`), from the worktree at WAVE_BASE:

`node plugins/devflow/devflow/bin/df-tools.cjs tokens coverage --objective 65 --raw`

```
objective 65 forward-stamped 2/4 = 0.5 (target 95%: not met) · live 2 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)
  65-02 missing (no_transcript)
  65-03 missing (no_transcript)
```

This is exactly the line the TRD predicted, with no change to any test. `tokens coverage --milestone v1.6 --raw` printed
`v1.6 forward-stamped 2/4 = 0.5 (target 95%: not met) · live 2 · backfill 0 · unlabeled 0 · missing 2 · in progress 1 (not counted)`,
with `65-02` and `65-03` as `missing (no_transcript)` and `66-01 in progress` (this TRD's own checkpoint, as expected mid-run).

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (default scope is the current milestone; floored decimal and integer target; 65-02 shape is missing; missing reasons and read-only; scope flags and exit codes; the 65 and 66 smoke result)
- **Gate failures:** the full `npm test` shows 11 failures that this TRD did not cause: 10 `node-pty` daemon tests (environment) and 1 roadmap-reconcile check that passes after the roadmap update (see Issues Encountered)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/token-coverage.cjs` - classification, collection, fraction, missing reasons, text and report builder (read-only)
- `plugins/devflow/devflow/bin/lib/token-coverage.test.cjs` - in-process tests 8-14 (26 test cases)
- `plugins/devflow/devflow/bin/lib/__fixtures__/token-coverage-fixtures.cjs` - literal SUMMARY texts per class and a ROADMAP plus current and archived objective project
- `plugins/devflow/devflow/bin/lib/tokens-cli.cjs` - `coverage` subcommand, `runCoverage`, `readRootFor`, USAGE and parse messages
- `plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs` - end-to-end tests 1-7 plus help and `readRootFor` cases
- `plugins/devflow/devflow/bin/lib/help.cjs` - usage, summary and details for `tokens coverage`
- `plugins/devflow/devflow/bin/df-tools.cjs` - header usage lines only

## Decisions Made

- `SUMMARY.md` and `<anything>-SUMMARY.md` are both recognised as SUMMARY names so an unkeyed file is reported in `skipped` (`unkeyed`) instead of vanishing; a directory named like a SUMMARY is read as an `unreadable` missing entry.
- `--objective N` canonicalises the number (`04` becomes `4`) for the report, and searches current and archived objective directories.
- `--repo` decides which repository's transcripts are matched; the SUMMARYs are read from the checkout holding cwd (or the repository itself when cwd is outside any project).

## Deviations from Plan

None - TRD executed exactly as written. Three additions beyond the listed tests, all inside the TRD's files: a `66-01 5b` test (a `--repo` run from outside a project), a `66-01 8` help test and a `66-01 9` `readRootFor` test.

## Issues Encountered

- `npm test` from the worktree reports 11 failures. Ten are `node-pty` tests (`devflow-watch.test.cjs`, `handoff-e2e.test.cjs`): the daemon log shows `Cannot find module 'node-pty'` because the provisioned worktree has no `node_modules`; `devflow-watch.test.cjs` passes (22/22) in the main checkout at the same base commit. The eleventh, `roadmap-reconcile.test.cjs` E2E1, flags `66-01` as having a SUMMARY while its ROADMAP.md box is still unticked; `roadmap update-job-progress 66` ticked the box and the test then passed (1/1). That leaves ten failures, all `node-pty`.
- `micro.test.cjs` did not hang, so the documented exclusion was not needed.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All 7 files in `files_modified` exist and the 5 task commits (`a1e39b06`, `151c9fee`, `c2de67b7`, `22a0d6fe`, `bbc0d369`) are present in `git log`.

## Next Objective Readiness

66-03 can call `df-tools.cjs tokens coverage --objective <N> --raw` from its aggregate step, and 66-04 can run `tokens coverage --milestone v1.6` to record the EST-09 number. The command only reads, so it can run at any point of a wave.
