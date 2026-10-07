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

// ─── objectiveActuals ─────────────────────────────────────────────────────────

// 1,000,000 input of which 600,000 cache read and 200,000 cache write, 10,000 output, on the fixture model:
// fresh 200,000 x 3 + 200,000 x 3.75 + 600,000 x 0.3 + 10,000 x 15 = 1,680,000 / 1e6 = 1.68 USD.
const PRICED = {
  tokens_input: 1000000, tokens_cache_read: 600000, tokens_cache_write: 200000, tokens_output: 10000, token_model: 'test-model',
};

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

test('objectiveActuals: sums SUMMARY minutes, and a metric-row duration counts the same', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 10 }),
    fx.trdRecord({ id: '90-02', minutes: 20 }),
    fx.trdRecord({ id: '90-03', minutes: 30, source: 'metric' }),
  ]);
  const { minutes } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(minutes.value, 60);
  assert.strictEqual(minutes.complete, true);
  assert.deepStrictEqual(minutes.missing, []);
  assert.deepStrictEqual(minutes.human_wait, []);
  assert.deepStrictEqual([minutes.trds, minutes.with], [3, 3]);
  assert.deepStrictEqual(minutes.sources, { summary: 2, metric: 1 });
});

test('objectiveActuals: prices a TRD with the calibrator and sums cost over TRDs', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 10, tokens: PRICED }),
    fx.trdRecord({ id: '90-02', minutes: 20, tokens: PRICED }),
  ]);
  const { cost_usd: cost, trds } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  near(trds[0].cost_usd, 1.68);
  near(cost.value, 3.36);
  assert.strictEqual(cost.complete, true);
  assert.deepStrictEqual(cost.missing, []);
  assert.deepStrictEqual(cost.unpriced, []);
});

test('objectiveActuals: a TRD with no SUMMARY, no minutes or a human wait makes minutes null and is named', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 10 }),
    fx.trdRecord({ id: '90-02', noSummary: true }),
    fx.trdRecord({ id: '90-03', minutes: null }),
    fx.trdRecord({ id: '90-04', minutes: 40, autonomous: false }),
  ]);
  const { minutes, trds } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(minutes.value, null, 'the undercounted sum of 10 is never reported');
  assert.strictEqual(minutes.complete, false);
  assert.deepStrictEqual(minutes.missing, ['90-02', '90-03']);
  assert.deepStrictEqual(minutes.human_wait, ['90-04']);
  assert.deepStrictEqual([minutes.trds, minutes.with], [4, 1]);
  assert.strictEqual(trds[3].minutes, null, 'a human-wait TRD reports wall-clock time that is not work');
  assert.strictEqual(trds[3].autonomous, false);
});

test('objectiveActuals: a TRD with no SUMMARY is missing even when a metric row gave it minutes', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 10 }),
    fx.trdRecord({ id: '90-02', minutes: 5, source: 'metric', noSummary: true }),
  ]);
  const { minutes } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(minutes.value, null);
  assert.deepStrictEqual(minutes.missing, ['90-02']);
});

test('objectiveActuals: a TRD without tokens, or on a model with no rate, makes cost null and is named', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 10, tokens: PRICED }),
    fx.trdRecord({ id: '90-02', minutes: 20 }),
    fx.trdRecord({ id: '90-03', minutes: 30, tokens: { ...PRICED, token_model: 'unknown-model' } }),
    fx.trdRecord({ id: '90-04', noSummary: true }),
  ]);
  const { cost_usd: cost, trds } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(cost.value, null);
  assert.strictEqual(cost.complete, false);
  assert.deepStrictEqual(cost.missing, ['90-02', '90-04']);
  assert.deepStrictEqual(cost.unpriced, ['90-03']);
  assert.deepStrictEqual([cost.trds, cost.with], [4, 1]);
  assert.strictEqual(trds[2].cost_usd, null, 'another model\'s rate is never substituted');
});

test('objectiveActuals: a human-wait TRD keeps its tokens, so it still prices', () => {
  const project = fx.projectRecord([fx.trdRecord({ id: '90-01', minutes: 40, autonomous: false, tokens: PRICED })]);
  const { cost_usd: cost } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  near(cost.value, 1.68);
  assert.strictEqual(cost.complete, true);
});

