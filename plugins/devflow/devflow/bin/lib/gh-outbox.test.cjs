'use strict';

/**
 * gh-outbox.test.cjs — TRD 47-03 (GST-05, store half)
 *
 * The durable per-repo outbox journal. Every test builds its own directories under
 * os.tmpdir() and points DEVFLOW_OUTBOX_DIR and HOME at them; nothing here touches the
 * real ~/.claude and nothing calls GitHub.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const outbox = require('./gh-outbox.cjs');
const awareness = require('./awareness-store.cjs');

const T0 = Date.UTC(2026, 8, 30, 10, 0, 0); // 2026-09-30T10:00:00Z

let tmp;
let stateDir;
let root;
let savedEnv;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghob-'));
  stateDir = path.join(tmp, 'state');
  root = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  writeConfig({ github: { enabled: true, repo: 'o/r' } });
  savedEnv = { OUT: process.env.DEVFLOW_OUTBOX_DIR, HOME: process.env.HOME };
  process.env.DEVFLOW_OUTBOX_DIR = stateDir;
  process.env.HOME = path.join(tmp, 'home');
});

afterEach(() => {
  if (savedEnv.OUT === undefined) delete process.env.DEVFLOW_OUTBOX_DIR;
  else process.env.DEVFLOW_OUTBOX_DIR = savedEnv.OUT;
  if (savedEnv.HOME === undefined) delete process.env.HOME;
  else process.env.HOME = savedEnv.HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(obj) {
  fs.writeFileSync(path.join(root, '.planning', 'config.json'), JSON.stringify(obj));
}

/** Hand-built op factory. */
function op(kind, target, payload) {
  return { kind, target, payload };
}

/** One valid op of each of the 9 kinds. */
const VALID = {
  'upsert-issue': op('upsert-issue', { id: '07-01', role: 'trd' }, {
    title: 'TRD 07-01', body: 'body', labels: ['devflow'], milestone_title: null, type: null,
  }),
  'patch-body': op('patch-body', { id: '07' }, { mode: 'managed', sections: { status: 'running' } }),
  'patch-issue': op('patch-issue', { id: '07' }, { state: 'closed', state_reason: 'completed' }),
  'link-sub-issue': op('link-sub-issue', { parent: '07', child: '07-01' }, {}),
  block: op('block', { blocked: '07-02', blocker: '07-01' }, {}),
  'set-fields': op('set-fields', { id: '07' }, { values: { work: 'feature', kind: 'api' } }),
  'upsert-comment': op('upsert-comment', { id: '07-01', kind: 'summary' }, { text: 'done', mode: 'replace' }),
  'post-scope': op('post-scope', { id: '07', n: 1 }, { text: 'scope one' }),
  'wiki-push': op('wiki-push', { store: 'pages' }, {
    pages: ['objectives/07-store-demo/OBJECTIVE.md'], message: 'sync',
  }),
};

function patchBody(id, sections) {
  return op('patch-body', { id }, { mode: 'managed', sections });
}
function link(parent, child) {
  return op('link-sub-issue', { parent, child }, {});
}

function readRaw() {
  return JSON.parse(fs.readFileSync(outbox.journalPath(root), 'utf8'));
}

// ─── Schema and keys ──────────────────────────────────────────────────────────

