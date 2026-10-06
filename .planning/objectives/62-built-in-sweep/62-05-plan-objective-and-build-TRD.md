---
objective: 62-built-in-sweep
trd: "05"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/plan-objective/SKILL.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/skills/build/SKILL.md
  - plugins/devflow/devflow/workflows/build.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json
autonomous: true
requirements: [BLTN-01, BLTN-02, BLTN-03]
must_haves:
  truths:
    - "Interactive /devflow:plan-objective (no --auto, no --gaps, workflow.auto_advance false) presents the TRD drafts in plan mode after the checker and before they are pushed; approval pushes them and continues; 'keep planning' feedback becomes Requested changes that the planner applies in revision mode before the drafts are presented again"
    - "Under --auto, --gaps or workflow.auto_advance the review is skipped and the TRDs are pushed as before"
    - "plan-objective step 5 prints the planning strategy without entering plan mode, so one flow has one plan-mode approval"
    - "plan-objective tracks Research, Plan, Verify plans and Review drafts as tasks moving through in_progress to completed; build tracks Research, Plan, Check, Execute and Verify"
    - "Every discrete choice in plan-objective and build (existing TRDs, max-iterations stop, planning inconclusive, decision checkpoints, --pause waits) is an AskUserQuestion"
    - "plan-objective and build declare TaskCreate, TaskUpdate and EnterPlanMode and do not declare ExitPlanMode; the plan-build baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/plan-objective.md
      provides: "step 13.5 Review TRD Drafts (plan mode); deferred push; strategy block; progress; AskUserQuestion conversions"
    - path: plugins/devflow/devflow/workflows/build.md
      provides: "pipeline progress tasks; explicit push in step 5; AskUserQuestion for --pause waits"
    - path: plugins/devflow/skills/plan-objective/SKILL.md
      provides: "allowed-tools without ExitPlanMode, with TaskCreate/TaskUpdate; execution_context loads references/built-ins.md"
  key_links:
    - "builtin-sweep.repo.test.cjs PROGRESS_FLOWS build (min 4) and plan-objective (min 4), DRAFT_FLOWS plan-objective pass without baseline entries"
    - "estimate-surfacing.repo.test.cjs tests 2 and 3 keep passing (step 10 PLANNING COMPLETE bullet mentions the Estimate; build's step 3 **Estimate:** bullet, `## 4. Research`, `## 7. Execute TRDs`, `## 8.` anchors)"
    - "planner.md's PLANNING COMPLETE return already carries **Pushed:** yes|no; no agent change is needed"
---

# TRD 62-05: plan-objective drafts in plan mode; progress and questions in plan-objective and build

<objective>
plan-objective is the one flow in all three requirements; build shares half its steps.

**BLTN-02, plan-objective.** Today step 5 enters plan mode before any agent runs, to show a *strategy* (steps and
models). The drafts the user should approve (the TRDs) are never presented. Move plan mode to where the drafts exist:

- Step 5 becomes a printed **Planning strategy** block (no plan mode, no approval). One flow, one approval.
- New **step 13.5, Review TRD Drafts (plan mode)**, after the checker passes (or after the planner when the checker is
  off), before step 14. It follows the loop in `references/built-ins.md`: the plan holds the wave table, each TRD's
  goal, tasks, files and requirements, the checker verdict and the estimate; approval pushes; "keep planning" feedback
  becomes `## Requested changes`, which the planner applies in revision mode (then the checker, then the review again).
- The push moves: step 10 pushes at once only when 13.5 will be skipped; otherwise 13.5 pushes after approval. The
  planner is told not to push (its return then says `**Pushed:** no`, which step 10 already understands).
- Skip rule, unchanged from today's step 5: `--auto`, `--gaps` or `workflow.auto_advance` true.

**BLTN-01.** plan-objective: Research, Plan, Verify plans exist as tasks without an in_progress state; add it, and add
Review drafts. build: tasks for Research, Plan, Check, Execute and Verify (today it only creates the two ui-eval
follow-ups).

