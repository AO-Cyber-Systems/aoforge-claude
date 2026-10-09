---
objective: 55-store-live-smoke-fixes
trd: "06"
type: standard
wave: 3
depends_on: ["55-01", "55-02", "55-03", "55-04", "55-05"]
files_modified: []
autonomous: false
requirements: ["55-1", "55-4", "55-6"]
must_haves:
  truths:
    - "The user explicitly approved (or declined) pushing this repository's branch to AO-Cyber-Systems/devflow-claude before anything was pushed"
    - "On the smoke clone, `df-tools upgrade --apply` seeded .planning/state.json and stamped the project, and `validate health` then reports neither W009 nor W040"
    - "`gh setup --apply` on AO-Cyber-Systems/devflow-store-smoke re-created the `devflow: default branch` ruleset (deleted first, its JSON saved) with bypass_actors containing RepositoryRole 5 / always, and GET reports current_user_can_bypass `always`"
    - "The managed .github/workflows/devflow.yml on the smoke repo's main pins both `uses: ...devflow-checks.yml@<pushed sha>` and `devflow-ref: <pushed sha>`"
    - "The workflow pull request's DevFlow jobs ran the check runner without ENOENT (statuses posted with real verdicts, not crash errors), and the PR merged with the exact admin-bypass command `gh setup` printed"
  artifacts: []
  key_links:
    - "pushed devflow-claude sha -> github.checks_workflow@sha -> gh setup --apply -> devflow.yml -> reusable workflow sparse checkout incl. references/ -> gh-check-cli statuses"
    - "gh setup --apply -> ruleset with admin bypass -> gh pr merge <n> --admin -> workflow on main"
---

# TRD 55-06: Live re-run, part 1. Push the fixes, re-run `gh setup`, merge the workflow PR with the admin bypass

<objective>
Prove items 55-1 and 55-4 against real GitHub on `AO-Cyber-Systems/devflow-store-smoke`, and close the fresh-store bootstrap minor
(55-6, `state.json`/stamp). Part 2 (TRD 55-07) runs objective 2 through the lifecycle.

GitHub writes are approved for `AO-Cyber-Systems/devflow-store-smoke` ONLY. The fixed reusable workflow must be reachable at the
ref the smoke repo pins. That means pushing commits to `AO-Cyber-Systems/devflow-claude`, which is a different repository and is
NOT covered by that approval. Task 1 asks first. No merge to devflow-claude `main`, no tag, no release.

A fresh repository would need its own approval. Deleting and re-creating the smoke repo's DevFlow ruleset runs the same create
path that a fresh `gh setup --apply` takes (OBJECTIVE Success, bullet 1).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- `SMOKE=/private/tmp/claude-501/-Users-justin-dev-devflow-claude/f71ea5d2-ce23-49f6-b435-44ae5637b57b/scratchpad/devflow-store-smoke`.
  Shell variables do not survive between Bash calls: write the literal path every time.
- Drive the smoke with THIS checkout's df-tools:
  `node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs --cwd <SMOKE> <command>`. Never use
  `~/.claude/devflow/bin/df-tools.cjs`: the home mirror is 2.12.0 and lacks every fix.
- One plain command per Bash call. No raw `git commit` (gate-commits). In the smoke clone, commit only through df-tools
  `commit`, following the exact steps `gh setup --apply` prints.
- Allowed GitHub writes: everything on `AO-Cyber-Systems/devflow-store-smoke` this TRD lists, and the push Task 1 approves (or
  none). Nothing else: no other repository, no devflow-claude PR, no tag, no release.
- Never use port 8080.
- Polling: bounded loops only, at most 10 minutes per wait (a single Bash call with `timeout` 600000, or the harness's monitor
  tool if foreground `sleep` is blocked).
- Record every command's key output (ids, SHAs, statuses) in the SUMMARY. TRD 55-08's docs cite them.

## Pre-state (checked while planning, 2026-10-05)

- Smoke clone on `main` == `origin/main` (83dd15d). `.gitignore` and `.planning/` untracked (0010 applied, not committed).
  `.planning/config.json`: store on, `github.checks_workflow: ""`, stamp `{"migrations_applied":["0010"]}` with no version.
- `upgrade --check` on the clone: pending `0003` (state.json seed) only; no confirm migrations pending.
- The repo's `.github/workflows/devflow.yml` on main pins `devflow-checks.yml@v2.13.1` / `devflow-ref: v2.13.1` (broken).
- Ruleset `devflow: default branch` id 24476250, hand-fixed with the admin bypass.
- This repository: branch `feat/stack-profile-loader`, upstream `origin/feat/stack-profile-loader`, ahead of it by every objective
  55 commit.

<embedded_context>

