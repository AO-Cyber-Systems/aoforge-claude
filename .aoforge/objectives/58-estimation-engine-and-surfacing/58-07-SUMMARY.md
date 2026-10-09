---
objective: 58-estimation-engine-and-surfacing
job: "07"
subsystem: estimation
tags: [estimate, milestone-rollup, roadmap-bullets, integration-checker, confidence]

requires: [58-06]
provides:
  - "estimate-milestone.cjs: milestoneObjectiveNumbers, selectMilestoneObjectives, estimateMilestone"
  - "estimate-fixtures.cjs: MILESTONE_ROADMAP, MILESTONE_SPEC (milestone rollup project)"
  - "roadmap.cjs: parseMilestoneBullets and pickMilestone exported, no behaviour change"
  - "estimate-rollup.cjs: TOTAL_KEYS, zeroTotals, stat, entryDist, overheadComponent, capAt exported for the milestone layer"
affects: [58-08 estimate CLI, 58-09 planning surfacing]

tech-stack:
  added: []
  patterns:
    - "Milestone scope is read from the ROADMAP bullet by roadmap.cjs's own parser; this module reads only the 'Objectives A-B, C' text"
    - "One flat list per metric into sumCorrelated: each remaining objective's fitted total plus one integration-checker spawn"
    - "A number in the bullet's bounds is an objective only with a directory or a ROADMAP section; the rest are counted absent"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
    - plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/estimate-rollup.cjs

key-decisions:
  - "Objectives with no ROADMAP-bullet text fall back to every `### Objective N:` section (range_source 'roadmap sections'); with bullet text, the candidates are the union of sections and directories (archived milestone directories included) filtered by the ranges and singles"
  - "A cancelled objective is skipped before any estimate is made; done and cancelled entries carry total null, a cancelled one also trds null"
  - "An empty milestone adds no integration checker: overhead [] and every total metric {p50: 0, p90: 0}"
  - "A missing integration-checker history is listed in `missing` (agent_overhead.integration-checker), adds nothing to the total and caps the confidence at low with a named synthetic weakest, the rule estimate-rollup applies to its own overhead"

