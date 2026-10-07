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

// ─── summarize ────────────────────────────────────────────────────────────────

const cmp = (p50, p90, actual) => backtest.compareMetric(fx.stat(p50, p90), actual);

/** An objective row as summarize reads it: the objective-level comparisons and the TRD comparisons per metric. */
function summaryRow(objective, { agent = null, cost = null, wall = null, trdMinutes = [], trdCost = [] } = {}) {
  return {
    objective,
    agent_minutes: agent,
    cost_usd: cost,
    wall_minutes: wall || { source: null, excluded: 'no run state recorded' },
    trd_rows: [
      ...trdMinutes.map((m, i) => ({ id: `${objective}-0${i + 1}`, tasks: [], minutes: m, cost_usd: { excluded: 'no actual' } })),
      ...trdCost.map((c, i) => ({ id: `${objective}-1${i + 1}`, tasks: [], minutes: { excluded: 'no actual' }, cost_usd: c })),
    ],
  };
}

const EXCLUDED = (reason, trds) => ({ source: 'reconstructed', excluded: reason, trds });

test('summarize: ratios, pooled ratio, band count, coverage and under-median share over compared objectives', () => {
  const rows = [
    // 10 vs 8: ratio 1.25, in band, covered, at or under median
    summaryRow('1', { agent: cmp(10, 30, 8), trdMinutes: [cmp(5, 9, 4), cmp(5, 9, 5), { excluded: 'no actual' }] }),
    // 10 vs 10: ratio 1.0
    summaryRow('2', { agent: cmp(10, 30, 10) }),
    // 10 vs 20: ratio 0.5, out of band, over P90 12, over the median
    summaryRow('3', { agent: cmp(10, 12, 20), trdMinutes: [cmp(5, 6, 9)] }),
    summaryRow('4', { agent: EXCLUDED('incomplete actuals', ['4-02']) }),
  ];
  const s = backtest.summarize(rows, { minutes: [], cost_usd: [] }).agent_minutes;
  assert.strictEqual(s.compared, 3);
  assert.strictEqual(s.median_ratio, 1);
  assert.strictEqual(s.pooled_ratio, 30 / 38, 'sum(p50) / sum(actual) = 30 / 38');
  assert.strictEqual(s.in_band, 2);
  assert.strictEqual(s.coverage, 2 / 3);
  assert.strictEqual(s.under_median_share, 2 / 3);
  assert.deepStrictEqual(s.excluded, [{ objective: '4', reason: 'incomplete actuals', trds: ['4-02'] }]);
  // TRD rows whose metric is not excluded: two covered (4 and 5 are under P90 9) and one not (9 is over P90 6)
  assert.strictEqual(s.trd_compared, 3);
  assert.strictEqual(s.trd_coverage, 2 / 3);
  assert.strictEqual(s.sc2, 'pass', 'the median ratio is 1.0');
  assert.strictEqual(s.sc3, 'fail', 'coverage 2/3 is below 0.8');
});

test('summarize: fewer than 3 compared objectives is insufficient for both criteria', () => {
  const rows = [summaryRow('1', { agent: cmp(10, 30, 10) }), summaryRow('2', { agent: cmp(10, 30, 10) })];
  const s = backtest.summarize(rows, { minutes: [], cost_usd: [] }).agent_minutes;
  assert.strictEqual(s.compared, 2);
  assert.strictEqual(s.sc2, 'insufficient');
  assert.strictEqual(s.sc3, 'insufficient');
});

test('summarize: SC2 is the median ratio within the band, inclusive', () => {
  const at = (ratioActual) => backtest.summarize(
    ['1', '2', '3'].map((o) => summaryRow(o, { agent: cmp(13, 40, ratioActual) })), { minutes: [], cost_usd: [] }).agent_minutes;
  assert.strictEqual(at(10).median_ratio, 1.3);
  assert.strictEqual(at(10).sc2, 'pass', '1.30 is the boundary');
  assert.strictEqual(at(9.9).sc2, 'fail', '13 / 9.9 is above 1.30');
  const low = backtest.summarize(
    ['1', '2', '3'].map((o) => summaryRow(o, { agent: cmp(7, 40, 10) })), { minutes: [], cost_usd: [] }).agent_minutes;
  assert.strictEqual(low.sc2, 'pass', '0.70 is the boundary');
});

