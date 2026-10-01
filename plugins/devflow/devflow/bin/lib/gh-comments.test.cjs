'use strict';

/**
 * gh-comments.test.cjs — TRD 47-08 (GST-03, GST-04)
 *
 * The comment protocol on top of the 47-01 codec: SUMMARY and VERIFICATION file comments, scope
 * changes with the scope budget, freeze and fold of a TRD's spec, and the reads that compute the
 * effective spec and drift.
 *
 * Hermetic: the project, the outbox and the cache all live under os.tmpdir() (hermeticEnv), and GitHub is
 * the in-memory fake installed through gh-client's seam. Every write in this module is an outbox op, so
 * the assertions look at the journal and at the fake's (absent) writes.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const comments = require('./gh-comments.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const body = require('./gh-body.cjs');
const mapping = require('./gh-mapping.cjs');
const trd = require('./gh-trd.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const T0 = Date.UTC(2026, 9, 1, 10, 0, 0); // 2026-10-01T10:00:00Z
const AT0 = '2026-10-01T10:00:00Z';

let env;
let project;
let fake;

beforeEach(() => {
  env = hermeticEnv();
  project = makeStoreProject({ store: true });
  fake = createFakeGitHub(project.fakeOptions);
  client._setRunGh(fake.runGh);
  client._setSleep(() => {});
});

afterEach(() => {
  client._resetClient();
  project.cleanup();
  env.restore();
});

const ops = () => outbox.readJournal(project.root).journal.ops;

/** A comment as GitHub returns it: marker line, then the (already part-headed) text. */
const comment = (id, text, kind = 'summary', cid = '7-01') => ({
  id,
  body: body.commentMarker(cid, kind) + '\n' + text,
});

const FILE = '07-01-alpha-SUMMARY.md';

// ─── Tests 1-2: the file comment codec ───────────────────────────────────────

describe('fileCommentText / decodeFileComment', () => {
  test('1a. fileCommentText is the file line, a newline, then the verbatim text', () => {
    const text = '# Summary\n\nDone.\n';
    assert.equal(comments.fileCommentText(FILE, text), trd.fileLine(FILE) + '\n' + text);
    assert.equal(comments.fileCommentText(FILE, text), `<!-- devflow:file=${FILE} -->\n# Summary\n\nDone.\n`);
  });

  test('1b. decodeFileComment on a one-part comment list returns {file, text} exactly', () => {
    const text = '# Summary\n\nDone.\n';
    const r = comments.decodeFileComment([comment(11, comments.fileCommentText(FILE, text))], '07-01', 'summary');
    assert.equal(r.ok, true);
    assert.equal(r.file, FILE);
    assert.equal(r.text, text);
  });

  test('1c. byte-exact for awkward text: empty, no trailing newline, leading blank lines, unicode', () => {
    const texts = ['', 'no newline at the end', '\n\nleading blank lines\n', 'café — 日本語 😀\n', '\n'];
    for (const text of texts) {
      const r = comments.decodeFileComment([comment(1, comments.fileCommentText(FILE, text))], '7-01', 'summary');
      assert.equal(r.ok, true, JSON.stringify(text));
      assert.equal(r.text, text, JSON.stringify(text));
      assert.equal(r.file, FILE);
    }
  });

  test('1d. CRLF read back from GitHub decodes to the same LF text', () => {
    const c = { id: 1, body: `${body.commentMarker('7-01', 'summary')}\r\n${trd.fileLine(FILE)}\r\nline one\r\nline two\r\n` };
    const r = comments.decodeFileComment([c], '7-01', 'summary');
    assert.equal(r.ok, true);
    assert.equal(r.text, 'line one\nline two\n');
  });

  test('1e. a text that itself opens with a part line survives the round trip', () => {
    const text = '<!-- devflow:part=1/2 -->\nnot a real header\n';
    const posted = trd.splitParts(comments.fileCommentText(FILE, text), 60000);
    const cs = posted.map((p, i) => comment(10 + i, p));
    const r = comments.decodeFileComment(cs, '7-01', 'summary');
    assert.equal(r.ok, true);
    assert.equal(r.text, text);
  });

  test('1f. no matching comment is {ok:false, notFound:true}, never a throw', () => {
    const human = { id: 5, body: 'looks good to me' };
    const other = comment(6, comments.fileCommentText(FILE, 'x'), 'summary', '7-02');
    const r = comments.decodeFileComment([human, other], '7-01', 'summary');
    assert.equal(r.ok, false);
    assert.equal(r.notFound, true);
    assert.match(r.error, /7-01/);
    assert.equal(comments.decodeFileComment([], '7-01', 'summary').ok, false);
    assert.equal(comments.decodeFileComment(null, '7-01', 'summary').ok, false);
  });

  test('1g. a comment with no file line is {ok:false} with a clear error', () => {
    const r = comments.decodeFileComment([comment(1, 'just text, no file line\n')], '7-01', 'summary');
    assert.equal(r.ok, false);
    assert.match(r.error, /file/);
  });

  const paragraph = (i) => `paragraph ${i} ` + 'y'.repeat(70) + '\n\n';
  const bigText = Array.from({ length: 9 }, (_, i) => paragraph(i + 1)).join('');

  function threeParts() {
    const parts = trd.splitParts(comments.fileCommentText(FILE, bigText), 330);
    assert.equal(parts.length, 3, 'the fixture text is split into exactly 3 parts');
    return parts;
  }

  test('2a. three part comments given out of order are joined in part order', () => {
    const parts = threeParts();
    const cs = [comment(30, parts[2]), comment(10, parts[0]), comment(20, parts[1])];
    const r = comments.decodeFileComment(cs, '7-01', 'summary');
    assert.equal(r.ok, true);
    assert.equal(r.file, FILE);
    assert.equal(r.text, bigText);
  });

  test('2b. part order wins over comment id order', () => {
    const parts = threeParts();
    const cs = [comment(1, parts[2]), comment(2, parts[0]), comment(3, parts[1])];
    assert.equal(comments.decodeFileComment(cs, '7-01', 'summary').text, bigText);
  });

  test('2c. a missing part is {ok:false, missing:[2]} and never partial text', () => {
    const parts = threeParts();
    const r = comments.decodeFileComment([comment(10, parts[0]), comment(30, parts[2])], '7-01', 'summary');
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, [2]);
    assert.equal(r.text, undefined);
  });

  test('2d. superseded parts (older surplus parts re-marked) are ignored', () => {
    const parts = threeParts();
    const stale = comment(5, '<!-- devflow:part=2/4 -->\nOLD CONTENT\n', 'summary-superseded');
    const cs = [stale, comment(10, parts[0]), comment(20, parts[1]), comment(30, parts[2])];
    const r = comments.decodeFileComment(cs, '7-01', 'summary');
    assert.equal(r.ok, true);
    assert.equal(r.text, bigText);
  });

  test('2e. comments of another kind or another id with the same part numbers are ignored', () => {
    const parts = threeParts();
    const noise = [
      comment(1, parts[1], 'verification'),
      comment(2, parts[1], 'summary', '7-02'),
      { id: 3, body: 'a human reply' },
    ];
    const cs = [...noise, comment(10, parts[0]), comment(20, parts[1]), comment(30, parts[2])];
    assert.equal(comments.decodeFileComment(cs, '7-01', 'summary').text, bigText);
  });

  test('2f. a verification comment decodes under the objective id', () => {
    const text = '# Verification\n\nAll good.\n';
    const c = comment(9, comments.fileCommentText('07-VERIFICATION.md', text), 'verification', '7');
    const r = comments.decodeFileComment([c], '07', 'verification');
    assert.equal(r.ok, true);
    assert.equal(r.file, '07-VERIFICATION.md');
    assert.equal(r.text, text);
  });
});

