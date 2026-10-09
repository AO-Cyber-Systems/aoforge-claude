---
objective: 49-objective-branch-and-pr-lifecycle
trd: "09"
subsystem: github-store
tags: [gh-pr, objective-branch, draft-pr, createLinkedBranch, start-commit, freeze, status, seam-guard, tdd]

requires:
  - objective: 49-01
    provides: fake GitHub linked branches, PR records, statuses, `onCreateBranch`, `pushRef`
  - objective: 49-02
    provides: mapping `prs` map (`getPr` / `setPr`)
  - objective: 49-04
    provides: objective-branch git seam (fetch/switch/startCommit/push/isAncestor), `makeGitRemote()`
  - objective: 49-05
    provides: outbox `upsert-pr` (draft create, derived closes, wiki and summary sections)
  - objective: 49-06
    provides: `readEffectiveSpec` pending scopes
  - objective: 49-07
    provides: `commit-trailer.applyRefs`
provides:
  - "gh-pr.cjs: startObjectivePr, syncObjectivePr, prStatus, linkedBranchFor, createLinked, branchNameFor, closesFor, storeGate, branchProblem"
  - "gh-pr-cli.cjs: cmdGhPr(cwd, args, raw) for start | sync | status"
  - "df-tools `gh pr start|sync|status` dispatch and help usage"
  - "gh-seam.repo.test.cjs: gh-pr.cjs guarded (may write), gh-pr-cli.cjs and commit-trailer.cjs guarded and no-direct-write, new test 23 (every gh-*.cjs is guarded) and 23b"
affects: [49-11, 49-12, 49-13, 49-14]

tech-stack:
  added: []
  patterns:
    - "One synchronous, online-required direct write (`createLinkedBranch`) in a guarded-but-not-NO_DIRECT_WRITE module; every other PR write is queued"
    - "All GitHub reads and the dirty-tree check come before the first local or remote change, so a failed start leaves nothing half done"
    - "Idempotent start: the decision to make the start commit is `HEAD is contained in origin/<default>`, not an equality check, so a re-run and a reused branch with its own commits both skip it"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-pr.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "The issue's node id comes from the `linkedBranches` GraphQL read (`issue { id }`), so `start` needs no separate `GET issues/{n}`"
  - "TRD freezes are queued BEFORE `upsert-pr`: a PR that has to wait (the queue stops on a `pending` op) must not hold the freezes"
  - "A freeze that fails (a TRD with a hand-written body, no issue yet) is a warning and `freeze_errors`, not a failed start: the branch and PR already exist and a re-run retries the freeze"
  - "A re-run reuses `prs[obj].wiki_base_sha` as the pinned wiki revision instead of the clone's current head, so start stays byte-idempotent and the pin means what it says"
  - "`start` sends no `summary`; `sync` owns the `TRDs complete k/N` line, counted from the cached plan files and SUMMARYs (`findObjectiveInternal`)"
  - "A failed push in `sync` still queues and flushes the refresh but marks the result `pending` (exit 3), even when the flush itself succeeded: the branch is not published"
  - "`status` fails only when the PR itself cannot be read; a failed commit-status, merge-queue or per-TRD read is listed in `errors`. `pr.state` is none | queued | draft | ready | merged | closed, `in_merge_queue` is separate"
  - "gh-pr-cli carries small copies of gh-store-cli's private result/emit/positionals helpers (gh-store-cli is not owned by this TRD); `EXIT` and `flushResult` are imported, not copied"

patterns-established:
  - "Seam test 23: every non-test `gh-*.cjs` in lib must be in GUARDED (gh-client is the seam itself and is held by test 17)"
  - "A git-backed lifecycle test makes the project root a `makeGitRemote()` clone with the `.planning/` cache copied in untracked, and keeps the fake's refs equal to origin's heads before every gh call"

