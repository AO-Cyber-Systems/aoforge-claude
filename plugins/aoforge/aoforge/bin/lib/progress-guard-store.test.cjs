'use strict';

/**
 * progress-guard-store.test.cjs — quick task 25
 *
 * Per-session state primitives for the no-progress guard. Every test builds
 * its own directory under os.tmpdir(); nothing here touches the real ~/.claude.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./progress-guard-store.cjs');

const HOUR = 60 * 60 * 1000;
const TTL = 24 * HOUR;

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgs-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function ageFile(file, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(file, t, t);
}

describe('stateDir()', () => {
  test('honours AOFORGE_PROGRESS_GUARD_DIR', () => {
    assert.equal(store.stateDir({ AOFORGE_PROGRESS_GUARD_DIR: '/x' }), '/x');
  });

  test('defaults to ~/.claude/aoforge/state/progress-guard', () => {
    assert.equal(
      store.stateDir({}),
      path.join(os.homedir(), '.claude', 'aoforge', 'state', 'progress-guard')
    );
  });

  test('an empty override falls back to the default', () => {
    assert.equal(
      store.stateDir({ AOFORGE_PROGRESS_GUARD_DIR: '' }),
      path.join(os.homedir(), '.claude', 'aoforge', 'state', 'progress-guard')
    );
  });
});

describe('sanitizeSessionId()', () => {
  test('a safe id is unchanged', () => {
    assert.equal(store.sanitizeSessionId('abc-123_X'), 'abc-123_X');
  });

  test('path separators and dots are neutralised', () => {
    const out = store.sanitizeSessionId('../a/b');
    assert.match(out, /^[A-Za-z0-9_-]+$/);
    assert.ok(!out.includes('/') && !out.includes('.'));
  });

  test('spaces are neutralised', () => {
    assert.match(store.sanitizeSessionId('x y'), /^[A-Za-z0-9_-]+$/);
  });

  test('empty, missing, null and ".." map to "unknown"', () => {
    assert.equal(store.sanitizeSessionId(''), 'unknown');
    assert.equal(store.sanitizeSessionId(undefined), 'unknown');
    assert.equal(store.sanitizeSessionId(null), 'unknown');
    assert.equal(store.sanitizeSessionId('..'), 'unknown');
  });

  test('an id made only of underscores or dashes maps to "unknown"', () => {
    assert.equal(store.sanitizeSessionId('___'), 'unknown');
    assert.equal(store.sanitizeSessionId('---'), 'unknown');
    assert.equal(store.sanitizeSessionId('/'), 'unknown');
  });

  test('a 500-character id is capped at 128', () => {
    const out = store.sanitizeSessionId('a'.repeat(500));
    assert.equal(out.length, 128);
  });
});

describe('sessionFile()', () => {
  test('joins the state dir and the sanitized id with .json', () => {
    assert.equal(store.sessionFile('/d', 's1'), path.join('/d', 's1.json'));
  });

  test('never escapes the state dir', () => {
    const f = store.sessionFile(dir, '../../evil');
    assert.equal(path.dirname(f), dir);
    assert.match(path.basename(f), /^[A-Za-z0-9_-]+\.json$/);
  });
});

describe('readSession() / writeSession()', () => {
  test('round-trips an object', () => {
    const file = path.join(dir, 's1.json');
    assert.equal(store.writeSession(file, { guard: { streak: 2 }, updated: 5, project: '/p' }), true);
    assert.deepEqual(store.readSession(file), { guard: { streak: 2 }, updated: 5, project: '/p' });
  });

  test('writeSession creates the parent directory', () => {
    const file = path.join(dir, 'nested', 'deeper', 's1.json');
    assert.equal(store.writeSession(file, { a: 1 }), true);
    assert.ok(fs.existsSync(file));
  });

  test('readSession returns null for a missing file', () => {
    assert.equal(store.readSession(path.join(dir, 'nope.json')), null);
  });

  test('readSession returns null for a corrupt file, never throws', () => {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{{{ broken');
    assert.equal(store.readSession(file), null);
  });

  test('writeSession returns false when the target dir is a regular file, never throws', () => {
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'i am a file');
    assert.equal(store.writeSession(path.join(blocker, 's1.json'), { a: 1 }), false);
  });
});

describe('pruneStale()', () => {
  test('removes a stale .json and keeps a fresh one', () => {
    const old = path.join(dir, 'old.json');
    const fresh = path.join(dir, 'fresh.json');
    fs.writeFileSync(old, '{}');
    fs.writeFileSync(fresh, '{}');
    ageFile(old, 25 * HOUR);
    const removed = store.pruneStale(dir, Date.now(), TTL, null);
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(fresh), true);
  });

  test('never touches a non-.json file, however old', () => {
    const note = path.join(dir, 'note.txt');
    fs.writeFileSync(note, 'keep me');
    ageFile(note, 25 * HOUR);
    assert.equal(store.pruneStale(dir, Date.now(), TTL, null), 0);
    assert.equal(fs.existsSync(note), true);
  });

  test('never touches a subdirectory named like a json file', () => {
    const sub = path.join(dir, 'sub.json');
    fs.mkdirSync(sub);
    ageFile(sub, 25 * HOUR);
    assert.equal(store.pruneStale(dir, Date.now(), TTL, null), 0);
    assert.equal(fs.existsSync(sub), true);
  });

  test('keeps the keepFile even when it is stale', () => {
    const mine = path.join(dir, 'mine.json');
    fs.writeFileSync(mine, '{}');
    ageFile(mine, 25 * HOUR);
    assert.equal(store.pruneStale(dir, Date.now(), TTL, mine), 0);
    assert.equal(fs.existsSync(mine), true);
  });

  test('returns 0 for a missing directory', () => {
    assert.equal(store.pruneStale(path.join(dir, 'gone'), Date.now(), TTL, null), 0);
  });
});

describe('listSessions()', () => {
  test('returns {session, guard, updated, project} for readable json files', () => {
    store.writeSession(path.join(dir, 's1.json'), { guard: { streak: 4 }, updated: 10, project: '/p' });
    store.writeSession(path.join(dir, 's2.json'), { guard: { streak: 1 }, updated: 20, project: '/q' });
    const list = store.listSessions(dir).sort((a, b) => a.session.localeCompare(b.session));
    assert.deepEqual(list, [
      { session: 's1', guard: { streak: 4 }, updated: 10, project: '/p' },
      { session: 's2', guard: { streak: 1 }, updated: 20, project: '/q' },
    ]);
  });

  test('skips corrupt and non-json files', () => {
    store.writeSession(path.join(dir, 'ok.json'), { guard: { streak: 1 }, updated: 1, project: '/p' });
    fs.writeFileSync(path.join(dir, 'bad.json'), '{{{ broken');
    fs.writeFileSync(path.join(dir, 'note.txt'), 'hello');
    const list = store.listSessions(dir);
    assert.deepEqual(list.map(s => s.session), ['ok']);
  });

  test('returns [] for a missing directory', () => {
    assert.deepEqual(store.listSessions(path.join(dir, 'gone')), []);
  });
});
