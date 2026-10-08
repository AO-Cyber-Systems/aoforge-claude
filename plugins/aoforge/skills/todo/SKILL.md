---
name: todo
description: |
  Manage todos: capture an idea/task or view the morning standup across local + GitHub + peer sources.
  Subcommand-style: /aoforge:todo add | list
  Use when the user wants to save something for later, note an idea, or get a "what should I work on?" view.
  Triggers on: "remember to", "add a todo", "save this idea", "what should I work on?", "morning standup", "check todos".
argument-hint: "<add|list> [args...]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TodoWrite
---

<objective>
Manage todos. Routes by first argument:
- `add [description]` — Capture an idea/task from current conversation
- `list [--all|--lane|--refresh|--raw]` — Morning standup view across 5 sources

Replaces 2 sibling skills: add-todo, check-todos.

The session task list (TaskCreate, TaskUpdate and TaskList, or TodoWrite) is the in-session store of a todo; the todo
files (or GitHub issues in store mode) are the durable archive. `add` puts the todo in the session list first, then
writes the archive. `list` merges the session list into the archive, then shows the archive with each todo's
in-session status. The todo-sync Stop hook and `aof-tools todo sync` carry session todos into the archive, so a turn cut
off between the two writes loses nothing. Without task tools in the session (newer models without
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`) the flows are archive-only, exactly as before. Convention:
`@~/.claude/aoforge/references/built-ins.md` section 5.

Todo files go through the verbs. Never write, edit or move a file under `.planning/todos/` directly. Add with
`node ~/.claude/aoforge/bin/aof-tools.cjs todo add --from <draft>` (draft path from `planning draft todos/pending/<stem>.md`)
and complete with `node ~/.claude/aoforge/bin/aof-tools.cjs todo complete <filename>`. In local mode they write the same
`.planning/todos/` files; with `github.store` on each todo is also a GitHub issue.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/add-todo.md
@~/.claude/aoforge/workflows/check-todos.md
@~/.claude/aoforge/references/built-ins.md
</execution_context>

<context>
Subcommand: $ARGUMENTS
Session: ${CLAUDE_SESSION_ID}

@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/aoforge/bin/aof-tools.cjs skill-route todo $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow resolved workflow:**

Based on `subcommand`:
- `add` → execute add-todo workflow with residual args
- `list` → execute check-todos workflow with residual args (passes `--all`, `--lane`, etc. through)

Pass residual `args` to the workflow as if the user had typed them.
</process>
