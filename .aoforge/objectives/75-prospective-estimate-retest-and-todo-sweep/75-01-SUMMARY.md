---
objective: 75-prospective-estimate-retest-and-todo-sweep
job: "01"
subsystem: estimation
tags: [est-11, backtest, prospective, calibration, retest]

requires:
  - objective: 67-minutes-recalibration
    provides: frozen calibration f4d1ffa9 (trd_level, window 10, through 66) and the 67-FREEZE rule
  - objective: 64-estimate-accuracy-validation
    provides: estimate backtest verb with pinned constants and the prospective run-state judgment
provides:
  - 75-RETEST-REPORT.md: EST-11 eligibility (E1-E5) for 68-72, one scoring run on 68-71, verdict not met
  - follow-up todo est-11-follow-up-objective-75
affects: [75-05, next estimation objective]

tech-stack:
  added: []
  patterns: ["eligibility committed before the scoring run, then one scoring run, nothing tuned"]

key-files:
  created:
    - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
    - .aoforge/todos/pending/est-11-follow-up-objective-75.md
  modified: []

key-decisions:
  - "EST-11 is not met under rule 4: S is 68, 69, 70, 71 (four of five), 72 is unscored; the four scored objectives pass the EST-08 rule"
  - "Scored with the installed 3.0.0 runtime (libs cmp-equal to repository HEAD and unchanged since v3.0.0)"

requirements-completed: []

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 60min
completed: 2026-10-10
tokens_input: 8267147
tokens_output: 50992
tokens_cache_read: 7790124
tokens_cache_write: 476883
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 75 TRD 01: Score EST-11 on 68-72 with the pre-recorded estimates Summary

**EST-11 is not met: four of five candidates (68-71) had a pre-recorded objective-level estimate and pass the EST-08 rule (agent minutes median ratio 1.086, cost 1.14, P90 covering 4 of 4 objectives for both), but 72 has none, and rule 4 needs all five.**

Requirement status: EST-11 reported, not met (not listed under requirements-completed).

## Performance

- Duration: about 60 minutes. Two tasks, two commits, no code change.
- The scoring ran once in JSON form and once in `--raw` form, both exit 0. Nothing re-run, nothing tuned.

## Progress
- [x] Task 1: Preconditions and eligibility (E1-E5), committed before any scoring — eb3538af
- [x] Task 2: Score S once, publish the verdict, classes and follow-up — 2e86aa5e

## Accomplishments

- Fixed the scored set before scoring (commit eb3538af): E1-E5 read from each archived run state and from the first
  SUMMARY commit under both planning directory names. S = 68, 69, 70, 71.
- Objective 72 reported unscored, with both causes: the original run state has no objective-level estimate (fails E1, E2,
  E4), and the only archived 72 file was started 17 hours after the first SUMMARY commit (fails E5).
- Scored S once with the installed runtime against the frozen calibration (commit 2e86aa5e). Every scored objective's
  agent-minutes and cost source is `prospective`.
- Published the verdict and the four flagged classes in `75-RETEST-REPORT.md`, plus the follow-up todo
  `est-11-follow-up-objective-75` with its disposition fields.

### Results

| Metric | Median ratio | Pooled | In band | P90 covers objectives | P90 covers TRDs |
|---|---|---|---|---|---|
| Agent minutes | 1.086 | 1.063 | 4 of 4 | 4 of 4 (100%) | 21 of 21 (100%) |
| Cost | 1.14 | 1.117 | 4 of 4 | 4 of 4 (100%) | 19 of 21 (90.48%) |

The verb's verdict on the 4 scored objectives (EST-08 rule): met. Not the EST-11 verdict. Flagged classes: minutes
`other` (P90 too narrow), minutes `test_tdd` (biased high), cost `code_tdd` (biased high), cost `other` (P90 too narrow).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: eligibility | `shasum -a 256` of live and frozen calibration both `f4d1ffa9...`; `cmp` of 10 libs and model-rates.json silent; `git diff --quiet v3.0.0 HEAD` over them exit 0; `rg -e 'verdict: pending' -e '## What was compared'` matches the committed report | 0 | PASS |
| 2: scoring | `estimate backtest 68,69,70,71 --calibration ...f4d1ffa9.json` (JSON, then `--raw`) exit 0; saved JSON shows `source: prospective` for all four objectives and both metrics; `rg -e '^verdict: '` prints `not met`; `rg -e 'Executor estimates against actuals' -e 'Miscalibrated classes and follow-up' -e '^## Limits'` matches; todo `disposition_reason` present; calibration and the six run-state/history hashes unchanged after scoring; `git log 5a9b8551..HEAD -- plugins/` empty | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | not defined for this TRD (no code; the guard tests run in 75-05) | n/a | not_available |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (rows for 68-72 with value or unscored reason; eligibility committed before scoring; verdict by rule 4 with scored-set figures; 72 unscored with both causes; classes and follow-up todo present; calibration still `f4d1ffa9...` and no estimator, rates, calibration, run-state, history or SUMMARY file changed)
- Rule 4 recomputed from the saved JSON with a read-only `node -e`: `S=68,69,70,71 est08=met EST-11 not met`
- Gate failures: None

## Files Created/Modified

- `.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md` (new)
- `.aoforge/todos/pending/est-11-follow-up-objective-75.md` (new)
- `.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-01-SUMMARY.md` (new)

## Decisions Made

- EST-11 verdict is **not met**, decided by rule 4 and not by the verb's `EST-08: met` line.
- The installed runtime scored, because its libs are byte-identical to the repository copy and unchanged since `v3.0.0`.
- The follow-up todo uses the fixed stem `est-11-follow-up-objective-75` (disposition `follow-up`, target the next estimation objective).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `doc put` and `todo add` from a linked worktree write the main checkout, not the worktree**
- **Found during:** Task 1 (first `doc put`), repeated in Task 2 (`doc put`, `todo add`)
- **Issue:** Both verbs resolve the MAIN checkout (verb rule D-14); only `summary post|checkpoint` write the caller's checkout. The report and the todo landed as untracked files in the main checkout, which would make the wave merge refuse to overwrite them (the failure objective 52 recorded).
- **Fix:** After each publish I copied the file into this worktree, committed it on `df/exec-75-01-est-11-prospective-retest`, `cmp`-checked the main copy against the committed one and removed the untracked main copy. The main checkout's `git status` shows only the unrelated `amp` entry.
- **Files modified:** the two files above (no content difference from what the verbs wrote)
- **Commits:** eb3538af, 2e86aa5e

No other deviation. The TRD ran as written: eligibility committed first, one scoring run per form, no re-run, nothing tuned.

## Issues Encountered

- 72 has no pre-execution objective-level estimate. `estimate objective 72` now prints `all TRDs done (27 of 27)` and cannot rebuild one. This is the single reason EST-11 is not met.
- `estimate backtest` takes the latest finished run, so a later partial `estimate start` replaces the pre-execution one. 72 was kept out of the scoring set by hand.

## Next Objective Readiness

75-05 can read the verdict and the follow-up todo stem from the report. `.aoforge/todos/pending/est-11-follow-up-objective-75.md` already carries its disposition fields for the 75-04 sweep.

## Self-Check: PASSED

- FOUND: `.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md`
- FOUND: `.aoforge/todos/pending/est-11-follow-up-objective-75.md`
- FOUND commits: eb3538af, 2e86aa5e
