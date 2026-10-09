---
objective: 62-built-in-sweep
trd: "08"
type: standard
wave: 3
depends_on: ["62-01", "62-02", "62-03"]
files_modified:
  - plugins/devflow/skills/execute-objective/SKILL.md
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/transition.md
  - plugins/devflow/devflow/workflows/execute-trd.md
  - plugins/devflow/skills/discuss-objective/SKILL.md
  - plugins/devflow/devflow/workflows/discuss-objective.md
  - plugins/devflow/devflow/workflows/discovery-objective.md
  - plugins/devflow/skills/map-codebase/SKILL.md
  - plugins/devflow/devflow/workflows/map-codebase.md
  - plugins/devflow/skills/adopt/SKILL.md
  - plugins/devflow/devflow/workflows/adopt.md
  - plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json
autonomous: true
requirements: [BLTN-03]
must_haves:
  truths:
    - "Every discrete choice in execute-objective, transition, discuss-objective and map-codebase (transition confirmation, incomplete-jobs safety rail, partial completion, failed-TRD handling, checkpoint escalation choices, existing codebase map, STACK.md draft, secrets pause) is an AskUserQuestion"
    - "A prompt in a flow a subagent runs (discovery-objective.md under the planner, execute-trd.md under the executor) is returned as a checkpoint instead of asked"
    - "map-codebase's non-interactive mode (used by /devflow:adopt) still skips every one of those prompts, and adopt can never ask: skills/adopt declares disallowed-tools AskUserQuestion"
    - "execute-objective declares TaskUpdate; every skill in the group declares the built-ins its workflows now call; the execute-and-map baseline is empty and deleted"
  artifacts:
    - path: plugins/devflow/devflow/workflows/transition.md
      provides: "AskUserQuestion for the transition confirmation, the incomplete-jobs safety rail and partial completion"
    - path: plugins/devflow/devflow/workflows/map-codebase.md
      provides: "AskUserQuestion for check_existing, the STACK.md draft and the secrets pause; non_interactive_mode intact"
    - path: plugins/devflow/skills/adopt/SKILL.md
      provides: "disallowed-tools: AskUserQuestion (unattended)"
  key_links:
    - "adopt-skill-contract.test.cjs tests 2, 6, 10, 11 keep passing (no AskUserQuestion in adopt's allowed-tools; adopt.md's single Never line; map-codebase's non_interactive_mode block; --non-interactive hint)"
    - "gate-commits-merge-sequence.test.js, estimate-surfacing test 4 and state-merge-wiring.repo.test.cjs keep passing on execute-objective.md"
    - "builtin-sweep.repo.test.cjs test 7 accepts adopt through its disallowed-tools, with no ALLOWED_TOOLS_EXEMPT entry"
---

# TRD 62-08: Questions in execution, transition, discussion and codebase mapping

<objective>
BLTN-03 for the `execute-and-map` group: the execution and transition workflows, the two objective-discussion
workflows, codebase mapping and adopt. The inventory's `execute-and-map` rows are the work list. Known items:

- **transition.md**: `Ask: "Objective [X] complete — all [Y] plans finished. Ready to mark done and move to Objective
  [X+1]?"` (interactive only; yolo/autonomous auto-continue stays), the incomplete-jobs `Options:` list +
  `Wait for user decision.` (a safety rail that prompts in every mode; keep that), and `<partial_completion>`'s
  `Options:` list.
- **execute-objective.md**: the failure handling (`report and ask the user how to proceed`, `user chooses attempt or
  skip`, `"Skip this job?" or "Abort objective execution?"`), checkpoint escalation (`Wait for user response before
  spawning continuation agent`), and the `Options:` block after "Gaps Remain" (a list of next commands, explanatory:
  reword it, for example `Next steps:`).
- **discovery-objective.md** runs inside the planner (a subagent): its `Acknowledge and proceed? (yes / address first)`
  becomes an instruction to return a `checkpoint:decision` that the orchestrator asks. **execute-trd.md** runs inside the
  executor: same rule for anything the inventory lists there.
