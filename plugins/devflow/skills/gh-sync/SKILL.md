---
name: gh-sync
description: |
  Operate the GitHub store, where GitHub is the system of record once `github.store` is on: migrate a project onto it (dry run first, then explicit approval), show store status, flush the outbox, pull the cache, set the repository up, generate release notes. With the store off, mirror objectives to GitHub issues.
  Triggers on: "migrate to github", "move planning to github", "github store", "flush the outbox", "sync to github", "push objectives to github", "github release notes", "sync objective".
argument-hint: "[migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:gh-sync`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:gh-sync` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:gh-sync` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
