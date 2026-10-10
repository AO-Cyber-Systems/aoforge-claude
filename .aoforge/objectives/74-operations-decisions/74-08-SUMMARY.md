---
objective: 74-operations-decisions
trd: "08"
subsystem: ci
tags: [github-rulesets, branch-protection, OPS-02, read-only, re-scope, deferred-ops-03]
status: in-progress
---

# Objective 74 TRD 08: Merge and verify on main (re-scoped to read-only ruleset verification) Summary

Checkpoint in progress. Re-scoped by the user: no merge, no domain move; read-only verification of the `main` ruleset only.

## Progress
- [x] Task 1: Approval gate: merge the ops pull request into main — DEFERRED with OPS-03, not executed — 66f91cf8
- [x] Task 2: Verify the success criteria on main (ruleset verified read-only; judge not applicable; deploy deferred) — (this commit)
- [ ] Task 3: The user decides on moving the docs domain to aoforge-docs — next step: record the domain move as deferred with OPS-03 in this draft (no Cloudflare read or write; no prompt to the user), then `summary checkpoint` and commit

## Task 1: merge gate, deferred with OPS-03

Not executed. The user's direction (relayed by the orchestrator): PR #130 must NOT be merged. After 74-05 reverted the
74-01 judge commits out of `ops/74-ci-operations`, the PR's net diff holds only OPS-03 content (the Cloudflare
deploy-target diagnostic and the `docs.yml` deploy change), and the user deferred OPS-03 (74-06, commit ab9f8d24).
No `gh pr merge` was run, no approval was asked for, and the PR stays open.

## Task 2: read-only verification on main

Ruleset: VERIFIED. Visual judge: NOT APPLICABLE (OPS-01 re-scoped to local-only; confirmed absent from main). Docs deploy: DEFERRED with OPS-03.

Every command below is a GET or a local read. Output is verbatim.

1. `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] | {type, ruleset_id}]'`, exit 0:

   ```
   [{"ruleset_id":11490149,"type":"repository_visibility"},{"ruleset_id":11490149,"type":"repository_delete"},{"ruleset_id":11490149,"type":"repository_transfer"},{"ruleset_id":24829006,"type":"deletion"},{"ruleset_id":24829006,"type":"non_fast_forward"},{"ruleset_id":24829006,"type":"pull_request"},{"ruleset_id":24829006,"type":"required_status_checks"}]
   ```

   The org's three rules (11490149 "Private Repos") plus the four rules of 24829006: identical to the 74-07 after picture.

2. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets/24829006 --jq '{id, name, enforcement, target, source_type, conditions, current_user_can_bypass, bypass_actors, rules}'`, exit 0:

   ```
   {"bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"pull_request"}],"conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}},"current_user_can_bypass":"pull_requests_only","enforcement":"active","id":24829006,"name":"aoforge: default branch","rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"parameters":{"allowed_merge_methods":["merge","squash","rebase"],"dismiss_stale_reviews_on_push":false,"dismissal_restriction":{"allowed_actors":[],"enabled":false},"require_code_owner_review":false,"require_extra_approval_for_unattributed_changes":true,"require_last_push_approval":false,"required_approving_review_count":0,"required_review_thread_resolution":false,"required_reviewers":[]},"type":"pull_request"},{"parameters":{"do_not_enforce_on_create":false,"required_status_checks":[{"context":"test (npm test, gated)","integration_id":15368}],"strict_required_status_checks_policy":false},"type":"required_status_checks"}],"source_type":"Repository","target":"branch"}
   ```

   Enforcement `active`; target `branch`; condition `~DEFAULT_BRANCH`; bypass: repository role 5 (admin) in
   `pull_request` mode only; `current_user_can_bypass`: `pull_requests_only`; required check
   `test (npm test, gated)` from app 15368, not strict.

3. `node /Users/justin/dev/aoforge-claude/scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file /Users/justin/dev/aoforge-claude/.github/rulesets/main.json`, exit 0:

   ```
   ruleset 'aoforge: default branch' (id 24829006) matches /Users/justin/dev/aoforge-claude/.github/rulesets/main.json
   server defaults, not counted: rules.pull_request.parameters.required_reviewers, rules.pull_request.parameters.dismissal_restriction, rules.pull_request.parameters.require_extra_approval_for_unattributed_changes
   ```

4. `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main --jq '{sha: .commit.sha, protected}'`, exit 0:
   `{"protected":true,"sha":"b4a9d87030fbbdfe707514cedbd06601598e4041"}`. `main` is still at the 3.0.0 release merge
   (b4a9d870, "Merge #128"): nothing has been merged since the ruleset was applied, and GitHub reports the branch as `protected`.

5. Visual judge absent from main (OPS-01 re-scope check):
   - `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/.github/workflows --jq '.[].name'`, exit 0:
     ```
     agent-shell-harness.yml
     aoforge-checks.yml
     auto-label-issues.yml
     docs.yml
     release.yml
     test.yml
     ```
   - `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/.github/workflows/visual-judge.yml --jq '.name'`, exit 1:
     `{"message":"Not Found",...,"status":"404"}` (expected: no such file on main).
   - `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/scripts --jq '[.[].name | select(test("visual-judge|cloudflare"))]'`,
     exit 0: `[]` (no `scripts/ci-visual-judge*`, and no Cloudflare target script either, since OPS-03 is unmerged).
   - Not checked: whether an `ANTHROPIC_*` secret exists. 74-05's instruction forbade checking for any secret and this
     re-scope did not ask for it.

6. PR #130, read-only (not merged):
   - `gh pr view 130 --repo AO-Cyber-Systems/aoforge-claude --json number,title,state,mergeable,mergeStateStatus,baseRefName,headRefName,reviewDecision`, exit 0:
     `{"baseRefName":"main","headRefName":"ops/74-ci-operations","mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","number":130,"reviewDecision":"","state":"OPEN","title":"ci: live visual judge and Cloudflare deploy target (objective 74)"}`
   - `gh pr view 130 ... --json files,statusCheckRollup`, exit 0: files `.github/workflows/docs.yml`,
     `scripts/__fixtures__/cloudflare-api-fixtures.cjs`, `scripts/ci-cloudflare-target.cjs`,
     `scripts/ci-cloudflare-target.test.cjs` (OPS-03 only); checks all COMPLETED/SUCCESS: `test (npm test, gated)`
     (Unit suite, the ruleset's required check), `build` (Docs site), CodeQL `Analyze (actions)`,
     `Analyze (javascript-typescript)`, `Analyze (ruby)`, `CodeQL`.
   - `gh pr view 130 ... --json commits`: the five 74-01 commits and their five reverts (b5405aef..5f0e49f7) plus the
     four 74-02 commits, so the net diff is the 74-02 OPS-03 work.
   - Reading: the ruleset now governs this PR. Its required check is green and the merge state is `CLEAN`, so a
     non-admin merge would pass the ruleset. It stays OPEN by the user's direction. The title still names the live
     visual judge, which the PR no longer contains; retitling it is a GitHub write and is left to OPS-03.

Success criteria as re-scoped:

| Criterion | TRD expectation | Result |
| --- | --- | --- |
| SC1 visual judge on main | judge workflow green on the merge push | NOT APPLICABLE: OPS-01 re-scoped to local-only (74-05); no `visual-judge.yml` on main, confirmed |
| SC2 ruleset holds | compare exit 0, four rules on main | VERIFIED: compare exit 0, four rules under 24829006, enforcement active |
| SC3 docs deploy | Docs site deploy green, aoforge-docs.pages.dev 200 | DEFERRED with OPS-03: no merge, so no push-to-main deploy; aoforge-docs.pages.dev not probed (the project was never created, 74-06) |
