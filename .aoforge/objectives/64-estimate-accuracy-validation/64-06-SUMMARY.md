---
objective: 64-estimate-accuracy-validation
trd: "06"
subsystem: estimation
tags: [estimate, backtest, EST-08, docs, changelog, full-suite]

requires:
  - objective: 64-estimate-accuracy-validation (64-02)
    provides: run history and the done-objective `--all` text fix
  - objective: 64-estimate-accuracy-validation (64-04)
    provides: the `estimate backtest` verb
  - objective: 64-estimate-accuracy-validation (64-05)
    provides: the EST-08 verdict (not met) and 64-ACCURACY-REPORT.md

provides:
  - "CHANGELOG [Unreleased], USER-GUIDE Estimates and CLAUDE.md Estimation data describe estimate backtest, the run history and the measured out-of-sample result (EST-08 not met)"
  - "Full npm test evidence for objective 64: 10963 tests, 10929 pass, 0 fail, 34 skipped"

affects: [objective 64 completion]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md

key-decisions:
  - "The docs quote 64-05's primary verdict only (EST-08 not met, minutes median ratio 1.51, cost 0.86); the 42-58 window diagnostic that prints met is not presented as a result"
  - "The USER-GUIDE tells readers to read the minutes median as an upper estimate and to recheck with `estimate backtest` on the next five objectives; it does not claim the estimator was fixed"

patterns-established: []

requirements-completed: []  # EST-08 not met: no mark-complete

verification:
  gates_defined: 1
  gates_passed: 1           # npm test exit 0 (10963 tests, 0 fail), second run
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 8min
completed: 2026-10-07
tokens_input: 4188420
tokens_output: 23918
tokens_cache_read: 4095143
tokens_cache_write: 93191
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 06: Docs and full suite Summary

**CHANGELOG, USER-GUIDE and CLAUDE.md now document `df-tools estimate backtest`, the run history and the out-of-sample result (EST-08 not met: minutes median ratio 1.51, cost 0.86), and the full `npm test` run is green: 10963 tests, 10929 pass, 0 fail, 34 skipped.**

## Performance

- **Duration:** about 8 min (two `npm test` runs of about 2.5 min each included)
- **Started:** 2026-10-07T12:50:31Z (preflight claim)
- **Completed:** 2026-10-07
- **Tasks:** 2 of 2
- **Files modified:** 3 repository files (CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md) plus ROADMAP.md and STATE via the state verbs; no production code

