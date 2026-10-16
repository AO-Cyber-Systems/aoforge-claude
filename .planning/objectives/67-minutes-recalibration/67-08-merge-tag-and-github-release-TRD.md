---
objective: 67-minutes-recalibration
trd: "08"
type: standard
wave: 7
depends_on: ["67-07"]
files_modified: []
autonomous: false
requirements: [EST-10]
must_haves:
  truths:
    - "The merge and the tag are two separate approvals, each recorded with the user's literal reply; nothing live ran before its approval"
    - "After the approved merge, PR N is MERGED by a merge commit MERGE_SHA (no squash, rebase, --admin or branch delete) whose parents are MAIN_BEFORE and PUSHED_SHA and whose tree equals PUSHED_SHA's (or differs only in main-side files, recorded)"
    - "changelog-on-tag allowed `git tag -a v2.15.0 … <MERGE_SHA>` (a dry run printed nothing and the real command was not denied); no escape variable was used"
    - "The annotated tag v2.15.0 peels to MERGE_SHA locally and on origin; the release.yml run for v2.15.0 concluded success and `gh release view v2.15.0` shows a non-draft release titled `Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)` whose body is the CHANGELOG 2.15.0 section"
    - "The main-branch runs started by the merge (Unit suite, docs) are recorded with their conclusions; a red docs deploy is recorded as a follow-up (objective 74, OPS-03), not rolled back"
  artifacts: []
  key_links:
    - "merge to main -> marketplace `aocyber` (source ./plugins/devflow on the default branch) serves 2.15.0 -> 67-09 plugin update"
    - "tag push -> .github/workflows/release.yml -> GitHub release body = awk-extracted CHANGELOG section"
---

# TRD 67-08: Merge the release PR, tag v2.15.0, verify the GitHub release (two approval gates)

<objective>
Merge the green release PR into `main` and publish the annotated tag v2.15.0 on the merge commit, each only on the
user's explicit approval of that step; then verify the GitHub release release.yml creates and record the main-branch
runs.

Purpose: after this, `/plugin update devflow@aocyber` can install 2.15.0 (67-09), which is what puts the new estimator
in the installed runtime (SC-4).
Output: MERGE_SHA, the tag, the release URL and the run conclusions in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/67-07-SUMMARY.md
@.planning/objectives/65-release-v1-5/65-03-merge-tag-and-github-release-TRD.md
@.planning/objectives/65-release-v1-5/65-03-SUMMARY.md

65-03 is the model: its hard rules, codebase examples (tag-gate dry run payload, release.yml facts), anti-patterns,
error recovery and its three tasks apply here unchanged with `2.14.0` read as `2.15.0`, `65-02` read as `67-07`, and
the subject, body and tag message below. 65-03's SUMMARY records how the 2.14.0 run went (merge `8295a169`, release
run success, docs deploy failure recorded for objective 74).

The approval protocol is the one in 67-07 (and 65-02): `checkpoint:human-action` gates; the orchestrator spawns an
executor for this TRD and relays the user's literal replies, never synthesizing "approved"; `approved` → run exactly the
shown command once; `done` → verify only; anything else → nothing live, `held at <step>`.

## Hard rules
- `gh pr merge` only with `--merge` and the exact subject and body; never `--admin`, `--squash`, `--rebase`,
  `--delete-branch` or `--auto`. If GitHub refuses, report it; do not escalate.
- The tag is annotated (`-a -m`) and placed on MERGE_SHA by SHA; never move or delete an existing tag without approval.
- Never re-run `gh release create` by hand: release.yml creates the release. A manual release is a new live action that
  needs its own approval.
- No escape variable (`DEVFLOW_SKIP_CHANGELOG_GATE`) ever.
- One plain command per Bash call. Never use port 8080.