requirements-completed: [EST-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-05
tokens_input: 6328277
tokens_output: 61520
tokens_cache_read: 6120255
tokens_cache_write: 207918
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 58 TRD 07: Milestone rollup Summary

**estimateMilestone reads a milestone's objectives from its ROADMAP bullet, leaves out done and cancelled ones, composes the rest (remaining-TRD estimates, or the unplanned fallback for objectives with no TRDs or no directory) with one integration-checker spawn in a single correlated sum, and names the confidence and the weakest objective.**

## Progress
- [x] Task 1: Milestone scope from the ROADMAP bullet — RED d0ee66e1, GREEN 2b70b998
- [x] Task 2: Milestone totals, overhead and confidence — RED 6e366600, GREEN 5b1644f1

## Exported API (`plugins/devflow/devflow/bin/lib/estimate-milestone.cjs`)

Nothing is rounded in the module; the CLI (58-08) rounds once, at output. A metric is `{p50, p90}` or null (no data).

- `milestoneObjectiveNumbers(rest)` -> `{ranges: [[lo, hi], ...], singles: [n, ...]}` or null. `rest` is a bullet's trailing text. Dashes: en, em or hyphen; decimals allowed; parsing stops at the first `(` or non-list text.
- `selectMilestoneObjectives(cwd, {version})` -> `{version, name, range_source: 'milestone bullet' | 'roadmap sections', objectives: [{number, name, dir, status_hint: 'cancelled' | 'no_dir' | 'dir'}], absent: [number strings]}`. Throws `ROADMAP.md not found`, `no milestone in ROADMAP.md`, `milestone <v> not in ROADMAP.md`. `version` is `v1.0` or `1.0`; omitted means the current milestone (`pickMilestone`).
- `estimateMilestone(cal, cwd, {version, parallel} = {})`. `parallel` overrides `parallelization` from config for every objective (true when the file says nothing).

### Milestone result shape (58-08 renders it)

```
{
  version: 'v1.0', name: 'Now',
  range_source: 'milestone bullet' | 'roadmap sections',
  objectives: [{                       // in number order, every in-scope objective with a directory or a section
    number: '80', name: 'Alpha', dir: '.planning/objectives/80-alpha' | null,
    status: 'done' | 'planned' | 'partial' | 'unplanned' | 'cancelled',
    trds: {total, done, remaining} | null,        // null for cancelled
    total: {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd} | null,   // null for done and cancelled
    confidence: 'none'|'low'|'medium'|'high'|'n/a',   // 'n/a' for done and cancelled
    weakest,                                      // the objective's own weakest component (estimate-rollup), null for done/cancelled
  }],
  counts: {done, planned, partial, unplanned, cancelled, absent},
  overhead: [integration-checker entry from objectiveOverhead] | [],
  total: {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd},   // each {p50, p90} | null; zeros when nothing is left
  confidence, weakest,                  // weakest: {name: '81', label, p50, status} (an objective), the integration checker, or a synthetic cap component; null when n/a
  notes: [], missing: [], method: METHOD
}
```

`missing` lines are `<objective number>: <what the objective lacks>` (for example `81: objective_level`) and `agent_overhead.integration-checker`. `notes` holds `no objectives left`, one line per unplanned objective (naming whether it has no directory and what it was estimated from) and one line naming the absent numbers.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Milestone scope from the ROADMAP bullet | `node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` (51 tests, 9 milestone) | 0 | PASS |
| 2: Milestone totals, overhead and confidence | `node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` (89 tests, 16 milestone) | 0 | PASS |

Anchors (abs 0.1), independently recomputed in Python (`math.erf`, the same Fenton-Wilkinson rule) before the code was written: milestone wall 109.2527/276.3459 (80 + 81 + 83 + integration checker 6/9), with objective 85 added 180.0413/445.6294, without the integration checker 102.8722/266.9880. Not one literal in the TRD needed correcting. `git diff` of roadmap.cjs is exactly the two added export names.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../estimate-milestone.test.cjs` | 1 (Cannot find module ./estimate-milestone.cjs) | FAIL (correct) |
| GREEN (Task 1) | same | 0 (9 pass) | PASS (correct) |
| RED (Task 2) | same | 1 (9 pass, 7 fail: estimateMilestone is not a function) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (16 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs plugins/devflow/devflow/bin/lib/estimate-rollup.test.cjs` plus `estimate.test.cjs`, `roadmap.test.cjs` | 0 (89 pass) | PASS |
| test | `npm test` | 1 (9624 tests, 9589 pass, 3 fail, 32 skipped) | PASS against baseline: the 3 failures are the known ones |

The three `npm test` failures are the objective's recorded baseline and unrelated to this TRD: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN`, `E2E1: SELF-TEST reconcile dry-run against this repo ROADMAP shows zero drift`, and `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md`.

Lint, build and format are `none` in the stack profile (`not_available`, not counted as passes).

As a read-only sanity run (not a test), `estimateMilestone(CAL_V2, <this repo>)` reads v1.5 as objectives 55-64 (55-57 done, 58 partial, 59-64 unplanned with no directory yet, confidence low, weakest 58) and v1.4 as 42-54, all done, nothing left.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Six helpers exported from estimate-rollup.cjs**
- **Found during:** Task 2
- **Issue:** The milestone total needs the rollup layer's `TOTAL_KEYS`, `zeroTotals`, `stat`, `entryDist`, `overheadComponent` and `capAt`, none of them exported. The TRD lists only roadmap.cjs for exports; copying them would put the cap-at-low and overhead-component rules in two places.
- **Fix:** Added the six names to `module.exports` of estimate-rollup.cjs with a comment. No other line of that file changed.
- **Files modified:** plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
- **Commit:** 5b1644f1

Notes where the TRD was silent:

- Archived milestone directories (`.planning/milestones/vX-objectives/`) are searched for an objective's directory after the current ones, as `findObjectiveInternal` does, so a shipped milestone's objectives are counted done rather than absent. A current directory wins over an archived one with the same number.
- `selectMilestoneObjectives` throws `ROADMAP.md not found` and `no milestone in ROADMAP.md` (no bullet) as well as the `milestone <v> not in ROADMAP.md` the TRD names, and rejects a range wider than 1000 as a typo rather than enumerating it.
- The test file holds 16 tests rather than 6: the TRD's six, split across the two tasks, plus 4b (decimals, dash forms, parenthesis stop), 5b (singles), 5c (archived directories), 5d (ROADMAP errors), 2b (notes), 7 (missing integration-checker history) and 8 (no objective_level).
- Objective numbers are listed as written without leading zeros (`'4'`, `'4.1'`); numbers sort and match ranges by `parseFloat`, as the TRD says.

## Discovered commands

None. `test` and `test_scoped` came from `.planning/STACK.md` / the TRD's validation gates.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (milestone picked from the bullet with a named version or the current one; done and cancelled counted and left out, planned/partial by remaining TRDs, no-TRD and no-directory objectives unplanned; correlated total plus one integration checker with confidence and weakest; ROADMAP-section fallback with `range_source`)
- Gate failures: none beyond the three known baseline failures

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-milestone.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-fixtures.cjs (MILESTONE_ROADMAP, MILESTONE_SPEC added)
- FOUND: plugins/devflow/devflow/bin/lib/roadmap.cjs (parseMilestoneBullets, pickMilestone exported)
- FOUND: plugins/devflow/devflow/bin/lib/estimate-rollup.cjs (six helpers exported)
- FOUND commits: d0ee66e1, 2b70b998, 6e366600, 5b1644f1
