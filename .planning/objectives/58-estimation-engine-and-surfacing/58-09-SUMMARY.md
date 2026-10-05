---
objective: 58-estimation-engine-and-surfacing
job: "09"
subsystem: estimation
tags: [estimate, planner, plan-objective, build, execute-objective, prose, repo-test]

requires: [58-08]
provides:
  - "estimate-surfacing.repo.test.cjs: CI pin for every estimate call in the planner, plan-objective, build and execute-objective prose, and where each sits"
  - "planner PLANNING COMPLETE `**Estimate:**` table (verbatim from `estimate objective <N> --table --raw`)"
  - "plan-objective `### Estimate` section in `<offer_next>`, re-run after checker revisions"
  - "/devflow:build one-line estimate, `estimate start`, `estimate finish` line"
  - "execute-objective `estimate wave --start` / `--done` per wave and `estimate finish` in aggregate_results"
affects: [58-10 dogfood and docs, Objective 62 workflow rework]

tech-stack:
  added: []
  patterns:
    - "Prose pastes df-tools output verbatim; no estimate numbers or formatting rules in prose"
    - "Every estimate call is one plain command with a fail-soft sentence: an estimate never blocks planning or execution"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
  modified:
    - plugins/devflow/agents/planner.md
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/build.md
    - plugins/devflow/devflow/workflows/execute-objective.md

key-decisions:
  - "wave --done runs at the top of execute_waves item 6, before the spot-checks, so the wave's clock stops when its agents return rather than after the spot-checks"
  - "build step 8 re-runs `estimate finish` after execute-objective's aggregate_results already did: finish is idempotent (a closed run reprints its original line), so the two lines agree"
  - "Test 5 also requires each of the four files to carry at least one estimate call, so it is RED on the unedited files rather than vacuously green"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-05
---

# Objective 58 TRD 09: Planning and build surfacing Summary

**The estimate now appears where people look: the planner's PLANNING COMPLETE return and plan-objective's OBJECTIVE PLANNED view carry the `estimate objective --table` output, /devflow:build prints the one-line estimate and starts the run the status line reads, and execute-objective records each wave and reports actual against estimate, all fail-soft and pinned by one repo test.**

## Progress
- [x] Task 1: Repo pin, planner PLANNING COMPLETE estimate, plan-objective display (EST-04) — RED 21c5ab1a, GREEN f38c6612
- [x] Task 2: Build one-line estimate, run state, wave reports and finish line (EST-05) — 9948a72b

## Inserted lines (for Objective 62's sweep)

Line numbers are as committed in 9948a72b.

| File | Anchor | Inserted |
|---|---|---|
| plugins/devflow/agents/planner.md | `<step name="estimate">` (new, before `<step name="offer_next">`, l.1157) | `estimate objective {objective} --table --raw` bash block plus the paste-verbatim and fail-soft paragraph |
| plugins/devflow/agents/planner.md | `<structured_returns>` Return budget (l.1175) | one sentence appended: the estimate table is pasted verbatim on top of the budget |
| plugins/devflow/agents/planner.md | `## PLANNING COMPLETE` template (l.1186-1187) | `**Estimate:**` field and its placeholder line, after `**Pushed:**` |
| plugins/devflow/devflow/workflows/plan-objective.md | step 10, `## PLANNING COMPLETE` bullet (l.524) | "and the return's `**Estimate:**` block as is" |
| plugins/devflow/devflow/workflows/plan-objective.md | `<offer_next>` (l.734-736) | `### Estimate` heading and the `estimate objective {X} --table --raw` placeholder with the fail-soft sentence, between Confidence and Next Up |
| plugins/devflow/devflow/workflows/build.md | end of `## 2. Resolve Objective` (l.63-69) | `estimate objective ${OBJECTIVE_NUMBER} --line --raw` bash block, print-the-line note and the fail-soft sentence (the one in this file) |
| plugins/devflow/devflow/workflows/build.md | `## 3. Present Build Plan` (l.86) | `**Estimated waves:** {based on objective complexity}` replaced by `**Estimate:** {the one-line estimate from step 2, or "none"}` |
| plugins/devflow/devflow/workflows/build.md | `## 7. Execute TRDs`, before the `Task(` (l.172-177) | `estimate start ${OBJECTIVE_NUMBER} --raw` bash block with its lead-in and "print the line" |
| plugins/devflow/devflow/workflows/build.md | `## 8.` OBJECTIVE COMPLETE block (l.240) | `Estimate: {output of ... estimate finish ${OBJECTIVE_NUMBER} --raw ...}` under `Duration:` |
| plugins/devflow/devflow/workflows/execute-objective.md | `execute_waves` item 1 (l.293-298, 303) | `estimate wave ${OBJECTIVE_NUMBER} {N} --start --raw` bash block, placement note, the fail-soft sentence, and `{wave estimate line}` under `## Wave {N}` |
| plugins/devflow/devflow/workflows/execute-objective.md | `execute_waves` item 6 (l.662-667, 685) | `estimate wave ${OBJECTIVE_NUMBER} {N} --done --raw` bash block before the spot-checks, and `{actual vs estimate line}` under `## Wave {N} Complete` |
| plugins/devflow/devflow/workflows/execute-objective.md | `aggregate_results` (l.891) | `**Time:** {output of ... estimate finish ${OBJECTIVE_NUMBER} --raw ...}` under the Waves/Jobs line |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Repo pin, planner, plan-objective | `node --test plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` (tests 1, 2, 6 pass; 3-5 red until Task 2) | 1 then expected-red set | PASS |
| 1: existing prose tests | `node --test doc-refs.repo planning-writes.repo rg-flag-guard planning-audit flutter-ui-scope model-profiles agent-tools df-tools-deprecations.repo` | 0 (131 tests) | PASS |
| 2: surfacing + TRD verify set | `node --test estimate-surfacing.repo doc-refs.repo planning-writes.repo df-tools-deprecations.repo rg-flag-guard` | 0 (50 tests) | PASS |
| 2: every test file that reads build.md or execute-objective.md | `node --test workflow-permissions execute-objective-gh-sync pr-lifecycle-prose.repo executor-isolation agent-tools devflow-workflows.repo prompt-raw-commit.repo gate-commits-merge-sequence agent-shell-harness doc-surfaces` | 0 (153 tests) | PASS |
| 2: CLI smoke of the prose commands | `df-tools estimate objective 58 --line --raw` and `--table --raw` (repo copy); `estimate wave 58 1 --start --raw` against a scratch `DEVFLOW_ESTIMATE_STATE_DIR` | 0 | PASS |

