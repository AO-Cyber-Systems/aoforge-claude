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

// ─── Task 2: tables, report and CLI ──────────────────────────────────────────

function row(objective, id, k, actual, p50, p90 = p50 * 2) {
  return { objective, id, k, actual, p50, p90 };
}

describe('eraTable', () => {
  const rows = [
    row('1-a', '1-01', 1, 10, 20), row('1-a', '1-02', 1, 20, 20),
    row('1-a', '1-03', 1, 10, 10), row('2-b', '2-01', 1, 10, 5),
    row('2-b', '2-02', 1, 4, 6), row('3-c', '3-01', 1, 8, 6),
    row('3-c', '3-02', 1, 30, 20), row('4-d', '4-01', 1, 10, 20),
  ];

  test('12. eight rows split into four equal-count eras with hand-computed statistics', () => {
    const eras = evalTool.eraTable(rows, 4);
    assert.equal(eras.length, 4);
    assert.deepEqual(eras.map((e) => e.n), [2, 2, 2, 2]);
    assert.deepEqual(eras.map((e) => [e.from, e.to]), [['1-a', '1-a'], ['1-a', '2-b'], ['2-b', '3-c'], ['3-c', '4-d']]);
    const [e1, e2, e3, e4] = eras;
    near(e1.median_actual, 15, 'e1 median actual');
    near(e1.mean_actual, 15, 'e1 mean actual');
    near(e1.median_p50, 20, 'e1 median p50');
    near(e1.median_ratio, 1.5, 'e1 median ratio');
    near(e1.pooled_ratio, 40 / 30, 'e1 pooled');
    near(e2.median_actual, 10, 'e2 median actual');
    near(e2.median_p50, 7.5, 'e2 median p50');
    near(e2.median_ratio, 0.75, 'e2 median ratio');
    near(e2.pooled_ratio, 15 / 20, 'e2 pooled');
    near(e3.mean_actual, 6, 'e3 mean actual');
    near(e3.median_ratio, (6 / 4 + 6 / 8) / 2, 'e3 median ratio');
    near(e3.pooled_ratio, 12 / 12, 'e3 pooled');
    near(e4.median_actual, 20, 'e4 median actual');
    near(e4.median_ratio, (20 / 30 + 2) / 2, 'e4 median ratio');
    near(e4.pooled_ratio, 40 / 40, 'e4 pooled');
  });

  test('12b. sizes differ by at most one; fewer rows than eras give fewer eras; no rows give none', () => {
    assert.deepEqual(evalTool.eraTable(rows.slice(0, 5), 4).map((e) => e.n), [2, 1, 1, 1]);
    assert.deepEqual(evalTool.eraTable(rows.slice(0, 2), 4).map((e) => e.n), [1, 1]);
    assert.deepEqual(evalTool.eraTable([], 4), []);
  });
});

describe('taskCountTable', () => {
  test('13. k = 1..5 gives groups 1, 2, 3 and 4+; a group with no rows is omitted', () => {
    const rows = [row('a', 'a-01', 1, 10, 5), row('a', 'a-02', 2, 20, 10), row('a', 'a-03', 3, 10, 20),
      row('a', 'a-04', 4, 10, 10), row('a', 'a-05', 5, 30, 30)];
    const t = evalTool.taskCountTable(rows);
    assert.deepEqual(t.map((g) => g.group), ['1', '2', '3', '4+']);
    assert.deepEqual(t.map((g) => g.n), [1, 1, 1, 2]);
    near(t[0].median_ratio, 0.5, 'k=1 ratio');
    near(t[1].median_actual, 20, 'k=2 actual');
    near(t[2].median_p50, 20, 'k=3 p50');
    near(t[2].median_ratio, 2, 'k=3 ratio');
    near(t[3].median_actual, 20, 'k=4+ median actual');
    near(t[3].median_p50, 20, 'k=4+ median p50');
    near(t[3].median_ratio, 1, 'k=4+ median ratio');
    assert.deepEqual(evalTool.taskCountTable([rows[0], rows[2]]).map((g) => g.group), ['1', '3']);
    assert.deepEqual(evalTool.taskCountTable([]), []);
  });
});

