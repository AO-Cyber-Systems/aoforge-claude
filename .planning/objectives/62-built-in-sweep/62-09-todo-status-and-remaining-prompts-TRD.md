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
  - plugins/devflow/skills/security-audit/SKILL.md
  - plugins/devflow/devflow/workflows/security-audit.md
  - plugins/devflow/skills/cleanup/SKILL.md
  - plugins/devflow/devflow/workflows/cleanup.md
  - plugins/devflow/skills/settings/SKILL.md
  - plugins/devflow/devflow/workflows/settings.md
  - plugins/devflow/skills/set-profile/SKILL.md
  - plugins/devflow/devflow/workflows/set-profile.md
  - plugins/devflow/skills/help/SKILL.md
  - plugins/devflow/devflow/workflows/help.md
  - plugins/devflow/skills/design-review/SKILL.md
  - plugins/devflow/devflow/workflows/design-review.md
  - plugins/devflow/skills/ui-eval/SKILL.md
  - plugins/devflow/devflow/workflows/ui-eval.md
  - plugins/devflow/skills/research-objective/SKILL.md
  - plugins/devflow/devflow/workflows/research-objective.md
  - plugins/devflow/skills/list-objective-assumptions/SKILL.md
  - plugins/devflow/devflow/workflows/list-objective-assumptions.md
  - plugins/devflow/skills/flow/SKILL.md
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/skills/doctor/SKILL.md
  - plugins/devflow/skills/awareness/SKILL.md
  - plugins/devflow/skills/initiatives/SKILL.md
  - plugins/devflow/skills/sync-roadmap/SKILL.md
  - plugins/devflow/skills/tui/SKILL.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json
autonomous: true
requirements: [BLTN-03]
must_haves:
  truths:
    - "Picking a todo, a decision or its option, a resume action, an objective to pause, research and assumption next steps, workstream merge timing, worktree creation and security-audit scope, and answering repair / migration / remove-objective / failed-handoff / archive questions, is an AskUserQuestion (runtime-list rule for lists over 4)"
    - "health.md's kind prompt for migration 0006 offers at most 4 options per question, with the other kinds typed under Other, and never guesses the kind"
    - "Destructive confirmations (remove objective, archive, merge, create worktrees) put the safe option first and never recommend the destructive one"
    - "Open questions (pause-work clarifications, assumption corrections, free descriptions) stay prose; display templates and help text that merely describe prompts are reworded or marked explanatory; help.md's plan-mode paragraph is left for 62-10"
    - "Every skill in the two groups declares the built-ins its flows call (cleanup and flow today); the todo-status-objective and remaining baselines are empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/check-todos.md
      provides: "runtime-list AskUserQuestion for picking a todo"
    - path: plugins/devflow/skills/decide/SKILL.md
      provides: "AskUserQuestion for the decision and the option"
    - path: plugins/devflow/skills/research-objective/SKILL.md
      provides: "AskUserQuestion for the existing-research choice"
    - path: plugins/devflow/skills/cleanup/SKILL.md
      provides: "allowed-tools with AskUserQuestion"
  key_links:
    - "builtin-sweep.repo.test.cjs tests 2, 7, 8 and 9 pass for both groups without a baseline entry"
    - "gh-sync-skill.repo.test.cjs, skill-requires.repo.test.cjs and doc-refs.repo.test.cjs keep passing"
    - "Objective 63 later moves /devflow:todo onto TodoWrite; these conversions are form-only and do not preempt that"
---

# TRD 62-09: Questions in todo, status, objective, decide, handoff and the remaining skills

<objective>
BLTN-03 for two sweep groups, `todo-status-objective` and `remaining`: every skill and workflow not owned by another
conversion TRD. Most of the 43 files need nothing; the inventory's rows for the two groups are the work list. Known
items:

**todo-status-objective**
- **check-todos.md**: `Reply with a number to view details, or:` (+ `/devflow:todo list [area]`, `q`) and
  `Invalid selection. Reply with a number (1-[N])`. A runtime list.
- **health.md** (`/devflow:status check`): `Ask user if they want to run repairs:`, migration 0006's
  `ask the user to choose kind` (six kinds and seven work types: over the 4-option limit), and 0011's
  `ask with three options: **Migrate now** / **Not now** / **Keep mirror mode**`.
- **pause-work.md**: `ask user which objective they're pausing work on` (runtime list) and
  `Ask user for clarifications if needed via conversational questions` (free text).
- **resume-project.md**: `Offer to reconstruct STATE.md` and the `What would you like to do?` menu (`[Secondary
  options:]`, `Wait for user selection.`).
- **remove-objective.md**: `Proceed? (y/n)`.
- **skills/decide**: `Ask the user which decision they want to resolve and which option to pick.` (two runtime lists)
  and the `**Options:**` heading of its decision display template (explanatory).
- **skills/handoff**: `ask the user what they'd like to do` after a failed or cancelled command.

