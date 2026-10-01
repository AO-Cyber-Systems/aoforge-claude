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

const { spawn, execFileSync } = require('child_process');

const T0 = Date.UTC(2026, 8, 30, 10, 0, 0); // 2026-09-30T10:00:00Z
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Hygiene guard (test 16): the REAL outbox dir, taken before any test runs. os.userInfo().homedir
// ignores $HOME, so the suite's HOME override cannot hide a leak into it.
const REAL_OUTBOX = path.join(os.userInfo().homedir, '.claude', 'devflow', 'state', 'outbox');
function snapshotDir(dir) {
  try {
    return fs.readdirSync(dir).sort().map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return `${name}:${st.size}:${st.mtimeMs}`;
    });
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}
const REAL_OUTBOX_BEFORE = snapshotDir(REAL_OUTBOX);

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

// ─── Lock and budget ──────────────────────────────────────────────────────────

/** A journal object with exactly these write timestamps. */
function journalWith(writes) {
  return { version: 1, repo: null, ops: [], halted: null, next_seq: 1, writes };
}

describe('acquireLock()', () => {
  test('12a. a second acquire is refused while the first is held; release() frees it', () => {
    const a = outbox.acquireLock(root, { now: T0, pid: 111 });
    assert.equal(a.ok, true);
    assert.equal(a.stale_replaced, false);
    assert.equal(typeof a.release, 'function');
    assert.ok(fs.existsSync(outbox.lockPath(root)));

    const b = outbox.acquireLock(root, { now: T0 + 1000, pid: 222 });
    assert.equal(b.ok, false);
    assert.equal(b.running, true);
    assert.equal(b.owner.pid, 111);
    assert.equal(b.owner.at, T0);

    a.release();
    assert.equal(fs.existsSync(outbox.lockPath(root)), false);
    const c = outbox.acquireLock(root, { now: T0 + 2000, pid: 222 });
    assert.equal(c.ok, true);
    assert.equal(c.stale_replaced, false);
    c.release();
  });

  test('12b. a lock older than 10 minutes is stale and replaced; exactly 10 minutes is not', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(outbox.lockPath(root), JSON.stringify({ pid: 4242, at: T0 }));
    const held = outbox.acquireLock(root, { now: T0 + 10 * MIN, pid: 7 });
    assert.equal(held.ok, false);
    assert.equal(held.running, true);
    const r = outbox.acquireLock(root, { now: T0 + 10 * MIN + 1, pid: 7 });
    assert.equal(r.ok, true);
    assert.equal(r.stale_replaced, true);
    const owner = JSON.parse(fs.readFileSync(outbox.lockPath(root), 'utf8'));
    assert.equal(owner.pid, 7);
    assert.equal(owner.at, T0 + 10 * MIN + 1);
    // no stray quarantine files are left behind
    assert.deepEqual(fs.readdirSync(stateDir), [path.basename(outbox.lockPath(root))]);
    r.release();
  });

  test('12c. staleMs is configurable and `at` may be an ISO string', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(outbox.lockPath(root), JSON.stringify({ pid: 4242, at: new Date(T0).toISOString() }));
    assert.equal(outbox.acquireLock(root, { now: T0 + 5000, staleMs: 10000 }).ok, false);
    const r = outbox.acquireLock(root, { now: T0 + 10001, staleMs: 10000 });
    assert.equal(r.ok, true);
    assert.equal(r.stale_replaced, true);
  });

  test('12d. an unparseable lock file falls back to its mtime for staleness', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const lock = outbox.lockPath(root);
    fs.writeFileSync(lock, '');
    const fresh = outbox.acquireLock(root, { now: Date.now() });
    assert.equal(fresh.ok, false, 'a just-created empty lock is a flusher mid-start, not stale');
    assert.equal(fresh.running, true);
    const old = new Date(Date.now() - 11 * MIN);
    fs.utimesSync(lock, old, old);
    const r = outbox.acquireLock(root, { now: Date.now() });
    assert.equal(r.ok, true);
    assert.equal(r.stale_replaced, true);
  });

  test('12e. release() removes the lock only while it still holds our pid and token', () => {
    const a = outbox.acquireLock(root, { now: T0, pid: 111 });
    // the lock went stale and another flusher took it over
    fs.writeFileSync(outbox.lockPath(root), JSON.stringify({ pid: 222, at: T0 + 1, token: 'other' }));
    a.release();
    assert.ok(fs.existsSync(outbox.lockPath(root)), 'must not remove another flusher lock');
    a.release(); // and is idempotent
    assert.ok(fs.existsSync(outbox.lockPath(root)));
  });

  test('12f. creates the state dir when it does not exist', () => {
    assert.equal(fs.existsSync(stateDir), false);
    const r = outbox.acquireLock(root, { now: T0 });
    assert.equal(r.ok, true);
    assert.ok(fs.existsSync(stateDir));
    r.release();
  });

  test('12g. of five processes racing for the lock exactly one wins (O_EXCL)', async () => {
    const script = `
      const o = require(${JSON.stringify(path.join(__dirname, 'gh-outbox.cjs'))});
      const r = o.acquireLock(${JSON.stringify(root)}, { now: ${T0} });
      process.stdout.write(r.ok ? 'won' : 'lost');
    `;
    const run = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script], { env: { ...process.env } });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`child exited ${code}`))));
    });
    const results = await Promise.all([run(), run(), run(), run(), run()]);
    assert.equal(results.filter((r) => r === 'won').length, 1, results.join(','));
    assert.equal(results.filter((r) => r === 'lost').length, 4, results.join(','));
  });
});

