---
objective: 49-objective-branch-and-pr-lifecycle
trd: "09"
type: standard
wave: 3
depends_on: ["49-01", "49-02", "49-04", "49-05", "49-06", "49-07"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-pr.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GPR-01, GPR-02]
must_haves:
  truths:
    - "`df-tools gh pr start <obj>` in store mode: reuses the issue's linked branch or creates one with `createLinkedBranch` at the default-branch tip, switches the checkout to it, makes one empty start commit `chore(<obj>): start objective <obj>` + `Refs #<obj issue>` when the branch has no commits of its own, pushes it, records `prs[obj]`, queues `upsert-pr` (draft, closes, pinned wiki revision) and freezes every TRD of the objective, then flushes"
    - "`gh pr start` is online-required: if GitHub cannot be read it exits 1 with nothing queued and no local branch change (decision 2)"
    - "Re-running `gh pr start` is idempotent: same branch, no second start commit, no second PR, no new writes"
    - "A remote branch with the chosen name that is not linked to the issue → exit 1 with a message (rename with `--name` or delete it); a `null` linkedBranch is a failure, never success"
    - "`gh pr sync <obj>` pushes the objective branch and re-queues `upsert-pr` (closes derived at flush, summary `TRDs complete k/N`); offline it queues and exits 3"
    - "`gh pr status <obj>` reports branch, PR number/state (draft, ready, merged, queued), latest `devflow/verification` status, closes vs mapping TRDs, and pending scopes per TRD; it never writes"
    - "Local mode: start/sync/status return skipped (exit 0) with zero gh calls and no git changes"
    - "gh-pr.cjs is GUARDED but not NO_DIRECT_WRITE (its one direct write is `createLinkedBranch`, synchronous at start); gh-pr-cli.cjs and commit-trailer.cjs are GUARDED and NO_DIRECT_WRITE; a new seam test fails if any `gh-*.cjs` module is not in GUARDED"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-pr.cjs
      provides: "startObjectivePr, syncObjectivePr, prStatus, linkedBranchFor, branchNameFor, closesFor"
    - path: plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
      provides: "cmdGhPr(cwd, args, raw) for start|sync|status"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "`gh pr` dispatch delegating to cmdGhPr"
  key_links:
    - "Uses 49-04 objective-branch (fetch/switch/startCommit/push), 49-05 upsert-pr, 49-06 freeze via gh-comments.freezeTrd and pending scopes, 49-07 applyRefs; extended by 49-12 (merge, reconcile); called by 49-13 prose"
---

# TRD 49-09: `gh pr start | sync | status` — the objective branch and its draft PR (GPR-01)

<objective>
Execute start creates (or reuses) the objective's linked branch, puts the checkout on it, and opens the one draft PR that closes the
objective and every TRD and pins the wiki revision. Waves then branch from and merge into that checkout (GPR-02 needs nothing more from
exec-context). `sync` keeps the PR current after each wave; `status` shows where it stands.

Purpose: GPR-01; the GPR-02 precondition (orchestrator stands on the objective branch). Output: library + CLI + dispatch + help + seam guard.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-09): ...`), then implementation (`feat(49-09): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- All gh through gh-client; all git through objective-branch (49-04). CLI handlers return via the gh-store-cli `result/emit` contract
  (0 ok, 1 error, 2 halted, 3 pending); `process.exit` is stubbed in tests.
- Tests: fake (49-01) with `onCreateBranch` mirroring refs into a `makeGitRemote()` origin (49-04 fixture) and `pushRef` kept in sync
  after pushes; `hermeticEnv()`; `makeStoreProject({store:true})`. Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Decision 2 (orchestrator, adopted): `gh pr start` requires being online — exit 1, nothing queued.** `createLinkedBranch` must succeed
  before local work can land on the linked branch, and it cannot link an existing branch. Every later PR operation (`sync`, ready, status
  post, merge, branch delete) goes through the outbox.
- **Decision 4 (orchestrator, adopted): `gh pr start` freezes every TRD** of the objective (`gh-comments.freezeTrd`, skipping TRDs
  already frozen). The proposal says TRD bodies are frozen at execute start; nothing called freeze before.