// ─── Test 3: SUMMARY ─────────────────────────────────────────────────────────

describe('enqueueSummary', () => {
  const text = '# Summary 07-01\n\nBuilt the parser.\n';

  test('3a. enqueues one upsert-comment {id:"7-01", kind:"summary"} and makes zero gh writes', () => {
    const r = comments.enqueueSummary(project.root, { trdId: '07-01', file: FILE, text, now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.id, '7-01');
    const list = ops();
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'upsert-comment');
    assert.deepEqual(list[0].target, { id: '7-01', kind: 'summary' });
    assert.deepEqual(list[0].payload, { mode: 'replace', text: comments.fileCommentText(FILE, text) });
    assert.equal(list[0].status, 'pending');
    assert.deepEqual(fake.writes(), []);
    assert.deepEqual(fake.calls(), [], 'enqueueing a SUMMARY reads nothing from GitHub either');
  });

  test('3b. enqueueing the same TRD again coalesces onto the pending op (latest text wins)', () => {
    comments.enqueueSummary(project.root, { trdId: '07-01', file: FILE, text: 'first\n', now: T0 });
    const r = comments.enqueueSummary(project.root, { trdId: '7-01', file: FILE, text: 'second\n', now: T0 + 1000 });
    assert.equal(r.ok, true);
    assert.equal(r.coalesced.length, 1);
    const list = ops();
    assert.equal(list.length, 1);
    assert.equal(list[0].payload.text, comments.fileCommentText(FILE, 'second\n'));
  });

  test('3c. the text is queued verbatim: never trimmed, however long', () => {
    const long = 'z'.repeat(150000) + '\n';
    comments.enqueueSummary(project.root, { trdId: '07-01', file: FILE, text: long, now: T0 });
    assert.equal(ops()[0].payload.text, comments.fileCommentText(FILE, long));
  });

  test('3d. refuses an invalid TRD id, a Decision id, an unsafe file name and a non-string text', () => {
    for (const bad of [
      { trdId: 'abc', file: FILE, text },
      { trdId: '7', file: FILE, text },
      { trdId: '47-01-d1', file: FILE, text },
      { trdId: '07-01', file: '../escape.md', text },
      { trdId: '07-01', file: 'a b.md', text },
      { trdId: '07-01', file: FILE, text: null },
      { trdId: '07-01', file: FILE },
    ]) {
      const r = comments.enqueueSummary(project.root, { ...bad, now: T0 });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.equal(typeof r.error, 'string');
    }
    assert.deepEqual(ops(), []);
  });

  test('3e. github disabled is {ok:true, skipped:true} and writes nothing', () => {
    fs.writeFileSync(
      path.join(project.root, '.planning', 'config.json'),
      JSON.stringify({ github: { enabled: false, repo: 'o/r' } })
    );
    const r = comments.enqueueSummary(project.root, { trdId: '07-01', file: FILE, text, now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.deepEqual(ops(), []);
  });
});

// ─── Test 4: VERIFICATION ────────────────────────────────────────────────────

describe('enqueueVerification', () => {
  const text = '# Verification\n\nGoal achieved.\n';

  test('4a. targets the OBJECTIVE id: {id:"7", kind:"verification"}', () => {
    const r = comments.enqueueVerification(project.root, {
      objectiveId: '07', file: '07-VERIFICATION.md', text, now: T0,
    });
    assert.equal(r.ok, true);
    assert.equal(r.id, '7');
    const list = ops();
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'upsert-comment');
    assert.deepEqual(list[0].target, { id: '7', kind: 'verification' });
    assert.deepEqual(list[0].payload, { mode: 'replace', text: comments.fileCommentText('07-VERIFICATION.md', text) });
    assert.deepEqual(fake.writes(), []);
  });

  test('4b. accepts any spelling of the objective (a directory name, a decimal id)', () => {
    comments.enqueueVerification(project.root, { objectiveId: '07-store-demo', file: '07-VERIFICATION.md', text, now: T0 });
    comments.enqueueVerification(project.root, { objectiveId: '02.1', file: '02.1-VERIFICATION.md', text, now: T0 });
    assert.deepEqual(ops().map((o) => o.target), [
      { id: '7', kind: 'verification' },
      { id: '2.1', kind: 'verification' },
    ]);
  });

  test('4c. refuses a junk objective id, an unsafe file name and a non-string text', () => {
    for (const bad of [
      { objectiveId: 'abc', file: '07-VERIFICATION.md', text },
      { objectiveId: '07', file: '/etc/passwd', text },
      { objectiveId: '07', file: '07-VERIFICATION.md', text: 42 },
    ]) {
      assert.equal(comments.enqueueVerification(project.root, { ...bad, now: T0 }).ok, false, JSON.stringify(bad));
    }
    assert.deepEqual(ops(), []);
  });
});

// ─── TRD issues in the fake ──────────────────────────────────────────────────

const { oversizedTrdText } = require('./__fixtures__/gh-store-fixtures.cjs');

const TRD_ID = '7-01';
const TRD_FILE = '07-01-alpha-TRD.md';
const TRD_TEXT = '# TRD 07-01: alpha\n\nThe alpha spec.\n';

/** Seed a TRD issue carrying the 47-01 body header; map it (`trds`) unless `mapped` is false. */
function seedTrd({ text = TRD_TEXT, state = 'OPEN', mapped = true, id = TRD_ID, file = TRD_FILE } = {}) {
  const encoded = trd.encodeTrdBody({ id, file, text });
  const number = fake.seedIssue({ title: 'TRD 07-01: alpha', body: encoded, state });
  if (mapped) {
    const map = mapping.readMappingV3(project.root);
    mapping.setTrd(map, id, { issue_number: number, rest_id: 1000000 + number });
    assert.equal(mapping.writeMappingV3(project.root, map).ok, true);
  }
  return { number, encoded, text, id, file };
}

/** A scope comment written the way 47-01 writes it. */
const seedScope = (number, n, text) => fake.seedComment(number, trd.buildScopeComment(n, text));

/**
 * A spec-rev sticky comment holding `entries` (event/hash/chars rows), marker line first. The rows join the TRD's
 * spec-rev comment when it already exists (there is one per TRD, as on GitHub), so a fixture can mix freeze, fold
 * and DevFlow scope rows in any order (49-06).
 */
function seedSpecRev(number, entries, id = TRD_ID) {
  const marker = body.commentMarker(id, 'spec-rev');
  const existing = fake.comments.find((c) => c.issue_number === number && c.body.startsWith(marker));
  let t = existing ? existing.body : marker + '\n';
  for (const e of entries) t = trd.appendSpecRev(t, e);
  if (existing) {
    fake.humanEditComment(existing.id, t);
    return existing.id;
  }
  return fake.seedComment(number, t);
}

/**
 * A scope change DevFlow posted (49-06): the scope comment, plus the hash-bound `scope n=K scope_hash=H` spec-rev row
 * that `enqueueScope` queues in store mode. The store-mode gate accepts it whoever the comment's author is.
 */
function seedDevflowScope(number, n, text, { login } = {}) {
  const id = fake.seedComment(number, trd.buildScopeComment(n, text), login === undefined ? undefined : { login });
  seedSpecRev(number, [{ at: AT0, event: trd.scopeEvent(n, trd.scopeHash(text)), hash: trd.contentHash(`effective after ${n}`), chars: 1 }]);
  return id;
}

/** The encoded effective spec the codec yields for `seed` plus `scopeComments` (each a full comment body). */
function encodedEffective(seed, scopeComments, foldedThrough = 0) {
  const eff = trd.effectiveSpec(
    seed.text,
    scopeComments.map((b, i) => ({ id: i + 1, body: b })),
    { foldedThrough, id: seed.id, file: seed.file }
  );
  return trd.encodeTrdBody({ id: seed.id, file: seed.file, text: eff.text });
}

const specRevOps = () => ops().filter((o) => o.kind === 'upsert-comment' && o.target.kind === 'spec-rev');

// ─── readTrdState / readEffectiveSpec ────────────────────────────────────────

describe('readTrdState', () => {
  test('R1. reads body, comments, scopes and the spec-rev log with ONE issue GET and ONE comments read', () => {
    const seed = seedTrd();
    seedScope(seed.number, 2, 'Second change.');
    seedScope(seed.number, 1, 'First change.');
    fake.seedComment(seed.number, 'a human remark');
    const freezeEntry = { at: AT0, event: 'freeze', hash: trd.contentHash(seed.encoded), chars: seed.encoded.length };
    seedSpecRev(seed.number, [freezeEntry]);

    const st = comments.readTrdState(project.root, '07-01');
    assert.equal(st.ok, true);
    assert.equal(st.id, '7-01');
    assert.equal(st.number, seed.number);
    assert.equal(st.state, 'open');
    assert.equal(st.body, seed.encoded);
    assert.equal(st.comments.length, 4);
    assert.deepEqual(st.scopes.map((s) => s.n), [1, 2], 'scopes are ordered by n, not by comment id');
    assert.equal(st.frozen, true);
    assert.equal(st.foldedThrough, 0);
    assert.match(st.specRevText, /\| 1 \| 2026-10-01T10:00:00Z \| freeze \|/);
    assert.equal(fake.calls().length, 2, 'one GET of the issue, one paginated read of its comments');
    assert.deepEqual(fake.writes(), []);
  });

  test('R2. a closed issue reads as state "closed"; a missing spec-rev comment is an empty log', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    const st = comments.readTrdState(project.root, TRD_ID);
    assert.equal(st.ok, true);
    assert.equal(st.state, 'closed');
    assert.equal(st.frozen, false);
    assert.equal(st.foldedThrough, 0);
    assert.equal(trd.parseSpecRev(st.specRevText).entries.length, 0);
    assert.equal(st.body, seed.encoded);
  });

  test('R3. folded_through comes from the spec-rev fold row', () => {
    const seed = seedTrd();
    seedSpecRev(seed.number, [
      { at: AT0, event: 'fold folded_through=3 from=' + trd.contentHash('x'), hash: trd.contentHash(seed.encoded), chars: 10 },
    ]);
    assert.equal(comments.readTrdState(project.root, TRD_ID).foldedThrough, 3);
  });

  test('R4. a TRD missing from the mapping is found by its body marker (no mapping write)', () => {
    const seed = seedTrd({ mapped: false });
    const st = comments.readTrdState(project.root, TRD_ID);
    assert.equal(st.ok, true);
    assert.equal(st.number, seed.number);
    assert.equal(mapping.getTrd(mapping.readMappingV3(project.root), TRD_ID), null, 'reads never write the mapping');
  });

  test('R5. a TRD with no issue anywhere is a clear error naming gh sync', () => {
    seedTrd({ mapped: false, id: '7-02', file: '07-02-beta-TRD.md' });
    const st = comments.readTrdState(project.root, '07-01');
    assert.equal(st.ok, false);
    assert.equal(st.error, 'TRD 07-01 has no issue yet; run gh sync first');
  });

  test('R6. an issue that is not a DevFlow TRD body is reported, not decoded', () => {
    const n = fake.seedIssue({ title: 'human issue', body: 'just words' });
    const map = mapping.readMappingV3(project.root);
    mapping.setTrd(map, TRD_ID, { issue_number: n, rest_id: 1000000 + n });
    mapping.writeMappingV3(project.root, map);
    const st = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(st.ok, false);
    assert.match(st.error, /not a devflow TRD body/);
  });

  test('R7. github disabled is {ok:false, skipped:true} with no gh call', () => {
    fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: false } }));
    const st = comments.readTrdState(project.root, TRD_ID);
    assert.equal(st.ok, false);
    assert.equal(st.skipped, true);
    assert.deepEqual(fake.calls(), []);
  });

  test('R8. an invalid TRD id or a failing read is {ok:false, error}, never a throw', () => {
    assert.equal(comments.readTrdState(project.root, 'nope').ok, false);
    assert.equal(comments.readTrdState(project.root, '47-01-d1').ok, false, 'a Decision id is not a TRD id');
    const seed = seedTrd();
    fake.failNext(/issues\/\d+$/, { ok: false, status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' });
    const st = comments.readTrdState(project.root, TRD_ID);
    assert.equal(st.ok, false);
    assert.match(st.error, /500/);
    assert.equal(seed.number, 1);
  });
});