test('objectiveActuals: reads only the TRDs of the named objective, and an empty one is null', () => {
  const project = fx.projectRecord([
    fx.trdRecord({ id: '90-01', dir: '90-alpha', minutes: 10 }),
    fx.trdRecord({ id: '91-01', dir: '91-beta', minutes: 99 }),
  ]);
  const alpha = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(alpha.minutes.value, 10);
  assert.deepStrictEqual(alpha.trds.map((t) => t.id), ['90-01']);

  const none = backtest.objectiveActuals(project, '92-gamma', fx.testRates());
  assert.strictEqual(none.minutes.value, null);
  assert.strictEqual(none.cost_usd.value, null);
  assert.strictEqual(none.minutes.complete, false);
  assert.strictEqual(none.minutes.trds, 0);
  assert.deepStrictEqual(none.trds, []);
});

test('objectiveActuals: each TRD record carries its auto-task count (checkpoints are not tasks)', () => {
  const tasks = [
    { name: 'Task 1: a', type: 'auto', tdd: true, files: ['a.cjs'] },
    { name: 'Task 2: b', type: 'auto', files: ['b.md'] },
    { name: 'Task 3: c', type: 'checkpoint:human-verify', files: [] },
  ];
  const project = fx.projectRecord([fx.trdRecord({ id: '90-01', minutes: 9, tasks, tokens: PRICED })]);
  const { trds } = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  assert.strictEqual(trds[0].auto_tasks, 2);
  assert.strictEqual(trds[0].duration_source, 'summary');
  assert.strictEqual(trds[0].minutes, 9);
});

test('objectiveActuals: reads what collectProject builds from a real tree (the fixture project 64-04 reuses)', () => {
  const ci = require('./calibration-inputs.cjs');
  const rates = ci.loadRates();
  assert.strictEqual(rates.ok, true);
  const root = fx.makeBacktestProject();
  try {
    const project = ci.collectProject(root);
    const alpha = backtest.objectiveActuals(project, '90-alpha', rates);
    assert.strictEqual(alpha.minutes.value, 30, 'SUMMARY durations 10min + 20min');
    assert.strictEqual(alpha.minutes.complete, true);
    assert.deepStrictEqual(alpha.minutes.sources, { summary: 2, metric: 0 });
    assert.strictEqual(alpha.cost_usd.complete, true);
    assert.ok(alpha.cost_usd.value > 0);

    const beta = backtest.objectiveActuals(project, '91-beta', rates);
    assert.strictEqual(beta.minutes.value, null, '91-02 has no duration and no metric row');
    assert.deepStrictEqual(beta.minutes.missing, ['91-02']);
    assert.strictEqual(beta.cost_usd.complete, true, 'but every TRD of 91-beta is priced');
    assert.ok(beta.cost_usd.value > 0);
  } finally {
    fx.removeBacktestProject(root);
  }
});

// ─── classRows ────────────────────────────────────────────────────────────────

// An objective row as classRows reads it: only `trd_rows[].tasks` and each TRD's actual per metric.
function trdRow(id, actual, tasks, excluded = null) {
  return { id, wave: 1, tasks, minutes: { actual, excluded }, cost_usd: { actual, excluded } };
}

function objectiveRow(trdRows) {
  return { objective: '90', trd_rows: trdRows };
}

/** n tasks of one class, each estimated at {p50, p90} minutes. */
function tasksOf(cls, n, stat, p90Overrides = []) {
  return Array.from({ length: n }, (_, i) => fx.taskEstimate({
    cls, minutes: fx.stat(stat[0], p90Overrides[i] === undefined ? stat[1] : p90Overrides[i]),
  }));
}

test('classRows: a TRD actual is split equally across its non-checkpoint tasks, and a checkpoint is neither share nor sample', () => {
  const tasks = [
    fx.taskEstimate({ cls: 'code_tdd', minutes: fx.stat(15, 20) }),
    fx.taskEstimate({ cls: 'code_tdd', minutes: fx.stat(7.5, 20) }),
    fx.taskEstimate({ cls: 'checkpoint' }),
  ];
  const { minutes } = backtest.classRows([objectiveRow([trdRow('90-01', 30, tasks)])]);
  assert.deepStrictEqual(minutes.map((c) => c.class), ['code_tdd'], 'the checkpoint is not a class');
  const [code] = minutes;
  assert.strictEqual(code.tasks, 2);
  // each share is 30 / 2 = 15: ratios 15 / 15 = 1 and 7.5 / 15 = 0.5
  assert.strictEqual(code.median_ratio, 0.75);
  assert.strictEqual(code.coverage, 1);
  assert.strictEqual(code.under_median_share, 0.5, '15 is at or under a p50 of 15 but over a p50 of 7.5');
});

