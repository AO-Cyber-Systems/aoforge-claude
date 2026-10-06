---
objective: 62-built-in-sweep
trd: "06"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/new-project/SKILL.md
  - plugins/devflow/devflow/workflows/new-project.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json
autonomous: true
requirements: [BLTN-02, BLTN-03]
must_haves:
  truths:
    - "Interactive /devflow:new-project presents the PROJECT.md draft, the REQUIREMENTS.md draft and the proposed roadmap in plan mode, each before it is committed; approval commits; 'keep planning' feedback becomes Requested changes that are applied and presented again"
    - "new-project --auto skips all three reviews and auto-approves as today; the skip keys on --auto only, because new-project writes workflow.auto_advance: true into every config"
    - "The STACK.md draft prompt, and every other discrete choice in new-project, is an AskUserQuestion; open questions stay prose"
    - "No new-project question breaks AskUserQuestion's limits: the kind and default-work questions offer 4 options each (the rest typed under Other) and the header 'Default work type' is shortened"
    - "skills/new-project declares TaskCreate, TaskUpdate and EnterPlanMode, not ExitPlanMode, and loads references/built-ins.md; the new-project baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/new-project.md
      provides: "three plan-mode draft reviews (steps 4, 7, 8); AskUserQuestion conversions and schema fixes"
    - path: plugins/devflow/skills/new-project/SKILL.md
      provides: "allowed-tools and execution_context for the reviews"
  key_links:
    - "builtin-sweep.repo.test.cjs DRAFT_FLOWS new-project passes without a baseline entry"
    - "adopt-skill-contract.test.cjs test 12 keeps passing (`## 2. Brownfield Offer` mentions /devflow:adopt; `upgrade --register` present)"
    - "planning-writes.repo.test.cjs keeps passing (doc put / commit calls stay within 3 lines of PROJECT.md, REQUIREMENTS and ROADMAP write language)"
---

# TRD 62-06: new-project presents its drafts in plan mode

<objective>
BLTN-02 for new-project, and its BLTN-03 prompts.

new-project produces three drafts a user should approve before they are committed:

| Draft | Today | After |
|-------|-------|-------|
| PROJECT.md (step 4) | drafted, published with `doc put`, committed; no review | plan-mode review before `doc put` |
| REQUIREMENTS.md (step 7) | full list printed, then `Does this capture what you're building? (yes / adjust)` | plan-mode review |
| Roadmap (step 8) | roadmapper persists it, then AskUserQuestion Approve / Adjust objectives / Review full file | plan-mode review |

Each review follows the loop in `references/built-ins.md`. The skip rule is new-project's own auto mode: `--auto`
skips all three (auto-approve, exactly as today). It deliberately does **not** key on `workflow.auto_advance`:
step 5 writes `auto_advance: true` into every new config, so keying on it would remove the roadmap approval for every
interactive user. That exception is documented in references/built-ins.md (62-02).

BLTN-03 (the inventory's `new-project` rows): the STACK.md draft prompt `"Write this as .planning/STACK.md? (yes / edit /
skip)"`, the defaults summary's `offer to customize`, the free-text `Ask: "What are the main things users need to be
able to do?"`, and three schema breaks: the `Project kind` question has 6 options, the default-work question 7, and its
header `Default work type` is 17 characters (the tool allows 4 options and 12 characters).

Purpose: SC2 for new-project and its part of SC3. Output: prose edits and an emptied, deleted baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `new-project`). Five other conversion TRDs run in parallel: never touch
  their files or baselines. Do not edit `agents/roadmapper.md`.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `new-project` rows of `docs/built-in-sweep.md`.
  Do not edit the inventory; record deviations in the SUMMARY.
- new-project.md is ~1,230 lines. Locate with `rg -n "^## " plugins/devflow/devflow/workflows/new-project.md` and read
  one step at a time.
