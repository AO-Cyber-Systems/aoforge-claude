'use strict';

// Tests for estimate-rollup.cjs (TRD 58-06, EST-03 objective layer). The calibration is the literal CAL_V2 (or a
// makeCalibration copy), the project is the literal ROLLUP_SPEC written into an mkdtemp directory: nothing here reads
// or writes the real ~/.claude/aoforge/calibration.json. Anchors are within an absolute 0.05 unless stated; they were
// computed independently (Python, math.erf) from CAL_V2's literals with the composition rules in estimate-math.cjs.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const em = require('./estimate-math.cjs');
const rollup = require('./estimate-rollup.cjs');
const {
  CAL_V2,
  makeCalibration,
  makeCalibrationV3,
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

// ─── Agent overhead, the gap-closure factor, unplanned objectives (Task 2) ────

const CAL0 = makeCalibration({
  probabilities: { gap_closure: { value: 0, n: 40 }, checkpoint: { value: 0.02, n: 50 } },
});
const CAL_V1 = makeCalibration({ version: 1, agent_overhead: undefined, objective_level: undefined });

test('1c. estimateObjective: one verifier of overhead, the gap-closure mixture, confidence and method', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '80');

  nearPair(r.total.wall_minutes, 25.6464, 69.1577, 'total wall');
  nearPair(r.total.agent_minutes, 29.8369, 76.4976, 'total agent minutes');
  assert.notEqual(r.total.tokens_input, null);
  assert.notEqual(r.total.tokens_output, null);
  assert.notEqual(r.total.cost_usd, null);
  // The mixture only adds: every total is above the execution part.
  assert.ok(r.total.wall_minutes.p50 > r.execution.wall_minutes.p50);
  assert.ok(r.total.cost_usd.p50 > r.execution.cost_usd.p50);

  assert.equal(r.overhead.length, 1);
  assert.equal(r.overhead[0].agent, 'verifier');
  assert.equal(r.overhead[0].spawns, 1);
  assert.equal(r.overhead[0].samples, 31);
  assert.equal(r.overhead[0].confidence, 'high');
  assert.deepEqual({ p50: r.overhead[0].minutes.p50, p90: r.overhead[0].minutes.p90 }, { p50: 4, p90: 10 });
  assert.deepEqual(r.spent, ['planner', 'job-checker']);

  assert.equal(r.gap_closure.probability, 0.1);
  assert.equal(r.gap_closure.n, 40);
  nearPair(r.gap_closure.extra.wall_minutes, 25.4888, 73.6832, 'gap extra wall');
  assert.notEqual(r.gap_closure.extra.cost_usd, null);
  assert.deepEqual(r.gap_closure.notes, []);

  assert.equal(r.confidence, 'medium');
  assert.equal(r.weakest.name, '80-02');
  assert.equal(r.weakest.class, 'doc');
  assert.equal(r.weakest.n, 10);
  assert.deepEqual(r.missing, []);
  assert.equal(r.history, null);

  for (const rule of ['within_trd', 'across', 'parallel_wave', 'gap_closure']) {
    assert.equal(typeof r.method[rule], 'string', `method.${rule}`);
  }
  assert.deepEqual(r.method, rollup.METHOD);
});

test('2. a gap-closure probability of 0 adds no mass; parallel: false sums wave 1', () => {
  const r = rollup.estimateObjective(CAL0, root, '80');
  nearPair(r.total.wall_minutes, 23.993, 61.0235, 'total wall, no gap mass');
  nearPair(r.total.cost_usd, 6.1068, 9.5407, 'total cost, no gap mass');
  assert.equal(r.gap_closure.probability, 0);
  assert.equal(r.gap_closure.n, 40);
  // The extra is still reported: it is what a gap cycle would cost.
  nearPair(r.gap_closure.extra.wall_minutes, 25.4888, 73.6832, 'gap extra wall');

  const serial = rollup.estimateObjective(CAL0, root, '80', { parallel: false });
  nearPair(serial.total.wall_minutes, 28.2265, 68.2523, 'total wall, wave 1 summed');
});

