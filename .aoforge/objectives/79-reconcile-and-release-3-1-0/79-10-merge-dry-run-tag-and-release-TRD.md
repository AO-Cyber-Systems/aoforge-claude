---
objective: 79-reconcile-and-release-3-1-0
trd: "10"
type: standard
wave: 6
depends_on: ["79-09"]
files_modified: []
autonomous: false
requirements: [SC-5]
must_haves:
  truths:
    - "The 3.1.0 PR merged into main through the ruleset (merge commit; no squash, rebase, admin bypass, auto-merge or branch deletion) only after the user's explicit approval; MERGE_SHA has parents MAIN_BEFORE and PUSHED_SHA, its tree equals PUSHED_SHA's, and the unit suite's push run on main for MERGE_SHA concluded success"
    - "The release workflow's dry run was dispatched on main only after a separate explicit approval, after a recorded read-only tag-ruleset inspection; the run concluded success, no `aoforge--v0.0.0-dryrun-*` tag is left on origin, and no release was created"
    - "The annotated tag v3.1.0 was created on MERGE_SHA and pushed by name only after a third, separate approval, and only after the main run and the dry run both succeeded; the changelog gate allowed it with no escape variable"
    - "release.yml's push run for v3.1.0 concluded success; `gh release view v3.1.0` shows a non-draft release marked Latest whose body is the CHANGELOG 3.1.0 section at MERGE_SHA; `aoforge--v3.1.0` exists on origin, pushed by the workflow, and resolves to MERGE_SHA"
    - "main's marketplace.json, read through the API, lists aoforge 3.1.0, aoforge-stack-flutter 1.0.0 and aoforge-stack-web 1.0.0 and no pre-rename pointer entry"
    - "Follow-ups are recorded, not acted on: stack-pack tags, the follow-up PR for local planning commits made after PUSHED_SHA, OPS-03's docs deploy, PR #130 untouched; no force push, no moved or deleted tag, no branch deleted"
  artifacts: []
  key_links:
    - from: "79-09 SUMMARY (PR N, PUSHED_SHA, green checks)"
      to: "merge checkpoint precondition"
      via: "re-read before asking"
      pattern: "PUSHED_SHA"
    - from: "workflow_dispatch on main"
      to: ".github/workflows/release.yml dry run"
      via: "scripts/release-tag.cjs --dry-run <run id>"
      pattern: "dry_run"
    - from: "tag v3.1.0 push"
      to: ".github/workflows/release.yml -> scripts/release-tag.cjs"
      via: "GitHub release from the CHANGELOG section, alias aoforge--v3.1.0"
      pattern: "v3.1.0"
---

# TRD 79-10: Merge the 3.1.0 PR, dry-run the release tag push, tag v3.1.0, verify the release (three approval gates)

<objective>
Merge the green PR into main. Then, before any real tag, prove the release workflow's token can push and delete the
`aoforge--v*` alias tag by dispatching its dry run on main: the dry run exists only on main after this merge
(`origin/main`'s current release.yml has no `workflow_dispatch` trigger, and GitHub dispatches only workflows the
default branch declares dispatchable). Then tag the merge commit `v3.1.0`, which makes release.yml publish the GitHub
release from the CHANGELOG section and push `aoforge--v3.1.0` (the tag the stack packs' `aoforge >=3.1.0` dependency
resolves core from), and verify everything the release should have produced.

Purpose: SC-5's merge, tag and release-verification steps, and the user's "ask before running the release dry-run
dispatch". Three gates, three approvals; each continuation executor starts fresh, so context stays small.
Output: MERGE_SHA, the main run, the dry-run run, tag v3.1.0, the release, the alias; a SUMMARY with the follow-ups.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-09-SUMMARY.md
@.aoforge/objectives/72-install-and-naming-cleanup/72-20-merge-tag-and-release-TRD.md

## Approval protocol

Same as 79-09: `checkpoint:human-action` gates because yolo auto-approves the other types; the orchestrator relays the
user's literal reply; `approved` runs the exact command(s) once, `done` verifies only, anything else holds (record
`held at <step> by user` and return). 79-09's approvals do not carry over, and no gate's approval carries to the next.
One plain command per Bash call; explicit refs; never port 8080; never touch #130.

Facts (planning time; re-check):
- release.yml (merged tree): `on: push: tags ['v*', '*--v*']` and `workflow_dispatch` with input `dry_run` (boolean,
  default true). The dispatch job runs `node scripts/release-tag.cjs --dry-run "$RUN_ID"`: it pushes a lightweight
  `aoforge--v0.0.0-dryrun-<run id>` tag at HEAD with GITHUB_TOKEN, checks origin shows it, deletes it, creates no
  release. `dry_run: false` exits 1. A tag pushed with GITHUB_TOKEN starts no workflow run.