- **Direct write**: `createLinkedBranch` is the only direct `ghWrite` in gh-pr.cjs (synchronous, online-required, its result decides the
  branch name). gh-pr.cjs is therefore GUARDED but not NO_DIRECT_WRITE, like gh-milestone-store (48-05 precedent). Everything else is queued.
- **Start sequence** (pseudocode):
  ```
  require store mode + github.enabled            # local → skipped, exit 0
  objIssue = mapping.objectives[obj]             # missing → exit 1 "run gh sync <obj> first"
  objectiveBranch.isTrackedClean(root)           # dirty → exit 1
  repo = GET repos/{r} (default_branch, node_id); issue = GET issues/{n} (node_id)   # read fails → exit 1, nothing queued
  linked = GraphQL issue.linkedBranches
  if linked: branch = linked[0]
  else:
    branch = --name || prs[obj].branch || render(objective_branch_template)
    if GET git/ref/heads/{branch} exists → exit 1 (unlinked branch exists)
    tip = GET git/ref/heads/{default}.object.sha
    r = createLinkedBranch(issueId, tip, branch, repoId); linkedBranch null → exit 1
  fetchBranch + switchTo(branch)
  if remoteTip(branch) == remoteTip(default): startCommit(applyRefs('chore(<obj>): start objective <obj>', objIssue)); push -u
  wiki = gh-wiki.headSha(main) when the wiki clone exists → buildWikiSection args; setPr {branch, base: default, wiki_base_sha}
  enqueue upsert-pr {branch, base, title: 'Objective <obj>: <name>', wiki}; freezeTrd for each TRD; flush
  ```
- **Title**: `Objective <obj>: <objective name>` from ROADMAP/OBJECTIVE cache, sent only by `start` (create). `sync` sends
  `{branch, base, summary}` from `prs[obj]` with no title; per 49-05 the title is create-only and the remote title is kept.
- **Status** reads only: `pulls/{n}`, `commits/{head}/status`, GraphQL `mergeQueueEntry` when available, and `readTrdState` per TRD for
  pending scopes (cap the per-TRD reads to TRDs with scope comments if the state already caches it).

## Test list

1. Store mode, mapping objective 49 #100 with TRDs 49-01 #101, 49-02 #102, origin `main` at c0: `start 49` → fake writes include one
   `createLinkedBranch`; local branch `df/objective-49-<slug>`; one new commit with message ending `Refs #100`; origin branch at that
   commit; one draft PR whose body closes #100, #101, #102 and has the wiki section with the clone's head sha; `prs['49']` has branch,
   base `main`, number, `wiki_base_sha`; each TRD has a spec-rev `frozen` row.
2. Re-run `start 49` → no new `createLinkedBranch`, no new commit, no new PR, zero fake writes.
3. Issue already has a linked branch `df/objective-49-custom` with one commit → reused, no start commit, PR created on it.
4. Remote branch `df/objective-49-<slug>` exists unlinked → exit 1, message mentions `--name`; no writes, checkout unchanged.
5. Fake returns `linkedBranch:null` → exit 1; nothing queued.
6. Offline (fake rejects reads) → exit 1, outbox empty, current branch unchanged.
7. Dirty tracked file → exit 1 before any gh call.
8. Objective with no mapping entry → exit 1 `run df-tools gh sync 49 first`.
9. `sync 49` after a commit on the objective branch → origin advanced; upsert-pr queued+flushed; PR summary section `TRDs complete 1/2`
   when 49-01 has a SUMMARY in the cache; a newly mapped TRD 49-03 appears in closes.
10. `sync 49` offline → push failure reported, op queued, exit 3.
11. `status 49` → JSON with branch, pr {number, draft:true}, verification null, closes [100,101,102], pending_scopes {}; zero writes.
12. Local mode: start/sync/status → exit 0 `skipped`, `fake.calls()` empty, `git branch` unchanged.
13. Dispatch: `df-tools gh pr start|sync|status` reach `cmdGhPr`; unknown `gh pr x` errors listing subcommands; the `gh` usage string and
    the "Available:" list include `pr`; help.test and dispatch-completeness green.
