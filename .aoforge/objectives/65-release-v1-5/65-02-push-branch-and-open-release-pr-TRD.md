---
objective: 65-release-v1-5
trd: "02"
type: standard
wave: 2
depends_on: ["65-01"]
files_modified: []
autonomous: false
requirements: [REL-01]
must_haves:
  truths:
    - "Nothing reached GitHub before the user explicitly approved that specific step. The push and the PR are two separate approvals, and each is recorded in the SUMMARY with the user's literal reply"
    - "After the approved push, origin/feat/stack-profile-loader equals the local SHA that was shown at the push checkpoint (PUSHED_SHA), and that SHA contains the 65-01 release commit"
    - "After the approved PR open, exactly one open PR runs feat/stack-profile-loader -> main, titled `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`, with headRefOid == PUSHED_SHA and a body ending in the Claude Code attribution line"
    - "Every CI check on the PR finished. Each check's name and conclusion is recorded, and the TRD reports green only when every check is SUCCESS, SKIPPED or NEUTRAL"
    - "No merge, no tag and no release happened in this TRD"
  artifacts: []
  key_links:
    - "65-01 SUMMARY (release commit SHA, suite numbers, push commit count) -> push checkpoint facts and PR body"
    - "PUSHED_SHA + PR number + check results -> 65-03 merge checkpoint precondition"
---

# TRD 65-02: Push the branch and open the release PR (two approval gates)

<objective>
Publish the validated release branch and open the release pull request. Each of these is a live action that the user
approves separately. After that, wait for CI on the PR and record the result.

Purpose: REL-01 merges feat/stack-profile-loader to main through a PR, following the pattern of #117, #121, #122 and
#124. The user's global rule requires explicit approval for each action, so this TRD runs a separate gate for the push
and for the PR.
Output: the remote branch at PUSHED_SHA, an open release PR with its number and URL, and CI results, all recorded in
the SUMMARY for 65-03.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/65-release-v1-5/65-01-SUMMARY.md

## Approval protocol (read before Task 1, applies to every checkpoint in this TRD)

The checkpoints are `checkpoint:human-action` on purpose. This repo runs `mode: "yolo"` with
`workflow.auto_advance: true`. In that configuration the orchestrator auto-approves `checkpoint:human-verify` and
auto-selects the first option of `checkpoint:decision` (execute-objective "Branch 2 — Legacy yolo"). `human-action` is the
only checkpoint type that stops for the user in every mode. The user's global rule says deploys and pushes need explicit
per-action approval, so these gates must never be auto-approved.

**Orchestrator:** present each checkpoint to the user and relay their literal reply. Never synthesize "approved". An
approval for one step does not carry over to the next.

**Executor:**
1. Run the task's read-only pre-checks. If the action has already happened (the idempotency check in the task), do not
   ask. Record `already done (found at pre-check)`, run `<verify>`, and move on.
2. Otherwise STOP and return `## CHECKPOINT REACHED` (type human-action). Show the facts gathered, the exact command
   or commands, and what the command triggers.
3. On resume, branch on the user's literal reply:
   - `approved` (or `approve`, `yes, run it`): run exactly the command shown, once, as its own Bash call. Then run
     `<verify>`.
   - `done`: the user ran it themselves (for example with `! <command>` in Claude Code). Run `<verify>` only.
   - anything else (`no`, `hold`, a question, an edit request): run nothing live. Answer or adjust if asked and re-present
     the checkpoint. If the reply declines, record `held at <step> by user` in the SUMMARY and return. The release stops
     there, and later tasks do not run.
4. Never widen an approved command: no extra flags, no `--force`, no `--tags`, no other refspec.

## Hard rules
- Never `git push --force` / `--force-with-lease`, never `git push --tags`, and never push any ref other than
  `feat/stack-profile-loader` in this TRD.
- Never merge, tag or create a release here. That is 65-03.
- Use one plain command per Bash call. The worktree-isolation guard refuses compound commands. Always name refs
  explicitly (`feat/stack-profile-loader`, not `HEAD`), because the executor may be running in a worktree on another
  branch.
- Never use port 8080. No server is involved.
- Attribution: the PR body must end with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
</context>

<embedded_context>

<codebase_examples>
For the push, compare with the 55-06 SUMMARY, which also pushed this branch after approval:
`git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader` -> `36c38a9c..d4147b8c  feat/stack-profile-loader -> feat/stack-profile-loader`.

The PR body shape comes from #124 (`gh pr view 124 --json body -q .body`). It has:
- an opening line naming the release and pointing at the CHANGELOG section;
- `##` sections per area;
- an upgrade note;
- the `npm test` numbers;
- the attribution line.

Body outline for 2.14.0 (fill it from the CHANGELOG `## [2.14.0]` section and the 65-01 SUMMARY; every claim must be
in one of those):
```markdown
Release **2.14.0** — milestone v1.5 Gate & Plumbing (objectives 56–64). The full notes are in `## [2.14.0]` in `CHANGELOG.md`.

