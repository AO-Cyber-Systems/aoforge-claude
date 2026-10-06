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
Load todo context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init todos)
```

Extract from init JSON: `todo_count`, `todos`, `pending_dir`.

If `todo_count` is 0:
```
No pending todos.

Todos are captured during work sessions with /devflow:todo add.

---

Would you like to:

1. Continue with current objective (/devflow:status)
2. Add a todo now (/devflow:todo add)
```

Exit.
</step>

<step name="parse_filter">
Check for area filter in arguments:
- `/devflow:todo list` → show all
- `/devflow:todo list api` → filter to area:api only
</step>

<step name="list_todos">
Use the `todos` array from init context (already filtered by area if specified).

Parse and display as numbered list:

```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)
```

Format age as relative time from created timestamp.
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
- An area typed under Other: filter to that area, as `/devflow:todo list [area]` does, and return to list_todos.
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
  - "Work on it now" — mark it complete, start working
  - "Add to objective plan" — include when planning Objective [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — mark it complete, start working
  - "Create an objective" — /devflow:objective add with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**
```bash
node ~/.claude/devflow/bin/df-tools.cjs todo complete [filename]
```
The verb moves the todo to `.planning/todos/completed/` and stamps `completed: <date>`; with `github.store` on it also
closes the todo issue. Never move todo files by hand. Then run the update_state step, present the problem/solution
context, and begin work or ask how to proceed.

**Add to objective plan:**
Note todo reference in objective planning notes. Keep in pending. Return to list or exit.

**Create an objective:**
Display: `/devflow:objective add [description from todo]`
Keep in pending. User runs command in fresh context.

**Brainstorm approach:**
Keep in pending. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_state">
After any action that changes todo count, check the planning mode:

```bash
node ~/.claude/devflow/bin/df-tools.cjs planning mode
```

**`local`:** re-run `init todos` to get the updated count, then update STATE.md "### Pending Todos" section if it exists.
**`store`:** skip it. STATE.md is a generated view there (`df-tools gh pull --all` rebuilds it).
</step>

<step name="git_commit">
If the todo was completed, commit the move. The pending path records the removal; in store mode the ignored
planning paths are skipped and nothing else needs committing:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: start work on todo - [title]" --files .planning/todos/pending/[filename] .planning/todos/completed/[filename] .planning/STATE.md
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: start work on todo - [title]"
</step>

</process>

<success_criteria>
- [ ] All pending todos listed with title, area, age
- [ ] Area filter applied if specified
- [ ] Selected todo's full context loaded
- [ ] Roadmap context checked for objective match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.md updated if todo count changed
- [ ] Changes committed to git (if the todo was completed with `todo complete`)
</success_criteria>
