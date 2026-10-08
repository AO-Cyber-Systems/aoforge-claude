---
objective: 72-install-and-naming-cleanup
trd: "20"
type: standard
wave: 10
depends_on: ["72-19"]
files_modified: []
autonomous: false
requirements: [INST-05]
must_haves:
  truths:
    - "The 3.0.0 PR merged into main (merge commit, no squash/rebase/admin) only after the user's explicit approval; main's head MERGE_SHA has parents MAIN_BEFORE and PUSHED_SHA and its tree equals PUSHED_SHA's unless main moved"
    - "The annotated tag v3.0.0 (message `Release 3.0.0 — DevFlow is now AOForge (objective 72)`) was created on MERGE_SHA and pushed by name only after a separate explicit approval; the installed changelog gate allowed it with no escape variable"
    - "release.yml's run for v3.0.0 concluded success and `gh release view v3.0.0 --repo AO-Cyber-Systems/aoforge-claude` shows a non-draft release whose body is the CHANGELOG 3.0.0 section"
    - "main's `.claude-plugin/marketplace.json` lists `aoforge` 3.0.0 and the `devflow` pointer 3.0.0 (read through the API, no local assumption)"
    - "No force push, no moved or deleted tag, no branch deleted"
  artifacts: []
  key_links:
    - from: "72-19 SUMMARY (PR N, PUSHED_SHA, green checks)"
      to: "merge checkpoint precondition"
      via: "re-read before asking"
      pattern: "PUSHED_SHA"
    - from: "tag push"
      to: ".github/workflows/release.yml"
      via: "GitHub release from the CHANGELOG section"
      pattern: "v3.0.0"
---

# TRD 72-20: Merge the 3.0.0 PR, tag it, publish the release (two approval gates)

<objective>
Merge the green release PR into main, then tag the merge commit `v3.0.0` and push the tag, which publishes the GitHub
release. After the merge, every `aocyber` marketplace user can install `aoforge@aocyber` 3.0.0 and receives the devflow
pointer release.

Purpose: INST-05 (3.0.0 shipped). Each live step only after explicit approval.
Output: MERGE_SHA on main, tag v3.0.0, GitHub release; recorded for 72-21.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-19-SUMMARY.md
@.planning/objectives/65-release-v1-5/65-03-merge-tag-and-github-release-TRD.md

## Approval protocol

Same as 72-19 (human-action checkpoints because yolo auto-approves the other types; literal replies; `approved` runs the
exact command once; `done` verifies only; anything else holds). The approvals of 72-19 do not carry over. One plain
command per Bash call; explicit refs; never port 8080.
</context>

<embedded_context>

<codebase_examples>
65-03's tag gate dry run (installed hook):
```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v3.0.0 -m x <MERGE_SHA>"}}' | node ~/.claude/plugins/cache/aocyber/devflow/2.15.0/hooks/changelog-on-tag.js
```
No output = allowed.
</codebase_examples>

<anti_patterns>
- `gh pr merge --admin`, `--squash`, `--rebase`, `--delete-branch`, `--auto`.
- A lightweight tag (release.yml takes the title from the annotated message).
- `git push --tags`, force pushes, moving or deleting a tag on origin.
</anti_patterns>

<error_recovery>
- Not mergeable (main moved, conflict, a new required check): do not force; re-read the PR, report, return blocked.
- Tag already on origin: `git ls-remote --tags origin 'v3.0.0^{}'`; if it peels to MERGE_SHA, `already done`; otherwise
  stop and report (never move it).
- release.yml failed: `gh run view <id> --log-failed`, record, return failed; the fix is a gap TRD.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: merge release PR #N into main (merge commit)</name>
  <files>(none: live GitHub operation)</files>
  <action>
Read N and PUSHED_SHA from the 72-19 SUMMARY. Pre-checks: `gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json
state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,mergeCommit` (OPEN or MERGED,
base main, head PUSHED_SHA, MERGEABLE, all green); `git -C /Users/justin/dev/devflow-claude fetch origin`;
`git -C ... rev-parse origin/main` = MAIN_BEFORE. Idempotency: MERGED -> `already done`, MERGE_SHA from mergeCommit.