**remaining**
- **workstreams-merge.md**: `Options:` + `Wait for user decision.`; `3. Ask user to resolve` in conflict handling.
- **workstreams-setup.md**: `Offer to view status instead.`, `Wait for user confirmation before creating worktrees.`
- **security-audit.md**: `Options:` + `Wait for user response.` (audit scope).
- **skills/research-objective**: `**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for
  response.`; **research-objective.md**: `If exists: Offer update/view/skip options.`,
  `offer: Plan/Dig deeper/Review/Done`, `offer: Add context/Try different mode/Manual`.
- **list-objective-assumptions.md**: `Wait for user response.` (free text: the user corrects assumptions in their own
  words) and the `offer_next` menu + `Wait for user selection.`
- **cleanup.md**: the pipe-separated `AskUserQuestion: "Proceed with archiving?" with options: ... | "Cancel"`;
  skills/cleanup does not declare AskUserQuestion. **skills/flow** names AskUserQuestion but does not declare it.
- **help.md**: `Presents tests one at a time (yes/no responses)` (explanatory and stale: verify-work's answers are free
  text). Leave the plan-mode paragraph (`EnterPlanMode` ... "present the execution strategy"): 62-10 rewrites it after
  62-05 lands.

Purpose: the rest of SC3. Output: prose edits and two emptied, deleted baselines.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (groups `todo-status-objective` and `remaining`). Five other conversion TRDs
  run in parallel: never touch their files or baselines. Edit only files the inventory lists or the repo test reports;
  the rest are listed because the groups own them.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and your groups' rows of `docs/built-in-sweep.md`. Do not
  edit the inventory; record deviations in the SUMMARY (62-10 reconciles the doc).