describe('validateOp()', () => {
  test('1a. accepts one valid op of each of the 9 kinds', () => {
    assert.deepEqual(Object.keys(outbox.OP_KINDS).sort(), Object.keys(VALID).sort());
    assert.equal(Object.keys(VALID).length, 9);
    for (const [kind, o] of Object.entries(VALID)) {
      const r = outbox.validateOp(o);
      assert.equal(r.ok, true, `${kind}: ${r.error}`);
    }
  });

  test('1b. rejects an unknown kind, a non-object and a missing target', () => {
    assert.equal(outbox.validateOp(op('delete-everything', { id: '07' }, {})).ok, false);
    assert.equal(outbox.validateOp(null).ok, false);
    assert.equal(outbox.validateOp('upsert-issue').ok, false);
    assert.equal(outbox.validateOp({ kind: 'patch-body', payload: {} }).ok, false);
  });

  test('1c. rejects a missing target field and an unexpected one', () => {
    const noRole = outbox.validateOp(op('upsert-issue', { id: '07-01' }, VALID['upsert-issue'].payload));
    assert.equal(noRole.ok, false);
    assert.match(noRole.error, /role/);
    const noChild = outbox.validateOp(op('link-sub-issue', { parent: '07' }, {}));
    assert.equal(noChild.ok, false);
    assert.match(noChild.error, /child/);
    const extra = outbox.validateOp(op('patch-body', { id: '07', n: 3 }, VALID['patch-body'].payload));
    assert.equal(extra.ok, false);
  });

  test('1d. rejects patch-issue with an empty payload', () => {
    const r = outbox.validateOp(op('patch-issue', { id: '07' }, {}));
    assert.equal(r.ok, false);
    assert.match(r.error, /patch-issue/);
  });

  test('1e. rejects a numeric target id (ids are DevFlow ids, never issue numbers)', () => {
    const r = outbox.validateOp(op('patch-body', { id: 12 }, VALID['patch-body'].payload));
    assert.equal(r.ok, false);
    assert.match(r.error, /id/);
    assert.equal(outbox.validateOp(op('link-sub-issue', { parent: 12, child: '07-01' }, {})).ok, false);
    assert.equal(outbox.validateOp(op('block', { blocked: '07-02', blocker: 3 }, {})).ok, false);
  });

  test('1f. rejects payloads that break each kind contract', () => {
    const bad = [
      op('upsert-issue', { id: '07-01', role: 'epic' }, VALID['upsert-issue'].payload),
      op('upsert-issue', { id: '07-01', role: 'trd' }, { title: 't', body: 'b' }),
      op('patch-body', { id: '07' }, { mode: 'managed' }),
      op('patch-body', { id: '07' }, { mode: 'replace' }),
      op('patch-body', { id: '07' }, { mode: 'merge', sections: {} }),
      op('patch-issue', { id: '07' }, { state: 'deleted' }),
      op('patch-issue', { id: '07' }, { frobnicate: true }),
      op('link-sub-issue', { parent: '07', child: '07-01' }, { extra: 1 }),
      op('block', { blocked: '07-01', blocker: '07-01' }, {}),
      op('set-fields', { id: '07' }, { values: {} }),
      op('upsert-comment', { id: '07', kind: 'summary' }, { text: 'x', mode: 'append' }),
      op('upsert-comment', { id: '07', kind: 'spec-rev' }, { mode: 'append-spec-rev', entry: { at: 'x' } }),
      op('post-scope', { id: '07', n: 0 }, { text: 'x' }),
      op('post-scope', { id: '07', n: 1 }, {}),
      op('wiki-push', { store: 'docs' }, { pages: ['a.md'], message: 'm' }),
      op('wiki-push', { store: 'pages' }, { pages: [], message: 'm' }),
      op('wiki-push', { store: 'pages' }, { pages: ['/etc/passwd'], message: 'm' }),
      op('wiki-push', { store: 'pages' }, { pages: ['../escape.md'], message: 'm' }),
    ];
    for (const o of bad) {
      assert.equal(outbox.validateOp(o).ok, false, `should refuse ${o.kind} ${JSON.stringify(o.payload)}`);
    }
  });

  test('1g. accepts the alternate payload shapes of patch-body and upsert-comment', () => {
    const ok = [
      op('patch-body', { id: '07' }, { mode: 'replace', body: 'whole body' }),
      op('patch-body', { id: '07' }, {
        mode: 'managed', sections: {}, preserve_ticks: true,
        derive: { wiki: { dir: 'objectives/07' }, trds: true, meta: { type: 'tdd', work: 'feature', kind: 'api' } },
      }),
      op('patch-issue', { id: '07' }, { type: 'Task', labels_add: ['x'] }),
      op('upsert-comment', { id: '07', kind: 'spec-rev' }, {
        mode: 'append-spec-rev', entry: { at: '2026-09-30T10:00:00Z', event: 'edit', hash: 'sha256:a', chars: 10 },
      }),
    ];
    for (const o of ok) {
      const r = outbox.validateOp(o);
      assert.equal(r.ok, true, `${o.kind}: ${r.error}`);
    }
  });
});

