'use strict';

// Tests for estimate-rollup.cjs (TRD 58-06, EST-03 objective layer). The calibration is the literal CAL_V2 (or a
// makeCalibration copy), the project is the literal ROLLUP_SPEC written into an mkdtemp directory: nothing here reads
// or writes the real ~/.claude/devflow/calibration.json. Anchors are within an absolute 0.05 unless stated; they were
// computed independently (Python, math.erf) from CAL_V2's literals with the composition rules in estimate-math.cjs.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const rollup = require('./estimate-rollup.cjs');
const {
  CAL_V2,
  makeEstimateProject,
  removeEstimateProject,
  ROLLUP_SPEC,
} = require('./__fixtures__/estimate-fixtures.cjs');

const TOL = 0.05;

function near(actual, expected, label) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= TOL,
    `${label}: expected ${expected} within ${TOL}, got ${actual}`,
  );
}

function nearPair(stat, p50, p90, label) {
  assert.notEqual(stat, null, `${label} is null`);
  near(stat.p50, p50, `${label} p50`);
  near(stat.p90, p90, `${label} p90`);
}

let root;
before(() => {
  root = makeEstimateProject(ROLLUP_SPEC);
});
after(() => {
  removeEstimateProject(root);
});

test('1. estimateObjective (execution part): remaining TRDs grouped by wave, parallel waves take the max', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '80');

  assert.equal(r.objective, '80');
  assert.equal(r.name, 'alpha');
  assert.equal(r.dir, '.planning/objectives/80-alpha');
  assert.equal(r.status, 'partial');
  assert.equal(r.parallel, true);
  assert.deepEqual(r.trds, { total: 4, done: 1, remaining: 3 });
  assert.deepEqual(r.trd_estimates.map((t) => t.id), ['80-01', '80-02', '80-03']);

  assert.deepEqual(r.waves.map((w) => w.wave), [1, 2]);
  assert.deepEqual(r.waves[0].trds, ['80-01', '80-02']);
  assert.deepEqual(r.waves[1].trds, ['80-03']);
  nearPair(r.waves[0].wall_minutes, 12.2554, 36.0038, 'wave 1 wall');
  nearPair(r.waves[1].wall_minutes, 6, 18, 'wave 2 wall');

  nearPair(r.execution.wall_minutes, 19.3982, 52.1221, 'execution wall');
  nearPair(r.execution.agent_minutes, 23.5292, 59.6548, 'execution agent minutes');
  assert.notEqual(r.execution.tokens_input, null);
  assert.notEqual(r.execution.tokens_output, null);
  assert.notEqual(r.execution.cost_usd, null);

  // Task 1 leaves `total` equal to the execution part; the overhead and the gap-closure mixture arrive with Task 2.
  assert.equal(r.wall_basis, 'parallel waves');
  assert.equal(r.method.across, 'correlated sum, rho 0.5 (Fenton-Wilkinson)');
});

test('1b. an explicit parallel: false sums the wave; the TRDs of a wave then run one after the other', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '80', { parallel: false });
  assert.equal(r.parallel, false);
  nearPair(r.waves[0].wall_minutes, 16.4034, 43.6535, 'summed wave 1');
  nearPair(r.waves[1].wall_minutes, 6, 18, 'wave 2');
  assert.equal(r.wall_basis, 'serial waves');
});

test('3. all: true also estimates the done TRDs (a backtest)', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '80', { all: true });
  assert.equal(r.trds.remaining, 4);
  assert.equal(r.trds.total, 4);
  assert.deepEqual(r.waves.map((w) => w.wave), [1, 2]);
  assert.deepEqual(r.waves[1].trds, ['80-03', '80-04']);
  assert.ok(r.notes.some((n) => /done TRDs/.test(n)), `notes name the backtest: ${JSON.stringify(r.notes)}`);
});

test('5. an objective whose every TRD has a complete SUMMARY is done and costs nothing', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '82');
  assert.equal(r.status, 'done');
  assert.deepEqual(r.trds, { total: 1, done: 1, remaining: 0 });
  assert.deepEqual(r.waves, []);
  assert.deepEqual(r.total.wall_minutes, { p50: 0, p90: 0 });
  assert.deepEqual(r.total.agent_minutes, { p50: 0, p90: 0 });
  assert.deepEqual(r.total.cost_usd, { p50: 0, p90: 0 });
  assert.equal(r.confidence, 'n/a');
  assert.equal(r.weakest, null);
});

test('6. a checkpoint-only SUMMARY does not count as done', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '83');
  assert.equal(r.status, 'planned');
  assert.deepEqual(r.trds, { total: 1, done: 0, remaining: 1 });
  assert.deepEqual(r.waves.map((w) => w.trds), [['83-01']]);
  nearPair(r.waves[0].wall_minutes, 4, 8, 'wave 1 wall');
});

test('8. an unknown objective throws; with no explicit option parallelization comes from config.json', (t) => {
  assert.throws(() => rollup.estimateObjective(CAL_V2, root, '99'), /objective 99 not found/);

  const serialRoot = makeEstimateProject({ ...ROLLUP_SPEC, name: 'rollup-serial', config: { parallelization: false } });
  t.after(() => removeEstimateProject(serialRoot));
  const r = rollup.estimateObjective(CAL_V2, serialRoot, '80');
  assert.equal(r.parallel, false);
  nearPair(r.waves[0].wall_minutes, 16.4034, 43.6535, 'summed wave 1');

  // The explicit option wins over the file.
  const forced = rollup.estimateObjective(CAL_V2, serialRoot, '80', { parallel: true });
  assert.equal(forced.parallel, true);
  nearPair(forced.waves[0].wall_minutes, 12.2554, 36.0038, 'parallel wave 1');
});

test('remainingTrds pairs TRDs with SUMMARYs by key and applies the checkpoint-only rule', () => {
  const alpha = rollup.remainingTrds(root, '80');
  assert.equal(alpha.total, 4);
  assert.equal(alpha.done, 1);
  assert.deepEqual(alpha.trds.map((t) => t.id), ['80-01', '80-02', '80-03']);
  assert.ok(alpha.trds.every((t) => typeof t.text === 'string' && t.text.includes('<task')));

  const delta = rollup.remainingTrds(root, '83');
  assert.equal(delta.done, 0);
  assert.deepEqual(delta.trds.map((t) => t.id), ['83-01']);

  const everything = rollup.remainingTrds(root, '80', { all: true });
  assert.deepEqual(everything.trds.map((t) => t.id), ['80-01', '80-02', '80-03', '80-04']);

  assert.throws(() => rollup.remainingTrds(root, '99'), /objective 99 not found/);
});