- Ratchet TDD per task. RED: delete the entries the task resolves from `new-project.json`, run the repo test, see it
  fail, commit `test(62-06): ...`. GREEN: edit until it passes, commit `feat(62-06): ...`. Delete the baseline when
  empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- planning-writes: keep a df-tools verb (`doc put PROJECT.md`, `doc put REQUIREMENTS.md`, `planning draft`) within 3
  lines of any write/edit/update/create/fill wording near `PROJECT.md`, `REQUIREMENTS` or `ROADMAP`. "Put the draft in
  the plan" uses no write verb.
- Keep adopt-skill-contract test 12's anchors: `## 2. Brownfield Offer` mentions `/devflow:adopt`; the file contains
  `upgrade --register`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 6, `new-project`: `planModeSpans(new-project.md)` has at least one span mentioning a draft (three after
   this TRD); every span has an ExitPlanMode and a `**Skip if:**` line naming `--auto` within the 20 lines above;
   skills/new-project declares EnterPlanMode and not ExitPlanMode.
2. Repo test 7: `new-project:TaskCreate` and `new-project:TaskUpdate` no longer missing.
3. Repo test 2: no `prose-choice`, `header-too-long` or `too-many-options` finding in the two files.
4. Repo test 9: every `new-project` row resolved; test 8: no bad marker.
5. `rg -c "EnterPlanMode\(" plugins/devflow/devflow/workflows/new-project.md` is 3.
6. adopt-skill-contract.test.cjs and planning-writes.repo.test.cjs pass.
7. The new-project baseline no longer exists.

<embedded_context>

<codebase_examples>
Step 4 today ends:

```bash
mkdir -p .planning
node ~/.claude/devflow/bin/df-tools.cjs doc put PROJECT.md --from "$DRAFT"
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: initialize project" --files .planning/PROJECT.md
```

with `**If auto mode:** Synthesize from provided document. No "Ready?" gate was shown — proceed directly to commit.`
at its top. Step 7 ends with the printed `## v1 Requirements` list, `Does this capture what you're building? (yes /
adjust)`, `If "adjust": Return to scoping.`, then `doc put REQUIREMENTS.md` + commit. Step 8 prints `## Proposed
Roadmap`, then `**If auto mode:** Skip approval gate`, then `**CRITICAL: Ask for approval before committing
(interactive mode only):**` with the Approve / Adjust objectives / Review full file AskUserQuestion, the roadmapper
revision `Task(` for adjustments, and the commit of ROADMAP.md, STATE.md and REQUIREMENTS.md.

Review block to place before each publish (adapt the draft name and the On-approval steps):