describe('opKey() / targetKey()', () => {
  test('2a. opKey is stable across payload and target key order', () => {
    const a = op('patch-body', { id: '07' }, { mode: 'managed', sections: { a: '1', b: '2' } });
    const b = op('patch-body', { id: '07' }, { sections: { b: '2', a: '1' }, mode: 'managed' });
    assert.equal(outbox.opKey(a), outbox.opKey(b));
    assert.match(outbox.opKey(a), /^sha256:[0-9a-f]{64}$/);
    const t1 = op('upsert-comment', { id: '07', kind: 'summary' }, { text: 'x', mode: 'replace' });
    const t2 = op('upsert-comment', { kind: 'summary', id: '07' }, { text: 'x', mode: 'replace' });
    assert.equal(outbox.opKey(t1), outbox.opKey(t2));
    assert.equal(outbox.targetKey({ id: '07', kind: 's' }), outbox.targetKey({ kind: 's', id: '07' }));
  });

  test('2b. opKey differs when the payload, target or kind differs', () => {
    const a = patchBody('07', { a: '1' });
    assert.notEqual(outbox.opKey(a), outbox.opKey(patchBody('07', { a: '2' })));
    assert.notEqual(outbox.opKey(a), outbox.opKey(patchBody('08', { a: '1' })));
    const k1 = op('patch-issue', { id: '07' }, { state: 'closed' });
    const k2 = op('patch-body', { id: '07' }, { mode: 'replace', body: 'closed' });
    assert.notEqual(outbox.opKey(k1), outbox.opKey(k2));
  });
});

describe('repoKey()', () => {
  test('3. equals awareness-store.repoKey for a real and a vanished directory', () => {
    assert.equal(outbox.repoKey(root), awareness.repoKey(root));
    const gone = path.join(tmp, 'does-not-exist');
    assert.equal(outbox.repoKey(gone), awareness.repoKey(gone));
    assert.match(outbox.repoKey(root), /^proj-[0-9a-f]{8}$/);
  });
});

// ─── Journal ──────────────────────────────────────────────────────────────────

describe('journalPath() / stateDir()', () => {
  test('4a. honours DEVFLOW_OUTBOX_DIR', () => {
    assert.equal(outbox.stateDir({ DEVFLOW_OUTBOX_DIR: '/x' }), '/x');
    assert.equal(outbox.journalPath(root), path.join(stateDir, `${outbox.repoKey(root)}.json`));
    assert.equal(
      outbox.journalPath(root, { env: { DEVFLOW_OUTBOX_DIR: '/elsewhere' } }),
      path.join('/elsewhere', `${outbox.repoKey(root)}.json`),
    );
  });

  test('4b. without the override uses $HOME/.claude/devflow/state/outbox', () => {
    const home = path.join(tmp, 'home');
    assert.equal(outbox.stateDir({}, home), path.join(home, '.claude', 'devflow', 'state', 'outbox'));
    assert.equal(
      outbox.journalPath(root, { env: {}, home }),
      path.join(home, '.claude', 'devflow', 'state', 'outbox', `${outbox.repoKey(root)}.json`),
    );
    delete process.env.DEVFLOW_OUTBOX_DIR; // HOME is already a temp dir (beforeEach)
    assert.equal(
      outbox.journalPath(root),
      path.join(os.homedir(), '.claude', 'devflow', 'state', 'outbox', `${outbox.repoKey(root)}.json`),
    );
    assert.ok(outbox.journalPath(root).startsWith(tmp), 'HOME override keeps the path hermetic');
  });

  test('4c. nothing is written inside the project', () => {
    outbox.enqueue(root, [VALID['link-sub-issue']], { now: T0 });
    assert.deepEqual(fs.readdirSync(path.join(root, '.planning')), ['config.json']);
    assert.deepEqual(fs.readdirSync(root), ['.planning']);
  });
});

