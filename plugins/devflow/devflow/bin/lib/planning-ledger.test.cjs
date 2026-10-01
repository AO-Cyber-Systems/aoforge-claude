'use strict';

// planning-ledger.test.cjs — Test list (TRD 48-01, Task 3)
//
//  12. record(root, rel, text, {verb, now}) writes {hash: contentHash(text), at, verb} to <stateDir>/<repoKey>.verb-writes.json,
//      beside the outbox journal and cache index under the hermetic state dir; nothing appears under root or HOME.
//  13. matches() is true for the recorded text and false after the file changes; forget() removes entries; a missing ledger reads
//      empty; a corrupt ledger reads {entries:{}, corrupt:true} and is never overwritten silently (a write quarantines it to
//      <file>.corrupt-<ts> and reports the path, the outbox journal's policy).
//  14. settleCandidates(root, readFile) splits ledger rels into those whose current bytes still match and those that drifted.
//  15. Two roots get two ledger files (repoKey).
//
// Every test runs under hermeticEnv() (DEVFLOW_OUTBOX_DIR and HOME point at temps). Nothing touches ~/.claude or GitHub.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ledger = require('./planning-ledger.cjs');
const outbox = require('./gh-outbox.cjs');
const ghTrd = require('./gh-trd.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const TRD_REL = 'objectives/07-x/07-01-a-TRD.md';
const TRD_TEXT = '# TRD 07-01\n\nbody\n';
const NOW = new Date('2026-10-01T12:00:00.000Z');

let env;
let root;

beforeEach(() => {
  env = hermeticEnv();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-ledger-root-'));
  fs.mkdirSync(path.join(root, '.planning'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  env.restore();
});

/** Every path under `dir`, relative, sorted. */
function tree(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      out.push(rel);
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

function writePlanning(rel, text) {
  const file = path.join(root, '.planning', ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

describe('record and location', () => {
  test('12a. the ledger is <stateDir>/<repoKey>.verb-writes.json, beside the journal and the cache index', () => {
    const file = ledger.ledgerPath(root);
    assert.strictEqual(file, path.join(env.env.DEVFLOW_OUTBOX_DIR, `${outbox.repoKey(root)}.verb-writes.json`));
    assert.strictEqual(path.dirname(file), path.dirname(outbox.journalPath(root)));

    assert.deepStrictEqual(outbox.writeCacheIndex(root, { [TRD_REL]: 'sha256:x' }), { ok: true });
    const cacheIndex = path.join(env.env.DEVFLOW_OUTBOX_DIR, `${outbox.repoKey(root)}.cache.json`);
    assert.ok(fs.existsSync(cacheIndex), 'the cache index lives in the same dir under the same key');
    assert.strictEqual(path.dirname(file), path.dirname(cacheIndex));
  });

  test('12b. record writes {hash, at, verb} and nothing under root or HOME', () => {
    const before = tree(root);
    const res = ledger.record(root, TRD_REL, TRD_TEXT, { verb: 'plan put-trd', now: NOW });

    const file = ledger.ledgerPath(root);
    assert.strictEqual(res.path, file);
    assert.strictEqual(res.recovered, null);
    assert.deepStrictEqual(res.entry, { hash: ghTrd.contentHash(TRD_TEXT), at: '2026-10-01T12:00:00.000Z', verb: 'plan put-trd' });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      version: 1,
      entries: { [TRD_REL]: { hash: ghTrd.contentHash(TRD_TEXT), at: '2026-10-01T12:00:00.000Z', verb: 'plan put-trd' } },
    });
    assert.ok(file.startsWith(env.env.DEVFLOW_OUTBOX_DIR + path.sep), 'under the hermetic state dir');

    assert.deepStrictEqual(tree(root), before, 'nothing appears under the project');
    assert.deepStrictEqual(fs.readdirSync(env.env.HOME), [], 'nothing appears under HOME');
  });

  test('12c. the hash is gh-trd contentHash, so CRLF and LF text record the same hash (the cache index scheme)', () => {
    ledger.record(root, TRD_REL, 'a\r\nb\r\n', { verb: 'plan put-trd', now: NOW });
    assert.strictEqual(ledger.readLedger(root).entries[TRD_REL].hash, ghTrd.contentHash('a\nb\n'));
  });

  test('12d. re-recording a rel replaces its entry; entries are written sorted by rel', () => {
    ledger.record(root, 'todos/pending/b.md', 'b', { verb: 'todo add', now: NOW });
    ledger.record(root, 'PROJECT.md', 'p1', { verb: 'doc put', now: NOW });
    ledger.record(root, 'PROJECT.md', 'p2', { verb: 'doc put', now: new Date('2026-10-02T00:00:00.000Z') });
    const raw = JSON.parse(fs.readFileSync(ledger.ledgerPath(root), 'utf8'));
    assert.deepStrictEqual(Object.keys(raw.entries), ['PROJECT.md', 'todos/pending/b.md']);
    assert.deepStrictEqual(raw.entries['PROJECT.md'], { hash: ghTrd.contentHash('p2'), at: '2026-10-02T00:00:00.000Z', verb: 'doc put' });
  });

  test('12e. now may be a Date, epoch ms or an ISO string; omitted it is the current time', () => {
    ledger.record(root, 'a.md', 'a', { verb: 'doc put', now: Date.parse('2026-10-01T01:02:03.000Z') });
    ledger.record(root, 'b.md', 'b', { verb: 'doc put', now: '2026-10-01T04:05:06.000Z' });
    const t0 = Date.now();
    ledger.record(root, 'c.md', 'c', { verb: 'doc put' });
    const { entries } = ledger.readLedger(root);
    assert.strictEqual(entries['a.md'].at, '2026-10-01T01:02:03.000Z');
    assert.strictEqual(entries['b.md'].at, '2026-10-01T04:05:06.000Z');
    assert.ok(Date.parse(entries['c.md'].at) >= t0 - 1000);
  });

  test('12f. bad input throws before anything is written: unsafe rel, non-string text', () => {
    assert.throws(() => ledger.record(root, '../escape.md', 'x', { verb: 'doc put', now: NOW }), TypeError);
    assert.throws(() => ledger.record(root, '/abs.md', 'x', { verb: 'doc put', now: NOW }), TypeError);
    assert.throws(() => ledger.record(root, 'a.md', null, { verb: 'doc put', now: NOW }), TypeError);
    assert.strictEqual(fs.existsSync(ledger.ledgerPath(root)), false);
  });

  test('12g. reading never creates the state dir', () => {
    assert.deepStrictEqual(ledger.readLedger(root), { version: 1, entries: {}, corrupt: false });
    assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT), false);
    assert.deepStrictEqual(ledger.settleCandidates(root, () => null), { matching: [], drifted: [] });
    assert.strictEqual(fs.existsSync(env.env.DEVFLOW_OUTBOX_DIR), false);
  });

  test('12h. opts.env / opts.home locate the state dir like the outbox does', () => {
    const other = path.join(env.root, 'other-outbox');
    const res = ledger.record(root, TRD_REL, TRD_TEXT, { verb: 'plan put-trd', now: NOW, env: { DEVFLOW_OUTBOX_DIR: other } });
    assert.strictEqual(res.path, path.join(other, `${outbox.repoKey(root)}.verb-writes.json`));
    assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT, { env: { DEVFLOW_OUTBOX_DIR: other } }), true);
    assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT), false, 'the default state dir holds nothing');

    const home = path.join(env.root, 'alt-home');
    assert.strictEqual(
      ledger.ledgerPath(root, { env: {}, home }),
      path.join(home, '.claude', 'devflow', 'state', 'outbox', `${outbox.repoKey(root)}.verb-writes.json`),
    );
  });
});

