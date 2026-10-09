---
objective: 58-estimation-engine-and-surfacing
job: "05"
subsystem: estimation
tags: [estimate, calibration, confidence, trd-composition, comonotonic]

requires: [58-01]
provides:
  - "estimate.cjs: loadCalibration, estimateTask, estimateTrdText/estimateTrd, overallConfidence, confidenceFor over calibration.json"
  - "estimate-fixtures.cjs: CAL_V2 literal calibration plus makeCalibration, writeCalibrationFile, makeEstimateProject, removeEstimateProject"
affects: [58-06 estimate-rollup, 58-07 milestone rollup, 58-08 estimate CLI]

tech-stack:
  added: []
  patterns:
    - "One classifier: estimateTask calls calibration-inputs.classifyTask, the function calibrate used"
    - "Confidence from sample counts, thin classes fall back to the all-tasks figures visibly and are capped at low"
    - "No data, no number: null plus a missing list, never 0 and never another metric"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate.cjs
    - plugins/devflow/devflow/bin/lib/estimate.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
  modified: []

key-decisions:
  - "A metric absent from a calibration is null and listed in `missing`; the sample count and confidence of a task cover the metrics that are present"
  - "overallConfidence ties go to the larger p50 then the earlier component; a component with a null p50 has an unknown share and always counts; n/a components are ignored; nothing to judge is {confidence: 'n/a', weakest: null}"
  - "A TRD with no auto tasks has confidence 'none' (no estimate), distinct from n/a"
  - "autonomous: false marks a TRD human_wait even with no checkpoint task"

requirements-completed: [EST-02, EST-03]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-05
tokens_input: 6898069
tokens_output: 71143
tokens_cache_read: 6748384
tokens_cache_write: 149581
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 58 TRD 05: Task and TRD estimates Summary

**estimateTask returns median and P90 minutes, tokens and dollars for one task with a sample count and an honest confidence label, using the calibrator's own classifier; estimateTrd composes a TRD's auto tasks quantile by quantile and names its weakest task.**

## Progress
- [x] Task 1: Estimate fixtures, calibration loading, confidence and estimateTask — RED ebc43a68, GREEN adb8b2a9
- [x] Task 2: TRD composition, overall confidence and TRD lookup — RED 03bab02e, GREEN 6c62698b

## Exported API (`plugins/devflow/devflow/bin/lib/estimate.cjs`)

Nothing is rounded in the module; the CLI (58-08) rounds once, at output. A stat is `{p50, p90, n}`.

- `CONFIDENCE_LEVELS` = `['none', 'low', 'medium', 'high']`; `MIN_CLASS_SAMPLES` = 5.
- `confidenceFor(n)`: none at 0 (or not a count), low 1-9, medium 10-29, high 30+.
- `loadCalibration(file, env = process.env)` -> `{ok: true, calibration, path}` or `{ok: false, reason}`; never throws. Path is `file`, else `calibrator.defaultCalibrationPath(env)`. Reasons name the fix: no file (`run df-tools calibrate to build it`), unreadable (read error, bad JSON, not an object, no `task_classes.all`), unsupported version (reads 1 and 2), classifier-version mismatch (names both versions).
- `metricFor(cal, cls, metric)` -> `{stat, basis, class_n}`: the class's stat when it has at least 5 samples, else the `all` stat with `basis: 'all'`, else `stat: null`.
- `estimateTask(cal, task)`: `task` is `{files, tdd, type, trdType}` (classified by `ci.classifyTask`) or `{class}` (validated against `ci.TASK_CLASSES`, throws listing them). Result:
  `{class, classifier_version, basis ('class'|'all'), class_samples, minutes, tokens_input, tokens_output, cost_usd (each {p50, p90, n} or null), samples (smallest n among present metrics), confidence, human_wait, notes, missing}`. Any metric that fell back sets `basis: 'all'`, adds one note per sample count naming the class and count, and caps confidence at low. A `checkpoint` task is `{class: 'checkpoint', human_wait: true, every metric {p50: 0, p90: 0}, confidence: 'n/a', basis/class_samples/samples null}`.
- `overallConfidence(components)` -> `{confidence, weakest}`; a component is `{name, label, p50, class?, n?, status?}` and `weakest` is that object itself. Lowest label among components worth at least 10% of the summed p50 (all of them when the total is zero or null).
- `estimateTrdText(cal, text, {id, path})` -> `{id, path, wave, depends_on, autonomous, gap_closure, trd_type, tasks: [{name, ...task estimate}], minutes, tokens_input, tokens_output, cost_usd (each {p50, p90} or null), confidence, weakest (a task component {name, label, p50, class, n} or null), human_wait, notes, missing}`. Auto tasks add via `sumComonotonic`; a metric any auto task lacks is null and in `missing`. Frontmatter is normalised (wave `parseInt || 1`, autonomous false only for false/'false', gap_closure true only for true/'true', depends_on array else []).
- `resolveTrd(cwd, ref)` -> `{id, path (absolute)}`: a ref ending `-TRD.md` / `-JOB.md` is a path relative to cwd, `NN-MM` is looked up through `findObjectiveInternal` and `trdKey`. Throws `TRD <ref> not found`, or names the accepted forms for a malformed ref.
- `estimateTrd(cal, cwd, ref)`: `resolveTrd` then `estimateTrdText`.

