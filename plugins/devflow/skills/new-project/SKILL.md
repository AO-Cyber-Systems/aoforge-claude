---
name: new-project
description: |
  Set up a new project from scratch — asks what you're building, researches the domain, defines requirements, and creates a development roadmap.
  Use when the user wants to start a new project or initialize AOForge for the first time.
  Triggers on: "start a new project", "initialize project", "let's build something new", "set up a new project", "new project"
argument-hint: "[--auto]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:new-project`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:new-project` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:new-project` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