describe('readEffectiveSpec', () => {
  test('14a. returns body + scope comments in n order, honouring folded_through', () => {
    const seed = seedTrd();
    seedDevflowScope(seed.number, 3, 'Third.');
    seedDevflowScope(seed.number, 1, 'First.');
    seedDevflowScope(seed.number, 2, 'Second.');
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.deepEqual(r.applied, [1, 2, 3]);
    assert.equal(
      r.text,
      TRD_TEXT + '\n\n' + trd.buildScopeComment(1, 'First.') + '\n\n' + trd.buildScopeComment(2, 'Second.') +
        '\n\n' + trd.buildScopeComment(3, 'Third.')
    );
    assert.equal(r.overflow, false);
    assert.equal(r.file, TRD_FILE);
    assert.equal(r.encoded, trd.encodeTrdBody({ id: TRD_ID, file: TRD_FILE, text: r.text }));
    assert.equal(r.chars, r.encoded.length);
  });

  test('14b. after a fold (folded_through=3) and a new scope n=4: the folded body plus n=4 only', () => {
    const scopes = [1, 2, 3].map((n) => trd.buildScopeComment(n, `Change ${n}.`));
    const foldedText = TRD_TEXT + scopes.map((s) => '\n\n' + s).join('');
    const seed = seedTrd({ text: foldedText, state: 'CLOSED' });
    for (let n = 1; n <= 3; n++) seedDevflowScope(seed.number, n, `Change ${n}.`);
    seedDevflowScope(seed.number, 4, 'Change 4.');
    seedSpecRev(seed.number, [
      { at: AT0, event: 'fold folded_through=3 from=' + trd.contentHash('before'), hash: trd.contentHash(seed.encoded), chars: seed.encoded.length },
    ]);
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.deepEqual(r.applied, [4]);
    assert.equal(r.text, foldedText + '\n\n' + trd.buildScopeComment(4, 'Change 4.'));
    assert.equal(r.foldedThrough, 3);
  });

  test('14c. a scope gap is reported in errors while the spec is still returned', () => {
    const seed = seedTrd();
    seedDevflowScope(seed.number, 1, 'One.');
    seedDevflowScope(seed.number, 3, 'Three.');
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.ok(r.errors.some((e) => /gap before n=3/.test(e)));
  });
});

