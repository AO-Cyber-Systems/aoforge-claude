---
name: workstreams
description: |
  Run independent objectives in parallel using git worktrees, then merge results back.
  Subcommand-style: /aoforge:workstreams setup | status | merge | run
  Advanced parallel execution — use only when explicitly requested.
argument-hint: "<setup|status|merge|run> [args...]"
disable-model-invocation: true
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:workstreams`.

`/aoforge:workstreams` runs only when the user types it, so the Skill tool cannot start it: do not try. Tell the user to type `/aoforge:workstreams $ARGUMENTS` to run it, and do nothing else.

If Claude Code does not know `/aoforge:workstreams`, the AOForge plugin is not installed. Tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
