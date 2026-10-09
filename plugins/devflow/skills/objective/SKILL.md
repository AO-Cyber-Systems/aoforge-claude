---
name: objective
description: |
  Add or remove an objective from the current milestone roadmap.
  Subcommand-style: /aoforge:objective add | remove
  Use when explicitly requested.
  Note: 'insert' (decimal objectives) was removed in v1.2 — use 'add' instead.
argument-hint: "<add|remove> [args...]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:objective`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:objective` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:objective` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
