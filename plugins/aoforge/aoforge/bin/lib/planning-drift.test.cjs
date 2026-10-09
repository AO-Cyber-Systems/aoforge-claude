'use strict';

/**
 * Tests for lib/planning-drift.cjs — store-mode cache drift detection (TRD 48-09, D-15, GWP-03).
 *
 * Tests 1-8 use hand-built temp trees and injected `readIndex` / `readLedger` stubs, so they never touch the outbox state
 * dir. The "real readers" block wires the defaults to a temp `AOFORGE_OUTBOX_DIR` via hermeticEnv(); nothing here
 * reaches the real ~/.claude or GitHub.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const drift = require('./planning-drift.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghCache = require('./gh-cache.cjs');
const outbox = require('./gh-outbox.cjs');
const ledgerLib = require('./planning-ledger.cjs');
const { hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const hash = (text) => ghTrd.contentHash(text);
const HEADER = ghCache.GENERATED_HEADER;

const TRD_REL = 'objectives/48-demo/48-09-demo-TRD.md';
const TRD_TEXT = '# TRD 48-09\n\nbody\n';
const TRD_EDITED = '# TRD 48-09\n\nbody, edited with Bash\n';

let tmp = null;

afterEach(() => {
  drift._setDriftReaders(null);
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

// ─── fixtures ────────────────────────────────────────────────────────────────

const STORE_CONFIG = { github: { enabled: true, store: true, repo: 'acme/demo' } };

/** A temp project with `.aoforge/config.json` = `config` (null: no config file). */
function makeProject(config = STORE_CONFIG) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-drift-test-'));
  fs.mkdirSync(path.join(tmp, '.aoforge'), { recursive: true });
  if (config !== null) fs.writeFileSync(path.join(tmp, '.aoforge', 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return tmp;
}

function put(root, rel, text) {
  const abs = path.join(root, '.aoforge', ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return abs;
}

/** Injected reader stubs over plain objects; `calls` counts every invocation. */
function stubReaders({ index = {}, ledger = {} } = {}) {
  const calls = { index: 0, ledger: 0 };
  return {
    calls,
    readIndex: () => {
      calls.index++;
      return index;
    },
    readLedger: () => {
      calls.ledger++;
      const entries = {};
      for (const [rel, h] of Object.entries(ledger)) entries[rel] = { hash: h, at: '2026-10-01T00:00:00.000Z', verb: 'x' };
      return { version: 1, entries, corrupt: false };
    },
  };
}

const pick = (list) => list.map(({ rel, verb, reason }) => ({ rel, verb, reason }));

// ─── 1. local mode ───────────────────────────────────────────────────────────

describe('findCacheDrift: local mode is not applicable', () => {
  const LOCAL_CONFIGS = [
    ['no github block', {}],
    ['github.enabled true, store absent (this repo’s shape)', { github: { enabled: true, repo: 'acme/demo' } }],
    ['github.enabled false, store true', { github: { enabled: false, store: true } }],
    ['store is the string "true"', { github: { enabled: true, store: 'true' } }],
    ['no config.json at all', null],
  ];

  for (const [name, config] of LOCAL_CONFIGS) {
    test(`1. ${name} -> {applicable:false, drift:[]} and the readers are never called`, () => {
      const root = makeProject(config);
      put(root, TRD_REL, TRD_TEXT); // would be no-baseline drift in store mode
      const r = stubReaders();
      const out = drift.findCacheDrift(root, { readIndex: r.readIndex, readLedger: r.readLedger });
      assert.strictEqual(out.applicable, false);
      assert.deepStrictEqual(out.drift, []);
      assert.deepStrictEqual(r.calls, { index: 0, ledger: 0 });
    });
  }

  test('1b. local mode never calls readers installed through _setDriftReaders either', () => {
    const root = makeProject({});
    put(root, TRD_REL, TRD_TEXT);
    const r = stubReaders();
    drift._setDriftReaders({ readIndex: r.readIndex, readLedger: r.readLedger });
    const out = drift.findCacheDrift(root);
    assert.strictEqual(out.applicable, false);
    assert.deepStrictEqual(r.calls, { index: 0, ledger: 0 });
  });
});

// ─── 2-5. the hash rule on a TRD ─────────────────────────────────────────────

describe('findCacheDrift: store mode, the content-hash rule', () => {
  test('2. a TRD whose bytes equal its cache baseline is not drift', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    const r = stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) } });
    const out = drift.findCacheDrift(root, r);
    assert.strictEqual(out.applicable, true);
    assert.deepStrictEqual(out.drift, []);
    assert.deepStrictEqual(r.calls, { index: 1, ledger: 1 });
  });

  test('3. a TRD changed after its baseline, with no ledger entry, is drift `changed` owned by `plan put-trd`', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_EDITED);
    const out = drift.findCacheDrift(root, stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) } }));
    assert.deepStrictEqual(pick(out.drift), [{ rel: TRD_REL, verb: 'plan put-trd', reason: 'changed' }]);

    const d = out.drift[0];
    assert.strictEqual(
      d.message,
      `${TRD_REL} was changed outside an aof-tools verb (changed); use \`aof-tools plan put-trd\` to publish it, ` +
        "or `aof-tools gh pull --all --force` to restore GitHub's version"
    );
    assert.strictEqual(d.fix, d.message, 'fix carries the same text (D-15)');
  });

  test('4a. a file a verb wrote (ledger hash equals current) is not drift, with or without a baseline', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_EDITED);
    const withBaseline = drift.findCacheDrift(
      root,
      stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) }, ledger: { [TRD_REL]: hash(TRD_EDITED) } })
    );
    assert.deepStrictEqual(withBaseline.drift, [], 'pending verb write over an old baseline');

    const freshVerbFile = drift.findCacheDrift(root, stubReaders({ ledger: { [TRD_REL]: hash(TRD_EDITED) } }));
    assert.deepStrictEqual(freshVerbFile.drift, [], 'verb-created file not flushed yet: no baseline, ledger matches');
  });

  test('4b. a stale ledger hash (file changed again after the verb) is drift `changed`', () => {
    const root = makeProject();
    put(root, TRD_REL, `${TRD_EDITED}and again\n`);
    const both = drift.findCacheDrift(
      root,
      stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) }, ledger: { [TRD_REL]: hash(TRD_EDITED) } })
    );
    assert.deepStrictEqual(pick(both.drift), [{ rel: TRD_REL, verb: 'plan put-trd', reason: 'changed' }]);

    const ledgerOnly = drift.findCacheDrift(root, stubReaders({ ledger: { [TRD_REL]: hash(TRD_EDITED) } }));
    assert.deepStrictEqual(
      pick(ledgerOnly.drift),
      [{ rel: TRD_REL, verb: 'plan put-trd', reason: 'changed' }],
      'a verb wrote it once, so it is not no-baseline'
    );
  });

  test('5. a cache file with no baseline and no ledger entry is drift `no-baseline`', () => {
    const root = makeProject();
    put(root, 'PROJECT.md', '# Project\n');
    const out = drift.findCacheDrift(root, stubReaders());
    assert.deepStrictEqual(pick(out.drift), [{ rel: 'PROJECT.md', verb: 'doc put', reason: 'no-baseline' }]);
    assert.match(out.drift[0].message, /^PROJECT\.md was changed outside an aof-tools verb \(no-baseline\); use `aof-tools doc put`/);
  });

  test('5b. drift is sorted by rel and lists every drifted file once', () => {
    const root = makeProject();
    put(root, 'REQUIREMENTS.md', '# R\n');
    put(root, TRD_REL, TRD_EDITED);
    put(root, 'PROJECT.md', '# P\n');
    const out = drift.findCacheDrift(root, stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) } }));
    assert.deepStrictEqual(
      out.drift.map((d) => d.rel),
      ['PROJECT.md', 'REQUIREMENTS.md', TRD_REL]
    );
    assert.strictEqual(out.checked, 3);
    assert.deepStrictEqual(out.notes, []);
  });

  test('5c. a CRLF copy of a baselined file is not drift (contentHash normalises line endings)', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT.replace(/\n/g, '\r\n'));
    const out = drift.findCacheDrift(root, stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) } }));
    assert.deepStrictEqual(out.drift, []);
  });
});