describe('enqueue()', () => {
  test('5a. assigns seq 1,2,3, status pending and queued_at from now', () => {
    const a = patchBody('07', { a: '1' });
    const b = link('07', '07-01');
    const c = op('patch-issue', { id: '07' }, { state: 'closed' });
    const r = outbox.enqueue(root, [a, b, c], { now: T0 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.enqueued, [1, 2, 3]);
    assert.deepEqual(r.coalesced, []);
    const j = readRaw();
    assert.equal(j.version, 1);
    assert.equal(j.repo, 'o/r');
    assert.equal(j.next_seq, 4);
    assert.equal(j.halted, null);
    assert.deepEqual(j.writes, []);
    assert.deepEqual(j.ops.map((o) => o.seq), [1, 2, 3]);
    for (const o of j.ops) {
      assert.equal(o.status, 'pending');
      assert.equal(o.attempts, 0);
      assert.equal(o.last_error, null);
      assert.equal(o.retry_after, null);
      assert.equal(o.done_at, null);
      assert.equal(o.base, null);
      assert.equal(o.queued_at, new Date(T0).toISOString());
      assert.match(o.key, /^sha256:/);
    }
    assert.equal(j.ops[0].key, outbox.opKey(a));
    assert.deepEqual(j.ops[2].payload, { state: 'closed' });
  });

  test('5b. continues numbering across calls and treats an omitted payload as {}', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    const r = outbox.enqueue(root, [{ kind: 'link-sub-issue', target: { parent: '07', child: '07-01' } }], { now: T0 + 5 });
    assert.deepEqual(r.enqueued, [2]);
    assert.deepEqual(readRaw().ops[1].payload, {});
  });

  test('5c. is all-or-nothing: one invalid op writes nothing', () => {
    const r = outbox.enqueue(root, [patchBody('07', { a: '1' }), op('patch-issue', { id: '07' }, {})], { now: T0 });
    assert.equal(r.ok, false);
    assert.equal(r.invalid.length, 1);
    assert.equal(r.invalid[0].index, 1);
    assert.equal(fs.existsSync(outbox.journalPath(root)), false);
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    const before = fs.readFileSync(outbox.journalPath(root), 'utf8');
    const r2 = outbox.enqueue(root, [patchBody('08', { a: '1' }), op('nope', {}, {})], { now: T0 + 1 });
    assert.equal(r2.ok, false);
    assert.equal(fs.readFileSync(outbox.journalPath(root), 'utf8'), before);
  });

  test('5d. an empty op list is a no-op and creates no journal', () => {
    const r = outbox.enqueue(root, [], { now: T0 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.enqueued, []);
    assert.equal(fs.existsSync(outbox.journalPath(root)), false);
  });

  test('6a. coalesces a pending op with the same kind+target: original seq, latest payload', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' }), link('07', '07-01')], { now: T0 });
    const r = outbox.enqueue(root, [patchBody('07', { b: '2' })], { now: T0 + 1000 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.enqueued, []);
    assert.deepEqual(r.coalesced, [1]);
    const j = readRaw();
    assert.equal(j.ops.length, 2);
    assert.equal(j.ops[0].seq, 1);
    assert.deepEqual(j.ops[0].payload, { mode: 'managed', sections: { b: '2' } });
    assert.equal(j.ops[0].key, outbox.opKey(patchBody('07', { b: '2' })));
    assert.equal(j.ops[0].queued_at, new Date(T0).toISOString(), 'queue position and time are kept');
    assert.equal(j.next_seq, 3);
  });

  test('6b. coalesces inside one enqueue batch', () => {
    const r = outbox.enqueue(root, [patchBody('07', { a: '1' }), patchBody('07', { a: '2' })], { now: T0 });
    assert.deepEqual(r.enqueued, [1]);
    assert.deepEqual(r.coalesced, [1]);
    const j = readRaw();
    assert.equal(j.ops.length, 1);
    assert.deepEqual(j.ops[0].payload.sections, { a: '2' });
  });

  test('6c. a blocked op with the same target is NOT replaced (a new op is appended)', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    outbox.markBlocked(root, 1, 'permission denied', { now: T0 });
    const r = outbox.enqueue(root, [patchBody('07', { a: '2' })], { now: T0 + 1 });
    assert.deepEqual(r.enqueued, [2]);
    assert.deepEqual(r.coalesced, []);
    const j = readRaw();
    assert.equal(j.ops.length, 2);
    assert.equal(j.ops[0].status, 'blocked');
    assert.deepEqual(j.ops[0].payload.sections, { a: '1' });
    assert.equal(j.ops[1].status, 'pending');
  });

  test('6d. a done op with the same target is not reused either', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    outbox.markDone(root, 1, { now: T0 });
    const r = outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 + 1 });
    assert.deepEqual(r.enqueued, [2]);
  });

  test('6e. different targets or kinds never coalesce', () => {
    const r = outbox.enqueue(root, [
      op('upsert-comment', { id: '07', kind: 'summary' }, { text: 'a', mode: 'replace' }),
      op('upsert-comment', { id: '07', kind: 'scope' }, { text: 'a', mode: 'replace' }),
      patchBody('07', { a: '1' }),
      patchBody('08', { a: '1' }),
    ], { now: T0 });
    assert.deepEqual(r.enqueued, [1, 2, 3, 4]);
    assert.deepEqual(r.coalesced, []);
  });

  test('7a. github.enabled false: {skipped:true}, nothing is created', () => {
    writeConfig({ github: { enabled: false, repo: 'o/r' } });
    const r = outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    assert.equal(r.skipped, true);
    assert.match(r.reason, /github\.enabled/);
    assert.deepEqual(r.enqueued, []);
    assert.equal(fs.existsSync(outbox.journalPath(root)), false);
    assert.equal(fs.existsSync(stateDir), false);
  });

  test('7b. isEnabled is false for a missing config, bad JSON and a non-true value', () => {
    assert.equal(outbox.isEnabled(root), true);
    fs.rmSync(path.join(root, '.planning', 'config.json'));
    assert.equal(outbox.isEnabled(root), false);
    assert.equal(outbox.enqueue(root, [link('07', '07-01')], { now: T0 }).skipped, true);
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), '{ not json');
    assert.equal(outbox.isEnabled(root), false);
    writeConfig({ github: { enabled: 'true' } });
    assert.equal(outbox.isEnabled(root), false);
    writeConfig({});
    assert.equal(outbox.isEnabled(root), false);
    assert.equal(fs.existsSync(stateDir), false);
  });
});