- For a core tag `vX.Y.Z`, release-tag.cjs requires `plugins/aoforge/.claude-plugin/plugin.json` at X.Y.Z, takes the
  title from the annotated tag's subject and the notes from `## [X.Y.Z]`, marks the release Latest and pushes
  `<core>--vX.Y.Z` at the same commit. Pack releases (`aoforge-stack-flutter--v1.0.0`, `aoforge-stack-web--v1.0.0`) are
  separate tags a person pushes: NOT part of this TRD.
- `node scripts/tag-rules.cjs <tag>...` lists the tag rulesets a push would meet with `gh api` GETs only (none existed at
  planning). A ruleset restricting deletion of `aoforge--v*` would leave the dry-run tag behind; the step's error names
  the cleanup command.
- The installed changelog gate is `hooks/changelog-on-tag.js` under `~/.claude/plugins/cache/aocyber/aoforge/<version>/`.
- test.yml runs on `push` to main; docs.yml's deploy fails until OPS-03 (expected, not a blocker).
- The local branch carries planning commits after PUSHED_SHA (79-09's SUMMARY at least); those are not in the PR.
</context>

<embedded_context>

<codebase_examples>
72-20's merge shape: `gh pr merge <N> --repo AO-Cyber-Systems/aoforge-claude --merge --subject "Merge #<N>: ..." --body "..."`.
Finding a run: `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow <file> --event <push|workflow_dispatch> --limit 3 --json databaseId,headSha,status,conclusion,displayTitle`
then `gh run watch <id> --repo AO-Cyber-Systems/aoforge-claude --exit-status`.
Changelog gate dry run (no output = allowed):
```
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v3.1.0 -m x <MERGE_SHA>"},"cwd":"/Users/justin/dev/aoforge-claude"}' | node ~/.claude/plugins/cache/aocyber/aoforge/<version>/hooks/changelog-on-tag.js
```
Main's marketplace through the API: `gh api 'repos/AO-Cyber-Systems/aoforge-claude/contents/.claude-plugin/marketplace.json?ref=main' -q .content`,
decoded with `node -e` (base64), printing each plugin's name and version.
</codebase_examples>

<anti_patterns>
- `gh pr merge --admin`, `--squash`, `--rebase`, `--delete-branch`, `--auto`.
- Dispatching with `-f dry_run=false`, or on any ref other than main.
- A lightweight release tag, `git push --tags`, force, moving or deleting a tag on origin; pushing `aoforge--v3.1.0` or a
  pack tag by hand; tagging anything but MERGE_SHA (the local integrate head carries later planning commits).
- Deleting a leftover dry-run tag without its own approval.
- Treating a failed main push run as fine because the PR run was green; tagging before the dry run passed.
</anti_patterns>

<error_recovery>
- Not mergeable (main moved, a conflict, a new required check): never force; re-read the PR, report both heads, return
  blocked (an update needs a new validation and a new push approval).
- `gh workflow run` says the workflow has no workflow_dispatch trigger: main lacks the merged release.yml (check
  `git show origin/main:.github/workflows/release.yml`); return blocked with the output.
- The dry run fails: `gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log-failed`; a dry-run tag left on origin
  is deleted only through a separate approval (`git push origin --delete refs/tags/<tag>` or the command the log names);
  return failed; no tag is created.
- Tag already on origin: `git ls-remote --tags origin 'refs/tags/v3.1.0^{}'`; peels to MERGE_SHA -> `already done`;
  otherwise stop and report (never move it).
- release.yml's tag run failed or the alias is missing: `gh run view <id> --log-failed`, record, return failed (a gap TRD
  fixes it; the tag is never moved; re-running the workflow is its own approval).
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: merge PR #N into main (merge commit)</name>
  <files>(none: live GitHub operation)</files>
  <action>
Read N and PUSHED_SHA from the 79-09 SUMMARY. Pre-checks:
`gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,mergeCommit`
(OPEN or MERGED; base main; head integrate/3.1.0 at PUSHED_SHA; MERGEABLE; `test (npm test, gated)` SUCCESS);
`git -C /Users/justin/dev/aoforge-claude fetch origin`; `git -C ... rev-parse origin/main` = MAIN_BEFORE.
Idempotency: MERGED -> `already done`, MERGE_SHA from mergeCommit.

