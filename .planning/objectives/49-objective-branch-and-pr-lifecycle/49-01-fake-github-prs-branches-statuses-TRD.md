---
objective: 49-objective-branch-and-pr-lifecycle
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
autonomous: true
requirements: [GPR-01, GPR-03, GPR-04, GPR-05]
must_haves:
  truths:
    - "Pull requests in the fake are issue records with a `pull_request` object, drawn from the SAME `nextIssue` counter, so an issue and a PR never share a number and PR comments are issue comments"
    - "The fake answers the REST routes objective 49 uses: `repos/o/r` (default_branch, node_id), `user` (viewer login), `repos/o/r/pulls` GET(head,state)/POST, `pulls/{n}` GET/PATCH, `pulls/{n}/merge` PUT, `statuses/{sha}` POST, `commits/{sha}/status` GET, `git/ref/heads/{b}` GET, `git/refs/heads/{b}` DELETE"
    - "POST pulls with a head whose tip equals the base tip returns 422 `No commits between <base> and <head>`, as GitHub does"
    - "Built-in GraphQL handlers answer createLinkedBranch, issue.linkedBranches, markPullRequestReadyForReview, repository.mergeQueue and enqueuePullRequest; any other query still goes to the caller's `graphql(argv)` handler"
    - "createLinkedBranch on a name that already exists returns `linkedBranch: null` (Pitfall 2) and calls `onCreateBranch(name, oid)` only on success"
    - "Comments carry an author login: API-posted comments use the fake viewer (`viewer` option, default `devflow-bot`, so every existing test is unchanged); `seedComment(n, body, {login})` and seeded `assignees` support scope-acceptance tests"
    - "`humanMergePr(n, {method})` marks a PR merged and closes each `Closes #N` issue only when base is the default branch, honouring an optional `closeKeywordCap` so reconcile's straggler path is testable"
    - "Every pre-existing gh-fake test passes unchanged"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "PR records, PR/branch/status REST routes, built-in GraphQL lifecycle handlers, comment authors, assignees, humanMergePr, mergeQueue option"
    - path: plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
      provides: "one case per addition (the file's own rule)"
  key_links:
    - "Consumed by every later 49 TRD: 49-05/49-10 flusher handlers, 49-06 scope gate, 49-09 gh pr start, 49-12 reconcile, 49-14 e2e"
---

# TRD 49-01: Fake GitHub learns pull requests, linked branches, statuses and comment authors

<objective>
Extend the stateful fake GitHub (`__fixtures__/gh-fake.cjs`) so the whole objective-49 lifecycle (linked branch, draft PR, ready,
commit status, merge or queue, branch delete, comment authors and assignees) can be tested without the real API.

