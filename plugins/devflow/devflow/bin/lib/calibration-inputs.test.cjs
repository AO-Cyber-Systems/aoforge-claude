'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ci = require('./calibration-inputs.cjs');

const MODEL_FIELDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'];

const tmpDirs = [];
function tmpDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-calibration-inputs-')));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function writeRates(obj) {
  const file = path.join(tmpDir(), 'rates.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

const GOOD_ENTRY = {
  input: 1, output: 5, cache_read: 0.1, cache_write_5m: 1.25, cache_write_1h: 2,
  source: 'https://example.com/pricing', as_of: '2026-10-05',
};

describe('57-02 model rates', () => {
  test('10: the shipped file carries every field, an https source and a date on every model', () => {
    const rates = ci.loadRates();
    assert.equal(rates.ok, true);
    assert.equal(rates.currency, 'USD');
    assert.equal(rates.unit, 'per_million_tokens');
    assert.ok(Object.keys(rates.models).length >= 7);
    for (const [id, model] of Object.entries(rates.models)) {
      for (const field of MODEL_FIELDS) {
        assert.equal(typeof model[field], 'number', `${id}.${field} is a number`);
      }
      assert.match(model.source, /^https:\/\//, `${id}.source`);
      assert.match(model.as_of, /^\d{4}-\d{2}-\d{2}$/, `${id}.as_of`);
    }
    assert.match(rates.as_of, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ci.RATES_PATH, path.join(__dirname, '..', '..', 'references', 'model-rates.json'));
  });

  test('10: rateFor resolves the four current ids, a [1m] suffix and the short Haiku alias', () => {
    const rates = ci.loadRates();
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1']) {
      const rate = ci.rateFor(rates, id);
      assert.ok(rate, id);
      assert.equal(rate.id, id);
      for (const field of MODEL_FIELDS) assert.equal(typeof rate[field], 'number');
    }
    assert.deepEqual(ci.rateFor(rates, 'claude-opus-5-5'),
      { id: 'claude-opus-5-5', input: 4, output: 20, cache_read: 0.2, cache_write_5m: 5, cache_write_1h: 8 });
    assert.equal(ci.rateFor(rates, 'claude-opus-5[1m]').id, 'claude-opus-5');
    assert.equal(ci.rateFor(rates, 'claude-haiku-4-5').id, 'claude-haiku-4-5-20251001');
    // A different dated snapshot of the same model resolves through the date-stripped alias.
    assert.equal(ci.rateFor(rates, 'claude-haiku-4-5-20260101').id, 'claude-haiku-4-5-20251001');
  });

  test('10: rateFor returns null for <synthetic>, the empty string and an unknown id', () => {
    const rates = ci.loadRates();
    assert.equal(ci.rateFor(rates, '<synthetic>'), null);
    assert.equal(ci.rateFor(rates, ''), null);
    assert.equal(ci.rateFor(rates, undefined), null);
    assert.equal(ci.rateFor(rates, 'claude-unknown-9'), null);
    assert.equal(ci.rateFor({ ok: false, error: 'x' }, 'claude-opus-5-5'), null);
  });

  test('10: normalizeModelId trims, strips a trailing [..] and nulls synthetic or empty ids', () => {
    assert.equal(ci.normalizeModelId('  claude-opus-5[1m] '), 'claude-opus-5');
    assert.equal(ci.normalizeModelId('claude-opus-5-5'), 'claude-opus-5-5');
    assert.equal(ci.normalizeModelId('<synthetic>'), null);
    assert.equal(ci.normalizeModelId(''), null);
    assert.equal(ci.normalizeModelId(null), null);
  });

  test('11: a model missing its source is an error that names the model', () => {
    const { source, ...noSource } = GOOD_ENTRY;
    void source;
    const result = ci.loadRates(writeRates({
      currency: 'USD', unit: 'per_million_tokens',
      models: { 'claude-ok': GOOD_ENTRY, 'claude-no-source': noSource }, aliases: {},
    }));
    assert.equal(result.ok, false);
    assert.match(result.error, /claude-no-source/);
    assert.match(result.error, /source/);
  });

  test('11: a non-numeric rate, an http source and a malformed as_of are errors that name the model', () => {
    for (const [patch, field] of [
      [{ input: '4' }, /input/],
      [{ source: 'http://example.com' }, /source/],
      [{ as_of: 'yesterday' }, /as_of/],
    ]) {
      const result = ci.loadRates(writeRates({ models: { 'claude-bad': { ...GOOD_ENTRY, ...patch } }, aliases: {} }));
      assert.equal(result.ok, false);
      assert.match(result.error, /claude-bad/);
      assert.match(result.error, field);
    }
  });

  test('11: an alias pointing at a missing model is an error', () => {
    const result = ci.loadRates(writeRates({
      models: { 'claude-ok': GOOD_ENTRY }, aliases: { 'claude-short': 'claude-missing' },
    }));
    assert.equal(result.ok, false);
    assert.match(result.error, /claude-short/);
    assert.match(result.error, /claude-missing/);
  });

  test('11: a missing file and invalid JSON are {ok:false}, never a throw', () => {
    assert.equal(ci.loadRates(path.join(tmpDir(), 'absent.json')).ok, false);
    const file = path.join(tmpDir(), 'bad.json');
    fs.writeFileSync(file, '{ not json');
    assert.equal(ci.loadRates(file).ok, false);
  });

  test('11: as_of is the latest entry date', () => {
    const result = ci.loadRates(writeRates({
      models: { a: { ...GOOD_ENTRY, as_of: '2026-09-01' }, b: { ...GOOD_ENTRY, as_of: '2026-10-05' } }, aliases: {},
    }));
    assert.equal(result.ok, true);
    assert.equal(result.as_of, '2026-10-05');
  });
});

describe('57-02 parseDurationMinutes', () => {
  const cases = [
    ['8min', 8], ['3 min', 3], ['~45min', 45], ['about 50 min', 50], ['65 min', 65],
    ['1h 15m', 75], ['2h', 120], ['90s', 1.5], ['12.5min', 12.5], ['~1h', 60],
    ['  7min  ', 7], ['1h15m', 75], ['45m', 45],
  ];
  for (const [text, minutes] of cases) {
    test(`7: ${JSON.stringify(text)} is ${minutes} minutes`, () => {
      assert.equal(ci.parseDurationMinutes(text), minutes);
    });
  }

  const unknown = ['6', '360', 'one session', '3 sessions (resumed twice)', '', undefined, null, 8];
  for (const text of unknown) {
    test(`7: ${JSON.stringify(text)} has no unit, so it is null`, () => {
      assert.equal(ci.parseDurationMinutes(text), null);
    });
  }
});

describe('57-02 parseMetricsTable', () => {
  const ARCHIVE = [
    '# State Archive', '', '## Decisions', '', '| Objective 99 P99 | 1min | 1 tasks | 1 files |', '',
    '## Performance Metrics', '',
    '| Objective | Duration | Tasks | Files |', '|---|---|---|---|',
    '| Objective 09-roadmap-disk-reconciliation P09-01 | 6min | - tasks | - files |',
    '| Objective 08 P08-01 | 360 | 3 tasks | 13 files |',
    '| Objective 10 P10-04a | ~35min | 2 tasks | 3 files |',
    '| Objective 43 P06 | 65 min | 3 tasks | 10 files |',
    'not a row',
    '', '## Later', '', '| Objective 98 P98 | 2min | 1 tasks | 1 files |', '',
  ].join('\n');

  test('8: reads rows inside the Performance Metrics section only', () => {
    const rows = ci.parseMetricsTable(ARCHIVE);
    assert.deepEqual(rows, [
      { objective: '09-roadmap-disk-reconciliation', trdToken: '09-01', duration_raw: '6min', minutes: 6, tasks: null, files: null },
      { objective: '08', trdToken: '08-01', duration_raw: '360', minutes: null, tasks: 3, files: 13 },
      { objective: '10', trdToken: '10-04a', duration_raw: '~35min', minutes: 35, tasks: 2, files: 3 },
      { objective: '43', trdToken: '06', duration_raw: '65 min', minutes: 65, tasks: 3, files: 10 },
    ]);
  });

  test('8: no section, empty text and non-strings give an empty list', () => {
    assert.deepEqual(ci.parseMetricsTable('# Archive\n\nnothing\n'), []);
    assert.deepEqual(ci.parseMetricsTable(''), []);
    assert.deepEqual(ci.parseMetricsTable(undefined), []);
  });
});

describe('57-02 readTrdTasks', () => {
  const TRD = [
    '---', 'objective: 99-demo', 'trd: "01"', 'type: standard', 'autonomous: true', '---', '',
    '<tasks>', '',
    '<task type="auto" tdd="true">',
    '  <name>Task 1: parser</name>',
    '  <files>a/x.cjs, a/x.test.cjs</files>',
    '  <action>Write it.</action>',
    '</task>', '',
    '<task type="checkpoint:human-verify">',
    '  <name>Task 2: look</name>',
    '  <what-built>A thing.</what-built>',
    '</task>', '',
    '<task type="auto">',
    '  <name>Task 3: layout</name>',
    '  <files>',
    '    - `b/y.cjs` (new, 40 lines)',
    '    - b/z.md   <- CREATE',
    '    * "c/w.json", d/v.sh',
    '  </files>',
    '  <action>Do it.</action>',
    '</task>', '',
    '</tasks>', '',
  ].join('\n');

  test('8: per-task files are bare paths and tdd is the effective flag', () => {
    const out = ci.readTrdTasks(TRD);
    assert.equal(out.task_files_misaligned, false);
    assert.equal(out.frontmatter.type, 'standard');
    assert.deepEqual(out.tasks, [
      { name: 'Task 1: parser', type: 'auto', tdd: true, files: ['a/x.cjs', 'a/x.test.cjs'] },
      { name: 'Task 2: look', type: 'checkpoint:human-verify', tdd: false, files: [] },
      { name: 'Task 3: layout', type: 'auto', tdd: false, files: ['b/y.cjs', 'b/z.md', 'c/w.json', 'd/v.sh'] },
    ]);
  });

  // Shapes found in this repository's real TRDs: brace expansion and a parenthesised "no files" note.
  test('8: a brace list expands, and a parenthesised note with commas is not a file list', () => {
    const text = [
      '---', 'type: standard', '---',
      '<task type="auto"><name>Task 1: braces</name>',
      '<files>plugins/devflow/skills/{add-todo,health}/, README.md</files></task>',
      '<task type="auto"><name>Task 2: note</name>',
      '<files>(none; GitHub API reads only, plus `gh pr create --draft` under option A)</files></task>',
      '<task type="auto"><name>Task 3: note two</name>',
      '<files>(no files modified — this task only verifies)</files></task>',
      '<task type="auto"><name>Task 4: parens in a path</name>',
      '<files>src/app/(auth)/page.tsx (new, 12 lines)</files></task>',
    ].join('\n');
    assert.deepEqual(ci.readTrdTasks(text).tasks.map((t) => t.files), [
      ['plugins/devflow/skills/add-todo/', 'plugins/devflow/skills/health/', 'README.md'],
      [],
      [],
      ['src/app/(auth)/page.tsx'],
    ]);
  });

  test('8: a TRD of type tdd makes a task without the attribute effectively tdd', () => {
    const text = TRD.replace('type: standard', 'type: tdd');
    const out = ci.readTrdTasks(text);
    assert.deepEqual(out.tasks.map((t) => t.tdd), [true, true, true]);
    const optedOut = ci.readTrdTasks(text.replace('<task type="auto">', '<task type="auto" tdd="false">'));
    assert.deepEqual(optedOut.tasks.map((t) => t.tdd), [true, true, false]);
  });

  test('8: text with no tasks gives an empty list and a missing frontmatter gives {}', () => {
    const out = ci.readTrdTasks('# no frontmatter\n');
    assert.deepEqual(out.tasks, []);
    assert.deepEqual(out.frontmatter, {});
    assert.equal(out.task_files_misaligned, false);
  });

  test('8: a task without a files element keeps the files of the tasks after it aligned', () => {
    const text = [
      '---', 'type: standard', '---',
      '<task type="auto"><name>Task 1: a</name><files>a.cjs</files></task>',
      '<task type="auto"><name>Task 2: b</name></task>',
      '<task type="auto"><name>Task 3: c</name><files>c.cjs</files></task>',
    ].join('\n');
    const out = ci.readTrdTasks(text);
    assert.deepEqual(out.tasks.map((t) => t.files), [['a.cjs'], [], ['c.cjs']]);
  });
});

describe('57-02 classifyTask', () => {
  const T = (files, extra) => ({ files, tdd: false, type: 'auto', trdType: 'standard', ...extra });
  const table = [
    [T(['lib/x.cjs', 'lib/x.test.cjs'], { tdd: true }), 'code_tdd'],
    [T(['lib/x.cjs']), 'code'],
    [T(['hooks/gate.js']), 'code'],
    [T(['skills/build/SKILL.md']), 'prompt'],
    [T(['agents/executor.md', 'lib/y.cjs']), 'code'],
    [T(['workflows/a.md']), 'prompt'],
    [T(['plugins/devflow/devflow/references/r.md']), 'prompt'],
    [T(['docs/USER-GUIDE.md', 'CHANGELOG.md']), 'doc'],
    [T(['lib/x.test.cjs'], { tdd: true }), 'test_tdd'],
    [T(['lib/__fixtures__/f.cjs']), 'test'],
    [T(['pkg/x_test.go']), 'test'],
    [T(['src/App.tsx']), 'ui'],
    [T(['lib/screens/home.dart'], { trdType: 'ui' }), 'ui'],
    [T(['lib/screens/home.dart']), 'code'],
    [T(['db/migrations/001_init.sql']), 'schema'],
    [T(['package.json']), 'config'],
    [T(['Makefile']), 'config'],
    [T([]), 'other'],
    [T(['LICENSE']), 'other'],
    [T(['db/schema.sql', 'lib/x.cjs', 'src/App.tsx']), 'schema'],
    [T(['lib/x.cjs', 'src/App.tsx']), 'ui'],
    [T(['lib/x.cjs'], { type: 'checkpoint:decision' }), 'checkpoint'],
    [T(['lib/x.cjs'], { type: 'checkpoint:human-verify', tdd: true }), 'checkpoint'],
    [T(['docs/a.md'], { tdd: true }), 'doc_tdd'],
  ];
  for (const [task, expected] of table) {
    test(`9: ${JSON.stringify(task.files)} (${task.type}${task.tdd ? ', tdd' : ''}) is ${expected}`, () => {
      const result = ci.classifyTask(task);
      assert.equal(result, expected);
      assert.ok(ci.TASK_CLASSES.includes(result), `${result} is in TASK_CLASSES`);
    });
  }

  test('9: CLASSIFIER_VERSION is 1 and TASK_CLASSES is the sorted list of every class', () => {
    assert.equal(ci.CLASSIFIER_VERSION, 1);
    assert.deepEqual([...ci.TASK_CLASSES], [...ci.TASK_CLASSES].sort());
    assert.equal(new Set(ci.TASK_CLASSES).size, ci.TASK_CLASSES.length);
    assert.equal(ci.TASK_CLASSES.length, 17);
    assert.ok(ci.TASK_CLASSES.includes('checkpoint'));
  });

  test('9: missing fields classify as other instead of throwing', () => {
    assert.equal(ci.classifyTask({}), 'other');
    assert.equal(ci.classifyTask(), 'other');
  });
});

// ─── collectProject / discoverProjects ────────────────────────────────────────

const {
  makeCalibrationProject, removeCalibrationProject, cloneSpec, ALPHA_SPEC, FUTURE_SPEC, pastSpec,
} = require('./__fixtures__/calibration-fixtures.cjs');

const builtProjects = [];
function build(spec) {
  const root = makeCalibrationProject(spec);
  builtProjects.push(root);
  return root;
}
afterEach(() => {
  while (builtProjects.length) removeCalibrationProject(builtProjects.pop());
});

function recordOf(project, objectiveDir, trd) {
  const record = project.trds.find((t) => t.objective_dir === objectiveDir && t.trd === trd);
  assert.ok(record, `${objectiveDir}/${trd} is in the project`);
  return record;
}

describe('57-02 collectProject', () => {
  test('1: one record per TRD, sorted by objective directory then TRD number, joining TRD, SUMMARY and metric', () => {
    const root = build(ALPHA_SPEC);
    const project = ci.collectProject(root);
    assert.equal(project.root, root);
    assert.equal(project.label, 'alpha');
    assert.deepEqual(project.objectives, ['55-old', '56-new']);
    assert.deepEqual(project.trds.map((t) => `${t.objective_dir}/${t.trd}`),
      ['55-old/01', '55-old/02', '56-new/01', '56-new/02']);
    assert.deepEqual(project.trds.map((t) => t.id), ['55-01', '55-02', '56-01', '56-02']);

    const withTokens = recordOf(project, '56-new', '01');
    assert.equal(withTokens.trd_type, 'tdd');
    assert.equal(withTokens.summary.tokens_input, 140747);
    assert.equal(withTokens.summary.tokens_output, 1370);
    assert.equal(withTokens.summary.tokens_cache_read, 121144);
    assert.equal(withTokens.summary.tokens_cache_write, 19596);
    assert.equal(typeof withTokens.summary.tokens_input, 'number');
    assert.equal(withTokens.summary.token_model, 'claude-opus-5-5');
    assert.equal(withTokens.summary.completed, '2026-10-05');
    assert.equal(withTokens.summary.minutes, 8);
    assert.deepEqual(withTokens.metric, { duration_raw: '11min', minutes: 11, tasks: 3, files: 16 });
    assert.deepEqual(withTokens.tasks.map((t) => [t.name, t.tdd, t.files]), [
      ['Task 1: reader', true, ['lib/r.cjs', 'lib/r.test.cjs']],
      ['Task 2: stamp', true, ['lib/s.cjs']],
    ]);

    const plain = recordOf(project, '55-old', '01');
    assert.equal(plain.summary.tokens_input, null);
    assert.equal(plain.summary.token_model, null);
    assert.equal(plain.metric, null);
    assert.equal(plain.autonomous, true);

    const pending = recordOf(project, '56-new', '02');
    assert.equal(pending.summary, null);
    assert.equal(pending.tasks.length, 1);

    assert.deepEqual(project.counts,
      { summaries: 3, summaries_without_trd: 0, unkeyed: 0, task_files_misaligned: 0, duplicate_trds: 0 });
    assert.deepEqual(project.metrics, {
      rows: 3, joined: 3, ambiguous: 0, unparsed_trd: 0, unparsed_duration: 0, unmatched: 0, superseded: 0,
    });
  });

  test('1: the result does not depend on the order the fixture was written in, and a second read is deep-equal', () => {
    const shuffled = cloneSpec(ALPHA_SPEC);
    shuffled.objectives.reverse();
    for (const objective of shuffled.objectives) objective.trds.reverse();
    const a = ci.collectProject(build(ALPHA_SPEC));
    const b = ci.collectProject(build(shuffled));
    assert.deepEqual(b.trds, a.trds);
    assert.deepEqual(ci.collectProject(a.root), a);
  });

  test('2: a SUMMARY duration wins over the metric row, and one session falls back to it', () => {
    const wins = ci.collectProject(build(ALPHA_SPEC));
    const first = recordOf(wins, '55-old', '02');
    assert.equal(first.summary.minutes, 45);
    assert.equal(first.metric.minutes, 12);
    assert.equal(first.minutes, 45);
    assert.equal(first.duration_source, 'summary');
    const pending = recordOf(wins, '56-new', '02');
    assert.equal(pending.minutes, 7);
    assert.equal(pending.duration_source, 'metric');

    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives[0].trds[1].summary.duration = 'one session';
    const falls = recordOf(ci.collectProject(build(spec)), '55-old', '02');
    assert.equal(falls.summary.duration, 'one session');
    assert.equal(falls.summary.minutes, null);
    assert.equal(falls.minutes, 12);
    assert.equal(falls.duration_source, 'metric');
  });

  test('2: no parseable duration anywhere is minutes null and source null', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives[0].trds[1].summary.duration = '3 sessions (resumed twice)';
    spec.stateArchiveRows = [];
    const none = recordOf(ci.collectProject(build(spec)), '55-old', '02');
    assert.equal(none.minutes, null);
    assert.equal(none.duration_source, null);
  });

  test('3: metric rows join by number, by exact directory name; ambiguous numbers are counted, never guessed', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives.push({ dir: '10-a', trds: [] }, { dir: '10-b', trds: [] });
    spec.stateArchiveRows = [
      '| Objective 56 P01 | 11min | 3 tasks | 16 files |',
      '| Objective 55-old P55-01 | 30min | 2 tasks | 4 files |',
      '| Objective 10 P03 | 5min | 1 tasks | 1 files |',
      '| Objective 10-a P10-04a | 7min | 2 tasks | 3 files |',
      '| Objective 56 P02 | 360 | - tasks | - files |',
      '| Objective 56 P01 | 14min | 3 tasks | 16 files |',
      '| Objective 99 P01 | 3min | 1 tasks | 1 files |',
      '| Objective 56 P07 | 3min | 1 tasks | 1 files |',
    ];
    const project = ci.collectProject(build(spec));
    assert.deepEqual(project.metrics, {
      rows: 8, joined: 3, ambiguous: 1, unparsed_trd: 1, unparsed_duration: 1, unmatched: 2, superseded: 1,
    });
    assert.equal(project.trds.length, 4, 'the 10-* directories hold no TRD, so nothing joined there');
    assert.equal(recordOf(project, '56-new', '01').metric.minutes, 14, 'a repeated key takes the last row');
    assert.equal(recordOf(project, '55-old', '01').metric.minutes, 30);
    assert.equal(recordOf(project, '55-old', '01').minutes, 9, 'its SUMMARY still wins');
    assert.equal(recordOf(project, '55-old', '02').metric, null);
    const unparsedDuration = recordOf(project, '56-new', '02');
    assert.deepEqual(unparsedDuration.metric, { duration_raw: '360', minutes: null, tasks: null, files: null });
    assert.equal(unparsedDuration.minutes, null);
    assert.equal(unparsedDuration.duration_source, null);
  });

  test('3: every metric row lands in exactly one bucket', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives.push({ dir: '10-a', trds: [] }, { dir: '10-b', trds: [] });
    spec.stateArchiveRows = ALPHA_SPEC.stateArchiveRows.concat([
      '| Objective 10 P03 | 5min | 1 tasks | 1 files |', '| Objective 56 P01 | 14min | 3 tasks | 16 files |',
      '| Objective 77 P01 | 1min | 1 tasks | 1 files |', '| Objective 10-a P10-04a | 7min | 2 tasks | 3 files |',
    ]);
    const m = ci.collectProject(build(spec)).metrics;
    assert.equal(m.rows, m.joined + m.superseded + m.ambiguous + m.unparsed_trd + m.unmatched);
  });

  test('4: store mode reads state.json metrics_log like table rows, and a log row outranks an archive row', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    delete spec.stateArchiveRows;
    spec.stateJson = { metrics_log: [{ objective: '56', job: '02', duration: '7min', tasks: '2', files: '3' }] };
    const project = ci.collectProject(build(spec));
    assert.deepEqual(recordOf(project, '56-new', '02').metric, { duration_raw: '7min', minutes: 7, tasks: 2, files: 3 });
    assert.deepEqual(project.metrics, {
      rows: 1, joined: 1, ambiguous: 0, unparsed_trd: 0, unparsed_duration: 0, unmatched: 0, superseded: 0,
    });

    const both = cloneSpec(ALPHA_SPEC);
    both.stateJson = { metrics_log: [
      { objective: '56', job: '56-02', duration: '9min', tasks: null, files: null },
      { duration: '1min' },
    ] };
    const merged = ci.collectProject(build(both));
    assert.deepEqual(recordOf(merged, '56-new', '02').metric, { duration_raw: '9min', minutes: 9, tasks: null, files: null });
    assert.equal(merged.metrics.rows, 5);
    assert.equal(merged.metrics.superseded, 1);
    assert.equal(merged.metrics.unmatched, 1, 'a log entry without an objective matches nothing');
  });

  test('4: a malformed state.json is ignored', () => {
    const root = build(ALPHA_SPEC);
    fs.writeFileSync(path.join(root, '.planning', 'state.json'), '{ not json');
    assert.equal(ci.collectProject(root).metrics.rows, 3);
  });

  test('5: gap_closure and autonomous surface as booleans, defaulting to false and true', () => {
    const project = ci.collectProject(build(ALPHA_SPEC));
    const flagged = recordOf(project, '55-old', '02');
    assert.equal(flagged.gap_closure, true);
    assert.equal(flagged.autonomous, false);
    const absent = recordOf(project, '55-old', '01');
    assert.equal(absent.gap_closure, false);
    assert.equal(absent.autonomous, true);

    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives[0].trds[0].frontmatter = { type: 'standard', autonomous: 'true', gap_closure: 'false' };
    const explicit = recordOf(ci.collectProject(build(spec)), '55-old', '01');
    assert.equal(explicit.gap_closure, false);
    assert.equal(explicit.autonomous, true);
  });

  test('6: a SUMMARY whose TRD file is missing is counted and yields no record', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives[1].trds.push({ nn: '09', slug: 'gone', noTrd: true, summary: { duration: '3min', completed: '2026-10-05' } });
    const project = ci.collectProject(build(spec));
    assert.equal(project.counts.summaries_without_trd, 1);
    assert.equal(project.counts.summaries, 4);
    assert.equal(project.trds.length, 4);
    assert.equal(project.trds.some((t) => t.id === '56-09'), false);
  });

  test('6: a SUMMARY pairs with its TRD by key whichever name it was written under', () => {
    const spec = cloneSpec(ALPHA_SPEC);
    spec.objectives[0].trds[0].summaryName = '55-01-parser-SUMMARY.md';
    assert.equal(recordOf(ci.collectProject(build(spec)), '55-old', '01').summary.minutes, 9);
  });

  test('6: files without an NN-MM key are counted as unkeyed and skipped', () => {
    const root = build(ALPHA_SPEC);
    fs.writeFileSync(path.join(root, '.planning', 'objectives', '56-new', 'TRD.md'), '---\ntype: standard\n---\n');
    fs.writeFileSync(path.join(root, '.planning', 'objectives', '56-new', 'notes-SUMMARY.md'), '---\nduration: 1min\n---\n');
    const project = ci.collectProject(root);
    assert.equal(project.counts.unkeyed, 2);
    assert.equal(project.trds.length, 4);
  });

  test('6: two TRD files with one key keep the first sorted and count the other', () => {
    const root = build(ALPHA_SPEC);
    fs.writeFileSync(path.join(root, '.planning', 'objectives', '56-new', '56-01-zzz-TRD.md'), '---\ntype: standard\n---\n');
    const project = ci.collectProject(root);
    assert.equal(project.counts.duplicate_trds, 1);
    assert.equal(recordOf(project, '56-new', '01').trd_type, 'tdd');
  });

  test('1: a project with no planning history is empty, never an error', () => {
    const parent = tmpDir();
    const root = path.join(parent, 'bare');
    fs.mkdirSync(root);
    const project = ci.collectProject(root);
    assert.deepEqual(project.trds, []);
    assert.deepEqual(project.objectives, []);
    assert.equal(project.metrics.rows, 0);
    assert.equal(project.label, 'bare');
  });
});

