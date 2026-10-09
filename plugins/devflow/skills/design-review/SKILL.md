---
name: design-review
description: |
  Run the ADVISORY UI design-critique sweep on a Flutter surface or objective: capture (or reuse) each declared UI state, critique it against the project design system through the design-critic engine, and present a prioritized design-debt list.
  This is advisory design critique — it NEVER gates. The heavy first-run produces a ranked design-debt backlog whose high-priority items feed the objective-work loop.
  Use when the user wants a design review, design critique, polish pass, or design-debt audit of a UI surface.
  Triggers on: "design review", "design-review", "critique the design", "design debt", "polish pass", "how's the design", "review the UI design"
argument-hint: "[objective number, manifest path, or surface]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:design-review`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:design-review` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:design-review` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
