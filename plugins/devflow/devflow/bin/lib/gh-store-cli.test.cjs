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
const os = require('os');
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

// ─── Task 2: gh trd spec|freeze|fold|scope and gh orphans (tests 7-11, 12b) ──

const { oversizedTrdText } = require('./__fixtures__/gh-store-fixtures.cjs');

const TRD_ID = '7-01';
const TRD_FILE = '07-01-alpha-TRD.md';
const TRD_TEXT = '# TRD 07-01: alpha\n\nThe alpha spec.\n';

const trdCmd = (args, raw = true) => capture(() => cli.cmdGhTrd(S.root, args, raw));
const orphansCmd = (args, raw = true) => capture(() => cli.cmdGhOrphans(S.root, args, raw));

/** Seed a TRD issue carrying the 47-01 body header and map it, as `gh sync` leaves it. */
function seedTrd({ text = TRD_TEXT, state = 'OPEN', id = TRD_ID, file = TRD_FILE } = {}) {
  const number = S.fake.seedIssue({ title: `[TRD ${id}] ${file}`, body: trd.encodeTrdBody({ id, file, text }), state, labels: ['devflow:trd'] });
  const map = mappingNow();
  mappingLib.setTrd(map, id, { issue_number: number, rest_id: 1_000_000 + number });
  assert.equal(mappingLib.writeMappingV3(S.root, map).ok, true);
  return number;
}

const seedScope = (number, n, text) => S.fake.seedComment(number, trd.buildScopeComment(n, text));

/**
 * A scope DevFlow posted (49-06): the comment plus the hash-bound `scope n=K scope_hash=H` spec-rev row that
 * `gh trd scope` queues in store mode. The store-mode gate accepts it whoever authored the comment.
 */
function seedDevflowScope(number, n, text) {
  const id = S.fake.seedComment(number, trd.buildScopeComment(n, text));
  const marker = bodyLib.commentMarker(TRD_ID, 'spec-rev');
  const existing = S.fake.comments.find((c) => c.issue_number === number && c.body.startsWith(marker));
  const entry = { at: '2026-10-01T12:00:00Z', event: trd.scopeEvent(n, trd.scopeHash(text)), hash: trd.contentHash(`effective after ${n}`), chars: 1 };
  if (existing) S.fake.humanEditComment(existing.id, trd.appendSpecRev(existing.body, entry));
  else S.fake.seedComment(number, trd.appendSpecRev(`${marker}\n`, entry));
  return id;
}
const commentsOf = (number) => S.fake.comments.filter((c) => c.issue_number === number);
const specRevOf = (number) => commentsOf(number).find((c) => c.body.startsWith(bodyLib.commentMarker(TRD_ID, 'spec-rev')));
const ghWrites = () => S.fake.writes().length;

describe('gh trd spec', () => {
  useStore();

  test('7. prints the effective spec; --raw gives {text, applied, chars} for the seeded scope comments', () => {
    const number = seedTrd();
    seedDevflowScope(number, 1, 'First change.');
    seedDevflowScope(number, 2, 'Second change.');
    const writes = ghWrites();

    const raw = trdCmd(['spec', '07-01']);
    assert.equal(exitOf(raw), 0, raw.stdout + raw.stderr);
    const j = json(raw);
    assert.equal(j.ok, true);
    assert.deepEqual(j.applied, [1, 2]);
    assert.ok(j.text.includes('The alpha spec.'));
    assert.ok(j.text.includes('First change.') && j.text.includes('Second change.'));
    assert.equal(typeof j.chars, 'number');
    assert.ok(j.chars >= j.text.length, 'chars is the encoded size, header included');

    const prose = trdCmd(['spec', '7-01'], false);
    assert.equal(exitOf(prose), 0);
    assert.equal(prose.stdout, j.text.endsWith('\n') ? j.text : `${j.text}\n`, 'prose is the spec itself, ready to pipe');
    assert.equal(ghWrites(), writes, 'reading the spec writes nothing');
  });

  test('7b. a TRD with no issue: exit 1 with the reason', () => {
    const r = trdCmd(['spec', '07-02'], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /07-02|7-02/);
  });
});

