'use strict';

// Tests for scripts/estimate-window-eval.cjs (TRD 64-07, EST-08 gap closure). Every project is a hand-built literal
// written into an mkdtemp directory by the fixture builders; no git, no network, no ~/.claude. The step-change fixture
// has hand-computable numbers (see stepSpec): evaluating objective 6 with history 1-5, all-history estimates each TRD
// at 40 minutes against an actual of 10 (ratio 4); a window of 2 estimates 10 (ratio 1).

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const evalTool = require('./estimate-window-eval.cjs');
const lib = path.join(__dirname, '..', 'plugins', 'devflow', 'devflow', 'bin', 'lib');
const { makeCalibrationProject, removeCalibrationProject } = require(path.join(lib, '__fixtures__', 'calibration-fixtures.cjs'));
const { makeEstimateProject, removeEstimateProject, makeCalibration } = require(path.join(lib, '__fixtures__', 'estimate-fixtures.cjs'));
const em = require(path.join(lib, 'estimate-math.cjs'));
const est = require(path.join(lib, 'estimate.cjs'));
const rollup = require(path.join(lib, 'estimate-rollup.cjs'));
const ci = require(path.join(lib, 'calibration-inputs.cjs'));
const calibrator = require(path.join(lib, 'calibrator.cjs'));
const { BAND, COVERAGE_TARGET, median } = require(path.join(lib, 'estimate-backtest.cjs'));

const SCRIPT = path.join(__dirname, 'estimate-window-eval.cjs');

