---
objective: 49-objective-branch-and-pr-lifecycle
trd: "10"
subsystem: github-store
tags: [gh-outbox, commit-status, pr-comment, pr-merge, merge-queue, delete-branch, idempotent-replay]

requires:
  - objective: 49-01
    provides: fake GitHub statuses, merge, merge-queue and refs routes; PR state on `issue.pr`
  - objective: 49-05
    provides: PR mapping (`getPr`), `findObjectivePr`, `repoInfo`, `pending` failure class, `pr:<objective>` base key
provides:
  - "gh-outbox: op kinds `post-status`, `upsert-pr-comment`, `pr-merge`, `delete-branch` (15 kinds in all)"
  - "gh-outbox-flush: handlePostStatus, handleUpsertPrComment, handlePrMerge, handleDeleteBranch; `classifyFailure(r, kind)`; `not_mergeable` failure class"
affects: [49-11, 49-12]

tech-stack:
  added: []
  patterns:
    - "A PR's sticky comment reuses the issue-comment replace path through an `issueRef`-shaped PR ref (`kind: 'pr'`), keyed apart in the base store as `<id>#pr-<kind>`"
    - "A status code means something only for the op kind that asked: `classifyFailure(r, 'pr-merge')` maps 405 and 409, every other kind is unchanged"
    - "The merge pins the head sha it read, so a push between verify and merge answers 409 (pending) rather than merging unverified code"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs

key-decisions:
  - "Local verification is a commit status (`devflow/verification`), never a check run: only a GitHub App can create one (Decision 1); `check-runs` appears nowhere in lib"
  - "`pr-merge` payload.method is optional: absent means `github.pr.merge_method`, then squash. A merge queue takes no method"
  - "Queue detection and 'already queued' come from ONE GraphQL read (`repository.mergeQueue(branch)` plus `pullRequest(number).isInMergeQueue`); the fake's `queued` flag on `pulls/{n}` is honoured too"
  - "A 405 on a merge is a new class `not_mergeable` (halts); a 409 is `pending`. Both only for `pr-merge`"
  - "delete-branch treats 404 and the 422 `Reference does not exist` as already deleted; any other 422 is a failure (a protected-branch 422 must not read as success)"

metrics:
  tasks: 2
  files: 4
  tests-added: "outbox +7 (schemas) and 1a extended to 15 kinds; flusher +21"
tokens_input: 6974669
tokens_output: 63990
tokens_cache_read: 6814367
tokens_cache_write: 160186
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 10: Outbox ops for verification status, PR comments, merge and branch delete Summary

Four idempotent PR-side outbox ops: a `devflow/verification` commit status, a sticky marker-keyed PR comment (split into parts when long), a merge that enqueues where the base branch has a queue and squash-merges otherwise, and a branch delete that treats "already gone" as success.

## Performance

- Tasks: 2 of 2 (each RED committed before its GREEN)
- Files: 4 modified, none created

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 Op schemas | RED | 8770a29e | test(49-10): status, PR comment, merge and branch-delete op schemas |
| 1 Op schemas | GREEN | 069d2409 | feat(49-10): op schemas for status, PR comment, merge and branch delete |
| 2 Flusher handlers | RED | 8f750522 | test(49-10): flusher PR lifecycle ops |
| 2 Flusher handlers | GREEN | 76a26a60 | feat(49-10): flusher posts status, PR comments, merges and deletes the branch |

## What was built

**Schemas (`gh-outbox.cjs`).** Exact shapes, all targeting an objective id (a PR belongs to an objective):

- `post-status` target `{id, context}`, payload `{state: success|failure|pending|error, description (1-140 chars), sha?, target_url?}`
- `upsert-pr-comment` target `{id, kind}`, payload `{mode:'replace', text}`
- `pr-merge` target `{id}`, payload `{method?: squash|merge|rebase}`
- `delete-branch` target `{id}`, payload `{branch}` (a usable git branch name)

Same-target ops coalesce like every other kind (latest payload wins); a different `context` or `kind` is a different op.

**Handlers (`gh-outbox-flush.cjs`).**

- `handlePostStatus`: resolves the PR head sha when `payload.sha` is absent, reads the combined status, and writes only when the context's state, description (and `target_url` if given) differ.
- `handleUpsertPrComment`: builds a PR ref and calls the extracted `upsertCommentOn`, which `handleUpsertComment` now also calls (no duplicated comment logic). Parts, superseded re-marking, in-place PATCH and the remote-edit halt all carry over; the halt text says "pull request".
- `handlePrMerge`: merged then no-op; closed unmerged then error; draft then halt; already queued then no-op; queue then `enqueuePullRequest`; no queue then `PUT pulls/{n}/merge {merge_method, sha}`.
- `handleDeleteBranch`: refuses the default branch before any write; `DELETE git/refs/heads/<branch>`.
- `refreshBase` learned `upsert-pr-comment`, so `gh outbox resolve` works on a halted PR comment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preflight ran from the main checkout first**
- **Found during:** preflight
- **Issue:** the first `exec-context check` ran with the session cwd in the main checkout, so it claimed (main checkout, 49-10) instead of the worktree.
- **Fix:** re-ran the check with `--cwd <worktree>` (exit 0, worktree claim recorded) and released the stray main-checkout claim with `exec-context release --id 49-10`. No code or git state was affected.

### Design choices within the TRD