```
**Review the draft (plan mode):**

**Skip if:** `--auto` (auto mode approves the draft, as before). new-project does not key on
`workflow.auto_advance`: it writes that key as true for every project (references/built-ins.md).

EnterPlanMode()

Put in the plan: the full PROJECT.md draft, then "On approval: publish with `doc put PROJECT.md` and commit".

ExitPlanMode()

Approved → apply any edits the user made to the draft in the plan, then publish. "No, keep planning" → add
`## Requested changes`, ExitPlanMode again; on approval apply them to the draft and present it again.
```

For the roadmap, the plan holds the Proposed Roadmap summary table and per-objective details (the text step 8 already
prints), and Requested changes are applied by the roadmapper revision `Task(` that step 8 already has.

Four-option forms for the two oversize questions:

```
header: "Project kind",   (12 characters: allowed, unchanged)
question: "What is this project? (type ui-lib or plugin under Other)",
options: api / app / library / cli  (descriptions as today)

header: "Work type",
question: "Will most objectives be the same work type? (type foundation, bugfix or prototype under Other)",
options: Skip — work types vary (Recommended) / feature / port / refactor
```
</codebase_examples>

<anti_patterns>
- Do not key the reviews on `workflow.auto_advance` (see the objective).
- Do not run the roadmapper, `doc put` or a commit while in plan mode; approval exits plan mode first.
- Do not drop the requirements or roadmap content the step prints today; it moves into the plan.
- Do not convert the deep-questioning conversation (step 3) into AskUserQuestion menus. It is free text by design
  (references/questioning.md); only the inventory's listed prompts change.
- Keep the "Ready?" gate (already AskUserQuestion) and the Brownfield Offer as they are unless the inventory lists them.
</anti_patterns>

<error_recovery>
- If planning-writes flags a new line, rephrase it ("Put ... in the plan") or move the `doc put` call within 3 lines;
  never add a planning-audit allow marker for real write instructions.
- If the kind question's Other answer is not one of the six kinds, re-ask; keep the auto-mode inference rules
  unchanged.
</error_recovery>

</embedded_context>

<gotchas>
- The kind answer feeds `kind` in PROJECT.md frontmatter, which `df-tools intent resolve` validates against six values;
  the question text must say which kinds to type under Other, and the routing must accept them.
- STACK.md prompt: AskUserQuestion `header: "Stack"`, options `Write it (Recommended)` / `Edit first` / `Skip`; only
  `Write it` runs `stack init --from research --write` (the "never write it without confirmation" rule stays).
- The defaults summary's `offer to customize` (step 5): follow the inventory. If it is a choice, AskUserQuestion
  `header: "Settings"`, options `Use defaults (Recommended)` / `Customize`, where Customize runs the existing question
  set; `--interactive` still expands it directly.
- `Ask: "What are the main things users need to be able to do?"` is free text: an allow marker (outside a printed
  fence) or a rewording, per the inventory.
- skills/new-project: YAML list; add `TaskCreate`, `TaskUpdate`, `EnterPlanMode`; add
  `@~/.claude/devflow/references/built-ins.md` to `<execution_context>`.
- Each review gets `**Progress tracking (if available):**` only if you want it; new-project is not a BLTN-01 flow, but
  its existing roadmap TaskCreate/TaskUpdate must stay valid.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Plan-mode reviews of PROJECT.md, REQUIREMENTS.md and the roadmap</name>
  <files>plugins/devflow/devflow/workflows/new-project.md, plugins/devflow/skills/new-project/SKILL.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json</files>
  <action>
RED: remove `new-project` from `plan_mode`, the two `new-project:` missing pairs, and the `(yes / adjust)` prompt
entry. Run the repo test (fails). Commit `test(62-06): new-project draft reviews leave the built-in sweep baseline`.

GREEN:
1. Step 4: the review block before the `doc put PROJECT.md` / commit pair.
2. Step 7: replace the `(yes / adjust)` question with the review block; the plan holds the full requirements list;
   Requested changes return to scoping as `adjust` did.
3. Step 8: replace the Approve / Adjust / Review AskUserQuestion with the review block; Requested changes go to the
   roadmapper revision `Task(`; keep `**If auto mode:** Skip approval gate`.
4. skills/new-project: allowed-tools and execution_context per the gotchas.
5. Run the repo test, adopt-skill-contract, planning-writes and the prose suite. Commit
   `feat(62-06): new-project presents PROJECT, requirements and roadmap drafts in plan mode`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes. `rg -c "EnterPlanMode\(" plugins/devflow/devflow/workflows/new-project.md` prints 3.</verify>
  <done>Test-list items 1, 2, 5 and 6 hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: new-project's remaining prompts and schema fixes</name>
  <files>plugins/devflow/devflow/workflows/new-project.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json</files>
  <action>
RED: remove the remaining entries. Run the repo test (fails). Commit
`test(62-06): new-project prompts and schema fixes leave the baseline`.

GREEN, per each remaining `new-project` inventory row: the kind and default-work questions in their four-option forms
(and the auto-mode text untouched); the STACK.md AskUserQuestion; the defaults/customize prompt; the free-text ask.
Delete the now-empty baseline with the prose. Commit
`feat(62-06): new-project asks with AskUserQuestion within the tool's limits`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes and the baseline is gone. The prose suite passes.</verify>
  <done>Test-list items 3, 4 and 7 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- new-project presents its three drafts in plan mode in interactive runs and auto-approves them under `--auto`.
- No new-project question breaks AskUserQuestion's limits; discrete choices are AskUserQuestion.
- The new-project baseline is deleted; the prose suite is green.
</verification>

<success_criteria>
- [ ] new-project presents its drafts in plan mode (BLTN-02)
- [ ] Its discrete choices use AskUserQuestion within the tool's limits (BLTN-03)
- [ ] The new-project baseline is gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-06-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
