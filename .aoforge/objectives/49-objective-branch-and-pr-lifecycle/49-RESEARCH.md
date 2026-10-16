# Objective 49: Objective branch and PR lifecycle - Research

**Researched:** 2026-10-01
**Domain:** GitHub linked branches, draft PRs, commit statuses/check runs, merge queue; DevFlow outbox/flusher, execute-objective worktrees, `df-tools commit`
**Confidence:** MEDIUM-HIGH (codebase findings HIGH, file:line verified; GitHub API facts HIGH where cited from docs, MEDIUM/LOW where flagged)

<user_constraints>
## User Constraints

No CONTEXT.md exists for objective 49. The constraints below come from the orchestrator's phase context and OBJECTIVE.md.

### Locked Decisions
- Everything in `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30). Do not re-litigate. The parts that apply here:
  - **PR granularity:** one PR per objective, targeting the default branch.
  - **Branch and PR lifecycle table:**
    - Execute start: branch via `gh issue develop`; linked branch; draft PR with `Closes #obj` and each TRD; pinned wiki revision in the PR body.
    - Each TRD: commits carry `Refs #trd`; worktrees merge into the objective branch; TRD status moves; SUMMARY comment.
    - Verify pass: check run green; PR marked ready; wiki diff posted.
    - Merge (queue where supported): cache pulls the final state; issues close; Project → Done; branch deleted.
  - **Scope changes:** only the objective's assignee and DevFlow. Others wait for the assignee to confirm.
  - **Merge queue:** required wherever the repo supports it; workflows get `merge_group`.
  - **Identity:** the developer's `gh` token locally; the org GitHub App in Actions.
  - **Wiki review:** wiki changes made during an objective are posted to its PR as a diff.
  - **Stacked PRs:** not planned.
  - **Rollout:** behind `github.store` (default false). Off means the objective 46 behaviour byte for byte (D-15, D-01 from objective 48).
- Requirements GPR-01..GPR-06 (OBJECTIVE.md).
- `kind: plugin`, `work: feature` → strict TDD. The failing test is committed first.
- Tests mock `gh` via `_setRunGh`, temp dirs and env overrides. They never call the real GitHub and never touch the real `~/.claude`.
- Never use port 8080.

### Claude's Discretion (no CONTEXT.md; inferred)
- Verb names and CLI shape, the mapping storage for branch/PR state, the scope-confirmation mechanism, the merge method default, and offline behaviour at execute start.

### Deferred Ideas (OUT OF SCOPE — owned by objective 50 / 51)
- GEN-01: `df-tools commit` *refusing* the default branch and unlinked branches, and the `DEVFLOW_SKIP_GH_GATE` escape (objective 50). Objective 49 only *adds the trailer* (GPR-02).
- GEN-02: post-commit/Stop hooks that flush the outbox.
- GEN-04/05: `gh setup` rulesets, required checks `devflow/linked-issue` and `devflow/planning-consistency`, `merge_group` workflow triggers, and the merge-time reconcile **Action** run as the org App. Objective 49 builds the reconcile *library and verb* that the Action will later call.
- GMD-*: backfill migration and documentation rewrite (objective 51).

### Cross-Repo Considerations
None supplied.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GPR-01 | Execute start creates the objective branch (`createLinkedBranch` / `gh issue develop`) and opens a draft PR with `Closes #obj` + every TRD + the pinned wiki revision | §1 seam, §A GitHub facts (createLinkedBranch input; a draft PR needs a commit diff), the new `upsert-pr` op, `gh-body.buildWikiSection` reuse |
| GPR-02 | Wave worktrees branch from and merge back into the objective branch; commits carry `Refs #trd` | §2: `exec-context worktree` already bases on `WAVE_BASE` and merges into the cwd checkout. §5: trailer insertion point is `cmdCommit` (misc.cjs:561) |
| GPR-03 | TRD completion updates TRD status and posts SUMMARY; verify pass posts the check run, marks the PR ready and posts the wiki diff | §3: `summaryPost` (planning-verbs.cjs:560) and `verificationPost` (:619) are the hook points. §A: check runs need a GitHub App, so a commit status is the local fallback |
| GPR-04 | After merge (queue where supported): issues closed, Project → Done, branch deleted, cache pulled | §A: merge-queue detection and `gh pr merge` queue semantics. Reconcile reuses `patch-issue`, `gh.updateProjectFields` and `gh pull --all`. §Pitfall 3: `objective complete` currently closes the issue early |
| GPR-05 | Scope changes accepted only from the assignee or DevFlow; others shown, pending confirmation | §4: `gh-trd.parseScopeComments` (gh-trd.cjs:377) ignores the author. Add an acceptance predicate plus a confirm marker |
| GPR-06 | Replaces local-only `git.branching_strategy`; complete-milestone no longer merges branches locally | §2: every `branching_strategy` site is listed (config.cjs, init.cjs:360-387, execute-objective.md:39-50, complete-milestone.md:495+, settings.md, planning-config.md) |
</phase_requirements>

## Summary

Objectives 46-48 left four seams that objective 49 can build on:
- **gh-client** (`_setRunGh`, paced `ghWrite`).
- **The outbox:** logical ops validated in `gh-outbox.OP_KINDS` and executed by one handler each in `gh-outbox-flush.HANDLERS`.
- **gh-wiki:** a pinned revision via `headSha` and `pageRevisionUrl`, plus `gh-body.buildWikiSection`.
- **Planning verbs:** `summary post` and `verification post` route through `writeThrough`, which has a local/store split.

There is no PR, branch, check-run or commit-status code anywhere in `bin/lib/`. The stateful fake (`__fixtures__/gh-fake.cjs`) implements only the `issue`, `label` and `api` nouns. It has no `pr`, no `issue develop`, no pulls/refs/statuses REST routes, and every comment's author is hard-coded to `devflow-bot`. Most of the test-infrastructure work is extending that fake.

GPR-02 is already mostly in place. `exec-context worktree` creates `df/exec-<id>` from an explicit `WAVE_BASE` and its `merge_back` merges into the checkout the orchestrator stands in (exec-context.cjs:424-456). If the orchestrator is on the objective branch, worktrees branch from it and merge back into it, and since `df/exec-*` is never pushed, no extra PRs appear. The missing pieces:
- Execute start checks out the linked branch.
- `df-tools commit` appends `Refs #<n>` (store mode only), resolved from the commit subject scope `(49-02)` through the mapping.
- The objective branch is pushed after each wave so the draft PR tracks progress.

