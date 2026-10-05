---
objective: 58-estimation-engine-and-surfacing
job: "06"
subsystem: estimation
tags: [estimate, objective-rollup, waves, agent-overhead, gap-closure, confidence]

requires: [58-03, 58-05]
provides:
  - "estimate-rollup.cjs: estimateObjective, estimateUnplanned, objectiveOverhead, remainingTrds, METHOD"
  - "estimate-fixtures.cjs: ROLLUP_SPEC (four-objective rollup project)"
  - "misc.cjs: isCheckpointOnlySummary export"
affects: [58-07 milestone rollup, 58-08 estimate CLI, 58-09 planning surfacing]

tech-stack:
  added: []
  patterns:
    - "One flat list per metric into sumCorrelated: waves (or TRDs) plus the verifier; the gap alternative appends planner, trd_level and a second verifier"
    - "Parallel wave = maxIndependent of its TRDs, serial wave = sumCorrelated; the wave distributions then enter the flat list as members"
    - "Gap-closure factor as a mixture with the calibrated probability, reported with its n and the extra cost"
    - "Missing overhead is listed in `missing` and caps confidence at low; it is never defaulted to 0"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
    - plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs

key-decisions:
  - "A wave's distribution (max for parallel, correlated sum for serial) is one member of the flat total list; this reproduces the TRD's serial anchor 28.2265/68.2523 (a fully flat list would give 28.117/68.478)"
  - "Status describes the objective's real state (done, planned, partial, unplanned) whatever `all` is; `trds.remaining` counts the TRDs actually estimated, so it is 4 for objective 80 with all: true"
  - "Planner is required only when a gap-closure probability exists; a missing required overhead agent is listed as agent_overhead.<agent> and caps confidence at low with a named synthetic weakest component"
  - "Unplanned agent minutes equal wall minutes: objective_level minutes are serial executor time, and the wall basis is 'serial (unplanned)'"
  - "estimateUnplanned has no mixture and is capped low; with no objective_level it returns null metrics, missing ['objective_level'] and confidence none, without listing overhead"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 35min
completed: 2026-10-05
---

# Objective 58 TRD 06: Objective rollup Summary

**estimateObjective composes an objective's remaining TRD estimates by wave (max when parallel, sum when serial), adds one verifier of calibrated agent overhead and the gap-closure mixture with its probability, n and extra cost, and falls back to labelled, low-confidence objective_level history when nothing is planned.**

## Progress
- [x] Task 1: Remaining TRDs, waves and execution totals — RED 3b052e88, GREEN b8e59661
- [x] Task 2: Agent overhead, gap-closure mixture, unplanned fallback, confidence — RED abecf0ac, GREEN 1718f3fa

## Exported API (`plugins/devflow/devflow/bin/lib/estimate-rollup.cjs`)

Nothing is rounded in the module; the CLI (58-08) rounds once, at output. A metric is `{p50, p90}` or null (no data).

- `METHOD` = `{within_trd, across, parallel_wave, gap_closure}` (the four rule strings from the TRD); included in every result.
- `remainingTrds(cwd, objective, {all})` -> `{info, trds: [{file, id, text}], done, total}`. Throws `objective <N> not found`.
- `objectiveOverhead(cal, agents)` -> `{entries: [{agent, spawns: 1, samples, minutes, tokens_input, tokens_output, cost_usd, confidence}], missing: ['agent_overhead.<agent>', ...]}`. An agent with no samples is in `missing`, not in `entries`.
- `estimateObjective(cal, cwd, objective, {all = false, parallel} = {})`; `parallel` defaults to `loadConfig(cwd).parallelization` (true when the file says nothing).
- `estimateUnplanned(cal, {objective, name, dir = null, parallel = null})`: for an objective with no TRDs, and for a ROADMAP objective with no directory (58-07 calls it directly).

### Objective result shape (58-07 and 58-08 consume it)

