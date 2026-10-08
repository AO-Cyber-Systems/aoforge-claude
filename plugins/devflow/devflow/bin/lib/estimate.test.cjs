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
  makeCalibrationV3,
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

test('1c. makeCalibrationV3 is CAL_V2 as version 3 with the method block, and trdMinutes replaces the TRD-level minutes', () => {
  const v3 = makeCalibrationV3({ minutes: 'trd_level' });
  assert.equal(v3.version, 3);
  assert.deepEqual(v3.method, { minutes: 'trd_level', window_objectives: 10, through_objective: 66 });
  assert.deepEqual(v3.trd_level, CAL_V2.trd_level);
  assert.equal(v3.task_classes.all.samples, CAL_V2.task_classes.all.samples);
  assert.equal(makeCalibrationV3({ minutes: 'task_sum' }).method.minutes, 'task_sum');
  assert.equal(Object.isFrozen(v3), false);

  const thin = makeCalibrationV3({ minutes: 'trd_level', trdMinutes: { n: 7, p50: 12, p90: 45 } });
  assert.equal(thin.trd_level.minutes.n, 7);
  assert.equal(thin.trd_level.minutes.p50, 12);

  const empty = makeCalibrationV3({ minutes: 'trd_level', trdMinutes: EMPTY_STAT });
  assert.deepEqual(empty.trd_level.minutes, EMPTY_STAT);
  assert.equal(CAL_V2.trd_level.minutes.n, 40, 'the frozen CAL_V2 is not changed');
});

test('1d. loadCalibration reads version 3 when its minutes method is known, and says why otherwise', (t) => {
  const dir = tmpDir(t);

  for (const minutes of ['trd_level', 'task_sum']) {
    const file = writeCalibrationFile(path.join(dir, minutes), makeCalibrationV3({ minutes }));
    const loaded = est.loadCalibration(file);
    assert.equal(loaded.ok, true, minutes);
    assert.equal(loaded.calibration.method.minutes, minutes);
  }

  const median = writeCalibrationFile(
    path.join(dir, 'median'),
    { ...makeCalibrationV3({ minutes: 'trd_level' }), method: { minutes: 'median' } },
  );
  const unknown = est.loadCalibration(median);
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /minutes method "median"/);
  assert.match(unknown.reason, /df-tools calibrate/);

  const noMethod = writeCalibrationFile(path.join(dir, 'no-method'), makeCalibration({ version: 3 }));
  const missing = est.loadCalibration(noMethod);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /version 3 without a method block/);
  assert.match(missing.reason, /df-tools calibrate/);

  const arrayMethod = writeCalibrationFile(path.join(dir, 'array-method'), { ...makeCalibration({ version: 3 }), method: ['trd_level'] });
  assert.match(est.loadCalibration(arrayMethod).reason, /version 3 without a method block/);

  const v4 = writeCalibrationFile(path.join(dir, 'v4'), makeCalibration({ version: 4 }));
  const future = est.loadCalibration(v4);
  assert.equal(future.ok, false);
  assert.match(future.reason, /reads versions 1, 2 and 3/);
  assert.match(future.reason, /df-tools calibrate/);

  const v2 = writeCalibrationFile(path.join(dir, 'v2'), CAL_V2);
  assert.equal(est.loadCalibration(v2).ok, true, 'version 2 needs no method block');
});

