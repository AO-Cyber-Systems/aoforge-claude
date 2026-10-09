---
objective: 68-milestone-and-objective-verbs
job: "04"
subsystem: df-tools
tags: [objective-remove, objective-complete, renumber, next-objective, roadmap-sections]

requires:
  - objective: 68-milestone-and-objective-verbs
    provides: "68-02: helpers.parseObjectiveDirName / canonicalObjectiveNumber and milestone-scope.roadmapSections"
provides:
  - "objective.renumberRoadmapText (the pure, bounded ROADMAP renumber pass of objective remove)"
  - "objective.nextObjective (one next-objective lookup over directories and ROADMAP sections, local and store mode)"
affects: [68-07, objective remove, objective complete, objective set-status complete]

tech-stack:
  added: []
  patterns: ["bounded NN-MM reference rule (lookbehind and lookahead) instead of masking dates", "directory form wins over ROADMAP section form for the same number"]

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/objective-renumber-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs
    - plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs

key-decisions:
  - "The TRD-reference rule is (?<![\\w.-])NN-(\\d{2})(?!\\d|-\\d): dates (2026-03-15, 03-15-2026), versions (v1.18-01), ticket ids (AUTH-18-01) and glued tokens no longer match; 18-01, `18-01-slug-TRD.md`, /18-01-, (18-01) and 18-01's still renumber. Prose ranges stay out of scope."
  - "nextObjective picks the numerically smallest later number (parseFloat) over current objective directories and ROADMAP sections; a cancelled directory removes its number; the directory's spelling ('05') wins over the section's ('5') for the same number."