requirements-completed: [GPR-01, GPR-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: about 25 min
completed: 2026-10-01
tokens_input: 12605591
tokens_output: 103590
tokens_cache_read: 12124068
tokens_cache_write: 481369
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 09: `gh pr start | sync | status` Summary

**`df-tools gh pr start <obj>` puts the checkout on the objective's linked branch (reused or created with `createLinkedBranch`), makes one empty `Refs #<issue>` start commit, pushes, opens the one draft PR that closes the objective and every TRD and pins the wiki revision, and freezes every TRD, all idempotently; `sync` and `status` keep it current and visible.**

## Accomplishments

- `startObjectivePr` follows the TRD's sequence. Store-mode gate (local mode is skipped with zero gh calls), mapping entry (else `run df-tools gh sync <obj> first`), dirty-tracked-tree check, then every GitHub read (repository, linked branches, the chosen name's ref, the default tip) before anything changes. Online is required: if GitHub cannot be read it fails with nothing queued, no local branch and no remote branch.
- Branch choice: the issue's linked branch (preferring the one recorded in `prs[obj]`), else `--name`, else the recorded branch, else `objective_branch_template` rendered exactly as `init execute-objective` renders it. A same-named remote branch that is not linked is refused with a message naming `--name`; `linkedBranch: null` from `createLinkedBranch` is a failure, never success.
- Local work: fetch, `switchTo`, then the start commit only when `HEAD` is contained in `origin/<default>` (no commits of its own), message built with `applyRefs('chore(<obj>): start objective <obj>', issue)`, then `push -u`. The PR is opened only after the push (Pitfall 1).
- Records `prs[obj] {branch, base, wiki_base_sha}`, queues the TRD freezes and `upsert-pr {branch, base, title: 'Objective <obj>: <name>', wiki}` (title from ROADMAP, else the directory slug), then flushes. Test 1 asserts one PR whose `Closes #` lines equal the objective issue plus both TRD issues.
- `syncObjectivePr` pushes, queues `upsert-pr {branch, base, summary}` (no title) and flushes; `prStatus` reads PR state, the latest `devflow/verification` status of the PR head, closes (mapping) against the PR body (`closes_missing`), pending scopes per TRD, and queued ops, and never writes.
- `gh-pr-cli.cjs` and the dispatch: `gh pr start|sync|status`, `--name`, `--no-flush`, `--no-wait`, `--raw`, exit codes 0/1/2/3; the `gh` help usage and the "Available:" error list `pr`.
- Seam guard: `gh-pr.cjs` GUARDED with exactly one direct `ghWrite(` (the `createLinkedBranch` mutation, asserted); `gh-pr-cli.cjs` and `commit-trailer.cjs` GUARDED and NO_DIRECT_WRITE; new test 23 fails if any `gh-*.cjs` is not in GUARDED, test 23b pins the one-write rule.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 414f0c0f | test(49-09): gh pr start |
| 1 | GREEN | 3d5ee922 | feat(49-09): start the objective branch and draft PR |
| 2 | RED | b5d8e611 | test(49-09): gh pr sync and status |
| 2 | GREEN | a4813362 | feat(49-09): sync and status for the objective PR |
| 3 | RED | 8a9d264a | test(49-09): gh pr CLI and seam guard |
| 3 | GREEN | 9f238c26 | feat(49-09): df-tools gh pr start\|sync\|status |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: startObjectivePr (tests 1-8) | `node --test plugins/devflow/devflow/bin/lib/gh-pr.test.cjs` (13 pass) | 0 | PASS |
| 2: sync and status (tests 9-11) | `node --test plugins/devflow/devflow/bin/lib/gh-pr.test.cjs` (28 pass) | 0 | PASS |
| 3: CLI, dispatch, help, seam (tests 12-14) | `node --test gh-pr-cli.test.cjs gh-seam.repo.test.cjs help.test.cjs dispatch-completeness.test.cjs` (48 pass) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-pr.test.cjs` against a not-implemented stub (every start assertion failed on `not implemented`) | 1 | FAIL (correct) |
| GREEN (task 1) | `node --test gh-pr.test.cjs` | 0 (13 pass) | PASS (correct) |
| RED (task 2) | `node --test gh-pr.test.cjs` | 1 (15 of 28 fail: `syncObjectivePr` / `prStatus` missing) | FAIL (correct) |
| GREEN (task 2) | `node --test gh-pr.test.cjs` | 0 (28 pass) | PASS (correct) |
| RED (task 3) | `node --test gh-pr-cli.test.cjs gh-seam.repo.test.cjs` | 1 (CLI file cannot load; seam tests 23 and 23b fail) | FAIL (correct) |
| GREEN (task 3) | `node --test gh-pr-cli.test.cjs gh-seam.repo.test.cjs help.test.cjs dispatch-completeness.test.cjs` | 0 (48 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-pr.test.cjs gh-pr-cli.test.cjs` (28 + 19 = 47 pass) | 0 | PASS |
| regression | `node --test 'gh-*.test.cjs' help.test.cjs dispatch-completeness.test.cjs doc-refs.repo.test.cjs commit-trailer.test.cjs objective-branch.test.cjs` (1525 tests, 266 suites, 0 fail) | 0 | PASS |
| repo guards | `node --test *.repo.test.cjs` (37 tests, 20 suites, 0 fail) | 0 | PASS |

Full `npm test` was not run (the worktree has no `node_modules`; the daemon-spawning `devflow-watch` / `handoff-e2e` tests fail there for that reason only, as recorded in 49-01 and 49-02).

## Test list coverage

TRD tests 1-8 are `describe('49-09 gh pr start')` (1-8, with 3b, 8b), 9-10 and 11 are `describe('49-09 gh pr sync')` / `describe('49-09 gh pr status')`, 12-13 are `describe('49-09 gh pr CLI')` (12a-12o), 13 dispatch is `describe('49-09 df-tools dispatch for gh pr')`, 14 is `gh-seam.repo.test.cjs` 23 and 23b. Extra cases beyond the TRD list: `--name` (3b, 12d), not an objective id (8b), local mode at library level (9, 13), `branchNameFor`/`closesFor`/`linkedBranchFor` (10, 11), sync twice writes nothing (9b), sync before start (9c), sync with the push failing but GitHub up (10b, 12k), `--no-flush` (10c, 12c), verification status, `closes_missing`, pending scopes, ready/merged/queued states, never-started status (11b-11g), a failed PR read (12, 12n), usage and `--help` (12g, 12h).

