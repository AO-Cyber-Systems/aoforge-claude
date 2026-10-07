'use strict';

/**
 * estimate-run-store.test.cjs — objective 58, TRD 58-04 (EST-05)
 *
 * The cached estimate run state that the status line reads. The file lives outside the
 * repository, so every test injects a state dir (and, where it matters, a home) under
 * os.tmpdir(); nothing here touches the real ~/.claude. `now` is injected as epoch ms.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./estimate-run-store.cjs');
const {
  OBJECTIVE_63_SHA256,
  objective63Run,
  finishedRun,
  liveRun,
} = require('./__fixtures__/estimate-run-fixtures.cjs');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** The schema example from the TRD objective: wave 1 done, wave 2 running, wave 3 pending. */
function schemaExample() {
  return {
    version: 1,
    objective: '58',
    started_at: '2026-10-05T18:00:00.000Z',
    updated_at: '2026-10-05T18:15:00.000Z',
    finished_at: null,
    estimate: {
      line: 'Objective 58 estimate: ...',
      wall_minutes: { p50: 70, p90: 145 },
      confidence: 'medium',
    },
    waves: [
      {
        wave: 1,
        trds: ['58-01', '58-02'],
        p50: 12,
        p90: 36,
        started_at: '2026-10-05T18:00:00.000Z',
        finished_at: '2026-10-05T18:14:00.000Z',
        actual_minutes: 14,
      },
      {
        wave: 2,
        trds: ['58-03'],
        p50: 20,
        p90: 50,
        started_at: '2026-10-05T18:15:00.000Z',
        finished_at: null,
        actual_minutes: null,
      },
      {
        wave: 3,
        trds: ['58-04'],
        p50: 8,
        p90: 20,
        started_at: null,
        finished_at: null,
        actual_minutes: null,
      },
    ],
  };
}

const T_1825 = Date.parse('2026-10-05T18:25:00.000Z');
const T_1920 = Date.parse('2026-10-05T19:20:00.000Z');