describe('matches, forget, missing and corrupt ledgers', () => {
  test('13a. matches is true for the recorded text, false once the file changes', () => {
    ledger.record(root, TRD_REL, TRD_TEXT, { verb: 'plan put-trd', now: NOW });
    assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT), true);
    assert.strictEqual(ledger.matches(root, TRD_REL, `${TRD_TEXT}edited\n`), false);
    assert.strictEqual(ledger.matches(root, TRD_REL, null), false, 'a deleted file does not match');
    assert.strictEqual(ledger.matches(root, 'objectives/07-x/OBJECTIVE.md', TRD_TEXT), false, 'an unrecorded rel does not match');
  });

  test('13b. forget removes the named rels and keeps the rest', () => {
    ledger.record(root, 'a.md', 'a', { verb: 'doc put', now: NOW });
    ledger.record(root, 'b.md', 'b', { verb: 'doc put', now: NOW });
    ledger.record(root, 'c.md', 'c', { verb: 'doc put', now: NOW });
    const res = ledger.forget(root, ['a.md', 'c.md', 'never-recorded.md']);
    assert.deepStrictEqual(res.removed, ['a.md', 'c.md']);
    assert.deepStrictEqual(Object.keys(ledger.readLedger(root).entries), ['b.md']);
    assert.strictEqual(ledger.matches(root, 'a.md', 'a'), false);
  });

  test('13c. forget accepts a single rel; forgetting nothing does not create a ledger', () => {
    assert.deepStrictEqual(ledger.forget(root, ['x.md']).removed, []);
    assert.strictEqual(fs.existsSync(ledger.ledgerPath(root)), false);
    ledger.record(root, 'x.md', 'x', { verb: 'doc put', now: NOW });
    assert.deepStrictEqual(ledger.forget(root, 'x.md').removed, ['x.md']);
    assert.deepStrictEqual(ledger.readLedger(root).entries, {});
  });

  test('13d. a missing ledger reads as empty', () => {
    assert.deepStrictEqual(ledger.readLedger(root), { version: 1, entries: {}, corrupt: false });
  });

  for (const [label, text] of [
    ['unparseable JSON', '{"version":1,"entries":{'],
    ['wrong version', '{"version":2,"entries":{}}'],
    ['entries not an object', '{"version":1,"entries":[]}'],
    ['an entry without a hash', '{"version":1,"entries":{"a.md":{"at":"x","verb":"doc put"}}}'],
  ]) {
    test(`13e. a corrupt ledger (${label}) reads {entries:{}, corrupt:true} and is left byte-identical`, () => {
      const file = ledger.ledgerPath(root);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      const got = ledger.readLedger(root);
      assert.deepStrictEqual(got.entries, {});
      assert.strictEqual(got.corrupt, true);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), text, 'reading never rewrites it');
      assert.strictEqual(ledger.matches(root, 'a.md', 'a'), false);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), text);
    });
  }

  test('13f. a write over a corrupt ledger quarantines it first and reports where (never a silent overwrite)', () => {
    const file = ledger.ledgerPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not json');
    const res = ledger.record(root, TRD_REL, TRD_TEXT, { verb: 'plan put-trd', now: NOW });
    assert.ok(res.recovered, 'the recovery is reported');
    assert.strictEqual(path.dirname(res.recovered.corrupt_path), path.dirname(file));
    assert.ok(path.basename(res.recovered.corrupt_path).startsWith(`${path.basename(file)}.corrupt-`));
    assert.strictEqual(fs.readFileSync(res.recovered.corrupt_path, 'utf8'), 'not json', 'the original bytes are kept');
    assert.strictEqual(ledger.readLedger(root).corrupt, false);
    assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT), true);
  });

  test('13g. forget over a corrupt ledger also quarantines and reports', () => {
    const file = ledger.ledgerPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[]');
    const res = ledger.forget(root, ['a.md']);
    assert.deepStrictEqual(res.removed, []);
    assert.ok(res.recovered && fs.readFileSync(res.recovered.corrupt_path, 'utf8') === '[]');
  });
});

