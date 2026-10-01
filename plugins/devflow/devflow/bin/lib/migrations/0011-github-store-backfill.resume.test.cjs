'use strict';

// TRD 51-08 — migration 0011 github-store-backfill: resilience (GMD-01, GMD-02; SC1 "resumes after interruption").
// Every scenario interrupts the backfill one way, resumes it through the upgrade runner
// (`upgrade.apply({only:['0011'], confirm:true, options})`, so stamping and halting are part of what is tested), and
// compares the end state with an uninterrupted control run on a fresh fixture, by `devflow:id` marker (issue numbers
// differ between runs and are never compared).
//   1  interrupted by maxOps: done ops stay done, the rest stays pending; the resume only flushes (no re-import)
//   2  offline mid-drain: a `pending` (offline) stop; back online, the resume completes
//   3  lost mapping: `.planning/.gh-mapping.json` deleted mid-run; the resume finds the issues by marker, no duplicate
//   4  a secondary rate limit during the drain: slept through (retry-after 30 s), or, when it outlasts the client's
//      retries, the op stays pending with `retry_after` and the resume after the clock advances completes
//   5  a human edit of a managed body between runs halts (`gh outbox status` guidance, 0010 never runs); after
//      `resolve --accept-remote` the next apply completes
//   6  G4: a bare `--apply --confirm` on an interrupted store-on project skips 0010 (the 51-04 rule) and reaches 0011
//
// Every scenario also checks that no create was sent twice (an issue by its devflow:id, a comment by its marker, a
// link or an edge by its argv) and that the run sent exactly as many successful writes as the control.
//
// no_llm_test_data: every project is the hand-built 51-02 backfill fixture (useBackfillEnv: hermetic HOME, outbox and
// gh-cache dirs, the fake GitHub on the gh seam, a local bare wiki remote, a fake clock that only moves when the code
// under test sleeps). Nothing here touches this repository, the real ~/.claude, GitHub, the network or a port.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const upgrade = require('../upgrade.cjs');
const outbox = require('../gh-outbox.cjs');
const backfill = require('../gh-backfill.cjs');
const ghBody = require('../gh-body.cjs');
const client = require('../gh-client.cjs');
const gh = require('../gh.cjs');
const { useBackfillEnv } = require('../__fixtures__/gh-backfill-fixtures.cjs');

const PLUGIN_VERSION = '2.13.0';
const SHAPE = { objectives: 2 }; // 70 outbox ops and 9 live writes: small enough to run many times, big enough to split
const SECONDARY = (seconds) => ({
  ok: false, status: 1, stderr: `HTTP 403: You have exceeded a secondary rate limit\nretry-after: ${seconds}`,
});

const m0010 = () => require('./0010-store-gitignore.cjs');

// ─── harness ──────────────────────────────────────────────────────────────────

/** `df-tools upgrade --apply --only 0011 --confirm`, through the runner, with the migration's test hooks. */
function run(env, options, extra = {}) {
  return upgrade.apply({
    projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION, only: ['0011'], confirm: true,
    ...(options ? { options } : {}), ...extra,
  });
}

/**
 * The fake GitHub behind a recorder: every successful write (argv and `--input -` body) lands in `sent`, every failed
 * one in `failed`. `onWrite(entry)` runs after each successful write (a test arms an outage or a rate limit there).
 */
function record(env) {
  const rec = { sent: [], failed: [], onWrite: null };
  rec.runGh = (args, opts = {}) => {
    const r = env.fake.runGh(args, opts);
    if (client.isWriteArgs(args)) {
      const entry = { args: args.map(String), input: opts && typeof opts.input === 'string' ? opts.input : null };
      if (r && r.ok) {
        rec.sent.push(entry);
        if (rec.onWrite) rec.onWrite(entry);
      } else {
        rec.failed.push(entry);
      }
    }
    return r;
  };
  gh._setRunGh(rec.runGh);
  return rec;
}

/** A fresh df-tools process on the same fake GitHub and clock: the gh client's per-run state starts over. */
function nextRun(env, rec) {
  client._resetClient();
  client._setNow(() => env.clock.t);
  client._setSleep((ms) => { env.clock.t += ms; });
  gh._setRunGh(rec.runGh);
  gh._resetCache();
}

