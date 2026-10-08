---
objective: 67-minutes-recalibration
job: "05"
subsystem: estimation
tags: [EST-10, minutes-method, ship-default, calibration-v3, docs, changelog]

requires:
  - objective: 67-minutes-recalibration
    provides: "67-VALIDATION.md (67-04): ship_default true, method_selected trd_level, frozen method {minutes: trd_level, window_objectives: 10, through_objective: 66}"
  - objective: 67-minutes-recalibration
    provides: "67-02 calibrate v3 (--minutes, --through, method block) and 67-03 estimator trd_level minutes"
provides:
  - "calibrator.DEFAULT_MINUTES_METHOD = 'trd_level', pinned by a test to 67-VALIDATION.md's answer; calibrate with no --minutes writes the trd_level method"
  - "a cross-module test: estimate.KNOWN_MINUTES_METHODS deep-equals calibrator.MINUTES_METHODS"
  - "CHANGELOG [Unreleased], USER-GUIDE (Estimation data, Estimates), CLAUDE.md and help.cjs describe --minutes, --through, calibration version 3, the validation result and the EST-11 freeze"
affects: [67-06, 67-09]

tech-stack:
  added: []
  patterns:
    - "default set by a pre-registered rule: one constant, a test that pins it to the validation's answer, the 64 selection script kept on the old method (as 64-10 did for the window)"
    - "tests that are not about the minutes method pin minutes: 'task_sum' instead of following the default"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/calibrator.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - CLAUDE.md

key-decisions:
  - "SHIP is true and SELECTED is trd_level, read from 67-VALIDATION.md (ship_default true, method_selected trd_level, one commit ca0daada); the constant follows the rule, not the subsets"
  - "Docs state the rule's reason as the validation printed it: it fired on its first clause (the new method's verdict is met), not on an improvement of the median (1.021 task_sum, 1.051 trd_level)"
  - "Tests about overhead notes, the window note and the through note order pin minutes: 'task_sum'; tests about the default itself changed to trd_level"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-08
tokens_input: 9638998
tokens_output: 51712
tokens_cache_read: 9471920
tokens_cache_write: 166946
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 05: Act on the ship rule, then document the method Summary

**SHIP is `true` and SELECTED is `trd_level`: `DEFAULT_MINUTES_METHOD` is now `'trd_level'` (pinned by a test to 67-VALIDATION.md), a test ties `estimate.KNOWN_MINUTES_METHODS` to `calibrator.MINUTES_METHODS`, 64's pre-59 selection still hashes to `fdf60e66…`, and the CHANGELOG, USER-GUIDE, CLAUDE.md and help text document the method, the cutoff, the validation numbers and the EST-11 freeze.**

## Progress
- [x] Task 1: Set the calibrate default from the ship rule and pin the method lists together — c2c90746
- [x] Task 2: CHANGELOG, USER-GUIDE, CLAUDE.md and help text; full suite — 43b36a3e

## Accomplishments

- **Precondition.** `frontmatter get 67-VALIDATION.md --field ship_default` printed `true` and `--field method_selected` printed `trd_level` (they agree); `git log --oneline` on the file shows one commit, `ca0daada`. No number was recomputed.
- **Default flipped.** `calibrator.cjs`: `DEFAULT_MINUTES_METHOD = 'trd_level'` with the comment "set by 67-VALIDATION.md (ship_default true, DECISION-003 V4)". The `calibrate-cli.cjs` header says `trd_level` is the default since objective 67; `help.cjs` calibrate details and the `df-tools.cjs` header no longer say "default task_sum". `--minutes task_sum` is unchanged and still reachable.
- **Method lists tied.** New test `67-05/1` asserts `[...estimate.KNOWN_MINUTES_METHODS]` deep-equals `[...calibrator.MINUTES_METHODS]`. It passed at once (67-02 and 67-03 agree), as the TRD predicted.
- **Default pinned.** `67-05/2` pins the constant to `'trd_level'`; `67-05/3` shows a default build of `pastSpec()` has `method.minutes` `trd_level`, is byte-identical to `--minutes trd_level` and differs from `--minutes task_sum`. CLI test `67-05/1` spawns `calibrate --no-overhead --out <tmp>` with no `--minutes`: `method.minutes` is `trd_level`, byte-identical to `--minutes trd_level`, and `--minutes task_sum` differs.
- **PC1 still holds.** After the flip `scripts/estimate-window-eval.cjs report` on the `401a9145^` snapshot (objectives up to 58) with `--eval 46-58 --grid 10,15,20,30,40 --label pre59` hashes to `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`; the script was already pinned to `task_sum` in 67-02, so no call site needed a pin.
- **Docs.** CHANGELOG `[Unreleased]` names objectives 66 and 67 and says the 2.14.0 runtime refuses a version 3 calibration; adds the `--minutes`/`--through` entry and two Changed entries beside the 66 ones. USER-GUIDE: two new command lines, a "minutes method and the cutoff" bullet, version 3 in the keys bullet, a trd_level sentence in **Method.**, a true replacement for the stale "needs a release" sentence (2.14.0 has `--window` and `estimate backtest`; `--minutes`, `--through` and version 3 need objective 67 released), and a new **Objective 67 (EST-10).** bullet appended after the 64 text. CLAUDE.md Estimation data bullet: flags, version 3, one sentence on the frozen method. help.cjs `estimate` details: one sentence on version 3 and `calibration.method`.