let root; // a fake project root
let stateDir; // the state dir, outside the project
let opts;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ers-root-'));
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ers-state-'));
  opts = { env: { DEVFLOW_ESTIMATE_STATE_DIR: stateDir } };
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe('7. writeRunState / readRunState / clearRunState', () => {
  test('7a. round-trips, the file is <stateDir>/<repoKey>.json and outside the project', () => {
    const state = schemaExample();
    const { path: written } = store.writeRunState(root, state, opts);
    assert.equal(path.dirname(written), stateDir);
    assert.ok(written.endsWith('.json'), written);
    assert.equal(written, store.statePath(root, opts));
    const rel = path.relative(fs.realpathSync(root), path.resolve(written));
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), 'state file must not sit under the project root');
    assert.deepEqual(store.readRunState(root, opts), state);
  });

  test('7b. leaves no .tmp file behind', () => {
    store.writeRunState(root, schemaExample(), opts);
    store.writeRunState(root, schemaExample(), opts);
    const leftovers = fs.readdirSync(stateDir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  test('7c. creates the state dir when it does not exist yet', () => {
    const nested = path.join(stateDir, 'a', 'b');
    const o = { env: { DEVFLOW_ESTIMATE_STATE_DIR: nested } };
    store.writeRunState(root, schemaExample(), o);
    assert.ok(fs.existsSync(store.statePath(root, o)));
  });

  test('7d. clearRunState removes the file, and is quiet when there is none', () => {
    store.writeRunState(root, schemaExample(), opts);
    store.clearRunState(root, opts);
    assert.equal(fs.existsSync(store.statePath(root, opts)), false);
    assert.doesNotThrow(() => store.clearRunState(root, opts));
    assert.equal(store.readRunState(root, opts), null);
  });

  test('7e. two projects never share a file', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ers-other-'));
    try {
      assert.notEqual(store.statePath(root, opts), store.statePath(other, opts));
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('8. readRunState never throws and gives null for anything unusable', () => {
  function writeRaw(text) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(store.statePath(root, opts), text);
  }

  test('8a. missing file', () => {
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8b. malformed JSON', () => {
    writeRaw('{"version": 1, "objective": "58", "wav');
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8c. an empty file', () => {
    writeRaw('');
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8d. version 2', () => {
    writeRaw(JSON.stringify({ ...schemaExample(), version: 2 }));
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8e. no objective, an empty objective, or a non-string objective', () => {
    const { objective, ...noObjective } = schemaExample();
    writeRaw(JSON.stringify(noObjective));
    assert.equal(store.readRunState(root, opts), null);
    writeRaw(JSON.stringify({ ...schemaExample(), objective: '' }));
    assert.equal(store.readRunState(root, opts), null);
    writeRaw(JSON.stringify({ ...schemaExample(), objective: 58 }));
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8f. no waves, or waves that is not an array', () => {
    const { waves, ...noWaves } = schemaExample();
    writeRaw(JSON.stringify(noWaves));
    assert.equal(store.readRunState(root, opts), null);
    writeRaw(JSON.stringify({ ...schemaExample(), waves: {} }));
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8g. JSON that is not an object', () => {
    writeRaw('null');
    assert.equal(store.readRunState(root, opts), null);
    writeRaw('[1,2]');
    assert.equal(store.readRunState(root, opts), null);
    writeRaw('"text"');
    assert.equal(store.readRunState(root, opts), null);
  });

  test('8h. an unreadable path (a directory where the file should be)', () => {
    fs.mkdirSync(store.statePath(root, opts), { recursive: true });
    assert.equal(store.readRunState(root, opts), null);
  });
});

describe('9. remainingMinutes', () => {
  test('9a. schema example at 18:25Z: wave 2 has 10 of 20 left, plus wave 3', () => {
    assert.deepEqual(store.remainingMinutes(schemaExample(), T_1825), {
      minutes: 18,
      wave: 2,
      waves: 3,
      done: 1,
      over: false,
    });
  });

  test('9b. at 19:20Z wave 2 has run 65 > P90 50: floored at 0, flagged over', () => {
    const r = store.remainingMinutes(schemaExample(), T_1920);
    assert.equal(r.minutes, 8);
    assert.equal(r.wave, 2);
    assert.equal(r.over, true);
  });

  test('9c. rounds up, so a live wave never reads 0 while time remains', () => {
    const state = schemaExample();
    state.waves[2].p50 = 0;
    // wave 2 started 18:15:00; at 18:34:30 it has 0.5 minutes left
    const r = store.remainingMinutes(state, Date.parse('2026-10-05T18:34:30.000Z'));
    assert.equal(r.minutes, 1);
  });

  test('9d. a wave that has not started counts its full p50 and is never over', () => {
    const state = schemaExample();
    state.waves[1].started_at = null;
    const r = store.remainingMinutes(state, T_1825);
    assert.equal(r.minutes, 28);
    assert.equal(r.over, false);
  });

  test('9e. waves given out of order are sorted by wave number', () => {
    const state = schemaExample();
    state.waves.reverse();
    assert.deepEqual(store.remainingMinutes(state, T_1825), {
      minutes: 18,
      wave: 2,
      waves: 3,
      done: 1,
      over: false,
    });
  });

  test('9f. a null p90 is never "over"', () => {
    const state = schemaExample();
    state.waves[1].p90 = null;
    assert.equal(store.remainingMinutes(state, T_1920).over, false);
  });
});

describe('10. remainingMinutes is null when the run is not live', () => {
  test('10a. finished_at set', () => {
    const state = { ...schemaExample(), finished_at: '2026-10-05T18:20:00.000Z' };
    assert.equal(store.remainingMinutes(state, T_1825), null);
  });

  test('10b. updated_at more than STALE_MS (12 h) before now', () => {
    assert.equal(store.STALE_MS, 12 * HOUR);
    const updated = Date.parse('2026-10-05T18:15:00.000Z');
    assert.equal(store.remainingMinutes(schemaExample(), updated + 12 * HOUR + 1), null);
    assert.notEqual(store.remainingMinutes(schemaExample(), updated + 12 * HOUR), null);
  });

  test('10c. an unparsable updated_at', () => {
    const state = { ...schemaExample(), updated_at: 'yesterday-ish' };
    assert.equal(store.remainingMinutes(state, T_1825), null);
    assert.equal(store.remainingMinutes({ ...schemaExample(), updated_at: null }, T_1825), null);
  });

  test('10d. a null or empty state', () => {
    assert.equal(store.remainingMinutes(null, T_1825), null);
    assert.equal(store.remainingMinutes(undefined, T_1825), null);
    assert.equal(store.remainingMinutes({}, T_1825), null);
  });

  test('10e. all waves finished gives zero minutes and no current wave', () => {
    const state = schemaExample();
    state.waves[1].finished_at = '2026-10-05T18:30:00.000Z';
    state.waves[2].finished_at = '2026-10-05T18:40:00.000Z';
    state.updated_at = '2026-10-05T18:40:00.000Z';
    assert.deepEqual(store.remainingMinutes(state, Date.parse('2026-10-05T18:41:00.000Z')), {
      minutes: 0,
      wave: null,
      waves: 3,
      done: 3,
      over: false,
    });
  });
});

describe('11. a missing estimate', () => {
  test('11a. a null p50 on an unfinished wave gives minutes: null', () => {
    const state = schemaExample();
    state.waves[2].p50 = null;
    const r = store.remainingMinutes(state, T_1825);
    assert.equal(r.minutes, null);
    assert.equal(r.wave, 2);
    assert.equal(r.waves, 3);
  });

  test('11b. a null p50 on the wave in progress gives minutes: null', () => {
    const state = schemaExample();
    state.waves[1].p50 = null;
    assert.equal(store.remainingMinutes(state, T_1825).minutes, null);
  });

  test('11c. a null p50 on a FINISHED wave does not matter', () => {
    const state = schemaExample();
    state.waves[0].p50 = null;
    assert.equal(store.remainingMinutes(state, T_1825).minutes, 18);
  });
});

describe('12. formatStatusSegment', () => {
  test('12a. normal: ⏱ 58 W2/3 ~18m left', () => {
    assert.equal(store.formatStatusSegment(schemaExample(), T_1825), '⏱ 58 W2/3 ~18m left');
  });

  test('12b. over P90', () => {
    assert.equal(store.formatStatusSegment(schemaExample(), T_1920), '⏱ 58 W2/3 over P90');
  });

  test('12c. 60 minutes or more reads as hours and two-digit minutes', () => {
    const state = schemaExample();
    state.waves[2].p50 = 75 - 10; // wave 2 has 10 left at 18:25, so 75 in total
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W2/3 ~1h 15m left');
    state.waves[2].p50 = 125 - 10 + 0; // 125 -> 2h 05m
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W2/3 ~2h 05m left');
    state.waves[2].p50 = 60 - 10; // exactly 60 -> 1h 00m
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W2/3 ~1h 00m left');
    state.waves[2].p50 = 59 - 10; // 59 stays in minutes
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W2/3 ~59m left');
  });

  test('12d. no estimate: no time', () => {
    const state = schemaExample();
    state.waves[2].p50 = null;
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W2/3');
  });

  test('12e. empty string when finished, stale, all waves done, or no state', () => {
    assert.equal(
      store.formatStatusSegment({ ...schemaExample(), finished_at: '2026-10-05T18:20:00.000Z' }, T_1825),
      ''
    );
    assert.equal(store.formatStatusSegment(schemaExample(), T_1825 + 13 * HOUR), '');
    const done = schemaExample();
    done.waves[1].finished_at = '2026-10-05T18:30:00.000Z';
    done.waves[2].finished_at = '2026-10-05T18:40:00.000Z';
    done.updated_at = '2026-10-05T18:40:00.000Z';
    assert.equal(store.formatStatusSegment(done, Date.parse('2026-10-05T18:41:00.000Z')), '');
    assert.equal(store.formatStatusSegment(null, T_1825), '');
    assert.equal(store.formatStatusSegment(undefined, T_1825), '');
  });

  test('12f. a resumed run holding only waves 6 and 7 shows W6/7', () => {
    const state = schemaExample();
    state.waves = [
      { wave: 6, trds: ['58-06'], p50: 20, p90: 50, started_at: '2026-10-05T18:15:00.000Z', finished_at: null, actual_minutes: null },
      { wave: 7, trds: ['58-07'], p50: 8, p90: 20, started_at: null, finished_at: null, actual_minutes: null },
    ];
    assert.equal(store.formatStatusSegment(state, T_1825), '⏱ 58 W6/7 ~18m left');
  });

  test('12g. the segment is plain text, no ANSI', () => {
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(store.formatStatusSegment(schemaExample(), T_1825), /\x1b/);
  });
});

describe('13. findProjectRoot and stateRoot', () => {
  test('13a. findProjectRoot walks up to the directory that holds .planning', () => {
    fs.mkdirSync(path.join(root, '.planning'));
    const deep = path.join(root, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(store.findProjectRoot(deep), root);
    assert.equal(store.findProjectRoot(root), root);
  });

  test('13b. no .planning anywhere above gives null', () => {
    assert.equal(store.findProjectRoot(root), null);
  });

  test('13c. the walk is capped at 8 levels above the start', () => {
    fs.mkdirSync(path.join(root, '.planning'));
    const eight = path.join(root, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    const nine = path.join(eight, 'i');
    fs.mkdirSync(nine, { recursive: true });
    assert.equal(store.findProjectRoot(eight), root);
    assert.equal(store.findProjectRoot(nine), null);
    assert.equal(store.findProjectRoot(nine, 9), root);
  });

  test('13d. a .planning FILE does not make a project root', () => {
    fs.writeFileSync(path.join(root, '.planning'), 'not a directory');
    assert.equal(store.findProjectRoot(root), null);
  });

  test('13e. findProjectRoot fails soft on junk input', () => {
    assert.equal(store.findProjectRoot(undefined), null);
    assert.equal(store.findProjectRoot(''), null);
    assert.equal(store.findProjectRoot(path.join(root, 'does', 'not', 'exist')), null);
  });

  test('13f. stateRoot honours DEVFLOW_ESTIMATE_STATE_DIR, else <home>/.claude/devflow/state/estimates', () => {
    assert.equal(store.stateRoot({ DEVFLOW_ESTIMATE_STATE_DIR: '/x' }), '/x');
    assert.equal(store.stateRoot({}, '/h'), path.join('/h', '.claude', 'devflow', 'state', 'estimates'));
    assert.equal(
      store.stateRoot({ DEVFLOW_ESTIMATE_STATE_DIR: '' }, '/h'),
      path.join('/h', '.claude', 'devflow', 'state', 'estimates')
    );
  });

  test('13g. statePath falls back to the sanitized directory name for a path that cannot be resolved', () => {
    const ghost = path.join(root, 'no such dir!');
    const p = store.statePath(ghost, opts);
    assert.equal(path.dirname(p), stateDir);
    assert.equal(path.basename(p), 'no_such_dir_.json');
  });
});

describe('14. run history paths (TRD 64-02, EST-08)', () => {
  test('14a. historyDir is <stateRoot>/history/<repoKey>, outside the project', () => {
    const dir = store.historyDir(root, opts);
    assert.equal(dir, path.join(stateDir, 'history', path.basename(store.statePath(root, opts), '.json')));
    const rel = path.relative(fs.realpathSync(root), path.resolve(dir));
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), 'history must not sit under the project root');
  });

  test('14b. historyDir follows an injected home when there is no state-dir override', () => {
    const dir = store.historyDir(root, { env: {}, home: '/h' });
    assert.equal(path.dirname(dir), path.join('/h', '.claude', 'devflow', 'state', 'estimates', 'history'));
  });

  test("14c. historyPath for Objective 63's real run is 63-2026-10-06T23_55_36_062Z.json", () => {
    const file = store.historyPath(root, objective63Run(), opts);
    assert.equal(path.dirname(file), store.historyDir(root, opts));
    assert.equal(path.basename(file), '63-2026-10-06T23_55_36_062Z.json');
  });

  test('14d. a hostile objective or started_at cannot leave the history directory', () => {
    for (const hostile of ['../x', '../../etc/passwd', 'a/b', '..']) {
      const file = store.historyPath(root, finishedRun({ objective: hostile, started_at: hostile }), opts);
      assert.equal(path.dirname(file), store.historyDir(root, opts), hostile);
      assert.match(path.basename(file), /^[A-Za-z0-9_-]+\.json$/, hostile);
    }
  });
});

describe('15. archiveRunState', () => {
  test('15a. writes JSON.stringify(state, null, 2) + newline atomically and reports written', () => {
    const state = finishedRun({ objective: '80' });
    const res = store.archiveRunState(root, state, opts);
    assert.deepEqual(res, { path: store.historyPath(root, state, opts), written: true });
    assert.equal(fs.readFileSync(res.path, 'utf8'), `${JSON.stringify(state, null, 2)}\n`);
    assert.deepEqual(
      fs.readdirSync(store.historyDir(root, opts)).filter((f) => f.endsWith('.tmp')),
      []
    );
  });

  test('15b. a second call with the same state does not rewrite the file', () => {
    const state = finishedRun();
    const first = store.archiveRunState(root, state, opts);
    const old = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(first.path, old, old);
    const second = store.archiveRunState(root, JSON.parse(JSON.stringify(state)), opts);
    assert.deepEqual(second, { path: first.path, written: false });
    assert.equal(fs.statSync(first.path).mtimeMs, old.getTime());
  });

  test('15c. a different finished state under the same name is replaced', () => {
    const state = finishedRun();
    const first = store.archiveRunState(root, state, opts);
    const later = { ...state, updated_at: '2026-10-01T11:00:00.000Z', finished_at: '2026-10-01T11:00:00.000Z' };
    const second = store.archiveRunState(root, later, opts);
    assert.deepEqual(second, { path: first.path, written: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(first.path, 'utf8')), later);
  });

  test('15d. an unfinished state is not archived and nothing is created', () => {
    const res = store.archiveRunState(root, liveRun(), opts);
    assert.deepEqual(res, { path: null, written: false, reason: 'not finished' });
    assert.equal(fs.existsSync(store.historyDir(root, opts)), false);
  });

  test('15e. a value that is not a run state is refused with a reason', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, { ...finishedRun(), version: 2 }, { ...finishedRun(), waves: 'no' }]) {
      assert.deepEqual(store.archiveRunState(root, bad, opts), {
        path: null,
        written: false,
        reason: 'not a run state',
      });
    }
    assert.equal(fs.existsSync(store.historyDir(root, opts)), false);
  });

  test('15f. a filesystem error removes the temp file and throws', () => {
    const state = finishedRun();
    const dir = store.historyDir(root, opts);
    fs.mkdirSync(dir, { recursive: true });
    // a directory where the archive file belongs: the rename fails, the .tmp must not stay
    fs.mkdirSync(store.historyPath(root, state, opts));
    assert.throws(() => store.archiveRunState(root, state, opts));
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  });

  test("15g. archiving Objective 63's run reproduces the planner's copy byte for byte", () => {
    const res = store.archiveRunState(root, objective63Run(), opts);
    assert.equal(res.written, true);
    assert.equal(path.basename(res.path), '63-2026-10-06T23_55_36_062Z.json');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(res.path)).digest('hex');
    assert.equal(sha, OBJECTIVE_63_SHA256);
    assert.equal(sha, '08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee');
  });
});