// ─── enqueueScope ────────────────────────────────────────────────────────────

describe('enqueueScope', () => {
  test('5a. default n is the highest existing n + 1; post-scope then spec-rev append, in one enqueue', () => {
    const seed = seedTrd();
    seedScope(seed.number, 1, 'First change.');
    seedScope(seed.number, 2, 'Second change.');
    const r = comments.enqueueScope(project.root, { trdId: '07-01', text: 'Third change.', now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.n, 3);
    assert.equal(r.id, TRD_ID);

    const list = ops();
    assert.equal(list.length, 2);
    assert.equal(list[0].kind, 'post-scope');
    assert.deepEqual(list[0].target, { id: TRD_ID, n: 3 });
    assert.deepEqual(list[0].payload, { text: 'Third change.' });
    assert.equal(list[1].kind, 'upsert-comment');
    assert.deepEqual(list[1].target, { id: TRD_ID, kind: 'spec-rev' });
    assert.equal(list[1].payload.mode, 'append-spec-rev');
    assert.ok(list[0].seq < list[1].seq, 'post-scope is queued before its spec-rev row');

    const effective = encodedEffective(seed, [
      trd.buildScopeComment(1, 'First change.'),
      trd.buildScopeComment(2, 'Second change.'),
      trd.buildScopeComment(3, 'Third change.'),
    ]);
    assert.deepEqual(list[1].payload.entry, {
      at: AT0,
      event: trd.scopeEvent(3, trd.scopeHash('Third change.')),
      hash: trd.contentHash(effective),
      chars: effective.length,
    });
    assert.deepEqual(fake.writes(), [], 'no GitHub write: the flusher posts it');
  });

  test('5b. the first scope of a TRD is n=1; an explicit n is honoured (out of order is legal)', () => {
    seedTrd();
    assert.equal(comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'a', now: T0 }).n, 1);
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 5, text: 'e', now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.n, 5);
    assert.deepEqual(ops().filter((o) => o.kind === 'post-scope').map((o) => o.target.n), [1, 5]);
  });

  test('5c. two scopes queued before a flush get n and n+1, and BOTH scope ops and spec-rev rows survive', () => {
    const seed = seedTrd();
    seedScope(seed.number, 1, 'First change.');
    const a = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'Second change.', now: T0 });
    const b = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'Third change.', now: T0 + 1000 });
    assert.equal(a.n, 2);
    assert.equal(b.n, 3, 'the pending n=2 is counted even though GitHub has not seen it yet');

    const scopeOps = ops().filter((o) => o.kind === 'post-scope');
    assert.deepEqual(scopeOps.map((o) => [o.target.n, o.payload.text]), [[2, 'Second change.'], [3, 'Third change.']]);
    const rows = specRevOps();
    assert.deepEqual(
      rows.map((o) => o.payload.entry.event),
      [trd.scopeEvent(2, trd.scopeHash('Second change.')), trd.scopeEvent(3, trd.scopeHash('Third change.'))],
      'a later append must not replace an earlier one'
    );

    const both = encodedEffective(seed, [
      trd.buildScopeComment(1, 'First change.'),
      trd.buildScopeComment(2, 'Second change.'),
      trd.buildScopeComment(3, 'Third change.'),
    ]);
    assert.equal(rows[1].payload.entry.hash, trd.contentHash(both), 'the effective spec includes the pending scope');
  });

  test('6. a scope comment over 60,000 chars is refused with overflow:true and the new-TRD message', () => {
    seedTrd();
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'q'.repeat(60001), now: T0 });
    assert.equal(r.ok, false);
    assert.equal(r.overflow, true);
    assert.match(r.message, /new TRD/);
    assert.deepEqual(ops(), [], 'nothing is enqueued');
    assert.deepEqual(fake.writes(), []);
  });

  test('7a. body 50,000 + scope 9,000 + new 2,000 pushes the effective spec over 60,000: refused', () => {
    const text = oversizedTrdText(50000, { id: TRD_ID, file: TRD_FILE });
    const seed = seedTrd({ text });
    assert.equal(seed.encoded.length, 50000);
    fake.seedComment(seed.number, trd.scopeMarker(1) + '\n' + 'x'.repeat(9000 - (trd.scopeMarker(1).length + 1)));
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'n'.repeat(2000), now: T0 });
    assert.equal(r.ok, false);
    assert.equal(r.overflow, true);
    assert.match(r.message, /new TRD/);
    assert.ok(r.chars > 60000);
    assert.equal(r.max, 60000);
    assert.deepEqual(ops(), []);
  });

  // "\n\n" + marker line + newline: what a first scope comment adds around its text
  const SCOPE_OVERHEAD = 2 + trd.scopeMarker(1).length + 1;

  test('7b. the boundary: an effective spec of exactly 60,000 chars is accepted', () => {
    seedTrd({ text: oversizedTrdText(50000, { id: TRD_ID, file: TRD_FILE }) });
    const exact = 60000 - 50000 - SCOPE_OVERHEAD;
    const ok = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'k'.repeat(exact), now: T0 });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.chars, 60000);
    assert.equal(ops().filter((o) => o.kind === 'post-scope').length, 1);
  });

  test('7c. one char more (60,001) is refused with overflow:true and nothing is queued', () => {
    seedTrd({ text: oversizedTrdText(50000, { id: TRD_ID, file: TRD_FILE }) });
    const exact = 60000 - 50000 - SCOPE_OVERHEAD;
    const over = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'k'.repeat(exact + 1), now: T0 });
    assert.equal(over.ok, false);
    assert.equal(over.overflow, true);
    assert.equal(over.chars, 60001);
    assert.deepEqual(ops(), []);
  });

  test('8a. an existing n with identical text is a no-op', () => {
    const seed = seedTrd();
    seedScope(seed.number, 1, 'One.');
    seedScope(seed.number, 2, 'Two.');
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 2, text: 'Two.', now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
    assert.deepEqual(ops(), []);
  });

  test('8b. an existing n with different text is refused: n=2 already used', () => {
    const seed = seedTrd();
    seedScope(seed.number, 1, 'One.');
    seedScope(seed.number, 2, 'Two.');
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 2, text: 'Something else.', now: T0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /n=2 already used/);
    assert.deepEqual(ops(), []);
  });

  test('8c. the same rule applies to an n that is only queued, not yet posted', () => {
    seedTrd();
    comments.enqueueScope(project.root, { trdId: TRD_ID, n: 1, text: 'One.', now: T0 });
    const same = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 1, text: 'One.', now: T0 + 1 });
    assert.equal(same.noop, true);
    const diff = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 1, text: 'Other.', now: T0 + 2 });
    assert.equal(diff.ok, false);
    assert.match(diff.error, /n=1 already used/);
    assert.equal(ops().filter((o) => o.kind === 'post-scope').length, 1);
  });

  test('8d. trailing whitespace GitHub may have stripped does not turn a replay into a conflict', () => {
    const seed = seedTrd();
    seedScope(seed.number, 1, 'One.');
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, n: 1, text: 'One.\n', now: T0 });
    assert.equal(r.noop, true);
  });

  test('9b. validation: invalid TRD id, a Decision id, empty text, a bad n', () => {
    seedTrd();
    for (const bad of [
      { trdId: 'x', text: 't' },
      { trdId: '47-01-d1', text: 't' },
      { trdId: TRD_ID, text: '' },
      { trdId: TRD_ID, text: '   \n' },
      { trdId: TRD_ID, text: null },
      { trdId: TRD_ID, n: 0, text: 't' },
      { trdId: TRD_ID, n: 1.5, text: 't' },
      { trdId: TRD_ID, n: '2', text: 't' },
    ]) {
      const r = comments.enqueueScope(project.root, { ...bad, now: T0 });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.equal(typeof r.error, 'string');
    }
    assert.deepEqual(ops(), []);
  });

  test('9c. a TRD with no issue yet is refused with the gh sync message', () => {
    const r = comments.enqueueScope(project.root, { trdId: '07-01', text: 't', now: T0 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'TRD 07-01 has no issue yet; run gh sync first');
  });

  test('9d. github disabled is {ok:true, skipped:true}: nothing read, nothing queued', () => {
    fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: false, repo: 'o/r' } }));
    const r = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 't', now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.deepEqual(fake.calls(), []);
    assert.deepEqual(ops(), []);
  });
});