<codebase_examples>
- `gh setup` is `df-tools gh setup [--apply] [--refresh] [--require-wiki]` (skills/gh-sync/SKILL.md step 6). The dry run prints
  every action and its exact request. `--apply` leaves `devflow.yml` and the PR template uncommitted and prints the commit steps
  (gh-setup-cli.cjs `filesLines`).
- The caller renders `uses: {{checks_workflow}}` and `devflow-ref: {{devflow_ref}}` (templates/github/devflow.yml). With
  `github.checks_workflow` ending in `@<SHA>`, both carry `<SHA>` (TRD 55-01).
</codebase_examples>

<anti_patterns>
- Do not hand-edit the smoke's `devflow.yml`. If setup renders it wrong, that is the finding.
- Do not leave the smoke repo without its ruleset: re-create it from the saved JSON on any failure after the delete.
- Do not run `gh setup --apply` before the dry run has been read.
</anti_patterns>

<error_recovery>
- `gh` auth errors: run `gh auth status` and report. Never paste tokens.
- The ruleset DELETE returns 404: it was already removed. Continue with the dry run, which then plans `create`.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Approve the push that makes the fixed workflow reachable</name>
  <decision>How the smoke repository reaches the fixed `devflow-checks.yml` (a write to AO-Cyber-Systems/devflow-claude)</decision>
  <context>
Before asking, gather facts with reads only:
`git -C /Users/justin/dev/devflow-claude status -sb`,
`git -C /Users/justin/dev/devflow-claude log --oneline origin/feat/stack-profile-loader..HEAD`, and
`node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` (it must pass: the pinned workflow must be the fixed
one). Show the user the commit list. The smoke repo will pin the pushed HEAD SHA in both `uses:` and `devflow-ref`
(TRD 55-01), so later pushes cannot change what it runs.
  </context>
  <options>
    <option id="push-branch">
      <name>A. Push `feat/stack-profile-loader` to origin (recommended)</name>
      <pros>The normal work branch. The pinned SHA stays reachable for later smoke runs.</pros>
      <cons>Publishes every objective 55 commit on the shared feature branch before the objective is verified.</cons>
    </option>
    <option id="push-throwaway">
      <name>B. Push HEAD to a throwaway ref `smoke/55-live` only</name>
      <pros>Leaves the feature branch untouched on GitHub.</pros>
      <cons>Deleting the ref later can leave the smoke repo's pinned SHA unreachable, so the smoke checks stop working until re-pinned.</cons>
    </option>
    <option id="skip">
      <name>C. Do not push; skip the live re-run</name>
      <pros>No write outside the smoke repo.</pros>
      <cons>OBJECTIVE Success bullets 1, 2 and 6 stay unproven. The live re-run is recorded as a pending user action and TRD 55-07 does not run.</cons>
    </option>
  </options>
  <resume-signal>Reply "A", "B" or "C".</resume-signal>
  <files>(none)</files>
  <action>Run the three reads in the context above. Present the commit list and the three options, then wait. Push nothing before the user answers. Record the answer in the SUMMARY draft for Task 2.</action>
  <verify>The user's reply names A, B or C.</verify>
  <done>The decision is recorded before Task 2 starts, and nothing was pushed to devflow-claude before it.</done>
</task>

<task type="auto">
  <name>Task 2: Push, bootstrap the smoke clone, re-create the ruleset with `gh setup --apply`</name>
  <files>(none in this repository; smoke clone .planning/config.json, .planning/state.json, .github/workflows/devflow.yml)</files>
  <action>
If Task 1 = C: write the SUMMARY saying so and stop. If A: `git -C /Users/justin/dev/devflow-claude push origin feat/stack-profile-loader`.
If B: `git -C /Users/justin/dev/devflow-claude push origin HEAD:refs/heads/smoke/55-live`. Record `git rev-parse HEAD` as `<SHA>` and
confirm it on GitHub: `gh api repos/AO-Cyber-Systems/devflow-claude/commits/<SHA> -q .sha`.

Then, in order, each a single command:
1. 55-6 bootstrap: `node .../df-tools.cjs --cwd <SMOKE> upgrade --apply`, then `node .../df-tools.cjs --cwd <SMOKE> validate health`.
   Expect `.planning/state.json` to exist, the config `devflow.version` to be `2.13.1` (or the current version), and no W009 or W040.
   E020 (the home mirror is stale) is about this machine, not the project: note it and ignore it.
2. Pin: `node .../df-tools.cjs --cwd <SMOKE> config-set github.checks_workflow AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@<SHA>`.
3. Save the ruleset: `gh api repos/AO-Cyber-Systems/devflow-store-smoke/rulesets/24476250 > <scratchpad>/ruleset-24476250.json`
   (the session scratchpad, not the clone). Then delete it:
   `gh api -X DELETE repos/AO-Cyber-Systems/devflow-store-smoke/rulesets/24476250`.
