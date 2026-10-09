'use strict';

// Test list (TRD 72-07, objective 72-install-and-naming-cleanup, INST-03): the user's runtime state reaches the new
// runtime home on the first AOForge session. Fake home from legacy-runtime-fixtures.cjs; `now` injected; the real
// ~/.claude is never read.
//
// 1. Fresh: legacy runtime populated, no new runtime home -> after migrate, calibration.json, audit.log,
//    transcript-index.jsonl, stacks/go.md, state/estimates/k.json, state/estimates/history/k/<ts>.json,
//    state/awareness/k.json and state/hook-markers/k/m.json exist under the new home with identical bytes, and still
//    exist under the old one (the old copy is the backup).
// 2. state/outbox/k.* and backups/k/<ts>/ and backups/.registry.json are MOVED: present under the new home with the
//    old bytes, absent under the old one (an outbox copy could be flushed by both plugins; backups are hundreds of MB).
// 3. An existing new-home calibration.json is not overwritten (listed in `skipped`).
// 4. The mirrored subdirs (workflows, references, templates, bin, schemas, stack-profiles), locks/ and the old
//    runtime markers are neither copied nor moved; COPY_ENTRIES and MOVE_ENTRIES are exactly the documented sets.
// 5. Marker JSON written with `from`, ISO `at`, sorted `copied`/`moved`/`skipped`; a second run returns
//    `{ ran: false }` and changes nothing in either home.
// 6. No legacy runtime: `{ ran: false }`, no marker, nothing created.
// 7. A move target that exists (backups/k/ already under the new home): the source stays, the entry is in `skipped`.
// 7b. EXDEV (the two homes on different filesystems): a move falls back to copy, verify, remove; the entries are
//     listed in `moved_by_copy` (result and marker).
// 7c. A failure mid-way throws and writes no marker, so the next session retries.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrateLegacyRuntime, COPY_ENTRIES, MOVE_ENTRIES, MARKER_FILE } = require('./runtime-state-migrate.cjs');
const { legacyRuntimeHome, DEFAULT_KEY: K, HISTORY_FILE } = require('./__fixtures__/legacy-runtime-fixtures.cjs');

const NOW = new Date('2026-10-09T01:00:00.000Z');

const COPIED_FILES = [
  'calibration.json',
  'audit.log',
  'transcript-index.jsonl',
  'stacks/go.md',
  `state/estimates/${K}.json`,
  `state/estimates/history/${K}/${HISTORY_FILE}`,
  `state/awareness/${K}.json`,
  `state/hook-markers/${K}/m.json`,
];

const MOVED_FILES = [
  `state/outbox/${K}.json`,
  `state/outbox/${K}.base.json`,
  `state/outbox/${K}.verb-writes.json`,
  `state/outbox/${K}.lock`,
  `backups/${K}/2026-10-08/x`,
  'backups/.registry.json',
];

const at = (root, rel) => path.join(root, ...rel.split('/'));
const read = (root, rel) => fs.readFileSync(at(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(at(root, rel));

/** rel path -> content of every file under dir ({} when dir is absent). */
function tree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(cur, rel) {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(cur, e.name), r);
      else out[r] = fs.readFileSync(path.join(cur, e.name), 'utf8');
    }
  })(dir, '');
  return out;
}

const sorted = (a) => [...a].sort();

