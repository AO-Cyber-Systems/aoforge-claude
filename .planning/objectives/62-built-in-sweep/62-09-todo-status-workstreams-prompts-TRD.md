---
objective: 62-built-in-sweep
trd: "09"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/todo/SKILL.md
  - plugins/devflow/devflow/workflows/add-todo.md
  - plugins/devflow/devflow/workflows/check-todos.md
  - plugins/devflow/skills/status/SKILL.md
  - plugins/devflow/devflow/workflows/health.md
  - plugins/devflow/devflow/workflows/pause-work.md
  - plugins/devflow/devflow/workflows/progress.md
  - plugins/devflow/devflow/workflows/resume-project.md
  - plugins/devflow/skills/objective/SKILL.md
  - plugins/devflow/devflow/workflows/add-objective.md
  - plugins/devflow/devflow/workflows/remove-objective.md
  - plugins/devflow/skills/decide/SKILL.md
  - plugins/devflow/skills/handoff/SKILL.md
  - plugins/devflow/skills/workstreams/SKILL.md
  - plugins/devflow/devflow/workflows/workstreams-merge.md
  - plugins/devflow/devflow/workflows/workstreams-run.md
  - plugins/devflow/devflow/workflows/workstreams-setup.md
  - plugins/devflow/devflow/workflows/workstreams-status.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json
autonomous: true
requirements: [BLTN-03]
must_haves:
  truths:
    - "Picking a todo, a decision or its option, a resume action or an objective to pause, workstream merge timing and worktree creation, and the repair, migration, remove-objective and failed-handoff questions, are all AskUserQuestion (runtime-list rule for lists over 4)"
    - "health.md's kind prompt for migration 0006 offers at most 4 options per question, with the other kinds typed under Other, and never guesses the kind"
    - "Destructive confirmations (remove objective, merge, create worktrees) put the safe option first and never recommend the destructive one"
    - "Open questions (pause-work clarifications, free descriptions) stay prose; display templates that merely show options are reworded or marked explanatory"
    - "todo, status, objective, decide, handoff and workstreams declare AskUserQuestion when their flows call it; the todo-status-objective baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/check-todos.md
      provides: "runtime-list AskUserQuestion for picking a todo"
    - path: plugins/devflow/devflow/workflows/resume-project.md
      provides: "AskUserQuestion for the next action and for reconstructing STATE.md"
    - path: plugins/devflow/skills/decide/SKILL.md
      provides: "AskUserQuestion for the decision and the option"
    - path: plugins/devflow/devflow/workflows/workstreams-merge.md
      provides: "AskUserQuestion for merge timing"
  key_links:
    - "builtin-sweep.repo.test.cjs tests 2, 7, 8 and 9 pass for the todo-status-objective group without a baseline entry"
    - "builtin-audit.cjs GROUPS (62-01) puts workstreams in todo-status-objective, so this TRD and 62-11 never share a baseline file"
    - "Objective 63 later moves /devflow:todo onto TodoWrite; these conversions are form-only and do not preempt that"
---

# TRD 62-09: Questions in todo, status, objective, decide, handoff and workstreams

<objective>
BLTN-03 for the `todo-status-objective` group, which also holds the workstreams skill and its four workflows (GROUPS
in 62-01). The group's inventory rows are the work list. Known items:

- **check-todos.md**: `Reply with a number to view details, or:` (+ `/devflow:todo list [area]`, `q`) and
  `Invalid selection. Reply with a number (1-[N])`. A runtime list.
- **health.md** (`/devflow:status check`): `Ask user if they want to run repairs:`, migration 0006's
  `ask the user to choose kind` (six kinds and seven work types, over the 4-option limit), and 0011's
  `ask with three options: **Migrate now** / **Not now** / **Keep mirror mode**`.
- **pause-work.md**: `ask user which objective they're pausing work on` (runtime list) and
  `Ask user for clarifications if needed via conversational questions` (free text).
