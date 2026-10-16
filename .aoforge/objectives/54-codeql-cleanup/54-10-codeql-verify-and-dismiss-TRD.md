---
objective: 54-codeql-cleanup
trd: "10"
type: standard
wave: 4
depends_on: ["54-09"]
files_modified: []
autonomous: false
requirements: ["54-A", "54-B", "54-C", "54-D", "54-E", "54-F", "54-G", "54-H"]
codeql_alerts: [95]
must_haves:
  truths:
    - "A CodeQL analysis (javascript-typescript and actions) exists for the pushed head SHA from TRD 54-09, on a PR ref, if the user approved opening a draft PR"
    - "That analysis reports 0 open alerts that are not among the 54 alerts open on main at planning time (no new alerts)"
    - "Of the 54 alerts, the 53 in groups A-C and E-H are no longer open on the PR ref; only alert 95 (group D) may remain open there"
    - "Alert 95 (js/regex-injection, plugins/devflow/devflow/bin/lib/handoff.cjs) is dismissed on GitHub as \"won't fix\" with the intended-regex reason, and no other alert's state was changed"
  artifacts: []
  key_links:
    - "pushed branch (54-09) -> draft PR to main -> CodeQL default setup analysis on refs/pull/<N>/head -> alert comparison"
---

# TRD 54-10: Verify CodeQL on the branch, then dismiss alert 95

<objective>
Prove the fixes with CodeQL itself, then record the one approved dismissal.

Finding that changes scope: this repository uses CodeQL **default setup**
(`gh api repos/AO-Cyber-Systems/devflow-claude/code-scanning/default-setup`: state configured, schedule weekly). Default setup
analyses only `refs/heads/main` and pull-request refs (`refs/pull/<N>/head`). The recent analyses list shows exactly those two kinds of
ref. A plain push of `feat/stack-profile-loader` therefore triggers no CodeQL run, and the branch can only be verified through a PR
against main. Opening a PR is a GitHub write the user has not approved. Task 1 asks.

The baseline: 54 alerts open on main at commit 2f0ed83b (post-merge scan, 2026-10-04 17:41Z):

```
A  64 65 66 68 74 76 77 78 79 82 83 84 85 87 91 92 93 94 101 110 111
B  130 131 132 133 135
C  129
D  95            (dismiss, do not fix)
E  89
F  125 137
G  96 97 98 99 100 102 103 104 105 106 107 108 109 112 113 115 116 117 118 119 122
H  124 134
```

Dismissing alert 95 is approved by the user for that alert only, to run after the fixes are pushed (TRD 54-09 pushed them).
Merging the PR, tagging and releasing are out of scope.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- One plain command per Bash call.
- The only GitHub writes allowed: (a) `gh pr create --draft` if, and only if, the user picks option A in Task 1; (b) the single
  PATCH dismissing alert 95 in Task 3. Never dismiss, reopen or comment on any other alert. Never mark the PR ready, merge it,
  tag or release.
- If foreground `sleep` is blocked in your harness, poll with a background command or re-check between other steps. CodeQL
  analyses for this repo took about 2-4 minutes per language on PR #121.

## Test list

No code tests. The checks are the CodeQL API comparisons in Task 2.

<embedded_context>

<codebase_examples>
Alert listing used at planning time (main):

```bash
gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts?ref=refs/heads/main&state=open&per_page=100" --paginate --jq '.[] | "\(.number)\t\(.rule.id)\t\(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'
```

The same for a PR ref, plus the analyses for the head SHA:

```bash
gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/analyses?ref=refs/pull/<N>/head&per_page=20" --jq '.[] | "\(.created_at) \(.commit_sha[0:8]) \(.category)"'
gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts?ref=refs/pull/<N>/head&state=open&per_page=100" --paginate --jq '.[].number'
```

Dismissal (user-approved for alert 95 only):

```bash
gh api -X PATCH repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts/95 \
  -f state=dismissed \
  -f dismissed_reason="won't fix" \
  -f dismissed_comment="Intended: a handoff manifest declares prompt_match as a regex that recognises the user's own secret prompt; compiling it is the feature (see the comment at handoff.cjs, objective 54)."
```

`dismissed_comment` is limited to 280 characters. Keep it under that.
</codebase_examples>

<anti_patterns>
- Do not treat "the push succeeded" as CodeQL verification. No analysis runs on a branch push here.
- Do not dismiss alert 95 before confirming its number still points at handoff.cjs `js/regex-injection`. Alert numbers are
  repo-global.
- Do not use the dismissal to clear any alert that the PR analysis still reports open. Report it as a gap instead.
</anti_patterns>

<error_recovery>
- If the PR-ref alert list still shows a fixed alert as open, check `gh api .../code-scanning/alerts/<n>/instances?ref=refs/pull/<N>/head`.
  The instance may be from an older analysis of the PR. Wait for the analysis whose `commit_sha` equals the pushed SHA.
- If a new alert appears (a number not in the baseline), record its rule, path and line in the SUMMARY as a gap for
  `/devflow:plan-objective 54 --gaps`, and still finish Task 3.