**BLTN-03.** The inventory's `plan-build` rows: step 7 `Offer: 1) Add more TRDs, 2) View existing, 3) Replan from
scratch.`, step 13 `Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon`, step 10's PLANNING
INCONCLUSIVE `offer: Add context / Retry / Manual` and CHECKPOINT REACHED handling, build's `--pause` waits.

**allowed-tools.** Both skills drop `ExitPlanMode` (its permission prompt is the plan approval; pre-approving it could
approve the draft unseen) and declare TaskCreate, TaskUpdate and EnterPlanMode. plan-objective loads
`@~/.claude/devflow/references/built-ins.md`.

build's own step 3 plan mode (a strategy approval before an expensive pipeline) stays as it is: build is not a BLTN-02
draft flow.

Purpose: SC1 for build and plan-objective, SC2 for plan-objective, their part of SC3. Output: prose edits and an
emptied, deleted baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `plan-build`). Six other conversion TRDs run in parallel: never touch
  their files or baselines. Do not edit `agents/planner.md`.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `plan-build` rows of `docs/built-in-sweep.md`.
  Do not edit the inventory; record deviations in the SUMMARY.
- Ratchet TDD per task. RED: delete the entries the task resolves from `plan-build.json`, run the repo test, see it fail
  naming them, commit `test(62-05): ...`. GREEN: edit until it passes, commit `feat(62-05): ...`. Delete the baseline
  when it is empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Keep the estimate-surfacing anchors (key_links) byte-for-byte: `## 3. Present Build Plan`, `## 4. Research`,
  `## 7. Execute TRDs`, `## 8.`, build step 3's `**Estimate:**` bullet, plan-objective's
  `- **\`## PLANNING COMPLETE\`:**` bullet with the word Estimate, `<offer_next>`'s `### Estimate` block. In build's
  `## 7. Execute TRDs`, `estimate start` must stay before the first `Task(`; `TaskCreate(`/`TaskUpdate(` do not contain
  `Task(`, so progress lines there are safe.
- Use `## 13.5 Review TRD Drafts (plan mode)` rather than renumbering: other prose cites step numbers.
- planning-writes: no write verb within 80 characters of `TRD` without a df-tools verb within 3 lines. Phrase the plan
  step as "Put in the plan: ..." and keep `plan push` / `plan put-trd` calls nearby.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

Assertions this TRD turns green without a baseline entry (repo test unless named):

1. Test 6, `plan-objective`: `planModeSpans(plan-objective.md)` has a span whose text mentions a draft; every span has an
   ExitPlanMode and a skip line naming `--auto` within the 20 lines above; skills/plan-objective declares EnterPlanMode
   and not ExitPlanMode.
2. Test 5, `plan-objective`: creates ≥ 4, completes ≥ 4, in_progress ≥ 1; declares TaskCreate and TaskUpdate.
3. Test 5, `build`: creates ≥ 4, completes ≥ 4, in_progress ≥ 1; declares both.
4. Test 7: no `plan-objective:` or `build:` pair missing or forbidden (ExitPlanMode removed from both).
5. Test 2 and test 9: no finding and every `plan-build` row resolved in the four files; test 8 no bad marker.
6. `estimate-surfacing.repo.test.cjs` tests 2 and 3 pass unchanged.
7. Step 5 contains no `EnterPlanMode(`; the only plan-objective span is in `## 13.5`.

<embedded_context>

<codebase_examples>
plan-objective.md today:

```
## 5. Present Planning Strategy (EnterPlanMode)
**Skip if:** `--auto` flag, `--gaps` flag, or config `workflow.auto_advance` is true.
Use Claude Code's built-in plan mode to present the planning strategy before spawning agents:
EnterPlanMode()
Write a plan summarizing: Objective / Steps / Models / Existing context / User preferences
ExitPlanMode()
Once user approves, proceed.
```

Step 10's bullet: `- **\`## PLANNING COMPLETE\`:** Display TRD count and the return's \`**Estimate:**\` block as is. If
the return says \`**Pushed:** no\` (TRDs published with \`--no-push\` and no push), push them now: \`node
~/.claude/devflow/bin/df-tools.cjs plan push "${objective_number}"\` ... Otherwise: step 10.` Step 13 is the revision
loop (its revision prompt is the template for user-requested changes). Step 15 is auto-advance; `<offer_next>` runs
`df-tools.cjs estimate objective {X} --table --raw`.

Step 13.5 skeleton (fill in; keep the word "draft" between EnterPlanMode and ExitPlanMode):

