'use strict';

/**
 * Tests for lib/gh-outbox-flush.cjs (TRD 47-07): the single executor for the outbox.
 *
 * Hermetic: the fake GitHub (`__fixtures__/gh-fake.cjs`) is installed through the client seam, the clock
 * and sleep are injected (nothing sleeps for real), HOME / outbox / cache dirs are temp dirs from
 * `hermeticEnv()`, and the wiki is a local bare repo. Nothing here reaches GitHub or the real ~/.claude.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const trd = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const wiki = require('./gh-wiki.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

// ─── classifyFailure (test 5) ────────────────────────────────────────────────

describe('classifyFailure', () => {
  const fail = (stderr, extra = {}) => ({ ok: false, status: 1, stdout: '', stderr, ...extra });

  test('5a. offline: no exit status, or a network error in stderr', () => {
    assert.equal(flushLib.classifyFailure({ ok: false, status: null, stdout: '', stderr: '' }), 'offline');
    for (const text of [
      'error connecting to api.github.com: dial tcp: lookup api.github.com: could not resolve host',
      'dial tcp 140.82.112.5:443: connection refused',
      'Get "https://api.github.com/": net/http: request canceled (Client.Timeout exceeded) timed out',
      'connect: network is unreachable',
      'unexpected EOF',
    ]) {
      assert.equal(flushLib.classifyFailure(fail(text)), 'offline', text);
    }
  });

  test('5b. rate_limited: a secondary limit, or the client write budget refusal', () => {
    assert.equal(flushLib.classifyFailure(fail('HTTP 403: You have exceeded a secondary rate limit')), 'rate_limited');
    assert.equal(flushLib.classifyFailure(fail('gh: abuse detection mechanism (HTTP 403)')), 'rate_limited');
    assert.equal(flushLib.classifyFailure(fail('API rate limit exceeded (HTTP 429)')), 'rate_limited');
    // the client's budget refusal has status null; it must NOT read as an outage
    assert.equal(flushLib.classifyFailure({
      ok: false, status: null, stdout: '', stderr: '', error: 'write budget exhausted (450 gh writes per run); refusing further writes',
    }), 'rate_limited');
  });

  test('5c. already_exists: a 422 that says the thing is already there', () => {
    for (const text of [
      'gh: Validation Failed (HTTP 422)\n{"message":"Issue may not contain duplicate sub-issues"}',
      'gh: Validation Failed (HTTP 422) {"errors":[{"resource":"Milestone","code":"already_exists"}]}',
      'gh: The title has already been taken (HTTP 422)',
      'gh: Issue is already blocked by this issue (HTTP 422)',
      'label with name "x" already exists (HTTP 422)',
    ]) {
      assert.equal(flushLib.classifyFailure(fail(text)), 'already_exists', text);
    }
  });

  test('5d. validation: any other 422', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Validation Failed (HTTP 422)')), 'validation');
    assert.equal(flushLib.classifyFailure(fail('gh: Issue already has a parent (HTTP 422)')), 'validation');
  });

  test('5e. permission: a 403 that is not a secondary limit, and a 401', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Resource not accessible by integration (HTTP 403)')), 'permission');
    assert.equal(flushLib.classifyFailure(fail('gh: Bad credentials (HTTP 401)')), 'permission');
  });

  test('5f. not_found: a 404', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Not Found (HTTP 404)')), 'not_found');
    assert.equal(flushLib.classifyFailure(fail('', { stdout: '{"message":"Not Found","status":"404"}' })), 'error',
      'a bare status field without an HTTP marker is not enough to call it a 404');
  });

  test('5g. error: anything else, including a success-shaped or empty input', () => {
    assert.equal(flushLib.classifyFailure(fail('something odd happened')), 'error');
    assert.equal(flushLib.classifyFailure(fail('gh: Server Error (HTTP 500)')), 'error');
    assert.equal(flushLib.classifyFailure(null), 'error');
    assert.equal(flushLib.classifyFailure(undefined), 'error');
  });

  test('5h. a rate-limit message beats the offline words it may contain', () => {
    assert.equal(
      flushLib.classifyFailure(fail('HTTP 403: secondary rate limit; request timed out waiting')),
      'rate_limited',
    );
  });
});

// ─── Shared store harness ────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const MILESTONE = 'v9.9 Store Demo';
const NATIVE = Object.freeze({ types: 'native', fields: 'native', hierarchy: 'native', pages: 'wiki', writable: true });
const FIELD_IDS = Object.freeze({ work: 11, kind: 12 });
const CAPS = Object.freeze({ issue_fields: { available: true, ids: FIELD_IDS } });
const TRD_FILES = Object.freeze({
  '7-01': '07-01-alpha-TRD.md', '7-02': '07-02-beta-TRD.md', '7-03': '07-03-gamma-TRD.md',
});

/** Per-test state; `useStore()` rebuilds it before every test of the describe it is called in. */
let S;

/**
 * Registers hooks that give each test a hermetic env, a store project, a fake GitHub installed through the
 * client seam (every call logged with its opts), and a fake clock whose sleep advances it.
 */
function useStore({ fake: fakeOverrides = {}, project: projectOverrides = {} } = {}) {
  beforeEach(() => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store: true, ...projectOverrides });
    const fake = createFakeGitHub({ ...project.fakeOptions, ...fakeOverrides });
    const clock = { t: T0, sleeps: [] };
    const log = [];
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.sleeps.push(ms); clock.t += ms; });
    client._setRunGh((args, opts) => { log.push({ args, opts }); return fake.runGh(args, opts); });
    S = { envh, project, root: project.root, fake, clock, log, seq: 0 };
  });
  afterEach(() => {
    client._resetClient();
    wiki._setRunGit(null);
    S.envh.restore();
    S.project.cleanup();
  });
}

const restId = (n) => 1_000_000 + n;
const issueByNumber = (n) => S.fake.issues.find((i) => i.number === n);
const hashOf = (s) => trd.contentHash(s);
const writesMatching = (re) => S.fake.writes().filter((a) => re.test(a.join(' ')));
const mappingNow = () => mappingLib.readMappingV3(S.root);

function trdOp(id, extra = {}, textSuffix = '') {
  const file = TRD_FILES[id];
  const body = trd.encodeTrdBody({ id, file, text: STORE_FIXTURE.trds[file] + textSuffix });
  return {
    kind: 'upsert-issue',
    target: { id, role: 'trd' },
    payload: { title: `[TRD ${id}] ${file}`, body, labels: ['devflow:trd'], milestone_title: MILESTONE, type: 'TRD', ...extra },
  };
}

function createCtx(opts = {}) {
  const ctx = flushLib.createContext(S.root, { modes: NATIVE, caps: CAPS, ...opts });
  assert.ok(!ctx.error, ctx.error);
  return ctx;
}

/** Run one op through its handler with a fresh context (a new mapping read, empty per-flush caches). */
function exec(op, opts = {}) {
  const ctx = opts.ctx || createCtx(opts);
  const res = flushLib.executeOp(ctx, { seq: ++S.seq, status: 'pending', payload: {}, ...op });
  return { ctx, res };
}

/** Create a TRD issue through the flusher and return its issue number. */
function makeTrd(id) {
  const { res } = exec(trdOp(id));
  assert.equal(res.ok, true, JSON.stringify(res));
  return mappingLib.getTrd(mappingNow(), id).issue_number;
}

const SUMMARY_TEXT = 'Summary text';

/** An objective issue (marker + all four managed sections) seeded in the fake and mapped. */
function seedObjective({ criteria = '- [ ] one\n- [ ] two', labels = ['devflow:objective'] } = {}) {
  const body = bodyLib.mergeManaged('', { summary: SUMMARY_TEXT, criteria, trds: '_None yet._', footer: 'Footer text' }, '7').body;
  const n = S.fake.seedIssue({ title: '[Objective 7] Store demo', body, labels });
  const mapping = mappingNow();
  mappingLib.setEntry(mapping, '7', { issue_id: n });
  assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
  return n;
}

const patchOp = (payload, id = '7') => ({ kind: 'patch-body', target: { id }, payload });
const managed = (sections, extra = {}) => patchOp({ mode: 'managed', sections, ...extra });
const summaryCommentOp = (text, id = '7-01', kind = 'summary') => ({
  kind: 'upsert-comment', target: { id, kind }, payload: { mode: 'replace', text },
});
const specRevOp = (entry, id = '7-01') => ({
  kind: 'upsert-comment', target: { id, kind: 'spec-rev' }, payload: { mode: 'append-spec-rev', entry },
});
const commentsOf = (n) => S.fake.comments.filter((c) => c.issue_number === n);
const stripMarker = (body) => body.split('\n').slice(1).join('\n');

// ─── upsert-issue (tests 6-8) ────────────────────────────────────────────────

describe('upsert-issue', () => {
  useStore();

  test('6. a TRD create is ONE REST POST with --input, labels, the milestone NUMBER and type; id and number are stored', () => {
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));

    const posts = S.log.filter((c) => c.args.join(' ') === 'api --method POST repos/o/r/issues --input -');
    assert.equal(posts.length, 1, 'exactly one create');
    const sent = JSON.parse(posts[0].opts.input);
    assert.deepEqual(sent.labels, ['devflow:trd']);
    assert.equal(sent.type, 'TRD');
    assert.equal(typeof sent.milestone, 'number', 'REST takes the milestone number, not the title');
    assert.equal(sent.title, '[TRD 7-01] 07-01-alpha-TRD.md');
    assert.equal(sent.body, trdOp('7-01').payload.body);

    const issue = S.fake.issues[0];
    assert.equal(issue.type, 'TRD');
    assert.equal(issue.milestone, MILESTONE);
    assert.ok(issue.labels.includes('devflow:trd'));

    const entry = mappingLib.getTrd(mappingNow(), '7-01');
    assert.equal(entry.issue_number, issue.number);
    assert.equal(entry.rest_id, restId(issue.number));
    assert.equal(entry.role, 'trd');

    const base = outbox.getBase(S.root, '7-01');
    assert.equal(base.issue_number, issue.number);
    assert.equal(base.issue_id, restId(issue.number));
    assert.equal(base.body_hash, hashOf(issue.body));
    assert.equal(base.updated_at, issue.updatedAt);
  });

  test('6b. a Decision is created with its own label and a decision id', () => {
    const body = trd.encodeTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text: 'x\n' }).replace('id=7-01', 'id=7-01-d1');
    const { res } = exec({
      kind: 'upsert-issue',
      target: { id: '7-01-d1', role: 'decision' },
      payload: { title: '[Decision 7-01-d1] pick a parser', body, labels: ['devflow:decision'], type: 'Decision' },
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    const entry = mappingLib.getTrd(mappingNow(), '7-01-d1');
    assert.equal(entry.role, 'decision');
    assert.ok(S.fake.issues[0].labels.includes('devflow:decision'));
  });

  test('6c. the base stores the hash of the body GITHUB RETURNED, never a locally recomputed one', () => {
    S.fake.failNext(/POST repos\/o\/r\/issues --input/, {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        id: 1000099, number: 99, title: 't', body: 'RETURNED BODY', updated_at: '2026-01-01T00:00:00Z', type: { name: 'TRD' },
      }),
    });
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));
    const base = outbox.getBase(S.root, '7-01');
    assert.equal(base.body_hash, hashOf('RETURNED BODY'));
    assert.equal(base.issue_number, 99);
    assert.equal(base.issue_id, 1000099);
    assert.equal(base.updated_at, '2026-01-01T00:00:00Z');
    assert.equal(mappingLib.getTrd(mappingNow(), '7-01').rest_id, 1000099);
  });

  test('7. re-running the op after the mapping is deleted finds the issue by marker scan: zero creates', () => {
    exec(trdOp('7-01'));
    const before = S.fake.issues.length;
    fs.rmSync(path.join(S.root, '.planning', '.gh-mapping.json'));
    const writesBefore = S.fake.writes().length;

    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(S.fake.issues.length, before, 'no second issue');
    assert.equal(S.fake.writes().length, writesBefore, 'nothing was written at all');
    assert.equal(mappingLib.getTrd(mappingNow(), '7-01').issue_number, S.fake.issues[0].number, 'the mapping is rebuilt');
  });

  test('7b. a crash between create and bookkeeping (no mapping, no base) is repaired by the next run without a write', () => {
    exec(trdOp('7-01'));
    fs.rmSync(path.join(S.root, '.planning', '.gh-mapping.json'));
    fs.rmSync(path.join(S.envh.env.DEVFLOW_OUTBOX_DIR), { recursive: true, force: true });
    const writesBefore = S.fake.writes().length;
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, true);
    assert.equal(S.fake.issues.length, 1);
    assert.equal(S.fake.writes().length, writesBefore);
    assert.equal(outbox.getBase(S.root, '7-01').issue_number, S.fake.issues[0].number, 'the base is adopted from GitHub');
  });

  test('7c. two issues claiming the same TRD marker block the op: nothing is created or guessed', () => {
    const body = trdOp('7-01').payload.body;
    S.fake.seedIssue({ title: 'a', body, labels: ['devflow:trd'] });
    S.fake.seedIssue({ title: 'b', body, labels: ['devflow:trd'] });
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, false);
    assert.equal(res.class, 'error');
    assert.match(res.error, /duplicate/i);
    assert.equal(S.fake.issues.length, 2);
    assert.equal(writesMatching(/POST repos\/o\/r\/issues /).length, 0);
  });

  test('7d. an update PATCHes only what changed and leaves human labels alone', () => {
    const n = makeTrd('7-01');
    S.fake.issues[0].labels.push('human-label');
    const { res } = exec(trdOp('7-01', {}, '\nExtra line.\n'));
    assert.equal(res.ok, true, JSON.stringify(res));
    const patches = S.log.filter((c) => c.args.includes('PATCH'));
    assert.equal(patches.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(patches[0].opts.input)).sort(), ['body'], 'only the body changed');
    assert.ok(issueByNumber(n).labels.includes('human-label'));
    assert.match(issueByNumber(n).body, /Extra line\./);
    const base = outbox.getBase(S.root, '7-01');
    assert.equal(base.body_hash, hashOf(issueByNumber(n).body));
  });

  test('7e. a mapped issue that no longer exists is not_found (blocked), not silently re-created', () => {
    makeTrd('7-01');
    S.fake.issues.length = 0;
    const createsBefore = writesMatching(/POST repos\/o\/r\/issues /).length;
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, false);
    assert.equal(res.class, 'not_found');
    assert.equal(writesMatching(/POST repos\/o\/r\/issues /).length, createsBefore, 'no second create');
  });
});

