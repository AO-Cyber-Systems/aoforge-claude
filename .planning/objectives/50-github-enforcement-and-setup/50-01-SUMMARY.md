---
objective: 50-github-enforcement-and-setup
trd: "01"
subsystem: test-fixtures
tags: [gh-fake, rulesets, merge-queue, issue-types, issue-fields, pr-commits, contents, hermetic-tests]

requires:
  - objective: 49-objective-branch-and-pr
    provides: "gh-fake.cjs PR records (`findPr`, `pushRef`, `openPr` shapes), statuses, the `_setRunGh` seam"
provides:
  - "gh-fake routes: repos/o/r/rulesets (GET, POST), rulesets/{id} (GET, PUT), PATCH repos/o/r (has_wiki, delete_branch_on_merge), repos/o/r/labels (GET), orgs/o/issue-types (POST) and /{id} (PUT), orgs/o/issue-fields (POST), pulls/{n}/commits (GET), contents/<path>?ref= (GET)"
  - "gh-fake options: rulesets, mergeQueueAllowed, isAdmin, orgAdmin, fieldOptionsAccepted, deleteBranchOnMerge, files, prCommits; live `rulesets`, `files`, `prCommits` on the returned fake"
  - "the 403 / 422 / 400 refusals setup and the check runner must degrade on"
affects: [50-08 check-runner, 50-09 setup-read, 50-11 setup-apply, 50-12 e2e]

tech-stack:
  added: []
  patterns:
    - "add the shape to the fake, never stub it in a test: every new route and refusal has a gh-fake.test.cjs case, and an unmodelled argv or repo field is still a loud `[gh-fake] unsupported`"
    - "write routes copy the options arrays they mutate (`typeDefs`, `fieldDefs`), so one test's POST never leaks into another fake built from the same literal"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs

key-decisions:
  - "Refusal order is 404 (wrong owner/org/repo) then 403 (admin) then 400 (api-version header) then 422 (body), as GitHub checks them; a bare 403 carries no rate-limit wording so gh-client never retries it"
  - "The merge_queue 422 is `invalid('Ruleset','invalid','rules')`, whose stderr is exactly `gh: Validation Failed (HTTP 422)` as the TRD specifies, on POST and on PUT, and a refused write stores nothing"
  - "`mergeQueueAllowed` (may a ruleset ask for a queue) is a separate option from the existing `mergeQueue` (does the branch have one, the GraphQL probe); the two are documented side by side"
  - "`permissions.admin` is `push && isAdmin`, so every existing fake (isAdmin defaults true) is unchanged and a non-admin token sees admin:false"
  - "An unmodelled repo PATCH field is a loud `[gh-fake] unsupported` rather than a quiet ignore, so setup code cannot believe it set something the fake dropped"

patterns-established:
  - "Contents are served like GitHub: base64 wrapped at 60 columns with a trailing newline, a real git blob sha, 404 for an unseeded ref, path or directory"

