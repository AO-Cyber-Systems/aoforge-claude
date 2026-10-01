'use strict';

/**
 * Tests for lib/gh-store-cli.cjs (TRD 47-11): the human-facing commands for the store —
 * `gh outbox status|flush|resolve`, `gh trd spec|freeze|fold|scope`, `gh orphans`.
 *
 * Hermetic: the project, the outbox and the capability cache live under os.tmpdir() (hermeticEnv), GitHub
 * is the in-memory fake installed through gh-client's seam, and the clock never really sleeps. The cmd*
 * functions run in-process under capture() (process.exit and stdout/stderr are stubbed), except the
 * dispatch tests, which spawn df-tools with github disabled so no gh is needed.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const cli = require('./gh-store-cli.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const bodyLib = require('./gh-body.cjs');
const trd = require('./gh-trd.cjs');
const capability = require('./gh-capability.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const MILESTONE = 'v9.9 Store Demo';

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}

/** An exit that was never called is an exit 0. */
const exitOf = (r) => (r.code === null ? 0 : r.code);

// ─── Per-test environment ────────────────────────────────────────────────────

let S;

/** Registers hooks giving each test a hermetic env, a store project, a fake GitHub and a fake clock. */
function useStore({ fake: fakeOverrides = {}, project: projectOverrides = {} } = {}) {
  beforeEach(() => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store: true, hasWiki: false, ...projectOverrides });
    const fake = createFakeGitHub({ ...project.fakeOptions, ...fakeOverrides });
    const clock = { t: T0, sleeps: [] };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.sleeps.push(ms); clock.t += ms; });
    client._setRunGh(fake.runGh);
    S = { envh, project, root: project.root, fake, clock };
  });
  afterEach(() => {
    client._resetClient();
    S.envh.restore();
    S.project.cleanup();
  });
}

const issueByNumber = (n) => S.fake.issues.find((i) => i.number === n);
const mappingNow = () => mappingLib.readMappingV3(S.root);
const queueNow = () => outbox.readJournal(S.root).journal.ops;
const json = (r) => JSON.parse(r.stdout);

const outboxCmd = (args, raw = true) => capture(() => cli.cmdGhOutbox(S.root, args, raw));

function enqueueOps(ops) {
  const r = outbox.enqueue(S.root, ops, { now: S.clock.t });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
}

function trdOp(id) {
  const file = id === '7-01' ? '07-01-alpha-TRD.md' : '07-02-beta-TRD.md';
  const body = trd.encodeTrdBody({ id, file, text: STORE_FIXTURE.trds[file] });
  return {
    kind: 'upsert-issue',
    target: { id, role: 'trd' },
    payload: { title: `[TRD ${id}] ${file}`, body, labels: ['devflow:trd'], milestone_title: MILESTONE, type: 'TRD' },
  };
}

/** An objective issue (marker + the managed sections) seeded in the fake and mapped. */
function seedObjective() {
  const body = bodyLib.mergeManaged('', { summary: 'Mine 1', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, '7').body;
  const n = S.fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['devflow:objective'] });
  const mapping = mappingNow();
  mappingLib.setEntry(mapping, '7', { issue_id: n });
  assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
  return n;
}

const managed = (summary) => ({ kind: 'patch-body', target: { id: '7' }, payload: { mode: 'managed', sections: { summary } } });

/**
 * Halt the queue on a remote edit: a first managed patch lands, a human rewrites it, the second patch
 * (seq 2) halts. Returns the objective issue number.
 */
function haltOnRemoteEdit() {
  const n = seedObjective();
  enqueueOps([managed('Mine 1')]);
  assert.equal(exitOf(outboxCmd(['flush'])), 0);
  S.fake.humanEditBody(n, issueByNumber(n).body.replace('Mine 1', 'A human rewrote this'));
  enqueueOps([managed('Mine 2')]);
  const r = outboxCmd(['flush']);
  assert.equal(exitOf(r), 2, r.stdout + r.stderr);
  return n;
}

const setConfig = (github) => fs.writeFileSync(path.join(S.root, '.planning', 'config.json'), JSON.stringify({ github }));

// ─── Task 1: gh outbox status | flush | resolve (tests 1-6, 12) ──────────────

