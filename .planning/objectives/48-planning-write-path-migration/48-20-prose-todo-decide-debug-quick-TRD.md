---
objective: 48-planning-write-path-migration
trd: "20"
type: tdd
wave: 5
depends_on: ["48-04", "48-15"]
files_modified:
  - plugins/devflow/agents/debugger.md
  - plugins/devflow/devflow/workflows/add-todo.md
  - plugins/devflow/devflow/workflows/check-todos.md
  - plugins/devflow/skills/todo/SKILL.md
  - plugins/devflow/skills/decide/SKILL.md
  - plugins/devflow/skills/debug/SKILL.md
  - plugins/devflow/devflow/workflows/quick.md
  - plugins/devflow/skills/quick/SKILL.md
  - plugins/devflow/devflow/workflows/micro.md
  - plugins/devflow/skills/micro/SKILL.md
  - plugins/devflow/devflow/templates/DEBUG.md
  - plugins/devflow/devflow/templates/debug-subagent-prompt.md
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
autonomous: true
requirements: [GWP-02]
must_haves:
  truths:
    - "The `work` audit group has zero violations (`work.json` holds only `_comment`; SC1 repo test green)"
    - "Todos are created with `todo add --from <draft>` and completed with `todo complete <file>`; check-todos no longer `mv`s files to `todos/done/` by hand (U-3)"
    - "Decisions are raised with `decision open <trd> --question ...` and answered with `decision answer <id> ...` (D-09)"
    - "Debug sessions are written with `debug put <slug> --from <draft>` (updated from the same draft as the session progresses) and closed with `debug resolve <slug>` (U-1)"
    - "Quick tasks write their JOB with `quick put <N> <slug> --from <draft>` and SUMMARY with `quick summary <N> --from <draft>` (U-1); micro's STATE/ROADMAP touches use store-aware `state`/`roadmap` commands"
    - "No df-tools verb line in these files redirects stderr; local-mode outputs are the same files (todo complete moves to `todos/completed/`, the df-tools location)"
  artifacts:
    - path: plugins/devflow/devflow/workflows/check-todos.md
      provides: "todo complete instead of mv"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
      provides: "empty work-group baseline"
  key_links:
    - "Entity verbs from 48-12 via 48-15 command lines; materialisation (48-07) keeps check-todos working off the cache in store mode"
---

# TRD 48-20: Prose migration — todos, decisions, debug sessions, quick and micro (audit group `work`)

<objective>
Rewrite the day-to-day work flows — todos, decisions, debug sessions, quick tasks, micro edits — so their planning artifacts go through the
entity verbs and become GitHub issues in store mode (U-1, U-3). Drive the `work` group to zero.

Purpose: GWP-02 for todo/decide/debug/quick/micro. Output: prose edits + empty `work.json`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD shape for prose: the test is planning-writes.repo.test.cjs (48-04). RED = empty this group's baseline; GREEN = rewrite until green. -->

## Binding rules

- RED first: empty `work.json`, run, commit `test(48-20): work group must have zero planning writes`.
- Targeted `Edit`s; exact 48-15 command lines. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Never port 8080; no real GitHub.

## Decisions

- **todos/done vs completed**: today `workflows/check-todos.md` moves files to `todos/done/` by hand while `df-tools todo complete` uses
  `todos/completed/` (and `init.cjs` reports `completed_dir: .planning/todos/completed`). The verb is canonical, so check-todos switches to
  `todo complete` and the `mkdir -p .planning/todos/pending .planning/todos/done` line in add-todo.md drops `done`. Existing `done/` files stay
  readable (classified closed, 48-01/48-07). Record the behaviour change in the SUMMARY (it is a fix of an existing inconsistency, not new behaviour).

## Rewrite recipe

