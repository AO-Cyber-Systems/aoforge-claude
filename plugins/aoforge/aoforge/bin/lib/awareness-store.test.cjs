'use strict';

/**
 * awareness-store.test.cjs — TRD 45-01 (DOC-01)
 *
 * Out-of-tree per-repo awareness cache primitives. Every test builds its own
 * directory under os.tmpdir(); nothing here touches the real ~/.claude.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./awareness-store.cjs');
const upgrade = require('./upgrade.cjs');

const HOUR = 60 * 60 * 1000;
const TTL = 24 * HOUR;

let tmp;
let dir;
let root;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-'));
  dir = path.join(tmp, 'state');
  root = path.join(tmp, 'My Project');
  fs.mkdirSync(root, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function ageFile(file, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(file, t, t);
}

describe('stateDir()', () => {
  test('1a. honours AOFORGE_AWARENESS_DIR', () => {
    assert.equal(store.stateDir({ AOFORGE_AWARENESS_DIR: '/x' }), '/x');
  });

  test('1b. defaults to <home>/.claude/aoforge/state/awareness', () => {
    assert.equal(store.stateDir({}, '/h'), path.join('/h', '.claude', 'aoforge', 'state', 'awareness'));
  });

  test('1c. an empty override falls back to the default', () => {
    assert.equal(
      store.stateDir({ AOFORGE_AWARENESS_DIR: '' }, '/h'),
      path.join('/h', '.claude', 'aoforge', 'state', 'awareness')
    );
  });

  test('1d. with no home given it uses os.homedir()', () => {
    assert.equal(
      store.stateDir({}),
      path.join(os.homedir(), '.claude', 'aoforge', 'state', 'awareness')
    );
  });
});

describe('repoKey()', () => {
  test('2a. equals upgrade.repoKey for a plain directory', () => {
    assert.equal(store.repoKey(root), upgrade.repoKey(root));
  });

  test('2b. equals upgrade.repoKey for a symlink to it (realpath)', () => {
    const link = path.join(tmp, 'link');
    fs.symlinkSync(root, link);
    assert.equal(store.repoKey(link), upgrade.repoKey(link));
    assert.equal(store.repoKey(link), store.repoKey(root));
  });

  test('2c. falls back to path.resolve for a path that does not exist (never throws)', () => {
    const ghost = path.join(tmp, 'ghost-dir');
    const key = store.repoKey(ghost);
    assert.match(key, /^ghost-dir-[0-9a-f]{8}$/);
  });
});

describe('cacheFile()', () => {
  test('3a. returns <dir>/<repoKey>.json', () => {
    const file = store.cacheFile(root, { env: { AOFORGE_AWARENESS_DIR: dir } });
    assert.equal(file, path.join(dir, `${store.repoKey(root)}.json`));
  });

  test('3b. the path is never inside the project root', () => {
    const file = store.cacheFile(root, { env: { AOFORGE_AWARENESS_DIR: dir } });
    const rel = path.relative(root, file);
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), `expected ${file} outside ${root}`);
  });

  test('3c. honours {home} when no env override is set', () => {
    const file = store.cacheFile(root, { env: {}, home: '/h' });
    assert.equal(
      file,
      path.join('/h', '.claude', 'aoforge', 'state', 'awareness', `${store.repoKey(root)}.json`)
    );
  });
});

describe('readEntry() / writeEntry()', () => {
  test('4a. round-trips an object', () => {
    const file = path.join(dir, 'a.json');
    const obj = { project: '/p', updated: '2026-01-01T00:00:00.000Z', peer: { branches: [] } };
    assert.equal(store.writeEntry(file, obj), true);
    assert.deepEqual(store.readEntry(file), obj);
  });

  test('4b. readEntry of a missing file is null', () => {
    assert.equal(store.readEntry(path.join(dir, 'nope.json')), null);
  });

  test('4c. readEntry of an empty file is null', () => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'empty.json');
    fs.writeFileSync(file, '');
    assert.equal(store.readEntry(file), null);
  });

  test('4d. readEntry of garbage is null', () => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{not json');
    assert.equal(store.readEntry(file), null);
  });

  test('4e. writeEntry returns false (never throws) when the destination is unwritable', () => {
    // A regular file where the parent directory should be.
    const blocker = path.join(tmp, 'blocker');
    fs.writeFileSync(blocker, 'x');
    assert.equal(store.writeEntry(path.join(blocker, 'sub', 'a.json'), { a: 1 }), false);
  });
});

describe('writeEntry() atomicity', () => {
  test('5a. creates the parent dir', () => {
    const file = path.join(dir, 'deep', 'er', 'a.json');
    assert.equal(store.writeEntry(file, { a: 1 }), true);
    assert.ok(fs.existsSync(file));
  });

  test('5b. leaves no *.tmp file behind', () => {
    const file = path.join(dir, 'a.json');
    store.writeEntry(file, { a: 1 });
    store.writeEntry(file, { a: 2 });
    const names = fs.readdirSync(dir);
    assert.deepEqual(names, ['a.json']);
    assert.ok(!names.some((n) => n.endsWith('.tmp')));
  });

  test('5c. overwrites an existing entry', () => {
    const file = path.join(dir, 'a.json');
    store.writeEntry(file, { a: 1 });
    store.writeEntry(file, { a: 2 });
    assert.deepEqual(store.readEntry(file), { a: 2 });
  });
});

describe('listEntries()', () => {
  test('6a. returns {file, project, size, mtimeMs} for parseable *.json only', () => {
    store.writeEntry(path.join(dir, 'one.json'), { project: '/one', peer: {} });
    store.writeEntry(path.join(dir, 'two.json'), { project: '/two' });
    fs.writeFileSync(path.join(dir, 'garbage.json'), '{nope');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'hello');
    const out = store.listEntries(dir).sort((a, b) => a.file.localeCompare(b.file));
    assert.equal(out.length, 2);
    assert.equal(out[0].file, path.join(dir, 'one.json'));
    assert.equal(out[0].project, '/one');
    assert.equal(out[1].project, '/two');
    for (const e of out) {
      assert.equal(typeof e.size, 'number');
      assert.ok(e.size > 0);
      assert.equal(typeof e.mtimeMs, 'number');
      assert.equal(e.size, fs.statSync(e.file).size);
    }
  });

  test('6b. a missing dir returns []', () => {
    assert.deepEqual(store.listEntries(path.join(tmp, 'absent')), []);
  });
});

describe('pruneStale()', () => {
  test('7a. removes only *.json older than ttl and returns the count', () => {
    const old = path.join(dir, 'old.json');
    const fresh = path.join(dir, 'fresh.json');
    const note = path.join(dir, 'old.txt');
    store.writeEntry(old, { project: root });
    store.writeEntry(fresh, { project: root });
    fs.writeFileSync(note, 'x');
    ageFile(old, 2 * TTL);
    ageFile(note, 2 * TTL);
    const removed = store.pruneStale(dir, Date.now(), TTL);
    assert.equal(removed, 1);
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(fresh));
    assert.ok(fs.existsSync(note), 'non-json files are left alone');
  });

  test('7b. a missing dir returns 0', () => {
    assert.equal(store.pruneStale(path.join(tmp, 'absent'), Date.now(), TTL), 0);
  });

  test('7c. {orphans:true} also removes fresh entries whose project no longer exists', () => {
    const live = path.join(dir, 'live.json');
    const orphan = path.join(dir, 'orphan.json');
    const noProject = path.join(dir, 'noproject.json');
    store.writeEntry(live, { project: root });
    store.writeEntry(orphan, { project: path.join(tmp, 'deleted-repo') });
    store.writeEntry(noProject, { peer: {} });
    const removed = store.pruneStale(dir, Date.now(), TTL, { orphans: true });
    assert.equal(removed, 1);
    assert.ok(fs.existsSync(live));
    assert.ok(!fs.existsSync(orphan));
    assert.ok(fs.existsSync(noProject), 'an entry with no project field is not provably orphaned');
  });

  test('7d. without {orphans} a fresh orphan is kept', () => {
    const orphan = path.join(dir, 'orphan.json');
    store.writeEntry(orphan, { project: path.join(tmp, 'deleted-repo') });
    assert.equal(store.pruneStale(dir, Date.now(), TTL), 0);
    assert.ok(fs.existsSync(orphan));
  });
});

describe('totalSize()', () => {
  test('8a. sums the byte sizes of *.json', () => {
    store.writeEntry(path.join(dir, 'a.json'), { a: 'x'.repeat(10) });
    store.writeEntry(path.join(dir, 'b.json'), { b: 'y'.repeat(20) });
    fs.writeFileSync(path.join(dir, 'c.txt'), 'z'.repeat(1000));
    const expected =
      fs.statSync(path.join(dir, 'a.json')).size + fs.statSync(path.join(dir, 'b.json')).size;
    assert.equal(store.totalSize(dir), expected);
    assert.ok(expected > 0);
  });

  test('8b. a missing dir returns 0', () => {
    assert.equal(store.totalSize(path.join(tmp, 'absent')), 0);
  });
});

describe('module surface', () => {
  test('exports LEGACY_CACHE_REL for migration/doctor', () => {
    assert.equal(store.LEGACY_CACHE_REL, '.planning/.awareness-cache.json');
  });

  test('requires only node builtins', () => {
    const src = fs.readFileSync(path.join(__dirname, 'awareness-store.cjs'), 'utf8');
    const reqs = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.deepEqual(reqs.sort(), ['crypto', 'fs', 'os', 'path']);
  });
});
