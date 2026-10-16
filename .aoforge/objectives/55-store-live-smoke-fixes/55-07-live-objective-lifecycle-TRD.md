---
objective: 55-store-live-smoke-fixes
trd: "07"
type: standard
wave: 4
depends_on: ["55-06"]
files_modified: []
autonomous: true
requirements: ["55-5", "55-2", "55-6"]
must_haves:
  truths:
    - "`objective put` for an unknown objective on the smoke store exits 1 naming `objective add`, and `objective add` then creates objective 2 whose issue is titled `[Objective 2] <name>` (not the slug) with the store-mode footer"
    - "With an unpushed code commit on the linked branch, `verification post 2` and `gh pr merge 2` both exit 1 naming `gh pr sync`, and GitHub shows no new devflow/verification status and the PR still a draft"
    - "After `gh pr sync 2`, the required statuses devflow/linked-issue and devflow/planning-consistency are success on the PR head"
    - "After `verification post 2` (passed), `gh pr merge 2` enqueues the PR, the merge_group checks pass, and the PR merges through the merge queue"
    - "The code commit's file is on origin/main, `gh pr reconcile 2` closes the TRD issues as completed and deletes the local branch without a `was kept` warning"
  artifacts: []
  key_links:
    - "linked branch unpushed commit -> verification post / gh pr merge refusal (55-03) -> gh pr sync -> CI statuses -> verification post -> gh pr merge -> merge queue -> main"
---

# TRD 55-07: Live re-run, part 2. Objective 2 through the documented lifecycle, with the unpushed guard fired

<objective>
Run objective 2 on `AO-Cyber-Systems/devflow-store-smoke` exactly as the store lifecycle documents it, fire the unpushed-commit
guard on purpose, then let it land through the merge queue (OBJECTIVE Success bullets 2, 3, 4 and 6). Watch the 55-04 title and
footer and the 55-05 reconcile behaviour along the way.

Precondition: TRD 55-06's SUMMARY records decision A or B, the workflow PR merged, and the caller pinned to the pushed SHA. If it
records C, or any of that failed, stop now and write a SUMMARY saying why.

The wiki-first-page retry (55-3) cannot be re-run live: the smoke wiki already has its first page. It is proven by TRD 55-02's e2e
test 12b. Say so in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Same binding rules as TRD 55-06: the literal SMOKE path, THIS checkout's df-tools with `--cwd <SMOKE>` (never the 2.12.0 home
  mirror), one plain command per Bash call, no raw `git commit`, no `git push` except through `gh pr sync`, GitHub writes to
  `AO-Cyber-Systems/devflow-store-smoke` only, bounded polling (at most 10 minutes per call, at most 30 minutes per wait), and never
  port 8080.
- Follow the store lifecycle as execute-objective.md documents it (pr_lifecycle: `gh pr start`, `gh pr sync` before verification
  at :973 and :1080, `gh pr merge` exit codes at :1160-1170). Deviate only where this TRD says so: Task 1 deliberately skips the
  sync to fire the guard.
- Drafts for the smoke's TRD/SUMMARY/VERIFICATION go in the session scratchpad, never inside this repository's `.planning/`.
- The objective-2 content is a trivial fixture: a `goodbye.sh` that prints a line. Hand-written, no generated data.

<embedded_context>

<codebase_examples>
CLI forms (planning-verbs-cli.cjs header, df-tools.cjs):
- `objective put <objective> --from <path|->`, `objective add <description>`
- `plan put-trd <objective> <file-name> --from <path|-> [--no-push]`, `plan push <objective>`
- `summary post <trd-id> --from <path|->`, `verification post <objective> --from <path|->`
- `gh pr start|sync|status|merge|reconcile <objective>` (exit codes: 0 ok, 1 error, 2 halted, 3 pending; merge exits 3 when only
  enqueued)

Minimal VERIFICATION for the smoke (hand-written):

```markdown
---
objective: 02-<slug>
status: passed
score: 1/1 must-haves verified
---
# Objective 2 Verification
goodbye.sh exists and prints its line (checked by running it).
```
</codebase_examples>

<anti_patterns>
- Do not run `gh pr sync` before Task 1's two refusals are captured. Firing the guard is part of the test.
- Do not merge with `--admin` here. This PR must go through the checks and the merge queue.
- Do not hand-close issues or delete branches. Reconcile must do it.
</anti_patterns>

<error_recovery>
- A refusal that does NOT happen in Task 1 (verification post succeeds) means the 55-03 guard failed live. Immediately run
  `gh pr view 2 ... --json isDraft` and the status API to record what was posted, then `gh pr sync` and report it as a blocking
  gap. Do not merge.
- The merge queue does not pick the PR up within 30 minutes: record `gh pr view --json mergeStateStatus,statusCheckRollup` and the
  merge_group runs (`gh run list --repo AO-Cyber-Systems/devflow-store-smoke --event merge_group`), then stop and report.
- Outbox halts (exit 2): `node .../df-tools.cjs --cwd <SMOKE> gh outbox status`, record it, and report. Do not `resolve --overwrite`
  unless the halt is the known wiki case.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Register objective 2, start its PR, commit code without syncing, and fire the guard</name>
  <files>(none in this repository; smoke clone: goodbye.sh, objective 2 planning cache)</files>
  <action>