requirements-completed: [TOOL-03, TOOL-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-08
tokens_input: 6287032
tokens_output: 49948
tokens_cache_read: 6166961
tokens_cache_write: 119963
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 04: objective remove keeps dates; objective complete sees ROADMAP-only objectives Summary

**`objective remove` renumbers with a bounded TRD-reference rule that cannot match inside a date, and `objective complete` (local and store mode) takes the next objective from directories and `### Objective M:` sections in number order through one `nextObjective` lookup.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-08T16:38:51Z
- **Completed:** 2026-10-08T16:48:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Progress
- [x] Task 1: Fixture builders for dated ROADMAPs and next-objective projects — a85acf07
- [x] Task 2: The renumber pass leaves dates and metadata alone (tests 1-7) — RED 6baf8408, GREEN 8d1057e6
- [x] Task 3: One next-objective lookup over directories and ROADMAP sections (tests 8-15) — RED 5cccf0bd, GREEN 917e8d8d

## Accomplishments

- `renumberRoadmapText(text, removedInt)` is the old inline loop of `cmdObjectiveRemove` moved out unchanged (same ascending order, same rules) except the TRD-reference rule, now `(?<![\w.-])NN-(\d{2})(?!\d|-\d)`. Removing objective 1 no longer turns `2026-03-15` into `2025-02-15` (the 59-05 reproduction), and an objective numbered 26 no longer rewrites every `2026-` date. Statuses, plan counts, milestone cells, `**Requirements**` lines, `Shipped:` lines, `03-15-2026` and `AUTH-03-01` are byte-identical after a renumber.
- `nextObjective(root, objectiveNum)` reads current objective directories (through `parseObjectiveDirName` + `objectiveDirMatches`) and the ROADMAP.md sections (`roadmapSections`), drops cancelled directories, and returns the smallest later number. `cmdObjectiveComplete` and `storeObjectiveComplete` both call it; `nextObjectiveDir` and the inline scan are gone. A later objective that exists only in ROADMAP.md now yields `is_last_objective: false` and moves a legacy STATE.md to `Ready to plan` instead of `Milestone complete`. `99-y` now precedes `100-z`.
- Pending todo `objective-complete-next-objective.md` is resolved by this TRD (68-07 completes the todo).
- Hand-built fixture module with `datedRoadmap`, `datedProject`, `isoDates` and `LEGACY_STATE`.

## Task Commits

1. Task 1: `a85acf07` test(68-04): dated ROADMAP and next-objective fixtures
2. Task 2: `6baf8408` test (RED), `8d1057e6` fix (GREEN)
3. Task 3: `5cccf0bd` test (RED), `917e8d8d` fix (GREEN)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "...datedRoadmap(...); console.log(f.isoDates(t).length>=4, t.includes('\| 26. Z \|'))"` printed `true true` | 0 | PASS |
| 2: renumber | `node --test objective-remove-renumber.test.cjs objective.test.cjs objective-change-flags.test.cjs` (68 tests) | 0 | PASS |
| 3: next objective | `node --test objective-complete-next.test.cjs objective-remove-renumber.test.cjs objective.test.cjs objective-change-flags.test.cjs planning-verbs-cli.test.cjs` (90 tests) | 0 | PASS |
| 3: no second scan | `rg -n "nextObjectiveDir" objective.cjs` | 1 (no matches, as required) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test plugins/devflow/devflow/bin/lib/objective-remove-renumber.test.cjs` | 1 (tests 1-4 failed on `2025-02-15`-style rewritten dates, 6 and 6b on `renumberRoadmapText` missing; 5 and 7 passed as controls) | FAIL (correct) |
| GREEN (task 2) | the three scoped suites | 0 (68 pass) | PASS (correct) |
| RED (task 3) | `node --test plugins/devflow/devflow/bin/lib/objective-complete-next.test.cjs` | 1 (tests 8, 11, 12, 13, 14, 15 failed; 9 and 10 passed as controls) | FAIL (correct) |
| GREEN (task 3) | the five scoped suites | 0 (90 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test objective-remove-renumber objective-complete-next objective objective-change-flags` (+ planning-verbs-cli) | 0 | PASS |
| test (full) | `npm test` | 1 | 11 failures, none in files this TRD touches (see below); PASS for this TRD |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

Full suite: baseline before any change 11244 tests, 10 fail; after the change 11260 tests (+16 new), 11 fail. All failures are outside this TRD's files:
- Ten `devflow-watch` daemon / handoff tests (foreground start/stop, multi-project CLI, handoff pipeline end-to-end, LK-1, LK-2) time out in this environment. The set of daemon tests that fail varies per run (baseline: "start cleans up stale PID file"; after: C-1 and C-2 multi-project start), which is the known environment instability.
- `E2E1` (roadmap-reconcile.test.cjs) reports the unticked `68-04` TRD line in ROADMAP.md while its SUMMARY exists; it failed in the baseline too (after the first checkpoint) and clears when `roadmap update-job-progress` ticks the line.

## Decisions Made

- Bounded rule instead of masking dates (as the TRD required): the lookbehind blocks word characters, `.` and `-` before the reference, and the lookahead blocks a digit or `-<digit>` after it.
- A directory like unpadded `4-d` or hyphen-less `04x` is no longer a next-objective candidate (it is not an objective directory for `find-objective` either), the same alignment 68-02 made in milestone-scope.
- A cancelled directory removes its number from the candidates even if a ROADMAP section or a second directory of that number exists.

## Deviations from Plan

None - TRD executed exactly as written. Test 5 and the negative cases of test 6 passed on the first GREEN run, so the task 2 recovery (narrowing `[\w.-]`) was not needed.

## Discovered commands

None. `npm test` and `node --test {files}` came from the stack profile.

## Issues Encountered

- Removed the now-unused `objectivesDir` constant from `cmdObjectiveComplete` (dead after the scan was replaced). The pre-existing unused `normalized` constant in the same function was left alone.

## Deferred

- Ordering of decimal objectives still uses floats (`4.10` and `4.1` compare equal, `4.10` sorts before `4.2`), as the TRD specified (`parseFloat`); the same limitation 68-02 recorded for milestone-scope. Worth a decision before a project reaches a tenth decimal insertion.
- Prose ranges (`Objectives 65-75`) are still not renumbered by `objective remove`; 68-07 records it as a known issue.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (bounded renumber keeps dates and metadata: tests 1-4, 6; the 2026 collision: tests 2, 6b; ROADMAP-only next objective incl. legacy STATE: tests 8, 14; smallest number and cancelled skip: tests 11, 13; store mode shares the lookup and objective.test.cjs / objective-change-flags.test.cjs pass unedited: test 15 and the regression run)
- Gate failures: 11 pre-existing or environment failures in the full suite (listed above)

## Self-Check: PASSED

Created files exist (`objective-renumber-fixtures.cjs`, `objective-remove-renumber.test.cjs`, `objective-complete-next.test.cjs`); commits a85acf07, 6baf8408, 8d1057e6, 5cccf0bd and 917e8d8d are in `git log`.
