---
name: workstreams
description: |
  Run independent objectives in parallel using git worktrees, then merge results back.
  Subcommand-style: /aoforge:workstreams setup | status | merge | run
  Advanced parallel execution — use only when explicitly requested.
argument-hint: "<setup|status|merge|run> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Manage parallel feature development using git worktrees. Routes by first argument:
- `setup` — Analyze deps, create worktrees, provision .aoforge/
- `status` — Check progress across all active workstreams
- `merge` — Squash-merge completed workstreams, reconcile state
- `run` — (stub; v1.2 obj 6 implementation) Run an active workstream end-to-end
</objective>

<execution_context>
@~/.claude/aoforge/references/ui-brand.md
One workflow is loaded after routing, never all of them: `Read` the `workflow` path the route returns (expand `~`), then follow it.
The routes are ~/.claude/aoforge/workflows/workstreams-setup.md (setup), ~/.claude/aoforge/workflows/workstreams-status.md (status),
~/.claude/aoforge/workflows/workstreams-merge.md (merge) and ~/.claude/aoforge/workflows/workstreams-run.md (run).
</execution_context>

<context>
Subcommand: $ARGUMENTS

Roadmap (digest; `node ~/.claude/aoforge/bin/aof-tools.cjs roadmap get-objective <N>` prints one objective in full):
!`node ~/.claude/aoforge/bin/aof-tools.cjs roadmap digest --raw 2>/dev/null`
Project state (digest; `node ~/.claude/aoforge/bin/aof-tools.cjs state get` prints the full file):
!`node ~/.claude/aoforge/bin/aof-tools.cjs state digest --raw 2>/dev/null`
@.aoforge/config.json
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/aoforge/bin/aof-tools.cjs skill-route workstreams $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop.

**2. Read the resolved workflow (the `workflow` path, `~` expanded) with the Read tool, then follow it** based on `subcommand`:
- `setup` → workstreams-setup.md with residual args
- `status` → workstreams-status.md
- `merge` → workstreams-merge.md
- `run` → workstreams-run.md (stub — informs user, exits cleanly)
</process>
