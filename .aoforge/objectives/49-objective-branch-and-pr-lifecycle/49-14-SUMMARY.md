---
objective: 49-objective-branch-and-pr-lifecycle
trd: "14"
subsystem: github-store
tags: [e2e, gh-pr, lifecycle, worktrees, scope-gate, merge-queue, reconcile, store-off-parity]

requires:
  - objective: 49-06
    provides: scope confirm gate (`gh trd confirm-scope`, assignee-only), `gh trd start`
  - objective: 49-07
    provides: `Refs #N` trailer on `df-tools commit` (store mode only)
  - objective: 49-08
    provides: `pr_lifecycle` on `init execute-objective`
  - objective: 49-09
    provides: `gh pr start|sync|status`
  - objective: 49-11
    provides: `summary post` / `verification post` driving the PR, deferred objective close
  - objective: 49-12
    provides: `gh pr merge|reconcile`
provides:
  - "gh-pr-e2e.test.cjs: the whole objective lifecycle on the fake GitHub and a temp git remote (SC1, SC2, SC3) plus the store-off (D-01) parity proof"
affects: [49-15, objective-50]

tech-stack:
  added: []
  patterns:
    - "One shared-state describe walks the lifecycle in the order the prose runs it; the queue variant and store-off parity each get their own fresh fixture"
    - "Ninety-nine unrelated issues are seeded first so the objective is #100 and the TRDs #101-#103, and so 'unrelated issues are left alone' is an assertion, not a hope"
    - "The fake's token owner is the objective issue's assignee (alice); a stub on `gh api user` lets a test sit at the keyboard as someone else (mallory) for the refusal"
    - "Public reads (`GET pulls`, `GET pulls/{n}`, `GET issues/{n}/comments`) are used where one exists; the fake's `statuses` map and `refs` are read only for the commit status and the branch ref"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs
  modified: []

key-decisions:
  - "No product defect found: every scenario passed against the shipped 49-01..49-12 code, so no module outside the test file changed"
  - "Wave worktrees are cut by the real `cmdExecContextWorktree` (base = the objective branch, merge_into = the main checkout), not `git worktree add`; the commits go through the real in-process `cmdCommit` inside each worktree, so the Refs trailer resolves the mapping from the MAIN checkout exactly as a worktree executor's does"
  - "The fixture's objective 7 is renumbered to 49 on disk (directory, TRD files, ROADMAP, no SUMMARY) so scoped commit messages `feat(49-01): a` resolve through the mapping like production ones"
  - "Merge-queue variant uses `closeKeywordCap: 2` so the reconcile has two real stragglers to close; the CLI is used there because exit codes (3 pending, 0 done) are the contract being proved"

patterns-established:
  - "An e2e over store-mode verbs drives library calls in-process (the gh stub cannot cross a process boundary) and the CLI wrappers through a captured `process.exit`"

metrics:
  duration: "7min"
  completed: 2026-10-01
  tasks: 2
  files: 1
  tests-added: "gh-pr-e2e.test.cjs 8 (6 lifecycle, 1 merge-queue, 1 store-off parity)"
tokens_input: 7072184
tokens_output: 56121
tokens_cache_read: 6891362
tokens_cache_write: 180716
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 14: Lifecycle end to end and store-off parity Summary

One test file now proves SC1, SC2 and SC3 and the D-01 invariant for objective 49: a three-TRD objective yields exactly one PR closing four issues, two parallel wave worktrees merge back into the objective branch with `Refs` on every commit and no extra remote branch, a stranger's scope stays out of the spec until an assignee confirms it, a verified PR merges and one reconcile leaves everything closed and cleaned up, and with `github.store:false` none of it makes a gh call.

## Performance

- Tasks: 2 of 2
- Files: 1 created (`gh-pr-e2e.test.cjs`, 8 tests), 0 modified
- Defects found in shipped code: 0

## Accomplishments

