'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ci = require('./calibration-inputs.cjs');
const {
  makeCalibrationProject, removeCalibrationProject, cloneSpec, ALPHA_SPEC,
} = require('./__fixtures__/calibration-fixtures.cjs');
const calibrator = require('./calibrator.cjs');

const { nearestRank, statBlock, sampleCost, buildCalibration } = calibrator;

const projects = [];
function makeProject(spec) {
  const root = makeCalibrationProject(spec);
  projects.push(root);
  return root;
}
afterEach(() => {
  while (projects.length) removeCalibrationProject(projects.pop());
});

// The hand-built BETA history, literal. Five TRDs in two objectives:
//   70-a/01  code_tdd + doc            10min         -> 5 / 5 minutes
//   70-a/02  one code_tdd               8min
//   70-a/03  three code_tdd            12min + tokens (140747 in / 1370 out, Opus 5.5)
//   71-b/01  one code_tdd + checkpoint 30min, autonomous:false, gap_closure:true (minutes excluded, no tokens)
//   71-b/02  one prompt, no SUMMARY, 6min from its Performance Metrics row
const BETA_SPEC = {
  name: 'beta',
  objectives: [
    {
      dir: '70-a',
      trds: [
        {
          nn: '01', slug: 'first',
          tasks: [
            { name: 'Task 1: a', type: 'auto', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] },
            { name: 'Task 2: readme', type: 'auto', files: ['README.md'] },
          ],
          summary: { duration: '10min', completed: '2026-09-01' },
        },
        {
          nn: '02', slug: 'second',
          tasks: [{ name: 'Task 1: b', type: 'auto', tdd: true, files: ['lib/b.cjs', 'lib/b.test.cjs'] }],
          summary: { duration: '8min', completed: '2026-09-02' },
        },
        {
          nn: '03', slug: 'third',
          tasks: [
            { name: 'Task 1: c', type: 'auto', tdd: true, files: ['lib/c.cjs', 'lib/c.test.cjs'] },
            { name: 'Task 2: d', type: 'auto', tdd: true, files: ['lib/d.cjs', 'lib/d.test.cjs'] },
            { name: 'Task 3: e', type: 'auto', tdd: true, files: ['lib/e.cjs', 'lib/e.test.cjs'] },
          ],
          summary: {
            duration: '12min', completed: '2026-10-05',
            tokens_input: 140747, tokens_output: 1370, tokens_cache_read: 121144, tokens_cache_write: 19596,
            token_model: 'claude-opus-5-5',
          },
        },
      ],
    },
    {
      dir: '71-b',
      trds: [
        {
          nn: '01', slug: 'gated', frontmatter: { autonomous: false, gap_closure: true },
          tasks: [
            { name: 'Task 1: f', type: 'auto', tdd: true, files: ['lib/f.cjs', 'lib/f.test.cjs'] },
            { name: 'Task 2: verify', type: 'checkpoint:human-verify', files: [] },
          ],
          summary: { duration: '30min', completed: '2026-09-20' },
        },
        {
          nn: '02', slug: 'prompt',
          tasks: [{ name: 'Task 1: skill', type: 'auto', files: ['skills/x/SKILL.md'] }],
          summary: null,
        },
      ],
    },
  ],
  stateArchiveRows: ['| Objective 71 P02 | 6min | 1 tasks | 1 files |'],
};

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} is not ${expected}`);
}

function collectKeys(value, into = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      into.push(key);
      collectKeys(value[key], into);
    }
  }
  return into;
}

describe('57-05 nearestRank and statBlock', () => {
  test('2: nearest rank returns an observed sample; empty input is null', () => {
    const tenSorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(nearestRank(tenSorted, 0.5), 5);
    assert.equal(nearestRank(tenSorted, 0.9), 9);
    assert.equal(nearestRank([7], 0.5), 7);
    assert.equal(nearestRank([7], 0.9), 7);
    assert.equal(nearestRank([], 0.5), null);
  });

  test('2: statBlock of nothing is an all-null block with n 0', () => {
    assert.deepEqual(statBlock([]), { n: 0, p50: null, p90: null, min: null, max: null });
  });

  test('2: statBlock drops nulls, sorts numerically and rounds every value once', () => {
    const block = statBlock([null, 10, 2, undefined, 3.14159, 7], (x) => Math.round(x * 10) / 10);
    assert.deepEqual(block, { n: 4, p50: 3.1, p90: 10, min: 2, max: 10 });
  });
});

describe('57-05 sampleCost', () => {
  const rates = ci.loadRates();
  const opusSample = {
    tokens_input: 140747, tokens_output: 1370, tokens_cache_read: 121144, tokens_cache_write: 19596,
    token_model: 'claude-opus-5-5',
  };

  test('3: the shipped rates load', () => {
    assert.equal(rates.ok, true);
  });

  test('3: Opus 5.5 prices fresh input, 5-minute cache writes, cache reads and output', () => {
    approx(sampleCost(opusSample, rates), 0.1496368);
  });

  test('3: a [1m] suffix prices at the base model rates', () => {
    const suffixed = sampleCost({ ...opusSample, token_model: 'claude-opus-5[1m]' }, rates);
    const plain = sampleCost({ ...opusSample, token_model: 'claude-opus-5' }, rates);
    assert.equal(suffixed, plain);
    assert.notEqual(suffixed, sampleCost(opusSample, rates));
  });

  test('3: a model without a rate, or missing token counts, gives null', () => {
    assert.equal(sampleCost({ ...opusSample, token_model: 'claude-unknown-9' }, rates), null);
    assert.equal(sampleCost({ ...opusSample, token_model: null }, rates), null);
    assert.equal(sampleCost({ ...opusSample, tokens_input: null }, rates), null);
    assert.equal(sampleCost({ ...opusSample, tokens_output: null }, rates), null);
  });

  test('3: absent cache counts are zero and fresh input never goes negative', () => {
    const m = rates.models['claude-opus-5-5'];
    approx(sampleCost({ tokens_input: 1e6, tokens_output: 0, token_model: 'claude-opus-5-5' }, rates), m.input);
    approx(
      sampleCost({ tokens_input: 10, tokens_output: 0, tokens_cache_read: 100, token_model: 'claude-opus-5-5' }, rates),
      (100 * m.cache_read) / 1e6,
    );
  });
});

describe('57-05 buildCalibration', () => {
  test('1: the BETA history gives the exact per-class medians, P90s and dollars', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });

    assert.deepEqual(cal.samples, { trds: 5, tasks: 7, with_tokens: 1 });

    const tdd = cal.task_classes.code_tdd;
    assert.equal(tdd.samples, 5);
    assert.deepEqual(tdd.minutes, { n: 5, p50: 4, p90: 8, min: 4, max: 8 });
    assert.equal(tdd.tokens_input.n, 3);
    assert.equal(tdd.tokens_input.p50, 46916);
    assert.equal(tdd.tokens_output.p50, 457);
    assert.equal(tdd.cost_usd.n, 3);
    assert.equal(tdd.cost_usd.p50, 0.0499);

    assert.equal(cal.task_classes.doc.samples, 1);
    assert.equal(cal.task_classes.doc.minutes.n, 1);
    assert.equal(cal.task_classes.doc.minutes.p50, 5);
    assert.equal(cal.task_classes.prompt.samples, 1);
    assert.equal(cal.task_classes.prompt.minutes.n, 1);
    assert.equal(cal.task_classes.prompt.minutes.p50, 6);
    assert.deepEqual(Object.keys(cal.task_classes).sort(), ['all', 'code_tdd', 'doc', 'prompt']);

    assert.equal(cal.task_classes.all.samples, 7);
    assert.deepEqual(cal.task_classes.all.minutes, { n: 7, p50: 5, p90: 8, min: 4, max: 8 });

    assert.equal(cal.trd_level.samples, 5);
    assert.deepEqual(cal.trd_level.minutes, { n: 4, p50: 8, p90: 12, min: 6, max: 12 });
    assert.equal(cal.trd_level.cost_usd.n, 1);
    assert.equal(cal.trd_level.cost_usd.p50, 0.1496);
    assert.equal(cal.trd_level.tokens_input.p50, 140747);
    assert.equal(cal.trd_level.tokens_output.p50, 1370);
    assert.equal(cal.trd_level.tasks.n, 5);

    assert.deepEqual(cal.probabilities.gap_closure, { value: 0.5, n: 2 });
    assert.deepEqual(cal.probabilities.checkpoint, { value: 0.2, n: 5 });

    assert.equal(cal.data_as_of, '2026-10-05');
    assert.equal(cal.version, 1);
    assert.equal(cal.classifier_version, 1);
    assert.deepEqual(cal.unpriced_models, []);
    assert.ok(!collectKeys(cal).includes('generated_at'));
  });

  test('1: the 71-b/01 human wait is excluded from minutes and the metric row fills 71-b/02', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    // 71-b/01 (30 min, autonomous:false) never reaches a minutes sample: the largest minutes value is 12.
    assert.equal(cal.trd_level.minutes.max, 12);
    assert.equal(cal.task_classes.all.minutes.max, 8);
    assert.equal(cal.task_classes.prompt.minutes.p50, 6);
  });

  test('1: sources carry per-project counts with the metric-row join accounted', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    assert.deepEqual(cal.sources, [{
      project: 'beta', trds: 5, summaries: 4, with_minutes: 5, with_tokens: 1, no_outcome: 0,
      metric_rows: 1, metric_rows_joined: 1, metric_rows_ambiguous: 0,
    }]);
  });

  test('1: models, aliases and rates_as_of are copied from the rates file', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    const rates = ci.loadRates();
    assert.deepEqual(cal.models, rates.models);
    assert.deepEqual(cal.model_aliases, rates.aliases);
    assert.equal(cal.rates_as_of, rates.as_of);
    assert.ok(Array.isArray(cal.notes) && cal.notes.length >= 3);
  });

  test('1: an unreadable rates file throws an Error naming the file', () => {
    const beta = makeProject(BETA_SPEC);
    assert.throws(
      () => buildCalibration({ paths: [beta], ratesPath: '/nonexistent/rates-file.json' }),
      /rates-file\.json/,
    );
  });

  test('3: a model without a rate stays unpriced and is listed once, sorted', () => {
    const tokenTrd = (nn, model) => ({
      nn, slug: `t${nn}`,
      tasks: [{ name: 'Task 1: x', type: 'auto', files: ['lib/x.cjs'] }],
      summary: {
        duration: '5min', completed: '2026-10-01',
        tokens_input: 1000, tokens_output: 100, tokens_cache_read: 0, tokens_cache_write: 0, token_model: model,
      },
    });
    const gamma = makeProject({
      name: 'gamma',
      objectives: [{
        dir: '80-g',
        trds: [
          tokenTrd('01', 'claude-unknown-9'),
          tokenTrd('02', 'claude-unknown-9'),
          tokenTrd('03', 'claude-opus-5-5'),
          tokenTrd('04', 'claude-aaa-1[1m]'),
        ],
      }],
    });
    const cal = buildCalibration({ paths: [gamma], ratesPath: ci.RATES_PATH });
    assert.deepEqual(cal.unpriced_models, ['claude-aaa-1', 'claude-unknown-9']);
    assert.equal(cal.samples.with_tokens, 4);
    assert.equal(cal.trd_level.tokens_input.n, 4);
    assert.equal(cal.trd_level.cost_usd.n, 1);
    assert.equal(cal.task_classes.all.cost_usd.n, 1);
  });

  test('8: an empty project builds without throwing', () => {
    const empty = makeProject({ name: 'empty', objectives: [] });
    const cal = buildCalibration({ paths: [empty], ratesPath: ci.RATES_PATH });
    assert.deepEqual(cal.samples, { trds: 0, tasks: 0, with_tokens: 0 });
    assert.deepEqual(Object.keys(cal.task_classes), ['all']);
    assert.equal(cal.task_classes.all.samples, 0);
    assert.deepEqual(cal.task_classes.all.minutes, { n: 0, p50: null, p90: null, min: null, max: null });
    assert.equal(cal.trd_level.samples, 0);
    assert.equal(cal.data_as_of, null);
    assert.deepEqual(cal.probabilities.gap_closure, { value: null, n: 0 });
    assert.deepEqual(cal.probabilities.checkpoint, { value: null, n: 0 });
    assert.equal(cal.sources.length, 1);
    assert.equal(cal.sources[0].trds, 0);
  });

  test('8: no projects at all builds too', () => {
    const cal = buildCalibration({ paths: [], ratesPath: ci.RATES_PATH });
    assert.deepEqual(cal.samples, { trds: 0, tasks: 0, with_tokens: 0 });
    assert.deepEqual(cal.sources, []);
    assert.equal(cal.data_as_of, null);
  });

  test('9: two projects give two sorted sources and pooled class stats', () => {
    const beta = makeProject(BETA_SPEC);
    const alpha = makeProject(cloneSpec(ALPHA_SPEC));
    const cal = buildCalibration({ paths: [beta, alpha], ratesPath: ci.RATES_PATH });

    assert.deepEqual(cal.sources.map((s) => s.project), ['alpha', 'beta']);
    assert.deepEqual(cal.sources[0], {
      project: 'alpha', trds: 4, summaries: 3, with_minutes: 4, with_tokens: 1, no_outcome: 0,
      metric_rows: 3, metric_rows_joined: 3, metric_rows_ambiguous: 0,
    });
    assert.equal(cal.sources[1].trds, 5);

    assert.deepEqual(cal.samples, { trds: 9, tasks: 12, with_tokens: 2 });
    assert.equal(cal.task_classes.code_tdd.samples, 8);
    assert.equal(cal.task_classes.code_tdd.minutes.n, 8);
    assert.equal(cal.task_classes.doc.samples, 2);
    assert.equal(cal.task_classes.config.samples, 1);
    assert.equal(cal.task_classes.config.minutes.p50, 7);
    assert.equal(cal.task_classes.all.samples, 12);
    assert.equal(cal.trd_level.cost_usd.n, 2);
    assert.deepEqual(cal.probabilities.gap_closure, { value: 0.5, n: 4 });
    assert.deepEqual(cal.probabilities.checkpoint, { value: 0.2222, n: 9 });
    assert.equal(cal.data_as_of, '2026-10-05');
  });
});
