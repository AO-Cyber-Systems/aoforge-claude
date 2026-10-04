---
objective: 50-github-enforcement-and-setup
trd: "03"
subsystem: github-enforcement
tags: [github, required-checks, closing-references, merge-queue, pure-functions, node-test]

requires:
  - objective: 49-objective-branch-and-pr
    provides: devflow:pr= marker, the Closes #N section of the objective PR body, the Refs #N commit paragraph
provides:
  - "lib/gh-check.cjs: CONTEXTS, parseClosingRefs, prNumberFromQueueRef, linkedIssue, planningConsistency, reconcilePlan (all pure)"
  - "Resolution of research Open Question 1: planning-consistency validates the GitHub issue graph, never .planning/ files"
  - "Four hand-written event fixtures under __fixtures__/gh-events/"
affects: [50-08 runner, 50-09 ruleset, 50-10 workflow template]

tech-stack:
  added: []
  patterns:
    - "Pure check functions over plain data; the runner owns all IO and posts the returned {state, description, details} as a commit status"
    - "issues passed as Map<number, issue|null>: null = 404, absent = never fetched (both a named failure)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-check.cjs
    - plugins/devflow/devflow/bin/lib/gh-check.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-closes.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-no-closes.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/pull_request-merged.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-events/merge_group.json
  modified:
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "A counted closing reference that is dead (404) or a pull request fails linked-issue even beside a good one: strict reading of 'unresolvable refs are failures, named'"
  - "linked-issue fails when the default branch is unknown rather than passing blind"
  - "The objective issue is searched among every resolved issue (body marker devflow:id=<id>, kind null), not only closing targets, so a forgotten Closes line is named instead of reported as 'no objective issue'"
  - "reconcilePlan takes issue objects ({number, state}) for both targets and linked, since it must read state; planningConsistency accepts numbers or issue objects for linked"

patterns-established:
  - "Contexts are one frozen constant (CONTEXTS) shared by ruleset, runner and workflow test"

requirements-completed: [GEN-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-10-01
---

# Objective 50 TRD 03: the required-check logic Summary

**Pure, fixture-tested logic for `devflow/linked-issue`, `devflow/planning-consistency` and the merge-time reconcile plan: closing-reference parsing that ignores fences, comments and foreign repos, and a store-mode consistency check that reads the GitHub issue graph instead of the untracked `.planning/` files.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-01T17:10:56Z
- **Completed:** 2026-10-01T17:16:28Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `parseClosingRefs` counts close/fix/resolve in every tense and case, with optional colon, for `#N`, `<owner>/<repo>#N` and issue URLs. Refs aimed at another repo are reported as foreign and never counted. Fenced code and HTML comments are ignored, so the `devflow:pr` and managed-section markers in a real objective PR body do not disturb the `Closes` lines between them. `Refs #N` is not a closing reference.
- `linkedIssue` fails a PR with no counted closing reference, a base that is not the default branch, or a reference that is a 404, never fetched, or a pull request. `Refs #N` commit paragraphs are reported as `refs_seen` and never required.
- `planningConsistency` settles research Open Question 1. Store mode off or no `devflow:pr=` marker passes with a stated reason, so a required check never hangs. For an objective PR it requires the default-branch base, the objective issue closed, every linked TRD issue closed, and nothing closed as `not_planned`, one named line per violation.
- `reconcilePlan` returns the open closing targets plus open linked TRDs of a merged PR only. Project -> Done is out of scope (built-in "Item closed" workflow; GITHUB_TOKEN cannot reach Projects v2).
- `prNumberFromQueueRef` maps `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>` to `<n>`, including bases with slashes.
- `CONTEXTS` is a frozen constant, the one source for 50-08, 50-09 and 50-10.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: closing refs and linked-issue (tests 1-3, 7) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs` | 0 (38 pass) | PASS |
| 2: planning-consistency and reconcile plan (tests 4-6, 8) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (186 pass) | PASS |

## Task Commits

1. Task 1 RED: `d118d899` test(50-03): linked-issue check logic
2. Task 1 GREEN: `2fbd51bd` feat(50-03): pure linked-issue check
3. Task 2 RED: `1242ec17` test(50-03): planning-consistency and reconcile plan
4. Task 2 GREEN: `071cc492` feat(50-03): planning-consistency check and reconcile plan
5. Guard registration (Rule 3): `85c48ab4` test(50-03): register gh-check.cjs in the gh seam guard

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs` | 0 (72 tests incl. fixtures) | PASS |
| repo guards | `node --test "plugins/devflow/devflow/bin/lib/*.repo.test.cjs"` | 0 (58 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs` | 1 (Cannot find module ./gh-check.cjs) | FAIL (correct) |
| GREEN (Task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs` | 0 (38 pass) | PASS (correct) |
| RED (Task 2) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs` | 1 (planningConsistency / reconcilePlan is not a function; 38 prior tests still pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/gh-check.test.cjs plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (186 pass) | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (each truth maps to a passing test: linkedIssue failures and pass, planningConsistency store-off and no-marker, objective-PR failures, reconcilePlan merged/unmerged, prNumberFromQueueRef)
- Gate failures: None

## Decisions Made

- Strict reading of "unresolvable refs are failures": any dead or pull-request reference among the counted ones fails linked-issue, even beside a valid one. A dead `Closes #N` is almost always a typo; a green check would hide it. The TRD's "at least one" wording still holds for the pass condition.
- Unknown default branch is a failure, not a pass.
- The objective issue is identified from all resolved issues by body marker `devflow:id=<pr marker id>` with kind null (a comment-kind marker or a TRD id such as `50-01` never matches).
- gh-body helpers (`extractPrMarker`, `extractMarker`) are pure and dependency-free, so the error-recovery fallback (inlining the marker regexes) was not needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New gh-*.cjs module tripped the gh seam guard**
- **Found during:** Task 2 (running the repo guard suites after GREEN)
- **Issue:** `gh-seam.repo.test.cjs` test 23 requires every `gh-*.cjs` module in `lib/` to be listed in `GUARDED`; `gh-check.cjs` was not, so test 23 failed. The file is not in the TRD's `files_modified`.
- **Fix:** Added `gh-check.cjs` to `GUARDED` and to `NO_DIRECT_WRITE` (it spawns nothing and never calls `ghWrite`). Two added lines plus a comment.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs`
- **Commit:** `85c48ab4`
- **Merge note:** other wave-1 TRDs that add `gh-*.cjs` modules will edit the same two arrays; expect a trivial textual conflict to resolve by keeping both entries.

### Environment note

The first `exec-context check` ran from the main checkout (the shell cwd resets between calls) and reported SHARED INDEX against 50-02's claim. That was an invocation error, not a dispatch defect: it was re-run from the worktree with `--cwd` and passed (checkout `.df-worktrees/devflow-claude/50-03`, branch `df/exec-50-03`, base visible). 50-02's claim was left untouched.

## Issues Encountered

None.

## Next Objective Readiness

50-08 can import `gh-check.cjs` and feed it `pull_request` event fields, a `Map` of resolved issues, the PR's commits, the head's parsed `.planning/config.json` and the linked TRD set. 50-09 and 50-10 should take context names from `CONTEXTS`. Open item carried to 50-10: required-context naming through `workflow_call` still needs one real-repo check (research Open Question 2, not testable offline).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-check.cjs, gh-check.test.cjs, four gh-events fixtures, gh-seam.repo.test.cjs edit (all committed; `git status` clean)
- FOUND commits: d118d899, 2fbd51bd, 1242ec17, 071cc492, 85c48ab4 (`git log 45418c68..HEAD`)
