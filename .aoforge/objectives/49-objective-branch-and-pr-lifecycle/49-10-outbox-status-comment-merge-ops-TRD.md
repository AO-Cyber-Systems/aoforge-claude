---
objective: 49-objective-branch-and-pr-lifecycle
trd: "10"
type: standard
wave: 3
depends_on: ["49-01", "49-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
autonomous: true
requirements: [GPR-03, GPR-04]
must_haves:
  truths:
    - "`post-status {id, context}` posts a commit status on the PR head sha (resolved from the PR at flush when `payload.sha` is absent); a repeat with the same state and description writes nothing"
    - "`upsert-pr-comment {id, kind}` keeps one sticky, marker-keyed comment per kind on the objective PR (e.g. `wiki-diff`), split into `devflow:part=i/n` parts when over the comment limit, patched in place on re-flush"
    - "`pr-merge {id}` merges with `payload.method` (default from config, `squash`) when the base branch has no merge queue, and enqueues the PR (`enqueuePullRequest`) when it has one; an already-merged or already-queued PR is a no-op; a draft PR halts"
    - "`delete-branch {id}` deletes the objective branch ref on GitHub; already-deleted (404/422) is success; it refuses the default branch"
    - "Every existing outbox and flusher test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-outbox.cjs
      provides: "OP_KINDS post-status, upsert-pr-comment, pr-merge, delete-branch"
    - path: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
      provides: "handlePostStatus, handleUpsertPrComment, handlePrMerge, handleDeleteBranch"
  key_links:
    - "Uses 49-01 fake statuses/merge/queue/refs routes and 49-05 PR mapping; consumed by 49-11 (verify pass: status + wiki diff) and 49-12 (merge + reconcile)"
---

# TRD 49-10: Outbox ops for verification status, PR comments, merge and branch delete

<objective>
Add the remaining PR-side writes as outbox ops so verify-pass and merge inherit pacing, offline queueing and idempotent replay:
the `devflow/verification` commit status, sticky PR comments (the wiki diff), the merge (direct or via queue), and the branch delete.

Purpose: GPR-03 (status green, wiki diff posted), GPR-04 (merge with queue where supported, branch deleted).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-10): ...`), then implementation (`feat(49-10): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- gh-outbox.cjs stays hook-cheap (builtins + sync-state). Flusher is the only writer.
- Same test harness as 49-05 (fake, `_setRunGh`, fake clock, `hermeticEnv`, `makeStoreProject({store:true})`, seeded `prs['49']`).
  Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Decision 1 (orchestrator, adopted): locally post a commit status `devflow/verification`; a check run only when running as an App
  (objective 50).** GitHub's REST docs: only GitHub Apps can create check runs; OAuth apps and users cannot. The locked local identity
  is the developer's `gh` token, so a commit status is the only feasible local implementation of "check run green". This TRD implements
  the status; objective 50's App Action adds the check run.