function near(actual, expected, label, tol = 1e-6) {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

const CODE_TDD = ['lib/x.cjs', 'lib/x.test.cjs'];

function stepTrd(nn, duration) {
  return {
    nn,
    slug: 'work',
    frontmatter: { type: 'standard' },
    tasks: [
      { name: 'Task 1: a', type: 'auto', tdd: true, files: CODE_TDD },
      { name: 'Task 2: b', type: 'auto', tdd: true, files: CODE_TDD },
    ],
    summary: { duration, completed: '2026-09-01' },
  };
}

/** Objectives 1-a .. 6-f, TRDs 01 and 02, two code_tdd tasks each; 40min per TRD in 1-3, 10min per TRD in 4-6. */
function stepSpec() {
  const names = ['a', 'b', 'c', 'd', 'e', 'f'];
  return {
    name: 'step',
    objectives: names.map((n, i) => {
      const duration = i < 3 ? '40min' : '10min';
      return { dir: `${i + 1}-${n}`, trds: [stepTrd('01', duration), stepTrd('02', duration)] };
    }),
  };
}

function plainTrd(nn, duration, tasks = [{ name: 'Task 1: a', tdd: true, files: CODE_TDD }]) {
  return { nn, slug: 'work', frontmatter: { type: 'standard' }, tasks, summary: duration ? { duration, completed: '2026-09-01' } : null };
}

// ─── Task 1: ranking, cuts, rows, summaries, the rule, the noise floor ─────────

describe('rollingSweep', () => {
  let root;
  before(() => { root = makeCalibrationProject(stepSpec()); });
  after(() => removeCalibrationProject(root));

  test('1. the step change: all-history says 40 per TRD (ratio 4), a window of 2 says 10 (ratio 1); cuts are removed', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-scratch-'));
    try {
      const result = evalTool.rollingSweep({ snapshotRoot: root, evalObjectives: ['6-f'], windows: ['all', 2], scratchDir: scratch });
      assert.equal(result.length, 2);
      const all = result.find((c) => c.window === 'all');
      const two = result.find((c) => c.window === 2);
      assert.equal(all.objectives.length, 1);
      assert.equal(all.objectives[0].objective, '6-f');
      assert.equal(all.objectives[0].rows.length, 2);
      for (const r of all.objectives[0].rows) { near(r.p50, 40, 'all TRD p50'); near(r.actual, 10, 'TRD actual'); assert.equal(r.k, 2); }
      near(all.objectives[0].row.ratio, 4, 'all objective ratio');
      near(all.summary.median_ratio, 4, 'all median ratio');
      for (const r of two.objectives[0].rows) near(r.p50, 10, 'window 2 TRD p50');
      near(two.objectives[0].row.ratio, 1, 'window 2 objective ratio');
      near(two.summary.s, 0, 'window 2 S');
      assert.equal(two.summary.in_band, 1);
      assert.deepEqual(fs.readdirSync(scratch), [], 'the temporary cut directories are removed');
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test('1b. a cut with no history yields a candidate with no rows, never a pass', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-scratch-'));
    try {
      const result = evalTool.rollingSweep({ snapshotRoot: root, evalObjectives: ['1-a'], windows: ['all'], scratchDir: scratch });
      assert.deepEqual(result[0].objectives[0].rows, []);
      assert.equal(result[0].objectives[0].row, null);
      assert.equal(result[0].summary.n_objectives, 0);
      assert.equal(result[0].summary.s, null);
      assert.deepEqual(fs.readdirSync(scratch), []);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('selectWindow', () => {
  const base = { window: 'all', s: 0.3, in_band: 5, obj_coverage: 1, trd_coverage: 1, trd_bias: 0.2 };
  const cand = (window, over = {}) => ({ window, s: 0.1, in_band: 5, obj_coverage: 1, trd_coverage: 1, trd_bias: 0.2, ...over });
  const reason = (result, window) => result.reasons.find((r) => r.window === window);

  test('2a. a smaller S with full coverage and nothing worse than all is selected', () => {
    const result = evalTool.selectWindow([base, cand(10)]);
    assert.equal(result.decision, 'build_window');
    assert.equal(result.window, 10);
    assert.equal(reason(result, 10).eligible, true);
  });

  test('2b. a smaller S but fewer objectives in band is ineligible, so the decision is stop', () => {
    const result = evalTool.selectWindow([base, cand(10, { in_band: 4 })]);
    assert.equal(result.decision, 'stop');
    assert.equal(reason(result, 10).eligible, false);
    assert.match(reason(result, 10).failed.join(' '), /in band/);
  });

  test('2c. an objective coverage of 0.75 is ineligible', () => {
    assert.equal(COVERAGE_TARGET, 0.8);
    const result = evalTool.selectWindow([base, cand(10, { obj_coverage: 0.75 })]);
    assert.equal(result.decision, 'stop');
    assert.match(reason(result, 10).failed.join(' '), /objective coverage/);
    const trd = evalTool.selectWindow([base, cand(10, { trd_coverage: 0.75 })]);
    assert.equal(trd.decision, 'stop');
    assert.match(reason(trd, 10).failed.join(' '), /TRD coverage/);
  });

  test('2d. a TRD bias worse than all is ineligible', () => {
    const result = evalTool.selectWindow([base, cand(10, { trd_bias: 0.25 })]);
    assert.equal(result.decision, 'stop');
    assert.match(reason(result, 10).failed.join(' '), /TRD bias/);
  });

  test('2e. S within 0.02 of the smallest resolves to the larger window, a wider gap to the smaller S', () => {
    const near = evalTool.selectWindow([base, cand(10, { s: 0.05 }), cand(20, { s: 0.065 })]);
    assert.equal(near.decision, 'build_window');
    assert.equal(near.window, 20);
    const far = evalTool.selectWindow([base, cand(10, { s: 0.05 }), cand(20, { s: 0.08 })]);
    assert.equal(far.window, 10);
    const order = evalTool.selectWindow([base, cand(20, { s: 0.065 }), cand(10, { s: 0.05 })]);
    assert.equal(order.window, 20, 'the input order does not matter');
  });

  test('2f. no window with S below all stops, and every window carries its reasons', () => {
    const result = evalTool.selectWindow([base, cand(10, { s: 0.3 }), cand(20, { s: 0.4 })]);
    assert.equal(result.decision, 'stop');
    assert.equal(result.window, null);
    assert.deepEqual(result.reasons.map((r) => r.window), [10, 20]);
    for (const r of result.reasons) { assert.equal(r.eligible, false); assert.ok(r.failed.length > 0); }
    assert.throws(() => evalTool.selectWindow([cand(10)]), /all/);
  });

  test('2g. a candidate with no figures (null S) is ineligible', () => {
    const result = evalTool.selectWindow([base, cand(10, { s: null, obj_coverage: null })]);
    assert.equal(result.decision, 'stop');
  });
});

describe('noiseFloor', () => {
  test('3. the share of k-subsets whose median is in band, counted by enumeration', () => {
    assert.deepEqual(evalTool.noiseFloor([0.4, 0.5, 1.0, 1.9, 2.0, 2.5], 5), { subsets: 6, in_band: 3, share: 0.5 });
    assert.deepEqual(evalTool.noiseFloor([1, 2], 5), { subsets: 0, share: null });
    assert.deepEqual(evalTool.noiseFloor([1, 1, 1], 3), { subsets: 1, in_band: 1, share: 1 });
  });

  test('3b. the band edges are the unchanged BAND', () => {
    assert.equal(BAND, 0.3);
    assert.equal(evalTool.noiseFloor([1.3, 1.31], 1).in_band, 1);
    assert.equal(evalTool.noiseFloor([0.7, 0.69], 1).in_band, 1);
  });
});

describe('summarizeCandidate and objectiveRow', () => {
  test('4. ratios 0.5, 1, 2: median 1, S 0, one in band; coverage is the share of rows with actual <= P90', () => {
    const objectives = [0.5, 1.0, 2.0].map((ratio) => ({ ratio, covered: true }));
    const trds = [
      { actual: 15, p50: 10, p90: 20 },
      { actual: 25, p50: 10, p90: 20 },
      { actual: 5, p50: 10, p90: 20 },
      { actual: 20, p50: 10, p90: 20 },
    ];
    const s = evalTool.summarizeCandidate(objectives, trds);
    assert.equal(s.median_ratio, 1.0);
    assert.equal(s.median_ratio, median([0.5, 1.0, 2.0]));
    assert.equal(s.s, 0);
    assert.equal(s.in_band, 1);
    assert.equal(s.obj_coverage, 1);
    assert.equal(s.n_trds, 4);
    assert.equal(s.trd_coverage, 0.75);
    near(s.trd_median_ratio, median([10 / 15, 10 / 25, 2, 0.5]), 'TRD median ratio');
    near(s.trd_bias, Math.abs(Math.log(median([10 / 15, 10 / 25, 2, 0.5]))), 'TRD bias');
  });

  test('4b. S is the absolute log of the median; an even count uses the conventional median; no rows give nulls', () => {
    const s = evalTool.summarizeCandidate([{ ratio: 2, covered: false }, { ratio: 4, covered: true }], []);
    near(s.median_ratio, 3, 'median');
    near(s.s, Math.log(3), 'S');
    assert.equal(s.obj_coverage, 0.5);
    assert.equal(s.trd_coverage, null);
    assert.equal(s.trd_bias, null);
    const empty = evalTool.summarizeCandidate([], []);
    assert.equal(empty.s, null);
    assert.equal(empty.median_ratio, null);
    assert.equal(empty.in_band, 0);
    assert.equal(empty.n_objectives, 0);
  });

  test('5. an objective row is the correlated sum of its TRD rows; a TRD without an estimate leaves estimate and actual', () => {
    const rows = [{ id: 'x-01', p50: 10, p90: 10, actual: 12 }, { id: 'x-02', p50: 10, p90: 10, actual: 8 }];
    const row = evalTool.objectiveRow(rows);
    near(row.p50, 20, 'p50', 1e-9);
    near(row.p90, 20, 'p90', 1e-9);
    near(row.sum_p50, 20, 'sum_p50', 1e-9);
    assert.equal(row.actual, 20);
    near(row.ratio, 1, 'ratio', 1e-9);
    assert.equal(row.covered, true);
    assert.equal(row.n_trds, 2);

    const partial = evalTool.objectiveRow([...rows, { id: 'x-03', p50: null, p90: null, actual: 100 }]);
    assert.equal(partial.actual, 20, 'the TRD without an estimate is out of the actual too');
    assert.equal(partial.n_trds, 2);
    assert.equal(evalTool.objectiveRow([{ id: 'x-03', p50: null, p90: null, actual: 100 }]), null);
    assert.equal(evalTool.objectiveRow([]), null);
  });

  test('5b. the correlated sum composes spread: two TRDs with P90 above P50 sum to less than the sum of P90s', () => {
    const rows = [{ id: 'a', p50: 10, p90: 30, actual: 10 }, { id: 'b', p50: 10, p90: 30, actual: 10 }];
    const row = evalTool.objectiveRow(rows);
    const expected = em.summarize(em.sumCorrelated(rows.map((r) => em.fitQuantiles({ p50: r.p50, p90: r.p90 }))));
    assert.deepEqual({ p50: row.p50, p90: row.p90 }, expected);
    assert.ok(row.p90 < 60 && row.p90 > row.p50);
  });
});

describe('cutProject', () => {
  let root;
  let dest;
  before(() => {
    root = makeCalibrationProject({
      name: 'cut',
      objectives: [
        { dir: '1-a', trds: [plainTrd('01', '10min')] },
        { dir: '2-b', trds: [plainTrd('01', null)] },
        { dir: '3-c', trds: [plainTrd('01', '12min')] },
        { dir: '4-d', trds: [plainTrd('01', '14min')] },
        { dir: '5-e', trds: [plainTrd('01', '16min')] },
      ],
      stateArchiveRows: ['| Objective 3 P01 | 12min | 1 tasks | 1 files |'],
      stateJson: { metrics_log: [] },
    });
  });
  after(() => removeCalibrationProject(root));

  const cut = (over) => {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-cut-'));
    try {
      const r = evalTool.cutProject({ snapshotRoot: root, dest, ...over });
      return { kept: r.kept, listing: fs.readdirSync(path.join(dest, '.planning', 'objectives')).sort(), top: fs.readdirSync(path.join(dest, '.planning')).sort() };
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  };

  test('6. only sample-bearing objectives below `before`, the last `window` of them, plus the metric files', () => {
    const r = cut({ before: 5, window: 2 });
    assert.deepEqual(r.kept, ['3-c', '4-d']);
    assert.deepEqual(r.listing, ['3-c', '4-d']);
    assert.ok(r.top.includes('STATE_ARCHIVE.md') && r.top.includes('state.json'));
  });

  test('6b. window null keeps all of them; an objective of TRDs with no SUMMARY consumes no slot', () => {
    const r = cut({ before: 5, window: null });
    assert.deepEqual(r.kept, ['1-a', '3-c', '4-d']);
    assert.equal(r.listing.includes('2-b'), false);
    const three = cut({ before: 5, window: 3 });
    assert.deepEqual(three.kept, ['1-a', '3-c', '4-d'], 'a window of 3 reaches back past the empty objective');
  });

  test('6c. a window above the count keeps all; nothing below `before` keeps nothing but still makes a project', () => {
    assert.deepEqual(cut({ before: 5, window: 99 }).kept, ['1-a', '3-c', '4-d']);
    const none = cut({ before: 1, window: null });
    assert.deepEqual(none.kept, []);
    assert.deepEqual(none.listing, []);
  });

  test('6d. a snapshot without the metric files copies none', () => {
    const bare = makeCalibrationProject({ name: 'bare', objectives: [{ dir: '1-a', trds: [plainTrd('01', '10min')] }] });
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-cut-'));
    try {
      evalTool.cutProject({ snapshotRoot: bare, before: 9, window: null, dest: d });
      assert.deepEqual(fs.readdirSync(path.join(d, '.planning')).sort(), ['objectives']);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
      removeCalibrationProject(bare);
    }
  });
});

describe('ranking', () => {
  test('7. objective numbers order numerically, not lexically; a name with no number is last', () => {
    assert.equal(evalTool.objectiveNumber('12.1-x'), 12.1);
    assert.equal(evalTool.objectiveNumber('7-seven'), 7);
    assert.equal(evalTool.objectiveNumber('foo'), null);
    const ordered = ['9-a', '10-b', '10-c', '10.5-d', '11-e', 'foo'];
    assert.deepEqual(evalTool.rankObjectives(ordered), ordered);
    assert.deepEqual(evalTool.rankObjectives(['foo', '11-e', '10.5-d', '10-c', '9-a', '10-b']), ordered);
    assert.deepEqual(ordered, ['9-a', '10-b', '10-c', '10.5-d', '11-e', 'foo'], 'the input is not modified');
  });

  test('8. recentObjectives is the last W; null or "all" is all; W above the count is all', () => {
    const ranked = ['1-a', '2-b', '3-c', '4-d'];
    assert.deepEqual(evalTool.recentObjectives(ranked, 2), ['3-c', '4-d']);
    assert.deepEqual(evalTool.recentObjectives(ranked, null), ranked);
    assert.deepEqual(evalTool.recentObjectives(ranked, 'all'), ranked);
    assert.deepEqual(evalTool.recentObjectives(ranked, 10), ranked);
    assert.throws(() => evalTool.recentObjectives(ranked, 0), /window/);
    assert.throws(() => evalTool.recentObjectives(ranked, 1.5), /window/);
  });

  test('8b. sampleObjectives lists objectives with a TRD that has minutes or both token counts', () => {
    const root = makeCalibrationProject({
      name: 'samples',
      objectives: [
        { dir: '10-x', trds: [plainTrd('01', '5min')] },
        { dir: '2-y', trds: [plainTrd('01', null)] },
        { dir: '3-z', trds: [{ ...plainTrd('01', null), summary: { completed: '2026-09-01', tokens_input: 100, tokens_output: 10 } }] },
        { dir: '4-w', trds: [{ ...plainTrd('01', null), summary: { completed: '2026-09-01', tokens_input: 100 } }] },
      ],
    });
    try {
      assert.deepEqual(evalTool.sampleObjectives(ci.collectProject(root)), ['3-z', '10-x']);
    } finally {
      removeCalibrationProject(root);
    }
  });
});

describe('trdRows', () => {
  test('rows carry id, k, actual, p50 and p90; a TRD without minutes, a non-autonomous one and a checkpoint task are handled', () => {
    const root = makeCalibrationProject({
      name: 'rows',
      objectives: [
        { dir: '1-a', trds: [plainTrd('01', '40min'), plainTrd('02', '40min')] },
        {
          dir: '2-b',
          trds: [
            plainTrd('01', '9min', [
              { name: 'Task 1: a', tdd: true, files: CODE_TDD },
              { name: 'Task 2: check', type: 'checkpoint:human-verify', files: [] },
            ]),
            plainTrd('02', null),
            { ...plainTrd('03', '8min'), frontmatter: { type: 'standard', autonomous: false } },
          ],
        },
      ],
    });
    try {
      const project = ci.collectProject(root);
      const cal = calibrator.buildCalibration({ paths: [root], transcriptsRoot: null });
      const rows = evalTool.trdRows(cal, root, project, '2-b');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, '2-01');
      assert.equal(rows[0].k, 1, 'the checkpoint task is not counted');
      assert.equal(rows[0].actual, 9);
      assert.ok(rows[0].p50 > 0 && rows[0].p90 >= rows[0].p50);
    } finally {
      removeCalibrationProject(root);
    }
  });
});

