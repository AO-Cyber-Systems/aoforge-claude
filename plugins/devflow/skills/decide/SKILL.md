---
name: decide
description: |
  Resolve a parked decision and resume autonomous execution.
  Use when you see a pending DECISION-NNN.md in .aoforge/decisions/pending/, when the user wants to choose an option for a blocked checkpoint:decision, or when you need to tell the executor which option to take.
  Triggers on: "resolve decision", "decide DECISION-", "pick option for DECISION-", "unblock DECISION-", "answer DECISION-", "choose option for decision", "I want option-a", "go with option-b", "my answer is".
argument-hint: "[<decision-id> <choice>]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:decide`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:decide` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:decide` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
