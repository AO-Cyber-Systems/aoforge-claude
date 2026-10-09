---
objective: 68-milestone-and-objective-verbs
job: "02"
subsystem: df-tools
tags: [milestone-scope, helpers, objective-dir-resolution, find-objective-parity]

requires:
  - objective: 56-objective-dir-matching
    provides: helpers.objectiveDirMatches / normalizeObjectiveName (the one directory-choice rule)
provides:
  - helpers.parseObjectiveDirName and helpers.canonicalObjectiveNumber
  - milestone-scope.cjs resolving objective directories only through the shared helpers
  - milestone-scope.cjs exporting roadmapSections (for 68-04's next-objective lookup)
affects: [68-04, milestone complete, estimate milestone, tokens coverage --milestone]

tech-stack:
  added: []
  patterns: ["parse proposes a number, objectiveDirMatches confirms it"]

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/milestone-scope-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/helpers.cjs
    - plugins/devflow/devflow/bin/lib/helpers.test.cjs
    - plugins/devflow/devflow/bin/lib/milestone-scope.cjs

key-decisions:
  - "A directory counts as objective N only when objectiveDirMatches(name, normalizeObjectiveName(N)) holds: 04-d is objective 4; an unpadded 4-d and a hyphen-less 04x are not, exactly as find-objective 4 cannot find them. Intended alignment (TOOL-05)."
  - "A single decimal in a milestone bullet (Objectives 4.1) is matched by its text, not its float, so 04.10-ten is not pulled into a milestone that names only 4.1. Ranges stay numeric."

requirements-completed: [TOOL-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-08
tokens_input: 5731684
tokens_output: 37370
tokens_cache_read: 5626772
tokens_cache_write: 104800
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 02: milestone-scope resolves objective directories through the shared helpers Summary

**milestone-scope.cjs lost its own directory parser (DIR_RE, canonical()): it now proposes a number with helpers.parseObjectiveDirName and confirms it with objectiveDirMatches, so `milestone complete`, `estimate milestone` and `tokens coverage --milestone` pick the directory `find-objective` picks, decimals included.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-08T16:21:01Z
- **Completed:** 2026-10-08T16:28:00Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Progress
- [x] Task 1: Fixture builder for directory-resolution projects — e5407736
- [x] Task 2: parseObjectiveDirName and canonicalObjectiveNumber in helpers.cjs — RED 9379ae9b, GREEN ab6209d6
- [x] Task 3: milestone-scope.cjs on the shared helpers — RED b656f2f9, GREEN bfe20f00

## Accomplishments
- helpers.cjs gains `parseObjectiveDirName(dirName)` (`{number, slug}` or null, on the same boundary `objectiveDirMatches` uses) and `canonicalObjectiveNumber(n)` (no leading zeros on the integer part, `'00'` -> `'0'`), both exported.
- milestone-scope.cjs resolves a directory only when `objectiveDirMatches(name, normalizeObjectiveName(number))` holds; `DIR_RE` and `canonical()` are gone, and section keys use `canonicalObjectiveNumber`. Current directories are still scanned in sorted order with the first winning, then archived ones.
- `roadmapSections` is exported for 68-04.
- Hand-built fixture module (`scopeProject`, `bulletRoadmap`) for current, archived and stray directory layouts.

## Task Commits

1. Task 1: `e5407736` test(68-02): fixtures for objective-directory resolution
2. Task 2: `9379ae9b` test (RED), `ab6209d6` feat (GREEN)
3. Task 3: `b656f2f9` test (RED), `bfe20f00` refactor (GREEN)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "...scopeProject(...); console.log(p.exists(...04.10-ten...), p.exists(...v0.9-objectives/01-a...))"` printed `true true` | 0 | PASS |
| 2: helpers | `node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs` (23 tests) | 0 | PASS |
| 3: milestone-scope | `node --test` on milestone-scope, milestone-complete, estimate-milestone, token-coverage, helpers (89 tests) | 0 | PASS |
| 3: no local parser | `rg -n "DIR_RE\|function canonical" milestone-scope.cjs` | 1 (no matches, as required) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs` | 1 (`parseObjectiveDirName is not a function`, `canonicalObjectiveNumber is not a function`) | FAIL (correct) |
| GREEN (task 2) | `node --test plugins/devflow/devflow/bin/lib/helpers.test.cjs` | 0 | PASS (correct) |
| RED (task 3) | `node --test plugins/devflow/devflow/bin/lib/milestone-scope.test.cjs` | 1 (tests 5, 7, 8, 8b, 11 failed; 6, 6b, 9, 10 passed as controls) | FAIL (correct) |
| GREEN (task 3) | `node --test` on the five scoped suites | 0 (89 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test helpers milestone-scope milestone-complete estimate-milestone token-coverage` | 0 | PASS |
| test (full) | `npm test` | 1 | 11 failures, none in files this TRD touches (see below); PASS for this TRD |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

Full suite after the change: 11202 tests, 11141 pass, 11 fail, 50 skipped. The 11 failures are all outside this TRD's files:
- 10 are `devflow-watch` daemon tests (foreground start/stop, multi-project CLI, handoff pipeline end-to-end, LK-1, LK-2): they spawn daemons and time out in this environment. LK-2 also failed in the baseline run taken before any change.
- `E2E1` (roadmap-reconcile.test.cjs, "reconcile dry-run against this repo ROADMAP shows zero drift") reports drift on exactly one line: the unticked `68-02` TRD line in ROADMAP.md while its SUMMARY exists. It also failed in the baseline after the first SUMMARY checkpoint and clears when `roadmap update-job-progress` ticks the line (state step below).

## Decisions Made

- Alignment with `find-objective`: unpadded `4-d` and hyphen-less `04x` stop counting as objective directories in milestone-scope (the TRD's intended behaviour). No shipped test depended on them.
- Scope matching of a single decimal is by text (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A single decimal in a milestone bullet selected the neighbouring decimal**
- **Found during:** Task 3 RED (test 7, second clause)
- **Issue:** `inScope` compared `parseFloat(key)` to the floats in `milestoneObjectiveNumbers(...).singles`, and `parseFloat('4.10') === parseFloat('4.1')`. With a bullet `Objectives 4.1`, `04.10-ten` was selected too, contradicting the TRD's decimal-exactness truth and test 7. Fixing the directory lookup alone could not make test 7 pass.
- **Fix:** Added `singleKeys(rest)` (reuses `OBJECTIVES_TEXT_RE` / `ITEM_RE`) returning the canonical text of the bullet's single items; `inScope(key, {ranges}, keys)` matches singles by text and ranges numerically. `milestoneObjectiveNumbers` and its `{ranges, singles}` return are untouched (estimate-milestone.test.cjs tests 4/4b pass unchanged).
- **Files modified:** plugins/devflow/devflow/bin/lib/milestone-scope.cjs
- **Commit:** bfe20f00

### Added coverage beyond the test list
- Test 6b (a stray second `04-*` directory resolves to the one find-objective picks) and test 8b (hyphen-less `04x` is not an objective directory), because the TRD's gotchas and decided-behaviour sections named both and test 8b is the discriminating case for "no hyphen-less match".

### Deferred
- Ordering and range membership still use floats: `byNumber` treats 4.10 and 4.1 as equal (and sorts 4.10 before 4.2), and a range such as `4.1–4.3` includes 4.10. Out of this TRD's contract (output ordering and range semantics are unchanged); worth a decision before a project actually reaches a tenth decimal insertion.

## Discovered commands

None. `npm test` and `node --test {files}` came from the stack profile.

## Issues Encountered

- Appended the helpers tests with a shell heredoc instead of Edit (a one-off; the file is committed and verified).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the decimal-singles fix, found at RED)
- Must-haves verified: 5/5 (no local parser: test 5; find-objective parity: tests 6/6b/10; decimal exactness: test 7; consumer suites unchanged: milestone-complete, estimate-milestone, token-coverage all pass unedited; `roadmapSections` exported: test 11)
- Gate failures: 11 pre-existing or environment failures in the full suite, none in files this TRD touches (listed above)

## Self-Check: PASSED

All created files exist (`milestone-scope-fixtures.cjs`, `milestone-scope.test.cjs`); commits e5407736, 9379ae9b, ab6209d6, b656f2f9 and bfe20f00 are in `git log`.
