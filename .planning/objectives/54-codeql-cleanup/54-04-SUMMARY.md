---
objective: 54-codeql-cleanup
trd: "04"
subsystem: testing
tags: [codeql, shell-command-injection, execFileSync, tests]
requires: []
provides:
  - "Five test files spawn df-tools with an argv array and no shell"
affects: [54-05, 54-09]
tech-stack:
  added: []
  patterns: ["execFileSync(process.execPath, [DF_TOOLS, ...argv])"]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/api-contract.test.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
    - plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs
decisions:
  - "Left the existing spawnSync('node', [...]) sites in flutter-ui-eval-dogfood alone: they already pass argv with no shell and CodeQL did not flag them"
requirements-completed: ["54-G"]
duration: 3 min
completed: 2026-10-04
---

# Objective 54 TRD 04: execFileSync in the verify/flutter-ui test files Summary

Five test files now run df-tools through `execFileSync(process.execPath, [DF_TOOLS, ...argv])` instead of a shell-interpolated `execSync` template string, which removes the source pattern behind CodeQL alerts 102-106 and 115-119 (`js/shell-command-injection-from-environment`). No assertion changed, and every file reports the same pass/fail/skip counts as before.

## Progress
- [x] Task 1: execFileSync in api-contract, flutter-ui-dogfood and flutter-ui-eval-planner-default tests (alerts 102-106, 116) — 8d24b8ad
- [x] Task 2: execFileSync in flutter-ui-eval-dogfood and verifier-ui-eval-invocation tests (alerts 115, 117, 118, 119) — e64e46ce

## What changed

| File | Change |
|---|---|
| api-contract.test.cjs | 3 `execSync` calls (Cases C1-C3) converted one to one; the comment naming `execSync` now says `execFileSync` |
| flutter-ui-dogfood.test.cjs | `run(args, cwd)` is now `run(argv, cwd)`; its 6 callers pass arrays; the direct call in Case M5 converted |
| flutter-ui-eval-planner-default.test.cjs | the one call in Case A2b converted |
| flutter-ui-eval-dogfood.test.cjs | `runRaw`/`runJSON` take argv arrays (`runJSON` appends `'--raw'` as an element); all 13 helper callers converted; direct calls in Cases G3 (`env: strippedEnv` and the `err.stdout` catch kept) and G4 (inside `assert.throws`, validator kept) converted; the `runJSON` comment block says `execFileSync` |
| verifier-ui-eval-invocation.test.cjs | Case V1 now asserts the substituted Step 8c tail contains no quote, backslash, backtick or `$`, splits it on whitespace and runs it through `execFileSync`; the existing `catch (e) { stdout = e.stdout; }` and every later assertion are untouched |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: api-contract, flutter-ui-dogfood, planner-default | `node --test api-contract.test.cjs flutter-ui-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs` | 0 | PASS |
| 2: flutter-ui-eval-dogfood, verifier-ui-eval-invocation | `node --test flutter-ui-eval-dogfood.test.cjs verifier-ui-eval-invocation.test.cjs` | 0 | PASS |

Before and after counts, per file (all runs: 0 fail, 0 cancelled, 0 skipped, 0 todo):

| File | Tests before | Tests after | Suites before | Suites after |
|---|---|---|---|---|
| api-contract.test.cjs | 13 | 13 | 0 | 0 |
| flutter-ui-dogfood.test.cjs | 10 | 10 | 1 | 1 |
| flutter-ui-eval-planner-default.test.cjs | 12 | 12 | 2 | 2 |
| flutter-ui-eval-dogfood.test.cjs | 22 | 22 | 8 | 8 |
| verifier-ui-eval-invocation.test.cjs | 14 | 14 | 2 | 2 |

Done checks: `rg -n "\bexecSync\b|node \$\{DF_TOOLS\}"` over the five files prints nothing. `git diff --stat 8ff8401a HEAD` shows only the five test files and this SUMMARY.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, per task) | `node --test {files}` (the profile's `scoped` form) | 0 | PASS |
| test (full suite) | `npm test` | not run | not_available (deferred to 54-09 per dispatch) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Executor preflight ran against the main checkout, not the worktree**
- **Found during:** preflight, before Task 1
- **Issue:** The shell's cwd was the main checkout, so the first `exec-context check` reported `checkout` = the main checkout on `feat/stack-profile-loader` and recorded a 54-04 claim there. A claim on the shared checkout could have made a sibling executor hit SHARED INDEX.
- **Fix:** Ran `exec-context release --repo <main> --id 54-04`, which cleared only this plan's own claim (output: `released: ["54-04"]`). Re-ran the check with the global `--cwd <worktree>` flag. It then reported `checkout` = the worktree, `branch: df/exec-54-04` and `base_visible: true`. All later work used absolute worktree paths, `--cwd` for df-tools and `git -C` for git.
- **Files modified:** none
- **Commit:** none

**2. [Count correction, no code impact] TRD call-site counts were slightly off**
- The TRD says `run` has 7 call sites and the eval-dogfood helpers 16. The files have 6 `run` callers plus 1 direct call (7 sites), and 13 helper callers plus 2 direct calls (15). Every site that exists was converted and the no-`execSync` check is clean.

Otherwise: TRD executed as written. No production code touched, no new tests added, no assertion changed.

## Discovered commands

None. Every command came from the resolved stack profile or the TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (no shell execution of df-tools in the five files; string helpers take argv arrays and all callers pass arrays; assertions unchanged with identical test counts and results; Case V1 splits the Step 8c tail into argv and fails loudly on a quote)
- Gate failures: None (full `npm test` intentionally deferred to 54-09)

## Self-Check: PASSED

- FOUND: commit 8d24b8ad (Task 1)
- FOUND: commit e64e46ce (Task 2)
- FOUND: all five modified test files, present in `git diff --stat 8ff8401a HEAD`
- FOUND: nothing from this TRD written into the main checkout (only the pre-existing untracked `.gitkeep` there)