## Numbers in the new doc text (each found in 67-VALIDATION.md)

`46 to 66` (eval set), window `10`, `1.021` and `1.051` (agent-minutes median ratio, task_sum and trd_level), `7 of 13` against `5 of 13` (in band), `160 of 165` against `152 of 165` (P90 covers TRDs), `13 of 21` compared and `8 excluded`, `through_objective: 66`, `ship_default: true`, "the new method meets EST-08", "objectives up to 63", `68-72`. `75` (the objective that scores EST-11) is from DECISION-003 and the TRD, not the validation. Checked with `rg -c -F` per number: every one is present.

## Task Commits

| Task | Commit |
|---|---|
| 1: default from the ship rule, method lists tied, stale default text fixed | c2c90746 |
| 2: CHANGELOG, USER-GUIDE, CLAUDE.md, help text | 43b36a3e |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: selected value | `rg -n "DEFAULT_MINUTES_METHOD = '(trd_level\|task_sum)'" plugins/devflow/devflow/bin/lib/calibrator.cjs` prints `'trd_level'` | 0 | PASS |
| 1: three test files | `node --test calibrator.test.cjs calibrate-cli.test.cjs scripts/estimate-window-eval.test.cjs` (153 tests) | 0 | PASS |
| 1: PC1 digest | `shasum -a 256 <scratch>/pc1.json` = `fdf60e66…e516` | 0 | PASS |
| 1: live calibration untouched | `shasum -a 256 ~/.claude/devflow/calibration.json` = `9ef7d108…ad648`, before and after | 0 | PASS |
| 1: neighbours | calibration-inputs, estimate*, help*, dispatch-completeness, doc-surfaces, tokens-cli, estimate-rolling-backtest tests (466 tests) | 0 | PASS |
| 2: `--through` in each doc | `rg -n -- "--through" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds all three files | 0 | PASS |
| 2: method block described | `rg -n "through_objective" docs/USER-GUIDE.md` (lines 279, 281) | 0 | PASS |
| 2: doc tests | `node --test doc-refs.repo.test.cjs doc-surfaces.test.cjs help.test.cjs help-delegation.test.cjs` (66 tests), then with `dispatch-completeness` and `builtin-sweep.repo` (40 tests) | 0 | PASS |
| 2: validate docs | `df-tools validate docs --raw` prints "no documentation advisories" | 0 | PASS |
| 2: full suite | `npm test` | 1 | PASS apart from the allowed E2E1 (below) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test calibrator.test.cjs` with the new 67-05 tests, default still `task_sum` | 1 | FAIL (correct: `67-05/2` and `67-05/3` failed on the default; `67-05/1`, the method-list tie, passed) |
| RED | `node --test --test-name-pattern "67-05" calibrate-cli.test.cjs` | 1 | FAIL (correct: "67-VALIDATION.md ship_default true: the default is the shipped method", `task_sum` !== `trd_level`) |
| GREEN | `node --test calibrator.test.cjs calibrate-cli.test.cjs scripts/estimate-window-eval.test.cjs`, after the flip and the deliberate test changes | 0 | PASS (153/153) |

## Tests changed by the flip (the TRD named three; thirteen existing tests followed the default)

The TRD listed 67-02 tests 7, 13 and 17. Flipping the constant failed thirteen existing tests; each is listed here. Nine now state the new default; four are not about the minutes method and pin `minutes: 'task_sum'` (a pin, not a behaviour change).