4. `node .../df-tools.cjs --cwd <SMOKE> gh setup` (dry run). Expect a ruleset `create` whose payload has
   `bypass_actors: [{actor_id:5, actor_type:"RepositoryRole", bypass_mode:"always"}]`, and a workflow `update` with `@<SHA>` and
   `devflow-ref: <SHA>`. If either is wrong, STOP: that is a code gap. Restore the ruleset by POSTing the saved JSON's writable
   fields (name, target, enforcement, conditions, bypass_actors, rules), then report.
5. `node .../df-tools.cjs --cwd <SMOKE> gh setup --apply`. Capture the printed commit steps and the guidance line verbatim.
6. `gh api repos/AO-Cyber-Systems/devflow-store-smoke/rulesets` -> the new id. Then
   `gh api repos/AO-Cyber-Systems/devflow-store-smoke/rulesets/<new id> -q '{bypass: .bypass_actors, can: .current_user_can_bypass}'`.
   Expect admin RepositoryRole 5 always and `always`.
  </action>
  <verify>`gh api repos/AO-Cyber-Systems/devflow-store-smoke/rulesets/<new id> -q .current_user_can_bypass` prints `always`; `grep -n "devflow-ref\|uses:" <SMOKE>/.github/workflows/devflow.yml` shows `<SHA>` on both lines; `test -f <SMOKE>/.planning/state.json`.</verify>
  <done>Ruleset re-created by setup with the admin bypass; caller pinned to the pushed SHA; smoke clone bootstrapped without W009/W040.</done>
  <recovery>If setup --apply fails part-way, re-run it (it is idempotent). If the ruleset cannot be re-created, POST the saved JSON's writable fields so the repo is never left unprotected, then report the failure as a gap.</recovery>
</task>

<task type="auto">
  <name>Task 3: Merge the workflow PR with the printed admin-bypass command; the checks run without ENOENT</name>
  <files>(none in this repository; smoke repo: devflow-setup branch, workflow PR)</files>
  <action>
1. Run the commit steps `gh setup --apply` printed, exactly as printed (branch `devflow-setup`, the df-tools commit with its logged
   escape). Also commit the 0010 leftovers (`.gitignore`, `.planning/config.json`, including the new `checks_workflow`) on that branch
   with one more `df-tools commit --files ...` using the same escape form. Push the branch and open the PR as the printed steps say.
   If the steps do not cover opening the PR, run `gh pr create --repo AO-Cyber-Systems/devflow-store-smoke --base main --head devflow-setup --title "chore: DevFlow checks workflow (re-pin)" --body "Workflow PR for objective 55 live re-run."`.
2. Wait (bounded) for the DevFlow jobs on the PR head. Then read the statuses:
   `gh api repos/AO-Cyber-Systems/devflow-store-smoke/commits/<head sha>/status -q '.statuses[] | {context, state, description}'`.
   Expected: `devflow/linked-issue` = failure with a real message (this PR closes no issue), NOT an `error` mentioning ENOENT.
   Fetch one job log with `gh run view <run id> --repo AO-Cyber-Systems/devflow-store-smoke --log` and `grep -c ENOENT`. Expected 0.
3. Merge with the command the guidance printed (55-01: `gh pr merge <n> --admin --squash`), `--repo AO-Cyber-Systems/devflow-store-smoke`.
4. `git -C <SMOKE> switch main` and `git -C <SMOKE> pull --ff-only`. Confirm `.github/workflows/devflow.yml` on main pins `<SHA>`.
  </action>
  <verify>`gh pr view <n> --repo AO-Cyber-Systems/devflow-store-smoke --json state,mergedAt -q .state` prints MERGED; the job log has 0 ENOENT lines; main's devflow.yml pins `<SHA>`.</verify>
  <done>The workflow PR merged with exactly the documented admin bypass, and the required-check runner ran green-capable (real verdicts) on a real store repo.</done>
  <recovery>If `--admin` is refused, try the web-UI bypass equivalent through the API only if the user agrees. Record the exact error: the guidance text is then wrong and needs a gap closure on 55-01. If a job log shows ENOENT for another path, that is a 55-02 gap: record the path.</recovery>
</task>

</tasks>

<verification>
- SUMMARY lists: Task 1 decision, `<SHA>`, upgrade/health output, saved ruleset path, new ruleset id + bypass JSON, PR number,
  status contexts and states, the ENOENT count, and the merge command used.
</verification>

<success_criteria>
- Success bullet 1: a setup-created ruleset lets the workflow PR merge with the documented admin bypass.
- 55-4 proven live: the runner loads from the sparse checkout on a real store repo.
- 55-6 bootstrap minor: resolved by `upgrade --apply` and recorded.
</success_criteria>

<output>
After completion, publish `55-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes.
</output>