Smoke output (repo copy, real calibration): `Objective 58 estimate: 33 min median (P90 1h 50m) wall · $6.14 (P90 $9.79) · 2 TRDs left in 2 waves · confidence low`; the table form printed the header row `| Objective 58 (2 TRDs left, 2 waves) | Median | P90 |` with the footer and a `Note: missing data: agent_overhead.planner; agent_overhead.verifier` line.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` (committed 21c5ab1a) | 1 (tests 1-5 fail, 6 passes) | FAIL (correct) |
| GREEN (Task 1) | same file after f38c6612 | 1 (1, 2, 6 pass; 3-5 fail) | partial (correct, Task 2 pending) |
| GREEN (Task 2) | same file after 9948a72b | 0 (6/6) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test estimate-surfacing.repo.test.cjs doc-refs.repo.test.cjs planning-writes.repo.test.cjs` | 0 | PASS |
| test | `npm test` | 1 | PASS against baseline: 9706 tests, 9671 pass, 3 fail, 32 skipped; the 3 failures are the known baseline set (MA-7 doctl handoff, roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 would have passed vacuously on the unedited files**
- **Found during:** Task 1 RED run
- **Issue:** The test as specified only checked calls that exist, so with no estimate calls in prose it was green, contradicting the TRD's "3-5 fail until Task 2".
- **Fix:** Added an assertion that each of the four files carries at least one `df-tools.cjs estimate` call, and made the `never block` check unconditional. RED then failed on 1-5 as intended.
- **Files modified:** plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
- **Commit:** 21c5ab1a

**2. [Rule 2 - Missing critical] The `<offer_next>` fail-soft sentence sits inside the placeholder braces**
- **Found during:** Task 1 GREEN
- **Issue:** `<offer_next>` is output directly to the user, so a bare instruction sentence under `### Estimate` would have printed literally.
- **Fix:** The fail-soft sentence is part of the `{output of ...}` placeholder, so it reads as an instruction and is not shown.
- **Files modified:** plugins/devflow/devflow/workflows/plan-objective.md
- **Commit:** f38c6612

### Additions beyond the TRD text

- Test 5 also rejects an estimate call line containing `&&`, a pipe or `$(` (the TRD's "one plain command" binding rule), with a sensitivity case in test 6.
- Test 1 also asserts the `estimate` step precedes `offer_next` in the planner (the TRD's action 1, not in its test list).
- Test 3 also asserts the `**Estimate:**` bullet in build step 3's plan.

## Issues Encountered

- `df-tools estimate objective 58` reports `missing data: agent_overhead.planner; agent_overhead.verifier`: the calibration the repo copy reads has no planner or verifier overhead samples yet. The prose shows the Note line as printed. Not a defect of this TRD.
- Run state: `estimate wave ... --start` was smoke-tested only against a scratch `DEVFLOW_ESTIMATE_STATE_DIR`, so no run state was written under the real `~/.claude/devflow/state/estimates`.

## Discovered commands

None. The stack profile supplied `test: npm test`; no other command was needed.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (planner return, plan-objective display, build one-liner and `estimate start`, execute-objective wave records and aggregate, fail-soft wording in every file)
- Gate failures: None beyond the 3 known baseline failures
- Diff scope: `git diff --stat 86f6622b..HEAD` touches only the five files in `files_modified` plus this SUMMARY

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
- FOUND: plugins/devflow/agents/planner.md
- FOUND: plugins/devflow/devflow/workflows/plan-objective.md
- FOUND: plugins/devflow/devflow/workflows/build.md
- FOUND: plugins/devflow/devflow/workflows/execute-objective.md
- FOUND: 21c5ab1a, f38c6612, 9948a72b