describe('otherClassTable', () => {
  test('14. each filesless task by TRD id with its share, the class figures, and the samples in TRDs of 45 minutes or more', () => {
    const root = makeCalibrationProject({
      name: 'other',
      objectives: [
        {
          dir: '9-a',
          trds: [
            plainTrd('02', '4min', [{ name: 'Task 1: smoke', files: [] }]),
            plainTrd('01', '90min', [{ name: 'Task 1: smoke', files: [] }, { name: 'Task 2: code', files: ['lib/x.cjs'] }]),
          ],
        },
      ],
    });
    try {
      const project = ci.collectProject(root);
      const cal = calibrator.buildCalibration({ paths: [root], transcriptsRoot: null });
      const t = evalTool.otherClassTable(project, cal);
      assert.deepEqual(t.tasks, [
        { id: '9-01', minutes: 90, k: 2, share: 45 },
        { id: '9-02', minutes: 4, k: 1, share: 4 },
      ]);
      assert.equal(t.n, 2);
      assert.equal(t.p50, 4);
      assert.equal(t.p90, 45);
      assert.equal(t.in_long_trds, 1);
      assert.equal(t.long_trd_minutes, 45);
    } finally {
      removeCalibrationProject(root);
    }
  });

  test('14b. a calibration without the class reports zero samples', () => {
    const t = evalTool.otherClassTable({ trds: [] }, { task_classes: { all: {} } });
    assert.deepEqual(t, { tasks: [], n: 0, p50: null, p90: null, in_long_trds: 0, long_trd_minutes: 45 });
  });
});

describe('durationSourceTable', () => {
  test('15. counts and median minutes per duration source; a TRD with only a STATE_ARCHIVE row is `metric`', () => {
    const root = makeCalibrationProject({
      name: 'source',
      objectives: [{ dir: '55-a', trds: [plainTrd('01', '10min'), plainTrd('02', '20min'), plainTrd('03', null)] }],
      stateArchiveRows: ['| Objective 55 P03 | 30min | 1 tasks | 1 files |'],
    });
    try {
      const project = ci.collectProject(root);
      const t = evalTool.durationSourceTable(project);
      assert.deepEqual(t, [
        { source: 'summary', n: 2, median_minutes: 15 },
        { source: 'metric', n: 1, median_minutes: 30 },
      ]);
      const withRatios = evalTool.durationSourceTable(project, [
        { id: '55-01', actual: 10, p50: 20 }, { id: '55-02', actual: 20, p50: 20 }, { id: '55-03', actual: 30, p50: 15 },
      ]);
      near(withRatios[0].median_ratio, 1.5, 'summary ratio');
      near(withRatios[1].median_ratio, 0.5, 'metric ratio');
    } finally {
      removeCalibrationProject(root);
    }
  });
});

describe('compositionTable', () => {
  test('16. the inflation of the correlated sum over the sum of medians, and the sum of medians against the actual', () => {
    const rows = [
      { sum_p50: 20, p50: 22, actual: 10 },
      { sum_p50: 30, p50: 33, actual: 40 },
      { sum_p50: 10, p50: 15, actual: 10 },
    ];
    const t = evalTool.compositionTable(rows);
    assert.equal(t.n, 3);
    near(t.median_inflation, 1.1, 'median F/P');
    near(t.median_sum_over_actual, 1, 'median P/A');
    near(t.pooled_sum_over_actual, 60 / 60, 'pooled P/A');
    near(t.median_composed_over_actual, 1.5, 'median F/A');
    near(t.pooled_composed_over_actual, 70 / 60, 'pooled F/A');
    assert.equal(evalTool.compositionTable([]).n, 0);
    assert.equal(evalTool.compositionTable([]).median_inflation, null);
  });
});

