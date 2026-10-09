---
name: discuss-objective
description: |
  Capture implementation decisions for an objective before planning — lock in preferences so research and planning don't drift into assumptions.
  Use when the user wants to shape how an objective gets built before tasks are generated.
  Triggers on: "discuss objective", "shape the objective", "lock in preferences", "before planning I want to discuss", "implementation decisions"
argument-hint: "<objective-number>"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:discuss-objective`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:discuss-objective` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:discuss-objective` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
