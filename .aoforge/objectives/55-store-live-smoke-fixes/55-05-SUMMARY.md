---
objective: 55-store-live-smoke-fixes
job: "05"
subsystem: github-store
tags: [planning-verbs, gh-hierarchy, gh-pr, reconcile, objective-branch, merge-tree]

requires:
  - objective: 55-store-live-smoke-fixes
    provides: "55-03: objective-branch.unpushedCommits / trackingTip / unpushedRefusal (kept stable, not touched)"
provides:
  - "objectiveTarget (planning-verbs) and resolveObjectiveDir (gh-hierarchy) name `df-tools objective add` for an unknown objective"
  - "objective-branch.contentMerged(root, tip, into): are tip's changes already in into?"
  - "gh pr reconcile deletes a non-ancestor local branch whose content is already on the default branch"
affects: [55-06, 55-07, 55-08]

tech-stack:
  added: []
  patterns:
    - "Unknown is never a delete: a git failure inside a safety check keeps the branch"
    - "Ancestry gate first, content gate second; both read through the objective-branch git seam"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
    - plugins/devflow/devflow/bin/lib/objective-branch.cjs
    - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs

key-decisions:
  - "`objective put` still never creates an objective: `objective add` owns numbering, slug and directory, so the error points at it"
  - "Reason string for every kept non-ancestor branch stays `not in the merged PR`; a conflict adds `(it conflicts with <default>)` to the warning only"
  - "Content check runs against synced.sha (the default branch tip after syncDefault), never against the merge commit's tree"