Values for this release:
- Merge command: `gh pr merge <N> --repo AO-Cyber-Systems/devflow-claude --merge --subject "Merge #<N>: release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" --body "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)"`
- Tag commands: `git -C /Users/justin/dev/devflow-claude tag -a v2.15.0 -m "Release 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" <MERGE_SHA>`, then `git -C /Users/justin/dev/devflow-claude push origin v2.15.0`
- Tag-gate dry run: `printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.15.0 -m x <MERGE_SHA>"}}' | node /Users/justin/dev/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js` (literal SHA) prints nothing.
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: merge release PR N into main (merge commit)</name>
  <files>(none — live GitHub operation)</files>
  <action>
Read N and PUSHED_SHA from the 67-07 SUMMARY. Pre-checks (read-only, each its own Bash call):
- `gh pr view <N> --repo AO-Cyber-Systems/devflow-claude --json state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,mergeCommit`:
  OPEN (or MERGED, see idempotency), base `main`, head `feat/stack-profile-loader`, headRefOid == PUSHED_SHA,
  MERGEABLE, every check SUCCESS, SKIPPED or NEUTRAL.
- `git -C /Users/justin/dev/devflow-claude fetch origin`; `git rev-parse origin/main` → MAIN_BEFORE (if it is not the
  value 67-06 recorded, also show `git log --oneline origin/main~5..origin/main`).

Idempotency: state MERGED → `already done`, MERGE_SHA from `mergeCommit.oid`, go to verify. headRefOid != PUSHED_SHA or
any check not green → do not ask; return blocked with the facts.

Otherwise STOP and present: "Approve merging release PR #N into main? Command: <merge command from context>. Effects:
(1) main gets a merge commit holding objectives 66 and 67; (2) every `aocyber` marketplace user can install 2.15.0 on
their next refresh or update; (3) docs.yml runs its deploy; (4) the Unit suite runs on main. The branch is not deleted
and no tag is created yet. Reply `approved`, `done`, or anything else to hold."

On `approved`, run that exact command once.
  </action>
  <instructions>The release PR is green and mergeable (67-07). I need your approval to merge it into main; this
publishes 2.15.0 to marketplace users.</instructions>
  <verification>PR MERGED; origin/main == MERGE_SHA with parents MAIN_BEFORE and PUSHED_SHA.</verification>
  <resume-signal>Reply "approved" (I merge), "done" (you merged), or anything else to hold.</resume-signal>
  <verify>
- `gh pr view <N> --repo AO-Cyber-Systems/devflow-claude --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'` prints `MERGED <MERGE_SHA>`
- after `git -C /Users/justin/dev/devflow-claude fetch origin`: `git rev-parse origin/main` == MERGE_SHA,
  `git rev-parse <MERGE_SHA>^1` == MAIN_BEFORE, `git rev-parse <MERGE_SHA>^2` == PUSHED_SHA
- `git diff --quiet <PUSHED_SHA> <MERGE_SHA>` exits 0 (or the `--stat` difference is recorded and is main-side only)
  </verify>
  <done>The literal reply is recorded. On approval main's head is MERGE_SHA with the expected parents and tree; on hold
nothing merged and the TRD returns `held at merge`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: annotated tag v2.15.0 on MERGE_SHA and push it (creates the GitHub release)</name>
  <files>(none — live git operation)</files>
  <action>
Skip if Task 1 was held. Pre-checks (read-only):
- `git -C /Users/justin/dev/devflow-claude ls-remote --tags origin v2.15.0 'v2.15.0^{}'`: peeled == MERGE_SHA →
  `already done`, go to verify; non-empty elsewhere → STOP and report, never move it.
- `git tag -l v2.15.0`: if a local tag exists, `git rev-parse 'v2.15.0^{commit}'` must be MERGE_SHA, else STOP and report.
- The tag-gate dry run (context) prints nothing.
- `git show <MERGE_SHA>:CHANGELOG.md` piped to `rg -c '^## \[2\.15\.0\]'` prints 1.