test('summarize: SC3 needs P90 to cover 80% of the objectives and of the TRDs', () => {
  const covered = cmp(10, 30, 10);
  const uncovered = cmp(10, 12, 20);
  const fiveObjectives = (trdFor) => ['1', '2', '3', '4', '5'].map((o, i) => summaryRow(o, {
    agent: i < 4 ? covered : uncovered,
    trdMinutes: trdFor(i),
  }));
  const none = { minutes: [], cost_usd: [] };

  // objectives 4 of 5 = 0.8, TRDs 4 of 5 = 0.8
  const pass = backtest.summarize(fiveObjectives((i) => [i < 4 ? covered : uncovered]), none).agent_minutes;
  assert.deepStrictEqual([pass.coverage, pass.trd_coverage, pass.sc3], [0.8, 0.8, 'pass']);

  // objectives 0.8 but TRDs 3 of 5 = 0.6
  const narrowTrds = backtest.summarize(fiveObjectives((i) => [i < 3 ? covered : uncovered]), none).agent_minutes;
  assert.deepStrictEqual([narrowTrds.coverage, narrowTrds.trd_coverage, narrowTrds.sc3], [0.8, 0.6, 'fail']);

  // objectives pass with no TRD comparison at all: the TRD half cannot be judged
  const noTrds = backtest.summarize(fiveObjectives(() => []), none).agent_minutes;
  assert.deepStrictEqual([noTrds.trd_compared, noTrds.trd_coverage, noTrds.sc3], [0, null, 'insufficient']);
});

test('summarize: cost_usd is judged on its own comparisons and counts the miscalibrated classes', () => {
  const rows = ['1', '2', '3'].map((o) => summaryRow(o, {
    agent: cmp(10, 30, 10), cost: cmp(2, 4, 1), trdCost: [cmp(1, 2, 1)],
  }));
  const classes = {
    minutes: [{ class: 'a', verdict: 'miscalibrated' }],
    cost_usd: [{ class: 'a', verdict: 'miscalibrated' }, { class: 'b', verdict: 'ok' }, { class: 'c', verdict: 'miscalibrated' }],
  };
  const out = backtest.summarize(rows, classes);
  assert.strictEqual(out.cost_usd.median_ratio, 2, '2 / 1');
  assert.strictEqual(out.cost_usd.sc2, 'fail');
  assert.strictEqual(out.cost_usd.trd_compared, 3);
  assert.strictEqual(out.cost_usd.miscalibrated_classes, 2);
  assert.strictEqual(out.agent_minutes.miscalibrated_classes, 1);
  assert.strictEqual(out.agent_minutes.median_ratio, 1);
});

test('summarize: wall time is informational, with no SC2 or SC3', () => {
  const wall = (p50, p90, actual, waves) => ({
    source: 'prospective', actual, prospective: cmp(p50, p90, actual), waves,
  });
  const rows = [
    summaryRow('1', { wall: wall(100, 300, 80, [cmp(20, 60, 18), cmp(10, 30, 50)]) }),
    summaryRow('2'),
  ];
  const s = backtest.summarize(rows, { minutes: [], cost_usd: [] }).wall_minutes;
  assert.strictEqual(s.compared, 1);
  assert.strictEqual(s.median_ratio, 1.25);
  assert.strictEqual(s.coverage, 1);
  assert.deepStrictEqual(s.waves, { compared: 2, coverage: 0.5 });
  assert.ok(!('sc2' in s) && !('sc3' in s), 'one objective can never reach the minimum, so it is not judged');
});

