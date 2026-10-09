---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "04"
type: standard
wave: 3
depends_on: ["63-02"]
files_modified:
  - plugins/devflow/skills/todo/SKILL.md
  - plugins/devflow/devflow/workflows/add-todo.md
  - plugins/devflow/devflow/workflows/check-todos.md
  - plugins/devflow/devflow/references/built-ins.md
  - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
  - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
  - plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs
autonomous: true
requirements: [BLTN-04]
must_haves:
  truths:
    - "`/devflow:todo add` puts the todo in the session task list first (TaskCreate with subject `Todo: <title>` and metadata `{devflow_todo: <stem>}`, or a TodoWrite item `Todo: <title> [todo:<stem>]`), then writes the archive with `todo add --from` as today"
    - "`/devflow:todo list` merges this session's task-list todos into the archive (`todo sync --session <id>`, then commits what it changed in local mode), reads the session list with TaskList, and shows archive todos with their in-session status"
    - "Choosing 'Work on it now' marks the todo in_progress in the session list and leaves the archive todo pending until its session task is completed, which the Stop hook (or the next list) carries into the archive"
    - "With no task tools in the session (newer models without CLAUDE_CODE_ENABLE_TODO_TOOLS=1), add and list behave exactly as before: archive only, and 'Work on it now' completes the todo at once"
    - "The todo skill declares TaskCreate, TaskUpdate, TaskList and TodoWrite; builtin-audit counts `TodoWrite(` as a built-in use, and the built-in sweep, planning-writes and doc-refs ratchets stay green"
    - "references/built-ins.md states the todo-store convention once, and no progress task anywhere uses a `Todo: ` subject"
  artifacts:
    - path: plugins/devflow/skills/todo/SKILL.md
      provides: "allowed-tools + TaskCreate, TaskUpdate, TaskList, TodoWrite; Session: ${CLAUDE_SESSION_ID} in <context>"
    - path: plugins/devflow/devflow/workflows/add-todo.md
      provides: "session_item step before the archive write"
    - path: plugins/devflow/devflow/workflows/check-todos.md
      provides: "sync step, session view, in-session Work on it now"
    - path: plugins/devflow/devflow/references/built-ins.md
      provides: "## 5. Todo store"
    - path: plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs
      provides: "pins the todo flow contract the parser (63-01) and the sync (63-02) rely on"
  key_links:
    - "Subjects and suffixes written here are the ones todo-session.cjs parseTodoSubject reads (63-01): `Todo: ` prefix, `[todo:<stem>]` suffix, metadata key `devflow_todo`"
    - "check-todos.md -> `df-tools todo sync --session <id> --raw` (63-02) and `df-tools commit --files <pending_commit>`"
    - "builtin-sweep.repo.test.cjs test 6: every built-in a skill's flow calls is declared in its allowed-tools"
---

# TRD 63-04: `/devflow:todo` on the session task list (BLTN-04, part 4)

<objective>
Make TodoWrite (the session task list) the in-session store of `/devflow:todo`, with the existing todo files or
GitHub issues as its durable archive.

Today `add` writes only the archive and `list` reads only the archive. After this TRD:
- `add`: session item first, archive write second (the Stop hook archives the session item if the turn is cut between).
- `list`: sync the session into the archive, then show the archive with each todo's in-session status.
- `Work on it now`: in_progress in the session; the archive todo completes when the session task completes.

