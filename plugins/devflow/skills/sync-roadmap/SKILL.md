---
name: sync-roadmap
description: |
  Reconcile ROADMAP.md checkbox state against on-disk SUMMARY.md presence. Default: silently corrects drift; --dry-run previews; --interactive prompts per change.
  Triggers on: "sync roadmap", "reconcile roadmap", "fix roadmap drift", "is the roadmap accurate".
argument-hint: "[--dry-run] [--interactive] [--raw]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:sync-roadmap`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:sync-roadmap` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:sync-roadmap` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
