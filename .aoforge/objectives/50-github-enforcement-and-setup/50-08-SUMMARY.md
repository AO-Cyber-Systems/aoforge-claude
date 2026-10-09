---
objective: 50-github-enforcement-and-setup
trd: "08"
subsystem: github-enforcement
tags: [github, required-checks, commit-status, merge-queue, actions, reconcile, node-test]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: "50-01 gh-fake routes (statuses, contents, pulls/{n}/commits, PATCH issues) and 50-03 gh-check.cjs pure logic (CONTEXTS, linkedIssue, planningConsistency, reconcilePlan, prNumberFromQueueRef)"
provides:
  - "lib/gh-check-cli.cjs: main({argv, env}) for linked-issue | planning-consistency | reconcile, runnable as a script (require.main), never throws"
  - "Commit statuses devflow/linked-issue and devflow/planning-consistency posted by DevFlow itself on pull_request (head sha) and merge_group (group head sha) events"
  - "Merge-time reconcile of a merged PR: stragglers closed as completed, one marker comment"
  - "gh-hierarchy.linkedNumbers exported"
affects: [50-09 ruleset, 50-10 workflow template, 50-12 e2e]

tech-stack:
  added: []
  patterns:
    - "A required check is a commit status posted by the script under CONTEXTS.x, so the required-status match is by context name and cannot be broken by job or workflow_call nesting"
    - "Any failure becomes a best-effort `error` status on the head sha plus exit 1; main() returns {code, state, description, details} and never throws"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-check-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-check-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "Statuses, not check runs: POST repos/{repo}/statuses/{sha} with {state, context: CONTEXTS.x, description <= 140, target_url}; target_url is built from GITHUB_SERVER_URL, the resolved repo and GITHUB_RUN_ID and omitted when the run id is unknown"
  - "The event name wins when GITHUB_EVENT_NAME is set (pull_request, pull_request_target, merge_group); otherwise the payload shape decides. GITHUB_REPOSITORY wins over the event's repository.full_name"
  - "The head's .planning/config.json that does not parse is read as store mode off (the check passes, it never hangs)"
  - "The objective issue is a closing target, else found by scanning the github.labels.objective issues (default devflow:objective) for devflow:id=<id>, so a PR that forgot Closes #<objective> is named rather than reported as not found"
  - "Reconcile acts only on a merged PR whose base is the default branch: closing keywords never act on another base, so closing there would be wrong"
  - "A reconcile comment that cannot be posted is noted in the details but is not a failure; a close that fails is listed and exits 1"
  - "pulls/{n}/commits only adds notes (Refs #N), so a 404 there is no commits, not an error"

patterns-established:
  - "Tests call main() in-process with the 50-01 fake through _setRunGh and event payloads copied from the 50-03 fixtures; seeding a PR in the fake is itself a write, so reconcile tests mark a baseline before asserting on the runner's own calls"