describe('budgetCheck() / recordWrite()', () => {
  test('13a. 79 writes in the last 60 s is ok; 80 refuses with a wait that ages out the oldest', () => {
    const ok = outbox.budgetCheck(journalWith(Array.from({ length: 79 }, (_, i) => T0 - 1000 - i * 500)), T0);
    assert.equal(ok.ok, true);
    assert.equal(ok.minute, 79);

    const writes = Array.from({ length: 80 }, (_, i) => T0 - 100 - i * 500); // oldest = T0 - 39600
    const r = outbox.budgetCheck(journalWith(writes), T0);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'minute');
    assert.equal(r.wait_ms, 20400);
    assert.equal(outbox.budgetCheck(journalWith(writes), T0 + r.wait_ms).ok, true, 'ok again once the oldest ages out');
    assert.equal(outbox.budgetCheck(journalWith(writes), T0 + r.wait_ms - 1).ok, false);
  });

  test('13b. a write exactly 60 s old has aged out of the minute window', () => {
    const writes = [T0 - MIN, ...Array.from({ length: 79 }, (_, i) => T0 - 1000 - i * 100)];
    const r = outbox.budgetCheck(journalWith(writes), T0);
    assert.equal(r.ok, true);
    assert.equal(r.minute, 79);
  });

  test('13c. 449 writes in the last hour is ok; 450 stops with reason hour', () => {
    const spread = (n) => Array.from({ length: n }, (_, i) => T0 - i * 7000); // 449 * 7 s = 52 min
    const ok = outbox.budgetCheck(journalWith(spread(449)), T0);
    assert.equal(ok.ok, true);
    assert.equal(ok.hour, 449);
    const r = outbox.budgetCheck(journalWith(spread(450)), T0);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'hour');
    assert.equal(r.wait_ms, T0 - 449 * 7000 + HOUR - T0);
  });

  test('13d. when both windows are full the hour (the stop) is reported', () => {
    const r = outbox.budgetCheck(journalWith(Array.from({ length: 450 }, () => T0 - 1000)), T0);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'hour');
  });

  test('13e. writes older than an hour never count', () => {
    const old = Array.from({ length: 600 }, (_, i) => T0 - HOUR - 1000 - i);
    const r = outbox.budgetCheck(journalWith(old), T0);
    assert.equal(r.ok, true);
    assert.equal(r.hour, 0);
  });

  test('13f. budgetCheck does not mutate the journal', () => {
    const j = journalWith([T0 - 2 * HOUR, T0 - 10]);
    outbox.budgetCheck(j, T0);
    assert.deepEqual(j.writes, [T0 - 2 * HOUR, T0 - 10]);
  });

  test('13g. recordWrite appends, mutates and returns the journal, and prunes writes older than 1 h', () => {
    const j = journalWith([T0 - 2 * HOUR, T0 - HOUR - 1, T0 - HOUR + 1000, T0 - 10]);
    const r = outbox.recordWrite(j, T0);
    assert.equal(r, j);
    assert.deepEqual(j.writes, [T0 - HOUR + 1000, T0 - 10, T0]);
  });

  test('13h. the budget survives a persist and reload, across processes', () => {
    outbox.enqueue(root, [link('07', '07-01')], { now: T0 });
    const { journal } = outbox.readJournal(root, { now: T0 });
    for (let i = 0; i < 80; i++) outbox.recordWrite(journal, T0 - i * 100);
    outbox.writeJournal(root, journal);
    const reread = outbox.readJournal(root, { now: T0 }).journal;
    assert.equal(outbox.budgetCheck(reread, T0).reason, 'minute');
    assert.deepEqual(outbox.status(root, { now: T0 }).writes, { minute: 80, hour: 80 });
  });
});

