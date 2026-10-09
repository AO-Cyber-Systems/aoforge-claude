---
objective: 72-install-and-naming-cleanup
trd: "19"
type: standard
wave: 11
depends_on: ["72-18"]
files_modified: []
autonomous: false
requirements: [INST-05, INST-06]
must_haves:
  truths:
    - "The GitHub repository was renamed `AO-Cyber-Systems/devflow-claude` -> `AO-Cyber-Systems/aoforge-claude` only after the user's explicit approval (literal reply recorded); `gh repo view AO-Cyber-Systems/aoforge-claude` succeeds and `gh repo view AO-Cyber-Systems/devflow-claude` resolves to it (redirect)"
    - "The local `origin` remote points at `https://github.com/AO-Cyber-Systems/aoforge-claude.git`"
    - "`feat/stack-profile-loader` was pushed to origin only after a separate explicit approval; PUSHED_SHA equals the local branch head that 72-18 validated"
    - "A release PR into `main` titled for 3.0.0 exists, opened only after its own approval, with a body built from the CHANGELOG 3.0.0 section and the 72-18 validation record and ending with the Claude Code attribution line; its checks are green before the TRD completes"
    - "No force push, no `--tags`, no merge, no tag in this TRD"
  artifacts: []
  key_links:
    - from: "repo rename"
      to: "marketplace users of AO-Cyber-Systems/devflow-claude"
      via: "GitHub's rename redirect (never create a new repository under the old name)"
      pattern: "aoforge-claude"
    - from: "72-18 SUMMARY (validated head)"
      to: "push checkpoint precondition"
      via: "PUSHED_SHA == validated sha"
      pattern: "PUSHED_SHA"
---

# TRD 72-19: Rename the GitHub repository, push the release branch, open the 3.0.0 PR (three approval gates)

<objective>
Three live steps, each behind its own explicit approval: rename the repository to `aoforge-claude` (so every URL the
3.0.0 artifacts carry resolves before anyone installs them), push the validated branch, and open the release PR.

Purpose: INST-06 (repository rename) and INST-05 (the release path).
Output: renamed repository, updated remote, pushed branch, green release PR; all recorded in the SUMMARY for 72-20.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-18-SUMMARY.md
@.planning/objectives/65-release-v1-5/65-02-push-branch-and-open-release-pr-TRD.md

## Approval protocol (applies to every task)

All three checkpoints are `checkpoint:human-action` on purpose. This repo runs `mode: "yolo"` with
`workflow.auto_advance: true`, so the orchestrator auto-approves `checkpoint:human-verify` and auto-selects the first
option of `checkpoint:decision`; `human-action` is the only type that always stops for the user. The user's global rule
requires explicit per-action approval for live, outward-facing changes; approval never carries from one gate to the
next.

**Orchestrator:** present each checkpoint and relay the user's literal reply. Never synthesize "approved".

**Executor:**
1. Run the task's read-only pre-checks (one plain command per Bash call). If the action already happened (idempotency
   check), record `already done (found at pre-check)`, run `<verify>`, continue.
2. Otherwise STOP and return `## CHECKPOINT REACHED` (human-action) with the facts, the exact command, and its effects.
3. On resume: `approved` -> run exactly that command once, then `<verify>`; `done` -> the user ran it, `<verify>` only;
   anything else -> run nothing live, answer or re-present; a decline records `held at <step> by user` and returns.
4. Never widen an approved command.

Hard rules: never `git push --force`/`--force-with-lease`/`--tags`; never create a repository named `devflow-claude`
after the rename (it would break the redirect); one plain command per Bash call; name refs explicitly; never port 8080.
PR body attribution line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
</context>

<embedded_context>

<codebase_examples>
65-02's push evidence shape: `git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader` ->
`<old>..<new>  feat/stack-profile-loader -> feat/stack-profile-loader`. 65-02's PR body: opening line naming the
release and the CHANGELOG section, `##` sections per area, an upgrade note, the test numbers, the attribution line.
</codebase_examples>

<anti_patterns>
- One approval covering two actions (rename + push, push + PR). Three gates, three replies.
- `gh pr create --fill` (hundreds of commit subjects as the body). Use `--body-file`.
- A bare `git push` or `git push -u` from a worktree; always the explicit refspec.
- Treating red or pending checks as acceptable.
</anti_patterns>

<error_recovery>
- `gh repo rename` refuses (permissions): report; the user can rename in Settings and reply `done`.
- Push non-fast-forward: never force; `git fetch origin`, show the divergence, return blocked.
- Auth failure on push: an auth gate; ask the user to unlock their agent, re-present the same checkpoint.
- PR already exists: adopt it (number, URL); do not edit its title without approval.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: rename the GitHub repository to aoforge-claude</name>
  <files>(none: live GitHub operation, then a local remote URL change)</files>
  <action>
Pre-checks: `gh repo view AO-Cyber-Systems/devflow-claude --json nameWithOwner,visibility,isArchived,defaultBranchRef`;
`gh repo view AO-Cyber-Systems/aoforge-claude --json nameWithOwner` (must fail: name free, unless already renamed);
`git -C /Users/justin/dev/devflow-claude remote get-url origin`.
Idempotency: if `devflow-claude` already resolves to `AO-Cyber-Systems/aoforge-claude`, record `already done` and go to
the remote step.