// ─── freezeTrd ───────────────────────────────────────────────────────────────

describe('freezeTrd', () => {
  test('9a. enqueues one append-spec-rev "freeze" entry carrying the current body hash', () => {
    const seed = seedTrd();
    const r = comments.freezeTrd(project.root, '07-01', { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.id, TRD_ID);
    const list = ops();
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'upsert-comment');
    assert.deepEqual(list[0].target, { id: TRD_ID, kind: 'spec-rev' });
    assert.deepEqual(list[0].payload, {
      mode: 'append-spec-rev',
      entry: { at: AT0, event: 'freeze', hash: trd.contentHash(seed.encoded), chars: seed.encoded.length },
    });
    assert.deepEqual(fake.writes(), []);
  });

  test('9b. calling it twice enqueues once (even with a later clock)', () => {
    seedTrd();
    comments.freezeTrd(project.root, TRD_ID, { now: T0 });
    const again = comments.freezeTrd(project.root, TRD_ID, { now: T0 + 60000 });
    assert.equal(again.ok, true);
    assert.equal(specRevOps().length, 1);
    assert.equal(specRevOps()[0].payload.entry.at, AT0, 'the first freeze time is the one that is kept');
  });

  test('9c. an already-frozen TRD is a no-op that reports the drift state', () => {
    const seed = seedTrd();
    seedSpecRev(seed.number, [{ at: AT0, event: 'freeze', hash: trd.contentHash(seed.encoded), chars: seed.encoded.length }]);
    const r = comments.freezeTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
    assert.equal(r.frozen, true);
    assert.deepEqual(ops(), []);
  });

  test('9d. a body that is not a devflow TRD body cannot be frozen', () => {
    const n = fake.seedIssue({ title: 'human', body: 'words' });
    const map = mapping.readMappingV3(project.root);
    mapping.setTrd(map, TRD_ID, { issue_number: n, rest_id: 1000000 + n });
    mapping.writeMappingV3(project.root, map);
    const r = comments.freezeTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /not a devflow TRD body/);
    assert.deepEqual(ops(), []);
  });

  test('9e. a freeze and a scope queued before a flush both keep their spec-rev rows', () => {
    seedTrd();
    comments.freezeTrd(project.root, TRD_ID, { now: T0 });
    comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'Late change.', now: T0 + 1000 });
    assert.deepEqual(specRevOps().map((o) => o.payload.entry.event), ['freeze', trd.scopeEvent(1, trd.scopeHash('Late change.'))]);
  });

  test('9f. disabled and invalid ids', () => {
    assert.equal(comments.freezeTrd(project.root, 'nope', { now: T0 }).ok, false);
    fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: false } }));
    assert.equal(comments.freezeTrd(project.root, TRD_ID, { now: T0 }).skipped, true);
  });
});

// ─── foldTrd ─────────────────────────────────────────────────────────────────