"TodoWrite" in the requirement means the session task list, which Claude Code exposes as the four Task tools by default
and as `TodoWrite` with `CLAUDE_CODE_ENABLE_TASKS=0`. The flows handle both, and neither: since v2.1.268 the task tools
exist by default only on Claude 3.x, Opus 4-4.7, Sonnet 4-4.6 and Haiku 4.5 (newer models need
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`), and a skill's `allowed-tools` does not switch them on. Without them every flow is
exactly today's.

Purpose: SC1's "adds and lists items through TodoWrite in-session". Output: the skill, both workflows, the convention,
the audit change and a repo test that pins the contract.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Archive writes stay on the verbs: `todo add --from <draft>`, `todo complete <file>`, `todo sync`, `df-tools commit`.
  The planning-writes repo test fails on any direct write instruction near `todos/`.
- Discrete choices stay AskUserQuestion; add no prose menus (the built-in sweep is closed and fails outright). Keep
  the existing AskUserQuestion calls and their routing unchanged.
- Progress tasks never use a `Todo: ` subject; the todo flows never create progress tasks (they are not in the BLTN-01 flow table).
- Do not write the literal skill placeholder for the session id in the workflow files: Claude Code substitutes
  `${CLAUDE_SESSION_ID}` in the skill's own markdown, and an @-included workflow may or may not be substituted. The
  SKILL.md `<context>` carries `Session: ${CLAUDE_SESSION_ID}`; workflows say "the Session line of the skill context"
  and skip the sync when that line is empty or starts with `$`.
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<codebase_examples>
Progress block convention to mirror (quick.md, references/built-ins.md §1):
```
**Progress tracking (if available):**

TaskCreate(subject="Plan: ${DESCRIPTION}", description="Planning the quick task", activeForm="Planning the quick task")
TaskUpdate(taskId=plan_task_id, status="in_progress")
```
Current todo SKILL.md frontmatter:
```yaml
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
```
Current add-todo.md create_file core (keep it):
```bash
node ~/.claude/devflow/bin/df-tools.cjs generate-slug "$title" --raw
node ~/.claude/devflow/bin/df-tools.cjs planning draft todos/pending/${date}-${slug}.md
...
node ~/.claude/devflow/bin/df-tools.cjs todo add --from "$DRAFT"
```
Current check-todos.md "Work on it now" (becomes the no-task-tools branch):
```bash
node ~/.claude/devflow/bin/df-tools.cjs todo complete [filename]
```
builtin-audit.cjs (call-form detection; TodoWrite joins the list):
```js
const BUILTINS = ['AskUserQuestion', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'EnterPlanMode', 'ExitPlanMode'];
const TOOL_RES = Object.fromEntries(BUILTINS.map((t) => [t, new RegExp(t === 'AskUserQuestion'
  ? String.raw`\bAskUserQuestion\b` : String.raw`\b${t}\(`, 'g')]));
```
Planning-audit allow marker precedent (quick.md:368): `<!-- planning-audit: allow <reason of 20+ chars> -->` on the line or the line above.
</codebase_examples>

<anti_patterns>
- Do not seed every pending archive todo into the session list on `list`: it would flood the task list (Ctrl+T shows
  five). Only the todo the user picks to work on enters the session list.
- Do not complete the archive todo when "Work on it now" is chosen and task tools exist: completion now follows the
  session task. (Without task tools, keep today's immediate completion.)
- Do not mark a todo completed in the session to "clean up" the list; `status: "deleted"` removes it from the session
  and never touches the archive.
- Do not add a fifth option to the action AskUserQuestion (the tool allows four).
</anti_patterns>

<error_recovery>
- builtin-sweep test 3 reports a new prompt finding in check-todos.md or add-todo.md: reword the line out of menu shape
  (references/built-ins.md §3); do not add an allow marker to a real choice.
- planning-writes.repo.test flags a line such as "the Stop hook completes it in the archive" or a `TodoWrite(` line near
  a `todos/` path: move a df-tools verb call within 3 lines, reword, or add a planning-audit allow marker with a real
  reason (a session task-list call writes no planning file).
- builtin-sweep test 6 reports TodoWrite or TaskList missing from another skill: only the todo flows should call them;
  if another flow does, it is a pre-existing mention in call form; reword it to prose (no `(`) and note it.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/skills/todo/SKILL.md
@plugins/devflow/devflow/workflows/add-todo.md
@plugins/devflow/devflow/workflows/check-todos.md
@plugins/devflow/devflow/references/built-ins.md
@plugins/devflow/devflow/bin/lib/builtin-audit.cjs
@.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-02-SUMMARY.md
</context>

## Test list

`todo-skill.repo.test.cjs` (repo test: skips on a mirror install with no README.md five levels up), outermost first:
1. `skillCoverage({name: 'todo'})` reports no missing and no forbidden built-in, and the todo SKILL.md `allowed-tools`
   lists TaskCreate, TaskUpdate, TaskList and TodoWrite.
2. The todo SKILL.md `<context>` contains `Session: ${CLAUDE_SESSION_ID}`; neither workflow contains the literal `${CLAUDE_SESSION_ID}`.
3. add-todo.md: the first `TaskCreate(` and the first `TodoWrite(` both appear before the `todo add --from` line;
   the TaskCreate call carries `subject="Todo: ` and `devflow_todo`; the TodoWrite call carries `[todo:`; the step
   says what happens with neither tool.
4. check-todos.md: `todo sync --session` appears before `init todos`; a `df-tools.cjs commit` naming `pending_commit`
   follows the sync; `TaskList(` appears; the Work-on-it-now text has a `TaskUpdate(` with `status="in_progress"`, a
   `TodoWrite(` form, and keeps `todo complete` for the no-task-tools case.
5. No skill or active workflow other than add-todo.md and check-todos.md has a `TaskCreate(` whose subject starts with `Todo: `.
6. references/built-ins.md has a `## 5. Todo store` section naming `Todo: `, `devflow_todo`, `[todo:`, `todo sync`
   and the todo-sync Stop hook.

`builtin-audit.test.cjs` additions:
7. `builtinsUsed('TodoWrite(todos=[...])')` includes `TodoWrite`; `Never call TodoWrite(` (negated) and a bare mention
   `TodoWrite` without `(` do not count.

Existing ratchets that must stay green: `builtin-sweep.repo.test.cjs`, `planning-writes.repo.test.cjs`, `doc-refs.repo.test.cjs`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin the contract (RED): todo-skill.repo.test.cjs and the builtin-audit TodoWrite case</name>
  <files>plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs, plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs, plugins/devflow/devflow/bin/lib/builtin-audit.cjs</files>
  <action>
Write tests 1-7. Header comment in the style of builtin-sweep.repo.test.cjs: what it pins, why (63-01's parser and
63-02's sync depend on these exact subject forms), the test list, runtime model (read-only; repo root five levels up;
mirror install skips). Run: 1-6 fail on the current prose, 7 fails until BUILTINS has TodoWrite. Commit RED.

Then the audit half of GREEN: add `'TodoWrite'` to `BUILTINS` (after `TaskGet`), and update the header comment
(TodoWrite is the session todo store of `/devflow:todo`; like the Task tools it needs no permission, so declaring it is
harmless). Test 7 passes; `builtin-sweep.repo.test.cjs` must still pass (no other flow calls `TodoWrite(`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` passes; `node --test plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs` fails only on tests 1-6.</verify>
  <done>The contract is pinned and failing for the right reasons; builtin-audit counts TodoWrite.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Skill, workflows and convention (GREEN)</name>
  <files>plugins/devflow/skills/todo/SKILL.md, plugins/devflow/devflow/workflows/add-todo.md, plugins/devflow/devflow/workflows/check-todos.md, plugins/devflow/devflow/references/built-ins.md</files>
  <action>
**SKILL.md:** allowed-tools gains `TaskCreate`, `TaskUpdate`, `TaskList`, `TodoWrite` (YAML list). `<objective>`: one
paragraph — the session task list (TaskCreate/TaskUpdate/TaskList, or TodoWrite) is the in-session store; the todo files
(or GitHub issues in store mode) are the durable archive; the todo-sync Stop hook and `todo sync` merge the session
into the archive; without task tools the flows are archive-only as before. Keep the existing verb paragraph.
`<execution_context>` adds `@~/.claude/devflow/references/built-ins.md`. `<context>` adds `Session: ${CLAUDE_SESSION_ID}`.

**add-todo.md:** split create_file so the order is: draft (slug, `planning draft`, Write) → NEW
`<step name="session_item">` → archive write (`todo add --from "$DRAFT"`, unchanged text). session_item:
```
Put the todo in the session task list first. The list is the in-session store; the archive write follows, and if the
turn is cut off before it, the todo-sync Stop hook archives the session item when the turn ends.

**Session task list (if available):** use the task tool the session has.

TaskCreate(subject="Todo: [title]", description="[problem, one line]", activeForm="Capturing todo: [title]", metadata={devflow_todo: "[date]-[slug]"})

With TodoWrite instead of the Task tools (sessions started with CLAUDE_CODE_ENABLE_TASKS=0), write the current list plus:
TodoWrite(todos=[...current items, {content: "Todo: [title] [todo:[date]-[slug]]", status: "pending", activeForm: "Capturing todo: [title]"}])

With neither (newer models without CLAUDE_CODE_ENABLE_TODO_TOOLS=1), skip this step: the archive write is the whole record, as before.
```
Success criteria gain "Todo is in the session task list when the session has task tools".

**check-todos.md:**
- init_context, before `init todos`: "Merge this session's task-list todos into the archive. Use the Session line of the
  skill context; skip this when it is empty or starts with `$`." →
  `node ~/.claude/devflow/bin/df-tools.cjs todo sync --session <session id> --raw`; then "If `pending_commit` lists paths
  (local mode), commit exactly those:" → `node ~/.claude/devflow/bin/df-tools.cjs commit "docs: sync session todos" --files <each pending_commit path>`.
- NEW `<step name="session_view">` after init: `**Session task list (if available):**` `TaskList()`; keep tasks whose
  subject starts with `Todo: ` (id, title, status). With TodoWrite, read the `Todo: ` items of the current list. With
  neither, skip.
- list_todos: an archive todo whose session item is `in_progress` shows `(in progress this session)`; session `Todo: `
  items that match no archive title are listed after the archive list under `This session, not archived yet:` (they
  appear only when the sync was skipped).
- execute_action, Work on it now:
  ```
  Task tools: if the session list has this todo (subject "Todo: [title]"), TaskUpdate(taskId=[its id], status="in_progress").
  Otherwise TaskCreate(subject="Todo: [title]", description="[problem, one line]", activeForm="Working on [title]", metadata={devflow_todo: "[stem]"})
  then TaskUpdate(taskId=[new id], status="in_progress"). The archive todo stays pending. When the work is done,
  TaskUpdate(taskId=[id], status="completed"): the todo-sync Stop hook completes the archive todo when that turn ends.
  TodoWrite: write the list with {content: "Todo: [title] [todo:[stem]]", status: "in_progress", activeForm: "Working on [title]"}, and "completed" when done.
  Neither tool: complete it now, as before:
  node ~/.claude/devflow/bin/df-tools.cjs todo complete [filename]
  (then update_state and git_commit as today)
  ```
  The other actions are unchanged.
- success_criteria: add "Session todos merged into the archive before listing" and "In-session status shown".

**built-ins.md:** append `## 5. Todo store` (keep §1-§4 numbering): the subject form `Todo: <title>`; metadata
`{devflow_todo: "<YYYY-MM-DD>-<slug>"}` for TaskCreate and the ` [todo:<stem>]` suffix for TodoWrite; the stem is the
archive file stem; completion is `TaskUpdate status="completed"` (or TodoWrite `completed`) and the todo-sync Stop hook /
`df-tools todo sync` carry it into the archive; the merge only moves forward (a deleted session item never removes an
archive todo, a completed todo is never reopened); progress tasks never use `Todo: `; subagents do not create todos;
without task tools the todo flows are archive-only. Keep the file under 140 lines.

Run the four tests (todo-skill, builtin-sweep, planning-writes, doc-refs); fix findings per error_recovery. Commit GREEN
(`feat(63-04): ...`).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` passes; `wc -l plugins/devflow/devflow/references/built-ins.md` is under 140.</verify>
  <done>Tests 1-7 pass with every ratchet green; the flows use the session task list when it exists and are unchanged when it does not.</done>
  <recovery>If a ratchet cannot be satisfied without changing the meaning of a step, keep the meaning, reword, and record the wording choice in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/todo-skill.repo.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- The five tests in Task 2's verify are green.
- `rg -n 'subject="Todo: ' plugins/devflow/skills plugins/devflow/devflow/workflows` matches only add-todo.md and check-todos.md.
</verification>

<success_criteria>
- `/devflow:todo` adds to and reads from the session task list when the session has one, keeps the archive in step,
  and is unchanged when it has none.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-04-SUMMARY.md`
</output>
