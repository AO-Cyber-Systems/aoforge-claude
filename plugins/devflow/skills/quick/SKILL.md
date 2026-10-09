---
name: quick
description: |
  Small features (single executor, no planner, no verifier) — between micro (1-line) and build (multi-subsystem). Cutoff: <5 files, <200 LOC, no new abstractions.
  Use when the change is too big for /aoforge:micro but doesn't warrant full /aoforge:build planning.
  Triggers on: "small change", "small feature", "5-file change", "isolated bug fix", "do this small task", "tackle this small change", "make a quick pass"
argument-hint: "[--full]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:quick`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:quick` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:quick` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