// ─── 6. generated views ──────────────────────────────────────────────────────

describe('findCacheDrift: generated views', () => {
  const ROADMAP = `${HEADER}\n# Roadmap\n`;

  test('6a. ROADMAP.md with the generated header and a matching baseline is not drift', () => {
    const root = makeProject();
    put(root, 'ROADMAP.md', ROADMAP);
    const out = drift.findCacheDrift(root, stubReaders({ index: { 'ROADMAP.md': hash(ROADMAP) } }));
    assert.deepStrictEqual(out.drift, []);
  });

  test('6b. ROADMAP.md without GENERATED_HEADER is drift `hand-edited`, even when its hash is baselined', () => {
    const root = makeProject();
    const hand = '# Roadmap\n\nhand written\n';
    put(root, 'ROADMAP.md', hand);
    const out = drift.findCacheDrift(root, stubReaders({ index: { 'ROADMAP.md': hash(hand) } }));
    assert.deepStrictEqual(pick(out.drift), [{ rel: 'ROADMAP.md', verb: 'gh pull --all', reason: 'hand-edited' }]);
    const d = out.drift[0];
    assert.match(d.message, /^ROADMAP\.md was changed outside an aof-tools verb \(hand-edited\); regenerate with `aof-tools gh pull --all`/);
    assert.match(d.message, /move it aside/, 'pull never overwrites a file without the header, so the message says so');
    assert.doesNotMatch(d.message, /to publish it/);
    assert.strictEqual(d.fix, d.message);
  });

  test('6c. STATE.md / MILESTONES.md with the header but changed bytes are drift `changed` with the regenerate text', () => {
    const root = makeProject();
    put(root, 'STATE.md', `${HEADER}\n# State\nedited\n`);
    put(root, 'MILESTONES.md', `${HEADER}\n# Milestones\n`);
    const out = drift.findCacheDrift(
      root,
      stubReaders({ index: { 'STATE.md': hash(`${HEADER}\n# State\n`) } })
    );
    assert.deepStrictEqual(pick(out.drift), [
      { rel: 'MILESTONES.md', verb: 'gh pull --all', reason: 'no-baseline' },
      { rel: 'STATE.md', verb: 'gh pull --all', reason: 'changed' },
    ]);
    for (const d of out.drift) {
      assert.match(d.message, /regenerate with `aof-tools gh pull --all`$/, d.message);
      assert.doesNotMatch(d.message, /move it aside/);
    }
  });

  test('6d. the module header constant is gh-cache GENERATED_HEADER', () => {
    assert.strictEqual(drift.GENERATED_HEADER, ghCache.GENERATED_HEADER);
  });
});

