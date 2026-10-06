---
objective: 62-built-in-sweep
trd: "11"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
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
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json
autonomous: true
requirements: [BLTN-03]
must_haves:
  truths:
    - "Every discrete choice in security-audit, research-objective, list-objective-assumptions, cleanup and the other remaining skills is an AskUserQuestion (existing-research choice, research outcome next steps, assumption review next step, security-audit scope, archive confirmation)"
    - "cleanup's inline AskUserQuestion uses a proper option list with Cancel first, and cleanup and flow declare AskUserQuestion in allowed-tools"
    - "Open questions (assumption corrections, free descriptions) stay prose; help.md's descriptive mentions of prompts are reworded or marked explanatory, and its plan-mode paragraph is left for 62-10"
    - "Every skill in the group declares the built-ins its flows call; the remaining baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/skills/research-objective/SKILL.md
      provides: "AskUserQuestion for the existing-research choice"
    - path: plugins/devflow/devflow/workflows/research-objective.md
      provides: "AskUserQuestion for research outcomes"
    - path: plugins/devflow/skills/cleanup/SKILL.md
      provides: "allowed-tools with AskUserQuestion"
  key_links:
    - "builtin-sweep.repo.test.cjs tests 2, 7, 8 and 9 pass for the remaining group without a baseline entry"
    - "gh-sync-skill.repo.test.cjs and skill-requires.repo.test.cjs keep passing (gh-sync allowed-tools and requires: unchanged)"
    - "help.md is also edited by 62-10 in wave 4, after this TRD; this TRD changes only its prompt descriptions, not the plan-mode paragraph"
---

# TRD 62-11: Questions in the remaining skills and workflows

<objective>
BLTN-03 for the `remaining` group: every skill and workflow not owned by another conversion TRD (workstreams moved to
62-09's group). Most of these 25 files need nothing; the group's inventory rows say which do. Known items:

- **security-audit.md**: `Options:` + `Wait for user response.` (audit scope).
- **skills/research-objective**: `**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for
  response.`; **research-objective.md**: `If exists: Offer update/view/skip options.`,
  `offer: Plan/Dig deeper/Review/Done`, `offer: Add context/Try different mode/Manual`.
- **list-objective-assumptions.md**: `Wait for user response.` (free text: the user corrects assumptions in their own
  words) and the `offer_next` menu + `Wait for user selection.`
- **cleanup.md**: the pipe-separated `AskUserQuestion: "Proceed with archiving?" with options: ... | "Cancel"`;
  skills/cleanup does not declare AskUserQuestion. **skills/flow** names AskUserQuestion but does not declare it.
- **help.md**: `Presents tests one at a time (yes/no responses)` (explanatory, and stale: verify-work's answers are free
  text). Leave the plan-mode paragraph (`EnterPlanMode` ... "present the execution strategy"): 62-10 rewrites it after
  62-05 lands.
- Anything the inventory lists in settings, set-profile, design-review, ui-eval, gh-sync, doctor, awareness,
  initiatives, sync-roadmap and tui.

Purpose: the rest of SC3. Output: prose edits and an emptied, deleted baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `remaining`). Six other conversion TRDs run in parallel on their own
  files and baselines, 62-09 among them (group `todo-status-objective`, which holds workstreams): never touch theirs.
  Edit only files the inventory lists or the repo test reports; the rest are listed because the group owns them.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `remaining` rows of `docs/built-in-sweep.md`.
  Do not edit the inventory; record deviations in the SUMMARY (62-10 reconciles the doc).
- Ratchet TDD per task. RED: delete the entries the task resolves from `remaining.json`, run the repo test, see it fail,
  commit `test(62-11): ...`. GREEN: edit until it passes, commit `feat(62-11): ...`. Delete the baseline when it is
  empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Do not change gh-sync's `requires:` or its existing AskUserQuestion prose (gh-sync-skill.repo.test.cjs pins it).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 2: no finding in the 25 group files.
2. Repo test 7: no pair missing for any skill in the group (`cleanup:AskUserQuestion` and `flow:AskUserQuestion` today,
   plus each skill whose flow now calls AskUserQuestion: security-audit, research-objective,
   list-objective-assumptions, ...).