Two GitHub facts force design choices:
1. **Check runs cannot be created with a user token.** "To create a check run, you must use a GitHub App. OAuth apps and authenticated users are not able to create" them (REST docs). The locked identity is the developer's token locally, so locally DevFlow must post a **commit status** (`POST repos/{o}/{r}/statuses/{sha}`, context `devflow/verification`). The App-run Action in objective 50 can post the real check run. This conflicts with the letter of the locked table ("check run green"), and the planner should surface it as a decision rather than silently substitute.
2. **A PR cannot be created with zero commits between base and head** ("No commits between main and branch"). Execute start must make one commit before opening the draft. The recommended commit is an empty `chore(<obj>): start objective` with `Refs #obj`, made through a new `df-tools commit --allow-empty`.

**Primary recommendation:** Add a `gh-pr.cjs` library (PR body, closing refs, lifecycle state) and an `objective-branch.cjs` git seam (one named `spawnSync('git')` site, `_setRunGit`). Add four outbox op kinds: `upsert-pr`, `pr-ready`, `post-status`, `upsert-pr-comment`. Expose verbs under `df-tools gh pr <start|sync|ready|merge|reconcile|status> <objective>` and `df-tools gh trd confirm-scope <trd> <n>`. Gate all of it on `planningMode === 'store'` so local mode stays byte for byte today's, including `git.branching_strategy`.

## Standard Stack

### Core (all existing; no new npm dependencies)
| Module | Location | Purpose | Why |
|---|---|---|---|
| gh-client | `bin/lib/gh-client.cjs` | The single `gh` spawn seam: `ghRead`/`ghWrite`/`ghPaginate`, pacing ≥1 s, secondary-limit retry, `requireEnabled` | Seam-guard test 17 makes it the only `gh` spawn site |
| gh-outbox | `bin/lib/gh-outbox.cjs` | Durable FIFO journal of logical ops; `OP_KINDS` schema (:145-296), `validateOp` (:302), `enqueue` (:533) | Every GitHub issue/PR write goes through it (proposal "Write and read paths") |
| gh-outbox-flush | `bin/lib/gh-outbox-flush.cjs` | One idempotent handler per kind; `HANDLERS` (:1086), `executeOp` (:1104), `flush` (:1166), `classifyFailure` (:86), `getJson`/`getList`/`sendJson` (:131-160) | The only writer (seam-guard test 21) |
| gh-body | `bin/lib/gh-body.cjs` | Markers, `mergeManaged` (:400) for human-text-preserving managed sections, `buildWikiSection` (:523) for the pinned-revision link | Reuse it for the PR body: same marker grammar, same remote-edit model |
| gh-wiki | `bin/lib/gh-wiki.cjs` | `headSha` (:527) is the revision to pin; `pageRevisionUrl` (:296); `_setRunGit` (:354) git seam | The wiki diff must come from this module (the only git site for the wiki) |
| gh-comments / gh-trd | `bin/lib/gh-comments.cjs`, `gh-trd.cjs` | `readTrdState` (:211), `enqueueScope` (:362), `freezeTrd` (:428); `parseScopeComments` (gh-trd.cjs:377), `effectiveSpec` (:437), `splitParts` (:746) | GPR-05 acceptance goes here; `splitParts` for oversized wiki-diff comments |
| gh-mapping | `bin/lib/gh-mapping.cjs` | v3 mapping; `trds[id].issue_number` resolves `Refs #N` | Never `parseInt` an id (seam-guard test 18) |
| planning-verbs | `bin/lib/planning-verbs.cjs` | `writeThrough` (:228), `enqueueAndFlush` (:169), `summaryPost` (:560), `verificationPost` (:619), `objectiveSetStatus` (:485), `STATUS_PATCH` (:412) | GPR-03 hook points |
| planning-mode | `bin/lib/planning-mode.cjs` | `planningMode(main)` → `local`/`store`; `resolveMainRoot` | The one reader of `github.store` for planning decisions |
| gh (legacy) | `bin/lib/gh.cjs` | `updateProjectFields` (:1078) via gh-project discovery; `projectFieldUpdates` (:1217) | Project → Done in reconcile |
| exec-context | `bin/lib/exec-context.cjs` | `cmdExecContextWorktree` (:378): `df/exec-<id>` branch from `--base`, `merge_back` into the cwd checkout | GPR-02 worktree mechanics already exist |

### External CLIs (verified locally 2026-10-01)
| Tool | Version | Use |
|---|---|---|
| `gh` | 2.102.0 | `gh issue develop <n> --name <b> --base <default> [--list]`, `gh pr ready`, `gh pr merge` (queue-aware) |
| `git` | 2.50.1 | fetch/switch/push/branch -d; `commit --allow-empty` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| GraphQL `createLinkedBranch` via `ghWrite(['api','graphql',...])` | `gh issue develop` | `gh issue develop` uses the same mutation, but with `--checkout` it runs git *inside* gh (invisible to the fake and the git seam). **Use GraphQL `createLinkedBranch`**: it returns JSON, `isWriteArgs` classifies it as a write (mutation), and the fake can answer it via its `graphql` handler. Use `gh issue develop --list` (or GraphQL `linkedBranches`) only to read. |
| `gh pr create --draft` | REST `POST repos/{o}/{r}/pulls {draft:true}` via `sendJson` | REST returns the PR JSON (`number`, `node_id`, `body`) for the mapping and remote-edit base. Same pattern as the flusher's issue creation. **Use REST.** |
| Check run (`POST /check-runs`) | Commit status (`POST /statuses/{sha}`) | A check run is App-only. A commit status works with the developer's token and shows in the PR checks list. **Use a status locally**; the objective 50 Action can add a check run. Surface this as an open decision. |

## Architecture Patterns

### Recommended module layout
```
plugins/devflow/devflow/bin/lib/
├── gh-pr.cjs              # pure-ish: PR body builder (closes + wiki + summary sections), closing-ref list,
│                          #   lifecycle state read (ghRead/ghPaginate only), merge-queue probe. NO ghWrite.
├── gh-pr.test.cjs
├── objective-branch.cjs   # the objective-branch git seam: _setRunGit, fetch/switch/push/delete,
│                          #   allow-empty start commit, rev-parse of default-branch tip. Named GIT_SITE.
├── objective-branch.test.cjs
├── gh-pr-cli.cjs          # `gh pr <start|sync|ready|merge|reconcile|status>` thin wrappers (store-cli style exits)
├── gh-pr-cli.test.cjs
└── gh-outbox.cjs / gh-outbox-flush.cjs   # + 4 op kinds and handlers
```
Add `gh-pr.cjs` and `gh-pr-cli.cjs` to `GUARDED` and `NO_DIRECT_WRITE` in `gh-seam.repo.test.cjs` (:29-46). Add `objective-branch.cjs` to `GIT_SITES` (:121) with a reason string. Consider adding a "every `gh-*.cjs` is guarded" check like test 22 does for `planning-*.cjs`. Nothing enforces that today.