// ─── 7. classes that are never checked ───────────────────────────────────────

describe('findCacheDrift: runtime, tracked-config and wiki files are never flagged', () => {
  test('7. state.json, .skill-active, STATE_ARCHIVE.md, evidence/, config.json, STACK.md and wiki/** -> no drift', () => {
    const root = makeProject();
    put(root, 'state.json', '{}\n');
    put(root, '.skill-active', '{}\n');
    put(root, 'STATE_ARCHIVE.md', '# archive\n');
    put(root, 'evidence/shot.txt', 'x\n');
    put(root, 'objectives/48-demo/.DS_Store', 'x');
    put(root, 'STACK.md', '# Stack\n');
    put(root, 'wiki/Home.md', '# Home\n');
    put(root, 'wiki/Objective-48.md', '# 48\n');
    put(root, 'unknown-notes.txt', 'runtime by default\n');
    const r = stubReaders();
    const out = drift.findCacheDrift(root, r);
    assert.strictEqual(out.applicable, true);
    assert.deepStrictEqual(out.drift, []);
    assert.strictEqual(out.checked, 0);
  });
});

// ─── 8. entity files ─────────────────────────────────────────────────────────

describe('findCacheDrift: todo / debug / quick entities are checked like other cache files', () => {
  test('8. each names its own verb', () => {
    const root = makeProject();
    put(root, 'todos/pending/fix-flaky-test.md', '# todo\n');
    put(root, 'todos/completed/old-thing.md', '# done\n');
    put(root, 'debug/login-loop.md', '# debug\n');
    put(root, 'quick/3-rename-flag/3-JOB.md', '# quick\n');
    put(root, 'quick/3-rename-flag/3-SUMMARY.md', '# quick summary\n');
    const baselined = '# baselined todo\n';
    put(root, 'todos/pending/baselined.md', baselined);
    const out = drift.findCacheDrift(root, stubReaders({ index: { 'todos/pending/baselined.md': hash(baselined) } }));
    assert.deepStrictEqual(pick(out.drift), [
      { rel: 'debug/login-loop.md', verb: 'debug put', reason: 'no-baseline' },
      { rel: 'quick/3-rename-flag/3-JOB.md', verb: 'quick put', reason: 'no-baseline' },
      { rel: 'quick/3-rename-flag/3-SUMMARY.md', verb: 'quick put', reason: 'no-baseline' },
      { rel: 'todos/completed/old-thing.md', verb: 'todo add', reason: 'no-baseline' },
      { rel: 'todos/pending/fix-flaky-test.md', verb: 'todo add', reason: 'no-baseline' },
    ]);
  });
});

