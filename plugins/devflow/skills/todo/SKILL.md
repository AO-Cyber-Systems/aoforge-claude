---
name: todo
description: |
  Manage todos: capture an idea/task or view the morning standup across local + GitHub + peer sources.
  Subcommand-style: /aoforge:todo add | list
  Use when the user wants to save something for later, note an idea, or get a "what should I work on?" view.
  Triggers on: "remember to", "add a todo", "save this idea", "what should I work on?", "morning standup", "check todos".
argument-hint: "<add|list> [args...]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:todo`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:todo` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:todo` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
