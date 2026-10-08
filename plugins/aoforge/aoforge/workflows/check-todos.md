---
status: active
---
<purpose>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
Merge this session's task-list todos into the archive first, so the list below is current. Use the Session line of
the skill context; skip this when it is empty or starts with `$`.

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs todo sync --session <session id> --raw
```

If `pending_commit` lists paths (local mode), commit exactly those. In store mode the planning cache is ignored and
the list is empty:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: sync session todos" --files <each pending_commit path>
```

Load todo context:

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init todos)
```

Extract from init JSON: `todo_count`, `todos`, `pending_dir`.
</step>

<step name="session_view">
Read this session's todos, to show their in-session status next to the archive.

**Session task list (if available):**

TaskList()

Keep the tasks whose subject starts with `Todo: ` (id, title, status). With TodoWrite instead of the Task tools,
read the `Todo: ` items of the current list; the `[todo:<stem>]` suffix names the archive file stem. With neither
(newer models without CLAUDE_CODE_ENABLE_TODO_TOOLS=1), skip the reading: every todo is archive-only.

If `todo_count` is 0 and no `Todo: ` item was read:
```
No pending todos.

Todos are captured during work sessions with /aoforge:todo add.

---

Would you like to:

1. Continue with current objective (/aoforge:status)
2. Add a todo now (/aoforge:todo add)
```

Exit.
</step>

<step name="parse_filter">
Check for area filter in arguments:
- `/aoforge:todo list` → show all
- `/aoforge:todo list api` → filter to area:api only
</step>

<step name="list_todos">
Use the `todos` array from init context (already filtered by area if specified).

Parse and display as numbered list:

```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago) (in progress this session)
3. Refactor database connection pool (database, 5h ago)
```

Format age as relative time from created timestamp.

An archive todo whose session item is `in_progress` shows `(in progress this session)`. Match the session item to the
archive todo by title (ignoring the `Todo: ` prefix and any `[todo:<stem>]` suffix, case and spacing), or by that stem:
TaskList returns no metadata. Session `Todo: ` items that match no archive title are listed after the archive list under
`This session, not archived yet:` (they appear only when the sync was skipped).
</step>

<step name="handle_selection">
Ask which todo to open with AskUserQuestion. The pending todos are the options, label the title (cut to 5 words),
description its area and age. Runtime-list rule: with more than 4 todos, offer the first 4 and the user types any
number from the printed list under Other.

```
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

With fewer todos, fewer options (at least 2). With exactly one todo, the options are `Open it (Recommended)` / `Exit`.

Route the answer:
- A todo (picked, or its number typed under Other): load it, proceed.
- An area typed under Other: filter to that area, as `/aoforge:todo list [area]` does, and return to list_todos.
- `q` typed under Other, or `Exit`: exit.
- A typed answer that matches no todo, number or area: ask again with the same AskUserQuestion.
</step>

<step name="load_context">
Read the todo file completely. Display:

```
## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem
[problem section content]

### Solution
[solution section content]
```

If `files` field has entries, read and briefly summarize each.
</step>

<step name="check_roadmap">
Check for roadmap (can use init progress or directly check file existence):

If `.planning/ROADMAP.md` exists:
1. Check if todo's area matches an upcoming objective
2. Check if todo's files overlap with an objective's scope
3. Note any match for action options
</step>

<step name="offer_actions">
**If todo maps to a roadmap objective:**

Use AskUserQuestion:
- header: "Action"
- question: "This todo relates to Objective [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — start working on it
  - "Add to objective plan" — include when planning Objective [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — start working on it
  - "Create an objective" — /aoforge:objective add with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**

**Session task list (if available):** if the session list has this todo (subject "Todo: [title]"), mark it in progress:

TaskUpdate(taskId=[its id], status="in_progress")

Otherwise add it, then mark it in progress:

TaskCreate(subject="Todo: [title]", description="[problem, one line]", activeForm="Working on [title]", metadata={aoforge_todo: "[stem]"})

TaskUpdate(taskId=[new id], status="in_progress")

The archive todo stays pending. When the work is done, TaskUpdate(taskId=[id], status="completed") closes the session
task, and the todo-sync Stop hook carries the completion into the archive when that turn ends (the next list does too).
Do not run update_state or git_commit now: nothing in the archive changed.

With TodoWrite instead of the Task tools, write the list with the item in progress, and with the same item `completed`
when the work is done:

TodoWrite(todos=[...current items, {content: "Todo: [title] [todo:[stem]]", status: "in_progress", activeForm: "Working on [title]"}])

With neither tool, complete it now, as before:
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs todo complete [filename]
```
The verb moves the todo to `.planning/todos/completed/` and stamps `completed: <date>`; with `github.store` on it also
closes the todo issue. Never move todo files by hand. Then run the update_state step, run the git_commit step, present
the problem/solution context, and begin work or ask how to proceed.

**Add to objective plan:**
Note todo reference in objective planning notes. Keep in pending. Return to list or exit.

**Create an objective:**
Display: `/aoforge:objective add [description from todo]`
Keep in pending. User runs command in fresh context.

**Brainstorm approach:**
Keep in pending. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_state">
After any action that changes todo count, check the planning mode:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning mode
```

**`local`:** re-run `init todos` to get the updated count, then update STATE.md "### Pending Todos" section if it exists.
**`store`:** skip it. STATE.md is a generated view there (`aof-tools gh pull --all` rebuilds it).
</step>

<step name="git_commit">
If the todo was completed, commit the move. The pending path records the removal; in store mode the ignored
planning paths are skipped and nothing else needs committing:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: start work on todo - [title]" --files .planning/todos/pending/[filename] .planning/todos/completed/[filename] .planning/STATE.md
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: start work on todo - [title]"
</step>

</process>

<success_criteria>
- [ ] Session todos merged into the archive before listing
- [ ] All pending todos listed with title, area, age
- [ ] In-session status shown
- [ ] Area filter applied if specified
- [ ] Selected todo's full context loaded
- [ ] Roadmap context checked for objective match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.md updated if todo count changed
- [ ] Changes committed to git (if the todo was completed with `todo complete`)
</success_criteria>
