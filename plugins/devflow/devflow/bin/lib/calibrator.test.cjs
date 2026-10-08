'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('./calibration-inputs.cjs');
const {
  makeCalibrationProject, removeCalibrationProject, cloneSpec, ALPHA_SPEC,
} = require('./__fixtures__/calibration-fixtures.cjs');
const fx = require('./__fixtures__/transcript-fixtures.cjs');
const { OVERHEAD_AGENTS } = require('./agent-overhead.cjs');
const calibrator = require('./calibrator.cjs');

const {
  nearestRank, statBlock, sampleCost, buildCalibration,
  stableStringify, writeCalibration, defaultCalibrationPath, CALIBRATION_VERSION, DEFAULT_WINDOW_OBJECTIVES,
} = calibrator;

const projects = [];
function makeProject(spec) {
  const root = makeCalibrationProject(spec);
  projects.push(root);
  return root;
}
// Every write test goes to a mkdtemp directory. Nothing here may touch the real ~/.claude/devflow/calibration.json.
const tmpDirs = [];
function tmpDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-calibrator-')));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (projects.length) removeCalibrationProject(projects.pop());
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

// Gives every file and directory under `dir` a new mtime, so a path that orders or selects inputs by mtime changes output.
function touchTree(dir, seconds) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) touchTree(full, seconds);
    fs.utimesSync(full, seconds, seconds);
  }
  fs.utimesSync(dir, seconds, seconds);
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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
    assert.equal(cal.version, 2);
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

describe('57-05 stableStringify', () => {
  test('4: keys are sorted at every depth, arrays keep their order, 2-space indent, trailing newline', () => {
    const text = stableStringify({ b: { z: 1, a: { y: [{ d: 1, c: 2 }, 3], x: null } }, a: 'v' });
    assert.equal(text, [
      '{',
      '  "a": "v",',
      '  "b": {',
      '    "a": {',
      '      "x": null,',
      '      "y": [',
      '        {',
      '          "c": 2,',
      '          "d": 1',
      '        },',
      '        3',
      '      ]',
      '    },',
      '    "z": 1',
      '  }',
      '}',
      '',
    ].join('\n'));
  });

  test('4: the input object is not mutated and insertion order does not matter', () => {
    const one = { b: 1, a: { d: 1, c: 2 } };
    const two = { a: { c: 2, d: 1 }, b: 1 };
    assert.equal(stableStringify(one), stableStringify(two));
    assert.deepEqual(Object.keys(one), ['b', 'a']);
    assert.deepEqual(Object.keys(one.a), ['d', 'c']);
  });
});

describe('57-05 deterministic output', () => {
  test('4: two builds over unchanged inputs are byte-identical', () => {
    const beta = makeProject(BETA_SPEC);
    const first = stableStringify(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }));
    const second = stableStringify(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }));
    assert.equal(first, second);
  });

  test('4: still byte-identical after every input file mtime changes', () => {
    const beta = makeProject(BETA_SPEC);
    const alpha = makeProject(cloneSpec(ALPHA_SPEC));
    const before = stableStringify(buildCalibration({ paths: [alpha, beta], ratesPath: ci.RATES_PATH }));
    touchTree(beta, 1000000000);
    touchTree(alpha, 1100000000);
    const after = stableStringify(buildCalibration({ paths: [alpha, beta], ratesPath: ci.RATES_PATH }));
    assert.equal(after, before);
  });

  test('4: the same history in a different directory gives the same bytes and the argument order does not matter', () => {
    const betaOne = makeProject(BETA_SPEC);
    const betaTwo = makeProject(BETA_SPEC);
    const alpha = makeProject(cloneSpec(ALPHA_SPEC));
    const one = stableStringify(buildCalibration({ paths: [betaOne, alpha], ratesPath: ci.RATES_PATH }));
    const two = stableStringify(buildCalibration({ paths: [alpha, betaTwo], ratesPath: ci.RATES_PATH }));
    assert.equal(two, one);
  });

  test('4: nested keys come out sorted at three depths and sources are sorted by project', () => {
    const beta = makeProject(BETA_SPEC);
    const alpha = makeProject(cloneSpec(ALPHA_SPEC));
    const text = stableStringify(buildCalibration({ paths: [beta, alpha], ratesPath: ci.RATES_PATH }));
    const parsed = JSON.parse(text);
    const sorted = (obj) => assert.deepEqual(Object.keys(obj), Object.keys(obj).slice().sort());
    sorted(parsed);
    sorted(parsed.task_classes);
    sorted(parsed.task_classes.code_tdd);
    sorted(parsed.task_classes.code_tdd.minutes);
    sorted(parsed.models);
    sorted(parsed.models['claude-opus-5-5']);
    sorted(parsed.sources[0]);
    assert.deepEqual(parsed.sources.map((s) => s.project), ['alpha', 'beta']);
    assert.ok(text.endsWith('}\n'));
  });

  test('4: no clock value reaches the output', () => {
    const beta = makeProject(BETA_SPEC);
    const text = stableStringify(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }));
    assert.ok(!collectKeys(JSON.parse(text)).some((k) => /generated|timestamp|created|updated/.test(k)));
    assert.ok(!text.includes(beta), 'no input path appears in the file');
  });

  test('exports CALIBRATION_VERSION 2, the version the build stamps', () => {
    assert.equal(CALIBRATION_VERSION, 2);
    const beta = makeProject(BETA_SPEC);
    assert.equal(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }).version, CALIBRATION_VERSION);
  });
});

