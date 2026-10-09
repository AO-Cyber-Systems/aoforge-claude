'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation).
// TRD 36-02 Task 2: the one-shot notices queue. Every file lives under an mkdtemp dir; nothing
// here reads or writes the real ~/.claude.
//
//  15. projectNoticesPath(root) = <root>/.aoforge/.aoforge-notices.json;
//      globalNoticesPath(home) = <home>/.claude/aoforge/.aoforge-notices.json;
//      globalNoticesPath() with no home throws.
//  16. appendNotice(file, {source:'upgrade', level:'info', message:'m'}, {now}) creates parent dirs
//      and a JSON file {schema:1, notices:[{id, ts, source, level, message, detail:null, key:null,
//      consumed:false}]}.
//  17. Same key unconsumed → replaced (one entry, new message/ts); same key after consumed → new entry.
//  18. takeUnconsumed([projFile, globalFile], {now}) returns notices from both files in ts order and
//      marks them consumed; a second call returns [].
//  19. Consumed notices older than 7 days are pruned on take; younger ones kept.
//  20. Missing file → []; malformed JSON → [] and the file is left untouched (no throw).
//  21. Atomic write: no *.tmp-* file remains after append.
//  22. renderNotices([...]) → starts with '## AOForge notices', one '- [level] message' line per
//      notice; a detail string is rendered indented under its line and capped at 40 lines with
//      '… (N more lines)'.
//  23. Invalid level (not info|warn|action) → throws on append.

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const notices = require('./notices.cjs');

// ─── Temp-dir bookkeeping ─────────────────────────────────────────────────────

const created = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-notices-'));
  created.push(dir);
  return dir;
}
after(() => { for (const dir of created) fs.rmSync(dir, { recursive: true, force: true }); });

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-09-01T12:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));

describe('notices paths', () => {
  test('15. project and global paths; global requires an explicit home', () => {
    assert.equal(notices.projectNoticesPath('/r'), path.join('/r', '.aoforge', '.aoforge-notices.json'));
    assert.equal(
      notices.globalNoticesPath('/h'),
      path.join('/h', '.claude', 'aoforge', '.aoforge-notices.json'),
    );
    assert.throws(() => notices.globalNoticesPath());
    assert.throws(() => notices.globalNoticesPath(''));
  });
});

describe('notices appendNotice()', () => {
  test('16. creates parent dirs and writes the schema-1 shape', () => {
    const root = tmpDir();
    const file = notices.projectNoticesPath(root);
    const ret = notices.appendNotice(file, { source: 'upgrade', level: 'info', message: 'm' }, { now: T0 });
    const data = readJson(file);
    assert.equal(data.schema, 1);
    assert.equal(data.notices.length, 1);
    const n = data.notices[0];
    assert.match(n.id, /^n-\d+-[0-9a-f]{6}$/);
    assert.equal(n.id.split('-')[1], String(T0.getTime()));
    assert.deepEqual({ ...n, id: undefined }, {
      id: undefined,
      ts: T0.toISOString(),
      source: 'upgrade',
      level: 'info',
      message: 'm',
      detail: null,
      key: null,
      consumed: false,
    });
    assert.deepEqual(ret, n);
    assert.deepEqual(notices.readNotices(file), data.notices);
  });

  test('17. an unconsumed notice with the same key is replaced; after consumption a new one is added', () => {
    const file = notices.projectNoticesPath(tmpDir());
    notices.appendNotice(file, { source: 'upgrade', level: 'info', message: 'first', key: 'k' }, { now: T0 });
    notices.appendNotice(file, { source: 'upgrade', level: 'info', message: 'other' }, { now: at(1000) });
    notices.appendNotice(file, { source: 'upgrade', level: 'warn', message: 'second', key: 'k' }, { now: at(2000) });
    let list = notices.readNotices(file);
    assert.equal(list.length, 2);
    const keyed = list.filter((n) => n.key === 'k');
    assert.equal(keyed.length, 1);
    assert.equal(keyed[0].message, 'second');
    assert.equal(keyed[0].level, 'warn');
    assert.equal(keyed[0].ts, at(2000).toISOString());

    notices.takeUnconsumed([file], { now: at(3000) });
    notices.appendNotice(file, { source: 'upgrade', level: 'info', message: 'third', key: 'k' }, { now: at(4000) });
    list = notices.readNotices(file);
    const keyedAfter = list.filter((n) => n.key === 'k');
    assert.equal(keyedAfter.length, 2);
    assert.deepEqual(keyedAfter.map((n) => [n.message, n.consumed]), [['second', true], ['third', false]]);
  });

  test('21. atomic write leaves no *.tmp-* file behind', () => {
    const root = tmpDir();
    const file = notices.projectNoticesPath(root);
    for (let i = 0; i < 3; i++) {
      notices.appendNotice(file, { source: 'upgrade', level: 'info', message: `m${i}` }, { now: at(i) });
    }
    const leftovers = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
    assert.equal(notices.readNotices(file).length, 3);
  });

  test('23. an invalid level throws and writes nothing', () => {
    const file = notices.projectNoticesPath(tmpDir());
    assert.throws(() => notices.appendNotice(file, { source: 'upgrade', level: 'error', message: 'm' }, { now: T0 }));
    assert.throws(() => notices.appendNotice(file, { source: 'upgrade', message: 'm' }, { now: T0 }));
    assert.equal(fs.existsSync(file), false);
    for (const level of ['info', 'warn', 'action']) {
      notices.appendNotice(file, { source: 'upgrade', level, message: level }, { now: T0 });
    }
    assert.equal(notices.readNotices(file).length, 3);
  });
});

