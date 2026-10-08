---
objective: 65-release-v1-5
trd: "03"
type: standard
wave: 3
depends_on: ["65-02"]
files_modified: []
autonomous: false
requirements: [REL-01]
must_haves:
  truths:
    - "The PR merged into main only after the user explicitly approved the merge, and the tag was created and pushed only after a separate explicit approval. Both literal replies are recorded"
    - "main's head is a merge commit MERGE_SHA. Its first parent is the main head from before the merge (533d2b87… unless main moved) and its second parent is PUSHED_SHA from 65-02"
    - "The annotated tag v2.14.0 peels to MERGE_SHA both locally and on origin (`git ls-remote --tags origin 'v2.14.0^{}'`), with message `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`"
    - "changelog-on-tag allowed `git tag -a v2.14.0 … <MERGE_SHA>`: a dry run printed nothing and the real command was not denied. No escape variable was used"
    - "The release.yml run for v2.14.0 concluded success, and `gh release view v2.14.0` shows a non-draft release titled `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)` whose body is the CHANGELOG 2.14.0 section"
    - "No force push, no tag moved or deleted on origin, no `--admin` merge bypass, no deleted branch"
  artifacts: []
  key_links:
    - "65-02 SUMMARY (PR number, PUSHED_SHA, green checks) -> merge checkpoint precondition"
    - "MERGE_SHA tree's CHANGELOG `## [2.14.0]` + manifests -> changelog-on-tag commit-ish check -> tag"
    - "tag push -> .github/workflows/release.yml -> GitHub release body = awk-extracted CHANGELOG section"
    - "merge to main -> marketplace `aocyber` (source ./plugins/devflow on the default branch) serves 2.14.0 -> 65-04 plugin update"
---

# TRD 65-03: Merge the release PR, tag the merge commit, publish the GitHub release (two approval gates)

<objective>
Merge the green release PR into main. Then create the annotated tag `v2.14.0` on the merge commit and push it, which
makes release.yml create the GitHub release. Then verify the release, the tag placement and the main-branch runs.

Purpose: REL-01 requires feat/stack-profile-loader merged to main and the next semver tag on the merge commit, with each
live step run only after explicit approval. Roadmap criterion 2.
Output: MERGE_SHA on main, `v2.14.0` on origin peeling to MERGE_SHA, and the GitHub release v2.14.0, all recorded in the
SUMMARY for 65-04.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/65-release-v1-5/65-02-SUMMARY.md

## Approval protocol (applies to Tasks 1 and 2)

The checkpoints are `checkpoint:human-action` on purpose. This repo runs `mode: "yolo"` with
`workflow.auto_advance: true`, so in execute-objective's "Branch 2 — Legacy yolo" the orchestrator auto-approves
`checkpoint:human-verify` and auto-selects the first option of `checkpoint:decision`. `human-action` is the only type
that always stops for the user. The user's global rule requires explicit per-action approval for a merge to main and
for a release tag.

**Orchestrator:** present each checkpoint and relay the user's literal reply. Never synthesize "approved". The approvals
from 65-02 do not carry over.

**Executor:**
1. Run the task's read-only pre-checks. If the action has already happened (the task's idempotency check), record
   `already done (found at pre-check)`, run `<verify>`, and go on without asking.
2. Otherwise STOP and return `## CHECKPOINT REACHED` (type human-action). Give the facts, the exact command or commands,
   and what they trigger.
3. On resume, act on the literal reply:
   - `approved`: run exactly the shown command or commands once, each as its own Bash call, then `<verify>`.
   - `done`: the user ran it themselves. Run `<verify>` only.
   - anything else: run nothing live. Answer or adjust if asked and re-present. On a decline, record
     `held at <step> by user` and return. Later tasks do not run.
4. Never widen an approved command.

## Hard rules
- Never use `gh pr merge --admin`, `--squash`, `--rebase`, `--delete-branch` or `--auto`. The prior releases used a
  merge commit, and the feature branch keeps going.
- Never `git push --force`, never `git push --tags` (push the one tag by name), and never delete or move a tag on
  origin. If `v2.14.0` already exists on origin pointing anywhere but MERGE_SHA, STOP and report.
- Never set `DEVFLOW_SKIP_CHANGELOG_GATE`. If the gate denies, the artifact is wrong: stop and report.
- Use one plain command per Bash call, with explicit refs and absolute paths (`git -C /Users/justin/dev/devflow-claude …`).
- Never use port 8080. No server is involved.
</context>

<embedded_context>

