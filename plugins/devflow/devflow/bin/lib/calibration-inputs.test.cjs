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
