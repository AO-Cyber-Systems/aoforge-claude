---
name: milestone
description: |
  Manage milestones: start a new one, audit a finished one, complete it, or plan gap-closure objectives.
  Subcommand-style: /aoforge:milestone new | audit | complete | gaps
  Use when explicitly requested.
argument-hint: "<new|audit|complete|gaps> [args...]"
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:milestone`.

`/aoforge:milestone` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:milestone $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:milestone`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
