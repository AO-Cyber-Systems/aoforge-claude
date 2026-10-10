---
objective: 74-operations-decisions
trd: "08"
subsystem: ci
tags: [github-rulesets, branch-protection, OPS-02, read-only, re-scope, deferred-ops-03]
status: complete

requires:
  - objective: 74
    provides: "74-07 active ruleset 24829006 on main; 74-05 OPS-01 re-scope to local-only; 74-06 OPS-03 deferral; 74-04 PR #130"
provides:
  - "Read-only proof on 2026-10-10 that ruleset 24829006 ('aoforge: default branch') still governs main and matches .github/rulesets/main.json (compare exit 0)"
  - "Read-only proof that main carries no visual-judge workflow or script (OPS-01 local-only re-scope holds)"
  - "PR #130's read-only state under the ruleset: OPEN, MERGEABLE, CLEAN, required check green, net diff OPS-03 only"
affects: [74-09]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "74-08 re-scoped by the user: PR #130 not merged (it holds only deferred OPS-03 content); Task 1 merge and Task 3 devflow.cloud domain move deferred with OPS-03"
  - "SC1 (CI visual judge on main) recorded as not applicable after the OPS-01 local-only re-scope; SC3 (docs deploy) deferred with OPS-03; SC2 (ruleset) verified read-only"
  - "74-06's deferral treated as satisfying the depends_on wave ordering, as in 74-07"

patterns-established: []

requirements-completed: []

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 4min
completed: 2026-10-10
tokens_input: 2657383
tokens_output: 18055
tokens_cache_read: 2515812
tokens_cache_write: 141509
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 74 TRD 08: Merge and verify on main (re-scoped to read-only ruleset verification) Summary

**Status: complete for its re-scoped scope (`main`'s ruleset verified read-only). The merge of PR #130, the push-to-main docs deploy and the devflow.cloud domain move are deferred with OPS-03. The CI visual judge check does not apply, because OPS-01 is now local-only.**

Ruleset 24829006 ("aoforge: default branch") still governs `main`. It is active, `ruleset-check compare` exits 0 against
`.github/rulesets/main.json`, and `rules/branches/main` lists its four rules (deletion, non_fast_forward, pull_request,
required_status_checks) beside the org's three. `main` is still at b4a9d870 and carries no visual-judge workflow or
script. PR #130 is OPEN, MERGEABLE and CLEAN under the ruleset with its required check green. It was not merged.

This executor made no GitHub or Cloudflare write: GETs only. No push, PR, merge, workflow dispatch, deploy, ruleset
change or secret read. No repository source file changed.

Dependency note: the TRD lists `depends_on: ["74-05", "74-06", "74-07"]`. 74-05 and 74-07 are complete. 74-06 was
deferred by the user (commit ab9f8d24). The preflight did not refuse it. As in 74-07, the deferral is treated as
satisfying the wave ordering. The parts of this TRD that needed 74-06 (the deploy and the domain) are the parts
deferred here.

## Progress
- [x] Task 1: Approval gate: merge the ops pull request into main — DEFERRED with OPS-03, not executed — 66f91cf8
- [x] Task 2: Verify the success criteria on main (ruleset verified read-only; judge not applicable; deploy deferred) — 847e863b
- [x] Task 3: The user decides on moving the docs domain to aoforge-docs — DEFERRED with OPS-03, not executed — af848071

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

## Task 3: domain move, deferred with OPS-03

Not executed and not asked. The TRD's own skip condition holds (Task 2 shows no green production deploy), and the user
deferred the `devflow.cloud` / `www.devflow.cloud` move to `aoforge-docs` together with OPS-03: the aoforge-docs Pages
project does not exist (74-06 deferred). No Cloudflare call of any kind was made and no curl to either domain was run.
The decision is recorded as deferred; it resumes with OPS-03 (todo
`2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: merge gate | (none run: `gh pr merge` not executed by the user's direction) | n/a | DEFERRED with OPS-03 |
| 2: rules on main | `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] \| {type, ruleset_id}]'` | 0 | PASS (4 rules under 24829006 plus the org's 3) |
| 2: ruleset detail | `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets/24829006 --jq '{...}'` | 0 | PASS (active, `~DEFAULT_BRANCH`, bypass `pull_requests_only`) |
| 2: compare | `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` | 0 | PASS (matches; 3 server defaults not counted) |
| 2: main tip | `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main --jq '{sha: .commit.sha, protected}'` | 0 | PASS (b4a9d870, protected) |
| 2: no judge workflow | `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/.github/workflows --jq '.[].name'` | 0 | PASS (no visual-judge.yml) |
| 2: no judge workflow | `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/.github/workflows/visual-judge.yml --jq '.name'` | 1 | PASS (404 expected) |
| 2: no judge script | `gh api repos/AO-Cyber-Systems/aoforge-claude/contents/scripts --jq '[.[].name \| select(test("visual-judge\|cloudflare"))]'` | 0 | PASS (`[]`) |
| 2: PR #130 state | `gh pr view 130 --repo AO-Cyber-Systems/aoforge-claude --json number,title,state,mergeable,mergeStateStatus,...` | 0 | RECORDED (OPEN, MERGEABLE, CLEAN; not merged) |
| 2: PR #130 checks | `gh pr view 130 --repo AO-Cyber-Systems/aoforge-claude --json files,statusCheckRollup` | 0 | RECORDED (all 6 checks SUCCESS; OPS-03 files only) |
| 2: docs deploy | (none run: no merge, no Pages project) | n/a | DEFERRED with OPS-03 |
| 3: domain move | (none run: no Cloudflare call, no curl) | n/a | DEFERRED with OPS-03 |

