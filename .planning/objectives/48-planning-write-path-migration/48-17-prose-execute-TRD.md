---
objective: 48-planning-write-path-migration
trd: "17"
type: tdd
wave: 5
depends_on: ["48-04", "48-15"]
files_modified:
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/skills/execute-objective/SKILL.md
  - plugins/devflow/devflow/workflows/execute-trd.md
  - plugins/devflow/devflow/workflows/transition.md
  - plugins/devflow/devflow/workflows/build.md
  - plugins/devflow/skills/build/SKILL.md
  - plugins/devflow/devflow/templates/summary.md
  - plugins/devflow/devflow/templates/job-prompt.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
autonomous: true
requirements: [GWP-02]
must_haves:
  truths:
    - "The `execute` audit group has zero violations (`execute.json` holds only `_comment`; SC1 repo test green)"
    - "The executor's per-task progress checkpoint uses `summary checkpoint <trd> --from <draft>` and the final SUMMARY uses `summary post <trd> --from <draft>` exactly once per TRD (D-12); it never Writes under `.planning/`"
    - "STATE/ROADMAP/REQUIREMENTS updates in the execute flows use `state ...`, `roadmap update-job-progress`, `requirements mark-complete` (store-aware since 48-13/48-14); objective status changes use `objective set-status`"
    - "Executor guidance keeps 'never write STACK.md yourself' and adds: in store mode the edit gate denies `.planning/` cache writes — use the verbs; a denial naming a verb is a prompt bug to report, not to work around"
    - "No df-tools verb line in these files redirects stderr"
    - "Local-mode behaviour is unchanged: the verbs write the same SUMMARY/STATE/ROADMAP files"
  artifacts:
    - path: plugins/devflow/agents/executor.md
      provides: "verb-based SUMMARY checkpoint/post, store-mode guidance"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
      provides: "empty execute-group baseline"
  key_links:
    - "Command lines from 48-15; executor worktrees resolve the main checkout inside the verbs (D-14), so prose needs no path juggling"
---

# TRD 48-17: Prose migration — execute flows (audit group `execute`)

<objective>
Rewrite the executor agent and execute-side workflows so SUMMARY, STATE, ROADMAP progress, REQUIREMENTS and objective status change only
through df-tools verbs, with the per-task progress checkpoint kept local and one SUMMARY post per TRD. Drive the `execute` group to zero.

Purpose: GWP-02 for execution; D-12. Output: prose edits + empty `execute.json`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape for prose: the test is planning-writes.repo.test.cjs (48-04). RED = empty this group's baseline; GREEN = rewrite until green. -->

## Binding rules