describe('foldTrd', () => {
  test('10. a closed TRD with scopes 1..3 that fit: patch-body replace with the effective spec, then a fold row', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(seed.number, 2, 'Second.');
    seedDevflowScope(seed.number, 1, 'First.');
    seedDevflowScope(seed.number, 3, 'Third.');
    const r = comments.foldTrd(project.root, '07-01', { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.fits, true);
    assert.equal(r.folded_through, 3);

    const list = ops();
    assert.equal(list.length, 2);
    assert.equal(list[0].kind, 'patch-body');
    assert.deepEqual(list[0].target, { id: TRD_ID });
    assert.equal(list[0].payload.mode, 'replace');
    const decoded = trd.decodeTrdBody(list[0].payload.body);
    assert.equal(decoded.ok, true);
    assert.equal(
      decoded.text,
      TRD_TEXT + '\n\n' + trd.buildScopeComment(1, 'First.') + '\n\n' + trd.buildScopeComment(2, 'Second.') +
        '\n\n' + trd.buildScopeComment(3, 'Third.'),
      'body text then the scope comments in n order'
    );

    assert.equal(list[1].kind, 'upsert-comment');
    assert.deepEqual(list[1].target, { id: TRD_ID, kind: 'spec-rev' });
    assert.deepEqual(list[1].payload.entry, {
      at: AT0,
      event: `fold folded_through=3 from=${trd.contentHash(seed.encoded)}`,
      hash: trd.contentHash(list[0].payload.body),
      chars: list[0].payload.body.length,
    });
    assert.ok(list[0].seq < list[1].seq);
    assert.deepEqual(fake.writes(), []);
  });

  test('10b. scope comments are never deleted: the fold queues no comment removal', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(seed.number, 1, 'First.');
    comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.deepEqual(ops().map((o) => o.kind), ['patch-body', 'upsert-comment']);
  });

  test('10c. a second fold folds only the scopes added since the first', () => {
    const first = [1, 2].map((n) => trd.buildScopeComment(n, `Change ${n}.`));
    const foldedText = TRD_TEXT + first.map((s) => '\n\n' + s).join('');
    const seed = seedTrd({ text: foldedText, state: 'CLOSED' });
    seedDevflowScope(seed.number, 1, 'Change 1.');
    seedDevflowScope(seed.number, 2, 'Change 2.');
    seedDevflowScope(seed.number, 3, 'Change 3.');
    seedSpecRev(seed.number, [
      { at: AT0, event: 'fold folded_through=2 from=' + trd.contentHash('older'), hash: trd.contentHash(seed.encoded), chars: seed.encoded.length },
    ]);
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.folded_through, 3);
    const decoded = trd.decodeTrdBody(ops()[0].payload.body);
    assert.equal(decoded.text, foldedText + '\n\n' + trd.buildScopeComment(3, 'Change 3.'));
  });

  test('10d. nothing to fold is {ok:true, noop:true} and queues nothing', () => {
    seedTrd({ state: 'CLOSED' });
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
    assert.deepEqual(ops(), []);
  });

  test('11a. an open TRD is refused: fold runs on close', () => {
    const seed = seedTrd({ state: 'OPEN' });
    seedDevflowScope(seed.number, 1, 'First.');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'open');
    assert.match(r.error, /closed/);
    assert.deepEqual(ops(), []);
  });

  test('11b. {force:true} folds an open TRD', () => {
    const seed = seedTrd({ state: 'OPEN' });
    seedDevflowScope(seed.number, 1, 'First.');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0, force: true });
    assert.equal(r.ok, true);
    assert.equal(r.fits, true);
    assert.deepEqual(ops().map((o) => o.kind), ['patch-body', 'upsert-comment']);
  });

  test('12. when the effective spec exceeds 60,000: {ok:true, fits:false} and nothing is queued', () => {
    const seed = seedTrd({ state: 'CLOSED', text: oversizedTrdText(55000, { id: TRD_ID, file: TRD_FILE }) });
    seedDevflowScope(seed.number, 1, 'm'.repeat(7000));
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.fits, false);
    assert.match(r.message, /60,000/);
    assert.deepEqual(ops(), []);
    assert.deepEqual(fake.writes(), []);
  });

  test('13. a scope gap refuses the fold', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(seed.number, 1, 'One.');
    seedDevflowScope(seed.number, 3, 'Three.');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /gap/);
    assert.deepEqual(ops(), []);
  });

  test('13b. a duplicate scope n refuses the fold', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(seed.number, 1, 'One.');
    seedDevflowScope(seed.number, 1, 'One again.');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, false);
    assert.match(r.error, /duplicate n=1/);
  });

  test('13c. folding twice before a flush queues one body replace and one fold row', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(seed.number, 1, 'One.');
    comments.foldTrd(project.root, TRD_ID, { now: T0 });
    comments.foldTrd(project.root, TRD_ID, { now: T0 + 5000 });
    assert.deepEqual(ops().map((o) => o.kind), ['patch-body', 'upsert-comment']);
  });

  test('13d. disabled, invalid ids and a missing issue', () => {
    assert.equal(comments.foldTrd(project.root, 'nope', { now: T0 }).ok, false);
    assert.equal(comments.foldTrd(project.root, TRD_ID, { now: T0 }).error, 'TRD 7-01 has no issue yet; run gh sync first');
    fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: false } }));
    assert.equal(comments.foldTrd(project.root, TRD_ID, { now: T0 }).skipped, true);
  });
});

// ─── detectTrdDrift ──────────────────────────────────────────────────────────

describe('detectTrdDrift', () => {
  test('15a. the live body hash equals the last logged hash: no drift; a human edit: drift with both hashes', () => {
    const seed = seedTrd();
    seedSpecRev(seed.number, [{ at: AT0, event: 'freeze', hash: trd.contentHash(seed.encoded), chars: seed.encoded.length }]);
    const clean = comments.detectTrdDrift(project.root, TRD_ID);
    assert.equal(clean.ok, true);
    assert.equal(clean.drift, false);

    const edited = seed.encoded + '\nsneaked in by a human\n';
    fake.humanEditBody(seed.number, edited);
    const drifted = comments.detectTrdDrift(project.root, TRD_ID);
    assert.equal(drifted.ok, true);
    assert.equal(drifted.drift, true);
    assert.equal(drifted.expected, trd.contentHash(seed.encoded));
    assert.equal(drifted.actual, trd.contentHash(edited));
  });

  test('15b. a scope row (which hashes the effective spec, not the body) never causes false drift', () => {
    const seed = seedTrd();
    seedSpecRev(seed.number, [
      { at: AT0, event: 'freeze', hash: trd.contentHash(seed.encoded), chars: seed.encoded.length },
      { at: AT0, event: 'scope n=1', hash: trd.contentHash('some other text'), chars: 5 },
    ]);
    assert.equal(comments.detectTrdDrift(project.root, TRD_ID).drift, false);
  });

  test('15c. no spec-rev log at all is unlogged, not drift', () => {
    seedTrd();
    const r = comments.detectTrdDrift(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.equal(r.drift, false);
    assert.equal(r.unlogged, true);
  });

  test('15d. errors from the read pass through', () => {
    const r = comments.detectTrdDrift(project.root, TRD_ID);
    assert.equal(r.ok, false);
    assert.match(r.error, /no issue yet/);
  });
});

// ─── 49-06: the scope-change gate (store mode only) ──────────────────────────

const STORE_ON = { enabled: true, repo: 'o/r', store: true };
const STORE_OFF = { enabled: true, repo: 'o/r' };

const setGithub = (github) =>
  fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), `${JSON.stringify({ github }, null, 2)}\n`);

