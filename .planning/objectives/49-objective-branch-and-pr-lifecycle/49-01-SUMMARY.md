---
objective: 49-objective-branch-and-pr-lifecycle
job: "01"
trd: "01"
subsystem: testing
tags: [gh-fake, github, pull-requests, graphql, merge-queue, commit-status, test-infrastructure]

requires:
  - objective: 47-48 (github store mode)
    provides: the stateful fake GitHub, gh-client seam (`_setRunGh`, `isWriteArgs`), outbox flusher argv shapes
provides:
  - "PR records in the fake (issue records with a `pr` object, same number counter)"
  - "REST routes: user, repos/o/r (default_branch, node_id), pulls GET/POST, pulls/{n} GET/PATCH, pulls/{n}/merge PUT, statuses/{sha} POST, commits/{sha}/status GET, git/ref/heads GET, git/refs/heads DELETE"
  - "Built-in GraphQL: createLinkedBranch, issue.linkedBranches, markPullRequestReadyForReview, repository.mergeQueue, enqueuePullRequest"
  - "Options viewer, defaultBranch, refs, onCreateBranch, mergeQueue, closeKeywordCap; helpers pushRef, humanMergePr, seedComment {login}; live refs and statuses"
affects: [49-05, 49-06, 49-09, 49-10, 49-12, 49-14]

tech-stack:
  added: []
  patterns:
    - "A PR is an issue record carrying `pr`, so issue and PR numbers never collide (Pitfall 9)"
    - "GraphQL operations are matched on document text and their arguments resolved from the document (`field:$var`), so any variable naming works"
    - "A mutation is a recorded write and a query is not, purely through gh-client `isWriteArgs`; the fake adds no classification of its own"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs

key-decisions:
  - "PR state is the issue record's own `state`; the rest lives on `issue.pr` {head, base, draft, merged, mergedAt, mergeSha, mergeMethod, queued, author}"
  - "A REST merge and `humanMergePr` share one `completeMerge`, so both close `Closes #N` issues for a merge into the default branch (as GitHub does)"
  - "The REST merge is NOT refused when `mergeQueue:true` (real GitHub would 405 on a queue-required branch); the TRD did not ask for it and 49-10/49-12 decide the queue path through the GraphQL probe"
  - "`GET pulls/{n}` reports a fake-only `queued` flag, which 49-10's error-recovery note relies on"
  - "`gh issue list` hides PRs (as gh does); REST `issues` lists them with `pull_request` (as GitHub does)"

patterns-established:
  - "Test controls that stand in for a human or a git push (`pushRef`, `humanMergePr`, `seedComment {login}`) record no gh call"

