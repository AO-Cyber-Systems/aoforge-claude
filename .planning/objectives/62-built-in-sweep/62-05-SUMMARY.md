---
objective: 62-built-in-sweep
trd: "05"
subsystem: workflows
tags: [plan-objective, build, plan-mode, askuserquestion, taskcreate, builtin-sweep]

requires:
  - objective: 62-built-in-sweep (TRDs 01-03)
    provides: builtin-audit scanner, the sweep inventory and conventions, the ratchet repo test with per-group baselines
provides:
  - "plan-objective step 13.5: the TRD drafts are presented in plan mode (interactive runs) and pushed only after approval; Requested changes loop through the planner's revision mode"
  - "plan-objective step 5 is a printed strategy block (one flow, one plan-mode approval)"
  - "TaskCreate/TaskUpdate progress for plan-objective (Research, Plan, Verify plans, Review drafts) and build (Research, Plan, Check, Execute, Verify)"
  - "AskUserQuestion for every discrete choice in plan-objective and build (rows BS-015, 016, 019, 020, 021, 022, 023)"
  - "plan-build baseline emptied and deleted"
affects: [62-10]

tech-stack:
  added: []
  patterns:
    - "Deferred push: the planner is told not to push when a draft review will run; the orchestrator pushes after approval"
    - "Ratchet TDD: delete the baseline entry (RED, test commit), convert the prose (GREEN, feat commit), delete the emptied file"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/devflow/workflows/build.md
    - plugins/devflow/skills/plan-objective/SKILL.md
    - plugins/devflow/skills/build/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json

key-decisions:
  - "13.5 is numbered as a half step rather than renumbering, because other prose cites plan-objective step numbers"
  - "build keeps its single strategy approval in plan mode and pushes right away (no draft review)"
  - "A user-requested change from the review does not use up the checker's 3 iterations (iteration_count resets to 1)"

patterns-established:
  - "Verify plans ends on the final checker verdict; the revision loop reopens and re-completes the Plan task"