```
{
  objective: '80',                 // as given
  name, dir,                       // roadmap name else directory slug; dir is null for a directory-less roadmap objective
  status: 'done' | 'planned' | 'partial' | 'unplanned',
  parallel: true | false | null,   // null only from estimateUnplanned called without it
  trds: {total, done, remaining},  // remaining = TRDs estimated (all of them with all: true)
  waves: [{wave, trds: ['80-01', ...], wall_minutes}],      // ascending; [] when unplanned or done
  trd_estimates: [...],            // estimate.estimateTrdText results, one per estimated TRD
  execution: {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd} | null,   // execution only; null when unplanned
  overhead: [overhead entries],    // planned: [verifier]; unplanned: [planner, job-checker, verifier]; entries with data only
  spent: ['planner', 'job-checker'] | [],      // planned/partial only: already ran, not added
  gap_closure: {probability, n, extra: {same five metrics}, notes: []} | null,   // null when unplanned or no probability
  total: {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd},   // everything above, mixture applied
  history: {objectives: n} | null, // unplanned only: objective_level minutes n
  wall_basis: 'parallel waves' | 'serial waves' | 'serial (unplanned)',
  confidence: 'none'|'low'|'medium'|'high'|'n/a',   // 'n/a' for done
  weakest,                         // overallConfidence component {name, label, p50, class?, n?}; synthetic and named when a cap applied
  notes: [], missing: [], method: METHOD
}
```

A `done` objective has every `total`/`execution` metric `{p50: 0, p90: 0}`. An unplanned objective with no `objective_level` has every `total` metric null, `missing: ['objective_level']` and confidence `none`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Remaining TRDs, waves and execution totals | `node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` (7 tests) plus `estimate.test.cjs`, `estimate-math.test.cjs`, `misc-requirements.test.cjs`, `misc-commit-gate.test.cjs` | 0 | PASS |
| 2: Overhead, gap-closure mixture, unplanned, confidence | `node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` (15 tests) | 0 | PASS |

Anchors the tests assert (abs 0.05), all independently recomputed in Python (`math.erf`, same Fenton-Wilkinson and bisection rules) before the code was written: wave 1 parallel 12.2554/36.0038, execution wall 19.3982/52.1221, execution agent minutes 23.5292/59.6548, total wall 25.6464/69.1577, gap-extra wall 25.4888/73.6832, CAL0 wall 23.9930/61.0235 and cost 6.1068/9.5407, serial wave 1 total 28.2265/68.2523, objective 83 total 8.9727/23.5003, unplanned 81 wall 62.2252/184.6035 and cost 17.9788/46.9899. Not one literal in the TRD needed correcting.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../estimate-rollup.test.cjs` | 1 (Cannot find module ./estimate-rollup.cjs) | FAIL (correct) |
| GREEN (Task 1) | same | 0 (7 pass) | PASS (correct) |
| RED (Task 2) | same | 1 (7 pass, 8 fail: 1c, 2, 2b, 6b, 4, 4b, 7, objectiveOverhead) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (15 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` | 0 (37 pass) | PASS |
| test | `npm test` | 1 (9608 tests, 9573 pass, 3 fail, 32 skipped) | PASS against baseline: the 3 failures are the known ones |

The three `npm test` failures, all in the objective's recorded baseline and unrelated to this TRD: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` (handoff pipeline, PTY mock auth), `E2E1: SELF-TEST reconcile dry-run against this repo ROADMAP shows zero drift`, and `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md` (stack-drafter-fleet).

Lint, build and format are `none` in the stack profile (`not_available`, not counted as passes).

## Deviations from Plan

None - TRD executed as written. Notes on where the TRD was silent:

- The Test list's tests 1 and 6 are split across the two tasks, so the file holds 15 tests instead of 8: tests 1/1b/1c, 2/2b (no gap probability), 3, 4/4b (`estimateUnplanned` standing alone), 5, 6/6b, 7, 8, plus `remainingTrds` and `objectiveOverhead` unit tests.
- `isCheckpointOnlySummary` was exported from `misc.cjs` as the TRD asked; no other suite broke (`misc-requirements` and `misc-commit-gate` re-run), so the copy-the-rule fallback was not used.
- The `gap_closure.notes` array is an addition: it says which overhead the extra leaves out (test 7) and is empty otherwise.
- `weakest` is synthetic when a cap lowers the confidence (`agent overhead (no data for ...)`, `unplanned (no TRDs)`), so a caller always sees why a well-sampled objective reads low.

## Discovered commands

None. `test` and `test_scoped` came from `.planning/STACK.md` / the TRD's validation gates.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (remaining detection by wave, parallel max vs serial sum with one flat list, verifier overhead with planner and job-checker spent, gap-closure mixture with probability/n/extra, unplanned fallback capped low, confidence/weakest/notes/method on every result)
- Gate failures: none beyond the three known baseline failures

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs (ROLLUP_SPEC added)
- FOUND: plugins/devflow/devflow/bin/lib/misc.cjs (isCheckpointOnlySummary export)
- FOUND commits: 3b052e88, b8e59661, abecf0ac, 1718f3fa
