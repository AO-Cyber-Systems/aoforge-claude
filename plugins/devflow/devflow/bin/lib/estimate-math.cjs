'use strict';

// Composition math for estimates (TRD 58-01, EST-03). Turns per-component (p50, p90) estimates into the median and P90
// of a sum, a maximum and a mixture. Every estimate in the estimation engine goes through this module, so the rule for
// combining components is written down here once. The functions are pure: no clock, no random-number source and no
// file access, so the same inputs give the same numbers. Nothing is rounded here; callers round once, at output.
//
// Percentiles do not add. Summing P90s assumes every component lands on its bad day together (too wide); summing
// medians understates the median of a right-skewed sum. So each component is fitted to a lognormal from its
// (p50, p90): mu = ln p50, sigma = ln(p90 / p50) / Z90. A sum is then moment-matched back to one lognormal
// (Fenton-Wilkinson):
//
//   mean_i = exp(mu_i + sigma_i^2 / 2)      var_i = (exp(sigma_i^2) - 1) * exp(2 mu_i + sigma_i^2)
//   mean   = sum mean_i                     var   = (1 - rho) * sum var_i + rho * (sum sd_i)^2
//   sigma^2 = ln(1 + var / mean^2)          mu    = ln(mean) - sigma^2 / 2
//   p50 = exp(mu)                           p90   = exp(mu + Z90 * sigma)
//
// rho is one pairwise correlation applied to every pair of components.
//
// | Rule                                  | Function          | Used for                                              |
// |---------------------------------------|-------------------|-------------------------------------------------------|
// | Comonotonic (quantiles add exactly)   | sumComonotonic    | Tasks inside one TRD. Calibration splits each TRD's   |
// |                                       |                   | outcome equally across its tasks, so they move        |
// |                                       |                   | together by construction.                             |
// | Correlated sum, rho = 0.5 by default  | sumCorrelated     | TRDs of an objective, waves, agent overhead and the   |
// |                                       |                   | objectives of a milestone. rho 0 would make the P90   |
// |                                       |                   | shrink like 1/sqrt(n) and miss EST-08's 80% coverage; |
// |                                       |                   | rho 1 is the comonotonic bound.                       |
// | Max of independent components         | maxIndependent    | TRDs of one wave when parallelization is on (wall     |
// |                                       |                   | time). Independence makes the max larger, which is    |
// |                                       |                   | the conservative side.                                |
// | Mixture                               | mixtureQuantiles  | The gap-closure factor: with probability p the        |
// |                                       |                   | objective needs a gap-closure cycle.                  |
//
// DEFAULT_CORRELATION (0.5) is a stated assumption, not a measurement. Objective 64 (EST-08) tunes it against observed
// coverage.
//
// Callers pass every component to a correlated sum in ONE flat list. Nesting is not associative when rho is between 0
// and 1: sumCorrelated([sumCorrelated([x, y]), z]) is not sumCorrelated([x, y, z]).
//
// A null component (a metric with no data) makes any sum or max null, so the caller reports the metric as missing
// rather than as a number that silently left something out. A zero component (ZERO) adds nothing and is dropped.

const Z90 = 1.2815515655446004;
const DEFAULT_CORRELATION = 0.5;

/** A distribution that is exactly 0. A sentinel, not `{mu: -Infinity}`: -Infinity arithmetic turns into NaN. */
const ZERO = Object.freeze({ zero: true });

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ─── Normal distribution ──────────────────────────────────────────────────────

/** Error function, Abramowitz and Stegun 7.1.26 (max error 1.5e-7), extended to negative x as an odd function. */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/** Standard normal cumulative distribution function. */
function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ─── Lognormal distributions ──────────────────────────────────────────────────

/**
 * Fit a lognormal `{mu, sigma}` to a `{p50, p90}` pair. Null when p50 is not a finite number (the metric is missing),
 * ZERO when p50 <= 0. A p90 that is missing, equal to or below p50 gives sigma 0, a point mass at p50.
 */
function fitQuantiles(est) {
  if (!est || !isNum(est.p50)) return null;
  if (est.p50 <= 0) return ZERO;
  if (!isNum(est.p90) || est.p90 <= est.p50) return { mu: Math.log(est.p50), sigma: 0 };
  return { mu: Math.log(est.p50), sigma: Math.log(est.p90 / est.p50) / Z90 };
}

/** `{mean, variance}` of a distribution. ZERO is `{0, 0}`; null stays null. */
function moments(d) {
  if (d === null || d === undefined) return null;
  if (d === ZERO) return { mean: 0, variance: 0 };
  const s2 = d.sigma * d.sigma;
  return { mean: Math.exp(d.mu + s2 / 2), variance: Math.expm1(s2) * Math.exp(2 * d.mu + s2) };
}

/** The lognormal with this mean and variance. A mean <= 0 gives ZERO; a variance <= 0 gives sigma 0. */
function fromMoments(mean, variance) {
  if (!isNum(mean) || mean <= 0) return ZERO;
  if (!isNum(variance) || variance <= 0) return { mu: Math.log(mean), sigma: 0 };
  const s2 = Math.log1p(variance / (mean * mean));
  return { mu: Math.log(mean) - s2 / 2, sigma: Math.sqrt(s2) };
}

/** The value at standard-normal score `z`: z = 0 is the median, z = Z90 the P90. ZERO is 0; null stays null. */
function quantile(d, z) {
  if (d === null || d === undefined) return null;
  if (d === ZERO) return 0;
  return Math.exp(d.mu + z * d.sigma);
}