<codebase_examples>
The prior release, 2.13.2, shows the shape to follow:
- merge commit `533d2b87`, subject `Merge #124: release 2.13.2 — store live-smoke fixes (objective 55)`, body
  `Release 2.13.2 — store live-smoke fixes (objective 55)`;
- tag `v2.13.2`, annotated (`git cat-file -t v2.13.2` -> `tag`), object 533d2b87, message
  `Release 2.13.2 — store live-smoke fixes (objective 55)`, unsigned (`tag.gpgsign` is not set);
- the release.yml run on tag push: `Release on tag v2.13.2 push 37316921017 success 12s`;
- the GitHub release: name `Release 2.13.2 — store live-smoke fixes (objective 55)`, not a draft.

The tag-gate dry run in commit-ish form reads every gated file from MERGE_SHA's tree. It prints nothing when the gate
allows:
```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.14.0 -m x <MERGE_SHA>"}}' | node /Users/justin/dev/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js
```
(Run it with cwd at the repo root, because the hook resolves the repo from `process.cwd()`. Put the literal SHA in
place of `<MERGE_SHA>`.)

Main's branch rules: only the org ruleset applies (visibility, delete, transfer), with no required checks and no merge
queue. `gh pr merge --merge` goes straight through. If GitHub refuses, report it and do not escalate to `--admin`.
</codebase_examples>

<anti_patterns>
- A single approval for "merge and tag". These are two gates (Tasks 1 and 2).
- Tagging `origin/main` by name or tagging HEAD. Always tag the literal MERGE_SHA, read from
  `gh pr view <N> --json mergeCommit`.
- A lightweight tag (`git tag v2.14.0`). It must be annotated (`-a -m`), because release.yml takes the release title
  from the annotated tag subject.
- Re-running `gh release create` by hand. release.yml creates the release and is idempotent. Make a manual release
  only if the workflow failed, and only after a new approval.
</anti_patterns>

<error_recovery>
- `gh pr merge` reports not mergeable (main moved, a conflict, or a new check): do not force anything. Re-run
  `gh pr view <N> --json mergeable,mergeStateStatus,statusCheckRollup`, record it, and return blocked for a user
  decision.
- The merge succeeded but the local fetch does not show it yet: run `git fetch origin` again and re-read
  `gh pr view <N> --json mergeCommit`. Trust the API's mergeCommit.oid.
- The tag-gate dry run denies: read the reason (missing CHANGELOG section or a version mismatch at MERGE_SHA). Do not
  tag. Return failed with the hook output. This means the merge commit's tree is not the 65-01 artifact.
- `git push origin v2.14.0` is rejected because the tag already exists: run `git ls-remote --tags origin v2.14.0
  'v2.14.0^{}'`. If it peels to MERGE_SHA, treat it as done. Otherwise STOP and report. Never force.
- release.yml fails: run `gh run view <id> --log-failed` and record the tail. The tag is still correct. Return the TRD
  with the release step failed. A manual `gh release create` would be a new live action that needs its own approval,
  and the orchestrator handles it as a gap.
</error_recovery>

</embedded_context>

<gotchas>
- **Merging is the marketplace release.** marketplace.json `devflow.source` is `./plugins/devflow` on the default
  branch, so every user of the `aocyber` marketplace sees 2.14.0 on their next marketplace refresh or `/plugin update`,
  before any tag exists. The merge checkpoint must say so.
