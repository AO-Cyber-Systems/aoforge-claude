---
name: ui-eval
description: |
  Run the UI visual-evaluation pipeline on a Flutter surface or objective: capture each declared UI state and score it. Default (no --judge, or --judge labels) is an ADVISORY offline label-echo lookup (no network, no real vision comparison) — it can never clear a surface from human verification. Only --judge live (a real Anthropic vision call) produces a BINDING gate.
  Use when the user wants to visually evaluate, judge, or dogfood a UI surface's rendered states.
  Triggers on: "visual eval", "evaluate the UI", "ui-eval", "judge the screens", "check the visuals", "does this screen look right?"
argument-hint: "[objective number or manifest path]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:ui-eval`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:ui-eval` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:ui-eval` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
