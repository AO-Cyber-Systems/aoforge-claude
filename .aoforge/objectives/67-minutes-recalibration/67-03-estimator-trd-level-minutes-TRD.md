---
objective: 67-minutes-recalibration
trd: "03"
type: standard
wave: 2
depends_on: ["67-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/estimate.cjs
  - plugins/devflow/devflow/bin/lib/estimate.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "With a calibration whose `method.minutes` is `trd_level`, every TRD with at least one auto task gets exactly the calibration's `trd_level.minutes` p50 and P90 as its minutes, whatever its task count or classes; a one-task and a three-task TRD get the same minutes"
    - "Tokens and cost of a TRD stay the per-task quantile sum under both methods, and objectives compose TRD minutes as before (correlated sum, rho 0.5), so `execution.agent_minutes` of a two-TRD objective is the correlated sum of two trd_level distributions"
    - "A version 1 or 2 calibration, or a version 3 one with `method.minutes: task_sum`, estimates exactly as today; the only additions to a TRD estimate are `minutes_basis` and `minutes_samples`"
    - "`loadCalibration` accepts versions 1, 2 and 3, refuses a version 3 file without a `method` block or with an unknown minutes method, and names `df-tools calibrate` in every reason; the 2.14.0 estimator's refusal of version 3 is the intended guard against a silent misread"
    - "Every `df-tools estimate` result carries `calibration.method` (the file's block, or null for a file that has none), the run state of `estimate start` records it beside `inputs_digest`, and the text output names the minutes method whenever the file has one"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate.cjs
      provides: "SUPPORTED_VERSIONS [1, 2, 3], KNOWN_MINUTES_METHODS, minutesMethod(cal), trd_level TRD minutes, minutes_basis / minutes_samples, the confidence cap"
      contains: "trd_level"
    - path: plugins/devflow/devflow/bin/lib/estimate-cli.cjs
      provides: "calibration.method in every result and in the run state"
      contains: "method"
    - path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
      provides: "the calibration sentence naming the minutes method"
      contains: "minutes"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
      provides: "makeCalibrationV3: a hand-built version 3 calibration fixture"
      contains: "makeCalibrationV3"
  key_links:
    - "calibration v3 method.minutes (67-02) -> estimate.minutesMethod -> estimateTrdText minutes -> estimate-rollup.estimateObjective execution.agent_minutes -> run state / backtest / rolling harness"
    - "estimate-cli loadOnce meta.method -> JSON results, run state calibration block, estimate-format calibration sentence"
---

# TRD 67-03: The estimator takes a TRD's minutes from TRD-level history when the calibration says so (EST-10)

## Precondition (read first)

`node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/decisions/resolved/DECISION-003.md --field status`
prints `resolved`. If not, stop.

<objective>
Teach the estimator the method DECISION-003 names. A calibration version 3 carries
`method: {minutes: 'task_sum'|'trd_level', window_objectives, through_objective}` (67-02 writes it, in parallel; this
TRD reads it from hand-built fixtures). With `trd_level`, a TRD's minutes are the calibration's `trd_level.minutes`
distribution instead of the quantile sum of its tasks' minutes, so the estimate stops growing with the task count.
Everything else (tokens, cost, task estimates, the objective composition, overhead) is unchanged.

The installed 2.14.0 estimator refuses version 3 ("reads versions 1 and 2"): that is the guard that stops an old
runtime from silently summing tasks over a `trd_level` calibration. SC-4 is met only after the release (67-06 to 67-09)
puts this code in the installed plugin.

Purpose: the estimator half of the method; the output names which method produced every number.
Output: estimate.cjs, estimate-cli.cjs, estimate-format.cjs changes with tests; a v3 fixture builder.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/OBJECTIVE.md
@.planning/decisions/resolved/DECISION-003.md

Applied user playbook (~/.claude/CLAUDE.md, TDD & Quality): strict TDD, one failing test at a time.

## Binding rules
- Use the repository df-tools. One plain command per Bash call (this TRD runs in a worktree beside 67-02).
- Do not touch `calibrator.cjs`, `calibration-inputs.cjs`, `calibrate-cli.cjs`, `help.cjs`, `df-tools.cjs`,
  `__fixtures__/calibration-fixtures.cjs` or any script (67-02 owns them in this wave). Keep the minutes-method list
  local to estimate.cjs (`KNOWN_MINUTES_METHODS`); 67-05 adds the test that it equals `calibrator.MINUTES_METHODS`.
- Never read or write `~/.claude/devflow/calibration.json` or the real run-state directory: tests pass `--calibration
  <tmp file>` and set `DEVFLOW_ESTIMATE_STATE_DIR` / HOME to temp directories, as the existing CLI tests do.
- Score nothing. No `estimate backtest` on real objectives, no `scripts/estimate-*.cjs` run.
- Strict TDD; hand-built fixtures only (`makeCalibration` overrides and the new `makeCalibrationV3`); no generated data,
  no property-based library, no `.feature` files.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never use port 8080.
</context>

## Design (fixed here)

**estimate.cjs**
- `SUPPORTED_VERSIONS = [1, 2, 3]` (its refusal reason then reads `reads versions 1, 2 and 3`: join with `, ` and a
  final ` and `). `KNOWN_MINUTES_METHODS = Object.freeze(['task_sum', 'trd_level'])`, exported.
- `loadCalibration`, after the version and classifier checks: a version 3 file must have a plain-object `method` whose
  `minutes` is in `KNOWN_MINUTES_METHODS`. No block → `unreadable('version 3 without a method block')`. Unknown minutes →
  `{ok: false, reason: 'calibration file <target> names minutes method <JSON>, which this estimator does not know; update DevFlow or run df-tools calibrate'}`.
  Versions 1 and 2 need no `method`.
- `minutesMethod(cal)` (exported): `cal.method.minutes` when the block exists, else `'task_sum'`.
- `estimateTrdText`: compute `totals` as today. Then, when `minutesMethod(cal) === 'trd_level'` and `auto.length > 0`:
  `const stat = usableStat(cal.trd_level, 'minutes')`; `totals.minutes = stat === null ? null : {p50: stat.p50, p90: stat.p90}`
  (exact values, not refitted); push `minutes from TRD-level history (n=<n> TRDs), not the sum of task minutes` to
  `notes` when `stat` exists. Build `missing` after this, so a null `trd_level.minutes` lands in `missing` and in the
  existing `no samples for minutes` note.
- Result fields added to every TRD estimate: `minutes_basis` (`'trd_level'` or `'task_sum'`) and `minutes_samples`
  (`stat.n` for trd_level with a stat, else null). Task estimates in `tasks[]` are unchanged.
- Confidence under trd_level with a stat: compute `verdict` from the tasks as today; if
  `CONFIDENCE_LEVELS.indexOf(confidenceFor(stat.n)) < CONFIDENCE_LEVELS.indexOf(verdict.confidence)`, the TRD's
  confidence becomes `confidenceFor(stat.n)` and `weakest` becomes
  `{name: 'TRD-level minutes', label, p50: stat.p50, class: null, n: stat.n}`.
- `estimate-rollup.cjs` needs no change: it composes `trd.minutes` whatever produced it. Prove it with a test.

**estimate-cli.cjs** — the meta built in `loadOnce` (about line 196) becomes
`{path, version, data_as_of, samples, method: isPlainObject(cal.method) ? cal.method : null}`; the run-state block
(`{...loaded.meta, inputs_digest}`, about line 318) and the backtest block (about line 533) inherit it.

**estimate-format.cjs** — `calibrationSentence(calibration)` appends a method part when `calibration.method` is an object:
`, minutes <m>` followed by ` (window <w>, through objective <t>)` with only the non-null parts, the parentheses omitted
when both are null. Example: `Calibration 2026-10-05, 50 TRDs, minutes trd_level (window 10, through objective 66).`
With no method (version 1 or 2) the sentence is byte-identical to today's. The backtest calibration line (about line
599) gains `, minutes <m>` before its existing tail when a method exists.

