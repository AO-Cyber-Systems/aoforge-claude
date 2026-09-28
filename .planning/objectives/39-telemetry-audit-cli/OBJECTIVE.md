---
objective: 39-telemetry-audit-cli
kind: plugin
work: bugfix
status: registered
gap_closure: v1.3
---

# Objective 39 — Wire the telemetry & audit CLI

Registered 2026-09-28 by `/devflow:milestone gaps` from the v1.3 milestone audit.

## Goal

`df-tools context`, `session-audit`, `transcript-export` and `override` are reachable from the CLI, each backed by its existing, already-tested lib module. Today they return "Unknown command" although CLAUDE.md and `references/context-discipline.md:99` document them as live.

## Scope sketch (the planner re-cuts)

- Dispatch cases + HELP_TABLE entries for the four commands, mirroring `telemetry` (wired in 38-11, `df-tools.cjs` ~line 803).
- `context-audit.cjs` is fully orphaned; `session-audit.cjs` only reached via `transcript-export.cjs`; `override.recordOverride` has no caller outside its test.
- CLI-level tests (shell out to df-tools), not lib-only — lib-only tests are how this shipped invisibly.
- A dispatch-completeness test: every df-tools command named in CLAUDE.md and every HELP_TABLE entry dispatches.
- Re-baseline objective 29's acceptance metric (`read_share_pct`) once `df-tools context` runs.
- CLAUDE.md hook inventory: `inject-org-context.js` / `inject-handoff-results.js` are DRAFT and unregistered — say so.

Source: `.planning/v1.3-MILESTONE-AUDIT.md` (integration gap).