## Edit gate covers Bash writes
- `gate-bash-writes.js` … `gates.bashEditGate` (default `warn`) …
## Plumbing and correctness
- objective lookups, state and merge plumbing (merge driver), store-mode rough edges, `gate-skill-requires.js` …
## Built-in adoption
- AskUserQuestion / TaskCreate / plan-mode sweep, `/devflow:todo` on the session task list + `todo-sync.js` Stop hook …
## Estimation engine
- `tokens`, `calibrate`, `estimate …`, `estimate backtest`; EST-08 (minutes accuracy) **not met**, accepted …

**Upgrade note:** the new hooks and libraries take effect after `/plugin update devflow@aocyber` and a new session.

`npm test`: <total> tests, <pass> pass, <skipped> skipped, <fail> failing (<explanation from 65-01>).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
</codebase_examples>

<anti_patterns>
- Asking for one approval that covers "push and open the PR". These are two gates.
- A bare `git push` (it depends on the current branch and upstream config) or `git push -u` from inside a worktree.
- `gh pr create --fill`, because the PR gets 500+ commit subjects as its body. Use `--body-file`.
- Writing the PR body under `.planning/` by hand. Get a temp path from `planning draft` (it writes nothing under
  `.planning/`) and fill it with the Write tool.
- Treating a red or pending check as acceptable. 65-03 must not run on red CI.
</anti_patterns>

<error_recovery>
- Push rejected as non-fast-forward: the remote moved. Do not force. Run `git fetch origin`, show
  `git log --oneline feat/stack-profile-loader..origin/feat/stack-profile-loader`, and return the TRD as blocked for a
  user decision.
- Push fails on auth (`Permission denied (publickey)`): this is an auth gate. Ask the user to unlock their SSH agent or
  1Password, then re-present the same push checkpoint. The earlier approval does not carry over.
- `gh pr create` fails with `a pull request for branch … already exists`: run `gh pr list --head
  feat/stack-profile-loader --base main --state open --json number,url,title` and adopt that PR. If the title differs,
  report it and do not edit it without approval.
- `gh pr checks --watch` hits the Bash timeout: re-run the same command. Do not treat a timeout as pass or fail.
- A check fails: run `gh run view <run-id> --log-failed` and look at the tail. Record the failing step, then return the
  TRD as failed with that evidence. The fix happens in a gap-closure TRD on the branch, which needs a new push approval.
</error_recovery>

</embedded_context>

<gotchas>
- Pushing to a non-main branch triggers no workflow (test.yml runs on `push: main` and `pull_request`, and docs.yml on
  `push: main`). The push publishes commits and nothing else.
- Opening the PR triggers the Unit suite (test.yml, about 3-5 min). It also triggers agent-shell-harness (path-filtered,
  and agents and workflows changed) and the docs build (site/data changed). The docs build does not deploy on a
  `pull_request` event. CodeQL may also report.
- After this TRD the executor commits its SUMMARY locally. That commit is not pushed, and that is fine: the PR and the
  merge use PUSHED_SHA. 65-03 checks `headRefOid == PUSHED_SHA`.
- The branch carries about 500 commits. GitHub lists them all, so expect a slow PR page and no other problem.
</gotchas>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: push feat/stack-profile-loader to origin</name>
  <files>(none — live git operation)</files>
  <action>
Pre-checks (read-only, each its own Bash call):
- `git -C /Users/justin/dev/devflow-claude fetch origin`
- `git rev-parse feat/stack-profile-loader`, which is PUSHED_SHA (record it)
- `git log --oneline -1 --grep='^chore(release): 2.14.0' feat/stack-profile-loader`, which must find the 65-01 release
  commit
- `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader`, which must be 0. If it is not,
  follow error_recovery and do not ask.
- `git rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader`, which is N, the commits to publish
- `git log --oneline -8 feat/stack-profile-loader` (shown to the user)

Idempotency: if `git rev-parse origin/feat/stack-profile-loader` already equals PUSHED_SHA, record `already done` and skip
to verify.

Otherwise STOP and present this checkpoint:

"Approve pushing the release branch? Command: `git push origin feat/stack-profile-loader`. This publishes N commits
(release commit `<sha>` `chore(release): 2.14.0 — …`) to AO-Cyber-Systems/devflow-claude. It triggers no CI and does not
touch main. Reply `approved` and I run it, `done` if you ran it yourself, or anything else to hold."

On `approved`, run `git push origin feat/stack-profile-loader` once.
  </action>
  <instructions>