/** The objective's issue, mapped, with `assignees`: who may change a TRD's spec in store mode. */
function seedObjectiveIssue(assignees) {
  const n = fake.seedIssue({ title: '[Objective 7] Store demo', body: 'objective', assignees });
  const map = mapping.readMappingV3(project.root);
  mapping.setEntry(map, '7', { issue_id: n });
  assert.equal(mapping.writeMappingV3(project.root, map).ok, true);
  return n;
}

/** Reads of one issue: `gh api repos/o/r/issues/<n>`. */
const issueReads = (n) => fake.calls().filter((a) => a[0] === 'api' && a[1] === `repos/o/r/issues/${n}`);

/** A scope comment by `login` (an assignee, a stranger, a bot ...). */
const scopeBy = (number, n, text, login) => fake.seedComment(number, trd.buildScopeComment(n, text), { login });

describe('49-06 scope acceptance', () => {
  test('1. store mode: only accepted scopes apply, the rest are pending, with ONE extra read (the objective issue)', () => {
    const objective = seedObjectiveIssue(['alice']);
    const seed = seedTrd();
    scopeBy(seed.number, 1, 'Change by alice.', 'alice');
    const mallory = scopeBy(seed.number, 2, 'Change by mallory.', 'mallory');

    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.deepEqual(r.applied, [1]);
    assert.ok(r.text.includes('Change by alice.'));
    assert.equal(r.text.includes('Change by mallory.'), false, 'a pending scope never reaches the effective spec');
    assert.equal(r.encoded, trd.encodeTrdBody({ id: TRD_ID, file: TRD_FILE, text: r.text }), 'the size covers only what applies');
    assert.deepEqual(r.pending, [{ n: 2, author: 'mallory', comment_id: mallory }]);
    assert.equal(fake.calls().length, 3, 'the TRD issue, its comments, and the objective issue');
    assert.equal(issueReads(objective).length, 1);
    assert.deepEqual(fake.writes(), []);
  });

  test('1a. readTrdState reads the assignees only when asked ({acceptance:true}); R1 keeps its two reads', () => {
    const objective = seedObjectiveIssue(['alice', 'Bob']);
    seedTrd();
    assert.equal(comments.readTrdState(project.root, TRD_ID).ok, true);
    assert.equal(issueReads(objective).length, 0, 'a plain state read does not touch the objective issue');
    const st = comments.readTrdState(project.root, TRD_ID, { acceptance: true });
    assert.equal(st.ok, true);
    assert.deepEqual(st.assignees, ['alice', 'Bob']);
    assert.equal(typeof st.accept, 'function');
    assert.equal(issueReads(objective).length, 1);
  });

  test('1b. an objective with no issue in the mapping: assignees null, nothing extra read, only DevFlow/App scopes apply', () => {
    const seed = seedTrd();
    scopeBy(seed.number, 1, 'Change by alice.', 'alice');
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.deepEqual(r.applied, []);
    assert.equal(r.pending.length, 1);
    assert.equal(r.assignees, null);
    assert.equal(fake.calls().length, 2, 'no objective read: the mapping has no issue for it');
  });

  test('1c. a failing objective read is an error naming it, never a silent "no assignee"', () => {
    const objective = seedObjectiveIssue(['alice']);
    const seed = seedTrd();
    scopeBy(seed.number, 1, 'Change by alice.', 'alice');
    fake.failNext(new RegExp(`issues/${objective}$`), { ok: false, status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' });
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, false);
    assert.match(r.error, /objective/i);
    assert.match(r.error, /500/);
  });

  test('2. a scope enqueueScope queued is accepted whoever posts it, while its comment still matches', () => {
    seedObjectiveIssue(['alice']);
    const seed = seedTrd();
    scopeBy(seed.number, 1, 'One.', 'alice');
    scopeBy(seed.number, 2, 'Two.', 'alice');
    const queued = comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'Third change.', now: T0 });
    assert.equal(queued.n, 3);
    const entry = specRevOps()[0].payload.entry;
    assert.equal(entry.event, `scope n=3 scope_hash=${trd.scopeHash('Third change.')}`);

    // what the flusher does, posting with bob's token: the comment, then the row
    scopeBy(seed.number, 3, 'Third change.', 'bob');
    seedSpecRev(seed.number, [entry]);
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.deepEqual(r.applied, [1, 2, 3]);
    assert.deepEqual(r.pending, []);
  });

  test('2a. the same scope edited afterwards (by anyone) is pending and its text is left out', () => {
    seedObjectiveIssue(['alice']);
    const seed = seedTrd();
    const posted = seedDevflowScope(seed.number, 1, 'As posted.', { login: 'bob' });
    assert.deepEqual(comments.readEffectiveSpec(project.root, TRD_ID).applied, [1]);

    fake.humanEditComment(posted, trd.buildScopeComment(1, 'Quietly changed.'));
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(r.pending, [{ n: 1, author: 'bob', comment_id: posted }]);
    assert.equal(r.text.includes('Quietly changed.'), false);
  });

  test('2b. store off (enabled): spec and fold behave as before: every scope applies, no pending key, no objective read', () => {
    setGithub(STORE_OFF);
    const objective = seedObjectiveIssue(['alice']);
    const seed = seedTrd({ state: 'CLOSED' });
    scopeBy(seed.number, 1, 'By mallory.', 'mallory');

    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.equal(r.ok, true);
    assert.deepEqual(r.applied, [1]);
    assert.equal('pending' in r, false);
    assert.equal('assignees' in r, false);

    const f = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(f.ok, true);
    assert.equal(f.folded_through, 1);
    assert.equal('pending' in f, false);
    assert.equal(issueReads(objective).length, 0, 'the gate never ran');
  });

  test('2c. the spec-rev event of a queued scope is exactly `scope n=1` with the store off', () => {
    setGithub(STORE_OFF);
    seedTrd();
    comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'A change.', now: T0 });
    assert.equal(specRevOps()[0].payload.entry.event, 'scope n=1');
  });

  test('2d. and `scope n=1 scope_hash=<hash of the text>` with the store on', () => {
    seedTrd();
    comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'A change.', now: T0 });
    assert.equal(specRevOps()[0].payload.entry.event, `scope n=1 scope_hash=${trd.scopeHash('A change.')}`);
  });

  test('3. a scope by github.app_login is accepted; another bot is not', () => {
    setGithub({ ...STORE_ON, app_login: 'devflow-app[bot]' });
    seedObjectiveIssue(['alice']);
    const seed = seedTrd();
    scopeBy(seed.number, 1, 'From the App.', 'devflow-app[bot]');
    scopeBy(seed.number, 2, 'From another bot.', 'other-app[bot]');
    const r = comments.readEffectiveSpec(project.root, TRD_ID);
    assert.deepEqual(r.applied, [1]);
    assert.deepEqual(r.pending.map((p) => p.n), [2]);
  });

  test('4. fold stops before the first pending scope; later accepted scopes stay comments; pending are listed', () => {
    seedObjectiveIssue(['alice']);
    const seed = seedTrd({ state: 'CLOSED' });
    scopeBy(seed.number, 1, 'First.', 'alice');
    const mallory = scopeBy(seed.number, 2, 'Second.', 'mallory');
    scopeBy(seed.number, 3, 'Third.', 'alice');

    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.fits, true);
    assert.equal(r.folded_through, 1);
    assert.deepEqual(r.pending, [{ n: 2, author: 'mallory', comment_id: mallory }]);

    const list = ops();
    assert.deepEqual(list.map((o) => o.kind), ['patch-body', 'upsert-comment']);
    assert.equal(trd.decodeTrdBody(list[0].payload.body).text, TRD_TEXT + '\n\n' + trd.buildScopeComment(1, 'First.'));
    assert.match(list[1].payload.entry.event, /^fold folded_through=1 from=/);
  });

  test('4b. a pending scope at n=1 leaves nothing to fold: a no-op that still lists it', () => {
    seedObjectiveIssue(['alice']);
    const seed = seedTrd({ state: 'CLOSED' });
    scopeBy(seed.number, 1, 'First.', 'mallory');
    scopeBy(seed.number, 2, 'Second.', 'alice');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
    assert.deepEqual(r.pending.map((p) => p.n), [1]);
    assert.deepEqual(ops(), []);
  });

  test('4c. nothing pending: the fold is what it was, with an empty pending list', () => {
    seedObjectiveIssue(['alice']);
    const seed = seedTrd({ state: 'CLOSED' });
    scopeBy(seed.number, 1, 'First.', 'alice');
    scopeBy(seed.number, 2, 'Second.', 'alice');
    const r = comments.foldTrd(project.root, TRD_ID, { now: T0 });
    assert.equal(r.folded_through, 2);
    assert.deepEqual(r.pending, []);
  });

  describe('confirmations', () => {
    const confirm = (number, n, text, login, { sticky = false } = {}) => {
      const marker = trd.buildScopeConfirm({ n, hash: trd.scopeHash(text) });
      const bodyText = sticky ? `${body.commentMarker(TRD_ID, comments.scopeConfirmKind(n))}\n${marker}` : marker;
      return fake.seedComment(number, bodyText, { login });
    };

    test('10. an assignee confirm applies a pending scope; editing the scope afterwards makes it pending again', () => {
      seedObjectiveIssue(['alice']);
      const seed = seedTrd();
      const scope = scopeBy(seed.number, 1, 'Mallory proposes.', 'mallory');
      assert.deepEqual(comments.readEffectiveSpec(project.root, TRD_ID).applied, [], 'pending before the confirm');

      confirm(seed.number, 1, 'Mallory proposes.', 'alice', { sticky: true });
      assert.deepEqual(comments.readEffectiveSpec(project.root, TRD_ID).applied, [1]);

      fake.humanEditComment(scope, trd.buildScopeComment(1, 'Mallory proposes something else.'));
      const after = comments.readEffectiveSpec(project.root, TRD_ID);
      assert.deepEqual(after.applied, []);
      assert.deepEqual(after.pending.map((p) => p.n), [1]);
    });

    test('10a. a confirm whose marker is the first line of a plain comment counts too', () => {
      seedObjectiveIssue(['alice']);
      const seed = seedTrd();
      scopeBy(seed.number, 1, 'Mallory proposes.', 'mallory');
      confirm(seed.number, 1, 'Mallory proposes.', 'alice');
      assert.deepEqual(comments.readEffectiveSpec(project.root, TRD_ID).applied, [1]);
    });

    test('10b. a confirm by a non-assignee, for a stale hash, or posted BEFORE its scope does nothing; a valid one does', () => {
      seedObjectiveIssue(['alice']);
      const seed = seedTrd();
      scopeBy(seed.number, 1, 'One.', 'mallory');
      scopeBy(seed.number, 2, 'Two.', 'mallory');
      confirm(seed.number, 1, 'One.', 'mallory'); // not an assignee
      confirm(seed.number, 2, 'Some older text.', 'alice'); // the hash of other text
      confirm(seed.number, 3, 'Three.', 'alice', { sticky: true }); // posted before scope 3 exists
      scopeBy(seed.number, 3, 'Three.', 'mallory');
      scopeBy(seed.number, 4, 'Four.', 'mallory');
      confirm(seed.number, 4, 'Four.', 'alice'); // after its scope: the control
      const r = comments.readEffectiveSpec(project.root, TRD_ID);
      assert.deepEqual(r.applied, [4]);
      assert.deepEqual(r.pending.map((p) => p.n), [1, 2, 3]);
    });

    test('10c. scopeConfirmKind spells n in letters: a digit is not a valid comment-kind character', () => {
      assert.equal(comments.scopeConfirmKind(2), 'scope-confirm-two');
      assert.equal(comments.scopeConfirmKind(10), 'scope-confirm-one-zero');
      assert.equal(typeof body.commentMarker(TRD_ID, comments.scopeConfirmKind(305)), 'string');
      assert.throws(() => comments.scopeConfirmKind(0), TypeError);
    });
  });
});

