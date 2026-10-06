---
objective: 62-built-in-sweep
trd: "07"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/milestone/SKILL.md
  - plugins/devflow/devflow/workflows/complete-milestone.md
  - plugins/devflow/devflow/workflows/new-milestone.md
  - plugins/devflow/devflow/workflows/audit-milestone.md
  - plugins/devflow/devflow/workflows/plan-milestone-gaps.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json
autonomous: true
requirements: [BLTN-02, BLTN-03]
must_haves:
  truths:
    - "/devflow:milestone complete presents the MILESTONES entry draft and the PROJECT.md evolution draft in plan mode before either is published; approval publishes; 'keep planning' feedback becomes Requested changes applied to the drafts and presented again"
    - "The review is skipped (drafts published as today) when --auto is passed or workflow.auto_advance is true"
    - "Every discrete choice in the milestone workflows (incomplete-requirements choice, ship confirmation, tag push, branch handling, archive objectives, requirements confirmation, gap objectives confirmation) is an AskUserQuestion with a header of at most 12 characters"
    - "skills/milestone declares EnterPlanMode (and any other built-in its workflows now call), not ExitPlanMode, and loads references/built-ins.md; the milestone baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/complete-milestone.md
      provides: "review_drafts step (plan mode) between the PROJECT.md evolution draft and archive_milestone; AskUserQuestion conversions"
    - path: plugins/devflow/skills/milestone/SKILL.md
      provides: "allowed-tools and execution_context for the review"
  key_links:
    - "builtin-sweep.repo.test.cjs DRAFT_FLOWS milestone-complete (skill milestone, workflows/complete-milestone.md) passes without a baseline entry"
    - "review_drafts publishes PROJECT.md with `df-tools doc put PROJECT.md --from` and the entry with `df-tools milestone put` in archive_milestone, unchanged"
---

# TRD 62-07: milestone complete presents its drafts in plan mode

<objective>
BLTN-02 for `/devflow:milestone complete`, and the BLTN-03 prompts in the four milestone workflows.

**Drafts.** complete-milestone builds two drafts before it publishes anything durable: the full MILESTONES entry
(`create_milestone_entry`, a `planning draft milestones/v[X.Y].md` path, recorded later by `milestone put`) and the
PROJECT.md evolution (`evolve_project_full_review`, a `planning draft PROJECT.md` path, today published at the end of
that step with `doc put PROJECT.md`). Add a step `review_drafts` right after `evolve_project_full_review`: one plan-mode
review of both drafts, following the loop in `references/built-ins.md`. The `doc put PROJECT.md` moves from the end of
`evolve_project_full_review` into `review_drafts`, after approval. Skip rule: `--auto`, or `workflow.auto_advance`
true (the convention build and plan-objective use); then publish as today.

**Prompts** (the inventory's `milestone` rows): complete-milestone `MUST present 3 options:` (incomplete
requirements), `Ready to mark this milestone as shipped?` / `(yes / wait / adjust scope)`, `Ask: "Push tag to remote?
(y/n)"`, the printed branch `Options:` list that disagrees with the AskUserQuestion under it, and
`header="Archive Objectives"` (18 characters; the limit is 12); new-milestone `Does this capture what you're building?
(yes / adjust)`; plan-milestone-gaps `Create these {X} objectives? (yes / adjust / defer all optional)`,
`Wait for user confirmation.` and the table cell `Ask user: include or defer?`; anything the inventory lists in
audit-milestone.md.

Purpose: SC2 for milestone complete and the milestone group's part of SC3. Output: prose edits and an emptied, deleted
baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `milestone`). Five other conversion TRDs run in parallel: never touch
  their files or baselines.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `milestone` rows of `docs/built-in-sweep.md`.
  Do not edit the inventory; record deviations in the SUMMARY.
- complete-milestone.md is ~760 lines; locate with `rg -n "<step name" plugins/devflow/devflow/workflows/complete-milestone.md`.
- Ratchet TDD per task. RED: delete the entries the task resolves from `milestone.json`, run the repo test, see it
  fail, commit `test(62-07): ...`. GREEN: edit until it passes, commit `feat(62-07): ...`. Delete the baseline when
  empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Keep each prompt's gating: the ship confirmation stays under `<if mode="interactive" ...>`, its yolo/autonomous
  branch still auto-continues.
