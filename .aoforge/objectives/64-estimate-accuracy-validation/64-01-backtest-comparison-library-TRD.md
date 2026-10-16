---
objective: 64-estimate-accuracy-validation
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
  - plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "objectiveActuals sums an objective's executor minutes (SUMMARY duration, else the STATE_ARCHIVE metric row, exactly as collectProject resolved them) and its SUMMARY tokens priced with calibrator.sampleCost, and reports a metric as null, naming the TRD ids that lack it (no minutes, human wait, no tokens, unpriced model, no SUMMARY), instead of an undercounted sum"
    - "compareMetric gives ratio = p50 / actual, within_band for 0.70 <= ratio <= 1.30, covered for actual <= P90 and at_or_under_median for actual <= p50, and an excluded reason (never a number) when the estimate or the actual is missing or the actual is not positive"
    - "buildBacktest compares, per objective, executor agent minutes and cost (from a run state's persisted `estimate.execution` when one is given, labelled prospective, else from the reconstructed estimate, labelled reconstructed), every TRD, and, when a finished run state is given, the measured execution wall time per objective and per wave, with `reproduced` saying whether the reconstructed wall estimate matches the persisted one within 0.05 minutes"
    - "classRows splits each TRD's actual equally across its non-checkpoint tasks (the calibrator's rule) and flags a class with at least 3 tasks as biased_high (median ratio > 1.30), biased_low (< 0.70) and/or p90_too_narrow (coverage < 0.80); a class with fewer tasks is too_few and never judged"
    - "The verdict rules are constants fixed before any live data: SC2 passes for a metric when the median of its per-objective ratios is within ±30%; SC3 passes when P90 covers at least 80% of the compared objectives AND of the compared TRDs; fewer than 3 compared objectives is insufficient; EST-08 is met only when SC2 and SC3 both pass for agent_minutes and for cost_usd"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
      provides: "BAND, COVERAGE_TARGET, MIN_OBJECTIVES, MIN_CLASS_TASKS, PRIMARY_METRICS, REPRODUCE_TOLERANCE, median, objectiveActuals, compareMetric, compareObjective, classRows, summarize, buildBacktest"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs
      provides: "hand-built literal builders (stat, taskEstimate, trdEstimate, objectiveEstimate, trdRecord, projectRecord, runState, testRates) and makeBacktestProject/removeBacktestProject for the 64-04 CLI tests"
    - path: plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs
      provides: "unit tests for every exported function and the verdict boundaries"
  key_links:
    - "estimate-backtest.objectiveActuals -> calibrator.sampleCost (the same pricing calibrate uses) over calibration-inputs.collectProject TRD records"
    - "64-04 `df-tools estimate backtest` -> buildBacktest({estimates: estimate-rollup.estimateObjective(cal, cwd, N, {all: true}), project: collectProject, rates: loadRates, runs: run-store latestRun})"
---

# TRD 64-01: The backtest comparison library (EST-08)

<objective>
EST-08 asks whether the estimation engine is accurate against real executions: across the five objectives executed
after the engine shipped (59-63), the median estimate within ±30% of actual, and P90 covering at least 80% of
outcomes. Objective 58-10 answered a smaller version of that question with a scratch script that was thrown away. This
TRD builds the comparison as a pure, tested library, `lib/estimate-backtest.cjs`, so the answer is reproducible and
can be rerun on every later objective. 64-04 wires it into `df-tools estimate backtest`; 64-05 runs it live.

The library does no I/O. Its inputs are objects the existing modules already produce:

- an objective estimate from `estimate-rollup.estimateObjective(cal, cwd, N, {all: true})` (every TRD, done or not);
- the project record from `calibration-inputs.collectProject(root)` (TRDs with SUMMARY minutes, metric-row fallback,
  token fields and tasks);
- the rates from `calibration-inputs.loadRates()`;
- optionally a finished run state (the out-of-repo file `df-tools estimate start|wave|finish` writes), which holds the
  estimate as it was made before execution plus measured wave timings.

**The verdict rules are fixed here, before any live number is looked at** (no post-hoc choice of metric or threshold):

