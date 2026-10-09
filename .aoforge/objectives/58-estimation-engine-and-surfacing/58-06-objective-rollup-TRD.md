---
objective: 58-estimation-engine-and-surfacing
trd: "06"
type: standard
wave: 3
depends_on: ["58-03", "58-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
  - plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
autonomous: true
requirements: [EST-03]
must_haves:
  truths:
    - "estimateObjective estimates the objective's remaining TRDs (a TRD is done when a paired SUMMARY exists and is not checkpoint-only), grouped by wave"
    - "Wall time takes the max of a wave's TRDs when parallelization is on and their sum when it is off; waves, TRDs and overhead combine with the correlated sum (rho 0.5), passed as one flat list"
    - "A planned objective adds one verifier spawn of agent overhead from calibration; planner and plan-checker are reported as already spent; missing overhead data is listed and caps confidence at low"
    - "The gap-closure factor is a mixture: with the calibrated probability the objective also pays one planner, one TRD (trd_level) and one verifier, and the result reports the probability, its n and the extra cost"
    - "An objective with no TRDs is estimated from objective_level history plus planner, plan-checker and verifier overhead, labelled unplanned and capped at low confidence"
    - "Every result carries its confidence label, the weakest component, notes and the method used"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
      provides: "estimateObjective, estimateUnplanned, objectiveOverhead, METHOD"
  key_links:
    - "estimate-rollup.estimateObjective -> estimate.estimateTrdText (58-05) -> estimate-math sumCorrelated / maxIndependent / mixtureQuantiles (58-01)"
    - "estimate-rollup -> calibration.agent_overhead and objective_level (58-03), probabilities.gap_closure (57-05)"
    - "estimate-rollup -> objective.findObjectiveInternal, helpers.trdKey, misc.isCheckpointOnlySummary, config.loadConfig(cwd).parallelization"
---

# TRD 58-06: Objective estimates: waves, agent overhead and the gap-closure factor (EST-03)

<objective>
`estimate objective` (EST-03) composes the objective's TRD estimates and adds agent overhead and the gap-closure factor.
Concretely, for the objective's **remaining** TRDs (estimates are about work still to do; `all: true` includes done TRDs
for backtests):

1. **Execution.** Group TRDs by `wave`. A wave's wall time is `maxIndependent` of its TRDs when
   `loadConfig(cwd).parallelization` is true, else `sumCorrelated`. Execution wall = `sumCorrelated(waves)`; agent minutes,
   tokens and dollars = `sumCorrelated(TRDs)`.
2. **Agent overhead.** One verifier spawn (calibration `agent_overhead.verifier`). The planner and plan checker already ran
   for a planned objective: reported under `spent`, not added.
3. **Gap-closure factor.** p = `probabilities.gap_closure.value`. The alternative outcome adds one planner, one TRD
   (`trd_level`) and one more verifier. Total = `mixtureQuantiles(base, alt, p)`.
4. **Unplanned.** No TRD files: `objective_level` history plus planner, plan checker and verifier, wall basis "serial
   (unplanned)", no mixture (history already contains gap-closure cycles), capped at low.

Flat composition, matching 58-01's rule: base wall = `sumCorrelated([...waveDists, verifier])`; alt wall =
`sumCorrelated([...waveDists, verifier, planner, trd_level, verifier])`. The same lists per metric with TRD dists
instead of wave dists for agent minutes, tokens and cost.

