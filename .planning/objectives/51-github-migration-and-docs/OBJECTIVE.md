---
objective: 51-github-migration-and-docs
kind: plugin
work: feature
status: registered
milestone: v1.4
depends_on: Objective 50
---

# Objective 51 — GitHub migration and docs

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

Existing DevFlow projects move to GitHub as the system of record in place, and the documentation describes the new model.

## Requirements

- **GMD-01** `upgrade` migration (confirm): backfill existing objectives/TRDs/decisions/todos to issues and reference docs to wiki pages, paced within rate limits and resumable; then switch the project to the cache model.
- **GMD-02** Dry-run shows the full backfill plan and request count before anything is written.
- **GMD-03** USER-GUIDE and CLAUDE.md rewritten for the GitHub model; `/devflow:gh-sync` repurposed or retired; doc-refs updated.
- **GMD-04** Objective 26 (auto-build monitor) re-based on objectives 47 and 49 or killed; decision recorded.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. Backfill of a fixture with 20 objectives completes under the secondary limits and resumes after interruption.
2. Re-running the migration is a no-op.
3. Docs pass the doc-refs test; `npm test` green.