test('summarize: with no compared objective every figure is null, never zero', () => {
  const s = backtest.summarize([summaryRow('1', { agent: EXCLUDED('no estimate', []) })], { minutes: [], cost_usd: [] });
  assert.deepStrictEqual(
    [s.agent_minutes.compared, s.agent_minutes.median_ratio, s.agent_minutes.pooled_ratio, s.agent_minutes.coverage,
      s.agent_minutes.under_median_share, s.agent_minutes.sc2],
    [0, null, null, null, null, 'insufficient'],
  );
  assert.strictEqual(s.wall_minutes.compared, 0);
  assert.strictEqual(s.wall_minutes.median_ratio, null);
});

// ─── compareObjective ─────────────────────────────────────────────────────────

// Objective 90: two TRDs estimated at 10 and 20 minutes (30 together) and $2 and $3 ($5), measured at 25 and 35 minutes
// (60) and $1.68 each ($3.36). Wall time was estimated at {96.6, 290.4}.
function alphaEstimate(execution) {
  return fx.objectiveEstimate({
    objective: '90',
    dir: '90-alpha',
    execution: execution === undefined
      ? { wall_minutes: fx.stat(96.6, 290.4), agent_minutes: fx.stat(30, 90), cost_usd: fx.stat(5, 10) }
      : execution,
    trds: [
      fx.trdEstimate({ id: '90-01', wave: 1, minutes: fx.stat(10, 30), cost: fx.stat(2, 4) }),
      fx.trdEstimate({ id: '90-02', wave: 2, minutes: fx.stat(20, 60), cost: fx.stat(3, 6) }),
    ],
  });
}

function alphaProject(overrides = {}) {
  return fx.projectRecord([
    fx.trdRecord({ id: '90-01', minutes: 25, tokens: PRICED, ...(overrides['90-01'] || {}) }),
    fx.trdRecord({ id: '90-02', minutes: 35, tokens: PRICED, ...(overrides['90-02'] || {}) }),
  ]);
}

function compareAlpha({ estimate = alphaEstimate(), project = alphaProject(), run = null } = {}) {
  const actuals = backtest.objectiveActuals(project, '90-alpha', fx.testRates());
  return backtest.compareObjective({ estimate, actuals, run });
}

// Objective 63's real run state: started 2026-10-06T23:55:36.062Z, finished 2026-10-07T01:46:41.099Z, no
// `estimate.execution` (it was recorded before 64-02 added that field).
function run63() {
  return fx.runState({
    objective: '63',
    wall: fx.stat(96.61616043566684, 290.40059551531397),
    waves: [
      { wave: 1, trds: ['63-01', '63-05'], p50: 19.738206139394915, p90: 67.31643574086333,
        started_at: '2026-10-06T23:56:09.280Z', finished_at: '2026-10-07T00:14:43.608Z', actual_minutes: 18.572133333333333 },
      { wave: 4, trds: ['63-06'], p50: 9.500000000000002, p90: 36.60000000000001,
        started_at: '2026-10-07T00:35:54.113Z', finished_at: '2026-10-07T01:26:30.878Z', actual_minutes: 50.61275 },
    ],
  });
}

test('compareObjective: with no run state the executor metrics are reconstructed and the TRDs are compared by id', () => {
  const row = compareAlpha();
  assert.deepStrictEqual([row.objective, row.name, row.dir, row.trds], ['90', 'Alpha', '90-alpha', 2]);

  assert.strictEqual(row.agent_minutes.source, 'reconstructed');
  assert.deepStrictEqual([row.agent_minutes.p50, row.agent_minutes.p90, row.agent_minutes.actual], [30, 90, 60]);
  assert.strictEqual(row.agent_minutes.ratio, 0.5);
  assert.strictEqual(row.agent_minutes.within_band, false);
  assert.strictEqual(row.agent_minutes.covered, true);
  assert.strictEqual(row.cost_usd.source, 'reconstructed');
  near(row.cost_usd.actual, 3.36);
  near(row.cost_usd.ratio, 5 / 3.36);

  assert.deepStrictEqual(row.trd_rows.map((t) => [t.id, t.wave]), [['90-01', 1], ['90-02', 2]]);
  assert.strictEqual(row.trd_rows[0].minutes.ratio, 10 / 25);
  assert.strictEqual(row.trd_rows[1].minutes.ratio, 20 / 35);
  near(row.trd_rows[0].cost_usd.ratio, 2 / 1.68);
  assert.strictEqual(row.trd_rows[0].tasks.length, 2, 'the task estimates travel with the TRD row for classRows');
});

