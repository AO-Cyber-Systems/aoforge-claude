'use strict';

// Fixtures for the estimate backtest (TRD 64-01; 64-04 reuses makeBacktestProject for the CLI tests). Everything is a
// hand-built literal: estimate objects, collectProject records, run states and `.aoforge` trees written into mkdtemp
// directories. No generated data, no real repository, and never the real ~/.claude/aoforge.
//
// Every builder returns a fresh object, so a test may change what it gets back. Overrides are named options:
//
//   stat(p50, p90)                              -> {p50, p90}
//   testRates()                                 -> a rates object with one model, 'test-model' (3 / 15 / 0.3 / 3.75 per M)
//   taskEstimate({cls, minutes, cost, humanWait, name})
//   trdEstimate({id, minutes, cost, tasks, wave})
//   objectiveEstimate({objective, dir, execution, trds})
//   trdRecord({id, dir, minutes, source, autonomous, tokens, tasks, noSummary})
//   projectRecord(trds)
//   runState({objective, started_at, finished_at, wall, execution, waves})
//   makeBacktestProject(spec) / removeBacktestProject(root)
//
// An option left out takes a default; an option given as `null` is null (a missing estimate or a missing actual).

const calibrationFixtures = require('./calibration-fixtures.cjs');

/** A P50/P90 pair, as the estimator rolls up (the backtest never reads `n`, `min` or `max`). */
function stat(p50, p90) {
  return { p50, p90 };
}

/** A rates object as `calibration-inputs.loadRates()` returns it, trimmed to what `rateFor` reads. USD per million tokens. */
function testRates() {
  return {
    models: {
      'test-model': {
        input: 3, output: 15, cache_read: 0.3, cache_write_5m: 3.75, cache_write_1h: 6, source: 'fixture', as_of: '2026-10-01',
      },
    },
    aliases: {},
  };
}

function orDefault(value, fallback) {
  return value === undefined ? fallback : value;
}

/** One task of a TRD estimate. `cls: 'checkpoint'` (or `humanWait: true`) is a human wait and carries zero minutes. */
function taskEstimate(opts = {}) {
  const cls = orDefault(opts.cls, 'code_tdd');
  const humanWait = orDefault(opts.humanWait, cls === 'checkpoint');
  return {
    name: orDefault(opts.name, `Task: ${cls}`),
    class: cls,
    human_wait: humanWait,
    minutes: orDefault(opts.minutes, humanWait ? stat(0, 0) : stat(5, 15)),
    cost_usd: orDefault(opts.cost, humanWait ? stat(0, 0) : stat(1, 2)),
  };
}

/** One element of an objective estimate's `trd_estimates`. */
function trdEstimate(opts = {}) {
  return {
    id: orDefault(opts.id, '90-01'),
    wave: orDefault(opts.wave, 1),
    autonomous: true,
    minutes: orDefault(opts.minutes, stat(10, 30)),
    cost_usd: orDefault(opts.cost, stat(2, 4)),
    tasks: orDefault(opts.tasks, [taskEstimate(), taskEstimate()]),
  };
}

/** An objective estimate as `estimateObjective(cal, cwd, N, {all: true})` returns it (unrounded). */
function objectiveEstimate(opts = {}) {
  const trds = orDefault(opts.trds, [trdEstimate()]);
  const execution = orDefault(opts.execution, {
    wall_minutes: stat(20, 60), agent_minutes: stat(10, 30), cost_usd: stat(2, 4),
  });
  return {
    objective: orDefault(opts.objective, '90'),
    name: orDefault(opts.name, 'Alpha'),
    dir: orDefault(opts.dir, '90-alpha'),
    status: 'done',
    trds: { total: trds.length, done: trds.length, remaining: trds.length },
    execution: execution === null ? null : {
      wall_minutes: null, agent_minutes: null, tokens_input: null, tokens_output: null, cost_usd: null, ...execution,
    },
    trd_estimates: trds,
  };
}

/** One element of `collectProject(root).trds`. `source` is the duration_source of `minutes` ('summary' | 'metric'). */
function trdRecord(opts = {}) {
  const minutes = orDefault(opts.minutes, null);
  const source = minutes === null ? null : orDefault(opts.source, 'summary');
  const tokens = {
    tokens_input: null, tokens_output: null, tokens_cache_read: null, tokens_cache_write: null, token_model: null,
    ...(opts.tokens || {}),
  };
  const summary = opts.noSummary ? null : {
    duration: null,
    minutes: source === 'summary' ? minutes : null,
    completed: '2026-10-06',
    ...tokens,
  };
  const id = orDefault(opts.id, '90-01');
  return {
    id,
    objective_dir: orDefault(opts.dir, '90-alpha'),
    trd: id.split('-').pop(),
    trd_type: 'standard',
    autonomous: opts.autonomous !== false,
    gap_closure: false,
    tasks: orDefault(opts.tasks, [{ name: 'Task 1: work', type: 'auto', tdd: true, files: ['a.cjs', 'a.test.cjs'] }]),
    summary,
    metric: source === 'metric' ? { duration_raw: `${minutes}min`, minutes, tasks: 1, files: 1 } : null,
    minutes,
    duration_source: source,
  };
}