requirements-completed: [GEN-04, GEN-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-01
tokens_input: 6214854
tokens_output: 74562
tokens_cache_read: 6034225
tokens_cache_write: 180529
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 50: GitHub Enforcement and Setup, TRD 01: Fake GitHub setup and check routes Summary

**The fake GitHub now answers every endpoint objective 50's setup and required checks use (rulesets with a merge-queue 422, repo PATCH, labels, org issue-type and issue-field writes behind the 2026-03-10 header, PR commits, file contents), including the 403, 422 and 400 refusals, with a test case per shape and no production code.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-10-01T17:10:28Z
- **Completed:** 2026-10-01T17:25:40Z
- **Tasks:** 2 (both TDD, 4 commits)
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- Rulesets: `POST`/`GET` list (summaries) / `GET` by id (full object) / `PUT` (patches only the named fields). Ids start at 9001, name and enforcement are required, a name is unique, and a `merge_queue` rule is refused with `gh: Validation Failed (HTTP 422)` under `mergeQueueAllowed:false` on both POST and PUT, storing nothing.
- Admin gating: `isAdmin:false` makes every ruleset write and `PATCH repos/o/r` a 403 while reads still work; `orgAdmin:false` does the same for the org writes.
- `PATCH repos/o/r {has_wiki, delete_branch_on_merge}` is reflected by the next `GET repos/o/r`; `GET repos/o/r/labels` lists what `gh label create` made, with colour and description.
- Org writes: `POST orgs/o/issue-types` (id `IT_<n>`, joins the list `issue.type` resolves against), `PUT .../{id}` (enables a disabled seeded type), `POST orgs/o/issue-fields` (400 without `X-GitHub-Api-Version: 2026-03-10`, 422 for `options` when `fieldOptionsAccepted:false`, the row joins `fieldDefs` so issue-field-values accepts its id). A User owner or another org is still 404.
- `GET pulls/{n}/commits` (seeded `prCommits`, paginated like any list) and `GET contents/<path>?ref=` (seeded `files`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: repository-level routes (tests 1-5, 9) | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 | PASS (75 tests, 7 new) |
| 2: org writes, PR commits, contents (tests 6-8) | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs plugins/devflow/devflow/bin/lib/gh-capability.test.cjs` | 0 | PASS (156 tests; gh-fake alone is now 78, 10 new) |

All paths above were run as absolute paths into the worktree (see deviation 2).

## Task Commits

1. **Task 1: repository-level routes** - `81bb0eba` (test, RED), `49c84df3` (feat, GREEN)
2. **Task 2: org writes, PR commits, contents** - `f1d6e168` (test, RED), `e35a015f` (feat, GREEN)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` | 0 | PASS (78 tests) |
| regression | `node --test` over all 27 test files that require `gh-fake.cjs` (includes `gh-capability` and `gh-outbox-flush`) | 0 | PASS (1077 tests, 0 failed, 4 skipped) |
| repo seam | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 | PASS (19 tests) |

The 4 skips are the live-network `L1-L4 (01-06)` cassette tests, which skip by design and predate this TRD (the same 4 skip in the unmodified base).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern "50-01 setup routes" .../gh-fake.test.cjs` | 1 | FAIL (correct): 7 of 7 failed, every route answered `[gh-fake] unsupported` or an option did not exist |
| GREEN (Task 1) | `node --test .../gh-fake.test.cjs` | 0 | PASS (correct): 75 of 75 |
| RED (Task 2) | `node --test --test-name-pattern "50-01 setup routes" .../gh-fake.test.cjs` | 1 | FAIL (correct): tests 6, 7, 8 failed on `unsupported`; the 7 Task 1 tests and the regression-guard test 9 still passed |
| GREEN (Task 2) | `node --test .../gh-fake.test.cjs .../gh-capability.test.cjs` | 0 | PASS (correct): 156 of 156 |

## Post-TRD Verification

- **Auto-fix cycles used:** 0 (both GREEN steps passed on the first run)
- **Must-haves verified:** 4/4 (the route list and options; the 422 / 403 / 403 refusals; the 400 / 422 issue-field rules; a case per shape and `[gh-fake] unsupported` still firing)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs` - the routes, options and header documentation described above; `typeDefs` copy of `types`, `wikiEnabled` / `deleteOnMerge` mutable settings, a shared `repoOk()` payload, `rulesets` / `files` / `prCommits` exposed live
- `plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` - `describe('50-01 setup routes')`, tests 1, 1b, 2, 3, 4, 5, 6, 7, 8, 9

## Decisions Made

See key-decisions. Beyond the TRD's literal list, the fake also enforces a few shapes real GitHub enforces so a bad setup payload fails in the fake rather than in production. These are my reading of GitHub's behaviour and were NOT checked against the live API (no network was used): a ruleset needs `name` and `enforcement` (`disabled|active|evaluate`) and a duplicate name is 422; an issue type needs `name` and `is_enabled` and a duplicate name is 422; an issue field needs `name` and a `data_type` of `text|date|single_select|multi_select|number` (from 50-RESEARCH) and a duplicate name is 422; unspecified `description`, `color` and `visibility` read back as `null`. If a later TRD finds the real API disagrees, fix it in the fake and its test together.

## Deviations from Plan

### Auto-fixed Issues

None - the two tasks were implemented as written. Additions beyond the TRD are listed under Decisions Made and are all inside the two owned files.

### Process corrections

**1. [Process] Preflight first ran from the main checkout and took a wrong claim**
- **Found during:** preflight
- **Issue:** `exec-context check` was first run with the shell's default cwd (the main checkout), so it reported `checkout: /Users/justin/dev/devflow-claude` and claimed that checkout for plan 50-01. Another plan id checking in on the main checkout would then have been refused with a false SHARED INDEX.
- **Fix:** Released only that claim (`exec-context release --repo <main> --id 50-01`, which clears claims held by 50-01 only), then re-ran the check with `--cwd <worktree>`: checkout is the worktree, branch `df/exec-50-01`, `is_worktree: true`, base visible. No work was done before the correct check. The dispatch's example command does not pass `--cwd`, so other executors may hit the same thing (50-02 reports the same).

**2. [Process] Two regression runs initially exercised the unmodified main checkout**
- **Found during:** Task 2 regression run
- **Issue:** The 27-suite regression command was first given relative `plugins/...` paths. The shell's cwd is the main checkout, so those runs tested the base commit, not my changes. This was caught because the total stayed at 1067 tests after Task 2 added 3.
- **Fix:** Re-ran the whole set with absolute worktree paths: 1077 tests (1067 + my 10), 0 failed. Only the corrected run is reported as evidence above. The main checkout was confirmed unmodified by those runs (`git status` shows only the pre-existing untracked files and sibling SUMMARYs).

---

**Total deviations:** 2 (both process corrections, no code impact)
**Impact on plan:** None on the deliverable. Note for later TRDs: always pass absolute worktree paths to `node --test`, and `--cwd <worktree>` to df-tools.

## Issues Encountered

None beyond the deviations above.

## Notes for downstream TRDs

- **Rule parameters are not enforced.** 50-RESEARCH Pitfall 5 says a `pull_request` rule POST is 422 without its four booleans plus count, and a `merge_queue` rule needs all 7 parameters. The TRD did not ask for that and the fake accepts any `parameters`. 50-09 / 50-11 should assert their ruleset payload shape in their own tests (or a later change can add the enforcement here).
- **`merge_queue` refusal is plan-wide, not per-branch.** `mergeQueueAllowed:false` refuses the rule on every ruleset; setup's "retry without `merge_queue`, report degraded, exit 0" path is exercised by POSTing again with the rule removed.
- **Creating a PR for `prCommits` needs a pushed ref.** `GET pulls/{n}/commits` is 404 until the PR exists; open it with `fake.pushRef(branch, sha)` then `POST repos/o/r/pulls`, as the 49-01 tests do, then seed `fake.prCommits[n]` or pass `prCommits` at construction.
- **Not modelled (still `unsupported`):** `DELETE` of a ruleset, `GET .../rules/branches/{branch}`, `PUT` of file contents, `DELETE` of an issue type.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- Modified files exist and carry the work: `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs`, `plugins/devflow/devflow/bin/lib/gh-fake.test.cjs` (tests ran against them).
- Commits exist on `df/exec-50-01` (confirmed with `git log --oneline 45418c68..HEAD`): `81bb0eba`, `49c84df3`, `f1d6e168`, `e35a015f`.