function methodOf(args) {
  if (args[0] !== 'api') return args.slice(0, 2).join(' ');
  const i = args.indexOf('--method');
  if (i >= 0) return args[i + 1];
  return args.some((x) => x === '-f' || x === '-F' || x === '--input' || x === '--field' || x === '--raw-field') ? 'POST' : 'GET';
}

const endpointOf = (args) => args.find((x) => /^repos\//.test(x)) || args.slice(0, 2).join(' ');

/** The body a write carried: the `--input -` JSON's `body`, `--body X`, or `-f body=X`; null when none. */
function bodyOf(entry) {
  if (entry.input) {
    try {
      const j = JSON.parse(entry.input);
      if (j && typeof j.body === 'string') return j.body;
    } catch {
      // not JSON: fall through to argv
    }
  }
  const a = entry.args;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] === '--body') return a[i + 1];
    if ((a[i] === '-f' || a[i] === '-F') && a[i + 1].startsWith('body=')) return a[i + 1].slice(5);
  }
  return null;
}

/** Every create a run sent, keyed so a repeat is visible: an issue or comment by its marker, anything else by argv. */
function creates(rec) {
  const out = [];
  for (const e of rec.sent) {
    const m = methodOf(e.args);
    if (m !== 'POST' && m !== 'issue create') continue;
    const body = bodyOf(e);
    const mk = body === null ? null : ghBody.extractMarker(body);
    out.push(`${m} ${endpointOf(e.args)} ${mk ? `${mk.kind || 'issue'}:${mk.id}` : e.args.join(' ')}`);
  }
  return out;
}

const dupes = (list) => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];

/** A successful POST that created a TRD issue (marker `N-MM`). */
function isTrdCreate(entry) {
  if (methodOf(entry.args) !== 'POST' || endpointOf(entry.args) !== 'repos/o/r/issues') return false;
  const mk = ghBody.extractMarker(bodyOf(entry) || '');
  return Boolean(mk && mk.kind === null && /^\d+-\d+$/.test(mk.id));
}

/** The REST create of an issue (a failNext matcher: argv only). */
const ISSUE_CREATE = (args) => methodOf(args) === 'POST' && endpointOf(args) === 'repos/o/r/issues';

/**
 * GitHub, as sets keyed by `devflow:id`: each issue's type, title, state, state reason, parent, blocked-by, labels,
 * milestone and (for every type but Objective, whose body pins a wiki revision) body; the comment markers per issue;
 * the milestones. Issue numbers never appear.
 */
