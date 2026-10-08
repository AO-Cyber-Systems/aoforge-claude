'use strict';

// TRD 51-07 — migration 0011 github-store-backfill, part 2 (GMD-01; SC1, SC2): drain, verify, the 0010 hand-off.
//   1  a small project: one apply queues, drains, verifies and hands off to 0010 (.gitignore, the store-mode commit
//      steps, the stamp lists 0011 and 0010)
//   2  SC1: the 20-objective fixture stops on the hour budget (`pending`, resumable, nothing stamped), the clock moves
//      by `wait_ms`, and `--apply --only 0011 --confirm` completes; the end state is checked by `aoforge:id` marker
//   3  pacing over the whole run: >= 1 s between writes, <= 80 in any minute, <= 450 in any hour
//   4  a TRD issue missing on GitHub when verification runs refuses `verify`; 0010 does not run
//   5  SC2 (on test 2's end state): check reports 0011 and 0010 not applicable; another `--only 0011 --confirm` applies
//      nothing, makes zero gh writes, and leaves the tree, config.json and the journal byte-identical
//   6  parity: a never-enabled project sees zero gh calls and a byte-identical tree from check and apply --confirm
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
const ghHierarchy = require('../gh-hierarchy.cjs');
const planningPaths = require('../planning-paths.cjs');
const client = require('../gh-client.cjs');
const gh = require('../gh.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { useBackfillEnv } = require('../__fixtures__/gh-backfill-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0011-github-store-backfill.cjs');
const M0010_PATH = path.join(__dirname, '0010-store-gitignore.cjs');
const PLUGIN_VERSION = '2.13.0';

const m0011 = () => require(MIGRATION_PATH);
const m0010 = () => require(M0010_PATH);

function ctxFor(env, options = {}) {
  return { projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION, dryRun: false, options };
}

/** `aof-tools upgrade --apply --only 0011 --confirm`, through the runner. */
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

/** A fresh aof-tools process on the same fake GitHub and clock: the gh client's per-run write budget starts over. */
function nextRun(env) {
  client._resetClient();
  client._setNow(() => env.clock.t);
  client._setSleep((ms) => { env.clock.t += ms; });
  gh._setRunGh(env.fake.runGh);
}

const pad = (n) => String(n).padStart(2, '0');

/** `aoforge:id` -> issue, for the fake's issues of one type (pull requests never carry a type). */
function byMarker(fake, type) {
  const out = new Map();
  for (const issue of fake.issues) {
    if (issue.type !== type) continue;
    const id = markerId(issue.body);
    assert.ok(id, `a ${type} issue #${issue.number} without an aoforge:id marker`);
    assert.equal(out.has(id), false, `one ${type} issue per id (${id})`);
    out.set(id, issue);
  }
  return out;
}

/** The fixture's intent for issue state (51-02 shape): shipped 1-15 (03-05 deferred), 16-18 in progress, 19 cancelled. */
function expectedObjectiveState(n) {
  if (n <= 15) return ['CLOSED', 'completed'];
  if (n === 19) return ['CLOSED', 'not_planned'];
  return ['OPEN', null];
}

function expectedTrdState(n, m) {
  if (n <= 15) return ['CLOSED', n === 3 && m === 5 ? 'not_planned' : 'completed'];
  if (n <= 18) return m <= 2 ? ['CLOSED', 'completed'] : ['OPEN', null];
  if (n === 19) return ['CLOSED', 'not_planned'];
  return ['OPEN', null];
}

/** The wiki remote's page files at master. */
function wikiPages(env) {
  const r = spawnSync('git', ['--git-dir', env.wiki.bareDir, 'ls-tree', '--name-only', 'master'], {
    env: { ...process.env, ...env.env }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).sort();
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
    assert.match(a.notes, /AOFORGE_SKIP_GH_GATE=1/, 'the store-mode commit steps (51-04 STORE_COMMIT_STEPS)');
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

// ─── 2-3. SC1: the 20-objective backfill across the hour budget ───────────────

describe('0011 SC1 on the 20-objective fixture (tests 2-3)', () => {
  // ~15 s of wall clock: the whole backfill against the fake GitHub, on fake time (no real sleep).
  test('SC1: the backfill completes under the limits across a resume', { timeout: 300000 }, async (t) => {
    const env = useBackfillEnv(t, { fake: { now: () => client.now() } });
    if (!env) return;
    const roadmapBefore = fs.readFileSync(path.join(env.root, '.planning', 'ROADMAP.md'), 'utf-8');
    const pagesBefore = wikiPages(env);
    // The intent, read from the fixture before anything runs: the wave edges and the TRDs that carry a SUMMARY.
    const expectedEdges = [];
    for (let n = 1; n <= env.shape.objectives; n++) {
      for (const e of ghHierarchy.waveEdges(ghHierarchy.readObjectiveTrds(env.root, String(n)))) {
        expectedEdges.push(`${e.blocker}>${e.blocked}`);
      }
    }
    const summarised = env.files
      .map((rel) => /^objectives\/[^/]+\/(\d+)-(\d+)-SUMMARY\.md$/.exec(rel))
      .filter(Boolean)
      .map((m) => `${parseInt(m[1], 10)}-${m[2]}`)
      .sort();
    assert.equal(summarised.length, env.shape.summaries);

    await t.test('2: apply #1 stops on the hour budget; after wait_ms, --only 0011 --confirm completes', () => {
      const err = stopped(ctxFor(env));
      assert.equal(err.refusal.code, 'pending', err.message);
      assert.equal(err.refusal.reason, 'budget', err.message);
      assert.equal(err.refusal.budget, 'hour', err.message);
      assert.ok(err.refusal.wait_ms > 0, `wait_ms ${err.refusal.wait_ms}`);
      assert.ok(err.refusal.remaining > 0 && err.refusal.remaining < err.refusal.total, JSON.stringify(err.refusal));
      assert.equal(err.refusal.resume_at, new Date(env.clock.t + err.refusal.wait_ms).toISOString());
      assert.match(err.message, new RegExp(`not an error: ${err.refusal.remaining} of ${err.refusal.total} ops remain`));
      assert.match(err.message, /hourly write budget/);
      assert.match(err.message, /resume at \d{4}-\d\d-\d\dT/);
      assert.match(err.message, /--only 0011 --confirm/);
      assert.match(err.message, /gh-flush hook/);
      assert.ok(backfill.hasPendingOps(env.root).pending > 0, 'the rest stays queued');
      assert.equal(gitignoreOf(env), null, '0010 did not run');

      // Inside the spent hour the runner reports a failure (not stamped) and writes nothing more.
      const writes = env.fake.writes().length;
      const early = applyOnly0011(env);
      assert.deepEqual(early.applied, []);
      assert.equal(early.failed.length, 1, JSON.stringify(early.failed));
      assert.equal(early.failed[0].id, '0011');
      assert.match(early.failed[0].error, /^0011 stopped \(pending\): not an error: \d+ of \d+ ops remain/);
      assert.equal(env.fake.writes().length, writes, 'no write inside the spent hour');
      assert.equal(upgrade.readStamp(env.root).migrations_applied.includes('0011'), false, 'nothing stamped');

      // An hour later (the refusal's wait), a new run completes.
      env.clock.t += err.refusal.wait_ms;
      nextRun(env);
      const r = applyOnly0011(env);
      assert.deepEqual(r.failed, [], JSON.stringify(r.failed));
      assert.deepEqual(r.applied.map((a) => a.id), ['0011']);
      const stamp = upgrade.readStamp(env.root);
      assert.ok(stamp.migrations_applied.includes('0011') && stamp.migrations_applied.includes('0010'), JSON.stringify(stamp));

      // GitHub, compared by aoforge:id: 20 Objective issues, 100 TRD sub-issues, the wave edges, the SUMMARY comments.
      const objectives = byMarker(env.fake, 'Objective');
      const trds = byMarker(env.fake, 'TRD');
      assert.equal(objectives.size, env.shape.objectives);
      assert.equal(trds.size, env.shape.trds);
      const idOf = new Map([...trds].map(([id, issue]) => [issue.number, id]));
      for (const [id, issue] of trds) {
        const parent = objectives.get(id.split('-')[0]);
        assert.ok(parent && parent.subIssues.includes(issue.number), `${id} is a sub-issue of its objective`);
      }
      const edges = [];
      const otherBlockers = [];
      for (const [id, issue] of trds) {
        for (const b of issue.blockedBy) {
          if (idOf.has(b)) edges.push(`${idOf.get(b)}>${id}`);
          else otherBlockers.push(`${b}>${id}`);
        }
      }
      assert.deepEqual(edges.sort(), expectedEdges.sort(), 'TRD blocked-by edges equal the wave edges');
      // The one other blocker is the pending Decision that names its TRD (DECISION-002, `trd: 16-03`).
      const decisions = byMarker(env.fake, 'Decision');
      assert.deepEqual(otherBlockers, [...decisions.values()].map((d) => `${d.number}>16-03`));
      const summaryComments = env.fake.comments
        .map((c) => ghBody.extractMarker(c.body))
        .filter((mk) => mk && mk.kind === 'summary' && /^\d+-\d+$/.test(mk.id)) // a TRD's, not the quick task's
        .map((mk) => mk.id)
        .sort();
      assert.deepEqual([...new Set(summaryComments)], summarised, 'one SUMMARY comment per summarised TRD');

      // History: shipped work closed completed, objective 19 and the deferred TRD not_planned, open work open.
      for (let n = 1; n <= env.shape.objectives; n++) {
        const o = objectives.get(String(n));
        assert.deepEqual([o.state, o.state === 'CLOSED' ? o.stateReason : null], expectedObjectiveState(n), `objective ${n}`);
        for (let m = 1; m <= env.shape.trdsPerObjective; m++) {
          const id = `${n}-${pad(m)}`;
          const i = trds.get(id);
          assert.deepEqual([i.state, i.state === 'CLOSED' ? i.stateReason : null], expectedTrdState(n, m), `TRD ${id}`);
        }
      }

      // The wiki got its pages; the journal is empty; every cache file is baselined; the cache is gitignored and
      // untracked; the hand-maintained ROADMAP.md was left alone by the pull.
      const pages = wikiPages(env);
      assert.ok(pages.length > pagesBefore.length, `wiki pages pushed: ${pages.join(', ')}`);
      assert.equal(backfill.hasPendingOps(env.root).any, false, 'the journal is empty');
      const index = outbox.readCacheIndex(env.root);
      const cache = planningPaths.listByClass(path.join(env.root, '.planning')).cache.filter((rel) => !rel.startsWith('wiki/'));
      assert.deepEqual(cache.filter((rel) => !Object.hasOwn(index, rel)), [], 'every cache file is baselined');
      assert.ok(gitignoreOf(env).includes(m0010().BLOCK_START));
      assert.deepEqual(trackedPlanning(env), ['.planning/config.json']);
      assert.equal(fs.readFileSync(path.join(env.root, '.planning', 'ROADMAP.md'), 'utf-8'), roadmapBefore,
        'gh pull --all kept the hand-maintained ROADMAP.md');
    });

    await t.test('3: pacing over the whole run: >= 1 s apart, <= 80 per minute, <= 450 per hour', () => {
      const ts = env.fake.writeTimes();
      assert.ok(ts.length > outbox.BUDGET.hour, `the run crossed the hour budget (${ts.length} writes)`);
      assert.ok(ts.every((x) => Number.isFinite(x)), 'every write is stamped on the fake clock');
      for (let i = 1; i < ts.length; i++) {
        assert.ok(ts[i] - ts[i - 1] >= client.MIN_WRITE_INTERVAL_MS, `writes ${i - 1} and ${i} are ${ts[i] - ts[i - 1]} ms apart`);
      }
      const within = (ms) => Math.max(0, ...ts.map((x) => ts.filter((y) => y >= x && y < x + ms).length));
      assert.ok(within(60_000) <= outbox.BUDGET.minute, `per minute: ${within(60_000)}`);
      assert.ok(within(3_600_000) <= outbox.BUDGET.hour, `per hour: ${within(3_600_000)}`);
    });

    await t.test('5: SC2: after completion, re-running the backfill is a no-op', () => {
      const configFile = path.join(env.root, '.planning', 'config.json');
      const journalFile = outbox.journalPath(env.root);
      const before = fx.snapshot(env.root);
      const configBefore = fs.readFileSync(configFile);
      const journalBefore = fs.readFileSync(journalFile);
      const writes = env.fake.writes().length;
      nextRun(env);

      const c = upgrade.check({ projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION });
      assert.deepEqual(c.failed, []);
      assert.deepEqual(c.pending_confirm, [], JSON.stringify(c.pending_confirm));
      const reasonOf = (id) => (c.skipped.find((x) => x.id === id) || {}).reason;
      assert.match(reasonOf('0011'), /already on GitHub \(backfill complete\)/);
      assert.equal(typeof reasonOf('0010'), 'string', '0010 is skipped (not applicable) too');

      const r = applyOnly0011(env);
      assert.deepEqual(r.failed, []);
      assert.deepEqual(r.applied, [], 'nothing applies');
      assert.deepEqual(r.changed_files, []);
      assert.equal(env.fake.writes().length, writes, 'zero gh writes');
      assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(env.root)), [], 'the tree is unchanged');
      assert.ok(fs.readFileSync(configFile).equals(configBefore), 'config.json bytes unchanged');
      assert.ok(fs.readFileSync(journalFile).equals(journalBefore), 'journal bytes unchanged');
    });
  });
});

// ─── 6. parity: a project that never enabled GitHub ───────────────────────────

describe('0011 store-off parity (test 6)', () => {
  test('6: a never-enabled project: check and apply --confirm make zero gh calls and leave the tree byte-identical', (t) => {
    const env = useBackfillEnv(t, { objectives: 2 });
    if (!env) return;
    const file = path.join(env.root, '.planning', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    cfg.github.enabled = false;
    fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
    // Current with this plugin version, so the runner's own version stamp has nothing to write either.
    upgrade.writeStamp(env.root, { ...upgrade.readStamp(env.root), version: PLUGIN_VERSION });

    const before = fx.snapshot(env.root);
    const outboxDir = env.env.AOFORGE_OUTBOX_DIR;
    const outboxBefore = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];

    const c = upgrade.check({ projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION });
    assert.match((c.skipped.find((x) => x.id === '0011') || {}).reason || '', /GitHub integration not enabled/);
    assert.equal(c.pending_confirm.some((x) => x.id === '0011'), false);

    for (const extra of [{ only: ['0011'] }, { only: undefined }]) {
      const r = applyOnly0011(env, extra);
      assert.deepEqual(r.failed, [], JSON.stringify(r.failed));
      assert.equal(r.applied.some((x) => x.id === '0011'), false);
      assert.deepEqual(r.changed_files, [], JSON.stringify(r.applied));
    }

    assert.equal(env.fake.calls().length, 0, 'zero gh calls');
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(env.root)), [], 'byte-identical tree');
    assert.deepEqual(fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [], outboxBefore, 'nothing queued');
  });
});
