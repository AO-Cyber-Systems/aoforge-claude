---
objective: 67-minutes-recalibration
trd: "07"
type: standard
wave: 6
depends_on: ["67-06"]
files_modified: []
autonomous: false
requirements: [EST-10]
must_haves:
  truths:
    - "Nothing reached GitHub before the user explicitly approved that specific step. The push and the PR are two separate approvals, each recorded in the SUMMARY with the user's literal reply"
    - "After the approved push, origin/feat/stack-profile-loader equals the local SHA shown at the push checkpoint (PUSHED_SHA), and PUSHED_SHA contains the 67-06 release commit"
    - "After the approved PR open, exactly one open PR runs feat/stack-profile-loader -> main, titled `Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)`, with headRefOid == PUSHED_SHA and a body ending in the Claude Code attribution line"
    - "Every CI check on the PR finished, each name and conclusion is recorded, and the TRD reports green only when every check is SUCCESS, SKIPPED or NEUTRAL"
    - "No merge, no tag and no release happened in this TRD"
  artifacts: []
  key_links:
    - "67-06 SUMMARY (RELEASE_SHA, suite numbers, push count) -> push checkpoint facts and PR body"
    - "PUSHED_SHA + PR number + check results -> 67-08 merge checkpoint precondition"
---

# TRD 67-07: Push the branch and open the release PR (two approval gates)

<objective>
Publish the validated 2.15.0 release branch and open the release PR, each only after the user's explicit approval of
that step, then wait for PR CI and record it.

Purpose: SC-4's path to the installed runtime goes through `main` (the `aocyber` marketplace serves
`./plugins/devflow` from the default branch). The user's global rule requires explicit per-action approval for every
live step.
Output: the remote branch at PUSHED_SHA, an open release PR (number, URL) and its CI results, in the SUMMARY for 67-08.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/67-06-SUMMARY.md
@.planning/objectives/65-release-v1-5/65-02-push-branch-and-open-release-pr-TRD.md

65-02 is the model: its approval protocol, hard rules, gotchas, anti-patterns, error recovery and Task 3 (wait for PR
CI) apply here unchanged, with `2.14.0` read as `2.15.0`, the 65-01 SUMMARY read as the 67-06 SUMMARY, and the title
and body below.

## Approval protocol (applies to every checkpoint here)

The checkpoints are `checkpoint:human-action` on purpose: this repository runs `mode: "yolo"` with
`workflow.auto_advance: true`, where `human-verify` is auto-approved and `checkpoint:decision` auto-selects its first
option. `human-action` is the only type that stops for the user in every mode.

**Orchestrator:** spawn an executor for this TRD (every TRD runs in an executor, checkpoint-only ones included; never
run it inline). Present each checkpoint to the user and relay the literal reply. Never synthesize "approved". An
approval for one step does not carry to the next.

**Executor:** run the task's read-only pre-checks; if the action already happened (idempotency check), record
`already done (found at pre-check)`, run `<verify>` and move on. Otherwise STOP and return `## CHECKPOINT REACHED`
(human-action) with the facts, the exact command and what it triggers. On resume: `approved` → run exactly that
command once, then `<verify>`; `done` → `<verify>` only; anything else → run nothing live, answer or adjust, re-present,
and if declined record `held at <step> by user` and return. Never widen an approved command (no `--force`, no `--tags`,
no other refspec).

## Hard rules
- Never `git push --force`/`--force-with-lease`/`--tags`, never push a ref other than `feat/stack-profile-loader`.
- Never merge, tag or release here (67-08).
- One plain command per Bash call; name refs explicitly (`feat/stack-profile-loader`, never `HEAD`).
- The PR body is drafted at a `planning draft` temp path (it writes nothing under `.planning/`) with the Write tool and
  passed with `--body-file`; never `--fill`.
- Attribution: the PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
Body outline (fill from CHANGELOG `## [2.15.0]` and the 67-06 SUMMARY; every claim must be in one of those, or in
67-VALIDATION.md for the method sentence):

```markdown
Release **2.15.0** — milestone v1.6, objectives 66 and 67. The full notes are in `## [2.15.0]` in `CHANGELOG.md`.

## Executor token stamp (objective 66, EST-09)
- `tokens coverage` …; the SubagentStop gate's token check …; every TRD runs in an executor …
## Minutes recalibration (objective 67, EST-10)
- `calibrate --minutes <task_sum|trd_level>` and `--through <N>`; calibration version 3 `method` block …
- the frozen method and the validation result (one sentence from 67-VALIDATION.md) …

**Upgrade note:** the hooks and libraries take effect after `/plugin update devflow@aocyber` and a new session; the
2.14.0 runtime refuses a version 3 calibration.

`npm test`: <total> tests, <pass> pass, <skipped> skipped, <fail> failing (<explanation from 67-06>).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
</codebase_examples>

<anti_patterns>
- One approval covering "push and open the PR". These are two gates.
- A bare `git push` or `git push -u`.
- Treating a red or pending check as acceptable: 67-08 must not run on red CI.
</anti_patterns>

<error_recovery>
- Push rejected as non-fast-forward: do not force; `git fetch origin`, show
  `git log --oneline feat/stack-profile-loader..origin/feat/stack-profile-loader`, return blocked for a user decision.
- Push fails on auth: an auth gate; ask the user to unlock their SSH agent, then re-present the same checkpoint (the
  earlier approval does not carry over).
- `gh pr create` reports an existing PR: adopt it (`gh pr list --head feat/stack-profile-loader --base main --state open
  --json number,url,title`); do not edit a differing title without approval.
