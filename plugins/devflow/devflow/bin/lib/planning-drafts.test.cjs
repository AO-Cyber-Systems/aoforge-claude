'use strict';

// planning-drafts.test.cjs (TRD 69-01, tests 7-17) — draft base records, the staleness rule, reseed and the publish
// check. In-process: process.env.TMPDIR is pointed at the fixture's tmp dir for each test (os.tmpdir() reads it on
// every call) and restored afterwards, so no draft lands in the real temp tree. Hand-built fixtures only.
//
//   7  seed from live (base, mtime)      8  no live: base with a null hash      9  an edited draft is kept
//   10 live changed: reseed + .stale     11 draft already equals live           12 no base: the mtime fallback
//   13 an unparseable base is no base    14 live missing: not stale             15 checkDraftBase
//   16 recordPublished                   17 an unsafe rel throws

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const drafts = require('./planning-drafts.cjs');
const { makeDraftProject } = require('./__fixtures__/draft-fixtures.cjs');

const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const read = (file) => fs.readFileSync(file, 'utf8');
const readBase = (draft) => JSON.parse(read(draft + drafts.BASE_SUFFIX));

const REL = 'PROJECT.md';
const T = Date.UTC(2026, 9, 1, 12, 0, 0);

let P;
let savedTmp;

beforeEach(() => {
  P = makeDraftProject();
  savedTmp = process.env.TMPDIR;
  process.env.TMPDIR = P.tmp;
});