test('compareObjective: an objective with no run state has no wall time', () => {
  assert.deepStrictEqual(compareAlpha().wall_minutes, { source: null, excluded: 'no run state recorded' });
});

test('compareObjective: a persisted estimate.execution is preferred and labelled prospective, TRD rows stay reconstructed', () => {
  const run = fx.runState({
    objective: '90',
    finished_at: null,
    execution: { agent_minutes: fx.stat(55, 100), cost_usd: fx.stat(3, 6) },
  });
  const row = compareAlpha({ run });
  assert.strictEqual(row.agent_minutes.source, 'prospective');
  assert.deepStrictEqual([row.agent_minutes.p50, row.agent_minutes.p90], [55, 100]);
  assert.strictEqual(row.agent_minutes.ratio, 55 / 60);
  assert.strictEqual(row.cost_usd.source, 'prospective');
  assert.strictEqual(row.cost_usd.p50, 3);
  assert.strictEqual(row.trd_rows[0].minutes.p50, 10, 'a TRD estimate is never persisted, so it is reconstructed');
});

test('compareObjective: a persisted metric that is missing falls back to the reconstructed one, per metric', () => {
  const run = fx.runState({ objective: '90', finished_at: null, execution: { agent_minutes: fx.stat(55, 100) } });
  const row = compareAlpha({ run });
  assert.strictEqual(row.agent_minutes.source, 'prospective');
  assert.strictEqual(row.cost_usd.source, 'reconstructed');
  assert.strictEqual(row.cost_usd.p50, 5);
});

test('compareObjective: a finished run state without estimate.execution gives prospective wall time (Objective 63\'s shape)', () => {
  const estimate = fx.objectiveEstimate({
    objective: '63', dir: '63-todo-store',
    execution: { wall_minutes: fx.stat(96.6, 290.4), agent_minutes: fx.stat(30, 90), cost_usd: fx.stat(5, 10) },
    trds: [fx.trdEstimate({ id: '63-01' })],
  });
  const actuals = backtest.objectiveActuals(fx.projectRecord([]), '63-todo-store', fx.testRates());
  const row = backtest.compareObjective({ estimate, actuals, run: run63() });

  assert.strictEqual(row.agent_minutes.source, 'reconstructed', 'there is no persisted execution to prefer');
  assert.strictEqual(row.cost_usd.source, 'reconstructed');

  const wall = row.wall_minutes;
  assert.strictEqual(wall.source, 'prospective');
  assert.strictEqual(wall.started_at, '2026-10-06T23:55:36.062Z');
  assert.strictEqual(wall.finished_at, '2026-10-07T01:46:41.099Z');
  // 01:46:41.099 the next day - 23:55:36.062 = 1h 51m 5.037s = 6665.037 s
  near(wall.actual, 6665.037 / 60);
  assert.ok(wall.actual > 111.0839 && wall.actual < 111.0840);
  assert.strictEqual(wall.prospective.p50, 96.61616043566684);
  assert.strictEqual(wall.prospective.ratio, 96.61616043566684 / wall.actual);
  assert.deepStrictEqual(wall.reconstructed, fx.stat(96.6, 290.4));
  assert.strictEqual(wall.reproduced, true, '|96.616 - 96.6| = 0.016 and |290.4006 - 290.4| = 0.0006, both within 0.05');

  assert.deepStrictEqual(wall.waves.map((w) => [w.wave, w.trds]), [[1, ['63-01', '63-05']], [4, ['63-06']]]);
  assert.strictEqual(wall.waves[0].actual, 18.572133333333333);
  assert.strictEqual(wall.waves[0].p50, 19.738206139394915);
  assert.strictEqual(wall.waves[0].covered, true);
  assert.strictEqual(wall.waves[1].covered, false, 'wave 4 took 50.6 minutes, over its P90 of 36.6');
  assert.strictEqual(wall.waves[1].ratio, 9.500000000000002 / 50.61275);
});