describe('57-02 discoverProjects', () => {
  function layout() {
    const parent = tmpDir();
    for (const name of ['p2', 'p1', '.hidden']) fs.mkdirSync(path.join(parent, name, '.planning', 'objectives'), { recursive: true });
    fs.mkdirSync(path.join(parent, 'notes'));
    return { parent, p1: path.join(parent, 'p1'), p2: path.join(parent, 'p2') };
  }

  test('12: a path that is a project returns itself', () => {
    const { p1 } = layout();
    assert.deepEqual(ci.discoverProjects([p1]), [p1]);
  });

  test('12: a parent returns its non-hidden child projects, sorted, and skips plain directories', () => {
    const { parent, p1, p2 } = layout();
    assert.deepEqual(ci.discoverProjects([parent]), [p1, p2]);
  });

  test('12: the parent together with a child dedupes, and a missing path is skipped', () => {
    const { parent, p1, p2 } = layout();
    assert.deepEqual(ci.discoverProjects([p2, parent, p1]), [p1, p2]);
    assert.deepEqual(ci.discoverProjects([path.join(parent, 'absent'), p2]), [p2]);
    assert.deepEqual(ci.discoverProjects([]), []);
    assert.deepEqual(ci.discoverProjects([path.join(parent, 'notes')]), []);
  });

  test('12: a symlink to a project resolves to the same realpath and dedupes', () => {
    const { parent, p1, p2 } = layout();
    fs.symlinkSync(p1, path.join(parent, 'link'));
    assert.deepEqual(ci.discoverProjects([parent]), [p1, p2]);
  });
});

