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
