---
objective: 49-objective-branch-and-pr-lifecycle
trd: "12"
subsystem: github-store
tags: [gh-pr, merge, merge-queue, reconcile, idempotent, branch-cleanup, squash]

requires:
  - objective: 49-04
    provides: objective-branch git seam (`syncDefault`, `deleteLocal`, `listLocal`, `branchTip`, `isAncestor`, `isTrackedClean`)
  - objective: 49-09
    provides: `gh-pr.cjs` / `gh-pr-cli.cjs` (`storeGate`, `flushNow` idiom, `fromLibrary`), `prs[obj]` mapping
  - objective: 49-10
    provides: outbox ops `pr-merge` (config method, queue-aware) and `delete-branch`, `not_mergeable` halt class
provides:
  - "gh-pr: `mergeObjectivePr(root, obj, {flush, wait, deps})` and `reconcileObjectivePr(root, obj, {flush, wait, deps})` (the function the objective 50 merge-time Action will call)"
  - "gh-pr-cli: `df-tools gh pr merge|reconcile <objective> [--no-flush] [--no-wait]`"
  - "templates/config.json: `github.pr.merge_method` (default `squash`)"
affects: [49-13, 49-14, 49-15, objective-50]

tech-stack:
  added: []
  patterns:
    - "A returned `pr-merge` is never read as 'merged': the PR is read again (`merged`/`merged_at`) and only then reconciled; a queued PR is pending"
    - "GitHub first, local second: a failed flush returns before the Project, the checkout or the cache are touched, so the local branches are still there to retry from"
    - "Idempotence by reading, not by remembering: every run re-reads the PR, each closes-set issue and the remote ref, and queues only the difference; `reconciled_at` is recorded once, when every step finished"
    - "Collaborators outside the module (`gh.updateProjectFields`, `gh-cache.pullAll`) are injectable through `opts.deps` and resolved lazily, so a test can also stub the module property"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-pr-reconcile.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-pr.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/templates/config.json

key-decisions:
  - "Squash by default; `github.pr.merge_method` overrides (unknown value falls back to squash). `mergeObjectivePr` resolves it and passes it as `pr-merge` `payload.method`; a merge queue ignores it"
  - "Reconcile verifies closure itself (decision 6): every issue in the closes set (objective first, then mapped TRDs) is read and each still-open one gets `patch-issue {state:'closed', state_reason:'completed'}`; the closing-keyword cap is never relied on"
  - "`delete-branch` is queued only when the PR is confirmed merged AND the remote ref still exists (one GET), so a repeat run writes nothing and a queued PR's branch is never deleted"
  - "Local branches (objective branch + `df/exec-<obj>-*`) are force-deleted only when the tip is an ancestor of the merged PR's `head.sha`; otherwise kept with a named warning. An ancestry check that cannot run (head object not fetched) also keeps the branch"
  - "`merged_at` is recorded the moment the merge is read (49-11 reads it as the only merge signal); `reconciled_at` only when the Project step, the local steps and the cache pull all finished, so a skipped or failed step is finished by running the verb again"
  - "A dirty tracked tree skips every local step including the cache pull (it is a local step); the GitHub side is still reconciled"
  - "A failing Project write (missing scope) is `project: 'error: ...'` plus a warning, exit 0; it leaves `reconciled_at` unset so a re-run retries it"

metrics:
  tasks: 2 (plus one follow-up fix from the dispatch note)
  files: 6
  tests-added: "gh-pr-reconcile.test.cjs 29 (16 reconcile, 13 merge); gh-pr-cli.test.cjs +12 (31 total, 13d updated)"
---

# Objective 49 TRD 12: `gh pr merge` and `gh pr reconcile` Summary

A verified objective's PR merges (through the merge queue where the repo has one), and one reconcile leaves GitHub, the Project and the local checkout in the merged state, idempotently: leftover issues closed, remote branch gone, checkout on the default branch at origin's tip, merged branches deleted, cache pulled.

## Performance