describe('upsert-issue without the TRD issue type', () => {
  useStore({ fake: { types: [{ id: 1, name: 'Objective', is_enabled: true }] } });

  test('8. a create whose response type is null reports "type TRD not applied"; the op is still done', () => {
    const { res } = exec(trdOp('7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.warnings.some((w) => /type TRD not applied/.test(w)), JSON.stringify(res.warnings));
    assert.equal(S.fake.issues[0].type, null);
    assert.ok(S.fake.issues[0].labels.includes('devflow:trd'), 'the scan label carries the type');
  });
});

describe('upsert-issue in labels type mode', () => {
  useStore();

  test('8b. types:"labels" sends no type and adds the devflow:type/<name> label', () => {
    const { res } = exec(trdOp('7-01'), { modes: { ...NATIVE, types: 'labels' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    const sent = JSON.parse(S.log.find((c) => c.args.join(' ') === 'api --method POST repos/o/r/issues --input -').opts.input);
    assert.equal(Object.hasOwn(sent, 'type'), false);
    assert.ok(sent.labels.includes('devflow:type/trd'));
    assert.deepEqual(res.warnings, []);
  });
});

// ─── link-sub-issue and block (tests 9-10) ───────────────────────────────────

describe('link-sub-issue', () => {
  useStore();

  test('9. sends the child REST id with -F, never the number; repeating it writes nothing', () => {
    const parent = seedObjective();
    const child = makeTrd('7-01');
    const link = { kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } };

    const { res } = exec(link);
    assert.equal(res.ok, true, JSON.stringify(res));
    const posts = S.fake.writes().filter((a) => a.join(' ').includes('/sub_issues'));
    assert.deepEqual(posts, [['api', '--method', 'POST', `repos/o/r/issues/${parent}/sub_issues`, '-F', `sub_issue_id=${restId(child)}`]]);
    assert.notEqual(restId(child), child);
    assert.deepEqual(issueByNumber(parent).subIssues, [child]);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(link).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore, 'the read finds the child: zero writes');
  });

  test('9b. hierarchy:"tasklist" writes nothing and is done with note "tasklist"', () => {
    seedObjective();
    makeTrd('7-01');
    const writesBefore = S.fake.writes().length;
    const { res } = exec({ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } }, { modes: { ...NATIVE, hierarchy: 'tasklist' } });
    assert.equal(res.ok, true);
    assert.equal(res.note, 'tasklist');
    assert.equal(S.fake.writes().length, writesBefore);
  });

  test('9c. a child with no issue yet is an error naming it; nothing is written', () => {
    seedObjective();
    const { res } = exec({ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } });
    assert.equal(res.ok, false);
    assert.match(res.error, /7-01/);
    assert.equal(S.fake.writes().length, 0);
  });

  test('9d. a 422 "duplicate sub-issues" from a racing writer counts as success', () => {
    seedObjective();
    makeTrd('7-01');
    S.fake.failNext(/POST .*sub_issues/, { ok: false, status: 1, stderr: 'gh: Issue may not contain duplicate sub-issues (HTTP 422)' });
    const { res } = exec({ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } });
    assert.equal(res.ok, true, JSON.stringify(res));
  });

  test('9e. a 403 on the link is a permission failure the flusher can block on', () => {
    seedObjective();
    makeTrd('7-01');
    S.fake.failNext(/POST .*sub_issues/, { ok: false, status: 1, stderr: 'gh: Resource not accessible by integration (HTTP 403)' });
    const { res } = exec({ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } });
    assert.equal(res.ok, false);
    assert.equal(res.class, 'permission');
  });
});

describe('block', () => {
  useStore();

  test('10. blocks with the blocker REST id (-F issue_id) on the blocked issue number; repeating writes nothing', () => {
    const a = makeTrd('7-01');
    const c = makeTrd('7-03');
    const op = { kind: 'block', target: { blocked: '7-03', blocker: '7-01' } };

    const { res } = exec(op);
    assert.equal(res.ok, true, JSON.stringify(res));
    const posts = S.fake.writes().filter((w) => w.join(' ').includes('dependencies/blocked_by'));
    assert.deepEqual(posts, [['api', '--method', 'POST', `repos/o/r/issues/${c}/dependencies/blocked_by`, '-F', `issue_id=${restId(a)}`]]);
    assert.deepEqual(issueByNumber(c).blockedBy, [a]);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(op).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore);
  });
});

// ─── set-fields (test 11) ────────────────────────────────────────────────────

describe('set-fields', () => {
  useStore();

  test('11. native: one POST issue-field-values with the field ids; repeating writes nothing', () => {
    const n = seedObjective();
    const op = { kind: 'set-fields', target: { id: '7' }, payload: { values: { work: 'feature', kind: 'plugin' } } };
    const { res } = exec(op);
    assert.equal(res.ok, true, JSON.stringify(res));
    const post = S.log.find((c) => c.args.join(' ') === `api --method POST repos/o/r/issues/${n}/issue-field-values --input -`);
    assert.ok(post, 'one POST with --input');
    assert.deepEqual(JSON.parse(post.opts.input), {
      issue_field_values: [{ field_id: 11, value: 'feature' }, { field_id: 12, value: 'plugin' }],
    });
    assert.deepEqual(issueByNumber(n).fieldValues, [{ field_id: 11, value: 'feature' }, { field_id: 12, value: 'plugin' }]);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(op).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore);
  });

  test('11b. fields:"meta" writes nothing (the body meta section carries them) and says so', () => {
    seedObjective();
    const { res } = exec(
      { kind: 'set-fields', target: { id: '7' }, payload: { values: { work: 'feature' } } },
      { modes: { ...NATIVE, fields: 'meta' } },
    );
    assert.equal(res.ok, true);
    assert.equal(res.note, 'meta');
    assert.equal(S.fake.writes().length, 0);
  });

  test('11c. native fields without known field ids is an error, not a guess', () => {
    seedObjective();
    const { res } = exec(
      { kind: 'set-fields', target: { id: '7' }, payload: { values: { work: 'feature' } } },
      { caps: { issue_fields: { available: true, ids: {} } } },
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /field id/i);
  });
});

// ─── upsert-comment (tests 12-13) ────────────────────────────────────────────

describe('upsert-comment replace', () => {
  useStore();
  const FILE = '07-01-alpha-SUMMARY.md';
  const textFor = (body) => `${trd.fileLine(FILE)}\n${body}`;

  test('12. posts "<marker>\\n<text>"; the same text again writes nothing; mapping records the comment', () => {
    const n = makeTrd('7-01');
    const text = textFor(STORE_FIXTURE.summary);
    const { res } = exec(summaryCommentOp(text));
    assert.equal(res.ok, true, JSON.stringify(res));
    const cs = commentsOf(n);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].body, `<!-- devflow:id=7-01 kind=summary -->\n${text}`);
    assert.deepEqual(mappingLib.getTrd(mappingNow(), '7-01').comment_ids.summary, [cs[0].id]);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(summaryCommentOp(text)).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore);
  });

  test('12b. a 130K-char text becomes 3 numbered part comments that join back losslessly; no long argv is used', () => {
    const n = makeTrd('7-01');
    const big = textFor(('x'.repeat(99) + '\n').repeat(1300));
    const { res } = exec(summaryCommentOp(big));
    assert.equal(res.ok, true, JSON.stringify(res));
    const cs = commentsOf(n);
    assert.equal(cs.length, 3);
    for (const c of cs) assert.ok(c.body.length <= trd.COMMENT_MAX_CHARS, `part of ${c.body.length} chars`);
    const found = bodyLib.findCommentsByMarker(cs, '7-01', 'summary');
    assert.deepEqual(found.map((f) => [f.part, f.of]), [[1, 3], [2, 3], [3, 3]]);
    const joined = trd.joinParts(found.map((f) => stripMarker(f.comment.body)));
    assert.equal(joined.ok, true);
    assert.equal(joined.text, big);
    for (const w of S.fake.writes()) {
      for (const a of w) assert.ok(a.length < 500, 'the text travels on stdin, not in argv');
    }
    assert.equal(mappingLib.getTrd(mappingNow(), '7-01').comment_ids.summary.length, 3);
  });

  test('12c. shrinking to one part re-marks the surplus parts "<kind>-superseded"; none is deleted', () => {
    const n = makeTrd('7-01');
    exec(summaryCommentOp(textFor(('x'.repeat(99) + '\n').repeat(1300))));
    const small = textFor('now short\n');
    const { res } = exec(summaryCommentOp(small));
    assert.equal(res.ok, true, JSON.stringify(res));
    const cs = commentsOf(n);
    assert.equal(cs.length, 3, 'nothing was deleted');
    assert.equal(cs[0].body, `<!-- devflow:id=7-01 kind=summary -->\n${small}`);
    assert.equal(cs[1].body.split('\n')[0], '<!-- devflow:id=7-01 kind=summary-superseded -->');
    assert.equal(cs[2].body.split('\n')[0], '<!-- devflow:id=7-01 kind=summary-superseded -->');
    assert.equal(bodyLib.findCommentsByMarker(cs, '7-01', 'summary').length, 1);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(summaryCommentOp(small)).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore, 'a repeat is idempotent');
  });

  test('12d. an objective-level comment (verification) goes on the objective issue', () => {
    const n = seedObjective();
    const { res } = exec(summaryCommentOp(`${trd.fileLine('07-VERIFICATION.md')}\nAll good\n`, '7', 'verification'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(commentsOf(n).length, 1);
    assert.equal(commentsOf(n)[0].body.split('\n')[0], '<!-- devflow:id=7 kind=verification -->');
  });
});

describe('upsert-comment append-spec-rev', () => {
  useStore();
  const entry = (event, seed, chars = 10) => ({ at: '2026-10-01T00:00:00Z', event, hash: hashOf(seed), chars });

  test('13. creates the spec-rev comment, then appends; an identical entry writes nothing', () => {
    const n = makeTrd('7-01');
    const e1 = entry('freeze', 'body-1');
    assert.equal(exec(specRevOp(e1)).res.ok, true);
    let cs = commentsOf(n);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].body.split('\n')[0], '<!-- devflow:id=7-01 kind=spec-rev -->');
    assert.equal(trd.parseSpecRev(cs[0].body).entries.length, 1);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(specRevOp(e1)).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore, 'identical entry: zero writes');

    assert.equal(exec(specRevOp(entry('scope n=1', 'eff-1'))).res.ok, true);
    cs = commentsOf(n);
    assert.equal(cs.length, 1, 'still one comment');
    assert.deepEqual(trd.parseSpecRev(cs[0].body).entries.map((e) => e.event), ['freeze', 'scope n=1']);
  });

  test('13b. a freeze entry sets base.frozen; other entries do not', () => {
    makeTrd('7-01');
    assert.equal(outbox.getBase(S.root, '7-01').frozen, undefined);
    exec(specRevOp(entry('scope n=1', 'eff-1')));
    assert.equal(outbox.getBase(S.root, '7-01').frozen, undefined);
    exec(specRevOp(entry('freeze', 'body-1')));
    assert.equal(outbox.getBase(S.root, '7-01').frozen, true);
    // the body hash recorded for the issue is untouched by freezing
    assert.equal(outbox.getBase(S.root, '7-01').body_hash, hashOf(S.fake.issues[0].body));
  });

  test('13c. a freeze with no base yet still freezes: the base is built from the issue', () => {
    makeTrd('7-01');
    fs.rmSync(S.envh.env.DEVFLOW_OUTBOX_DIR, { recursive: true, force: true });
    assert.equal(outbox.getBase(S.root, '7-01'), null);
    assert.equal(exec(specRevOp(entry('freeze', 'body-1'))).res.ok, true);
    const base = outbox.getBase(S.root, '7-01');
    assert.equal(base.frozen, true);
    assert.equal(base.issue_number, S.fake.issues[0].number);
  });
});

// ─── post-scope (test 14) ────────────────────────────────────────────────────

describe('post-scope', () => {
  useStore();

  test('14. posts the scope comment once per n; re-running writes nothing', () => {
    const n = makeTrd('7-01');
    const one = { kind: 'post-scope', target: { id: '7-01', n: 1 }, payload: { text: 'first change\n' } };
    const two = { kind: 'post-scope', target: { id: '7-01', n: 2 }, payload: { text: 'second change\n' } };
    assert.equal(exec(one).res.ok, true);
    assert.equal(exec(two).res.ok, true);
    const cs = commentsOf(n);
    assert.deepEqual(cs.map((c) => c.body.split('\n')[0]), ['<!-- devflow:scope n=1 -->', '<!-- devflow:scope n=2 -->']);
    assert.equal(cs[1].body, `${trd.scopeMarker(2)}\nsecond change\n`);

    const writesBefore = S.fake.writes().length;
    assert.equal(exec(two).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore);
    assert.equal(trd.parseScopeComments(commentsOf(n).map((c) => ({ id: c.id, body: c.body }))).scopes.length, 2);
  });

  test('14b. text already carrying the scope marker is posted as is, not marked twice', () => {
    const n = makeTrd('7-01');
    const built = trd.buildScopeComment(1, 'prebuilt\n');
    assert.equal(typeof built, 'string');
    assert.equal(exec({ kind: 'post-scope', target: { id: '7-01', n: 1 }, payload: { text: built } }).res.ok, true);
    assert.equal(commentsOf(n)[0].body, built);
  });
});

// ─── patch-body and derived sections (test 15) ───────────────────────────────

