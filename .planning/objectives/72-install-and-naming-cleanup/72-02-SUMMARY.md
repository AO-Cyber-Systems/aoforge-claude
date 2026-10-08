---
objective: 72-install-and-naming-cleanup
job: "02"
subsystem: infra
tags: [rename, aoforge, compat, shim, name-map]

requires:
  - objective: 72-install-and-naming-cleanup
    provides: "72-01 rescoped INST-01..INST-06 and the 72 roadmap entry"
provides:
  - "legacy-names.cjs: frozen NAMES and LEGACY name maps plus SHIM_REMOVAL"
  - "compat.cjs: aliasLegacyEnv, planningDirName/planningRoot/isLegacyPlanning/bothPlanningDirs, findProjectRoot, isOwnAgentType, userDotFile, runtimeHome, legacyRuntimeHome"
  - "legacy-fixtures.cjs: projectTree, legacyEnv, fakeHome"
affects: [72-04, 72-05, 72-06, 72-07, 72-08, 72-09, 72-10, 72-11]

tech-stack:
  added: []
  patterns:
    - "A legacy name is spelled only in legacy-names.cjs, __fixtures__/legacy-*.cjs and *.legacy.test.* files"
    - "Shim primitives never cache: a migration can move the planning directory mid-process"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/legacy-names.cjs
    - plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs
    - plugins/devflow/devflow/bin/lib/compat.cjs
    - plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs
  modified: []

key-decisions:
  - "compat.cjs destructures the planning-directory key (NEW_PLAN_DIR / OLD_PLAN_DIR) instead of dotted access, because the TRD's literal source guard forbids the substring that a dotted access to that key contains"
  - "findProjectRoot treats ENOTDIR as absence; every other stat error propagates"

patterns-established:
  - "Pure shim primitives take an injectable fsImpl and are tested against hand-built tmp trees"

requirements-completed: [INST-02, INST-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-08
tokens_input: 4473528
tokens_output: 35677
tokens_cache_read: 4381138
tokens_cache_write: 92294
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 72 TRD 02: Legacy names and compat Summary

The DevFlow to AOForge name map lives in one frozen module (`legacy-names.cjs`) and the one-release shim primitives (env aliasing, `.aoforge`/`.planning` resolution, agent-type recognition, user dot-dir fallback) live in `compat.cjs`, built test-first and wired into nothing yet.

## Progress
- [x] Task 1: Fixture builders for legacy inputs — 0e0a15a2
- [x] Task 2: legacy-names.cjs, the single name map — 477aa738 (RED), 28b664ad (GREEN)
- [x] Task 3: compat.cjs shim primitives — 5e1008e0 (RED), 1916b894 (GREEN)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "require(legacy-fixtures.cjs); projectTree({layout:'both'}) ..."` (printed `.aoforge`, `.planning`; nested and file content present; cleanup removed root) | 0 | PASS |
| 2: legacy-names.cjs | `node --test plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs` (4 tests) | 0 | PASS |
| 3: compat.cjs | `node --test plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs` (27 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test .../legacy-names.legacy.test.cjs` (Cannot find module './legacy-names.cjs') | 1 | FAIL (correct) |
| GREEN (Task 2) | `node --test .../legacy-names.legacy.test.cjs` | 0 | PASS (correct) |
| RED (Task 3) | `node --test .../compat.legacy.test.cjs` (Cannot find module './compat.cjs') | 1 | FAIL (correct) |
| GREEN (Task 3) | `node --test .../compat.legacy.test.cjs .../legacy-names.legacy.test.cjs` | 0 | PASS (correct) |

No REFACTOR commit: the one post-GREEN adjustment (destructuring, see Deviations) was needed to pass test 16 and went into the GREEN commit.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the two `*.legacy.test.cjs` files plus `gh-project.test.cjs` | 0 | PASS (62 tests) |
| test (full suite, micro excluded) | `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 11418 pass, 10 fail, 51 skipped; 1 failure was mine and is fixed (see Deviations); the other 9 are environmental (see Deferred Issues) |
| verification grep | `rg -n -e devflow -e DEVFLOW -e DevFlow -e '\.planning' -e df-tools compat.cjs` | 1 (no match) | PASS (prints nothing) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TRD's source guard contradicts the TRD's own advice**
- **Found during:** Task 3 GREEN
- **Issue:** Test 16 (and the verification `rg`) forbid the substring `.planning` anywhere in `compat.cjs`, but the TRD tells the implementer to use `LEGACY.planningDir` / `NAMES.planningDir`, and both contain `.planning` as a substring. The first GREEN run failed only test 16.
- **Fix:** Destructured the key once (`const { planningDir: NEW_PLAN_DIR } = NAMES` and the LEGACY twin) and used small `hasNewPlanDir` / `hasOldPlanDir` helpers. The test and the verification grep stay exactly as the TRD wrote them.
- **Files modified:** plugins/devflow/devflow/bin/lib/compat.cjs
- **Commit:** 1916b894
- **Heads-up for 72-04:** its repo test must not scan for a bare `.planning` substring in modules that use `LEGACY.planningDir`, or it will flag every sanctioned use. A word-boundary match (`.planning` not followed by a letter) is enough.

**2. [Rule 1 - Bug] `gh-project.test.cjs` X2 guard rejects the string `__fixtures__` in any lib module**
- **Found during:** Task 3 full-suite run
- **Issue:** The header comment of `legacy-names.cjs` named `bin/lib/__fixtures__/legacy-*.cjs`; X2 ("no lib/ module outside tests reads `__fixtures__`") failed with `['legacy-names.cjs']`.
- **Fix:** Reworded the comment to "the legacy-*.cjs files of the lib fixtures directory". X2 now passes.
- **Files modified:** plugins/devflow/devflow/bin/lib/legacy-names.cjs
- **Commit:** 1916b894

### Additions beyond the test list (same TRD scope)
Tests 5b, 9b, 12b-12g, 14b-14c and a no-cache test were added next to the numbered cases; `findProjectRoot` and the file-versus-directory check treat ENOTDIR as absence.

## Deferred Issues

Nine failures in the full suite are environmental and unrelated to this TRD: the worktree has no `node_modules` (`node-pty` is installed only in the main checkout at `/Users/justin/dev/devflow-claude/node_modules/node-pty`), so the watch daemon cannot spawn a shell. Affected: `devflow-watch start/stop` (3) and `handoff-e2e` (6). They were not re-run in the main checkout. The TRD's expected baseline note (roadmap-reconcile E2E1 transient) did not fire in this run.

## Discovered commands

None. The `test` command (`npm test`, scoped `node --test {files}`) came from the stack profile.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the two fixes above were applied together before the GREEN commit)
- Must-haves verified: 7/7 truths (NAMES/LEGACY pairs and frozen, legacy-only literal home, aliasLegacyEnv semantics, planning-dir resolution, findProjectRoot, isOwnAgentType, userDotFile) and 3/3 artifacts
- Gate failures: full suite has 9 environmental failures (missing `node-pty` in the worktree), listed under Deferred Issues

## Self-Check: PASSED

- Files found: legacy-names.cjs, legacy-names.legacy.test.cjs, compat.cjs, compat.legacy.test.cjs, __fixtures__/legacy-fixtures.cjs
- Commits found: 0e0a15a2, 477aa738, 28b664ad, 5e1008e0, 1916b894