describe('nextOp()', () => {
  test('8a. returns ops strictly in seq order, never past an earlier pending op', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' }), patchBody('08', { a: '1' }), patchBody('09', { a: '1' })], { now: T0 });
    assert.equal(outbox.nextOp(root, { now: T0 }).op.seq, 1);
    outbox.markDone(root, 1, { now: T0 });
    assert.equal(outbox.nextOp(root, { now: T0 }).op.seq, 2);
    // op 2 fails and stays pending: op 3 must not leapfrog it
    outbox.markPending(root, 2, { error: 'offline' }, { now: T0 });
    const r = outbox.nextOp(root, { now: T0 });
    assert.equal(r.op.seq, 2);
    assert.equal(r.halted, null);
    outbox.markDone(root, 2, { now: T0 });
    outbox.markDone(root, 3, { now: T0 });
    const end = outbox.nextOp(root, { now: T0 });
    assert.equal(end.op, null);
    assert.equal(end.halted, null);
    assert.equal(end.reason, 'empty');
  });

  test('8b. a blocked op stops the queue: null with halted reason blocked', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' }), patchBody('08', { a: '1' }), patchBody('09', { a: '1' })], { now: T0 });
    outbox.markDone(root, 1, { now: T0 });
    outbox.markBlocked(root, 2, '403 permission denied', { now: T0 });
    const r = outbox.nextOp(root, { now: T0 });
    assert.equal(r.op, null);
    assert.equal(r.halted.reason, 'blocked');
    assert.equal(r.halted.seq, 2);
    assert.deepEqual(r.halted.target, { id: '08' });
    assert.equal(r.halted.detail, '403 permission denied');
  });

  test('8c. a journal with halted set returns no op until cleared', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    const halted = { reason: 'remote-edit', seq: 1, target: { id: '07' }, detail: 'body changed on GitHub' };
    assert.equal(outbox.setHalted(root, halted).ok, true);
    const r = outbox.nextOp(root, { now: T0 });
    assert.equal(r.op, null);
    assert.deepEqual(r.halted, halted);
    assert.equal(r.reason, 'halted');
    assert.equal(outbox.clearHalted(root).ok, true);
    assert.equal(outbox.nextOp(root, { now: T0 }).op.seq, 1);
    assert.equal(readRaw().halted, null);
  });

  test('8d. a pending op with a future retry_after is withheld with wait_ms, unless ignored', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' }), patchBody('08', { a: '1' })], { now: T0 });
    outbox.markPending(root, 1, { error: 'rate limited', retry_after: T0 + 60000 }, { now: T0 });
    const r = outbox.nextOp(root, { now: T0 + 10000 });
    assert.equal(r.op, null);
    assert.equal(r.reason, 'retry_after');
    assert.equal(r.wait_ms, 50000);
    assert.equal(outbox.nextOp(root, { now: T0 + 60000 }).op.seq, 1);
    assert.equal(outbox.nextOp(root, { now: T0 + 10000, ignoreRetryAfter: true }).op.seq, 1);
  });

  test('8e. an empty or missing journal yields no op and creates nothing', () => {
    const r = outbox.nextOp(root, { now: T0 });
    assert.equal(r.op, null);
    assert.equal(r.reason, 'empty');
    assert.equal(fs.existsSync(stateDir), false);
  });
});