requirements-completed: ["55-2", "55-6"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-10-05
tokens_input: 5973213
tokens_output: 37717
tokens_cache_read: 5855359
tokens_cache_write: 117744
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 55 TRD 05: objective put hint and reconcile by content Summary

**An unknown objective now answers with `register a new objective with df-tools objective add "<description>"`, and `gh pr reconcile` deletes a local branch that is not in the merged PR's history when `git merge-tree --write-tree` shows its changes are already on the default branch, while real unpushed work, conflicts and unknowns are still kept and warned about.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-05T12:08:57Z (preflight claim)
- **Completed:** 2026-10-05T12:15:00Z
- **Tasks:** 2/2 (each RED then GREEN, 4 commits)
- **Files modified:** 7 (plus this SUMMARY)

## Progress
- [x] Task 1: Unknown-objective error names `objective add` — 3a23215a (RED), d5e56ae9 (GREEN)
- [x] Task 2: Reconcile deletes a non-ancestor branch whose content is already on the default branch — d9ccc3da (RED), b0aca3dd (GREEN)

## Reproduction result: the OBJECTIVE's "always warns" claim does NOT reproduce

OBJECTIVE 55-6 said reconcile "always warns 'kept local branch ... tip not in the merged pull request' after the default squash merge, even when everything was pushed". Test 4, the reproduction, is the pre-existing test 10 with a new assertion that `warnings` holds no `was kept` entry. It was run on the unmodified code before any fix and passed (1 test, 1 pass): a fully pushed objective branch plus its exec branches, squash-merged, are all deleted with zero `kept` entries and zero `was kept` warnings. As the TRD predicted, the smoke's warning was a true positive: the branch held an unpushed commit (item 55-5, fixed by 55-03). The assertion stays in test 10 as a permanent guard.

The false positive that does exist is narrower, and this TRD fixes it: the tip is not an ancestor of the PR head but its content is already on the default branch. Tests 10b and 10d were RED on today's code for exactly that; 10b is the user merging `origin/main` into the objective branch after the last push, then the PR squash-merging.

## Accomplishments

- `objectiveTarget` (planning-verbs.cjs) and `resolveObjectiveDir` (gh-hierarchy.cjs) carry the same sentence. Every verb that calls `objectiveTarget` (six call sites in planning-verbs.cjs, `plan put-trd`, `objective put` and `verification post` among them) inherits it; the throw in gh-hierarchy is kept.
- `objective-branch.contentMerged(root, tip, into)` is exported: ancestry first, then `git merge-tree --write-tree <into> <tip>`, comparing the first stdout line (the merged tree OID) with `<into>^{tree}`. Read-only: no index, work tree or ref is touched.
- `reconcileLocal` falls back to `contentMerged(tip.sha, synced.sha)` only when ancestry says no. Merged: forced delete as before. Not merged, conflict, or `ok:false`: kept with today's warning, plus `(it conflicts with main)` on a conflict. The JSDoc of `reconcileLocal` and `reconcileObjectivePr` describes the two gates.

## Exact texts (TRD 55-06 / 55-07 can check these live)

Unknown objective (planning verbs return it as `error`, the CLI prints `Error: ...` and exits 1):

```
objective 9 is not known (no ROADMAP entry or directory under .planning/objectives); register a new objective with df-tools objective add "<description>", then run this again
```

Reconcile, a branch kept for real unpushed or unmerged work (unchanged text):

```
df/objective-07-store-demo was kept: its tip is not in the merged pull request (unpushed or unmerged work); delete it with git branch -D df/objective-07-store-demo once you are sure
```

Reconcile, a branch that conflicts with the default branch:

```
df/objective-07-store-demo was kept: its tip is not in the merged pull request (it conflicts with main) (unpushed or unmerged work); delete it with git branch -D df/objective-07-store-demo once you are sure
```

A live reconcile of a fully pushed squash merge produces no `was kept` warning at all (TRD 55-07 asserts that).

## `contentMerged` contract (stable)

`{ok:true, merged:true}` when the tip is an ancestor of `into` or the merge-tree tree equals `into`'s own tree; `{ok:true, merged:false}` for a change `into` lacks; `{ok:true, merged:false, conflict:true}` on merge-tree exit 1; `{ok:false, error, stderr}` for an invalid or option-looking revision, a missing object, unrelated histories, or an older git where `--write-tree` is a usage error (exit 129). Callers must treat `ok:false` as unknown and never delete on it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: objective add hint | `node --test planning-verbs-cli.test.cjs planning-verbs.test.cjs gh-hierarchy.test.cjs` | 0 (63 tests) | PASS |
| 2: reconcile by content | `node --test objective-branch.test.cjs gh-pr-reconcile.test.cjs gh-pr-e2e.test.cjs` | 0 (86 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test planning-verbs-cli.test.cjs` | 1 (14 tests: 3 fail, tests 1, 2 and 2b, on the missing `objective add`; 11 pass) | FAIL (correct) |
| GREEN (task 1) | the three planning-verbs/gh-hierarchy suites | 0 (63/63) | PASS (correct) |
| Reproduction (task 2, test 4) | `node --test --test-name-pattern "^10\. " gh-pr-reconcile.test.cjs` on unmodified code | 0 (1/1: the "always warns" claim does not reproduce) | PASS (informational) |
| RED (task 2) | `node --test --test-name-pattern "^10" gh-pr-reconcile.test.cjs` | 1 (10b and 10d fail; 10, 10a, 10c, 10e pass as regression guards) | FAIL (correct) |
| RED (task 2) | `node --test objective-branch.test.cjs` | 1 (42 tests: 8 fail, `contentMerged` is not a function; 34 pass) | FAIL (correct) |
| GREEN (task 2) | `objective-branch`, `gh-pr-reconcile`, `gh-pr-e2e` | 0 (86/86) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test planning-verbs-cli.test.cjs objective-branch.test.cjs gh-pr-reconcile.test.cjs` | 0 | PASS |
| wider neighbours + guards | `node --test` over the 3 scoped files plus `gh-pr.test.cjs gh-pr-cli.test.cjs gh-seam.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs planning-verbs-pr.test.cjs planning-verbs.test.cjs gh-hierarchy.test.cjs` | 0 (269 pass, 0 fail) | PASS |
| test (`npm test`) | not run, by the orchestrator's instruction (targeted files only) | n/a | not_available |

## Decisions Made

- **Hint text lives in one constant (`REGISTER_HINT`) in planning-verbs.cjs; gh-hierarchy.cjs carries the same sentence inline.** Requiring gh-hierarchy from a shared module just for one string would add a dependency edge; both sites are covered by tests (the CLI for the planning verbs; gh-hierarchy's throw has no changed assertion because no test pins its text, and `rg "objective add"` shows both).
- **`reason` stays `not in the merged PR` for conflicts too.** Test 10a already asserts that reason; the conflict is told in the warning text, where a human reads it.
- **Compared against `synced.sha`, not the PR's merge commit.** Anything else merged between the PR head and the squash makes `tip^{tree}` differ from the merge commit's tree (the anti-pattern the TRD names); merge-tree against the default tip is immune to that.

## Deviations from Plan

### Auto-fixed Issues

None needing a fix. Notes:

**1. [Test design] Extra tests beyond the TRD's list**
- `10e` (merge-tree reports a usage error through the seam: branch kept, one warning) pins the "never delete on an unknown" rule at the reconcile level; objective-branch 8g pins it at the helper level. 8h (unrelated histories) and 2b (every verb sharing `objectiveTarget` carries the hint, via `plan put-trd` and `verification post`) were added too.
- Test 3 (an objective that exists still writes) needed no new test: the existing test 5 and the unchanged planning-verbs suites cover it (all green).
- Objective-branch test 8 is split into 8a-8h in a new `describe('objective-branch contentMerged (55-05)')`, because test number 8 already exists in the unpushedCommits describe.

**2. [Test fix] 8h fixture**
- The first draft of 8h ran `git rm -rf .` after `switch --orphan`; git 2.54 already empties the index there, so the call failed. Removed in the GREEN commit (test-only change).

No fixture (`gh-fake.cjs`, `git-remote.cjs`) changes were needed.

## Auth gates

None.

## Discovered commands

None. All commands came from the TRD (`node --test <files>`); the profile's `lint`, `format` and `typecheck` are `none`.

## Notes for TRD 55-06 / 55-07 (live re-run)

- `gh pr merge` on an ahead linked branch still refuses with the 55-03 text; this TRD did not change it.
- Reconcile of a fully pushed squash merge: expect `deleted_local` to hold the objective branch and no `was kept` warning. If the live run does warn, read the warning for `(it conflicts with <default>)`: that is new and means a real conflict, not an ancestry artifact.
- The content check needs git 2.38+. An older git keeps every non-ancestor branch with today's warning, never deletes.
- `objective put N` on a fresh store for an unregistered objective is still an error, now with the `objective add` step. Run `df-tools objective add "<description>"` first.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4. Unknown objective names `objective add` in local and store mode with nothing written or queued (tests 1, 2, 2b); reconcile deletes a non-ancestor branch whose content is merged (10b); real unpushed work and conflicts are kept and warned (10a, 10c, 10d); a fully pushed squash merge is deleted with zero `was kept` warnings (10, now asserting it).
- Gate failures: None.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/objective-branch.cjs` (`contentMerged` defined and exported)
- FOUND: `plugins/devflow/devflow/bin/lib/gh-pr.cjs` (`contentMerged` fallback in `reconcileLocal`)
- FOUND: `plugins/devflow/devflow/bin/lib/planning-verbs.cjs` (`REGISTER_HINT`) and `plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs` (hint in `resolveObjectiveDir`)
- FOUND: commits 3a23215a, d5e56ae9, d9ccc3da, b0aca3dd (`git log c789acf3..HEAD`)
- Every changed file is in the TRD's `files_modified`; 55-03's `unpushedCommits`, `trackingTip` and `unpushedRefusal` were not touched.
