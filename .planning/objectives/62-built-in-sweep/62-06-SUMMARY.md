---
objective: 62-built-in-sweep
trd: "06"
subsystem: workflows
tags: [new-project, plan-mode, askuserquestion, built-ins, ratchet]

requires:
  - "62-01: builtin-audit.cjs scanner"
  - "62-02: references/built-ins.md conventions and docs/built-in-sweep.md inventory"
  - "62-03: builtin-sweep.repo.test.cjs ratchet and the new-project baseline"
provides:
  - "new-project presents the PROJECT.md draft, the REQUIREMENTS.md draft and the proposed roadmap in plan mode before each is committed (BLTN-02)"
  - "new-project's discrete choices are AskUserQuestion within the tool's limits (BLTN-03)"
  - "skills/new-project declares TaskCreate, TaskUpdate and EnterPlanMode and loads references/built-ins.md"
affects: [62-10]

tech-stack:
  added: []
  patterns:
    - "Review block per draft: a Skip line naming --auto, EnterPlanMode(), 'Put in the plan', ExitPlanMode(), then the approved and 'No, keep planning' routes"
    - "AskUserQuestion oversize menus cut to 4 options with the remaining answers typed under Other and validated on routing"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/skills/new-project/SKILL.md
  deleted:
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json

key-decisions:
  - "The reviews skip on --auto only, never workflow.auto_advance: step 5 and step 2a write auto_advance true into every new config, so keying on it would remove the roadmap approval for every interactive user"
  - "Kind and default-work questions offer 4 options each; ui-lib and plugin, and foundation, bugfix and prototype, are typed under Other and anything else re-asks"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true

duration: 3min
completed: 2026-10-06
---

# Objective 62 TRD 06: new-project presents its drafts in plan mode Summary

**new-project now puts the PROJECT.md draft, the REQUIREMENTS.md draft and the proposed roadmap in plan mode before each is committed (skipped on `--auto` only), and every discrete choice is an AskUserQuestion within the tool's 4-option, 12-character limits; the new-project baseline is deleted.**

## Progress
- [x] Task 1: Plan-mode reviews of PROJECT.md, REQUIREMENTS.md and the roadmap — RED 47b46d44, GREEN 22c77758
- [x] Task 2: new-project's remaining prompts and schema fixes — RED 5e98ec26, GREEN bd5b4132

## Accomplishments

- **Three plan-mode reviews (Task 1).** Step 4 puts the full PROJECT.md draft in the plan before `doc put PROJECT.md` and the commit. Step 7 replaces `Does this capture what you're building? (yes / adjust)` with a review that holds every requirement (not counts); Requested changes return to scoping as `adjust` did. Step 8 replaces the Approve / Adjust objectives / Review full file question with a review holding the Proposed Roadmap table, every objective's details and the `.planning/ROADMAP.md` path; Requested changes feed the existing roadmapper revision `Task(`. Each review carries a `**Skip if:** --auto` line directly above `EnterPlanMode()` and the step 8 `**If auto mode:** Skip approval gate` line is kept. `rg -c "EnterPlanMode\(" workflows/new-project.md` is 3.
- **Skill declarations.** `skills/new-project/SKILL.md` adds `TaskCreate`, `TaskUpdate` and `EnterPlanMode` to `allowed-tools` (not `ExitPlanMode`) and `@~/.claude/devflow/references/built-ins.md` to `<execution_context>`. The existing roadmap TaskCreate/TaskUpdate calls are unchanged.
- **Prompts and schema (Task 2).** Kind question: header `Project kind`, 4 options (api / app / library / cli), question names `ui-lib` and `plugin` as answers to type under Other. Work-type question: header `Work type`, 4 options (Skip — work types vary (Recommended) / feature / port / refactor), question names `foundation`, `bugfix` and `prototype`; the Rails example is gone. Routing re-asks when an Other answer is not a valid kind or work type, and the auto-mode inference text is untouched. Step 5: `header: "Settings"` with Use defaults (Recommended) / Customize; `--interactive` still expands the full question set directly. STACK.md: `header: "Stack"` with Write it (Recommended) / Edit first / Skip; only Write it runs `stack init --from research --write`. The free-text capabilities ask carries an allow marker.
- **Baseline.** `new-project.json` was emptied in two RED steps and deleted in the final GREEN commit.

### Inventory rows resolved

BS-024 (kind question), BS-025 (work-type header), BS-026 (work-type question), BS-027 (settings defaults), BS-028 (STACK.md prompt), BS-029 (free-text ask, allow marker), BS-030 (requirements review), BS-031 (roadmap review, manual).

## Deviations from Plan

None - TRD executed as written. Small choices within its latitude:

- **Review full file dropped.** The roadmap's third option (`cat .planning/ROADMAP.md`) has no counterpart in plan mode; the plan names `.planning/ROADMAP.md` for the full file instead.
- **STACK.md "Edit first".** The old prose never said how `edit` was applied. The route is: collect the user's changes, apply them to the draft, ask again.
- **Step headings.** `**Commit PROJECT.md:**`, `**Commit requirements:**` became `... (after approval or auto mode)`, matching the existing roadmap heading.
- **Process note.** The first prose-suite run used the session's default directory (the main checkout, same 148 passing) rather than the worktree; it was re-run with absolute worktree paths and is the figure reported below.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Plan-mode reviews | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs planning-writes.repo.test.cjs` (39 pass) and `rg -c "EnterPlanMode\(" workflows/new-project.md` = 3 | 0 | PASS |
| 2: Remaining prompts and schema | `node --test builtin-audit.test.cjs builtin-sweep.repo.test.cjs` (112 pass); baseline `new-project.json` absent | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test builtin-sweep.repo.test.cjs` (4 failing: tests 2, 6, 7, 9a) | 1 | FAIL (correct) |
| GREEN (Task 1) | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs planning-writes.repo.test.cjs` | 0 | PASS (correct) |
| RED (Task 2) | `node --test builtin-sweep.repo.test.cjs` (6 prompt findings, tests 2 and 9a failing) | 1 | FAIL (correct) |
| GREEN (Task 2) | `node --test builtin-audit.test.cjs builtin-sweep.repo.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test builtin-sweep.repo.test.cjs adopt-skill-contract.test.cjs` | 0 | PASS |
| prose suite | `node --test '<worktree>/plugins/devflow/devflow/bin/lib/*.repo.test.cjs' adopt-skill-contract.test.cjs` (148 pass, 0 fail) | 0 | PASS |

`builtin-audit.test.cjs` + `builtin-sweep.repo.test.cjs`: 112 pass, 0 fail. The full `npm test` was not run.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (three reviews with `--auto` skips; AskUserQuestion conversions; schema limits; skill declarations; baseline deleted)
- Gate failures: None
- Files changed outside the TRD's `files_modified`: none (STATE.md, STATE_ARCHIVE.md, ROADMAP.md, state.json by the df-tools state commands)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/workflows/new-project.md
- FOUND: plugins/devflow/skills/new-project/SKILL.md
- ABSENT (intended): plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json
- FOUND commits: 47b46d44, 22c77758, 5e98ec26, bd5b4132
