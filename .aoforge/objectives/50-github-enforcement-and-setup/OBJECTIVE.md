---
objective: 50-github-enforcement-and-setup
kind: plugin
work: feature
status: registered
milestone: v1.4
depends_on: Objective 49
---

# Objective 50 — GitHub enforcement and setup

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

The branch and PR discipline is enforced locally and on GitHub, and one command sets a repository up for it.

## Requirements

- **GEN-01** `df-tools commit` refuses the default branch and branches with no linked issue; adds the trailer; escape `DEVFLOW_SKIP_GH_GATE=1` logged via `df-tools override`.
- **GEN-02** Post-commit and Stop hooks flush the outbox and report drift; never block on network failure.
- **GEN-03** `validate health` / `doctor` report unsynced writes, orphaned issues, missing links, frozen-body drift.
- **GEN-04** `df-tools gh setup`: default-branch ruleset (PR required, no force-push/deletion, merge queue where supported); required checks `devflow/linked-issue` and `devflow/planning-consistency`; issue types and fields; labels; PR template; `merge_group` triggers; wiki enabled/initialized check; degraded-mode detection. Dry-run by default.
- **GEN-05** Reusable Actions workflow implementing the two required checks and the merge-time reconcile, authenticated as the org GitHub App (owned by platform/ops in AOCyberAI-Ops).

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. A commit on the default branch or an unlinked branch is refused locally; the escape is logged.
2. `gh setup --dry-run` prints the exact rulesets/types/fields it would create; apply is idempotent.
3. The linked-issue check fails a PR without a closing reference.
4. `npm test` green.