describe('57-05 writeCalibration', () => {
  test('5: creates missing parents, then reports changed:false and leaves the file alone on an identical rerun', () => {
    const target = path.join(tmpDir(), 'a', 'b', 'c.json');
    const obj = { version: 1, z: { b: 1, a: 2 } };

    const first = writeCalibration(target, obj);
    assert.equal(first.changed, true);
    assert.equal(first.path, target);
    assert.equal(fs.readFileSync(target, 'utf-8'), stableStringify(obj));
    assert.equal(first.bytes, Buffer.byteLength(stableStringify(obj)));

    // An old mtime proves the second call does not rewrite: a rewrite would move it to now.
    fs.utimesSync(target, 1000000000, 1000000000);
    const mtimeBefore = fs.statSync(target).mtimeMs;
    const second = writeCalibration(target, obj);
    assert.equal(second.changed, false);
    assert.equal(fs.statSync(target).mtimeMs, mtimeBefore);

    const third = writeCalibration(target, { version: 1, z: { a: 2, b: 1 } });
    assert.equal(third.changed, false, 'key order of the input does not matter');
  });

  test('5: a changed object is written and no temp file is left behind', () => {
    const dir = tmpDir();
    const target = path.join(dir, 'cal.json');
    writeCalibration(target, { n: 1 });
    const result = writeCalibration(target, { n: 2 });
    assert.equal(result.changed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { n: 2 });
    assert.deepEqual(fs.readdirSync(dir), ['cal.json']);
  });

  test('5: an explicit path never resolves the home directory', () => {
    const target = path.join(tmpDir(), 'explicit.json');
    const original = os.homedir;
    os.homedir = () => { throw new Error('os.homedir must not be called for an explicit path'); };
    try {
      assert.equal(writeCalibration(target, { ok: true }).changed, true);
    } finally {
      os.homedir = original;
    }
  });

  test('5: a path that cannot be written throws an Error naming it', () => {
    const dir = tmpDir();
    const blocker = path.join(dir, 'file');
    fs.writeFileSync(blocker, 'x');
    assert.throws(() => writeCalibration(path.join(blocker, 'sub', 'cal.json'), { a: 1 }), /cal\.json/);
  });
});

describe('57-05 defaultCalibrationPath', () => {
  test('6: DEVFLOW_CALIBRATION_PATH wins', () => {
    assert.equal(defaultCalibrationPath({ DEVFLOW_CALIBRATION_PATH: '/somewhere/cal.json' }), '/somewhere/cal.json');
    withEnv({ DEVFLOW_CALIBRATION_PATH: '/from/process-env.json' }, () => {
      assert.equal(defaultCalibrationPath(), '/from/process-env.json');
    });
  });

  test('6: otherwise <HOME>/.claude/devflow/calibration.json, with HOME read at call time', () => {
    const homeOne = tmpDir();
    const homeTwo = tmpDir();
    withEnv({ DEVFLOW_CALIBRATION_PATH: undefined, HOME: homeOne }, () => {
      assert.equal(defaultCalibrationPath(), path.join(homeOne, '.claude', 'devflow', 'calibration.json'));
      process.env.HOME = homeTwo;
      assert.equal(defaultCalibrationPath(), path.join(homeTwo, '.claude', 'devflow', 'calibration.json'));
    });
  });

  test('6: loading the module resolves no home directory', () => {
    const original = os.homedir;
    let calls = 0;
    os.homedir = () => { calls += 1; return original(); };
    try {
      delete require.cache[require.resolve('./calibrator.cjs')];
      require('./calibrator.cjs');
      assert.equal(calls, 0);
    } finally {
      os.homedir = original;
    }
  });
});

