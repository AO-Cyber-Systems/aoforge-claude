---
name: doctor
description: |
  Diagnose and safely repair AOForge environment problems: a stale runtime mirror, runtime state
  committed or left untracked inside a repo, pending migrations, stale markers, guard state,
  awareness cache and backups, hook registry drift, and out-of-date model ids. Read-only by
  default; `--fix` applies only safe, reversible repairs.
  Use when AOForge behaves oddly, after a plugin update, or when a repo shows .aoforge runtime
  files changing.
  Triggers on: "aoforge doctor", "diagnose aoforge", "aoforge is broken", "fix my aoforge setup"
argument-hint: "[--fix] [--global] [path]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:doctor`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:doctor` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:doctor` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