// ─── failure, cost and the reader seam ──────────────────────────────────────

describe('findCacheDrift: failures, the file cap and _setDriftReaders', () => {
  test('9. a reader that throws propagates (validate turns it into W056)', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    assert.throws(
      () => drift.findCacheDrift(root, { readIndex: () => { throw new Error('index boom'); }, readLedger: () => ({ entries: {} }) }),
      /index boom/
    );
  });

  test('10. a reader returning a malformed shape throws rather than reporting every file as drift', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    assert.throws(() => drift.findCacheDrift(root, { readIndex: () => null, readLedger: () => ({ entries: {} }) }), /cache index/);
    assert.throws(() => drift.findCacheDrift(root, { readIndex: () => ({}), readLedger: () => ({}) }), /ledger/);
    assert.throws(
      () => drift.findCacheDrift(root, { readIndex: () => ({}), readLedger: () => ({ entries: {}, corrupt: true }) }),
      /ledger.*unreadable/
    );
  });

  test('11. beyond maxFiles only the first N (sorted) are hashed and a note says how many were skipped', () => {
    const root = makeProject();
    for (const n of [1, 2, 3, 4]) put(root, `codebase/doc-${n}.md`, `# ${n}\n`);
    const out = drift.findCacheDrift(root, { ...stubReaders(), maxFiles: 2 });
    assert.deepStrictEqual(
      out.drift.map((d) => d.rel),
      ['codebase/doc-1.md', 'codebase/doc-2.md']
    );
    assert.strictEqual(out.checked, 2);
    assert.strictEqual(out.notes.length, 1);
    assert.match(out.notes[0], /checked the first 2 of 4/);
    assert.strictEqual(drift.MAX_FILES, 5000);
  });

  test('12. _setDriftReaders installs module-level readers; opts still win; null restores the defaults', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    const seam = stubReaders({ index: { [TRD_REL]: hash(TRD_TEXT) } });
    drift._setDriftReaders({ readIndex: seam.readIndex, readLedger: seam.readLedger });
    assert.deepStrictEqual(drift.findCacheDrift(root).drift, []);
    assert.deepStrictEqual(seam.calls, { index: 1, ledger: 1 });

    const explicit = stubReaders();
    assert.deepStrictEqual(pick(drift.findCacheDrift(root, explicit).drift), [
      { rel: TRD_REL, verb: 'plan put-trd', reason: 'no-baseline' },
    ]);
    assert.deepStrictEqual(seam.calls, { index: 1, ledger: 1 }, 'opts readers take precedence over the seam');

    drift._setDriftReaders({ readIndex: () => { throw new Error('seam boom'); } });
    assert.throws(() => drift.findCacheDrift(root), /seam boom/);
    drift._setDriftReaders(null);
  });
});

