---
name: cleanup
description: |
  Archive old objective directories from completed milestones to reduce clutter.
  Moves completed work to the milestones archive — use only when explicitly requested.
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:cleanup`.

`/aoforge:cleanup` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:cleanup $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:cleanup`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