- **resume-project.md**: `Offer to reconstruct STATE.md` and the `What would you like to do?` menu (`[Secondary
  options:]`, `Wait for user selection.`).
- **remove-objective.md**: `Proceed? (y/n)`.
- **skills/decide**: `Ask the user which decision they want to resolve and which option to pick.` (two runtime lists)
  and the `**Options:**` heading of its decision display template (explanatory).
- **skills/handoff**: `ask the user what they'd like to do` after a failed or cancelled command.
- **workstreams-merge.md**: `Options:` + `Wait for user decision.`; `3. Ask user to resolve` in conflict handling.
- **workstreams-setup.md**: `Offer to view status instead.`, `Wait for user confirmation before creating worktrees.`
- Anything the inventory lists in add-todo.md, progress.md, add-objective.md, workstreams-run.md,
  workstreams-status.md and the skills.

Purpose: this group's part of SC3. Output: prose edits and an emptied, deleted baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `todo-status-objective`). Six other conversion TRDs run in parallel on
  their own files and baselines, 62-11 among them (group `remaining`): never touch theirs. Edit only files the inventory
  lists or the repo test reports; the rest are listed because the group owns them.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `todo-status-objective` rows of
  `docs/built-in-sweep.md`. Do not edit the inventory; record deviations in the SUMMARY (62-10 reconciles the doc).
- Ratchet TDD per task. RED: delete the entries the task resolves from `todo-status-objective.json`, run the repo test,
  see it fail, commit `test(62-09): ...`. GREEN: edit until it passes, commit `feat(62-09): ...`. Delete the baseline
  when it is empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Convert the form, not the gating and not the store: todo, decision and STATE.md writes keep going through their
  df-tools verbs (`todo add|complete`, `decision answer`, `doc put`). Do not restructure `/devflow:todo` (objective 63).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 2: no finding in the 18 group files.
2. Repo test 7: no `todo:`, `status:`, `objective:`, `decide:`, `handoff:` or `workstreams:` pair missing (each
   declares AskUserQuestion once its flow calls it).
3. Repo test 9: every `todo-status-objective` row resolved; test 8: no bad marker.
4. `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`
   passes (these files carry many df-tools verbs and command names).
5. The todo-status-objective baseline no longer exists.

<embedded_context>

<codebase_examples>
Runtime-list form (check-todos; built-ins.md):

```
Print the numbered list as today, then:

AskUserQuestion([
  {
    header: "Todo",
    question: "Which todo? Pick one, or under Other type its number, an area to filter by, or q to exit.",
    multiSelect: false,
    options: [
      { label: "{title 1}", description: "{area}, {age}" },
      { label: "{title 2}", description: "{area}, {age}" },
      { label: "{title 3}", description: "{area}, {age}" },
      { label: "{title 4}", description: "{area}, {age}" }
    ]
  }
])
```

With fewer todos, fewer options (at least 2; with exactly one todo, `Open it (Recommended)` / `Exit`).

decide without arguments: first the decision (runtime list, header `Decision`), then its options (header `Option`, the
recommendation first with ` (Recommended)`). With arguments the skill resolves directly, as today.

health.md 0006, four options per question, the rest typed under Other; never guess:

```
header: "Kind"       options: api / app / library / cli        (question names ui-lib and plugin for Other)
header: "Work type"  options: Skip (Recommended) / feature / port / refactor
                     (question names foundation, bugfix, prototype, spike for Other)
```
</codebase_examples>

<anti_patterns>
- Do not recommend destructive options: `Cancel` first for remove-objective, `Not yet` first for creating worktrees;
  never apply migration 0011 from health.md (`Migrate now` hands off to `/devflow:gh-sync migrate`).
- Do not make pause-work's clarifying conversation a menu.
- Do not mark a display template line that has a real prompt nearby; convert the prompt and reword the template line
  (for example `**Options:**` → `**Choices:**`) if the scanner flags it.
