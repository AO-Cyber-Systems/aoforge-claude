---
objective: 74-operations-decisions
trd: "04"
subsystem: ci
tags: [ci, branch, pull-request, approval-gate, OPS-01, OPS-03]

requires:
  - objective: 74
    provides: "74-01 (live visual judge) and 74-02 (Cloudflare deploy target) code commits"
provides:
  - "Local branch ops/74-ci-operations at 549af350: origin/main (b4a9d870) plus the nine 74-01/74-02 code commits, in a scratch worktree"
  - "PR body at <scratch>/pr-74-body.md (not yet opened)"
affects: [74-05, 74-06, 74-07, 74-08]

key-files:
  created: []
  modified: []

key-decisions:
  - "The new branch's upstream (set to origin/main by git branch) was unset at once, so a bare git push can never target main"
  - "The 74-02 merge commit 5049eb4b appears in the path-filtered log but is a merge of the feat branch and is not picked; only the nine code commits are"

requirements-completed: []

duration: in progress
completed: pending
---

# Objective 74 TRD 04: Carry the CI changes to main on their own branch Summary

**Branch `ops/74-ci-operations` (origin/main plus the nine 74-01/74-02 code commits, 13 files, no `.aoforge/` file and no objective 73 file) is built and tested in a scratch worktree; the push and the pull request wait on two separate approvals.**

## Progress
- [x] Task 1: Build ops/74-ci-operations in a scratch worktree and test it there — (this commit)
- [ ] Task 2: Approval gate: push ops/74-ci-operations — next step: show the user the log and stat, and run `git -C <wt> push -u origin ops/74-ci-operations` once only on the reply `approved`
- [ ] Task 3: Approval gate: open the pull request into main — next step: after Task 2, show the PR body and run the `gh pr create` command once only on the reply `approved`

## Task 1 evidence

- origin/main after `git fetch origin`: `b4a9d87030fbbdfe707514cedbd06601598e4041` (the 3.0.0 release merge)
- Picked, in order (all nine touch only 74-01/74-02 `files_modified` paths; checked with `git show --name-only`):

| Source SHA | New SHA | Subject |
|---|---|---|
| 7a2a07ee | 3ea6dbc3 | test(74-01): add the live visual judge fixtures |
| edccaca6 | 20593855 | test(74-01): add failing test for the credential-less visual judge run |
| bb00d077 | 7481f038 | feat(74-01): assert that the live visual judge really looked |
| f164f8bf | d72ab0fe | test(74-01): hold visual-judge.yml to contents: read |
| 109e0c08 | 945e497b | ci(74-01): run the live visual judge on pushes to main |
| fa4c2f0f | 645c7ce3 | test(74-02): add Cloudflare API fixture builders |
| 62d452f6 | c1a5188d | test(74-02): add failing tests for the Cloudflare deploy-target report |
| f40162a8 | 21aac8b5 | feat(74-02): add the read-only Cloudflare deploy-target report |
| e5f18d2e | 549af350 | ci(74-02): name the Cloudflare deploy target and deploy previews from non-main branches |

- Cross-check: `git log --reverse origin/main..HEAD -- <the 13 paths>` on `feat/stack-profile-loader` lists these nine plus the merge commit 5049eb4b (not picked). The orchestrator's SHA lists and both SUMMARYs agree.
- `git diff --stat origin/main` in the worktree: 13 files, 1516 insertions, 4 deletions: `.github/workflows/{docs,visual-judge}.yml`, `scripts/__fixtures__/{cloudflare-api-fixtures.cjs, visual-judge-rollups.cjs, visual-judge/{docs-home-broken.png, docs-home.png, labels.json, manifest.json}}`, `scripts/{ci-cloudflare-target.cjs, ci-cloudflare-target.test.cjs, ci-visual-judge.cjs, ci-visual-judge.test.cjs, workflow-permissions.test.cjs}`. Nothing under `.aoforge/`, nothing from objective 73.
- No cherry-pick conflict; the commit gate did not intervene.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Build and test the branch | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node --test scripts/ci-visual-judge.test.cjs scripts/ci-cloudflare-target.test.cjs scripts/workflow-permissions.test.cjs` (in the worktree): 43 pass, 0 fail | 0 | PASS |
| 1: rename guard | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`: 20 pass | 0 | PASS |
| 1: CI unit gate | `node --test scripts/ci-unit-gate.test.cjs`: 88 pass | 0 | PASS |
| 1: actionlint | `actionlint .github/workflows/visual-judge.yml .github/workflows/docs.yml` | 0 | PASS |
| 1: nothing pushed | `git push` was never run; the branch has no upstream | n/a | PASS |

## Deviations from Plan

None so far.
