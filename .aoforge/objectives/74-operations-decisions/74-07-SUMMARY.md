---
objective: 74-operations-decisions
trd: "07"
subsystem: ci
tags: [github-rulesets, branch-protection, OPS-02, gh-api, approval-gate]
status: checkpoint

requires:
  - objective: 74
    provides: "74-03 .github/rulesets/main.json and scripts/ruleset-check.cjs (compare, checks)"
affects: [74-08]

key-files:
  created: []
  modified: []

requirements-completed: []
---

# Objective 74 TRD 07: Apply the main ruleset (checkpoint, awaiting approval)

**CHECKPOINT, NOT COMPLETE.** Task 1 (read-only proof) is done. Task 2 (the approval gate) is done: the user replied
`approved` and the ruleset was POSTed once (id 24829006). Task 3 (the read-back) is next. OPS-02 stays Pending until
the read-back matches.

Dependency note: the TRD lists `depends_on: ["74-03", "74-06"]`. 74-03 is complete. 74-06 was deferred by the user
(commit ab9f8d24). That dependency is wave ordering only (the ruleset does not need the Pages project), so it is
treated as satisfied-by-deferral. `exec-context check` passed; no pre-check refused on it.

## Progress

- [x] Task 1: Refresh the read-only proof that the required check reports — 5722cbd1
- [x] Task 2: Approval gate: the exact ruleset text, then one POST — (this commit) (reply `approved`; POST run once by the orchestrator; ruleset id 24829006)
- [ ] Task 3: Read the ruleset back and prove it matches — next step: from /Users/justin/dev/aoforge-claude run `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` (expect exit 0), then `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] | {type, ruleset_id}]'` and `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets/24829006 --jq '.current_user_can_bypass'` (all read-only GETs).

## Task 1 evidence (all reads, 2026-10-10)

Rendered from: `/Users/justin/dev/aoforge-claude/.github/rulesets/main.json` on branch `feat/stack-profile-loader` at
HEAD ab9f8d24 (file last changed in f0fd79e8, working tree clean for `.github` and `scripts`). sha256
`02208b0017425dc1cba59b3acd68255350fa91ae47a3d12ce3f62a87d8a0cb06`. The ops branch `ops/74-ci-operations` (worktree
`.../scratchpad/ops-74`, head 5f0e49f7) does not carry this file; it stays on the feature branch until the next
release PR, so the POST must run from the main checkout (or with the absolute path).

1. `gh pr list --repo AO-Cyber-Systems/aoforge-claude --base main --state all`: #130 OPEN (ops/74-ci-operations), #129
   OPEN (feat/stack-profile-loader), #128, #127, #126 MERGED.
2. `node scripts/ruleset-check.cjs checks --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json --prs 130,129,128,127,126` exit 0:
   ```
   #130  5f0e49f  ok       test (npm test, gated)  (reported by app 15368)
   #129  abc18a9  ok       test (npm test, gated)  (reported by app 15368)
   #128  11e98cf  ok       test (npm test, gated)  (reported by app 15368)
   #127  bcd255b  ok       test (npm test, gated)  (reported by app 15368)
   #126  e7dc109  ok       test (npm test, gated)  (reported by app 15368)
   every required check reported on 5 pull request(s)
   ```
   `checks` proves the context reported from the pinned app, not that it passed.
3. `gh pr checks 130`: Analyze (actions) pass, Analyze (javascript-typescript) pass, Analyze (ruby) pass, CodeQL pass,
   build pass, `test (npm test, gated)` pass (4m35s). `gh pr checks 129`: `test (npm test, gated)` FAIL (4m35s), the
   three Analyze jobs and CodeQL pass; no `build` or `harness` (path-filtered). `gh pr checks 128`: Analyze x3, CodeQL,
   build, harness, `test (npm test, gated)` all pass.
4. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets`: one entry, id 11490149 "Private Repos", Organization,
   `target: repository`, active. Detail: rules `repository_visibility` (internal only), `repository_delete`,
   `repository_transfer`; bypass `OrganizationAdmin` always. No repository ruleset.
5. `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main/protection`: HTTP 404 `Branch not protected`. No classic protection.
6. `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main` (the before picture): only the three org rules
   (`repository_visibility`, `repository_delete`, `repository_transfer`, all ruleset_id 11490149). Nothing governs pushes to `main`.
7. `node scripts/ruleset-check.cjs compare ...` exit 1: `no ruleset named 'aoforge: default branch' on AO-Cyber-Systems/aoforge-claude` (baseline).
8. `node --test scripts/ruleset-check.test.cjs`: 16 of 16 pass (RC-11 pins the file's safety properties).
9. Repo settings: default branch `main`, merge commit, squash and rebase all allowed, `delete_branch_on_merge` false,
   current user `admin: true`. No merge queue, no auto-merge dependence.

## Task 2 evidence (approval gate)

- Text shown: the full `.github/rulesets/main.json`, verbatim, at HEAD 5722cbd1. sha256
  `02208b0017425dc1cba59b3acd68255350fa91ae47a3d12ce3f62a87d8a0cb06` (re-verified unchanged before the POST, and again
  by this executor after it).
- The user's reply, literal: `approved`. No variant and no edit was asked for, so the file was not changed.
- The orchestrator ran the POST exactly once, from the main checkout:
  `gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json`
- Result: ruleset id **24829006**, name `aoforge: default branch`, enforcement `active`, target `branch`, source
  `Repository`, created 2026-10-09T23:44:45.856-04:00.
- URL (`_links.html.href`, read with a GET): https://github.com/AO-Cyber-Systems/aoforge-claude/rules/24829006
- Task verify `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets --jq '.[] | select(.name == "aoforge: default branch") | .id'`
  exit 0: `24829006` (exactly one ruleset with that name).
- GET of the ruleset: rules `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`; conditions
  `ref_name.include: ["~DEFAULT_BRANCH"]`, `exclude: []`; bypass `RepositoryRole` 5 in `pull_request` mode.
- This executor made no ruleset write: GETs only.

## Commands run at the gate

POST (once, after `approved`, by the orchestrator):

```
gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json
```

Read-back:

```
node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json
gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] | {type, ruleset_id}]'
gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets/<id> --jq '.current_user_can_bypass'
```

Rollback (its own approval, never automatic):

```
gh api --method DELETE repos/AO-Cyber-Systems/aoforge-claude/rulesets/<id>
```

## Impact notes (read-only investigation)

**a. PR #130 (ops/74-ci-operations, head 5f0e49f7).** Files: `.github/workflows/docs.yml`,
`scripts/ci-cloudflare-target.cjs`, its test and fixtures (OPS-03 content only). Today `MERGEABLE`, `CLEAN`. All six
checks are green, including `test (npm test, gated)` from app 15368. With the ruleset: it is a pull request (the PR rule
is met, 0 approvals), the one required context is present and SUCCESS on the head, and the rule is not strict so it need
not be up to date with `main`. It stays mergeable with no bypass. `build` and `harness` are not required, so nothing
waits on them. Merging it triggers the `docs.yml` push-to-main deploy, which the ruleset does not touch; that deploy is
the OPS-03 work 74-06 deferred.

**b. PR #129 / the feat/stack-profile-loader merge.** Remote head abc18a9f (the branch is 128 commits ahead locally,
unpushed). The unit suite on abc18a9f is red: 11964 tests reported, 2 failures. E2E1 (reconcile drift) is not in
`.github/known-test-failures.json` and fails the gate; PW-9 (powershell exit 7) is quarantined there and does not. Today
#129 is `UNSTABLE` (mergeable, a non-required check failing). With the ruleset `test (npm test, gated)` becomes required,
so #129 turns `BLOCKED` until the suite is green or an admin merges with `gh pr merge 129 --admin`. Also on LOCAL HEAD
ab9f8d24, E2E1 still fails: the ROADMAP line for 74-06 is `[ ]` while `74-06-SUMMARY.md` exists (the deferral), so
reconcile reports `trd_summary_exists`. This checkpoint's own SUMMARY adds the same drift for 74-07 until the roadmap
line is ticked or the SUMMARY is posted at completion. Nothing was fixed here.

**c. Release path and bypass.** Every first-parent commit on `origin/main` for the last 15 is a GitHub PR merge
(#107 to #128), so releases already go through pull requests and the ruleset matches practice. `release.yml` runs on tag
push `v*`, has `contents: write`, and only runs `gh release create`; it never pushes to `main`. No workflow runs
`git push`, commits to `main` or merges. `site/content/docs/guides/releases.md` ("A release, end to end") says commit
`chore(release)` then push with `--follow-tags`: that works from a release branch and PR (the practice), and would be
rejected if run on `main`, since the ruleset requires a PR. Tags are unaffected (the rule targets branches).
`plugins/aoforge/aoforge/workflows/complete-milestone.md` merges into local `main` and pushes only the tag, and is
generic user-project guidance rather than this repo's process. The only bypass actor is repository admin
(RepositoryRole 5) in `pull_request` mode: it can merge a PR past failing checks (`gh pr merge --admin`) but cannot
push to `main` directly or force-push. No App or other bypass exists. The org "Private Repos" ruleset is separate and
untouched (bypass OrganizationAdmin always, applies to repository settings, not branches).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: refresh the proof | `node scripts/ruleset-check.cjs checks ... --prs 130,129,128,127,126` | 0 | PASS |
| 1: before picture | `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main` | 0 | PASS (org rules only) |
| 1: no ruleset yet | `node scripts/ruleset-check.cjs compare ...` | 1 | PASS (expected baseline) |
| 1: record test | `node --test scripts/ruleset-check.test.cjs` | 0 | PASS (16 of 16) |
| 2: approval gate | `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets --jq '.[] \| select(.name == "aoforge: default branch") \| .id'` | 0 | PASS (`24829006`; reply `approved`) |

## Deviations from Plan

None. The only write is this checkpoint SUMMARY (a runtime draft published with `summary checkpoint`).

## Authentication gates

None.