- planning-writes: keep `doc put PROJECT.md --from` and `milestone put` calls within 3 lines of any write wording near
  `PROJECT.md` or `MILESTONES`. "Put the drafts in the plan" uses no write verb.
- The `git push origin v[X.Y]` stays behind the user's explicit choice: the AskUserQuestion's push option must be the
  only path to it, and it must not be the recommended (first) option.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 6, `milestone-complete`: `planModeSpans(complete-milestone.md)` has a span mentioning a draft, with an
   ExitPlanMode and a `**Skip if:**` line naming `--auto` within the 20 lines above; skills/milestone declares
   EnterPlanMode and not ExitPlanMode.
2. Repo test 7: no `milestone:` pair missing or forbidden.
3. Repo test 2: no finding in the five group files (`header-too-long` on "Archive Objectives" included).
4. Repo test 9: every `milestone` row resolved; test 8: no bad marker.
5. `rg -n "doc put PROJECT.md" plugins/devflow/devflow/workflows/complete-milestone.md` shows the publish inside
   `review_drafts` (after its ExitPlanMode) and in its skip branch, and no longer at the end of
   `evolve_project_full_review`.
6. The milestone baseline no longer exists; planning-writes passes.

<embedded_context>

<codebase_examples>
complete-milestone.md steps, in order: `verify_readiness` (the 3 options when requirements are incomplete; the
`<if mode="yolo" OR="autonomous">` auto-continue and the `<if mode="interactive" ...>` ship confirmation),
`gather_stats`, `extract_accomplishments`, `create_milestone_entry`, `evolve_project_full_review` (ends "When the review
is done, publish the draft:" + `node ~/.claude/devflow/bin/df-tools.cjs doc put PROJECT.md --from "$DRAFT"`),
`reorganize_roadmap`, `archive_milestone` (`milestone complete`, then `milestone put "v[X.Y]" --from "$DRAFT"`; the
`AskUserQuestion(header="Archive Objectives", ...)` call), `reorganize_roadmap_and_delete_originals`, `update_state`,
`handle_branches`, `git_tag` (`Ask: "Push tag to remote? (y/n)"`), `git_commit_milestone`, `offer_next`.

The new step (fill in from references/built-ins.md):

```
<step name="review_drafts">

**Skip if:** `--auto` was passed or config `workflow.auto_advance` is true. Then publish the PROJECT.md draft now
(`node ~/.claude/devflow/bin/df-tools.cjs doc put PROJECT.md --from "$PROJECT_DRAFT"`) and continue.

EnterPlanMode()

Put in the plan, as the drafts for review:
- the MILESTONES entry draft (full text)
- the PROJECT.md evolution: each section that changed, before → after (Validated, Active, Out of Scope, Key
  Decisions, Context, "What This Is" if changed)
- On approval: publish PROJECT.md (`doc put PROJECT.md`), then archive_milestone records the entry (`milestone put`)

ExitPlanMode()

Approved → apply any edits the user made in the plan to the two drafts, then publish PROJECT.md. "No, keep planning"
→ `## Requested changes`, ExitPlanMode again; on approval apply them to the drafts and present them again.

</step>
```

Both drafts have distinct paths; name them `$ENTRY_DRAFT` and `$PROJECT_DRAFT` where the step text needs both, and
note that shell variables do not survive between Bash calls (pass the printed paths).
</codebase_examples>

<anti_patterns>
- Do not publish PROJECT.md before the review in interactive runs.
- Do not move `milestone put` out of `archive_milestone`; it replaces the CLI's base entry there, by design.
- Do not merge the ship confirmation into the plan-mode review; it decides whether to run the milestone at all and
  comes first.
- Do not recommend pushing the tag.
</anti_patterns>

<error_recovery>
- If the plan-mode check reports no skip line, keep `**Skip if:**` within the 20 lines above `EnterPlanMode()`.
- If planning-writes flags the new step, rephrase with "Put ... in the plan" and keep the `doc put` call within 3 lines
  of any remaining write wording.
</error_recovery>

</embedded_context>

<gotchas>
- Conversions (follow the inventory's Conversion cells where they differ):
  - incomplete requirements: `header: "Gaps"`, options `Run audit first (Recommended)` / `Proceed anyway` / `Abort`,
    routing unchanged (`Proceed anyway` records `### Known Gaps`);
  - ship confirmation: `header: "Ship it?"`, options `Ship it` / `Wait` / `Adjust scope`;
  - tag push: `header: "Push tag"`, options `Keep local (Recommended)` / `Push to origin`;
  - branches: drop the printed `Options:` list (the AskUserQuestion under it is the real prompt) and add a header
    `Branches`;
  - archive objectives: `header="Archive"`;
  - new-milestone requirements: AskUserQuestion `header: "Scope"`, options `Looks right (Recommended)` / `Adjust`;
  - plan-milestone-gaps: `header: "Gap plan"`, options `Create them (Recommended)` / `Adjust` / `Defer optional`;
    the table's `include or defer?` becomes a multiSelect AskUserQuestion over the nice-to-have gaps (up to 4 per
    question, more questions as needed up to 4).
