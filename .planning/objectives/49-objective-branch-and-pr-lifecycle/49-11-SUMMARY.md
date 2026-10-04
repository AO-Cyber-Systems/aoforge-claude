---
objective: 49-objective-branch-and-pr-lifecycle
trd: "11"
subsystem: github-store
tags: [planning-verbs, summary-post, verification-post, commit-status, pr-ready, wiki-diff, labels_remove, close-deferred]

requires:
  - objective: 49-02
    provides: mapping `prs` map (`getPr`, `merged_at`, `wiki_base_sha`)
  - objective: 49-04
    provides: `gh-wiki.diff(root, fromSha)` (string on success, `{ok:false, reason}` otherwise)
  - objective: 49-05
    provides: `upsert-pr` refresh (branch + base + one section, no title), `pr-ready`, `patch-issue labels_remove`
  - objective: 49-06
    provides: the `in_progress` label that `gh trd start` adds
  - objective: 49-10
    provides: `post-status` and `upsert-pr-comment` ops
provides:
  - "summary post (store mode): in ONE enqueue, the summary comment + `patch-issue labels_remove:[in_progress]` + (PR on record) `upsert-pr {branch, base, summary:'TRDs complete k/N'}` with no title"
  - "verification post (store mode, PR on record): `post-status devflow/verification` per verdict; `passed` also queues `pr-ready` and the `wiki-diff` PR comment"
  - "objective set-status complete defers the issue close while the PR is unmerged (`close_deferred`)"
affects: [49-12, 49-13, 49-14]

tech-stack:
  added: []
  patterns:
    - "Every PR-aware op is built inside the `enqueue` callback of `writeThrough`, which local mode never calls: D-01 holds by construction"
    - "An op that coalesces by (kind, target) is merged over the pending one before it is queued (`upsertPrOp`, `removeLabelOp`), so a queued PR creation keeps its title/wiki and a `trd start` label add cannot outlive the completion"
    - "A PR hook that cannot run (merged PR, no base, unreadable verdict or wiki diff) is a note or a warning, never a failed verb"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs

key-decisions:
  - "The deferral keys on `prs[obj]` existing without `merged_at` (a branch-only entry counts: the PR may simply not be flushed yet). `close_deferred` is `pr #N`, or `pr (branch B)` before a number exists"
  - "`objective.cjs` prints `warnings` but not `close_deferred`, so the verb also pushes a warning (`the objective issue stays open until pr #N merges (close deferred)`); objective.cjs is untouched"
  - "The summary comment op is built in planning-verbs with `ghComments.fileCommentText` instead of calling `enqueueSummary`, because that function enqueues by itself and a second enqueue could leave the comment queued and the label/PR ops not (atomic all-or-nothing, as the TRD's 'same enqueue' asks)"
  - "k/N: N = TRD files of the objective union mapped TRDs (plus the TRD being posted); k = those with a `-SUMMARY.md` in the cache. The TRD's 'N = mapped TRDs' is widened to the union so k can never exceed N"
  - "Verdict descriptions: success `Objective <id> verified (<score>)`; failure `Objective <id> verification found gaps (<score>)`; pending `Objective <id> needs human verification (<score>)`; the score is omitted when absent; at most 140 chars (cut with `...`)"
  - "The wiki diff is posted on `passed` only. Empty diff: the single line `No wiki pages changed during this objective.`; otherwise `## Wiki changes during objective <id>` and a fenced diff block whose fence is one backtick longer than any run inside the diff"

patterns-established:
  - "`prOnRecord(main, id)`: the one reader of the objective's `prs` entry for the verbs"

