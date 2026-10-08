---
objective: 69-drafts-health-and-doctor
trd: "04"
subsystem: doctor
tags: [doctor, skill-active, edit-gate, validate-health, doctor-git, tracked-marker]
requires: ["69-02"]
provides:
  - "doctor check 23 (skill-markers) over skill-marker-health.cjs: tracked .planning/.skill-active is an error naming E006, an untracked stale one a warn naming W064"
  - "check 23 --fix: guarded untrack (plus removal when stale) of only .planning/.skill-active, with the df-tools commit note in notes"
  - "check 22 (validate-health) defers E006 and W064, and counts only non-deferred repairable issues"
affects: [69-05 validate wiring, 69-06 dogfood and docs]
tech-stack:
  added: []
  patterns: [delegate classification to the shared module (no local copy), recount repairable over the non-deferred findings]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
key-decisions:
  - "Check 23 keeps no classification of .skill-active: MARKERS holds only .edit-override, and every action on the skill marker goes through smh.inspect / planRepair / repair, so an untrack always precedes an unlink and a refused guard can never leave a tracked file deleted."
  - "A refusal is described two ways: a live tracked marker the repository does not ignore carries planRepair's own text (it names .gitignore) as fix_command; an index-guard refusal carries `commit or unstage your changes (<reason>), then re-run doctor --fix`."
  - "Check 22's repairable count is taken over the non-deferred errors and warnings, not validate's repairable_count, which also counts the deferred ones. Without this a stale marker alone made check 22 fixable and its --repair silently did check 23's work first."
requirements-completed: [TOOL-09]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 10min
completed: 2026-10-08
tokens_input: 6067328
tokens_output: 38826
tokens_cache_read: 5942089
tokens_cache_write: 125141
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 69 TRD 04: Doctor owns the skill-marker codes Summary

Doctor check 23 now runs on `skill-marker-health.cjs`: a tracked `.planning/.skill-active` is an error (E006) with a guarded untrack-and-remove fix, and check 22 defers E006/W064 and counts only its own repairs, so one problem shows once.

## Progress
- [x] Task 1: Check 23 over skill-marker-health (tests 1-8) — 8d38a342 (RED 916826c8)
- [x] Task 2: Check 22 defers E006/W064 and counts only its own repairs (tests 9-11) — f8148009 (RED 916826c8 for test 9, 7cebaca1 for tests 10-11)

## What was built

