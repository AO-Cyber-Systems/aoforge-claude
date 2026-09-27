---
objective: 38-doc-auto-correction
kind: plugin
work: feature
status: registered
---

# Objective 38 — Documentation auto-correction

Registered 2026-09-27; plan with `/devflow:plan-objective 38` after objective 36. Source: the
2026-09-27 audit, section A. Depends on objective 36 (`managed-block.cjs`, the upgrade runner and
notices).

## Goal

DevFlow keeps its own documentation, project documentation and global documentation current as it
runs. Stale DevFlow-owned text is corrected automatically, stale project documents are flagged, and
references to renamed commands can't rot unnoticed.

## Scope sketch (the planner re-cuts)

- **Command-reference checker** against the live skill list, plus a rename map (`references/command-renames.json`: `/df:`→`/devflow:`, progress/resume-work/pause-work→status, add-todo/check-todos→todo, add-objective→objective add, `/devflow:health`→`status check`, …).
  - A CI test over the plugin's own agents, skills, workflows, references and CLI fix text.
  - An auto-fix for managed blocks and `.planning/` docs in projects.
- **Staleness advisories:**
  - STACK.md `provenance.reviewed` older than 90 days.
  - STACK.md declared vs detected drift.
  - `codebase/*.md` maps N commits behind HEAD.
  - The STATE.md W002 regex still matching the retired "Phase N" wording.
- **One-time cleanup of DevFlow's own stale docs:**
  - USER-GUIDE retired commands.
  - 11 `/df:` references in `validate.cjs` fix text.
  - The statusline `/df:update` with no cache writer.
  - `/devflow:health` references.
  - `new-project.md` pointing at `/devflow:progress`.
- **Run points:** mechanical fixes through 36's upgrade runner at session start, and advisories in
  `status` and `telemetry`.
