'use strict';

// Tests for estimate-math.cjs (TRD 58-01). Every expected value is a literal computed with an independent
// implementation (Python math.erfc / math.log / math.exp), not by the module under test.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const em = require('./estimate-math.cjs');

function near(actual, expected, tol, label) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= tol,
    `${label}: ${actual} not within ${tol} of ${expected}`
  );
}

function nearPair(dist, p50, p90, tol, label) {
  const s = em.summarize(dist);
  assert.ok(s, `${label}: summarize returned null`);
  near(s.p50, p50, tol, `${label} p50`);
  near(s.p90, p90, tol, `${label} p90`);
}

const a = () => em.fitQuantiles({ p50: 6, p90: 18 });

test('1. lognormal fit: (6, 18) gives the hand-computed mu, sigma, moments and quantiles', () => {
  const d = a();
  near(d.mu, 1.791759469228055, 1e-12, 'mu');
  near(d.sigma, 0.8572517237737914, 1e-12, 'sigma');
  const m = em.moments(d);
  near(m.mean, 8.664201167297522, 1e-9, 'mean');
  near(m.variance, 81.46667247120445, 1e-9, 'variance');
  nearPair(d, 6, 18, 1e-9, 'summarize');
});

test('2. correlated sum: one component is unchanged, rho 1 is the comonotonic bound, rho 0 shrinks the P90', () => {
  nearPair(em.sumCorrelated([a()]), 6, 18, 1e-9, 'single');
  nearPair(em.sumCorrelated([a(), a()], 1), 12, 36, 1e-9, 'rho 1');
  nearPair(em.sumCorrelated([a(), a()], 0.5), 12.866158728975536, 34.58951240491516, 1e-6, 'rho 0.5');
  nearPair(em.sumCorrelated([a(), a()], 0), 13.951777730245846, 32.439283961649565, 1e-6, 'rho 0');
  assert.equal(em.DEFAULT_CORRELATION, 0.5);
  const dflt = em.summarize(em.sumCorrelated([a(), a()]));
  const half = em.summarize(em.sumCorrelated([a(), a()], 0.5));
  assert.deepEqual(dflt, half);
});

test('3. comonotonic sum: quantiles add exactly', () => {
  nearPair(em.sumComonotonic([a(), em.fitQuantiles({ p50: 4, p90: 10 })]), 10, 28, 1e-9, 'comonotonic');
});

test('4. normal CDF and the lognormal CDF', () => {
  near(em.normalCdf(0), 0.5, 1e-7, 'Phi(0)');
  near(em.normalCdf(em.Z90), 0.9, 1e-6, 'Phi(Z90)');
  near(em.normalCdf(-em.Z90), 0.1, 1e-6, 'Phi(-Z90)');
  near(em.cdf(a(), 6), 0.5, 1e-6, 'cdf at the median');
  near(em.cdf(a(), 18), 0.9, 1e-6, 'cdf at the P90');
  assert.equal(em.Z90, 1.2815515655446004);
});

test('5. edges: nulls, zeros, equal quantiles, p90 below p50, empty and null sums', () => {
  assert.equal(em.fitQuantiles({ p50: null, p90: 3 }), null);
  assert.equal(em.fitQuantiles({}), null);
  assert.equal(em.fitQuantiles({ p50: 0, p90: 0 }), em.ZERO);
  assert.deepEqual(em.summarize(em.ZERO), { p50: 0, p90: 0 });
  assert.equal(em.summarize(null), null);

  const flat = em.fitQuantiles({ p50: 5, p90: 5 });
  assert.equal(flat.sigma, 0);
  nearPair(flat, 5, 5, 1e-9, 'p90 equal to p50');

  const inverted = em.fitQuantiles({ p50: 5, p90: 4 });
  assert.equal(inverted.sigma, 0);

  assert.deepEqual(em.moments(em.ZERO), { mean: 0, variance: 0 });
  assert.equal(em.fromMoments(0, 0), em.ZERO);
  assert.equal(em.fromMoments(-3, 1), em.ZERO);
  assert.equal(em.fromMoments(7, 0).sigma, 0);

  assert.deepEqual(em.summarize(em.sumCorrelated([a(), em.ZERO])), em.summarize(em.sumCorrelated([a()])));
  assert.equal(em.sumCorrelated([]), em.ZERO);
  assert.equal(em.sumCorrelated([a(), null]), null);
  assert.equal(em.sumComonotonic([a(), null]), null);
});