### Pattern 1: New outbox op kinds (schema + handler, both sides)
**What:** Each new GitHub write is a logical op: `{kind, target, payload}`, with exact target fields, a `check()` in `OP_KINDS`, and an idempotent handler in `HANDLERS`.
**Ops to add:**

| kind | target | payload | Handler behaviour |
|---|---|---|---|
| `upsert-pr` | `{id}` (objective id) | `{branch, base, title, sections:{closes, wiki, summary}, draft:true}` | Find the PR by mapping `prs[id].number`, else list `repos/{r}/pulls?head={owner}:{branch}&state=all`, else POST. On an existing PR, `mergeManaged` the sections into the current body and PATCH only when changed. Store the base hash from the returned body (D-24). **Derive `closes` at flush time** from the mapping (objective issue + every `trds` entry with `role:'trd'` for that objective), the way `patch-body` `derive.trds` does, so gap-closure TRDs added later are included. |
| `pr-ready` | `{id}` | `{}` | GraphQL `markPullRequestReadyForReview(input:{pullRequestId})` using `prs[id].node_id`. A no-op if `isDraft` is already false. |
| `post-status` | `{id, context}` | `{sha, state:'success'|'failure'|'pending', description, target_url?}` | `POST repos/{r}/statuses/{sha}`. Idempotent: GitHub keeps the latest per context; skip if the latest status for the context already matches. |
| `upsert-pr-comment` | `{id, kind}` (kind `wiki-diff`) | `{mode:'replace', text}` | Same as `upsert-comment` but on the PR number. PR comments are issue comments (`repos/{r}/issues/{pr}/comments`), so reuse `findCommentsByMarker` and the part split. |

`patch-issue` also needs `labels_remove` (it currently allows only `type, state, state_reason, labels_add`, gh-outbox.cjs:193-214) if TRD status is shown as a label.

### Pattern 2: Store-mode gate, local mode untouched (D-01)
```js
// Source: planning-verbs.cjs:228-262 (writeThrough) — the shape every new verb follows
const { mode } = planningMode.planningMode(main);
if (mode === LOCAL) return { ok: true, skipped: true, reason: 'pr lifecycle needs github.store: true', exit: 0 };
```
- Every new verb (`gh pr *`, `confirm-scope`) exits 0 with `skipped` in local mode and makes zero `gh` calls. The pattern is `client.requireEnabled` → `skipped`, plus `emitResult`.
- `df-tools commit` adds no trailer in local mode. The commit bytes stay identical. Test this explicitly.
- `init execute-objective` keeps emitting `branching_strategy`/`branch_name` in local mode. In store mode it adds `pr_lifecycle: true`, `objective_branch`, `pr_number`, and `branching_strategy_ignored: <value>` when the local setting is not `none`.