test('1e. minutesMethod is the calibration\'s minutes method, task_sum when it has none', () => {
  assert.equal(est.minutesMethod(CAL_V2), 'task_sum');
  assert.equal(est.minutesMethod(makeCalibrationV3({ minutes: 'trd_level' })), 'trd_level');
  assert.equal(est.minutesMethod(makeCalibrationV3({ minutes: 'task_sum' })), 'task_sum');
  assert.equal(est.minutesMethod(makeCalibration({ version: 1 })), 'task_sum');
  assert.deepEqual(est.KNOWN_MINUTES_METHODS, ['task_sum', 'trd_level']);
  assert.equal(Object.isFrozen(est.KNOWN_MINUTES_METHODS), true);
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

// ─── TRD composition (task 2) ─────────────────────────────────────────────────

const {
  makeEstimateProject,
  removeEstimateProject,
} = require('./__fixtures__/estimate-fixtures.cjs');

function near(actual, expected, label, tol = 1e-9) {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} is not within ${tol} (relative) of ${expected}`,
  );
}

function nearPair(stat, p50, p90, label) {
  assert.ok(stat, `${label}: missing`);
  near(stat.p50, p50, `${label} p50`);
  near(stat.p90, p90, `${label} p90`);
}

const TRD_A = `---
objective: 80-alpha
trd: "01"
type: standard
wave: 1
depends_on: []
---

# TRD 80-01: parser

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: parser</name>
  <files>lib/a.cjs, lib/a.test.cjs</files>
  <action>Parse.</action>
</task>

<task type="auto" tdd="true">
  <name>Task 2: lexer</name>
  <files>lib/b.cjs</files>
  <action>Lex.</action>
</task>

</tasks>
`;

const TRD_MIX = `---
objective: 80-alpha
trd: "02"
type: standard
wave: 1
depends_on: []
---

# TRD 80-02: mix

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: parser</name>
  <files>lib/a.cjs, lib/a.test.cjs</files>
  <action>Parse.</action>
</task>

<task type="auto">
  <name>Task 2: guide</name>
  <files>docs/x.md</files>
  <action>Write.</action>
</task>

<task type="auto">
  <name>Task 3: package</name>
  <files>package.json</files>
  <action>Bump.</action>
</task>

</tasks>
`;

const TRD_CP = `---
objective: 80-alpha
trd: "03"
type: standard
wave: 2
depends_on: ["80-01"]
autonomous: false
---

# TRD 80-03: checkpointed

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: parser</name>
  <files>lib/a.cjs, lib/a.test.cjs</files>
  <action>Parse.</action>
</task>

<task type="checkpoint:human-verify">
  <name>Task 2: look at it</name>
  <files></files>
  <action>Ask.</action>
</task>

</tasks>
`;

const TRD_CHECKPOINT_ONLY = `---
objective: 80-alpha
trd: "04"
type: standard
---

<tasks>

<task type="checkpoint:decision">
  <name>Task 1: choose</name>
  <files></files>
  <action>Ask.</action>
</task>

</tasks>
`;

test('5. estimateTrdText adds the quantiles of two code_tdd tasks and reports the TRD shape', () => {
  const trd = est.estimateTrdText(CAL, TRD_A);
  nearPair(trd.minutes, 12, 36, 'minutes');
  nearPair(trd.cost_usd, 2.8, 4.4, 'cost_usd');
  nearPair(trd.tokens_input, 7200000, 12800000, 'tokens_input');
  nearPair(trd.tokens_output, 58000, 96000, 'tokens_output');
  assert.equal(trd.confidence, 'high');
  assert.equal(trd.tasks.length, 2);
  assert.equal(trd.tasks[0].name, 'Task 1: parser');
  assert.equal(trd.tasks[0].class, 'code_tdd');
  assert.equal(trd.tasks[1].class, 'code_tdd');
  assert.equal(trd.wave, 1);
  assert.deepEqual(trd.depends_on, []);
  assert.equal(trd.autonomous, true);
  assert.equal(trd.gap_closure, false);
  assert.equal(trd.trd_type, 'standard');
  assert.equal(trd.human_wait, false);
  assert.equal(trd.id, null);
  assert.deepEqual(trd.notes, []);
  assert.deepEqual(trd.missing, []);
  assert.equal(trd.weakest.name, 'Task 1: parser', 'a tie on label goes to the larger share, then the earlier task');
  assert.equal(trd.weakest.class, 'code_tdd');
  assert.equal(trd.weakest.n, 30);

  const named = est.estimateTrdText(CAL, TRD_A, { id: '80-01', path: '/p/80-01-parser-TRD.md' });
  assert.equal(named.id, '80-01');
  assert.equal(named.path, '/p/80-01-parser-TRD.md');
});

test('5b. frontmatter strings are normalised: wave, depends_on, autonomous and gap_closure', () => {
  const typed = est.estimateTrdText(CAL, TRD_CP.replace('autonomous: false', 'autonomous: false\ngap_closure: true').replace('wave: 2', 'wave: "3"'));
  assert.equal(typed.wave, 3);
  assert.deepEqual(typed.depends_on, ['80-01']);
  assert.equal(typed.autonomous, false);
  assert.equal(typed.gap_closure, true);

  const odd = est.estimateTrdText(CAL, TRD_A.replace('wave: 1', 'wave: soon').replace('depends_on: []', 'depends_on: 80-01'));
  assert.equal(odd.wave, 1, 'a wave that is not a number is wave 1');
  assert.deepEqual(odd.depends_on, [], 'depends_on that is not an array is empty');
  assert.equal(odd.autonomous, true, 'autonomous is false only for false');
});

test('6. a mixed TRD adds its tasks, and its confidence is the weakest task that matters', () => {
  const trd = est.estimateTrdText(CAL, TRD_MIX);
  nearPair(trd.minutes, 15, 41, 'minutes');
  nearPair(trd.cost_usd, 3.7, 6.8, 'cost_usd');
  assert.equal(trd.confidence, 'low');
  assert.equal(trd.weakest.name, 'Task 3: package');
  assert.equal(trd.weakest.class, 'config');
  assert.equal(trd.weakest.label, 'low');
  near(trd.weakest.p50, 5, 'weakest p50');
  assert.deepEqual(trd.tasks.map((t) => t.class), ['code_tdd', 'doc', 'config']);
  assert.equal(trd.tasks[2].basis, 'all');
  assert.ok(trd.notes.some((n) => /Task 3: package/.test(n) && /config/.test(n) && /2 samples/.test(n)), trd.notes.join(' | '));
});

test('7. a checkpoint adds nothing and marks the TRD as excluding human wait', () => {
  const trd = est.estimateTrdText(CAL, TRD_CP);
  nearPair(trd.minutes, 6, 18, 'minutes');
  assert.equal(trd.human_wait, true);
  assert.equal(trd.autonomous, false);
  assert.equal(trd.wave, 2);
  assert.deepEqual(trd.depends_on, ['80-01']);
  assert.ok(trd.notes.includes('human wait not included'), trd.notes.join(' | '));
  assert.equal(trd.tasks.length, 2);
  assert.equal(trd.tasks[1].class, 'checkpoint');
  assert.equal(trd.tasks[1].confidence, 'n/a');
  assert.equal(trd.confidence, 'high', 'a checkpoint is n/a and never lowers the result');
  assert.equal(trd.weakest.name, 'Task 1: parser');
});

test('8. no auto tasks, and a metric with no samples anywhere, give null and a reason, never zero', () => {
  const none = est.estimateTrdText(CAL, TRD_CHECKPOINT_ONLY);
  for (const metric of ['minutes', 'tokens_input', 'tokens_output', 'cost_usd']) assert.equal(none[metric], null, metric);
  assert.ok(none.notes.includes('no auto tasks'));
  assert.deepEqual(none.missing, ['minutes', 'tokens_input', 'tokens_output', 'cost_usd']);
  assert.equal(none.human_wait, true);
  assert.equal(none.confidence, 'none');
  assert.equal(none.weakest, null);

  const empty = est.estimateTrdText(CAL, '# nothing here\n');
  assert.equal(empty.minutes, null);
  assert.ok(empty.notes.includes('no auto tasks'));
  assert.equal(empty.human_wait, false);
  assert.equal(empty.wave, 1);

  const noCost = makeCalibration();
  for (const name of Object.keys(noCost.task_classes)) noCost.task_classes[name].cost_usd = { ...EMPTY_STAT };
  const trd = est.estimateTrdText(noCost, TRD_A);
  assert.equal(trd.cost_usd, null);
  assert.deepEqual(trd.missing, ['cost_usd']);
  nearPair(trd.minutes, 12, 36, 'minutes still present');
  assert.ok(trd.notes.includes('no samples for cost_usd'), trd.notes.join(' | '));
  assert.equal(trd.notes.filter((n) => /cost_usd/.test(n)).length, 1, 'one note for the TRD, not one per task');
  assert.equal(trd.confidence, 'high');
});

test('8b. task <files> elements that do not line up with the tasks are reported, not silently classed as other', (t) => {
  t.mock.method(ci, 'readTrdTasks', () => ({
    frontmatter: { type: 'standard' },
    tasks: [{ name: 'Task 1: x', type: 'auto', tdd: false, files: [] }],
    task_files_misaligned: true,
  }));
  const trd = est.estimateTrdText(CAL, 'ignored');
  assert.ok(trd.notes.some((n) => /files/.test(n) && /line up/.test(n)), trd.notes.join(' | '));
  assert.equal(trd.tasks[0].class, 'other');
});

test('9. overallConfidence: only components worth at least 10% of the median can lower it', () => {
  const big = { name: 'big', label: 'high', p50: 95 };
  const small = { name: 'small', label: 'low', p50: 5 };
  const unlowered = est.overallConfidence([big, small]);
  assert.equal(unlowered.confidence, 'high');
  assert.equal(unlowered.weakest, big, 'weakest is the chosen component object itself');

  const medium = { name: 'medium', label: 'medium', p50: 12 };
  const lowered = est.overallConfidence([{ name: 'big', label: 'high', p50: 88 }, medium]);
  assert.equal(lowered.confidence, 'medium');
  assert.equal(lowered.weakest, medium);

  const exactly = { name: 'exactly', label: 'low', p50: 10 };
  assert.equal(est.overallConfidence([{ name: 'big', label: 'high', p50: 90 }, exactly]).confidence, 'low', '10% counts');

  const zero = [{ name: 'a', label: 'high', p50: 0 }, { name: 'b', label: 'low', p50: 0 }];
  assert.equal(est.overallConfidence(zero).confidence, 'low', 'a zero total: the lowest label among all wins');
  const nulls = [{ name: 'a', label: 'high', p50: null }, { name: 'b', label: 'medium', p50: null }];
  const fromNulls = est.overallConfidence(nulls);
  assert.equal(fromNulls.confidence, 'medium', 'a null total: the lowest label among all wins');
  assert.equal(fromNulls.weakest, nulls[1]);

  const unknownShare = est.overallConfidence([{ name: 'a', label: 'high', p50: 50 }, { name: 'b', label: 'none', p50: null }]);
  assert.equal(unknownShare.confidence, 'none', 'a component with no estimate has an unknown share and still counts');

  const tied = est.overallConfidence([{ name: 'a', label: 'low', p50: 10 }, { name: 'b', label: 'low', p50: 30 }, { name: 'c', label: 'low', p50: 30 }]);
  assert.equal(tied.weakest.name, 'b', 'a tie goes to the larger share, then the earlier component');

  const na = est.overallConfidence([{ name: 'cp', label: 'n/a', p50: 0 }, { name: 'a', label: 'high', p50: 10 }]);
  assert.equal(na.confidence, 'high', 'n/a never lowers the result');
  assert.deepEqual(est.overallConfidence([]), { confidence: 'n/a', weakest: null });
  assert.deepEqual(est.overallConfidence([{ name: 'cp', label: 'n/a', p50: 0 }]), { confidence: 'n/a', weakest: null });
  assert.deepEqual(est.overallConfidence(undefined), { confidence: 'n/a', weakest: null });
});

test('10. estimateTrd finds a TRD by NN-MM or by path and says plainly when it is not there', (t) => {
  const root = makeEstimateProject({
    name: 'proj',
    objectives: [{
      dir: '80-alpha',
      trds: [{
        nn: '01',
        slug: 'parser',
        frontmatter: { type: 'standard', wave: 1, depends_on: [] },
        tasks: [
          { name: 'Task 1: parser', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] },
          { name: 'Task 2: lexer', tdd: true, files: ['lib/b.cjs'] },
        ],
        summary: null,
      }],
    }],
  });
  t.after(() => removeEstimateProject(root));

  const byKey = est.estimateTrd(CAL, root, '80-01');
  assert.equal(byKey.id, '80-01');
  nearPair(byKey.minutes, 12, 36, 'minutes');
  nearPair(byKey.cost_usd, 2.8, 4.4, 'cost_usd');
  nearPair(byKey.tokens_input, 7200000, 12800000, 'tokens_input');
  assert.equal(byKey.confidence, 'high');
  assert.equal(byKey.tasks.length, 2);
  assert.equal(byKey.wave, 1);
  assert.equal(byKey.path, path.join(root, '.planning', 'objectives', '80-alpha', '80-01-parser-TRD.md'));

  const absolute = est.estimateTrd(CAL, root, byKey.path);
  assert.equal(absolute.id, '80-01');
  nearPair(absolute.minutes, 12, 36, 'by absolute path');

  const relative = est.estimateTrd(CAL, root, '.planning/objectives/80-alpha/80-01-parser-TRD.md');
  assert.equal(relative.id, '80-01');
  assert.equal(relative.path, byKey.path);

  assert.throws(() => est.estimateTrd(CAL, root, '80-09'), /TRD 80-09 not found/);
  assert.throws(() => est.estimateTrd(CAL, root, '99-01'), /TRD 99-01 not found/);
  assert.throws(() => est.estimateTrd(CAL, root, '.planning/objectives/80-alpha/80-07-gone-TRD.md'), /not found/);
  assert.throws(() => est.estimateTrd(CAL, root, 'banana'), /NN-MM/);
});