requirements-completed: [GPR-03, GPR-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: about 45min
completed: 2026-10-01
---

# Objective 49 TRD 11: Summary and verify hooks drive the PR, and the early-close fix Summary

**In store mode `summary post` takes the in-progress label off the TRD and refreshes the PR's `TRDs complete k/N`, `verification post` turns the verdict into a `devflow/verification` commit status (passed also marks the PR ready and posts the wiki diff), and `objective set-status complete` no longer closes the objective issue while its PR is unmerged.**

## Performance

- Tasks: 2 of 2 (each RED committed before its GREEN)
- Files: 1 created (test), 1 modified (planning-verbs.cjs)

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 Defer the close | RED | 5d4d11ee | test(49-11): objective must not close before its PR merges |
| 1 Defer the close | GREEN | 3931bdeb | fix(49-11): store mode closes the objective issue on merge, not at verify |
| 2 Summary and verification hooks | RED | 7026e9ab | test(49-11): summary and verification drive the objective PR |
| 2 Summary and verification hooks | GREEN | df8e1262 | feat(49-11): TRD completion and verify pass update the PR |

## What was built

**`objectiveSetStatus` (Task 1).** For `status === 'complete'` in store mode, `prOnRecord` (new reader over `ghMapping.getPr`) is consulted; with an entry that has no `merged_at` the `patch-issue {state:'closed'}` is not built. The status is still written, the result carries `close_deferred` and a warning. `cancelled` and `reopened` are unaffected. `objective.cjs storeObjectiveComplete` routes through this verb, so it needed no change. After reconcile (49-12) records `merged_at`, a later `complete` closes as before.

**`summaryPost` (Task 2).** `summaryEnqueue` queues, in one `outbox.enqueue`: the `summary` `upsert-comment`, a `patch-issue labels_remove:[<github.labels.in_progress>]` on the TRD issue, and, with an unmerged PR on record, an `upsert-pr {id:<obj>}` with `{branch, base, summary:'TRDs complete k/N'}` and no `title`. `pr_refresh` on the result says why no refresh was queued (`skipped (pr merged)`, `skipped (no branch on record)`).

**`verificationPost` (Task 2).** `verificationEnqueue` parses the VERIFICATION frontmatter (`status`, `score`) with `extractFrontmatter`. With an unmerged PR on record: `passed` queues `post-status success`, `pr-ready` and (when `wiki_base_sha` is on record and a clone exists) the `wiki-diff` `upsert-pr-comment`; `gaps_found` queues `post-status failure`; `human_needed` queues `post-status pending`. A status that is none of those, or a missing frontmatter, queues nothing and warns.

## Deviations from Plan

### Design choices within the TRD

- **Summary/verification comment ops are built here, not through `ghComments.enqueueSummary/enqueueVerification`.** Those functions call `outbox.enqueue` themselves, so using them would split the work into two enqueues (and a failure of the second would leave the file marked `(not queued)` while the first op was queued). The op shape is identical (`upsert-comment {id, kind} {mode:'replace', text: fileCommentText(file, text)}`); the existing planning-verbs tests 9 and 11 still pass unchanged.
- **Pending-op merging (not in the TRD).** `upsert-pr` and `patch-issue` coalesce by (kind, target) with the latest payload winning. Without a merge, a `summary post` would (a) overwrite a still-queued `upsert-pr` creation and lose its `title` and `wiki`, and (b) leave a still-queued `trd start` `labels_add` in place, which the flusher refuses to override with a `labels_remove` in the same op. Tests 1b and 1d pin both.
- **Merged PR: no hooks.** With `merged_at` set, neither the summary refresh nor the status/ready/diff is queued (`upsert-pr` on a merged PR is a no-op with a warning; ready is meaningless). Not in the TRD; tests 1c and 3d.
- **`close_deferred` also becomes a warning**, because `objective complete`'s printed output has `warnings` but not the new field.
- **N is the union of TRD files and mapped TRDs**, widened from 'mapped TRDs' (see key-decisions).
- **Fixture objective is 7, not 49.** The TRD's examples name `49-01`, `49-02`, `TRDs complete 1/2`; the shared store fixture has objective 7 with three TRDs and one existing SUMMARY, so the tests assert `1/3` then `2/3`.
- **Test 4b (backtick fence) was added after the implementation existed** and passed on first run; it was not watched to fail. It pins `fenceFor`, which the TRD does not list.

### Auto-fixed Issues

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Defer the close (tests 8-10) | `node --test plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs` | 0 (35 tests, 35 pass) | PASS |
| 2: Summary and verification hooks (tests 1-7, 11) | `node --test planning-verbs-pr.test.cjs planning-verbs.test.cjs planning-verbs.e2e.test.cjs gh-store-e2e.test.cjs` | 0 (25 + existing, all pass) | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../planning-verbs-pr.test.cjs` | 5 tests, 3 pass, 2 fail (8, 8b: `close_deferred` undefined); 9 and 10 pin unchanged behaviour and pass | FAIL (correct) |
| GREEN (task 1) | same | 5 pass, 0 fail; objective.test.cjs green | PASS (correct) |
| RED (task 2) | same | 24 tests, 8 pass, 16 fail (every hook test; 3c, 3d, 11 and the task 1 tests pass by construction) | FAIL (correct) |
| GREEN (task 2) | same | 25 pass, 0 fail | PASS (correct) |

## Validation Gate Results

| Gate | Command | Result | Status |
|---|---|---|---|
| test | `node --test planning-verbs-pr.test.cjs` | 25 pass, 0 fail | PASS |
| regression | `node --test planning-verbs.test.cjs objective.test.cjs gh-store-e2e.test.cjs gh-seam.repo.test.cjs planning-verbs.e2e.test.cjs planning-verbs-cli.test.cjs` plus the new file | 116 tests, 116 pass | PASS |
| wide | `node --test gh-*.test.cjs planning-*.test.cjs *.repo.test.cjs` (in `bin/lib`) | 1749 tests, 1749 pass | PASS |

Full `npm test` was not run (no `node_modules` in the worktree), per the dispatch.

## Test list coverage (TRD)

1 (and 1b-1e), 2 (and 2b), 3 (3b-3f), 4 (4b), 5, 6, 7 (7b), 8 (8b, 8c), 9, 10, 11. Test 11 seeds a `prs` entry in a local-mode project and asserts today's bytes, `delegate: 'objective complete'`, zero `fake.calls()` and no journal.

## Notes for dependents

**49-12 (merge and reconcile)**
- After a merge, record `merged_at` in `prs[obj]` (setPr). That is the single signal this TRD reads: with it, `objective set-status complete` closes the issue and the summary/verify hooks stop touching the PR. The objective issue is otherwise closed by GitHub through the PR's `Closes #<obj>`; if the closing keyword did not close it (closeKeywordCap), reconcile's straggler path must close it, and may then run `objective set-status complete` (now closes) or a direct `patch-issue`.
- `objective complete` now exits 0 with a warning, status written and the issue open, while the PR is unmerged. A reconcile that expects the issue to be closed after `objective complete` must not assume it.

**49-13 (workflow prose)**
- Run `gh pr sync` before `verification post`: the status carries no sha and the flusher posts it on the PR head at flush time, so the pushed tip must contain the verified commits (`gh pr status` reads `devflow/verification` from `commits/{pr head sha}/status`).
- The VERIFICATION frontmatter must carry `status: passed | gaps_found | human_needed` (and optionally `score: 12/12 must-haves`). Anything else posts no PR status and prints a warning.
- `summary post` already removes the in-progress label and refreshes the PR; the prose must not do either itself. `objective complete` no longer closes the issue before merge; the prose should say the issue closes on merge.

**49-14 (e2e and parity)**
- Order of ops in one `verification post` (passed): comment, status, ready, wiki-diff; all four are idempotent (a second pass wrote zero requests in test 3b).
- `fake.statuses[sha]` is newest-first; the `devflow/verification` status lands on the PR head sha at flush.
- Local-mode parity is pinned by test 11 (bytes, zero calls, no journal) even when a `prs` entry exists.

**Not covered**
- The live API behaviour of a status on a PR head that moved between verify and flush is whatever 49-10 documented; this TRD adds nothing there.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (summary: comment + label removal + PR refresh in one enqueue with no title; verify passed: status success, ready, wiki diff; gaps_found failure and human_needed pending leave the PR draft; no close before merge; local mode byte-identical with zero gh calls; no PR on record behaves as objective 48)
- Gate failures: None

## Self-Check: PASSED

Verified: `planning-verbs.cjs` and `planning-verbs-pr.test.cjs` exist in the worktree; commits 5d4d11ee, 3931bdeb, 7026e9ab and df8e1262 are on branch `df/exec-49-11`.