1. 55-2: write a scratch OBJECTIVE text and run `node .../df-tools.cjs --cwd <SMOKE> objective put 3 --from <scratch file>`
   (3 is unknown). Expect exit 1 and stderr naming `objective add`. Nothing is written or queued.
2. `node .../df-tools.cjs --cwd <SMOKE> objective add "Goodbye CLI"`. Record the number (expect 2) and the issue number.
   55-6 title and footer: `gh issue view <n> --repo AO-Cyber-Systems/devflow-store-smoke --json title,body -q .title` gives
   `[Objective 2] Goodbye CLI`. The body's footer is the store text from 55-04, with no `in this repo`.
3. Draft a one-task TRD in the scratchpad (adds `goodbye.sh`). Publish it with
   `plan put-trd 2 02-01-goodbye-TRD.md --from <draft>` and then `plan push 2`. Expect the TRD sub-issue to be created.
4. `node .../df-tools.cjs --cwd <SMOKE> gh pr start 2`. Record the linked branch and the draft PR number.
5. On the linked branch, write `goodbye.sh` (`#!/bin/sh` + `echo "goodbye from devflow"`, mode 755). Commit with
   `node .../df-tools.cjs --cwd <SMOKE> commit "feat(2): add goodbye.sh" --files goodbye.sh`. Do NOT push and do NOT sync.
   Confirm: `git -C <SMOKE> rev-list --count origin/<branch>..<branch>` prints 1.
6. Guard: write the passed VERIFICATION in the scratchpad and run `verification post 2 --from <file>`. Expect exit 1 naming
   `gh pr sync`. Then `gh pr merge 2`: exit 1 naming `gh pr sync`. Then confirm on GitHub that nothing moved:
   `gh pr view <pr> --repo AO-Cyber-Systems/devflow-store-smoke --json isDraft -q .isDraft` is `true`, and the head's status list has
   no `devflow/verification`.
  </action>
  <verify>Both refusals captured verbatim; the PR is still a draft with no devflow/verification status; the issue title is `[Objective 2] Goodbye CLI`.</verify>
  <done>Items 55-2, 55-5 (refusal half) and the 55-6 title/footer proven live.</done>
  <recovery>If `objective add` creates a number other than 2, use that number throughout and note it. If `gh pr start` returns 3 (pending), flush with `gh outbox flush` and re-run it.</recovery>
</task>

<task type="auto">
  <name>Task 2: Sync, checks green, verify, merge through the queue, reconcile, code on main</name>
  <files>(none in this repository; smoke repo objective 2 PR and main)</files>
  <action>
1. `node .../df-tools.cjs --cwd <SMOKE> gh pr sync 2`. Confirm that the branch has 0 unpushed commits and that the PR head equals the local tip.
2. Publish the TRD's SUMMARY in a scratch file with `summary post 2-01 --from <file>`, as the lifecycle does after a TRD. Then
   `gh pr sync 2` again if the lifecycle prose says so.
3. Wait (bounded) for the PR-head statuses. `devflow/linked-issue` and `devflow/planning-consistency` must both be `success`
   (`gh api repos/AO-Cyber-Systems/devflow-store-smoke/commits/<head>/status`).
4. `verification post 2 --from <passed file>`. Expect `devflow/verification` success on the head and the PR marked ready.
5. `node .../df-tools.cjs --cwd <SMOKE> gh pr merge 2`. Expect exit 3, "added to the merge queue". Wait (bounded) for the merge.
   Record the merge_group run (`gh run list --repo AO-Cyber-Systems/devflow-store-smoke --event merge_group --limit 3`) and its
   conclusion, plus `gh pr view <pr> --json state,mergedAt,mergeCommit`.
6. `node .../df-tools.cjs --cwd <SMOKE> gh pr reconcile 2`. Expect the TRD issue(s) and the objective issue closed as completed,
   the remote branch deleted, the local branch deleted, and NO `was kept` warning (55-05).
7. `git -C <SMOKE> fetch origin` and `git -C <SMOKE> log --oneline -3 origin/main -- goodbye.sh`: the squash commit is there.
   `gh issue view <trd issue> --json state,stateReason` is CLOSED / COMPLETED.
  </action>
  <verify>`git -C <SMOKE> cat-file -e origin/main:goodbye.sh` exits 0; the merge_group run concluded success; reconcile's JSON has empty `kept`.</verify>
  <done>Success bullets 2 and 6 proven live: required checks green on a correct PR, code on main, merged through the merge queue.</done>
  <recovery>If a required check fails on the synced head, capture its description and job log. That is a check-runner gap: report it, do not bypass. If reconcile keeps the branch, record its warning verbatim as a 55-05 gap.</recovery>
</task>

</tasks>

<verification>
- SUMMARY contains: both refusal messages, issue/PR/TRD numbers, the status table (context, state, sha) before and after sync, the
  merge_group run id and conclusion, the merge commit, reconcile's JSON (closed, deleted, kept, warnings), and the
  `origin/main:goodbye.sh` check.
</verification>

<success_criteria>
- OBJECTIVE Success bullets 2, 3, 4 (objective put) and 6 hold on the real repository. Bullet 1 is TRD 55-06.
</success_criteria>

<output>
After completion, publish `55-07-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes.
</output>
