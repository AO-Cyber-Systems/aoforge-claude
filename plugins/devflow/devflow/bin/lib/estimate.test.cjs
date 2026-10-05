'use strict';

// Tests for estimate.cjs (TRD 58-05). Calibration is the literal CAL_V2 from the estimate fixtures, written into
// mkdtemp directories and passed by explicit path or injected env: nothing here reads or writes the real
// ~/.claude/devflow/calibration.json.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('./calibration-inputs.cjs');
const est = require('./estimate.cjs');
const {
  EMPTY_STAT,
  CAL_V2,
  makeCalibration,
  writeCalibrationFile,
} = require('./__fixtures__/estimate-fixtures.cjs');

const CAL = CAL_V2;

function tmpDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-estimate-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('1. loadCalibration: missing, unreadable, unsupported and mismatched files each give a reason; good ones load', (t) => {
  const dir = tmpDir(t);

  const missing = est.loadCalibration(path.join(dir, 'nope.json'));
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /run df-tools calibrate/);
  assert.match(missing.reason, /nope\.json/);

  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{ not json');
  const malformed = est.loadCalibration(bad);
  assert.equal(malformed.ok, false);
  assert.match(malformed.reason, /unreadable/);

  const arrayFile = path.join(dir, 'array.json');
  fs.writeFileSync(arrayFile, '[]');
  assert.match(est.loadCalibration(arrayFile).reason, /unreadable/);

  const noClasses = writeCalibrationFile(path.join(dir, 'no-classes'), makeCalibration({ task_classes: undefined }));
  const unusable = est.loadCalibration(noClasses);
  assert.equal(unusable.ok, false);
  assert.match(unusable.reason, /unreadable/);
  assert.match(unusable.reason, /task_classes/);

  const v3 = writeCalibrationFile(path.join(dir, 'v3'), makeCalibration({ version: 3 }));
  const unsupported = est.loadCalibration(v3);
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.reason, /version 3/);

  const c99 = writeCalibrationFile(path.join(dir, 'c99'), makeCalibration({ classifier_version: 99 }));
  const mismatch = est.loadCalibration(c99);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.reason, /99/);
  assert.match(mismatch.reason, new RegExp(`version ${ci.CLASSIFIER_VERSION}\\b`));
  assert.match(mismatch.reason, /run df-tools calibrate/);

  const good = writeCalibrationFile(path.join(dir, 'good'), CAL);
  const loaded = est.loadCalibration(good);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.path, good);
  assert.deepEqual(loaded.calibration, CAL);

  const v1 = writeCalibrationFile(
    path.join(dir, 'v1'),
    makeCalibration({ version: 1, agent_overhead: undefined, objective_level: undefined }),
  );
  const old = est.loadCalibration(v1);
  assert.equal(old.ok, true);
  assert.equal(old.calibration.version, 1);
  assert.equal(old.calibration.agent_overhead, undefined);
});

test('1b. loadCalibration with no file argument reads the path from the injected env', (t) => {
  const dir = tmpDir(t);
  const file = writeCalibrationFile(dir, CAL);
  const viaEnv = est.loadCalibration(undefined, { DEVFLOW_CALIBRATION_PATH: file });
  assert.equal(viaEnv.ok, true);
  assert.equal(viaEnv.path, file);

  const absent = est.loadCalibration(undefined, { DEVFLOW_CALIBRATION_PATH: path.join(dir, 'absent.json') });
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /absent\.json/);
});

test('2. confidenceFor maps sample counts to labels and CONFIDENCE_LEVELS is ordered weakest first', () => {
  assert.deepEqual(est.CONFIDENCE_LEVELS, ['none', 'low', 'medium', 'high']);
  assert.equal(est.MIN_CLASS_SAMPLES, 5);
  for (const [n, label] of [[0, 'none'], [1, 'low'], [9, 'low'], [10, 'medium'], [29, 'medium'], [30, 'high'], [500, 'high']]) {
    assert.equal(est.confidenceFor(n), label, `n=${n}`);
  }
  assert.equal(est.confidenceFor(null), 'none');
  assert.equal(est.confidenceFor(undefined), 'none');
});