describe('57-05 inputs_digest', () => {
  test('7: is sha256:<64 hex> and unchanged across rebuilds', () => {
    const beta = makeProject(BETA_SPEC);
    const one = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    const two = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    assert.match(one.inputs_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(one.inputs_digest, two.inputs_digest);
  });

  test('7: changes when an input value changes (70-a/02 duration 8min to 9min)', () => {
    const beta = makeProject(BETA_SPEC);
    const edited = cloneSpec(BETA_SPEC);
    edited.objectives[0].trds[1].summary.duration = '9min';
    const betaEdited = makeProject(edited);
    const base = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    const changed = buildCalibration({ paths: [betaEdited], ratesPath: ci.RATES_PATH });
    assert.notEqual(changed.inputs_digest, base.inputs_digest);
    assert.equal(changed.task_classes.code_tdd.minutes.n, 5, 'the edit is a real input change, not a structural one');
  });

  test('7: changes with the rates, and with the project set', () => {
    const beta = makeProject(BETA_SPEC);
    const alpha = makeProject(cloneSpec(ALPHA_SPEC));
    const base = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });

    const repriced = JSON.parse(fs.readFileSync(ci.RATES_PATH, 'utf-8'));
    repriced.models['claude-opus-5-5'].output += 1;
    const ratesFile = path.join(tmpDir(), 'rates.json');
    fs.writeFileSync(ratesFile, JSON.stringify(repriced));
    assert.notEqual(buildCalibration({ paths: [beta], ratesPath: ratesFile }).inputs_digest, base.inputs_digest);

    assert.notEqual(
      buildCalibration({ paths: [beta, alpha], ratesPath: ci.RATES_PATH }).inputs_digest,
      base.inputs_digest,
    );
  });

  test('7: does not change when only mtimes change', () => {
    const beta = makeProject(BETA_SPEC);
    const before = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }).inputs_digest;
    touchTree(beta, 1234567890);
    assert.equal(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }).inputs_digest, before);
  });
});

// ─── 58-03: calibration v2, agent overhead ───────────────────────────────────

const EMPTY_STAT = { n: 0, p50: null, p90: null, min: null, max: null };

// Every projects root is a mkdtemp dir that the test removes. Nothing here reads the real ~/.claude.
const troots = [];
function makeTroot() {
  const root = fx.makeProjectsRoot();
  troots.push(root);
  return root;
}
afterEach(() => {
  while (troots.length) fs.rmSync(troots.pop(), { recursive: true, force: true });
});

// PLANNER_SPAWN (p1) and VERIFIER_SPAWN (v1) for `repo`, plus a verifier spawn (f1) from an unrelated directory.
function overheadRoot(repo, { verifierSpawn = fx.VERIFIER_SPAWN } = {}) {
  const troot = makeTroot();
  const foreign = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-foreign-repo-')));
  tmpDirs.push(foreign);
  const write = (projectKey, agentId, spawn, cwd) => fx.writeOverheadTranscript(troot, {
    projectKey, session: 's1', agentId, spawn, cwd,
  });
  write(fx.projectKeyFor(repo), 'p1', fx.PLANNER_SPAWN, repo);
  write(fx.projectKeyFor(repo), 'v1', verifierSpawn, repo);
  write(fx.projectKeyFor(foreign), 'f1', fx.VERIFIER_SPAWN, foreign);
  return troot;
}

