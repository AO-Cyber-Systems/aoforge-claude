'use strict';

// TRD 51-07 — migration 0011 github-store-backfill, part 2 (GMD-01; SC1, SC2): drain, verify, the 0010 hand-off.
//   1  a small project: one apply queues, drains, verifies and hands off to 0010 (.gitignore, the store-mode commit
//      steps, the stamp lists 0011 and 0010)
//   4  a TRD issue missing on GitHub when verification runs refuses `verify`; 0010 does not run
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
const { useBackfillEnv } = require('../__fixtures__/gh-backfill-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0011-github-store-backfill.cjs');
const M0010_PATH = path.join(__dirname, '0010-store-gitignore.cjs');
const PLUGIN_VERSION = '2.13.0';

const m0011 = () => require(MIGRATION_PATH);
const m0010 = () => require(M0010_PATH);

function ctxFor(env, options = {}) {
  return { projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION, dryRun: false, options };
}

/** `df-tools upgrade --apply --only 0011 --confirm`, through the runner. */
function applyOnly0011(env, extra = {}) {
  return upgrade.apply({
    projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION, only: ['0011'], confirm: true, ...extra,
  });
}

/** apply(ctx) must throw a typed stop; returns the error (err.refusal is the stop). */
function stopped(ctx) {
  let err = null;
  assert.throws(() => m0011().apply(ctx), (e) => {
    err = e;
    return true;
  });
  assert.ok(err.refusal, `a typed stop, got: ${err.stack}`);
  return err;
}

function readMaybe(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

const gitignoreOf = (env) => readMaybe(path.join(env.root, '.gitignore'));

/** The `.planning/` paths git tracks (the index, so a `git rm --cached` shows at once). */
function trackedPlanning(env) {
  const r = spawnSync('git', ['ls-files', '--', '.planning'], { cwd: env.root, env: { ...process.env, ...env.env }, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).sort();
}

const markerId = (body) => {
  const m = ghBody.extractMarker(typeof body === 'string' ? body : '');
  return m && m.kind === null ? m.id : null;
};

/** The ops still waiting in the journal, in flush (seq) order. */
function liveOps(env) {
  return outbox.readJournal(env.root).journal.ops.filter((o) => o.status !== 'done').sort((a, b) => a.seq - b.seq);
}

/** GitHub loses a TRD issue (a human deleted it): the issue, its links, its dependency edges and its comments go. */
function deleteTrdIssue(fake, id) {
  const i = fake.issues.findIndex((x) => x.type === 'TRD' && markerId(x.body) === id);
  assert.ok(i >= 0, `the fake holds the TRD issue ${id}`);
  const [gone] = fake.issues.splice(i, 1);
  for (const x of fake.issues) {
    if (Array.isArray(x.subIssues)) x.subIssues = x.subIssues.filter((n) => n !== gone.number);
    if (Array.isArray(x.blockedBy)) x.blockedBy = x.blockedBy.filter((n) => n !== gone.number);
  }
  for (let k = fake.comments.length - 1; k >= 0; k--) {
    if (fake.comments[k].issue_number === gone.number) fake.comments.splice(k, 1);
  }
  return gone;
}

// ─── 1. one apply, every phase ────────────────────────────────────────────────

describe('0011 drain, verify, hand-off (test 1)', () => {
  test('1: a small project: one apply queues, drains, verifies and hands off to 0010', (t) => {
    const env = useBackfillEnv(t, { objectives: 2 });
    if (!env) return;

    const r = applyOnly0011(env);
    assert.deepEqual(r.failed, [], JSON.stringify(r.failed));
    assert.deepEqual(r.applied.map((a) => a.id), ['0011']);
    const [a] = r.applied;
    assert.ok(a.changed.includes('.gitignore'), `changed: ${JSON.stringify(a.changed)}`);
    assert.ok(a.changed.includes('.planning/config.json'), 'the store switch');
    assert.match(a.notes, /DEVFLOW_SKIP_GH_GATE=1/, 'the store-mode commit steps (51-04 STORE_COMMIT_STEPS)');
    assert.match(a.notes, /git switch -c /);
    assert.match(a.notes, /gh setup/, 'the gh setup ordering note (P7)');
    assert.match(a.notes, /admin bypass/);

    const stamp = upgrade.readStamp(env.root);
    assert.ok(stamp.migrations_applied.includes('0011'), JSON.stringify(stamp));
    assert.ok(stamp.migrations_applied.includes('0010'), `the in-process hand-off is recorded: ${JSON.stringify(stamp)}`);

    // Every phase ran: the journal is drained, the cache is gitignored and untracked.
    assert.equal(backfill.hasPendingOps(env.root).any, false, 'the journal is drained');
    assert.ok(gitignoreOf(env).includes(m0010().BLOCK_START), 'the store-mode .gitignore block');
    assert.deepEqual(trackedPlanning(env), ['.planning/config.json'], 'only config.json stays tracked');
    assert.equal(m0011().detect(ctxFor(env)).applies, false, 'done');
  });
});

// ─── 4. verify ────────────────────────────────────────────────────────────────

describe('0011 verify (test 4)', () => {
  test('4: a TRD issue missing on GitHub at verification refuses `verify`; 0010 does not run', (t) => {
    const env = useBackfillEnv(t, { objectives: 2 });
    if (!env) return;

    // Queue everything and write nothing: the drain stops at once on maxOps 0 (resumable, nothing stamped).
    let err = stopped(ctxFor(env, { maxOps: 0 }));
    assert.equal(err.refusal.code, 'pending', err.message);
    assert.equal(err.refusal.reason, 'max_ops');
    const queued = liveOps(env).length;
    assert.ok(queued > 1, 'ops queued');
    assert.equal(err.refusal.remaining, queued);
    assert.match(err.message, new RegExp(`not an error: ${queued} of ${queued} ops remain`));

    // Drain all but the last op (a history close), then GitHub loses a TRD whose own ops are all done.
    err = stopped(ctxFor(env, { maxOps: queued - 1 }));
    assert.equal(err.refusal.code, 'pending', err.message);
    assert.equal(err.refusal.remaining, 1);
    const [last] = liveOps(env);
    assert.equal(last.kind, 'patch-issue');
    assert.notEqual(last.target.id, '1-01');
    deleteTrdIssue(env.fake, '1-01');

    const gitignoreBefore = gitignoreOf(env);
    const trackedBefore = trackedPlanning(env);
    err = stopped(ctxFor(env));
    assert.equal(err.refusal.code, 'verify', err.message);
    assert.match(err.message, /01-01-step-01-TRD\.md/, 'the TRD file with no issue on GitHub');
    assert.equal(backfill.hasPendingOps(env.root).any, false, 'the drain itself finished');
    assert.equal(gitignoreOf(env), gitignoreBefore, '.gitignore unchanged: 0010 did not run');
    assert.deepEqual(trackedPlanning(env), trackedBefore, 'nothing untracked: 0010 did not run');
    assert.equal(upgrade.readStamp(env.root).migrations_applied.includes('0010'), false);
    assert.equal(m0011().detect(ctxFor(env)).applies, true, 'still applies: the hand-off is ahead');
  });
});
