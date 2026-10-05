---
objective: 55-store-live-smoke-fixes
job: "03"
subsystem: github-store
tags: [gh-pr, verification-post, objective-branch, git-seam, guard]

requires:
  - objective: 49-objective-branch-and-pr
    provides: objective-branch git seam, gh pr merge/sync, verification post enqueue (49-04, 49-09, 49-11, 49-12)
provides:
  - "objective-branch.unpushedCommits(root, branch): the local linked branch's commits origin lacks"
  - "One refusal text, objective-branch.unpushedRefusal(id, branch, info), re-exported as gh-pr.unpushedRefusal"
  - "gh pr merge refuses an ahead linked branch before anything is queued"
  - "verification post refuses an ahead linked branch before the cache file or any op"
affects: [55-05, 55-07, 55-08]

tech-stack:
  added: []
  patterns:
    - "Guards sit before the write (writeThrough / enqueue) so the cache and the outbox never disagree"
    - "A git failure inside a guard is a warning on the result, never a refusal"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/objective-branch.cjs
    - plugins/devflow/devflow/bin/lib/objective-branch.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs

key-decisions:
  - "Refuse, never push: an implicit push from a verify or merge verb is a surprising write, and gh pr sync also refreshes the PR body"
  - "The refusal text is built once on objective-branch.cjs and re-exported from gh-pr.cjs, so planning-verbs.cjs does not load gh-pr.cjs"
  - "No branch on record (a PR recorded before 49-04) means no guard, in merge and in verification post"