describe('58-03 agent_overhead in calibration v2', () => {
  test('7: without a transcripts root, agent_overhead has the six agents, all empty, and nothing was scanned', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });

    assert.equal(cal.version, 2);
    assert.deepEqual(Object.keys(cal.agent_overhead).sort(), [...OVERHEAD_AGENTS].sort());
    for (const name of OVERHEAD_AGENTS) {
      assert.deepEqual(cal.agent_overhead[name], {
        samples: 0, minutes: EMPTY_STAT, tokens_input: EMPTY_STAT, tokens_output: EMPTY_STAT, cost_usd: EMPTY_STAT,
      }, name);
    }
    assert.deepEqual(cal.agent_overhead_sources, {
      scanned: false, spawns: 0, matched: 0, foreign: 0, quick: 0, unreadable: 0,
    });
    assert.equal(cal.notes.length, 5);
    assert.ok(cal.notes.every((n) => typeof n === 'string'));
    assert.ok(cal.notes[3].startsWith('agent_overhead is one spawn of a non-executor DevFlow agent'));
  });

  test('7: the BETA numbers are the same with and without overhead samples', () => {
    const beta = makeProject(BETA_SPEC);
    const plain = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH });
    const withOverhead = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: overheadRoot(beta) });
    assert.equal(plain.task_classes.code_tdd.minutes.p50, 4);
    assert.deepEqual(withOverhead.task_classes, plain.task_classes);
    assert.deepEqual(withOverhead.trd_level, plain.trd_level);
    assert.deepEqual(withOverhead.probabilities, plain.probabilities);
    assert.deepEqual(withOverhead.samples, plain.samples);
    assert.deepEqual(withOverhead.sources, plain.sources);
  });

  test('8: the planner and verifier spawns are measured and priced per model', () => {
    const beta = makeProject(BETA_SPEC);
    const cal = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: overheadRoot(beta) });

    const planner = cal.agent_overhead.planner;
    assert.equal(planner.samples, 1);
    assert.deepEqual(planner.minutes, { n: 1, p50: 6, p90: 6, min: 6, max: 6 });
    assert.equal(planner.tokens_input.p50, 111015);
    assert.equal(planner.tokens_output.p50, 6000);
    assert.equal(planner.cost_usd.p50, 0.1471);

    const verifier = cal.agent_overhead.verifier;
    assert.equal(verifier.samples, 1);
    assert.equal(verifier.minutes.p50, 4);
    assert.equal(verifier.tokens_input.p50, 20503);
    assert.equal(verifier.cost_usd.p50, 0.0203);

    assert.equal(cal.agent_overhead['job-checker'].samples, 0);
    assert.deepEqual(cal.agent_overhead_sources, {
      scanned: true, spawns: 3, matched: 2, foreign: 1, quick: 0, unreadable: 0,
    });
    assert.deepEqual(cal.unpriced_models, []);
  });

  test('8: a spawn on an unpriced model keeps its minutes, has no cost, and the model is listed', () => {
    const beta = makeProject(BETA_SPEC);
    const unknownVerifier = {
      ...fx.VERIFIER_SPAWN,
      messages: [{ ...fx.VERIFIER_SPAWN.messages[0], model: 'claude-unknown-9' }],
    };
    const cal = buildCalibration({
      paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: overheadRoot(beta, { verifierSpawn: unknownVerifier }),
    });
    const verifier = cal.agent_overhead.verifier;
    assert.equal(verifier.samples, 1);
    assert.equal(verifier.minutes.p50, 4);
    assert.equal(verifier.tokens_input.n, 1);
    assert.equal(verifier.cost_usd.n, 0);
    assert.equal(cal.agent_overhead.planner.cost_usd.n, 1);
    assert.ok(cal.unpriced_models.includes('claude-unknown-9'));
  });

  test('9: two builds over the same transcripts are byte-identical', () => {
    const beta = makeProject(BETA_SPEC);
    const troot = overheadRoot(beta);
    const first = stableStringify(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: troot }));
    const second = stableStringify(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: troot }));
    assert.equal(first, second);
    assert.ok(!first.includes(troot), 'no transcript path appears in the file');
  });

  test('9: inputs_digest changes when an overhead transcript changes, and not with its mtime or location', () => {
    const beta = makeProject(BETA_SPEC);
    const troot = overheadRoot(beta);
    const base = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: troot }).inputs_digest;
    const unscanned = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }).inputs_digest;
    assert.notEqual(unscanned, base, 'scanned and unscanned inputs differ');

    // The same spawns in another projects root: same digest.
    const copy = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: overheadRoot(beta) }).inputs_digest;
    assert.equal(copy, base);

    touchTree(troot, 1234567890);
    assert.equal(buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: troot }).inputs_digest, base);

    // One more message in the planner transcript is a different input.
    const plannerFile = path.join(troot, fx.projectKeyFor(beta), 's1', 'subagents', 'agent-p1.jsonl');
    const extra = fx.assistantRecords({
      id: 'msg_P3', model: 'claude-opus-5-5', input: 1, cacheWrite: 0, cacheRead: 1000, output: 100, blocks: 1,
      timestamp: '2026-10-01T10:08:00.000Z',
    });
    fs.appendFileSync(plannerFile, extra.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const changed = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH, transcriptsRoot: troot });
    assert.notEqual(changed.inputs_digest, base);
    assert.equal(changed.agent_overhead.planner.minutes.p50, 8);
  });
});

// ─── 58-03: calibration v2, objective-level history ──────────────────────────