<embedded_context>

<codebase_examples>
Where TRD minutes are made today (`estimateTrdText`):

```js
  for (const metric of METRICS) {
    totals[metric] = auto.length === 0
      ? null
      : em.summarize(em.sumComonotonic(auto.map((t) => em.fitQuantiles(t[metric]))));
    if (totals[metric] === null) missing.push(metric);
  }
```

`usableStat(block, metric)` already returns `{p50, p90, n}` or null for any calibration block, including `cal.trd_level`.

Fixtures: `makeCalibration(overrides)` deep-merges into CAL_V2 (`version: 2`, `trd_level.minutes` = n 40, p50 12, P90 45;
`task_classes.code_tdd.minutes` = n 32, p50 6, P90 18; `data_as_of` 2026-10-05, `samples.trds` 50). `ROLLUP_SPEC` /
`makeEstimateProject` build a project of TRD files for rollup and CLI tests. Measured with the current estimate-math:
three code_tdd tasks sum to p50 17.999999999999996 / P90 53.99999999999996; `summarize(sumCorrelated([fit(12,45),
fit(12,45)]))` is p50 26.244139884112773, P90 87.62100705046149.

The run-state test at about `estimate-cli.test.cjs:821` deep-equals the recorded calibration block; it gains `method:
null` for its version 2 file (a deliberate change; list it in the SUMMARY).
</codebase_examples>

