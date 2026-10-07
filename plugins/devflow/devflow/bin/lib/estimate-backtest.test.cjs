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