// ─── Suite-wide: this module performs no GitHub writes ───────────────────────

describe('no writes', () => {
  test('S1. a full lifecycle of reads and enqueues leaves the fake with zero writes', () => {
    const seed = seedTrd({ state: 'CLOSED' });
    seedScope(seed.number, 1, 'One.');
    comments.readTrdState(project.root, TRD_ID);
    comments.readEffectiveSpec(project.root, TRD_ID);
    comments.freezeTrd(project.root, TRD_ID, { now: T0 });
    comments.enqueueScope(project.root, { trdId: TRD_ID, text: 'Two.', now: T0 });
    comments.foldTrd(project.root, TRD_ID, { now: T0 });
    comments.detectTrdDrift(project.root, TRD_ID);
    comments.enqueueSummary(project.root, { trdId: TRD_ID, file: FILE, text: 'sum\n', now: T0 });
    comments.enqueueVerification(project.root, { objectiveId: '7', file: '07-VERIFICATION.md', text: 'v\n', now: T0 });
    assert.deepEqual(fake.writes(), []);
  });
});

// ─── Test 16: the module never writes to GitHub itself ───────────────────────

describe('static guard', () => {
  test('16. gh-comments.cjs never calls the client write paths and has no direct fs/child_process', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-comments.cjs'), 'utf8');
    assert.equal(/ghWrite/.test(src), false, 'no ghWrite anywhere in the module');
    assert.equal(/ghRun\b/.test(src), false, 'ghRun may write, so it is not used either');
    assert.equal(/require\(['"](fs|child_process)['"]\)/.test(src), false);
    assert.equal(/\bgh\b[^\n]*\b(issue|api)\b[^\n]*\b(POST|PATCH|DELETE)\b/.test(src), false);
  });
});
