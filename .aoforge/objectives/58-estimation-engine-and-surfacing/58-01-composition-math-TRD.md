---
objective: 58-estimation-engine-and-surfacing
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-math.cjs
  - plugins/devflow/devflow/bin/lib/estimate-math.test.cjs
autonomous: true
requirements: [EST-03]
must_haves:
  truths:
    - "A (p50, p90) pair is fitted to a lognormal: mu = ln p50, sigma = ln(p90/p50) / 1.2815515655446004; fitQuantiles({p50:6, p90:18}) gives mu 1.791759469228055 and sigma 0.8572517237737914"
    - "sumComonotonic adds quantiles exactly: (6,18) + (4,10) gives p50 10 and p90 28"
    - "sumCorrelated moment-matches a correlated sum (Fenton-Wilkinson with one pairwise correlation rho): two (6,18) components give 12/36 at rho 1, 12.8662/34.5895 at rho 0.5 and 13.9518/32.4393 at rho 0, and one component is returned unchanged"
    - "maxIndependent gives the quantiles of the max of independent components (two (6,18) give about 9.573 and 24.312), and mixtureQuantiles gives the quantiles of (1-p)*base + p*alt (p 0.1 over base (10,30) gives about 10.775 and 34.539)"
    - "A null component makes a sum null (the caller reports the metric as missing); a zero component adds nothing; nothing in the module reads a clock or Math.random"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-math.cjs
      provides: "Z90, DEFAULT_CORRELATION, ZERO, normalCdf, fitQuantiles, moments, fromMoments, quantile, cdf, summarize, sumComonotonic, sumCorrelated, maxIndependent, mixtureQuantiles"
    - path: plugins/devflow/devflow/bin/lib/estimate-math.test.cjs
      provides: "anchor-value tests for every composition rule"
  key_links:
    - "58-05 estimate.cjs -> sumComonotonic (tasks inside one TRD)"
    - "58-06 estimate-rollup.cjs -> sumCorrelated (TRDs, waves, overhead), maxIndependent (parallel wave), mixtureQuantiles (gap-closure factor)"
---

# TRD 58-01: Composition math for estimates (EST-03)

<objective>
A pure, deterministic module that composes per-component (p50, p90) estimates into the median and P90 of a sum, a
maximum and a mixture. Every estimate in this objective goes through it, so the composition rule is written down once,
tested against hand-computed anchor values, and documented in the module header.

**Why not add P90s.** Percentiles do not add. Summing P90s assumes every component lands on its bad day together (too
wide); summing medians understates the median of a right-skewed sum. Each component is fitted to a lognormal from its
(p50, p90) and the sum is moment-matched (Fenton-Wilkinson):

- mean_i = exp(mu_i + sigma_i^2 / 2), var_i = (exp(sigma_i^2) - 1) * exp(2 mu_i + sigma_i^2)
- mean = sum mean_i; var = (1 - rho) * sum var_i + rho * (sum sd_i)^2  (one pairwise correlation rho for every pair)
- sigma^2 = ln(1 + var / mean^2); mu = ln(mean) - sigma^2 / 2; p50 = exp(mu); p90 = exp(mu + Z90 * sigma)

The rules the callers use, recorded in the header comment:

| Rule | Function | Used for |
|---|---|---|
| Comonotonic (quantiles add exactly) | `sumComonotonic` | tasks inside one TRD: calibration splits each TRD's outcome equally across its tasks, so they move together by construction |
| Correlated sum, rho = `DEFAULT_CORRELATION` (0.5) | `sumCorrelated` | TRDs of an objective, waves, agent overhead, objectives of a milestone. rho 0 would make P90 shrink like 1/sqrt(n) and miss EST-08's 80% coverage; rho 1 is the comonotonic bound. 0.5 is a stated assumption that Objective 64 (EST-08) tunes |
| Max of independent components | `maxIndependent` | TRDs of one wave when parallelization is on (wall time); independence makes the max larger, the conservative side |
| Mixture | `mixtureQuantiles` | the gap-closure factor: with probability p the objective needs a gap-closure cycle |

