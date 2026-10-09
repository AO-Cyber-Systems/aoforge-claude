---
objective: 49-objective-branch-and-pr-lifecycle
kind: plugin
work: feature
status: registered
milestone: v1.4
depends_on: Objective 48
---

# Objective 49 — Objective branch and PR lifecycle

Registered 2026-09-30. Part of the GitHub system-of-record plan (objectives 46–51); design in
`docs/PROPOSAL-github-system-of-record.md`.

## Goal

Every objective runs on one linked branch and ends in one pull request that closes the objective and all its TRDs on merge.

## Requirements

- **GPR-01** Execute start creates the objective branch via `createLinkedBranch` / `gh issue develop` and opens a draft PR with `Closes #obj` and every TRD, plus the pinned wiki revision.
- **GPR-02** Wave worktrees branch from and merge back into the objective branch; commits carry `Refs #trd` trailers.
- **GPR-03** TRD completion updates TRD status and posts SUMMARY; verify pass posts the check run, marks the PR ready, and posts the objective's wiki diff to the PR.
- **GPR-04** After merge (queue where supported), reconcile: issues closed, Project → Done, branch deleted, cache pulled.
- **GPR-05** Scope changes during execution are accepted only from the objective's assignee or DevFlow; others are shown, pending assignee confirmation.
- **GPR-06** Replaces local-only `git.branching_strategy`; complete-milestone no longer merges branches locally.

## Constraints

- Design source: `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30; do not re-litigate).
- Strict TDD (kind plugin/cli): failing test committed first.
- Tests mock `gh` via `_setRunGh` / temp dirs and env overrides; never call the real GitHub API or touch the real `~/.claude`.
- Never use port 8080.

## Success Criteria

1. A fixture objective produces exactly one PR whose closing references match its TRD issues.
2. Parallel wave worktrees merge into the objective branch with no extra PRs.
3. A scope comment from a non-assignee is not applied until confirmed.
4. `npm test` green.
