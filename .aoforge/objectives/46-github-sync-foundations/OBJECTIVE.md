---
objective: 46-github-sync-foundations
kind: plugin
work: bugfix
status: registered
milestone: v1.4
depends_on: none
---

# Objective 46 — GitHub sync foundations

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

The existing GitHub sync is correct, idempotent and rate-safe, so the authoritative store can be built on it.

## Requirements

- **GSF-01** Mapping schema v3 in `.planning/.gh-mapping.json`, keyed by a stable DevFlow id (`46`, `46-02`), one shape for every reader and writer (`sync-objectives`, `sync`, `comment`, `close-issue`, `pull`, sync-state). Migration from v1 and v2 shapes, idempotent.
- **GSF-02** Stable `<!-- devflow:id=… -->` marker in every DevFlow-written issue body and comment; lookup falls back to searching the marker so a lost mapping never recreates issues.
- **GSF-03** Post-execute sync in `workflows/execute-objective.md` passes the objective dir and surfaces failures (no `2>/dev/null`).
- **GSF-04** `sync-objectives` writes `github_issue` back into OBJECTIVE.md frontmatter.
- **GSF-05** Milestone resolved from the current milestone (not the first `vX.Y` in ROADMAP); cache invalidates when the milestone changes.
- **GSF-06** One body builder with DevFlow-managed marked sections; text outside them is preserved on update.
- **GSF-07** Project and field IDs discovered from GitHub (GraphQL) per `org_project`, cached with TTL; test fixture no longer read at runtime; iteration/quarter options not hardcoded.
- **GSF-08** `gh` client: paces writes (≤ 1/s), retries with backoff on secondary limits honouring `retry-after`, paginates comments; `github.enabled:false` disables every write command; legacy commands exit non-zero on `ok:false`.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. After `gh sync` writes an entry, `sync-objectives`, `comment`, `close-issue` and `pull` all resolve the same issue (end-to-end push → pull test).
2. Deleting `.gh-mapping.json` and re-running sync creates no duplicate issues.
3. A human edit outside the managed section survives two consecutive syncs.
4. A mocked 403 secondary-limit response is retried after `retry-after`; no concurrent writes.
5. Execute-objective's sync step runs against a fixture and a failure is reported, not swallowed.
6. `npm test` green, apart from the one pre-existing environmental failure recorded at baseline: `MA-7 doctl auth init` in `handoff-e2e.test.cjs` (46-RESEARCH.md, "Baseline"). Any other failure is a regression.