| Constant | Value | Meaning |
|---|---|---|
| `BAND` | 0.30 | a median is in band when `0.70 <= p50 / actual <= 1.30` (that is, within ±30% of actual) |
| `COVERAGE_TARGET` | 0.80 | P90 must cover at least 80% of outcomes |
| `MIN_OBJECTIVES` | 3 | fewer compared objectives for a metric gives the verdict `insufficient` |
| `MIN_CLASS_TASKS` | 3 | a task class with fewer tasks is `too_few`, never judged |
| `PRIMARY_METRICS` | `['agent_minutes', 'cost_usd']` | the like-for-like executor metrics EST-08 is judged on |
| `REPRODUCE_TOLERANCE` | 0.05 | minutes; reconstructed vs persisted wall estimate |

- SC2 (per metric): the **median of the per-objective ratios** (`p50 / actual`) is within band.
- SC3 (per metric): objective-level coverage >= 0.80 **and** TRD-level coverage >= 0.80.
- EST-08 is `met` only when SC2 and SC3 are `pass` for both primary metrics; otherwise `not met`, and the result lists
  the miscalibrated classes so the report can name them and a follow-up.
- Wall time is reported (it is the only metric a run state measured prospectively) but is informational: with one
  objective it can never reach `MIN_OBJECTIVES`, and EST-08 is not judged on it.

`median` is the conventional median (odd n: the middle value; even n: the mean of the two middle values), not the
calibrator's nearest-rank percentile; with five objectives both give the third value.

