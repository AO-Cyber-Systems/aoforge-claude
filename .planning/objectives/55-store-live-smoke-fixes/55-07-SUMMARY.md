---
objective: 55-store-live-smoke-fixes
trd: "07"
subsystem: github-store
tags: [store-mode, live-smoke, unpushed-guard, merge-queue, reconcile]

requires:
  - objective: 55-06
    provides: ruleset 24502205 with admin bypass, caller workflow pinned to d4147b8c, workflow PR #6 merged (20c3bd5)
  - objective: 55-03
    provides: unpushed-commit guard in verification post and gh pr merge
  - objective: 55-04
    provides: objective issue titled after the name, store-mode footer
  - objective: 55-05
    provides: objective put names objective add; reconcile compares content for squash merges
provides:
  - live proof on AO-Cyber-Systems/devflow-store-smoke that objective 2 ran the store lifecycle end to end (issue #7, TRD #8, PR #9, merge queue, merge 34ba818)
  - live capture of both unpushed-guard refusals naming gh pr sync (verification post on the draft PR, gh pr merge on the ready PR)
  - defect note for the TRD's guard ordering assumption (draft check precedes the merge guard)
affects: [55-08]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Merge-guard clause proven with option B (user answer, relayed by orchestrator): the merge guard was fired on the READY PR with a second unpushed commit, because the draft check (gh-pr.cjs:975) runs before the guard (:980-982) and makes it unreachable on a draft PR"

patterns-established: []

requirements-completed: ["55-5", "55-2", "55-6"]

verification:
  gates_defined: 0
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 10min
completed: 2026-10-05
---

# Objective 55 TRD 07: Live objective-2 lifecycle Summary

**Objective 2 (issue #7, TRD #8) ran the store lifecycle on AO-Cyber-Systems/devflow-store-smoke. The unpushed-commit guard refused `verification post 2` (draft PR) and `gh pr merge 2` (ready PR), and both refusals named `gh pr sync`. After the sync, the required checks went green. PR #9 merged through the merge queue as 34ba818 (merge_group run 37310333089, success). Reconcile returned `kept: []` and `warnings: []`.**

## Performance

- Started: 2026-10-05T12:25:18Z
- Checkpoint (decision): ~12:29Z; resumed on option B
- Completed: 2026-10-05T12:35:00Z
- Duration: ~10 min
- Tasks: 2 (live-ops). Files in this repository: SUMMARY only

## Progress
- [x] Task 1: Register objective 2, start its PR, commit code without syncing, fire the guard — 9f068bc0. Gap: the merge refusal named the draft check, not `gh pr sync` (resolved in Task 2 by option B)
- [x] Task 2: Sync, checks green, verify, merge through the queue, reconcile, code on main — 9bf74fdf

## Ids

| What | Value |
|---|---|
| Repository | AO-Cyber-Systems/devflow-store-smoke |
| Objective | 2 (`02-goodbye-cli`) |
| Objective issue | #7, title `[Objective 2] Goodbye CLI` |
| TRD sub-issue | #8, `[TRD 02-01] goodbye` (sub-issue of #7) |
| Linked branch | `df/objective-02-goodbye-cli` |
| PR | #9, title `Objective 2: goodbye-cli`, body `Closes #7` / `Closes #8` |
| Start commit | `32618b00d893125295a23ca920bffa093da42a5e` (`chore(2): start objective 2`, pushed by `gh pr start`) |
| Code commit 1 | `1378f399a031ae0065a49bdb48bf0177a64ced5a` (`feat(2): add goodbye.sh`, `Refs #7`), mode 100755 |
| Code commit 2 (option B) | `25662fae18f7787bff2df9464e5a8a5a6626dce4` (`docs(2): describe goodbye.sh`, `Refs #7`): adds a comment line, output unchanged |
| merge_group run | 37310333089, conclusion **success** (head `34ba818e...`, branch `gh-readonly-queue/main/pr-9-20c3bd5684f9c979e30feb1b8c5e1ac80ff64b57`) |
| Merge commit | `34ba818eb4dd1de2ce8632f3d4dbcbc8ab1f187d` (`Objective 2: goodbye-cli (#9)`), mergedAt 2026-10-05T12:33:52Z |

## Task 1 record

1. **55-2 (objective put on an unknown objective).** `objective put 3 --from <scratchpad>/smoke2-obj3-unknown.md` -> exit 1:
   ```
   Error: objective 3 is not known (no ROADMAP entry or directory under .planning/objectives); register a new objective with df-tools objective add "<description>", then run this again
   ```
   Nothing written or queued: outbox `0 pending, 0 blocked, 23 done` before and after; `.planning/objectives/` still only `01-hello-cli`.
2. **objective add.** `objective add "Goodbye CLI"` -> `objective_number: 2`, `slug: goodbye-cli`, `published: true`, `flush: flushed` (`4 op(s) written`). Warning: `Objective 2: no milestone resolved; issue created without one`. Mapping: objective 2 -> issue #7.
   - **55-6 title:** `gh issue view 7 --json title` -> `[Objective 2] Goodbye CLI` (not the slug).
   - **55-6 footer (verbatim):** `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). This issue is the source of truth (store mode); `.planning/` in a checkout is a local cache rebuilt from it._` No `in this repo`.
3. **TRD.** Drafted in `<scratchpad>/smoke2-trd.md`. `plan put-trd 2 02-01-goodbye-TRD.md --from <draft>` -> `wrote .planning/objectives/02-goodbye-cli/02-01-goodbye-TRD.md (store mode)`, `Outbox flushed: 6 op(s)`. `plan push 2` -> `plan push: done (store mode)`, `6 op(s)`. One TRD issue only: #8 (`gh issue list --state all` shows #3, #4, #7, #8); `gh api .../issues/7/sub_issues` -> `#8 [TRD 02-01] goodbye`.
4. **gh pr start 2** (verbatim):
   ```
   Objective 2 is on branch df/objective-02-goodbye-cli (created and linked to issue #7).
   Start commit 32618b00 made and pushed.
   Pull request #9 (draft): https://github.com/AO-Cyber-Systems/devflow-store-smoke/pull/9.
   Frozen TRDs: 2-01.
   Outbox flushed: 2 op(s) written to GitHub, nothing pending.
   ```
5. **Code commit, not pushed.** `goodbye.sh` (`#!/bin/sh` + `echo "goodbye from devflow"`, chmod 755; running it prints `goodbye from devflow`). `commit "feat(2): add goodbye.sh" --files goodbye.sh` -> `{"committed":true,"hash":"1378f39","reason":"committed","refs":7}`. `git rev-list --count origin/df/objective-02-goodbye-cli..df/objective-02-goodbye-cli` -> `1`.
6. **Guard, draft PR.** VERIFICATION drafted in `<scratchpad>/smoke2-ver.md` (`status: passed`, `score: 1/1 must-haves verified`).
   - `verification post 2 --from <scratchpad>/smoke2-ver.md` -> **exit 1** (verbatim):
     ```
     Error: df/objective-02-goodbye-cli has 1 unpushed commit (1378f39) that is not on GitHub: the pull request head does not contain it. Run df-tools gh pr sync 2 to push it, re-run verification on the pushed head, then try again. Nothing was queued or written.
     ```
   - `gh pr merge 2` -> **exit 1** (verbatim), the draft check, not the guard:
     ```
     PR is still a draft; run verification first (pull request #9 for objective 2)
     ```
   - Nothing moved on GitHub: `gh pr view 9 --json isDraft,headRefOid,state` -> `{"headRefOid":"32618b00d893125295a23ca920bffa093da42a5e","isDraft":true,"state":"OPEN"}`; outbox `0 pending, 0 blocked, 41 done` (no op from either refusal).
   - The run stopped here at a decision checkpoint (see Defect note). The answer was **B** (user answer, relayed by orchestrator).

## Task 2 record

1. **Sync.** `gh pr sync 2` (verbatim): `Pushed df/objective-02-goodbye-cli.` / `Summary: TRDs complete 0/1.` / `Pull request #9: https://github.com/AO-Cyber-Systems/devflow-store-smoke/pull/9.` / `Outbox flushed: 1 op(s) written to GitHub, nothing pending.` Unpushed count `0`; PR head `1378f399...` == local tip.
2. **TRD SUMMARY.** `summary post 2-01 --from <scratchpad>/smoke2-sum.md` -> `wrote .planning/objectives/02-goodbye-cli/02-01-SUMMARY.md (store mode)`, `3 op(s)`. No commit on the branch (cache is gitignored). Re-synced before verifying, per execute-objective.md:973: `Pushed ...`, `Summary: TRDs complete 1/1.`, `1 op(s)`.
3. **Required checks.** PR run 37310103163 (`gh run watch --exit-status`): `devflow / linked-issue` and `devflow / planning-consistency` success; `devflow / reconcile` skipped.
4. **Verification.** `verification post 2 --from <scratchpad>/smoke2-ver.md` -> `wrote .planning/objectives/02-goodbye-cli/02-VERIFICATION.md (store mode)`, `4 op(s)`. `gh pr view 9` -> `isDraft: false`. `devflow/verification` success on `1378f399...`.
5. **Merge guard, ready PR (option B).** Added a comment line to `goodbye.sh` (output still `goodbye from devflow`). `commit "docs(2): describe goodbye.sh" --files goodbye.sh` -> `{"committed":true,"hash":"25662fa","reason":"committed","refs":7}`. Unpushed count `1`.
   - `gh pr merge 2` -> **exit 1** (verbatim):
     ```
     df/objective-02-goodbye-cli has 1 unpushed commit (25662fa) that is not on GitHub: the pull request head does not contain it. Run df-tools gh pr sync 2 to push it, re-run verification on the pushed head, then try again. Nothing was queued or written.
     ```
   - Nothing queued: outbox `0 pending, 0 blocked, 50 done` (41 + 1 sync + 3 summary + 1 sync + 4 verification = 50, so no op from the refusal). GraphQL: `{"state":"OPEN","isDraft":false,"headRefOid":"1378f399...","isInMergeQueue":false,"mergeQueueEntry":null}`.
6. **Re-sync and re-verify.** `gh pr sync 2` -> `Pushed ...`, `TRDs complete 1/1`, `1 op(s)`. PR head `25662fae...` == local tip. `verification post 2` -> `4 op(s)`. PR run 37310243829 concluded `success`. `gh pr view 9 --json mergeStateStatus` -> `CLEAN`.
7. **Merge through the queue (no `--admin`).** `gh pr merge 2` -> **exit 3** (verbatim):
   ```
   Merge requested for pull request #9 (squash).
   pull request #9 for objective 2 was added to the merge queue and is not merged yet; run df-tools gh pr reconcile 2 after the queue merges it
   Outbox flushed: 1 op(s) written to GitHub, nothing pending.
   ```
   Queue entry: `{"isInMergeQueue":true,"mergeQueueEntry":{"state":"QUEUED","position":1,"enqueuedAt":"2026-10-05T12:33:00Z"}}`. A bounded poll (`<scratchpad>/wait-pr9-merged.sh`, 10 s interval, 9 min cap) saw `MERGED` at 12:33:59Z, about 1 minute after enqueue.
   - `gh run list --event merge_group --limit 3` -> `[{"conclusion":"success","databaseId":37310333089,"headBranch":"gh-readonly-queue/main/pr-9-20c3bd5684f9c979e30feb1b8c5e1ac80ff64b57","headSha":"34ba818eb4dd1de2ce8632f3d4dbcbc8ab1f187d","status":"completed"}]`. Jobs: `devflow / linked-issue` success (111763888416), `devflow / planning-consistency` success (111763888626), `devflow / reconcile` skipped.
   - `gh pr view 9 --json state,mergedAt,mergeCommit` -> `{"mergeCommit":{"oid":"34ba818eb4dd1de2ce8632f3d4dbcbc8ab1f187d"},"mergedAt":"2026-10-05T12:33:52Z","state":"MERGED"}` (mergedBy `justindonnaruma`).
8. **Reconcile.** `gh pr reconcile 2`, first run (prose, verbatim):
   ```
   Pull request #9 is merged (2026-10-05T12:33:52Z).
   Every issue the PR closes was already closed.
   Remote branch df/objective-02-goodbye-cli: already gone.
   Project: none.
   Checkout: on main.
   Deleted local branch(es): df/objective-02-goodbye-cli.
   Cache refreshed (gh pull --all).
   Objective 2 is reconciled.
   Outbox flushed: 0 op(s) written to GitHub, nothing pending.
   ```
   There was no `was kept` warning (55-05). The JSON comes from the idempotent re-run `gh pr reconcile 2 --raw`: `closed: []`, `already_closed: [7, 8]`, `remote_branch: "already gone"`, `deleted_local: []` (the first run had already deleted it), `kept: []`, `warnings: []`, `local: "done"`, `reconciled: true`, `already_reconciled: true`, `flush.warnings: []`. Issues #7 and #8 were closed by GitHub from `Closes #7` / `Closes #8` when the queue merged the PR. The repo's delete-on-merge setting removed the remote branch.
   - `gh issue view 7` -> `CLOSED` / `COMPLETED` (12:33:54Z); `gh issue view 8` -> `CLOSED` / `COMPLETED` (12:33:54Z).
   - `git ls-remote --heads origin` -> `compass-github-importer`, `main` (34ba818e) only. Clone: `## main...origin/main`.
9. **Code on main.** `git fetch origin`; `git log --oneline -3 origin/main -- goodbye.sh` -> `34ba818 Objective 2: goodbye-cli (#9)`. `git cat-file -e origin/main:goodbye.sh` -> exit 0. `git ls-tree origin/main goodbye.sh` -> `100755`. `git show origin/main:goodbye.sh` holds both commits' content (shebang, comment, `echo "goodbye from devflow"`). Smoke ROADMAP cache: `Objective 2: Goodbye CLI (#7, closed)`, `- [x] 02-01 goodbye (wave 1, #8)`. Outbox at the end: `0 pending, 0 blocked, 56 done`.

## Status tables (context, state, sha)

**Before any sync**: PR head `32618b00d893125295a23ca920bffa093da42a5e`, read before and after both Task 1 refusals with identical results:

| Context | State | Description |
|---|---|---|
| devflow/linked-issue | success | Closes #7, #8 |
| devflow/planning-consistency | success | objective 2: closes #7 and 1 TRD issue |
| devflow/verification | (absent) | |

**After the first sync**: head `1378f399a031ae0065a49bdb48bf0177a64ced5a` (after verification post):

| Context | State | Description |
|---|---|---|
| devflow/linked-issue | success | Closes #7, #8 |
| devflow/planning-consistency | success | objective 2: closes #7 and 1 TRD issue |
| devflow/verification | success | Objective 2 verified (1/1 must-haves verified) |

**After the second sync and re-verification**: head `25662fae18f7787bff2df9464e5a8a5a6626dce4`, the head that was merged:

| Context | State | Description |
|---|---|---|
| devflow/linked-issue | success | Closes #7, #8 |
| devflow/planning-consistency | success | objective 2: closes #7 and 1 TRD issue |
| devflow/verification | success | Objective 2 verified (1/1 must-haves verified) |

**Merge-queue commit**: `34ba818eb4dd1de2ce8632f3d4dbcbc8ab1f187d` (merge_group run 37310333089):

| Context | State | Description |
|---|---|---|
| devflow/linked-issue | success | Closes #7, #8 |
| devflow/planning-consistency | success | objective 2: closes #7 and 1 TRD issue |

None of these statuses has state `error`. They all carry real verdict descriptions, so the check runner loaded from the sparse checkout (55-02).

## Defect note: TRD guard ordering assumption

- In `plugins/devflow/devflow/bin/lib/gh-pr.cjs`, `mergeObjectivePr` runs the draft check first (`:975`, `PR is still a draft; run verification first`) and the unpushed guard after it (`:980-982`). Test `3d` in `gh-pr-reconcile.test.cjs:695` pins this order. On a draft PR, the merge refusal therefore tells the user to run verification, not `gh pr sync`.
- TRD 55-07 (Task 1 step 6, must-have 2) assumed the merge refusal would name `gh pr sync` while the PR was still a draft. That cannot happen. With an unpushed commit, the PR can leave draft only through `verification post` (which the guard refuses) or a manual `gh pr ready`.
- The merge guard was proven live only after the PR left draft (option B). A second unpushed commit on the verified, ready PR #9 produced the `gh pr sync` refusal shown above, and nothing was queued.
- No unpushed head can be merged on either path: the draft check covers the draft PR and the guard covers the ready PR. The remaining effect is the wording on the draft path: it points to verification, and verification then names `gh pr sync`, so the user reaches the remedy in two steps. Candidate for 55-08 (docs), or a later ordering change that reverses test 3d. Not changed here.

## 55-3 (wiki first-page retry)

This was not re-run live. The smoke wiki already has its first page, so the "blocked on no first page" state cannot be recreated on this repository. TRD 55-02's e2e test 12b proves it instead.

## Deviations from Plan

### Auto-fixed Issues

None.

### Decision-driven change (option B)

**1. [Checkpoint: decision] The merge guard was proven on the ready PR rather than the draft**
- **Found during:** Task 1, step 6
- **Issue:** `gh pr merge 2` on the draft PR was refused by the draft check (exit 1, nothing queued), not by the unpushed guard. See the Defect note.
- **Resolution:** the run stopped before any sync and returned a decision checkpoint. The answer was B (user answer, relayed by orchestrator). After the first sync and verification, a second local-only fixture commit (`25662fa`, comment line) fired the guard on `gh pr merge 2`. The run then went sync -> re-verify -> merge queue.
- **Extra GitHub writes (smoke repo only):** one extra push through `gh pr sync`, and one extra `verification post` (4 ops).
- **Files modified:** `goodbye.sh` in the smoke repo (comment line). None in this repository.

### Observations

- The PR title is still the slug (`Objective 2: goodbye-cli`) while the issue title uses the name (`[Objective 2] Goodbye CLI`). 55-04 covered issue titles only. Candidate for 55-08 or a follow-up.
- `objective add`, `plan put-trd` and `plan push` warn `no milestone resolved; issue created without one`, because the smoke ROADMAP has no milestone for objective 2. Expected for this fixture.
- The smoke clone still has a local `df/objective-01-hello-cli` branch and stale `origin/*` tracking refs (`git fetch` without `--prune`). These are leftovers from the first run, before 55-05, and are not related to objective 2.
- The JSON for the first reconcile run was not captured because it ran in prose mode. The re-run with `--raw` is idempotent and reports the same end state (`kept: []`, `warnings: []`). The prose of the first run shows the local branch deletion and no `was kept` line.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Register, start, commit, fire the guard | `objective put 3` (exit 1, names `objective add`); `gh issue view 7 -q .title` -> `[Objective 2] Goodbye CLI`; `verification post 2` (exit 1, names `gh pr sync`); `gh pr merge 2` (exit 1, draft check); `gh pr view 9 --json isDraft` -> `true`; head status has no `devflow/verification` | 1 / 0 / 1 / 1 / 0 / 0 | PASS for the refusal captures, title, footer and draft state. Merge-names-sync gap carried to Task 2 (option B) |
| 2: Sync, checks, verify, merge queue, reconcile | `gh pr merge 2` on the ready PR with an unpushed commit (exit 1, names `gh pr sync`); `gh pr merge 2` after sync (exit 3, enqueued); merge_group run 37310333089 `success`; `gh pr reconcile 2 --raw` -> `kept: []`, `warnings: []`; `git cat-file -e origin/main:goodbye.sh` | 1 / 3 / 0 / 0 / 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| required checks on the merged head | `gh api .../commits/25662fae.../status` | 0 | PASS (linked-issue, planning-consistency, verification all success) |
| merge_group checks | `gh run list --event merge_group` -> run 37310333089 | 0 | PASS (success) |
| stack task gates | (none run) | n/a | not_available: this TRD changes no code in this repository (SUMMARY only) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. The second one holds with option B, as described in the Defect note.
  - `objective put 3` exits 1 naming `objective add`. `objective add` creates objective 2, whose issue #7 is titled `[Objective 2] Goodbye CLI` and carries the store footer.
  - With an unpushed commit, `verification post 2` and `gh pr merge 2` both exit 1 naming `gh pr sync`: verification on the draft PR, merge on the ready PR. On the draft PR, merge exits 1 through the draft check. GitHub showed no new `devflow/verification` and the PR stayed a draft until the sync.
  - After `gh pr sync 2`, `devflow/linked-issue` and `devflow/planning-consistency` were success on the PR head.
  - After `verification post 2` (passed), `gh pr merge 2` enqueued the PR (exit 3). The merge_group checks passed (run 37310333089), and the PR merged through the queue (34ba818).
  - `goodbye.sh` is on origin/main. `gh pr reconcile 2` left #7 and #8 CLOSED/COMPLETED and deleted the local branch, with no `was kept` warning (`kept: []`).
- Gate failures: None

## Self-Check: PASSED

- FOUND: commit 9f068bc0 (Task 1) and 9bf74fdf (Task 2) (`git cat-file -t` -> `commit`)
- FOUND: merge commit 34ba818eb4dd1de2ce8632f3d4dbcbc8ab1f187d on origin/main (`git merge-base --is-ancestor` exit 0); `origin/main:goodbye.sh` (`git cat-file -e` exit 0, mode 100755)
- FOUND: PR #9 `MERGED` (mergedAt 2026-10-05T12:33:52Z); merge_group run 37310333089 `success`
- FOUND: issues #7 and #8 `CLOSED` / `COMPLETED`; remote heads are `main` and `compass-github-importer` only
- FOUND: scratch drafts `<scratchpad>/smoke2-obj3-unknown.md`, `smoke2-trd.md`, `smoke2-sum.md`, `smoke2-ver.md`
