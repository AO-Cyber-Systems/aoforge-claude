---
objective: 55-store-live-smoke-fixes
trd: "07"
subsystem: github-store
tags: [store-mode, live-smoke, unpushed-guard, merge-queue, reconcile]
---

# Objective 55 TRD 07: Live objective-2 lifecycle Summary (CHECKPOINT)

**Stopped at a decision after Task 1: `verification post 2` refused naming `gh pr sync`, but `gh pr merge 2` refused with the draft check (`PR is still a draft; run verification first`), not the unpushed guard. The 55-03 guard runs after the draft check by design (gh-pr.cjs:975 then :980-982, pinned by test 3d), so on a draft PR it is unreachable. Nothing has been synced; GitHub is unchanged since `gh pr start`.**

## Progress
- [x] Task 1: Register objective 2, start its PR, commit code without syncing, fire the guard — (this commit). Gap: the merge refusal named the draft check, not `gh pr sync`
- [ ] Task 2: Sync, checks green, verify, merge through the queue, reconcile, code on main — next step: orchestrator decision on how the merge-guard clause is proven (see Checkpoint), then `node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs --cwd <SMOKE> gh pr sync 2`

## Ids

| What | Value |
|---|---|
| Repository | AO-Cyber-Systems/devflow-store-smoke |
| Objective | 2 (`02-goodbye-cli`) |
| Objective issue | #7, title `[Objective 2] Goodbye CLI` |
| TRD sub-issue | #8, `[TRD 02-01] goodbye` (sub-issue of #7) |
| Linked branch | `df/objective-02-goodbye-cli` |
| Draft PR | #9, title `Objective 2: goodbye-cli`, body `Closes #7` / `Closes #8` |
| Start commit (PR head) | `32618b00d893125295a23ca920bffa093da42a5e` (`chore(2): start objective 2`, pushed by `gh pr start`) |
| Code commit (unpushed) | `1378f399a031ae0065a49bdb48bf0177a64ced5a` (`feat(2): add goodbye.sh`, trailer `Refs #7`), `goodbye.sh` mode 100755 |

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
6. **Guard.** VERIFICATION drafted in `<scratchpad>/smoke2-ver.md` (`status: passed`, `score: 1/1 must-haves verified`).
   - `verification post 2 --from <scratchpad>/smoke2-ver.md` -> **exit 1** (verbatim):
     ```
     Error: df/objective-02-goodbye-cli has 1 unpushed commit (1378f39) that is not on GitHub: the pull request head does not contain it. Run df-tools gh pr sync 2 to push it, re-run verification on the pushed head, then try again. Nothing was queued or written.
     ```
   - `gh pr merge 2` -> **exit 1** (verbatim):
     ```
     PR is still a draft; run verification first (pull request #9 for objective 2)
     ```
     This does NOT name `gh pr sync`. See Checkpoint.
   - Nothing moved on GitHub: `gh pr view 9 --json isDraft,headRefOid,state` -> `{"headRefOid":"32618b00d893125295a23ca920bffa093da42a5e","isDraft":true,"state":"OPEN"}`; outbox `0 pending, 0 blocked, 41 done` (no op from either refusal).

### Status table, PR head before any sync

`gh api repos/AO-Cyber-Systems/devflow-store-smoke/commits/32618b00.../status` (read before and again after both refusals; identical):

| Context | State | Description | SHA |
|---|---|---|---|
| devflow/linked-issue | success | Closes #7, #8 | 32618b00d893125295a23ca920bffa093da42a5e |
| devflow/planning-consistency | success | objective 2: closes #7 and 1 TRD issue | 32618b00d893125295a23ca920bffa093da42a5e |
| devflow/verification | (absent) | | |

Combined state `success`. The required checks already pass on the start commit (they ran when `gh pr start` opened the draft).

## Checkpoint: merge-guard clause cannot be met as written

- The TRD (Task 1 step 6, must-have 2) and the dispatch expect `gh pr merge 2` to exit 1 naming `gh pr sync` while the PR is a draft.
- 55-03 placed the merge guard after the draft check on purpose: `plugins/devflow/devflow/bin/lib/gh-pr.cjs:975` returns `PR is still a draft; run verification first` before `:980-982` count unpushed commits. Test `3d. (55-03) a draft PR with an unpushed commit keeps its draft refusal (the guard runs after the draft check)` in `gh-pr-reconcile.test.cjs:695` pins that order.
- With an unpushed commit the PR can only leave draft through `verification post` (passed), which the guard refuses, or through a manual `gh pr ready`, which this TRD does not allow. So the merge guard is unreachable in the TRD's sequence. This is a TRD spec defect, not a live failure: the merge still refused (exit 1, nothing queued).
- The TRD's error_recovery does not cover it, so per the dispatch the run stopped before any sync.

## Deviations from Plan

None executed. The merge refusal text differs from the TRD's expectation (see Checkpoint); the run stopped rather than improvising.