- Ratchet TDD per task. RED: delete the entries the task resolves from the group baseline, run the repo test, see it
  fail, commit `test(62-09): ...`. GREEN: edit until it passes, commit `feat(62-09): ...`. Delete a baseline when empty
  (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Convert the form, not the gating and not the store: todo, decision and STATE.md writes keep going through their
  df-tools verbs (`todo add|complete`, `decision answer`, `doc put`). Do not restructure `/devflow:todo` (objective 63).
- Do not change gh-sync's `requires:` or its existing AskUserQuestion prose (gh-sync-skill.repo.test.cjs pins it).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 2: no finding in the 43 group files.
2. Repo test 7: no pair missing for any skill in the two groups (`cleanup:AskUserQuestion`, `flow:AskUserQuestion`
   today, plus each skill whose flow now calls AskUserQuestion: objective, decide, handoff, security-audit,
   research-objective, list-objective-assumptions, ...).
3. Repo test 9: every row of both groups resolved; test 8: no bad marker.
4. `node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes.
5. Neither baseline file exists.

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

skills/research-objective target:

```
AskUserQuestion([
  {
    header: "Research",
    question: "RESEARCH.md already exists for this objective. What next?",
    multiSelect: false,
    options: [
      { label: "View existing (Recommended)", description: "Show the current research" },
      { label: "Update research", description: "Re-run the researcher and replace it" },
      { label: "Skip", description: "Keep it and stop" }
    ]
  }
])
```
</codebase_examples>

<anti_patterns>
- Do not recommend destructive options: `Cancel` first for remove-objective and cleanup's archive; `Not yet` first for
  creating worktrees; never apply migration 0011 from health.md (`Migrate now` hands off to `/devflow:gh-sync migrate`).
- Do not make pause-work's clarifying conversation or list-objective-assumptions' correction step a menu.
- Do not mark a display template line that has a real prompt nearby; convert the prompt, and reword the template line
  (for example `**Options:**` → `**Choices:**`) if the scanner flags it.
- Do not edit a file the inventory does not list and the repo test does not report.
</anti_patterns>

<error_recovery>
- If doc-refs fails after a rewording, a `/devflow:` command reference changed spelling: restore it exactly.
- A fixed menu of 5 entries (resume-project): the 4 most relevant become options, the fifth ("Something else") is typed
  under Other.
- If a research-objective workflow prompt runs inside the researcher subagent rather than the skill, treat it as
  `subagent` (checkpoint return) per built-ins.md and record it.
</error_recovery>

</embedded_context>

<gotchas>
- Headers (12 characters at most): `Todo`, `Repair`, `Kind`, `Work type`, `GitHub store`, `Objective`, `Next step`,
  `Rebuild?`, `Remove?`, `Decision`, `Option`, `Handoff`, `Research`, `Inconclusive`, `Merge`, `Worktrees`,
  `Workstreams`, `Audit scope`, `Archive`.
- resume-project's menu varies with state; keep that logic and turn its result into the options. `Offer to reconstruct
  STATE.md`: `Rebuild?`, `Reconstruct (Recommended)` / `Continue without`.
- remove-objective: `Remove?`, `Cancel (Recommended)` / `Remove objective {N}`; the existing renumbering warning stays.
- handoff: `Retry` / `Run it myself` / `Stop`; a rejected (allowlist) command keeps its no-retry rule: `Run it myself`
  / `Stop` only.
- research-objective outcomes: `Plan objective (Recommended)` / `Dig deeper` / `Review` / `Done`; inconclusive:
  `Add context` / `Try another mode` / `Manual`.
- workstreams-setup: active setup → `Workstreams`, `View status (Recommended)` / `Set up anyway`; before creating
  worktrees → `Worktrees`, `Not yet (Recommended)` / `Create them` (follow the inventory if it says otherwise).
- cleanup.md: rewrite its inline call in object or bullet form, `header: "Archive"`, `Cancel (Recommended)` first.
- help.md `(yes/no responses)`: reword to describe the free-text answer ("pass, or describe what is wrong").
- Keep each SKILL.md's tool-list form (YAML list or inline string) when adding `AskUserQuestion`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: todo and status families (check-todos, add-todo, health, pause-work, progress, resume-project)</name>
  <files>plugins/devflow/skills/todo/SKILL.md, plugins/devflow/devflow/workflows/add-todo.md, plugins/devflow/devflow/workflows/check-todos.md, plugins/devflow/skills/status/SKILL.md, plugins/devflow/devflow/workflows/health.md, plugins/devflow/devflow/workflows/pause-work.md, plugins/devflow/devflow/workflows/progress.md, plugins/devflow/devflow/workflows/resume-project.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json</files>
  <action>
RED: remove the `todo-status-objective.json` entries for these eight files (and their skills' pairs). Run the repo test
(fails). Commit `test(62-09): todo and status prompts leave the built-in sweep baseline`.

GREEN: convert each row per the inventory, the codebase examples and the gotchas. Run the repo test, test-list item 4
and the prose suite. Commit `feat(62-09): todo and status flows ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes with no baseline entry for these files.</verify>
  <done>The todo and status families are converted.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: objective, decide, handoff, workstreams, security-audit, cleanup, flow and help</name>
  <files>plugins/devflow/skills/objective/SKILL.md, plugins/devflow/devflow/workflows/add-objective.md, plugins/devflow/devflow/workflows/remove-objective.md, plugins/devflow/skills/decide/SKILL.md, plugins/devflow/skills/handoff/SKILL.md, plugins/devflow/skills/workstreams/SKILL.md, plugins/devflow/devflow/workflows/workstreams-merge.md, plugins/devflow/devflow/workflows/workstreams-setup.md, plugins/devflow/skills/security-audit/SKILL.md, plugins/devflow/devflow/workflows/security-audit.md, plugins/devflow/skills/cleanup/SKILL.md, plugins/devflow/devflow/workflows/cleanup.md, plugins/devflow/skills/flow/SKILL.md, plugins/devflow/devflow/workflows/help.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json</files>
  <action>
RED: remove the remaining `todo-status-objective.json` entries and the `remaining.json` entries for these files (and
their skills' pairs). Run the repo test (fails). Commit
`test(62-09): objective, decide, handoff, workstreams, audit, cleanup, flow and help leave the baseline`.

GREEN: convert each row per the inventory and the gotchas; declare AskUserQuestion in each skill that now calls it.
Delete `todo-status-objective.json` (now empty). Run the repo test, test-list item 4 and the prose suite. Commit
`feat(62-09): objective, decide, handoff, workstreams, audit and cleanup ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes; `todo-status-objective.json` is gone.</verify>
  <done>These files are converted and the first group's baseline is deleted.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: research-objective, list-objective-assumptions and any other remaining rows</name>
  <files>plugins/devflow/skills/research-objective/SKILL.md, plugins/devflow/devflow/workflows/research-objective.md, plugins/devflow/skills/list-objective-assumptions/SKILL.md, plugins/devflow/devflow/workflows/list-objective-assumptions.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json</files>
  <action>
RED: remove the remaining `remaining.json` entries. Run the repo test (fails). Commit
`test(62-09): research and assumption prompts leave the baseline`.

GREEN: convert each row per the inventory, the codebase example and the gotchas; mark or reword free text; convert any
other `remaining` row (settings, set-profile, design-review, ui-eval, gh-sync, doctor, awareness, initiatives,
sync-roadmap, tui, workstreams-run, workstreams-status) the inventory lists. Delete `remaining.json` (now empty).
Commit `feat(62-09): research and assumption flows ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs` passes and `remaining.json` is gone. The prose suite passes.</verify>
  <done>Test-list items 1-5 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- Every discrete choice in the two groups is an AskUserQuestion within the tool's limits; open questions stay prose.
- Both baselines are deleted; the prose suite is green.
</verification>

<success_criteria>
- [ ] These groups' discrete choices use AskUserQuestion (BLTN-03)
- [ ] Destructive confirmations default to the safe option; cleanup and flow declare AskUserQuestion
- [ ] The todo-status-objective and remaining baselines are gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-09-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