// ─── Base store and cache index ───────────────────────────────────────────────

const BASE = {
  issue_number: 12, issue_id: 1000012, body_hash: 'sha256:abc', updated_at: '2026-09-30T10:00:00Z',
};

describe('base store', () => {
  test('14a. setBase / getBase round-trip; readBase on a missing file is {}', () => {
    assert.deepEqual(outbox.readBase(root), {});
    assert.equal(outbox.getBase(root, '07-01'), null);
    assert.equal(fs.existsSync(stateDir), false, 'reading creates nothing');
    assert.equal(outbox.setBase(root, '07-01', BASE).ok, true);
    assert.deepEqual(outbox.getBase(root, '07-01'), BASE);
    assert.deepEqual(outbox.readBase(root), { '07-01': BASE });
    assert.equal(outbox.getBase(root, '07-02'), null);
  });

  test('14b. entries for other issues are kept; the same id is overwritten', () => {
    outbox.setBase(root, '07-01', BASE);
    outbox.setBase(root, '07', { ...BASE, issue_number: 3, issue_id: 1000003 });
    outbox.setBase(root, '07-01', { ...BASE, body_hash: 'sha256:new' });
    const all = outbox.readBase(root);
    assert.deepEqual(Object.keys(all).sort(), ['07', '07-01']);
    assert.equal(all['07-01'].body_hash, 'sha256:new');
    assert.equal(all['07'].issue_number, 3);
  });

  test('14c. lives at <repoKey>.base.json beside the journal and stores exactly four fields', () => {
    outbox.setBase(root, '07-01', { ...BASE, extra: 'dropped' });
    const file = path.join(stateDir, `${outbox.repoKey(root)}.base.json`);
    assert.ok(fs.existsSync(file));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { '07-01': BASE });
  });

  test('14d. an invalid entry is refused without writing', () => {
    const bad = [
      ['07-01', { ...BASE, issue_number: '12' }],
      ['07-01', { ...BASE, issue_number: 0 }],
      ['07-01', { ...BASE, issue_id: 'abc' }],
      ['07-01', { ...BASE, body_hash: '' }],
      ['07-01', { ...BASE, updated_at: 5 }],
      [12, BASE],
      ['07-01', null],
    ];
    for (const [id, entry] of bad) {
      assert.equal(outbox.setBase(root, id, entry).ok, false, JSON.stringify([id, entry]));
    }
    assert.equal(fs.existsSync(stateDir), false);
    // updated_at may be null (a freshly created issue not yet re-read)
    assert.equal(outbox.setBase(root, '07-01', { ...BASE, updated_at: null }).ok, true);
  });

  test('14e. a corrupt base file is renamed aside and reads as {}', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const file = path.join(stateDir, `${outbox.repoKey(root)}.base.json`);
    fs.writeFileSync(file, '{ nope');
    assert.deepEqual(outbox.readBase(root, { now: T0 }), {});
    assert.equal(fs.readFileSync(`${file}.corrupt-${T0}`, 'utf8'), '{ nope');
    assert.equal(outbox.setBase(root, '07-01', BASE, { now: T0 }).ok, true);
    assert.deepEqual(outbox.getBase(root, '07-01'), BASE);
  });
});

describe('cache index', () => {
  const INDEX = {
    'objectives/07-store-demo/OBJECTIVE.md': 'sha256:aaa',
    'objectives/07-store-demo/07-01-TRD.md': 'sha256:bbb',
  };

  test('15a. writeCacheIndex / readCacheIndex round-trip; missing is {}', () => {
    assert.deepEqual(outbox.readCacheIndex(root), {});
    assert.equal(outbox.writeCacheIndex(root, INDEX).ok, true);
    assert.deepEqual(outbox.readCacheIndex(root), INDEX);
    assert.ok(fs.existsSync(path.join(stateDir, `${outbox.repoKey(root)}.cache.json`)));
  });

  test('15b. a write replaces the whole index', () => {
    outbox.writeCacheIndex(root, INDEX);
    outbox.writeCacheIndex(root, { 'a.md': 'sha256:1' });
    assert.deepEqual(outbox.readCacheIndex(root), { 'a.md': 'sha256:1' });
  });

  test('15c. a non-object index or non-string hash is refused without writing', () => {
    assert.equal(outbox.writeCacheIndex(root, null).ok, false);
    assert.equal(outbox.writeCacheIndex(root, []).ok, false);
    assert.equal(outbox.writeCacheIndex(root, { 'a.md': 5 }).ok, false);
    assert.equal(fs.existsSync(stateDir), false);
  });

  test('15d. a corrupt cache index is renamed aside and reads as {}', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const file = path.join(stateDir, `${outbox.repoKey(root)}.cache.json`);
    fs.writeFileSync(file, '[1,2');
    assert.deepEqual(outbox.readCacheIndex(root, { now: T0 }), {});
    assert.ok(fs.existsSync(`${file}.corrupt-${T0}`));
  });

  test('15e. base, cache and journal share one dir and one key without colliding', () => {
    outbox.enqueue(root, [link('07', '07-01')], { now: T0 });
    outbox.setBase(root, '07-01', BASE);
    outbox.writeCacheIndex(root, INDEX);
    const key = outbox.repoKey(root);
    assert.deepEqual(fs.readdirSync(stateDir).sort(), [`${key}.base.json`, `${key}.cache.json`, `${key}.json`]);
  });
});