/** A collectProject result: the TRD records and nothing else the backtest reads. */
function projectRecord(trds) {
  return { root: '/fixture/backtest', label: 'backtest', objectives: [], trds, counts: {}, metrics: {} };
}

/**
 * A run state as `estimate start|wave|finish` write it (schema version 1). `execution` is the optional persisted
 * `estimate.execution` that 64-02 adds; leave it out for the shape of a run recorded before it. `wall` is the
 * `estimate.wall_minutes` stat. `finished_at: null` is a run still in progress.
 */
function runState(opts = {}) {
  const started = orDefault(opts.started_at, '2026-10-06T23:55:36.062Z');
  const finished = orDefault(opts.finished_at, '2026-10-07T01:46:41.099Z');
  const estimate = { line: 'Objective estimate', wall_minutes: orDefault(opts.wall, stat(96.5, 290.5)), confidence: 'low' };
  if (opts.execution) estimate.execution = opts.execution;
  return {
    version: 1,
    objective: orDefault(opts.objective, '90'),
    started_at: started,
    updated_at: finished === null ? started : finished,
    finished_at: finished,
    estimate,
    waves: orDefault(opts.waves, []),
  };
}

// The default project: `90-alpha` is fully measured (minutes and priced tokens on every TRD) and `91-beta` has one TRD
// without a duration, so its agent minutes are excluded but its cost is not. The model is one the bundled rates know.
const BACKTEST_SPEC = {
  name: 'backtest',
  objectives: [
    {
      dir: '90-alpha',
      trds: [
        {
          nn: '01', slug: 'one', frontmatter: { type: 'standard' },
          tasks: [{ name: 'Task 1: code', type: 'auto', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] }],
          summary: {
            duration: '10min', completed: '2026-10-06',
            tokens_input: 1000000, tokens_output: 10000, tokens_cache_read: 600000, tokens_cache_write: 200000,
            token_model: 'claude-opus-5-5',
          },
        },
        {
          nn: '02', slug: 'two', frontmatter: { type: 'standard' },
          tasks: [{ name: 'Task 1: docs', type: 'auto', files: ['docs/a.md'] }],
          summary: {
            duration: '20min', completed: '2026-10-06',
            tokens_input: 500000, tokens_output: 5000, tokens_cache_read: 300000, tokens_cache_write: 100000,
            token_model: 'claude-opus-5-5',
          },
        },
      ],
    },
    {
      dir: '91-beta',
      trds: [
        {
          nn: '01', slug: 'one', frontmatter: { type: 'standard' },
          tasks: [{ name: 'Task 1: code', type: 'auto', tdd: true, files: ['lib/b.cjs', 'lib/b.test.cjs'] }],
          summary: {
            duration: '8min', completed: '2026-10-06',
            tokens_input: 400000, tokens_output: 4000, tokens_cache_read: 250000, tokens_cache_write: 50000,
            token_model: 'claude-opus-5-5',
          },
        },
        {
          nn: '02', slug: 'two', frontmatter: { type: 'standard' },
          tasks: [{ name: 'Task 1: docs', type: 'auto', files: ['docs/b.md'] }],
          summary: {
            completed: '2026-10-06',
            tokens_input: 300000, tokens_output: 3000, tokens_cache_read: 200000, tokens_cache_write: 40000,
            token_model: 'claude-opus-5-5',
          },
        },
      ],
    },
  ],
};

/** Writes a `.aoforge` tree for `spec` (default BACKTEST_SPEC) into a mkdtemp directory and returns its root. */
function makeBacktestProject(spec) {
  return calibrationFixtures.makeCalibrationProject(spec || calibrationFixtures.cloneSpec(BACKTEST_SPEC));
}

/** Removes the mkdtemp parent that makeBacktestProject created for `root`. */
function removeBacktestProject(root) {
  calibrationFixtures.removeCalibrationProject(root);
}

module.exports = {
  stat,
  testRates,
  taskEstimate,
  trdEstimate,
  objectiveEstimate,
  trdRecord,
  projectRecord,
  runState,
  BACKTEST_SPEC,
  makeBacktestProject,
  removeBacktestProject,
};