requirements-completed: [GEN-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-01
tokens_input: 5550075
tokens_output: 67588
tokens_cache_read: 5400232
tokens_cache_write: 149757
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50 TRD 08: the check runner for Actions Summary

**`gh-check-cli.cjs` reads the Actions event and posts `devflow/linked-issue` and `devflow/planning-consistency` as commit statuses (PR head sha, or the merge-queue group sha for `merge_group`), with a merge-time `reconcile` that closes what a merged PR left open; an internal error posts an `error` status and exits 1, and the script never throws.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-01T17:28:18Z
- **Completed:** 2026-10-01T17:35:07Z
- **Tasks:** 2 of 2 (both TDD)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `linked-issue`: closing references are resolved with `GET issues/{n}` (404 is a finding, a PR is a finding), commits with `ghPaginate pulls/{n}/commits`, then `check.linkedIssue` decides. A PR with no closing reference posts `failure` and exits 1 (SC3); `Closes #5` to an existing issue posts `success` and exits 0.
- `merge_group`: the PR number comes from `prNumberFromQueueRef(merge_group.head_ref)`, the PR from `GET pulls/{n}`, and the status lands on `merge_group.head_sha` under the same context. A queue ref that names no PR, or a PR that is gone, is an `error` status on the group sha.
- `planning-consistency`: `.planning/config.json` is read at the PR head through the contents API (404 -> store off), then, for a store-mode objective PR, the closing targets, the objective issue and the linked TRDs (`gh-hierarchy.linkedNumbers`: sub-issues, or the `trds` task list when the sub-issues API is 404) feed `check.planningConsistency`.
- `reconcile`: for a merged PR into the default branch, `reconcilePlan` over the closing targets and the linked TRDs, one `PATCH issues/{n} {state: closed, state_reason: completed}` per open one, then one `<!-- devflow:reconcile -->` comment on the PR (none when nothing was closed). Unmerged or other-base PRs make no gh call at all. A re-run finds nothing open and writes nothing.
- Closed `pull_request` events and any other event exit 0 without posting and without a gh call. Missing or unreadable event, unknown check name, a throwing gh seam and an offline outage are each exit 1 with no throw.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: event handling, linked-issue and status posting (tests 1-4, 8-9) | `node --test <abs>/gh-check-cli.test.cjs <abs>/gh-seam.repo.test.cjs` | 0 (29 pass) | PASS |
| 2: planning-consistency and reconcile (tests 5-7) | `node --test <abs>/gh-check-cli.test.cjs <abs>/gh-hierarchy.test.cjs <abs>/gh-seam.repo.test.cjs` | 0 (75 pass) | PASS |

## Task Commits

1. Task 1 RED: `9827b2e4` test(50-08): check runner - linked-issue statuses
2. Task 1 GREEN: `7d93ebfe` feat(50-08): Actions runner posts devflow/linked-issue
3. Guard registration (Rule 3): `40620cd2` test(50-08): register gh-check-cli.cjs in the gh seam guard
4. Task 2 RED: `cdf0cdd9` test(50-08): check runner - planning-consistency and reconcile
5. Task 2 test correction: `bd3f545f` test(50-08): count only the runner's own gh calls in the reconcile tests
6. Task 2 GREEN: `f98f2fdd` feat(50-08): Actions runner - planning-consistency and merge-time reconcile

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test <abs>/gh-check-cli.test.cjs` | 0 (38 pass) | PASS |
| regression | `node --test <abs>/gh-seam.repo.test.cjs <abs>/gh-hierarchy.test.cjs` plus gh-check.test.cjs and planning-writes.repo.test.cjs | 0 (157 pass incl. the 38 above) | PASS |
| repo guards | `node --test "<abs>/lib/*.repo.test.cjs"` | 0 (58 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test <abs>/gh-check-cli.test.cjs` | 1 (Cannot find module ./gh-check-cli.cjs) | FAIL (correct) |
| GREEN (Task 1) | `node --test <abs>/gh-check-cli.test.cjs` | 0 (20 pass) | PASS (correct) |
| RED (Task 2) | `node --test <abs>/gh-check-cli.test.cjs` | 1 (17 of 38 fail: unknown check `planning-consistency` / `reconcile`; the 20 Task 1 tests still pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test <abs>/gh-check-cli.test.cjs <abs>/gh-hierarchy.test.cjs <abs>/gh-seam.repo.test.cjs` | 0 (75 pass) | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (SC3 failing status plus exit 1 = test 1; `Closes #N` success = test 2; merge_group group-sha status = tests 4-4d and 6e; config at head via contents plus linked TRDs via sub-issues and task-list fallback = tests 5-6f; reconcile closes stragglers as completed with one comment and nothing when unmerged = tests 7-7g; gh-seam green and error status plus exit 1 = tests 8-8d and the seam gate)
- Gate failures: None

## Decisions Made

See key-decisions. Beyond the TRD's literal text:

- Reconcile is skipped for a PR merged into a non-default base, and the objective issue is found by label scan when the PR does not close it (rationale above). Both are small additions inside the owned files.
- The runner never reads the caller's checkout and never calls `requireEnabled`; it requires `./gh-hierarchy.cjs` lazily, so `linked-issue` does not load the store modules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New gh-*.cjs module tripped the gh seam guard**
- **Found during:** Task 1 (running the seam gate after GREEN)
- **Issue:** `gh-seam.repo.test.cjs` test 23 requires every `gh-*.cjs` module in `lib/` to be listed in `GUARDED`; `gh-check-cli.cjs` was not. The file is not in the TRD's `files_modified`.
- **Fix:** Added `gh-check-cli.cjs` to `GUARDED` only. It is deliberately not in `NO_DIRECT_WRITE`: it posts statuses and closes issues through `ghWrite` because the Actions runner has no outbox.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs`
- **Commit:** `40620cd2`
- **Merge note:** other TRDs that add `gh-*.cjs` modules edit the same array; keep both entries on a textual conflict.

**2. [Test correction] Reconcile tests counted the fake's PR seeding as runner writes**
- **Found during:** Task 2 GREEN (3 of the 17 RED tests still failed)
- **Issue:** opening a PR in the fake (`POST pulls`) is itself a logged write, so `fake.writes()` and `fake.calls()` assertions included setup. This was a test bug, not an implementation defect.
- **Fix:** tests mark a baseline after seeding and assert only on what the runner did afterwards.
- **Commit:** `bd3f545f`

**3. [Scope note] linkedNumbers export in gh-hierarchy.cjs**
- The TRD anticipates this ("export it if not exported"); it is the only change to that file, one line in `module.exports`. gh-hierarchy tests are unchanged and green.

## Issues Encountered

None.

## Next Objective Readiness

50-10 (workflow template) can run `node <devflow>/plugins/devflow/devflow/bin/lib/gh-check-cli.cjs <linked-issue|planning-consistency|reconcile>` with `GH_TOKEN` set to the App token or `GITHUB_TOKEN` with `statuses: write` (and `issues: write`, `pull-requests: write` for `reconcile`). On the runner the gh write pacing and budget are in memory only, so no state dir is needed; `DEVFLOW_GH_CACHE_DIR` is only a test setting. 50-09's ruleset should take both context names from `CONTEXTS`.

Known limits, for 50-10 / 50-12:

- Required-context matching through `workflow_call` is by status context name and was never tested against real GitHub (research Open Question 2, not testable offline). The fake only proves the status is posted on the right sha with the right context.
- `reconcile` closes issues with the workflow's token; the same token needs `issues: write`. A 403 is listed and exits 1.
- A repository whose objective issue lacks the `github.labels.objective` label AND is not closed by the PR cannot have it found by the scan, and the check then fails with "objective issue not found" (a failure either way).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-check-cli.cjs, gh-check-cli.test.cjs, gh-hierarchy.cjs (linkedNumbers export), gh-seam.repo.test.cjs (guard entry), all committed (`git status` clean)
- FOUND commits: 9827b2e4, 7d93ebfe, 40620cd2, cdf0cdd9, bd3f545f, f98f2fdd (`git log c178a723..HEAD`)
