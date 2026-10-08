---
objective: 58-estimation-engine-and-surfacing
trd: "05"
type: standard
wave: 2
depends_on: ["58-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate.cjs
  - plugins/devflow/devflow/bin/lib/estimate.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
autonomous: true
requirements: [EST-02, EST-03]
must_haves:
  truths:
    - "estimateTask classifies with calibration-inputs.classifyTask (the calibrator's classifier) and returns median and P90 minutes, tokens_input, tokens_output and cost_usd with the sample count and a confidence label"
    - "Confidence is high at n >= 30, medium at 10-29, low at 1-9 and none at 0; a class with fewer than 5 samples for a metric falls back to the all-tasks figures, says so, and is capped at low"
    - "A missing calibration file, an unreadable one, an unsupported version or a classifier-version mismatch gives an explicit 'no estimate' reason naming the fix, never invented numbers"
    - "estimateTrd composes a TRD's auto tasks by adding their quantiles (tasks of one TRD move together); checkpoint tasks add nothing and mark the TRD as excluding human wait"
    - "A TRD's confidence is the lowest label among tasks contributing at least 10% of its median minutes, and it names the weakest task"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate.cjs
      provides: "CONFIDENCE_LEVELS, MIN_CLASS_SAMPLES, confidenceFor, overallConfidence, loadCalibration, estimateTask, estimateTrdText, resolveTrd, estimateTrd"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
      provides: "CAL_V2 literal calibration, makeCalibration, writeCalibrationFile, makeEstimateProject, removeEstimateProject"
  key_links:
    - "estimate.estimateTask -> calibration-inputs.classifyTask / TASK_CLASSES / CLASSIFIER_VERSION (57-02)"
    - "estimate.estimateTrdText -> calibration-inputs.readTrdTasks and estimate-math.fitQuantiles / sumComonotonic (58-01)"
    - "estimate.loadCalibration -> calibrator.defaultCalibrationPath (DEVFLOW_CALIBRATION_PATH or ~/.claude/devflow/calibration.json)"
---

# TRD 58-05: Task and TRD estimates (EST-02, EST-03)

<objective>
The estimator's core: read calibration.json, classify a task exactly as the calibrator did, return its median and P90
minutes, tokens and dollars with the sample count and an honest confidence label (EST-02), and compose a TRD from its
tasks (the first level of EST-03).

Honesty rules, all tested:

- **Same classifier.** `estimateTask` calls `calibration-inputs.classifyTask` and refuses a calibration built with a
  different `CLASSIFIER_VERSION`.
- **Labels from sample counts.** high >= 30, medium 10-29, low 1-9, none 0.
- **Thin classes fall back, visibly.** A class with fewer than `MIN_CLASS_SAMPLES` (5) for a metric uses the `all`
  figures for that metric, records `basis: 'all'` and `class_samples`, adds a note, and is capped at low.
- **No data, no number.** Missing or unusable calibration returns `{available: false, reason}`; a metric with no samples
  anywhere is null and listed in `missing`.
- **Tasks inside a TRD add quantile by quantile** (`sumComonotonic`): calibration split each TRD's outcome equally
  across its tasks, so they are perfectly correlated by construction.

Library functions return unrounded numbers; the CLI (58-08) rounds once, at output.

Purpose: EST-02 and the TRD layer of EST-03.
Output: estimate.cjs (+ test) and the estimate fixtures 58-06 and 58-07 extend.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── estimate.cjs                         ← CREATE
├── estimate.test.cjs                    ← CREATE
└── __fixtures__/estimate-fixtures.cjs   ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-05): ...` RED, then `feat(58-05): ...`. The fixture builder is committed with the first RED.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- Fixtures are hand-built literals (no generated data, no property-based tests). Calibration files are written into
  mkdtemp dirs and passed by explicit path; never read or write the real `~/.claude/devflow/calibration.json`.
- Same wave: 58-03 owns calibrator.cjs / calibrate-cli.cjs / help.cjs / df-tools.cjs. Do not touch them; this TRD only
  reads calibration.json's documented keys (version 2 adds `agent_overhead` and `objective_level`, used from 58-06).

## Test list

Outermost first; `estimate.test.cjs`. `CAL` = `CAL_V2` from the fixture (literal values below).

`CAL_V2` (stat blocks are `{n, p50, p90, min, max}`; min/max are literal too, any values with min <= p50 <= p90 <= max):

| block | minutes | tokens_input | tokens_output | cost_usd |
|---|---|---|---|---|
| task_classes.all (samples 120) | n 120, 5 / 15 | n 90, 3000000 / 6000000 | n 90, 30000 / 60000 | n 90, 1.5 / 3 |
| task_classes.code_tdd (samples 40) | n 32, 6 / 18 | n 30, 3600000 / 6400000 | n 30, 29000 / 48000 | n 30, 1.4 / 2.2 |
| task_classes.doc (samples 12) | n 12, 4 / 8 | n 10, 2000000 / 4000000 | n 10, 15000 / 30000 | n 10, 0.8 / 1.6 |
| task_classes.prompt (samples 6) | n 6, 3 / 12 | n 6, 2500000 / 5000000 | n 6, 20000 / 45000 | n 6, 0.9 / 2 |
| task_classes.config (samples 2) | n 2, 1 / 2.5 | n 2, 900000 / 1200000 | n 2, 8000 / 9000 | n 2, 0.3 / 0.4 |
| trd_level (samples 40) | n 40, 12 / 45 | n 40, 8000000 / 15000000 | n 40, 60000 / 110000 | n 40, 2.9 / 5.6 |
| agent_overhead.planner (samples 25) | n 25, 8 / 20 | n 25, 4000000 / 9000000 | n 25, 40000 / 90000 | n 25, 2 / 4.5 |
| agent_overhead.job-checker (samples 20) | n 20, 3 / 7 | n 20, 1500000 / 3000000 | n 20, 12000 / 25000 | n 20, 0.6 / 1.2 |
| agent_overhead.verifier (samples 31) | n 31, 4 / 10 | n 31, 2000000 / 5000000 | n 31, 15000 / 35000 | n 31, 0.9 / 2 |
| agent_overhead.integration-checker (samples 4) | n 4, 6 / 9 | n 4, 2500000 / 3000000 | n 4, 20000 / 25000 | n 4, 1.1 / 1.5 |
| objective_level (samples 40) | n 30, 45 / 150 | n 25, 30000000 / 80000000 | n 25, 250000 / 600000 | n 25, 14 / 40 |

Plus `version: 2`, `classifier_version: 1`, `data_as_of: '2026-10-05'`, `samples: {trds: 50, tasks: 120, with_tokens: 40}`,
`probabilities: {gap_closure: {value: 0.1, n: 40}, checkpoint: {value: 0.02, n: 50}}`, `agent_overhead` blocks with
samples 0 for `objective-researcher` and `roadmapper`, `objective_level.trds` `{n: 40, p50: 5, p90: 10, ...}`.

1. `loadCalibration(file)`: a missing file gives `{ok: false, reason}` containing `run df-tools calibrate`; malformed
   JSON gives a reason containing `unreadable`; `version: 3` names the version; `classifier_version: 99` names 99 and the
   current version; `CAL_V2` written to a temp file gives `{ok: true, calibration, path}`; a version 1 file (CAL_V2 with
   `version: 1` and no `agent_overhead` / `objective_level`) is also ok. With no file argument the path comes from
   `env.DEVFLOW_CALIBRATION_PATH` (env injected).
2. `confidenceFor`: 0 none, 1 low, 9 low, 10 medium, 29 medium, 30 high. `CONFIDENCE_LEVELS` is
   `['none', 'low', 'medium', 'high']`.
3. `estimateTask(CAL, {files: ['lib/a.cjs', 'lib/a.test.cjs'], tdd: true})`: class `code_tdd`, basis `class`, minutes
   `{p50: 6, p90: 18, n: 32}`, cost_usd `{p50: 1.4, p90: 2.2, n: 30}`, `samples` 30 (smallest n among the four metrics),
   confidence high. `{files: ['docs/x.md']}`: doc, samples 10, medium. `{files: ['package.json']}`: config falls back:
   basis `all`, `class_samples` 2, minutes 5 / 15, confidence low, a note naming config and 2 samples. `{class: 'prompt'}`:
   samples 6, low. `{class: 'nope'}` throws an Error listing the valid classes. `{type: 'checkpoint:human-verify'}`:
   class `checkpoint`, `human_wait: true`, every metric `{p50: 0, p90: 0}`, confidence `n/a`.
4. For three literal tasks, `estimateTask(CAL, t).class === ci.classifyTask(t)`.
5. `estimateTrdText(CAL, TRD_A)` (TRD_A: wave 1, type standard, two `tdd="true"` tasks with files `lib/a.cjs,
   lib/a.test.cjs` and `lib/b.cjs`): minutes `{p50: 12, p90: 36}`, cost_usd `{p50: 2.8, p90: 4.4}`, tokens_input
   `{p50: 7200000, p90: 12800000}`, confidence high, 2 tasks, `wave` 1, `autonomous` true, `human_wait` false.
6. TRD_MIX (code_tdd, doc, config tasks): minutes p50 15 (6 + 4 + 5), p90 41 (18 + 8 + 15); confidence low with
   `weakest` naming the config task (its 5 of 15 minutes is 33%, at least 10%).
7. TRD_CP (`autonomous: false`; one code_tdd auto task and one `checkpoint:human-verify`): minutes 6 / 18,
   `human_wait: true`, a note `human wait not included`.
8. A TRD with no auto tasks: every metric null, note `no auto tasks`. A calibration whose `cost_usd` n is 0 in every
   class: the TRD's `cost_usd` is null and `missing` is `['cost_usd']`; minutes are still present.
9. `overallConfidence([{name, label, p50}, ...])`: a 5% component labelled low does not lower a high result; a 12%
   component labelled medium does; with a zero or null total the lowest label among all components wins.
10. `estimateTrd(CAL, root, '80-01')` over `makeEstimateProject` gives the same numbers as test 5 with `id: '80-01'`;
    `estimateTrd(CAL, root, <path to the TRD file>)` works too; `'80-09'` throws `TRD 80-09 not found`.

<embedded_context>

<codebase_examples>
calibration-inputs.cjs (57-02), used as is:

```js
const ci = require('./calibration-inputs.cjs');
ci.readTrdTasks(text)   // {frontmatter, tasks: [{name, type, tdd, files}], task_files_misaligned}; tdd is the EFFECTIVE flag
ci.classifyTask({ files, tdd, type, trdType })   // one of ci.TASK_CLASSES, 'checkpoint' for checkpoint:* tasks
ci.TASK_CLASSES, ci.CLASSIFIER_VERSION           // classes include `${kind}` and `${kind}_tdd` for every kind
```

calibrator.cjs: `defaultCalibrationPath(env = process.env)` -> `env.DEVFLOW_CALIBRATION_PATH || <HOME>/.claude/devflow/
calibration.json`, HOME read per call.

estimate-math.cjs (58-01): `fitQuantiles({p50, p90})`, `sumComonotonic(dists)`, `summarize(dist)`; a null member makes a
sum null.

Objective lookup and TRD pairing:

```js
const { findObjectiveInternal } = require('./objective.cjs');   // {found, directory (relative), jobs: [TRD files], summaries, incomplete_jobs}
const { trdKey } = require('./helpers.cjs');                    // '80-01-parser-TRD.md' -> '80-01'
```

Fixture shape to copy: calibration-fixtures.cjs (57-02) writes literal TRD text (`taskElement`, `trdText`) into mkdtemp
projects. `makeEstimateProject(spec)` takes `{name, objectives: [{dir, trds: [{nn, slug, frontmatter: {type, wave,
depends_on, autonomous, gap_closure}, tasks: [{name, type, tdd, files}], summary: 'complete' | 'checkpoint' | null}],
objectiveMd}], config, roadmap}` and writes `.planning/objectives/<dir>/<num>-<nn>-<slug>-TRD.md`, a SUMMARY with
`## Self-Check: PASSED` for 'complete' or with only `## Progress` for 'checkpoint', optional `OBJECTIVE.md`,
`.planning/config.json` and `.planning/ROADMAP.md`. 58-06 and 58-07 add projects to it; keep it data-driven.
</codebase_examples>