describe('mark*, dropOp, setHalted and status()', () => {
  test('9a. markDone sets status, done_at and clears the error state', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    outbox.markPending(root, 1, { error: 'boom', retry_after: T0 + 5 }, { now: T0 });
    const r = outbox.markDone(root, 1, { now: T0 + 1000 });
    assert.equal(r.ok, true);
    const o = readRaw().ops[0];
    assert.equal(o.status, 'done');
    assert.equal(o.done_at, new Date(T0 + 1000).toISOString());
    assert.equal(o.last_error, null);
    assert.equal(o.retry_after, null);
  });

  test('9b. markPending increments attempts and records error and retry_after', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    outbox.markPending(root, 1, { error: 'offline', retry_after: T0 + 100 }, { now: T0 });
    outbox.markPending(root, 1, { error: 'offline again' }, { now: T0 });
    const o = readRaw().ops[0];
    assert.equal(o.status, 'pending');
    assert.equal(o.attempts, 2);
    assert.equal(o.last_error, 'offline again');
    assert.equal(o.retry_after, null);
  });

  test('9c. markBlocked records the reason; dropOp removes an op', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' }), patchBody('08', { a: '1' })], { now: T0 });
    assert.equal(outbox.markBlocked(root, 1, 'validation failed', { now: T0 }).ok, true);
    const o = readRaw().ops[0];
    assert.equal(o.status, 'blocked');
    assert.equal(o.last_error, 'validation failed');
    const d = outbox.dropOp(root, 1);
    assert.equal(d.ok, true);
    assert.deepEqual(readRaw().ops.map((x) => x.seq), [2]);
    assert.equal(readRaw().next_seq, 3, 'seq numbers are never reused');
  });

  test('9d. an unknown seq is refused without writing', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    const before = fs.readFileSync(outbox.journalPath(root), 'utf8');
    for (const r of [
      outbox.markDone(root, 99, { now: T0 }),
      outbox.markPending(root, 99, { error: 'x' }, { now: T0 }),
      outbox.markBlocked(root, 99, 'x', { now: T0 }),
      outbox.dropOp(root, 99),
    ]) {
      assert.equal(r.ok, false);
      assert.match(r.error, /99/);
    }
    assert.equal(fs.readFileSync(outbox.journalPath(root), 'utf8'), before);
  });

  test('9e. setHalted validates its reason', () => {
    outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    assert.equal(outbox.setHalted(root, { reason: 'vibes', seq: 1 }).ok, false);
    assert.equal(outbox.setHalted(root, { reason: 'blocked', seq: 1, target: { id: '07' }, detail: 'd' }).ok, true);
    assert.equal(readRaw().halted.reason, 'blocked');
  });

  test('9f. status() counts pending, blocked, done and halted', () => {
    outbox.enqueue(root, [
      patchBody('07', { a: '1' }), patchBody('08', { a: '1' }), patchBody('09', { a: '1' }), patchBody('10', { a: '1' }),
    ], { now: T0 });
    outbox.markDone(root, 1, { now: T0 });
    outbox.markBlocked(root, 2, 'nope', { now: T0 });
    const s = outbox.status(root, { now: T0 });
    assert.equal(s.pending, 2);
    assert.equal(s.blocked, 1);
    assert.equal(s.done, 1);
    assert.equal(s.repo, 'o/r');
    assert.equal(s.recovered, null);
    assert.equal(s.halted.reason, 'blocked', 'a blocked head op reads as halted');
    assert.equal(s.halted.seq, 2);
    assert.deepEqual(s.queue.map((q) => q.seq), [2, 3, 4]);
    assert.equal(s.queue[0].last_error, 'nope');
    outbox.dropOp(root, 2);
    const s2 = outbox.status(root, { now: T0 });
    assert.equal(s2.blocked, 0);
    assert.equal(s2.halted, null);
    outbox.setHalted(root, { reason: 'remote-edit', seq: 3, target: { id: '09' }, detail: 'edited' });
    assert.equal(outbox.status(root, { now: T0 }).halted.reason, 'remote-edit');
  });

  test('9g. status() on a project that never enqueued reports zeros and creates nothing', () => {
    const s = outbox.status(root, { now: T0 });
    assert.deepEqual([s.pending, s.blocked, s.done], [0, 0, 0]);
    assert.equal(s.halted, null);
    assert.equal(s.recovered, null);
    assert.equal(fs.existsSync(stateDir), false);
  });
});

