---
objective: 79-reconcile-and-release-3-1-0
trd: "09"
type: standard
wave: 5
depends_on: ["79-08"]
files_modified: []
autonomous: false
requirements: [SC-5]
must_haves:
  truths:
    - "`integrate/3.1.0` was pushed to origin only after the user's explicit approval of that push (literal reply recorded); PUSHED_SHA equals the local head, and every difference between VALIDATED_SHA (79-08, verdict PASS) and PUSHED_SHA is under `.aoforge/`"
    - "One PR from `integrate/3.1.0` into `main` exists, opened only after its own approval, titled for 3.1.0, with a body built from the CHANGELOG 3.1.0 section and the 79-08 validation record, stating that it supersedes #129, and ending with the Claude Code attribution line; its required check `test (npm test, gated)` is green before the TRD completes"
    - "#129 was closed (not merged) only after a third, separate approval and only after the new PR was open, with a comment linking the new PR; its branch was not deleted; PR #130 was not touched"
    - "No force push, no `--tags`, no merge, no tag, no workflow dispatch in this TRD"
  artifacts: []
  key_links:
    - from: "79-08 SUMMARY (VALIDATED_SHA, PASS)"
      to: "push checkpoint precondition"
      via: "re-read before asking"
      pattern: "VALIDATED_SHA"
    - from: "the new PR"
      to: "#129"
      via: "close comment links the new PR"
      pattern: "Superseded by #"
---

# TRD 79-09: Push `integrate/3.1.0`, open the 3.1.0 PR, close #129 (three approval gates)

<objective>
Three live steps, each behind its own explicit approval: push the validated branch, open the one PR that carries 3.1.0
into `main`, and close #129 (superseded) with a link once the new PR exists.

Purpose: SC-5's first three steps (pushed, one PR open with green CI, #129 closed with a link).
Output: PUSHED_SHA, PR number and URL with green checks, #129 closed; all recorded for 79-10.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-08-SUMMARY.md
@.aoforge/objectives/72-install-and-naming-cleanup/72-19-repo-rename-push-and-pr-TRD.md

## Approval protocol (applies to every task)

All three checkpoints are `checkpoint:human-action` on purpose: this repo runs `mode: "yolo"` with
`workflow.auto_advance: true`, so the orchestrator auto-approves `checkpoint:human-verify` and auto-selects the first
option of `checkpoint:decision`; `human-action` is the only type that always stops for the user. The user requires
explicit per-action approval for every push, PR open, PR close, merge, tag and workflow dispatch (decision 2026-10-17).
Approval never carries from one gate to the next.

**Orchestrator:** present each checkpoint and relay the user's literal reply. Never synthesize "approved".

**Executor:**
1. Run the task's read-only pre-checks (one plain command per Bash call). If the action already happened (idempotency
   check), record `already done (found at pre-check)`, run `<verify>`, continue.
2. Otherwise STOP and return `## CHECKPOINT REACHED` (human-action) with the facts, the exact command, and its effects.
3. On resume: `approved` -> run exactly that command once, then `<verify>`; `done` -> the user ran it, `<verify>` only;
   anything else -> run nothing live, answer or re-present; a decline records `held at <step> by user` and returns.
4. Never widen an approved command.

Hard rules: never `git push --force`/`--force-with-lease`/`--tags`; name refs explicitly; one plain command per Bash
call; never port 8080; never touch PR #130 (it stays open until OPS-03 resumes); never delete a branch.
PR body attribution line (last line): `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Facts (planning time): origin is `https://github.com/AO-Cyber-Systems/aoforge-claude.git`; `integrate/3.1.0` does not
exist on origin yet; origin/main is ee93e66f (Merge #134); #129 is OPEN, head `feat/stack-profile-loader` (origin has
abc18a9f; its 179 newer local commits reach main through the new PR, so that branch is not pushed); `main` ruleset
24829006 requires a PR with `test (npm test, gated)` green (merge, squash and rebase allowed; this objective uses merge).
`test.yml` runs on `pull_request` (not on a branch push); the docs deploy fails until the user resumes OPS-03 (the
`aoforge-docs` Pages project), which does not block this release.
</context>