test('classRows: flags bias and a narrow P90 only for a class with at least 3 tasks', () => {
  const rows = [objectiveRow([
    trdRow('90-01', 20, tasksOf('code_tdd', 4, [10, 30])), // share 5, ratio 2.0, covered
    trdRow('90-02', 20, tasksOf('doc', 4, [2.5, 30])), // ratio 0.5, covered
    trdRow('90-03', 20, tasksOf('prompt', 4, [5, 6], [undefined, undefined, 4, 4])), // ratio 1.0, 2 of 4 covered
    trdRow('90-04', 20, tasksOf('test', 4, [2.5, 4])), // ratio 0.5 and no actual under P90
    trdRow('90-05', 10, tasksOf('config', 2, [10, 30])), // share 5, ratio 2.0, but only 2 tasks
  ])];
  const { minutes } = backtest.classRows(rows);
  const by = Object.fromEntries(minutes.map((c) => [c.class, c]));

  assert.deepStrictEqual([by.code_tdd.median_ratio, by.code_tdd.flags, by.code_tdd.verdict], [2, ['biased_high'], 'miscalibrated']);
  assert.deepStrictEqual([by.doc.median_ratio, by.doc.flags], [0.5, ['biased_low']]);
  assert.deepStrictEqual([by.prompt.median_ratio, by.prompt.coverage, by.prompt.flags], [1, 0.5, ['p90_too_narrow']]);
  assert.deepStrictEqual(by.test.flags, ['biased_low', 'p90_too_narrow'], 'flags combine');
  assert.deepStrictEqual([by.config.tasks, by.config.verdict, by.config.flags], [2, 'too_few', []]);
  assert.strictEqual(by.config.median_ratio, 2, 'a too_few class still reports its numbers, it is just not judged');

  assert.deepStrictEqual(minutes.map((c) => c.class), ['code_tdd', 'doc', 'prompt', 'test', 'config'],
    'sorted by task count descending, then class name');
});

test('classRows: the band and the coverage target are inclusive', () => {
  const rows = [objectiveRow([
    trdRow('90-01', 20, tasksOf('code_tdd', 4, [6.5, 30])), // 6.5 / 5 = 1.3
    trdRow('90-02', 20, tasksOf('doc', 4, [3.5, 30])), // 3.5 / 5 = 0.7
    trdRow('90-03', 25, tasksOf('prompt', 5, [5, 6], [undefined, undefined, undefined, undefined, 4])), // 4 of 5 covered
  ])];
  const { minutes } = backtest.classRows(rows);
  for (const c of minutes) assert.deepStrictEqual([c.class, c.flags, c.verdict], [c.class, [], 'ok']);
  assert.strictEqual(minutes.find((c) => c.class === 'prompt').coverage, 0.8);
});

test('classRows: a TRD with no actual and a task with no estimate contribute no sample', () => {
  const noEstimate = fx.taskEstimate({ cls: 'doc', minutes: null });
  const rows = [objectiveRow([
    trdRow('90-01', null, tasksOf('code_tdd', 3, [5, 10]), 'no actual'),
    trdRow('90-02', 10, [noEstimate, fx.taskEstimate({ cls: 'doc', minutes: fx.stat(5, 10) })]),
  ])];
  const { minutes } = backtest.classRows(rows);
  assert.deepStrictEqual(minutes.map((c) => [c.class, c.tasks]), [['doc', 1]]);
});

test('classRows: the cost table reads each task\'s cost estimate and the TRD\'s cost actual', () => {
  const tasks = [
    fx.taskEstimate({ cls: 'code_tdd', cost: fx.stat(2, 5) }),
    fx.taskEstimate({ cls: 'code_tdd', cost: fx.stat(2, 5) }),
  ];
  const row = trdRow('90-01', 0, tasks);
  row.minutes = { actual: null, excluded: 'no actual' };
  row.cost_usd = { actual: 8, excluded: null }; // share 4, ratio 0.5
  const out = backtest.classRows([objectiveRow([row])]);
  assert.deepStrictEqual(out.minutes, [], 'the minutes table has no sample: the TRD has no minutes actual');
  assert.strictEqual(out.cost_usd[0].class, 'code_tdd');
  assert.strictEqual(out.cost_usd[0].median_ratio, 0.5);
  assert.strictEqual(out.cost_usd[0].tasks, 2);
});