- Tasks: 2 of 2, plus one fix; every GREEN preceded by its committed RED
- Files: 1 created, 5 modified

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 Reconcile (tests 6-12) | RED | d475ea63 | test(49-12): reconcile after merge |
| 1 Reconcile | GREEN | fae79bb2 | feat(49-12): reconcile the objective after its PR merges |
| 2 Merge, CLI, config (tests 1-5, 13) | RED | 8c2c111e | test(49-12): gh pr merge |
| 2 Merge, CLI, config | GREEN | 6480b380 | feat(49-12): gh pr merge and reconcile |
| Fix (49-11 note) | RED | 3a3961e3 | test(49-12): merged_at is recorded when the merge is confirmed |
| Fix (49-11 note) | GREEN | 041388d0 | fix(49-12): record merged_at as soon as the merge is confirmed |

## What was built

**`reconcileObjectivePr` (gh-pr.cjs).** Reads `pulls/{n}`: closed unmerged is an error (`closed without merging`, nothing touched); open (draft, ready, or waiting in the merge queue) is `{ok:true, pending:true, reason}` with zero writes and nothing queued. On a merged PR: records `merged_at`; reads every closes-set issue and the remote branch ref; queues `patch-issue` for each open issue and `delete-branch` if the ref still exists; flushes. Only if the flush finished: Project Status to Done (`org_project` from OBJECTIVE.md, else PROJECT.md; `none` when unset), then the local half (`isTrackedClean`, `syncDefault(base)`, ancestry-gated `deleteLocal({force:true})` of the objective branch and `df/exec-<obj>-*`), `pullAll`, and `reconciled_at`. Result fields: `closed`, `already_closed`, `remote_branch`, `project`, `local`, `deleted_local`, `kept:[{branch, reason}]`, `pulled`, `reconciled`, `already_reconciled`, `queued`, `flush`, `warnings`.

**`mergeObjectivePr`.** Online-required, reads before it queues: refuses a draft (`PR is still a draft; run verification first`), a closed PR, and a head without a `success` `devflow/verification` status (the message names the context and the status seen, so a success posted on an earlier head does not count). Queues `pr-merge {method}`, flushes, reads the PR again: merged then runs reconcile in the same call (result is the reconcile result plus `merged:true`, `method`, `merge_flush`); otherwise `{merged:false, pending:true, reason}` naming `gh pr reconcile <obj>`. An already merged PR goes straight to reconcile.

**CLI.** `gh pr merge|reconcile <objective> [--no-flush] [--no-wait]`. Exit codes: merge 0 merged and reconciled, 3 only enqueued (or `--no-flush`), 2 halted (draft/closed/405 from the outbox), 1 refused/offline; reconcile 0 reconciled (idempotent), 3 PR still open or a flush pending, 1 closed unmerged or error. Kept branches and a skipped Project/local step print as `Warning:` on stderr with exit 0. Usage, `PR_AVAILABLE`, and the help `gh` usage string list the new verbs.

**Config.** `github.pr.merge_method: "squash"` in templates/config.json; `config-get github.pr.merge_method` returns `squash`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `merged_at` recorded early (dispatch note from 49-11)**
- **Found during:** continuation after Task 2
- **Issue:** the TRD sets `merged_at` at the end of reconcile. 49-11's planning verbs read `prs[obj].merged_at` as the only merge signal, so a reconcile that stopped on a pending flush left the objective issue open with no signal that the merge happened.
- **Fix:** `merged_at` is written as soon as a merged PR is read, before anything that can stop the run; `reconciled_at` is unchanged (every step done). The objective issue was already in the straggler set (objective first); test 7b (`closeKeywordCap:0`) pins that it is closed by reconcile when GitHub closed nothing.
- **Commits:** 3a3961e3 (RED), 041388d0 (GREEN)

**2. [Rule 3 - Blocking] Existing test 13d updated**
- `gh-pr-cli.test.cjs` 13d asserted the old help string `pr <start|sync|status> <objective>`; it now asserts `pr <start|sync|status|merge|reconcile> <objective>` (changed in the RED commit, failing until the help edit).