## Progress
- [x] Task 1: CHANGELOG, USER-GUIDE and CLAUDE.md describe the backtest, the run history and the measured result — df31e730
- [x] Task 2: Full test suite — no commit (evidence only; the objective's code needed no fix)

## What was documented

- **CHANGELOG `[Unreleased]`.** Under `### Added`: the `estimate backtest` verb (`lib/estimate-backtest.cjs`), the run history and richer run state (`lib/estimate-run-store.cjs`), one entry for the Objective 64 out-of-sample result (59 to 63, 41 TRDs: agent minutes median ratio 1.51 with 2 of 5 objectives within ±30%; cost 0.86 with 4 of 5; P90 covers 5 of 5 objectives and 40 of 41 TRDs for minutes, 4 of 5 and 34 of 41 for cost; EST-08 **not met**; report path; the two follow-up todos) and the token backfill of 40 SUMMARYs. Under `### Fixed`: `estimate objective N --all --line|--table` on a done objective prints the estimate.
- **USER-GUIDE `### Estimates`.** The command block gained the `estimate backtest 59,60,61,62,63` line. The `objective` bullet lost the `all TRDs done` caveat for `--all`. The `Run state` bullet names the history directory and which commands archive. A new `backtest` bullet states what is compared, `prospective` vs `reconstructed`, the fixed rules, named exclusions and `--raw`. The `What is assumed` bullet keeps the in-sample sentence and replaces "Objective 64 tests the method out of sample" with the measured result and the report path.
- **CLAUDE.md `Estimation data`.** One bullet: `estimate backtest <N[,N...]>`, the run history under `history/<repo-key>/`, and `estimate-backtest.cjs` in the "Implemented in" list.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: docs | `rg -n "estimate backtest" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds each file (1, 4, 1 matches); `rg -n "Objective 64 tests the method out of sample" docs/USER-GUIDE.md` finds nothing; `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` (21 tests) | 0 | PASS |
| 2: full suite | `npm test` | 0 | PASS (second run; first run: 1 failure, see Deviations) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## Full suite

`npm test` from `/Users/justin/dev/devflow-claude` (main checkout, branch `feat/stack-profile-loader`), no exclusions needed (`micro.test.cjs` did not hang on commit signing):

| Run | Tests | Pass | Fail | Skipped | Cancelled | Duration |
|---|---|---|---|---|---|---|
| 1 (after the Task 1 commit, before the ROADMAP tick) | 10963 | 10928 | 1 | 34 | 0 | 142.6 s |
| 2 (after `roadmap update-job-progress 64`) | 10963 | 10929 | 0 | 34 | 0 | 149.4 s |

The one failure of run 1 was `roadmap-reconcile.test.cjs` E2E1 ("reconcile dry-run against this repo ROADMAP shows zero drift"). Its only reported change was `trd_summary_exists` for 64-06: this TRD's own SUMMARY checkpoint existed while its ROADMAP checkbox was still `[ ]`. It is not a regression and not pre-existing; it is the transient state between `summary checkpoint` and `roadmap update-job-progress`, which the TRD's documented state step clears. After that verb ticked the box (and the objective's Progress row), the 63 tests of that file passed and run 2 had no failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE.md prose named a bare `finish` as a command**
- **Found during:** Task 1 verification
- **Issue:** my first CLAUDE.md edit wrote "`finish` archives a finished run", and `dispatch-completeness.test.cjs` test 5 extracts backticked names from CLAUDE.md and rejected `finish: not a COMMANDS key`.
- **Fix:** reworded to "`estimate start|wave|finish` keep the run state ... and archive finished runs to `history/<repo-key>/` beside it" (prose corrected, not the test). Both test files then passed (21 of 21).
- **Files modified:** CLAUDE.md
- **Commit:** df31e730 (fixed before the commit)

**2. [Rule 3 - Blocking] ROADMAP tick ordering made E2E1 fail in the first full run**
- **Found during:** Task 2
- **Fix:** ran the normal `roadmap update-job-progress 64` step before the second run (see Full suite). The ROADMAP change (objective 64 line ticked, 64-06 ticked, Progress row `6/6 Complete 2026-10-07`) is committed with the final docs commit.

None otherwise. The CHANGELOG entry for the buildBacktest dir-name join fix was left out on purpose: that bug existed only in the unreleased verb, so it is not a user-visible fix.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the CLAUDE.md wording)
- Must-haves verified: 4/4 (CHANGELOG entries; USER-GUIDE Estimates content with the `all TRDs done` caveat for `--all` removed and the out-of-sample sentence replaced; CLAUDE.md bullet; full suite passes)
- Gate failures: run 1 E2E1 (transient ordering, cleared; see Full suite)

## Issues for the orchestrator

1. **EST-08 is not met.** `df-tools objective complete 64` ticks `- [ ] **EST-08**` for every requirement on the objective's ROADMAP `Requirements` line regardless of a verdict (defect 6 in the report). Whoever completes the objective must re-open the EST-08 checkbox in `REQUIREMENTS.md` or record the decision to accept the verdict. This TRD did not touch REQUIREMENTS.md, and `requirements mark-complete` was not run.
2. **Unreleased docs.** The USER-GUIDE uses `~/.claude/devflow/bin/df-tools.cjs estimate backtest`; it dispatches only after a release and re-sync of the runtime (the repository df-tools has it today).
3. **Follow-up todos still pending:** `recalibrate-estimate-minutes-est-08-not-met` and `ship-executor-token-stamp-forward-stamp-8-of-41`.

## Self-Check: PASSED

- FOUND: `CHANGELOG.md`, `docs/USER-GUIDE.md`, `CLAUDE.md` (modified), commit df31e730 (`git log` shows it).
- `rg` confirms `estimate backtest` in all three files and no "Objective 64 tests the method out of sample" in the USER-GUIDE.
- `npm test`: 10963 tests, 10929 pass, 0 fail, 34 skipped.