<embedded_context>

<codebase_examples>
72-19's push evidence shape: `git -C <repo> push origin <branch>` -> `* [new branch]  integrate/3.1.0 -> integrate/3.1.0`.
Its PR body: an opening line naming the release and the CHANGELOG section, `##` sections per area, an upgrade note, the
test numbers, the attribution line. Draft the body with the Write tool into a `mktemp -d` file, never through `--fill`.
</codebase_examples>

<anti_patterns>
- One approval covering two actions (push + PR, PR + close). Three gates, three replies.
- `gh pr create --fill`; `gh pr close --delete-branch`; editing #129's title or body; any action on #130.
- A bare `git push` or `git push -u` without the explicit branch; `--tags`; force.
- Treating a red required check as acceptable, or closing #129 before the new PR exists.
</anti_patterns>

<error_recovery>
- Push rejected (auth): an auth gate; ask the user to unlock their agent, re-present the same checkpoint.
- Push rejected non-fast-forward (someone created the branch): never force; `git fetch origin`, show both heads, return blocked.
- A PR for this head already exists: adopt it (number, URL); do not change its title or body without approval.
- The required check fails: `gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log-failed`, record the failing
  tests, return `failed` (the fix is a gap TRD, a new 79-08-style validation and a new push approval); #129 stays open.
- A non-required check fails for the missing Pages project (OPS-03): record it as expected, continue.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: push integrate/3.1.0 to origin</name>
  <files>(none: live git push)</files>
  <action>
Pre-checks: read VALIDATED_SHA and the verdict from the 79-08 SUMMARY (must be PASS; otherwise return blocked);
`git -C /Users/justin/dev/aoforge-claude rev-parse integrate/3.1.0` (HEAD_NOW);
`git -C ... diff --name-only <VALIDATED_SHA> integrate/3.1.0` (every path must start with `.aoforge/`; otherwise return
blocked: the code changed after validation);
`git -C ... status --porcelain` (only `?? amp`);
`git -C ... fetch origin`;
`git -C ... ls-remote origin refs/heads/integrate/3.1.0` (empty = new branch; if present, it must be an ancestor of
HEAD_NOW, `git merge-base --is-ancestor`);
`git -C ... rev-list --count origin/main..integrate/3.1.0` (N commits main will receive);
`git -C ... merge-base --is-ancestor origin/main integrate/3.1.0` (exit 0: the PR will have no conflict).
Idempotency: origin already at HEAD_NOW -> `already done`.

STOP and present: "Approve pushing the 3.1.0 integration branch? Command: `git -C /Users/justin/dev/aoforge-claude push
origin integrate/3.1.0`. This creates `integrate/3.1.0` on AO-Cyber-Systems/aoforge-claude at <HEAD_NOW> (validated head
<VALIDATED_SHA>, later commits only under .aoforge/), carrying N commits main does not have (objectives 72 post-release,
73-75, 78, quick 34-39 and the reconcile merge). No PR, merge or tag yet. Reply `approved`, `done`, or anything else to
hold."
  </action>
  <instructions>The validated 3.1.0 tree is ready to publish so a PR can carry it into main.</instructions>
  <verification>origin/integrate/3.1.0 == HEAD_NOW.</verification>
  <resume-signal>Reply "approved" (I push), "done" (you pushed), or anything else to hold.</resume-signal>
  <verify>`git -C /Users/justin/dev/aoforge-claude ls-remote origin refs/heads/integrate/3.1.0` prints PUSHED_SHA == HEAD_NOW</verify>
  <done>Reply recorded; branch pushed (PUSHED_SHA recorded) or `held at push`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: open the 3.1.0 PR into main, then wait for green checks</name>
  <files>(none: live GitHub PR; the body is drafted in a mktemp file)</files>
  <action>
Draft the body (Write tool, scratch file): first line "Release **3.1.0**. Supersedes #129: this PR carries that branch
(objectives 72-75 and the `.aoforge/` move) together with objective 78 (the rename shims removed) and main's 3.1.0 line
(objectives 76/77, perf #133, quick 34-39), reconciled through one merge commit (objective 79). Full notes: `## [3.1.0]`
in `CHANGELOG.md`." Then sections: `## What 3.1.0 ships` (from the CHANGELOG lead), `## How the two lines were joined`
(the merge commit sha and its parents, the 15 conflicts resolved as unions, main's planning records moved to
`.aoforge/`, the new guards: reconcile guard, pre-bash equivalence corpus), `## Validation` (79-08 numbers: suite, CI
gate, Docker node:26 run if any, named gates, health), `## Upgrading` (a 2.x project upgrades through 3.0.x first;
Flutter/Dart/web projects install their stack pack; an un-rebranded repository runs `aof-tools gh rebrand --apply`),
`## After merge` (release dry-run dispatch and the v3.1.0 tag, each behind its own approval), and the attribution line.
Every claim must come from the CHANGELOG or a 79-0N SUMMARY.

