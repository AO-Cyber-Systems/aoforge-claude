---
objective: 59-state-and-merge-plumbing
job: "02"
trd: "02"
subsystem: state
tags: [state-advance-job, position-from-disk, no-position-guard, store-mode]

requires: []
provides:
  - "df-tools state advance-job --objective <N>: Status/Current Job/Total Jobs derived from objective N's TRD and SUMMARY files on disk (idempotent)"
  - "state advance-job with no --objective and no usable position writes nothing and reports reason: no_position (the 0 >= 0 'Objective complete' rewrite is gone)"
  - "cmdStateAdvanceJob(cwd, options, raw), still accepting the pre-59 (cwd, raw) call shape"
  - "lib/__fixtures__/state-position-fixtures.cjs: narrativeState, legacyState, positionProject"
affects: [59-06 executor.md / execute-trd.md / execute-objective.md wiring, 59-07 dogfood-and-docs]

tech-stack:
  added: []
  patterns:
    - "position as a fact read from disk (NN-MM TRD/SUMMARY pairing via findObjectiveInternal) rather than a counter carried between calls"
    - "lazy require of objective.cjs inside the function, as storeMode does for planning-mode.cjs"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/state-position-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/state.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "No counters at all (both NaN) also reports no_position, following the TRD must-have ('state.json 0/0, or no counters'); it previously returned an {error} object"
  - "The disk-derived path stamps Last Activity with helpers.localDate() (the local calendar day); the untouched legacy path keeps its UTC date"
  - "no_position and no_trds write nothing, so they use plain output(), not storeOutput (no misleading target: state.json in store mode)"
  - "advanced compares against the previous current_job recorded for the SAME objective in state.json (objective numbers compared with leading zeros stripped), 0 otherwise"

requirements-completed: [PLMB-01]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-05
---

# Objective 59 TRD 02: advance-job from disk Summary

**`state advance-job --objective N` now reads objective N's TRDs and SUMMARYs from disk and writes `Executing objective N — D/T TRDs complete` (or `ready for verification` only when D equals T); with no usable position it writes nothing and reports `no_position` instead of rewriting Status to "Objective complete" after the first TRD.**

## Progress
- [x] Task 1: Fixture builders for position projects — a4b79cb2
- [x] Task 2: Disk-derived advance-job and the no_position guard (tests 1-13) — RED ffd192c3, GREEN 0e0852a1

## Status strings and output shape (59-06 and 59-07 depend on these)

STATE.md `**Status:**` (em dash `—`, exact):

| Position | Status text | `status` key (state.json, `--raw`) |
|---|---|---|
| D < T | `Executing objective N — D/T TRDs complete` | `executing` |
| D = T | `Objective N executed — T/T TRDs complete, ready for verification` | `ready_for_verification` |

`N` is the objective number with leading zeros stripped (`07` -> `7`, `04.1` -> `4.1`).

`--objective` JSON output (`status` in local mode; store mode adds `target: "state.json"` and `note`):

```json
{ "advanced": true, "objective": "07", "previous_job": 0, "current_job": 2, "total_jobs": 4,
  "status": "executing", "status_text": "Executing objective 7 — 2/4 TRDs complete", "state_md_updated": true }
```

- `objective` is the directory's number as on disk (`"07"`); `advanced` is `current_job > previous_job` for the same objective in state.json.
- Rewritten in STATE.md only where the field already exists: `**Status:**`, `**Current Job:**`, `**Total Jobs in Objective:**`, `**Last Activity:**`. None is ever added; the narrative schema's only rewritten line is `**Status:**` (plus Last Activity when present). `state_md_updated` is false on an idempotent rerun and always in store mode.
- state.json gets `current_objective` (`"07"`), `current_job`, `total_jobs`, `status`, `last_activity`.
- Other results: `{advanced:false, reason:"no_position", hint}` (no `--objective`, no total > 0; hint names `--objective`); `{advanced:false, reason:"no_trds", objective}` (objective directory exists, no TRDs); exit 1 `Error: objective N not found under .planning/objectives` (no directory); exit 1 `state advance-job --objective requires an objective number, e.g. --objective 59` (flag with no value or followed by `--`). `--raw` prints the status key.
- Legacy path (no `--objective`, total > 0) is byte-identical: `Ready to execute` / `Objective complete — ready for verification`, same output keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The "no counters at all" case reports no_position instead of an error object**
- **Found during:** Task 2 (test 3b)
- **Issue:** The TRD pseudo-code placed the `totalJobs <= 0` guard after the NaN check, which kept the `{error: 'Cannot parse ...'}` answer for a project with no counters, while the must-have truth says "no usable position (state.json 0/0, or no counters) ... reports `reason: no_position`".
- **Fix:** One guard covers NaN and `totalJobs <= 0`. Nothing pinned the old error text (no test in state.test.cjs, planning-audit or the agent-shell harness reads it).
- **Files modified:** plugins/devflow/devflow/bin/lib/state.cjs
- **Commit:** 0e0852a1