describe('64-08 recency window helpers', () => {
  // A hand-built project: only the fields the helpers read (objective_dir, minutes, summary).
  const trd = (dir, over = {}) => ({ objective_dir: dir, id: `${dir}/01`, minutes: null, summary: null, ...over });
  const withMinutes = (dir) => trd(dir, { minutes: 10 });
  const projectOf = (...trds) => ({ label: 'p', trds });

  test('9: objectiveNumber reads the numeric prefix, decimals included, else null', () => {
    assert.equal(ci.objectiveNumber('58-engine'), 58);
    assert.equal(ci.objectiveNumber('12.1-x'), 12.1);
    assert.equal(ci.objectiveNumber('foo'), null);
  });

  test('9: rankObjectives orders by number then name, a name with no number last, input untouched', () => {
    const ordered = ['9-a', '10-b', '10-c', '10.5-d', '11-e', 'foo'];
    assert.deepEqual(ci.rankObjectives(ordered), ordered);
    const shuffled = ['foo', '11-e', '10.5-d', '10-c', '9-a', '10-b'];
    assert.deepEqual(ci.rankObjectives(shuffled), ordered);
    assert.deepEqual(shuffled, ['foo', '11-e', '10.5-d', '10-c', '9-a', '10-b'], 'a new array, the input is not sorted in place');
  });

  test('9: hasOutcome is true for minutes, or for both token counts, and false for one count or none', () => {
    assert.equal(ci.hasOutcome(trd('1-a', { minutes: 12 })), true);
    assert.equal(ci.hasOutcome(trd('1-a', { minutes: 0 })), true, 'zero minutes is still an outcome');
    assert.equal(ci.hasOutcome(trd('1-a', { summary: { tokens_input: 100, tokens_output: 10 } })), true);
    assert.equal(ci.hasOutcome(trd('1-a', { summary: { tokens_input: 100, tokens_output: null } })), false);
    assert.equal(ci.hasOutcome(trd('1-a', { summary: { tokens_input: null, tokens_output: 10 } })), false);
    assert.equal(ci.hasOutcome(trd('1-a', { summary: { tokens_input: 100 } })), false);
    assert.equal(ci.hasOutcome(trd('1-a', { summary: { tokens_input: NaN, tokens_output: 10 } })), false);
    assert.equal(ci.hasOutcome(trd('1-a')), false);
  });

  test('9: windowObjectives keeps everything for null, "all" or a window at least the count of objectives with outcomes', () => {
    const project = projectOf(withMinutes('1-a'), trd('2-b'), withMinutes('3-c'), withMinutes('4-d'));
    const all = { kept: ['1-a', '2-b', '3-c', '4-d'], dropped: [], cutoff: null };
    assert.deepEqual(ci.windowObjectives(project, null), all);
    assert.deepEqual(ci.windowObjectives(project, 'all'), all);
    assert.deepEqual(ci.windowObjectives(project, 3), all, 'three objectives have outcomes, so a window of 3 drops nothing');
    assert.deepEqual(ci.windowObjectives(project, 99), all);
  });

  test('9: windowObjectives cuts at the window-th most recent objective with an outcome, empty ones before it included', () => {
    const project = projectOf(withMinutes('1-a'), trd('2-b'), withMinutes('3-c'), withMinutes('4-d'));
    assert.deepEqual(ci.windowObjectives(project, 2), { kept: ['3-c', '4-d'], dropped: ['1-a', '2-b'], cutoff: '3-c' });
    assert.deepEqual(ci.windowObjectives(project, 1), { kept: ['4-d'], dropped: ['1-a', '2-b', '3-c'], cutoff: '4-d' });
  });

  test('9: windowObjectives keeps an objective with no outcome that sits after the cutoff', () => {
    const project = projectOf(withMinutes('1-a'), withMinutes('2-b'), withMinutes('3-c'), trd('4-d'));
    assert.deepEqual(ci.windowObjectives(project, 2), { kept: ['2-b', '3-c', '4-d'], dropped: ['1-a'], cutoff: '2-b' });
  });

  test('9: windowObjectives ranks numerically, ties by name, and ignores the order of the TRD list', () => {
    const project = projectOf(withMinutes('11-c'), withMinutes('9-a'), withMinutes('10-z'), withMinutes('10-b'));
    assert.deepEqual(ci.windowObjectives(project, 2), { kept: ['10-z', '11-c'], dropped: ['9-a', '10-b'], cutoff: '10-z' });
  });

  test('9: windowObjectives of an empty project is empty', () => {
    assert.deepEqual(ci.windowObjectives(projectOf(), 3), { kept: [], dropped: [], cutoff: null });
  });

  test('9: windowObjectives does not modify the project', () => {
    const project = projectOf(withMinutes('3-c'), withMinutes('1-a'));
    const before = JSON.stringify(project);
    ci.windowObjectives(project, 1);
    assert.equal(JSON.stringify(project), before);
  });
});