describe('58-03 objective_level in calibration v2', () => {
  test('10: the BETA objectives sum to their serial minutes; an objective counts for a metric only when every TRD has it', () => {
    const beta = makeProject(BETA_SPEC);
    const level = buildCalibration({ paths: [beta], ratesPath: ci.RATES_PATH }).objective_level;

    // 70-a: 3 TRDs, 6 auto tasks, 10 + 8 + 12 minutes. 71-b: 2 TRDs, 2 auto tasks (the checkpoint is not counted);
    // 71-b/01 is autonomous:false and has no minutes, so 71-b has no minutes total.
    assert.equal(level.samples, 2);
    assert.deepEqual(level.trds, { n: 2, p50: 2, p90: 3, min: 2, max: 3 });
    assert.deepEqual(level.tasks, { n: 2, p50: 2, p90: 6, min: 2, max: 6 });
    assert.deepEqual(level.minutes, { n: 1, p50: 30, p90: 30, min: 30, max: 30 });
    // Only 70-a/03 has tokens, so no objective has them on every TRD.
    assert.deepEqual(level.tokens_input, EMPTY_STAT);
    assert.deepEqual(level.tokens_output, EMPTY_STAT);
    assert.deepEqual(level.cost_usd, EMPTY_STAT);
    assert.deepEqual(Object.keys(level).sort(), ['cost_usd', 'minutes', 'samples', 'tasks', 'tokens_input', 'tokens_output', 'trds']);
  });

  test('10: tokens and dollars are summed over fully measured objectives; a TRD without an outcome blocks its objective', () => {
    const tokenTrd = (nn) => ({
      nn, slug: `t${nn}`,
      tasks: [{ name: 'Task 1: x', type: 'auto', files: ['lib/x.cjs'] }],
      summary: {
        duration: '5min', completed: '2026-10-01',
        tokens_input: 1000, tokens_output: 100, tokens_cache_read: 0, tokens_cache_write: 0, token_model: 'claude-opus-5-5',
      },
    });
    const gamma = makeProject({
      name: 'gamma',
      objectives: [
        {
          dir: '80-g',
          trds: [tokenTrd('01'), {
            nn: '02', slug: 'unmeasured', tasks: [{ name: 'Task 1: y', type: 'auto', files: ['lib/y.cjs'] }], summary: null,
          }],
        },
        { dir: '81-h', trds: [tokenTrd('01'), tokenTrd('02')] },
        { dir: '82-i', trds: [{ nn: '01', slug: 'never', tasks: [{ name: 'Task 1: z', type: 'auto', files: ['lib/z.cjs'] }], summary: null }] },
      ],
    });
    const level = buildCalibration({ paths: [gamma], ratesPath: ci.RATES_PATH }).objective_level;

    // 82-i has no sample TRD at all, so it is not an objective sample.
    assert.equal(level.samples, 2);
    assert.deepEqual(level.trds, { n: 2, p50: 2, p90: 2, min: 2, max: 2 });
    assert.deepEqual(level.tasks, { n: 2, p50: 2, p90: 2, min: 2, max: 2 });
    assert.deepEqual(level.minutes, { n: 1, p50: 10, p90: 10, min: 10, max: 10 });
    assert.deepEqual(level.tokens_input, { n: 1, p50: 2000, p90: 2000, min: 2000, max: 2000 });
    assert.deepEqual(level.tokens_output, { n: 1, p50: 200, p90: 200, min: 200, max: 200 });
    assert.deepEqual(level.cost_usd, { n: 1, p50: 0.012, p90: 0.012, min: 0.012, max: 0.012 });
  });

  test('10: an empty project has no objective samples', () => {
    const empty = makeProject({ name: 'empty', objectives: [] });
    const level = buildCalibration({ paths: [empty], ratesPath: ci.RATES_PATH }).objective_level;
    assert.equal(level.samples, 0);
    assert.deepEqual(level.trds, EMPTY_STAT);
    assert.deepEqual(level.minutes, EMPTY_STAT);
  });
});

// ─── 64-08: the recency window ───────────────────────────────────────────────

// SLOPE: objectives 1-a to 7-g, TRDs 01 and 02 each, two auto code_tdd tasks per TRD. Objectives 1-5 took 40min per TRD
// (task share 20), objectives 6-7 took 10min (share 5). Unwindowed there are 28 shares, eight of 5 and twenty of 20, so the
// nearest-rank p50 is 20; a window of 2 keeps 6-f and 7-g and every share is 5.
const SLOPE_DIRS = ['1-a', '2-b', '3-c', '4-d', '5-e', '6-f', '7-g'];

function slopeTrd(nn, duration, completed) {
  return {
    nn, slug: 'work',
    tasks: [
      { name: 'Task 1: x', type: 'auto', tdd: true, files: ['lib/x.cjs', 'lib/x.test.cjs'] },
      { name: 'Task 2: y', type: 'auto', tdd: true, files: ['lib/x.cjs', 'lib/x.test.cjs'] },
    ],
    summary: { duration, completed },
  };
}