```
## 13.5 Review TRD Drafts (plan mode)

**Skip if:** `--auto` flag, `--gaps` flag, or config `workflow.auto_advance` is true. Then push now (if step 10 has not):
`node ~/.claude/devflow/bin/df-tools.cjs plan push "${objective_number}"`, and continue to step 14.

**Progress tracking (if available):** TaskCreate(subject="Review Objective {X} TRD drafts", ...),
TaskUpdate(taskId=review_task_id, status="in_progress")

Before entering plan mode, run `node ~/.claude/devflow/bin/df-tools.cjs estimate objective {X} --table --raw`
(plan mode prompts for commands outside the read-only set).

EnterPlanMode()

Put in the plan, as the draft for review:
- Objective {X}: {name} — {goal}; {N} TRDs in {M} waves; checker: {verdict, confidence}
- Wave table, then per TRD: file name, wave, depends_on, requirements, its objective in one line, task names
- The estimate table
- On approval: push the TRDs (`plan push`), then step 14

ExitPlanMode()
```

Then the loop from references/built-ins.md: approved as-is → apply any user edits to the TRD drafts the user made in
the plan (revision mode, below), push, TaskUpdate completed, step 14. "No, keep planning" + feedback → add
`## Requested changes` to the plan, ExitPlanMode again; approval → spawn the planner with step 13's revision prompt,
`**User review changes:**` in place of checker issues; re-run the checker if enabled; return to the top of 13.5.

The planner prompt (step 9) gains one line in `<planning_context>` when 13.5 will run:
`**Push:** do not run \`plan push\`; the orchestrator pushes after the user reviews the drafts.`

build.md: `## 4. Research` (`If --pause flag: Display research results and wait for confirmation before proceeding.`),
`## 5. Generate TRDs` ("Handle its return as in plan-objective step 10"; `If --pause flag: Display TRD summary and wait
for confirmation.`), `## 6. Verify TRDs`, `## 7. Execute TRDs` (`If --pause flag: Execute one wave at a time, pausing
between waves.`), `## 8. Auto-Verify + Complete`. skills/build declares tools inline:
`allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, EnterPlanMode, ExitPlanMode`.
</codebase_examples>

<anti_patterns>
- Do not keep two plan-mode approvals in plan-objective.
- Do not spawn the planner while in plan mode; the loop exits plan mode (by approval) before any agent runs.
- Do not push before the review in interactive mode, and do not forget to push when the review is skipped.
- Do not add plan mode to build's TRD step; build keeps its single strategy approval.
- Do not touch the duplicate-detection AskUserQuestion (step 6.5) beyond what the inventory lists; its 4-option list
  is a locked decision from objective 4.
</anti_patterns>

<error_recovery>
- If estimate-surfacing fails after an edit, diff the anchors listed in the binding rules; restore the exact text.
- If a step-number reference elsewhere in plan-objective.md (`skip to step 13`, `step 10`) now points at the wrong
  step, fix the reference; do not renumber headings.
- If the repo test's plan-mode check finds no skip line, the `**Skip if:**` line must be within the 20 lines above
  `EnterPlanMode()`: move the estimate instruction below EnterPlanMode's preamble if needed, keeping the skip line close.
</error_recovery>

</embedded_context>

<gotchas>
- In local mode the planner commits the TRDs before the review; revisions add commits. In store mode nothing reaches
  GitHub until the approval's `plan push`. Say both in one sentence in 13.5.
- build step 5 follows plan-objective step 10 but has no 13.5: add `Push right away (build has no draft review): plan
  push` there, so build's behaviour does not change.
- build progress: create the five stage tasks right after step 3 (Research, Plan, Check, Execute, Verify); delete
  Research when it is skipped and Check when the checker is off; `in_progress` at each stage's start, `completed` at
  its end (Verify completes on any verification status, with the status in the description). Keep the two ui-eval
  TaskCreate calls; they are follow-up tasks for the user.
- plan-objective progress: keep Research / Plan / Verify plans, add `TaskUpdate(... status="in_progress")` right after
  each TaskCreate, complete Verify plans on the final checker verdict (the revision loop reuses the Plan task), add
  Review drafts in 13.5.
- `--pause` waits in build: AskUserQuestion `header: "Pause"`, options `Continue (Recommended)` / `Stop here`, with
  "Stop here" printing the command to resume. The wave-by-wave pause keeps its wording if it delegates to
  execute-objective (that file is not yours).