describe('characterization of the objective rollup (suspect S3)', () => {
  test('17. execution.agent_minutes is the correlated sum of the TRD minutes: no executor overhead is in it', () => {
    const root = makeEstimateProject({
      name: 'char',
      objectives: [{
        dir: '90-obj',
        objectiveMd: '# Objective 90: obj\n',
        trds: [
          { nn: '01', slug: 'a', tasks: [{ name: 'Task 1: a', tdd: true, files: CODE_TDD }], summary: null },
          { nn: '02', slug: 'b', tasks: [{ name: 'Task 1: b', files: ['docs/b.md'] }], summary: null },
        ],
      }],
    });
    try {
      const cal = makeCalibration();
      assert.ok(cal.agent_overhead.planner.samples > 0 && cal.agent_overhead.verifier.samples > 0);
      const r = rollup.estimateObjective(cal, root, '90', { all: true });
      assert.equal(r.trds.total, 2);

      const dir = path.join(root, '.planning', 'objectives', '90-obj');
      const dists = fs.readdirSync(dir).filter((f) => f.endsWith('-TRD.md')).sort()
        .map((f) => em.fitQuantiles(est.estimateTrdText(cal, fs.readFileSync(path.join(dir, f), 'utf-8')).minutes));
      assert.equal(dists.length, 2);
      assert.deepEqual(r.execution.agent_minutes, em.summarize(em.sumCorrelated(dists)));

      // The verifier is in `total` and in `overhead`, not in `execution`.
      assert.ok(r.total.agent_minutes.p50 > r.execution.agent_minutes.p50);
      assert.ok(r.overhead.some((e) => e.agent === 'verifier'));
    } finally {
      removeEstimateProject(root);
    }
  });
});

describe('classCounts', () => {
  test('18. minutes.n of every class but all, sorted by name', () => {
    const counts = evalTool.classCounts(makeCalibration());
    assert.deepEqual(counts, { code_tdd: 32, config: 2, doc: 12, prompt: 6 });
    assert.deepEqual(Object.keys(counts), ['code_tdd', 'config', 'doc', 'prompt']);
    assert.deepEqual(evalTool.classCounts({ task_classes: {} }), {});
  });
});