function slopeSpec(name = 'slope', dirs = SLOPE_DIRS) {
  return {
    name,
    objectives: dirs.map((dir) => {
      const n = Number(dir.split('-')[0]);
      const duration = n <= 5 ? '40min' : '10min';
      const completed = `2026-09-0${n}`;
      return { dir, trds: [slopeTrd('01', duration, completed), slopeTrd('02', duration, completed)] };
    }),
  };
}

// An objective of two code_tdd TRDs with the given duration and no tokens.
function plainObjective(dir, duration, completed = '2026-09-01') {
  return { dir, trds: [slopeTrd('01', duration, completed), slopeTrd('02', duration, completed)] };
}

describe('64-08 buildCalibration window', () => {
  const build = (paths, extra = {}) => buildCalibration({ paths, ratesPath: ci.RATES_PATH, transcriptsRoot: null, ...extra });

  test('1: window 2 keeps the two latest objectives and every statistic follows', () => {
    const slope = makeProject(slopeSpec());
    const full = build([slope]);
    assert.equal(full.task_classes.code_tdd.minutes.p50, 20);
    assert.equal(full.samples.trds, 14);

    const cal = build([slope], { window: 2 });
    assert.equal(cal.task_classes.code_tdd.minutes.p50, 5);
    assert.equal(cal.samples.trds, 4);
    assert.equal(cal.trd_level.samples, 4);
    assert.deepEqual(cal.window, {
      objectives: 2,
      projects: [{ project: 'slope', first: '6-f', last: '7-g', kept_objectives: 2, dropped_objectives: 5, dropped_trds: 10 }],
    });
    assert.equal(cal.notes.length, full.notes.length + 1);
    assert.deepEqual(cal.notes.slice(0, full.notes.length), full.notes, 'the window note is appended, the others are untouched');
    assert.equal(cal.notes[cal.notes.length - 1],
      'Window: only the 2 most recent objectives with samples (by objective number) are read per project; older objectives are dropped before every statistic. agent_overhead is not windowed.');
    assert.notEqual(cal.inputs_digest, full.inputs_digest);
    assert.equal(cal.version, 2);
  });

  test('2: a window that drops nothing leaves no trace: same bytes, no key, same notes', () => {
    const slope = makeProject(slopeSpec());
    const baseline = stableStringify(build([slope]));
    assert.equal(stableStringify(build([slope], { window: null })), baseline);
    assert.equal(stableStringify(build([slope], { window: 7 })), baseline);
    assert.equal(stableStringify(build([slope], { window: 99 })), baseline);
    const cal = build([slope], { window: 99 });
    assert.equal(Object.keys(cal).includes('window'), false);
    assert.equal(cal.notes.length, build([slope]).notes.length);
    assert.equal(stableStringify(buildCalibration({ paths: [slope], ratesPath: ci.RATES_PATH })), baseline,
      'omitting transcriptsRoot and window is the same call');
  });

  test('3: objectives are ranked by number, not lexically (9, 10, 11)', () => {
    const numeric = makeProject({
      name: 'numeric',
      objectives: [plainObjective('9-a', '10min'), plainObjective('10-b', '20min'), plainObjective('11-c', '30min')],
    });
    const cal = build([numeric], { window: 2 });
    assert.equal(cal.window.projects[0].first, '10-b');
    assert.equal(cal.window.projects[0].last, '11-c');
    assert.equal(cal.window.projects[0].dropped_objectives, 1);
    // 10-b and 11-c: each TRD 2 tasks, shares 10 and 15.
    assert.equal(cal.task_classes.code_tdd.minutes.min, 10);
    assert.equal(cal.task_classes.code_tdd.minutes.max, 15);
  });

  test('4: an objective with no outcome consumes no window slot', () => {
    const noOutcome = {
      dir: '2-b',
      trds: [
        { nn: '01', slug: 'work', tasks: [{ name: 'Task 1: x', type: 'auto', files: ['lib/x.cjs'] }], summary: null },
        { nn: '02', slug: 'work', tasks: [{ name: 'Task 1: x', type: 'auto', files: ['lib/x.cjs'] }], summary: null },
      ],
    };
    const root = makeProject({
      name: 'gappy',
      objectives: [plainObjective('1-a', '40min'), noOutcome, plainObjective('3-c', '10min'), plainObjective('4-d', '10min')],
    });
    const two = build([root], { window: 2 });
    assert.equal(two.window.projects[0].first, '3-c');
    assert.equal(two.window.projects[0].last, '4-d');
    assert.equal(two.window.projects[0].kept_objectives, 2);
    assert.equal(two.window.projects[0].dropped_objectives, 2, '1-a and the empty 2-b are both dropped');
    assert.equal(two.window.projects[0].dropped_trds, 4);
    assert.equal(two.samples.trds, 4);

    const three = build([root], { window: 3 });
    assert.equal(Object.keys(three).includes('window'), false, 'three objectives have outcomes: nothing is dropped');
    assert.equal(stableStringify(three), stableStringify(build([root])));
    assert.equal(three.sources[0].trds, 8, '2-b stays between the others, untouched');
    assert.equal(three.sources[0].no_outcome, 2);
  });

  test('5: sources, samples, objective level, probabilities and data_as_of follow the retained TRDs', () => {
    const slope = makeProject(slopeSpec());
    const full = build([slope]);
    const cal = build([slope], { window: 3 });
    assert.equal(cal.sources[0].trds, 6);
    assert.equal(cal.sources[0].summaries, 6);
    assert.equal(cal.sources[0].with_minutes, 6);
    assert.equal(cal.samples.trds, 6);
    assert.equal(cal.samples.tasks, 12);
    assert.equal(cal.objective_level.samples, 3);
    assert.equal(cal.probabilities.gap_closure.n, 3);
    assert.equal(cal.probabilities.checkpoint.n, 6);
    assert.equal(cal.data_as_of, full.data_as_of, 'the newest objective is retained');
    assert.equal(cal.data_as_of, '2026-09-07');

    assert.equal(build([slope], { window: 3 }).inputs_digest, cal.inputs_digest, 'two builds, one digest');
    assert.notEqual(build([slope], { window: 2 }).inputs_digest, cal.inputs_digest, 'windows 2 and 3 differ');
  });

  test('5: data_as_of follows the retained TRDs when the newest completion is in a dropped objective', () => {
    const odd = makeProject({
      name: 'odd',
      objectives: [plainObjective('1-a', '10min', '2026-10-01'), plainObjective('2-b', '10min', '2026-09-01')],
    });
    assert.equal(build([odd]).data_as_of, '2026-10-01');
    assert.equal(build([odd], { window: 1 }).data_as_of, '2026-09-01');
  });

  test('5: the whole-history metric counts in sources are not windowed', () => {
    const rows = ['| Objective 1 P01 | 40min | 2 tasks | 2 files |'];
    const root = makeProject({ ...slopeSpec('metrics'), stateArchiveRows: rows });
    const full = build([root]);
    const cal = build([root], { window: 2 });
    assert.equal(cal.sources[0].metric_rows, full.sources[0].metric_rows);
    assert.equal(cal.sources[0].metric_rows_joined, full.sources[0].metric_rows_joined);
  });

  test('6: the window is per project: each project keeps its own latest objectives', () => {
    const left = makeProject(slopeSpec('left', ['3-c', '4-d']));
    const right = makeProject(slopeSpec('right', ['1-a', '2-b']));
    const cal = build([left, right], { window: 1 });
    assert.deepEqual(cal.window.projects, [
      { project: 'left', first: '4-d', last: '4-d', kept_objectives: 1, dropped_objectives: 1, dropped_trds: 2 },
      { project: 'right', first: '2-b', last: '2-b', kept_objectives: 1, dropped_objectives: 1, dropped_trds: 2 },
    ]);
    assert.equal(cal.samples.trds, 4);
    assert.deepEqual(cal.sources.map((s) => [s.project, s.trds]), [['left', 2], ['right', 2]]);
  });

  test('6: a project with fewer objectives than the window is kept whole while another is cut', () => {
    const small = makeProject(slopeSpec('small', ['1-a']));
    const big = makeProject(slopeSpec('big', ['1-a', '2-b', '3-c']));
    const cal = build([small, big], { window: 2 });
    assert.deepEqual(cal.window.projects.map((p) => p.project), ['big'], 'only a project that dropped something is listed');
    assert.equal(cal.sources.find((s) => s.project === 'small').trds, 2);
    assert.equal(cal.sources.find((s) => s.project === 'big').trds, 4);
  });

  test('7: an invalid window throws and names the rule', () => {
    const slope = makeProject(slopeSpec());
    for (const bad of [0, -1, 1.5, '2', NaN, Infinity, true]) {
      assert.throws(() => build([slope], { window: bad }), /window must be a positive integer or null/, String(bad));
    }
  });

  test('8: a windowed calibration equals a calibration over a directory holding only the retained objectives', () => {
    const slope = makeProject(slopeSpec());
    const kept = makeProject({ name: 'kept', objectives: [] });
    for (const dir of ['5-e', '6-f', '7-g']) {
      fs.cpSync(path.join(slope, '.planning', 'objectives', dir), path.join(kept, '.planning', 'objectives', dir), { recursive: true });
    }
    const windowed = build([slope], { window: 3 });
    const copied = build([kept]);
    for (const block of ['samples', 'trd_level', 'task_classes', 'objective_level', 'probabilities', 'data_as_of']) {
      assert.deepEqual(windowed[block], copied[block], block);
    }
  });

  test('9: agent_overhead is not windowed', () => {
    const beta = makeProject(BETA_SPEC);
    const troot = overheadRoot(beta);
    const full = build([beta], { transcriptsRoot: troot });
    const cal = build([beta], { transcriptsRoot: troot, window: 1 });
    assert.deepEqual(Object.keys(cal).includes('window'), true, 'the window did cut 70-a');
    assert.deepEqual(cal.agent_overhead, full.agent_overhead);
    assert.deepEqual(cal.agent_overhead_sources, full.agent_overhead_sources);
  });
});

