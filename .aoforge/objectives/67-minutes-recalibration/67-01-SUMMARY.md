---
objective: 67-minutes-recalibration
job: "01"
subsystem: estimation
tags: [decision, EST-10, minutes-method, validation-protocol, pre-registration]

requires:
  - objective: 64-estimate-accuracy-validation
    provides: 64-DIAGNOSIS, 64-ACCURACY-REPORT, 64-VALIDATION and the recalibrate-estimate-minutes todo (the evidence E1-E9)
provides:
  - "DECISION-003 (resolved), DECISION_SHA d888f55790f4b7144a33c514767467627bced9ba: frozen minutes method {minutes: trd_level, window_objectives: 10, through_objective: 66}, fallback {minutes: task_sum, ...}, provenance and validation protocol V1-V6"
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

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 3min
completed: 2026-10-08
tokens_input: 2810523
tokens_output: 24465
tokens_cache_read: 2696243
tokens_cache_write: 114220
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 01: Record the minutes method, its provenance and its validation protocol Summary

**DECISION-003 freezes TRD-level minutes (`{minutes: trd_level, window_objectives: 10, through_objective: 66}`) with the task-sum method as its pre-registered fallback, records the planner-not-user provenance and the validation protocol V1-V6, and was committed at `d888f557` before any scoring artifact existed.**

## Progress
- [x] Task 1: Check every cited number against its source and draft the question and answer texts — 30a16f62
- [x] Task 2: Open and answer the decision through the verbs, verify it reads back whole, commit it — d888f557

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-08T13:25:27Z
- **Completed:** 2026-10-08T13:28:12Z
- **Tasks:** 2
- **Files modified:** 1 (1 created: the resolved decision; plus this SUMMARY)

## DECISION_SHA

- **Decision id:** DECISION-003 (the id `decision open` printed; equal to the expected one)
- **DECISION_SHA:** `d888f55790f4b7144a33c514767467627bced9ba` (short `d888f557`), the commit TRD 67-04 snapshots with `git archive`. `git show --stat` lists only `.planning/decisions/resolved/DECISION-003.md` (114 insertions); the pending file was never tracked, so there is no deletion.
- **Frozen method:** `{minutes: trd_level, window_objectives: 10, through_objective: 66}`; **fallback:** `{minutes: task_sum, window_objectives: 10, through_objective: 66}` if the V4 ship rule returns `ship_default` false.
- **Provenance as recorded:** chosen by the objective-67 planner (an agent) under the orchestrator's instruction, not by the user; the user can stop the release at 67-07 and 67-08.
- The statements in the provenance about what the planner read and saw (including "the SUMMARY durations of 64-66") were recorded verbatim from the TRD. This executor cannot verify them and did not read any SUMMARY of objectives 64-66.

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

## Number corrections

None. Every cited number equalled its source value. One citation location was widened (E1: pooled 1.45 is printed under "Gap closure", the median 1.51 and the 2 of 5 under "Verdict"); the numbers did not change, and no argument reversed (the S5 ratios still rise with task count: 0.62, 0.91, 1.29).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Check cited numbers, draft texts | evidence table above (one row per cited number); `git status --short .planning` unchanged (only the nine pre-existing untracked `.gitkeep` files); scratch files `question.md` and `answer.md` exist outside the repository | 0 | PASS |
| 2: Open, answer and commit the decision | `frontmatter get … --field status` printed `resolved`; `--field resolution` printed the whole answer (first line "option-b: …", last line ends "nothing is tuned to pass it."); `rg -n "through_objective: 66"` found the method line (16) and the fallback line (23); `git log -1 --format=%H -- …/DECISION-003.md` = d888f55790f4b7144a33c514767467627bced9ba; `git show --stat` lists only the decision file; `git log --oneline -- …/67-VALIDATION.md` printed nothing; `git status --short plugins scripts` printed nothing | 0 | PASS |

## Validation Gate Results

No source file changed in this TRD (a planning record only), so no stack loop or task gate had anything to run. Every gate is `not_available`, none is PASS.

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| (stack task gates) | not run: no source file changed | n/a | not_available |

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written, apart from one process choice recorded here.

**Process choice (not a rule deviation): commit split.** The execute-trd protocol adds the SUMMARY to each task commit. The TRD's Task 2 verify requires `git show --stat DECISION_SHA` to list only the decision file, so the decision commit carries only that file. The Task 1 checkpoint (SUMMARY) is its own commit, `30a16f62` (Task 1 changes no repository file other than the SUMMARY), and the final SUMMARY and state go in the closing `docs(67-01)` commit. Scratch files were created with `mktemp -d` under the session scratchpad (`/private/tmp/claude-501/…/scratchpad/dec67-jX2x7F`), outside the repository. The repository `plugins/devflow/devflow/bin/df-tools.cjs` ran the `decision` and `commit` verbs (the TRD's binding rule); the installed mirror ran the `planning`, `summary`, `tokens` and `state` verbs.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (resolved decision naming method, fallback, provenance and V1-V6; committed at d888f557 before any scoring artifact; every cited number checked, none corrected; planner-not-user stated; no code, calibration, test or live state changed)
- Gate failures: None
- Nothing scored, no push, no PR, no live step; the nine untracked `.planning/objectives/*/.gitkeep` files were left alone.

## Self-Check: PASSED

- FOUND: `.planning/decisions/resolved/DECISION-003.md`
- FOUND commits: `30a16f62` (Task 1), `d888f557` (Task 2, DECISION_SHA d888f55790f4b7144a33c514767467627bced9ba)
