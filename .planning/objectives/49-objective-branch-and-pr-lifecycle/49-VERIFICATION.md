---
objective: 49-objective-branch-and-pr-lifecycle
verified: 2026-10-01T00:00:00Z
status: passed
score: 4/4 success criteria verified
---

# Objective 49: Objective branch and PR lifecycle - Verification Report

**Goal:** every objective runs on one linked branch and ends in one pull request that closes the objective and all its TRDs on merge.
**Status:** passed

## Success criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Fixture objective yields exactly one PR whose closes match TRD issues | VERIFIED | `gh-pr-e2e.test.cjs` and `gh-pr.test.cjs` pass. `reconcile` compares `Closes #N` in the PR body with the mapped TRD issues (`gh-pr.cjs` ~L476). |
| 2 | Wave worktrees merge into the objective branch, no extra PRs | VERIFIED | `objective-branch.cjs` plus the e2e test. `Refs #trd` trailers come from `commit-trailer.cjs`. |
| 3 | A non-assignee scope comment is not applied until confirmed | VERIFIED | `scopeAcceptance` and `devflow:scope-confirm` in `gh-trd.cjs` / `gh-comments.cjs`. Covered by tests. |
| 4 | `npm test` green | VERIFIED, with one environmental exception | 7885 tests, 1 failing: `handoff-e2e` MA-7. See below. |

Targeted run: `gh-pr`, `gh-pr-cli`, `gh-pr-e2e`, `gh-pr-reconcile`, `init-pr-lifecycle` and `pr-lifecycle-prose.repo` give 135 pass, 0 fail.

## Requirements coverage

All six IDs (GPR-01 to GPR-06) are declared across the 15 TRD frontmatters and defined in OBJECTIVE.md. No orphans. Code evidence:

- GPR-01: `gh-pr.cjs` `pr start`.
- GPR-02: `commit-trailer.cjs` and `objective-branch.cjs`.
- GPR-03: `devflow/verification` status, the ready-for-review step and the wiki diff, in `gh-outbox-flush.cjs`.
- GPR-04: `mergeObjectivePr` and `reconcile` in `gh-pr.cjs`.
- GPR-05: `scopeAcceptance`.
- GPR-06: `init.cjs` `branching_strategy_ignored`, plus the `complete-milestone.md` skip step.

## Adopted decisions

| Decision | Status | Evidence |
|---|---|---|
| Commit status `devflow/verification`, not a check run | OK | `VERIFICATION_CONTEXT` in `gh-pr.cjs`; `post-status` op in `gh-outbox-flush.cjs` |
| `pr start` requires online | OK | `gh-pr.cjs` L237-263: fails with "needs to be online; nothing was changed" |
| `in_progress` label | OK | `gh-comments.cjs`: `github.labels.in_progress`, default `devflow:in-progress` |
| Freeze at start | OK | `gh-pr.cjs` L309-317 `freezeTrd` |
| Squash merge by default, configurable | OK | `DEFAULT_MERGE_METHOD='squash'`, `github.pr.merge_method` |
| Reconcile closes stragglers | OK | `gh-pr.cjs` L762-792 |
| `branching_strategy` replaced in store mode only | OK | `init.cjs` L346-366: store adds `branching_strategy_ignored`; local adds a `deprecations` entry only |
| Objective issue closes on merge, not at verify-pass | OK | `planning-verbs.cjs` L513 `close_deferred` |

## D-01 store-off parity

Store-off behaviour is unchanged. `init.cjs` keeps the local value of `branching_strategy`, and local mode only gains a `deprecations` entry. `pr start|merge` skip when the store is off (exit 0). `planning-verbs` `objective set-status` takes the LOCAL path with `writeThrough`, which makes no `gh` call. The parity tests in `gh-pr-e2e` and `init-pr-lifecycle` pass.

## Known failing test: MA-7 (not an objective 49 gap)

`handoff-e2e.test.cjs` MA-7 invokes the real `/opt/homebrew/bin/doctl`. I checked out a22397a3 (before any objective 49 execution commit) in a temporary `git worktree`, with the repo `node_modules` symlinked in for node-pty. MA-7 also fails there. No objective 49 commit touches handoff, daemon or PTY files. Classification: pre-existing and environmental. The worktree and symlink were removed afterwards.

## Anti-patterns and other notes

No blockers found. Deployment verification: not_available (the fake-gh harness is the only environment, and no real GitHub was touched). Not a UI objective, so Step 8 was skipped.