Purpose: the objective layer of EST-03, used by `estimate objective`, plan-objective's table and `/devflow:build`.
Output: estimate-rollup.cjs (+ test), the ROLLUP fixture project, one misc.cjs export.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-06): ...` RED, then `feat(58-06): ...`. Fixture additions go in the first RED commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- Fixtures: `makeEstimateProject` and `CAL_V2` / `makeCalibration` from estimate-fixtures.cjs (58-05). Literal specs; no
  generated data; never read the real `~/.claude`.
- misc.cjs: add exactly one export, `isCheckpointOnlySummary: _isCheckpointOnlySummary`. No other change to misc.cjs.
- Pass `parallel` explicitly in tests where it matters, and also cover the `config.json` path once.

## Test list

Outermost first; `estimate-rollup.test.cjs`. `ROLLUP_SPEC` (export it from estimate-fixtures.cjs; config
`{"parallelization": {"enabled": true}}`):

| objective | TRD | wave | tasks (class) | SUMMARY |
|---|---|---|---|---|
| 80-alpha | 80-01 | 1 | `lib/a.cjs, lib/a.test.cjs` tdd; `lib/b.cjs` tdd (code_tdd x2) | none |
| 80-alpha | 80-02 | 1 | `docs/x.md` (doc) | none |
| 80-alpha | 80-03 | 2 (depends_on 80-01) | `lib/c.cjs` tdd (code_tdd) | none |
| 80-alpha | 80-04 | 2 | `package.json` (config) | complete |
| 81-beta | none (OBJECTIVE.md only) | | | |
| 82-gamma | 82-01 | 1 | `lib/g.cjs` tdd | complete |
| 83-delta | 83-01 | 1 | `docs/d.md` (doc) | checkpoint-only (`## Progress`, no `## Self-Check`) |

`CAL0` = `makeCalibration({probabilities: {gap_closure: {value: 0, n: 40}, checkpoint: {value: 0.02, n: 50}}})`.
Anchors are within abs 0.05 unless stated.

1. `estimateObjective(CAL_V2, root, '80')` (config parallel on): status `partial`, `trds` `{total: 4, done: 1,
   remaining: 3}`; `waves` = wave 1 [80-01, 80-02] wall 12.2554 / 36.0038 and wave 2 [80-03] wall 6 / 18;
   `execution.wall_minutes` 19.3982 / 52.1221; `execution.agent_minutes` 23.5292 / 59.6548; `total.wall_minutes`
   25.6464 / 69.1577; `gap_closure` `{probability: 0.1, n: 40, ...}` with `extra.wall_minutes` present; `overhead` is
   one verifier entry (samples 31, confidence high); `spent` lists planner and job-checker; confidence `medium`, weakest
   80-02 (doc, 4 of 26 median minutes); `method` names the four rules.
2. With `CAL0`: `total.wall_minutes` 23.9930 / 61.0235 (no gap mass); `total.cost_usd` 6.1068 / 9.5407. With `CAL0` and
   `{parallel: false}`: `total.wall_minutes` 28.2265 / 68.2523 (wave 1 summed).
3. `{all: true}`: `trds.remaining` 4; wave 2 holds [80-03, 80-04].
4. `estimateObjective(CAL_V2, root, '81')`: status `unplanned`, `wall_basis` `serial (unplanned)`, `total.wall_minutes`
   62.2252 / 184.6035, `total.cost_usd` 17.9788 / 46.9899, `gap_closure` null with a note that history includes gap
   cycles, overhead [planner, job-checker, verifier], confidence `low`, `history` `{objectives: 30}` (objective_level minutes n) and a note naming it.
5. `'82'`: status `done`, remaining 0, `total.wall_minutes` `{p50: 0, p90: 0}`, confidence `n/a`.
6. `'83'`: the checkpoint-only SUMMARY does not count as done: status `planned`, remaining 1; `total.wall_minutes`
   8.9727 / 23.5003.
7. A version 1 calibration (no `agent_overhead`, no `objective_level`): '80' still estimates execution; `missing`
   includes `agent_overhead.verifier`; confidence `low`; the gap extra uses `trd_level` only and says which overhead was
   missing. '81' gives `available: false`-style totals (null metrics) with `missing` `['objective_level']` and
   confidence `none`.
8. `'99'` throws `objective 99 not found`. Reading `.planning/config.json` with `parallelization: false` (no explicit
   option) gives the summed wave 1.

<embedded_context>

