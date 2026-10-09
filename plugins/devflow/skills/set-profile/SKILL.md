---
name: set-profile
description: |
  Switch between quality, balanced, and budget model profiles to control cost and capability.
  Use when the user wants to change the AI model tier for AOForge agents.
  Triggers on: "change profile", "switch to quality", "switch to balanced", "switch to budget", "set profile"
argument-hint: "<profile>"
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:set-profile`.

`/aoforge:set-profile` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:set-profile $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:set-profile`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