describe('corrupt journal recovery', () => {
  function corrupt(content) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(outbox.journalPath(root), content);
  }

  test('10a. unparseable JSON is renamed to .corrupt-<ts> and an empty journal is returned', () => {
    corrupt('{"version":1,"ops":[{"seq":1,');
    const r = outbox.readJournal(root, { now: T0 });
    assert.deepEqual(r.journal.ops, []);
    assert.equal(r.journal.next_seq, 1);
    assert.ok(r.recovered);
    assert.equal(r.recovered.corrupt_path, `${outbox.journalPath(root)}.corrupt-${T0}`);
    assert.equal(fs.readFileSync(r.recovered.corrupt_path, 'utf8'), '{"version":1,"ops":[{"seq":1,');
    assert.equal(fs.existsSync(outbox.journalPath(root)), false);
  });

  test('10b. status() names the recovered file, also after a plain readJournal already renamed it', () => {
    corrupt('garbage');
    outbox.readJournal(root, { now: T0 });
    const s = outbox.status(root, { now: T0 + 1 });
    assert.ok(s.recovered);
    assert.equal(s.recovered.corrupt_path, `${outbox.journalPath(root)}.corrupt-${T0}`);
  });

  test('10c. status() is the first reader: it renames and reports in one call', () => {
    corrupt('');
    const s = outbox.status(root, { now: T0 });
    assert.equal(s.recovered.corrupt_path, `${outbox.journalPath(root)}.corrupt-${T0}`);
    assert.equal(s.pending, 0);
  });

  test('10d. valid JSON of the wrong shape is also corrupt, never silently replaced', () => {
    corrupt('[]');
    const r = outbox.readJournal(root, { now: T0 });
    assert.ok(r.recovered);
    assert.equal(fs.readFileSync(r.recovered.corrupt_path, 'utf8'), '[]');
    corrupt(JSON.stringify({ version: 1, ops: 'nope' }));
    const r2 = outbox.readJournal(root, { now: T0 + 1 });
    assert.ok(r2.recovered);
  });

  test('10e. enqueue after corruption starts fresh and keeps the corrupt file', () => {
    corrupt('garbage');
    const r = outbox.enqueue(root, [patchBody('07', { a: '1' })], { now: T0 });
    assert.deepEqual(r.enqueued, [1]);
    assert.ok(fs.existsSync(`${outbox.journalPath(root)}.corrupt-${T0}`));
    assert.equal(readRaw().ops.length, 1);
  });

  test('10f. a missing journal is not corruption', () => {
    const r = outbox.readJournal(root, { now: T0 });
    assert.equal(r.recovered, null);
    assert.deepEqual(r.journal.ops, []);
    assert.equal(fs.existsSync(stateDir), false);
  });
});

describe('done-op pruning', () => {
  test('11. writeJournal keeps the newest 200 done ops and never prunes pending ones', () => {
    const { journal } = outbox.readJournal(root, { now: T0 });
    for (let i = 1; i <= 250; i++) {
      journal.ops.push({
        seq: i, key: `sha256:${i}`, kind: 'link-sub-issue', target: { parent: '07', child: `07-${i}` }, payload: {},
        base: null, status: 'done', attempts: 1, last_error: null, retry_after: null,
        queued_at: new Date(T0).toISOString(), done_at: new Date(T0).toISOString(),
      });
    }
    journal.ops.push({
      seq: 251, key: 'sha256:p', kind: 'patch-body', target: { id: '07' }, payload: { mode: 'managed', sections: {} },
      base: null, status: 'pending', attempts: 0, last_error: null, retry_after: null,
      queued_at: new Date(T0).toISOString(), done_at: null,
    });
    journal.next_seq = 252;
    outbox.writeJournal(root, journal);
    const j = readRaw();
    const done = j.ops.filter((o) => o.status === 'done');
    assert.equal(done.length, 200);
    assert.equal(done[0].seq, 51);
    assert.equal(done[199].seq, 250);
    assert.equal(j.ops.filter((o) => o.status === 'pending').length, 1);
    assert.equal(j.next_seq, 252);
    assert.equal(outbox.status(root, { now: T0 }).done, 200);
  });
});