Purpose: test infrastructure for GPR-01, GPR-03, GPR-04 and GPR-05. Output: an additive fake plus one test per addition.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: each addition gets a failing case in `gh-fake.test.cjs` first (`test(49-01): ...`), then the fake change (`feat(49-01): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Purely additive. Default behaviour (no new options passed) must be identical; the existing gh-fake and gh-* suites are the guard.
- Hand-written fixture data only (`no_llm_test_data`); no property-based tests; never real GitHub, never the real `~/.claude`, never port 8080.

## Decisions

- **DevFlow drives PRs through `gh api` only** (REST + GraphQL), never `gh pr ready|merge|create` or `gh issue develop --checkout`.
  So the fake needs routes, not new `pr` argv nouns. This keeps every PR write visible to the flusher seam and the fake.
- **PR records**: `{number, pull_request:{}, title, body, state:'open'|'closed', draft, merged:false, merged_at:null, head:{ref, sha},
  base:{ref}, node_id:'PR_<n>', user:{login:viewer}, labels:[]}` stored alongside issues. The REST issues list includes them (as GitHub
  does); label-filtered lists include them only if labelled.
- **Branch model**: the fake keeps `refs` = `{name: sha}` seeded with `{[defaultBranch]: 'base0000…'}` (options `defaultBranch`, default
  `main`, and `refs`). `createLinkedBranch` adds the ref at `oid`; `pushRef(name, sha)` (test helper) advances one, standing in for a
  `git push` the test made to its temp remote. `onCreateBranch(name, oid)` lets a test mirror the ref into a bare git repo.
- **Merge queue**: option `mergeQueue: false` (default). When true, `repository.mergeQueue(branch)` returns `{id:'MQ_1'}` for the default
  branch and `enqueuePullRequest` records `pr.queued = true` without merging; `humanMergePr` later completes it.
- **Statuses**: `statuses[sha]` = list, newest first; `commits/{sha}/status` returns `{state, statuses}` combined per context (latest wins).

## Test list

1. Default options: an existing create-issue + create-PR sequence numbers them 1 and 2 (shared counter); `issue list` (REST `repos/o/r/issues`)
   returns both, the PR with `pull_request` set.
2. `GET repos/o/r` → `{default_branch:'main', node_id:'R_1'}`; `GET user` → `{login:'devflow-bot'}`; with `viewer:'alice'` → `alice`.
3. `POST repos/o/r/pulls {title, head:'df/objective-49-x', base:'main', body, draft:true}` after `pushRef('df/objective-49-x','c1')` → 201 PR
   JSON with number, node_id, draft true; `GET pulls?head=o:df/objective-49-x&state=all` finds it; `PATCH pulls/{n} {body}` updates it.
4. POST pulls when the head ref equals the base tip → exit non-zero, stderr contains `No commits between main and <head>`, HTTP 422.
5. GraphQL `linkedBranches` on an issue with none → empty nodes; `createLinkedBranch(issueId, oid, name, repositoryId)` → linkedBranch with
   `ref.name`; `onCreateBranch` called once with `(name, oid)`; a second `linkedBranches` read lists it.
6. `createLinkedBranch` with an existing ref name → `{data:{createLinkedBranch:{linkedBranch:null}}}`, no callback, refs unchanged.
7. `markPullRequestReadyForReview(pullRequestId)` → `isDraft:false`; on an already-ready PR it stays ready (no error).
8. `mergeQueue(branch:'main')` → null by default; with `mergeQueue:true` → `{id}`; `enqueuePullRequest` sets queued, PR still open.
9. `PUT pulls/{n}/merge {merge_method:'squash'}` → `{merged:true}`, PR closed+merged; on a draft PR → 405 `Pull Request is still a draft`.
10. `POST statuses/{sha} {state:'success', context:'devflow/verification', description}` then `GET commits/{sha}/status` → state success,
    one entry for that context; a second POST with `failure` → combined state failure, still one entry for the context.
11. `DELETE git/refs/heads/df/objective-49-x` → 204 and ref gone; a second DELETE → 422 `Reference does not exist`; `GET git/ref/heads/<b>`
    → `{object:{sha}}` or 404.
12. Comments: an API-posted comment has `user.login === viewer`; `seedComment(5, 'text', {login:'mallory'})` stores mallory; seeded issue
    `assignees:['alice']` appear in `GET issues/5` as `[{login:'alice'}]`.
13. `humanMergePr(n)` on a PR with body lines `Closes #1`, `Closes #2` to base main → both issues closed `completed`; with base `release`
    → none closed; with `closeKeywordCap:1` → only #1 closed.
14. Every pre-existing gh-fake test passes (run the file).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PR records, repo/user/pulls/merge routes (tests 1-4, 9, 12)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 1-4, 9 and 12 in `describe('49-01 pull requests')`. Commit `test(49-01): fake pull requests and comment authors`.
GREEN: add options `viewer`, `defaultBranch`, `refs`; PR records on `nextIssue`; REST routes `repos/o/r`, `user`, `pulls` (GET filters
`head=<owner>:<branch>` and `state`), `pulls/{n}` GET/PATCH, `pulls/{n}/merge` PUT; replace the hard-coded `devflow-bot` author in
`addComment` (L212) with `viewer`; add `seedComment` and seeded `assignees`; `pushRef` helper. Commit `feat(49-01): fake pull requests,
viewer login and assignees`.
# PATTERN: route the new REST paths through the same `api` dispatcher the issue routes use (see `dispatch` L870 and the api handler).
# GOTCHA: `--method PATCH/PUT/DELETE` and `--input -` body handling must match how `gh-outbox-flush.sendJson` (L148) calls `gh api`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</verify>
  <done>Tests 1-4, 9, 12 pass; all prior gh-fake tests pass unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Linked branches, ready, merge queue, statuses, refs, humanMergePr (tests 5-8, 10, 11, 13)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs, plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</files>
  <action>
RED: tests 5-8, 10, 11, 13 in `describe('49-01 branches, statuses and merge')`. Commit `test(49-01): fake linked branches, statuses, merge`.
GREEN: built-in GraphQL handlers matched on the query text (`createLinkedBranch`, `linkedBranches`, `markPullRequestReadyForReview`,
`mergeQueue(`, `enqueuePullRequest`), falling through to the caller's `graphql(argv)` handler (L672) for everything else; options
`onCreateBranch`, `mergeQueue`, `closeKeywordCap`; `statuses/{sha}` POST and `commits/{sha}/status` GET; `git/ref/heads/{b}` GET and
`git/refs/heads/{b}` DELETE; `humanMergePr(n, {method})` exported on the fake object. Then run the whole gh-* suite. Commit
`feat(49-01): fake linked branches, merge queue and commit statuses`.
# CRITICAL: a mutation must be recorded in `fake.writes()` and a query must not, matching gh-client's `isWriteArgs` classification.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 5-8, 10, 11, 13 pass; whole gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `__fixtures__/gh-fake.cjs`: `createFakeGitHub` L135, `parseArgs` L85, `addComment` L212 (hard-coded `devflow-bot`), graphql delegation L672, `dispatch` L870 (`issue|label|api|auth|--version`).
- `gh-outbox-flush.cjs` L131-160 `getJson`/`getList`/`sendJson`: the exact `gh api` argv shapes the fake must accept.
- `__fixtures__/gh-store-fixtures.cjs` `makeStoreProject` L304 (`fakeOptions`) and `hermeticEnv` L399.
</codebase_examples>
<anti_patterns>
- A separate PR number counter (Pitfall 9): it hides issue/PR collisions in mapping and comment lookups.
- Changing the default comment author: dozens of 47/48 tests read `devflow-bot`.
</anti_patterns>
<error_recovery>
- If an existing test enumerates all issues and now sees PRs, the test created PRs by accident; PRs exist only when a test creates one, so
  investigate rather than filter.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- gh-fake.test.cjs has one case per addition listed above; gh-* suite green.
</verification>

<success_criteria>
The fake can stand in for GitHub across branch creation, draft PR, ready, status, merge (direct or queued), keyword closing, branch delete,
and authored comments, with no change for existing tests.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-01-SUMMARY.md`
</output>
