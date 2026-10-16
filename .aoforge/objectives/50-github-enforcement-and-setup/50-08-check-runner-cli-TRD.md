---
objective: 50-github-enforcement-and-setup
trd: "08"
type: standard
wave: 2
depends_on: ["50-01", "50-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-check-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
autonomous: true
requirements: [GEN-05]
must_haves:
  truths:
    - "`node gh-check-cli.cjs linked-issue` on a pull_request event whose body has no closing reference posts commit status `devflow/linked-issue` = failure on the head sha and exits 1 (SC3)"
    - "With `Closes #N` to an existing issue it posts success and exits 0"
    - "On a merge_group event it reads the PR named by the queue ref and posts the status on `merge_group.head_sha` under the same context"
    - "`planning-consistency` reads `.planning/config.json` at the PR head via the contents API, and the objective's linked TRDs via sub-issues (task-list fallback), then posts `devflow/planning-consistency`"
    - "`reconcile` on a merged pull_request closes every still-open closing target and linked TRD issue (state_reason completed) and comments once on the PR; it does nothing for an unmerged PR"
    - "Every GitHub call goes through gh-client (gh-seam repo test green); an internal error posts state `error` with the message and exits 1"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-check-cli.cjs
      provides: "main({argv, env}) for linked-issue | planning-consistency | reconcile; runnable as a script (require.main)"
  key_links:
    - "Invoked by the reusable workflow in 50-10 as `node <devflow>/plugins/devflow/devflow/bin/lib/gh-check-cli.cjs <check>`; logic from 50-03; fake routes from 50-01"
---

# TRD 50-08: the check runner for Actions (GEN-05, IO half)

<objective>
A small script the Actions workflow runs: read the event, fetch what the pure checks need through gh-client, post the result as a
commit status with the exact required context, and run the merge-time reconcile. This settles research Open Question 2 on the DevFlow side.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-08): ...`), then implementation (`feat(50-08): ...`).
- All GitHub access through `gh-client` (`ghRead`, `ghWrite`, `ghPaginate`); `gh-seam.repo.test.cjs` must stay green. On a runner, `gh`
  is preinstalled and authenticates from `GH_TOKEN`.
- Tests call `main({argv, env})` in-process with the fake installed via `_setRunGh`, `GITHUB_EVENT_PATH` pointing at the 50-03 fixtures
  (copied to a temp dir and edited per case), `GITHUB_REPOSITORY='o/r'`. No network, never the real `~/.claude`
  (`DEVFLOW_GH_CACHE_DIR` at a temp dir if gh-client touches it).

## Decisions

- **Contexts are commit statuses, not job names** (Open Question 2). The script posts `POST repos/{repo}/statuses/{sha}` with
  `{state, context: CONTEXTS.x, description, target_url}` itself. Required-status rules match a status context by name whatever the
  job/workflow is called, so nesting through `workflow_call` (`<caller job> / <called job>`) cannot break the match. `target_url` =
  `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`. The job also exits non-zero on failure for visibility.
- **Which token posts** is the workflow's choice (50-10): the App token when configured, else `GITHUB_TOKEN` with `statuses: write`.
  The ruleset pins `integration_id` only when `github.app_id` is set (50-09).
- **Events**: `pull_request` (non-closed actions) → PR from the payload, sha `pull_request.head.sha`; `merge_group` → PR number from
  `prNumberFromQueueRef(merge_group.head_ref)`, PR via `GET repos/{repo}/pulls/{n}`, sha `merge_group.head_sha`; `pull_request` closed →
  checks exit 0 without posting; anything else → exit 0 with a notice.
- **Data**: closing targets via `GET repos/{repo}/issues/{n}` (404 → null); commits via `ghPaginate pulls/{n}/commits`; config via
  `GET repos/{repo}/contents/.planning/config.json?ref=<head sha>` (404 → null → store off); linked TRDs via
  `gh-hierarchy.linkedNumbers(repo, objectiveIssue)` — export it if not exported (that is the only change to gh-hierarchy.cjs).
- **Reconcile** (pull_request closed, `merged:true`): `reconcilePlan` → for each number `PATCH repos/{repo}/issues/{n}
  {state:'closed', state_reason:'completed'}`; one PR comment `<!-- devflow:reconcile -->` listing what was closed (skip the comment
  when nothing was). Failures are listed; exit 1 if any close failed. Project status is left to GitHub Projects' "Item closed" workflow.
- Exit codes: 0 success, 1 failure or error.

## Test list

1. pull_request event, body "no refs" → fake `statuses[headSha][0]` = `{state:'failure', context:'devflow/linked-issue'}`; exit 1. (SC3)
2. Body `Closes #5`, issue #5 exists → success, exit 0.
3. Body `Closes #5`, #5 is a PR → failure naming it.
4. merge_group event for `pr-7` → status posted on the group head sha, evaluated against PR #7's body.
5. planning-consistency, config absent at head → success "store mode off".
6. planning-consistency, store config, objective PR closing #100 (objective) and #101 but #102 is a sub-issue too → failure naming #102.
7. reconcile, merged PR closing #100/#101, #101 open → #101 closed with `state_reason` completed, one marker comment; unmerged → no writes.
8. A gh failure mid-check (fake `setOffline(true)` after the status-less reads begin) → best-effort `error` status attempt, exit 1, no throw.
9. Closed (unmerged) pull_request event to `linked-issue` → exit 0, no status posted.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: event handling, linked-issue and status posting (tests 1-4, 8-9)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-check-cli.cjs, plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs</files>
  <action>
