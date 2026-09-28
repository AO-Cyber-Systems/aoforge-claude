---
objective: 37-adopt-existing-repos
trd: "01"
subsystem: testing
tags: [fixtures, git, project-state, detector, tdd]

# Dependency graph
requires: []
provides:
  - "Fixture factory (adopt-fixtures.cjs): makeFixture for 6 scratch-repo kinds (go-service, flutter-app, node-cli, empty, devflow, dirty), writeMappedDocs/writeProjectMd/writeInferences, CLI (make/home)"
  - "repo-state.cjs: one project-state detector (classify/collectSignals/derive/detectRepoState) for devflow|greenfield|brownfield|scratch"
affects: ["37-04", "37-05", "37-08", "37-11", "37-12", "37-13"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "userHome dependency injection everywhere — never os.homedir()"
    - "gitEnv(home) isolation for every fixture git call, so the operator's global git config is never read"
    - "pure classify()/derive() separated from IO collectSignals(), composed by detectRepoState()"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/adopt-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/repo-state.cjs
    - plugins/devflow/devflow/bin/lib/repo-state.test.cjs
  modified: []

key-decisions:
  - "EXCLUDE/EXTS/countSourceFiles/isScratchDir moved-by-copy (not required) into repo-state.cjs, per TRD instruction, to avoid a load cycle when 37-04 later inverts project-state.cjs's dependency onto this module"
  - "detectManifest and gitAgeDays are required as-is from project-state.cjs (37-04 inverts this dependency later)"

patterns-established:
  - "adopt-fixtures.cjs is the single shared, hand-built (no_llm_test_data) scratch-git-repo builder for all of objective 37"
  - "detectRepoState(root, opts) -> {state, signals, derived} as the canonical repo-classification shape"

requirements-completed: ["ADP-01", "ADP-06 (part)"]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 13min
completed: 2026-09-28
---

# Objective 37 TRD 01: Fixture factory + the one repo-state detector Summary

**Hand-built scratch-git-repo factory (6 fixture kinds) plus a single pure `classify`/`derive` + IO `collectSignals` detector (`devflow\|greenfield\|brownfield\|scratch`) that later TRDs delegate to.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-09-28T04:22:38Z (first RED commit)
- **Completed:** 2026-09-28T04:35:39Z
- **Tasks:** 2
- **Files modified:** 3 (all newly created)

## Accomplishments
- `adopt-fixtures.cjs`: `makeFixture(kind, {parent, home, name})` builds a real, one-commit, `commit.gpgsign=false` git repo for 6 kinds (go-service, flutter-app, node-cli, empty, devflow, dirty), plus `writeMappedDocs`/`writeProjectMd`/`writeInferences` and a standalone `make`/`home` CLI with both refusal guards (non-empty target, parent-inside-a-work-tree).
- `repo-state.cjs`: `detectRepoState(root, opts) -> {state, signals, derived}` — one detector reproducing both legacy formulas (`is_substantive`, `should_offer_map`) exactly, with `userHome` injected throughout (no `os.homedir()` anywhere in the module).
- 25/25 TRD-specified test cases pass; existing `project-state.test.cjs` (32 tests) and `brownfield-detector.test.cjs` (21 tests) remain green, unmodified.
- Repo-wide regression gate re-verified clean: 1 pre-existing baseline failure, 0 new regressions.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture factory + self-checks (tests 1-8) | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` | 0 | PASS |
| 2: repo-state.cjs — classify/signals/derived (tests 9-25) | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` | 0 | PASS |

## Task Commits

Each phase was committed atomically (TDD: test → feat per task):

1. **Task 1 RED** — `31f9d79` `test(37-01): adopt fixture factory self-checks`
2. **Task 1 GREEN** — `0b7146c` `feat(37-01): adopt fixture factory for scratch git repos`
3. **Task 2 RED** — `18d572b` `test(37-01): repo-state detector cases`
4. **Task 2 GREEN** — `f2e8c49` `feat(37-01): one repo-state detector (devflow|greenfield|brownfield|scratch)`

_Note: no REFACTOR commit was needed — both GREEN phases passed with the implementation written directly from the TRD's codebase_examples target shape._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Fast verify (25/25 cases) | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` | 0 | PASS |
| No real-home access | `rg -n "homedir\|~/.claude" plugins/devflow/devflow/bin/lib/repo-state.cjs plugins/devflow/devflow/bin/lib/__fixtures__/adopt-fixtures.cjs` | matches are comments only | PASS |
| Sibling parity: `project-state.test.cjs` | `node --test plugins/devflow/devflow/bin/lib/project-state.test.cjs` | 0 (32/32) | PASS |
| Sibling parity: `brownfield-detector.test.cjs` | `node --test plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs` | 0 (21/21) | PASS |
| Wave regression gate (repo-wide, baseline-relative) | see below | 1 (baseline, classified) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` (before adopt-fixtures.cjs existed) | 1 (`MODULE_NOT_FOUND: ./__fixtures__/adopt-fixtures.cjs`) | FAIL (correct) |
| Task 1 GREEN | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` | 0 (8/8 pass) | PASS (correct) |
| Task 2 RED | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` (before repo-state.cjs existed) | 1 (`MODULE_NOT_FOUND: ./repo-state.cjs`) | FAIL (correct) |
| Task 2 GREEN | `node --test plugins/devflow/devflow/bin/lib/repo-state.test.cjs` | 0 (25/25 pass) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0 (no Rule 1-3 fixes to TRD-authored production code were needed; one self-authored test-parsing bug was corrected before its GREEN commit — see Deviations)
- **Must-haves verified:** 7/7 truths, 3/3 artifacts, all wiring notes hold for later TRDs to consume
- **Gate failures:** None (the one repo-wide test failure is the known baseline entry `handoff-e2e.test.cjs:795:3` / `MA-7`)

## Regression Gate (baseline-relative)

Ran from the repo root: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (excludes `micro.test.cjs` per binding rules).

- **Observed totals:** 3816 tests, 542 suites, **3783 pass**, **1 fail**, 32 skipped.
- **Failure classification:**
  | File:line | Name | Classification |
  |---|---|---|
  | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** — present verbatim in `baseline-failures.tsv` line 16 |
- No candidate regressions. `baseline-failures.tsv` was read only, never edited (21 lines, unchanged).
- The other 20 baseline entries did not manifest in this run (expected — they are 1Password-lock and git-worktree-specific per the TRD's own note that "test counts depend on the environment"); the gate is baseline-relative, not count-based, so this is not a discrepancy.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/__fixtures__/adopt-fixtures.cjs` - fixture factory: `makeFixture`, per-kind literal file writers, `writeMappedDocs`/`writeProjectMd`/`writeInferences`, CLI (`make`/`home`), re-exports of `makeFakeHome`/`gitEnv`/`snapshot`/`diffSnapshots` from `upgrade-fixtures.cjs`
- `plugins/devflow/devflow/bin/lib/repo-state.cjs` - `STATES`, `EXCLUDE`, `EXTS`, `isScratchDir`, `countSourceFiles`, `collectSignals`, `classify`, `derive`, `detectRepoState`
- `plugins/devflow/devflow/bin/lib/repo-state.test.cjs` - full 25-case test list (header comment + implementations), fixture self-checks 1-8, classify 9-14, signals/detectRepoState 15-22, derive 23-25

## Decisions Made
- Kept `EXCLUDE`/`EXTS`/`countSourceFiles`/`isScratchDir` as verbatim, independent copies in `repo-state.cjs` (not `require`d from `project-state.cjs`) per the TRD's explicit instruction, so that 37-04's later dependency inversion (project-state.cjs delegating to repo-state.cjs) does not create a load cycle.
- `detectManifest` and `gitAgeDays` are `require`d as-is from `project-state.cjs` in this TRD (unchanged reuse, no copy) — also per TRD instruction, since only those two are inverted later.
- `collectSignals` lazy-`require`s `stack-profile.cjs` only when `userHome` is truthy, matching `project-state.cjs`'s own lazy-require pattern and keeping `userHome: null` a true no-op for org-marker detection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-authored test code] Fixed porcelain-status array assertion losing its leading space**
- **Found during:** Task 1 GREEN verification (test 6, `dirty` fixture)
- **Issue:** The RED-phase test used `porcelain(root).trim().split('\n').sort()`, which trims the *entire* multi-line string before splitting — deleting the leading space off `" M main.go"` (the first line) and then re-sorting `['M main.go', '?? notes.txt']` into `['?? notes.txt', 'M main.go']` by first character, silently corrupting the very column the test exists to check.
- **Fix:** Changed to `porcelain(root).split('\n').filter(Boolean).sort()`, which drops only the trailing empty string from the final newline and leaves each line's leading status column intact.
- **Files modified:** `plugins/devflow/devflow/bin/lib/repo-state.test.cjs`
- **Verification:** Test 6 passes; the fixture's own git output (` M main.go`, `?? notes.txt`) round-trips correctly.
- **Committed in:** `0b7146c` (Task 1 GREEN commit)

**2. [Procedural — no code changed] Initial regression-gate run had a cwd artifact**
- **Found during:** post-Task-2 regression gate
- **Issue:** The Bash tool's working directory resets to the objective subdirectory (`.planning/objectives/37-adopt-existing-repos`) on every call, not the repo root. Running the gate's exact glob command from that cwd produced 3 apparent failures, one of which (`check-todos.test.cjs` E2E3) was asserting a path built from `process.cwd()` and therefore failed on a wrong absolute path — an artifact of my own invocation, not a regression.
- **Fix:** Re-ran the identical command via `env -C /Users/justin/dev/devflow-claude <cmd>` (a single plain command, no `cd`/`&&`) so the suite executed with the repo root as cwd. Both previously-apparent extra failures (`check-todos.test.cjs` E2E1, E2E3) passed cleanly; only the known baseline failure (`MA-7`) remained.
- **Files modified:** none (test/production code untouched; only the invocation was corrected)
- **Verification:** See Regression Gate section above.

---

**Total deviations:** 1 auto-fixed (test-code bug) + 1 procedural correction (no code impact).
**Impact on plan:** No scope creep. Both are self-contained to this TRD's own test harness; no TRD-authored production code required a fix.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `repo-state.cjs` is ready for 37-04 to make `project-state.cjs`, `brownfield-detector.cjs`, and `init.cjs:597-622` delegate to it.
- `adopt-fixtures.cjs` is ready for 37-05 (`lib/adopt.cjs` preflight) and 37-08/11/12/13 (simulated runs, E2E) to build their scratch repos.
- No blockers identified for downstream wave-1+ TRDs in objective 37.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/repo-state.cjs
- FOUND: plugins/devflow/devflow/bin/lib/repo-state.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/adopt-fixtures.cjs
- FOUND: .planning/objectives/37-adopt-existing-repos/37-01-SUMMARY.md
- FOUND: commit 31f9d79 (test(37-01): adopt fixture factory self-checks)
- FOUND: commit 0b7146c (feat(37-01): adopt fixture factory for scratch git repos)
- FOUND: commit 18d572b (test(37-01): repo-state detector cases)
- FOUND: commit f2e8c49 (feat(37-01): one repo-state detector (devflow|greenfield|brownfield|scratch))

---
*Objective: 37-adopt-existing-repos*
*Completed: 2026-09-28*