Fixtures (`__fixtures__/estimate-fixtures.cjs`): `CAL_V2` (deep-frozen literal, the TRD's table plus `trd_level.tasks`, `objective_level.tasks`, `agent_overhead_sources`), `EMPTY_STAT`, `makeCalibration(overrides)` (deep merge, `undefined` deletes a key), `writeCalibrationFile(dir, obj)`, `taskElement`, `trdText`, `makeEstimateProject(spec)` / `removeEstimateProject(root)`. 58-06 and 58-07 add their projects to it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures, loading, confidence, estimateTask | `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` (tests 1, 1b, 2, 3, 3b, 4: 6 of 6) | 0 | PASS |
| 2: TRD composition, overallConfidence, lookup | `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` (14 of 14: tests 1-10 plus 1b, 3b, 5b, 8b) | 0 | PASS |
| 2: fixtures-directory literal grep | `rg -n "_{2}fixtures_{2}" plugins/devflow/devflow/bin/lib/estimate.cjs` | 1 (no matches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1, ebc43a68) | `node --test .../estimate.test.cjs` | 1 (6 of 6 fail: `est.loadCalibration is not a function`, `est.estimateTask is not a function`, `CONFIDENCE_LEVELS` undefined; stub `module.exports = {}`) | FAIL (correct) |
| GREEN (task 1, adb8b2a9) | `node --test .../estimate.test.cjs` | 0 (6 of 6 pass) | PASS (correct) |
| RED (task 2, 03bab02e) | `node --test .../estimate.test.cjs` | 1 (8 of 14 fail: tests 5, 5b, 6, 7, 8, 8b, 9, 10; tests 1-4 still pass) | FAIL (correct) |
| GREEN (task 2, 6c62698b) | `node --test .../estimate.test.cjs` | 0 (14 of 14 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs .../estimate-math.test.cjs .../calibration-inputs.test.cjs` | 0 (103 of 103) | PASS |
| test | `npm test` | 1 (9577 tests, 9514 pass, 13 fail, 50 skipped) | FAIL, none in this TRD's files (see below) |
| lint / build | none in the stack profile | n/a | not_available |

The 13 `npm test` failures, none touching estimate or the files this TRD added:
- 1 `roadmap-reconcile` E2E1 and 1 `stack-drafter-fleet` github-enterprise-migration (the second reported as "stack init against the real fleet"): both named as known baseline failures in the TRD.
- 3 `devflow-watch start (foreground)` tests (PID file written, stale PID file, already running) and 2 `multi-project CLI` (C-1, C-2): every one needs the watcher daemon to write its PID file.
- 6 `handoff pipeline end-to-end` (write pending, disallowed command, idempotency, multi-record, LK-1, LK-2): same daemon dependency. 58-01 saw five of these six; LK-1 (teardown reaps the daemon) is the extra one and belongs to the same family. All of these are worktree-environment effects (no node-pty in the worktree) that the objective's constraints list as baseline; this TRD adds three files that nothing else loads.

## Deviations from Plan

None - TRD executed exactly as written. Additions inside the TRD's scope:
- Extra tests beyond the ten in the list: 1b (path from the injected env, absent file), 3b (a class missing from the calibration, a metric with no samples anywhere, a calibration with nothing), 5b (frontmatter normalisation), 8b (misaligned `<files>` elements reported), and extra cases inside 1, 8, 9 (array and unusable-calibration files, a TRD of checkpoints only, tie-breaking, unknown share, n/a, empty input).
- `loadCalibration` also rejects a calibration with no `task_classes.all` block (a trust-boundary check the TRD did not list) and a JSON file that is not an object.
- `estimateTrdText` adds a note when `readTrdTasks` reports `task_files_misaligned`, so a TRD whose tasks are all classed `other` for lack of files says so.
- The task 1 RED commit carries a stub `estimate.cjs` (`module.exports = {}`) so the failures are per-test rather than one MODULE_NOT_FOUND.
- `makeEstimateProject` also writes `.planning/config.json` and `ROADMAP.md` and an `OBJECTIVE.md` per the shape in the TRD; the fixture file additionally exports `EMPTY_STAT`, `taskElement` and `trdText`.

Decisions made where the TRD was silent (all in the key-decisions list above): per-task `samples` covers only metrics that are present, so a missing cost does not turn a well-sampled task's confidence into none; weakest ties go to the larger share then the earlier component (matches 58-07's "weakest 81, the largest share" expectation); a TRD with no auto tasks is `none`.

## Discovered commands

None - the profile's `test` and scoped-test commands were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (calibrator classifier reused and equal for every task; confidence high at 30, medium 10-29, low 1-9, none 0 and a fallback capped at low; missing, unreadable, unsupported and classifier-mismatched calibrations each give a reason naming the fix; TRD_A 12/36 minutes, 2.8/4.4 dollars, TRD_MIX 15/41 and TRD_CP 6/18 with human wait excluded; TRD confidence from tasks worth at least 10% and weakest named)
- Gate failures: `npm test` shows 13 failures outside this TRD (listed above); the scoped test gate is clean

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
- FOUND commits: ebc43a68, adb8b2a9, 03bab02e, 6c62698b
