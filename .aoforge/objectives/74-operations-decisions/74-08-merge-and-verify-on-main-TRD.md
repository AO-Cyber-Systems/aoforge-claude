---
objective: 74-operations-decisions
trd: "08"
type: standard
wave: 6
depends_on: ["74-05", "74-06", "74-07"]
files_modified:
  - "(none: one approved merge into main, read-only verification of the runs it triggers, and the user's domain decision)"
autonomous: false
requirements: [OPS-01, OPS-02, OPS-03]
must_haves:
  truths:
    - "The ops pull request was merged into main by one `gh pr merge --merge`, run only after the user's explicit approval, and passed through the new ruleset with its required unit suite green (no --admin unless the user explicitly asked for it)"
    - "On the merge commit's push to main, the `Live visual judge` workflow concluded success, and its log shows gate=binding and evidence=vision for both fixture states (success criterion 1)"
    - "On the same push, the `Docs site` workflow concluded success: the deploy step ran for branch main, and https://aoforge-docs.pages.dev/ answers 200 (success criterion 3)"
    - "After the merge, `ruleset-check compare` still exits 0 and `rules/branches/main` still lists the ruleset's four rules (success criterion 2)"
    - "The user's decision on moving devflow.cloud and www.devflow.cloud to aoforge-docs is recorded: moved and verified, or deferred to a todo"
  artifacts: []
  key_links:
    - from: "merge commit on main"
      to: ".github/workflows/visual-judge.yml and .github/workflows/docs.yml"
      via: "push: branches [main]"
      pattern: "branches: \\[main\\]"
---

# TRD 74-08: Merge the CI branch through the new ruleset and verify all three outcomes on `main` (gates)

<objective>
The three operational decisions close on `main` itself. By now the secret is set (74-05), the Pages project exists
(74-06), and `main` is protected (74-07). Merging the ops PR is the push to `main` that success criteria 1 and 3 name,
and the first merge that must satisfy the ruleset from criterion 2. This TRD asks for the merge, then verifies each
criterion from the runs that merge triggers. Last, it asks the user whether to move the docs domain to the new project.

Purpose: OPS-01, OPS-02 and OPS-03 verified on `main`.
Output: the merge commit, three green push-to-main results, the ruleset read-back, and the domain decision.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/74-operations-decisions/74-05-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-06-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-07-SUMMARY.md

## Approval protocol

The same as TRD 74-04. Every gate is `checkpoint:human-action`. Record the user's literal replies. `approved` runs the
listed command once. Anything else holds. One plain command per Bash call. Never port 8080. Never read a secret.

Facts:
- This repository's merge convention is a merge commit with the subject `Merge #<N>: <title>` (b4a9d870 "Merge #128: ...").
- A merge to main triggers: Unit suite (push main), Live visual judge (every push to main), Docs site (push paths include
  `.github/workflows/docs.yml` and `scripts/ci-cloudflare-target.cjs`, both changed by this PR), and CodeQL.
- The site's `baseURL` is `https://devflow.cloud/` (a preserved domain), served today by the old Pages project. Links are
  mostly relative, so aoforge-docs.pages.dev renders, but canonical links point at devflow.cloud until the domain moves.
- `feat/stack-profile-loader` already carries the same commits (cherry-picked from it), so its next release PR merges
  them without conflict.
</context>

<embedded_context>

<anti_patterns>
- Never `--admin`, `--squash`, `--rebase`, `--auto` or `--delete-branch` unless the user's reply names it.
- Never re-run, cancel or dispatch a workflow on main here. A failure on main is recorded and diagnosed, and any fix
  goes through a new PR with its own approvals.
- Never move or delete a domain or Pages project yourself.
</anti_patterns>

<error_recovery>
- The merge is refused ("required status check ... expected" or failing): read `gh pr checks <N>` and report. Offer
  `--admin` only as the user's explicit choice.
- Live visual judge fails on main while it passed on the PR: record the summary lines. A judge flake (split votes) is a
  finding for the docs TRD. Do not loosen the assertion. Ask whether to re-run (its own approval).
- Docs deploy fails on main while the preview passed: compare the "cloudflare target:" lines of both runs and report.
- aoforge-docs.pages.dev is not 200 right after success: Pages propagation can take a minute. Re-check twice, 60 s apart
  (use Monitor or a background wait, not a foreground sleep), then report.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: merge the ops pull request into main</name>
  <files>(none: one merge)</files>
  <action>
