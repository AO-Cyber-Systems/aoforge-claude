---
name: map-codebase
description: |
  Analyze an existing codebase to understand its stack, architecture, conventions, and concerns before starting new work.
  Use when the user wants to understand, analyze, or map an existing codebase.
  Triggers on: "understand this codebase", "map the code", "analyze architecture", "what does this codebase look like?", "explore the code structure"
argument-hint: "[optional: specific area to map, e.g., 'api' or 'auth'] [--non-interactive]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:map-codebase`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:map-codebase` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:map-codebase` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
