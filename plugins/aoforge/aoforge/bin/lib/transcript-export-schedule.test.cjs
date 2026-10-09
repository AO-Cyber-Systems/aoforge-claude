'use strict';

// Test list (TRD 61-05, OBS-03): the throttled schedule for `aof-tools transcript-export`.
//
//   1. decide, in order of precedence:
//        skip env '1'            -> { run: false, reason: 'skip-env' }
//        no <home>/.claude/projects -> 'no-transcripts'
//        stamp 1 h old           -> 'throttled'
//        stamp 25 h old          -> { run: true }
//        no stamp                -> run
//        unparseable stamp       -> run
//        stamp > 5 min in future -> run (a clock moved back must not freeze the export)
//   2. claim writes { last_run_at: <now ISO> } to stampPath(home), creating the directory, through a
//      temp file and a rename (no *.tmp left behind); readStamp reads it back.
//   3. exportArgs({ dfTools, userHome }) names --root and --out explicitly.
//   4. runScheduled with a spy spawnChild: due -> spy called once with exportArgs, stamp exists,
//      { spawned: true }; throttled -> spy not called, stamp bytes unchanged; skip env -> not called, no stamp.
//   5. runScheduled where spawnChild throws -> the error propagates and the stamp was already written
//      (the claim stands, so a broken spawn is retried at most daily).
//
// Fake homes and a fixed `now` only: nothing here reads or writes the real ~/.claude.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const S = require('./transcript-export-schedule.cjs');

const NOW = new Date('2026-10-06T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DF_TOOLS = '/plugin/aoforge/bin/aof-tools.cjs';

const cleanup = [];
after(() => {
  for (const d of cleanup) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** A fake HOME. `withProjects` creates <home>/.claude/projects (the thing the export reads). */
function makeHome({ withProjects = true } = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-tx-sched-')));
  cleanup.push(home);
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (withProjects) fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  return home;
}

/** Write a stamp holding `last_run_at` exactly as the caller gives it (so tests can write bad ones). */
function writeRawStamp(home, text) {
  fs.mkdirSync(path.dirname(S.stampPath(home)), { recursive: true });
  fs.writeFileSync(S.stampPath(home), text);
}

function stampAgo(home, ms) {
  writeRawStamp(home, JSON.stringify({ last_run_at: new Date(NOW.getTime() - ms).toISOString() }) + '\n');
}

describe('transcript-export-schedule: constants', () => {
  test('THROTTLE_MS is 24 h and SKIP_ENV names the one escape', () => {
    assert.equal(S.THROTTLE_MS, 24 * HOUR);
    assert.equal(S.SKIP_ENV, 'AOFORGE_SKIP_TRANSCRIPT_EXPORT');
  });

  test('stampPath lives under ~/.claude/aoforge/state/transcript-export/, not in a repository', () => {
    const home = '/fake/home';
    assert.equal(S.stampPath(home), path.join(home, '.claude', 'aoforge', 'state', 'transcript-export', 'last-run.json'));
  });
});

describe('1: decide', () => {
  test('skip env wins over everything', () => {
    const home = makeHome({ withProjects: false });
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: { AOFORGE_SKIP_TRANSCRIPT_EXPORT: '1' } }),
      { run: false, reason: 'skip-env' });
  });

  test('any other value of the skip env does not skip', () => {
    const home = makeHome();
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: { AOFORGE_SKIP_TRANSCRIPT_EXPORT: '0' } }), { run: true });
  });

  test('the other skip envs do not imply this one', () => {
    const home = makeHome();
    const env = { AOFORGE_SKIP_PRUNE: '1', AOFORGE_SKIP_UPGRADE: '1' };
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env }), { run: true });
  });

  test('no ~/.claude/projects -> no-transcripts', () => {
    const home = makeHome({ withProjects: false });
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: false, reason: 'no-transcripts' });
  });

  test('no-transcripts is checked before the throttle', () => {
    const home = makeHome({ withProjects: false });
    stampAgo(home, HOUR);
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: false, reason: 'no-transcripts' });
  });

  test('a stamp 1 h old -> throttled', () => {
    const home = makeHome();
    stampAgo(home, HOUR);
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: false, reason: 'throttled' });
  });

  test('boundary mirrors backup-prune: 24 h - 1 ms is throttled, exactly 24 h is due', () => {
    const home = makeHome();
    stampAgo(home, 24 * HOUR - 1);
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: false, reason: 'throttled' });
    stampAgo(home, 24 * HOUR);
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: true });
  });

  test('a stamp 25 h old -> run', () => {
    const home = makeHome();
    stampAgo(home, 25 * HOUR);
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: true });
  });

  test('no stamp -> run', () => {
    const home = makeHome();
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: true });
  });

  test('an unparseable stamp (invalid JSON, wrong shape, bad date) -> run', () => {
    const home = makeHome();
    for (const bad of ['not json {', '{"last_run_at": 5}', '{"last_run_at": "yesterday-ish"}', '[]', 'null']) {
      writeRawStamp(home, bad);
      assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: true }, bad);
    }
  });

  test('a stamp more than 5 min in the future (clock skew) -> run; within 5 min -> throttled', () => {
    const home = makeHome();
    writeRawStamp(home, JSON.stringify({ last_run_at: new Date(NOW.getTime() + 5 * 60 * 1000 + 1).toISOString() }));
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: true });
    writeRawStamp(home, JSON.stringify({ last_run_at: new Date(NOW.getTime() + 5 * 60 * 1000).toISOString() }));
    assert.deepEqual(S.decide({ userHome: home, now: NOW, env: {} }), { run: false, reason: 'throttled' });
  });
});