Read-only first: `gh pr view ops/74-ci-operations --repo AO-Cyber-Systems/aoforge-claude --json number,title,mergeable,mergeStateStatus,statusCheckRollup`.
Record each check. The unit suite must be green. The live visual judge should be green from 74-05; a docs build should be present.
STOP and present the check table and: "Approve merging PR #<N> into main? This is the first merge through the new ruleset.
It triggers on main: the unit suite, the live visual judge (6 vision calls) and the docs deploy to aoforge-docs
(production). Command: `gh pr merge <N> --repo AO-Cyber-Systems/aoforge-claude --merge --subject "Merge #<N>: ci: live visual judge and Cloudflare deploy target (objective 74)"`.
Reply `approved`, `done`, or anything else to hold."
On `approved` run it once. Record the merge commit: `gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json mergeCommit,mergedAt,state`.
  </action>
  <instructions>Merge the CI branch; it lands the visual judge and the deploy fix on main.</instructions>
  <verification>The PR state is MERGED and the merge commit is on origin/main.</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,mergeCommit</verify>
  <done>Reply recorded; the merge SHA recorded (or the hold recorded).</done>
</task>

<task type="auto">
  <name>Task 2: Verify the three success criteria from the push-to-main runs</name>
  <files>(none: read-only)</files>
  <action>
Skip if Task 1 held. One plain command per Bash call:
1. `gh run list --repo AO-Cyber-Systems/aoforge-claude --branch main --commit <merge sha> --json databaseId,workflowName,status,conclusion,url`
   (list again until Unit suite, Live visual judge and Docs site all appear).
2. `gh run watch <id> --repo AO-Cyber-Systems/aoforge-claude --exit-status` for each of the three.
3. SC1: `gh run view <judge id> --repo AO-Cyber-Systems/aoforge-claude --log`, filtered with rg for `live visual judge:`,
   `docs-home`, `tokens:`, `PASS`. Record them.
4. SC3: `gh run view <docs id> --repo AO-Cyber-Systems/aoforge-claude --log`, filtered with rg for `cloudflare target:`,
   `pages.dev`, `Deployment complete`. Then `curl -sS -o /dev/null -w '%{http_code}' https://aoforge-docs.pages.dev/`
   (200) and `curl -sS https://aoforge-docs.pages.dev/`, filtered with `rg -o '<title>[^<]*'` (the AOForge title).
5. SC2: `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` (exit 0) and
   `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] | .type]'`.
6. `git fetch origin`, then `git log --oneline -1 origin/main` (the merge commit).
  </action>
  <verify>All three workflows concluded success on the merge SHA; aoforge-docs.pages.dev answers 200 with the AOForge title; compare exits 0</verify>
  <done>Every success criterion has recorded evidence from main (or a failure is recorded with its error_recovery path).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: The user decides on moving the docs domain to aoforge-docs</name>
  <files>(none: Cloudflare dashboard, done by the user)</files>
  <action>
Skip if Task 2 did not show a green production deploy. STOP and present: "aoforge-docs now serves the AOForge docs at
https://aoforge-docs.pages.dev/. devflow.cloud and www.devflow.cloud still point at the old docs project, so they show
the old site. The site's baseURL is devflow.cloud. To move them: in the Cloudflare dashboard, remove both custom domains
from the old project, then add them under aoforge-docs → Custom domains (expect a short gap while DNS and the certificate
switch). Deleting the old project is your call; I won't do it.
Reply `done` (moved), `later` (I file a todo), or anything else to hold."
On `done`: verify with `curl -sS https://devflow.cloud/` filtered with `rg -o '<title>[^<]*'` (AOForge) and
`curl -sS -o /dev/null -w '%{http_code}' https://www.devflow.cloud/`. On `later`: record the deferral. TRD 74-09 files the todo.
  </action>
  <instructions>Move devflow.cloud to the new project now, or defer it.</instructions>
  <verification>On `done`, devflow.cloud serves the AOForge title.</verification>
  <resume-signal>Reply "done", "later", or anything else to hold.</resume-signal>
  <verify>curl -sS https://devflow.cloud/ | rg -o '<title>[^<]*'</verify>
  <done>Reply recorded; the domain state verified or the deferral recorded.</done>
</task>

</tasks>

<verification>
- The SUMMARY maps each success criterion (1 visual judge, 2 ruleset, 3 docs deploy) to its run URL, log lines or
  command output, and records the domain decision.
</verification>

<success_criteria>
- On `main`: the live judge ran and passed on a push, the ruleset holds and matches, and the docs deployed green.
</success_criteria>

<output>
After completion, write `74-08-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-08 --from <draft>`.
</output>