requirements-completed: ["55-5"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-05
---

# Objective 55 TRD 03: Unpushed-commit guard Summary

**`verification post` and `gh pr merge` now refuse, naming `df-tools gh pr sync <obj>`, while the local linked branch has commits origin does not, so a verification status can no longer certify (and a merge can no longer land) a PR head that lacks the verified code.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-05T11:57:05Z (preflight claim)
- **Completed:** 2026-10-05T12:06:00Z
- **Tasks:** 3/3 (each RED then GREEN, 6 commits)
- **Files modified:** 7 (plus this SUMMARY)

## Progress
- [x] Task 1: objective-branch.unpushedCommits through the git seam — 5e19c4ae (RED), bd12bf98 (GREEN)
- [x] Task 2: gh pr merge refuses an unpushed linked branch — f68baba2 (RED), a5237d60 (GREEN)
- [x] Task 3: verification post refuses before writing when the linked branch is ahead — e6904abe (RED), 85758b6d (GREEN)

## Accomplishments

- `objective-branch.unpushedCommits(root, branch)` reads through the existing `git(root, args)` seam only: fetch (best effort), then `<remote>..<local>`, or `<local> --not --remotes=origin` for a never-pushed branch. Count 0 for a branch absent from the clone, a branch that is only behind, and a root that is not a git work tree.
- `mergeObjectivePr` guards after the draft check and before `verificationAt`: exit 1, zero GitHub writes, nothing queued, the PR left open. A test then runs the remedy it names (`syncObjectivePr`, verify the pushed head, merge) and the merge goes through.
- `verificationPost` guards before `writeThrough`, in store mode only, for an unmerged PR on record with a branch, and for every verdict in `VERDICT_STATE` (`passed`, `gaps_found`, `human_needed`). A `failure` status on a head without the code is as wrong as a `success`.
- Local mode is untouched: zero git and zero gh calls, today's bytes (test 11b, with an ahead-branch stub that records zero calls).

## Exact refusal text (TRD 55-07 checks this live)

Built by `objective-branch.unpushedRefusal(id, branch, info)`. One commit:

```
df/objective-02-demo has 1 unpushed commit (a1b2c3d) that is not on GitHub: the pull request head does not contain it. Run df-tools gh pr sync 2 to push it, re-run verification on the pushed head, then try again. Nothing was queued or written.
```

Several commits (first five shas shown, then `and N more`):

```
df/objective-02-demo has 7 unpushed commits (1111111, 2222222, 3333333, 4444444, 5555555, and 2 more) that are not on GitHub: the pull request head does not contain them. Run df-tools gh pr sync 2 to push them, re-run verification on the pushed head, then try again. Nothing was queued or written.
```

The stable substrings are `df-tools gh pr sync <id>`, `<N> unpushed commit(s)`, the branch name and the short shas.

A git failure while counting is not a refusal. `verification post` carries this warning on the result: `could not tell whether <branch> has unpushed commits (<error>); run df-tools gh pr sync <id> before verification to be sure the PR head carries the verified code`. `gh pr merge` fails with `could not tell whether <branch> has unpushed commits: <error>; nothing was queued`.

## Exported API added (for TRD 55-05)

Names are stable. All in `plugins/devflow/devflow/bin/lib/`.

| Export | Module | Shape |
|---|---|---|
| `unpushedCommits(root, branch)` | `objective-branch.cjs` | `{ok:true, count, commits (newest first), local, remote, fetched, fetch_error?}`; `{ok:true, count:0, commits:[], local:null[, reason:'not a git work tree']}`; `{ok:false, error, stderr}` for a bad branch name or a git failure |
| `trackingTip(root, branch)` | `objective-branch.cjs` | was module-private, now exported: `{ok:true, sha\|null}` of the fetched `refs/remotes/origin/<branch>` |
| `unpushedRefusal(id, branch, info)` | `objective-branch.cjs`, re-exported from `gh-pr.cjs` | the refusal string above; `info` is an `unpushedCommits` result with `count > 0` |

Not touched, as the TRD requires: `reconcileLocal`, `gh-pr.cjs` reconcile paths, `__fixtures__/gh-fake.cjs`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: unpushedCommits | `node --test plugins/devflow/devflow/bin/lib/objective-branch.test.cjs` | 0 (34 tests: 25 pre-existing + 9 new) | PASS |
| 2: gh pr merge guard | `node --test gh-pr-reconcile.test.cjs gh-pr.test.cjs gh-pr-cli.test.cjs gh-pr-e2e.test.cjs` | 0 (99 tests: 96 pre-existing pass unchanged + 3 new) | PASS |
| 3: verification post guard | `node --test planning-verbs-pr.test.cjs planning-verbs.test.cjs planning-verbs-cli.test.cjs planning-verbs.e2e.test.cjs` | 0 (75 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test objective-branch.test.cjs` | 1 (9 fail: `unpushedCommits` / `trackingTip` is not a function; 25 pre-existing pass) | FAIL (correct) |
| GREEN (task 1) | same | 0 (34/34) | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern "49-12 gh pr merge" gh-pr-reconcile.test.cjs` | 1 (3b: the merge succeeded and only reconcile warned afterwards, the live bug) | FAIL (correct) |
| GREEN (task 2) | the four gh-pr suites | 0 (99/99) | PASS (correct) |
| RED (task 3) | `node --test --test-name-pattern "55-03\|11b" planning-verbs-pr.test.cjs` | 1 (4, 4b, 5, 6b fail; the negative-path tests pass as regression guards) | FAIL (correct) |
| GREEN (task 3) | the four planning-verbs suites | 0 (75/75) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test objective-branch.test.cjs gh-pr-reconcile.test.cjs planning-verbs-pr.test.cjs` | 0 (100 pass, 0 fail) | PASS |
| seam guard | `node --test gh-seam.repo.test.cjs` | 0 (11 pass) | PASS |
| planning-writes guard | `node --test planning-writes.repo.test.cjs` | 0 (10 pass) | PASS |
| load check | `node -e "require('./planning-verbs.cjs'); require('./gh-pr.cjs')"` | 0 (no require cycle) | PASS |
| test (`npm test`) | not run, by the orchestrator's instruction (targeted files only) | n/a | not_available |

## Decisions Made

- **Refusal text lives on `objective-branch.cjs`, re-exported from `gh-pr.cjs`.** The TRD offered this as the route when requiring `gh-pr` from `planning-verbs` risks a cycle. `gh-pr.cjs` pulls in the client, outbox, flusher, config, roadmap and objective modules; `planning-verbs.cjs` already requires `objective.cjs`, which requires it lazily. There was no actual cycle (the load check passes), but `objective-branch.cjs` is two stdlib requires, and `gh-gate.cjs` already requires it the same way. `gh-pr.unpushedRefusal` exists, so the TRD's stated contract holds.
- **Wording.** The TRD's suggested text said "local commit(s)". The test list requires the message to say `1 unpushed commit`, so the text says `unpushed commit` with proper singular and plural. The tail is `Nothing was queued or written.` because the same text serves a merge (nothing queued) and a verification post (nothing written).
- **No branch on record skips the guard in `gh pr merge` too.** The TRD states this for `verification post`. `gh pr merge` has the same case (reconcile already tolerates `recorded.branch || null`), and without the skip it would refuse with `could not tell whether undefined ...`.

## Deviations from Plan

### Auto-fixed Issues

None needing a fix. Notes on deliberate departures:

**1. [Scope note] `rg -n "gh pr sync"` verification line**
- The TRD's `<verification>` expects the refusal text to show in `gh-pr.cjs` and `planning-verbs.cjs`. The text is built in `objective-branch.cjs` (decision above), so those two files carry `gh pr sync` in comments and in the git-failure warning, and the refusal sentence itself shows in `objective-branch.cjs`. Both call sites use it, and the tests assert `df-tools gh pr sync 7` through both verbs.

**2. [Test design] Extra tests beyond the TRD's 14**
- Added 3d (draft refusal wins over the guard, pinning the placement), 4b (the remedy works: after the push the same verification post goes through), 5b (an unrecognised status posts nothing, so no git call), 6b (git failure is a warning), 6c (branch absent from the clone, no branch on record), 11b (local mode: zero git calls), 14b (bad branch names reach no git), 14c (`trackingTip` export).
- Test 3b ends by running the remedy it names: `syncObjectivePr`, verify, merge.

No fixture changes were needed: every pre-existing 49-11, 49-12 and 49-14 test passed unchanged, so no test modelled the bug, and `gh-pr-e2e` needed no `gh pr sync` step inserted.

**Environment note (not a code deviation):** the first `exec-context check` failed with SHARED INDEX because the shell's working directory was the main checkout, which 55-01's claim already held. It was run from the wrong directory. Re-running with `--cwd <worktree>` checked the right tree and passed. 55-01's claim on the main checkout was not touched. If the orchestrator expects 55-01 to work in its own worktree, its claim on `/Users/justin/dev/devflow-claude` suggests it ran the same check from the main checkout.

## Auth gates

None.

## Discovered commands

None. All commands came from the TRD (`node --test <files>`); the profile's `lint`, `format` and `typecheck` are `none`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. `unpushedCommits` semantics (tests 8-14), merge refusal before any write (3b), verification refusal before the file or any op (4, 5), unchanged behaviour when pushed or absent (every pre-existing test plus 3c, 6, 6c, 7), local mode untouched (11b).
- Gate failures: None.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/objective-branch.cjs` (`unpushedCommits`, `trackingTip`, `unpushedRefusal` exported)
- FOUND: `plugins/devflow/devflow/bin/lib/gh-pr.cjs` (guard in `mergeObjectivePr`, `unpushedRefusal` re-export)
- FOUND: `plugins/devflow/devflow/bin/lib/planning-verbs.cjs` (`unpushedGuard`, guard in `verificationPost`)
- FOUND: commits 5e19c4ae, bd12bf98, f68baba2, a5237d60, e6904abe, 85758b6d (`git log 007891c6..HEAD`)
- Every changed file is in the TRD's `files_modified`; `gh-fake.cjs` and `reconcileLocal` were not touched.
