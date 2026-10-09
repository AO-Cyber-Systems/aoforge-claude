---
name: status
description: |
  Consolidated status/resume/pause/health — `/aoforge:status [resume|pause|check]`.
  Default: show progress + route to next action. Subcommands: check (integrity), pause (save context), resume (restore context). Both flag and bare forms accepted.
  Triggers on: "where are we?", "what's next?", "save my progress", "pick up where we left off".
argument-hint: "[check | pause | resume]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:status`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:status` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:status` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
