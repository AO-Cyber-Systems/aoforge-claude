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
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./estimate-run-store.cjs');

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
