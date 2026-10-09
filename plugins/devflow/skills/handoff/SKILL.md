---
name: handoff
description: |
  Hand off a TTY-required or shell-env-dependent command to the user's shell.
  Use for auth flows (gh auth login, doctl auth init, npm login) or shell-init commands (nvm/mise/conda activate, direnv). Non-disruptive when aoforge-watch is running.
  Triggers on: "auth init", "log in to", "needs my password", "needs my shell environment".
argument-hint: "<command to run interactively or via user shell>"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:handoff`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:handoff` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:handoff` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
