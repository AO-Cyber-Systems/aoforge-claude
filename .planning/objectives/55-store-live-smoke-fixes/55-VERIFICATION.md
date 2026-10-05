---
objective: 55-store-live-smoke-fixes
verified: 2026-10-05T13:00:00Z
status: passed
score: 7/7 must-haves verified
gaps: []
---

# Objective 55: Store live-smoke fixes Verification Report

**Objective Goal:** Fix what the first live store-mode smoke found against real GitHub, then re-run the live smoke.
**Status:** passed
**Re-verification:** No

## Observable Truths (OBJECTIVE.md Success bullets)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fresh `gh setup --apply` gives a ruleset with admin bypass; workflow PR merges | VERIFIED | `ADMIN_BYPASS` in gh-setup.cjs (:55, used in desiredRuleset :121 and unionRuleset :209). Live: ruleset 24502205 has RepositoryRole 5 / always and `current_user_can_bypass: always`. Smoke PR #6 MERGED. |
| 2 | Required checks run green in a real store repo | VERIFIED | All three sparse-checkout blocks in devflow-checks.yml list `references`. Guard test in devflow-workflows.repo.test.cjs passes. Live: devflow/linked-issue and devflow/planning-consistency are `success` on merge commit 34ba818e. |
| 3 | Unpushed commit blocks verify and merge, naming `gh pr sync` | VERIFIED | `unpushedCommits` and `unpushedRefusal` in objective-branch.cjs; guards in gh-pr.cjs :980-982 and `unpushedGuard` in planning-verbs.cjs. Tests pass. Merge guard proven live only on a ready PR (see deviation). |
| 4 | Wiki-first-page and `objective put` paths work or point to what does | VERIFIED | Flush re-queues a blocked wiki-push (gh-outbox-flush tests pass). `REGISTER_HINT` in planning-verbs.cjs names `objective add`. |
| 5 | Minor items fixed or deferred | VERIFIED | Store-mode titles and footer (gh-store-naming tests pass). `contentMerged` reconcile fallback in gh-pr.cjs :697. Setup `state.json` bootstrap via `upgrade --apply`. The new-project store bootstrap is deferred and documented in USER-GUIDE. |
| 6 | Live smoke re-run through `gh pr sync`, merged via the merge queue | VERIFIED | Read-only `gh`: PR #9 MERGED, merge commit 34ba818e, run 37310333089 (event merge_group) conclusion success. |
| 7 | `npm test` green apart from MA-7 | VERIFIED | 55-08 SUMMARY reports 9165 tests, 9132 pass, 1 fail (MA-7), 32 skipped. Re-run of the 12 targeted test files here: 592 pass, 0 fail. The full suite was not re-run. |

**Score:** 7/7

## Requirements Coverage

| ID | Mapped to | Status |
|----|-----------|--------|
| 55-1 | Ruleset bypass (TRD 01, 06, 08) | SATISFIED |
| 55-2 | `objective put` hint (TRD 05, 07) | SATISFIED |
| 55-3 | Wiki retry (TRD 02) | SATISFIED |
| 55-4 | Sparse checkout with references (TRD 01, 02, 06) | SATISFIED |
| 55-5 | Unpushed guard (TRD 03, 07) | SATISFIED |
| 55-6 | Naming, footer, reconcile, bootstrap (TRD 04, 05, 06, 07) | SATISFIED |

No orphaned requirements.

## Anti-Patterns

None found. The working tree has no uncommitted changes to objective files; the only untracked files are unrelated docs and `.gitkeep` files.

## Notes

- **Deviation weighed (accepted):** on a draft PR `gh pr merge` refuses with "PR is still a draft" before the unpushed guard runs (gh-pr.cjs :975 then :980). The user approved proving the merge guard live on a ready PR only. Test 3d pins the order. USER-GUIDE (:934) documents it. The `verification post` guard and the merge guard are covered by unit tests.
- **Deployment verification:** the live smoke on AO-Cyber-Systems/devflow-store-smoke serves as real-GitHub evidence. The devcluster check does not apply.
- **Functional UI verification:** skipped, not a UI objective.

---

_Verified: 2026-10-05_
_Verifier: Claude (verifier)_