<anti_patterns>
- Falling back to the task sum when `trd_level.minutes` has no samples. No data, no number: minutes is null and missing.
- Scaling `trd_level.minutes` by the task count, the class mix or anything else. The method is the plain TRD-level
  distribution; any factor would be a parameter DECISION-003 does not have.
- Changing tokens or cost under trd_level, or the objective composition. Only TRD minutes change.
- Requiring `calibrator.MINUTES_METHODS` from estimate.cjs: it does not exist in this wave's base.
- Editing an existing format test to accept a method part for a version 2 file: the version 2 text must not change.
</anti_patterns>

<error_recovery>
- An existing test fails on the new `minutes_basis` / `minutes_samples` fields because it deep-equals a whole TRD
  estimate: add the two fields to its expectation (task_sum, null), and list it in the SUMMARY as a deliberate change.
  Any other change in an existing expectation is a regression.
- A float differs in the 15th digit in a rollup test: compare with a 1e-9 tolerance, never by changing the fixture.
</error_recovery>

</embedded_context>

## Test list

Outermost first within each task. `trdLevelCal = makeCalibrationV3({minutes: 'trd_level'})`,
`taskSumCal = makeCalibrationV3({minutes: 'task_sum'})`.

Task 1 (fixture builder, loader):
1. `makeCalibrationV3({minutes, trdMinutes})` (new, in estimate-fixtures.cjs): CAL_V2 cloned with `version: 3`,
   `method: {minutes, window_objectives: 10, through_objective: 66}`, and `trd_level.minutes` replaced when `trdMinutes`
   is given; the builder is literal data, frozen like CAL_V2.
2. `loadCalibration` of a written `trdLevelCal` and `taskSumCal` file: `ok: true`. Of `{...trdLevelCal, method: {minutes:
   'median'}}`: `ok: false`, reason contains `minutes method "median"` and `df-tools calibrate`. Of a version 3 file with
   no `method`: reason contains `version 3 without a method block`. Of version 4: reason contains `reads versions 1, 2
   and 3`. CAL_V2: `ok: true`.
3. `minutesMethod(CAL_V2)` is `task_sum`; `minutesMethod(trdLevelCal)` is `trd_level`; `KNOWN_MINUTES_METHODS` is
   `['task_sum', 'trd_level']`.

Task 2 (estimator and rollup):
4. A TRD of three auto `code_tdd` tasks: under `trdLevelCal` its `minutes` is exactly `{p50: 12, p90: 45}`,
   `minutes_basis: 'trd_level'`, `minutes_samples: 40`, and `notes` contains
   `minutes from TRD-level history (n=40 TRDs), not the sum of task minutes`; under `taskSumCal` its minutes p50 is
   17.999999999999996 within 1e-9 and `minutes_basis: 'task_sum'`.
5. A one-task TRD and the three-task TRD under `trdLevelCal` have deep-equal `minutes`.
6. `tokens_input`, `tokens_output` and `cost_usd` of the three-task TRD are deep-equal under the two calibrations.
7. Under CAL_V2 the TRD estimate equals today's (compute the expectation from the current code's numbers in the test,
   as literals) plus `minutes_basis: 'task_sum'` and `minutes_samples: null`.
8. `makeCalibrationV3({minutes: 'trd_level', trdMinutes: {n: 0, p50: null, p90: null, min: null, max: null}})`:
   minutes null, `missing` includes `minutes`, `notes` contains `no samples for minutes`, no TRD-level note.
9. A TRD with only checkpoint tasks under `trdLevelCal`: minutes null and the `no auto tasks` note, as today.
10. Confidence cap: `trdMinutes` with n 7 (p50 12, P90 45): the three-task code_tdd TRD's confidence is `low` and
    `weakest.name` is `TRD-level minutes` with `n: 7`; with n 40 the confidence is what the tasks give (as under task_sum).
11. Rollup (`estimate-rollup.test.cjs`): a project of two TRDs in one wave (one with one task, one with three) estimated
    with `estimateObjective(trdLevelCal, root, N, {all: true})`: `execution.agent_minutes` p50 and P90 equal
    `em.summarize(em.sumCorrelated([em.fitQuantiles({p50: 12, p90: 45}), em.fitQuantiles({p50: 12, p90: 45})]))`
    within 1e-9 (26.244139884112773 / 87.62100705046149).

Task 3 (CLI and text):
12. `df-tools estimate trd <path> --calibration <trdLevelCal file>` (JSON): `calibration.method` deep-equals
    `{minutes: 'trd_level', window_objectives: 10, through_objective: 66}` and `minutes.p50` is 12.
13. The same with a CAL_V2 file: `calibration.method` is null and the minutes are today's.
14. `estimate start <N> --calibration <trdLevelCal file>` with an isolated `DEVFLOW_ESTIMATE_STATE_DIR`: the run state's
    `estimate.calibration.method` equals the file's block and `inputs_digest` is still recorded. The existing
    run-state deep-equal (about line 821) gains `method: null` for its version 2 file.