<anti_patterns>
- A private copy of the classifier regexes. A drift between calibrate and estimate classes would silently mislabel
  estimates; call `ci.classifyTask`.
- Defaulting a missing metric to 0 or to another metric. Missing is null plus `missing: [...]`.
- Rounding inside estimate.cjs (the CLI rounds at output).
- The literal double-underscore fixtures directory name in estimate.cjs: gh-project.test.cjs (X2) fails any non-test lib
  module whose source contains it.
</anti_patterns>

<error_recovery>
- If test 5's cost is 2.8000000000000003, compare with a tolerance (abs 1e-9); the sums are floating point.
- If `readTrdTasks` reports `task_files_misaligned` for a fixture TRD, the fixture's `<files>` element is malformed;
  compare with calibration-fixtures.cjs `taskElement`.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
@.planning/objectives/57-estimation-data-foundation/57-05-SUMMARY.md
</context>

<gotchas>
- `readTrdTasks(text).frontmatter` values may be strings (`'false'`, `'1'`): normalise `autonomous` (false only for
  `false` / `'false'`), `wave` (`parseInt(..., 10) || 1`), `gap_closure` (true only for `true` / `'true'`), and
  `depends_on` (array, else []).
- `overallConfidence` share uses minutes p50. Components with a null p50 are ignored for the share but still listed;
  `n/a` (checkpoint) never lowers the result. A component is `{name, label, p50, class?, n?, status?}` and `weakest`
  is the chosen component object itself (null when there is none); 58-06, 58-07 and the 58-08 formatter rely on this
  shape. Inside a TRD, a task component is `{name: <task name>, label, p50, class, n: samples}`, and the TRD result's
  `weakest` is that task's component.
