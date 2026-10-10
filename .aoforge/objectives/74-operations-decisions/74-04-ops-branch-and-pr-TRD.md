---
objective: 74-operations-decisions
trd: "04"
type: standard
wave: 2
depends_on: ["74-01", "74-02"]
files_modified:
  - "(branch ops/74-ci-operations off origin/main, in a scratch worktree: cherry-picks of the 74-01 and 74-02 code commits only)"
autonomous: false
requirements: [OPS-01, OPS-03]
must_haves:
  truths:
    - "Local branch `ops/74-ci-operations` starts at `origin/main` and differs from it by exactly the 74-01 and 74-02 files (visual judge workflow, script, fixtures, permissions test; Cloudflare target script, fixtures, docs.yml): no `.aoforge/` file and no objective 73 runtime file"
    - "The new tests, the permissions guard and the rename guard pass in that worktree, and actionlint is clean on both workflows"
    - "The branch was pushed only after the user's explicit approval of that push, and the pull request into main was opened only after a second, separate approval"
    - "The pull request's first checks are recorded: unit suite, Docs site build with the Cloudflare target lines, and the live visual judge expected red until the secret exists (TRD 74-05)"
  artifacts: []
  key_links:
    - from: "ops/74-ci-operations"
      to: "main"
      via: "pull request (merged only in TRD 74-08, behind its own approval)"
      pattern: "ops/74-ci-operations"
---

# TRD 74-04: Carry the CI changes to `main` on their own branch (approval gates: push, PR)

<objective>
TRDs 74-01 and 74-02 changed workflows that must run on `main`. This checkout's branch `feat/stack-profile-loader`
cannot carry them there without also shipping unreleased code. It is 124 commits ahead of `origin/main` and holds
objective 73's runtime changes (hooks, `aoforge-watch`, `compat.cjs`). Its open PR #129 still says "no plugin runtime
changes". The marketplace installs the plugin from `main` (`"source": "./plugins/aoforge"`), so merging #129 now would
release objective 73 without a version bump. This TRD builds a small branch off `origin/main` with only the CI commits
and opens a pull request for it. Each live step needs its own approval.