**2. [Rule 2 - Missing correctness] Local calendar date for the disk-derived path**
- **Found during:** Task 2
- **Issue:** The legacy body stamps `new Date().toISOString().split('T')[0]` (the UTC day, a day ahead each evening in the Americas); helpers already provide `localDate()` for dates a human reads as "today".
- **Fix:** The new path uses `localDate()`. The legacy path is deliberately left byte-identical (the other UTC sites are tracked as deferred in CLAUDE.md).
- **Files modified:** plugins/devflow/devflow/bin/lib/state.cjs
- **Commit:** 0e0852a1

**3. [Additive] Extra tests beyond the 13 named**
- 3b (no counters), 7b (a SUMMARY landing between runs reports the previous count), 13b (legacy last-job path unchanged) and 14 (the pre-59 `(cwd, raw)` call shape) were added; 13b and 14 passed before GREEN as controls, like 13.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "...positionProject({...}); readdirSync(...)"` lists `07-01-SUMMARY.md,07-01-TRD.md,07-02-TRD.md` | 0 | PASS |
| 2: Disk-derived advance-job | `node --test lib/state-advance-job.test.cjs lib/state.test.cjs lib/help.test.cjs` (63 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/state-advance-job.test.cjs` (17 tests: 14 fail, 3 controls pass) | 1 | FAIL (correct) |
| GREEN | `node --test lib/state-advance-job.test.cjs lib/state.test.cjs lib/help.test.cjs` (63 pass) | 0 | PASS (correct) |

RED detail: 1, 2, 3, 3b, 4-12 (incl. 7b) failed for the right reason (flag ignored; test 3 reproduced the reported bug: 0/0 -> `last_job`); 13, 13b and 14 (legacy controls) passed. No REFACTOR phase.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test lib/state-advance-job.test.cjs lib/state.test.cjs lib/help.test.cjs` | 0 | PASS (63/63; state.test.cjs unchanged) |
| test (full) | `npm test` | 1 | BASELINE (9755 tests, 9692 pass, 13 fail, 50 skipped) |

The 13 failures are not introduced by this TRD. Two are the documented baseline (roadmap-reconcile E2E1; stack-drafter-fleet github-enterprise-migration). The other 11 are the devflow-watch daemon family (`devflow-watch.test.cjs` start/foreground and multi-project CLI, and `handoff-e2e.test.cjs` "handoff pipeline — end-to-end" incl. LK-1/LK-2): the foreground daemon never writes its PID file in this sandbox. With this TRD's `state.cjs`, `df-tools.cjs` and `help.cjs` changes stashed, `devflow-watch.test.cjs` fails the same three start/foreground tests (`PID file should be created`); the two multi-project start tests failed only under full-suite load and passed in that isolated baseline run. Neither `devflow-watch.cjs` nor `handoff-e2e.test.cjs` references `state.cjs`, `advance-job` or `df-tools`. The handoff-e2e file itself was not re-run at baseline; it is attributed to the same daemon failure by its shared `withDaemon` dependency and its non-overlap with the changed files.

## Discovered commands

None (profile `general`: `npm test`, scoped `node --test {files}`; no lint/build/typecheck).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/state-position-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/state-advance-job.test.cjs
- FOUND: commits a4b79cb2, ffd192c3, 0e0852a1

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (disk-derived Status, no_position guard, legacy path unchanged, store mode writes state.json only)
- Gate failures: none attributable to this TRD (baseline and sandbox daemon failures listed above)