### Pattern 3: Execute-start sequence (GPR-01)
1. `gh pr start <obj>`. This is online-required, like the `gh trd` verbs (CLAUDE.md "open decision").
   a. Resolve the objective issue number and node id (mapping `objectives[id].issue_id`; node id via `gh api repos/{r}/issues/{n} --jq .node_id`).
   b. Read the linked branches (GraphQL `issue.linkedBranches`). If one exists, reuse it (idempotent).
   c. Otherwise call `createLinkedBranch(input:{issueId, oid:<default-branch tip sha>, name, repositoryId})`. Name it `df/objective-<NN>-<slug>`, reusing `objective_branch_template` so names stay familiar.
   d. Local: `git fetch origin <branch>`, then `git switch <branch>` (objective-branch.cjs).
   e. `df-tools commit --allow-empty "chore(<obj>): start objective <obj>"` (trailer `Refs #obj`), then `git push -u origin <branch>`.
   f. Enqueue `upsert-pr` with the pinned wiki revision (`gh-wiki.headSha`, the same sha the objective body's `wiki` section pins) and flush.
   g. Optionally freeze each TRD (`gh trd freeze`). The proposal says "Frozen at execute start", and nothing calls freeze today (grep finds no `freeze` in workflows/agents). See Open Question 4.
2. Record `prs[<obj>] = {branch, number, node_id, base, wiki_base_sha, head_sha_verified?}` in a new top-level mapping map.

### Pattern 4: Mapping storage for branch/PR state
`readLegacyEntry` (gh-mapping.cjs:193) and `setEntry` (:491) **normalise objective entries to exactly three fields**, so extra fields on `objectives[id]` are silently dropped. Add a top-level `prs` map instead:
- add it to `KNOWN_TOP_LEVEL` (:169);
- render it in `serializeMapping` (:394) only when non-empty, as `entities` is, so existing mappings stay byte-stable;
- add accessors `getPr`/`setPr`.

`migrateMapping` already preserves unknown top-level keys (:276), but explicit ordering keeps the output stable.

### Pattern 5: Scope acceptance (GPR-05)
- Extend `parseScopeComments` (gh-trd.cjs:377) to carry `author: c.user && c.user.login`, and give `effectiveSpec` (:437) an optional `accept(scope) -> 'accepted'|'pending'` predicate. gh-trd stays pure; the predicate is built in gh-comments.
- Accepted when any of these holds:
  - the author is in the **objective** issue's `assignees`, read once per `readTrdState`;
  - the author is the configured App login (`github.app_login`, absent by default);
  - the scope `n` has a matching `scope n=K` row in the spec-rev log (`parseSpecRev`), meaning DevFlow posted it via `enqueueScope`;
  - a later confirm comment from an assignee names it.
- The confirm marker is `<!-- devflow:scope-confirm n=K hash=<contentHash of the scope body> -->`. Binding the hash means a scope comment edited after confirmation drops back to pending.
- Pending scopes are reported in `readEffectiveSpec` → `pending:[{n, author, comment_id}]`, are excluded from `text`/`chars`/`applied`, and are excluded from `foldTrd`.
- New verb `gh trd confirm-scope <trd> <n>`. Who may confirm:
  - The caller's login (`gh api user --jq .login`, a read) must be an assignee. Otherwise the verb refuses (exit 1) with a message naming the assignees.
  - With no assignee, only DevFlow scopes apply, and a confirm needs `--force` logged through `df-tools override`.

### Anti-Patterns to Avoid
- **`gh issue develop --checkout`, or any gh flag that runs git internally:** it bypasses the git seam and the fake.
- **Closing issues with `objective set-status complete` before merge:** the issue must close through the PR's closing keyword, then reconcile. See Pitfall 3.
- **Pushing `df/exec-*` worktree branches:** that creates stray remote branches and possibly PRs. They stay local and are deleted after merge.
- **Storing PR state on `objectives[id]`:** it is dropped by `readLegacyEntry`.
- **Building PR body text by string concatenation outside `gh-body`:** use `mergeManaged` so human text in the PR description survives.
- **Calling `ghWrite` from `gh-pr.cjs` / `gh-pr-cli.cjs`:** writes belong to the flusher (seam-guard test 21). The exception is the synchronous `createLinkedBranch` at start (see Open Question 2). If it stays direct, put it in a module that is *guarded but not NO_DIRECT_WRITE*, like `gh-milestone-store.cjs` (test 22 precedent).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Spawning gh | `spawnSync('gh')` | `client.ghRead/ghWrite/ghPaginate` | Pacing, retry, budget, seam test 17 |
| Retry / offline / halt semantics | per-call try/catch | outbox op + `classifyFailure` (flush.cjs:86) | offline → pending (exit 3), 4xx → halt (exit 2) |
| Human-safe body edits | regex replace | `gh-body.mergeManaged` (:400) | Preserves text outside markers and reports drift |
| Remote-edit detection on the PR body | `updated_at` compare | flusher `saveBase`/`remoteEditCheck` (:353-378) body-hash model | `updated_at` is bumped by DevFlow's own writes (D-24) |
| Oversized comment (wiki diff) | truncation | `gh-trd.splitParts` (:746) + `devflow:part=i/n` | Lossless, already decoded by `findCommentsByMarker` |
| Wiki revision link | URL formatting | `gh-wiki.pageRevisionUrl` (:296), `gh-body.buildWikiSection` (:523) | Single place the LOW-confidence URL format lives |
| Project Status update | GraphQL by hand | `gh.updateProjectFields(issueRef, chain.org_project, {Status:'Done'})` (:1078) | Live field discovery, option ids never hardcoded |
| TRD id ↔ issue number | parsing dir names | `gh-mapping.toTrdId` / `getTrd` | Decimal ids; seam test 18 bans `parseInt` |
| Worktree provisioning | new git worktree code | `exec-context worktree` | Fixes for #86/#98/#100 are already in it |
| Exit-code plumbing | `process.exit` ad hoc | gh-store-cli `result/emit` + `EXIT` {0,1,2,3} | Consistent with `gh outbox flush` contract |

**Key insight:** Every failure mode objective 49 will hit is already handled for issues: offline, rate limit, remote human edit, idempotent replay, oversized text. PRs are issues in GitHub's number space and comment API. Model PR writes as outbox ops and they inherit all of that for free.

## Common Pitfalls

### Pitfall 1: Draft PR with no commits
**What goes wrong:** `POST /pulls` returns 422 "No commits between main and df/objective-49-…" right after `createLinkedBranch` (the branch equals the base tip).
**How to avoid:** Make an empty start commit and push it before `upsert-pr`. `cmdCommit` (misc.cjs:561) has no `--allow-empty`, so add one (store mode only, no `--files`). In the flusher, classify this 422 as `pending`, not as a halt, if it is ever hit after a crash between push and PR.
**Warning signs:** `upsert-pr` blocked with a validation 422 at execute start.

### Pitfall 2: `createLinkedBranch` cannot link an existing branch
**What goes wrong:** If the branch name already exists on the remote (a crash after a push, or a manual branch), the mutation fails or returns `linkedBranch: null` silently (community report, LOW-MEDIUM).
**How to avoid:** Read `linkedBranches` first and reuse. If the name exists but is unlinked, refuse with a clear message (rename via `--name`, or delete the remote branch). Never treat a `null` `linkedBranch` as success. `issueId` must be the issue **node id** (`I_…`), never the number or the REST id. `oid` is required.

### Pitfall 3: Objective issue closed before the PR merges
**What goes wrong:** `execute-objective.md` `update_roadmap` (:1001-1047) runs `objective complete`. In store mode that is `storeObjectiveComplete` (objective.cjs:383) → `objectiveSetStatus(complete)` → `STATUS_PATCH.complete` = `patch-issue {state:'closed'}` (planning-verbs.cjs:412). The issue closes on verify, not on merge, which contradicts GPR-04 and makes the PR's `Closes #obj` a no-op.
**How to avoid:** With the PR lifecycle active, `objective complete` writes `status: complete` but **does not enqueue the close**. Reconcile closes any issue the merge did not. Alternatively, execute-objective calls `objective set-status verifying` → `gh pr ready` and leaves `complete` to reconcile. Either way, add a test asserting zero `state:closed` ops before `gh pr reconcile`.

### Pitfall 4: Closing keywords only fire on default-branch PRs; one keyword per issue
**What goes wrong:** `Closes #1, #2, #3` closes only #1. A PR whose base is not the default branch closes nothing.
**How to avoid:**
- Emit one `Closes #N` line per issue.
- Assert `base === default_branch` (`gh api repos/{r} --jq .default_branch`) in `upsert-pr`.
- Reconcile must still verify each referenced issue is closed and close stragglers itself. The documented 10-link cap applies to *manual* links; keyword links reportedly exceed 10 (LOW confidence), and objectives here reach 23 TRDs (objective 48).

### Pitfall 5: Check runs need a GitHub App
**What goes wrong:** `POST /check-runs` with the developer's OAuth token returns 403 ("you must use a GitHub App").
**How to avoid:** Locally, post a commit **status**, context `devflow/verification`, on the PR head sha. A check run is posted only when running as the App (objective 50 Action), detected by env, e.g. `GITHUB_ACTIONS` plus an App token. Flag it to the user as a deviation from the letter of the locked table (Open Question 1).

### Pitfall 6: `isWriteArgs` misclassifies `gh issue develop --list`
**What goes wrong:** `NOUN_COMMANDS` includes `issue` and `READ_SUBCOMMANDS` lacks `develop`, so `issue develop --list` counts as a write (gh-client.cjs:129-155). It is paced, counts against the budget, and appears in `fake.writes()`.
**How to avoid:** Prefer GraphQL `linkedBranches` (a query, so correctly a read), or teach `isWriteArgs` that `develop` with `--list`/`-l` is a read. Add a gh-client test either way. `pr` is already a noun; `pr view/list/status/diff/checks` are reads and `pr ready/merge/create/edit/comment` are writes.

### Pitfall 7: Worktree executors and the `Refs` trailer
**What goes wrong:** Executors commit from `.df-worktrees/<repo>/<id>`, where `.planning/.gh-mapping.json` is not checked out (store mode gitignores it). Looking up the mapping from cwd finds nothing.
**How to avoid:** Resolve the mapping from `planningMode.resolveMainRoot(cwd)`, as the planning verbs do (D-14). Parse the TRD id from the conventional subject scope with `toTrdId` (`feat(49-02): …` → `49-02`; `docs(49): …` → objective). Append `\n\nRefs #N` once (skip if already present). In local mode the message is unchanged.

### Pitfall 8: Merge queue semantics
**What goes wrong:** With a merge queue required, `gh pr merge --squash` is unnecessary, and `--delete-branch` may not apply. The PR is merged by the queue later, asynchronously, so "after merge" is not "after `gh pr merge` returns".
**How to avoid:**
- `gh pr merge <n>` with no strategy when `repository.mergeQueue(branch: default)` is non-null. Per gh help, it adds the PR to the queue or enables auto-merge.
- Otherwise use `--squash` (configurable).
- `gh pr reconcile` is a separate, idempotent verb. It reads PR `state/merged`; if not merged yet it exits 3 (pending). If merged, it closes stragglers, sets Project → Done, deletes the remote branch if it still exists (`DELETE repos/{r}/git/refs/heads/{branch}`), switches local to the default branch, pulls, deletes local `df/objective-*` and leftover `df/exec-*`, then runs `gh pull --all`.
- The objective 50 Action will call the same library function.

### Pitfall 9: The fake shares no number space for PRs
**What goes wrong:** On GitHub, issues and PRs share one number sequence and PR comments are issue comments. A fake with separate counters hides collisions in `knownNumbers` / comment lookups.
**How to avoid:** Implement PRs in `gh-fake.cjs` as issue records with `pull_request: {...}`, `isDraft`, `head`, `base`, `merged`, `node_id`, drawing from the same `nextIssue` counter. The existing `issues` routes then naturally see them, as GitHub's REST issues list does (it includes PRs; DevFlow scans must filter `pull_request`).

### Pitfall 10: Rate pacing and budget
Volume is small (about 1 branch + 1 PR + ~N comments/status per objective). Still:
- every write goes through `ghWrite` (1 s spacing);
- outbox ops count toward `BUDGET` (80/min, 450/h, gh-outbox.cjs:47);
- the wiki-diff comment can be several parts. Each part is a content-creating write.

### Pitfall 11: Local mode drift through prose
`execute-objective.md` and `complete-milestone.md` must branch on `pr_lifecycle` from init JSON, not on a shell probe. `planning-writes.repo.test.cjs`, `doc-refs.repo.test.cjs` and `dispatch-completeness.test.cjs` will fail on:
- a documented `df-tools gh pr …` that is not dispatched or not in `help.cjs` COMMANDS (`gh` usage string at help.cjs:317);
- any new prose line that instructs a direct planning-file write.

## Code Examples

### createLinkedBranch through the seam (direct, synchronous, at start)
```js
// Source: GitHub GraphQL CreateLinkedBranchInput {issueId: ID!, oid: GitObjectID!, name, repositoryId}
// (docs.github.com/en/graphql/reference/mutations#createlinkedbranch; cli/cli issue develop uses it)
const q = 'mutation($issueId: ID!, $oid: GitObjectID!, $name: String!, $repositoryId: ID!) {'
  + ' createLinkedBranch(input:{issueId:$issueId, oid:$oid, name:$name, repositoryId:$repositoryId})'
  + ' { linkedBranch { id ref { name target { oid } } } } }';
const r = client.ghWrite(['api', 'graphql', '-f', `query=${q}`, '-f', `issueId=${issueNodeId}`,
  '-f', `oid=${baseSha}`, '-f', `name=${branch}`, '-f', `repositoryId=${repoNodeId}`]);
// r.ok && JSON.parse(r.stdout).data.createLinkedBranch.linkedBranch === null  -> treat as FAILURE (Pitfall 2)
```

### Reading linked branches (a read, so not paced as a write)
```js
const q = 'query($owner:String!,$name:String!,$n:Int!){ repository(owner:$owner,name:$name){'
  + ' issue(number:$n){ id linkedBranches(first:10){ nodes { ref { name } } } } } }';
client.ghRead(['api', 'graphql', '-f', `query=${q}`, '-f', `owner=${o}`, '-f', `name=${n}`, '-F', `n=${num}`]);
```

### Draft PR via REST (flusher handler, body on stdin)
```js
// Source: gh-outbox-flush.cjs:148 sendJson pattern; REST POST /repos/{o}/{r}/pulls {title, head, base, body, draft}
sendJson('POST', `repos/${ctx.repo}/pulls`, { title, head: branch, base: defaultBranch, body, draft: true });
```

### Mark ready (no REST endpoint; GraphQL)
```js
const q = 'mutation($id: ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ pullRequest { isDraft } } }';
client.ghWrite(['api', 'graphql', '-f', `query=${q}`, '-f', `id=${prNodeId}`]);
```

### Commit status (works with a user token)
```js
// Source: REST "Create a commit status" — POST /repos/{owner}/{repo}/statuses/{sha}
sendJson('POST', `repos/${ctx.repo}/statuses/${sha}`,
  { state: 'success', context: 'devflow/verification', description: 'Objective 49 verified (12/12 must-haves)' });
```

### Merge-queue probe (read)
```js
const q = 'query($o:String!,$n:String!,$b:String!){ repository(owner:$o,name:$n){ mergeQueue(branch:$b){ id } } }';
// data.repository.mergeQueue === null  -> no queue; use `gh pr merge <n> --squash`
// non-null -> `gh pr merge <n>` (no strategy): queue or auto-merge, per gh 2.102 help
```

### PR body (managed sections via gh-body)
```
<!-- devflow:id=49 kind=pr -->
<!-- devflow:begin closes -->
Closes #120
Closes #121
Closes #122
<!-- devflow:end closes -->
<!-- devflow:begin wiki -->
<!-- devflow:dir=49-objective-branch-and-pr-lifecycle -->
Detail: [Objective-49-…](https://github.com/o/r/wiki/Objective-49-…/<sha>) (revision `abc1234`)
<!-- devflow:end wiki -->
```
`mergeManaged`'s `SECTION_ORDER`/`OPTIONAL_SECTIONS` (gh-body.cjs:32-39) are objective-body specific. Add a PR section list (`closes`, `wiki`, `summary`) rather than overloading the objective one, or pass sections explicitly as optional sections.

### Wiki diff (gh-wiki, git seam)
Add `gh-wiki.diff(root, fromSha, toSha = 'HEAD')`: `git -C .planning/wiki diff --no-color <from>..<to>` through the existing `local()` runner (gh-wiki.cjs:407). Post it as a ```diff fenced block, split with `splitParts`. Degraded pages mode (`docs/devflow/`) needs no comment, because the diff is already in the PR.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Draft PRs only on public repos / paid plans | Draft PRs in all repositories, including Free private | 2025-05-01 (GitHub changelog) | No degraded "non-draft + WIP label" mode needed |
| `git.branching_strategy` local branches + local squash merge in complete-milestone | Linked branch + one PR per objective (store mode) | This objective | complete-milestone `handle_branches` step skipped in store mode |
| Check runs for any token | Check runs App-only (unchanged; docs explicit) | — | Commit status locally; check run from the objective 50 App |

**Deprecated/outdated:**
- `git.branching_strategy` / `objective_branch_template` / `milestone_branch_template`: keep reading them in local mode (D-01). In store mode ignore them and report `branching_strategy_ignored`. The `objective_branch_template` *format* can supply the linked branch name.

## Codebase Inventory (for the planner)

### 1. Extension points: gh seam, outbox, fake
- `gh-client.cjs`: `_setRunGh` :86, `NOUN_COMMANDS`/`READ_SUBCOMMANDS` :129-130, `isWriteArgs` :144, `ghWrite` :269, `ghRead` :274, `requireEnabled` :388.
- `gh-outbox.cjs`: `OP_KINDS` :145, `validateOp` :302, `enqueue` :533, `BUDGET` :47. The module header says it must stay hook-cheap (node builtins + sync-state only), so new op checks must not require other libs.
- `gh-outbox-flush.cjs`: `createContext` :173 (add `prs` cache), handlers :467-1084, `HANDLERS` :1086, `executeOp` :1104, `flush` :1166, `refreshBase` :1247.
- `__fixtures__/gh-fake.cjs` (961 lines):
  - `dispatch` :870 handles only `issue|label|api|auth|--version`;
  - `api graphql` is delegated to the caller's `graphql(argv)` handler (:672);
  - `addComment` :212 hard-codes `user:{login:'devflow-bot'}`.

  Add to the fake:
  - PR records sharing the issue counter;
  - REST routes: `repos/o/r/pulls` (GET with `head`/`state`, POST), `pulls/{n}` (GET, PATCH), `statuses/{sha}` (POST), `commits/{sha}/status` (GET), `git/refs/heads/{b}` (DELETE), and `repos/o/r` → `default_branch`, `node_id`;
  - `pr ready|merge|view` argv;
  - a built-in GraphQL handler for `createLinkedBranch`, `linkedBranches`, `markPullRequestReadyForReview` and `mergeQueue`, plus an option `mergeQueue: bool`;
  - an `onCreateBranch(name, oid)` callback so a test can create the ref in a temp bare git remote;
  - `seedComment(n, body, {login})` and `assignees` on seeded issues;
  - `humanMergePr(n)` to simulate the merge (and queue).

  Each addition needs a case in `gh-fake.test.cjs` (the file's own rule, :12-16).
- `gh-store-fixtures.cjs`: `makeStoreProject({store:true})` :304, `hermeticEnv()` :399 (temp HOME, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, `GIT_CONFIG_GLOBAL=/dev/null`, git identity). For branch tests, add a `makeGitRemote()` helper: `git init --bare` in tmp, `origin` set, initial commit on `main`.

### 2. Worktrees, merge, branching_strategy
- `workflows/execute-objective.md`: `initialize` :18-37 (parses `branching_strategy`, `branch_name`); `handle_branching` :39-50 (`git checkout -b`); wave step 0 :221-268 (`exec-context worktree --base <WAVE_BASE>`); merge 5b :423-480 (`git merge --no-ff df/exec-{plan_id}`, worktree remove, wave SUMMARY commit); `verify_objective_goal` :866-1000; `update_roadmap` :1001-1047 (`objective complete`, `gh sync`).
- Store-mode changes:
  - `handle_branching` → `gh pr start`;
  - after 5b, `git branch -d df/exec-{id}` and `git push` of the objective branch (or `gh pr sync <obj>`, which pushes and re-upserts the PR body);
  - on verify `passed` → `gh pr ready <obj>`;
  - `update_roadmap` → no issue close (Pitfall 3) and offer `gh pr merge`.
- `exec-context.cjs` :378-462: the base is explicit and `merge_into = refDir` (the cwd checkout). No code change is needed for GPR-02 beyond the orchestrator standing on the objective branch. Consider adding `branch -d` to the `remove` hint.
- `branching_strategy` sites: `config.cjs:16-18,57-59,114-116`; `init.cjs:360-387`; `state.cjs:171-173`; `migrations/0001-config-stamp.cjs:32-34`; `workflows/settings.md:35,117,156`; `workflows/complete-milestone.md:495-560+` (local squash merge, GPR-06); `references/planning-config.md:12-24,104-194`; `docs/USER-GUIDE.md`; `README.md`.

### 3. TRD completion / verification hook points (GPR-03)
- `summaryPost` (planning-verbs.cjs:560): in store mode it already enqueues `upsert-comment kind=summary` via `ghComments.enqueueSummary`. Add, in the same enqueue, a TRD status op (`patch-issue labels_remove:[in_progress]`, or a Project Status if TRDs are project items). Optionally add `upsert-pr` (refresh the PR `summary` section with "TRDs complete: k/N").
- `verificationPost` (:619): parse `status:` from the VERIFICATION frontmatter (`extractFrontmatter`). When `passed` and `prs[obj]` exists, append `post-status success`, `pr-ready`, and `upsert-pr-comment kind=wiki-diff` to the same enqueue. On `gaps_found`, post `post-status failure` and keep the draft.
- TRD start ("TRD status moves"): there is no start hook today. The executor's first `summary checkpoint` (store mode writes `.trd-progress/`, never enqueued, D-12) is the wrong place because it must stay free. Use an explicit `df-tools gh pr sync <obj>` at wave start, or an `in_progress` label op enqueued by the orchestrator per TRD at spawn.

### 4. Scope changes today
- Posting: `gh trd scope` → `gh-comments.enqueueScope` (:362) queues `post-scope` + a spec-rev `scope n=K` row. Any author's `<!-- devflow:scope n=K -->` comment is applied by `effectiveSpec`. There is **no author or assignee check anywhere** (`rg assignee` finds only check-todos/gh-pull/conflict).
- Consumption: `readEffectiveSpec` (`gh trd spec`) and `foldTrd`. The cache materialiser (gh-cache.cjs) writes only the TRD body, not scopes, and executors read the cache file. So GPR-05 gating must cover `readEffectiveSpec`/`foldTrd`. Pending scopes should also be shown in `gh trd spec` output and `gh pr status`.

### 5. Commit messages
- `df-tools commit` dispatch is at df-tools.cjs:385-397 and `cmdCommit` at misc.cjs:561. The message goes verbatim into `git commit -m`.
- The executor commits with `df-tools commit "{type}({objective}-{trd}): …" --files …` (agents/executor.md:929-931, :1120). The wave-SUMMARY and objective docs commits use `docs({objective}): …`. Raw `git commit` is blocked by the `gate-commits.js` hook.
- The trailer goes in `cmdCommit` before `commitArgs` is built, store mode only. Recommend the literal paragraph `Refs #N`, as the proposal specifies. Note: git's default `trailer.separators` is `:`, so `git interpret-trailers --parse` will not see `Refs #N`. Objective 50's `devflow/linked-issue` check should regex for `^Refs #\d+$`.

### 6. Store-off parity (D-01)
- `planning-mode.cjs`: mode is `store` iff `github.enabled === true && github.store === true` (strict booleans) in the MAIN checkout config.
- With the store off:
  - every new verb returns `skipped` (exit 0) with zero gh calls;
  - `df-tools commit` output is byte-identical;
  - init JSON gains no field that changes workflow behaviour (`pr_lifecycle: false`);
  - `branching_strategy` and complete-milestone's local merge work as today.
- Add a parity test: run start/sync/ready/reconcile + commit with `store:false` and `enabled:true`, then assert `fake.calls()` is empty and `git log` messages carry no `Refs`. This mirrors `gh-store-e2e` / 48-22 parity tests.

### 7. Test conventions
- Tests sit next to their source: `bin/lib/<name>.test.cjs`, run with `node --test` (package.json `test` glob covers `plugins/devflow/**/*.test.cjs` and hooks `*.test.js`).
- Repo audits a new module must satisfy:
  - `gh-seam.repo.test.cjs`: GUARDED, NO_DIRECT_WRITE, GIT_SITES (test 20 fails any new `spawnSync('git'` outside named sites), no `parseInt(` of ids;
  - `planning-writes.repo.test.cjs`: no direct planning-write prose; use verbs or an inline `<!-- planning-audit: allow … -->` marker, reason ≥20 chars;
  - `doc-refs.repo.test.cjs`: stale command refs via `DEPRECATION_MAP`/`REMOVED_COMMANDS` in skill-route.cjs;
  - `dispatch-completeness.test.cjs`: every documented `df-tools <name>` dispatches, and the FLOOR is read from CLAUDE.md;
  - `help.test.cjs`: COMMANDS vs the dispatcher.
- Adding a verb:
  1. add a branch in the `case 'gh':` block (df-tools.cjs:1088-1130) and its "Available:" error list;
  2. update the `gh` usage string in help.cjs:317;
  3. lazy-`require` the CLI module, like `gh-store-cli`;
  4. follow the gh-store-cli `result/emit` exit contract (0/1/2/3), with handlers that *return* (process.exit is stubbed in tests).

## Recommended Wave / TRD Decomposition

Strict TDD in every TRD (failing test first). File ownership is disjoint within a wave.

**Wave 1: foundations (parallel)**
- **49-01 Fake GitHub: PRs, branches, statuses, authors.**
  - Owns `__fixtures__/gh-fake.cjs` and `gh-fake.test.cjs`.
  - Adds: PR records on the shared counter, pulls/statuses/refs REST, `pr ready|merge|view`, built-in GraphQL handlers (createLinkedBranch, linkedBranches, markPullRequestReadyForReview, mergeQueue), `onCreateBranch`, comment `login`, `humanMergePr`, `mergeQueue` option.
  - Also a `makeGitRemote` helper in `gh-store-fixtures.cjs`.
- **49-02 Mapping `prs` map + gh-client read classification.**
  - Owns `gh-mapping.cjs` (KNOWN_TOP_LEVEL, serialize, `getPr`/`setPr`, byte-stable when empty) and `gh-client.cjs` (`issue develop --list` is a read).
- **49-03 Scope acceptance (GPR-05, pure half).**
  - Owns `gh-trd.cjs`: author in `parseScopeComments`, the `accept` predicate in `effectiveSpec`, the confirm-marker parser.

**Wave 2: library**
- **49-04 Outbox op kinds + handlers.**
  - Owns `gh-outbox.cjs` and `gh-outbox-flush.cjs`.
  - Adds `upsert-pr` (derive closes at flush), `pr-ready`, `post-status`, `upsert-pr-comment`, `patch-issue.labels_remove`; remote-edit base for the PR body; 422 "no commits" → pending.
- **49-05 objective-branch git seam + gh-wiki diff.**
  - Owns `objective-branch.cjs` (`_setRunGit`; fetch/switch/push/delete/allow-empty start commit) and `gh-wiki.cjs` `diff()`.
  - Updates the `gh-seam.repo.test.cjs` GIT_SITES/GUARDED entries.
- **49-06 Scope gate wiring + `gh trd confirm-scope`.**
  - Owns `gh-comments.cjs` (assignee read, spec-rev DevFlow check, pending list, fold excludes pending) and the confirm verb in `gh-store-cli.cjs`.

**Wave 3: lifecycle verbs**
- **49-07 `gh-pr.cjs` + `gh-pr-cli.cjs`: `start`, `sync`, `status`.**
  - GPR-01: linked-branch create/reuse, start commit, push, draft PR with closes + wiki pin; optional freeze.
  - Dispatch + help entries.
- **49-08 `df-tools commit` trailer + `--allow-empty`.**
  - Owns `misc.cjs` cmdCommit and the `df-tools.cjs` commit case.
  - GPR-02: main-root mapping lookup, store-only, idempotent `Refs #N`.

**Wave 4: completion**
- **49-09 Verify/summary hooks (GPR-03).**
  - Owns `planning-verbs.cjs`: summaryPost TRD status op; verificationPost `passed` → status + ready + wiki diff; and the `objective complete` no-early-close change in `objective.cjs`.
- **49-10 `gh pr merge` + `gh pr reconcile` (GPR-04).**
  - Owns the merge/reconcile section of `gh-pr.cjs`: queue probe, merged check (exit 3 if not), straggler close, Project → Done, remote+local branch delete, `gh pull --all`.

**Wave 5: prose, parity, docs**
- **49-11 Workflow prose (GPR-06).**
  - Owns `execute-objective.md` (handle_branching → `gh pr start`; 5b push/delete `df/exec-*`; verify → ready; update_roadmap → merge offer) and `complete-milestone.md` (skip the local merge in store mode).
  - Also `settings.md`, `references/planning-config.md` deprecation text, and `init.cjs` fields (`pr_lifecycle`, `objective_branch`, `pr_number`, `branching_strategy_ignored`).
  - Must pass the planning-writes and doc-refs audits.
- **49-12 E2E + store-off parity + CLAUDE.md/USER-GUIDE bullets + full `npm test`.**
  - Fixture objective → exactly one PR whose closes equal its TRD issues (SC1).
  - Two parallel worktrees merged → zero extra PRs/remote branches (SC2).
  - Non-assignee scope pending until confirmed (SC3).
  - Local mode: zero gh calls, no trailer.

## Open Questions

1. **Check run vs commit status (conflicts with the letter of a locked decision).**
   - What we know: the REST docs say only GitHub Apps can create check runs. The locked local identity is the developer's token.
   - Recommendation: a commit status `devflow/verification` locally, and a check run only when running as the App (objective 50). Have the planner/user confirm this before 49-09. It is not a re-litigation of the decision, only its only feasible implementation.
2. **Offline at execute start.**
   - `createLinkedBranch` must run before local work can land on the linked branch, and it cannot link a branch that already exists remotely.
   - Recommendation: `gh pr start` is online-required (exit 1, nothing queued), consistent with the existing `gh trd` verbs' open decision. PR ops after start go through the outbox.
3. **How "TRD status moves" is represented.**
   - Options: an `in_progress` label (needs `labels_remove`); the Project Status on TRD items (TRDs may not be project items); or derived from the SUMMARY comment (already true in the cache).
   - Recommendation: the label on TRD issues at spawn, removed at `summary post`.
4. **Freeze at execute start.**
   - The proposal says TRD bodies freeze at execute start, but no workflow calls `gh trd freeze` today.
   - Recommendation: `gh pr start` freezes every TRD (outbox spec-rev append). Confirm it is in scope for objective 49 rather than objective 50.
5. **Merge method when there is no queue.**
   - Recommendation: `squash` by default, configurable via `github.pr.merge_method`. The `Refs` trailers survive in the PR's commit list, not on the default branch. Confirm whether trailers on the default branch matter for objective 50's linked-issue check; if they do, use `merge`.
6. **Keyword closing refs beyond 10.**
   - The documented cap of 10 is for manual links. Keyword links reportedly exceed it (LOW confidence).
   - Recommendation: reconcile always verifies and closes stragglers, so correctness does not depend on the cap.
7. **GPR-06 in local mode.**
   - D-01 says local mode is unchanged. GPR-06 says `branching_strategy` is "replaced".
   - Recommendation: replace it in store mode only, and add a deprecation notice in local mode. Objective 51's migration moves projects to store mode.

## Sources

### Primary (HIGH confidence)
- Codebase, read 2026-10-01: all file:line references above (`gh-client.cjs`, `gh-outbox*.cjs`, `gh-comments.cjs`, `gh-trd.cjs`, `gh-body.cjs`, `gh-wiki.cjs`, `gh-mapping.cjs`, `planning-verbs.cjs`, `planning-mode.cjs`, `objective.cjs`, `misc.cjs`, `init.cjs`, `exec-context.cjs`, `__fixtures__/gh-fake.cjs`, `__fixtures__/gh-store-fixtures.cjs`, `gh-seam.repo.test.cjs`, `workflows/execute-objective.md`, `workflows/complete-milestone.md`), `docs/PROPOSAL-github-system-of-record.md`, and the objective 49/50/51 OBJECTIVE.md files.
- `gh --help` output for `issue develop`, `pr merge` and `pr create` (gh 2.102.0, local).
- [REST API endpoints for check runs](https://docs.github.com/en/rest/checks/runs): "To create a check run, you must use a GitHub App. OAuth apps and authenticated users are not able to create…"
- [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue): keywords apply only to PRs targeting the default branch; one keyword per issue; manual-link cap of 10.
- [Draft pull requests are now available in all repositories](https://github.blog/changelog/2025-05-01-draft-pull-requests-are-now-available-in-all-repositories/) (2025-05-01).

### Secondary (MEDIUM confidence)
- [GitHub Enterprise Server 3.18 GraphQL Issues reference](https://docs.github.com/en/enterprise-server@3.18/graphql/reference/issues) and community usage for the `CreateLinkedBranchInput` fields (`issueId`, `oid` required; `name`, `repositoryId` optional).
- [cli/cli #6562](https://github.com/cli/cli/issues/6562): `gh issue develop` uses `CreateLinkedBranch`, with scope errors.
- `Repository.mergeQueue(branch:)` GraphQL field: training knowledge plus gh's queue-aware merge help. Verify with one live query during 49-10.

### Tertiary (LOW confidence)
- [community discussion #155339](https://github.com/orgs/community/discussions/155339): `createLinkedBranch` on an existing branch returns null silently.
- [community discussion #32870](https://github.com/orgs/community/discussions/32870): keyword links exceeding 10.
- The wiki page-at-revision URL format (already flagged LOW in gh-wiki.cjs:292).

## Metadata

**Confidence breakdown:**
- Codebase extension points and pitfalls 3, 6, 7 and 9: HIGH. Read directly, with line refs.
- GitHub API behaviour: HIGH for check-run App-only, keyword rules and draft availability; MEDIUM for createLinkedBranch details and mergeQueue; LOW for the >10 keyword links and the silent-null on an existing branch.
- Decomposition: MEDIUM. It depends on Open Questions 1-4.

**Research date:** 2026-10-01
**Valid until:** 2026-10-31 (GitHub API surface is stable; re-check the merge queue and linked-branch APIs if planning slips)