- **Decision 5 (orchestrator, adopted): merge method defaults to squash, configurable via `github.pr.merge_method`
  (`squash|merge|rebase`); use the merge queue where the base branch has one.** Queue detection is at flush: GraphQL
  `repository.mergeQueue(branch:<base>)`; non-null → `enqueuePullRequest(pullRequestId)` (no method; the queue's rules apply); null →
  `PUT pulls/{n}/merge {merge_method}`. Note for objective 50: squash keeps `Refs #` trailers in the PR's commit list, not on the default
  branch (the squash commit carries the PR title and `Closes` lines).
- **Op shapes** (exact keys):
  - `post-status`: target `{id, context}`; payload `{state: 'success'|'failure'|'pending'|'error', description, sha?, target_url?}`;
    description ≤ 140 chars (GitHub limit) — validated.
  - `upsert-pr-comment`: target `{id, kind}`; payload `{mode:'replace', text}`.
  - `pr-merge`: target `{id}`; payload `{method: 'squash'|'merge'|'rebase'}`.
  - `delete-branch`: target `{id}`; payload `{branch}`.
- **PR comments are issue comments** on the PR number: reuse the `upsert-comment` path (`commentMarker`, `findCommentsByMarker`,
  `splitParts`) with the PR number as the issue ref, marker id = objective id, kind as given. A shared helper is fine; no duplication.
- **Merge failures**: 405 not mergeable / draft → halt for a human (report names the PR and reason); 409 head changed → pending.

## Test list

1. validateOp: each new kind accepts its exact shape; rejects unknown keys, bad state, description > 140, method outside the three,
   delete-branch without branch.
2. post-status without sha → handler reads `pulls/{n}` head sha and posts there; fake `commits/{sha}/status` has `devflow/verification`
   success.
3. post-status repeat with identical state+description → zero writes; changed state → one write.
4. upsert-pr-comment kind `wiki-diff` with short text → one comment on the PR number with marker `devflow:id=49 kind=wiki-diff`;
   re-flush identical → zero writes; changed text → PATCH in place.
5. upsert-pr-comment with text over the comment limit → n parts with `devflow:part=i/n`; shorter text later → surplus parts re-marked
   superseded (existing behaviour).
6. pr-merge on a ready PR, no queue → PUT merge with `squash`; PR merged; re-flush → no write.
7. pr-merge with `mergeQueue:true` on the fake → `enqueuePullRequest` once; PR still open and queued; re-flush → no write.
8. pr-merge on a draft PR → halted, report names the PR and "draft".
9. delete-branch → ref gone on the fake; repeat → success, no error; branch equal to the default branch → halt.
10. Every existing gh-outbox and gh-outbox-flush test passes.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Op schemas (test 1)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</files>
  <action>
RED: test 1; commit `test(49-10): status, PR comment, merge and branch-delete op schemas`.
GREEN: four `OP_KINDS` entries following the `upsert-comment` (L249) style. Commit `feat(49-10): op schemas for status, PR comment,
merge and branch delete`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Test 1 passes; prior outbox tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flusher handlers (tests 2-10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 2-9 in `describe('49-10 PR status, comments, merge, delete')`; commit `test(49-10): flusher PR lifecycle ops`.
GREEN: `handlePostStatus`, `handleUpsertPrComment` (factor the comment upsert so issue and PR refs share it), `handlePrMerge` (read PR:
merged → noop, draft → halt; GraphQL mergeQueue probe on `base.ref`; queued check via `mergeQueueEntry` or the fake's queued flag;
enqueue or PUT), `handleDeleteBranch`. Register in `HANDLERS`; extend `classifyFailure` for 405 (halt) and 409 (pending) on these kinds
only. Commit `feat(49-10): flusher posts status, PR comments, merges and deletes the branch`. Run the gh-* suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 2-10 pass; gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-outbox-flush.cjs`: `handleUpsertComment` ~L920 (marker, `findCommentsByMarker`, part split, superseded re-mark), `classifyFailure` L86, `sendJson` L148, `HANDLERS` L1086.
- `gh-trd.cjs` `splitParts` L746 and `COMMENT_MAX_CHARS`.
- Research "Code Examples": commit status POST, merge-queue probe.
</codebase_examples>
<anti_patterns>
- `POST /check-runs` with the developer token: 403 (Pitfall 5).
- `gh pr merge --squash` when a queue is required: the queue owns the method (Pitfall 8).
- Treating "merged" as synchronous after enqueue: with a queue the merge happens later; reconcile (49-12) handles "after merge".
</anti_patterns>
<error_recovery>
- If the fake's GraphQL `mergeQueueEntry` field is missing, detect "already queued" from the fake's `queued` flag via `pulls/{n}` and
  note the live-API field to verify in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- Seam guard green; no `check-runs` endpoint anywhere in lib (grep in the SUMMARY).
</verification>

<success_criteria>
Verification status, the wiki-diff comment, the merge (queued where supported) and the branch delete are all idempotent outbox ops.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-10-SUMMARY.md`
</output>
