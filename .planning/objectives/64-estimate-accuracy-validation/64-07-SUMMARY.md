---
objective: 64-estimate-accuracy-validation
trd: "07"
subsystem: estimation
tags: [estimate, calibrate, EST-08, diagnosis, recency-window, pre-registration, gap-closure]

requires:
  - objective: 64-estimate-accuracy-validation (64-05)
    provides: the EST-08 verdict (not met) and the minutes bias this TRD diagnoses
  - objective: 64-estimate-accuracy-validation (64-06)
    provides: the documented estimator and the full-suite baseline

provides:
  - "scripts/estimate-window-eval.cjs: a pre-59 evaluation tool (rolling-origin sweep of recency windows, the pre-registered selection rule, the noise floor of the SC2 test, and the era, task-count, class-other, duration-source and composition tables) with 39 hand-built-fixture tests"
  - "64-DIAGNOSIS.md: decision build_window with window_objectives 10, selection_output_sha256 fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516, the validation protocol and the ship rule, committed before any 59-63 scoring"

affects: [64-08, 64-09, 64-10]

tech-stack:
  added: []
  patterns:
    - "pre-registration: the selection rule is code plus tests before the run, and the doc that freezes the result is committed once and never edited"
    - "rolling-origin cuts: git archive snapshot -> cutProject -> buildCalibration in memory -> estimateTrdText, no ~/.claude write"

key-files:
  created:
    - scripts/estimate-window-eval.cjs
    - scripts/estimate-window-eval.test.cjs
    - .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
  modified: []

key-decisions:
  - "decision build_window, window_objectives 10: the only grid window that passes all five eligibility conditions of the pre-registered rule (S 0.047 against all-history 0.113; in band 6 of 13 against 5; TRD bias 0.101 against 0.182; coverages 1.00 and 0.92)"
  - "The evidence for window 10 is weak and the doc says so: the sweep is non-monotone (15, 20, 30 are worse than all-history, 40 slightly worse), the S advantage is 0.066 against per-objective ratios that run from 0.45 to 2.42, and the selection set has no hold-out inside it"
  - "Suspects: S1 supported (eras), S2 not supported (9 of 257 TRDs use the metric source), S3 not supported (characterization test 17), S4 supported but small (3.2% of the selection-set estimate), S5 supported second order, S6 supported as the amplifier not a defect, S7 supported (objectives 53-58 median 1.60 against 0.94 for 46-52)"

patterns-established: []

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 20min
completed: 2026-10-07
tokens_input: 16805536
tokens_output: 138606
tokens_cache_read: 16523876
tokens_cache_write: 281486
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 64 TRD 07: Diagnose the minutes bias and freeze the method Summary

**The pre-registered rolling-origin rule, run once on the pre-59 snapshot (objectives 46-58), selects a recency window of 10 objectives for `calibrate` (S 0.047 against 0.113 for all-history), on weak evidence that 64-DIAGNOSIS.md states plainly; the decision, the validation protocol and the ship rule are committed before any 59-63 scoring.**

## Progress

- [x] Task 1: Selection core of scripts/estimate-window-eval.cjs — RED 61af511e, GREEN 6a1e9442
- [x] Task 2: The diagnostic tables, the report renderer and the CLI — RED ab405fec, GREEN f02f5536
- [x] Task 3: Run the diagnosis on the pre-59 snapshot, freeze the decision, write and commit 64-DIAGNOSIS.md — 34515181

## Performance

- **Duration:** 20min
- **Started:** 2026-10-08T00:30:15Z
- **Completed:** 2026-10-08T00:50:00Z
- **Tasks:** 3 (Tasks 1 and 2 as RED then GREEN)
- **Files modified:** 3 created, 0 under plugins/

## Accomplishments