STOP and present: "Approve tagging the release? Commands, in order: (1) <tag command from context> (2) <push command from
context>. Effects: the tag is published on the merge commit; release.yml creates the GitHub release `Release 2.15.0 — …`
with the CHANGELOG 2.15.0 section as notes. Reply `approved`, `done`, or anything else to hold."

On `approved`, run (1) (the real changelog-on-tag hook fires and must allow it), then (2), each its own Bash call.
  </action>
  <instructions>main has the release merge commit and the tag gate allows v2.15.0 on it. I need your approval to create
and push the release tag; pushing it creates the GitHub release.</instructions>
  <verification>`git ls-remote --tags origin 'v2.15.0^{}'` peels to MERGE_SHA.</verification>
  <resume-signal>Reply "approved" (I tag and push), "done" (you did), or anything else to hold.</resume-signal>
  <verify>
- `git -C /Users/justin/dev/devflow-claude cat-file -t v2.15.0` prints `tag`
- `git rev-parse 'v2.15.0^{commit}'` == MERGE_SHA
- `git for-each-ref --format='%(contents:subject)' refs/tags/v2.15.0` prints the release title
- `git ls-remote --tags origin 'v2.15.0^{}'` shows MERGE_SHA
  </verify>
  <done>The literal reply is recorded. On approval the annotated tag sits on MERGE_SHA locally and on origin, the real
tag gate allowed it, no escape variable was used; on hold no tag exists.</done>
</task>

<task type="auto">
  <name>Task 3: Verify the GitHub release, record the main-branch runs, fast-forward the local main ref</name>
  <files>(none — read-only GitHub queries; local ref update only)</files>
  <action>
Skip if Task 1 or Task 2 was held. Follow 65-03 Task 3:
1. `gh run list --repo AO-Cyber-Systems/devflow-claude --workflow release.yml --limit 3 --json databaseId,headBranch,status,conclusion,displayTitle`;
   take the `v2.15.0` run and `gh run watch <id> --repo AO-Cyber-Systems/devflow-claude --exit-status` (timeout 600000).
2. `gh release view v2.15.0 --repo AO-Cyber-Systems/devflow-claude --json name,tagName,isDraft,publishedAt,body`: name is
   the release title, `isDraft` false, the body's first non-blank line is the CHANGELOG lead paragraph.
3. `gh run list --repo AO-Cyber-Systems/devflow-claude --branch main --limit 5 --json workflowName,headSha,status,conclusion,databaseId`;
   watch the Unit suite and docs runs on MERGE_SHA (`gh run watch <id> --exit-status`, timeout 600000) and record each
   conclusion; for a failed docs deploy record the `gh run view <id> --log-failed` tail as an objective-74 follow-up.
4. `git -C /Users/justin/dev/devflow-claude fetch origin main:main` (local ref only; skip and record if git refuses),
   then `git rev-parse main` == MERGE_SHA.
  </action>
  <verify>
- The release.yml run for v2.15.0 shows `conclusion: success`
- `gh release view v2.15.0 --repo AO-Cyber-Systems/devflow-claude --json isDraft,name -q '.name + " " + (.isDraft|tostring)'` prints the title and `false`
- Unit suite and docs conclusions on MERGE_SHA are recorded
  </verify>
  <done>The 2.15.0 GitHub release exists from the tag on the merge commit, and the main-branch runs are recorded.</done>
</task>

</tasks>

<verification>
- Two approvals with literal replies; MERGE_SHA, the annotated tag on it, the release run green, the release non-draft.
</verification>

<success_criteria>
- 67-09 can read MERGE_SHA and "2.15.0 is on main and tagged" from this SUMMARY.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-08-SUMMARY.md` via `summary post` (written by this TRD's executor),
`requirements-completed: []`, with the literal replies, MAIN_BEFORE, MERGE_SHA, the tag, the release URL and every run
conclusion.
</output>