Purpose: EST-03 asks for composed estimates; this is the honest composition they rest on.
Output: estimate-math.cjs and its test. No CLI, no file I/O.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: a `test(58-01): ...` RED commit before each `feat(58-01): ...` GREEN commit. One test at a time is fine;
  the RED commit must fail for the right reason (missing export or wrong number), not a syntax error.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call (the worktree guard refuses compound commands).
- Node builtins only (`Math`). No dependency, no property-based testing library, no generated data: every expected value
  below is a literal computed by the planner with an independent implementation (Python `math.erfc`).
- Same wave: 58-02 owns agent-overhead/token-usage/transcript fixtures; 58-04 owns the run store and statusline. Touch only
  your two files.

## Test list

Outermost first; all in `estimate-math.test.cjs`. `a = fitQuantiles({p50: 6, p90: 18})`.

1. **Lognormal fit.** `a.mu` is 1.791759469228055 and `a.sigma` 0.8572517237737914 (abs 1e-12). `moments(a)` is
   mean 8.664201167297522, variance 81.46667247120445 (abs 1e-9). `summarize(a)` is `{p50: 6, p90: 18}` (abs 1e-9).
2. **Correlated sum.** `sumCorrelated([a])` summarizes to 6 / 18 (abs 1e-9). `sumCorrelated([a, a], 1)` gives 12 / 36;
   `sumCorrelated([a, a], 0.5)` gives 12.866158728975536 / 34.58951240491516; `sumCorrelated([a, a], 0)` gives
   13.951777730245846 / 32.439283961649565 (abs 1e-6). `sumCorrelated([a, a])` uses `DEFAULT_CORRELATION` = 0.5.
3. **Comonotonic sum.** `sumComonotonic([a, fitQuantiles({p50: 4, p90: 10})])` summarizes to exactly 10 / 28 (abs 1e-9).
4. **Normal CDF.** `normalCdf(0)` is 0.5 (abs 1e-7); `normalCdf(Z90)` is 0.9 and `normalCdf(-Z90)` 0.1 (abs 1e-6).
   `cdf(a, 6)` is 0.5 and `cdf(a, 18)` is 0.9 (abs 1e-6).
5. **Edges.** `fitQuantiles({p50: null, p90: 3})` and `fitQuantiles({})` are null. `fitQuantiles({p50: 0, p90: 0})` is
   `ZERO` and summarizes to 0 / 0. `fitQuantiles({p50: 5, p90: 5})` has sigma 0 and summarizes to 5 / 5. p90 below p50
   (`{p50: 5, p90: 4}`) clamps sigma to 0. `sumCorrelated([a, ZERO])` equals `sumCorrelated([a])`; `sumCorrelated([])` is
   `ZERO`; `sumCorrelated([a, null])` and `sumComonotonic([a, null])` are null.
6. **Max of independent components.** `maxIndependent([a])` summarizes to 6 / 18 (abs 1e-6). `maxIndependent([a, a])`
   gives 9.572751018085604 / 24.312286508606064 (abs 0.01). `maxIndependent([fitQuantiles({p50:12,p90:36}),
   fitQuantiles({p50:4,p90:8})])` gives 12.255355025779103 / 36.003840475022926 (abs 0.01). A null member gives null.
7. **Mixture.** `base = fitQuantiles({p50: 10, p90: 30})`, `alt = sumCorrelated([base, fitQuantiles({p50: 12, p90: 45})],
   0.5)`. `summarize(alt)` is 23.584752348605253 / 73.23985479227876 (abs 1e-6). `mixtureQuantiles(base, alt, 0.1)`
   gives p50 10.774866439412751 and p90 34.538766368707584 (abs 0.01). p 0 gives the base (10 / 30) and p 1 gives the
   alt (abs 1e-6). A null p or a null alt gives the base unchanged.