test('2b. no gap-closure probability in the calibration: the total is the base and the note says so', () => {
  const noP = makeCalibration({ probabilities: { gap_closure: undefined } });
  const r = rollup.estimateObjective(noP, root, '80');
  nearPair(r.total.wall_minutes, 23.993, 61.0235, 'total wall');
  assert.equal(r.gap_closure, null);
  assert.ok(r.notes.includes('gap closure: no data'), JSON.stringify(r.notes));
});

test('6b. the checkpoint-only objective: one doc TRD, one verifier, the gap mixture', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '83');
  nearPair(r.total.wall_minutes, 8.9727, 23.5003, 'total wall');
  assert.equal(r.status, 'planned');
});

test('4. an objective with no TRDs is estimated from objective_level history and labelled unplanned', () => {
  const r = rollup.estimateObjective(CAL_V2, root, '81');
  assert.equal(r.status, 'unplanned');
  assert.equal(r.wall_basis, 'serial (unplanned)');
  assert.deepEqual(r.trds, { total: 0, done: 0, remaining: 0 });
  assert.deepEqual(r.waves, []);
  nearPair(r.total.wall_minutes, 62.2252, 184.6035, 'total wall');
  nearPair(r.total.cost_usd, 17.9788, 46.9899, 'total cost');
  assert.equal(r.gap_closure, null);
  assert.ok(r.notes.some((n) => /gap-closure cycles/.test(n)), JSON.stringify(r.notes));
  assert.deepEqual(r.overhead.map((o) => o.agent), ['planner', 'job-checker', 'verifier']);
  assert.deepEqual(r.spent, []);
  assert.equal(r.confidence, 'low');
  assert.notEqual(r.weakest, null);
  assert.deepEqual(r.history, { objectives: 30 });
  assert.ok(r.notes.some((n) => /30 objectives/.test(n)), JSON.stringify(r.notes));
  assert.equal(r.name, 'beta');
  assert.deepEqual(r.method, rollup.METHOD);
});

test('4b. estimateUnplanned stands alone for a roadmap objective that has no directory', () => {
  const r = rollup.estimateUnplanned(CAL_V2, { objective: '90', name: 'Future work' });
  assert.equal(r.objective, '90');
  assert.equal(r.name, 'Future work');
  assert.equal(r.dir, null);
  assert.equal(r.status, 'unplanned');
  nearPair(r.total.wall_minutes, 62.2252, 184.6035, 'total wall');
  assert.equal(r.confidence, 'low');
});

test('7. a version 1 calibration: execution is still estimated, missing overhead is listed and caps confidence at low', () => {
  const r = rollup.estimateObjective(CAL_V1, root, '80');
  nearPair(r.execution.wall_minutes, 19.3982, 52.1221, 'execution wall');
  assert.ok(r.missing.includes('agent_overhead.verifier'), JSON.stringify(r.missing));
  assert.equal(r.confidence, 'low');
  assert.deepEqual(r.overhead, []);

  // No verifier in the base; the gap extra is trd_level alone.
  nearPair(r.total.wall_minutes, 20.3534, 56.617, 'total wall');
  nearPair(r.gap_closure.extra.wall_minutes, 12, 45, 'gap extra wall (trd_level only)');
  assert.ok(r.gap_closure.notes.some((n) => /planner/.test(n) && /verifier/.test(n)), JSON.stringify(r.gap_closure.notes));

  const unplanned = rollup.estimateObjective(CAL_V1, root, '81');
  assert.equal(unplanned.status, 'unplanned');
  assert.deepEqual(unplanned.total, {
    wall_minutes: null, agent_minutes: null, tokens_input: null, tokens_output: null, cost_usd: null,
  });
  assert.deepEqual(unplanned.missing, ['objective_level']);
  assert.equal(unplanned.confidence, 'none');
  assert.equal(unplanned.history, null);
});