Purpose: a reusable, deterministic answer to "how accurate were the estimates", with the pass/fail rules pinned in code.
Output: `estimate-backtest.cjs` (+ test) and `__fixtures__/backtest-fixtures.cjs`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── estimate-backtest.cjs                 ← CREATE
├── estimate-backtest.test.cjs            ← CREATE
└── __fixtures__/backtest-fixtures.cjs    ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task (kind `plugin`, work `feature`: tdd strict, test list first, hand-built fixture builders): one
  test at a time, `test(64-01): ...` RED commit, then `feat(64-01): ...` GREEN, then an optional `refactor(64-01): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per
  Bash call (no `&&` chains, no `cd x && ...`).
- Fixtures are hand-built literals (constraint `no_llm_test_data`): every number in a test is one a reader can check by
  hand. No property-based testing library (`no_property_based_default`), no `.feature` files (`no_gherkin_layer`).
- Pure module: no `fs`, no `process.env`, no clock. It may `require('./calibrator.cjs')` (for `sampleCost`) and
  `require('./calibration-inputs.cjs')` (only if needed for `rateFor`); nothing else from lib. It returns unrounded
  numbers; 64-04 rounds once at output (estimate-format.roundResult), so every boolean (`within_band`, `covered`, the
  verdicts) is computed here on unrounded values.
- Same wave: 64-02 owns `estimate-run-store.cjs`, `estimate-cli.cjs`, `estimate-format.cjs` and their tests; 64-03
  owns SUMMARY files under `.planning/objectives/`. Touch none of them.
- `requirements: [EST-08]` names the requirement this TRD serves. **Do not run `requirements mark-complete EST-08`**
  and record `requirements-completed: []` in the SUMMARY: TRD 64-05 alone sets EST-08's status from the measured
  verdict.
- Never write `~/.claude/devflow/calibration.json`. Never use port 8080 (nothing here needs a server).

## Test list

All in `estimate-backtest.test.cjs` (unit, literal inputs from `__fixtures__/backtest-fixtures.cjs`). Order: the
composed result first, then its parts.

`buildBacktest` (the outermost behaviour):

1. Two objectives, each fully measured, no run states: the result is `{band: 0.3, coverage_target: 0.8,
   primary_metrics, objectives: [2 rows], classes: {minutes: [...], cost_usd: [...]}, summary, verdict}`; each row's
   `agent_minutes.source` and `cost_usd.source` are `'reconstructed'`; `summary.agent_minutes.compared` is 2 and the
   SC2/SC3 verdicts are `'insufficient'` (2 < `MIN_OBJECTIVES`); `verdict.est08` is `'not met'`.
2. Five objectives where every agent-minutes ratio is 1.0 and every actual is under P90 (objective and TRD level),
   and cost likewise: SC2 and SC3 `'pass'` for both metrics, `verdict.est08` `'met'`, `verdict.follow_up_required`
   false, `verdict.miscalibrated` `[]`.
3. Five objectives with agent-minutes ratios 1.29, 1.51, 2.11, 1.63, 0.95 (every actual under P90) and cost ratios all
   1.0: `summary.agent_minutes.median_ratio` is 1.51, `in_band` 2, SC2 `'fail'`, SC3 `'pass'`; cost passes both;
   `verdict.est08` `'not met'`, `follow_up_required` true.
4. A run state whose `estimate.execution` carries `agent_minutes` and `cost_usd` is preferred for those two metrics
   (`source: 'prospective'`), while the TRD rows still use the reconstructed TRD estimates.
5. A finished run state without `estimate.execution` (the shape Objective 63's run state has): agent minutes and cost
   stay `'reconstructed'`; the row's `wall_minutes` has `source: 'prospective'`, `actual` = (finished_at - started_at)
   in minutes (literal: started `2026-10-06T23:55:36.062Z`, finished `2026-10-07T01:46:41.099Z` gives 111.0839…),
   `prospective` = compareMetric(run.estimate.wall_minutes, actual), `reconstructed` = the estimate's
   `execution.wall_minutes`, `reproduced` true when both p50 and p90 differ by <= 0.05 and false when either differs
   more; `waves` has one compareMetric per run-state wave (`{p50, p90}` against `actual_minutes`).
6. An objective with no run state: `wall_minutes` is `{source: null, excluded: 'no run state recorded'}`.
7. An objective with one TRD lacking minutes is excluded from the agent-minutes summary with its reason and the TRD id
   (`summary.agent_minutes.excluded: [{objective, reason, trds}]`), but still counts for cost when every TRD is priced.

`objectiveActuals(project, dir, rates)`:

8. Three autonomous TRDs with SUMMARY minutes 10, 20, 30: `minutes.value` 60, `complete` true, `missing` []. A TRD
   whose minutes came from a metric row (`duration_source: 'metric'`) counts the same; `minutes.sources` tallies
   `{summary: 2, metric: 1}`.
9. Cost: one TRD with `tokens_input` 1,000,000, `tokens_cache_read` 600,000, `tokens_cache_write` 200,000,
   `tokens_output` 10,000 on the test model (input 3, output 15, cache_read 0.3, cache_write_5m 3.75 USD per million):
   cost 1.68 (fresh 200,000 x 3 + 200,000 x 3.75 + 600,000 x 0.3 + 10,000 x 15, over 1e6). `cost_usd.value` is the sum
   over TRDs.
10. A TRD with no SUMMARY, a TRD with `minutes: null`, and an `autonomous: false` TRD each make `minutes.value` null
    and `complete` false, listing the ids under `missing` (no SUMMARY or no minutes) and `human_wait`.
11. A TRD without token fields, and a TRD whose `token_model` has no rate, make `cost_usd.value` null; ids listed under
    `missing` and `unpriced`.
12. Only TRDs whose `objective_dir` equals `dir` are read; a dir with no TRDs gives both values null and `trds: 0`.

`compareMetric(stat, actual)`:

13. `{p50: 13, p90: 40}` vs 10: ratio 1.3, `within_band` true (boundary), `covered` true, `at_or_under_median` true.
    `{p50: 7, p90: 40}` vs 10: ratio 0.7, `within_band` true (boundary). `{p50: 13.1, ...}` vs 10: `within_band` false.
14. Actual above P90: `covered` false. A stat with `p90: null`: `covered` null.
15. `stat` null or `p50` null: `{excluded: 'no estimate'}` with no ratio. Actual null, 0 or negative:
    `{excluded: 'no actual'}`.

`classRows(rows)` and `summarize(rows, classes)`:

16. A TRD with actual 30 minutes and three tasks (two `code_tdd`, one checkpoint): each `code_tdd` task's share is 15
    (the checkpoint is not a share and not a sample).
17. A class with 4 tasks whose median ratio is 2.0 is flagged `['biased_high']`; one with ratio 0.5 `['biased_low']`;
    one whose coverage is 0.5 `['p90_too_narrow']` (flags can combine); one with 2 tasks is `verdict: 'too_few'`,
    flags `[]`. Rows are sorted by tasks descending, then class name.
18. `summarize`: `trd_coverage` counts TRD rows whose metric is not excluded; `under_median_share` is the share of
    compared objectives with `at_or_under_median`; `pooled_ratio` is sum(p50) / sum(actual) over compared objectives.
19. `median([])` is null; `median([3, 1, 2])` is 2; `median([4, 1, 3, 2])` is 2.5; non-finite values are ignored.

<embedded_context>

<codebase_examples>
The project record `calibration-inputs.collectProject(root)` returns (one element of `.trds`):

```js
{
  id: '61-03', objective_dir: '61-store-mode-rough-edges-and-observability', trd: '03',
  trd_type: 'standard', autonomous: true, gap_closure: false,
  tasks: [{ name: 'Task 1: ...', type: 'auto', tdd: true, files: ['a.cjs', 'a.test.cjs'] }],
  summary: { duration: null, minutes: null, completed: '2026-10-06', tokens_input: 6790940, tokens_output: 36045,
             tokens_cache_read: 6685433, tokens_cache_write: 105381, token_model: 'claude-sonnet-5-5' } | null,
  metric: { duration_raw: '5min', minutes: 5, tasks: 2, files: 5 } | null,
  minutes: 5,                      // SUMMARY minutes, else the STATE_ARCHIVE metric row
  duration_source: 'metric',       // 'summary' | 'metric' | null
}
```

The calibrator's own rule for a TRD outcome (calibrator.cjs, trdSample and taskSamples) — mirror it, do not import the
private functions:

```js
// A TRD that waited for a human reports wall-clock time that is not work; its tokens still count.
minutes: trd.autonomous ? trd.minutes : null,
const auto = trd.tasks.filter((task) => !isCheckpoint(task));    // type startsWith('checkpoint')
// taskSamples: each auto task gets value / auto.length
```

Pricing (exported, use it): `calibrator.sampleCost({tokens_input, tokens_output, tokens_cache_read,
tokens_cache_write, token_model}, rates)` returns USD or null (no tokens, or `rateFor` finds no rate). `rates` is the
`loadRates()` result: `{ok: true, models: {id: {input, output, cache_read, cache_write_5m, cache_write_1h, source,
as_of}}, aliases: {}, as_of}`. A test rates object needs only `models` and `aliases`.

An objective estimate (`estimateObjective(cal, cwd, N, {all: true})`, unrounded), the keys this library reads:

```js
{
  objective: '63', name: '...', dir: '63-todo-store-...', status: 'done',
  trds: { total: 7, done: 7, remaining: 7 },
  execution: { wall_minutes: {p50, p90}, agent_minutes: {p50, p90}, tokens_input: {p50, p90},
               tokens_output: {p50, p90}, cost_usd: {p50, p90} },        // each may be null
  trd_estimates: [{
    id: '63-01', wave: 1, autonomous: true,
    minutes: {p50: 8.5, p90: 35.8}, cost_usd: {p50: 2.2779, p90: 3.4084},  // may be null
    tasks: [{ name: 'Task 1: ...', class: 'test', human_wait: false,
              minutes: {p50: 2.5, p90: 17.5, n: 7}, cost_usd: {p50: 0.9239, p90: 1.2048, n: 11} }],
  }],
}
```

A checkpoint task estimate is `{class: 'checkpoint', human_wait: true, minutes: {p50: 0, p90: 0}, ...}`: skip it in
classRows (not a share, not a sample).

A run state (schema version 1, `~/.claude/devflow/state/estimates/...`). Objective 63's real one, verbatim except the
waves are trimmed to two here:

```json
{"version":1,"objective":"63","started_at":"2026-10-06T23:55:36.062Z","updated_at":"2026-10-07T01:46:41.099Z",
 "finished_at":"2026-10-07T01:46:41.099Z",
 "estimate":{"line":"Objective 63 estimate: 1h 43m median (P90 5h 04m) wall · $22.08 (P90 $34.02) · 7 TRDs left in 5 waves · confidence low",
             "wall_minutes":{"p50":96.61616043566684,"p90":290.40059551531397},"confidence":"low"},
 "waves":[{"wave":1,"trds":["63-01","63-05"],"p50":19.738206139394915,"p90":67.31643574086333,
           "started_at":"2026-10-06T23:56:09.280Z","finished_at":"2026-10-07T00:14:43.608Z","actual_minutes":18.572133333333333},
          {"wave":4,"trds":["63-06"],"p50":9.500000000000002,"p90":36.60000000000001,
           "started_at":"2026-10-07T00:35:54.113Z","finished_at":"2026-10-07T01:26:30.878Z","actual_minutes":50.61275}]}