test('3. estimateTask: a well-sampled class, a mid class, a thin class that falls back, a named class and a checkpoint', () => {
  const tdd = est.estimateTask(CAL, { files: ['lib/a.cjs', 'lib/a.test.cjs'], tdd: true });
  assert.equal(tdd.class, 'code_tdd');
  assert.equal(tdd.classifier_version, ci.CLASSIFIER_VERSION);
  assert.equal(tdd.basis, 'class');
  assert.equal(tdd.class_samples, 40);
  assert.deepEqual(tdd.minutes, { p50: 6, p90: 18, n: 32 });
  assert.deepEqual(tdd.tokens_input, { p50: 3600000, p90: 6400000, n: 30 });
  assert.deepEqual(tdd.tokens_output, { p50: 29000, p90: 48000, n: 30 });
  assert.deepEqual(tdd.cost_usd, { p50: 1.4, p90: 2.2, n: 30 });
  assert.equal(tdd.samples, 30);
  assert.equal(tdd.confidence, 'high');
  assert.equal(tdd.human_wait, false);
  assert.deepEqual(tdd.notes, []);
  assert.deepEqual(tdd.missing, []);

  const doc = est.estimateTask(CAL, { files: ['docs/x.md'] });
  assert.equal(doc.class, 'doc');
  assert.equal(doc.samples, 10);
  assert.equal(doc.confidence, 'medium');
  assert.deepEqual(doc.minutes, { p50: 4, p90: 8, n: 12 });

  const config = est.estimateTask(CAL, { files: ['package.json'] });
  assert.equal(config.class, 'config');
  assert.equal(config.basis, 'all');
  assert.equal(config.class_samples, 2);
  assert.deepEqual(config.minutes, { p50: 5, p90: 15, n: 120 });
  assert.deepEqual(config.cost_usd, { p50: 1.5, p90: 3, n: 90 });
  assert.equal(config.confidence, 'low', 'a fallback is capped at low even though all has 90 or more samples');
  assert.equal(config.notes.length, 1);
  assert.match(config.notes[0], /config/);
  assert.match(config.notes[0], /2 samples/);
  assert.match(config.notes[0], /all-task/);

  const prompt = est.estimateTask(CAL, { class: 'prompt' });
  assert.equal(prompt.class, 'prompt');
  assert.equal(prompt.basis, 'class');
  assert.equal(prompt.samples, 6);
  assert.equal(prompt.confidence, 'low');

  assert.throws(
    () => est.estimateTask(CAL, { class: 'nope' }),
    (err) => err instanceof Error && /nope/.test(err.message) && /code_tdd/.test(err.message) && /checkpoint/.test(err.message),
  );

  const checkpoint = est.estimateTask(CAL, { type: 'checkpoint:human-verify' });
  assert.equal(checkpoint.class, 'checkpoint');
  assert.equal(checkpoint.human_wait, true);
  for (const metric of ['minutes', 'tokens_input', 'tokens_output', 'cost_usd']) {
    assert.deepEqual(checkpoint[metric], { p50: 0, p90: 0 }, metric);
  }
  assert.equal(checkpoint.confidence, 'n/a');
  assert.deepEqual(checkpoint.missing, []);

  const named = est.estimateTask(CAL, { class: 'checkpoint' });
  assert.equal(named.human_wait, true);
  assert.equal(named.confidence, 'n/a');
});

test('3b. a class missing from the calibration, or one metric with no samples anywhere, is reported and never invented', () => {
  const noPrompt = makeCalibration();
  delete noPrompt.task_classes.prompt;
  const fallback = est.estimateTask(noPrompt, { class: 'prompt' });
  assert.equal(fallback.basis, 'all');
  assert.equal(fallback.class_samples, 0);
  assert.equal(fallback.confidence, 'low');
  assert.match(fallback.notes[0], /0 samples/);

  const noCost = makeCalibration();
  for (const name of Object.keys(noCost.task_classes)) noCost.task_classes[name].cost_usd = { ...EMPTY_STAT };
  const result = est.estimateTask(noCost, { files: ['lib/a.cjs'], tdd: true });
  assert.equal(result.cost_usd, null);
  assert.deepEqual(result.missing, ['cost_usd']);
  assert.deepEqual(result.minutes, { p50: 6, p90: 18, n: 32 });
  assert.equal(result.samples, 30, 'the sample count covers the metrics that are present');
  assert.equal(result.confidence, 'high');

  const nothing = makeCalibration();
  for (const name of Object.keys(nothing.task_classes)) {
    for (const metric of ['minutes', 'tokens_input', 'tokens_output', 'cost_usd']) nothing.task_classes[name][metric] = { ...EMPTY_STAT };
  }
  const empty = est.estimateTask(nothing, { files: ['lib/a.cjs'] });
  assert.equal(empty.minutes, null);
  assert.deepEqual(empty.missing, ['minutes', 'tokens_input', 'tokens_output', 'cost_usd']);
  assert.equal(empty.samples, 0);
  assert.equal(empty.confidence, 'none');
});

test('4. estimateTask uses the calibrator classifier: its class always equals calibration-inputs.classifyTask', () => {
  const tasks = [
    { files: ['skills/x/SKILL.md'] },
    { files: ['ui/app.tsx', 'lib/x.cjs'], tdd: true },
    { files: ['lib/page.dart'], trdType: 'ui' },
    { files: [], type: 'checkpoint:decision' },
  ];
  for (const task of tasks) {
    assert.equal(est.estimateTask(CAL, task).class, ci.classifyTask(task), JSON.stringify(task));
  }
});