requirements-completed: [BLTN-01, BLTN-02, BLTN-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-06
tokens_input: 11785367
tokens_output: 57695
tokens_cache_read: 11618356
tokens_cache_write: 166853
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 62 TRD 05: plan-objective and build Summary

**plan-objective now shows its TRD drafts in plan mode and pushes only after approval (Requested changes loop through the planner's revision mode), plan-objective and build report their stages as tasks, and every discrete choice in both is an AskUserQuestion; the plan-build baseline is empty and deleted.**

## Progress
- [x] Task 1: plan-objective draft review in plan mode, deferred push, strategy block — RED 76921ca3, GREEN f120e7b8
- [x] Task 2: Progress in plan-objective and build; ExitPlanMode off build — RED 827fd13d, GREEN fbfd9304
- [x] Task 3: The plan-build group's prompts — RED ef1d555a, GREEN be48f47f

## Accomplishments

- **BLTN-02, plan-objective (Task 1).** Step 5 is now a printed Planning strategy block with no plan mode and no approval (it keeps its skip rule). New `## 13.5 Review TRD Drafts (plan mode)` sits after the checker (or after the planner when the checker is off) and before step 14: the plan holds the wave table, each TRD's goal, tasks, files and requirements, the checker verdict and the estimate, with an "On approval" line. Approval pushes (`plan push`) and goes on; "No, keep planning" feedback becomes `## Requested changes`, which the planner applies in revision mode (`**User review changes:**` in the revision prompt), then the checker runs again and the review is presented again. The skip rule is unchanged from the old step 5 (`--auto`, `--gaps` or `workflow.auto_advance`). The planner prompt (step 9) and the revision prompt carry a conditional `**Push:**` line telling it not to push when 13.5 will run; step 10 pushes at once only when 13.5 will be skipped, and 13.5 says in one sentence what local and store mode do. The skill no longer declares `ExitPlanMode` and loads `references/built-ins.md`. `EnterPlanMode()` now appears once in plan-objective.md, inside step 13.5.
- **BLTN-01 (Task 2).** plan-objective: each TaskCreate (Research, Plan, Verify plans, plus the new Review drafts) is followed by an `in_progress` update; Verify plans completes on the final checker verdict, and the revision loop reopens and re-completes the Plan task. build: five stage tasks created right after step 3 (Research, Plan, Check, Execute, Verify), Research deleted when step 4 is skipped, Check deleted when the checker is off, `in_progress`/`completed` at each stage, Verify completes on any verification status with the status in its description. The two ui-eval follow-up TaskCreate calls are unchanged. plan-objective declares TaskCreate and TaskUpdate; build drops `ExitPlanMode`. build step 5 pushes right away (`**Pushed:** no` is pushed; no `**Push:**` line is passed), so its behaviour is unchanged.
- **BLTN-03 (Task 3).** AskUserQuestion with the routing kept: step 6 RESEARCH BLOCKED (`Research`), step 7 existing TRDs (`TRDs exist`), step 10 CHECKPOINT REACHED (`Checkpoint`, decision type only, runtime-list rule for more than 4 options; other types stay free text) and PLANNING INCONCLUSIVE (`Inconclusive`), step 13 max iterations (`Max retries`), and build's two `--pause` waits (`Pause`: Continue / Stop here, printing the command to resume). The wave-by-wave pause stays as written (delegates to execute-objective).

### Inventory rows resolved

| Row | Prompt | Resolution |
|---|---|---|
| BS-015 | build: research `--pause` wait | AskUserQuestion `Pause` |
| BS-016 | build: TRD summary `--pause` wait | AskUserQuestion `Pause` |
| BS-017 | build: wave-by-wave pause | kept (manual, not flagged) |
| BS-018 | plan-objective step 5 plan mode | reworded: printed block, draft review moved to 13.5 |
| BS-019 | RESEARCH BLOCKED offer | AskUserQuestion `Research` |
| BS-020 | existing TRDs offer | AskUserQuestion `TRDs exist` |
| BS-021 | CHECKPOINT REACHED | AskUserQuestion `Checkpoint` for decision checkpoints |
| BS-022 | PLANNING INCONCLUSIVE offer | AskUserQuestion `Inconclusive` |
| BS-023 | max-iterations offer | AskUserQuestion `Max retries` |

Plus the progress rows (build, plan-objective), the plan-mode row (plan-objective) and the allowed-tools rows (build and plan-objective: ExitPlanMode removed; plan-objective: TaskCreate, TaskUpdate added).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: plan-objective draft review | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` (22 pass); `rg -n "EnterPlanMode\(" .../plan-objective.md` prints one line (769, inside `## 13.5`) | 0 | PASS |
| 2: progress | same command (22 pass), no plan-objective or build progress/allowed-tools entry left | 0 | PASS |
| 3: prompts | same command (22 pass), `plan-build.json` deleted; prose suite 148 pass | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, 76921ca3) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (tests 6 and 7: `plan-objective` has no plan-mode draft review; declares ExitPlanMode) | FAIL (correct) |
| GREEN (Task 1, f120e7b8) | same, plus estimate-surfacing | 0 (22 pass) | PASS (correct) |
| RED (Task 2, 827fd13d) | same | 1 (tests 5 and 7: build and plan-objective lack progress; plan-objective TaskCreate/TaskUpdate missing; build:ExitPlanMode forbidden) | FAIL (correct) |
| GREEN (Task 2, fbfd9304) | same, plus estimate-surfacing | 0 (22 pass) | PASS (correct) |
| RED (Task 3, ef1d555a) | same | 1 (tests 2 and 9a: the six prompt findings unlisted, named by file and line) | FAIL (correct) |
| GREEN (Task 3, be48f47f) | same, plus estimate-surfacing | 0 (22 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` | 0 (22 pass) | PASS |
| builtin audit and sweep | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 0 (112 pass) | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 (148 pass; with builtin-audit.test.cjs 244 pass) | PASS |
| related | `node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` (references these workflows) | 0 (81 pass) | PASS |

## Discovered commands

None. `test` came from the stack profile (`node --test {files}`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale step references in plan-objective.md**
- **Found during:** Task 1 (routing the end of steps 10, 12 and 13 to 13.5)
- **Issue:** step 10 said "skip to step 13" (the revision loop) when the checker is off and "Otherwise: step 10" (itself); step 12 said "Proceed to step 13" after a pass and "proceed to step 12" (itself) after issues; step 13 said "spawn checker again (step 10)". The checker is step 11.
- **Fix:** checker off or verification passed now goes to step 13.5, issues go to step 13, "Otherwise" goes to step 11, and the re-spawn names step 11.
- **Files modified:** plugins/devflow/devflow/workflows/plan-objective.md
- **Commit:** f120e7b8

**2. [Rule 3 - Blocking] planning-writes audit flagged a new progress line**
- **Found during:** Task 2 (prose suite)
- **Issue:** "Update progress ... VERIFICATION PASSED" put a write verb within 80 characters of a planning artifact token (`planning-writes.repo.test.cjs`).
- **Fix:** reworded to "Progress tracking (if available): Verify plans ends on the final verdict...".
- **Commit:** fbfd9304

### Interpretation choices (not rule deviations)

- **Option order.** `references/built-ins.md` puts the recommended option first, so Inconclusive lists `Retry (Recommended)` before `Add context` (the inventory row lists it second), and Max retries lists `Provide guidance (Recommended)` first (the example in built-ins.md uses that order).
- **Routing for BS-019, BS-020 and BS-022.** The original prose named no routing for these offers; the one-line routing under each option (re-spawn the researcher with the context, add to or replace the existing TRDs, retry the planner, stop for manual planning) follows from the labels. The TRD's Task 3 action did not list RESEARCH BLOCKED (BS-019) but the baseline and inventory did, so it is converted.
- **`--pause` resume commands.** After research the resume command is `/devflow:build {X}`; after the TRDs it is `/devflow:execute-objective {X}` (the TRDs are published, and a rebuild would plan again).
- **build/SKILL.md** also loads `references/built-ins.md` (the TRD asked for it only for plan-objective); build now follows the same progress and question conventions.
- **Step 13.5 skip case** pushes only when the last planner return said `**Pushed:** no`: in the skip cases the planner pushes itself (no `**Push:**` line), so no unconditional second push is run.
- **Checker iterations.** A change requested in the review resets `iteration_count` to 1, so a user-requested revision does not use up the checker's 3 iterations.
- **Revision prompt** gained a `**Push:**` line as well as the planner prompt, because the planner's revision mode pushes by default too.

No file outside the TRD's `files_modified` was changed. `agents/planner.md` and the inventory are untouched.

## Post-TRD Verification

- Auto-fix cycles used: 0 (two small fixes, each applied once)
- Must-haves verified: 6/6 (13.5 in plan mode and interactive only; `--auto`/`--gaps`/`auto_advance` skip it; step 5 has no plan mode; progress in both flows; every discrete choice an AskUserQuestion; allowed-tools correct and the baseline deleted)
- Gate failures: None
- Files changed outside the TRD's `files_modified`: none
- `npm test` was not run in full (the 62-03 SUMMARY records 3 unrelated pre-existing failures); the scoped, prose and related suites above are green.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/devflow/workflows/build.md, plugins/devflow/skills/plan-objective/SKILL.md, plugins/devflow/skills/build/SKILL.md
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/ (7 files; plan-build.json deleted)
- FOUND commits: 76921ca3, f120e7b8, 827fd13d, fbfd9304, ef1d555a, be48f47f