STOP and present: "Approve merging PR #<N> into main? Command: `gh pr merge <N> --repo AO-Cyber-Systems/aoforge-claude
--merge --subject "Merge #<N>: release 3.1.0" --body "Release 3.1.0: main, #129 and the shim removal in one tree
(objective 79)"`. Effects: (1) main holds 3.1.0: the rename shims are gone, stack procedure lives in the
aoforge-stack-flutter and aoforge-stack-web packs; (2) `aocyber` marketplace users get aoforge 3.1.0 and the two packs on
their next update (no tag needed for that); (3) test.yml runs on main; docs.yml tries to deploy and fails until OPS-03
(expected); (4) no tag, no GitHub release yet. Reply `approved`, `done`, or anything else to hold."

After the merge: `git -C ... fetch origin`; watch the test.yml push run for MERGE_SHA (codebase_examples, workflow
`test.yml`, event `push`) and record its conclusion.
  </action>
  <instructions>The 3.1.0 PR is green; merging puts 3.1.0 on main for every marketplace user.</instructions>
  <verification>PR MERGED; origin/main == MERGE_SHA with parents MAIN_BEFORE and PUSHED_SHA; main run green.</verification>
  <resume-signal>Reply "approved" (I merge), "done" (you merged), or anything else to hold.</resume-signal>
  <verify>
- `gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'` prints `MERGED <MERGE_SHA>`
- `git -C /Users/justin/dev/aoforge-claude rev-parse origin/main` == MERGE_SHA; `rev-parse <MERGE_SHA>^1` == MAIN_BEFORE; `rev-parse <MERGE_SHA>^2` == PUSHED_SHA
- `git -C ... diff --quiet <PUSHED_SHA> <MERGE_SHA>` exits 0
- the test.yml push run on MERGE_SHA concluded success (if not: record and return failed; no dispatch, no tag)
  </verify>
  <done>Reply recorded; MERGE_SHA and the main run recorded, or `held at merge`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: dispatch the release workflow's dry run on main</name>
  <files>(none: live workflow dispatch)</files>
  <action>
Pre-checks (read-only):
`git -C /Users/justin/dev/aoforge-claude show origin/main:.github/workflows/release.yml` holds `workflow_dispatch` and
`dry_run` (check with `rg -n` on the output);
`node /Users/justin/dev/aoforge-claude/scripts/tag-rules.cjs aoforge--v0.0.0-dryrun-1 aoforge--v3.1.0 v3.1.0` (record
every ruleset it lists, or none);
`git -C ... ls-remote --tags origin 'refs/tags/aoforge--v0.0.0-dryrun-*'` (expect nothing; a leftover is reported, not deleted);
`gh release list --repo AO-Cyber-Systems/aoforge-claude --limit 3` (record).
Idempotency: a successful `workflow_dispatch` run of release.yml on MERGE_SHA already exists -> `already done`.

STOP and present: "Approve the release dry run? Command: `gh workflow run release.yml --repo
AO-Cyber-Systems/aoforge-claude --ref main -f dry_run=true`. Effects: on main (<MERGE_SHA>) the workflow pushes a
throwaway lightweight tag `aoforge--v0.0.0-dryrun-<run id>` with its GITHUB_TOKEN, checks origin shows it, deletes it and
creates no release; tag rulesets found: <list or none>. It proves the token can push the `aoforge--v3.1.0` alias the real
release pushes. Reply `approved`, `done`, or anything else to hold."

After dispatch: find the run (codebase_examples, workflow `release.yml`, event `workflow_dispatch`), watch it, record id,
headSha and conclusion.
  </action>
  <instructions>The dry run proves the release token can push the alias tag before the real tag depends on it.</instructions>
  <verification>Run success on MERGE_SHA; no dry-run tag left; no new release.</verification>
  <resume-signal>Reply "approved" (I dispatch), "done" (you dispatched), or anything else to hold.</resume-signal>
  <verify>
- the run's conclusion is `success` and its headSha == MERGE_SHA
- `git -C /Users/justin/dev/aoforge-claude ls-remote --tags origin 'refs/tags/aoforge--v0.0.0-dryrun-*'` prints nothing
- `gh release list --repo AO-Cyber-Systems/aoforge-claude --limit 3` is unchanged from the pre-check
  </verify>
  <done>Reply recorded; dry run passed (run id recorded), or `held at dry run`, or `failed` with the log tail.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: tag v3.1.0 on MERGE_SHA and push the tag</name>
  <files>(none: live git refs)</files>
  <action>
Runs only when Tasks 1 and 2 recorded success. Pre-checks:
`git -C /Users/justin/dev/aoforge-claude fetch origin`;
`git -C ... merge-base --is-ancestor <MERGE_SHA> origin/main` (exit 0);
`git -C ... grep -n '^## \[3\.1\.0\] - 2026-10-16' <MERGE_SHA> -- CHANGELOG.md` (exactly one hit);
`git -C ... show <MERGE_SHA>:plugins/aoforge/.claude-plugin/plugin.json` (version 3.1.0);
`git -C ... ls-remote --tags origin v3.1.0 aoforge--v3.1.0` (absent, or idempotency per error_recovery);
`ls ~/.claude/plugins/cache/aocyber/aoforge/` then the changelog gate dry run (codebase_examples) prints nothing.

STOP and present: "Approve tagging and pushing v3.1.0? Commands (two, in order): `git -C /Users/justin/dev/aoforge-claude
tag -a v3.1.0 -m "Release 3.1.0: main, the AOForge line and the shim removal in one tree (objective 79)" <MERGE_SHA>` then
`git -C /Users/justin/dev/aoforge-claude push origin refs/tags/v3.1.0`. Effects: release.yml publishes the GitHub release
v3.1.0 (Latest) from the CHANGELOG 3.1.0 section and pushes `aoforge--v3.1.0` at the same commit, which the stack packs'
core dependency resolves. Reply `approved`, `done`, or anything else to hold."
  </action>
  <instructions>main holds 3.1.0 and the release token is proven; the tag publishes the release.</instructions>
  <verification>Tag peels to MERGE_SHA locally and on origin.</verification>
  <resume-signal>Reply "approved" (I tag and push), "done" (you did), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/aoforge-claude rev-parse 'v3.1.0^{}'` == MERGE_SHA and `git -C ... cat-file -t v3.1.0` prints `tag`