STOP and present: "Approve renaming the repository? Command: `gh repo rename aoforge-claude --repo
AO-Cyber-Systems/devflow-claude --yes`. Effects: (1) the repository becomes AO-Cyber-Systems/aoforge-claude; (2) GitHub
redirects git, web and API traffic from the old name, so the `aocyber` marketplace entry (added by the old slug) and
existing clones keep working; (3) a future repository named devflow-claude in this org would break that redirect, so
none is created; (4) the local origin remote is then set to the new URL. Reply `approved`, `done`, or anything else to
hold."

On `approved`: run the rename once; then `git -C /Users/justin/dev/devflow-claude remote set-url origin
https://github.com/AO-Cyber-Systems/aoforge-claude.git`.
  </action>
  <instructions>Renaming the repository makes every aoforge-claude URL in the 3.0.0 artifacts resolve before release.
GitHub keeps redirecting the old name.</instructions>
  <verification>New name resolves; old name redirects; origin uses the new URL.</verification>
  <resume-signal>Reply "approved" (I rename), "done" (you renamed), or anything else to hold.</resume-signal>
  <verify>
- `gh repo view AO-Cyber-Systems/aoforge-claude --json nameWithOwner -q .nameWithOwner` prints `AO-Cyber-Systems/aoforge-claude`
- `gh repo view AO-Cyber-Systems/devflow-claude --json nameWithOwner -q .nameWithOwner` prints the same (redirect)
- `git -C /Users/justin/dev/devflow-claude remote get-url origin` ends in `aoforge-claude.git`
- `git -C /Users/justin/dev/devflow-claude ls-remote origin refs/heads/main` succeeds
  </verify>
  <done>Reply recorded; repository renamed; remote updated. On hold: nothing changed, TRD returns `held at rename`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: push feat/stack-profile-loader</name>
  <files>(none: live git push)</files>
  <action>
Pre-checks: `git -C /Users/justin/dev/devflow-claude rev-parse feat/stack-profile-loader` (must equal the validated head
recorded in the 72-18 SUMMARY; if not, return blocked with the commits since); `git -C ... fetch origin`;
`git -C ... rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader` (N commits to publish);
`git -C ... merge-base --is-ancestor origin/feat/stack-profile-loader feat/stack-profile-loader` (fast-forward).
Idempotency: if origin already has the validated head, record `already done`.

STOP and present: "Approve pushing the release branch? Command: `git -C /Users/justin/dev/devflow-claude push origin
feat/stack-profile-loader`. This publishes N commits (objective 72: the AOForge rename) to
AO-Cyber-Systems/aoforge-claude and runs CI on the branch. Nothing is merged or tagged. Reply `approved`, `done`, or
anything else to hold."
  </action>
  <instructions>The validated 3.0.0 branch is ready to publish for CI.</instructions>
  <verification>origin/feat/stack-profile-loader == validated head.</verification>
  <resume-signal>Reply "approved" (I push), "done" (you pushed), or anything else to hold.</resume-signal>
  <verify>`git -C /Users/justin/dev/devflow-claude ls-remote origin refs/heads/feat/stack-profile-loader` prints PUSHED_SHA == the validated head</verify>
  <done>Reply recorded; branch pushed (PUSHED_SHA recorded) or `held at push`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: open the 3.0.0 release PR, then wait for green checks</name>
  <files>(none: live GitHub PR; the body is drafted in a temp file from `planning draft`)</files>
  <action>
Draft the PR body in a temp path (Write tool): opening line "Release **3.0.0**: DevFlow is now AOForge (objective 72).
The full notes are `## [3.0.0]` in `CHANGELOG.md`; the migration guide is `docs/MIGRATING-TO-AOFORGE.md`.", sections
(The rename; One-release compatibility; Migrations; The devflow pointer release; Rollout still to come: install,
global CLAUDE.md, checkout move, vanity PR, Pages, fleet), the 72-18 validation numbers, an upgrade note
("`/plugin install aoforge@aocyber`, then disable devflow@aocyber"), and the attribution line. Every claim must come from
the CHANGELOG or 72-18 SUMMARY.

Pre-check: `gh pr list --repo AO-Cyber-Systems/aoforge-claude --head feat/stack-profile-loader --base main --state open --json number,url`
(adopt an existing PR if present).

STOP and present: "Approve opening the release PR? Command: `gh pr create --repo AO-Cyber-Systems/aoforge-claude --base
main --head feat/stack-profile-loader --title "Release 3.0.0: DevFlow is now AOForge" --body-file <path>`. Nothing is
merged. Reply `approved`, `done`, or anything else to hold."

After creation: `gh pr checks <N> --repo AO-Cyber-Systems/aoforge-claude --watch` (re-run on Bash timeout). A failing
check: `gh run view <id> --log-failed`, record, return failed (a fix needs a gap TRD and a new push approval).
  </action>
  <instructions>The PR is the merge vehicle for 3.0.0; it must be green before 72-20's merge gate.</instructions>
  <verification>PR open against main with head PUSHED_SHA; every check SUCCESS, SKIPPED or NEUTRAL.</verification>
  <resume-signal>Reply "approved" (I open it), "done" (you opened it), or anything else to hold.</resume-signal>
  <verify>`gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefOid,statusCheckRollup` shows OPEN, base main, headRefOid == PUSHED_SHA, all checks green</verify>
  <done>Reply recorded; PR N open and green (number, URL, PUSHED_SHA in the SUMMARY) or `held at PR`.</done>
</task>

</tasks>

<verification>
- The SUMMARY records three literal approvals (or holds), the new repo name, PUSHED_SHA, PR N and its green checks.
</verification>

<success_criteria>
- The repository is aoforge-claude, the validated branch is published, and a green 3.0.0 PR awaits the merge gate.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-19-SUMMARY.md` through
`df-tools summary post`.
</output>