15. Text: `estimate objective <N> --raw` with `trdLevelCal` ends with
    `Calibration 2026-10-05, 50 TRDs, minutes trd_level (window 10, through objective 66).`; with a method
    `{minutes: 'task_sum', window_objectives: null, through_objective: null}` the tail is
    `Calibration 2026-10-05, 50 TRDs, minutes task_sum.`; with CAL_V2 the existing expectations
    (`estimate-format.test.cjs:63`, `:242`, `:314`, `:400`, `estimate-cli.test.cjs:281`) pass unchanged.
16. The backtest calibration line names `minutes trd_level` for a v3 file and is unchanged for CAL_V2.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Version 3 fixture builder, loader checks and minutesMethod</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs, plugins/devflow/devflow/bin/lib/estimate.cjs, plugins/devflow/devflow/bin/lib/estimate.test.cjs</files>
  <action>
Add `makeCalibrationV3` to estimate-fixtures.cjs first (test 1 describes it) and export it. Then tests 2-3 one at a
time: RED (`node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs`, failing because version 3 is refused),
then GREEN per Design (SUPPORTED_VERSIONS, the method checks in `loadCalibration`, `KNOWN_MINUTES_METHODS`,
`minutesMethod`). Commit RED and GREEN separately.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs` passes including tests 1-3</verify>
  <done>Version 3 loads when its method is known and is refused with a named reason otherwise; versions 1 and 2 load as
before.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TRD-level minutes in estimateTrdText, the confidence cap, and the rollup proof</name>
  <files>plugins/devflow/devflow/bin/lib/estimate.cjs, plugins/devflow/devflow/bin/lib/estimate.test.cjs, plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs</files>
  <action>
Tests 4-11 one at a time, RED then GREEN, implementing the estimateTrdText part of Design.

Approach:
1. Keep the METRICS loop that builds `totals` but move the `missing` push into a separate loop after step 2.
2. If `minutesMethod(cal) === 'trd_level'` and `auto.length > 0`: replace `totals.minutes` with the exact
   `trd_level.minutes` p50/P90 (or null), note it, and remember `stat`.
3. Build `missing` from `totals`.
4. After `verdict`, apply the confidence cap when `stat` exists.
5. Add `minutes_basis` and `minutes_samples` to the returned object.

# CRITICAL: tasks[] keep their class minutes (estimate task and the table's per-task rows read them).
# GOTCHA: a whole-object deepEqual in an existing test will now see two new fields; see error_recovery.
# PATTERN: usableStat(cal.trd_level, 'minutes') is the same accessor estimate-rollup uses for trd_level history.

Run `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs`.
  </action>
  <verify>The four test files above pass, including tests 4-11; `git diff --stat` shows no change to estimate-rollup.cjs</verify>
  <done>Under trd_level a TRD's minutes no longer depend on its task count; everything else estimates as before.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Name the method in every estimate result, the run state and the text</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-cli.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs, plugins/devflow/devflow/bin/lib/estimate-format.cjs, plugins/devflow/devflow/bin/lib/estimate-format.test.cjs</files>
  <action>
Tests 12-16 one at a time, RED then GREEN, implementing the estimate-cli and estimate-format parts of Design. Make the
deliberate run-state deep-equal change (test 14) in the GREEN step and name it in the commit body.

Then `node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-format.test.cjs plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs`,
then `npm test`. Known environment failures in a provisioned worktree (66-01 SUMMARY): ten `node-pty` tests in
`devflow-watch.test.cjs` and `handoff-e2e.test.cjs`, and `roadmap-reconcile.test.cjs` E2E1 while this TRD's own SUMMARY
exists and its ROADMAP box is unticked. Any other failure is a regression of this TRD.
  </action>
  <verify>
- The four test files above pass, including tests 12-16
- `npm test` shows no failure beyond the known environment failures
  </verify>
  <done>Every estimate names the minutes method that produced it, in JSON, in the run state and in the text.</done>
</task>

</tasks>

<verification>
- Under `trd_level` the TRD minutes are the trd_level distribution exactly and independent of task count (tests 4, 5);
  tokens, cost and composition unchanged (tests 6, 11); version 1/2 behaviour unchanged (tests 7, 13, 15).
- The method is visible wherever an estimate is reported (tests 12-16), which is how 67-09 proves SC-4 on the installed
  runtime.
</verification>

<success_criteria>
- All 16 listed tests exist and pass; deliberate test changes listed in the SUMMARY.
- No change to estimate-rollup.cjs, estimate-backtest.cjs or any calibrator file.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-03-SUMMARY.md` via `summary post`, `requirements-completed: []`, with
the deliberate test changes, RED/GREEN commits and the suite numbers.
</output>