14. Seam guard: gh-pr.cjs in GUARDED only; gh-pr-cli.cjs and commit-trailer.cjs in GUARDED and NO_DIRECT_WRITE; new test 23 — every
    non-test `gh-*.cjs` in lib is in GUARDED.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `startObjectivePr` (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr.test.cjs</files>
  <action>
RED: tests 1-8 in gh-pr.test.cjs; commit `test(49-09): gh pr start`.
GREEN: gh-pr.cjs with `branchNameFor`, `linkedBranchFor` (GraphQL query, a read), `createLinked` (the one `ghWrite`), and
`startObjectivePr(root, obj, {name})` per the start sequence. Commit `feat(49-09): start the objective branch and draft PR`.
# GOTCHA: `createLinkedBranch` needs the issue NODE id (`I_…`) and an `oid`; never the number (Pitfall 2).
# GOTCHA: run the dirty check and every GitHub read before touching the local checkout, so a failure leaves nothing half done.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr.test.cjs</verify>
  <done>Tests 1-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `syncObjectivePr` and `prStatus` (tests 9-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr.cjs, plugins/devflow/devflow/bin/lib/gh-pr.test.cjs</files>
  <action>
RED: tests 9-11; commit `test(49-09): gh pr sync and status`.
GREEN: `syncObjectivePr(root, obj)` (push via objective-branch, summary line from cached SUMMARYs, enqueue upsert-pr, flush; push failure
→ still enqueue, exit 3) and `prStatus(root, obj)` (reads only). Commit `feat(49-09): sync and status for the objective PR`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr.test.cjs</verify>
  <done>Tests 9-11 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CLI, dispatch, help, seam guard (tests 12-14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs, plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</files>
  <action>
RED: tests 12-14 (CLI tests in gh-pr-cli.test.cjs; seam additions + test 23 in gh-seam.repo.test.cjs); commit
`test(49-09): gh pr CLI and seam guard`.
GREEN: `gh-pr-cli.cjs` `cmdGhPr(cwd, args, raw)` with store gate first (local → skipped, zero gh calls), then `requireEnabled`;
df-tools.cjs `case 'gh'` (L1088): `else if (subcommand === 'pr') { const { cmdGhPr } = require('./lib/gh-pr-cli.cjs'); cmdGhPr(cwd,
args.slice(2), raw); }` and add `pr` to the "Available:" error (L1128); help.cjs `gh` usage (L316) adds
`pr <start|sync|status> <objective>`. Commit `feat(49-09): df-tools gh pr start|sync|status`. Run the gh-*, help, dispatch-completeness,
doc-refs and seam suites.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Tests 12-14 pass; gh-*, help, dispatch-completeness and seam suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-store-cli.cjs`: `cmdGhTrd`/`cmdGhOrphans` and `result/emit` + `EXIT {0,1,2,3}` — copy the shape for `cmdGhPr`.
- `gh-milestone-store.cjs`: precedent for a guarded module that calls `ghWrite` directly (seam test 22).
- `gh-comments.cjs` `freezeTrd(root, trdArg, {now})` L428; `planning-verbs.cjs` `enqueueAndFlush` L169 for the enqueue+flush idiom.
- `gh-wiki.cjs` `headSha` L527, `pageRevisionUrl` L296; `gh-body.cjs` `buildWikiSection` L523.
- Research code examples (49-RESEARCH.md "Code Examples"): createLinkedBranch and linkedBranches GraphQL text.
</codebase_examples>
<anti_patterns>
- `gh issue develop --checkout` / `gh pr create` (git inside gh; URL instead of JSON).
- Pushing `df/exec-*` worktree branches: they stay local (SC2: no extra PRs or remote branches).
- Opening the PR before the start commit is pushed (422, Pitfall 1).
</anti_patterns>
<error_recovery>
- Crash between push and PR: re-run `gh pr start`; the linked branch is reused, no start commit is made (branch is ahead), and upsert-pr
  finds-or-creates the PR. Test 2 covers the idempotent path.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-pr.test.cjs plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</regression>
</validation_gates>

<verification>
- SC1 at library level: test 1 asserts exactly one PR whose closing references equal the objective + TRD issues.
</verification>

<success_criteria>
`df-tools gh pr start <obj>` leaves the checkout on the objective's linked branch with exactly one draft PR closing the objective and
every TRD, idempotently; `sync` and `status` keep it current and visible.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-09-SUMMARY.md`
</output>
