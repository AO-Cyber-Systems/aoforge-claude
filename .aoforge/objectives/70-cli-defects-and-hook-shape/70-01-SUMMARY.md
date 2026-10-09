---
objective: 70-cli-defects-and-hook-shape
job: "01"
trd: "01"
subsystem: df-tools
tags: [df-tools, state, verify, objective-job-index, tdd, TOOL-07]

requires:
  - objective: 69-planning-writes-and-health
    provides: planning draft/summary verbs and the requirements-agreement scan the executor publishes through
provides:
  - "`state update-progress` updates a bold or plain Progress line, inserts one under `## Current Position`, or exits 1"
  - "`verify trd-pre` resolves an objective from any directory inside the project, or from a path argument, and exits 1 when it is not found"
  - "`objective-job-index` reports a boolean `gap_closure` on every job, which `execute-objective --gaps-only` filters on"
affects: [70-03-dogfood-and-docs, execute-objective, job-checker]

tech-stack:
  added: []
  patterns:
    - "decide the outcome before the first write: an error path leaves STATE.md and state.json untouched"
    - "walk-up resolution local to one command via the exported estimate-run-store.findProjectRoot"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs
    - plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/state.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/workflows/execute-objective.md

key-decisions:
  - "setProgressLine is a pure exported helper: bold (file-wide, unchanged) then plain (scoped to ## Current Position) then insertion; null means nowhere to put the line and the command exits 1"
  - "verify trd-pre walks up with findProjectRoot only inside its own resolveTarget; findObjectiveInternal and normalizeObjectiveName (about 20 callers) are untouched"
  - "project_root is added to the not-found result only; the success JSON that the 48-03 characterization test pins is unchanged"

requirements-completed: [TOOL-07]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 11min
completed: 2026-10-08
tokens_input: 13474755
tokens_output: 60501
tokens_cache_read: 13262461
tokens_cache_write: 212110
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 70: CLI defects and hook shape, TRD 01 Summary

**`state update-progress`, `verify trd-pre` and `objective-job-index` no longer report success while doing nothing: update-or-exit-1, resolve from anywhere in the project, and a real `gap_closure` boolean.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-08T18:40:41Z
- **Completed:** 2026-10-08T18:51:17Z
- **Tasks:** 3 (6 commits: RED then GREEN per task)
- **Files modified:** 8 (3 created, 5 modified) plus this SUMMARY

## Accomplishments

- `state update-progress` now rewrites a plain template line (`Progress: [░░░░░░░░░░] 0%`) in `## Current Position`, or inserts `**Progress:** <bar>` after that section's last non-blank line (before any following heading of any level) when there is none, as this repository's STATE.md has. A second run updates the inserted line in place. With neither a Progress line nor the heading, or with no STATE.md in local mode, it exits 1 with an `Error:` line and writes neither STATE.md nor state.json.
- `verify trd-pre` resolves from the project root, any directory below it, or a path argument (relative or absolute, trailing slash allowed). A not-found objective exits 1 with `error: "Objective not found"` and `project_root` (with `--raw`, `Objective not found`). Requirement coverage reads the root ROADMAP.md. Read-only check against the live tree: `--cwd .planning/objectives/64-estimate-accuracy-validation verify trd-pre 64 --raw` prints `valid — 5/5 dimensions passed`.
- `objective-job-index` puts a boolean `gap_closure` on every job. Against the live tree, objective 64 reports `true` for 64-07 to 64-10 and `false` for 64-01 to 64-06. `workflows/execute-objective.md` `discover_and_group_plans` now names `jobs[]` (it said `plans[]`) with `gap_closure`, and the `--gaps-only` filter reads that field.

## Task Commits

1. **Task 1: state update-progress** - RED `573fbb08`, GREEN `817d0af9`
2. **Task 2: verify trd-pre resolution** - RED `a3430a8c`, GREEN `94178b35`
3. **Task 3: objective-job-index gap_closure** - RED `90d21bc6`, GREEN `3ce2a1bf`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: state update-progress | `node --test lib/state-update-progress.test.cjs lib/state.test.cjs lib/state-advance-job.test.cjs` (66 tests) | 0 | PASS |
| 2: verify trd-pre | `node --test lib/trd-pre-check.test.cjs lib/estimate-run-store.test.cjs` (119 tests) | 0 | PASS |
| 3: objective-job-index | `node --test lib/misc-job-index.test.cjs lib/summary-pairing.test.cjs lib/objective.test.cjs` (71 tests) and `bin/df-tools.test.cjs` (153 tests) | 0 | PASS |

## TDD Evidence

| Phase | Task | Command | Exit Code | Expected |
|---|---|---|---|---|
| RED | 1 | `node --test lib/state-update-progress.test.cjs` (15 fail: `updated: false`, `setProgressLine is not a function`) | 1 | FAIL (correct) |
| GREEN | 1 | same, plus state.test.cjs 2c and 6c untouched | 0 | PASS (correct) |
| RED | 2 | `node --test lib/trd-pre-check.test.cjs` filtered to the new describe and the tightened not-found test (10 fail: `Objective not found` from a nested cwd, exit 0) | 1 | FAIL (correct) |
| GREEN | 2 | `node --test lib/trd-pre-check.test.cjs lib/estimate-run-store.test.cjs` | 0 | PASS (correct) |
| RED | 3 | `node --test lib/misc-job-index.test.cjs` (3 fail: `gap_closure` undefined) | 1 | FAIL (correct) |
| GREEN | 3 | `node --test lib/misc-job-index.test.cjs lib/summary-pairing.test.cjs lib/objective.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` as in Task Evidence | 0 | PASS |
| test (full suite) | `npm test` (11,433 tests: 11,372 pass, 50 skipped, 11 fail) | 1 | PASS for this TRD: all 11 failures are outside it, see Issues Encountered |