8. **Determinism and purity.** Two calls of tests 2, 6 and 7 with the same inputs return `===` numbers. The source has no
   `Date`, `Math.random` or `process.` reference (the test reads the module text and asserts it).

<embedded_context>

<codebase_examples>
Module shape to copy (header comment explaining the rule, then pure functions, frozen constants, one `module.exports`
block) is calibrator.cjs:

```js
'use strict';

// calibration.json builder (TRD 57-05). Turns the planning history ... The result depends only on the inputs: no
// wall-clock value is read anywhere, so a rebuild over unchanged inputs is byte-identical ...

const CALIBRATION_VERSION = 1;
...
/** `{n, p50, p90, min, max}` over the non-null values. `round` is applied once, to each reported value. */
function statBlock(values, round = identity) { ... }
...
module.exports = { nearestRank, statBlock, sampleCost, buildCalibration, ... };
```

Test style (calibrator.test.cjs): `const { test } = require('node:test'); const assert = require('node:assert/strict');`
numbered test names matching the Test list, e.g. `test('2. correlated sum: rho 1 is the comonotonic bound', ...)`.
A tolerance helper keeps the anchors readable:

```js
function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} not within ${tol} of ${expected}`);
}
```
</codebase_examples>

<anti_patterns>
- Adding P90s (or medians) across components as the general rule. Only `sumComonotonic` adds quantiles, and only callers
  that know the components move together (tasks inside one TRD) use it.
- Monte Carlo without a seed, or with one. The closed form is deterministic, fast and has no sampling noise.
- Rounding inside this module. Callers round once, at output (calibrator's rule).
- Nested correlated sums where a flat one is meant: `sumCorrelated([sumCorrelated([x, y]), z])` is not
  `sumCorrelated([x, y, z])` when rho is between 0 and 1. The header must say callers pass every component in one flat list.
</anti_patterns>

<error_recovery>
- If a CDF-based anchor (tests 6, 7) misses by more than 0.01, check the erf approximation first: Abramowitz and Stegun
  7.1.26 (`t = 1 / (1 + 0.3275911 x)`, coefficients 0.254829592, -0.284496736, 1.421413741, -1.453152027,
  1.061405429; max error 1.5e-7) with `erf(-x) = -erf(x)` is accurate enough. Then check the bisection bounds and
  iteration count (100 halvings of a bracket that contains the root).
- If test 2 at rho 1 is not exactly 12 / 36: the variance line must be `(1 - rho) * sumVar + rho * sumSd * sumSd`.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/calibrator.cjs
</context>

<gotchas>
- `ZERO` is a frozen sentinel (e.g. `Object.freeze({ zero: true })`), not `{mu: -Infinity}`: `-Infinity` arithmetic
  turns into NaN in the moment formulas. `moments(ZERO)` is mean 0, variance 0; `fromMoments(0, 0)` returns `ZERO`.
- Bisection brackets. Max: the q-quantile of a max is at least every member's q-quantile, so `lo = max_i Q_i(q)`; grow
  `hi = 2 * lo` until the product CDF reaches q (cap the doublings). Mixture: the quantile lies between the two members'
  q-quantiles, so bracket with their min and max. Use 100 halvings and return the midpoint.
- Known `npm test` baseline failures: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration
  (real fleet), and roadmap-reconcile E2E1 while a TRD of the running objective is unticked. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lognormal fit, normal CDF, comonotonic and correlated sums</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-math.cjs, plugins/devflow/devflow/bin/lib/estimate-math.test.cjs</files>
  <action>
RED: tests 1, 2, 3, 4 and 5 of the Test list (all literal anchors). Commit
`test(58-01): lognormal fit and correlated sums match hand-computed anchors`.

GREEN in estimate-math.cjs:
1. Constants: `Z90 = 1.2815515655446004`, `DEFAULT_CORRELATION = 0.5`, `ZERO` (frozen sentinel).
2. `erf(x)` (A&S 7.1.26, odd extension), `normalCdf(x) = 0.5 * (1 + erf(x / Math.SQRT2))`.
3. `fitQuantiles({p50, p90})`: null when p50 is not a finite number; `ZERO` when p50 <= 0; sigma = 0 when p90 is not
   finite or p90 <= p50; otherwise `{mu: Math.log(p50), sigma: Math.log(p90 / p50) / Z90}`.
4. `moments(d)`, `fromMoments(mean, variance)` (mean <= 0 gives ZERO; variance <= 0 gives sigma 0), `quantile(d, z)`,
   `cdf(d, t)` (sigma 0 is a step at exp(mu)), `summarize(d)` -> `{p50, p90}` (null for null).
5. `sumComonotonic(dists)`: null if any member is null; otherwise fit from (sum of p50, sum of p90).
6. `sumCorrelated(dists, rho = DEFAULT_CORRELATION)`: null if any member is null; drop ZERO members; empty gives ZERO;
   one member is returned as is (same object is fine); otherwise the Fenton-Wilkinson lines in the objective.
Write the header comment with the rule table from the objective (what each function assumes and who calls it), and that
callers must pass a flat list.
Commit `feat(58-01): lognormal fit, comonotonic and correlated sums`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` passes tests 1-5.</verify>
  <done>Tests 1-5 pass after a recorded RED, every anchor within its stated tolerance.</done>
  <recovery>If an anchor differs beyond tolerance and the formula matches the objective exactly, recompute the anchor with an independent tool (python3 `math.erfc`, `math.log`, `math.exp`) before touching the code, and record any corrected literal in the SUMMARY as a deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Max of independent components, the gap-closure mixture, purity</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-math.cjs, plugins/devflow/devflow/bin/lib/estimate-math.test.cjs</files>
  <action>
