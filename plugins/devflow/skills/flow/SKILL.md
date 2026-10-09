---
name: flow
description: |
  Orchestrate a multi-step AOForge workflow by chaining skills. Use when the user wants to invoke a sequence of skills as one ask (e.g., "build and sync to github", "research, plan, then build", "ship and announce").
  Triggers on: "ship X to Y", "build and X", "plan and X", "X then Y", "in one go", "as a chain", "all in sequence", "chain", "ship-and-sync", "research-plan-build"
argument-hint: "<description of the multi-step flow>"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:flow`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:flow` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:flow` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
