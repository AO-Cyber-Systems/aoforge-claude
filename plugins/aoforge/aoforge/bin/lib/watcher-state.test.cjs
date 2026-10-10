/**
 * Tests for watcher-state library.
 *
 * Behaviour list (TRD 01-01):
 *   1. pidFilePath() honours $HOME
 *   2. writePidFile creates parent dir + writes JSON
 *   3. readPidFile parses JSON or returns null
 *   4. removePidFile is idempotent
 *   5. isWatcherLive: false when PID file absent
 *   6. isWatcherLive: false when process is dead
 *   7. isWatcherLive: true when process is alive
 *   8. isWatcherLive: false on malformed PID file
 *   9. makeDoneRecord shape
 *  10. markConsumed flips consumed: true
 *  11. listUnconsumed sorts and filters
 *
 * The pid file in the watch state directory (TRD 73-12):
 *   7. pidFilePath() is compat.watchStateDir(home)/aoforge-watch.pid; the override
 *      AOFORGE_HANDOFF_PID_FILE wins and no fallback is read
 *   8. writePidFile creates the watch directory and never <home>/.aoforge
 *   9. a 3.0.0 pid file (<home>/.aoforge/aoforge-watch.pid) alone is read as the
 *      same AOForge daemon (no `legacy` key); add/remove rewrite that file
 *  10. the new file wins over the 3.0.0 one
 *  11. removePidFile removes the new and the 3.0.0 file, never the pre-rename one
 *  12. a pre-rename pid file alone is `legacy: true`; add/remove refuse it
 *  13. WATCH_DIR_SEGMENTS spells compat.watchStateDir
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const lib = require('./watcher-state.cjs');
const { watchStateDir } = require('./compat.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-home-'));
  const prevHome = process.env.HOME;
  process.env.HOME = dir;
  return {
    dir,
    cleanup() {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function fakeAlivePid() {
  return process.pid;
}

function fakeDeadPid() {
  // Spawn a sub-process that exits immediately, capture pid, await exit.
  // Note: pid may be reused by the OS, but for typical CI this is fine.
  // We use spawnSync with the smallest possible work and add a wait loop.
  const r = spawnSync('node', ['-e', 'process.exit(0)']);
  if (r.status !== 0) throw new Error('failed to spawn dead-pid helper');
  // After spawnSync returns, the process is reaped — its PID is no longer
  // alive (until OS reuses it).
  return r.pid;
}

// ---------------------------------------------------------------------------
// 1-4. PID file lifecycle
// ---------------------------------------------------------------------------

describe('watcher-state — pidFilePath / writePidFile / readPidFile / removePidFile', () => {
  let h;
  beforeEach(() => { h = tmpHome(); });
  afterEach(() => { h.cleanup(); });

  test('pidFilePath returns the watch state directory\'s aoforge-watch.pid honouring $HOME (TRD 73-12)', () => {
    const p = lib.pidFilePath();
    assert.equal(p, path.join(watchStateDir(h.dir), 'aoforge-watch.pid'));
  });

  test('writePidFile creates parent dir and writes valid JSON', () => {
    lib.writePidFile({ pid: 1234, version: '0.1.0', shell: 'zsh', watching: ['/p'] });
    const p = lib.pidFilePath();
    assert.ok(fs.existsSync(p));
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.pid, 1234);
    assert.equal(parsed.version, '0.1.0');
    assert.equal(parsed.shell, 'zsh');
    assert.deepEqual(parsed.watching, ['/p']);
    assert.ok(parsed.started_at, 'has started_at timestamp');
  });

  test('readPidFile returns parsed JSON', () => {
    lib.writePidFile({ pid: 999, version: '0.1.0', shell: 'bash', watching: [] });
    const got = lib.readPidFile();
    assert.equal(got.pid, 999);
  });

  test('readPidFile returns null when absent', () => {
    assert.equal(lib.readPidFile(), null);
  });

  test('readPidFile returns null on malformed JSON', () => {
    fs.mkdirSync(path.dirname(lib.pidFilePath()), { recursive: true });
    fs.writeFileSync(lib.pidFilePath(), '{not json');
    assert.equal(lib.readPidFile(), null);
  });

  test('removePidFile is idempotent (no error on missing)', () => {
    assert.doesNotThrow(() => lib.removePidFile());
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'zsh', watching: [] });
    lib.removePidFile();
    assert.ok(!fs.existsSync(lib.pidFilePath()));
    assert.doesNotThrow(() => lib.removePidFile());
  });
});

// ---------------------------------------------------------------------------
// 5-8. isWatcherLive
// ---------------------------------------------------------------------------

describe('watcher-state — isWatcherLive', () => {
  let h;
  beforeEach(() => { h = tmpHome(); });
  afterEach(() => { h.cleanup(); });

  test('false when PID file absent', () => {
    assert.equal(lib.isWatcherLive(), false);
  });

  test('true when PID points at the running test process itself', () => {
    lib.writePidFile({ pid: fakeAlivePid(), version: '0.1.0', shell: 'zsh', watching: [] });
    assert.equal(lib.isWatcherLive(), true);
  });

  test('false when PID points at a dead process', () => {
    lib.writePidFile({ pid: fakeDeadPid(), version: '0.1.0', shell: 'zsh', watching: [] });
    assert.equal(lib.isWatcherLive(), false);
  });

  test('false on malformed PID file', () => {
    fs.mkdirSync(path.dirname(lib.pidFilePath()), { recursive: true });
    fs.writeFileSync(lib.pidFilePath(), 'garbage');
    assert.equal(lib.isWatcherLive(), false);
  });

  test('false when PID file has no pid field', () => {
    fs.mkdirSync(path.dirname(lib.pidFilePath()), { recursive: true });
    fs.writeFileSync(lib.pidFilePath(), '{"foo": "bar"}');
    assert.equal(lib.isWatcherLive(), false);
  });
});

// ---------------------------------------------------------------------------
// 9-11. Done-record helpers
// ---------------------------------------------------------------------------

describe('watcher-state — makeDoneRecord / markConsumed / listUnconsumed', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-done-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('makeDoneRecord adds completed_at, started_at, consumed: false', () => {
    const pending = {
      id: 'h-aaaa1111',
      cmd: 'echo hi',
      cwd: '/p',
      created_at: '2026-04-29T00:00:00.000Z',
      status: 'pending',
    };
    const startedAt = '2026-04-29T00:00:01.000Z';
    const r = lib.makeDoneRecord(pending, {
      stdout: 'hi\n',
      stderr: '',
      exit_code: 0,
      status: 'done',
      started_at: startedAt,
    });
    assert.equal(r.id, 'h-aaaa1111');
    assert.equal(r.cmd, 'echo hi');
    assert.equal(r.stdout, 'hi\n');
    assert.equal(r.stderr, '');
    assert.equal(r.exit_code, 0);
    assert.equal(r.status, 'done');
    assert.equal(r.started_at, startedAt);
    assert.ok(r.completed_at, 'has completed_at');
    assert.equal(r.consumed, false);
  });

  test('markConsumed flips consumed: true', () => {
    const filePath = path.join(tmp, 'h-1.json');
    fs.writeFileSync(filePath, JSON.stringify({ id: 'h-1', consumed: false }));
    lib.markConsumed(filePath);
    const got = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(got.consumed, true);
  });

  test('listUnconsumed returns only consumed:false records, sorted by completed_at', () => {
    const recs = [
      { id: 'h-c', consumed: false, completed_at: '2026-04-29T03:00:00Z' },
      { id: 'h-a', consumed: false, completed_at: '2026-04-29T01:00:00Z' },
      { id: 'h-b', consumed: false, completed_at: '2026-04-29T02:00:00Z' },
      { id: 'h-d', consumed: true,  completed_at: '2026-04-29T04:00:00Z' },
    ];
    for (const r of recs) {
      fs.writeFileSync(path.join(tmp, `${r.id}.json`), JSON.stringify(r));
    }
    const got = lib.listUnconsumed(tmp);
    assert.deepEqual(got.map(r => r.id), ['h-a', 'h-b', 'h-c']);
  });

  test('listUnconsumed returns [] when dir is missing', () => {
    assert.deepEqual(lib.listUnconsumed(path.join(tmp, 'missing')), []);
  });

  test('listUnconsumed skips malformed JSON files', () => {
    fs.writeFileSync(path.join(tmp, 'good.json'), JSON.stringify({ id: 'h-g', consumed: false, completed_at: '2026-04-29T00:00:00Z' }));
    fs.writeFileSync(path.join(tmp, 'bad.json'), '{not json');
    const got = lib.listUnconsumed(tmp);
    assert.equal(got.length, 1);
    assert.equal(got[0].id, 'h-g');
  });
});

// ===========================================================================
// TRD 20-03 Group W — addWatchedProject / removeWatchedProject
// ===========================================================================

describe('watcher-state — Group W: multi-project mutations (TRD 20-03)', () => {
  let h;
  beforeEach(() => { h = tmpHome(); });
  afterEach(() => { h.cleanup(); });

  test('W-1 addWatchedProject appends path.resolve(path) to existing watching:[]', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/a'] });
    const next = lib.addWatchedProject('/b');
    assert.deepEqual(next.watching, ['/a', '/b']);
    // Verify on-disk state matches
    const onDisk = lib.readPidFile();
    assert.deepEqual(onDisk.watching, ['/a', '/b']);
  });

  test('W-2 addWatchedProject is no-op when path already present (no duplicate)', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/a', '/b'] });
    const next = lib.addWatchedProject('/a');
    assert.deepEqual(next.watching, ['/a', '/b'], 'no duplicate');
  });

  test('W-3 addWatchedProject throws ENOPIDFILE when daemon not running', () => {
    assert.throws(
      () => lib.addWatchedProject('/a'),
      (e) => e.code === 'ENOPIDFILE',
    );
  });

  test('W-4 addWatchedProject writes via tmp+rename (no .tmp persists)', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: [] });
    lib.addWatchedProject('/a');
    const tmpPidFile = lib.pidFilePath() + '.tmp';
    assert.ok(!fs.existsSync(tmpPidFile), 'tmp file cleaned up after rename');
  });

  test('W-5 removeWatchedProject removes path from watching:[]', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/a', '/b'] });
    const next = lib.removeWatchedProject('/a');
    assert.deepEqual(next.watching, ['/b']);
  });

  test('W-6 removeWatchedProject is idempotent (no-op when path absent)', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/a'] });
    const next = lib.removeWatchedProject('/c');
    assert.deepEqual(next.watching, ['/a'], 'unchanged');
  });

  test('W-7 removeWatchedProject preserves other watching:[] entries', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/a', '/b', '/c'] });
    lib.removeWatchedProject('/b');
    const onDisk = lib.readPidFile();
    assert.deepEqual(onDisk.watching, ['/a', '/c']);
  });

  test('W-8 mutations preserve all other PID file fields', () => {
    const original = lib.writePidFile({
      pid: 1234, version: '0.5.0', shell: 'fish', watching: ['/a'],
    });
    lib.addWatchedProject('/b');
    const after = lib.readPidFile();
    assert.equal(after.pid, 1234, 'pid preserved');
    assert.equal(after.version, '0.5.0', 'version preserved');
    assert.equal(after.shell, 'fish', 'shell preserved');
    assert.equal(after.started_at, original.started_at, 'started_at preserved');
  });

  test('W-9 single-project PID file unchanged shape (back-compat verified)', () => {
    lib.writePidFile({ pid: 1, version: '0.1.0', shell: 'bash', watching: ['/single'] });
    const onDisk = lib.readPidFile();
    assert.deepEqual(onDisk.watching, ['/single'], 'single-project shape preserved');
  });
});

// ===========================================================================
// TRD 73-12 — the pid file lives in the watch state directory
// ===========================================================================

const PID_NAME = `${NAMES.watch}.pid`;

/** Where AOForge 3.0.0 kept the pid file: read and cleared for one release (removed with the shims after 3.0.0). */
function interimPidFile(home) {
  return path.join(home, NAMES.userDotDir, PID_NAME);
}