- **SC1 (test 1):** `startObjectivePr` on objective 49 (#100, TRDs #101-#103) leaves exactly one PR on the fake; its body's `Closes #N` lines are `[100, 101, 102, 103]`, equal to `closesFor` and to the mapping; `prs['49']` records the number, branch and the pinned `wiki_base_sha`; all three TRDs are frozen; the single start commit ends `Refs #100`; a second `start` makes no second PR and no second commit.
- **SC2 (test 2):** `gh trd start` for 49-01 and 49-02, two worktrees from `exec-context worktree --base <objective branch>`, one `df-tools commit` in each (results carry `refs: 101` / `refs: 102`), both merged back `--no-ff`, `df/exec-*` removed, `gh pr sync`: still one PR, `ls-remote` heads are exactly `main` and `df/objective-49-lifecycle-demo`, the PR head equals the merged tip, and each of the three non-merge commits on `main..HEAD` has its own `Refs #<issue>` (objective, 49-01, 49-02).
- **TRD completion (test 3):** two `summary post` calls take `devflow:in-progress` off each TRD and move the PR summary to `TRDs complete 1/3` then `2/3`, with no second PR.
- **SC3 (test 4):** a scope comment by `mallory` on 49-03 is not applied, is listed `pending` by `readEffectiveSpec`, `gh trd spec` and `gh pr status`; `confirm-scope` as mallory exits 1 ("mallory is not an assignee") with nothing queued or written; as alice it queues, flushes and the scope applies (`applied: [1]`, no pending left, confirm signed by alice).
- **Verify pass (test 5):** after a wiki page changed since `wiki_base_sha`, `verification post (passed)` makes the PR ready, posts `devflow/verification` = success on the PR head (once), and posts one wiki-diff comment naming only `Research-b.md`; `objective set-status complete` before the merge queues no close (`close_deferred: "pr #104"`) and #100-#103 stay open.
- **Merge and reconcile (test 6):** `mergeObjectivePr` (no queue) squash-merges and reconciles: #100-#103 closed, the 99 unrelated issues untouched, remote branch gone (origin holds only `main`), checkout on `main` at origin's tip, local objective branch deleted, `gh pull --all` ran once, `merged_at` and `reconciled_at` recorded; a second reconcile (through the CLI) reports `already_reconciled`, closes nothing, writes nothing, and pulls nothing.
- **Queue variant (test 7):** with `mergeQueue:true`, `gh pr merge` exits 3 (PR enqueued, not merged, branch kept, issues open), `gh pr reconcile` exits 3 with zero writes; after the queue lands it with `closeKeywordCap: 2`, one reconcile closes exactly the two stragglers and finishes the cleanup (exit 0).
- **Store-off parity (test 8):** with `github.enabled:true, store:false`, all five `gh pr` library verbs and CLI verbs plus `gh trd confirm-scope` and `gh trd start` report skipped (exit 0), `fake.calls()` is `[]`, nothing is queued, no git change; `cmdCommit` messages are exactly as passed (no `Refs`, no `refs` key in the result); `init execute-objective` reports `pr_lifecycle:false` with no `objective_branch`/`pr_number`; with a `prs` entry on record, `summary post` and `verification post` write today's bytes with zero gh calls; `objective set-status complete` writes locally with no `close_deferred`.

## Task Commits

1. **Task 1: SC1, SC2 and TRD completion (tests 1-3)** - `5accf9fe` (test)
2. **Task 2: SC3, verify, merge, queue, parity (tests 4-8)** - `2971a769` (test)

Plan metadata (this SUMMARY): committed after the tasks.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs` - the lifecycle e2e (harness: hermetic env, `makeGitRemote`, `makeStoreProject` renumbered to objective 49, fake GitHub through `client._setRunGh` with origin-to-fake ref mirroring, fake clock, counted `gh-cache.pullAll`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, harness] The confirm must be authored by the token owner**
- **Found during:** Task 2, test 4 (first run: `applied` stayed `[]` after alice's `confirm-scope`)
- **Issue:** the first harness used the fake's default viewer (`devflow-bot`) and only stubbed `gh api user` to say "alice". The confirm comment is posted by the API as the fake's viewer, and the acceptance rule (correctly) requires the confirm's author to be an assignee, so it did not apply. This is the gate working, not a product bug.
- **Fix:** the fake is created with `viewer: 'alice'` (the objective issue's assignee, the token owner); the `gh api user` stub flips to `mallory` only for the refusal step.
- **Files modified:** `gh-pr-e2e.test.cjs` only
- **Commit:** `2971a769`

**2. [Rule 3 - Blocking, harness] Local `summary post` file name**
- **Found during:** Task 2, test 8 (ENOENT reading `49-01-alpha-SUMMARY.md`)
- **Issue:** the local-mode SUMMARY is not named after the TRD file; the assertion guessed the name.
- **Fix:** the test finds the one `*SUMMARY.md` in the objective directory and compares its bytes to the text posted.
- **Files modified:** `gh-pr-e2e.test.cjs` only
- **Commit:** `2971a769`

### Other notes

- The TRD names objective 49 / #100 / TRDs #101-#103 literally. The fixture project is objective 7, so the harness renames it to 49 on disk and seeds 99 unrelated issues first; the numbers asserted are 100-103 as written. The fake has no "start numbering at N" option, so seeding was the cheapest honest route (and gives the "unrelated issues untouched" assertion for free).
- No defect in 49-01..49-12 was found, so no RED/fix pair exists and `files_modified` stays the one test file.

## Auth Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: tests 1-3 | `node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs` | 0 (3 pass) | PASS |
| 2: tests 4-8 | `node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs` | 0 (8 pass, 3 suites) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs` | 0 (8/8) | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/gh-*.test.cjs plugins/devflow/devflow/bin/lib/planning-*.test.cjs` | 0 (1780 pass, 0 fail) | PASS |
| repo guards | `node --test plugins/devflow/devflow/bin/lib/*.repo.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js` | 0 (82 pass, 0 fail) | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 1 (both harness corrections landed in one rerun)
- Must-haves verified: 6/6 (SC1, SC2, SC3, verify pass, merge/reconcile idempotence, store-off parity)
- Gate failures: None
- Full `npm test` was skipped as instructed (no `node_modules` in the worktree); the gh-*, planning-* and repo-guard suites above were run instead.

## Notes for 49-15

- The harness is reusable: `setup({store, wiki, fake, assignees})`, `addWorktree(id)`, `commitIn(cwd, msg, rel, text)`, `prCmd(args)` / `trdCmd(args)` (captured `process.exit`, raw JSON on stdout), `S.viewer` to change who `gh api user` reports.
- Facts a docs pass can state as proven: `gh pr merge` exits 3 under a merge queue and `gh pr reconcile` exits 3 until the queue lands the PR; reconcile closes only the closing-keyword stragglers; a confirm only counts when posted by an assignee (so the token owner must be one); with the store off every `gh pr` verb exits 0 with `skipped:true` and `pr_lifecycle` is `false`.
- `Refs #N` is matched with `^Refs #\d+$` (a final paragraph, not a git trailer); the start commit carries the objective issue's number, a wave commit its TRD's.

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs` exists; commits `5accf9fe` and `2971a769` exist on `df/exec-49-14`.