</anti_patterns>

<error_recovery>
- If doc-refs fails after a rewording, a `/devflow:` command reference changed spelling: restore the exact command.
- A fixed menu of 5 entries (resume-project): the 4 most relevant become options, the fifth ("Something else") is typed
  under Other.
</error_recovery>

</embedded_context>

<gotchas>
- Headers (12 characters at most): `Todo`, `Repair`, `Kind`, `Work type`, `GitHub store`, `Objective`, `Next step`,
  `Rebuild?`, `Remove?`, `Decision`, `Option`, `Handoff`, `Merge`, `Worktrees`, `Workstreams`.
- resume-project's menu varies with state; keep that logic and turn its result into the options. `Offer to reconstruct
  STATE.md`: `Rebuild?`, `Reconstruct (Recommended)` / `Continue without`.
- remove-objective: `Remove?`, `Cancel (Recommended)` / `Remove objective {N}`; the existing renumbering warning stays.
- handoff: `Retry` / `Run it myself` / `Stop`; a rejected (allowlist) command keeps its no-retry rule: `Run it myself`
  / `Stop` only.
- workstreams-setup: active setup → `Workstreams`, `View status (Recommended)` / `Set up anyway`; before creating
  worktrees → `Worktrees`, `Not yet (Recommended)` / `Create them` (follow the inventory if it says otherwise).
- Skills here use YAML lists; add `AskUserQuestion` where it is missing.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: todo and status families (check-todos, add-todo, health, pause-work, progress, resume-project)</name>
  <files>plugins/devflow/skills/todo/SKILL.md, plugins/devflow/devflow/workflows/add-todo.md, plugins/devflow/devflow/workflows/check-todos.md, plugins/devflow/skills/status/SKILL.md, plugins/devflow/devflow/workflows/health.md, plugins/devflow/devflow/workflows/pause-work.md, plugins/devflow/devflow/workflows/progress.md, plugins/devflow/devflow/workflows/resume-project.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json</files>
  <action>
RED: remove the baseline entries for these eight files (and their skills' pairs). Run the repo test (fails). Commit
`test(62-09): todo and status prompts leave the built-in sweep baseline`.

GREEN: convert each row per the inventory, the codebase examples and the gotchas. Run the repo test, test-list item 4
and the prose suite. Commit `feat(62-09): todo and status flows ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes with no baseline entry for these files.</verify>
  <done>The todo and status families are converted.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: objective, decide, handoff and workstreams</name>
  <files>plugins/devflow/skills/objective/SKILL.md, plugins/devflow/devflow/workflows/add-objective.md, plugins/devflow/devflow/workflows/remove-objective.md, plugins/devflow/skills/decide/SKILL.md, plugins/devflow/skills/handoff/SKILL.md, plugins/devflow/skills/workstreams/SKILL.md, plugins/devflow/devflow/workflows/workstreams-merge.md, plugins/devflow/devflow/workflows/workstreams-setup.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json</files>
  <action>
RED: remove the remaining entries. Run the repo test (fails). Commit
`test(62-09): objective, decide, handoff and workstreams prompts leave the baseline`.

GREEN: convert each row per the inventory and the gotchas (workstreams-run.md and workstreams-status.md only if the
inventory lists them); declare AskUserQuestion in each skill that now calls it. Delete the now-empty baseline with the
prose. Commit `feat(62-09): objective, decide, handoff and workstreams ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes and the baseline is gone. The prose suite passes.</verify>
  <done>Test-list items 1-5 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- Every discrete choice in the group is an AskUserQuestion within the tool's limits; open questions stay prose.
- The todo-status-objective baseline is deleted; the prose suite is green.
</verification>

<success_criteria>
- [ ] This group's discrete choices use AskUserQuestion (BLTN-03)
- [ ] Destructive confirmations default to the safe option
- [ ] The todo-status-objective baseline is gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-09-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