- `git -C ... ls-remote --tags origin 'refs/tags/v3.1.0^{}'` shows MERGE_SHA
  </verify>
  <done>Reply recorded; tag on origin, or `held at tag`.</done>
</task>

<task type="auto">
  <name>Task 4: Verify the release, the alias tag and what main now serves; record the follow-ups</name>
  <files>(none: read-only)</files>
  <action>
One per Bash call: the release.yml `push` run for v3.1.0 (codebase_examples), watched to completion;
`gh release view v3.1.0 --repo AO-Cyber-Systems/aoforge-claude --json name,tagName,isDraft,isPrerelease,url,body`
(name = the tag subject; not draft; body equals `releaseNotes` of `git show <MERGE_SHA>:CHANGELOG.md` for 3.1.0 from
`scripts/release-tag.cjs`, whitespace-trimmed, compared with `node -e`);
`gh api repos/AO-Cyber-Systems/aoforge-claude/releases/latest -q .tag_name` (v3.1.0);
`git -C /Users/justin/dev/aoforge-claude ls-remote --tags origin aoforge--v3.1.0 'aoforge--v3.1.0^{}'` (MERGE_SHA);
main's marketplace through the API (aoforge 3.1.0, aoforge-stack-flutter 1.0.0, aoforge-stack-web 1.0.0, no pre-rename
pointer entry);
`gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,headSha` (record; a
failure for the missing Pages project is expected until OPS-03);
`git -C ... ls-remote --tags origin 'aoforge-stack-*--v*'` (record presence; never push them here);
`git -C ... rev-list --count <PUSHED_SHA>..integrate/3.1.0` and `git -C ... diff --name-only <PUSHED_SHA> integrate/3.1.0`
(local planning commits after the PR head: they need a follow-up PR, its push and PR each behind its own approval;
record, do nothing).
End the SUMMARY with Follow-ups: pack tags (if the user wants pack releases), the planning-records follow-up PR, OPS-03,
PR #130 untouched.
  </action>
  <verify>`gh release view v3.1.0 --repo AO-Cyber-Systems/aoforge-claude --json isDraft,tagName -q '.tagName + " " + (.isDraft|tostring)'` prints `v3.1.0 false`, and the alias tag resolves to MERGE_SHA</verify>
  <done>3.1.0 is released from the CHANGELOG section, the alias tag exists, main's marketplace serves aoforge 3.1.0 and both packs, and every remaining step is listed for the user.</done>
  <recovery>If release.yml failed or the alias is missing, return failed with the log tail (a gap TRD fixes it; the tag is never moved).</recovery>
</task>

</tasks>

<verification>
- The SUMMARY records three literal replies, MAIN_BEFORE, MERGE_SHA, the main run, the tag-rules output, the dry run,
  the tag, the release run and body check, the alias, main's marketplace and the follow-ups.
</verification>

<success_criteria>
- AOForge 3.1.0 is on main through the ruleset, tagged on the merge commit and released, and the stack packs can resolve
  core 3.1.0.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-10-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