- `scripts/estimate-window-eval.cjs` with `report`: rolling-origin sweep, `selectWindow` (section 4 of the pre-registered text as code), `noiseFloor`, and the S1, S2, S4, S5, S6 tables; deterministic JSON with no path and no date; refuses any path under `~/.claude`; never calls `writeCalibration` or `defaultCalibrationPath`.
- The decision: **build_window, window_objectives 10**. Window 10 is the only candidate that passes all five eligibility conditions; 15, 20, 30 and 40 fail on S (and 20, 30, 40 on TRD bias too). The tie rule was not exercised.
- `selection_output_sha256` = `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`; two runs wrote identical JSON (155066 bytes).
- Diagnosis of the seven suspects with printed numbers (64-DIAGNOSIS.md section 3). The all-history medians were set by slower eras (S1: median actual per TRD 7.0, 20.0, 14.0, 11.0 minutes across four equal-count eras, calibration median p50 10.5-12.0 throughout), the latest objectives run faster (S7), and the correlated sum carries the excess into the objective total (S6: median F/P 1.14 out of sample). Overhead counted twice is cleared by an executable test (S3).
- Noise floor: an estimator with the all-history spread passes SC2 on a random 5-objective sample 58.7% of the time (756 of 1287 subsets); with window 10's centre and spread, 75.1% (966 of 1287). A single five-objective verdict is noisy.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Selection core (RED 61af511e, GREEN 6a1e9442) | `node --test scripts/estimate-window-eval.test.cjs` | 0 (23 tests) | PASS |
| 2: Tables, report, CLI (RED ab405fec, GREEN f02f5536) | `node --test scripts/estimate-window-eval.test.cjs`; `node scripts/estimate-window-eval.cjs report` | 0 (39 tests); 1 with a usage line | PASS |
| 3: Diagnosis run and frozen doc (34515181) | `frontmatter get ... --field decision` / `--field window_objectives`; leak check; digest compare; calibration hash | `build_window` / `10`; rg printed nothing (exit 1); two equal digests; `5cf42c4b...` unchanged | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test scripts/estimate-window-eval.test.cjs` | 0 | PASS |
| test (full) | `npm test` | 1, then 0 for the failing file | PASS after the ROADMAP tick (see below) |

First full run (exit 1): 11002 tests, 10967 pass, 1 fail, 34 skipped. The one failure is `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift` (plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs): with the 64-07 SUMMARY on disk the repo's ROADMAP.md still had `- [ ] 64-07-...`, the one line of drift it reports. That is the expected transition of finishing a TRD, not a defect of this change; `roadmap update-job-progress 64` ticked the line and `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` then passed 63 of 63. No other test failed. A second full run after the state updates is reported in the return message of the executor, not here.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test scripts/estimate-window-eval.test.cjs` | 1 (module `./estimate-window-eval.cjs` not found) | FAIL (correct) |
| GREEN (Task 1) | `node --test scripts/estimate-window-eval.test.cjs` | 0 (23 pass) | PASS (correct) |
| RED (Task 2) | `node --test scripts/estimate-window-eval.test.cjs` | 1 (15 of 39 fail: the tables, report and CLI do not exist yet; 24 pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test scripts/estimate-window-eval.test.cjs` | 0 (39 pass) | PASS (correct) |

Test item 17 (suspect S3) is a characterization test written against the current code: it passed as soon as its fixture was right, so it has no RED. The full test file was written first and split so that the Task 1 RED commit holds only the Task 1 tests.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (pre-59 data only and the snapshot lists no objective numbered 59 or above; every suspect has a printed number and a verdict; the window is chosen by the pre-registered rule over {10, 15, 20, 30, 40}; the doc freezes the protocol, ship rule, provenance and noise floor before 59-63 scoring; the script is test-first with a deterministic path-free JSON; no file under plugins/ changed, the constants of estimate-backtest.cjs are untouched, and `~/.claude/devflow/calibration.json` still hashes to `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`)
- Gate failures: None

## Leak check

`git archive 401a9145^ .planning` (parent `cce70b30945f358faa0c848f6f3a95f5423a1b59`) lists 61 objective directories, the last `58-estimation-engine-and-surfacing`; `rg -n "^(59|6[0-9])-"` over the listing printed nothing (exit 1). `estimate backtest` was not run and no 59-63 SUMMARY, actual or calibration was read to produce the diagnosis.

Disclosure: to confirm the headline verdict quoted in the TRD, one `rg` over 64-05-SUMMARY.md printed several of its lines, among them one row of its per-objective rolling table (objective 59: wall estimate 1h 48m against 1h 24m actual, cost ratio 0.86). The TRD lists that file as context. Nothing in this TRD used it: the grid, the statistic and the rule were fixed before the run, the code and tests for them were committed first (61af511e to f02f5536), and the window was selected from the pre-59 snapshot alone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test item 17 passed the objective to `estimateObjective` as a number**
- **Found during:** Task 2 (RED run of the characterization test)
- **Issue:** the TRD writes `estimateObjective(cal, root, 90, {all: true})`; the library calls `objective.match` and throws `TypeError` on a number.
- **Fix:** the test passes `'90'`. No plugin change.
- **Files modified:** scripts/estimate-window-eval.test.cjs
- **Commit:** f02f5536

**2. [Rule 1 - Bug] Coverage needs a floating-point tolerance for distributions with no spread**
- **Found during:** Task 1 implementation, by reasoning about the step-change fixture (a window of 2 gives a TRD estimate whose P90 equals its P50 and is rebuilt as exp(log(x)), which can land one ulp below an actual that equals it); no test failed first
- **Fix:** `actual <= P90 * (1 + 1e-9)` (`COVERAGE_EPS`), stated in 64-DIAGNOSIS.md section 4.1; it changes no coverage on real data. BAND and COVERAGE_TARGET are imported, never redefined.
- **Files modified:** scripts/estimate-window-eval.cjs
- **Commit:** 6a1e9442

### Other notes

- Shapes beyond the TRD text, all additive: `cutProject` takes an optional `project` (avoids re-reading the snapshot per cut); `durationSourceTable` takes optional in-sample rows and adds a median ratio per source; the report's `composition` has `in_sample` and `rolling_all`; `report` throws when no snapshot objective matches `--eval`; `isUnderClaudeHome` and `parseArgs` are exported for tests; `noiseFloor` of fewer values than `k` returns `{subsets: 0, share: null}` exactly as the TRD states.
- Task commits include the SUMMARY checkpoint (`summary checkpoint`), so `git show --stat` of each lists the SUMMARY beside the script files; no commit touches plugins/.
- S7 and the S4 excess are plain reads of `diagnosis.json` (documented in 64-DIAGNOSIS.md section 8); the script has no S7 table, and it was not added after the run because that would change the recorded digest.
- The mirror df-tools (`~/.claude/devflow/bin/df-tools.cjs`) was used for `commit`, `summary` and `doc put`; the repository df-tools for `frontmatter get`.

## Issues Encountered

None blocking. The `Monitor` tool is disabled in this session, so the full suite was run in the background and polled.

## Self-Check: PASSED

Files found: scripts/estimate-window-eval.cjs, scripts/estimate-window-eval.test.cjs, .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md. Commits found: 61af511e, 6a1e9442, ab405fec, f02f5536, 34515181. `git log -- 64-DIAGNOSIS.md` lists exactly one commit (34515181); `git diff --stat 77369207..HEAD -- plugins` is empty; `~/.claude/devflow/calibration.json` hashes to `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`; `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` and the run-history directory are untouched.