- `23-skill-markers.cjs`: `run` calls `smh.inspect` and `smh.planRepair` (passing `ctx.env` and `ctx.changedThisRun` as `exclude`), plus the unchanged `.edit-override` classifier. The result follows the TRD shape: `details.stale` (skill marker when stale, tracked or not, then the override), `details.tracked`, `details.codes` (from `smh.findings`), `details.skill`, `details.skill_plan`; severity `error` when tracked, else `warn` when anything is stale. A tracked stale marker is described by the tracked sentence only; untracked stale wording is byte-identical to before. `fix` calls `smh.repair`, pushes the one changed path, adds `untracked:` plus `legacy.commitNote(...)` (store-mode aware) or `removed:` or `skill marker left alone: <refusal>` to the notes, then runs the `.edit-override` loop. The local `classifySkillActive` and the `.skill-active` entry of `MARKERS` are gone; the header documents E006/W064 ownership and that the git guard applies to the tracked case only.
- `22-validate-health.cjs`: `DEFERRED` gains `E006` and `W064` (sorted, E006 first); `classify` computes `repairable` over the non-deferred errors and warnings; the header lists the new owner and says "non-deferred".
- `doctor-checks/README.md`: the 20-29 row's `23-skill-markers` entry notes tracked markers and E006/W064 ownership.
- Tests: 7 new in `23-skill-markers.test.cjs` (tests 1-6, 8) over `makeMarkerProject`, 3 in `21-22-project.test.cjs` (tests 9-11). Old tests 15-18 and "both stale" pass unchanged.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Check 23 over skill-marker-health | `node --test lib/doctor-checks/23-skill-markers.test.cjs lib/doctor-checks/21-22-project.test.cjs` (45 tests) | 0 | PASS |
| 2: Check 22 defers E006/W064 | `node --test` over 23-skill-markers, 21-22-project, doctor.test, doctor.e2e.test, doctor-cli.test (104 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (tests 1-6, 8, 9) | `node --test lib/doctor-checks/23-skill-markers.test.cjs lib/doctor-checks/21-22-project.test.cjs` (8 fail: tracked marker reported as a stale warn, no `details.codes`, local `classifySkillActive` still defined, DEFERRED lacks E006/W064) | 1 | FAIL (correct) |
| RED (tests 10-11) | `node --test --test-name-pattern="^(10\.\|11\.)" lib/doctor-checks/21-22-project.test.cjs` (`repairable_count` 1 !== 0 and 2 !== 1) | 1 | FAIL (correct) |
| GREEN | the two files above (45 tests) | 0 | PASS (correct) |

REFACTOR: none needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over 23-skill-markers, 21-22-project, doctor, doctor.e2e, doctor-cli (104 tests, 0 fail) | 0 | PASS |
| test (full, after task 1) | `npm test` (11398 tests, 8 fail) | 1 | PASS against baseline: all 8 are the pre-existing devflow-watch / handoff-e2e daemon failures (no node_modules in the worktree) |
| test (full, after task 2) | `npm test` (11398 tests, 11 fail) | 1 | PASS against baseline: 8 known daemon failures plus 2 more devflow-watch daemon tests (`C-1 start --project`, `start cleans up stale PID file`, timing-dependent) and `E2E1` (see below) |
| build, lint, typecheck | none in the stack profile | n/a | not_available |

Baseline taken before the first change: the scoped doctor run had exactly 3 failures, `doctor.e2e.test.cjs` tests 1, 3 and 6 (the 69-02 hand-off: check 22 reported W064 and its `--repair` removed the marker before check 23 ran). All three now pass with no edit to the e2e file: deferring E006/W064 and recounting repairable issues were enough, so no assertion encoded a double report.

`E2E1` in `roadmap-reconcile.test.cjs` ("reconcile dry-run against this repo ROADMAP shows zero drift") fails only while this TRD's checkpoint SUMMARY exists beside an unticked `69-04` line in ROADMAP.md. It is a transient of the checkpoint flow, not of the code change, and it clears once `roadmap update-job-progress` runs below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's DEFERRED and repairable-count changes landed in task 1's GREEN commit**
- **Found during:** Task 1 (test 1)
- **Issue:** Test 1 runs the real check 22 beside check 23. With `DEFERRED` unchanged, check 22 reported the tracked marker too; with `DEFERRED` updated but `repairable_count` still taken from validate's JSON, check 22 stayed fixable on the marker alone and its `--repair` untracked and removed the file before check 23's fix ran (fix entry `applied: false, no stale marker to remove`). Task 1's verify could not pass without both changes.
- **Fix:** Followed the TRD recovery note. Test 9 (the DEFERRED contract) went RED in task 1's test commit, and tests 10-11 were written and committed RED (7cebaca1) before the GREEN commit, which carries check 23, the `DEFERRED` array and the `classify` recount. Task 2's GREEN commit therefore holds the header comment and README only.
- **Files modified:** 22-validate-health.cjs, 21-22-project.test.cjs
- **Commit:** 8d38a342

**2. [Rule 1 - Bug] Test 10 asserted the finding never names E006**
- **Found during:** Task 1 GREEN
- **Issue:** The `ok` finding legitimately ends `(deferred to other checks: E006)`, so the assertion I wrote contradicted the module's own wording. TRD test 10 does not ask for it (test 1 keeps the check against a finding that lists real warnings).
- **Fix:** Removed that one assertion from test 10.
- **Files modified:** 21-22-project.test.cjs
- **Commit:** 8d38a342

## Notes for later TRDs

- No change to `skill-marker-health.cjs` was needed.
- `.planning/ROADMAP.md` still shows 69-04 unticked on this branch until the roadmap command below runs.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (tracked marker is error E006 and stale untracked is warn W064: tests 1, 6; guarded untrack-and-remove with `changed` and commit note: test 1; refusal on staged work unless the doctor's own, never unlinking a tracked marker it could not untrack: tests 3-5; check 22 defers and counts non-deferred only: tests 1, 9-11; reported once and both ok after `--fix`: test 1; no local classification: test 8)
- Gate failures: None beyond the known environmental daemon failures

## Self-Check: PASSED

- Files: 23-skill-markers.cjs, 23-skill-markers.test.cjs, 22-validate-health.cjs, 21-22-project.test.cjs, doctor-checks/README.md all present.
- Commits: 916826c8, 7cebaca1, 8d38a342, f8148009 all in `git log`.
- `rg "function classifySkillActive"` on check 23 finds nothing; `smh.inspect`, `smh.planRepair` and `smh.repair` are called in `run` and `fix`.
