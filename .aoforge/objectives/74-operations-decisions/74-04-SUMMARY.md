---
objective: 74-operations-decisions
trd: "04"
subsystem: ci
tags: [ci, branch, pull-request, approval-gate, OPS-01, OPS-03]

requires:
  - objective: 74
    provides: "74-01 (live visual judge) and 74-02 (Cloudflare deploy target) code commits"
provides:
  - "Remote branch ops/74-ci-operations (tip 5f0e49f7) and open PR #130 into main: https://github.com/AO-Cyber-Systems/aoforge-claude/pull/130"
  - "The 74-02 Cloudflare deploy-target script, its fixtures and the docs.yml change, on a branch that carries no .aoforge/ file and no objective 73 file"
  - "First PR check outcomes recorded (see Task 3 evidence) for TRDs 74-05 and 74-06"
affects: [74-05, 74-06, 74-07, 74-08]

key-files:
  created: []
  modified: []

key-decisions:
  - "The new branch's upstream (set to origin/main by git branch) was unset at once, so a bare git push can never target main"
  - "The 74-02 merge commit 5049eb4b appears in the path-filtered log but is a merge of the feat branch and is not picked; only the nine code commits are"

requirements-completed: []

duration: approval-gated across two orchestrator-run gates (no single wall-clock figure)
completed: 2026-10-10
tokens_input: 3094263
tokens_output: 28376
tokens_cache_read: 2909317
tokens_cache_write: 184868
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 74 TRD 04: Carry the CI changes to main on their own branch Summary

**Branch `ops/74-ci-operations` was built from origin/main plus the nine 74-01/74-02 code commits, tested in a scratch worktree, pushed and opened as PR #130 into main after two separate user approvals; a later 74-05 decision then reverted the 74-01 commits on the branch, so the tip `5f0e49f7` now differs from main by only the four 74-02 files.**

## Progress
- [x] Task 1: Build ops/74-ci-operations in a scratch worktree and test it there — 0bb5bf1b
- [x] Task 2: Approval gate: push ops/74-ci-operations — (this commit)
- [x] Task 3: Approval gate: open the pull request into main — (this commit)

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
- `git diff --stat origin/main` in the worktree at 549af350: 13 files, 1516 insertions, 4 deletions: `.github/workflows/{docs,visual-judge}.yml`, `scripts/__fixtures__/{cloudflare-api-fixtures.cjs, visual-judge-rollups.cjs, visual-judge/{docs-home-broken.png, docs-home.png, labels.json, manifest.json}}`, `scripts/{ci-cloudflare-target.cjs, ci-cloudflare-target.test.cjs, ci-visual-judge.cjs, ci-visual-judge.test.cjs, workflow-permissions.test.cjs}`. Nothing under `.aoforge/`, nothing from objective 73.
- No cherry-pick conflict; the commit gate did not intervene.

## Task 2 evidence (push gate)

- User reply, as relayed by the orchestrator: `approved` (the user approved the push). The orchestrator ran `git push -u origin ops/74-ci-operations` once; it pushed `549af350`. I did not run it.
- Verified read-only after the fact:
  - `git ls-remote origin refs/heads/ops/74-ci-operations` returns `5f0e49f7214fcaf90c6448b9c4d058ab956c0783`.
  - `git merge-base --is-ancestor 549af350 5f0e49f7` (in the scratch worktree) exits 0, so the pushed Task-2 tip is an ancestor of the current tip.
- The remote tip is `5f0e49f7`, not `549af350`, because of the 74-05 reverts described under "Later change to the branch" below.

## Task 3 evidence (pull request gate)

- User reply, as relayed by the orchestrator: `approved` (the user approved the PR). The orchestrator ran `gh pr create` once and opened PR #130. I did not run it.
- `gh pr view 130 --json ...` (read-only):
  - number 130, state OPEN, isDraft false
  - url https://github.com/AO-Cyber-Systems/aoforge-claude/pull/130
  - base `main`, head `ops/74-ci-operations`, headRefOid `5f0e49f7214fcaf90c6448b9c4d058ab956c0783` (equals the remote tip above)
  - title "ci: live visual judge and Cloudflare deploy target (objective 74)"
- `gh pr checks 130` at 2026-10-10T03:25Z (exit 8, because two checks were still pending; outcomes only):

| Check | Outcome | Duration |
|---|---|---|
| CodeQL | skipping | 2s |
| test (npm test, gated) | pending | 0 |
| Analyze (actions) | pass | 38s |
| build | pass | 13s |
| Analyze (javascript-typescript) | pending | 0 |
| Analyze (ruby) | pass | 51s |

- No check named "live visual judge" is listed. That is consistent with the 74-05 reverts, which removed `visual-judge.yml` from the branch.
- Not captured: the "cloudflare target:" lines from the Docs run. The resume instructions for this continuation allowed only `git ls-remote`, `merge-base`, `gh pr view` and `gh pr checks`, so I did not run `gh run view --log`. The check list also has no check named "Docs site build"; `build` (run 38020394881) is the closest, and this run did not tie it to a workflow. The unit suite (`test (npm test, gated)`) and one CodeQL analysis were still pending when read. 74-05 or 74-06 should re-read `gh pr checks 130` and take the "cloudflare target:" lines from the docs.yml run.