- A check fails: `gh run view <run-id> --log-failed`, record the failing step, return failed. The fix is a gap-closure
  TRD on the branch, which needs a new push approval.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: push feat/stack-profile-loader to origin</name>
  <files>(none — live git operation)</files>
  <action>
Pre-checks (read-only, each its own Bash call):
- `git -C /Users/justin/dev/devflow-claude fetch origin`
- `git rev-parse feat/stack-profile-loader` → PUSHED_SHA
- `git log --oneline -1 --grep='^chore(release): 2.15.0' feat/stack-profile-loader` finds the 67-06 release commit
- `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` is 0 (else error_recovery)
- `git rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader` → N commits to publish
- `git log --oneline -8 feat/stack-profile-loader` (shown to the user)

Idempotency: `git rev-parse origin/feat/stack-profile-loader` already equals PUSHED_SHA → `already done`, go to verify.

Otherwise STOP and present: "Approve pushing the release branch? Command: `git push origin feat/stack-profile-loader`.
This publishes N commits (release commit `<sha>` `chore(release): 2.15.0 — …`) to AO-Cyber-Systems/devflow-claude. It
triggers no CI and does not touch main. Reply `approved` and I run it, `done` if you ran it yourself, or anything else
to hold."

On `approved`, run `git push origin feat/stack-profile-loader` once.
  </action>
  <instructions>
I built and validated the 2.15.0 release locally in 67-06 (version bump, CHANGELOG promotion, `npm test`, tag-gate dry
run, clean merge-tree). I need your approval to publish the branch.
  </instructions>
  <verification>origin/feat/stack-profile-loader == PUSHED_SHA after a fresh fetch.</verification>
  <resume-signal>Reply "approved" (I run the push), "done" (you ran it), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/devflow-claude fetch origin`
- `git rev-parse origin/feat/stack-profile-loader` equals PUSHED_SHA
- `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` is 0
  </verify>
  <done>The user's literal reply is recorded. On approval the remote branch is at PUSHED_SHA; on hold nothing was pushed
and the TRD returns `held at push`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: open the release PR feat/stack-profile-loader -> main</name>
  <files>(none in the repo — the PR body lives at a planning-draft temp path and is copied into the SUMMARY)</files>
  <action>
Skip if Task 1 was held.

Pre-checks: `gh auth status`; `gh pr list --head feat/stack-profile-loader --base main --state open --json number,url,title`.
Idempotency: an open PR exists → record its number and URL as `already done`, check its title, go to verify.

Draft the body: `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/67-minutes-recalibration/67-release-pr-body.md`
prints a temp path; fill it with the Write tool following codebase_examples.

STOP and present the full body and: "Approve opening the release PR? Command: `gh pr create --repo
AO-Cyber-Systems/devflow-claude --base main --head feat/stack-profile-loader --title "Release 2.15.0 — v1.6 token stamp
and minutes recalibration (objectives 66–67)" --body-file <draft path>`. This creates a PR on GitHub and starts CI
(Unit suite, agent-shell harness, docs build without deploy). Nothing merges. Reply `approved`, `done`, or anything
else to hold or request body edits."

On `approved`, run that exact command once; record the PR number N and URL.
  </action>
  <instructions>
The branch is pushed. I drafted the PR title and body from the 2.15.0 CHANGELOG section and the 67-06 test numbers. I
need your approval to open the PR.
  </instructions>
  <verification>One open PR feat/stack-profile-loader -> main with the release title and headRefOid == PUSHED_SHA.</verification>
  <resume-signal>Reply "approved" (I open it), "done" (you opened it), edits to the body, or anything else to hold.</resume-signal>
  <verify>
- `gh pr list --head feat/stack-profile-loader --base main --state open --json number,title,headRefOid,url` returns
  exactly one PR with the release title and headRefOid == PUSHED_SHA
- `gh pr view <N> --repo AO-Cyber-Systems/devflow-claude --json body -q .body` ends with the attribution line
  </verify>
  <done>The user's literal reply is recorded. On approval the release PR exists, its number and URL in the SUMMARY; on
hold no PR was opened.</done>
</task>

<task type="auto">
  <name>Task 3: Wait for PR CI and record each check (read-only)</name>
  <files>(none — read-only GitHub queries)</files>
  <action>
Skip if Task 1 or Task 2 was held. Follow 65-02 Task 3: `gh pr checks <N> --repo AO-Cyber-Systems/devflow-claude
--watch --interval 30` (Bash timeout 600000; re-run on timeout, never treat a timeout as a result), then
`gh pr checks <N> --repo AO-Cyber-Systems/devflow-claude --json name,state,bucket,link` and record every check's name
and conclusion. Green only when every check is SUCCESS, SKIPPED or NEUTRAL. A failure: `gh run view <run-id>
--log-failed`, record the failing step, return the TRD failed.
  </action>
  <verify>Every check of PR N is recorded with its conclusion; the SUMMARY states green or names the failing check.</verify>
  <done>CI on the release PR finished and its result is recorded for 67-08.</done>
</task>

</tasks>

<verification>
- Two approvals, each with the literal reply; PUSHED_SHA on origin; one release PR; CI recorded.
- No merge, tag or release.
</verification>

<success_criteria>
- 67-08 can read PUSHED_SHA, the PR number and green CI from this SUMMARY.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-07-SUMMARY.md` via `summary post` (written by this TRD's executor,
never by the orchestrator), `requirements-completed: []`, with the literal replies, PUSHED_SHA, PR number/URL, the body
text and each check's conclusion.
</output>