describe('gh outbox status', () => {
  useStore();

  test('1. an empty journal: zero counts, no halt, the journal path under the outbox dir, zero gh calls', () => {
    const r = outboxCmd(['status']);
    assert.equal(exitOf(r), 0);
    const j = json(r);
    assert.equal(j.ok, true);
    assert.equal(j.pending, 0);
    assert.equal(j.blocked, 0);
    assert.equal(j.done, 0);
    assert.equal(j.halted, null);
    assert.equal(j.journal, outbox.journalPath(S.root));
    assert.ok(j.journal.startsWith(process.env.DEVFLOW_OUTBOX_DIR), j.journal);
    assert.deepEqual(j.degraded, []);
    assert.equal(S.fake.calls().length, 0);
  });

  test('1b. prose mode prints counts and the journal path', () => {
    enqueueOps([trdOp('7-01'), trdOp('7-02')]);
    const r = outboxCmd(['status'], false);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /2 pending/);
    assert.match(r.stdout, /0 blocked/);
    assert.ok(r.stdout.includes(outbox.journalPath(S.root)));
    assert.equal(S.fake.calls().length, 0);
  });

  test('2. a halt on a remote edit names the issue and both resolution commands; --raw carries halted', () => {
    const n = haltOnRemoteEdit();
    const calls = S.fake.calls().length;

    const prose = outboxCmd(['status'], false);
    assert.equal(exitOf(prose), 0, 'status reports; it does not fail');
    assert.match(prose.stdout, new RegExp(`#${n}\\b`));
    assert.match(prose.stdout, /remote-edit/);
    assert.match(prose.stdout, /resolve 2 --accept-remote/);
    assert.match(prose.stdout, /resolve 2 --overwrite/);

    const j = json(outboxCmd(['status']));
    assert.equal(j.halted.reason, 'remote-edit');
    assert.equal(j.halted.seq, 2);
    assert.equal(j.halted.issue_number, n);
    assert.equal(S.fake.calls().length, calls, 'status makes no gh call');
  });

  test('3. cached degraded capabilities: one sentence per degraded capability, read from the cache only', () => {
    const record = {
      repo: 'o/r', checked_at: new Date(T0).toISOString(), owner_type: 'User', push: true, private: false,
      org_types: { available: false, enabled: [] }, issue_fields: { available: false, ids: {} },
      sub_issues: 'absent', dependencies: 'absent', wiki: 'disabled', wiki_detail: null,
    };
    const file = capability.cachePath('o/r', process.env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record));

    const sentences = capability.describeDegraded(record);
    assert.ok(sentences.length >= 4, 'the fixture degrades several capabilities');
    const j = json(outboxCmd(['status']));
    assert.deepEqual(j.degraded, sentences);
    const prose = outboxCmd(['status'], false);
    for (const s of sentences) assert.ok(prose.stdout.includes(s), s);
    assert.equal(S.fake.calls().length, 0, 'the cached record only: no probe');
  });
});

describe('gh outbox flush', () => {
  useStore();

  test('4a. everything flushed: exit 0', () => {
    enqueueOps([trdOp('7-01')]);
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /flushed/i);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0);
    assert.equal(S.fake.issues.length, 1);
  });

  test('4b. offline: exit 3 and the output says pending; the ops stay queued', () => {
    enqueueOps([trdOp('7-01'), trdOp('7-02')]);
    S.fake.setOffline(true);
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 3, r.stdout + r.stderr);
    assert.match(r.stdout, /pending/i);
    assert.equal(json(outboxCmd(['status'])).pending, 2);
  });

  test('4c. a remote edit: exit 2 (a human must act) and the output names the issue', () => {
    const n = seedObjective();
    enqueueOps([managed('Mine 1')]);
    assert.equal(exitOf(outboxCmd(['flush'])), 0);
    S.fake.humanEditBody(n, issueByNumber(n).body.replace('Mine 1', 'A human rewrote this'));
    enqueueOps([managed('Mine 2')]);
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 2);
    assert.match(r.stdout, new RegExp(`#${n}\\b`));
    assert.match(r.stdout, /resolve 2 --accept-remote/);
    assert.match(r.stdout, /resolve 2 --overwrite/);
  });

  test('4d. a 500 on an op blocks it and halts the queue: exit 2', () => {
    enqueueOps([trdOp('7-01')]);
    S.fake.failNext(/POST repos\/o\/r\/issues --input/, { ok: false, status: 1, stderr: 'gh: Internal Server Error (HTTP 500)' });
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 2, r.stdout + r.stderr);
    assert.match(r.stdout, /blocked/i);
    assert.equal(json(outboxCmd(['status'])).halted.reason, 'blocked');
  });

  test('4e. another flusher holds the lock: exit 0 and "flush already running"', () => {
    enqueueOps([trdOp('7-01')]);
    const lock = outbox.acquireLock(S.root, { now: S.clock.t });
    assert.equal(lock.ok, true);
    const r = outboxCmd(['flush'], false);
    lock.release();
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /flush already running/);
    assert.equal(S.fake.issues.length, 0);
  });

  test('4f. an unusable config (github enabled, no resolvable repo): exit 1', () => {
    setConfig({ enabled: true, repo: 'not a slug' });
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stdout + r.stderr, /github\.repo/);
    assert.equal(S.fake.calls().length, 0);
  });

  const SECONDARY_LIMIT = { ok: false, status: 1, stderr: 'gh: HTTP 403: You have exceeded a secondary rate limit' };

  test('5. --no-wait with a secondary limit: exit 3, no retry and no back-off sleep (only the 1 s write pacing)', () => {
    enqueueOps([trdOp('7-01')]);
    S.fake.failNext(/POST repos\/o\/r\/issues --input/, SECONDARY_LIMIT);
    const r = outboxCmd(['flush', '--no-wait'], false);
    assert.equal(exitOf(r), 3, r.stdout + r.stderr);
    assert.match(r.stdout, /pending/i);
    assert.ok(S.clock.sleeps.every((ms) => ms <= client.MIN_WRITE_INTERVAL_MS), `hook mode never backs off: ${S.clock.sleeps}`);
    assert.equal(S.fake.issues.length, 0, 'the limited write was not retried');
    assert.equal(json(outboxCmd(['status'])).pending, 1);
  });

  test('5a. the same limit WITHOUT --no-wait is waited out and retried: exit 0 (the contrast that gives 5 its meaning)', () => {
    enqueueOps([trdOp('7-01')]);
    S.fake.failNext(/POST repos\/o\/r\/issues --input/, SECONDARY_LIMIT);
    const r = outboxCmd(['flush'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.ok(Math.max(...S.clock.sleeps) > client.MIN_WRITE_INTERVAL_MS, `a back-off sleep happened: ${S.clock.sleeps}`);
    assert.equal(S.fake.issues.length, 1);
  });

  test('5b. --raw carries the flush result', () => {
    enqueueOps([trdOp('7-01')]);
    const r = outboxCmd(['flush'], true);
    const j = json(r);
    assert.equal(j.status, 'flushed');
    assert.deepEqual(j.done, [1]);
    assert.equal(j.pending, 0);
  });
});

