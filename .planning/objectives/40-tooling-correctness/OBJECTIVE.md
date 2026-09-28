---
objective: 40-tooling-correctness
kind: plugin
work: bugfix
status: registered
gap_closure: v1.3
---

# Objective 40 — Tooling correctness

Registered 2026-09-28 by `/devflow:milestone gaps` from the v1.3 milestone audit.

## Goal

Fix the tooling defects the v1.3 audit and objective 38 execution surfaced.

## Scope sketch (the planner re-cuts)

- `df-tools init milestone-op` returns `milestone_version: v1.1`; v1.2 shipped and v1.3 is current. Derive it correctly from ROADMAP.md / MILESTONES.md.
- `df-tools objective complete <N>` reports success but leaves STATE.md unchanged (seen for 37 and 38).
- Planner / TRD templates emit `rg -nE` — in ripgrep `-E` is `--encoding`, not extended regex. Fix the source templates/agent prose; add a doc-refs-style guard if cheap.
- `workflows/remove-objective.md:16` still says objective numbers may be "integer or decimal" (decimals removed in v1.2).

Source: `.planning/v1.3-MILESTONE-AUDIT.md` (tech debt, tooling).