Pre-check: `gh pr list --repo AO-Cyber-Systems/aoforge-claude --head integrate/3.1.0 --base main --state open --json number,url`
(adopt an existing PR).

STOP and present: "Approve opening the 3.1.0 PR? Command: `gh pr create --repo AO-Cyber-Systems/aoforge-claude --base
main --head integrate/3.1.0 --title "Release 3.1.0: main, #129 and the shim removal in one tree" --body-file <path>`.
It opens a PR into main (nothing merged) and starts CI on it. Reply `approved`, `done`, or anything else to hold."

After creation: `gh pr checks <N> --repo AO-Cyber-Systems/aoforge-claude --watch` (re-run on a Bash timeout). Record
every check's name and conclusion.
  </action>
  <instructions>The PR is the only path to main (ruleset 24829006); it must be green before 79-10's merge gate.</instructions>
  <verification>PR open, base main, head PUSHED_SHA, `test (npm test, gated)` SUCCESS.</verification>
  <resume-signal>Reply "approved" (I open it), "done" (you opened it), or anything else to hold.</resume-signal>
  <verify>`gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefOid,statusCheckRollup` shows OPEN, base main, headRefOid == PUSHED_SHA, the required check SUCCESS, and any other non-green check explained (OPS-03 docs only)</verify>
  <done>Reply recorded; PR N open and green (number, URL, checks in the SUMMARY), or `held at PR`, or `failed` with the failing tests.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: close #129 as superseded, with a link to the new PR</name>
  <files>(none: live GitHub PR state)</files>
  <action>
Runs only when Task 2 completed with PR N open. Pre-check:
`gh pr view 129 --repo AO-Cyber-Systems/aoforge-claude --json state,headRefName,title,url` (OPEN, head
`feat/stack-profile-loader`; if already CLOSED, `already done`: verify the link comment exists).

STOP and present: "Approve closing #129 as superseded? Command: `gh pr close 129 --repo AO-Cyber-Systems/aoforge-claude
--comment "Superseded by #<N> (<url>), which carries this branch's commits together with objective 78 and main's 3.1.0
line through one merge commit (objective 79)."`. Effects: #129 is closed without merging; its branch
`feat/stack-profile-loader` stays (not deleted); every commit it carried reaches main through #<N>; #130 is untouched.
Reply `approved`, `done`, or anything else to hold."
  </action>
  <instructions>#129 is superseded by the new PR; closing it leaves one open path for 3.1.0.</instructions>
  <verification>#129 CLOSED (not MERGED) with the link comment; branch still on origin.</verification>
  <resume-signal>Reply "approved" (I close it), "done" (you closed it), or anything else to hold.</resume-signal>
  <verify>`gh pr view 129 --repo AO-Cyber-Systems/aoforge-claude --json state,comments -q '.state'` prints CLOSED and the last comment contains `#<N>`; `git -C /Users/justin/dev/aoforge-claude ls-remote origin refs/heads/feat/stack-profile-loader` still prints a sha</verify>
  <done>Reply recorded; #129 closed with the link, or `held at close`.</done>
</task>

</tasks>

<verification>
- The SUMMARY records three literal replies (or holds), PUSHED_SHA, PR N with its checks, and #129's final state.
</verification>

<success_criteria>
- The validated tree is on origin, one green PR carries 3.1.0 to main, and #129 points to it.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-09-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