| Old | New |
|---|---|
| add-todo: `cat > .planning/todos/pending/<date>-<slug>.md` / Write | draft → `todo add --from "$DRAFT"` (stem derived by the verb from date + title, same as today's naming) |
| check-todos: `mv ... pending ... done/` | `todo complete <filename>` |
| decide skill writes `decisions/pending/DECISION-NNN.md` or uses `decision-queue add|resolve` | `decision open <trd> --question ...` / `decision answer <id> --from "$DRAFT"`; `decision-queue list` stays for reading |
| debugger writes/updates `.planning/debug/<slug>.md`, `mv` to `resolved/` | one draft per session → `debug put <slug> --from "$DRAFT"` after each update; `debug resolve <slug>` |
| quick writes `quick/<N>-<slug>/<N>-JOB.md` and `<N>-SUMMARY.md` | `quick put <N> <slug> --from "$DRAFT"`; `quick summary <N> --from "$DRAFT"` |
| micro: STATE/ROADMAP edits | `state ...` / `roadmap update-job-progress` commands |
| verb line with `2>/dev/null` | drop the redirect |

## Test list

1. (RED) repo test fails listing `work`-group violations once `work.json` is emptied.
2. After Task 1: todo/decide files absent from failures; `rg -n "mv .*todos" plugins/devflow/devflow/workflows/check-todos.md` → none.
3. After Task 2: group clean; repo + doc-refs tests green; `rg -n "debug (put|resolve)" plugins/devflow/agents/debugger.md` shows both.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED baseline + todo and decide flows</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json, plugins/devflow/devflow/workflows/add-todo.md, plugins/devflow/devflow/workflows/check-todos.md, plugins/devflow/skills/todo/SKILL.md, plugins/devflow/skills/decide/SKILL.md</files>
  <action>
Empty `work.json`; run; commit RED. Rewrite add-todo.md (L25, L92-124), check-todos.md (L131, L160 commit line → drop the `done/` path; keep a
commit of code only if any), todo and decide skills per the recipe. Commit `docs(48-20): todos and decisions use entity verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs 2>&1 | rg "add-todo|check-todos|skills/todo|skills/decide" || echo clean</verify>
  <done>None of these files appear in the failure list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Debug, quick, micro and templates — group green</name>
  <files>plugins/devflow/agents/debugger.md, plugins/devflow/skills/debug/SKILL.md, plugins/devflow/devflow/workflows/quick.md, plugins/devflow/skills/quick/SKILL.md, plugins/devflow/devflow/workflows/micro.md, plugins/devflow/skills/micro/SKILL.md, plugins/devflow/devflow/templates/DEBUG.md, plugins/devflow/devflow/templates/debug-subagent-prompt.md</files>
  <action>
Rewrite debugger.md (L117 `DEBUG_RESOLVED_DIR`, L363-364 `mv`, L387 commit, L502 report path — the report path can stay as the cache path it
reads from) and the quick/micro flows per the recipe. Commit `docs(48-20): debug, quick and micro use entity verbs`. Run repo + doc-refs tests;
record counts in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Repo test green with an empty `work.json`; doc-refs green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `agents/debugger.md` L117, L363-364, L387, L502; `workflows/add-todo.md` L25, L92-124; `workflows/check-todos.md` L131, L160.
- `.planning/quick/1-add-release-on-tag-github-actions-workfl/{1-JOB.md,1-SUMMARY.md}` — the quick layout the verbs reproduce.
</codebase_examples>
<anti_patterns>
- Posting a debug issue update on every hypothesis: write the draft freely, `debug put` at checkpoints (session pause/resume and resolution) to respect the write budget.
</anti_patterns>
<error_recovery>
- If micro.md's atomic STATE update (quick-11) has no store-aware df-tools equivalent, guard it with `planning mode` (local: as today; store: skip).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/micro.test.cjs plugins/devflow/devflow/bin/lib/check-todos.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "todos/done" plugins/devflow/devflow/workflows plugins/devflow/skills` → none.
</verification>

<success_criteria>
Todos, decisions, debug sessions and quick tasks are created and closed only through verbs, so in store mode each is a GitHub issue.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-20-SUMMARY.md`
</output>