// ─── 64-10: the window becomes the default ───────────────────────────────────
// 64-VALIDATION.md (ship_default: true) froze window_objectives 10 in 64-DIAGNOSIS.md. W is written as the literal 10 here.
// WIDE: 12 = W + 2 objectives, `1-a` and `2-b` at 40min per TRD (task share 20), the other ten at 10min (share 5), each with
// one TRD of two auto code_tdd tasks. Unwindowed there are four shares of 20 and twenty of 5, so the median cannot tell the
// two old objectives apart from the rest; the maximum can (20 unwindowed, 5 once they are dropped).
function wideSpec(count, name = 'wide') {
  return {
    name,
    objectives: Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const dir = `${n}-${String.fromCharCode(96 + n)}`;
      const duration = n <= 2 ? '40min' : '10min';
      return { dir, trds: [slopeTrd('01', duration, `2026-09-${String(n).padStart(2, '0')}`)] };
    }),
  };
}

describe('64-10 the recency window is the default', () => {
  const build = (paths, extra = {}) => buildCalibration({ paths, ratesPath: ci.RATES_PATH, transcriptsRoot: null, ...extra });

  test('2: a build with no window drops the two oldest of twelve objectives', () => {
    const wide = makeProject(wideSpec(12));
    const cal = build([wide]);
    assert.equal(cal.window.objectives, 10);
    assert.equal(cal.window.projects[0].dropped_objectives, 2);
    assert.equal(cal.window.projects[0].kept_objectives, 10);
    assert.equal(cal.window.projects[0].first, '3-c');
    assert.equal(cal.samples.trds, 10);
    assert.equal(cal.task_classes.code_tdd.minutes.max, 5, 'the two 40min objectives are out of every statistic');
    assert.equal(cal.task_classes.code_tdd.minutes.n, 20);
  });

  test('3: window null keeps all twelve and leaves no trace; a window that drops nothing is the same bytes', () => {
    const wide = makeProject(wideSpec(12));
    const all = build([wide], { window: null });
    assert.equal(Object.keys(all).includes('window'), false);
    assert.equal(all.samples.trds, 12);
    assert.equal(all.task_classes.code_tdd.minutes.max, 20, 'the unwindowed build has the old objectives');
    assert.equal(stableStringify(all), stableStringify(build([wide], { window: 15 })));
    assert.notEqual(stableStringify(all), stableStringify(build([wide])), 'the default build is not the unwindowed one');
  });

  test('3b: an explicit window still overrides the default', () => {
    const wide = makeProject(wideSpec(12));
    const cal = build([wide], { window: 3 });
    assert.equal(cal.window.objectives, 3);
    assert.equal(cal.samples.trds, 3);
  });

  test('5: ten objectives (exactly the window) are byte-identical with and without the default, with no window key', () => {
    const ten = makeProject(wideSpec(10));
    const byDefault = build([ten]);
    assert.equal(Object.keys(byDefault).includes('window'), false);
    assert.equal(stableStringify(byDefault), stableStringify(build([ten], { window: null })));
    assert.equal(byDefault.samples.trds, 10);
    const eleven = makeProject(wideSpec(11, 'eleven'));
    assert.equal(build([eleven]).window.projects[0].dropped_objectives, 1, 'one more than the window drops exactly one');
  });

  test('1: DEFAULT_WINDOW_OBJECTIVES is the window frozen in 64-DIAGNOSIS.md', () => {
    assert.equal(DEFAULT_WINDOW_OBJECTIVES, 10);
  });
});
