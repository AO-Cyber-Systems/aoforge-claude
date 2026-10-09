---
name: verify-work
description: |
  Test what was built by walking through expected behavior and checking it matches reality.
  Use when the user wants to test, verify, or validate what was built in an objective.
  Triggers on: "test what we built", "verify objective", "check the work", "UAT", "does it work?", "let's test", "validate the implementation"
argument-hint: "[objective number, e.g., '4']"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:verify-work`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:verify-work` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:verify-work` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