test('objectiveOverhead returns an entry per agent with data and names the agents without', () => {
  const some = rollup.objectiveOverhead(CAL_V2, ['planner', 'verifier', 'roadmapper', 'objective-researcher', 'nobody']);
  assert.deepEqual(some.entries.map((e) => e.agent), ['planner', 'verifier']);
  assert.deepEqual(some.missing, [
    'agent_overhead.roadmapper', 'agent_overhead.objective-researcher', 'agent_overhead.nobody',
  ]);
  const planner = some.entries[0];
  assert.equal(planner.spawns, 1);
  assert.equal(planner.samples, 25);
  assert.equal(planner.confidence, 'medium');
  assert.deepEqual({ p50: planner.cost_usd.p50, p90: planner.cost_usd.p90 }, { p50: 2, p90: 4.5 });

  const none = rollup.objectiveOverhead(CAL_V1, ['verifier']);
  assert.deepEqual(none.entries, []);
  assert.deepEqual(none.missing, ['agent_overhead.verifier']);
});

// ─── TRD-level minutes (TRD 67-03, EST-10) ────────────────────────────────────

test('9. trd_level: an objective composes its TRDs\' TRD-level minutes as a correlated sum, whatever their task counts', (t) => {
  const task = (n, files, tdd) => ({ name: `Task ${n}: t${n}`, files, tdd });
  const levelRoot = makeEstimateProject({
    name: 'rollup-trd-level',
    config: { parallelization: { enabled: true } },
    objectives: [
      {
        dir: '85-level',
        objectiveMd: '# Objective 85: level\n',
        trds: [
          {
            nn: '01',
            slug: 'one',
            frontmatter: { type: 'standard', wave: 1, depends_on: [] },
            tasks: [task(1, ['lib/a.cjs', 'lib/a.test.cjs'], true)],
          },
          {
            nn: '02',
            slug: 'three',
            frontmatter: { type: 'standard', wave: 1, depends_on: [] },
            tasks: [
              task(1, ['lib/b.cjs', 'lib/b.test.cjs'], true),
              task(2, ['lib/c.cjs'], true),
              task(3, ['lib/d.cjs'], true),
            ],
          },
        ],
      },
    ],
  });
  t.after(() => removeEstimateProject(levelRoot));

  const trdLevelCal = makeCalibrationV3({ minutes: 'trd_level' });
  const taskSumCal = makeCalibrationV3({ minutes: 'task_sum' });

  const level = rollup.estimateObjective(trdLevelCal, levelRoot, '85', { all: true });
  assert.deepEqual(level.trd_estimates.map((e) => e.id), ['85-01', '85-02']);
  assert.deepEqual(level.trd_estimates.map((e) => e.minutes), [{ p50: 12, p90: 45 }, { p50: 12, p90: 45 }]);
  assert.deepEqual(level.trd_estimates.map((e) => e.minutes_basis), ['trd_level', 'trd_level']);

  const expected = em.summarize(em.sumCorrelated([em.fitQuantiles({ p50: 12, p90: 45 }), em.fitQuantiles({ p50: 12, p90: 45 })]));
  assert.ok(Math.abs(expected.p50 - 26.244139884112773) < 1e-9, 'the independent anchor from the TRD');
  assert.ok(Math.abs(expected.p90 - 87.62100705046149) < 1e-9, 'the independent anchor from the TRD');
  assert.ok(Math.abs(level.execution.agent_minutes.p50 - expected.p50) < 1e-9, `agent minutes p50 ${level.execution.agent_minutes.p50}`);
  assert.ok(Math.abs(level.execution.agent_minutes.p90 - expected.p90) < 1e-9, `agent minutes p90 ${level.execution.agent_minutes.p90}`);

  // The method changes only minutes: under task_sum the same objective is estimated from the task quantile sums, and its
  // tokens and cost are the same numbers.
  const sum = rollup.estimateObjective(taskSumCal, levelRoot, '85', { all: true });
  assert.notDeepEqual(sum.execution.agent_minutes, level.execution.agent_minutes);
  assert.deepEqual(sum.execution.tokens_input, level.execution.tokens_input);
  assert.deepEqual(sum.execution.tokens_output, level.execution.tokens_output);
  assert.deepEqual(sum.execution.cost_usd, level.execution.cost_usd);
});
