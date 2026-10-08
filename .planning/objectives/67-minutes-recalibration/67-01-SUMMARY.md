---
objective: 67-minutes-recalibration
job: "01"
subsystem: estimation
tags: [decision, EST-10, minutes-method, validation-protocol, pre-registration]

requires:
  - objective: 64-estimate-accuracy-validation
    provides: 64-DIAGNOSIS, 64-ACCURACY-REPORT, 64-VALIDATION and the recalibrate-estimate-minutes todo (the evidence E1-E9)
provides:
  - "DECISION-003 (resolved): frozen minutes method {minutes: trd_level, window_objectives: 10, through_objective: 66}, fallback {minutes: task_sum, ...}, provenance and validation protocol V1-V6"
affects: [67-02, 67-04, 67-05, 67-09]

tech-stack:
  added: []
  patterns:
    - "decision recorded and committed before any scoring artifact exists (pre-registration, SC-1)"

key-files:
  created:
    - .planning/decisions/resolved/DECISION-003.md
  modified: []

key-decisions:
  - "Option-b frozen: TRD-level minutes, window 10, through objective 66; option-a (task sum) is the pre-registered fallback if the ship rule V4 rejects option-b"
  - "The choice was made by the objective-67 planner (an agent) under the orchestrator's instruction, not by the user; the user can stop the release at 67-07 and 67-08"

requirements-completed: []

duration: pending
completed: pending
---

# Objective 67 TRD 01: Record the minutes method, its provenance and its validation protocol Summary

**Evidence-check table for E1-E9 and the protocol constants (all equal to their sources); the decision text is drafted and is next recorded through `decision open` / `decision answer`.**

## Progress
- [x] Task 1: Check every cited number against its source and draft the question and answer texts — (this commit)
- [ ] Task 2: Open and answer the decision through the verbs, verify it reads back whole, commit it — next step: run `node plugins/devflow/devflow/bin/df-tools.cjs decision open 67-01 --question @<scratch>/question.md --raw` with scratch dir /private/tmp/claude-501/-Users-justin-dev-devflow-claude/479a0889-ce59-4c31-8887-a62c6f15eab4/scratchpad/dec67-jX2x7F, then `decision answer <id> --from <scratch>/answer.md --raw`, read it back and commit only the resolved decision file

## Evidence check (Task 1)

Pre-checks (each its own command):

| Check | Expected | Seen |
|---|---|---|
| `.planning/decisions/pending` and `resolved` | pending empty; DECISION-001, DECISION-002 resolved (next id DECISION-003) | pending empty; DECISION-001.md, DECISION-002.md resolved |
| `git log --oneline -- .../67-VALIDATION.md` | prints nothing | prints nothing |
| `shasum -a 256 ~/.claude/devflow/calibration.json` | 9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648 | 9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648 |

Cited number against source:

| # | Cited | Source value | Equal? |
|---|---|---|---|
| E1 | minutes median ratio 1.51, 2 of 5 in band, pooled 1.45 | 64-ACCURACY-REPORT Verdict: 1.51, 2 of 5; Gap closure "Pooled agent-minutes ratio: 1.45 (64-05 primary)" | yes (source location widened: pooled 1.45 is in Gap closure, not Verdict) |
| E2 | all history 1.348, window 1.238, both 2 of 5 in band | Gap closure before-and-after table: 1.348 / 2 of 5 and 1.238 / 2 of 5, "EST-08 stays unchecked" | yes |
| E3 | S 0.047 at W=10; 0.210-0.216 at 15-30; 0.130 at 40; 0.113 all | 64-DIAGNOSIS 4.2: 10 0.047, 15 0.210, 20 0.216, 30 0.215, 40 0.130, all 0.113; 4.4 not monotone | yes |
| E4 | 0.62 (1 task, 12 TRDs), 0.91 (2, 160), 1.29 (3, 85) | 64-DIAGNOSIS S5: same | yes |
| E5 | corr 0.00 over 41 TRDs vs 0.76; 3-task 10 vs 15 (1.80); 2-task 8 vs 10 (1.21); code_tdd 3.3 vs 6.0 | Miscalibrated classes and follow-up item 1: same | yes |
| E6 | 42-58 window median 1.27; code_tdd 1.65, prompt_tdd 2.63, test 0.41 | item 3: median 1.27 (3 of 5 in band); code_tdd 1.65, prompt_tdd 2.63, test 0.41 | yes |
| E7 | in-sample F/A 0.99; rolling F/P 1.14 | 64-DIAGNOSIS S6: in sample median F/A 0.99; rolling median F/P 1.14 | yes |
| E8 | 58.7% (all-history) to 75.1% (window 10) | 64-DIAGNOSIS 5: 756/1287 = 58.7%, 966/1287 = 75.1% | yes |
| E9 | todo ranks "estimate a TRD's minutes from TRD-level history" first; 64 never tried it | todo Solution option 1, same words; 64-ACCURACY-REPORT follow-ups: "the per-TRD-minutes half (S5) has not been tried" | yes |
| P1 | selection_output_sha256 fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516 | 64-DIAGNOSIS section 8: same digest | yes |
| P2 | 1.238 (64-VALIDATION section 3 new-method median) | 64-VALIDATION section 3: 1.238 full precision (1.24 printed) | yes |
| P3 | live calibration sha256 9ef7d108… | shasum above: 9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648 | yes |
| P4 | live calibration: version 2, window objectives 55-64, trd_level minutes p50 10 / P90 20 over 79 TRDs | calibration.json: version 2; window.objectives 10, first 55-store-live-smoke-fixes, last 64-estimate-accuracy-validation; trd_level.minutes p50 10, p90 20, n 79 (aggregate keys only) | yes |
| P5 | EST-10 / EST-11 wording; tuning to pass EST-11 out of scope | REQUIREMENTS.md lines 18, 19, 67 | yes |

No cited number differed from its source value, so no number was corrected. The only edit to the question text is the E1 source column, widened to name both report sections that hold its figures.

Nothing was scored: no `calibrate`, no `estimate backtest`, neither `scripts/estimate-*.cjs`, and no SUMMARY of objectives 64-66 was read.
