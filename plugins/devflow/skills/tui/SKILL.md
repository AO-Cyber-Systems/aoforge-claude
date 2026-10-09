---
name: tui
description: |
  Open the program-aware TUI viewer — read-only terminal UI showing parallel sessions, org tree, and active initiatives in three stacked panels. tmux-safe; reflows narrow terminals.
  Triggers on: "open tui", "show tui", "what's running across sessions", "show org tree".
argument-hint: "[--once] [--raw] [--no-color] [--reset-only]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:tui`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:tui` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:tui` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
