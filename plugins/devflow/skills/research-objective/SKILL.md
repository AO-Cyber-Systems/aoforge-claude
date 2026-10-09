---
name: research-objective
description: |
  Research how to build something before planning it — discovers best practices, architecture patterns, and pitfalls for the domain.
  Use when the user wants to investigate, research, or explore options before planning an objective.
  Triggers on: "research objective", "investigate before planning", "look into how to build", "what's the best approach for objective"
argument-hint: "[objective]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:research-objective`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:research-objective` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:research-objective` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