- The fallback cap: a component with `basis: 'all'` is at most `low`, even when `all` has n >= 30.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Estimate fixtures, calibration loading, confidence and estimateTask</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs, plugins/devflow/devflow/bin/lib/estimate.cjs, plugins/devflow/devflow/bin/lib/estimate.test.cjs</files>
  <action>
Fixture builder first: estimate-fixtures.cjs with `CAL_V2` (deep-frozen literal from the Test list table),
`makeCalibration(overrides)` (deep copy merged with overrides), `writeCalibrationFile(dir, obj)` (JSON, returns path),
`makeEstimateProject(spec)` / `removeEstimateProject(root)` (shape in codebase_examples; realpath'd mkdtemp root).

RED: tests 1-4. Commit (fixture + tests) `test(58-05): task estimates with sample counts and confidence`.

GREEN in estimate.cjs:
1. `CONFIDENCE_LEVELS`, `MIN_CLASS_SAMPLES = 5`, `confidenceFor(n)`.
2. `loadCalibration(file, env = process.env)`: path = file or `calibrator.defaultCalibrationPath(env)`; reasons per
   test 1. Supported versions: 1 and 2.
3. `metricFor(cal, cls, metric)`: the class block's stat when its `n >= MIN_CLASS_SAMPLES`, else `all`'s with
   `basis: 'all'`; null stat when `all` has n 0.
4. `estimateTask(cal, task)`: `{class}` validated against `ci.TASK_CLASSES` (throw listing them) or classified via
   `ci.classifyTask`. Checkpoint per test 3. Otherwise `{class, classifier_version, basis, class_samples, minutes,
   tokens_input, tokens_output, cost_usd (each {p50, p90, n} or null), samples, confidence, notes, missing}` with the
   fallback cap.
Commit `feat(58-05): estimateTask classifies and labels confidence`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` passes tests 1-4.</verify>
  <done>Tests 1-4 pass after a recorded RED; estimateTask and calibrate share one classifier.</done>
  <recovery>If `calibrator.cjs` cannot be required (58-03 is mid-change in a parallel worktree), it is the committed version from 57 at this wave's base; `defaultCalibrationPath` exists there. Do not edit calibrator.cjs.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TRD composition, overall confidence and TRD lookup</name>
  <files>plugins/devflow/devflow/bin/lib/estimate.cjs, plugins/devflow/devflow/bin/lib/estimate.test.cjs</files>
  <action>
RED: tests 5-10 (TRD_A, TRD_MIX, TRD_CP as literal strings in the test; test 10 uses `makeEstimateProject` with objective
`80-alpha` holding TRD_A as `80-01-parser-TRD.md`). Commit `test(58-05): TRD estimates compose their tasks`.

GREEN:
1. `overallConfidence(components)` -> `{confidence, weakest}` per gotchas.
2. `estimateTrdText(cal, text, {id, path} = {})`: `ci.readTrdTasks`; normalised frontmatter; per task `estimateTask`
   with `trdType: fm.type`; for each metric `sumComonotonic` of `fitQuantiles` over auto tasks, then `summarize`. Return
   `{id, path, wave, depends_on, autonomous, gap_closure, trd_type, tasks: [{name, ...estimate}], minutes,
   tokens_input, tokens_output, cost_usd, confidence, weakest, human_wait, notes, missing}`.
3. `resolveTrd(cwd, ref)`: a ref ending in `-TRD.md` (or `-JOB.md`) is a path (relative to cwd); otherwise `NN-MM`:
   `findObjectiveInternal(cwd, <NN>)` then the plan file whose `trdKey` equals the ref; throw `TRD <ref> not found`.
   `estimateTrd(cal, cwd, ref)` reads it and calls `estimateTrdText`.
Commit `feat(58-05): estimateTrd composes task estimates`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` passes all 10 tests. `rg -n "_{2}fixtures_{2}" plugins/devflow/devflow/bin/lib/estimate.cjs` prints nothing.</verify>
  <done>Tests 1-10 pass; tests 5-10 went RED then GREEN.</done>
  <recovery>If `findObjectiveInternal` does not find the fixture objective, check the dir name starts with the padded number (`80-alpha`) and that `.planning/objectives/` is directly under the root passed as cwd.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/estimate-math.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-02 (library half): `estimateTask` returns median/P90 minutes, tokens and dollars, with a sample count and label.
- EST-03 (TRD layer): `estimateTrd` composes its tasks and reports confidence and the weakest task.
- No path in estimate.cjs reaches the real calibration file during tests (every test passes a temp path or env).
</verification>

<success_criteria>
- estimate.test.cjs passes 10/10.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the task and TRD result shapes; 58-06 and 58-08 consume them.
</output>