// ─── the default readers, against a temp outbox state dir ───────────────────

describe('findCacheDrift: default readers (47 cache index + 48-01 ledger) under hermeticEnv', () => {
  let env = null;

  beforeEach(() => {
    env = hermeticEnv();
  });

  afterEach(() => {
    if (env) env.restore();
    env = null;
  });

  test('13. recordCacheBaseline clears drift; a Bash edit is drift; ledger.record of the new bytes clears it again', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    assert.deepStrictEqual(pick(drift.findCacheDrift(root).drift), [
      { rel: TRD_REL, verb: 'plan put-trd', reason: 'no-baseline' },
    ]);

    const rec = ghCache.recordCacheBaseline(root, [TRD_REL]);
    assert.deepStrictEqual(rec.recorded, [TRD_REL]);
    assert.deepStrictEqual(drift.findCacheDrift(root).drift, []);

    put(root, TRD_REL, TRD_EDITED);
    assert.deepStrictEqual(pick(drift.findCacheDrift(root).drift), [
      { rel: TRD_REL, verb: 'plan put-trd', reason: 'changed' },
    ]);

    ledgerLib.record(root, TRD_REL, TRD_EDITED, { verb: 'plan put-trd' });
    assert.deepStrictEqual(drift.findCacheDrift(root).drift, []);

    // Every byte of outbox state lives under the temp AOFORGE_OUTBOX_DIR.
    assert.ok(ledgerLib.ledgerPath(root).startsWith(env.env.AOFORGE_OUTBOX_DIR));
  });

  test('14. the default index reader agrees with gh-outbox.readCacheIndex', () => {
    const root = makeProject();
    const index = { [TRD_REL]: hash(TRD_TEXT), 'PROJECT.md': hash('# P\n') };
    assert.deepStrictEqual(outbox.writeCacheIndex(root, index), { ok: true });
    assert.deepStrictEqual(drift.defaultReadIndex(root), outbox.readCacheIndex(root));
    assert.deepStrictEqual(drift.defaultReadIndex(fs.mkdtempSync(path.join(env.root, 'other-'))), {}, 'missing index is {}');
  });

  test('15. a corrupt cache index throws and is left byte-identical (validate never quarantines)', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    assert.deepStrictEqual(outbox.writeCacheIndex(root, { [TRD_REL]: hash(TRD_TEXT) }), { ok: true });
    const file = path.join(env.env.AOFORGE_OUTBOX_DIR, `${outbox.repoKey(root)}.cache.json`);
    assert.ok(fs.existsSync(file), `index at ${file}`);
    fs.writeFileSync(file, '{not json');
    assert.throws(() => drift.findCacheDrift(root), /cache index.*unreadable/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{not json');
    assert.deepStrictEqual(
      fs.readdirSync(path.dirname(file)).filter((n) => n.includes('.corrupt-')),
      [],
      'nothing quarantined'
    );
  });

  test('16. a corrupt ledger throws (planning-ledger reports corrupt without writing)', () => {
    const root = makeProject();
    put(root, TRD_REL, TRD_TEXT);
    const file = ledgerLib.ledgerPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '[]');
    assert.throws(() => drift.findCacheDrift(root), /ledger.*unreadable/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[]');
  });
});