- CHECKPOINT REACHED (plan-objective step 10): a decision checkpoint's options become an AskUserQuestion (up to 4;
  more, use the runtime-list rule); other checkpoints are free text.
- skills/plan-objective: YAML list; remove `ExitPlanMode`, add `TaskCreate`, `TaskUpdate`; add
  `@~/.claude/devflow/references/built-ins.md` to `<execution_context>`. skills/build: inline list; remove
  `ExitPlanMode`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: plan-objective — draft review in plan mode, deferred push, strategy block</name>
  <files>plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/skills/plan-objective/SKILL.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json</files>
  <action>
RED: remove the `plan-objective` entry from `plan_mode` and `plan-objective:ExitPlanMode` from
`allowed_tools_forbidden`. Run the repo test (fails). Commit
`test(62-05): plan-objective draft review leaves the built-in sweep baseline`.

GREEN:
1. Step 5 → `## 5. Present Planning Strategy`: print the same facts as a block; no plan mode; no approval.
2. Step 9: the conditional `**Push:**` line in the planner prompt.
3. Step 10: push at once only when 13.5 will be skipped; keep the Estimate wording.
4. Step 13.5 per the skeleton and the loop; end of 13 and of 12 route to 13.5.
5. skills/plan-objective: remove ExitPlanMode; add the built-ins reference to execution_context.
6. Run the repo test, estimate-surfacing and the prose suite. Commit
   `feat(62-05): plan-objective presents its TRD drafts in plan mode before pushing`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` passes. `rg -n "EnterPlanMode\(" plugins/devflow/devflow/workflows/plan-objective.md` prints one line, inside `## 13.5`.</verify>
  <done>Test-list items 1, 6 and 7 hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Progress in plan-objective and build; ExitPlanMode off build</name>
  <files>plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/skills/plan-objective/SKILL.md, plugins/devflow/devflow/workflows/build.md, plugins/devflow/skills/build/SKILL.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json</files>
  <action>
RED: remove the `plan-objective` and `build` progress flows, `build:ExitPlanMode`, and the `plan-objective:` missing
pairs. Run the repo test (fails). Commit `test(62-05): plan-objective and build progress leave the baseline`.

GREEN: progress per the gotchas; skills/plan-objective adds TaskCreate, TaskUpdate; skills/build removes
ExitPlanMode; build step 5 gains the explicit push. Run the repo test, estimate-surfacing, the prose suite. Commit
`feat(62-05): plan-objective and build report each stage as a task`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` passes with no plan-objective or build progress/allowed-tools entry left.</verify>
  <done>Test-list items 2, 3 and 4 hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The plan-build group's prompts</name>
  <files>plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/devflow/workflows/build.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json</files>
  <action>
RED: remove the remaining prompt entries. Run the repo test (fails). Commit
`test(62-05): plan-objective and build prompts leave the baseline`.

GREEN, per each `plan-build` inventory row: step 7 AskUserQuestion `header: "TRDs exist"`, options `Add more TRDs` /
`View existing` / `Replan from scratch`; step 13 max iterations `header: "Max retries"`, options `Force proceed` /
`Provide guidance` / `Abandon`; step 10 PLANNING INCONCLUSIVE `header: "Inconclusive"`, options `Add context` /
`Retry` / `Manual`; CHECKPOINT REACHED per the gotchas; build's `--pause` waits per the gotchas. Routing unchanged.
Delete the now-empty baseline with the prose. Commit
`feat(62-05): plan-objective and build ask discrete choices with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes and the plan-build baseline is gone. The prose suite passes.</verify>
  <done>Test-list item 5 holds; the group is complete.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- plan-objective presents TRD drafts in plan mode (interactive only), pushes after approval, and loops on requested
  changes through the planner's revision mode.
- plan-objective and build pass the progress check; no skill declares ExitPlanMode.
- The plan-build baseline is deleted; estimate-surfacing and the prose suite are green.
</verification>

<success_criteria>
- [ ] plan-objective presents its drafts in plan mode (BLTN-02)
- [ ] plan-objective and build show TaskCreate/TaskUpdate progress (BLTN-01)
- [ ] Their discrete choices use AskUserQuestion (BLTN-03)
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-05-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
