---
objective: 58-estimation-engine-and-surfacing
job: "01"
subsystem: estimation
tags: [lognormal, fenton-wilkinson, percentiles, composition, estimates]

requires: []
provides:
  - "estimate-math.cjs: pure composition of (p50, p90) estimates into the median and P90 of a sum, a max and a mixture"
affects: [58-05 estimate.cjs, 58-06 estimate-rollup.cjs, objective 64 (EST-08 tunes DEFAULT_CORRELATION)]

tech-stack:
  added: []
  patterns:
    - "Lognormal fit from (p50, p90) with moment-matched (Fenton-Wilkinson) correlated sums; closed form, no Monte Carlo"
    - "ZERO frozen sentinel instead of mu = -Infinity"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-math.cjs
    - plugins/devflow/devflow/bin/lib/estimate-math.test.cjs
  modified: []

key-decisions:
  - "Percentiles never add except through sumComonotonic, which callers use only for components that move together (tasks inside one TRD)"
  - "DEFAULT_CORRELATION = 0.5 is a stated assumption, not a measurement; Objective 64 (EST-08) tunes it"
  - "A null component makes a sum or max null so the caller reports the metric as missing; ZERO components are dropped"
  - "Nothing is rounded in the module; callers round once at output"

patterns-established:
  - "Callers pass every component of a correlated sum in one flat list; nested sums are not associative for 0 < rho < 1"

requirements-completed: [EST-03]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-05
tokens_input: 3778337
tokens_output: 32649
tokens_cache_read: 3695803
tokens_cache_write: 82450
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 58 TRD 01: Composition math for estimates Summary

**Pure lognormal composition module: sums (comonotonic and Fenton-Wilkinson correlated), max of independent components and a two-component mixture, every rule anchored to hand-computed values and documented in the header.**

## Progress
- [x] Task 1: Lognormal fit, normal CDF, comonotonic and correlated sums — RED a696855e, GREEN 2b4c8baf
- [x] Task 2: Max of independent components, the gap-closure mixture, purity — RED 53d39976, GREEN 5feb6d85

## Exported API (`plugins/devflow/devflow/bin/lib/estimate-math.cjs`)

A distribution is `{mu, sigma}` (lognormal), the frozen `ZERO` sentinel, or `null` (metric missing). 58-05 and 58-06 build on this.