describe('gh trd freeze', () => {
  useStore();

  test('8. freezes after an implicit flush: the spec-rev comment on GitHub carries a freeze row', () => {
    const number = seedTrd();
    const r = trdCmd(['freeze', '07-01'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.match(r.stdout, /freeze/i);
    const rev = specRevOf(number);
    assert.ok(rev, 'a spec-rev comment was posted');
    assert.match(rev.body, /freeze/);
    assert.equal(outbox.status(S.root).pending, 0);
  });

  test('8b. --no-flush leaves the freeze queued and writes nothing', () => {
    const number = seedTrd();
    const writes = ghWrites();
    const r = trdCmd(['freeze', '07-01', '--no-flush'], true);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.equal(ghWrites(), writes);
    assert.equal(specRevOf(number), undefined);
    const ops = queueNow().filter((o) => o.status === 'pending');
    assert.equal(ops.length, 1);
    assert.deepEqual(ops[0].target, { id: TRD_ID, kind: 'spec-rev' });
    assert.equal(json(r).flush, undefined, 'no flush ran');
  });

  test('8c. a flush that is rate limited surfaces as exit 3 with the freeze still queued (--no-wait)', () => {
    seedTrd();
    S.fake.failNext(/POST repos\/o\/r\/issues\/\d+\/comments/, { ok: false, status: 1, stderr: 'gh: HTTP 403: You have exceeded a secondary rate limit' });
    const r = trdCmd(['freeze', '07-01', '--no-wait'], false);
    assert.equal(exitOf(r), 3, r.stdout + r.stderr);
    assert.match(r.stdout, /pending/i);
    assert.equal(outbox.status(S.root).pending, 1);
  });

  test('8d. freezing an already frozen TRD is a no-op that says so', () => {
    seedTrd();
    assert.equal(exitOf(trdCmd(['freeze', '07-01'], false)), 0);
    const r = trdCmd(['freeze', '07-01'], false);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /already frozen/i);
  });
});

describe('gh trd fold', () => {
  useStore();

  test('9. a closed TRD: the body is replaced with the effective spec and spec-rev gets a fold row', () => {
    const number = seedTrd({ state: 'CLOSED' });
    seedDevflowScope(number, 1, 'Folded change.');
    const r = trdCmd(['fold', '07-01'], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    assert.ok(S.fake.issues.find((i) => i.number === number).body.includes('Folded change.'), 'the scope text is now in the body');
    assert.match(specRevOf(number).body, /fold/);
    assert.equal(outbox.status(S.root).pending, 0);
  });

  test('9b. an open TRD: exit 1 with the message and nothing queued; --force proceeds', () => {
    const number = seedTrd();
    seedDevflowScope(number, 1, 'Folded change.');
    const refused = trdCmd(['fold', '07-01'], false);
    assert.equal(exitOf(refused), 1);
    assert.match(refused.stderr, /open/);
    assert.match(refused.stderr, /--force/);
    assert.equal(queueNow().length, 0);

    const forced = trdCmd(['fold', '07-01', '--force'], false);
    assert.equal(exitOf(forced), 0, forced.stdout + forced.stderr);
    assert.ok(S.fake.issues.find((i) => i.number === number).body.includes('Folded change.'));
  });

  test('9c. nothing waiting to fold: exit 0 and says so', () => {
    seedTrd({ state: 'CLOSED' });
    const r = trdCmd(['fold', '07-01'], false);
    assert.equal(exitOf(r), 0);
    assert.match(r.stdout, /nothing to fold/i);
    assert.equal(queueNow().length, 0);
  });
});

describe('gh trd scope', () => {
  useStore();

  test('10. @file: posts the next scope comment (n = highest + 1)', () => {
    const number = seedTrd();
    seedScope(number, 1, 'First change.');
    const file = path.join(S.root, 'scope.md');
    fs.writeFileSync(file, 'Second change, from a file.\n');
    const r = trdCmd(['scope', '07-01', `@file:${file}`], false);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const posted = commentsOf(number).find((c) => c.body.startsWith(trd.scopeMarker(2)));
    assert.ok(posted, 'scope comment n=2 is on GitHub');
    assert.ok(posted.body.includes('Second change, from a file.'));
    assert.match(specRevOf(number).body, /scope/);
  });

  test('10b. inline text with --n K, and --no-flush queues without writing', () => {
    const number = seedTrd();
    const writes = ghWrites();
    const queued = trdCmd(['scope', '07-01', 'An inline change.', '--n', '4', '--no-flush'], true);
    assert.equal(exitOf(queued), 0, queued.stdout + queued.stderr);
    assert.equal(json(queued).n, 4);
    assert.equal(ghWrites(), writes);
    assert.equal(queueNow().filter((o) => o.kind === 'post-scope').length, 1);

    assert.equal(exitOf(trdCmd(['flush-not-a-verb'], false)), 1);
    assert.equal(exitOf(outboxCmd(['flush'])), 0);
    assert.ok(commentsOf(number).some((c) => c.body.startsWith(trd.scopeMarker(4))));
  });

  test('10c. an oversized scope is refused with "becomes a new TRD" and nothing is queued', () => {
    seedTrd();
    const file = path.join(S.root, 'big.md');
    fs.writeFileSync(file, 'x'.repeat(70000));
    const r = trdCmd(['scope', '07-01', `@file:${file}`], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /becomes a new TRD/);
    assert.equal(queueNow().length, 0);
  });

  test('10d. an effective spec pushed over the limit by a small scope is refused the same way', () => {
    const number = seedTrd({ text: oversizedTrdText(59000, { id: TRD_ID, file: TRD_FILE }) });
    assert.ok(number > 0);
    const r = trdCmd(['scope', '07-01', 'n'.repeat(2500)], true);
    assert.equal(exitOf(r), 1);
    const j = json(r);
    assert.equal(j.overflow, true);
    assert.match(j.error, /becomes a new TRD/);
    assert.equal(queueNow().length, 0);
  });

  test('10e. a missing @file: path is exit 1; a missing body or a bad --n is usage on stderr, exit 1', () => {
    seedTrd();
    const missing = trdCmd(['scope', '07-01', `@file:${path.join(S.root, 'nope.md')}`], false);
    assert.equal(exitOf(missing), 1);
    assert.match(missing.stderr, /nope\.md/);
    for (const args of [['scope', '07-01'], ['scope', '07-01', 'text', '--n', 'abc'], ['scope', '07-01', 'text', '--n', '0']]) {
      const r = trdCmd(args, false);
      assert.equal(exitOf(r), 1, args.join(' '));
      assert.match(r.stderr, /[Uu]sage/, args.join(' '));
    }
    assert.equal(queueNow().length, 0);
  });
});

describe('gh orphans', () => {
  useStore();

  /** The objective, a linked TRD with no local file (7-04) and an unlinked TRD issue (7-09). */
  function seedOrphans() {
    const objective = seedObjective();
    const trdIssue = (id, file) => S.fake.seedIssue({
      title: `[TRD ${id}] ${file}`,
      body: trd.encodeTrdBody({ id, file, text: '# x\n' }),
      labels: ['devflow:trd'],
    });
    const missingLocal = trdIssue('7-04', '07-04-gone-TRD.md');
    const unlinked = trdIssue('7-09', '07-09-ghost-TRD.md');
    const link = S.fake.runGh(
      ['api', '--method', 'POST', `repos/o/r/issues/${objective}/sub_issues`, '--input', '-'],
      { input: JSON.stringify({ sub_issue_id: 1_000_000 + missingLocal }) },
    );
    assert.equal(link.ok, true, link.stderr);
    return { objective, missingLocal, unlinked };
  }

  test('11. lists unlinked TRD issues and linked TRDs without a local file; zero writes', () => {
    const { missingLocal, unlinked } = seedOrphans();
    const writes = ghWrites();
    const mapping = fs.readFileSync(path.join(S.root, '.planning', '.gh-mapping.json'), 'utf8');

    const raw = orphansCmd(['7']);
    assert.equal(exitOf(raw), 0, raw.stdout + raw.stderr);
    const j = json(raw);
    assert.deepEqual(j.unlinked, [{ id: '7-09', number: unlinked }]);
    assert.deepEqual(j.missing_local, [{ id: '7-04', number: missingLocal }]);

    const prose = orphansCmd(['7'], false);
    assert.equal(exitOf(prose), 0);
    assert.match(prose.stdout, new RegExp(`7-09.*#${unlinked}`));
    assert.match(prose.stdout, new RegExp(`7-04.*#${missingLocal}`));
    assert.match(prose.stdout, /nothing was (deleted|changed)/i);

    assert.equal(ghWrites(), writes);
    assert.equal(fs.readFileSync(path.join(S.root, '.planning', '.gh-mapping.json'), 'utf8'), mapping);
  });

  test('11b. a clean objective says so; an objective with no issue is exit 1', () => {
    seedObjective();
    const clean = orphansCmd(['7'], false);
    assert.equal(exitOf(clean), 0);
    assert.match(clean.stdout, /no orphans/i);

    const none = orphansCmd(['8'], false);
    assert.equal(exitOf(none), 1);
    assert.match(none.stderr, /8/);
  });

  test('11c. a missing objective argument is usage, exit 1', () => {
    const r = orphansCmd([], false);
    assert.equal(exitOf(r), 1);
    assert.match(r.stderr, /[Uu]sage/);
  });
});

describe('gh trd / gh orphans: shared behaviour', () => {
  useStore();

  test('12b. github.enabled:false: every trd verb and orphans is skipped with zero gh calls', () => {
    setConfig({ enabled: false, repo: 'o/r' });
    const runs = [
      trdCmd(['spec', '07-01']), trdCmd(['freeze', '07-01']), trdCmd(['fold', '07-01']),
      trdCmd(['scope', '07-01', 'text']), orphansCmd(['7']),
    ];
    for (const r of runs) {
      assert.equal(exitOf(r), 0, r.stdout + r.stderr);
      assert.equal(json(r).skipped, true);
      assert.match(json(r).reason, /github\.enabled/);
    }
    assert.equal(S.fake.calls().length, 0);
    assert.equal(queueNow().length, 0);
  });

  test('unknown and missing trd verbs list the available ones; a missing TRD id is usage; --help exits 0', () => {
    for (const args of [['nope', '07-01'], []]) {
      const r = trdCmd(args, false);
      assert.equal(exitOf(r), 1);
      for (const verb of ['spec', 'freeze', 'fold', 'scope']) assert.match(r.stderr, new RegExp(verb));
    }
    for (const verb of ['spec', 'freeze', 'fold']) {
      const r = trdCmd([verb], false);
      assert.equal(exitOf(r), 1, verb);
      assert.match(r.stderr, /[Uu]sage/, verb);
    }
    const help = trdCmd(['--help'], false);
    assert.equal(exitOf(help), 0);
    assert.match(help.stdout, /gh trd scope/);
    const orphanHelp = orphansCmd(['--help'], false);
    assert.equal(exitOf(orphanHelp), 0);
    assert.match(orphanHelp.stdout, /gh orphans/);
    assert.equal(S.fake.calls().length, 0);
  });
});

// ─── Task 3: df-tools dispatch and help text (tests 13-14) ───────────────────

const { spawnSync } = require('node:child_process');

const DF_TOOLS = path.resolve(__dirname, '..', 'df-tools.cjs');
const { COMMANDS: HELP_COMMANDS } = require('./help.cjs');

/** Spawn the worktree's own df-tools in the temp project, with HOME and every DEVFLOW_* dir pointed at temp dirs. */
function dfTools(...args) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd: S.root,
    env: { ...process.env, ...S.envh.env },
    encoding: 'utf8',
    timeout: 60000,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('df-tools dispatch for gh outbox | gh trd | gh orphans', () => {
  useStore();

  test('13a. gh outbox status --raw works through the real dispatcher on an enabled project (no gh needed)', () => {
    const r = dfTools('gh', 'outbox', 'status', '--raw');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.ok, true);
    assert.equal(j.pending, 0);
    assert.equal(j.halted, null);
    assert.ok(j.journal.startsWith(S.envh.env.DEVFLOW_OUTBOX_DIR), j.journal);
  });

  test('13b. with github.enabled:false every new subcommand is skipped through the dispatcher, exit 0', () => {
    setConfig({ enabled: false, repo: 'o/r' });
    for (const args of [
      ['gh', 'outbox', 'status', '--raw'],
      ['gh', 'outbox', 'flush', '--no-wait', '--raw'],
      ['gh', 'outbox', 'resolve', '1', '--overwrite', '--raw'],
      ['gh', 'trd', 'spec', '07-01', '--raw'],
      ['gh', 'trd', 'scope', '07-01', 'some text', '--raw'],
      ['gh', 'orphans', '7', '--raw'],
    ]) {
      const r = dfTools(...args);
      assert.equal(r.code, 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).skipped, true, args.join(' '));
    }
  });

  test('13c. an empty outbox flushes with exit 0 through the dispatcher', () => {
    const r = dfTools('gh', 'outbox', 'flush', '--raw');
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).status, 'flushed');
  });

  test('13d. an unknown gh subcommand lists outbox, trd and orphans (and the older ones)', () => {
    const r = dfTools('gh', 'nope');
    assert.equal(r.code, 1);
    for (const sub of ['status', 'sync', 'pull', 'resolve', 'comment', 'close-issue', 'sync-release', 'outbox', 'trd', 'orphans']) {
      assert.match(r.stderr, new RegExp(sub), sub);
    }
  });

  test('13e. unknown outbox and trd subcommands list their verbs and exit 1', () => {
    const outboxR = dfTools('gh', 'outbox', 'nope');
    assert.equal(outboxR.code, 1);
    for (const v of ['status', 'flush', 'resolve']) assert.match(outboxR.stderr, new RegExp(v));
    const trdR = dfTools('gh', 'trd', 'nope', '07-01');
    assert.equal(trdR.code, 1);
    for (const v of ['spec', 'freeze', 'fold', 'scope']) assert.match(trdR.stderr, new RegExp(v));
  });
});