/** The pre-rename daemon's pid file: read last, as `legacy`, and never written or removed. */
function legacyPidFile(home) {
  return path.join(home, LEGACY.userDotDir, `${LEGACY.watch}.pid`);
}

function writeRecord(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  return file;
}

function pidRecord(overrides = {}) {
  return { pid: process.pid, version: '3.0.0', shell: 'bash', watching: [], started_at: '2026-10-09T12:00:00.000Z', ...overrides };
}

describe('watcher-state — the pid file in the watch state directory (TRD 73-12)', () => {
  let h;
  let prevOverride;
  beforeEach(() => {
    h = tmpHome();
    prevOverride = process.env.AOFORGE_HANDOFF_PID_FILE;
    delete process.env.AOFORGE_HANDOFF_PID_FILE;
  });
  afterEach(() => {
    if (prevOverride === undefined) delete process.env.AOFORGE_HANDOFF_PID_FILE;
    else process.env.AOFORGE_HANDOFF_PID_FILE = prevOverride;
    h.cleanup();
  });

  test('7. pidFilePath() is <watchStateDir>/aoforge-watch.pid; the override wins and no fallback is read', () => {
    assert.equal(lib.pidFilePath(), path.join(watchStateDir(h.dir), PID_NAME));

    writeRecord(interimPidFile(h.dir), pidRecord({ version: '3.0.0-interim' }));
    const override = path.join(h.dir, 'elsewhere', 'daemon.pid');
    process.env.AOFORGE_HANDOFF_PID_FILE = override;
    assert.equal(lib.pidFilePath(), override);
    assert.equal(lib.readPidFile(), null, 'with the override set, the 3.0.0 file in the home is ignored');
    assert.equal(lib.isWatcherLive(), false);
  });

  test('8. writePidFile creates the watch directory and no <home>/.aoforge', () => {
    lib.writePidFile({ pid: 4321, version: '3.1.0', shell: 'zsh', watching: ['/p'] });
    const file = path.join(watchStateDir(h.dir), PID_NAME);
    assert.ok(fs.existsSync(file), 'the pid file is in the watch state directory');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 4321);
    assert.equal(fs.existsSync(path.join(h.dir, NAMES.userDotDir)), false, 'no <home>/.aoforge is created');
  });

  test('9. a 3.0.0 pid file alone is the same AOForge daemon: no `legacy` key, live, and add/remove rewrite it', () => {
    const interim = writeRecord(interimPidFile(h.dir), pidRecord({ watching: ['/a'] }));

    const got = lib.readPidFile();
    assert.ok(got, 'the 3.0.0 pid file is read');
    assert.equal(got.version, '3.0.0');
    assert.equal('legacy' in got, false, 'a 3.0.0 record is not marked legacy');
    assert.equal(lib.isWatcherLive(), true);

    lib.addWatchedProject('/b');
    assert.deepEqual(JSON.parse(fs.readFileSync(interim, 'utf8')).watching, ['/a', '/b'],
      'the running 3.0.0 daemon rereads its own file, so add rewrites that file');
    lib.removeWatchedProject('/a');
    assert.deepEqual(JSON.parse(fs.readFileSync(interim, 'utf8')).watching, ['/b'], 'remove rewrites it too');
    assert.equal(fs.existsSync(lib.pidFilePath()), false, 'no new-location pid file is created');
    assert.equal(fs.existsSync(interim + '.tmp'), false, 'no .tmp left beside the 3.0.0 file');
  });

  test('10. the new pid file wins over the 3.0.0 one', () => {
    writeRecord(interimPidFile(h.dir), pidRecord({ version: '3.0.0' }));
    writeRecord(path.join(watchStateDir(h.dir), PID_NAME), pidRecord({ version: '3.1.0' }));
    const got = lib.readPidFile();
    assert.equal(got.version, '3.1.0');
    assert.equal('legacy' in got, false);
  });

  test('11. removePidFile removes the new and the 3.0.0 pid file, never the pre-rename one', () => {
    const current = writeRecord(path.join(watchStateDir(h.dir), PID_NAME), pidRecord({ version: '3.1.0' }));
    const interim = writeRecord(interimPidFile(h.dir), pidRecord());
    lib.removePidFile();
    assert.equal(fs.existsSync(current), false, 'both present: the new one is removed');
    assert.equal(fs.existsSync(interim), false, 'both present: the 3.0.0 one is removed');

    writeRecord(interimPidFile(h.dir), pidRecord());
    lib.removePidFile();
    assert.equal(fs.existsSync(interim), false, '3.0.0 only: removed');
    assert.equal(lib.readPidFile(), null);

    const legacy = writeRecord(legacyPidFile(h.dir), pidRecord({ version: '2.15.0' }));
    const before = fs.readFileSync(legacy, 'utf8');
    lib.removePidFile();
    assert.equal(fs.readFileSync(legacy, 'utf8'), before, 'pre-rename only: nothing is removed');
  });

  test('12. a pre-rename pid file alone is `legacy: true`, read last, and add/remove refuse it', () => {
    const legacy = writeRecord(legacyPidFile(h.dir), pidRecord({ version: '2.15.0', watching: ['/old'] }));
    const got = lib.readPidFile();
    assert.equal(got.version, '2.15.0');
    assert.equal(got.legacy, true);
    assert.throws(() => lib.addWatchedProject('/x'), (e) => e.code === 'ELEGACYDAEMON');
    assert.throws(() => lib.removeWatchedProject('/old'), (e) => e.code === 'ELEGACYDAEMON');
    assert.deepEqual(JSON.parse(fs.readFileSync(legacy, 'utf8')).watching, ['/old'], 'never rewritten');

    writeRecord(interimPidFile(h.dir), pidRecord({ version: '3.0.0' }));
    const second = lib.readPidFile();
    assert.equal(second.version, '3.0.0', 'the 3.0.0 file is read before the pre-rename one');
    assert.equal('legacy' in second, false);
  });

  test('13. path.join(home, ...WATCH_DIR_SEGMENTS) is compat.watchStateDir(home)', () => {
    assert.ok(Array.isArray(lib.WATCH_DIR_SEGMENTS));
    assert.ok(Object.isFrozen(lib.WATCH_DIR_SEGMENTS));
    assert.equal(path.join(h.dir, ...lib.WATCH_DIR_SEGMENTS), watchStateDir(h.dir));
  });
});

// ===========================================================================
// TRD 20-03 Group EX — Export surface
// ===========================================================================

describe('watcher-state — Group EX: export surface (TRD 20-03)', () => {
  test('EX-1 module.exports: the 10-entry surface plus WATCH_DIR_SEGMENTS (TRD 73-12)', () => {
    const keys = Object.keys(lib).sort();
    assert.deepStrictEqual(keys, [
      'WATCH_DIR_SEGMENTS',
      'addWatchedProject',
      'isWatcherLive',
      'listUnconsumed',
      'makeDoneRecord',
      'markConsumed',
      'pidFilePath',
      'readPidFile',
      'removePidFile',
      'removeWatchedProject',
      'writePidFile',
    ]);
  });
});