## Decisions Made

- `setProgressLine` handles the empty-section case (`## Current Position` straight into the next heading) by writing a blank line on both sides of the new line, so the result reads as a normal paragraph rather than gluing the Progress line to the next heading. The TRD pseudocode left the trailing newline of that case open.
- `resolveTarget` is exported beside `cmdVerifyTrdPre` so the path-versus-name rule can be tested without spawning a process.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Legacy JOB file cannot share an objective with TRD files**
- **Found during:** Task 3 RED
- **Issue:** Test-list cases 17 and 18 put `07-04-JOB.md` in the same objective as three TRDs and expect the job index to list four jobs and select `['07-01-a', '07-04']`. `helpers.findPlanFiles` returns TRD files when any exist and JOB files only when there are none, so the JOB file is never indexed and the expectation can never hold. Changing `findPlanFiles` is out of scope (many callers).
- **Fix:** The legacy JOB files moved to their own objective `08-legacy` (`08-01-JOB.md` with `gap_closure: true`, `08-02-JOB.md` without the key). Case 17 asserts the key and the boolean type on all five jobs; case 18 asserts the `--gaps-only` selection is `['07-01-a']` for the TRD objective and `['08-01']` for the legacy one. The test header explains why.
- **Files modified:** plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs
- **Verification:** `node --test lib/misc-job-index.test.cjs` exits 0
- **Commit:** `90d21bc6`

**2. [Rule 1 - Spec gap] The "one-line JSDoc above cmdStateUpdateProgress" did not exist**
- **Found during:** Task 1 GREEN
- **Issue:** The TRD said to update the one-line JSDoc above the function; there was none.
- **Fix:** Added a one-line comment stating the update-or-insert-or-exit-1 behaviour.
- **Files modified:** plugins/devflow/devflow/bin/lib/state.cjs
- **Commit:** `817d0af9`

**Total deviations:** 2 auto-fixed (one Rule 3, one trivial doc gap). **Impact:** none on behaviour or scope.

## Issues Encountered

`state.test.cjs` was not edited; its 2c and 6c characterization tests pass unchanged. The full-suite run in this worktree had 11 failures, none touching the three commands changed here:

- **10 daemon failures (known worktree-only).** `devflow-watch.test.cjs` (5: foreground start, refuse-when-running, stale PID, multi-project C-1 and C-2) and `handoff-e2e.test.cjs` (6 including LK-1 and LK-2): the `devflow-watch` daemon never writes its PID file when launched from this worktree path. Re-run alone in the worktree: the same 5 fail. The same file run from the main checkout at the base commit: 22/22 pass. This is the "known worktree-only daemon failure" the TRD names for the 70-03 baseline.
- **1 transient reconcile failure.** `roadmap-reconcile.test.cjs` E2E1 ("reconcile dry-run against this repo ROADMAP shows zero drift") reported one drift: the ROADMAP line `- [ ] 70-01-cli-defects-TRD.md` while this TRD's checkpoint SUMMARY already existed. It is the expected mid-run state; `roadmap update-job-progress 70` ticked the line (`trd_checkboxes_ticked: 1`), and E2E1 passes when re-run afterwards.

`state update-progress` was deliberately NOT run against the live `.planning/` (TRD gotcha and the dispatch's worktree protocol): this repository's STATE.md has no Progress line, so the new insertion path would have written one. 70-03 dogfoods it on a scratch copy. The executor's usual `state update-progress` step was therefore skipped.

## Discovered commands

None. The stack profile (`.planning/STACK.md`) supplied `npm test` and `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (state: plain, insert, exit 1 on no heading or no file, bold and store unchanged; trd-pre: nested cwd, path argument, not-found exit 1; job-index: boolean gap_closure)
- Gate failures: none in this TRD's scope. The full suite's 10 devflow-watch / handoff-e2e daemon failures are worktree-only and unrelated; the one reconcile failure cleared after `roadmap update-job-progress`.

## Next Phase Readiness

- 70-03 can dogfood `state update-progress` on a scratch copy of this repository's STATE.md; the live `.planning/` was not touched by this TRD.
- Workflows that call `state update-progress` (execute-objective wave regeneration, execute-trd, transition) now see exit 1 instead of a silent no-op when STATE.md has no Current Position heading; none of this repository's STATE.md shapes hit that path.

## Progress
- [x] Task 1: Fixture builders, then `state update-progress` updates, inserts or exits 1 — RED 573fbb08, GREEN 817d0af9
- [x] Task 2: `verify trd-pre` resolves the objective from anywhere inside the project, and not-found exits 1 — RED a3430a8c, GREEN 94178b35
- [x] Task 3: `objective-job-index` reports `gap_closure` from frontmatter, and execute-objective reads it — RED 90d21bc6, GREEN 3ce2a1bf

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs, state-update-progress.test.cjs, misc-job-index.test.cjs (all three created files)
- FOUND commits: 573fbb08, 817d0af9, a3430a8c, 94178b35, 90d21bc6, 3ce2a1bf
- `rg "updated: false"` has no hit inside `cmdStateUpdateProgress`; `findProjectRoot(` is in trd-pre-check.cjs; `gap_closure:` is in misc.cjs
- `state.test.cjs` unchanged (`git diff` against the base shows no change)