test('6. max of independent components: the parallel-wave wall time', () => {
  nearPair(em.maxIndependent([a()]), 6, 18, 1e-6, 'single');
  nearPair(em.maxIndependent([a(), a()]), 9.572751018085604, 24.312286508606064, 0.01, 'two equal');
  const mixed = em.maxIndependent([em.fitQuantiles({ p50: 12, p90: 36 }), em.fitQuantiles({ p50: 4, p90: 8 })]);
  nearPair(mixed, 12.255355025779103, 36.003840475022926, 0.01, 'large and small');
  assert.equal(em.maxIndependent([a(), null]), null);
  assert.equal(em.maxIndependent([]), em.ZERO);
  nearPair(em.maxIndependent([a(), em.ZERO]), 6, 18, 1e-6, 'zero member dropped');
  nearPair(em.maxIndependent([em.fitQuantiles({ p50: 5, p90: 5 }), a()]), 6, 18, 0.01, 'point mass below the median');
});

test('7. mixture: the gap-closure factor', () => {
  const base = em.fitQuantiles({ p50: 10, p90: 30 });
  const alt = em.sumCorrelated([base, em.fitQuantiles({ p50: 12, p90: 45 })], 0.5);
  nearPair(alt, 23.584752348605253, 73.23985479227876, 1e-6, 'alt');

  const mixed = em.mixtureQuantiles(base, alt, 0.1);
  near(mixed.p50, 10.774866439412751, 0.01, 'mixture p50');
  near(mixed.p90, 34.538766368707584, 0.01, 'mixture p90');
  nearPair(mixed.dist, mixed.p50, mixed.p90, 1e-9, 'mixture dist round-trips its quantiles');

  const atZero = em.mixtureQuantiles(base, alt, 0);
  near(atZero.p50, 10, 1e-6, 'p 0 p50');
  near(atZero.p90, 30, 1e-6, 'p 0 p90');
  const atOne = em.mixtureQuantiles(base, alt, 1);
  near(atOne.p50, 23.584752348605253, 1e-6, 'p 1 p50');
  near(atOne.p90, 73.23985479227876, 1e-6, 'p 1 p90');

  for (const result of [em.mixtureQuantiles(base, alt, null), em.mixtureQuantiles(base, null, 0.1)]) {
    near(result.p50, 10, 1e-6, 'unchanged base p50');
    near(result.p90, 30, 1e-6, 'unchanged base p90');
    assert.equal(result.dist, base);
  }
  assert.deepEqual(Object.keys(atZero).sort(), ['dist', 'p50', 'p90']);
  assert.deepEqual(Object.keys(atOne).sort(), ['dist', 'p50', 'p90']);
});

test('8. determinism and purity', () => {
  const run = () => {
    const base = em.fitQuantiles({ p50: 10, p90: 30 });
    const alt = em.sumCorrelated([base, em.fitQuantiles({ p50: 12, p90: 45 })], 0.5);
    return {
      sum: em.summarize(em.sumCorrelated([a(), a()], 0.5)),
      max: em.summarize(em.maxIndependent([a(), a()])),
      mixture: em.mixtureQuantiles(base, alt, 0.1),
    };
  };
  const first = run();
  const second = run();
  assert.equal(first.sum.p50, second.sum.p50);
  assert.equal(first.sum.p90, second.sum.p90);
  assert.equal(first.max.p50, second.max.p50);
  assert.equal(first.max.p90, second.max.p90);
  assert.equal(first.mixture.p50, second.mixture.p50);
  assert.equal(first.mixture.p90, second.mixture.p90);

  const source = require('node:fs').readFileSync(require.resolve('./estimate-math.cjs'), 'utf8');
  assert.equal(/Date|Math\.random|process\./.test(source), false, 'the module must read no clock, random source or process');
});