- **`not_mergeable` class (new).** The TRD says "405 (halt)". The flush loop already halts on any class it does not special-case, so a distinct name was added purely so a test and the halt report can tell it from a generic `error`.
- **`classifyFailure(r, kind)` / `failFrom(r, what, kind)`** gained an optional kind argument to scope 405/409 to `pr-merge` ("on these kinds only"). Without a kind the function is unchanged; the 8d test pins that 405/409 stay `error` elsewhere.
- **`pr-merge` payload.method is optional** (the TRD's op-shape line lists it, but the truths say "default from config"). Absent is valid.
- **Merge pins `sha`** (the head sha read at flush). Not in the TRD; it is what makes 409 "head changed" meaningful and ties the merge to the sha the status was posted on.
- **Base key `<id>#pr-<kind>`** for PR comments, so a PR comment never collides with an objective-issue comment of the same kind (`49#summary`).
- **delete-branch is stricter than "404/422 is success".** The fake and real GitHub answer 422 `Reference does not exist` for a missing ref, but a 422 can also mean a protected branch; only the "does not exist" wording counts as already deleted.
- **The pr-merge handler does not write `merged_at` to the mapping.** The mapping has the field, but recording it belongs to merge reconcile (49-12), which sees the final state.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Op schemas (test 1) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (102 tests, 102 pass) | PASS |
| 2: Flusher handlers (tests 2-10) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs` | 0 (145 tests, 145 pass) | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-outbox.test.cjs` | new schema tests fail with `unknown op kind "pr-merge"` | FAIL (correct) |
| GREEN (task 1) | `node --test .../gh-outbox.test.cjs` | 102 pass, 0 fail | PASS (correct) |
| RED (task 2) | `node --test .../gh-outbox-flush.test.cjs` | 145 tests, 124 pass, 21 fail (`no handler for op kind`) | FAIL (correct) |
| GREEN (task 2) | `node --test .../gh-outbox-flush.test.cjs` | 145 pass, 0 fail | PASS (correct) |

## Validation Gate Results

| Gate | Command | Result | Status |
|---|---|---|---|
| test | `node --test .../gh-outbox-flush.test.cjs .../gh-outbox.test.cjs` | 247 pass, 0 fail | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/gh-*.test.cjs` | 1420 tests, 1420 pass | PASS |
| repo guards | `node --test plugins/devflow/devflow/bin/lib/*.repo.test.cjs` | 35 tests, 35 pass | PASS |
| no check runs | `grep -rn "check-runs" plugins/devflow/devflow/bin/lib` (non-test files) | no matches | PASS |

Full `npm test` was not run (no `node_modules` in the worktree), per the dispatch.

## Test list coverage (TRD)

1 schemas: outbox tests under "49-10 ... op schemas". 2, 2b, 3 status. 4, 4b, 5, 5b comments. 6, 6b-6e merge. 7, 7b, 7c queue. 8, 8b-8d draft, no PR, 405/409, classification. 9, 9b delete. 10 every existing outbox and flusher test passes unchanged (the only edit to an existing test is the 11 to 15 kind count in outbox test 1a, as the dispatch anticipated).

## Notes for dependents

**49-11 (verify pass: status and wiki diff)**
- Enqueue `post-status` with target `{id:'49', context:'devflow/verification'}`. Leave `sha` out and the flusher uses the PR head at flush time; the PR must exist (`upsert-pr` flushed earlier), otherwise the op is an error that names upsert-pr.
- Enqueue `upsert-pr-comment` `{id:'49', kind:'wiki-diff'}` with `{mode:'replace', text}`. Same ordering rule: the PR must exist first.
- Both ops are idempotent, so enqueueing on every verify run is safe (zero writes when nothing changed).

**49-12 (merge and reconcile)**
- `pr-merge` returning ok does NOT mean merged: with a merge queue the PR is enqueued and stays open. Reconcile must read the PR (`merged` / `merged_at`) before it treats the objective as merged, and it should record `merged_at` in the mapping (this TRD does not).
- Do not enqueue `delete-branch` until the PR is actually merged. Deleting the head branch of a queued PR would break the queue entry. `delete-branch` is safe to repeat and also covers repos that auto-delete head branches (404 / "Reference does not exist" is success).
- Halts to expect from `pr-merge`: draft, closed without merging, 405 not mergeable (`not_mergeable`), or a halted-for-human report that names the PR number and the reason. A 409 stays `pending` and the next flush retries against the new head.
- `delete-branch` never deletes the repository default branch (validation failure, nothing written).

**Live-API items to verify (the fake cannot)**
- `PullRequest.isInMergeQueue` and `Repository.mergeQueue(branch:)` are used in one GraphQL read; the fake answers only `mergeQueue`, and falls back to its own `pulls/{n}` `queued` flag. If `isInMergeQueue` is wrong on the live API, the effect is a repeat `enqueuePullRequest` on re-flush; that failure is absorbed when the message says "already in/queued" (`ALREADY_QUEUED_RE`), but the exact live wording is unverified.
- The fake's REST merge does not refuse a queue-required branch (real GitHub returns 405). The handler never uses REST merge when a queue is present, so this is covered by the probe rather than by the 405 path.
- GitHub Enterprise Server without merge queue support would fail the probe query; not handled (out of scope for this TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (status posted on resolved sha and idempotent; sticky PR comment with parts and in-place patch; merge direct or queued, no-op when merged or queued, draft halts; delete-branch idempotent and refuses the default branch; every prior outbox and flusher test unchanged and passing)
- Gate failures: None

## Self-Check: PASSED

Verified: the four modified files exist; commits 8770a29e, 069d2409, 8f750522 and 76a26a60 are on branch `df/exec-49-10`.