3. Repo test 9: every `remaining` row resolved; test 8: no bad marker.
4. `node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`
   passes.
5. The remaining baseline no longer exists.

<embedded_context>

<codebase_examples>
skills/research-objective `## 2. Check Existing Research`:

```
**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.
```

Target:

```
**If exists:** ask:

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

cleanup.md today: `AskUserQuestion: "Proceed with archiving?" with options: "Yes — archive listed objectives" | "Cancel"`.
Rewrite it in the object or bullet form with `header: "Archive"`, `Cancel (Recommended)` first.
</codebase_examples>

<anti_patterns>
- Do not edit a file the inventory does not list and the repo test does not report.
- Do not make list-objective-assumptions' correction step a menu; the user answers in their own words.
- Do not recommend destructive options (archiving) over the safe one.
- Do not touch help.md's plan-mode paragraph; 62-10 owns that rewrite.
</anti_patterns>

<error_recovery>
- If doc-refs fails, a `/devflow:` command reference changed: restore it exactly.
- If a research-objective workflow prompt runs inside the researcher subagent rather than the skill, treat it as
  `subagent` (checkpoint return) per built-ins.md and record it.
</error_recovery>

</embedded_context>

<gotchas>
- Headers (12 characters at most): `Research`, `Next step`, `Inconclusive`, `Audit scope`, `Archive`.
- research-objective outcomes: `Plan objective (Recommended)` / `Dig deeper` / `Review` / `Done`; inconclusive:
  `Add context` / `Try another mode` / `Manual`.
- help.md `(yes/no responses)`: reword to describe the free-text answer ("pass, or describe what is wrong").
- Skills in this group use YAML lists or inline strings: keep each file's form when adding `AskUserQuestion`.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: security-audit, cleanup, flow and help</name>
  <files>plugins/devflow/skills/security-audit/SKILL.md, plugins/devflow/devflow/workflows/security-audit.md, plugins/devflow/skills/cleanup/SKILL.md, plugins/devflow/devflow/workflows/cleanup.md, plugins/devflow/skills/flow/SKILL.md, plugins/devflow/devflow/workflows/help.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json</files>
  <action>
RED: remove the `remaining.json` entries for these files and their skills' allowed-tools pairs. Run the repo test
(fails). Commit `test(62-11): security-audit, cleanup, flow and help leave the built-in sweep baseline`.

GREEN: convert each row per the inventory and the gotchas; declare AskUserQuestion where a skill now uses it. Run the
repo test, test-list item 4 and the prose suite. Commit
`feat(62-11): security-audit and cleanup ask with AskUserQuestion; flow and cleanup declare it`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes with no baseline entry for these files.</verify>
  <done>These files are converted.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: research-objective, list-objective-assumptions and any other remaining rows</name>
  <files>plugins/devflow/skills/research-objective/SKILL.md, plugins/devflow/devflow/workflows/research-objective.md, plugins/devflow/skills/list-objective-assumptions/SKILL.md, plugins/devflow/devflow/workflows/list-objective-assumptions.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json</files>
  <action>
RED: remove the remaining entries. Run the repo test (fails). Commit
`test(62-11): research and assumption prompts leave the baseline`.

GREEN: convert each row per the inventory, the codebase example and the gotchas; mark or reword free text; convert any
other `remaining` row (settings, set-profile, design-review, ui-eval, gh-sync, doctor, awareness, initiatives,
sync-roadmap, tui) the inventory lists. Delete the now-empty baseline with the prose. Commit
`feat(62-11): research and assumption flows ask with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/skill-requires.repo.test.cjs` passes and the baseline is gone. The prose suite passes.</verify>
  <done>Test-list items 1-5 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- Every discrete choice in the group is an AskUserQuestion; free text and descriptions stay prose.
- The remaining baseline is deleted; the prose suite is green.
</verification>

<success_criteria>
- [ ] The remaining skills' discrete choices use AskUserQuestion (BLTN-03)
- [ ] cleanup and flow declare AskUserQuestion
- [ ] The remaining baseline is gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-11-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved and any deviation.
</output>
