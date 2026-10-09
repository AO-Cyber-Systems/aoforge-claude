---
name: micro
description: |
  Sub-30-LOC, single-file changes. The cheapest AOForge path (~2k tokens). Use for typo fixes, single-line bug fixes, prop renames, dependency bumps, missing semicolons.
  Triggers on: "fix typo", "rename X to Y", "1-line fix", "single-file change", "tiny", "trivial"
argument-hint: "<description>"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:micro`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:micro` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:micro` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