describe('migrateLegacyRuntime (TRD 72-07, INST-03)', () => {
  test('1. fresh: every COPY entry reaches the new home byte for byte and stays in the old home', (t) => {
    const h = legacyRuntimeHome();
    t.after(h.cleanup);
    const r = migrateLegacyRuntime({ userHome: h.home, now: NOW });
    assert.equal(r.ran, true);
    for (const rel of COPIED_FILES) {
      assert.equal(read(h.aoforge, rel), h.files[rel], `${rel} copied with identical bytes`);
      assert.equal(read(h.legacy, rel), h.files[rel], `${rel} still in the old home`);
      assert.ok(r.copied.includes(rel), `${rel} listed in copied`);
    }
  });

  test('2. state/outbox and backups are MOVED: under the new home, gone from the old one', (t) => {
    const h = legacyRuntimeHome();
    t.after(h.cleanup);
    const r = migrateLegacyRuntime({ userHome: h.home, now: NOW });
    for (const rel of MOVED_FILES) {
      assert.equal(read(h.aoforge, rel), h.files[rel], `${rel} moved with identical bytes`);
      assert.equal(exists(h.legacy, rel), false, `${rel} no longer in the old home`);
    }
    assert.deepEqual(r.moved, sorted([
      `state/outbox/${K}.json`,
      `state/outbox/${K}.base.json`,
      `state/outbox/${K}.verb-writes.json`,
      `state/outbox/${K}.lock`,
      `backups/${K}`,
      'backups/.registry.json',
    ]));
    for (const rel of r.copied) {
      assert.ok(!rel.startsWith('state/outbox/') && !rel.startsWith('backups/'), `${rel} must not be copied`);
    }
  });

  test('3. an existing new-home calibration.json is not overwritten and is listed in skipped', (t) => {
    const h = legacyRuntimeHome({ withAoforge: { 'calibration.json': '{"mine":true}\n' } });
    t.after(h.cleanup);
    const r = migrateLegacyRuntime({ userHome: h.home, now: NOW });
    assert.equal(read(h.aoforge, 'calibration.json'), '{"mine":true}\n');
    assert.ok(r.skipped.includes('calibration.json'));
    assert.ok(!r.copied.includes('calibration.json'));
    assert.equal(read(h.aoforge, 'audit.log'), h.files['audit.log'], 'the rest still copies');
  });

  test('4. mirrored subdirs, locks/ and the old runtime markers are neither copied nor moved', (t) => {
    assert.deepEqual([...COPY_ENTRIES], ['calibration.json', 'audit.log', 'transcript-index.jsonl', 'stacks', 'state']);
    assert.deepEqual([...MOVE_ENTRIES], ['state/outbox', 'backups']);
    const h = legacyRuntimeHome();
    t.after(h.cleanup);
    migrateLegacyRuntime({ userHome: h.home, now: NOW });
    for (const name of ['workflows', 'references', 'templates', 'bin', 'schemas', 'stack-profiles', 'locks',
      '.plugin-version', '.devflow-notices.json']) {
      assert.equal(exists(h.aoforge, name), false, `${name} must not reach the new home`);
      assert.equal(exists(h.legacy, name), true, `${name} stays in the old home`);
    }
  });

  test('5. the marker records from/at and sorted lists; a second run returns { ran: false } and changes nothing',
    (t) => {
      const h = legacyRuntimeHome({ withAoforge: { 'calibration.json': '{"mine":true}\n' } });
      t.after(h.cleanup);
      const r = migrateLegacyRuntime({ userHome: h.home, now: NOW });
      const markerPath = path.join(h.aoforge, MARKER_FILE);
      assert.equal(MARKER_FILE, '.legacy-state-migrated.json');
      assert.equal(r.marker, markerPath);
      const m = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.equal(m.from, h.legacy);
      assert.equal(m.at, NOW.toISOString());
      for (const k of ['copied', 'moved', 'skipped']) {
        assert.ok(Array.isArray(m[k]), `${k} is an array`);
        assert.deepEqual(m[k], sorted(m[k]), `${k} is sorted`);
        assert.deepEqual(m[k], r[k], `${k} matches the result`);
      }
      assert.deepEqual(m.skipped, ['calibration.json']);
      assert.equal(m.moved_by_copy, undefined, 'moved_by_copy appears only when a move fell back to copying');

      const before = { legacy: tree(h.legacy), aoforge: tree(h.aoforge), mtime: fs.statSync(markerPath).mtimeMs };
      const again = migrateLegacyRuntime({ userHome: h.home, now: new Date('2026-10-10T00:00:00.000Z') });
      assert.equal(again.ran, false);
      assert.deepEqual(
        { legacy: tree(h.legacy), aoforge: tree(h.aoforge), mtime: fs.statSync(markerPath).mtimeMs },
        before
      );
    });

  test('6. no legacy runtime: { ran: false }, no marker, nothing created', (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-no-legacy-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const r = migrateLegacyRuntime({ userHome: home, now: NOW });
    assert.equal(r.ran, false);
    assert.deepEqual(fs.readdirSync(home), [], 'nothing created under the home');
  });

  test('7. a move target that exists stays put: the source stays and the entry is skipped', (t) => {
    const h = legacyRuntimeHome({ withAoforge: { [`backups/${K}/`]: null } });
    t.after(h.cleanup);
    const r = migrateLegacyRuntime({ userHome: h.home, now: NOW });
    assert.equal(read(h.legacy, `backups/${K}/2026-10-08/x`), h.files[`backups/${K}/2026-10-08/x`]);
    assert.deepEqual(fs.readdirSync(at(h.aoforge, `backups/${K}`)), [], 'the existing target is untouched');
    assert.ok(r.skipped.includes(`backups/${K}`));
    assert.ok(!r.moved.includes(`backups/${K}`));
    assert.ok(r.moved.includes('backups/.registry.json'), 'siblings still move');
  });

  test('7b. EXDEV: a move falls back to copy + verify + remove and is listed in moved_by_copy', (t) => {
    const h = legacyRuntimeHome();
    t.after(h.cleanup);
    const fsImpl = {
      ...fs,
      renameSync() {
        const err = new Error('EXDEV: cross-device link not permitted');
        err.code = 'EXDEV';
        throw err;
      },
    };
    const r = migrateLegacyRuntime({ userHome: h.home, now: NOW, fsImpl });
    for (const rel of MOVED_FILES) {
      assert.equal(read(h.aoforge, rel), h.files[rel], `${rel} copied across`);
      assert.equal(exists(h.legacy, rel), false, `${rel} removed after the verified copy`);
    }
    assert.deepEqual(r.moved_by_copy, r.moved);
    const m = JSON.parse(fs.readFileSync(r.marker, 'utf8'));
    assert.deepEqual(m.moved_by_copy, r.moved);
  });

  test('7c. a failure mid-way throws and writes no marker', (t) => {
    const h = legacyRuntimeHome();
    t.after(h.cleanup);
    const fsImpl = {
      ...fs,
      copyFileSync(src, ...rest) {
        if (src.endsWith('audit.log')) {
          const err = new Error(`EACCES: permission denied, copyfile '${src}'`);
          err.code = 'EACCES';
          throw err;
        }
        return fs.copyFileSync(src, ...rest);
      },
    };
    assert.throws(() => migrateLegacyRuntime({ userHome: h.home, now: NOW, fsImpl }), /EACCES/);
    assert.equal(exists(h.aoforge, MARKER_FILE), false);
    assert.equal(read(h.legacy, `state/outbox/${K}.json`), h.files[`state/outbox/${K}.json`], 'nothing moved');
  });
});