RED: tests 1-4, 8-9; commit `test(50-08): check runner - linked-issue statuses`.
GREEN: `main({argv, env})` returning `{code, state, description}`; `if (require.main === module) process.exit(main({argv:
process.argv.slice(2), env: process.env}).code)`. Commit `feat(50-08): Actions runner posts devflow/linked-issue`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Tests 1-4, 8-9 pass; seam test green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: planning-consistency and reconcile (tests 5-7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-check-cli.cjs, plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs, plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs</files>
  <action>
RED: tests 5-7 (seed fake `files` and sub-issues); commit `test(50-08): check runner - planning-consistency and reconcile`.
GREEN: the two subcommands; export `linkedNumbers` from gh-hierarchy if needed. Commit
`feat(50-08): Actions runner - planning-consistency and merge-time reconcile`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</verify>
  <done>Tests 5-7 pass; gh-hierarchy tests unchanged.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-client.cjs` `ghRead`/`ghWrite` L285-291, `ghPaginate` L340; `gh api -X POST <path> --input -` with `opts.input` JSON (fake reads it).
- `gh-outbox-flush.cjs` 49-10 `post-status` op — the status body shape already used for `devflow/verification`.
- `gh-hierarchy.cjs` `linkedNumbers(repo, objectiveNumber)` L633.
- 50-03 `gh-check.cjs` (`CONTEXTS`, `linkedIssue`, `planningConsistency`, `reconcilePlan`, `prNumberFromQueueRef`).
</codebase_examples>
<anti_patterns>
- Relying on the job name as the required context.
- Reading the caller's checkout (`.planning/` is not in git in store mode; use the contents API at the head sha).
- `requireEnabled(cwd)` here — there is no DevFlow config on the runner's cwd.
</anti_patterns>
<error_recovery>
- If gh-client's write pacing needs a state dir, set `DEVFLOW_GH_CACHE_DIR` in tests and document `RUNNER_TEMP` as the runtime value in 50-10.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-hierarchy.test.cjs</regression>
</validation_gates>

<verification>
- SC3: test 1 shows the failing status and exit 1 for a PR with no closing reference.
</verification>

<success_criteria>
The two required contexts are posted by DevFlow itself for PRs and merge groups, and a merged PR's stragglers are closed.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-08-SUMMARY.md`
</output>
