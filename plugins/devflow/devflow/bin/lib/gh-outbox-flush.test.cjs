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