- `Z90` = 1.2815515655446004, the standard-normal score of the 90th percentile.
- `DEFAULT_CORRELATION` = 0.5, the pairwise rho used by `sumCorrelated` when none is given.
- `ZERO`: frozen `{zero: true}` sentinel for an exact zero; `moments(ZERO)` is mean 0, variance 0.
- `normalCdf(x)`: standard normal CDF (Abramowitz and Stegun 7.1.26, max error 1.5e-7).
- `fitQuantiles({p50, p90})`: lognormal from a pair; null when p50 is not finite, `ZERO` when p50 <= 0, sigma 0 when p90 is missing or <= p50.
- `moments(d)`: `{mean, variance}` of a distribution.
- `fromMoments(mean, variance)`: the lognormal with that mean and variance (mean <= 0 gives `ZERO`, variance <= 0 gives sigma 0).
- `quantile(d, z)`: value at standard-normal score z (0 is the median, `Z90` the P90).
- `cdf(d, t)`: P(X <= t); sigma 0 is a step at exp(mu).
- `summarize(d)`: `{p50, p90}`, null for null.
- `sumComonotonic(dists)`: quantiles add exactly; null if any member is null. For tasks inside one TRD.
- `sumCorrelated(dists, rho = 0.5)`: Fenton-Wilkinson moment-matched sum; null if any member is null, `ZERO` members dropped, empty is `ZERO`, one member returned as is. Takes one flat list. For TRDs, waves, overhead, objectives.
- `maxIndependent(dists)`: median and P90 of the max of independent components by bisection on the product CDF; same null/ZERO/single rules. For a parallel wave.
- `mixtureQuantiles(base, alt, p)`: `{p50, p90, dist}` of `(1 - p) * base + p * alt` by bisection; every branch returns the same shape (base when p is missing, p <= 0 or alt is null; alt when p >= 1). For the gap-closure factor.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Lognormal fit, normal CDF, comonotonic and correlated sums | `node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` (tests 1-5) | 0 | PASS |
| 2: Max of independent components, the gap-closure mixture, purity | `node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` (8 of 8) | 0 | PASS |
| 2: purity grep | `rg -n -e 'Date\|Math\.random\|process\.' plugins/devflow/devflow/bin/lib/estimate-math.cjs` | 1 (no matches, prints nothing) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1, a696855e) | `node --test .../estimate-math.test.cjs` | 1 (5 of 5 fail: `em.fitQuantiles is not a function`) | FAIL (correct) |
| GREEN (task 1, 2b4c8baf) | `node --test .../estimate-math.test.cjs` | 0 (5 of 5 pass) | PASS (correct) |
| RED (task 2, 53d39976) | `node --test .../estimate-math.test.cjs` | 1 (tests 6-8 fail: `em.maxIndependent is not a function`, `em.mixtureQuantiles is not a function`; 1-5 still pass) | FAIL (correct) |
| GREEN (task 2, 5feb6d85) | `node --test .../estimate-math.test.cjs` | 0 (8 of 8 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` | 0 | PASS |
| test | `npm test` | 1 (9503 tests, 9441 pass, 12 fail, 50 skipped) | FAIL, none in this TRD's files (see below) |
| lint / build | none in the stack profile | n/a | not_available |

The 12 `npm test` failures are all outside `estimate-math`:
- 1 `roadmap-reconcile` E2E1 and 1 `stack-drafter-fleet` github-enterprise-migration: both named as known baseline failures in the TRD.
- 5 `handoff pipeline end-to-end` (write pending, disallowed command, idempotency, multi-record, LK-2) and 5 `devflow-watch` daemon-start tests (`start (foreground)` x3, `multi-project CLI` C-1 and C-2): every one needs the watcher daemon to write its PID file. The handoff failures are not the MA-7 case the TRD names. `devflow-watch.test.cjs` passes 22/22 in the main checkout at the same base and fails the same 5 in this worktree when run alone, so this is a worktree-environment effect, not something this TRD changed (it adds two new files that nothing else loads). The root cause was not investigated. A watcher daemon from the main checkout (pid 5816, `dfw-e2e-uz5DOH`) was running during the check and was left alone.

## Deviations from Plan

None - TRD executed exactly as written. Small additions inside the TRD's scope:
- The task 1 RED commit includes a stub `estimate-math.cjs` (`module.exports = {}`) so the failures are per-test "not a function" rather than one `MODULE_NOT_FOUND`.
- Tests also assert: `ZERO`/`fromMoments` edge returns, `maxIndependent([])` is `ZERO`, a `ZERO` member is dropped by `maxIndependent`, a point-mass member (sigma 0) in `maxIndependent` (a step CDF), `mixtureQuantiles` result `dist` round-trips its quantiles, and every `mixtureQuantiles` branch returns the keys `dist`, `p50`, `p90`.
- `sumCorrelated` clamps `rho` to 0..1 and falls back to `DEFAULT_CORRELATION` for a non-numeric `rho` (input validation at the boundary).

No anchor literal needed correcting.

## Discovered commands

None - the profile's `test` and scoped-test commands were used as given.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (lognormal fit anchors; comonotonic 10/28; correlated 12/36, 12.8662/34.5895, 13.9518/32.4393 and one component unchanged; max 9.5728/24.3123 and 12.2554/36.0038, mixture 10.7749/34.5388; null makes a sum null, ZERO adds nothing, no clock or random source)
- Gate failures: `npm test` shows 12 failures outside this TRD (listed above); the scoped test gate is clean

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-math.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-math.test.cjs
- FOUND commits: a696855e, 2b4c8baf, 53d39976, 5feb6d85