STOP and present: "Approve merging release PR #N into main? Command: `gh pr merge <N> --repo
AO-Cyber-Systems/aoforge-claude --merge --subject "Merge #<N>: release 3.0.0 — DevFlow is now AOForge" --body "Release
3.0.0 — DevFlow is now AOForge (objective 72)"`. Effects: (1) main holds objective 72; (2) every aocyber marketplace user
can install aoforge@aocyber 3.0.0 and receives the devflow pointer release on update; (3) docs.yml tries to deploy the
site to the Pages project aoforge-docs (it may fail until 72-24 creates that project; that does not block the release);
(4) the unit suite runs on main. No tag yet. Reply `approved`, `done`, or anything else to hold."
  </action>
  <instructions>The release PR is green. Merging publishes AOForge 3.0.0 to marketplace users.</instructions>
  <verification>PR MERGED; origin/main == MERGE_SHA with parents MAIN_BEFORE and PUSHED_SHA.</verification>
  <resume-signal>Reply "approved" (I merge), "done" (you merged), or anything else to hold.</resume-signal>
  <verify>
- `gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'` prints `MERGED <MERGE_SHA>`
- `git -C /Users/justin/dev/devflow-claude fetch origin` then `git -C ... rev-parse origin/main` == MERGE_SHA
- `git -C ... rev-parse <MERGE_SHA>^1` == MAIN_BEFORE and `<MERGE_SHA>^2` == PUSHED_SHA
- `git -C ... diff --quiet PUSHED_SHA MERGE_SHA` (or the stat of main-side-only differences if main moved)
  </verify>
  <done>Reply recorded; MERGE_SHA recorded, or `held at merge`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: tag v3.0.0 on MERGE_SHA and push the tag</name>
  <files>(none: live git refs)</files>
  <action>
Pre-checks: the gate dry run (codebase_examples) prints nothing; `git -C ... show MERGE_SHA:CHANGELOG.md | rg -n "^## \[3.0.0\]"`;
`git -C ... ls-remote --tags origin v3.0.0` (absent, or idempotency per error_recovery).

STOP and present: "Approve tagging and pushing v3.0.0? Commands (two, in order): `git -C /Users/justin/dev/devflow-claude
tag -a v3.0.0 -m "Release 3.0.0 — DevFlow is now AOForge (objective 72)" <MERGE_SHA>` then `git -C
/Users/justin/dev/devflow-claude push origin v3.0.0`. Effects: release.yml publishes the GitHub release v3.0.0 from the
CHANGELOG section. Reply `approved`, `done`, or anything else to hold."
  </action>
  <instructions>The tag publishes the GitHub release for 3.0.0.</instructions>
  <verification>Tag peels to MERGE_SHA locally and on origin.</verification>
  <resume-signal>Reply "approved" (I tag and push), "done" (you did), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/devflow-claude rev-parse 'v3.0.0^{}'` == MERGE_SHA
- `git -C ... ls-remote --tags origin 'v3.0.0^{}'` shows MERGE_SHA
  </verify>
  <done>Reply recorded; tag on origin, or `held at tag`.</done>
</task>

<task type="auto">
  <name>Task 3: Verify the release and what the marketplace now serves</name>
  <files>(none: read-only)</files>
  <action>
`gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow release.yml --limit 3 --json status,conclusion,headBranch,displayTitle`
(watch the v3.0.0 run to completion with `gh run watch <id>`); `gh release view v3.0.0 --repo
AO-Cyber-Systems/aoforge-claude --json name,isDraft,body` (body = the CHANGELOG 3.0.0 section);
`gh api 'repos/AO-Cyber-Systems/aoforge-claude/contents/.claude-plugin/marketplace.json?ref=main' -q .content`
decoded with `node -e` (aoforge 3.0.0 and devflow 3.0.0 present); `gh run list --workflow docs.yml --limit 1` (record
the outcome; a failure for the missing Pages project is expected until 72-24). Record everything in the SUMMARY.
  </action>
  <verify>`gh release view v3.0.0 --repo AO-Cyber-Systems/aoforge-claude --json isDraft -q .isDraft` prints `false`</verify>
  <done>Release published from the CHANGELOG section; main's marketplace lists both plugins at 3.0.0.</done>
  <recovery>If release.yml failed, return failed with the log tail (a gap TRD fixes it; the tag is never moved).</recovery>
</task>

</tasks>

<verification>
- The SUMMARY records two literal approvals, MERGE_SHA, the tag, the release and the marketplace contents on main.
</verification>

<success_criteria>
- AOForge 3.0.0 is on main, tagged and released, and the marketplace serves aoforge plus the devflow pointer.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-20-SUMMARY.md` through
`df-tools summary post`.
</output>