## Deviations from Plan

### Auto-fixed Issues

None: the three tasks ran RED then GREEN without a fix cycle.

### Choices beyond the TRD text (no behaviour contradicts the TRD)

- The TRD's start pseudocode reads `GET issues/{n}` for the issue node id; the `linkedBranches` GraphQL read already returns `issue { id }`, so one read is saved.
- Test 9 expects "TRDs complete 1/2": the fixture has three TRD files, so the test removes the third file from the cached copy of the project; a later-mapped TRD 7-03 still joins `closes`.
- The TRD's example numbers (objective 49, issues #100-#102) are the fixture's objective 7 with the fake's own issue numbers; branch `df/objective-07-store-demo`.
- Test 5 reaches the `linkedBranch: null` path through a test-only intercept of the `createLinkedBranch` call (the fake only returns null for a name that already exists, which the earlier ref check refuses first). That models the race the null guard exists for.
- `gh-pr-cli.cjs` copies `result/emit/positionals` from gh-store-cli instead of exporting them (gh-store-cli is not in this TRD's file list).

## Known limits

- The `pending` note for `upsert-pr`'s `No commits between` is printed by gh-pr-cli (`Waiting: <detail>; push a commit...`), but no test reaches it: `start` always pushes a start commit first, so only a `sync` of an unpushed, never-differing branch could. `gh-store-cli.pendingWhy` still has no case for the reason `pending` (not owned here).
- `mergeQueueEntry` is read best-effort over GraphQL; the fake does not model it, so in tests `in_merge_queue` comes from the fake-only REST `queued` flag.
- `start` does not refuse to run from a linked worktree; it acts on the cwd it is given. The orchestrator is expected to run it from the checkout that will stand on the objective branch.

## Notes for dependents

- **49-12 (merge, reconcile):** add to `gh-pr.cjs`/`gh-pr-cli.cjs`; reuse `storeGate(root)` (`{repo}` or `{result}`: skipped/failure), `closesFor`, `branchProblem`, `flushNow`-style flushing (not exported: copy the 3-line idiom or export it), and `gh-pr-cli`'s `fromLibrary(cwd, r, headline, {extraPending})` shape (raw flush result in `r.flush`, `null` when `--no-flush`). Add new verbs to `PR_AVAILABLE`/`PR_USAGE` and to the help usage string. `gh-pr.cjs` must keep exactly one direct `ghWrite(` (test 23b); queue everything else.
- **49-12 / 49-14 fixtures:** the test harness (git clone as project root, `.planning/` copied in untracked, `syncRefs()` before each gh call, `onCreateBranch: (name) => g.createRemoteBranch(name)`, fake clock) is inline in `gh-pr.test.cjs` and `gh-pr-cli.test.cjs`; it is small enough to copy and has not been extracted to `__fixtures__`.
- **Result shapes:** `startObjectivePr` -> `{ok, objective, repo, branch, base, issue, created_branch, start_commit, frozen, already_frozen, freeze_errors, wiki_sha, queued, flush, pr:{number,url}|null, warnings}`; `syncObjectivePr` -> `{ok, branch, base, push:{ok,error?}, summary, queued, flush, pending, pr}`; `prStatus` -> `{ok, started, branch, base, issue, pr:{number,url,state,draft,merged,in_merge_queue,head_sha}, verification, closes, closes_missing, pending_scopes, queued_ops, errors}`.
- **49-11 (verify post):** `prStatus` reads `devflow/verification` from `commits/{pr head sha}/status`; the head sha is the PR's `head.sha`, so post the status on the pushed tip.
- **49-13 (prose):** call `df-tools gh pr start <obj>` once at execute start (exit 1 offline: nothing was changed, nothing queued), `gh pr sync <obj>` after each wave merge (exit 3 means pushed-or-queued, run it again later), `gh pr status <obj>` to show where it stands. With the store off all three print `skipped` and exit 0, so the prose can call them unconditionally.
- **init (49-08):** `objective_branch` already prefers `prs[obj].branch`; `gh pr start` records it, so after start `init` returns the real linked branch and `pr_number`.
- **Freeze:** `start` freezes every mapped TRD with a decodable devflow body; a TRD planned or mapped later is not frozen until `gh pr start` is re-run (idempotent, freezes only the unfrozen ones).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (start sequence with one linked branch, one start commit, one draft PR and frozen TRDs; online-required with nothing queued and no local change; idempotent re-run with zero writes; unlinked same-name remote branch and `null` linkedBranch refused; sync pushes and re-queues, offline exits 3; status reads only; local mode skipped; seam guard)
- Gate failures: None

## Self-Check: PASSED

- FOUND: gh-pr.cjs, gh-pr.test.cjs, gh-pr-cli.cjs, gh-pr-cli.test.cjs, df-tools.cjs, help.cjs, gh-seam.repo.test.cjs (all under `plugins/devflow/devflow/bin/`)
- FOUND commits: 414f0c0f, 3d5ee922, b5d8e611, a4813362, 8a9d264a, 9f238c26