requirements-completed: [GPR-01, GPR-03, GPR-04, GPR-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-01
---

# Objective 49 TRD 01: Fake GitHub learns pull requests, linked branches, statuses and comment authors Summary

**The stateful fake GitHub now stands in for the whole objective-49 lifecycle: linked branch, draft PR, ready, commit status, direct or queued merge, keyword closing, branch delete and authored comments, with every pre-existing test unchanged.**

## Performance

- Duration: about 12 min
- Tasks: 2 of 2 (each RED committed before GREEN)
- Files: 2 modified (one fixture, one test file); no production code touched

## Accomplishments

- PRs are issue records on the shared `nextIssue` counter. `POST repos/o/r/pulls` validates title, head, base, refuses `No commits between <base> and <head>` (422) and a duplicate open PR for the same head, and returns draft/state/head/base/node_id (`PR_<n>`).
- The fake's `refs` map (`{name: sha}`, seeded with `{main: 'base0000...'}`) is live and exposed; `pushRef(name, sha)` stands in for a `git push`, and an open PR's `head.sha` follows its branch.
- Built-in GraphQL answers `createLinkedBranch` (null `linkedBranch` for an existing name, callback only on success, node ids only), `linkedBranches`, `markPullRequestReadyForReview` (idempotent), `mergeQueue` and `enqueuePullRequest`. Anything else still reaches the caller's `graphql(argv)` handler.
- Commit statuses keep history newest first and combine per context (latest wins; failure beats pending beats success); refs support GET and DELETE (a delete drops the issue link).
- Comments carry an author: the `viewer` option (default `devflow-bot`) for API posts, `seedComment(n, body, {login})` for others. `auth status` and `GET user` use the viewer too.
- `humanMergePr(n, {method})` merges, consumes a queue entry and closes `Closes #N` / `Fixes: #N` / `resolved #N` issues only for the default branch, honouring `closeKeywordCap`.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 47976835 | test(49-01): fake pull requests and comment authors |
| 1 | GREEN | e5981c63 | feat(49-01): fake pull requests, viewer login and assignees |
| 2 | RED | 35bd9f25 | test(49-01): fake linked branches, statuses, merge |
| 2 | GREEN | 31765985 | feat(49-01): fake linked branches, merge queue and commit statuses |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: PR records, repo/user/pulls/merge routes | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 (55 tests, 0 fail; 46 pre-existing + 9 new) | PASS |
| 2: linked branches, ready, queue, statuses, refs, humanMergePr | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` and the gh-* suite | 0 (68 tests in gh-fake; gh-* suite 1242 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test --test-name-pattern="49-01" .../gh-fake.test.cjs` | 1 (9 of 9 new tests fail: `pushRef is not a function`, missing `node_id`, ...) | FAIL (correct) |
| GREEN (task 1) | `node --test .../gh-fake.test.cjs` | 0 (55 pass) | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="49-01 branches" .../gh-fake.test.cjs` | 1 (13 of 13 new tests fail: `unsupported: api graphql ...`, `humanMergePr is not a function`) | FAIL (correct) |
| GREEN (task 2) | `node --test .../gh-fake.test.cjs` | 0 (68 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 (68 pass) | PASS |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 (1242 tests, 225 suites, 0 fail) | PASS |

### Full repo suite (`npm test` equivalent, run in the worktree)

7485 tests, 1198 suites: 7426 pass, 9 fail, 50 skipped. Every failure is a daemon-spawning test in `devflow-watch.test.cjs` (foreground start/stop, `--project` start) or `handoff-e2e.test.cjs` (the handoff pipeline). None of them import `gh-fake`; this TRD changes only `gh-fake.cjs` and `gh-fake.test.cjs` (`git diff --stat a22397a3..HEAD`: 2 files).

These are environmental, not caused by 49-01 (Deferred Issue, out of scope):

- the same files, same base code, pass 22/22 (`devflow-watch.test.cjs`) when run from the main checkout;
- run in isolation inside this worktree they fail again (the failing subset varies between runs: 3 vs 5 of the watch tests), so it is not a one-off collision with my own run;
- the sibling worktree 49-03, with a different diff, fails the same 8 daemon tests in its own full run.

The daemon cannot start reliably under `.df-worktrees/<repo>/<id>` in this environment. Worth a separate look before the wave-merge verification run, which will be in the main checkout.

## Test list coverage

Tests 1-4, 9 and 12 are `describe('49-01 pull requests')`; tests 5-8, 10, 11 and 13 are `describe('49-01 branches, statuses and merge')`; test 14 is the untouched pre-existing file. Extra cases beyond the TRD list: 1 (gh issue list hides PRs; label-filtered REST list), 3b (create validation, duplicate PR, `owner:branch` head), 5b (number/REST-id/wrong-repo/missing-oid refusals), 9b (merge_method), 11b (delete drops the link), 12b (refs seeding), 13b (keyword grammar, dedup, closed issues and PRs skipped), 13c (REST merge closes keywords, queued PR completed by a human, misuse throws), 15 (caller `graphql` handler fall-through), 16 (Pitfall 1 end to end).

## Notes for later TRDs (fake-only contract)

- PR records live in `fake.issues` with a `pr` object: `{head:{ref,sha}, base:{ref}, draft, merged, mergedAt, mergeSha, mergeMethod, queued, author}`. `pr.mergeMethod` is how a flusher test asserts the method it sent.
- `GET pulls/{n}` includes `queued` (fake-only). The fake has no GraphQL `mergeQueueEntry` read; 49-10 should detect "already queued" from `queued` and record the live-API field to verify (as its error-recovery note says).
- `enqueuePullRequest` is idempotent here (a second call returns the same entry); real GitHub's behaviour on a re-enqueue is unverified. It errors for: no queue / base is not the default branch, draft, not open.
- `statuses/{sha}` and `humanMergePr` do not require the sha or branch to be known to the fake beyond what each route states; `POST statuses` accepts any sha.
- `humanMergePr` throws on an unknown method, a non-PR number, an already merged PR and a closed PR.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 5 counted the helper's own setup calls**
- **Found during:** Task 2 GREEN
- **Issue:** the RED test asserted `fake.calls().length === 3`, but `fakeWithObjectiveIssue` made two REST reads first, so it saw 5. The implementation was right; the assertion was wrong.
- **Fix:** the test now snapshots the call and write counts after setup and compares deltas; it also asserts the write is the `createLinkedBranch` mutation.
- **Files modified:** plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
- **Commit:** 31765985 (shipped with the Task 2 GREEN commit)

### Dispatch notes

- The first `exec-context check` (run from the main checkout's cwd with `--repo` pointing at the worktree) claimed the main checkout for 49-01. I released that claim with `exec-context release --repo /Users/justin/dev/devflow-claude --id 49-01` and re-ran the check under `--cwd` the worktree, which passed (`checkout` = the worktree, branch `df/exec-49-01`). Parallel siblings were not affected.

Otherwise: TRD executed as written. Not done, by choice: the fake does not refuse a REST merge on a queue-required branch (see key-decisions).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (PR records on the shared counter; all listed REST routes; 422 No commits; built-in GraphQL with fall-through; createLinkedBranch null on an existing name; comment authors, `viewer`, `seedComment {login}`, seeded assignees; `humanMergePr` with `closeKeywordCap`; every pre-existing test unchanged)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
- FOUND commits (`git log --oneline a22397a3..HEAD`): 47976835, e5981c63, 35bd9f25, 31765985
- Working tree clean apart from this SUMMARY at the time of the check
