---
name: settings
description: |
  Configure which agents run, which AI models they use, and how the workflow behaves.
  Use when the user wants to change AOForge settings or configure workflow behavior.
  Triggers on: "change settings", "configure AOForge", "update settings", "workflow settings"
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:settings`.

`/aoforge:settings` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:settings $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:settings`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