// ─── Hygiene ──────────────────────────────────────────────────────────────────

describe('hygiene', () => {
  test('16. the suite never touched the real ~/.claude/devflow/state/outbox', () => {
    assert.deepEqual(snapshotDir(REAL_OUTBOX), REAL_OUTBOX_BEFORE);
  });

  test('17a. gh-outbox.cjs requires only fs, os, path, crypto and ./sync-state.cjs', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-outbox.cjs'), 'utf8');
    const all = src.match(/\brequire\(/g) || [];
    const literal = [...src.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2]);
    assert.equal(literal.length, all.length, 'every require() takes a string literal');
    assert.deepEqual([...new Set(literal)].sort(), ['./sync-state.cjs', 'crypto', 'fs', 'os', 'path']);
    assert.ok(!/\bimport\s*\(/.test(src), 'no dynamic import()');
  });

  test('17b. loading the module pulls in none of the heavy modules a hook must avoid', () => {
    const script = `
      require(${JSON.stringify(path.join(__dirname, 'gh-outbox.cjs'))});
      process.stdout.write(Object.keys(require.cache).map((f) => require('path').basename(f)).join(','));
    `;
    const loaded = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).split(',');
    for (const heavy of ['gh-client.cjs', 'helpers.cjs', 'upgrade.cjs', 'awareness-store.cjs', 'gh-mapping.cjs']) {
      assert.ok(!loaded.includes(heavy), `${heavy} must not be loaded; got ${loaded.join(',')}`);
    }
    assert.ok(loaded.includes('sync-state.cjs'));
  });
});

// ─── Base store extensions for the flusher (TRD 47-07, D-24) ──────────────────

describe('base store: managed_hash, frozen and comment keys (47-07)', () => {
  test('14f. managed_hash and frozen are stored when given, in a fixed order, and omitted when not', () => {
    outbox.setBase(root, '7', { ...BASE, managed_hash: 'sha256:managed' });
    assert.deepEqual(outbox.getBase(root, '7'), { ...BASE, managed_hash: 'sha256:managed' });
    outbox.setBase(root, '7-01', { ...BASE, managed_hash: null, frozen: true });
    assert.deepEqual(outbox.getBase(root, '7-01'), { ...BASE, managed_hash: null, frozen: true });
    // a plain entry still stores exactly the original four fields
    outbox.setBase(root, '7-02', BASE);
    assert.deepEqual(Object.keys(outbox.getBase(root, '7-02')), ['issue_number', 'issue_id', 'body_hash', 'updated_at']);
    // frozen: false is the same as absent
    outbox.setBase(root, '7-03', { ...BASE, frozen: false });
    assert.equal(Object.hasOwn(outbox.getBase(root, '7-03'), 'frozen'), false);
  });

  test('14g. a malformed managed_hash or frozen is refused without writing', () => {
    for (const entry of [
      { ...BASE, managed_hash: 5 },
      { ...BASE, managed_hash: '' },
      { ...BASE, frozen: 'yes' },
      { ...BASE, frozen: 1 },
    ]) {
      assert.equal(outbox.setBase(root, '7', entry).ok, false, JSON.stringify(entry));
    }
    assert.equal(fs.existsSync(stateDir), false);
  });

  test('14h. a comment base is keyed "<id>#<kind>"; a malformed key is refused', () => {
    assert.equal(outbox.setBase(root, '7-01#summary', BASE).ok, true);
    assert.equal(outbox.setBase(root, '7#verification', BASE).ok, true);
    assert.deepEqual(outbox.getBase(root, '7-01#summary'), BASE);
    for (const bad of ['7-01#', '#summary', '7-01#Summary', '7-01#sum mary', '7-01#a#b', '7 #summary']) {
      assert.equal(outbox.setBase(root, bad, BASE).ok, false, bad);
    }
  });
});
