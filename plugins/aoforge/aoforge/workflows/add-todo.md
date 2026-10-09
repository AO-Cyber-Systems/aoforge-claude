---
status: active
---
<purpose>
Capture an idea, task, or issue that surfaces during an AOForge session as a structured todo for later work. Enables "thought → capture → continue" flow without losing context.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
Load todo context:

```bash
INIT=$(node ~/.claude/aoforge/bin/aof-tools.cjs init todos)
```

Extract from init JSON: `commit_docs`, `date`, `timestamp`, `todo_count`, `todos`, `pending_dir`, `todos_dir_exists`.

Ensure the pending directory exists (the duplicate check below reads it):
```bash
mkdir -p .aoforge/todos/pending
```

Note existing areas from the todos array for consistency in infer_area step.
</step>

<step name="extract_content">
**With arguments:** Use as the title/focus.
- `/aoforge:todo add Add auth token refresh` → title = "Add auth token refresh"

**Without arguments:** Analyze recent conversation to extract:
- The specific problem, idea, or task discussed
- Relevant file paths mentioned
- Technical details (error messages, line numbers, constraints)

Formulate:
- `title`: 3-10 word descriptive title (action verb preferred)
- `problem`: What's wrong or why this is needed
- `solution`: Approach hints or "TBD" if just an idea
- `files`: Relevant paths with line numbers from conversation
</step>

<step name="infer_area">
Infer area from file paths:

| Path pattern | Area |
|--------------|------|
| `src/api/*`, `api/*` | `api` |
| `src/components/*`, `src/ui/*` | `ui` |
| `src/auth/*`, `auth/*` | `auth` |
| `src/db/*`, `database/*` | `database` |
| `tests/*`, `__tests__/*` | `testing` |
| `docs/*` | `docs` |
| `.aoforge/*` | `planning` |
| `scripts/*`, `bin/*` | `tooling` |
| No files or unclear | `general` |

Use existing area from step 2 if similar match exists.
</step>

<step name="check_duplicates">
```bash
# Search for key words from title in existing todos
grep -l -i "[key words from title]" .aoforge/todos/pending/*.md 2>/dev/null
```

If potential duplicate found:
1. Read the existing todo
2. Compare scope

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "Similar todo exists: [title]. What would you like to do?"
- options:
  - "Skip" — keep existing todo
  - "Replace" — update existing with new context
  - "Add anyway" — create as separate todo
</step>

<step name="create_file">
Use values from init context: `timestamp` and `date` are already available.

Todo files are written only through `aof-tools todo add`, never directly: in local mode the verb writes
`.aoforge/todos/pending/<date>-<slug>.md`; with `github.store` on it also files the todo as a GitHub issue. This step
drafts the todo, the next step puts it in the session task list, and the archive_todo step writes the archive.

Generate the slug for the title, then get a draft path for the todo (each command prints one value; note it as a
literal, since shell variables do not survive between Bash calls):
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs generate-slug "$title" --raw
node ~/.claude/aoforge/bin/aof-tools.cjs planning draft todos/pending/${date}-${slug}.md
```

Write this content to the draft path (`$DRAFT`) with the Write tool:

```markdown
---
created: [timestamp]
title: [title]
area: [area]
files:
  - [file:lines]
---

## Problem

[problem description - enough context for future Claude to understand weeks later]

## Solution

[approach hints or "TBD"]
```
</step>

<step name="session_item">
Put the todo in the session task list first. The list is the in-session store; the archive write follows, and if the
turn is cut off before it, the todo-sync Stop hook archives the session item when the turn ends. The stem
`[date]-[slug]` is the file stem the archive will use (`date` and `slug` from the previous step).

**Session task list (if available):** use the task tool the session has.

TaskCreate(subject="Todo: [title]", description="[problem, one line]", activeForm="Capturing todo: [title]", metadata={aoforge_todo: "[date]-[slug]"})

With TodoWrite instead of the Task tools (sessions started with CLAUDE_CODE_ENABLE_TASKS=0), write the current list plus the new item:

TodoWrite(todos=[...current items, {content: "Todo: [title] [todo:[date]-[slug]]", status: "pending", activeForm: "Capturing todo: [title]"}])

With neither (newer models without CLAUDE_CODE_ENABLE_TODO_TOOLS=1), skip this step: the archive write is the whole record, as before.
</step>

<step name="archive_todo">
Then add the todo to the archive:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs todo add --from "$DRAFT"
```

The verb derives the file stem from today's date and the `title:` frontmatter (`<date>-<slug>`, the same name as
before) and prints `todo add: wrote .aoforge/todos/pending/<stem>.md (<mode> mode).` Use that file name as
`[filename]` below.
</step>

<step name="update_state">
Check the planning mode first:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs planning mode
```

**`local`:** if `.aoforge/STATE.md` exists,
1. Use `todo_count` from init context (or re-run `init todos` if count changed)
2. Update "### Pending Todos" under "## Accumulated Context"

**`store`:** skip this step. STATE.md is a generated view there (`aof-tools gh pull --all` rebuilds it), and the
todo issue is the record.
</step>

<step name="git_commit">
Commit the todo and any updated state:

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: capture todo - [title]" --files .aoforge/todos/pending/[filename] .aoforge/STATE.md
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: capture todo - [title]"
</step>

<step name="confirm">
```
Todo saved: .aoforge/todos/pending/[filename]

  [title]
  Area: [area]
  Files: [count] referenced

---

Would you like to:

1. Continue with current work
2. Add another todo
3. View all todos (/aoforge:todo list)
```
</step>

</process>

<success_criteria>
- [ ] Directory structure exists
- [ ] Todo is in the session task list when the session has task tools
- [ ] Todo added through `todo add --from <draft>`, with valid frontmatter
- [ ] Problem section has enough context for future Claude
- [ ] No duplicates (checked and resolved)
- [ ] Area consistent with existing todos
- [ ] STATE.md updated if it exists (local mode only)
- [ ] Todo and state committed to git
</success_criteria>