describe('notices takeUnconsumed()', () => {
  test('18. returns notices from both files in ts order, exactly once', () => {
    const projFile = notices.projectNoticesPath(tmpDir());
    const globalFile = notices.globalNoticesPath(tmpDir());
    notices.appendNotice(projFile, { source: 'upgrade', level: 'info', message: 'p1' }, { now: at(1000) });
    notices.appendNotice(globalFile, { source: 'global-upgrade', level: 'warn', message: 'g1' }, { now: at(500) });
    notices.appendNotice(projFile, { source: 'upgrade-commit', level: 'action', message: 'p2' }, { now: at(3000) });
    notices.appendNotice(globalFile, { source: 'global-upgrade', level: 'info', message: 'g2' }, { now: at(2000) });

    const first = notices.takeUnconsumed([projFile, globalFile], { now: at(5000) });
    assert.deepEqual(first.map((n) => n.message), ['g1', 'p1', 'g2', 'p2']);
    assert.ok(notices.readNotices(projFile).every((n) => n.consumed === true));
    assert.ok(notices.readNotices(globalFile).every((n) => n.consumed === true));

    assert.deepEqual(notices.takeUnconsumed([projFile, globalFile], { now: at(6000) }), []);

    notices.appendNotice(projFile, { source: 'upgrade', level: 'info', message: 'p3' }, { now: at(7000) });
    assert.deepEqual(
      notices.takeUnconsumed([projFile, globalFile], { now: at(8000) }).map((n) => n.message),
      ['p3'],
    );
  });

  test('19. consumed notices older than 7 days are pruned; younger ones are kept', () => {
    const file = notices.projectNoticesPath(tmpDir());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = at(30 * DAY);
    const mk = (id, ageMs, consumed) => ({
      id, ts: new Date(now.getTime() - ageMs).toISOString(), source: 'upgrade', level: 'info',
      message: id, detail: null, key: null, consumed,
    });
    fs.writeFileSync(file, JSON.stringify({
      schema: 1,
      notices: [
        mk('old-consumed', 8 * DAY, true),
        mk('young-consumed', 1 * DAY, true),
        mk('fresh', 60 * 1000, false),
      ],
    }));

    const got = notices.takeUnconsumed([file], { now });
    assert.deepEqual(got.map((n) => n.id), ['fresh']);
    const ids = notices.readNotices(file).map((n) => n.id);
    assert.ok(!ids.includes('old-consumed'), 'old consumed notice pruned');
    assert.ok(ids.includes('young-consumed'), 'young consumed notice kept');
    assert.ok(ids.includes('fresh'));
  });

  test('20. missing file → []; malformed JSON → [] and the file is untouched', () => {
    const dir = tmpDir();
    const missing = path.join(dir, 'nope', '.aoforge-notices.json');
    assert.deepEqual(notices.readNotices(missing), []);
    assert.deepEqual(notices.takeUnconsumed([missing], { now: T0 }), []);
    assert.equal(fs.existsSync(missing), false);

    const bad = path.join(dir, '.aoforge-notices.json');
    const garbage = '{"schema":1, "notices": [ not json';
    fs.writeFileSync(bad, garbage);
    assert.deepEqual(notices.readNotices(bad), []);
    assert.deepEqual(notices.takeUnconsumed([bad, missing], { now: T0 }), []);
    assert.doesNotThrow(() => notices.appendNotice(bad, { source: 'upgrade', level: 'info', message: 'm' }, { now: T0 }));
    assert.equal(fs.readFileSync(bad, 'utf-8'), garbage);

    const wrongShape = path.join(dir, 'shape.json');
    fs.writeFileSync(wrongShape, '{"schema":1,"notices":"nope"}');
    assert.deepEqual(notices.takeUnconsumed([wrongShape], { now: T0 }), []);
    assert.equal(fs.readFileSync(wrongShape, 'utf-8'), '{"schema":1,"notices":"nope"}');
  });
});

describe('notices renderNotices()', () => {
  test('22. heading, one line per notice, indented detail capped at 40 lines', () => {
    const long = Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\n');
    const out = notices.renderNotices([
      { level: 'info', message: 'Project upgraded to 2.6.0', detail: null },
      { level: 'action', message: 'Review CLAUDE.md', detail: 'a\nb' },
      { level: 'warn', message: 'Long one', detail: long },
    ]);
    assert.ok(out.startsWith('## AOForge notices'));
    const lines = out.split('\n');
    assert.deepEqual(lines.filter((l) => l.startsWith('- ')), [
      '- [info] Project upgraded to 2.6.0',
      '- [action] Review CLAUDE.md',
      '- [warn] Long one',
    ]);
    const iAction = lines.indexOf('- [action] Review CLAUDE.md');
    assert.equal(lines[iAction + 1], '  a');
    assert.equal(lines[iAction + 2], '  b');

    const iLong = lines.indexOf('- [warn] Long one');
    const detailLines = lines.slice(iLong + 1).filter((l) => l.startsWith('  '));
    assert.equal(detailLines.length, 41);
    assert.equal(detailLines[0], '  line 1');
    assert.equal(detailLines[39], '  line 40');
    assert.equal(detailLines[40], '  … (5 more lines)');
    assert.ok(!out.includes('line 41'));
  });

  test('22b. an empty list renders as empty string', () => {
    assert.equal(notices.renderNotices([]), '');
  });
});
