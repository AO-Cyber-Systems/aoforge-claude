---
name: plan-objective
description: |
  Create a detailed execution plan for an objective, breaking it into concrete tasks with success criteria.
  Use when the user wants to plan an objective, create execution plans, or prepare for building.
  Triggers on: "plan objective", "create plans", "plan the next objective", "let's plan", "prepare objective", "make plans for"
argument-hint: "[objective] [--auto] [--research] [--skip-research] [--gaps] [--skip-verify] [--work TYPE] [--tdd POSTURE] [--depth LEVEL] [--model PROFILE]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:plan-objective`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:plan-objective` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:plan-objective` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
