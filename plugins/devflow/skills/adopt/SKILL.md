---
name: adopt
description: |
  Turn an existing repository into an AOForge project, unattended: map the code, infer PROJECT.md
  and STACK.md, scaffold config/STATE/ROADMAP, add the CLAUDE.md block, and make one recorded
  change on an aoforge/adopt branch. Never asks a question — uncertain inferences are written down
  with their confidence and evidence for review.
  Use when the user has an existing repository they want AOForge set up in, without answering
  setup questions themselves.
  Triggers on: "adopt this repo", "set up aoforge here", "bootstrap this repo"
argument-hint: "[path]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:adopt`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:adopt` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:adopt` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