I built and validated the release in 65-01: the version bump, the CHANGELOG promotion, `npm test`, the tag-gate dry run
and a clean merge-tree. The one thing I need from you is approval to publish the branch.
  </instructions>
  <verification>origin/feat/stack-profile-loader == PUSHED_SHA after a fresh fetch.</verification>
  <resume-signal>Reply "approved" (I run the push), "done" (you ran it), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/devflow-claude fetch origin`
- `git rev-parse origin/feat/stack-profile-loader` equals PUSHED_SHA
- `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` is 0
  </verify>
  <done>The user's literal reply is recorded. On approval, the remote branch is at PUSHED_SHA. On hold, nothing was pushed
and the TRD returns `held at push`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: open the release PR feat/stack-profile-loader -> main</name>
  <action>
Pre-checks (read-only):
- `gh auth status`
- `gh pr list --head feat/stack-profile-loader --base main --state open --json number,url,title`
- `gh pr view --repo AO-Cyber-Systems/devflow-claude 124 --json body -q .body`, for the body format

Idempotency: if an open PR exists, record its number and URL as `already done`, check its title, and skip to verify.

Draft the body:
- get a temp path with `node ~/.claude/devflow/bin/df-tools.cjs planning draft objectives/65-release-v1-5/65-release-pr-body.md`
  (it writes nothing under `.planning/`);
- fill it with the Write tool, following the outline in codebase_examples;
- take the facts from the CHANGELOG `## [2.14.0]` section, and the `npm test` numbers from the 65-01 SUMMARY;
- end with the attribution line.

STOP and present the full body text and this checkpoint:

"Approve opening the release PR? Command: `gh pr create --repo AO-Cyber-Systems/devflow-claude --base main --head
feat/stack-profile-loader --title "Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)" --body-file <draft path>`.
This creates a PR on GitHub and starts CI (Unit suite, agent-shell harness, docs build without deploy). Nothing merges.
Reply `approved`, `done`, or anything else to hold / request body edits."

On `approved`, run that exact command once and record the PR number and URL it prints.
  </action>
  <files>(none in the repo — PR body lives at the planning-draft temp path and is copied into the SUMMARY)</files>
  <instructions>
The branch is pushed. I drafted the PR title and body from the 2.14.0 CHANGELOG section and the 65-01 test numbers. The
one thing I need is your approval to open the PR.
  </instructions>
  <verification>One open PR from feat/stack-profile-loader to main, with the release title and headRefOid == PUSHED_SHA.</verification>
  <resume-signal>Reply "approved" (I open it), "done" (you opened it), edits to the body, or anything else to hold.</resume-signal>
  <verify>
- `gh pr list --head feat/stack-profile-loader --base main --state open --json number,title,headRefOid,url` returns
  exactly one PR, with title `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)` and headRefOid == PUSHED_SHA
- `gh pr view <N> --json body -q .body | tail -1` is the attribution line
  </verify>
  <done>The user's literal reply is recorded. On approval, the release PR exists and its number and URL are in the SUMMARY.
On hold, no PR was opened.</done>
</task>

<task type="auto">
  <name>Task 3: Wait for PR CI and record each check (read-only)</name>
  <files>(none — read-only GitHub queries)</files>
  <action>
Skip this task if Task 1 or Task 2 was held.
1. `gh pr checks <N> --repo AO-Cyber-Systems/devflow-claude --watch --interval 30` with Bash `timeout: 600000`. If it
   times out, run it again. Never infer a result from a timeout.
2. When it exits, run `gh pr view <N> --json statusCheckRollup,mergeable,mergeStateStatus` and record each check's name,
   status and conclusion, plus `mergeable` and `mergeStateStatus`.
3. If any check concluded FAILURE, CANCELLED, TIMED_OUT or ACTION_REQUIRED, follow error_recovery: collect the
   `--log-failed` tail and return the TRD as failed. 65-03 must not start.
  </action>
  <verify>
- `gh pr view <N> --json statusCheckRollup -q '[.statusCheckRollup[] | select((.conclusion // .state) as $c | ($c != "SUCCESS" and $c != "SKIPPED" and $c != "NEUTRAL"))] | length'`
  prints `0`
- `mergeable` is `MERGEABLE`
  </verify>
  <done>Every check on the release PR finished SUCCESS, SKIPPED or NEUTRAL, and the PR is MERGEABLE. The PR number, URL,
PUSHED_SHA, each check result and mergeStateStatus are in the SUMMARY for 65-03.</done>
  <recovery>Red CI ends the release here. Record the evidence and return failed. The orchestrator plans a gap-closure TRD:
fix on the branch, then a new push approval, and CI re-runs on the PR.</recovery>
</task>

</tasks>

<verification>
- Two separate user approvals (or holds) are recorded verbatim, and nothing went live before each one.
- origin/feat/stack-profile-loader == PUSHED_SHA.
- One open release PR from the branch to main exists, with the exact title, headRefOid == PUSHED_SHA, and the
  attribution line last.
- All PR checks are green, and the PR is MERGEABLE.
- No merge, tag or release: `gh pr view <N> --json state -q .state` is `OPEN`, and `git ls-remote --tags origin v2.14.0`
  is empty.
</verification>

<success_criteria>
The release PR is open and green, and each live step ran only after its own explicit approval. That is roadmap criterion
2 up to the merge.
</success_criteria>

<output>
After completion, create `.planning/objectives/65-release-v1-5/65-02-SUMMARY.md` through the summary verb. Include:
- the user's literal reply for each gate;
- PUSHED_SHA;
- the PR number and URL;
- the PR body as sent;
- each check result.
</output>