Purpose: the delivery path for OPS-01 and OPS-03 (planning constraint: "a workflow change needed on main must reach it
through a branch/PR that the user approves").
Output: pushed branch `ops/74-ci-operations`, an open PR into `main`, its first check results.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/74-operations-decisions/74-01-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-02-SUMMARY.md

## Approval protocol

This project's config is `mode: yolo` with `workflow.auto_advance: true`. Under it a `checkpoint:decision` auto-selects
its first option and a `checkpoint:human-verify` auto-approves. So every approval in this objective is a
`checkpoint:human-action`, which always stops. Record the user's literal reply. `approved` runs the exact listed
commands once. `done` verifies only. Anything else holds and is recorded. Approval never carries to the next gate. One
plain command per Bash call. Never port 8080. Never read, echo or store a secret.

Facts read during planning (2026-10-10): `git diff --stat origin/main HEAD -- .github scripts package.json` is empty
(those paths are identical on both), and `flutter-ui-eval.cjs`, `flutter-ui-eval-resolve.cjs`, `aof-tools.cjs`,
`helpers.cjs` and `model-profiles.json` are identical too. So the 74-01/74-02 commits apply cleanly to `origin/main` and
run the same there. Only `site/` differs. The commits on this branch since main that touch `scripts/` (fa8a4937,
28f014da) belong to objective 73 and must NOT be picked.
</context>

<embedded_context>

<codebase_examples>
Gate text shape (TRD 72-24, Task 2): "STOP and present ... Commands (both, in order): `...` then `...`. Reply
`approved`, `done`, or anything else to hold." The PR body ends with the attribution line
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
</codebase_examples>

<anti_patterns>
- Never push `feat/stack-profile-loader`, never update PR #129, never push to `main`, never force-push.
- Never pick a commit that touches a path outside the 74-01/74-02 `files_modified` lists.
- Never `--no-verify` or `--no-gpg-sign`; never bypass a hook.
- Never merge here (TRD 74-08 does that, behind its own approval).
</anti_patterns>

<error_recovery>
- `git cherry-pick` conflicts: `git -C <wt> cherry-pick --abort`, list the conflicting paths, and STOP (the premise
  "identical on main" broke; report it rather than resolving by hand).
- The commit gate refuses the cherry-pick: it gates `git commit`, not `git cherry-pick`. If it still refuses, report the
  message; the documented inline escape (`AOFORGE_ALLOW_RAW_COMMIT=1 git -C <wt> cherry-pick <sha>`) is used only if
  the message names it as the route.
- Signing fails: report it and stop; never disable signing.
- `git push` is rejected: record the message; do not retry with force.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Build ops/74-ci-operations in a scratch worktree and test it there</name>
  <files>(scratch worktree only)</files>
  <action>
One plain command per Bash call (`<wt>` = `<scratch>/ops-74`):
1. `git fetch origin` (read-only on the remote), then `git rev-parse origin/main` (record it).
2. Collect the SHAs from the 74-01 and 74-02 SUMMARY commit lists, in commit order. Cross-check with
   `git log --reverse --format='%H %s' origin/main..HEAD -- <every path in 74-01 files_modified> <every path in 74-02 files_modified>`:
   both lists must be the same set of `(74-01)`/`(74-02)` commits. For each SHA, `git show --name-only --format= <sha>`
   must list only those paths.
3. `git branch ops/74-ci-operations origin/main`, then `git worktree add <wt> ops/74-ci-operations`.
4. `git -C <wt> cherry-pick <sha>`, one call per SHA, in order.
5. `git -C <wt> diff --stat origin/main` must list exactly the 74-01 and 74-02 files.
6. In the worktree: `node --test <wt>/scripts/ci-visual-judge.test.cjs <wt>/scripts/ci-cloudflare-target.test.cjs <wt>/scripts/workflow-permissions.test.cjs`,
   `node --test <wt>/plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs`,
   `actionlint <wt>/.github/workflows/visual-judge.yml <wt>/.github/workflows/docs.yml`.
   Run the visual-judge test with credentials stripped (`env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL node --test ...`).
7. Write the PR body to `<scratch>/pr-74-body.md`. Cover: what the two jobs do. Why this is a separate branch (feat
   carries unreleased objective 73 runtime code, and the marketplace serves `main`). The expected checks: the unit suite
   should be green. The Docs site build runs and prints "cloudflare target:" lines, with no deploy on a PR. The live
   visual judge is red until the ANTHROPIC secret exists, by design (it fails rather than passing without a credential).
   Then the next steps: the user sets secrets, the Pages project is created, the ruleset is applied, and the merge is
   its own approval. End with the attribution line.
  </action>
  <verify>git -C <wt> log --oneline origin/main..HEAD (only 74-01/74-02 subjects); git -C <wt> diff --name-only origin/main (only their files); the three test files, the rename guard and actionlint pass in <wt></verify>
  <done>The branch exists locally with exactly the CI commits and passes its tests; nothing was pushed.</done>
  <recovery>`git worktree remove <wt>` and `git branch -D ops/74-ci-operations` (local only), then retry from step 1.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: push ops/74-ci-operations</name>
  <files>(none: live GitHub operation)</files>
  <action>
STOP and present: the `git -C <wt> log --oneline origin/main..HEAD` list, the `--stat`, and: "Approve pushing the CI
branch? Command: `git -C <wt> push -u origin ops/74-ci-operations`. This creates a new branch on GitHub. It does not touch
`main`, PR #129 or `feat/stack-profile-loader`. Reply `approved`, `done` (you pushed it yourself), or anything else to hold."
On `approved` run the command once.
  </action>
  <instructions>Push the small CI-only branch to GitHub.</instructions>
  <verification>`git ls-remote --heads origin ops/74-ci-operations` returns the worktree HEAD SHA.</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>git ls-remote --heads origin ops/74-ci-operations</verify>
  <done>Reply recorded; the remote branch SHA equals the worktree HEAD (or the hold is recorded).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: open the pull request into main</name>
  <files>(none: live GitHub operation)</files>
  <action>
Skip with `held` if Task 2 held. Otherwise STOP and present the PR body and: "Approve opening the pull request? Command:
`gh pr create --repo AO-Cyber-Systems/aoforge-claude --base main --head ops/74-ci-operations --title "ci: live visual judge and Cloudflare deploy target (objective 74)" --body-file <scratch>/pr-74-body.md`.
It is not merged here; merging is a separate approval in TRD 74-08. Reply `approved`, `done`, or anything else to hold."
On `approved` run it once. Afterwards (read-only) wait for the first checks to finish:
`gh pr checks <N> --repo AO-Cyber-Systems/aoforge-claude --watch`. Then record each check's conclusion, and the
"cloudflare target:" lines from the Docs run: `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --branch ops/74-ci-operations --limit 1 --json databaseId`,
then `gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log`, read narrowly with `rg "cloudflare target:"`.
  </action>
  <instructions>Open the PR; it waits for secrets, the Pages project and the ruleset before its merge approval.</instructions>
  <verification>`gh pr view ops/74-ci-operations --repo AO-Cyber-Systems/aoforge-claude --json number,state,url` shows OPEN.</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>gh pr view ops/74-ci-operations --repo AO-Cyber-Systems/aoforge-claude --json number,state,url,statusCheckRollup</verify>
  <done>PR number and URL recorded; first check results and the Cloudflare target lines recorded for TRDs 74-05 and 74-06.</done>
</task>

</tasks>

<verification>
- The SUMMARY records: origin/main SHA, picked SHAs, the diff file list, local test results, both replies, the PR URL,
  and the first check conclusions (with the "cloudflare target:" lines).
</verification>

<success_criteria>
- The CI changes wait on `main`'s doorstep in a reviewable PR that contains nothing else.
</success_criteria>

<output>
After completion, write `74-04-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-04 --from <draft>`.
</output>
