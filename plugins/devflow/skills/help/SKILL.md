---
name: help
description: |
  Show available AOForge commands and usage guide.
  Use when the user asks about AOForge capabilities, available commands, or how to use the system.
  Triggers on: "what can you do?", "how do I use AOForge?", "show commands", "aoforge help", "what commands are available?"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:help`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:help` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:help` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
