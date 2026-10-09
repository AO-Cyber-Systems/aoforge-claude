---
name: execute-objective
description: |
  Execute all planned tasks for an objective, running independent tasks in parallel for speed.
  Use when the user wants to run or execute an already-planned objective.
  Triggers on: "execute objective", "run objective", "run the jobs", "run the planned objective", "execute the plan"
argument-hint: "<phase-number> [--gaps-only]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:execute-objective`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:execute-objective` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:execute-objective` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