describe('help text', () => {
  test('14. the gh usage line names outbox, trd, orphans and pull --all', () => {
    const usage = HELP_COMMANDS.gh.usage;
    for (const needle of ['outbox', 'status', 'flush', 'resolve', '--accept-remote', '--overwrite', 'trd', 'spec', 'freeze', 'fold', 'scope', 'orphans', 'pull', '--all']) {
      assert.ok(usage.includes(needle), `usage names ${needle}`);
    }
    assert.ok(usage.includes('pull --all'), 'usage names pull --all');
  });

  test('14b. df-tools gh outbox --help answers with the gh usage and exits 0', () => {
    const r = spawnSync(process.execPath, [DF_TOOLS, 'gh', 'outbox', '--help'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /outbox/);
    assert.match(r.stdout, /orphans/);
  });
});

// ─── 48-11: the enqueue-then-flush helpers are a library API ─────────────────

describe('48-11: queuedResult / EXIT / flushResult are exported for the planning verbs', () => {
  test('17. the three helpers are exported unchanged', () => {
    assert.equal(typeof cli.queuedResult, 'function');
    assert.equal(typeof cli.flushResult, 'function');
    assert.deepEqual({ ...cli.EXIT }, { OK: 0, ERROR: 1, HALTED: 2, PENDING: 3 });
    assert.ok(Object.isFrozen(cli.EXIT));
    const pending = cli.flushResult(os.tmpdir(), { status: 'pending', done: [], pending: 2, reason: 'offline', warnings: [] });
    assert.equal(pending.code, cli.EXIT.PENDING);
    assert.equal(pending.payload.ok, true);
    assert.match(pending.prose, /2 op\(s\) still queued/);
    const failed = cli.flushResult(os.tmpdir(), { status: 'error', done: [], pending: 0, error: 'boom', warnings: [] });
    assert.equal(failed.code, cli.EXIT.ERROR);
    assert.equal(failed.payload.ok, false);
  });
});

describe('48-11: a drained flush settles the verb-write ledger', () => {
  useStore();

  test('14b. matching entries are baselined and forgotten; drifted and (not queued) entries stay', () => {
    const ledgerLib = require('./planning-ledger.cjs');
    const write = (rel, text) => {
      const file = path.join(S.root, '.planning', ...rel.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    };
    write('research/match.md', 'm\n');
    ledgerLib.record(S.root, 'research/match.md', 'm\n', { verb: 'doc put' });
    write('research/drift.md', 'edited later\n');
    ledgerLib.record(S.root, 'research/drift.md', 'as written\n', { verb: 'doc put' });
    write('research/held.md', 'h\n');
    ledgerLib.record(S.root, 'research/held.md', 'h\n', { verb: `doc put${cli.UNQUEUED_MARK}` });

    const r = outboxCmd(['flush']);
    assert.equal(exitOf(r), 0, r.stdout + r.stderr);
    const payload = json(r);
    assert.equal(payload.status, 'flushed');
    assert.deepEqual(payload.settled, ['research/match.md']);
    assert.deepEqual(Object.keys(ledgerLib.readLedger(S.root).entries).sort(), ['research/drift.md', 'research/held.md']);
    const idx = outbox.readCacheIndex(S.root);
    assert.equal(idx['research/match.md'], trd.contentHash('m\n'));
    assert.equal(idx['research/drift.md'], undefined);
    assert.equal(idx['research/held.md'], undefined);
    assert.equal(S.fake.calls().length, 0, 'an empty journal flushes with zero gh calls');
  });

  test('14c. a flush that does not drain the journal settles nothing', () => {
    const ledgerLib = require('./planning-ledger.cjs');
    const file = path.join(S.root, '.planning', 'research', 'match.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'm\n');
    ledgerLib.record(S.root, 'research/match.md', 'm\n', { verb: 'doc put' });
    const res = cli.flushResult(S.root, { status: 'pending', done: [], pending: 1, reason: 'offline', warnings: [] });
    assert.equal(res.code, cli.EXIT.PENDING);
    assert.equal(res.payload.settled, undefined);
    assert.ok(Object.hasOwn(ledgerLib.readLedger(S.root).entries, 'research/match.md'));
  });
});