afterEach(() => {
  if (savedTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmp;
  P.cleanup();
});

describe('prepareDraft: seeding', () => {
  test('7. no draft, live exists: writes the live text and a base hash of it', () => {
    const live = read(P.livePath(REL));
    const now = new Date(Date.UTC(2026, 9, 2, 8, 30, 0));
    const res = drafts.prepareDraft(P.dir, REL, { now });
    assert.equal(res.path, drafts.draftFileFor(P.dir, REL));
    assert.equal(res.seeded, true);
    assert.equal(res.reseeded, false);
    assert.equal(res.stale_copy, null);
    assert.equal(read(res.path), live);
    const base = readBase(res.path);
    assert.equal(base.rel, REL);
    assert.equal(base.sha256, sha(live));
    assert.equal(base.seeded_at, now.toISOString());
    // Written, not copied: a copy can keep the source mtime on macOS, and the draft must not look older than live.
    assert.ok(fs.statSync(res.path).mtimeMs >= fs.statSync(P.livePath(REL)).mtimeMs);
  });

  test('8. no draft, no live: no draft file, a base with a null hash, the directory exists', () => {
    const res = drafts.prepareDraft(P.dir, 'ROADMAP.md');
    assert.equal(res.seeded, false);
    assert.equal(res.reseeded, false);
    assert.equal(fs.existsSync(res.path), false);
    assert.ok(fs.statSync(path.dirname(res.path)).isDirectory());
    const base = readBase(res.path);
    assert.equal(base.rel, 'ROADMAP.md');
    assert.equal(base.sha256, null);
  });

  test('9. a draft edited after seeding, with live unchanged, is never touched', () => {
    const first = drafts.prepareDraft(P.dir, REL);
    fs.writeFileSync(first.path, 'my edit\n');
    const again = drafts.prepareDraft(P.dir, REL);
    assert.equal(again.reseeded, false);
    assert.equal(again.seeded, false);
    assert.equal(again.path, first.path);
    assert.equal(read(first.path), 'my edit\n');
    assert.equal(fs.existsSync(first.path + drafts.STALE_SUFFIX), false);
  });
});

describe('prepareDraft: a stale draft', () => {
  test('10. live changed after seeding: reseeded, the old draft kept at .stale, the base moves on', () => {
    const first = drafts.prepareDraft(P.dir, REL);
    fs.writeFileSync(first.path, 'my edit\n');
    P.setLive(REL, '# Project\n\nv2 from someone else\n');
    const res = drafts.prepareDraft(P.dir, REL);
    assert.equal(res.reseeded, true);
    assert.equal(res.seeded, false);
    assert.equal(res.reason, 'base-changed');
    assert.equal(res.stale_copy, first.path + '.stale');
    assert.equal(read(res.stale_copy), 'my edit\n');
    assert.equal(read(res.path), '# Project\n\nv2 from someone else\n');
    assert.equal(readBase(res.path).sha256, sha('# Project\n\nv2 from someone else\n'));
  });

  test('11. live changed but the draft text already equals it: kept, no .stale, the base is refreshed', () => {
    const first = drafts.prepareDraft(P.dir, REL);
    const next = '# Project\n\nv2\n';
    P.setLive(REL, next);
    fs.writeFileSync(first.path, next);
    const res = drafts.prepareDraft(P.dir, REL);
    assert.equal(res.reseeded, false);
    assert.equal(res.stale_copy, null);
    assert.equal(fs.existsSync(first.path + drafts.STALE_SUFFIX), false);
    assert.equal(read(first.path), next);
    assert.equal(readBase(first.path).sha256, sha(next));
  });
});

describe('prepareDraft: drafts without a usable base', () => {
  function legacyDraft(text, draftMs) {
    const file = drafts.draftFileFor(P.dir, REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    P.setMtime(P.livePath(REL), T);
    P.setMtime(file, draftMs);
    return file;
  }

  test('12. no base record: a draft older than live is reseeded, a newer one is kept and adopted', () => {
    const old = legacyDraft('old draft\n', T - 60000);
    assert.equal(fs.existsSync(old + drafts.BASE_SUFFIX), false);
    const res = drafts.prepareDraft(P.dir, REL);
    assert.equal(res.reseeded, true);
    assert.equal(res.reason, 'older-than-live');
    assert.equal(read(res.stale_copy), 'old draft\n');
    assert.equal(read(res.path), read(P.livePath(REL)));

    const fresh = legacyDraft('newer draft\n', T + 60000);
    fs.rmSync(fresh + drafts.BASE_SUFFIX, { force: true });
    fs.rmSync(fresh + drafts.STALE_SUFFIX, { force: true });
    const kept = drafts.prepareDraft(P.dir, REL);
    assert.equal(kept.reseeded, false);
    assert.equal(read(kept.path), 'newer draft\n');
    assert.equal(readBase(kept.path).sha256, sha(read(P.livePath(REL))));
  });

  test('13. an unparseable base is treated as no base (the mtime rule applies)', () => {
    const file = legacyDraft('old draft\n', T - 60000);
    fs.writeFileSync(file + drafts.BASE_SUFFIX, '{ not json');
    const res = drafts.prepareDraft(P.dir, REL);
    assert.equal(res.reseeded, true);
    assert.equal(res.reason, 'older-than-live');
    assert.equal(readBase(res.path).sha256, sha(read(P.livePath(REL))));

    const newer = legacyDraft('newer draft\n', T + 60000);
    fs.writeFileSync(newer + drafts.BASE_SUFFIX, '[]');
    const kept = drafts.prepareDraft(P.dir, REL);
    assert.equal(kept.reseeded, false);
    assert.equal(read(kept.path), 'newer draft\n');
  });
});

describe('prepareDraft: the live file is missing', () => {
  test('14. a draft with no live file to compare against is kept, not stale', () => {
    const first = drafts.prepareDraft(P.dir, REL);
    fs.writeFileSync(first.path, 'my edit\n');
    fs.rmSync(P.livePath(REL));
    const res = drafts.prepareDraft(P.dir, REL);
    assert.equal(res.reseeded, false);
    assert.equal(read(res.path), 'my edit\n');
    assert.equal(fs.existsSync(res.path + drafts.STALE_SUFFIX), false);
  });
});

describe('checkDraftBase', () => {
  test('15. stdin, foreign files, current drafts and mismatched bases pass; stale drafts are refused', () => {
    // '-' and a file outside the drafts tree with no base: nothing to compare.
    assert.deepEqual(drafts.checkDraftBase(P.dir, REL, '-'), { ok: true });
    const foreign = path.join(P.tmp, 'elsewhere.md');
    fs.writeFileSync(foreign, 'whatever\n');
    assert.deepEqual(drafts.checkDraftBase(P.dir, REL, foreign), { ok: true });

    // base === live
    const seeded = drafts.prepareDraft(P.dir, REL);
    assert.deepEqual(drafts.checkDraftBase(P.dir, REL, seeded.path), { ok: true });

    // base !== live
    P.setLive(REL, '# Project\n\nchanged elsewhere\n');
    const stale = drafts.checkDraftBase(P.dir, REL, seeded.path);
    assert.equal(stale.ok, false);
    assert.equal(stale.refused, 'stale draft');
    assert.equal(stale.reason, 'base-changed');
    assert.match(stale.error, /planning draft PROJECT\.md/);
    assert.match(stale.error, /\.stale/);

    // A base whose rel differs is another document's draft: not checked.
    fs.writeFileSync(seeded.path + drafts.BASE_SUFFIX, JSON.stringify({ rel: 'ROADMAP.md', sha256: 'x', seeded_at: 'y' }));
    assert.deepEqual(drafts.checkDraftBase(P.dir, REL, seeded.path), { ok: true });
  });

  test('15. a null-hash base is stale once the live file exists', () => {
    const none = drafts.prepareDraft(P.dir, 'ROADMAP.md');
    assert.deepEqual(drafts.checkDraftBase(P.dir, 'ROADMAP.md', none.path), { ok: true });
    P.setLive('ROADMAP.md', '# Roadmap\n');
    const res = drafts.checkDraftBase(P.dir, 'ROADMAP.md', none.path);
    assert.equal(res.ok, false);
    assert.equal(res.refused, 'stale draft');
  });

  test('15. a canonical legacy draft older than live is refused; the same path through a symlink is compared by realpath', () => {
    const link = path.join(P.tmp, '..', 'tmp-link');
    fs.symlinkSync(P.tmp, link);
    process.env.TMPDIR = link;
    try {
      const file = drafts.draftFileFor(P.dir, REL);
      assert.ok(file.startsWith(link), 'the canonical draft path is built from the symlinked TMPDIR');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'legacy\n');
      P.setMtime(P.livePath(REL), T);
      P.setMtime(file, T - 60000);
      const viaReal = drafts.checkDraftBase(P.dir, REL, fs.realpathSync(file));
      assert.equal(viaReal.ok, false);
      assert.equal(viaReal.refused, 'stale draft');
      assert.equal(viaReal.reason, 'older-than-live');
      // A legacy draft newer than live is fine.
      P.setMtime(file, T + 60000);
      assert.deepEqual(drafts.checkDraftBase(P.dir, REL, fs.realpathSync(file)), { ok: true });
    } finally {
      fs.rmSync(link, { force: true });
    }
  });
});

describe('recordPublished', () => {
  test('16. rewrites the base for a draft with a base or at the canonical path; never beside a foreign file', () => {
    const seeded = drafts.prepareDraft(P.dir, REL);
    const now = new Date(Date.UTC(2026, 9, 3, 9, 0, 0));
    drafts.recordPublished(P.dir, REL, seeded.path, 'published text\n', { now });
    const base = readBase(seeded.path);
    assert.equal(base.sha256, sha('published text\n'));
    assert.equal(base.seeded_at, now.toISOString());

    // Canonical path with no base yet (a legacy draft): the base is created.
    fs.rmSync(seeded.path + drafts.BASE_SUFFIX);
    drafts.recordPublished(P.dir, REL, seeded.path, 'again\n');
    assert.equal(readBase(seeded.path).sha256, sha('again\n'));

    // stdin: nothing is written anywhere.
    const before = fs.readdirSync(path.dirname(seeded.path)).sort();
    drafts.recordPublished(P.dir, REL, '-', 'x\n');
    assert.deepEqual(fs.readdirSync(path.dirname(seeded.path)).sort(), before);

    // A foreign file: no sidecar appears next to it.
    const foreign = path.join(P.tmp, 'mine.md');
    fs.writeFileSync(foreign, 'mine\n');
    drafts.recordPublished(P.dir, REL, foreign, 'mine\n');
    assert.equal(fs.existsSync(foreign + drafts.BASE_SUFFIX), false);

    // A base that belongs to another rel is left alone.
    fs.writeFileSync(seeded.path + drafts.BASE_SUFFIX, JSON.stringify({ rel: 'ROADMAP.md', sha256: 'keep', seeded_at: 'y' }));
    drafts.recordPublished(P.dir, REL, seeded.path, 'z\n');
    assert.equal(readBase(seeded.path).sha256, 'keep');
  });
});

describe('unsafe rel', () => {
  test('17. throws TypeError from prepareDraft and draftFileFor', () => {
    assert.throws(() => drafts.prepareDraft(P.dir, '../escape.md'), TypeError);
    assert.throws(() => drafts.draftFileFor(P.dir, '../escape.md'), TypeError);
  });
});