| File | Test | Change |
|---|---|---|
| calibrator.test.cjs | 67-02/7 default build is version 3 | expects `trd_level` (default and `window: null`); adds an explicit `task_sum` build |
| calibrator.test.cjs | 67-02/11 window applies after the cutoff | expects `trd_level` in the method |
| calibrator.test.cjs | 67-02/13 constants | `DEFAULT_MINUTES_METHOD` is `trd_level` |
| calibrator.test.cjs | 58-03/7 agent_overhead without a transcripts root | pins `task_sum` (5 notes; `trd_level` appends a sixth) |
| calibrator.test.cjs | 64-08/1 window 2 keeps the two latest | pins `task_sum` (the window note is last; under `trd_level` the minutes note follows it) |
| calibrator.test.cjs | 67-02/9 through-66 build says so in its notes | pins `task_sum` (the through note is last) |
| calibrator.test.cjs | 67-02/9 notes append in order | base build pins `task_sum`; the order base, window, through, minutes is unchanged |
| calibrate-cli.test.cjs | 1 writes a parsable calibration.json | `method.minutes` is `trd_level` |
| calibrate-cli.test.cjs | 8, 58-03/1, 58-03/2, 58-03/4 | summary tail is `· minutes trd_level` |
| calibrate-cli.test.cjs | 67-02/17 byte-identity | no `--minutes` is byte-identical to `--minutes trd_level` (it was `task_sum`) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test` on the changed test files and their neighbours (153 + 466 + 66 + 40 tests) | 0 | PASS |
| test (full) | `npm test`: tests 11187, pass 11152, fail 1, skipped 34 | 1 | PASS apart from the allowed failure |

The one failure is `roadmap-reconcile.test.cjs` E2E1 ("reconcile dry-run against this repo ROADMAP shows zero drift"): `trd_summary_exists` for `67-05`, the ROADMAP box for this TRD is unticked while its SUMMARY exists. It is the failure the TRD allows; it clears once the roadmap progress is recorded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Thirteen tests followed the default, not three**
- **Found during:** Task 1 (GREEN)
- **Issue:** the TRD named 67-02 tests 7, 13 and 17; the flip failed thirteen (table above).
- **Fix:** nine now state `trd_level`; four pin `task_sum` because they test overhead notes, the window note or note order.
- **Files modified:** calibrator.test.cjs, calibrate-cli.test.cjs
- **Commit:** c2c90746

**2. [Rule 1 - Bug] Two stale "default task_sum" statements**
- **Found during:** Task 1
- **Issue:** `help.cjs` calibrate details and the `df-tools.cjs` header said the minutes default is `task_sum`. `df-tools.cjs` is not in the TRD's `files_modified`.
- **Fix:** both say `trd_level` ("since objective 67" in help). Committed with the default so no commit leaves a false statement.
- **Files modified:** plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs
- **Commit:** c2c90746

**3. [Rule 3 - Blocking] CLAUDE.md names "the method block" without backticks**
- **Found during:** Task 2, full suite
- **Issue:** `dispatch-completeness.test.cjs` 5 reads every backticked lowercase word in a Core Tool bullet as a df-tools command, so "version 3 adds the `method` block" failed with "method: not a COMMANDS key".
- **Fix:** the sentence reads "version 3 adds the method block (minutes, window, cutoff)". dispatch-completeness, doc-refs, doc-surfaces and builtin-sweep pass (40/40).
- **Files modified:** CLAUDE.md
- **Commit:** 43b36a3e

**4. [Rule 3 - Blocking] Apostrophes in a single-quoted help string**
- **Found during:** Task 2, first doc test run
- **Issue:** my first `estimate` details sentence used `TRD's` and `calibration's` inside a single-quoted JS string, a SyntaxError.
- **Fix:** reworded without apostrophes before any commit (`node --check` clean).
- **Files modified:** plugins/devflow/devflow/bin/lib/help.cjs
- **Commit:** 43b36a3e

## Authentication gates

None.

## Discovered commands

None; `test` came from the project STACK.md (`node --test {files}`, `npm test`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (default equals the validation's answer and is pinned; the method lists are tied by a test; PC1 digest `fdf60e66…` after the flip; docs carry every named item with numbers from 67-VALIDATION.md; `npm test` passes apart from the allowed E2E1)
- Gate failures: E2E1 only (allowed, see above)
- EST-08 and EST-11 are not claimed: the docs say EST-10 is the method, the 46 to 66 score is a leave-future-out reconstruction, and EST-11 on 68 to 72 is the prospective test.

## Self-Check: PASSED

All nine modified files exist; commits c2c90746 and 43b36a3e are in `git log`; the working tree has no uncommitted change apart from the untracked `.planning/objectives/*/.gitkeep` files; `~/.claude/devflow/calibration.json` still hashes to `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`.