describe('2: claim / readStamp', () => {
  test('claim writes { last_run_at } through a temp file and a rename, creating the directory', () => {
    const home = makeHome();
    assert.ok(!fs.existsSync(path.dirname(S.stampPath(home))), 'state dir does not exist yet');
    S.claim({ userHome: home, now: NOW });
    assert.deepEqual(JSON.parse(fs.readFileSync(S.stampPath(home), 'utf-8')), { last_run_at: NOW.toISOString() });
    const left = fs.readdirSync(path.dirname(S.stampPath(home)));
    assert.deepEqual(left, ['last-run.json'], `no *.tmp left behind: ${JSON.stringify(left)}`);
  });

  test('readStamp reads the claim back; null for a missing stamp', () => {
    const home = makeHome();
    assert.equal(S.readStamp(home), null);
    S.claim({ userHome: home, now: NOW });
    assert.deepEqual(S.readStamp(home), { last_run_at: NOW.toISOString(), time: NOW.getTime() });
  });

  test('claiming again replaces the stamp', () => {
    const home = makeHome();
    S.claim({ userHome: home, now: NOW });
    const later = new Date(NOW.getTime() + 30 * HOUR);
    S.claim({ userHome: home, now: later });
    assert.equal(S.readStamp(home).last_run_at, later.toISOString());
  });
});

describe('3: exportArgs', () => {
  test('passes --root and --out explicitly and never --full', () => {
    const home = '/fake/home';
    const args = S.exportArgs({ dfTools: DF_TOOLS, userHome: home });
    assert.deepEqual(args, [
      DF_TOOLS, 'transcript-export',
      '--root', path.join(home, '.claude', 'projects'),
      '--out', path.join(home, '.claude', 'aoforge', 'transcript-index.jsonl'),
    ]);
    assert.ok(!args.includes('--full'));
  });
});

describe('4: runScheduled with a spy spawnChild', () => {
  function spy() {
    const calls = [];
    const fn = (args) => { calls.push(args); };
    fn.calls = calls;
    return fn;
  }

  test('due -> the spy is called once with exportArgs, the stamp exists, { spawned: true }', () => {
    const home = makeHome();
    const spawnChild = spy();
    const r = S.runScheduled({ userHome: home, now: NOW, env: {}, dfTools: DF_TOOLS, spawnChild });
    const expected = S.exportArgs({ dfTools: DF_TOOLS, userHome: home });
    assert.equal(r.spawned, true);
    assert.deepEqual(r.args, expected);
    assert.equal(spawnChild.calls.length, 1);
    assert.deepEqual(spawnChild.calls[0], expected);
    assert.equal(S.readStamp(home).last_run_at, NOW.toISOString());
  });

  test('the stamp is claimed BEFORE the spawn', () => {
    const home = makeHome();
    let stampSeenBySpawn = null;
    const spawnChild = () => { stampSeenBySpawn = S.readStamp(home); };
    S.runScheduled({ userHome: home, now: NOW, env: {}, dfTools: DF_TOOLS, spawnChild });
    assert.ok(stampSeenBySpawn, 'the stamp already existed when the child was spawned');
  });

  test('throttled -> not called, stamp bytes unchanged', () => {
    const home = makeHome();
    stampAgo(home, HOUR);
    const before = fs.readFileSync(S.stampPath(home));
    const spawnChild = spy();
    const r = S.runScheduled({ userHome: home, now: NOW, env: {}, dfTools: DF_TOOLS, spawnChild });
    assert.deepEqual(r, { spawned: false, reason: 'throttled' });
    assert.equal(spawnChild.calls.length, 0);
    assert.ok(before.equals(fs.readFileSync(S.stampPath(home))), 'stamp bytes unchanged');
  });

  test('skip env -> not called, no stamp', () => {
    const home = makeHome();
    const spawnChild = spy();
    const r = S.runScheduled({ userHome: home, now: NOW, env: { AOFORGE_SKIP_TRANSCRIPT_EXPORT: '1' }, dfTools: DF_TOOLS, spawnChild });
    assert.deepEqual(r, { spawned: false, reason: 'skip-env' });
    assert.equal(spawnChild.calls.length, 0);
    assert.ok(!fs.existsSync(S.stampPath(home)));
  });

  test('no transcripts -> not called, nothing written under ~/.claude/aoforge', () => {
    const home = makeHome({ withProjects: false });
    const spawnChild = spy();
    const r = S.runScheduled({ userHome: home, now: NOW, env: {}, dfTools: DF_TOOLS, spawnChild });
    assert.deepEqual(r, { spawned: false, reason: 'no-transcripts' });
    assert.equal(spawnChild.calls.length, 0);
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'aoforge')));
  });
});

describe('5: runScheduled when spawnChild throws', () => {
  test('the error propagates and the claim stands', () => {
    const home = makeHome();
    const spawnChild = () => { throw new Error('spawn exploded'); };
    assert.throws(
      () => S.runScheduled({ userHome: home, now: NOW, env: {}, dfTools: DF_TOOLS, spawnChild }),
      /spawn exploded/,
    );
    assert.equal(S.readStamp(home).last_run_at, NOW.toISOString(), 'stamp written before the spawn');
    // A second attempt in the same window does not retry.
    const retry = [];
    const r = S.runScheduled({ userHome: home, now: new Date(NOW.getTime() + HOUR), env: {}, dfTools: DF_TOOLS, spawnChild: (a) => retry.push(a) });
    assert.deepEqual(r, { spawned: false, reason: 'throttled' });
    assert.equal(retry.length, 0);
  });
});