describe('report and CLI', () => {
  let root;
  let outDir;
  before(() => {
    root = makeCalibrationProject(stepSpec());
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-out-'));
  });
  after(() => {
    removeCalibrationProject(root);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } });

  test('report() returns one plain object with the documented keys and the step-change selection', () => {
    const result = evalTool.report({ snapshotRoot: root, evalObjectives: [6], windows: [2], label: 'fixture' });
    assert.deepEqual(Object.keys(result), ['label', 'eval', 'grid', 'eras', 'task_count', 'other_class', 'duration_source',
      'composition', 'candidates', 'selection', 'noise_floor', 'class_counts']);
    assert.equal(result.label, 'fixture');
    assert.deepEqual(result.grid, [2]);
    assert.equal(result.selection.decision, 'build_window');
    assert.equal(result.selection.window, 2);
    assert.deepEqual(result.candidates.map((c) => c.window), ['all', 2]);
    assert.equal(result.eras.length, 4);
    assert.deepEqual(result.noise_floor.all, { subsets: 0, share: null });
    assert.equal(result.noise_floor.chosen.window, 2);
    assert.deepEqual(Object.keys(result.class_counts), ['objective', 'w10', 'w5']);
    assert.ok(!JSON.stringify(result).includes(root), 'the snapshot path is not in the result');
  });

  test('9. the report subcommand prints markdown with the selection, and writes the JSON', () => {
    const jsonFile = path.join(outDir, 'd.json');
    const r = run(['report', '--snapshot', root, '--eval', '6-6', '--grid', '2', '--label', 'fixture', '--json', jsonFile, '--raw']);
    assert.equal(r.status, 0, r.stderr);
    for (const heading of ['### Eras (S1)', '### Task count (S5)', '### Class other (S4)', '### Duration source (S2)',
      '### Composition (S6)', '### Selection', '### Noise floor', '### Class sample counts']) {
      assert.ok(r.stdout.includes(heading), `missing heading ${heading}`);
    }
    const order = ['### Eras (S1)', '### Task count (S5)', '### Class other (S4)', '### Duration source (S2)',
      '### Composition (S6)', '### Selection', '### Noise floor', '### Class sample counts'].map((h) => r.stdout.indexOf(h));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'the sections are in the documented order');
    assert.match(r.stdout, /decision: build_window/);
    assert.match(r.stdout, /window_objectives: 2/);
    assert.match(r.stdout, /^\| all \|.*\b4\.00\b/m);
    assert.match(r.stdout, /^\| 2 \|.*\b1\.00\b/m);
    const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    assert.equal(parsed.selection.decision, 'build_window');
    assert.equal(parsed.selection.window, 2);
    assert.equal(fs.readFileSync(jsonFile, 'utf-8').endsWith('}\n'), true);
  });

  test('9b. without --raw the JSON is printed', () => {
    const r = run(['report', '--snapshot', root, '--eval', '6', '--grid', '2']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).selection.window, 2);
  });

  test('10. two copies of the fixture in different directories write byte-identical JSON with no path and no date', () => {
    const other = makeCalibrationProject(stepSpec());
    try {
      assert.notEqual(path.dirname(other), path.dirname(root));
      const a = path.join(outDir, 'a.json');
      const b = path.join(outDir, 'b.json');
      assert.equal(run(['report', '--snapshot', root, '--eval', '6-6', '--grid', '2', '--label', 'fixture', '--json', a, '--raw']).status, 0);
      assert.equal(run(['report', '--snapshot', other, '--eval', '6-6', '--grid', '2', '--label', 'fixture', '--json', b, '--raw']).status, 0);
      const textA = fs.readFileSync(a, 'utf-8');
      assert.equal(textA, fs.readFileSync(b, 'utf-8'));
      assert.ok(!textA.includes(path.dirname(root)) && !textA.includes(path.dirname(other)));
      assert.ok(!textA.includes(os.tmpdir()));
      assert.ok(!/\d{4}-\d{2}-\d{2}/.test(textA), 'no ISO date');
    } finally {
      removeCalibrationProject(other);
    }
  });

  test('11. usage errors exit 1 with a message', () => {
    const cases = [
      [],
      ['bogus'],
      ['report'],
      ['report', '--snapshot', root, '--grid', '0'],
      ['report', '--snapshot', root, '--grid', 'abc'],
      ['report', '--snapshot', root, '--eval', '7-3'],
      ['report', '--snapshot', root, '--eval', 'x'],
      ['report', '--snapshot', root, '--bogus'],
      ['report', '--snapshot', root, 'extra'],
      ['report', '--snapshot'],
      ['report', '--snapshot', outDir],
    ];
    for (const args of cases) {
      const r = run(args);
      assert.equal(r.status, 1, `args ${JSON.stringify(args)} should exit 1, got ${r.status}`);
      assert.ok(r.stderr.length > 0, `args ${JSON.stringify(args)} should explain itself`);
    }
    assert.match(run([]).stderr, /usage/i);
  });

  test('11b. the CLI refuses any path under ~/.claude', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-window-home-'));
    try {
      const target = path.join(home, '.claude', 'devflow', 'out.json');
      const r = run(['report', '--snapshot', root, '--eval', '6-6', '--grid', '2', '--json', target], { HOME: home });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /\.claude/);
      assert.equal(fs.existsSync(target), false);
      assert.equal(evalTool.isUnderClaudeHome(path.join(home, '.claude', 'x'), home), true);
      assert.equal(evalTool.isUnderClaudeHome(path.join(home, '.claude'), home), true);
      assert.equal(evalTool.isUnderClaudeHome(path.join(home, '.claudex', 'x'), home), false);
      assert.equal(evalTool.isUnderClaudeHome(path.join(home, 'work'), home), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('the script never writes a calibration', () => {
    const source = fs.readFileSync(SCRIPT, 'utf-8');
    assert.ok(!/\bwriteCalibration\b/.test(source.replace(/^\s*\/\/.*$/gm, '')), 'writeCalibration is not used');
    assert.ok(!/defaultCalibrationPath/.test(source.replace(/^\s*\/\/.*$/gm, '')), 'defaultCalibrationPath is not used');
    assert.ok(!/const\s+(BAND|COVERAGE_TARGET)\s*=/.test(source), 'BAND and COVERAGE_TARGET are imported, not redefined');
  });
});