- If the PATCH returns 403, the token lacks `security_events` write. Report the exact error and leave the dismissal to the user with
  the command above.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Choose how CodeQL verifies the pushed branch</name>
  <decision>CodeQL default setup only analyses main and pull requests, so the pushed branch needs a PR against main to be scanned.</decision>
  <context>TRD 54-09 pushed feat/stack-profile-loader at the SHA in 54-09-SUMMARY.md. No CodeQL analysis runs on that push. The objective's success criterion "CodeQL on the branch reports 0 new alerts" needs a PR ref.</context>
  <options>
    <option id="A">
      <name>Claude opens a draft PR to main</name>
      <pros>Full verification now: new-alert check and the 53-alert closure check on refs/pull/N/head.</pros>
      <cons>A GitHub write. The PR stays draft and is not merged by this objective.</cons>
    </option>
    <option id="B">
      <name>User opens the PR (or an existing one is reused) and gives the number</name>
      <pros>The user controls the PR title, body and timing.</pros>
      <cons>Waits on the user.</cons>
    </option>
    <option id="C">
      <name>Skip branch verification; check main after the release merge</name>
      <pros>No PR needed now.</pros>
      <cons>New alerts would only surface after merge. Task 2 is skipped and recorded as deferred.</cons>
    </option>
  </options>
  <resume-signal>Reply A, B with the PR number, or C.</resume-signal>
  <files>(none)</files>
  <action>Present the three options above to the user with the pushed SHA from 54-09-SUMMARY.md, and wait. Do not open a PR before the user answers. Record the answer (and the PR number under B) for Task 2.</action>
  <verify>The user's reply names A, B (with a PR number) or C.</verify>
  <done>The decision and any PR number are recorded in the SUMMARY draft before Task 2 starts.</done>
</task>

<task type="auto">
  <name>Task 2: Compare the PR-ref CodeQL analysis with the 54-alert baseline</name>
  <files>(none; GitHub API reads only, plus `gh pr create --draft` under option A)</files>
  <action>
Skip this task under option C and record "branch verification deferred to main after merge" in the SUMMARY.

1. Option A only: `gh pr create --draft --base main --head feat/stack-profile-loader --title "Objective 54: CodeQL cleanup (draft, for CodeQL verification)" --body-file <scratch file>`.
   The body lists the eight TRDs, says "Draft: opened to run CodeQL default setup; not for merge until release approval", and ends
   with the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
2. Wait until the analyses list for `refs/pull/<N>/head` has entries for `/language:javascript-typescript` and `/language:actions`
   whose `commit_sha` equals the pushed SHA.
3. Fetch open alert numbers on `refs/pull/<N>/head`. Compute:
   - new = numbers not in the 54-alert baseline. Must be empty.
   - still open from A-C, E-H = baseline minus {95}, intersected with the open list. Must be empty.
   - 95 may be open (not yet dismissed).
4. Record the three sets, the analysis IDs and timestamps in the SUMMARY.
  </action>
  <verify>gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts?ref=refs/pull/<N>/head&state=open&per_page=100" --paginate --jq '.[].number'</verify>
  <done>Analyses for the pushed SHA exist for both categories; the open list on the PR ref is empty or exactly [95].</done>
  <recovery>See error_recovery. A non-empty "new" or "still open" set is a gap: record it, do not fix code in this TRD.</recovery>
</task>

<task type="auto">
  <name>Task 3: Dismiss alert 95 as "won't fix" with the intended-regex reason</name>
  <files>(none; one GitHub API write)</files>
  <action>
1. Guard: `gh api repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts/95 --jq '"\(.state) \(.rule.id) \(.most_recent_instance.location.path)"'`
   must print `open js/regex-injection plugins/devflow/devflow/bin/lib/handoff.cjs`. If it does not, stop and report. Do not dismiss.
2. Run the PATCH from codebase_examples exactly once.
3. Re-read alert 95 and confirm `state == "dismissed"`, `dismissed_reason == "won't fix"`, and the comment text.
  </action>
  <verify>gh api repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts/95 --jq '"\(.state) \(.dismissed_reason) \(.dismissed_comment)"'</verify>
  <done>Alert 95 reads `dismissed won't fix Intended: ...`. No other alert's state changed (the open list on main is the baseline minus 95, until the release merge closes the rest).</done>
  <recovery>On 403/404, record the response and hand the command to the user. The dismissal is not retried with other credentials.</recovery>
</task>

</tasks>

<verification>
- Under A/B: the PR-ref analysis for the pushed SHA shows no new alerts, and none of the 53 fixed alerts open.
- Alert 95 is dismissed with reason "won't fix" and the intended-regex comment.
- No merge, tag or release happened (`gh pr view <N> --json isDraft,state` shows a draft and OPEN under A/B).
</verification>

<success_criteria>
CodeQL confirms the branch introduces no new alerts and clears groups A-C and E-H (or the check is explicitly deferred under option
C). Alert 95 is dismissed with its reason. Closing the alerts on main happens at the separately approved release merge.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-10-SUMMARY.md` via `df-tools summary post` with the decision taken,
the PR number (if any), the alert sets and the dismissal confirmation.
</output>