/** P(X <= t). A sigma of 0 is a step at exp(mu); ZERO is a step at 0. Null stays null. */
function cdf(d, t) {
  if (d === null || d === undefined) return null;
  if (d === ZERO) return t >= 0 ? 1 : 0;
  if (!(t > 0)) return 0;
  if (d.sigma === 0) return t >= Math.exp(d.mu) ? 1 : 0;
  return normalCdf((Math.log(t) - d.mu) / d.sigma);
}

/** `{p50, p90}` of a distribution; null for null. */
function summarize(d) {
  if (d === null || d === undefined) return null;
  return { p50: quantile(d, 0), p90: quantile(d, Z90) };
}

// ─── Sums ─────────────────────────────────────────────────────────────────────

/** Sum of components that move together: quantiles add exactly. Null when any member is null. */
function sumComonotonic(dists) {
  if (!Array.isArray(dists) || dists.some((d) => d === null || d === undefined)) return null;
  let p50 = 0;
  let p90 = 0;
  for (const d of dists) {
    const s = summarize(d);
    p50 += s.p50;
    p90 += s.p90;
  }
  return fitQuantiles({ p50, p90 });
}

/**
 * Sum of components with one pairwise correlation `rho` (clamped to 0..1; DEFAULT_CORRELATION when omitted), moment
 * matched to a lognormal. Null when any member is null; ZERO members are dropped; an empty list gives ZERO; a single
 * member is returned as is. Pass every component in one flat list (see the header).
 */
function sumCorrelated(dists, rho = DEFAULT_CORRELATION) {
  if (!Array.isArray(dists) || dists.some((d) => d === null || d === undefined)) return null;
  const parts = dists.filter((d) => d !== ZERO);
  if (parts.length === 0) return ZERO;
  if (parts.length === 1) return parts[0];
  const r = isNum(rho) ? Math.min(1, Math.max(0, rho)) : DEFAULT_CORRELATION;
  let mean = 0;
  let sumVar = 0;
  let sumSd = 0;
  for (const d of parts) {
    const m = moments(d);
    mean += m.mean;
    sumVar += m.variance;
    sumSd += Math.sqrt(m.variance);
  }
  return fromMoments(mean, (1 - r) * sumVar + r * sumSd * sumSd);
}

// ─── Max and mixture ──────────────────────────────────────────────────────────

const BISECTION_STEPS = 100;
const MAX_DOUBLINGS = 64;

/** The smallest t in [lo, hi] with `f(t) >= q` for a non-decreasing `f`, by 100 halvings; returns the midpoint. */
function bisect(f, q, lo, hi) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (a + b) / 2;
    if (f(mid) >= q) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

/**
 * Median and P90 of the maximum of independent components (the wall time of a parallel wave). Solves
 * `prod_i cdf(d_i, t) = q` for q = 0.5 and 0.9. Null when any member is null; ZERO members are dropped; an empty list
 * gives ZERO; a single member is returned as is. Otherwise the result is the lognormal fitted to the two roots.
 * The q-quantile of a max is at least every member's q-quantile, so the search starts at the largest of them and
 * doubles the upper bound until the product reaches q.
 */
function maxIndependent(dists) {
  if (!Array.isArray(dists) || dists.some((d) => d === null || d === undefined)) return null;
  const parts = dists.filter((d) => d !== ZERO);
  if (parts.length === 0) return ZERO;
  if (parts.length === 1) return parts[0];
  const product = (t) => parts.reduce((acc, d) => acc * cdf(d, t), 1);
  const solve = (q, z) => {
    const lo = Math.max(...parts.map((d) => quantile(d, z)));
    let hi = 2 * lo;
    for (let i = 0; i < MAX_DOUBLINGS && product(hi) < q; i++) hi *= 2;
    return bisect(product, q, lo, hi);
  };
  return fitQuantiles({ p50: solve(0.5, 0), p90: solve(0.9, Z90) });
}

/**
 * Median and P90 of the mixture `(1 - p) * base + p * alt` (with probability p the alternative applies, as in the
 * gap-closure factor). Returns `{p50, p90, dist}` on every branch, so callers can compose the result further: `dist`
 * is the base itself when p is missing or <= 0 or alt is null, the alt itself when p >= 1, and otherwise the lognormal
 * fitted to the two roots of `(1 - p) * cdf(base, t) + p * cdf(alt, t) = q`. The root lies between the two members'
 * q-quantiles, which bracket the search.
 */
function mixtureQuantiles(base, alt, p) {
  const own = (d) => {
    const s = summarize(d) || { p50: null, p90: null };
    return { p50: s.p50, p90: s.p90, dist: d === undefined ? null : d };
  };
  if (!isNum(p) || p <= 0 || alt === null || alt === undefined || base === null || base === undefined) return own(base);
  if (p >= 1) return own(alt);
  const mix = (t) => (1 - p) * cdf(base, t) + p * cdf(alt, t);
  const solve = (q, z) => {
    const qb = quantile(base, z);
    const qa = quantile(alt, z);
    return bisect(mix, q, Math.min(qb, qa), Math.max(qb, qa));
  };
  const dist = fitQuantiles({ p50: solve(0.5, 0), p90: solve(0.9, Z90) });
  return { ...summarize(dist), dist };
}

module.exports = {
  Z90,
  DEFAULT_CORRELATION,
  ZERO,
  normalCdf,
  fitQuantiles,
  moments,
  fromMoments,
  quantile,
  cdf,
  summarize,
  sumComonotonic,
  sumCorrelated,
  maxIndependent,
  mixtureQuantiles,
};