- **Merging deploys the docs site.** docs.yml runs on `push: main` (paths include plugins/devflow/**, package.json and
  marketplace.json) and runs `wrangler pages deploy site/public` to Cloudflare Pages. The Unit suite also runs on main.
  The merge checkpoint must say so.
- **The tag push creates the GitHub release.** release.yml runs on `push: tags v*`. Store-mode consumer repositories
  pinned to an older `devflow-checks.yml@vX` see W062 (`checks-workflow-pin`) after they update the plugin. Nothing
  changes for them until they re-pin. The tag checkpoint must say so.
- The local `main` ref is stale (c83b5961). Updating it with `git fetch origin main:main` is local-only. If git refuses
  because main is checked out in some worktree, skip it and note that.
- The SUMMARY commit after this TRD stays on the branch, unpushed. That is fine, and it is the same pattern as after
  2.13.2.
</gotchas>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: merge release PR #N into main (merge commit)</name>
  <files>(none — live GitHub operation)</files>
  <action>
Read N and PUSHED_SHA from the 65-02 SUMMARY.

Pre-checks (read-only, each its own Bash call):
- `gh pr view <N> --repo AO-Cyber-Systems/devflow-claude --json state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,mergeCommit`.
  It must show OPEN (or MERGED, see idempotency), base `main`, head `feat/stack-profile-loader`,
  headRefOid == PUSHED_SHA, MERGEABLE, and every check SUCCESS, SKIPPED or NEUTRAL.
- `git -C /Users/justin/dev/devflow-claude fetch origin`
- `git rev-parse origin/main`, which is MAIN_BEFORE (record it; expected 533d2b87… unless main moved). If it moved,
  show `git log --oneline origin/main~5..origin/main` too.

Idempotency: if state is MERGED, record `already done`, take MERGE_SHA from `mergeCommit.oid`, and go to verify.

If headRefOid != PUSHED_SHA or any check is not green, do not ask. Return blocked with the facts.

Otherwise STOP and present:

"Approve merging release PR #N into main? Command: `gh pr merge <N> --repo AO-Cyber-Systems/devflow-claude --merge
--subject "Merge #<N>: release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)" --body "Release 2.14.0 — v1.5 Gate &
Plumbing (objectives 56–64)"`. Effects:
(1) main gets a merge commit holding all of objectives 56–64;
(2) every `aocyber` marketplace user can install 2.14.0 on their next refresh/update;
(3) docs.yml deploys the docs site to Cloudflare Pages;
(4) the Unit suite runs on main.
The branch is not deleted. No tag is created yet. Reply `approved`, `done`, or anything else to hold."

On `approved`, run that exact command once.
  </action>
  <instructions>
The release PR is green and mergeable (65-02). The one thing I need is your approval to merge it into main. This
publishes 2.14.0 to marketplace users and deploys the docs site.
  </instructions>
  <verification>PR state MERGED. origin/main == MERGE_SHA, with parents MAIN_BEFORE and PUSHED_SHA.</verification>
  <resume-signal>Reply "approved" (I merge), "done" (you merged), or anything else to hold.</resume-signal>
  <verify>
- `gh pr view <N> --repo AO-Cyber-Systems/devflow-claude --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'`
  prints `MERGED <MERGE_SHA>`
- `git -C /Users/justin/dev/devflow-claude fetch origin`, then `git rev-parse origin/main` == MERGE_SHA
- `git rev-parse <MERGE_SHA>^1` == MAIN_BEFORE, and `git rev-parse <MERGE_SHA>^2` == PUSHED_SHA
- `git log -1 --format=%s <MERGE_SHA>` is the `Merge #<N>: release 2.14.0 — …` subject
- `git diff --quiet PUSHED_SHA MERGE_SHA` exits 0, meaning the merge result equals the validated release tree. If main
  had moved and the diff is non-empty, record `git diff --stat PUSHED_SHA MERGE_SHA` and confirm that only main-side
  files differ
  </verify>
  <done>The user's literal reply is recorded. On approval, main's head is the release merge commit MERGE_SHA with the
expected parents and tree. On hold, nothing merged and the TRD returns `held at merge`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: create annotated tag v2.14.0 on MERGE_SHA and push it (triggers the GitHub release)</name>
  <files>(none — live git operation; the tag is a ref, not a file)</files>
  <action>
Skip this task if Task 1 was held.

Pre-checks (read-only, each its own Bash call):
- `git -C /Users/justin/dev/devflow-claude ls-remote --tags origin v2.14.0 'v2.14.0^{}'`
  - if the peeled tag equals MERGE_SHA: `already done`, go to verify;
  - if it is non-empty and points anywhere else: STOP and report. Never move it.
- `git tag -l v2.14.0`. If a local tag exists, check `git rev-parse 'v2.14.0^{commit}'` == MERGE_SHA. If it differs,
  STOP and report, and do not delete it without approval.
- Tag-gate dry run against MERGE_SHA (see codebase_examples). It must print nothing.
- `git show <MERGE_SHA>:CHANGELOG.md`, piped to `rg -c '^## \[2\.14\.0\]'`, must print 1.

Then STOP and present:

"Approve tagging the release? Commands, run in order:
(1) `git -C /Users/justin/dev/devflow-claude tag -a v2.14.0 -m "Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)" <MERGE_SHA>`
(2) `git -C /Users/justin/dev/devflow-claude push origin v2.14.0`.
Effects: the tag is published on the merge commit. release.yml creates the GitHub release `Release 2.14.0 — …` with the
CHANGELOG 2.14.0 section as notes. Store-mode repos pinned to older checks workflows will report W062 once they update.
Reply `approved`, `done`, or anything else to hold."

On `approved`, run (1). The real changelog-on-tag hook fires on it and must allow it. Then run (2). Each is its own Bash
call.
  </action>
  <instructions>
main has the release merge commit, and the tag gate allows v2.14.0 on it (dry run printed nothing). The one thing I need
is your approval to create and push the release tag. Pushing it creates the GitHub release.
  </instructions>
  <verification>`git ls-remote --tags origin 'v2.14.0^{}'` peels to MERGE_SHA.</verification>
  <resume-signal>Reply "approved" (I tag and push), "done" (you did), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/devflow-claude cat-file -t v2.14.0` prints `tag` (annotated)
- `git rev-parse 'v2.14.0^{commit}'` == MERGE_SHA
- `git for-each-ref --format='%(contents:subject)' refs/tags/v2.14.0` prints `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`
- `git ls-remote --tags origin 'v2.14.0^{}'` shows MERGE_SHA
  </verify>
  <done>The user's literal reply is recorded. On approval, the annotated tag v2.14.0 sits on MERGE_SHA locally and on
origin, the real tag gate allowed it, and no escape variable was used. On hold, no tag was created.</done>
</task>

<task type="auto">
  <name>Task 3: Verify the GitHub release, the main-branch runs and the tag placement (read-only; local main ref fast-forward)</name>
  <files>(none — read-only GitHub queries; local ref update only)</files>
  <action>
Skip this task if Task 1 or Task 2 was held.

1. `gh run list --repo AO-Cyber-Systems/devflow-claude --workflow release.yml --limit 3 --json databaseId,headBranch,status,conclusion,displayTitle`.
   Pick the run whose `headBranch` is `v2.14.0`, then run `gh run watch <id> --repo AO-Cyber-Systems/devflow-claude --exit-status`
   with Bash `timeout: 600000`.
2. `gh release view v2.14.0 --repo AO-Cyber-Systems/devflow-claude --json name,tagName,isDraft,publishedAt,body`.
   Check name == `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`, `isDraft` false, and that the body's first
   non-blank line is the CHANGELOG lead paragraph. Record the body length.
3. Main-branch runs started by the merge, for the record (not a gate on the release, but report red honestly):
   - `gh run list --repo AO-Cyber-Systems/devflow-claude --branch main --limit 5 --json workflowName,headSha,status,conclusion`;
   - for the Unit suite and Docs site runs on MERGE_SHA, use `gh run watch <id> --exit-status` (timeout 600000);
   - if the docs deploy failed, record the `--log-failed` tail. The fix is a follow-up todo, not a rollback.
4. Local hygiene (local refs only): `git -C /Users/justin/dev/devflow-claude fetch origin main:main`. Then
   `git rev-parse main` == MERGE_SHA. If git refuses, record that and skip.
  </action>
  <verify>
- The release.yml run for v2.14.0 shows `conclusion: success`
- `gh release view v2.14.0 --json isDraft,name -q '.name + " " + (.isDraft|tostring)'` prints `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64) false`
- `git ls-remote --tags origin 'v2.14.0^{}'` == MERGE_SHA, and `git ls-remote origin refs/heads/main` == MERGE_SHA
  (or a later commit whose ancestry contains MERGE_SHA)
- The Unit suite run on MERGE_SHA concluded success. If it did not, the failure is recorded with its log tail and the
  TRD reports it
  </verify>
  <done>The GitHub release v2.14.0 exists, is not a draft, and carries the CHANGELOG 2.14.0 notes. The tag is on the merge
commit. The main-branch Unit suite and docs deploy results are recorded. MERGE_SHA, the tag and the release URL are in
the SUMMARY for 65-04.</done>
  <recovery>Read-only task: on a failed run, record the evidence and return it. Do not re-tag, re-merge, or create a
release by hand without a new explicit approval.</recovery>
</task>

</tasks>

<verification>
- Merge and tag each ran only after their own recorded approval.
- origin/main == MERGE_SHA, a merge commit with parents MAIN_BEFORE and PUSHED_SHA.
- `v2.14.0` is annotated, peels to MERGE_SHA on origin, and carries the release title.
- The release.yml run succeeded, and the GitHub release v2.14.0 exists, is not a draft, with the CHANGELOG body.
- No force push, no `--admin`, no tag moved, no escape variable.
</verification>

<success_criteria>
Roadmap criterion 2 is met: after the user approved each live step, feat/stack-profile-loader is merged to main and the
tag sits on the merge commit. Merge, tag and push each stopped at a checkpoint.
</success_criteria>

<output>
After completion, create `.planning/objectives/65-release-v1-5/65-03-SUMMARY.md` through the summary verb. Include:
- the literal replies;
- MAIN_BEFORE, MERGE_SHA and PUSHED_SHA;
- the tag object SHA;
- the release URL;
- the release.yml, Unit suite and docs run ids and conclusions.
</output>