test('compareObjective: reproduced is false when either percentile of the reconstructed wall estimate differs by more than 0.05', () => {
  const wallOf = (reconstructed) => compareAlpha({
    estimate: alphaEstimate({ wall_minutes: reconstructed, agent_minutes: fx.stat(30, 90), cost_usd: fx.stat(5, 10) }),
    run: run63(),
  }).wall_minutes;
  assert.strictEqual(wallOf(fx.stat(96.0, 290.4)).reproduced, false, 'p50 differs by 0.616');
  assert.strictEqual(wallOf(fx.stat(96.6, 291.4)).reproduced, false, 'p90 differs by 1.0');
  assert.strictEqual(wallOf(null).reproduced, null, 'nothing to reproduce against');
});

test('compareObjective: a run that has not finished, or has unparseable times, never throws', () => {
  const running = compareAlpha({ run: fx.runState({ objective: '90', finished_at: null }) });
  assert.deepStrictEqual(running.wall_minutes, { source: null, excluded: 'run not finished' });

  const garbled = compareAlpha({ run: fx.runState({ objective: '90', started_at: 'yesterday', finished_at: 'later' }) });
  assert.strictEqual(garbled.wall_minutes.source, 'prospective');
  assert.strictEqual(garbled.wall_minutes.actual, null);
  assert.strictEqual(garbled.wall_minutes.prospective.excluded, 'no actual');
});

test('compareObjective: a TRD without minutes excludes the agent minutes with its id, but cost still compares', () => {
  const row = compareAlpha({ project: alphaProject({ '90-02': { minutes: null } }) });
  assert.strictEqual(row.agent_minutes.excluded, 'incomplete actuals');
  assert.deepStrictEqual(row.agent_minutes.trds, ['90-02']);
  assert.strictEqual(row.agent_minutes.source, 'reconstructed');
  assert.ok(!('ratio' in row.agent_minutes));
  assert.strictEqual(row.cost_usd.excluded, null, 'every TRD is priced');
  assert.strictEqual(row.trd_rows[0].minutes.excluded, null);
  assert.strictEqual(row.trd_rows[1].minutes.excluded, 'no actual', 'the TRD-level comparison names the same gap');
  assert.strictEqual(row.trd_rows[1].cost_usd.excluded, null);
});

test('compareObjective: a human-wait TRD or an unpriced one is named in the exclusion', () => {
  const waiting = compareAlpha({ project: alphaProject({ '90-01': { autonomous: false } }) });
  assert.strictEqual(waiting.agent_minutes.excluded, 'incomplete actuals');
  assert.deepStrictEqual(waiting.agent_minutes.trds, ['90-01']);
  assert.strictEqual(waiting.cost_usd.excluded, null, 'a human wait still has tokens');

  const unknown = compareAlpha({ project: alphaProject({ '90-02': { tokens: { ...PRICED, token_model: 'unknown-model' } } }) });
  assert.strictEqual(unknown.cost_usd.excluded, 'incomplete actuals');
  assert.deepStrictEqual(unknown.cost_usd.trds, ['90-02']);
  assert.strictEqual(unknown.agent_minutes.excluded, null);
});

test('compareObjective: an objective the calibration cannot estimate has both metrics excluded as no estimate', () => {
  const row = compareAlpha({ estimate: alphaEstimate(null) });
  assert.strictEqual(row.agent_minutes.excluded, 'no estimate');
  assert.strictEqual(row.cost_usd.excluded, 'no estimate');
  assert.strictEqual(row.agent_minutes.source, 'reconstructed');
});

test('compareObjective: a TRD estimate with no matching SUMMARY has no actual', () => {
  const project = fx.projectRecord([fx.trdRecord({ id: '90-01', minutes: 25, tokens: PRICED })]);
  const row = compareAlpha({ project });
  assert.strictEqual(row.trd_rows[1].minutes.excluded, 'no actual');
  assert.strictEqual(row.trd_rows[1].cost_usd.excluded, 'no actual');
  assert.strictEqual(row.trd_rows[0].minutes.excluded, null);
});