describe('settleCandidates', () => {
  test('14a. splits the ledger into rels whose bytes still match and rels that drifted (edited or deleted)', () => {
    ledger.record(root, 'objectives/07-x/07-01-a-TRD.md', 'trd', { verb: 'plan put-trd', now: NOW });
    ledger.record(root, 'PROJECT.md', 'project', { verb: 'doc put', now: NOW });
    ledger.record(root, 'todos/pending/a.md', 'todo', { verb: 'todo add', now: NOW });
    ledger.record(root, 'debug/x.md', 'debug', { verb: 'debug put', now: NOW });

    const current = {
      'objectives/07-x/07-01-a-TRD.md': 'trd',
      'PROJECT.md': 'project, edited by hand',
      'todos/pending/a.md': 'todo',
      // debug/x.md deleted
    };
    const seen = [];
    const got = ledger.settleCandidates(root, (rel) => {
      seen.push(rel);
      return Object.hasOwn(current, rel) ? current[rel] : null;
    });
    assert.deepStrictEqual(got, {
      matching: ['objectives/07-x/07-01-a-TRD.md', 'todos/pending/a.md'],
      drifted: ['PROJECT.md', 'debug/x.md'],
    });
    assert.deepStrictEqual(seen.sort(), ['PROJECT.md', 'debug/x.md', 'objectives/07-x/07-01-a-TRD.md', 'todos/pending/a.md']);
  });

  test('14b. without a readFile it reads <root>/.planning/<rel>; a readFile that throws counts as drifted', () => {
    writePlanning('PROJECT.md', 'project');
    writePlanning('REQUIREMENTS.md', 'requirements');
    ledger.record(root, 'PROJECT.md', 'project', { verb: 'doc put', now: NOW });
    ledger.record(root, 'REQUIREMENTS.md', 'old requirements', { verb: 'doc put', now: NOW });
    ledger.record(root, 'research/gone.md', 'gone', { verb: 'doc put', now: NOW });
    assert.deepStrictEqual(ledger.settleCandidates(root), { matching: ['PROJECT.md'], drifted: ['REQUIREMENTS.md', 'research/gone.md'] });

    const throwing = ledger.settleCandidates(root, () => {
      throw new Error('EACCES');
    });
    assert.deepStrictEqual(throwing, { matching: [], drifted: ['PROJECT.md', 'REQUIREMENTS.md', 'research/gone.md'] });
  });

  test('14c. settling the matching rels with forget leaves only the drifted ones', () => {
    ledger.record(root, 'a.md', 'a', { verb: 'doc put', now: NOW });
    ledger.record(root, 'b.md', 'b', { verb: 'doc put', now: NOW });
    const { matching } = ledger.settleCandidates(root, (rel) => (rel === 'a.md' ? 'a' : 'b, edited'));
    ledger.forget(root, matching);
    assert.deepStrictEqual(Object.keys(ledger.readLedger(root).entries), ['b.md']);
  });
});

