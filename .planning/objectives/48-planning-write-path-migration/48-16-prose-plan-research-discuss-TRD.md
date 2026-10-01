---
objective: 48-planning-write-path-migration
trd: "16"
type: tdd
wave: 5
depends_on: ["48-03", "48-04", "48-15"]
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/agents/objective-researcher.md
  - plugins/devflow/agents/job-checker.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/skills/plan-objective/SKILL.md
  - plugins/devflow/devflow/workflows/research-objective.md
  - plugins/devflow/skills/research-objective/SKILL.md
  - plugins/devflow/devflow/workflows/discuss-objective.md
  - plugins/devflow/skills/discuss-objective/SKILL.md
  - plugins/devflow/devflow/workflows/plan-milestone-gaps.md
  - plugins/devflow/devflow/workflows/discovery-objective.md
  - plugins/devflow/devflow/workflows/list-objective-assumptions.md
  - plugins/devflow/skills/list-objective-assumptions/SKILL.md
  - plugins/devflow/devflow/templates/trd-prompt.md
  - plugins/devflow/devflow/templates/objective.md
  - plugins/devflow/devflow/templates/research.md
  - plugins/devflow/devflow/templates/context.md
  - plugins/devflow/devflow/templates/discovery.md
  - plugins/devflow/devflow/templates/planner-subagent-prompt.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
autonomous: true
requirements: [GWP-02, GWP-05]
must_haves:
  truths:
    - "The `plan` audit group has zero violations: `__fixtures__/planning-writes-baseline/plan.json` holds only `_comment` and the SC1 repo test is green"
    - "The planner writes every TRD as: `planning draft` → Write the draft path → `plan put-trd <obj> <file> --from <draft> --no-push`, then one `plan push <obj>`; it never Writes under `.planning/` (D-11, D-13)"
    - "The planner's `<scope_estimation>` states the 40,000-char target and 60,000-char ceiling on the encoded TRD, the U-2 linked-bulk rule, and 'split or move to a follow-up TRD; never trim prose to fit; link fixtures/listings in the repo or wiki' (GWP-05)"
    - "Researcher, discuss and discovery flows publish RESEARCH/CONTEXT/DISCOVERY with `doc put`; ROADMAP plan-list updates in planner/plan-objective are guarded by `planning mode` (local: as today; store: skipped, ROADMAP is generated), and STATE edits use `state` commands (store-aware since 48-13)"
    - "No verb call redirects stderr (`2>/dev/null` removed from every df-tools verb line touched)"
    - "Local-mode behaviour of the flows is unchanged: the verbs write the same files the prose used to write"
  artifacts:
    - path: plugins/devflow/agents/planner.md
      provides: "verb-based TRD writing, scope budget numbers"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
      provides: "empty plan-group baseline"
  key_links:
    - "Uses the command lines fixed in 48-15; the SC1 ratchet (48-04) is this TRD's test"
---

# TRD 48-16: Prose migration — plan, research, discuss (audit group `plan`)

<objective>
Rewrite every planning-file write instruction in the planning-side skills, workflows, agents and templates to call the df-tools verbs,
and give the planner the TRD scope budget numbers. Drive the `plan` group of the SC1 ratchet to zero.

Purpose: GWP-02 for planner/research/discuss/discovery flows; GWP-05's planner half. Output: prose edits + empty `plan.json` baseline.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape for prose: the test is planning-writes.repo.test.cjs (48-04). RED = empty this group's baseline first (the test fails listing every
remaining violation); GREEN = rewrite prose until it passes. -->

## Binding rules

- RED first: set `plan.json` to `{"_comment": "..."}` and commit `test(48-16): plan group must have zero planning writes` with the failing run's
  list saved into the SUMMARY. Then GREEN commits per task. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Edit with targeted `Edit` calls; do not rewrite whole files. Keep each file's structure, step names and XML tags.