```

64-02 (same wave) adds optional fields to `estimate` for runs started after it lands: `estimate.execution` (same keys
and shape as the objective estimate's `execution`), `estimate.total`, `estimate.calibration`. Read
`run.estimate.execution` defensively: absent on old runs (like 63's), present on new ones.

Fixture style to follow (estimate-fixtures.cjs, TRD 58-05): literal objects, a `stat()` helper, deep-frozen bases,
overrides merged per test. Project trees for spawn tests are written into `mkdtemp` directories and removed after.

```js
/** A calibrator stat block: n samples, nearest-rank median and P90, min and max. */
function stat(n, p50, p90, min, max) { return { n, p50, p90, min, max }; }
```

`makeBacktestProject(spec)` (for 64-04's CLI tests) can delegate to `calibration-fixtures.makeCalibrationProject`,
whose spec already writes TRDs with tasks, SUMMARYs with arbitrary frontmatter (`duration`, `tokens_*`,
`token_model`) and STATE_ARCHIVE metric rows; it does not write `wave`, which defaults to 1. Re-export it with a
backtest-shaped default spec (two objectives, `90-alpha` fully measured and `91-beta` with one TRD lacking a duration)
rather than duplicating the writer.
</codebase_examples>

<anti_patterns>
- Do not silently drop a TRD that lacks a metric and sum the rest: an undercounted actual makes an over-estimate look
  worse than it is. 58-10's in-sample table did exactly that for objectives 55 and 56 (6 of 8 and 4 of 5 TRDs had
  minutes). Exclude the objective from that metric and name the TRDs.
- Do not round inside the library. A ratio of 1.2999 rounded to 1.3 changes nothing, but 1.304 rounded to 1.30 would
  flip `within_band`; booleans come from unrounded values.
- Do not compare `total` (which adds verifier and gap-closure overhead no SUMMARY records) with SUMMARY durations;
  executor metrics are `execution.agent_minutes` and `execution.cost_usd`.
- Do not use `context-audit.percentile` or `calibrator.nearestRank` for the median: the verdict uses the conventional
  median defined above.
- Do not make the thresholds parameters a caller can loosen. They are exported constants; tests pin their values.
</anti_patterns>

<error_recovery>
- `sampleCost` returns null for a model the rates do not know: that TRD goes under `unpriced`, the objective's cost is
  null, and the summary excludes it with the reason. Never fall back to another model's rate.
- A run state with unparseable `started_at`/`finished_at`: `wall_minutes.actual` null and the prospective comparison
  `excluded: 'no actual'`; never throw.
- An estimate whose `execution` is null (an objective the calibration cannot estimate): both metrics
  `excluded: 'no estimate'`.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/58-estimation-engine-and-surfacing/58-10-SUMMARY.md
@plugins/devflow/devflow/bin/lib/calibrator.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
</context>

<gotchas>
- Read narrowly: `calibrator.cjs` lines 76-150 (sampleCost, trdSample, taskSamples) and the fixture files' headers are
  enough; do not read the whole estimator.
- `p50 / actual` is estimate over actual: above 1.0 means the estimate was high. Name it `ratio` everywhere and say so
  in the module header.
- Floating point at the boundaries: 13 / 10 and 7 / 10 are exactly 1.3 and 0.7 in IEEE doubles, so the boundary tests
  are exact. Use `>=` / `<=` with `1 - BAND` and `1 + BAND`; `1 - 0.3` is 0.7 and `1 + 0.3` is 1.3 exactly.
- `trd_estimates[].id` and collectProject `trds[].id` are the same `NN-MM` key; join on it.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-built backtest fixtures, then objectiveActuals, compareMetric and median (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs, plugins/devflow/devflow/bin/lib/estimate-backtest.cjs, plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs</files>
  <action>
First write `__fixtures__/backtest-fixtures.cjs` (header comment like estimate-fixtures.cjs: hand-built literals, no
generated data, never the real ~/.claude). Builders, each returning a fresh object with overrides merged:
- `stat(p50, p90)` -> `{p50, p90}`; `testRates()` -> `{models: {'test-model': {input: 3, output: 15, cache_read: 0.3,
  cache_write_5m: 3.75, cache_write_1h: 6, source: 'fixture', as_of: '2026-10-01'}}, aliases: {}}`.
- `taskEstimate({cls, minutes, cost, humanWait})`, `trdEstimate({id, minutes, cost, tasks, wave})`,
  `objectiveEstimate({objective, dir, execution, trds})` in the codebase_examples shapes.
- `trdRecord({id, dir, minutes, source, autonomous, tokens, tasks})` and `projectRecord(trds)` in the collectProject
  shape (`summary: null` when `noSummary`).
- `runState({objective, started_at, finished_at, wall, execution, waves})` in the run-state shape.
- `makeBacktestProject(spec)` / `removeBacktestProject(root)` delegating to calibration-fixtures (see codebase_examples).

Then, one test at a time from the Test list (items 8-15 and 19), RED commit then GREEN:

```
median(values)            finite numbers only; [] -> null
objectiveActuals(project, dir, rates):
  trds = project.trds where objective_dir === dir
  per TRD: minutes = autonomous ? trd.minutes : null (reason 'human_wait'); summary null -> reason 'no_summary'
           cost = summary ? calibrator.sampleCost(summary, rates) : null
             (no tokens -> 'no_tokens'; tokens but null cost -> 'unpriced')
  minutes: {value: every TRD has minutes && trds.length>0 ? sum : null, complete, trds, with, missing:[ids],
            human_wait:[ids], sources:{summary:n, metric:n}}
  cost_usd: {value, complete, trds, with, missing:[ids], unpriced:[ids]}
  trds: [{id, autonomous, minutes, duration_source, cost_usd, auto_tasks: n}]