<codebase_examples>
58-05 surface (estimate.cjs): `estimateTrdText(cal, text, {id, path})` -> `{id, wave, depends_on, autonomous,
human_wait, minutes, tokens_input, tokens_output, cost_usd ({p50, p90} unrounded or null), confidence, weakest, notes,
missing}`; `overallConfidence([{name, label, p50}])` -> `{confidence, weakest}`; `confidenceFor(n)`.

58-01 surface (estimate-math.cjs): `fitQuantiles`, `summarize`, `sumCorrelated(dists, rho)`, `maxIndependent(dists)`,
`mixtureQuantiles(base, alt, p)` -> `{p50, p90, dist}`, `ZERO`, `DEFAULT_CORRELATION`.

Done detection, same rule as objective-job-index (misc.cjs, TRD 44-08):

```js
// A SUMMARY carrying a `## Progress` checkpoint but no `## Self-Check` heading was written mid-run ...
function _isCheckpointOnlySummary(text) {
  return /^##\s+Progress\b/m.test(text) && !/^##\s+Self-Check\b/m.test(text);
}
```

Objective lookup: `findObjectiveInternal(cwd, '80')` -> `{directory: '.planning/objectives/80-alpha', jobs:
['80-01-...-TRD.md', ...], summaries: [...]}` (null when absent). Pair TRD and SUMMARY with `helpers.trdKey`. The
objective's display name: `getRoadmapObjectiveInternal(cwd, num)?.objective_name`, else the directory slug.

Parallelization: `require('./config.cjs').loadConfig(cwd).parallelization` (boolean; default true).
</codebase_examples>

<anti_patterns>
- Nesting correlated sums (`sumCorrelated([execution, verifier])` where execution is itself a sum). Pass one flat list.
- Adding planner and plan-checker overhead to a planned objective. Planning already ran; adding it would double count.
- Adding a gap-closure mixture to the unplanned fallback: objective_level history already includes gap-closure TRDs.
- Treating a checkpoint-only SUMMARY as done (execute-objective would re-run that TRD).
</anti_patterns>

<error_recovery>
- If test 1's wave 1 is 16 / 44 rather than about 12.26 / 36.0, the wave was summed: the parallel branch is not taken.
- If total anchors drift by more than 0.05 while the wave anchors match, check the flat list (verifier once in base, twice
  in alt) and that the mixture uses the calibration's p (0.1).
- If `misc.cjs` export breaks another suite, revert it and copy the two-line rule into estimate-rollup.cjs with a comment
  citing misc.cjs; record the deviation.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/estimate.cjs
@plugins/devflow/devflow/bin/lib/estimate-math.cjs
@.planning/objectives/58-estimation-engine-and-surfacing/58-05-SUMMARY.md
</context>

<gotchas>
- The overall confidence uses `overallConfidence` over the TRDs (`{name: id, label: trd.confidence, p50: minutes p50,
  class: trd.weakest?.class, n: trd.weakest?.n}`), each overhead entry (`{name: agent, label from its minutes n, p50,
  n: samples}`) and the gap component (`{name: 'gap closure', label from probabilities.gap_closure.n, p50: p times the
  extra wall p50, n}`). Missing overhead caps the result at low. In test 1 the weakest is the 80-02 component
  (`class: 'doc'`, `n: 10`).
- A TRD with null minutes (no data for its classes) makes its wave and the wall totals null; report `missing` rather
  than dropping the TRD.
- `METHOD` constant (exported, included in every result): `{within_trd: 'quantiles add (tasks move together)',
  across: 'correlated sum, rho 0.5 (Fenton-Wilkinson)', parallel_wave: 'max of independent TRDs',
  gap_closure: 'mixture with calibrated probability'}`.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remaining TRDs, waves and execution totals</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs, plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/lib/estimate-rollup.cjs, plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs</files>
  <action>
Fixture first: add `ROLLUP_SPEC` (table above) to estimate-fixtures.cjs; extend `makeEstimateProject` only if a field it
needs is missing (keep 58-05's tests green).

RED: tests 3, 5, 6 and 8, plus the execution and wave parts of test 1. Commit
`test(58-06): objective estimates cover remaining TRDs by wave`.

GREEN:
1. misc.cjs: export `isCheckpointOnlySummary`.
2. estimate-rollup.cjs: `remainingTrds(cwd, objective, {all})` -> `{info, trds: [{file, id, text}], done, total}` using
   `findObjectiveInternal`, `trdKey` pairing and the checkpoint-only rule; throw `objective <N> not found`.
3. `estimateObjective(cal, cwd, objective, {all = false, parallel} = {})`: parallel defaults to
   `loadConfig(cwd).parallelization`. Status `done` (remaining 0, zero totals, confidence `n/a`), `planned` or
   `partial`. Per remaining TRD `estimateTrdText`; waves sorted ascending with `{wave, trds, wall_minutes}`;
   `execution` per objective step 1. Leave `total` = execution for now. Result keys (final shape, filled in by Task 2):
   `{objective (the number as given, e.g. '80'), name, dir, status, parallel, trds: {total, done, remaining}, waves,
   trd_estimates, execution, overhead, spent, gap_closure, total, history, wall_basis, confidence, weakest, notes,
   missing, method}`.
Commit `feat(58-06): objective execution estimate by wave`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` passes the Task 1 tests; `node --test plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/misc.test.cjs` still passes (skip misc.test.cjs if it does not exist).</verify>
  <done>Wave grouping, remaining detection and execution totals match the anchors after a recorded RED.</done>
  <recovery>If 58-05's fixture shape cannot express `wave` / `depends_on`, add those keys to `makeEstimateProject`'s TRD frontmatter writer with defaults `wave: 1`, `depends_on: []` and re-run estimate.test.cjs.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Agent overhead, gap-closure mixture, unplanned fallback, confidence</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-rollup.cjs, plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs</files>
  <action>