describe('per-repo files', () => {
  test('15. two roots get two ledger files', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-ledger-other-'));
    try {
      assert.notStrictEqual(ledger.ledgerPath(root), ledger.ledgerPath(other));
      ledger.record(root, TRD_REL, TRD_TEXT, { verb: 'plan put-trd', now: NOW });
      ledger.record(other, TRD_REL, 'different text', { verb: 'plan put-trd', now: NOW });
      assert.strictEqual(ledger.matches(root, TRD_REL, TRD_TEXT), true);
      assert.strictEqual(ledger.matches(other, TRD_REL, TRD_TEXT), false);
      assert.strictEqual(ledger.matches(other, TRD_REL, 'different text'), true);
      assert.deepStrictEqual(fs.readdirSync(env.env.DEVFLOW_OUTBOX_DIR).sort(), [
        `${outbox.repoKey(other)}.verb-writes.json`,
        `${outbox.repoKey(root)}.verb-writes.json`,
      ].sort());
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('module hygiene', () => {
  test('never spawns: no child_process, and requires only the outbox, gh-trd, sync-state and planning-paths', () => {
    const src = fs.readFileSync(path.join(__dirname, 'planning-ledger.cjs'), 'utf8');
    assert.doesNotMatch(src, /child_process/);
    const required = [...new Set([...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]))];
    const allowed = ['fs', 'path', './gh-outbox.cjs', './gh-trd.cjs', './sync-state.cjs', './planning-paths.cjs'];
    assert.deepStrictEqual(required.filter((r) => !allowed.includes(r)), []);
  });
});