describe('patch-body managed', () => {
  useStore();

  /** A wiki remote + clone so `store.headSha()` has a real revision. */
  function withWikiClone(fn) {
    if (!gitAvailable()) return undefined;
    const restoreGit = applyGitTestEnv(path.join(S.envh.root, 'home'));
    const remote = createWikiRemote();
    try {
      const cloned = wiki.ensureClone(S.root, { remote: remote.remoteUrl });
      assert.equal(cloned.ok, true, JSON.stringify(cloned));
      return fn(remote);
    } finally {
      restoreGit();
      remote.cleanup();
    }
  }

  test('15. derive.wiki carries the clone revision and the cache dir marker; derive.trds is the native line', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    const n = seedObjective();
    makeTrd('7-01');
    makeTrd('7-02');
    withWikiClone((remote) => {
      const sha = wiki.headSha(S.root);
      assert.equal(sha, remote.headSha());
      const { res } = exec(managed({ summary: 'New summary' }, { derive: { wiki: { dir: '07-store-demo' }, trds: true } }));
      assert.equal(res.ok, true, JSON.stringify(res));
      const body = issueByNumber(n).body;
      assert.equal(bodyLib.extractSection(body, 'summary'), 'New summary');
      const section = bodyLib.extractSection(body, 'wiki');
      assert.match(section, /<!-- devflow:dir=07-store-demo -->/);
      assert.ok(section.includes(`\`${sha}\``), section);
      assert.ok(section.includes(wiki.pageRevisionUrl('o/r', 'Objective-7-store-demo', sha)), section);
      assert.equal(bodyLib.parseDirMarker(body), '07-store-demo');
      assert.equal(bodyLib.extractSection(body, 'trds'), '2 TRDs, tracked as sub-issues.');
      assert.equal(bodyLib.extractSection(body, 'meta'), null, 'meta only appears in a degraded mode');
    });
  });

  test('15b. derive.trds in tasklist mode renders a task list from the mapping', () => {
    const n = seedObjective();
    const a = makeTrd('7-01');
    const b = makeTrd('7-02');
    const { res } = exec(managed({}, { derive: { trds: true } }), { modes: { ...NATIVE, hierarchy: 'tasklist' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'trds'), `- [ ] #${a} 7-01\n- [ ] #${b} 7-02`);
  });

  test('15c. derive.meta appears only for a degraded mode, with only the keys that mode needs', () => {
    const n = seedObjective();
    const meta = { type: 'Objective', work: 'feature', kind: 'plugin' };

    assert.equal(exec(managed({}, { derive: { meta } })).res.ok, true);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'meta'), null, 'native types and fields: no meta section');

    assert.equal(exec(managed({}, { derive: { meta } }), { modes: { ...NATIVE, types: 'labels' } }).res.ok, true);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'meta'), 'type: Objective');

    assert.equal(exec(managed({}, { derive: { meta } }), { modes: { ...NATIVE, fields: 'meta' } }).res.ok, true);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'meta'), 'work: feature\nkind: plugin');
  });

  test('15d. docs pages mode writes a wiki section with the dir marker and the docs path (no revision sha)', () => {
    const n = seedObjective();
    const { res } = exec(managed({}, { derive: { wiki: { dir: '07-store-demo' } } }), { modes: { ...NATIVE, pages: 'docs' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    const body = issueByNumber(n).body;
    assert.equal(bodyLib.parseDirMarker(body), '07-store-demo');
    assert.match(bodyLib.extractSection(body, 'wiki'), /docs\/devflow\/Objective-7-store-demo\.md/);
  });

  test('15e. preserve_ticks keeps a tick the verifier made; a repeat of the same patch writes nothing', () => {
    const n = seedObjective({ criteria: '- [x] one\n- [ ] two' });
    const op = managed({ criteria: '- [ ] one\n- [ ] two' }, { preserve_ticks: true });
    const { res } = exec(op);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'criteria'), '- [x] one\n- [ ] two');
    const writesBefore = S.fake.writes().length;
    assert.equal(exec(op).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore, 'merged text is unchanged: no write');
  });

  test('15f. an objective with no mapped issue is an error naming it', () => {
    const { res } = exec(managed({ summary: 'x' }));
    assert.equal(res.ok, false);
    assert.match(res.error, /objective 7/i);
    assert.equal(S.fake.writes().length, 0);
  });

  test('15g. a patch-body replace on a TRD writes the whole body and stores the returned hash', () => {
    const n = makeTrd('7-01');
    const newBody = trd.encodeTrdBody({ id: '7-01', file: TRD_FILES['7-01'], text: 'replaced text\n' });
    const { res } = exec(patchOp({ mode: 'replace', body: newBody }, '7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(issueByNumber(n).body, newBody);
    assert.equal(outbox.getBase(S.root, '7-01').body_hash, hashOf(newBody));
  });
});

// ─── patch-issue ─────────────────────────────────────────────────────────────

describe('patch-issue', () => {
  useStore();

  test('16a. close with a reason, add a label, set a type: one PATCH; a repeat writes nothing', () => {
    const n = makeTrd('7-01');
    const op = {
      kind: 'patch-issue',
      target: { id: '7-01' },
      payload: { state: 'closed', state_reason: 'completed', labels_add: ['devflow:done'] },
    };
    const { res } = exec(op);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(issueByNumber(n).state, 'CLOSED');
    assert.equal(issueByNumber(n).stateReason, 'completed');
    assert.ok(issueByNumber(n).labels.includes('devflow:done'));
    assert.ok(issueByNumber(n).labels.includes('devflow:trd'), 'existing labels are kept');
    const writesBefore = S.fake.writes().length;
    assert.equal(exec(op).res.ok, true);
    assert.equal(S.fake.writes().length, writesBefore);
  });

  test('16b. a type that GitHub does not apply is reported, not failed', () => {
    const n = makeTrd('7-01');
    S.fake.issues[0].type = null;
    const { res } = exec({ kind: 'patch-issue', target: { id: '7-01' }, payload: { type: 'NoSuchType' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.warnings.some((w) => /type NoSuchType not applied/.test(w)), JSON.stringify(res.warnings));
    assert.equal(issueByNumber(n).type, null);
  });
});

// ─── wiki-push (test 16) ─────────────────────────────────────────────────────

describe('wiki-push', () => {
  useStore();
  const pagesOp = (pages = ['PROJECT.md', 'REQUIREMENTS.md']) => ({
    kind: 'wiki-push', target: { store: 'pages' }, payload: { pages, message: 'sync pages' },
  });

  function withRemote(fn) {
    const restoreGit = applyGitTestEnv(path.join(S.envh.root, 'home'));
    const remote = createWikiRemote();
    try {
      return fn(remote);
    } finally {
      restoreGit();
      remote.cleanup();
    }
  }

  test('16. pages:"wiki" clones, writes the CURRENT cache files as pages and pushes them', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    withRemote((remote) => {
      const { res } = exec(pagesOp(), { wikiRemote: remote.remoteUrl });
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal(remote.readRemotePage('Project'), STORE_FIXTURE.project);
      assert.equal(remote.readRemotePage('Requirements'), STORE_FIXTURE.requirements);

      // The payload names paths, not text: a later edit to the file is what gets pushed.
      fs.writeFileSync(path.join(S.root, '.planning', 'PROJECT.md'), '# Edited project\n');
      assert.equal(exec(pagesOp(['PROJECT.md']), { wikiRemote: remote.remoteUrl }).res.ok, true);
      assert.equal(remote.readRemotePage('Project'), '# Edited project\n');
    });
  });

  test('16b. pages:"docs" writes docs/devflow/<Page>.md and never touches git', () => {
    const calls = [];
    wiki._setRunGit((args) => { calls.push(args); return { ok: false, status: 1, stdout: '', stderr: 'git must not be called' }; });
    const { res } = exec(
      pagesOp(['PROJECT.md', 'objectives/07-store-demo/OBJECTIVE.md']),
      { modes: { ...NATIVE, pages: 'docs' } },
    );
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(fs.readFileSync(path.join(S.root, 'docs', 'devflow', 'Project.md'), 'utf8'), STORE_FIXTURE.project);
    assert.equal(
      fs.readFileSync(path.join(S.root, 'docs', 'devflow', 'Objective-7-store-demo.md'), 'utf8'),
      STORE_FIXTURE.objective,
    );
    assert.deepEqual(calls, []);
  });

  test('16c. pages:"blocked" blocks the op with the capability message and touches nothing', () => {
    const { res } = exec(pagesOp(), {
      modes: { ...NATIVE, pages: 'blocked', pages_message: 'create the first wiki page in the GitHub web UI' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.class, 'blocked');
    assert.match(res.error, /create the first wiki page in the GitHub web UI/);
    assert.equal(fs.existsSync(path.join(S.root, 'docs')), false);
    assert.equal(fs.existsSync(path.join(S.root, '.planning', 'wiki')), false);
  });

  test('16d. an uninitialised wiki is blocked for a human (web UI step), never silently switched to docs', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    withRemote((remote) => {
      const { res } = exec(pagesOp(), { wikiRemote: remote.missingUrl });
      assert.equal(res.ok, false);
      assert.equal(res.class, 'blocked');
      assert.match(res.error, /first wiki page|web UI/i);
      assert.equal(fs.existsSync(path.join(S.root, 'docs')), false);
    });
  });

  test('16e. a network failure on push leaves the op to retry (class offline)', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    withRemote((remote) => {
      assert.equal(exec(pagesOp(), { wikiRemote: remote.remoteUrl }).res.ok, true);
      fs.writeFileSync(path.join(S.root, '.planning', 'PROJECT.md'), '# Changed while offline\n');
      wiki._setRunGit((args, opts) => {
        if (args.includes('pull') || args.includes('push')) {
          return { ok: false, status: 128, stdout: '', stderr: "fatal: unable to access 'https://github.com/o/r.wiki.git/': Could not resolve host: github.com" };
        }
        const r = spawnSync('git', args, { cwd: opts && opts.cwd, env: process.env, encoding: 'utf-8' });
        return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
      });
      const { res } = exec(pagesOp(['PROJECT.md']), { wikiRemote: remote.remoteUrl });
      assert.equal(res.ok, false);
      assert.equal(res.class, 'offline');
    });
  });

  test('16f. a source file that is gone, and a path that is not a wiki document, are skipped with a warning', () => {
    const { res } = exec(pagesOp(['STATE.md', 'REQUIREMENTS.md', 'codebase/MISSING.md']), { modes: { ...NATIVE, pages: 'docs' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.warnings.length, 2, JSON.stringify(res.warnings));
    assert.ok(res.warnings.some((w) => /STATE\.md/.test(w)), 'not a wiki document');
    assert.ok(res.warnings.some((w) => /codebase\/MISSING\.md/.test(w)), 'source file missing');
    assert.equal(fs.existsSync(path.join(S.root, 'docs', 'devflow', 'Requirements.md')), true);
  });
});

// ─── Remote-edit detection at handler level (D-24, Pitfall 2) ────────────────

describe('remote-edit detection', () => {
  useStore();

  test('19h. an edit INSIDE a managed section halts the patch with the issue named; nothing is written', () => {
    const n = seedObjective();
    assert.equal(exec(managed({ summary: 'Mine 1' })).res.ok, true);
    S.fake.humanEditBody(n, issueByNumber(n).body.replace('Mine 1', 'A human rewrote this'));

    const writesBefore = S.fake.writes().length;
    const { res } = exec(managed({ summary: 'Mine 2' }));
    assert.equal(res.ok, false);
    assert.equal(res.halt, true);
    assert.equal(res.issue_number, n);
    assert.match(res.detail, new RegExp(`#${n}\\b`));
    assert.equal(S.fake.writes().length, writesBefore, 'zero writes after the halt');
    assert.match(issueByNumber(n).body, /A human rewrote this/);
  });

  test('20h. human text OUTSIDE the managed sections is merged and preserved byte for byte; no halt', () => {
    const n = seedObjective();
    assert.equal(exec(managed({ summary: 'Mine 1' })).res.ok, true);
    const note = '\n\nHuman note: keep me.\nSecond line with trailing spaces   \n';
    S.fake.humanEditBody(n, issueByNumber(n).body + note);

    const { res } = exec(managed({ summary: 'Mine 2' }));
    assert.equal(res.ok, true, JSON.stringify(res));
    const body = issueByNumber(n).body;
    assert.ok(body.endsWith(note), 'human text preserved byte for byte');
    assert.equal(bodyLib.extractSection(body, 'summary'), 'Mine 2');
  });

  test('20ah. a criterion ticked on GitHub inside criteria is not a remote edit; the next patch keeps the tick', () => {
    const n = seedObjective();
    assert.equal(exec(managed({ criteria: '- [ ] one\n- [ ] two' }, { preserve_ticks: true })).res.ok, true);
    S.fake.humanEditBody(n, issueByNumber(n).body.replace('- [ ] one', '- [x] one'));

    const { res } = exec(managed({ criteria: '- [ ] one\n- [ ] two', summary: 'Mine 2' }, { preserve_ticks: true }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'criteria'), '- [x] one\n- [ ] two');
  });

  test('21h. a TRD body edited on GitHub halts an upsert-issue update', () => {
    const n = makeTrd('7-01');
    S.fake.humanEditBody(n, `${issueByNumber(n).body}\nhuman addition\n`);
    const writesBefore = S.fake.writes().length;
    const { res } = exec(trdOp('7-01', {}, '\nDevFlow wants this line.\n'));
    assert.equal(res.ok, false);
    assert.equal(res.halt, true);
    assert.equal(res.issue_number, n);
    assert.equal(S.fake.writes().length, writesBefore);
  });

  test('21bh. a frozen TRD is never patched by upsert-issue: a differing body is a drift warning and the op is done', () => {
    const n = makeTrd('7-01');
    assert.equal(exec(specRevOp({ at: '2026-10-01T00:00:00Z', event: 'freeze', hash: hashOf('b'), chars: 1 })).res.ok, true);
    assert.equal(outbox.getBase(S.root, '7-01').frozen, true);
    S.fake.humanEditBody(n, `${issueByNumber(n).body}\nhuman addition\n`);

    const writesBefore = S.fake.writes().length;
    const { res } = exec(trdOp('7-01', {}, '\nDevFlow wants this line.\n'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.warnings.some((w) => /drift/i.test(w)), JSON.stringify(res.warnings));
    assert.equal(S.fake.writes().length, writesBefore);
    assert.match(issueByNumber(n).body, /human addition/);
    assert.equal(outbox.getBase(S.root, '7-01').frozen, true, 'frozen survives');
  });

  test('21ch. a patch-body replace (the fold) IS allowed on a frozen TRD when nobody edited it', () => {
    const n = makeTrd('7-01');
    exec(specRevOp({ at: '2026-10-01T00:00:00Z', event: 'freeze', hash: hashOf('b'), chars: 1 }));
    const folded = trd.encodeTrdBody({ id: '7-01', file: TRD_FILES['7-01'], text: 'folded text\n' });
    const { res } = exec(patchOp({ mode: 'replace', body: folded }, '7-01'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(issueByNumber(n).body, folded);
    assert.equal(outbox.getBase(S.root, '7-01').frozen, true);
  });

  test('21dh. a patch-body replace on a TRD edited on GitHub halts', () => {
    const n = makeTrd('7-01');
    S.fake.humanEditBody(n, `${issueByNumber(n).body}\nhuman addition\n`);
    const folded = trd.encodeTrdBody({ id: '7-01', file: TRD_FILES['7-01'], text: 'folded text\n' });
    const { res } = exec(patchOp({ mode: 'replace', body: folded }, '7-01'));
    assert.equal(res.halt, true);
  });

  test('22h. DevFlow\'s own link and comment writes bump updated_at but never cause a halt (Pitfall 2)', () => {
    const n = seedObjective();
    makeTrd('7-01');
    assert.equal(exec(managed({ summary: 'Mine 1' })).res.ok, true);
    const baseBefore = outbox.getBase(S.root, '7');

    assert.equal(exec({ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' } }).res.ok, true);
    assert.equal(exec(summaryCommentOp('verification text\n', '7', 'verification')).res.ok, true);
    assert.notEqual(issueByNumber(n).updatedAt, baseBefore.updated_at, 'updated_at moved: an updated_at-only check would halt here');

    const { res } = exec(managed({ summary: 'Mine 2' }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.halt, undefined);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'Mine 2');
  });

  test('22bh. with no base yet the first DevFlow write adopts the fresh body: no halt', () => {
    const n = seedObjective();
    const { res } = exec(managed({ summary: 'First write' }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'First write');
    const base = outbox.getBase(S.root, '7');
    assert.equal(base.body_hash, hashOf(issueByNumber(n).body));
    assert.equal(typeof base.managed_hash, 'string');
  });

  test('23h. a replace comment edited on GitHub halts; an append-spec-rev never halts', () => {
    const n = makeTrd('7-01');
    assert.equal(exec(summaryCommentOp('first text\n')).res.ok, true);
    assert.equal(exec(specRevOp({ at: '2026-10-01T00:00:00Z', event: 'freeze', hash: hashOf('b'), chars: 1 })).res.ok, true);
    const [summary, specRev] = commentsOf(n);
    S.fake.humanEditComment(summary.id, `${summary.body}\nhuman comment edit\n`);
    S.fake.humanEditComment(specRev.id, `${specRev.body}\nhuman note below the table\n`);

    const writesBefore = S.fake.writes().length;
    const halted = exec(summaryCommentOp('second text\n'));
    assert.equal(halted.res.halt, true);
    assert.equal(halted.res.issue_number, n);
    assert.equal(S.fake.writes().length, writesBefore);

    const appended = exec(specRevOp({ at: '2026-10-02T00:00:00Z', event: 'scope n=1', hash: hashOf('c'), chars: 2 }));
    assert.equal(appended.res.ok, true, JSON.stringify(appended.res));
    assert.match(commentsOf(n)[1].body, /human note below the table/);
  });
});

// ─── Flush loop (tests 17-26) ────────────────────────────────────────────────

const enqueueOps = (ops) => {
  const r = outbox.enqueue(S.root, ops, { now: S.clock.t });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.enqueued;
};
const runFlush = (opts = {}) => flushLib.flush(S.root, { modes: NATIVE, caps: CAPS, ...opts });
const queueNow = () => outbox.status(S.root, { now: S.clock.t }).queue;
const successfulCreates = () => S.fake.issues.map((i) => i.title);

/** Seed N writes into the journal's cross-process budget. */
function seedWrites(count, at) {
  const { journal } = outbox.readJournal(S.root);
  for (let i = 0; i < count; i++) outbox.recordWrite(journal, at(i));
  outbox.writeJournal(S.root, journal);
}

describe('flush: order, offline and blocked ops (tests 17, 18)', () => {
  useStore();
  const threeTrds = () => [trdOp('7-01'), trdOp('7-02'), trdOp('7-03')];

  test('17. offline: the flush stops with status pending, all ops stay pending; reconnecting completes them in order (SC4)', () => {
    enqueueOps(threeTrds());
    S.fake.setOffline(true);
    const first = runFlush();
    assert.equal(first.status, 'pending');
    assert.equal(first.reason, 'offline');
    assert.deepEqual(first.done, []);
    assert.equal(first.pending, 3);
    assert.equal(S.fake.issues.length, 0, 'nothing was created while offline');
    assert.deepEqual(queueNow().map((o) => o.status), ['pending', 'pending', 'pending']);
    assert.equal(queueNow()[0].attempts, 1);

    S.fake.setOffline(false);
    const second = runFlush();
    assert.equal(second.status, 'flushed');
    assert.deepEqual(second.done, [1, 2, 3]);
    assert.equal(second.pending, 0);
    assert.deepEqual(successfulCreates(), ['[TRD 7-01] 07-01-alpha-TRD.md', '[TRD 7-02] 07-02-beta-TRD.md', '[TRD 7-03] 07-03-gamma-TRD.md']);
    assert.equal(outbox.status(S.root).queue.length, 0);
    assert.equal(fs.existsSync(outbox.lockPath(S.root)), false, 'the lock is released');
  });

  test('18. a blocked op (403) stops the queue: the next op is not executed and the halt says blocked', () => {
    enqueueOps(threeTrds());
    let n = 0;
    S.fake.failNext(
      (argv) => argv.join(' ') === 'api --method POST repos/o/r/issues --input -' && ++n === 2,
      { ok: false, status: 1, stderr: 'gh: Resource not accessible by integration (HTTP 403)' },
    );
    const res = runFlush();
    assert.equal(res.status, 'halted');
    assert.equal(res.halted.reason, 'blocked');
    assert.deepEqual(res.halted.target, { id: '7-02', role: 'trd' });
    assert.deepEqual(res.done, [1]);
    assert.equal(S.fake.issues.length, 1, 'op 3 never ran');
    assert.deepEqual(queueNow().map((o) => [o.seq, o.status]), [[2, 'blocked'], [3, 'pending']]);
    assert.match(queueNow()[0].last_error, /403|not accessible/i);

    const again = runFlush();
    assert.equal(again.status, 'halted', 'a blocked head op keeps the queue stopped');
    assert.equal(S.fake.issues.length, 1);
  });

  test('18b. resolveHalt overwrite on a blocked op makes it pending again; the next flush finishes the queue in order', () => {
    enqueueOps(threeTrds());
    let n = 0;
    S.fake.failNext(
      (argv) => argv.join(' ') === 'api --method POST repos/o/r/issues --input -' && ++n === 2,
      { ok: false, status: 1, stderr: 'gh: Validation Failed (HTTP 422)' },
    );
    assert.equal(runFlush().status, 'halted');
    const r = flushLib.resolveHalt(S.root, 2, 'overwrite', { modes: NATIVE, caps: CAPS });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(outbox.status(S.root).halted, null);
    assert.equal(queueNow()[0].status, 'pending');
    const res = runFlush();
    assert.equal(res.status, 'flushed');
    assert.deepEqual(res.done, [2, 3]);
    assert.equal(S.fake.issues.length, 3);
  });

  test('18c. an unexpected throw inside a handler blocks that op, halts, and still releases the lock', () => {
    enqueueOps([trdOp('7-01')]);
    client._setRunGh(() => { throw new Error('boom from the runner'); });
    const res = runFlush();
    assert.equal(res.status, 'halted');
    assert.equal(res.halted.reason, 'blocked');
    assert.match(queueNow()[0].last_error, /boom from the runner/);
    assert.equal(fs.existsSync(outbox.lockPath(S.root)), false);
  });

  test('18d. pages:"blocked" blocks a wiki-push op and halts the flush with the capability message', () => {
    enqueueOps([{ kind: 'wiki-push', target: { store: 'pages' }, payload: { pages: ['PROJECT.md'], message: 'm' } }]);
    const res = runFlush({ modes: { ...NATIVE, pages: 'blocked', pages_message: 'create the first wiki page in the GitHub web UI' } });
    assert.equal(res.status, 'halted');
    assert.equal(res.halted.reason, 'blocked');
    assert.match(res.halted.detail, /create the first wiki page in the GitHub web UI/);
    assert.equal(queueNow()[0].status, 'blocked');
  });

  test('18e. an empty queue is flushed with zero gh calls; maxOps stops cleanly with the rest pending', () => {
    const empty = runFlush();
    assert.equal(empty.status, 'flushed');
    assert.deepEqual(empty.done, []);
    assert.equal(S.fake.calls().length, 0);

    enqueueOps(threeTrds());
    const some = runFlush({ maxOps: 2 });
    assert.equal(some.status, 'pending');
    assert.equal(some.reason, 'max_ops');
    assert.deepEqual(some.done, [1, 2]);
    assert.equal(some.pending, 1);
  });

  test('18f. warnings from a done op are returned with its seq and kind', () => {
    // the default fake knows the TRD type, so ask for a type it does not have
    enqueueOps([trdOp('7-01', { type: 'NoSuchType' })]);
    const res = runFlush();
    assert.equal(res.status, 'flushed');
    assert.equal(res.warnings.length, 1);
    assert.equal(res.warnings[0].seq, 1);
    assert.equal(res.warnings[0].kind, 'upsert-issue');
    assert.match(res.warnings[0].message, /type NoSuchType not applied/);
  });
});

describe('flush: disabled and locked (tests 25)', () => {
  describe('github not enabled', () => {
    useStore({ project: { enabled: false } });
    test('25a. a project with github.enabled not true is skipped with zero gh calls', () => {
      const res = runFlush();
      assert.equal(res.status, 'skipped');
      assert.equal(S.fake.calls().length, 0);
    });
  });

  describe('lock', () => {
    useStore();
    test('25. a live lock held by another flusher: status running, zero gh calls, the lock is left alone', () => {
      enqueueOps([trdOp('7-01')]);
      const held = outbox.acquireLock(S.root, { now: S.clock.t, pid: 424242 });
      assert.equal(held.ok, true);
      const res = runFlush();
      assert.equal(res.status, 'running');
      assert.equal(S.fake.calls().length, 0);
      assert.equal(fs.existsSync(outbox.lockPath(S.root)), true, 'not ours to release');
      held.release();
    });

    test('25b. a stale lock (older than 10 minutes) is taken over', () => {
      enqueueOps([trdOp('7-01')]);
      outbox.acquireLock(S.root, { now: S.clock.t - 11 * 60 * 1000, pid: 424242 });
      const res = runFlush();
      assert.equal(res.status, 'flushed');
      assert.equal(S.fake.issues.length, 1);
    });
  });
});

describe('flush: remote-edit halt and resolution (tests 19, 22, 23)', () => {
  useStore();

  /** An objective patched once by DevFlow, then edited by a human inside the summary section. */
  function haltedObjective() {
    const n = seedObjective();
    enqueueOps([managed({ summary: 'Mine 1' })]);
    assert.equal(runFlush().status, 'flushed');
    S.fake.humanEditBody(n, issueByNumber(n).body.replace('Mine 1', 'A human rewrote this'));
    const [seq] = enqueueOps([managed({ summary: 'Mine 2' })]);
    const writesBefore = S.fake.writes().length;
    const res = runFlush();
    return { n, seq, res, writesBefore };
  }

  test('19. an edit inside a managed section halts the flush: halted remote-edit naming the issue, ZERO writes after it', () => {
    const { n, seq, res, writesBefore } = haltedObjective();
    assert.equal(res.status, 'halted');
    assert.equal(res.halted.reason, 'remote-edit');
    assert.deepEqual(res.halted.target, { id: '7' });
    assert.equal(res.halted.issue_number, n);
    assert.equal(res.halted.seq, seq);
    assert.equal(S.fake.writes().length, writesBefore);
    assert.deepEqual(queueNow().map((o) => [o.seq, o.status]), [[seq, 'pending']], 'the op stays pending for the resolution');
    assert.equal(outbox.status(S.root).halted.reason, 'remote-edit');

    const callsBefore = S.fake.calls().length;
    assert.equal(runFlush().status, 'halted');
    assert.equal(S.fake.calls().length, callsBefore, 'a halted journal makes no gh call at all');
  });

  test('22f. in ONE flush DevFlow\'s own link and comment writes bump updated_at but never halt the later patch (Pitfall 2)', () => {
    const n = seedObjective();
    makeTrd('7-01');
    enqueueOps([managed({ summary: 'Mine 1' })]);
    assert.equal(runFlush().status, 'flushed');
    const baseBefore = outbox.getBase(S.root, '7');

    enqueueOps([
      { kind: 'link-sub-issue', target: { parent: '7', child: '7-01' }, payload: {} },
      summaryCommentOp('verification text\n', '7', 'verification'),
      managed({ summary: 'Mine 2' }),
    ]);
    const res = runFlush();
    assert.equal(res.status, 'flushed', JSON.stringify(res));
    assert.equal(res.done.length, 3);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'Mine 2');
    assert.notEqual(baseBefore.updated_at, outbox.getBase(S.root, '7').updated_at);
  });

  test('23. resolveHalt accept-remote drops the op and takes GitHub\'s body as the new base; the next flush has nothing to do', () => {
    const { n, seq } = haltedObjective();
    const r = flushLib.resolveHalt(S.root, seq, 'accept-remote', { modes: NATIVE, caps: CAPS });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(outbox.status(S.root).halted, null);
    assert.equal(queueNow().length, 0, 'the op was dropped');
    const base = outbox.getBase(S.root, '7');
    assert.equal(base.body_hash, hashOf(issueByNumber(n).body));
    assert.equal(base.managed_hash, flushLib.managedHash(issueByNumber(n).body));

    const writesBefore = S.fake.writes().length;
    const res = runFlush();
    assert.equal(res.status, 'flushed');
    assert.deepEqual(res.done, []);
    assert.equal(S.fake.writes().length, writesBefore);
    assert.match(issueByNumber(n).body, /A human rewrote this/, 'the human edit survived');
  });

  test('23b. resolveHalt overwrite refreshes the base and keeps the op; the next flush applies it over the human edit', () => {
    const { n, seq } = haltedObjective();
    const r = flushLib.resolveHalt(S.root, seq, 'overwrite', { modes: NATIVE, caps: CAPS });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(outbox.status(S.root).halted, null);
    assert.deepEqual(queueNow().map((o) => [o.seq, o.status]), [[seq, 'pending']]);

    const res = runFlush();
    assert.equal(res.status, 'flushed');
    assert.deepEqual(res.done, [seq]);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'Mine 2');
  });

  test('23c. resolveHalt refuses an unknown choice, an unknown seq, and an op that is not halted', () => {
    const { seq } = haltedObjective();
    assert.equal(flushLib.resolveHalt(S.root, seq, 'merge', { modes: NATIVE }).ok, false);
    assert.equal(flushLib.resolveHalt(S.root, 999, 'overwrite', { modes: NATIVE }).ok, false);
    assert.equal(outbox.status(S.root).halted.reason, 'remote-edit', 'a refused resolution changes nothing');
    assert.equal(queueNow().length, 1);
    const [other] = enqueueOps([trdOp('7-01')]);
    assert.match(flushLib.resolveHalt(S.root, other, 'overwrite', { modes: NATIVE }).error, /not halted|nothing to resolve/i);
    assert.equal(outbox.status(S.root).halted.reason, 'remote-edit');
  });
});

describe('flush: budget (test 24)', () => {
  useStore();
  const sleepsOfAtLeast = (ms) => S.clock.sleeps.filter((x) => x >= ms);

  test('24. 80 writes in the last 60 s: wait:true sleeps until one ages out, then runs', () => {
    enqueueOps([trdOp('7-01')]);
    seedWrites(80, () => S.clock.t - 30000);
    const res = runFlush({ wait: true });
    assert.equal(res.status, 'flushed', JSON.stringify(res));
    assert.ok(S.clock.sleeps.includes(30000), `slept the 30 s remainder, got ${JSON.stringify(S.clock.sleeps)}`);
    assert.equal(S.fake.issues.length, 1);
  });

  test('24b. 80 writes in the last 60 s: wait:false stops pending (reason budget) without sleeping or calling gh', () => {
    enqueueOps([trdOp('7-01')]);
    seedWrites(80, () => S.clock.t - 30000);
    const res = runFlush({ wait: false });
    assert.equal(res.status, 'pending');
    assert.equal(res.reason, 'budget');
    assert.equal(res.budget, 'minute');
    assert.deepEqual(S.clock.sleeps, []);
    assert.equal(S.fake.calls().length, 0);
    assert.equal(res.pending, 1);
  });

  test('24c. 450 writes in the hour: stop pending (reason budget) even for wait:true, with no sleep', () => {
    enqueueOps([trdOp('7-01')]);
    seedWrites(450, (i) => S.clock.t - 1800000 + i * 4000);
    const res = runFlush({ wait: true });
    assert.equal(res.status, 'pending');
    assert.equal(res.reason, 'budget');
    assert.equal(res.budget, 'hour');
    assert.deepEqual(S.clock.sleeps, []);
    assert.equal(S.fake.calls().length, 0);
  });

  test('24d. every gh write the flusher performs is recorded in the journal, retried or failed ones included', () => {
    enqueueOps([trdOp('7-01'), trdOp('7-02')]);
    const res = runFlush();
    assert.equal(res.status, 'flushed');
    const writes = S.fake.writes().length;
    assert.ok(writes >= 4, `label, milestone and two creates, got ${writes}`);
    assert.equal(outbox.status(S.root, { now: S.clock.t }).writes.hour, writes);
  });

  test('24e. a minute-budget wait that cannot clear (a sleep that never advances the clock) gives up pending', () => {
    enqueueOps([trdOp('7-01')]);
    seedWrites(80, () => S.clock.t - 30000);
    client._setSleep((ms) => { S.clock.sleeps.push(ms); });
    const res = runFlush({ wait: true });
    assert.equal(res.status, 'pending');
    assert.equal(res.reason, 'budget');
    assert.equal(S.fake.calls().length, 0);
  });
});

describe('flush: secondary limits and retry_after (test 26)', () => {
  useStore();
  const secondary = (extra = '') => ({ ok: false, status: 1, stderr: `HTTP 403: You have exceeded a secondary rate limit${extra}` });

  /** An objective and a TRD, then a link op: its only write is the POST that the fake will refuse. */
  function linkSetup() {
    seedObjective();
    makeTrd('7-01');
    S.clock.t += 5000; // clear the 1 s write pacing from the setup writes
    S.clock.sleeps.length = 0;
    enqueueOps([{ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' }, payload: {} }]);
  }

  test('26. a secondary limit during a wait:false flush leaves the op pending with retry_after and sleeps for nothing', () => {
    linkSetup();
    S.fake.failNext(/POST .*sub_issues/, secondary('\nretry-after: 30'));
    const t = S.clock.t;
    const res = runFlush({ wait: false });
    assert.equal(res.status, 'pending');
    assert.equal(res.reason, 'rate_limited');
    assert.deepEqual(S.clock.sleeps, [], 'no sleep recorded');
    const [op] = queueNow();
    assert.equal(op.status, 'pending');
    assert.equal(op.retry_after, t + 30000);
    assert.equal(op.attempts, 1);
  });

  test('26b. a wait:false flush honours retry_after: nothing runs before it, and a wait:true flush ignores it', () => {
    linkSetup();
    S.fake.failNext(/POST .*sub_issues/, secondary('\nretry-after: 30'));
    runFlush({ wait: false });
    const callsBefore = S.fake.calls().length;
    const early = runFlush({ wait: false });
    assert.equal(early.status, 'pending');
    assert.equal(early.reason, 'retry_after');
    assert.ok(early.wait_ms > 0);
    assert.equal(S.fake.calls().length, callsBefore, 'no gh call before retry_after');

    const manual = runFlush({ wait: true });
    assert.equal(manual.status, 'flushed', JSON.stringify(manual));
    assert.equal(issueByNumber(1).subIssues.length, 1);
  });

  test('26c. an interactive flush retries a secondary limit with the client policy, then leaves the op pending', () => {
    linkSetup();
    for (let i = 0; i < client.MAX_RETRIES + 1; i++) S.fake.failNext(/POST .*sub_issues/, secondary());
    const res = runFlush({ wait: true });
    assert.equal(res.status, 'pending');
    assert.equal(res.reason, 'rate_limited');
    assert.equal(S.clock.sleeps.filter((ms) => ms >= 60000).length, client.MAX_RETRIES);
    assert.equal(queueNow()[0].status, 'pending');
  });
});

describe('flush: capability resolution', () => {
  useStore();

  test('27. modes are resolved ONCE per flush through getModes, and a {modes, caps} answer is understood', () => {
    seedObjective();
    makeTrd('7-01');
    makeTrd('7-02');
    let calls = 0;
    enqueueOps([
      { kind: 'link-sub-issue', target: { parent: '7', child: '7-01' }, payload: {} },
      { kind: 'link-sub-issue', target: { parent: '7', child: '7-02' }, payload: {} },
    ]);
    const res = flushLib.flush(S.root, { getModes: () => { calls++; return { modes: NATIVE, caps: CAPS }; } });
    assert.equal(res.status, 'flushed');
    assert.equal(calls, 1);
  });

  test('27b. the default getModes asks gh-capability (injected here): detect, re-detect a provisional answer, resolve', () => {
    seedObjective();
    makeTrd('7-01');
    const seen = [];
    const capability = {
      detectCapabilities: (root, o) => { seen.push(o); return o.refresh ? { fresh: true } : { provisional: true }; },
      resolveModes: (caps) => (caps.fresh ? { ...NATIVE, hierarchy: 'tasklist' } : NATIVE),
    };
    enqueueOps([{ kind: 'link-sub-issue', target: { parent: '7', child: '7-01' }, payload: {} }]);
    const writesBefore = S.fake.writes().length;
    const res = flushLib.flush(S.root, { capability });
    assert.equal(res.status, 'flushed');
    assert.equal(seen.length, 2);
    assert.equal(seen[0].refresh, undefined);
    assert.equal(seen[1].refresh, true);
    assert.equal(S.fake.writes().length, writesBefore, 'the re-detected tasklist mode wrote no link');
  });

  test('27c. a repository the token cannot write to (writable:false) blocks the op instead of failing every call', () => {
    enqueueOps([trdOp('7-01')]);
    const res = runFlush({ modes: { ...NATIVE, writable: false } });
    assert.equal(res.status, 'halted');
    assert.match(res.halted.detail, /no push access/);
    assert.equal(S.fake.calls().length, 0);
  });

  test('27d. a capability lookup that throws blocks the op with the reason', () => {
    enqueueOps([trdOp('7-01')]);
    const res = flushLib.flush(S.root, { getModes: () => { throw new Error('probe exploded'); } });
    assert.equal(res.status, 'halted');
    assert.match(res.halted.detail, /probe exploded/);
  });
});

// ─── Contract: nothing here spawns, and ids (not numbers) are sent ────────────

describe('static contract', () => {
  const src = fs.readFileSync(path.join(__dirname, 'gh-outbox-flush.cjs'), 'utf8');

  test('V1. the module neither spawns processes nor requires child_process', () => {
    assert.doesNotMatch(src, /spawnSync|child_process/);
  });

  test('V2. sub_issue_id / issue_id are never built from an issue number', () => {
    assert.doesNotMatch(src, /sub_issue_id=\$\{[^}]*number/);
    assert.doesNotMatch(src, /issue_id=\$\{[^}]*number/);
  });
});

// ─── 48-06: decision answers (D-09) ──────────────────────────────────────────

describe('48-06 decision answer (D-09)', () => {
  useStore();

  test('1. an answer comment then a close: the answer is posted on the Decision issue and it is closed; a re-flush writes nothing', () => {
    const body = '<!-- devflow:id=7-01-d1 -->\nWhich parser should 7-01 use?\n';
    const n = S.fake.seedIssue({ title: '[Decision 7-01-d1] pick a parser', body, labels: ['devflow:decision'], type: 'Decision' });
    const mapping = mappingNow();
    mappingLib.setTrd(mapping, '7-01-d1', { issue_number: n, rest_id: restId(n), role: 'decision' });
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);

    enqueueOps([
      { kind: 'upsert-comment', target: { id: '7-01-d1', kind: 'answer' }, payload: { mode: 'replace', text: 'Use option B' } },
      { kind: 'patch-issue', target: { id: '7-01-d1' }, payload: { state: 'closed', state_reason: 'completed' } },
    ]);
    const res = runFlush();
    assert.equal(res.status, 'flushed', JSON.stringify(res));
    assert.deepEqual(res.done, [1, 2]);

    const answers = commentsOf(n).filter((c) => c.body.startsWith(bodyLib.commentMarker('7-01-d1', 'answer')));
    assert.equal(answers.length, 1, 'one answer comment, on the Decision issue');
    assert.equal(stripMarker(answers[0].body), 'Use option B');
    assert.match(answers[0].body, /^<!-- devflow:id=7-01-d1 kind=answer -->/);
    assert.equal(issueByNumber(n).state, 'CLOSED');
    assert.equal(issueByNumber(n).stateReason, 'completed');
    assert.deepEqual(mappingLib.getTrd(mappingNow(), '7-01-d1').comment_ids.answer, [answers[0].id]);

    const writesBefore = S.fake.writes().length;
    enqueueOps([
      { kind: 'upsert-comment', target: { id: '7-01-d1', kind: 'answer' }, payload: { mode: 'replace', text: 'Use option B' } },
      { kind: 'patch-issue', target: { id: '7-01-d1' }, payload: { state: 'closed', state_reason: 'completed' } },
    ]);
    const again = runFlush();
    assert.equal(again.status, 'flushed', JSON.stringify(again));
    assert.equal(S.fake.writes().length, writesBefore, 're-flush writes nothing');
    assert.equal(commentsOf(n).length, 1);
  });
});

// ─── 48-06: todo, debug and quick issues (tests 2-9) ─────────────────────────

const capLib = require('./gh-capability.cjs');

const REQUIRED_TYPES = ['Objective', 'TRD', 'Decision'];
const typesOf = (names) => names.map((name, i) => ({ id: i + 1, name, is_enabled: true }));
/** Modes exactly as the capability probe resolves them for an org with `enabled` issue types. */
const modesWith = (enabled) => capLib.resolveModes({
  repo: 'o/r', owner_type: 'Organization', push: true, org_types: { available: true, enabled },
  issue_fields: { available: true, ids: FIELD_IDS }, sub_issues: 'ok', dependencies: 'ok', wiki: 'ok',
});
const ENTITY_FILES = Object.freeze({ todo: (id) => `todos/pending/${id.slice(5)}.md`, debug: (id) => `debug/${id.slice(6)}.md`, quick: (id) => `quick/${id.slice(6)}-fix-x/${id.slice(6)}-JOB.md` });

/** An upsert-issue op for an entity, its body hand-encoded with the 48-02 entity codec. */
function entityOp(id, role, extra = {}, text = `# ${id}\n\nFirst text.\n`) {
  const body = trd.encodeEntityBody({ id, file: ENTITY_FILES[role](id), text });
  return {
    kind: 'upsert-issue',
    target: { id, role },
    payload: { title: `[${role}] ${id}`, body, labels: [outbox.ENTITY_ROLES[role].label], ...extra },
  };
}

/** Replace the fake with one whose org has exactly `names` issue types (the log keeps recording). */
function useFakeTypes(names) {
  S.fake = createFakeGitHub({ ...S.project.fakeOptions, types: typesOf(names) });
  client._setRunGh((args, opts) => { S.log.push({ args, opts }); return S.fake.runGh(args, opts); });
}

const createPosts = () => S.log.filter((c) => c.args.join(' ') === 'api --method POST repos/o/r/issues --input -');

describe('48-06 entity issues', () => {
  useStore();

  test('2. a todo upsert creates ONE issue labelled devflow:todo with no type, maps it under entities and records its base', () => {
    const id = 'todo-2026-07-31-a';
    const { res } = exec(entityOp(id, 'todo'), { modes: modesWith(REQUIRED_TYPES) });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.created, true);
    assert.deepEqual(res.warnings, []);

    assert.equal(S.fake.issues.length, 1);
    const issue = S.fake.issues[0];
    assert.deepEqual(issue.labels, ['devflow:todo']);
    assert.equal(issue.type, null);
    assert.equal(Object.hasOwn(JSON.parse(createPosts()[0].opts.input), 'type'), false, 'no type is ever sent for a todo');
    assert.deepEqual(trd.decodeEntityBody(issue.body), { ok: true, id, file: 'todos/pending/2026-07-31-a.md', text: `# ${id}\n\nFirst text.\n` });

    const entry = mappingLib.getEntity(mappingNow(), id);
    assert.equal(entry.issue_number, issue.number);
    assert.equal(entry.rest_id, restId(issue.number));
    assert.equal(entry.role, 'todo');
    assert.equal(mappingLib.listTrds(mappingNow(), '7').length, 0, 'nothing is written under trds');
    assert.equal(outbox.getBase(S.root, id).body_hash, hashOf(issue.body));
  });

  test('2b. a configured labels.<role> wins over the default entity label, and the scan uses it', () => {
    const ctx = createCtx({ modes: modesWith(REQUIRED_TYPES) });
    ctx.labels = { ...ctx.labels, todo: 'team:todo' };
    const { res } = exec(entityOp('todo-b', 'todo', { labels: [] }), { ctx });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(S.fake.issues[0].labels, ['team:todo'], 'the role label is always applied: the scan relies on it');
    assert.ok(S.log.some((c) => c.args.join(' ').includes('labels=team%3Atodo')), 'the marker scan lists the configured label');
  });

  test('3. re-flushing after the mapping entry is cleared finds the issue by label scan + marker: no second issue, nothing written', () => {
    const id = 'todo-2026-07-31-a';
    const modes = modesWith(REQUIRED_TYPES);
    enqueueOps([entityOp(id, 'todo')]);
    assert.equal(runFlush({ modes }).status, 'flushed');
    const number = S.fake.issues[0].number;
    const m = mappingNow();
    delete m.entities[id];
    assert.ok(mappingLib.writeMappingV3(S.root, m).ok);
    assert.equal(mappingLib.getEntity(mappingNow(), id), null);

    const writesBefore = S.fake.writes().length;
    enqueueOps([entityOp(id, 'todo')]);
    const again = runFlush({ modes });
    assert.equal(again.status, 'flushed', JSON.stringify(again));
    assert.equal(S.fake.issues.length, 1, 'no second issue');
    assert.equal(S.fake.writes().length, writesBefore, 'nothing was written at all');
    assert.equal(mappingLib.getEntity(mappingNow(), id).issue_number, number, 'the mapping entry is restored');
  });

  test('4a. a debug issue gets the native Debug type when the org has it, plus devflow:debug; no warning', () => {
    useFakeTypes([...REQUIRED_TYPES, 'Debug']);
    const { res } = exec(entityOp('debug-x', 'debug', { type: 'Debug' }), { modes: modesWith([...REQUIRED_TYPES, 'Debug']) });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.warnings, []);
    assert.equal(S.fake.issues[0].type, 'Debug');
    assert.deepEqual(S.fake.issues[0].labels, ['devflow:debug']);
    assert.equal(mappingLib.getEntity(mappingNow(), 'debug-x').role, 'debug');
  });

  test('4b. without the Debug type: no type is sent, labels devflow:debug + devflow:type/debug, no warning', () => {
    useFakeTypes(REQUIRED_TYPES);
    const modes = modesWith(REQUIRED_TYPES);
    assert.equal(modes.types, 'native', 'the required types are native: only Debug falls back');
    const { res } = exec(entityOp('debug-x', 'debug', { type: 'Debug' }), { modes });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.warnings, []);
    assert.equal(Object.hasOwn(JSON.parse(createPosts()[0].opts.input), 'type'), false);
    assert.equal(S.fake.issues[0].type, null);
    assert.deepEqual(S.fake.issues[0].labels, ['devflow:debug', 'devflow:type/debug']);
  });

  test('5. quick: create with the Quick type, a summary comment, then close; a re-flush writes nothing', () => {
    useFakeTypes([...REQUIRED_TYPES, 'Quick']);
    const modes = modesWith([...REQUIRED_TYPES, 'Quick']);
    const ops = () => [
      entityOp('quick-12', 'quick', { type: 'Quick' }),
      { kind: 'upsert-comment', target: { id: 'quick-12', kind: 'summary' }, payload: { mode: 'replace', text: 'Fixed x in 3 files.\n' } },
      { kind: 'patch-issue', target: { id: 'quick-12' }, payload: { state: 'closed', state_reason: 'completed' } },
    ];
    enqueueOps(ops());
    const res = runFlush({ modes });
    assert.equal(res.status, 'flushed', JSON.stringify(res));
    assert.deepEqual(res.warnings, []);

    const issue = S.fake.issues[0];
    assert.equal(issue.type, 'Quick');
    assert.deepEqual(issue.labels, ['devflow:quick']);
    assert.equal(issue.state, 'CLOSED');
    assert.equal(issue.stateReason, 'completed');
    const comments = commentsOf(issue.number);
    assert.equal(comments.length, 1);
    assert.ok(comments[0].body.startsWith('<!-- devflow:id=quick-12 kind=summary -->\n'));
    assert.equal(stripMarker(comments[0].body), 'Fixed x in 3 files.\n');
    assert.deepEqual(mappingLib.getEntity(mappingNow(), 'quick-12').comment_ids, { summary: [comments[0].id] });

    const writesBefore = S.fake.writes().length;
    enqueueOps(ops());
    assert.equal(runFlush({ modes }).status, 'flushed');
    assert.equal(S.fake.writes().length, writesBefore, 'a re-flush writes nothing');
  });

  test('6. a todo with payload.type gets no type and no type label, under native or labels types; a warning names it', () => {
    for (const [id, modes] of [['todo-a', NATIVE], ['todo-b', modesWith([])]]) {
      const { res } = exec(entityOp(id, 'todo', { type: 'Todo' }), { modes });
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.ok(res.warnings.some((w) => /Todo/.test(w) && w.includes(id)), JSON.stringify(res.warnings));
      const issue = issueByNumber(mappingLib.getEntity(mappingNow(), id).issue_number);
      assert.equal(issue.type, null);
      assert.deepEqual(issue.labels, ['devflow:todo'], `${id}: no devflow:type/* label`);
    }
    const patched = exec({ kind: 'patch-issue', target: { id: 'todo-a' }, payload: { type: 'Todo' } }, { modes: modesWith([]) });
    assert.equal(patched.res.ok, true, JSON.stringify(patched.res));
    assert.ok(patched.res.warnings.some((w) => /Todo/.test(w)), JSON.stringify(patched.res.warnings));
    assert.deepEqual(issueByNumber(mappingLib.getEntity(mappingNow(), 'todo-a').issue_number).labels, ['devflow:todo']);
  });

  test('7. an entity body edited on GitHub halts the next upsert with the issue named; nothing else is written', () => {
    const { res: made } = exec(entityOp('debug-x', 'debug'));
    assert.equal(made.ok, true, JSON.stringify(made));
    const n = mappingLib.getEntity(mappingNow(), 'debug-x').issue_number;
    S.fake.humanEditBody(n, `${issueByNumber(n).body}\nhuman addition\n`);

    const writesBefore = S.fake.writes().length;
    enqueueOps([entityOp('debug-x', 'debug', {}, '# debug-x\n\nDevFlow wants this.\n'), entityOp('todo-a', 'todo')]);
    const res = runFlush();
    assert.equal(res.status, 'halted', JSON.stringify(res));
    assert.equal(res.halted.reason, 'remote-edit');
    assert.equal(res.halted.issue_number, n);
    assert.match(res.halted.detail, new RegExp(`#${n} \\(debug-x\\)`));
    assert.equal(S.fake.writes().length, writesBefore, 'zero writes: the next op never ran');
    assert.equal(S.fake.issues.length, 1);
    assert.match(issueByNumber(n).body, /human addition/);
  });

  test('8. a human comment on a todo issue does not halt the next body update', () => {
    const { res: made } = exec(entityOp('todo-a', 'todo'));
    assert.equal(made.ok, true, JSON.stringify(made));
    const n = mappingLib.getEntity(mappingNow(), 'todo-a').issue_number;
    S.fake.seedComment(n, 'A human: +1, this bites me too.');
    issueByNumber(n).updatedAt = '2030-01-01T00:00:00Z'; // GitHub bumps updated_at on a comment; the fake does not

    const { res } = exec(entityOp('todo-a', 'todo', {}, '# todo-a\n\nSecond text.\n'));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.halt, undefined);
    assert.equal(trd.decodeEntityBody(issueByNumber(n).body).text, '# todo-a\n\nSecond text.\n');
    assert.equal(commentsOf(n).length, 1, 'the human comment is left alone');
    assert.equal(outbox.getBase(S.root, 'todo-a').body_hash, hashOf(issueByNumber(n).body));
  });

  test('9. patch-issue / upsert-comment on an entity with no issue yet is an error, never a throw', () => {
    const msg = 'todo-x has no issue yet; run the verb again after a flush';
    const patched = exec({ kind: 'patch-issue', target: { id: 'todo-x' }, payload: { state: 'closed', state_reason: 'completed' } });
    assert.deepEqual([patched.res.ok, patched.res.class, patched.res.error], [false, 'error', msg]);
    const commented = exec(summaryCommentOp('text\n', 'todo-x'));
    assert.deepEqual([commented.res.ok, commented.res.class, commented.res.error], [false, 'error', msg]);
    assert.equal(S.fake.writes().length, 0);
  });

  test('9b. an entity role with a TRD id (or the wrong prefix) is refused by the flusher too', () => {
    const p = entityOp('todo-a', 'todo').payload;
    for (const [id, role] of [['7-01', 'todo'], ['quick-12', 'todo']]) {
      const { res } = exec({ kind: 'upsert-issue', target: { id, role }, payload: p });
      assert.equal(res.ok, false);
      assert.equal(res.error, `upsert-issue: ${JSON.stringify(id)} is not a ${role} id`);
    }
    const trdRole = exec({ kind: 'upsert-issue', target: { id: 'todo-a', role: 'trd' }, payload: p });
    assert.equal(trdRole.res.error, 'upsert-issue: "todo-a" is not a TRD or Decision id', 'the 47 message is unchanged');
    assert.equal(S.fake.writes().length, 0);
  });
});

// ─── 49-05: the objective pull request ───────────────────────────────────────

describe('49-05 objective PR', () => {
  const BRANCH = 'df/objective-49-pr-lifecycle';
  const TIP = `feed${'0'.repeat(36)}`;
  const WIKI = {
    dir: '49-pr-lifecycle', page: 'Objective-49-pr-lifecycle',
    url: 'https://github.com/o/r/wiki/Objective-49-pr-lifecycle/abc1234', sha: 'abc1234',
  };
  const TITLE = '[Objective 49] PR lifecycle';
  useStore({ fake: { refs: { [BRANCH]: TIP } } });

  const upsertPr = (payload = {}, id = '49') => ({
    kind: 'upsert-pr', target: { id }, payload: { branch: BRANCH, base: 'main', title: TITLE, ...payload },
  });
  const readyOp = (id = '49') => ({ kind: 'pr-ready', target: { id }, payload: {} });
  const prs = () => S.fake.issues.filter((i) => i.pr);
  const calls = (from = 0) => S.log.slice(from).map((c) => c.args.join(' '));

  function addTrd(mapping, id, labels = ['devflow:trd']) {
    const n = S.fake.seedIssue({ title: `[TRD ${id}] x`, labels });
    mappingLib.setTrd(mapping, id, { issue_number: n, rest_id: restId(n) });
    return n;
  }
  /** The objective issue and its TRD issues, seeded in the fake and mapped. Returns `{objective, '49-01': n, ...}`. */
  function seedProject(trdIds = ['49-01', '49-02'], labels = ['devflow:trd']) {
    const objective = S.fake.seedIssue({
      title: '[Objective 49] PR lifecycle', body: bodyLib.mergeManaged('', { summary: 'S' }, '49').body, labels: ['devflow:objective'],
    });
    const mapping = mappingNow();
    mappingLib.setEntry(mapping, '49', { issue_id: objective });
    const numbers = { objective };
    for (const id of trdIds) numbers[id] = addTrd(mapping, id, labels);
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
    return numbers;
  }
  function addTrdNow(id, labels) {
    const mapping = mappingNow();
    const n = addTrd(mapping, id, labels);
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
    return n;
  }
  const closesOf = (n) => bodyLib.extractSection(issueByNumber(n).body, 'closes');
  const closesText = (...numbers) => numbers.map((n) => `Closes #${n}`).join('\n');

  test('3a. classifyFailure: a 422 "No commits between" is pending, any other 422 is still a validation failure', () => {
    const fail = (stderr) => ({ ok: false, status: 1, stdout: '', stderr });
    assert.equal(flushLib.classifyFailure(fail('gh: Validation Failed (HTTP 422)\nNo commits between main and df/x')), 'pending');
    assert.equal(flushLib.classifyFailure(fail('gh: Validation Failed (HTTP 422)\nA pull request already exists for o:df/x.')), 'already_exists');
    assert.equal(flushLib.classifyFailure(fail('gh: Validation Failed (HTTP 422)\nhead invalid')), 'validation');
    assert.equal(flushLib.classifyFailure(fail('gh: Server Error (HTTP 500) No commits between a and b')), 'error', 'only a 422 is pending');
  });

  test('4. upsert-pr creates ONE draft PR (base = default branch, head = objective branch) closing the objective and each TRD, in order', () => {
    const nums = seedProject(['49-01', '49-02']);
    const decision = S.fake.seedIssue({ title: '[Decision 49-01-d1]', labels: ['devflow:decision'] });
    const withDecision = mappingNow();
    mappingLib.setTrd(withDecision, '49-01-d1', { issue_number: decision, rest_id: restId(decision) });
    assert.ok(mappingLib.writeMappingV3(S.root, withDecision).ok);

    const { res } = exec(upsertPr({ wiki: WIKI, summary: 'Adds the PR lifecycle.' }));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(prs().length, 1);
    const pr = prs()[0];
    assert.equal(pr.pr.draft, true);
    assert.equal(pr.pr.base.ref, 'main');
    assert.equal(pr.pr.head.ref, BRANCH);
    assert.equal(pr.title, TITLE);

    assert.equal(closesOf(pr.number), closesText(nums.objective, nums['49-01'], nums['49-02']));
    assert.ok(!pr.body.includes(`#${decision}`), 'a Decision issue is never closed by the PR');
    assert.ok(pr.body.startsWith('<!-- devflow:pr=49 -->\n'), pr.body);
    assert.ok(!pr.body.includes('devflow:id='));
    assert.equal(bodyLib.extractSection(pr.body, 'wiki'), bodyLib.buildWikiSection(WIKI));
    assert.equal(bodyLib.extractSection(pr.body, 'summary'), 'Adds the PR lifecycle.');

    const entry = mappingLib.getPr(mappingNow(), '49');
    assert.equal(entry.number, pr.number);
    assert.equal(entry.node_id, `PR_${pr.number}`);
    assert.equal(entry.branch, BRANCH);
    assert.equal(entry.base, 'main');
    assert.ok(typeof entry.url === 'string' && entry.url.endsWith(`/pull/${pr.number}`), entry.url);

    const posts = S.log.filter((c) => c.args.join(' ') === 'api --method POST repos/o/r/pulls --input -');
    assert.equal(posts.length, 1, 'the body travels on stdin, never in argv');
    assert.deepEqual(JSON.parse(posts[0].opts.input), { title: TITLE, head: BRANCH, base: 'main', body: pr.body, draft: true });
    assert.equal(S.fake.writes().length, 1);
    const base = outbox.getBase(S.root, 'pr:49');
    assert.equal(base.issue_number, pr.number);
    assert.equal(base.body_hash, hashOf(pr.body));
  });

  test('4b. an objective with no issue yet is an error, never a PR', () => {
    const { res } = exec(upsertPr());
    assert.equal(res.ok, false);
    assert.match(res.error, /objective 49 has no issue yet/);
    assert.equal(S.fake.writes().length, 0);
    assert.equal(prs().length, 0);
  });

  test('4c. the default branch is read once per context', () => {
    seedProject();
    const ctx = createCtx();
    assert.equal(exec(upsertPr(), { ctx }).res.ok, true);
    assert.equal(exec(upsertPr(), { ctx }).res.ok, true);
    assert.equal(calls().filter((a) => a === 'api repos/o/r').length, 1);
  });

  test('5. a re-flush writes nothing; with the mapped number cleared the PR is found by its head, never created twice', () => {
    seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const writes = S.fake.writes().length;

    const again = exec(upsertPr());
    assert.equal(again.res.ok, true);
    assert.equal(S.fake.writes().length, writes, 'zero writes on an unchanged PR');
    assert.equal(prs().length, 1);

    const mapping = mappingNow();
    const number = mappingLib.getPr(mapping, '49').number;
    mappingLib.setPr(mapping, '49', { number: null });
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
    const start = S.log.length;
    const found = exec(upsertPr());
    assert.equal(found.res.ok, true, JSON.stringify(found.res));
    assert.ok(calls(start).includes('api --paginate --slurp repos/o/r/pulls?head=o%3Adf%2Fobjective-49-pr-lifecycle&state=all'), calls(start).join('\n'));
    assert.equal(S.fake.writes().length, writes, 'still zero writes');
    assert.equal(prs().length, 1);
    assert.equal(mappingLib.getPr(mappingNow(), '49').number, number, 'the number is recorded again');
  });

  test('5b. a stale mapped number (404) falls back to the head lookup', () => {
    seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const mapping = mappingNow();
    mappingLib.setPr(mapping, '49', { number: 987 });
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
    const writes = S.fake.writes().length;
    const { res } = exec(upsertPr());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(S.fake.writes().length, writes);
    assert.equal(mappingLib.getPr(mappingNow(), '49').number, prs()[0].number);
  });

  test('6. a TRD added after the PR exists is closed by the next upsert-pr; the human text is kept', () => {
    const nums = seedProject(['49-01', '49-02']);
    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    S.fake.humanEditBody(n, `${issueByNumber(n).body}\nHuman note below.\n`);
    nums['49-03'] = addTrdNow('49-03');
    const { res } = exec(upsertPr());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(closesOf(n), closesText(nums.objective, nums['49-01'], nums['49-02'], nums['49-03']));
    assert.match(issueByNumber(n).body, /Human note below\./);
    assert.equal(prs().length, 1);
  });

  test('6b. TRDs are closed in id order, natural (49-10 after 49-02), whatever order the mapping holds them', () => {
    const nums = seedProject(['49-10', '49-02', '49-01']);
    assert.equal(exec(upsertPr()).res.ok, true);
    assert.equal(closesOf(prs()[0].number), closesText(nums.objective, nums['49-01'], nums['49-02'], nums['49-10']));
  });

  test('6c. a refresh with no wiki or summary leaves the earlier ones in place', () => {
    seedProject();
    assert.equal(exec(upsertPr({ wiki: WIKI, summary: 'First.' })).res.ok, true);
    const n = prs()[0].number;
    addTrdNow('49-03');
    assert.equal(exec(upsertPr({ title: undefined })).res.ok, true);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'First.');
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'wiki'), bodyLib.buildWikiSection(WIKI));
  });

  test('7. a human edit INSIDE the closes section halts the queue with a report naming the PR; nothing is written', () => {
    const nums = seedProject();
    enqueueOps([upsertPr()]);
    assert.equal(runFlush().status, 'flushed');
    const n = prs()[0].number;
    S.fake.humanEditBody(n, issueByNumber(n).body.replace(`Closes #${nums.objective}`, 'Closes #9999'));
    addTrdNow('49-03');
    const writes = S.fake.writes().length;

    enqueueOps([upsertPr()]);
    const res = runFlush();
    assert.equal(res.status, 'halted');
    assert.equal(res.halted.reason, 'remote-edit');
    assert.equal(res.issue_number, n);
    assert.match(res.halted.detail, new RegExp(`pull request #${n}\\b`));
    assert.equal(S.fake.writes().length, writes, 'nothing was written');
    assert.match(issueByNumber(n).body, /Closes #9999/, 'the human edit is untouched');
  });

  test('7b. a human edit only OUTSIDE the managed sections is merged and the update goes through', () => {
    const nums = seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    S.fake.humanEditBody(n, `Reviewer note above.\n\n${issueByNumber(n).body}`);
    nums['49-03'] = addTrdNow('49-03');
    const { res } = exec(upsertPr());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.halt, undefined);
    assert.match(issueByNumber(n).body, /Reviewer note above\./);
    assert.equal(closesOf(n), closesText(nums.objective, nums['49-01'], nums['49-02'], nums['49-03']));
  });

  test('7c. resolveHalt: overwrite restores DevFlow\'s closes on the next flush; accept-remote drops the op and keeps the human text', () => {
    const nums = seedProject();
    enqueueOps([upsertPr()]);
    assert.equal(runFlush().status, 'flushed');
    const n = prs()[0].number;
    const edit = () => S.fake.humanEditBody(n, issueByNumber(n).body.replace(`Closes #${nums.objective}`, 'Closes #9999'));
    edit();
    addTrdNow('49-03');
    const [seq] = enqueueOps([upsertPr()]);
    assert.equal(runFlush().status, 'halted');

    const kept = flushLib.resolveHalt(S.root, seq, 'overwrite', { modes: NATIVE, caps: CAPS });
    assert.equal(kept.ok, true, JSON.stringify(kept));
    assert.equal(runFlush().status, 'flushed');
    assert.ok(!issueByNumber(n).body.includes('#9999'));
    assert.match(closesOf(n), new RegExp(`Closes #${nums.objective}\\n`));

    edit();
    const [seq2] = enqueueOps([upsertPr({ summary: 'again' })]);
    assert.equal(runFlush().status, 'halted');
    const taken = flushLib.resolveHalt(S.root, seq2, 'accept-remote', { modes: NATIVE, caps: CAPS });
    assert.equal(taken.ok, true, JSON.stringify(taken));
    assert.equal(taken.dropped, true);
    assert.match(issueByNumber(n).body, /Closes #9999/);
    assert.equal(outbox.getBase(S.root, 'pr:49').body_hash, hashOf(issueByNumber(n).body));
    assert.equal(outbox.status(S.root).queue.length, 0);
  });

  test('8. a base that is not the default branch halts the op, naming both branches; nothing is written', () => {
    seedProject();
    const { res } = exec(upsertPr({ base: 'release' }));
    assert.equal(res.ok, false);
    assert.equal(res.class, 'validation');
    assert.match(res.error, /"release"/);
    assert.match(res.error, /"main"/);
    assert.equal(S.fake.writes().length, 0);
    assert.equal(prs().length, 0);

    enqueueOps([upsertPr({ base: 'release' })]);
    const flushed = runFlush();
    assert.equal(flushed.status, 'halted');
    assert.equal(flushed.halted.reason, 'blocked');
    assert.match(flushed.halted.detail, /"release"/);
  });

  test('9. a head equal to the base tip stays PENDING (not halted); after a push the next flush creates the PR', () => {
    seedProject();
    S.fake.pushRef(BRANCH, S.fake.refs.main);
    enqueueOps([upsertPr()]);
    const first = runFlush();
    assert.equal(first.status, 'pending');
    assert.equal(first.reason, 'pending');
    assert.match(first.detail, /No commits between/);
    assert.equal(first.halted, null);
    assert.deepEqual(first.done, []);
    assert.equal(queueNow()[0].status, 'pending');
    assert.equal(prs().length, 0);

    S.fake.pushRef(BRANCH, TIP);
    const second = runFlush();
    assert.equal(second.status, 'flushed', JSON.stringify(second));
    assert.equal(prs().length, 1);
    assert.equal(prs()[0].pr.draft, true);
  });

  test('9a. a create needs a title: without one the op halts and nothing is written', () => {
    seedProject();
    const { res } = exec(upsertPr({ title: undefined }));
    assert.equal(res.ok, false);
    assert.equal(res.class, 'validation');
    assert.match(res.error, /title needed to create the PR for objective 49/);
    assert.equal(S.fake.writes().length, 0);
    assert.equal(prs().length, 0);
  });

  test('9a. a refresh without a title updates the body only; a human-renamed title survives a refresh that carries one', () => {
    seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    addTrdNow('49-03');
    const start = S.log.length;
    assert.equal(exec(upsertPr({ title: undefined })).res.ok, true);
    const patches = S.log.slice(start).filter((c) => c.args.join(' ') === `api --method PATCH repos/o/r/pulls/${n} --input -`);
    assert.equal(patches.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(patches[0].opts.input)), ['body'], 'only the body is sent');
    assert.equal(issueByNumber(n).title, TITLE);

    issueByNumber(n).title = 'Human renamed this';
    addTrdNow('49-04');
    const again = S.log.length;
    assert.equal(exec(upsertPr({ title: '[Objective 49] A newer title' })).res.ok, true);
    assert.equal(issueByNumber(n).title, 'Human renamed this');
    const sent = S.log.slice(again).filter((c) => /--method PATCH repos\/o\/r\/pulls\//.test(c.args.join(' ')));
    assert.deepEqual(sent.map((c) => Object.keys(JSON.parse(c.opts.input))), [['body']]);
  });

  test('9b. a closed PR for the head is not recreated and not edited', () => {
    seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    issueByNumber(n).state = 'CLOSED';
    addTrdNow('49-03');
    const writes = S.fake.writes().length;
    const { res } = exec(upsertPr());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.warnings.some((m) => /closed/.test(m) && m.includes(`#${n}`)), JSON.stringify(res.warnings));
    assert.equal(S.fake.writes().length, writes);
    assert.equal(prs().length, 1);
  });

  test('10. pr-ready on a draft marks it ready for review; a second flush writes nothing', () => {
    seedProject();
    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    assert.equal(issueByNumber(n).pr.draft, true);

    const start = S.log.length;
    const first = exec(readyOp());
    assert.equal(first.res.ok, true, JSON.stringify(first.res));
    assert.equal(issueByNumber(n).pr.draft, false);
    const mutations = S.log.slice(start).filter((c) => c.args[1] === 'graphql');
    assert.equal(mutations.length, 1);
    assert.ok(mutations[0].args.some((a) => /^query=mutation\b.*markPullRequestReadyForReview/s.test(a)));
    assert.ok(mutations[0].args.includes(`pullRequestId=PR_${n}`));

    const writes = S.fake.writes().length;
    const second = exec(readyOp());
    assert.equal(second.res.ok, true);
    assert.equal(S.fake.writes().length, writes, 'already ready: zero writes');
  });

  test('10b. pr-ready with no PR yet is an error; on a closed PR it writes nothing and says so', () => {
    seedProject();
    const none = exec(readyOp());
    assert.equal(none.res.ok, false);
    assert.match(none.res.error, /objective 49 has no pull request yet/);

    assert.equal(exec(upsertPr()).res.ok, true);
    const n = prs()[0].number;
    issueByNumber(n).state = 'CLOSED';
    const writes = S.fake.writes().length;
    const closed = exec(readyOp());
    assert.equal(closed.res.ok, true, JSON.stringify(closed.res));
    assert.ok(closed.res.warnings.some((m) => /closed/.test(m)));
    assert.equal(S.fake.writes().length, writes);
    assert.equal(issueByNumber(n).pr.draft, true);
  });

  test('11. patch-issue labels_remove drops a label that is there and writes nothing for one that is not', () => {
    const nums = seedProject(['49-01'], ['devflow:trd', 'devflow:in-progress']);
    const remove = (labels) => exec({ kind: 'patch-issue', target: { id: '49-01' }, payload: { labels_remove: labels } });

    const first = remove(['devflow:in-progress']);
    assert.equal(first.res.ok, true, JSON.stringify(first.res));
    assert.deepEqual(issueByNumber(nums['49-01']).labels, ['devflow:trd']);
    assert.equal(S.fake.writes().length, 1);

    const absent = remove(['devflow:in-progress']);
    assert.equal(absent.res.ok, true);
    assert.equal(S.fake.writes().length, 1, 'removing an absent label is a no-op');
    assert.equal(remove(['devflow:never-there']).res.ok, true);
    assert.equal(S.fake.writes().length, 1);
  });

  test('11b. labels_add and labels_remove together are one PATCH; a label in both is added, not removed', () => {
    const nums = seedProject(['49-01'], ['devflow:trd', 'devflow:in-progress']);
    const { res } = exec({ kind: 'patch-issue', target: { id: '49-01' }, payload: { labels_add: ['devflow:done'], labels_remove: ['devflow:in-progress'] } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(issueByNumber(nums['49-01']).labels, ['devflow:trd', 'devflow:done']);
    assert.equal(writesMatching(/PATCH repos\/o\/r\/issues\/\d+/).length, 1);

    const both = exec({ kind: 'patch-issue', target: { id: '49-01' }, payload: { labels_add: ['devflow:done'], labels_remove: ['devflow:done'] } });
    assert.equal(both.res.ok, true);
    assert.deepEqual(issueByNumber(nums['49-01']).labels, ['devflow:trd', 'devflow:done']);
  });

  test('12. a scan over issues does not resolve the PR as a TRD (records with pull_request are skipped)', () => {
    seedProject(['49-01', '49-02']);
    assert.equal(exec(upsertPr()).res.ok, true);
    const pr = prs()[0];
    pr.labels.push('devflow:trd');
    S.fake.humanEditBody(pr.number, `<!-- devflow:id=49-03 -->\n${pr.body}`);

    const file = '49-03-x-TRD.md';
    const { res } = exec({
      kind: 'upsert-issue',
      target: { id: '49-03', role: 'trd' },
      payload: {
        title: '[TRD 49-03] x', body: trd.encodeTrdBody({ id: '49-03', file, text: '# x\n' }), labels: ['devflow:trd'], milestone_title: null, type: null,
      },
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.created, true, 'the PR was not adopted as TRD 49-03');
    const entry = mappingLib.getTrd(mappingNow(), '49-03');
    assert.notEqual(entry.issue_number, pr.number);
    assert.equal(S.fake.issues.find((i) => i.number === entry.issue_number).pr, undefined);
  });
});

// ─── 49-10: verification status, PR comments, merge and branch delete ────────

const B10 = 'df/objective-49-pr-lifecycle';
const TIP10 = `feed${'0'.repeat(36)}`;
const TITLE10 = '[Objective 49] PR lifecycle';

/** The objective issue, mapped, and its PR created through the flusher (a draft unless `ready`). */
function seedPr10({ ready = false } = {}) {
  const objective = S.fake.seedIssue({
    title: TITLE10, body: bodyLib.mergeManaged('', { summary: 'S' }, '49').body, labels: ['devflow:objective'],
  });
  const mapping = mappingNow();
  mappingLib.setEntry(mapping, '49', { issue_id: objective });
  assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
  const made = exec({ kind: 'upsert-pr', target: { id: '49' }, payload: { branch: B10, base: 'main', title: TITLE10 } }).res;
  assert.equal(made.ok, true, JSON.stringify(made));
  const number = mappingLib.getPr(mappingNow(), '49').number;
  if (ready) {
    const r = exec({ kind: 'pr-ready', target: { id: '49' }, payload: {} }).res;
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  return { objective, number };
}

const statusOp10 = (payload = {}, context = 'devflow/verification') => ({
  kind: 'post-status', target: { id: '49', context }, payload: { state: 'success', description: 'Verified', ...payload },
});
const commentOp10 = (text, kind = 'wiki-diff') => ({
  kind: 'upsert-pr-comment', target: { id: '49', kind }, payload: { mode: 'replace', text },
});
const mergeOp10 = (payload = {}) => ({ kind: 'pr-merge', target: { id: '49' }, payload });
const deleteOp10 = (branch = B10) => ({ kind: 'delete-branch', target: { id: '49' }, payload: { branch } });
const failure10 = (stderr) => ({ ok: false, status: 1, stdout: '', stderr });

/** Answer calls matching `re` with `result`; everything else goes to the fake. Replaces the useStore seam. */
function interceptGh10(re, result) {
  client._setRunGh((args, opts) => {
    S.log.push({ args, opts });
    return re.test(args.join(' ')) ? result : S.fake.runGh(args, opts);
  });
}

describe('49-10 PR status, comments, branch delete', () => {
  useStore({ fake: { refs: { [B10]: TIP10 } } });
  const writes = () => S.fake.writes().length;
  const statusesOf = (sha) => S.fake.statuses[sha] || [];

  test('2. post-status without a sha posts devflow/verification on the PR head sha; the body travels on stdin', () => {
    seedPr10();
    const before = writes();
    const { res } = exec(statusOp10());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(writes() - before, 1);
    const all = statusesOf(TIP10);
    assert.equal(all.length, 1);
    assert.equal(all[0].context, 'devflow/verification');
    assert.equal(all[0].state, 'success');
    assert.equal(all[0].description, 'Verified');
    const post = S.log.filter((c) => c.args.join(' ') === `api --method POST repos/o/r/statuses/${TIP10} --input -`);
    assert.equal(post.length, 1);
    assert.deepEqual(JSON.parse(post[0].opts.input), { state: 'success', context: 'devflow/verification', description: 'Verified' });
    const combined = JSON.parse(S.fake.runGh(['api', `repos/o/r/commits/${B10}/status`]).stdout);
    assert.equal(combined.state, 'success');
  });

  test('2b. an explicit sha is used as given (no PR is read); no sha and no PR is an error that names upsert-pr', () => {
    const none = exec(statusOp10());
    assert.equal(none.res.ok, false);
    assert.match(none.res.error, /no pull request/);
    assert.equal(writes(), 0);

    const start = S.log.length;
    const given = exec(statusOp10({ sha: 'abc1234' }));
    assert.equal(given.res.ok, true, JSON.stringify(given.res));
    assert.equal(statusesOf('abc1234').length, 1);
    assert.ok(!S.log.slice(start).some((c) => /pulls/.test(c.args.join(' '))), 'no PR lookup when the sha is given');
  });

  test('3. a repeat with the same state and description writes nothing; a changed state or description writes once', () => {
    seedPr10();
    assert.equal(exec(statusOp10()).res.ok, true);
    const w = writes();
    assert.equal(exec(statusOp10()).res.ok, true);
    assert.equal(writes(), w, 'identical status: zero writes');

    assert.equal(exec(statusOp10({ state: 'failure' })).res.ok, true);
    assert.equal(writes(), w + 1);
    assert.equal(exec(statusOp10({ state: 'failure' })).res.ok, true);
    assert.equal(writes(), w + 1);
    assert.equal(exec(statusOp10({ state: 'failure', description: '2 gaps' })).res.ok, true);
    assert.equal(writes(), w + 2);

    assert.equal(exec(statusOp10({ state: 'pending' }, 'devflow/other')).res.ok, true);
    assert.equal(writes(), w + 3, 'another context is its own status');
    const combined = JSON.parse(S.fake.runGh(['api', `repos/o/r/commits/${TIP10}/status`]).stdout);
    const mine = combined.statuses.find((s) => s.context === 'devflow/verification');
    assert.equal(mine.state, 'failure');
    assert.equal(mine.description, '2 gaps');
  });

  test('4. upsert-pr-comment keeps one marker-keyed comment on the PR number; identical re-flush writes nothing; new text patches in place', () => {
    const { objective, number } = seedPr10();
    const { res } = exec(commentOp10('wiki diff v1\n'));
    assert.equal(res.ok, true, JSON.stringify(res));
    const cs = commentsOf(number);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].body, `${bodyLib.commentMarker('49', 'wiki-diff')}\nwiki diff v1\n`);
    assert.match(cs[0].body, /devflow:id=49 kind=wiki-diff/);
    assert.equal(commentsOf(objective).length, 0, 'nothing lands on the objective issue');

    const w = writes();
    assert.equal(exec(commentOp10('wiki diff v1\n')).res.ok, true);
    assert.equal(writes(), w, 'identical text: zero writes');

    assert.equal(exec(commentOp10('wiki diff v2\n')).res.ok, true);
    assert.equal(writes(), w + 1);
    const after = commentsOf(number);
    assert.equal(after.length, 1, 'patched in place, not a second comment');
    assert.equal(after[0].id, cs[0].id);
    assert.equal(after[0].body, `${bodyLib.commentMarker('49', 'wiki-diff')}\nwiki diff v2\n`);
    assert.equal(S.log.filter((c) => c.args.join(' ') === `api --method PATCH repos/o/r/issues/comments/${cs[0].id} --input -`).length, 1);
  });

  test('4b. two kinds are two comments; a human comment on the PR is left alone', () => {
    const { number } = seedPr10();
    S.fake.seedComment(number, 'A reviewer: looks good.');
    assert.equal(exec(commentOp10('diff\n')).res.ok, true);
    assert.equal(exec(commentOp10('other\n', 'review-notes')).res.ok, true);
    const cs = commentsOf(number);
    assert.equal(cs.length, 3);
    assert.equal(cs[0].body, 'A reviewer: looks good.');
  });

  test('5. a text over the comment limit becomes numbered parts; a shorter text re-marks the surplus parts superseded', () => {
    const { number } = seedPr10();
    const big = `${('x'.repeat(99) + '\n').repeat(1300)}`;
    const { res } = exec(commentOp10(big));
    assert.equal(res.ok, true, JSON.stringify(res));
    const cs = commentsOf(number);
    assert.equal(cs.length, 3);
    for (const c of cs) assert.ok(c.body.length <= trd.COMMENT_MAX_CHARS, `part of ${c.body.length} chars`);
    const found = bodyLib.findCommentsByMarker(cs, '49', 'wiki-diff');
    assert.deepEqual(found.map((f) => [f.part, f.of]), [[1, 3], [2, 3], [3, 3]]);

    assert.equal(exec(commentOp10('now short\n')).res.ok, true);
    const after = commentsOf(number);
    assert.equal(after.length, 3, 'nothing was deleted');
    assert.equal(after[1].body.split('\n')[0], '<!-- devflow:id=49 kind=wiki-diff-superseded -->');
    assert.equal(after[2].body.split('\n')[0], '<!-- devflow:id=49 kind=wiki-diff-superseded -->');
    assert.equal(bodyLib.findCommentsByMarker(after, '49', 'wiki-diff').length, 1);
  });

  test('5b. a human edit of the sticky comment halts and writes nothing; --accept-remote adopts it', () => {
    const { number } = seedPr10();
    assert.equal(exec(commentOp10('first\n')).res.ok, true);
    const c = commentsOf(number)[0];
    S.fake.humanEditComment(c.id, `${c.body}human note\n`);
    const w = writes();
    const halted = exec(commentOp10('second\n'));
    assert.equal(halted.res.halt, true, JSON.stringify(halted.res));
    assert.equal(halted.res.issue_number, number);
    assert.match(halted.res.detail, /pull request/);
    assert.equal(writes(), w);
  });

  test('9. delete-branch removes the ref on GitHub; a repeat is success; the default branch is refused', () => {
    const { res } = exec(deleteOp10());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(S.fake.refs[B10], undefined);
    assert.equal(S.log.filter((c) => c.args.join(' ') === `api --method DELETE repos/o/r/git/refs/heads/${B10}`).length, 1);

    const again = exec(deleteOp10());
    assert.equal(again.res.ok, true, JSON.stringify(again.res));

    const w = writes();
    const main = exec(deleteOp10('main'));
    assert.equal(main.res.ok, false);
    assert.match(main.res.error, /default branch/);
    assert.notEqual(S.fake.refs.main, undefined, 'the default branch is untouched');
    assert.equal(writes(), w, 'no DELETE was attempted');
  });

  test('9b. a 404 on delete is success; any other failure is not', () => {
    interceptGh10(/DELETE/, failure10('gh: Not Found (HTTP 404)'));
    assert.equal(exec(deleteOp10()).res.ok, true);
    interceptGh10(/DELETE/, failure10('gh: Protected branch cannot be deleted (HTTP 422)'));
    const blocked = exec(deleteOp10());
    assert.equal(blocked.res.ok, false);
    assert.equal(blocked.res.class, 'validation');
  });
});

describe('49-10 PR merge (no merge queue)', () => {
  useStore({ fake: { refs: { [B10]: TIP10 } } });
  const writes = () => S.fake.writes().length;
  const putMerges = () => S.log.filter((c) => /^api --method PUT repos\/o\/r\/pulls\/\d+\/merge/.test(c.args.join(' ')));

  test('6. a ready PR is merged with squash by default; the merge pins the head sha; a re-flush writes nothing', () => {
    const { number } = seedPr10({ ready: true });
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, true, JSON.stringify(res));
    const pr = issueByNumber(number);
    assert.equal(pr.pr.merged, true);
    assert.equal(pr.pr.mergeMethod, 'squash');
    assert.equal(putMerges().length, 1);
    assert.deepEqual(JSON.parse(putMerges()[0].opts.input), { merge_method: 'squash', sha: TIP10 });

    const w = writes();
    assert.equal(exec(mergeOp10()).res.ok, true);
    assert.equal(writes(), w, 'already merged: zero writes');
  });

  test('6b. payload.method wins over the default', () => {
    const { number } = seedPr10({ ready: true });
    assert.equal(exec(mergeOp10({ method: 'rebase' })).res.ok, true);
    assert.equal(issueByNumber(number).pr.mergeMethod, 'rebase');
  });

  test('6c. the configured merge method is the default', () => {
    const file = path.join(S.root, '.planning', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    cfg.github.pr = { merge_method: 'merge' };
    fs.writeFileSync(file, JSON.stringify(cfg));
    const { number } = seedPr10({ ready: true });
    assert.equal(exec(mergeOp10()).res.ok, true);
    assert.equal(issueByNumber(number).pr.mergeMethod, 'merge');
  });

  test('6d. a PR a human already merged is a no-op', () => {
    const { number } = seedPr10({ ready: true });
    S.fake.humanMergePr(number, { method: 'squash' });
    const w = writes();
    assert.equal(exec(mergeOp10()).res.ok, true);
    assert.equal(writes(), w);
    assert.equal(putMerges().length, 0);
  });

  test('6e. a PR closed without merging is an error naming the PR', () => {
    const { number } = seedPr10({ ready: true });
    assert.equal(S.fake.runGh(['api', '--method', 'PATCH', `repos/o/r/pulls/${number}`, '-f', 'state=closed']).ok, true);
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, false);
    assert.match(res.error, new RegExp(`#${number}`));
    assert.match(res.error, /closed/);
    assert.equal(putMerges().length, 0);
  });

  test('8. a draft PR halts: nothing is merged and the report names the PR and "draft"', () => {
    const { number } = seedPr10();
    const w = writes();
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, false);
    assert.match(res.error, new RegExp(`#${number}`));
    assert.match(res.error, /draft/);
    assert.equal(writes(), w);
    assert.equal(issueByNumber(number).pr.merged, false);

    enqueueOps([mergeOp10()]);
    const flushed = runFlush();
    assert.equal(flushed.status, 'halted');
    assert.match(flushed.error, /draft/);
    assert.equal(queueNow()[0].status, 'blocked');
  });

  test('8b. no PR yet is an error that names upsert-pr', () => {
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, false);
    assert.match(res.error, /no pull request/);
  });

  test('8c. a 405 from the merge halts for a human; a 409 (head changed) stays pending', () => {
    const { number } = seedPr10({ ready: true });
    interceptGh10(/PUT repos\/o\/r\/pulls\/\d+\/merge/, failure10('gh: Pull Request is not mergeable (HTTP 405)'));
    const blocked = exec(mergeOp10());
    assert.equal(blocked.res.ok, false);
    assert.equal(blocked.res.class, 'not_mergeable');
    assert.match(blocked.res.error, new RegExp(`#${number}`));
    assert.match(blocked.res.error, /not mergeable/);

    interceptGh10(/PUT repos\/o\/r\/pulls\/\d+\/merge/, failure10('gh: Head branch was modified. Review and try the merge again. (HTTP 409)'));
    const changed = exec(mergeOp10());
    assert.equal(changed.res.ok, false);
    assert.equal(changed.res.class, 'pending');
  });

  test('8d. classifyFailure: 405 and 409 mean something only for pr-merge', () => {
    const f405 = failure10('gh: Method Not Allowed (HTTP 405)');
    const f409 = failure10('gh: Conflict (HTTP 409)');
    assert.equal(flushLib.classifyFailure(f405, 'pr-merge'), 'not_mergeable');
    assert.equal(flushLib.classifyFailure(f409, 'pr-merge'), 'pending');
    assert.equal(flushLib.classifyFailure(f405), 'error');
    assert.equal(flushLib.classifyFailure(f409), 'error');
    assert.equal(flushLib.classifyFailure(f409, 'upsert-pr'), 'error');
  });
});

describe('49-10 PR merge (merge queue)', () => {
  useStore({ fake: { refs: { [B10]: TIP10 }, mergeQueue: true } });
  const writes = () => S.fake.writes().length;
  const enqueues = () => S.fake.writes().filter((a) => /enqueuePullRequest/.test(a.join(' ')));

  test('7. with a merge queue the PR is enqueued once and stays open; a re-flush writes nothing', () => {
    const { number } = seedPr10({ ready: true });
    const before = writes();
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(enqueues().length, 1);
    assert.equal(writes() - before, 1);
    const pr = issueByNumber(number);
    assert.equal(pr.pr.merged, false, 'the queue merges later, not now');
    assert.equal(pr.pr.queued, true);
    assert.equal(pr.state, 'OPEN');
    assert.equal(S.log.filter((c) => /\/merge/.test(c.args.join(' '))).length, 0, 'the REST merge is never used on a queue');

    const w = writes();
    assert.equal(exec(mergeOp10()).res.ok, true);
    assert.equal(writes(), w, 'already queued: zero writes');
  });

  test('7b. payload.method is ignored by a queue; once the queue lands the PR the op is a no-op', () => {
    const { number } = seedPr10({ ready: true });
    assert.equal(exec(mergeOp10({ method: 'rebase' })).res.ok, true);
    assert.equal(enqueues().length, 1);
    S.fake.humanMergePr(number, { method: 'squash' });
    const w = writes();
    assert.equal(exec(mergeOp10()).res.ok, true);
    assert.equal(writes(), w);
  });

  test('7c. a draft PR is never enqueued', () => {
    const { number } = seedPr10();
    const { res } = exec(mergeOp10());
    assert.equal(res.ok, false);
    assert.match(res.error, new RegExp(`#${number}.*draft`));
    assert.equal(enqueues().length, 0);
  });
});
