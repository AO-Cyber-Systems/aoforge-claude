---
objective: 74-operations-decisions
trd: "05"
subsystem: ci
tags: [ci, visual-judge, OPS-01, re-scope, revert, secrets-not-stored]

requires:
  - objective: 74
    provides: "74-04 branch ops/74-ci-operations and PR #130, with the 74-01 commits already reverted there by the orchestrator"
provides:
  - "OPS-01 re-scoped by the user: the live visual judge runs locally only; no Anthropic credential in GitHub; no CI judge on main"
  - "The 74-01 CI judge removed from feat/stack-profile-loader by five git revert commits, so it can never reach main from this branch"
  - ".aoforge/REQUIREMENTS.md OPS-01 reworded through doc put"
affects: [74-08, 74-09]

key-files:
  created: []
  modified:
    - .aoforge/REQUIREMENTS.md
  deleted:
    - .github/workflows/visual-judge.yml
    - scripts/ci-visual-judge.cjs
    - scripts/ci-visual-judge.test.cjs
    - scripts/__fixtures__/visual-judge-rollups.cjs
    - scripts/__fixtures__/visual-judge/

key-decisions:
  - "OPS-01 stays Pending and requirements-completed is empty: the decision rewrites the requirement but does not itself satisfy it. Verification that no CI judge and no stored credential reach main belongs to 74-08 (after the merge) and 74-09 (close-out)"
  - "Reverts rather than a scoped deletion: all five 74-01 commits reverted cleanly with no conflict, in the order 109e0c08, f164f8bf, bb00d077, edccaca6, 7a2a07ee"
  - "REQUIREMENTS line 74 (out-of-scope credentials list) also changed, from (OPS-01, OPS-03) to (OPS-03; OPS-01 stores none in GitHub), because it would otherwise contradict the reworded OPS-01"

requirements-completed: []

duration: about 10 minutes of execution (no approval wait in this run; the decision was relayed by the orchestrator)
completed: 2026-10-10
tokens_input: 1913121
tokens_output: 15429
tokens_cache_read: 1842338
tokens_cache_write: 70737
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 74 TRD 05: The ANTHROPIC secret and the live judge run, re-scoped to local-only Summary

**The user dropped the CI judge ("Drop the CI judge, that should only be done locally."), so no secret was set and no CI run happened; the 74-01 judge was reverted out of this branch and OPS-01 was reworded to the local-only judge.**

## Progress
- [x] Task 1: The user sets the ANTHROPIC credential as a GitHub Actions secret — re-scoped by the user, no secret set (revert commits d033cc87..9d85fe71, requirement reword 11213e5f)
- [x] Task 2: Approval gate: re-run the live visual judge on the ops pull request — skipped (Task 1 did not end in `done`; there is no CI judge to re-run)

## Task 1 record

User decision, literal words as given to the orchestrator in chat on 2026-10-09: "Drop the CI judge, that should only be done locally."

Recorded as: **OPS-01 re-scoped by the user: the live visual judge runs locally only (`/aoforge:ui-eval --judge live`); no CI secret.** No Anthropic credential goes into GitHub. I did not check for, list or ask about any secret, per the instruction; nothing in this run touched a secret value. Under the TRD's `error_recovery` the user's reply is the decline path, with one difference: it re-scopes the requirement instead of leaving it open.

## Task 2 record

Skipped. Reason: Task 1 did not end in `done`; there is no CI judge to re-run and no `visual-judge.yml` workflow remains on the ops branch.

## Already done by the orchestrator (recorded and verified read-only)

With the user's approval, as the TRD's `error_recovery` decline path, the orchestrator pushed five `git revert` commits of the 74-01 commits to `ops/74-ci-operations`. Verified here without writing anything:

- `git ls-remote origin refs/heads/ops/74-ci-operations` returns `5f0e49f7214fcaf90c6448b9c4d058ab956c0783`.
- `git -C <ops worktree> diff --stat origin/main` lists only `.github/workflows/docs.yml` (22 lines), `scripts/__fixtures__/cloudflare-api-fixtures.cjs` (91), `scripts/ci-cloudflare-target.cjs` (239) and `scripts/ci-cloudflare-target.test.cjs` (282): 4 files, 632 insertions, 2 deletions. No judge file, no `.aoforge/` file.

## Additional work: the CI judge removed from feat/stack-profile-loader

So the judge cannot reach `main` by a later merge of this branch, the same five commits were reverted here.

Before reverting I checked `git log --oneline 109e0c08..HEAD` for the judge paths (only 74-04 docs commits and the 74-02/74-03 merges, none touching them) and searched the repository, hidden directories included, for `ci-visual-judge`, `visual-judge`, `visual-judge-rollups` and `live visual judge`. Code references were confined to the judge's own files and one line in `scripts/workflow-permissions.test.cjs`. `CHANGELOG.md` has no entry announcing a CI judge (its `judge` mentions are the objective 32 visual-eval work, which is the local judge and stays). `package.json`, the rename-guard ALLOW lists and `plugins/` have no reference.

The five reverts applied without conflict:

| Commit | Reverts |
|---|---|
| d033cc87 | ci(74-01): run the live visual judge on pushes to main (`visual-judge.yml`, 70 lines) |
| 6e2d8d15 | test(74-01): hold visual-judge.yml to contents: read (`READ_ONLY_WORKFLOWS` is back to `['test.yml', 'agent-shell-harness.yml']`) |
| 1a6ffacb | feat(74-01): assert that the live visual judge really looked (`ci-visual-judge.cjs`, its test; 605 lines) |
| 354746c0 | test(74-01): add failing test for the credential-less visual judge run |
| 9d85fe71 | test(74-01): add the live visual judge fixtures (rollups helper, two PNGs, `labels.json`, `manifest.json`) |

`git ls-files` for all five paths returns nothing afterwards, and a code search for the names returns nothing under `scripts/`, `.github/`, `plugins/` and `package.json`.

## OPS-01 reworded

Through the planning verbs: `planning draft REQUIREMENTS.md`, edit, `doc put REQUIREMENTS.md --from <draft>` (local mode, wrote `.aoforge/REQUIREMENTS.md`), committed as 11213e5f. New text:

> OPS-01: The live visual judge runs locally only (`/aoforge:ui-eval --judge live`), on the user's own credential; no Anthropic credential is stored in GitHub and no CI judge runs on `main`. Re-scoped by the user on 2026-10-09 (was: the CI `ANTHROPIC` secret configured by the user and the live visual judge running in CI on `main`, objectives 32/33).

Also changed: the out-of-scope line "AOForge entering secrets, tokens or credentials into any system. The user supplies them (OPS-01, OPS-03)." now reads "(OPS-03; OPS-01 stores none in GitHub)". `git diff --stat` after `doc put` showed only that file, 2 insertions and 2 deletions.