- RED first: empty `execute.json` (keep `_comment`), run the repo test, commit `test(48-17): execute group must have zero planning writes`.
- Targeted `Edit`s; keep step names/XML. Exact 48-15 command lines with `node ~/.claude/devflow/bin/df-tools.cjs`.
- This TRD is executed BY an executor reading the current executor.md; edit carefully and re-read the changed sections once (the SUMMARY of this
  TRD is itself written with today's flow — that is fine).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never port 8080; no real GitHub.

## Rewrite recipe

| Old | New |
|---|---|
| Executor rewrites `<id>-SUMMARY.md` after each task (`## Progress` checkpoint) | `DRAFT=$(... planning draft objectives/<dir>/<id>-SUMMARY.md)` once; update the draft per task; `... summary checkpoint <trd-id> --from "$DRAFT"` per task |
| "Create/Write SUMMARY.md" at the end | finish the draft; `... summary post <trd-id> --from "$DRAFT"` (once) |
| "Update STATE.md" (position, metrics, decisions, session) | `state advance-job` / `state update-progress` / `state record-metric` / `state add-decision` / `state record-session` (existing commands) |
| "Update ROADMAP.md progress" | `roadmap update-job-progress <objective>` |
| "Mark requirements complete in REQUIREMENTS.md" | `requirements mark-complete <ids>` |
| objective → complete/verifying | `objective set-status <id> verifying|complete` |
| `template fill summary ...` then edit the file | `template fill` output path → copy to a draft (`planning draft`) and continue from the draft |
| verb line with `2>/dev/null` | drop the redirect |

## Test list

1. (RED) repo test fails listing every `execute`-group violation once `execute.json` is emptied.
2. After Task 1: no violations in `agents/executor.md`; `rg -n "summary (checkpoint|post)" plugins/devflow/agents/executor.md` shows both.
3. After Task 2: the group is clean; repo test green; doc-refs green.
4. `rg -n "2>/dev/null" <this TRD's files> | rg "df-tools.cjs (plan|objective|summary|verification|doc|decision|todo|debug|quick|milestone|planning|state|roadmap)"` → none.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED baseline + executor.md</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json, plugins/devflow/agents/executor.md</files>
  <action>
Empty `execute.json`; run the test; commit RED. In `agents/executor.md` rewrite the hot spots (48-RESEARCH 1d: L28, L219-231, L422, L923,
L1023-1072) per the recipe. Add a short `<store_mode>` note near the existing STACK.md rule: "In store mode (`df-tools planning mode` prints
`store`) `.planning/` is a read-only cache of GitHub: the edit gate denies Edit/Write there and names the verb. Write drafts from `planning draft`
and publish with the verb. A denial is a prompt defect to report in the SUMMARY, not something to bypass." Commit
`docs(48-17): executor publishes SUMMARY through summary verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg -c "agents/executor.md"; rg -n "summary checkpoint|summary post|planning draft" plugins/devflow/agents/executor.md</verify>
  <done>executor.md absent from the failure list; checkpoint, post and draft present.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: execute-objective, execute-trd, transition, build, templates — group green</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/skills/execute-objective/SKILL.md, plugins/devflow/devflow/workflows/execute-trd.md, plugins/devflow/devflow/workflows/transition.md, plugins/devflow/devflow/workflows/build.md, plugins/devflow/skills/build/SKILL.md, plugins/devflow/devflow/templates/summary.md, plugins/devflow/devflow/templates/job-prompt.md</files>
  <action>
Apply the recipe. `transition.md` edits PROJECT.md/ROADMAP/STATE: PROJECT.md → draft + `doc put PROJECT.md`; ROADMAP/STATE → state/roadmap
commands or the `planning mode` guard (local: as today; store: skipped). `execute-objective.md` post-execute: `objective set-status <id> verifying`
and remove any `2>/dev/null` on gh/verb calls. Templates: only the instructions naming where the file is written change, not the skeleton.
Commit `docs(48-17): execute flows use planning verbs`. Run repo + doc-refs tests.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Repo test green with an empty `execute.json`; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- 48-RESEARCH 1d: executor.md L28, 219-231, 422, 923, 1023-1072; execute-objective.md; execute-trd.md; transition.md (10 hits); build.md.
- Pitfall 4 (48-RESEARCH): one SUMMARY comment per task would exhaust the 80/min write budget — hence `summary checkpoint`.
</codebase_examples>
<anti_patterns>
- Telling the executor to "Write the SUMMARY.md then run summary post": in store mode the Write is denied. Draft first.
- Removing the per-task checkpoint: resume after a crash depends on it; it just moves to `summary checkpoint`.
</anti_patterns>
<error_recovery>
- If the hooks `gate-executor-stop.js` looks for `<id>-SUMMARY.md` on disk, note that `summary post` writes the cache file in both modes, so the gate still finds it; record this check in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/verify-completion.test.js</regression>
</validation_gates>

<verification>
- `rg -n "Write.*SUMMARY" plugins/devflow/agents/executor.md` → only lines that point at the draft path.
</verification>

<success_criteria>
Execution changes planning state only through verbs, with one GitHub write per TRD summary and local progress checkpoints.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-17-SUMMARY.md`
</output>