RED: tests 6, 7 and 8. Commit `test(58-01): max of a parallel wave and the gap-closure mixture`.

GREEN:
1. `maxIndependent(dists)`: null if any member is null; drop ZERO; empty gives ZERO; one member is returned as is.
   Otherwise solve `prod_i cdf(d_i, t) = q` for q 0.5 and 0.9 by bisection (brackets in gotchas) and return
   `fitQuantiles({p50, p90})` of the two roots.
2. `mixtureQuantiles(base, alt, p)`: the base's quantiles when p is null or not finite, when p <= 0, or when alt is
   null; the alt's when p >= 1. Otherwise solve `(1 - p) * cdf(base, t) + p * cdf(alt, t) = q` for q 0.5 and 0.9 by bisection and return
   `{p50, p90, dist: fitQuantiles({p50, p90})}` so callers can compose the result further. Every branch returns this
   same shape (the edge branches use the member's own dist).
3. Make sure nothing reads `Date`, `Math.random` or `process`.
Commit `feat(58-01): parallel-wave max and gap-closure mixture`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs` passes all 8 tests. `rg -n -e 'Date|Math\.random|process\.' plugins/devflow/devflow/bin/lib/estimate-math.cjs` prints nothing.</verify>
  <done>All 8 tests pass; tests 6-8 went RED then GREEN; the module is pure.</done>
  <recovery>If bisection does not converge (NaN), a member with sigma 0 produced a step CDF and the bracket missed the step: widen `hi` by doubling until the product CDF is at least q, and start `lo` at the largest member quantile.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-math.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-03 (composition half): the module composes medians and P90s honestly and documents the rule.
- The header comment names each rule, its assumption and its caller, and states that rho = 0.5 is an assumption for
  Objective 64 to tune.
</verification>

<success_criteria>
- `estimate-math.test.cjs` passes 8/8 with literal anchors.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. List the exported API with one line per function (58-05 and 58-06 build on it).
</output>