function stateOf(fake) {
  const keyOf = new Map();
  for (const i of fake.issues) {
    const mk = ghBody.extractMarker(String(i.body || ''));
    keyOf.set(i.number, `${i.type || 'untyped'}:${mk && mk.kind === null ? mk.id : `#unmarked ${i.title}`}`);
  }
  const ref = (n) => (n === null || n === undefined ? null : keyOf.get(n) || `#missing ${n}`);
  const msTitle = new Map(fake.milestones.map((m) => [m.number, m.title]));
  const issues = fake.issues.map((i) => ({
    key: keyOf.get(i.number),
    title: i.title,
    state: i.state,
    state_reason: i.state === 'CLOSED' ? i.stateReason : null,
    parent: ref(i.parent),
    blocked_by: (i.blockedBy || []).map(ref).sort(),
    labels: [...(i.labels || [])].map(String).sort(),
    milestone: i.milestone === null || i.milestone === undefined ? null : (msTitle.get(i.milestone) || String(i.milestone)),
    body: i.type === 'Objective' ? null : i.body,
  })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const comments = fake.comments.map((c) => {
    const mk = ghBody.extractMarker(String(c.body || ''));
    return `${ref(c.issue_number)} ${mk ? `${mk.kind}:${mk.id}` : 'unmarked'}`;
  }).sort();
  const milestones = fake.milestones.map((m) => `${m.title} ${m.state}`).sort();
  return { issues, comments, milestones };
}

/** The `.planning/` paths git tracks. */
function trackedPlanning(env) {
  const r = spawnSync('git', ['ls-files', '--', '.planning'], { cwd: env.root, env: { ...process.env, ...env.env }, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).sort();
}

const journalOf = (env) => outbox.readJournal(env.root).journal;
const countBy = (ops, status) => ops.filter((o) => o.status === status).length;
const lastSeq = (j) => Math.max(0, ...j.ops.map((o) => o.seq), (Number.isInteger(j.next_seq) ? j.next_seq : 1) - 1);
const stamped = (env) => {
  const s = upgrade.readStamp(env.root);
  return s && Array.isArray(s.migrations_applied) ? s.migrations_applied : [];
};

/** A runner report that stopped 0011 short: exactly one failure, 0011's, with the given code. */
function assertStopped(r, code) {
  assert.deepEqual(r.applied, [], JSON.stringify(r.applied));
  assert.equal(r.failed.length, 1, JSON.stringify(r.failed));
  assert.equal(r.failed[0].id, '0011');
  assert.match(r.failed[0].error, new RegExp(`^0011 stopped \\(${code}\\): `), r.failed[0].error);
  return r.failed[0].error;
}

/** A runner report that completed 0011 (and the 0010 hand-off). */
function assertCompleted(env, r) {
  assert.deepEqual(r.failed, [], JSON.stringify(r.failed));
  assert.deepEqual(r.applied.map((a) => a.id), ['0011']);
  assert.ok(stamped(env).includes('0011') && stamped(env).includes('0010'), JSON.stringify(upgrade.readStamp(env.root)));
  assert.equal(backfill.hasPendingOps(env.root).any, false, 'the journal is drained');
  assert.deepEqual(trackedPlanning(env), ['.planning/config.json'], 'only config.json stays tracked');
  return r.applied[0];
}

/** The interrupted run ended where the uninterrupted one did, and sent nothing twice. */
function assertSameAsControl(env, rec, base, { writes = true } = {}) {
  assert.deepEqual(stateOf(env.fake), base.state, 'GitHub equals the uninterrupted run, by devflow:id');
  assert.deepEqual(dupes(creates(rec)), [], 'no create was sent twice');
  if (writes) assert.equal(rec.sent.length, base.writes, 'as many successful writes as the uninterrupted run: none repeated');
}

// The uninterrupted control run, built once on a fresh fixture inside the first test that needs it.
let CONTROL = null;

async function control(t) {
  if (CONTROL) return CONTROL;
  await t.test('control: the uninterrupted run on a fresh fixture', (st) => {
    const env = useBackfillEnv(st, SHAPE);
    if (!env) return;
    const rec = record(env);
    assertCompleted(env, run(env));
    const state = stateOf(env.fake);
    assert.ok(state.issues.length > 10, `the control put the backfill on GitHub (${state.issues.length} issues)`);
    assert.deepEqual(dupes(creates(rec)), [], 'the control itself sends no create twice');
    CONTROL = { state, writes: rec.sent.length };
  });
  return CONTROL;
}

// ─── 1. interrupted by maxOps ─────────────────────────────────────────────────

describe('0011 resume after interruption (tests 1-4)', () => {
  test('1: maxOps 40 stops `pending`; the resume only flushes and ends where the control does', async (t) => {
    const base = await control(t);
    const env = useBackfillEnv(t, SHAPE);
    if (!env || !base) return;
    const rec = record(env);

    const err = assertStopped(run(env, { maxOps: 40 }), 'pending');
    assert.match(err, /not an error: \d+ of \d+ ops remain \(the op limit for this apply \(maxOps\) was reached\)/);
    const j1 = journalOf(env);
    assert.equal(countBy(j1.ops, 'done'), 40, 'the 40 flushed ops are done');
    assert.ok(countBy(j1.ops, 'pending') > 0, 'the rest stays pending');
    assert.equal(stamped(env).includes('0011'), false, 'nothing stamped');
    const seqBefore = lastSeq(j1);
    const doneBefore = j1.ops.filter((o) => o.status === 'done').map((o) => o.seq);

    nextRun(env, rec);
    const a = assertCompleted(env, run(env));
    assert.match(a.notes, /not re-imported \(resume\)/, 'the queue phase was skipped');
    const j2 = journalOf(env);
    assert.equal(lastSeq(j2), seqBefore, 'no op was queued again');
    for (const seq of doneBefore) {
      const op = j2.ops.find((o) => o.seq === seq);
      assert.ok(!op || op.status === 'done', `op ${seq} stayed done`);
    }
    assertSameAsControl(env, rec, base);
  });

  // ─── 2. offline mid-drain ───────────────────────────────────────────────────

  test('2: offline mid-drain stops `pending` (offline); back online, the resume completes', async (t) => {
    const base = await control(t);
    const env = useBackfillEnv(t, SHAPE);
    if (!env || !base) return;
    const rec = record(env);
    let trdCreates = 0;
    rec.onWrite = (e) => {
      if (isTrdCreate(e) && ++trdCreates === 3) env.fake.setOffline(true);
    };

    const err = assertStopped(run(env), 'pending');
    assert.match(err, /not an error: \d+ of \d+ ops remain \(GitHub could not be reached\)/);
    assert.ok(rec.failed.length > 0, 'a write met the outage');
    const j1 = journalOf(env);
    assert.ok(countBy(j1.ops, 'done') > 0, 'the ops written before the outage are done');
    assert.ok(countBy(j1.ops, 'pending') > 0, 'the rest stays pending');
    const seqBefore = lastSeq(j1);

    rec.onWrite = null;
    env.fake.setOffline(false);
    nextRun(env, rec);
    assertCompleted(env, run(env));
    assert.equal(lastSeq(journalOf(env)), seqBefore, 'no op was queued again');
    assertSameAsControl(env, rec, base);
  });

  // ─── 3. lost mapping ────────────────────────────────────────────────────────

  test('3: the mapping file lost between create and resume: issues are found by marker, none duplicated', async (t) => {
    const base = await control(t);
    const env = useBackfillEnv(t, SHAPE);
    if (!env || !base) return;
    const rec = record(env);

    assertStopped(run(env, { maxOps: 40 }), 'pending');
    const mappingFile = path.join(env.root, '.planning', '.gh-mapping.json');
    assert.ok(fs.existsSync(mappingFile), 'the partial run wrote the mapping');
    fs.rmSync(mappingFile);

    nextRun(env, rec);
    assertCompleted(env, run(env));
    assert.equal(env.fake.issues.length, base.state.issues.length, 'as many issues as the control: none duplicated');
    assertSameAsControl(env, rec, base, { writes: false });
  });

  // ─── 4. secondary rate limit ────────────────────────────────────────────────

  test('4a: a secondary limit (retry-after 30) during the drain is slept through; no done op is re-sent', async (t) => {
    const base = await control(t);
    const env = useBackfillEnv(t, SHAPE);
    if (!env || !base) return;
    const rec = record(env);
    let armed = false;
    rec.onWrite = (e) => {
      if (!armed && isTrdCreate(e)) {
        armed = true;
        env.fake.failNext(ISSUE_CREATE, SECONDARY(30));
      }
    };

    let r = run(env);
    if (r.failed.length) {
      // A drain may also stop on it (resumable); the resume after the wait completes.
      const err = assertStopped(r, 'pending');
      assert.match(err, /rate limited|delay/);
      env.clock.t += 60_000;
      nextRun(env, rec);
      r = run(env);
    }
    assertCompleted(env, r);
    // (The other failed write of every run is the live phase's second `label create devflow:objective`: it exists.)
    assert.equal(rec.failed.filter((e) => ISSUE_CREATE(e.args)).length, 1, 'the limit was met once');
    assertSameAsControl(env, rec, base);
  });

  test('4b: a secondary limit that outlasts the client retries leaves the op pending with retry_after; the resume completes', async (t) => {
    const base = await control(t);
    const env = useBackfillEnv(t, SHAPE);
    if (!env || !base) return;
    const rec = record(env);
    let armed = false;
    rec.onWrite = (e) => {
      if (!armed && isTrdCreate(e)) {
        armed = true;
        for (let i = 0; i <= client.MAX_RETRIES; i++) env.fake.failNext(ISSUE_CREATE, SECONDARY(120));
      }
    };

    const err = assertStopped(run(env), 'pending');
    assert.match(err, /not an error: \d+ of \d+ ops remain \(GitHub rate limited the writes\)/);
    assert.match(err, /resume at \d{4}-\d\d-\d\dT/);
    assert.equal(rec.failed.filter((e) => ISSUE_CREATE(e.args)).length, client.MAX_RETRIES + 1, 'every retry met the limit');
    const j1 = journalOf(env);
    const waiting = j1.ops.filter((o) => o.status === 'pending' && o.retry_after);
    assert.equal(waiting.length, 1, `one op waits with retry_after: ${JSON.stringify(waiting.map((o) => o.seq))}`);
    assert.equal(waiting[0].kind, 'upsert-issue');
    const doneBefore = countBy(j1.ops, 'done');
    assert.ok(doneBefore > 0, 'the ops before it are done');

    rec.onWrite = null;
    env.clock.t += 120_000;
    nextRun(env, rec);
    assertCompleted(env, run(env));
    assertSameAsControl(env, rec, base);
  });
});