- skills/milestone: YAML list; add `EnterPlanMode` (and TaskCreate/TaskUpdate only if a workflow now calls them); add
  `@~/.claude/devflow/references/built-ins.md` to `<execution_context>`. It keeps `disable-model-invocation: true`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: review_drafts in complete-milestone</name>
  <files>plugins/devflow/devflow/workflows/complete-milestone.md, plugins/devflow/skills/milestone/SKILL.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json</files>
  <action>
RED: remove `milestone-complete` from `plan_mode` (and any `milestone:` allowed-tools pair). Run the repo test (fails).
Commit `test(62-07): milestone complete draft review leaves the built-in sweep baseline`.

GREEN:
1. Add `<step name="review_drafts">` after `evolve_project_full_review` per the codebase example; move the PROJECT.md
   publish into it (approval branch and skip branch).
2. Update the `<purpose>` / `<archival_behavior>` lines that describe the order, if they mention the publish timing.
3. skills/milestone: allowed-tools and execution_context per the gotchas.
4. Run the repo test, planning-writes and the prose suite. Commit
   `feat(62-07): milestone complete presents the entry and PROJECT.md drafts in plan mode`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes. `rg -n "review_drafts|EnterPlanMode\(|doc put PROJECT.md" plugins/devflow/devflow/workflows/complete-milestone.md` shows the step, one EnterPlanMode and the publish lines inside it.</verify>
  <done>Test-list items 1, 2 and 5 hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The milestone workflows' prompts</name>
  <files>plugins/devflow/devflow/workflows/complete-milestone.md, plugins/devflow/devflow/workflows/new-milestone.md, plugins/devflow/devflow/workflows/audit-milestone.md, plugins/devflow/devflow/workflows/plan-milestone-gaps.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json</files>
  <action>
RED: remove the remaining entries. Run the repo test (fails). Commit
`test(62-07): milestone prompts leave the baseline`.

GREEN: convert each `milestone` inventory row per the gotchas (and its Conversion cell). Keep every routing line and
every yolo/autonomous branch. Delete the now-empty baseline with the prose. Commit
`feat(62-07): milestone workflows ask discrete choices with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes and the baseline is gone. The prose suite passes.</verify>
  <done>Test-list items 3, 4 and 6 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- milestone complete presents both drafts in plan mode before publishing them (interactive), and publishes as today
  under `--auto` / `workflow.auto_advance`.
- Every milestone discrete choice is an AskUserQuestion within the tool's limits; the tag push is never recommended.
- The milestone baseline is deleted; the prose suite is green.
</verification>

<success_criteria>
- [ ] milestone complete presents its drafts in plan mode (BLTN-02)
- [ ] The milestone workflows' discrete choices use AskUserQuestion (BLTN-03)
- [ ] The milestone baseline is gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-07-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
