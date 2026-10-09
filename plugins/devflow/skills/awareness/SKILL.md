---
name: awareness
description: |
  Show cross-repo awareness: peer view (who's working on what in this repo) and org-wide progress (Product Roadmap). Renders both views by default.
  Triggers on: "who else is working on this", "what's in flight", "show org progress", "what are teammates working on".
argument-hint: "[--peer-only|--org-only] [--quarter Q] [--product P] [--refresh [peer|org]] [--no-fetch] [--raw]"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:awareness`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:awareness` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:awareness` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