### Design choices within the TRD

- **Cache pull is a local step.** The TRD lists `pullAll` after the local cleanup; a dirty tree skips it too (test 11), so a re-run does the whole local half.
- **`reconciled_at` means every step finished** (Project not `error`, local `done`, pull ok). The TRD says "records `merged_at`/`reconciled_at`"; this makes a Project/pull failure or a dirty tree retryable without a flag, and the repeat run (test 9) skips the Project write and the pull because `reconciled_at` is set and nothing changed.
- **Always flush** (unless `--no-flush`), even with nothing to queue: an empty journal makes no GitHub call, and this keeps the verb's flush result uniform for the CLI.
- **Pending message reads the merge queue** (`mergeQueueEntry` GraphQL, the same query `prStatus` uses) so "waiting in the merge queue" and "still open (draft)" are told apart; a failed read degrades to "still open".
- **Verification read uses `?per_page=100`**, like the flusher's `post-status`, so a repository with many status contexts does not hide `devflow/verification` past the default 30.
- **Test 7's patch-write assertion counts a delta** (writes after `startPr` already include issue PATCHes).
- **Preflight** ran with `--cwd <worktree>` and `--repo <main checkout>`; exit 0, claim recorded for the worktree.

## Task Evidence

| Task | Verify Command | Result | Status |
|---|---|---|---|
| 1: reconcile (tests 6-12) | `node --test .../gh-pr-reconcile.test.cjs` | 14 pass (reconcile block) | PASS |
| 2: merge, CLI, config (tests 1-5, 13) | `node --test .../gh-pr-reconcile.test.cjs` and `.../gh-pr-cli.test.cjs`, `help.test.cjs`, `dispatch-completeness.test.cjs` | 29 pass, 31 pass, 13 pass, 7 pass | PASS |
| Fix: merged_at early | `node --test .../gh-pr-reconcile.test.cjs` | 29 pass | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-pr-reconcile.test.cjs` | 14 fail (`prLib.reconcileObjectivePr is not a function`) | FAIL (correct) |
| GREEN (task 1) | same | 14 pass | PASS (correct) |
| RED (task 2) | same plus `gh-pr-cli.test.cjs` | 13 of 27 fail (merge), 11 of 31 fail (CLI, 13d, 13f-13k, 13m-13p) | FAIL (correct) |
| GREEN (task 2) | same | 27/27 and 31/31 pass | PASS (correct) |
| RED (fix) | `node --test .../gh-pr-reconcile.test.cjs` | 1 fail (7c); 7b passes (pins existing behaviour) | FAIL (correct) |
| GREEN (fix) | same | 29/29 pass | PASS (correct) |

## Validation Gate Results

| Gate | Command | Result | Status |
|---|---|---|---|
| test | `gh-pr-reconcile.test.cjs`, `gh-pr-cli.test.cjs` | 29 + 31 pass | PASS |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 1508 pass, 0 fail (run before the 2 fix tests; the three gh-pr files rerun after: 29 + 31 + 28 pass) | PASS |
| help / dispatch | `help.test.cjs`, `dispatch-completeness.test.cjs` | 13, 7 pass | PASS |
| seam | `gh-seam.repo.test.cjs` | 9 pass (gh-pr.cjs still exactly one direct `ghWrite(`; no new gh-* module) | PASS |
| repo guards | `df-tools-deprecations`, `doc-refs`, `planning-writes` `.repo.test.cjs`, `config.test.cjs` | 4, 14, 10, 24 pass | PASS |
| df-tools | `df-tools.test.cjs` | 153 pass | PASS |

Full `npm test` was not run (no `node_modules` in the worktree), per the dispatch.

## Test list coverage (TRD)

1 draft refused, 2/2b/2c no / non-success / stale-head verification, 3 merge + same-call reconcile, 4/4b merge method (config and bad value), 5/5b/5c/5d/5e merge queue pending, already merged, closed, no PR / offline, `--no-flush`, 6/6b open and queued are pending then reconcile after `humanMergePr`, 7/7b/7c stragglers (cap 1 and cap 0) and early `merged_at`, 8 closed unmerged, 9 idempotent second run, 10 force-delete with ancestry, 10a kept branches, 11 dirty tree, 12/12b/12c Project done / none / error, 13 (library) unreadable GitHub and unstarted objective, local mode (merge 5f, reconcile 14), `--no-flush` reconcile 15; CLI 13d-13p (help string, prose, exit codes 0/1/3, usage, local mode, dispatch).

## Notes for dependents

**49-13 (workflow prose)**
- After verification passes: `df-tools gh pr merge <obj>`. Exit 0 = merged and fully reconciled; exit 3 = only enqueued in a merge queue (or `--no-flush`): tell the user to run `df-tools gh pr reconcile <obj>` after the queue merges, and re-run it until exit 0 (it is idempotent); exit 2 = halted for a human (the outbox halt names the PR and reason); exit 1 = refused (draft, no success `devflow/verification` on the current head, closed unmerged, offline: nothing queued).
- A human merging on GitHub is handled the same way: just run `gh pr reconcile <obj>`.
- With the store off both verbs print `skipped` and exit 0, so prose can call them unconditionally.
- Reconcile warnings (kept branches that hold unmerged work, a skipped dirty-tree step, a Project error) go to stderr with exit 0; the prose should surface them rather than treat them as failure.

**49-14 (e2e / parity)**
- Harness to copy from `gh-pr-reconcile.test.cjs`: mirror a fake `DELETE .../git/refs/heads/<b>` into the bare origin with `update-ref -d`, and make a fake `PUT .../pulls/N/merge` call `advanceOrigin()` (a squash commit on main); for `humanMergePr` call `advanceOrigin()` yourself. `closeKeywordCap: 0|1` and `mergeQueue: true` drive the straggler and queue paths.
- Reconcile uses `opts.deps = {updateProjectFields, pullAll}` (library tests) and resolves both lazily from `gh.cjs`/`gh-cache.cjs`, so CLI/e2e tests that go through `cmdGhPr` stub `require('./gh-cache.cjs').pullAll` (see `gh-pr-cli.test.cjs` setup). The fake does not serve what `gh pull --all` reads.
- Result shapes: reconcile -> `{ok, objective, repo, pr:{number,url,state,merged_at}, base, branch, closed, already_closed, remote_branch, project, local, default_branch, deleted_local, kept, pulled, reconciled, already_reconciled, queued, flush, warnings}` or `{ok, pending:true, pr, reason}`; merge -> the reconcile result plus `merged:true, method, merge_flush`, or `{merged:false, pending, objective, pr, method, reason, queued, flush}`.

**Live-API items the fake cannot verify**
- `pulls/{n}` `merged`/`merged_at` after a merge-queue merge, and `issues/{n}` `state`, are the only reads reconcile trusts.
- The PR head sha may not exist locally (a commit added on GitHub, e.g. "update branch"): `isAncestor` then errors and the branch is kept with a warning, never deleted.
- A `df/exec-*` branch still checked out in another worktree makes `git branch -D` fail; it is kept with git's message as the reason.
- `updateProjectFields` idempotence on GitHub is not relied on: a reconciled objective never calls it again.

## Post-TRD Verification

- Auto-fix cycles used: 0 (one dispatch-requested follow-up fix, with its own RED/GREEN)
- Must-haves verified: 7/7 (merge gate and queue pending; reconcile pending/error/merged; ancestry-gated branch deletion; idempotent second run; direct merge reconciles in the same call; local mode skipped; `github.pr.merge_method` documented)
- Gate failures: None

## Self-Check: PASSED

Verified: `gh-pr.cjs`, `gh-pr-cli.cjs`, `gh-pr-cli.test.cjs`, `gh-pr-reconcile.test.cjs`, `help.cjs` and `templates/config.json` exist and carry the changes; commits d475ea63, fae79bb2, 8c2c111e, 6480b380, 3a3961e3 and 041388d0 are on branch `df/exec-49-12`.