describe('67-02 collection cutoff (through)', () => {
  const dirsOf = (names) => names.map((dir) => ({ dir, trds: [] }));

  test('1: through 66 keeps 64-66 and counts only their metric rows; without it all ten directories and rows stay', () => {
    const root = build(FUTURE_SPEC);
    const cut = ci.collectProject(root, { through: 66 });
    assert.deepEqual(cut.objectives, ['64-a', '65-b', '66-c']);
    assert.equal(cut.trds.length, 3);
    assert.equal(cut.metrics.rows, 3, 'the 67-72 archive rows and the state.json entry are not counted');
    const whole = ci.collectProject(root);
    assert.equal(whole.objectives.length, 10);
    assert.equal(whole.trds.length, 10);
    assert.equal(whole.metrics.rows, 10, 'nine archive rows and one state.json entry');
  });

  test('2: the cut happens before anything is read: a project with the future equals the project without it', () => {
    const cut = ci.collectProject(build(FUTURE_SPEC), { through: 66 });
    const past = ci.collectProject(build(pastSpec()), { through: 66 });
    assert.equal(cut.label, 'future');
    assert.equal(past.label, 'future');
    assert.deepEqual(cut.objectives, past.objectives);
    assert.deepEqual(cut.trds, past.trds);
    assert.deepEqual(cut.metrics, past.metrics);
    assert.deepEqual(cut.counts, past.counts, 'the summaries and unkeyed counts of the dropped directories are not counted either');
    assert.equal(cut.label, past.label);
  });

  test('3: a decimal number above through and a directory with no number are dropped; without through all are kept', () => {
    const root = build({ name: 'decimals', objectives: dirsOf(['12-a', '12.1-b', '13-c', 'misc']) });
    assert.deepEqual(ci.collectProject(root, { through: 12 }).objectives, ['12-a']);
    assert.deepEqual(ci.collectProject(root, { through: 12.1 }).objectives, ['12-a', '12.1-b']);
    assert.deepEqual(ci.collectProject(root).objectives, ['12-a', '12.1-b', '13-c', 'misc']);
    assert.deepEqual(ci.collectProject(root, {}).objectives, ['12-a', '12.1-b', '13-c', 'misc']);
    assert.deepEqual(ci.collectProject(root, { through: null }).objectives, ['12-a', '12.1-b', '13-c', 'misc']);
  });

  test('4: through 0 keeps a 0-x directory and drops 1-y', () => {
    const root = build({ name: 'zero', objectives: dirsOf(['0-x', '1-y']) });
    assert.deepEqual(ci.collectProject(root, { through: 0 }).objectives, ['0-x']);
  });

  test('5: assertThrough rejects negatives, NaN, Infinity and non-numbers; accepts null, undefined and finite numbers', () => {
    for (const bad of [-1, NaN, Infinity, '66', true]) {
      assert.throws(() => ci.assertThrough(bad), /through must be a non-negative number or null/, String(bad));
    }
    for (const good of [null, undefined, 0, 66, 12.5]) {
      assert.doesNotThrow(() => ci.assertThrough(good), String(good));
    }
    assert.throws(() => ci.collectProject(build({ name: 'bad', objectives: [] }), { through: -1 }),
      /through must be a non-negative number or null/, 'collectProject validates before reading');
  });

  test('5: withinThrough takes a directory name or a metric-row token, and a name with no number is out under a cutoff', () => {
    assert.equal(ci.withinThrough('66-c', 66), true);
    assert.equal(ci.withinThrough('68', 66), false);
    assert.equal(ci.withinThrough('66', 66), true);
    assert.equal(ci.withinThrough('12.1-b', 12), false);
    assert.equal(ci.withinThrough('notes-x', 66), false);
    assert.equal(ci.withinThrough('notes-x', null), true);
    assert.equal(ci.withinThrough('notes-x', undefined), true);
  });
});
