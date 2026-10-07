'use strict';

// Tests for estimate-backtest.cjs (TRD 64-01). Inputs are hand-built literals from __fixtures__/backtest-fixtures.cjs, so
// every number below is one a reader can check by hand. `ratio` is p50 / actual: above 1 the estimate was high.

const test = require('node:test');
const assert = require('node:assert');

const backtest = require('./estimate-backtest.cjs');
const fx = require('./__fixtures__/backtest-fixtures.cjs');

// ─── Constants and median ─────────────────────────────────────────────────────

test('the verdict constants are fixed before any live data', () => {
  assert.strictEqual(backtest.BAND, 0.3);
  assert.strictEqual(backtest.COVERAGE_TARGET, 0.8);
  assert.strictEqual(backtest.MIN_OBJECTIVES, 3);
  assert.strictEqual(backtest.MIN_CLASS_TASKS, 3);
  assert.deepStrictEqual(backtest.PRIMARY_METRICS, ['agent_minutes', 'cost_usd']);
  assert.strictEqual(backtest.REPRODUCE_TOLERANCE, 0.05);
  assert.ok(Object.isFrozen(backtest.PRIMARY_METRICS), 'a caller cannot loosen the metric list');
});

test('median: the conventional median of the finite values', () => {
  assert.strictEqual(backtest.median([]), null);
  assert.strictEqual(backtest.median([3, 1, 2]), 2);
  assert.strictEqual(backtest.median([4, 1, 3, 2]), 2.5);
  assert.strictEqual(backtest.median([5, NaN, null, undefined, 'x', Infinity, 1, 3]), 3);
  assert.strictEqual(backtest.median([NaN, null]), null);
  const input = [3, 1, 2];
  backtest.median(input);
  assert.deepStrictEqual(input, [3, 1, 2], 'the input list is not sorted in place');
});

// ─── compareMetric ────────────────────────────────────────────────────────────

test('compareMetric: the band is inclusive at both ends (ratio is p50 / actual)', () => {
  const high = backtest.compareMetric(fx.stat(13, 40), 10);
  assert.strictEqual(high.ratio, 1.3);
  assert.strictEqual(high.within_band, true, '1.30 is the boundary and is in band');
  assert.strictEqual(high.covered, true);
  assert.strictEqual(high.at_or_under_median, true, 'an actual of 10 is under a p50 of 13');
  assert.strictEqual(high.excluded, null);
  assert.deepStrictEqual([high.p50, high.p90, high.actual], [13, 40, 10]);

  const low = backtest.compareMetric(fx.stat(7, 40), 10);
  assert.strictEqual(low.ratio, 0.7);
  assert.strictEqual(low.within_band, true, '0.70 is the boundary and is in band');
  assert.strictEqual(low.at_or_under_median, false, 'an actual of 10 is over a p50 of 7');

  assert.strictEqual(backtest.compareMetric(fx.stat(13.1, 40), 10).within_band, false);
  assert.strictEqual(backtest.compareMetric(fx.stat(6.9, 40), 10).within_band, false);
});

test('compareMetric: covered is actual <= P90, null without a P90', () => {
  assert.strictEqual(backtest.compareMetric(fx.stat(10, 40), 40).covered, true, 'an actual equal to P90 is covered');
  assert.strictEqual(backtest.compareMetric(fx.stat(10, 40), 41).covered, false);
  const noP90 = backtest.compareMetric(fx.stat(10, null), 10);
  assert.strictEqual(noP90.covered, null);
  assert.strictEqual(noP90.p90, null);
  assert.strictEqual(noP90.excluded, null, 'a missing P90 does not exclude the comparison');
});

test('compareMetric: a missing estimate or actual is excluded with a reason and no ratio', () => {
  for (const stat of [null, undefined, fx.stat(null, 40), fx.stat(NaN, 40)]) {
    const r = backtest.compareMetric(stat, 10);
    assert.strictEqual(r.excluded, 'no estimate');
    assert.strictEqual(r.estimate, null);
    assert.ok(!('ratio' in r), 'an excluded comparison carries no ratio');
  }
  for (const actual of [null, undefined, 0, -3, NaN]) {
    const r = backtest.compareMetric(fx.stat(10, 40), actual);
    assert.strictEqual(r.excluded, 'no actual');
    assert.deepStrictEqual([r.p50, r.p90], [10, 40]);
    assert.ok(!('ratio' in r) && !('within_band' in r), 'an excluded comparison carries no verdict');
  }
  assert.strictEqual(backtest.compareMetric(null, null).excluded, 'no estimate', 'the missing estimate is reported first');
});