RED: tests 1 (totals, overhead, spent, gap, confidence, method), 2, 4 and 7. Commit
`test(58-06): agent overhead and the gap-closure factor`.

GREEN:
1. `objectiveOverhead(cal, agents)` -> entries `{agent, spawns: 1, samples, minutes, tokens_input, tokens_output,
   cost_usd, confidence}` from `cal.agent_overhead[agent]`, plus `missing` for absent or n-0 agents.
2. Planned/partial: base lists = execution components + verifier; alt lists = base + planner + trd_level + verifier;
   per metric `mixtureQuantiles(sumCorrelated(base), sumCorrelated(alt), p)` (p null: total = base, note
   `gap closure: no data`). `gap_closure` = `{probability, n, extra}` where extra = summarize of
   `sumCorrelated([planner, trd_level, verifier])` per metric. `spent` = ['planner', 'job-checker'].
3. `estimateUnplanned(cal, {objective, name})` (also used when a ROADMAP objective has no directory, by 58-07):
   `objective_level` + planner + job-checker + verifier, `wall_basis: 'serial (unplanned)'`, capped low; missing
   objective_level gives null totals, `missing: ['objective_level']`, confidence `none`.
4. Confidence per gotchas; `METHOD`; `notes` (checkpoint TRDs: `N checkpoint TRD(s): human wait not included`).
Commit `feat(58-06): overhead, gap-closure mixture and unplanned fallback`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` passes all 8 tests.</verify>
  <done>Tests 1-8 pass with the anchors in the Test list; tests 1, 2, 4 and 7 went RED then GREEN.</done>
  <recovery>If an anchor misses and the composition matches the objective's flat lists, recompute it with python3 (math.erfc) from CAL_V2's literals before changing code; record any corrected literal as a deviation.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/estimate-math.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-03 (objective layer): TRD estimates composed, agent overhead added, gap-closure factor applied, with the
  probability, its n and the extra cost reported.
- Unplanned objectives are estimated from history and labelled as such, never presented as planned precision.
</verification>

<success_criteria>
- estimate-rollup.test.cjs passes 8/8; estimate and estimate-math suites unchanged.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the objective result shape (58-07 and 58-08 consume it).
</output>