- **map-codebase.md**: `check_existing`'s `What's next?` / `1. Refresh` / `2. Update` / `3. Skip` + `Wait for user
  response.`, the follow-up "Ask which documents to update", the STACK.md `(yes / edit / skip)` prompt, and the secrets
  pause (`Reply "safe to proceed"` + `Wait for user confirmation`). skills/map-codebase's `offer to refresh or skip` is
  explanatory: reword it.
- **discuss-objective**: whatever the inventory lists (it already uses AskUserQuestion widely).

**adopt.** adopt runs map-codebase.md unattended, so once map-codebase.md calls AskUserQuestion, adopt's skill
coverage would demand it in `allowed-tools`, which adopt-skill-contract forbids. Claude Code's skill frontmatter has
`disallowed-tools` ("Tools removed from Claude's available pool while this skill is active. Use for autonomous skills
that should never call certain tools, such as `AskUserQuestion` for a background loop"). Add
`disallowed-tools: AskUserQuestion` to skills/adopt: it enforces adopt's "never ask" rule, and the scanner (62-01)
already treats a disallowed tool as covered.

Purpose: this group's part of SC3. Output: prose edits and an emptied, deleted baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Your files are exactly `files_modified` (group `execute-and-map`). Six other conversion TRDs run in parallel: never
  touch their files or baselines. You may change `builtin-sweep.repo.test.cjs` only to add one ALLOWED_TOOLS_EXEMPT
  entry, and only on the fallback in error_recovery.
- Read first: `plugins/devflow/devflow/references/built-ins.md` and the `execute-and-map` rows of
  `docs/built-in-sweep.md`. Do not edit the inventory; record deviations in the SUMMARY.
- execute-objective.md is ~1,290 lines. Locate with `rg -n "<step name|^## " plugins/devflow/devflow/workflows/execute-objective.md`;
  read only the regions you change. Do not touch the wave-merge sequence or the estimate lines.
- Ratchet TDD per task. RED: delete the entries the task resolves from `execute-and-map.json`, run the repo test, see it
  fail, commit `test(62-08): ...`. GREEN: edit until it passes, commit `feat(62-08): ...`. Delete the baseline when
  empty (`git rm -q -- <file>`, then df-tools commit `--files <file>`).
- Convert the form, not the gating: transition's interactive-only confirmation stays interactive-only; the
  incomplete-jobs safety rail still prompts in every mode; autonomous mode's decision queue is unchanged.
- adopt.md must keep exactly one `AskUserQuestion`, on a line containing `Never` (adopt-skill-contract test 6).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per
  Bash call. Never use port 8080.

## Test list

1. Repo test 7: `execute-objective:TaskUpdate` no longer missing; no `discuss-objective:`, `map-codebase:` or `adopt:`
   pair missing after the conversions (map-codebase declares AskUserQuestion; adopt is covered by `disallowed-tools`);
   ALLOWED_TOOLS_EXEMPT stays empty.
2. Repo test 2: no finding in the eleven group files.
3. Repo test 9: every `execute-and-map` row resolved; `subagent` rows are checkpoint instructions or marked; test 8: no
   bad marker.
4. adopt-skill-contract.test.cjs passes (tests 2, 6, 10 and 11 in particular).
5. `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs` passes.
6. `claude plugin validate plugins/devflow` (Bash timeout 90000) ends with `Validation passed` with `disallowed-tools`
   in skills/adopt (warnings allowed).
7. The execute-and-map baseline no longer exists.

<embedded_context>

<codebase_examples>
map-codebase.md `check_existing` today:

```
.planning/codebase/ already exists with these documents:
[List files found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific documents
3. Skip - Use existing codebase map as-is
```
Wait for user response. If "Refresh" / "Update" (Ask which documents to update) / "Skip".

Target:

```
AskUserQuestion([
  {
    header: "Codebase map",
    question: ".planning/codebase/ already exists. What should happen to it?",
    multiSelect: false,
    options: [
      { label: "Update", description: "Keep existing, update only the documents you pick" },
      { label: "Refresh", description: "Delete existing and remap the codebase" },
      { label: "Skip", description: "Use the existing map as-is" }
    ]
  }
])
```

"Which documents" has seven candidates (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING,
CONCERNS): one AskUserQuestion call with two `multiSelect: true` questions (4 + 3 options), headers `Docs (1/2)` and
`Docs (2/2)`.

The `<non_interactive_mode>` block names `check_existing`, `draft_stack_profile`, `scan_for_secrets`,
`commit_codebase_map`, `offer_next` and `never delete`; it decides what happens without asking. Leave it intact.

transition.md: the interactive confirmation sits inside `<if mode="interactive" OR="custom with gates.confirm_transition true">`;
the incomplete-jobs block is headed `**SAFETY RAIL: always_confirm_destructive applies here.**`.

skills/adopt frontmatter today has `allowed-tools:` (Read, Bash, Write, Task, ...) and no `disallowed-tools`. Add it as
a YAML list with one entry, after `allowed-tools`.
</codebase_examples>

<anti_patterns>
- Do not let the non-interactive path ask: every new AskUserQuestion in map-codebase.md sits in a step the
  `<non_interactive_mode>` block already overrides.
- Do not recommend a destructive option (Refresh deletes the map; "Mark complete anyway" skips work; "Safe to proceed"
  commits content flagged as a secret). Put the safe option first.
- Do not add AskUserQuestion to execute-trd.md or discovery-objective.md; they run inside subagents.
- Do not change execute-objective's merge, estimate or state-merge prose.
</anti_patterns>

<error_recovery>
- If `claude plugin validate` rejects `disallowed-tools`, remove it from skills/adopt, add
  `{ skill: 'adopt', tool: 'AskUserQuestion', reason: 'unattended: adopt runs map-codebase.md non-interactively and must never ask' }`
  to ALLOWED_TOOLS_EXEMPT in the repo test, and record the validator's message in the SUMMARY. If the CLI is not
  available, keep `disallowed-tools` and record `validate: skipped — <reason>`.
- If gate-commits-merge-sequence or state-merge-wiring fails, you touched the merge prose: revert that hunk.
</error_recovery>

</embedded_context>

<gotchas>
- Headers (12 characters at most): `Transition`, `Incomplete`, `Partial`, `TRD failed`, `Checkpoint`, `Codebase map`,
  `Stack`, `Secrets`. Labels from the inventory's Conversion cells; where a cell is missing a detail, follow these:
  transition `Mark done (Recommended)` / `Not yet`; incomplete jobs `Continue objective (Recommended)` /
  `Review what's left` / `Mark complete anyway`; failed TRD `Retry (Recommended)` / `Skip this TRD` / `Stop`;
  secrets `Stop, I'll edit (Recommended)` / `Safe to proceed`; STACK.md `Write it (Recommended)` / `Edit first` / `Skip`.
- Checkpoint escalation in execute-objective: a `checkpoint:decision` presents its options with AskUserQuestion (runtime
  list rule when there are more than 4); `human-verify` answers stay free text ("approved" or a description); mark a
  flagged free-text wait outside any printed fence, or reword it.
- discovery-objective.md's subagent rewrite: "Return `## CHECKPOINT REACHED` (type decision) with the open questions
  and options Proceed / Address first; the orchestrator asks the user." plan-objective step 10 (62-05) turns a decision
  checkpoint into AskUserQuestion.
- skills/execute-objective: add `TaskUpdate`. skills/map-codebase and skills/discuss-objective: add
  `AskUserQuestion` if missing.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: execute-objective, transition, execute-trd and discovery-objective</name>
  <files>plugins/devflow/skills/execute-objective/SKILL.md, plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/devflow/workflows/transition.md, plugins/devflow/devflow/workflows/execute-trd.md, plugins/devflow/devflow/workflows/discovery-objective.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json</files>
  <action>
RED: remove the entries for these files and `execute-objective:TaskUpdate`. Run the repo test (fails). Commit
`test(62-08): execution and transition prompts leave the built-in sweep baseline`.

GREEN: convert each row per the inventory and the gotchas; reword the explanatory `Options:` list; rewrite the subagent
prompts as checkpoint returns; add TaskUpdate to skills/execute-objective. Run the repo test, test-list item 5 and the
prose suite. Commit `feat(62-08): execution and transition ask discrete choices with AskUserQuestion`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/devflow/bin/lib/state-merge-wiring.repo.test.cjs` passes.</verify>
  <done>No baseline entry remains for these five files or execute-objective's allowed-tools.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: map-codebase, discuss-objective and adopt</name>
  <files>plugins/devflow/skills/map-codebase/SKILL.md, plugins/devflow/devflow/workflows/map-codebase.md, plugins/devflow/skills/discuss-objective/SKILL.md, plugins/devflow/devflow/workflows/discuss-objective.md, plugins/devflow/skills/adopt/SKILL.md, plugins/devflow/devflow/workflows/adopt.md, plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json, plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs</files>
  <action>
RED: remove the remaining entries. Run the repo test (fails). Commit
`test(62-08): codebase mapping and discussion prompts leave the baseline`.

GREEN:
1. map-codebase.md: the codebase-examples target for `check_existing`; the two-question document pick; STACK.md and
   secrets per the gotchas. Leave `<non_interactive_mode>` unchanged. skills/map-codebase: reword `offer to refresh
   or skip`; declare AskUserQuestion.
2. discuss-objective: the inventory's rows.
3. skills/adopt: `disallowed-tools: AskUserQuestion`. Run `claude plugin validate plugins/devflow` (Bash timeout
   90000); follow error_recovery on rejection.
4. Delete the now-empty baseline with the prose.
5. Run the repo test, adopt-skill-contract and the prose suite. Commit
   `feat(62-08): codebase mapping and discussion ask with AskUserQuestion; adopt can never ask`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` passes; the baseline is gone; the prose suite passes; `claude plugin validate plugins/devflow` result recorded.</verify>
  <done>Test-list items 1-7 hold.</done>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs plugins/devflow/hooks/gate-commits-merge-sequence.test.js`.
- Prose suite: `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs`.
</validation_gates>

<verification>
- Every discrete choice in the group is an AskUserQuestion; subagent-run prompts return checkpoints.
- adopt can never ask, and map-codebase's non-interactive mode is unchanged.
- The execute-and-map baseline is deleted; the prose suite, the merge-sequence test and adopt's contract are green.
</verification>

<success_criteria>
- [ ] This group's discrete choices use AskUserQuestion (BLTN-03)
- [ ] adopt stays unattended, enforced by disallowed-tools
- [ ] The execute-and-map baseline is gone
</success_criteria>

<output>
After completion, create `.planning/objectives/62-built-in-sweep/62-08-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`. List each inventory row ID resolved, any deviation, and
the `claude plugin validate` result.
</output>