**Completion status chosen: OPS-01 stays Pending (checkbox unchecked, traceability row Pending), and `requirements-completed` in this SUMMARY is `[]`.** Why: no convention in this repository marks a re-scoped requirement satisfied by the decision itself, and the reworded requirement has outcomes that can only be verified later: that no `visual-judge` workflow exists on `main` and no Anthropic secret is stored (74-08, after the merge of PR #130). TRD 74-09 already marks only the green requirements complete (`requirements mark-complete OPS-01,OPS-02,OPS-03`, "only the green ones"), so closing OPS-01 there is the natural point. The W065 agreement check only compares a VERIFICATION's SATISFIED rows against SUMMARY lists, and objective 74 has no VERIFICATION yet, so the empty list creates no finding.

## Downstream (TRDs 74-08 and 74-09)

They no longer expect a judge run on `main`. Their judge steps are to be treated as **skipped with reason "OPS-01 re-scoped to local-only, 2026-10-09"**. Their TRD files were not rewritten. What they should check instead for OPS-01: after the merge, `main` has no `.github/workflows/visual-judge.yml`, no `scripts/ci-visual-judge*`, and no repository or organization secret named `ANTHROPIC_*` was added for this repository.

Text left unchanged on purpose (the instruction was to prefer not to), for 74-09's close-out to judge:
- `.aoforge/ROADMAP.md` line 128 (objective 74 title), line 342 (success criterion 1: "The user has set the `ANTHROPIC` secret ... and the live visual judge runs in CI on a push to `main`") and line 348 (the checked 74-01 entry, which still describes `visual-judge.yml` as delivered).
- `.aoforge/PROJECT.md` lines 28 and 170 (the carried-since-v1.3 operations lists).
- The 74-01 SUMMARY still describes the CI judge as built; it is a historical record of what that TRD did, and the reverts here are the later decision.

## Deviations from Plan

### Auto-fixed Issues

None. This TRD declared `files_modified: (none)` and was a pair of user checkpoints; the changes above (five reverts, the REQUIREMENTS edit) were directed by the orchestrator's `additional_work` after the user's decision, not found by me. The one edit beyond the literal instruction is the OPS-01 reference on the credentials line of REQUIREMENTS (Rule 1 consistency fix: it would have contradicted the reworded requirement).

### Authentication gates

None reached. The user declined the credential step, so no gate was presented to them by this run.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: user sets the secret | not run: the TRD's `gh secret list` verify is moot after the re-scope, and the instruction forbade checking for any secret | n/a | RE-SCOPED (recorded) |
| 2: re-run the live judge | not run: skipped, no CI judge exists | n/a | SKIPPED |
| Added: revert the CI judge here | `git ls-files <the five judge paths>` | 0, empty output | PASS |
| Added: ops branch state | `git ls-remote origin refs/heads/ops/74-ci-operations`; `git -C <ops worktree> diff --stat origin/main` | 0 | PASS (tip 5f0e49f7; 4 files, all 74-02) |
| Added: reword OPS-01 | `doc put REQUIREMENTS.md --from <draft>`, then `git diff --stat` | 0 | PASS (1 file, +2/-2) |

## Validation Gate Results

Run with `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL`, after the reverts and before the REQUIREMENTS edit (that edit touches no code):

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| CI scripts | `node --test scripts/workflow-permissions.test.cjs scripts/ci-cloudflare-target.test.cjs scripts/ci-unit-gate.test.cjs` | 0 | PASS, 111 tests, 111 pass, 0 fail, 0 skipped |
| rename guard | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 | PASS, 20 tests, 20 pass, 0 fail |
| doc refs | `node --test plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS, 18 tests, 18 pass, 0 fail |

The full suite was not run (not asked, and not quick). The permissions test now checks 4 things: workflows exist, every workflow declares permissions, `test.yml` and `agent-shell-harness.yml` grant exactly `contents: read`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 0/2 as written. Both belonged to the CI-judge design the user withdrew (a secret named by existence only, and a green live-judge run on the PR). They are replaced by the re-scoped OPS-01, not met or failed.
- Gate failures: None

## Notes

- `?? amp` in `git status` is an untracked file present before this run; it was not touched or committed.
- No push, pull request, merge, workflow dispatch, re-run or deploy was done. No secret value was read, typed or printed. Port 8080 was not used.

## Self-Check: PASSED

- Commits found in `git log`: d033cc87, 6e2d8d15, 1a6ffacb, 354746c0, 9d85fe71, 11213e5f.
- Judge files absent: `git ls-files` on `.github/workflows/visual-judge.yml`, `scripts/ci-visual-judge.cjs`, `scripts/ci-visual-judge.test.cjs`, `scripts/__fixtures__/visual-judge/` and `scripts/__fixtures__/visual-judge-rollups.cjs` returns nothing.
- `.aoforge/REQUIREMENTS.md` OPS-01 carries the re-scoped text (written by `doc put`).