- Command lines must be exactly the 48-15 forms (the 48-15 repo test resolves them); path in prose `node ~/.claude/devflow/bin/df-tools.cjs`.
- Do not exempt real writes to pass the audit; an EXEMPT entry is only for read-only/explanatory lines (add to the repo test's EXEMPT only if
  truly read-only — that file is not in this TRD's list, so report any such need in the SUMMARY instead).
- Never port 8080; no real GitHub.

## Rewrite recipe (apply uniformly)

| Old instruction | New instruction |
|---|---|
| "Write `.planning/objectives/<dir>/<file>-TRD.md`" (Write tool) | `DRAFT=$(node ~/.claude/devflow/bin/df-tools.cjs planning draft objectives/<dir>/<file>)` → Write the TRD to `$DRAFT` → `node ~/.claude/devflow/bin/df-tools.cjs plan put-trd <objective> <file> --from "$DRAFT" --no-push`; after the last TRD: `... plan push <objective>` |
| Write/update RESEARCH.md, CONTEXT.md, DISCOVERY.md, UAT/other objective docs | draft → `doc put objectives/<dir>/<file> --from "$DRAFT"` |
| Write/update OBJECTIVE.md (incl. `status:`) | `objective put <id> --from "$DRAFT"` / `objective set-status <id> <status>` |
| "Update ROADMAP.md plan list / progress", "Update STATE.md" | ROADMAP: `MODE=$(node ~/.claude/devflow/bin/df-tools.cjs planning mode)`; "if `local`: update ROADMAP.md as before; if `store`: skip (ROADMAP is generated by `gh pull --all`)" — the guard sits within 3 lines of the edit instruction. STATE: the matching `df-tools state ...` command (store-aware since 48-13) |
| `frontmatter set <TRD/OBJECTIVE> ...` | `objective set-status` for status; for TRD frontmatter: draft + `plan put-trd` |
| `... 2>/dev/null` on a verb | remove the redirect |
| `commit ... --files .planning/...` | keep (store mode skips ignored paths per 48-10) |

## Test list

1. (RED) `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` fails listing every `plan`-group violation once `plan.json` is emptied.
2. After Task 1: no violations remain in `agents/planner.md`; test 13 of 48-04 (planner sensitivity) now expects 0 and passes.
3. After Task 2: no violations remain in researcher/research/discuss/discovery files.
4. After Task 3: the whole `plan` group is clean; the repo test is green; `doc-refs.repo.test.cjs` green.
5. `rg -n "2>/dev/null" <this TRD's files> | rg "df-tools.cjs (plan|objective|summary|verification|doc|decision|todo|debug|quick|milestone|planning)"` → no matches.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED baseline + planner.md (verbs, scope budget)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json, plugins/devflow/agents/planner.md</files>
  <action>
Empty `plan.json` (keep `_comment`), run the repo test, commit RED. In `agents/planner.md` rewrite: `write_objective_prompt` step (the Write-tool
instruction at ~L996 → recipe row 1, including the closing `plan push`), `update_roadmap` (~L1047-1099: guard with `planning mode`; store mode =
skip, ROADMAP is generated), revision-mode and gap-closure "Write TRD" lines, `git_commit` step (keep commit; it is harmless). Add to
`<scope_estimation>`: "TRD scope budget: target 40,000 characters, ceiling 60,000, measured on the encoded TRD (`df-tools verify trd-pre`
reports it). Over budget: split the TRD or move work to a follow-up TRD; never trim prose to fit. Inline fenced blocks over 8,000 characters,
or fenced content over 40% of a TRD of 40,000+ characters, are linked bulk: put fixtures, sample data and long listings in the repo or wiki and
link them." Commit `docs(48-16): planner writes TRDs through plan put-trd`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg -c "agents/planner.md" ; rg -n "plan put-trd|plan push|40,000|60,000" plugins/devflow/agents/planner.md</verify>
  <done>No planner.md violations listed; budget text present; remaining failures only in other plan-group files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Researcher, research/discuss/discovery workflows and skills</name>
  <files>plugins/devflow/agents/objective-researcher.md, plugins/devflow/devflow/workflows/research-objective.md, plugins/devflow/skills/research-objective/SKILL.md, plugins/devflow/devflow/workflows/discuss-objective.md, plugins/devflow/skills/discuss-objective/SKILL.md, plugins/devflow/devflow/workflows/discovery-objective.md, plugins/devflow/devflow/templates/research.md, plugins/devflow/devflow/templates/context.md, plugins/devflow/devflow/templates/discovery.md</files>
  <action>
Apply the recipe: RESEARCH.md / CONTEXT.md / DISCOVERY.md writes become draft + `doc put`. In `objective-researcher.md` Step 5 the agent writes the
draft and runs `doc put` itself (it has Bash). Templates: change any "write this file to .planning/..." instruction to name the verb; leave the
template body (the document skeleton) alone. Commit `docs(48-16): research and discuss publish with doc put`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg "objective-researcher|research-objective|discuss-objective|discovery" || echo clean</verify>
  <done>None of these files appear in the failure list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: plan-objective, plan-milestone-gaps, list-assumptions, job-checker, remaining templates — group green</name>
  <files>plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/skills/plan-objective/SKILL.md, plugins/devflow/devflow/workflows/plan-milestone-gaps.md, plugins/devflow/devflow/workflows/list-objective-assumptions.md, plugins/devflow/skills/list-objective-assumptions/SKILL.md, plugins/devflow/agents/job-checker.md, plugins/devflow/devflow/templates/trd-prompt.md, plugins/devflow/devflow/templates/objective.md, plugins/devflow/devflow/templates/planner-subagent-prompt.md</files>
  <action>
Apply the recipe to the remaining plan-group files. In `plan-objective.md` make the orchestrator's post-planner step run `plan push <objective>`
if the planner reports TRDs written with `--no-push` and no push. Commit `docs(48-16): plan group uses planning verbs`. Run the full repo test,
doc-refs test and `npm test -- --test-name-pattern planning` style subset; record the before/after violation counts for the group in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Repo test green with an empty `plan.json`; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- 48-RESEARCH 1d hot spots: planner.md L546, L996, L1047-1099; objective-researcher.md Step 5; plan-objective.md; plan-milestone-gaps.md.
- 48-15 command lines (see that TRD's Decisions block) — copy them verbatim.
</codebase_examples>
<anti_patterns>
- Telling agents to Write `.planning/...` and then call a verb on the same path: in store mode the gate denies the Write. Always draft first.
- Deleting the ROADMAP update for local projects: local mode must behave as today.
</anti_patterns>
<error_recovery>
- If the scanner flags an explanatory sentence that is genuinely read-only, rephrase it to drop the write verb rather than exempting it.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-audit.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "Write.*\.planning/objectives" plugins/devflow/agents/planner.md` → none.
</verification>

<success_criteria>
Planning, research and discussion flows change planning state only through df-tools verbs, and the planner budgets TRDs by the 40K/60K rule.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-16-SUMMARY.md`
</output>