describe('gh outbox resolve', () => {
  useStore();

  test('6a. --accept-remote drops the halted op and clears the halt: exit 0', () => {
    haltOnRemoteEdit();
    const r = outboxCmd(['resolve', '2', '--accept-remote'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const st = outbox.status(S.root);
    assert.equal(st.halted, null);
    assert.equal(st.queue.length, 0, 'the halted op is dropped');
    assert.match(r.stdout, /accept/i);
  });

  test('6b. --overwrite keeps the op, clears the halt, and the next flush writes it: exit 0', () => {
    const n = haltOnRemoteEdit();
    const r = outboxCmd(['resolve', '2', '--overwrite'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(outbox.status(S.root).halted, null);
    assert.equal(outbox.status(S.root).queue.length, 1, 'the op is still queued');
    assert.equal(exitOf(outboxCmd(['flush'])), 0);
    assert.equal(bodyLib.extractSection(issueByNumber(n).body, 'summary'), 'Mine 2');
  });

  test('6c. a seq that is not the halted one: exit 1 with "is not halted"', () => {
    haltOnRemoteEdit();
    enqueueOps([trdOp('7-01')]); // seq 3 queued behind the halt
    const r = outboxCmd(['resolve', '3', '--overwrite'], true);
    assert.equal(exitOf(r), 1);
    assert.match(json(r).error, /op 3 is not halted/);
    assert.equal(outbox.status(S.root).halted.seq, 2, 'the halt is untouched');
  });

  test('6d. an unknown seq: exit 1', () => {
    haltOnRemoteEdit();
    const r = outboxCmd(['resolve', '99', '--accept-remote'], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stdout + r.stderr, /99/);
  });

  test('6e. a missing or conflicting flag, or a missing seq: usage on stderr, exit 1', () => {
    haltOnRemoteEdit();
    for (const args of [['resolve', '2'], ['resolve', '2', '--accept-remote', '--overwrite'], ['resolve', '--overwrite'], ['resolve', 'abc', '--overwrite']]) {
      const r = outboxCmd(args, false);
      assert.equal(exitOf(r), 1, args.join(' '));
      assert.match(r.stderr, /[Uu]sage/, args.join(' '));
    }
    assert.equal(outbox.status(S.root).halted.seq, 2, 'nothing was resolved');
  });
});

describe('gh outbox: shared behaviour', () => {
  useStore();

  test('12a. github.enabled:false: every outbox subcommand is skipped with zero gh calls and exit 0', () => {
    setConfig({ enabled: false, repo: 'o/r' });
    for (const args of [['status'], ['flush'], ['flush', '--no-wait'], ['resolve', '1', '--overwrite']]) {
      const r = outboxCmd(args, true);
      assert.equal(exitOf(r), 0, args.join(' '));
      const j = json(r);
      assert.equal(j.skipped, true, args.join(' '));
      assert.match(j.reason, /github\.enabled/);
    }
    assert.equal(S.fake.calls().length, 0);
  });

  test('unknown and missing subcommands list the available ones; --help prints usage and exits 0', () => {
    for (const args of [['nope'], []]) {
      const r = outboxCmd(args, false);
      assert.equal(exitOf(r), 1);
      assert.match(r.stderr, /status/);
      assert.match(r.stderr, /flush/);
      assert.match(r.stderr, /resolve/);
    }
    const help = outboxCmd(['--help'], false);
    assert.equal(exitOf(help), 0);
    assert.match(help.stdout, /gh outbox status/);
    assert.match(help.stdout, /--accept-remote/);
    assert.equal(S.fake.calls().length, 0);
  });

  test('EXIT is the documented table', () => {
    assert.deepEqual({ ...cli.EXIT }, { OK: 0, ERROR: 1, HALTED: 2, PENDING: 3 });
  });
});