describe('16. listRunHistory', () => {
  function writeHistoryRaw(name, text) {
    const dir = store.historyDir(root, opts);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }

  test('16a. a missing history directory gives []', () => {
    assert.deepEqual(store.listRunHistory(root, opts), []);
  });

  test('16b. valid states come back sorted by started_at, whatever the archive order', () => {
    const b = finishedRun({ objective: '82', started_at: '2026-10-03T10:00:00.000Z' });
    const a = finishedRun({ objective: '80', started_at: '2026-10-01T10:00:00.000Z' });
    const c = finishedRun({ objective: '81', started_at: '2026-10-02T10:00:00.000Z' });
    for (const s of [b, a, c]) store.archiveRunState(root, s, opts);
    assert.deepEqual(store.listRunHistory(root, opts), [a, c, b]);
  });

  test('16c. a malformed file, a version 2 file, a non-run JSON file and a .tmp file are skipped', () => {
    const good = finishedRun();
    store.archiveRunState(root, good, opts);
    writeHistoryRaw('bad-json.json', '{not json');
    writeHistoryRaw('empty.json', '');
    writeHistoryRaw('v2.json', JSON.stringify({ ...finishedRun({ objective: '90' }), version: 2 }));
    writeHistoryRaw('array.json', '[]');
    writeHistoryRaw('stranded.json.tmp', JSON.stringify(finishedRun({ objective: '91' })));
    writeHistoryRaw('notes.txt', JSON.stringify(finishedRun({ objective: '92' })));
    assert.deepEqual(store.listRunHistory(root, opts), [good]);
  });

  test('16d. a directory named like an archive is skipped, and nothing throws', () => {
    store.archiveRunState(root, finishedRun(), opts);
    fs.mkdirSync(path.join(store.historyDir(root, opts), 'sub.json'));
    assert.equal(store.listRunHistory(root, opts).length, 1);
  });

  test('16e. history is per project: another project sees none of it', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ers-other-'));
    try {
      store.archiveRunState(root, finishedRun(), opts);
      assert.deepEqual(store.listRunHistory(other, opts), []);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  test('16f. an unreadable path (the history directory is a file) gives []', () => {
    fs.mkdirSync(path.dirname(store.historyDir(root, opts)), { recursive: true });
    fs.writeFileSync(store.historyDir(root, opts), 'not a directory');
    assert.deepEqual(store.listRunHistory(root, opts), []);
  });
});

describe('module hygiene', () => {
  test('requires only node builtins and ./upgrade.cjs', () => {
    const src = fs.readFileSync(path.join(__dirname, 'estimate-run-store.cjs'), 'utf8');
    const required = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    const allowed = new Set(['fs', 'os', 'path', './upgrade.cjs']);
    for (const r of required) assert.ok(allowed.has(r), `unexpected require: ${r}`);
  });

  test('does not call os.homedir() at module load', () => {
    const src = fs.readFileSync(path.join(__dirname, 'estimate-run-store.cjs'), 'utf8');
    const topLevel = src.split('\n').filter((l) => /^[^\s/*]/.test(l) && /os\.homedir\(\)/.test(l));
    assert.deepEqual(topLevel, []);
  });
});
