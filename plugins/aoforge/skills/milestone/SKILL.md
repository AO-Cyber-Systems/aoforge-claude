---
name: milestone
description: |
  Manage milestones: start a new one, audit a finished one, complete it, or plan gap-closure objectives.
  Subcommand-style: /aoforge:milestone new | audit | complete | gaps
  Use when explicitly requested.
argument-hint: "<new|audit|complete|gaps> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - EnterPlanMode
  - Glob
  - Grep
---

<objective>
Manage milestones in the current project. Routes by first argument:
- `new [name]` — Start the next development cycle (questioning → research → requirements → roadmap)
- `audit [version]` — Verify a milestone achieved its definition of done
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into new objectives that close them

Replaces 4 sibling skills: new-milestone, audit-milestone, complete-milestone, plan-milestone-gaps.
</objective>

<execution_context>
One workflow is loaded after routing, never all of them: `Read` the `workflow` path the route returns (expand `~`), then follow it.
The routes are ~/.claude/aoforge/workflows/new-milestone.md (new), ~/.claude/aoforge/workflows/audit-milestone.md (audit),
~/.claude/aoforge/workflows/complete-milestone.md (complete) and ~/.claude/aoforge/workflows/plan-milestone-gaps.md (gaps).
@~/.claude/aoforge/references/built-ins.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

Roadmap (digest; `node ~/.claude/aoforge/bin/aof-tools.cjs roadmap get-objective <N>` prints one objective in full):
!`node ~/.claude/aoforge/bin/aof-tools.cjs roadmap digest --raw 2>/dev/null`
Project state (digest; `node ~/.claude/aoforge/bin/aof-tools.cjs state get` prints the full file):
!`node ~/.claude/aoforge/bin/aof-tools.cjs state digest --raw 2>/dev/null`
@.aoforge/PROJECT.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/aoforge/bin/aof-tools.cjs skill-route milestone $ARGUMENTS --raw)
```

Parse the JSON. If it contains `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Read the resolved workflow (the `workflow` path, `~` expanded) with the Read tool, then follow it.**

Based on `subcommand`:
- `new` → execute new-milestone workflow with residual args (the name, if provided)
- `audit` → execute audit-milestone workflow with residual args (the version, if provided)
- `complete` → execute complete-milestone workflow with residual args (the version, REQUIRED)
- `gaps` → execute plan-milestone-gaps workflow with residual args

Pass residual `args` to the workflow as `$ARGUMENTS`.
</process>
