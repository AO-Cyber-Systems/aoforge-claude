---
name: build
description: |
  Build a feature from start to finish — plans the work, executes it, and verifies the result in one command.
  Use when the user wants to build something, implement a feature, or work on an objective end-to-end.
  Triggers on: "build this", "build objective", "let's build", "implement this", "ship this", "make this work", "build the", "work on objective", "start building", "let's implement"
argument-hint: "<objective-number-or-description> [--pause] [--skip-research] [--work TYPE] [--tdd POSTURE] [--depth LEVEL] [--model PROFILE]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:build`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:build` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:build` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
