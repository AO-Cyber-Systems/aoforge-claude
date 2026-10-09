---
name: initiatives
description: |
  Manage strategic initiative context — sync GitHub Epics to disk, list cached initiatives, or show a single initiative body. Planner reads these at plan time.
  Triggers on: "sync initiatives", "refresh initiatives", "show initiative", "what initiatives are loaded".
argument-hint: "[sync [--initiative <slug>] [--project-id <id>] [--force]] | [list [--home <path>]] | [show <slug>]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:initiatives`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:initiatives` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:initiatives` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