## Validation Gate Results

The resolved stack profile is `General` with no `gates.task`, and this TRD changed no source file. No gate was
defined, so none was run.

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| (none defined) | n/a | n/a | not applicable |

## Deviations from Plan

### User re-scope (not auto-fixes)

**1. [User re-scope] Task 1 merge not executed**
- **Found during:** Task 1
- **Issue:** The TRD asks to merge PR #130 into main. After 74-05's reverts, the PR holds only OPS-03 content, and the
  user deferred OPS-03.
- **Change:** No merge and no approval prompt. The PR stays open. Recorded as deferred with OPS-03.
- **Commit:** 66f91cf8

**2. [User re-scope] Task 2 limited to the ruleset**
- **Found during:** Task 2
- **Issue:** SC1 and SC3 need runs triggered by a merge that did not happen.
- **Change:** SC2 verified read-only against the current `main`. SC1 is not applicable (OPS-01 local-only; the judge's
  absence from main is confirmed). SC3 is deferred with OPS-03.
- **Commit:** 847e863b

**3. [User re-scope] Task 3 domain move not asked**
- **Found during:** Task 3
- **Issue:** The domain move needs the aoforge-docs Pages project, which 74-06 deferred.
- **Change:** No prompt and no Cloudflare call. Recorded as deferred with OPS-03.
- **Commit:** af848071

### Auto-fixed Issues

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 1/5 as written: the ruleset truth (compare exit 0, the four rules on main). Merge, judge,
  deploy and domain were not failed: the user re-scoped them. The merge and deploy truths moved to OPS-03, the
  domain decision is recorded as deferred, and the judge truth was replaced by the OPS-01 local-only re-scope.
- Gate failures: None
- Requirements: `requirements-completed: []`. OPS-02 was already marked complete by 74-07 and is not marked again
  here. OPS-01 and OPS-03 stay Pending.
- For 74-09: OPS-01 local-only absence check done here (no `visual-judge.yml`, no `scripts/ci-visual-judge*` on
  main). The secret side was not checked. The title of PR #130 still names the live visual judge.

## Self-Check: PASSED

- FOUND: commits 66f91cf8 (Task 1), 847e863b (Task 2), af848071 (Task 3) on feat/stack-profile-loader.
- FOUND: `.github/rulesets/main.json` sha256 `02208b0017425dc1cba59b3acd68255350fa91ae47a3d12ce3f62a87d8a0cb06`, unchanged since 74-03/74-07.
- FOUND: ruleset 24829006 active on main; compare exit 0; four rules under 24829006 on `rules/branches/main`.
- FOUND: no visual-judge workflow or script on main; PR #130 OPEN and unmerged.
- FOUND: todo `.aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md` (the OPS-03 resume point).
- Working tree: only the pre-existing untracked `amp`, never staged.
