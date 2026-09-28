---
objective: 40-tooling-correctness
trd: "03"
subsystem: tooling
tags: [df-tools, intent-resolve, objective-id, planner, tdd-posture]

# Dependency graph
requires: []
provides:
  - "`intent resolve --objective <id>` resolves the bare number (`40`), the zero-padded number (`7` → `07-*`, `7.1` → `07.1-*`) or the full slugged dir name (`40-tooling-correctness`) to the objective directory and reads its OBJECTIVE.md `work:`"
  - "No matching objective dir → `warnings` gains `OBJECTIVE.md not found for objective '<id>' ...`; work falls back as before (no throw)"
  - "Several matching dirs (duplicate numbers) → the lexicographically first is used, and one warning names every candidate"
  - "planner.md Step 1 says which id to pass and to stop on an `OBJECTIVE.md not found` warning"
affects: [planner agent Step 1 (every planning run), plan-objective workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tiered id→dir lookup: exact dir wins outright; otherwise `d === key || d.startsWith(key + '-')` over sorted dirs that contain OBJECTIVE.md. The `-` stops `4` from matching `40-*`"
    - "Lookup helpers return `{ fm, dir, warnings }` and resolve() merges the warnings after its existing ones, so `warnings[0]` keeps its meaning"

key-files:
  created:
    - .planning/objectives/40-tooling-correctness/40-03-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/intent.cjs
    - plugins/devflow/devflow/bin/lib/intent.test.cjs
    - plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
    - plugins/devflow/agents/planner.md

key-decisions:
  - "findObjectiveDir is kept local to intent.cjs (it does not require objective.cjs), per the TRD anti-pattern. Directory names are `.sort()`ed after mapping, as the job-checker asked, so the ambiguous case is deterministic"
  - "Decimal ids are padded on the integer part too (`7.1` → `07.1`). This matches helpers.cjs normalizeObjectiveName, which is how inserted objectives are named. Without it, every decimal objective planned by number would hit the new not-found warning"
  - "Objective-lookup warnings are pushed after the missing-kind warning. The existing test asserting `warnings[0]` matches missing 'kind' still passes unmodified"
  - "No new top-level field (for example `objectiveDir`) was added to the resolve output. The output schema is unchanged; only `warnings` content is new"

patterns-established:
  - "Loud not-found: a lookup that feeds a precedence fallback must say so in `warnings` instead of silently falling through"

requirements-completed: [TOOL-05]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-09-28
---

# Objective 40 TRD 03: `intent resolve --objective <N>` finds slugged objective directories Summary

**`readObjectiveMd` now resolves a bare objective number to its slugged directory by prefix match. The match uses exact, then `<id>-`, then zero-padded `<0id>-`, and `4` never matches `40-*`. So `intent resolve --objective 40` on this repo reports `work: bugfix` from OBJECTIVE.md instead of silently inheriting `feature` from PROJECT.md. An id that matches nothing now adds an `OBJECTIVE.md not found` warning, and duplicate numbers add a warning naming every candidate.**

## Performance

- Start: 2026-09-28T16:01:38Z
- End: 2026-09-28T16:04:53Z
- Tasks: 2/2 (3 commits: RED, GREEN, docs)
- Files modified: 4 (`intent.cjs` +85/−7, `intent.test.cjs` +171, `intent-cli.test.cjs` +34, `planner.md` 1 line)

## Before / after on this repo (read-only)

`node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 40`

| Field | Before (base 9c933c6) | After (ff2e998) |
|---|---|---|
| `work` | `feature` | `bugfix` |
| `workSource` | `PROJECT.md default_work` | `OBJECTIVE.md` |
| `workInherited` | `true` | `false` |
| `config.tdd` | `strict; host contract + mocked host; ...` | `regression per bug` |
| `config.depth` | `comprehensive` | `quick` |
| `warnings` | `[]` | `[]` |

- `--objective 40-tooling-correctness` gives the same after-state (`bugfix`, `OBJECTIVE.md`, no warnings).
- `--objective 999` gives `work: feature` / `PROJECT.md default_work` / `workInherited: true`, and prints this warning:
  `OBJECTIVE.md not found for objective '999': no directory under .planning/objectives/ is named '999' or starts with '999-'. work was not read from an OBJECTIVE.md and fell back to the next source (see workSource). Pass the objective number or its directory name.`

## Accomplishments

1. **`findObjectiveDir(projectRoot, id)`** (intent.cjs) finds the objective directory in two steps:
   - An exact `<id>/OBJECTIVE.md` wins outright.
   - Otherwise it considers every sorted directory that contains an OBJECTIVE.md and is named `key` or starts with `key-`. The keys come from `objectiveIdKeys(id)`: the id itself, plus the integer-part-zero-padded form when the id is numeric (`7` → `07`, `7.1` → `07.1`).

   It returns `{ dir, candidates, keys }`.
2. **`readObjectiveMd`** now returns `{ fm, dir, warnings }`:
   - When nothing matches, it adds a not-found warning naming the id and every name and prefix it tried.
   - When several dirs match, it adds an ambiguity warning naming all candidates and the one it chose.
   - It never throws.
3. **`resolve()`** takes `objectiveFm` from the lookup and appends the lookup warnings right after the missing-kind warning. The TRD > OBJECTIVE.md > PROJECT.md precedence block is unchanged. TRD (`--trd`) handling is untouched.
4. **planner.md Step 1** now says:
   - Pass the bare `objective_number` from init (e.g. `40`) or the `objective_dir` basename; bare numbers resolve by prefix match.
   - If `warnings` contains `OBJECTIVE.md not found`, stop and surface it.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 9122c1b | test(40-03): failing bare-number objective id cases for intent resolve |
| 1 | GREEN | ff2e998 | fix(40-03): intent resolve prefix-matches slugged objective dirs and warns when missing |
| 2 | — | a80e7ad | docs(40-03): planner Step 1 names the objective id to pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Decimal objective ids were not padded**
- **Found during:** Task 1 (test design)
- **Issue:** The TRD's suggested resolver pads only `/^\d+$/` ids. Inserted objectives are named `07.1-foo` (helpers.cjs `normalizeObjectiveName` pads the integer part and keeps the decimal). So `--objective 7.1` would have missed the directory and hit the new not-found warning.
- **Fix:** `objectiveIdKeys` matches `/^(\d+)(\.\d+)?$/` and pads the integer part only. The test "a decimal id is padded on its integer part (7.1 → 07.1-hotfix)" also asserts that `7` is not captured by the `07.1-*` sibling. That holds because `07.1-hotfix` does not start with `07-`.
- **Files modified:** intent.cjs, intent.test.cjs
- **Commit:** 9122c1b (test), ff2e998 (fix)

### Additions beyond the Test list (coverage for must-have truths, no scope change)

- "1 (padded 01) never matches 10-foo" covers the must-have "`1` never matches `10-foo`", which Test list 4 did not exercise.
- "not found does not throw and leaves the missing-kind warning first" covers the anti-pattern "do not throw on not-found" and the error-recovery note about warning order.
- "an exact directory name wins over prefix matches and does not warn" covers the must-have "exact dir `<id>` first". It passed in RED because exact lookup already worked, so it acts as a regression guard.
- In the CLI test and the found cases, `warnings` is deep-equal `[]`, so a resolved id never warns.
- In the no-match cases, the test for `4` asserts the warning contains `'4'` (quoted). A bare `4` would also match inside `40`, so the quotes are what make the assertion distinguish the two ids.

### Orchestrator note applied

- The job-checker warned that the example scans `readdirSync` without `.sort()`. `findObjectiveDir` now sorts after mapping names, and Test list 6 creates `12-b` before `12-a` so the result cannot depend on creation order.

**Total deviations:** 1 auto-fixed (Rule 2). **Impact:** the resolver now works for decimal (inserted) objectives. There is no structural change, and no files outside `files_modified` were touched.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test --test-name-pattern="TOOL-05" plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` | 1 | PASS (11 tests: 10 fail on assertions such as `'feature' !== 'bugfix'` or a missing warning; the exact-dir guard passes) |
| 1: GREEN | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` | 0 | PASS (95/95: 84 existing unmodified + 11 new) |
| 1: done | `node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 40` | 0 | PASS (`"work":"bugfix"`, `"workSource":"OBJECTIVE.md"`) |
| 2 | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (10/10) |
| 2: done | `rg -n -e 'OBJECTIVE.md not found' plugins/devflow/agents/planner.md` | 0 | PASS (1 line, :212) |
| 2: regression | `node --test .../flutter-ui-scope.test.cjs` (reads planner.md) | 0 | PASS (25/25) |
| 2: regression | `node --test .../agent-tools.test.cjs .../agent-shell-harness.test.cjs` | 0 | PASS (52/52) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern="TOOL-05" .../intent.test.cjs .../intent-cli.test.cjs` | 1 | FAIL (correct): 10/11 fail; Test list 1-6 all red |
| GREEN | `node --test .../intent.test.cjs .../intent-cli.test.cjs` | 0 | PASS (correct): 95/95 |
| REFACTOR | n/a | — | none needed |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD verification | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (105/105; was 94 before this TRD, +11 new) |
| Repo dogfood | `df-tools.cjs intent resolve --objective 40` and `--objective 40-tooling-correctness` | 0 | PASS (both `bugfix`) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths:
  - repo `--objective 40` gives bugfix / OBJECTIVE.md / workInherited false
  - resolution order, including no false prefix for `4`→`40` and `1`→`10`
  - ambiguous → lexicographically first plus a warning naming all candidates
  - not-found warning with no throw
  - slugged ids and all existing tests pass unmodified
  - planner.md Step 1 text
- Gate failures: None
- Other callers: no non-test code consumes `intent.resolve().warnings` (only df-tools.cjs prints the JSON), so the new warnings cannot fail anything downstream.
- Repo `.planning/STATE.md` / `.planning/ROADMAP.md`: untouched. Tests use `fixtures.buildProject` tmp dirs, and the repo runs were read-only `intent resolve`.

## Self-Check: PASSED

- FOUND: 40-03-SUMMARY.md, intent.cjs, intent.test.cjs, intent-cli.test.cjs, planner.md
- FOUND commits: 9122c1b (RED), ff2e998 (GREEN), a80e7ad (docs) on feat/stack-profile-loader above base 9c933c6