compareMetric(stat, actual):
  no stat / p50 not finite -> {estimate: null, actual, excluded: 'no estimate'}
  actual not finite or <= 0 -> {p50, p90, actual, excluded: 'no actual'}
  else {p50, p90, actual, ratio: p50/actual, within_band, covered (null when p90 not finite), at_or_under_median,
        excluded: null}
```
Export the constants table from the objective now (BAND, COVERAGE_TARGET, MIN_OBJECTIVES, MIN_CLASS_TASKS,
PRIMARY_METRICS, REPRODUCE_TOLERANCE) and pin their values in one test.

# CRITICAL: no rounding anywhere in this module.
# PATTERN: module header in the style of estimate-rollup.cjs: what it computes, the shapes, the honesty rules.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` passes; `git log --oneline -6` shows each `test(64-01)` commit before its `feat(64-01)` commit.</verify>
  <done>Test-list items 8-15 and 19 pass; the fixture file exports every builder named above; the constants are exported and pinned.</done>
  <recovery>If a test passes before the implementation exists, the test is wrong: tighten it until it fails for the right reason before writing code. If makeCalibrationProject cannot express a needed shape, write that file directly in makeBacktestProject rather than editing calibration-fixtures.cjs (not this TRD's file).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: compareObjective, classRows, summarize and buildBacktest with the fixed verdict (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-backtest.cjs, plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs</files>
  <action>
One test at a time from the Test list (items 1-7 and 16-18), RED then GREEN.

```
compareObjective({estimate, actuals, run}):
  persisted = run && run.estimate && run.estimate.execution || null
  pick(metric) = persisted && persisted[metric] ? {stat: persisted[metric], source: 'prospective'}
                                                : {stat: estimate.execution && estimate.execution[metric], source: 'reconstructed'}
  agent_minutes = {...compareMetric(pick.stat, actuals.minutes.value), source}; if actuals incomplete, excluded =
                  'incomplete actuals' and trds = missing + human_wait ids
  cost_usd      = likewise with actuals.cost_usd (missing + unpriced)
  trd_rows = estimate.trd_estimates.map(te => ({id, wave, tasks: te.tasks,
               minutes: compareMetric(te.minutes, actualTrd.minutes), cost_usd: compareMetric(te.cost_usd, actualTrd.cost_usd)}))
  wall_minutes = run with finished_at
      ? {source: 'prospective', started_at, finished_at, actual, prospective: compareMetric(run.estimate.wall_minutes, actual),
         reconstructed: estimate.execution && estimate.execution.wall_minutes, reproduced,
         waves: run.waves.map(w => ({wave: w.wave, trds: w.trds, ...compareMetric({p50: w.p50, p90: w.p90}, w.actual_minutes)}))}
      : {source: null, excluded: 'no run state recorded'}
  return {objective, name, dir, trds: estimate.trds.total, agent_minutes, cost_usd, wall_minutes, trd_rows}

classRows(rows) -> {minutes: [...], cost_usd: [...]}:
  for each row, each trd_row whose metric is not excluded:
    auto = tasks without human_wait; share = actual / auto.length
    each task: compareMetric(task[metric], share) grouped by task.class
  per class: {class, tasks, median_ratio, coverage, under_median_share, flags, verdict}
    tasks < MIN_CLASS_TASKS -> verdict 'too_few', flags []
    else flags from: median_ratio > 1+BAND 'biased_high'; < 1-BAND 'biased_low'; coverage < COVERAGE_TARGET 'p90_too_narrow'
         verdict = flags.length ? 'miscalibrated' : 'ok'
  (metric key for TRD rows and tasks is 'minutes'; the class table for agent minutes is named `minutes`)

summarize(rows, classes) -> {agent_minutes, cost_usd, wall_minutes}:
  per primary metric: compared rows (excluded null), excluded [{objective, reason, trds}], median_ratio, pooled_ratio,
    in_band, coverage, trd_compared, trd_coverage, under_median_share,
    sc2 = compared < MIN_OBJECTIVES ? 'insufficient' : median_ratio within band ? 'pass' : 'fail'
    sc3 = compared < MIN_OBJECTIVES ? 'insufficient' : coverage >= 0.8 && trd_coverage >= 0.8 ? 'pass' : 'fail'
  wall_minutes: compared (rows with a prospective comparison), median_ratio, coverage, waves {compared, coverage};
    no sc2/sc3 (informational)

buildBacktest({estimates, project, rates, runs = {}}):
  rows = estimates.map(e => compareObjective({estimate: e, actuals: objectiveActuals(project, e.dir, rates), run: runs[e.objective] || null}))
  classes = classRows(rows); summary = summarize(rows, classes)
  verdict = {sc2: {agent_minutes, cost_usd}, sc3: {...}, est08: all pass ? 'met' : 'not met',
             miscalibrated: [{metric, class, flags, tasks, median_ratio, coverage}] (verdict 'miscalibrated' only),
             follow_up_required: est08 !== 'met'}
  return {band: BAND, coverage_target: COVERAGE_TARGET, primary_metrics: PRIMARY_METRICS, objectives: rows, classes, summary, verdict}
```

Test 5 uses the literal Objective 63 run state from codebase_examples (with all five waves or the two shown) and an
estimate whose `execution.wall_minutes` is `{p50: 96.6, p90: 290.4}` (reproduced: |96.616 - 96.6| = 0.016 <= 0.05)
and a second estimate at `{p50: 96.0, ...}` (reproduced false).

# GOTCHA: `runs` is keyed by the objective string as the estimate carries it ('63'), not by the number.
# PATTERN: estimate-rollup's "a metric with no data is null and listed, never dropped".
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` passes (all 19 test-list items); `node -e "const b=require('./plugins/devflow/devflow/bin/lib/estimate-backtest.cjs'); console.log(Object.keys(b).sort().join(' '))"` lists every export named in must_haves.</verify>
  <done>buildBacktest returns the documented shape; the verdict rules hold at their boundaries; Objective 63's real run-state shape (no `estimate.execution`) gives prospective wall time and reconstructed executor metrics.</done>
  <recovery>If the verdict logic and a test disagree, re-read the constants table in the objective: it is the specification. Do not change a threshold to make a test pass; change the test only if it contradicts the table.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` passes.
- `rg -n "require\\(" plugins/devflow/devflow/bin/lib/estimate-backtest.cjs` shows only `./calibrator.cjs` (and at most
  `./calibration-inputs.cjs`); `rg -n "process\\.env|Date\\.now|readFileSync" plugins/devflow/devflow/bin/lib/estimate-backtest.cjs`
  finds nothing.
- `git log --format=%s` for this TRD shows RED `test(64-01)` commits before their GREEN `feat(64-01)` commits.
</verification>

<success_criteria>
- The comparison and the EST-08 verdict rules exist as tested code with the thresholds pinned before any live run.
- Missing actuals are excluded with named TRDs, never summed into an undercount.
- A run state's persisted estimate is preferred and labelled `prospective`; otherwise the result says `reconstructed`.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-01-SUMMARY.md` with
`requirements-completed: []` (64-05 decides EST-08).
</output>