## Later change to the branch (74-05's outcome, not a 74-04 deviation)

A separate user decision recorded under TRD 74-05 re-scoped OPS-01: the live visual judge runs locally only, with no CI secret. After PR #130 opened, the orchestrator pushed five `git revert` commits of the 74-01 commits to the same branch, so the tip moved from `549af350` to `5f0e49f7`:

| Revert SHA | Subject |
|---|---|
| b5405aef | Revert "ci(74-01): run the live visual judge on pushes to main" |
| 24668d04 | Revert "test(74-01): hold visual-judge.yml to contents: read" |
| d4c53dca | Revert "feat(74-01): assert that the live visual judge really looked" |
| c2382691 | Revert "test(74-01): add failing test for the credential-less visual judge run" |
| 5f0e49f7 | Revert "test(74-01): add the live visual judge fixtures" |

Read-only checks at the new tip: `git diff --name-only origin/main 5f0e49f7` lists exactly `.github/workflows/docs.yml`, `scripts/__fixtures__/cloudflare-api-fixtures.cjs`, `scripts/ci-cloudflare-target.cjs` and `scripts/ci-cloudflare-target.test.cjs`. The orchestrator reported 23/23 tests passing there; I did not re-run them. The PR body written in Task 1 still describes a live visual judge job; the orchestrator owns any edit to it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Build and test the branch | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node --test scripts/ci-visual-judge.test.cjs scripts/ci-cloudflare-target.test.cjs scripts/workflow-permissions.test.cjs` (in the worktree at 549af350): 43 pass, 0 fail | 0 | PASS |
| 1: rename guard | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`: 20 pass | 0 | PASS |
| 1: CI unit gate | `node --test scripts/ci-unit-gate.test.cjs`: 88 pass | 0 | PASS |
| 1: actionlint | `actionlint .github/workflows/visual-judge.yml .github/workflows/docs.yml` | 0 | PASS |
| 1: nothing pushed | `git push` was never run in Task 1; the branch had no upstream | n/a | PASS |
| 2: remote branch exists | `git ls-remote origin refs/heads/ops/74-ci-operations` returns `5f0e49f7214fcaf90c6448b9c4d058ab956c0783` | 0 | PASS |
| 2: pushed tip is an ancestor | `git -C <wt> merge-base --is-ancestor 549af350 5f0e49f7` | 0 | PASS |
| 3: PR is open | `gh pr view 130 --repo AO-Cyber-Systems/aoforge-claude --json number,state,url,headRefName,baseRefName,headRefOid,isDraft`: OPEN, base main, head ops/74-ci-operations, headRefOid 5f0e49f7 | 0 | PASS |
| 3: first checks recorded | `gh pr checks 130 --repo AO-Cyber-Systems/aoforge-claude`: 3 pass, 1 skipping, 2 pending (see table) | 8 (pending checks) | PARTIAL: outcomes recorded; two pending, "cloudflare target:" lines not read |

## Validation Gate Results

No source file in the main checkout changed in this TRD (the work was a scratch worktree plus two orchestrator-run GitHub operations), so the stack task gates have nothing to run here. The gates run in the worktree at Task 1 are the Task Evidence rows above.

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (branch) | the three `node --test` files above, in the worktree | 0 | PASS |
| lint (workflows) | `actionlint` on both workflows, in the worktree | 0 | PASS |
| stack gates in the main checkout | not run | n/a | not_available (no source change) |

## Deviations from Plan

None. The two approval gates were executed by the orchestrator on the user's explicit approvals, and this continuation verified them read-only, as instructed. The 74-05 reverts are recorded above as that TRD's outcome.

Gaps recorded rather than hidden:
- The "cloudflare target:" lines and a settled result for the unit suite and the JavaScript CodeQL analysis were not captured (see Task 3 evidence).
- `requirements-completed` is left empty. This TRD is the delivery path for OPS-01 and OPS-03; neither is satisfied until the PR merges (TRD 74-08) and OPS-01 was re-scoped by 74-05.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/4. The branch contents, the tests and the approved-push-then-approved-PR sequence are verified (the sequence from the orchestrator's record, the results from the commands above). The fourth, the first checks with the "cloudflare target:" lines, is partial.
- Note on the first must-have: "differs from main by exactly the 74-01 and 74-02 files" held at Task 1 (13 files). At the current tip it is the four 74-02 files, after 74-05's reverts.
- Gate failures: None

## Self-Check: PASSED

- FOUND commit 0bb5bf1b (`git cat-file -t` returns commit)
- FOUND commit 549af350 (`git cat-file -t` returns commit)
- FOUND commit 5f0e49f7 (`git cat-file -t` returns commit)
- FOUND remote ref `refs/heads/ops/74-ci-operations` at 5f0e49f7214fcaf90c6448b9c4d058ab956c0783
- FOUND PR #130, state OPEN, head ops/74-ci-operations, base main
