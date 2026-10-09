---
name: debug
description: |
  Investigate bugs using a structured approach that survives context resets. Tracks hypotheses, evidence, and progress across sessions.
  Use when the user reports a bug, error, or something not working as expected.
  Triggers on: "debug this", "something's broken", "fix this bug", "not working", "there's an error", "why isn't this working?"
argument-hint: "[issue description]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:debug`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:debug` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:debug` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
