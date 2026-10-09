---
name: list-objective-assumptions
description: |
  See what Claude plans to do for an objective before it starts, so you can course-correct early.
  Shows the intended approach without creating any files.
argument-hint: "[objective]"
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:list-objective-assumptions`.

`/aoforge:list-objective-assumptions` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:list-objective-assumptions $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:list-objective-assumptions`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
