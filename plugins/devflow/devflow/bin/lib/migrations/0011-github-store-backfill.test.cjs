'use strict';

// TRD 51-06 — migration 0011 github-store-backfill, part 1 (GMD-01, GMD-02):
//   1     contract: the registry loads 0011 as a confirm migration; `upgrade --check` lists it under pending_confirm
//   2a-d  detect matrix: disabled / store off (plan summary) / store on + pending journal / store on + drained
//   3     dry run: the full plan in notes, nothing written, zero gh calls
//   4     local preflight refusals (each alone, then all together)
//   5     remote preflight refusals (wiki disabled, wiki with no first page, read-only token)
//   6-8   store switch + queue, resume without re-import, empty plan
//
// no_llm_test_data: every project is the hand-built 51-02 backfill fixture (useBackfillEnv: hermetic HOME, outbox and
// gh-cache dirs, the fake GitHub on the gh seam, a local bare wiki remote, a fake clock) or a hand-built minimal git repo
// inside that same hermetic env. Nothing here touches this repository, the real ~/.claude, GitHub, the network or a port.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const outbox = require('../gh-outbox.cjs');
const ghCache = require('../gh-cache.cjs');
const planningPaths = require('../planning-paths.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { useBackfillEnv } = require('../__fixtures__/gh-backfill-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0011-github-store-backfill.cjs');
const M0010_PATH = path.join(__dirname, '0010-store-gitignore.cjs');
const PLUGIN_VERSION = '2.13.0';
const SMALL = { objectives: 2, trdsPerObjective: 2 };

const m0011 = () => require(MIGRATION_PATH);

function ctxFor(env, { dryRun = false, root = env.root } = {}) {
  return { projectRoot: root, userHome: env.home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

/** rel -> sha1 of every file under `root` except `.git/`. */
function snapshot(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && e.name === '.git') continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else out[r] = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(root, '');
  return out;
}

/** Files in the hermetic outbox dir (the journal, its lock, the cache index): none means nothing was queued. */
function outboxFiles(env) {
  const dir = env.env.DEVFLOW_OUTBOX_DIR;
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

function configText(root) {
  return fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf-8');
}

/** Patch config.json `github` (an `undefined` value deletes the key); 2-space JSON + newline. */
function patchGithub(root, patch) {
  const c = JSON.parse(configText(root));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete c.github[k];
    else c.github[k] = v;
  }
  fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify(c, null, 2)}\n`);
}

// ─── 1. contract ──────────────────────────────────────────────────────────────

describe('0011 contract (test 1)', () => {
  test('1: loadRegistry has 0011 (confirm, since 2.13.0); check lists it under pending_confirm, never auto', (t) => {
    const m = upgrade.loadRegistry().find((x) => x.id === '0011');
    assert.ok(m, 'the registry loads 0011');
    assert.equal(m.safety, 'confirm');
    assert.equal(m.since, '2.13.0');
    assert.equal(m.title, 'Backfill planning history into the GitHub store');
    const mod = m0011();
    for (const fn of ['detect', 'apply', 'migrate', 'preflightLocal', 'preflightRemote', 'ensureStoreSwitch', 'queue']) {
      assert.equal(typeof mod[fn], 'function', `exports ${fn}`);
    }

    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    const r = upgrade.check({ projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION });
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.pending.map((p) => p.id), [], 'never an auto migration');
    assert.deepEqual(r.pending_confirm.map((p) => p.id), ['0011']);
    assert.equal(env.fake.calls().length, 0, 'check makes zero gh calls');
  });
});

// ─── 2. detect ────────────────────────────────────────────────────────────────

describe('0011 detect (test 2)', () => {
  test('2a: GitHub disabled or repo unset -> applies:false, zero gh calls, tree byte-identical', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    for (const patch of [{ enabled: false }, { enabled: true, repo: '' }]) {
      patchGithub(env.root, patch);
      const before = snapshot(env.root);
      const d = m0011().detect(ctxFor(env, { dryRun: true }));
      assert.equal(d.applies, false, JSON.stringify(patch));
      assert.match(d.reason, /GitHub integration not enabled/);
      assert.deepEqual(snapshot(env.root), before, 'detect writes nothing');
    }
    assert.equal(env.fake.calls().length, 0);
    assert.deepEqual(outboxFiles(env), []);
  });

  test('2b: enabled + store off -> applies, the reason is the plan summary (counts, writes, the dry-run pointer)', (t) => {
    const env = useBackfillEnv(t);
    if (!env) return;
    const before = snapshot(env.root);
    const d = m0011().detect(ctxFor(env, { dryRun: true }));
    assert.equal(d.applies, true);
    assert.match(d.reason, /20 objectives/);
    assert.match(d.reason, /100 TRDs/);
    assert.match(d.reason, /~\d+ writes/);
    assert.match(d.reason, /planning import --dry-run/);
    assert.doesNotMatch(d.reason, /\n/, 'one paragraph');
    assert.equal(env.fake.calls().length, 0, 'zero gh calls');
    assert.deepEqual(snapshot(env.root), before);
    assert.deepEqual(outboxFiles(env), []);
  });

  test('2c: store on + a pending journal -> applies (resume)', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    patchGithub(env.root, { store: true });
    const q = outbox.enqueue(env.root, [{ kind: 'patch-issue', target: { id: '1-01' }, payload: { state: 'closed', state_reason: 'completed' } }]);
    assert.ok(q.ok && !q.skipped, JSON.stringify(q));
    const d = m0011().detect(ctxFor(env, { dryRun: true }));
    assert.equal(d.applies, true);
    assert.match(d.reason, /1 outbox op\(s\) pending/);
    assert.match(d.reason, /--only 0011 --confirm/);
    assert.equal(env.fake.calls().length, 0);
  });

  test('2d: store on + drained + all baselined -> applies until 0010 is done, then not ("already on GitHub")', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    patchGithub(env.root, { store: true });
    const lists = planningPaths.listByClass(path.join(env.root, '.planning'));
    ghCache.recordCacheBaseline(env.root, lists.cache);

    let d = m0011().detect(ctxFor(env, { dryRun: true }));
    assert.equal(d.applies, true, 'the 0010 hand-off is still ahead');
    assert.match(d.reason, /0010/);

    const r10 = require(M0010_PATH).migrate(ctxFor(env));
    assert.equal(r10.applied, true, r10.refused || r10.notes);
    d = m0011().detect(ctxFor(env, { dryRun: true }));
    assert.equal(d.applies, false);
    assert.match(d.reason, /already on GitHub \(backfill complete\)/);
    assert.equal(env.fake.calls().length, 0);
  });
});

// ─── 3. dry run ───────────────────────────────────────────────────────────────

describe('0011 dry run (test 3)', () => {
  test('3: migrate({dryRun}) returns the full plan in notes, changed [], zero gh calls, nothing written', (t) => {
    const env = useBackfillEnv(t, { objectives: 4, trdsPerObjective: 2 });
    if (!env) return;
    const before = snapshot(env.root);
    const res = m0011().migrate(ctxFor(env, { dryRun: true }));
    assert.equal(res.applied, false);
    assert.equal(res.dryRun, true);
    assert.deepEqual(res.changed, []);
    assert.match(res.notes, /estimate: ~\d+ writes \(upper bound\)/);
    assert.match(res.notes, /history: \d+ closed \(completed\), \d+ closed \(not planned\)/);
    assert.match(res.notes, /will stay local:\n {2}\| file \| why \|/);
    assert.match(res.notes, /planning import --dry-run/);

    // Through the runner as well: `upgrade --apply --only 0011 --confirm --dry-run`.
    const r = upgrade.apply({ projectRoot: env.root, userHome: env.home, pluginVersion: PLUGIN_VERSION, only: '0011', dryRun: true });
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.applied.map((a) => a.id), ['0011']);
    assert.match(r.applied[0].notes, /estimate:/);

    assert.equal(env.fake.calls().length, 0, 'zero gh calls');
    assert.deepEqual(snapshot(env.root), before, 'nothing written in the project');
    assert.deepEqual(outboxFiles(env), [], 'nothing queued');
    assert.equal(Object.hasOwn(JSON.parse(configText(env.root)).github, 'store'), false, 'the store stays off');
  });
});

// ─── 4-5. preflight ───────────────────────────────────────────────────────────

/** apply(ctx) must throw a `preflight` refusal naming every pattern, with zero gh writes and config.json unchanged. */
function assertPreflightRefusal(env, ctx, patterns) {
  const before = configText(ctx.projectRoot);
  let err = null;
  assert.throws(() => m0011().apply(ctx), (e) => {
    err = e;
    return true;
  });
  assert.ok(err.refusal, `a typed refusal, got: ${err.stack}`);
  assert.equal(err.refusal.code, 'preflight', err.message);
  for (const p of patterns) {
    assert.ok(err.refusal.details.some((d) => p.test(d)), `${p} in ${JSON.stringify(err.refusal.details)}`);
    assert.match(err.message, p, 'the runner-facing message names it too');
  }
  assert.equal(configText(ctx.projectRoot), before, 'config.json unchanged: the store switch is never reached');
  assert.equal(env.fake.writes().length, 0, 'zero gh writes');
  return err.refusal;
}

function writeMergeHead(env) {
  fs.writeFileSync(path.join(env.root, '.git', 'MERGE_HEAD'), `${'a'.repeat(40)}\n`);
}

function haltJournal(env, { blocked = false } = {}) {
  if (blocked) {
    const q = outbox.enqueue(env.root, [{ kind: 'patch-issue', target: { id: '1-01' }, payload: { state: 'closed', state_reason: 'completed' } }]);
    assert.ok(q.ok && !q.skipped, JSON.stringify(q));
  }
  const { journal } = outbox.readJournal(env.root);
  if (blocked) journal.ops[0].status = 'blocked';
  else journal.halted = { reason: 'conflict', seq: 7 };
  outbox.writeJournal(env.root, journal);
}

const LOCAL = {
  noGit: /not a git work tree/,
  merge: /merge in progress \(MERGE_HEAD\).*git merge --abort/,
  halted: /outbox: halted \(conflict\).*gh outbox status/,
  blocked: /outbox: 1 blocked op\(s\).*gh outbox resolve/,
  legacy: /20-06-TRD-legacy-step\.md|02-03-TRD-legacy-step\.md/,
  oversize: /over the 60,000-char TRD budget/,
};

describe('0011 local preflight (test 4)', () => {
  test('4a: not a git work tree -> refused, zero gh calls', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0011-nogit-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.planning'));
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify({ github: { enabled: true, repo: 'o/r' } }, null, 2)}\n`);
    assertPreflightRefusal(env, ctxFor(env, { root }), [LOCAL.noGit]);
    assert.equal(env.fake.calls().length, 0);
  });

  test('4b: a merge in progress (MERGE_HEAD) -> refused', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    writeMergeHead(env);
    assertPreflightRefusal(env, ctxFor(env), [LOCAL.merge]);
    assert.equal(env.fake.calls().length, 0);
  });

  test('4c: a halted journal -> refused', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    haltJournal(env);
    assertPreflightRefusal(env, ctxFor(env), [LOCAL.halted]);
    assert.equal(env.fake.calls().length, 0);
  });

  test('4d: a blocked op -> refused', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    haltJournal(env, { blocked: true });
    assertPreflightRefusal(env, ctxFor(env), [LOCAL.blocked]);
    assert.equal(env.fake.calls().length, 0);
  });

  test('4e: a legacy-named TRD -> refused with the rename', (t) => {
    const env = useBackfillEnv(t, { ...SMALL, legacyTrd: true });
    if (!env) return;
    const r = assertPreflightRefusal(env, ctxFor(env), [/legacy TRD name has no GitHub home; rename it to 02-03-legacy-step-TRD\.md/]);
    assert.equal(r.details.length, 1, JSON.stringify(r.details));
    assert.equal(env.fake.calls().length, 0);
  });

  test('4f: a TRD over 60,000 chars -> refused with the split hint', (t) => {
    const env = useBackfillEnv(t, { ...SMALL, oversizeTrd: true });
    if (!env) return;
    const r = assertPreflightRefusal(env, ctxFor(env), [LOCAL.oversize, /02-03-big-step-TRD\.md/, /split it or move bulk to a linked file/]);
    assert.equal(r.details.length, 1, JSON.stringify(r.details));
    assert.equal(env.fake.calls().length, 0);
  });

  test('4g: every blocker at once is listed in one refusal', (t) => {
    const env = useBackfillEnv(t, { ...SMALL, legacyTrd: true, oversizeTrd: true });
    if (!env) return;
    writeMergeHead(env);
    haltJournal(env, { blocked: true });
    haltJournal(env);
    const r = assertPreflightRefusal(env, ctxFor(env), [LOCAL.merge, LOCAL.halted, LOCAL.blocked, LOCAL.legacy, LOCAL.oversize]);
    assert.equal(r.details.length, 5, JSON.stringify(r.details));
    assert.equal(env.fake.calls().length, 0);
    // preflightLocal itself returns the same list (no throw).
    assert.equal(m0011().preflightLocal(ctxFor(env)).length, 5);
  });
});

describe('0011 remote preflight (test 5)', () => {
  const CASES = [
    ['5a: the wiki is disabled -> refused with "enable it"', { fake: { hasWiki: false } }, null,
      /wiki is disabled on o\/r.*enable it.*create its first page/],
    ['5b: the wiki has no first page -> refused with the one-line fix', {}, (env) => {
      process.env.DEVFLOW_WIKI_REMOTE = env.wiki.missingUrl;
    }, /wiki has no first page.*create the first wiki page in the GitHub web UI/],
    ['5c: a read-only token (push:false) -> refused', { fake: { push: false } }, null,
      /no push permission on o\/r/],
  ];
  for (const [name, opts, arrange, pattern] of CASES) {
    test(name, (t) => {
      const env = useBackfillEnv(t, { ...SMALL, ...opts });
      if (!env) return;
      if (arrange) arrange(env);
      assertPreflightRefusal(env, ctxFor(env), [pattern]);
      assert.ok(env.fake.calls().length > 0, 'the remote preflight reads GitHub');
      assert.deepEqual(outboxFiles(env), [], 'nothing queued');
    });
  }

  test('5d: a healthy fake passes: preflightRemote returns no blocker and makes zero writes', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    assert.deepEqual(m0011().preflightRemote(ctxFor(env)), []);
    assert.equal(env.fake.writes().length, 0);
  });
});

// ─── 6-8. store switch and queue ──────────────────────────────────────────────

/** apply(ctx) throws a typed stop; returns the error. */
function stopped(ctx) {
  let err = null;
  assert.throws(() => m0011().apply(ctx), (e) => {
    err = e;
    return true;
  });
  assert.ok(err.refusal, `a typed stop, got: ${err.stack}`);
  return err;
}

// A history close of a TRD (`NN-MM` id). Entity closes (the completed todo, the quick task) are import ops, not history.
const TRD_CLOSE = (o) => o.kind === 'patch-issue' && /^\d+(?:\.\d+)?-\d+$/.test(String(o.target && o.target.id)) &&
  o.payload && o.payload.state === 'closed' && !Object.hasOwn(o.payload, 'type');

describe('0011 store switch and queue (tests 6-8)', () => {
  test('6: apply switches the store, queues the import then the history closes, books live creates; stops not_implemented', (t) => {
    const env = useBackfillEnv(t, { objectives: 4, trdsPerObjective: 3 });
    if (!env) return;
    const keysBefore = Object.keys(JSON.parse(configText(env.root)).github);

    const err = stopped(ctxFor(env));
    assert.equal(err.refusal.code, 'not_implemented', err.message);
    assert.match(err.message, /drain lands in TRD 51-07/);
    assert.match(err.refusal.notes, /edit gate denies cache edits/);
    assert.match(err.refusal.notes, /`df-tools commit` refuses the default branch/);
    assert.match(err.refusal.notes, /rollback: set github\.store to false \(the backup is at \/.+\)/);

    // The switch: github.store true, every other key in place, the trailing newline kept.
    const text = configText(env.root);
    const cfg = JSON.parse(text);
    assert.equal(cfg.github.store, true);
    assert.deepEqual(Object.keys(cfg.github), [...keysBefore, 'store']);
    assert.ok(text.endsWith('}\n'));

    // The queue: import ops first, then the TRD history closes (objective closes ride on the type patch).
    const { journal } = outbox.readJournal(env.root);
    const pending = journal.ops.filter((o) => o.status === 'pending');
    const creates = pending.filter((o) => o.kind === 'upsert-issue');
    const closes = pending.filter(TRD_CLOSE);
    assert.ok(creates.length > 0, 'import ops queued');
    assert.equal(closes.length, 12, 'one close per shipped TRD (4 x 3)');
    assert.ok(Math.min(...closes.map((o) => o.seq)) > Math.max(...creates.map((o) => o.seq)), 'history closes queue after every create');

    // G5: the live writes the import made (objective creates, milestones) are booked into the journal's window.
    const live = env.fake.writes().length;
    assert.ok(live > 0, 'the import made live writes');
    assert.equal(outbox.budgetCheck(journal, env.clock.t).hour, live);
  });

  test('7: a second apply with ops pending re-imports nothing (same ops, same next_seq, no new writes)', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    stopped(ctxFor(env));
    const first = outbox.readJournal(env.root).journal;
    const configAfterFirst = configText(env.root);
    const liveAfterFirst = env.fake.writes().length;
    assert.ok(first.ops.some((o) => o.status === 'pending'), 'precondition: ops pending');

    const err = stopped(ctxFor(env));
    assert.equal(err.refusal.code, 'not_implemented');
    assert.match(err.refusal.notes, /already queued: \d+ outbox op\(s\) pending; not re-imported/);
    const second = outbox.readJournal(env.root).journal;
    assert.equal(second.ops.length, first.ops.length);
    assert.equal(second.next_seq, first.next_seq, 'no new seq');
    assert.equal(second.writes.length, first.writes.length, 'nothing new booked');
    assert.equal(env.fake.writes().length, liveAfterFirst, 'no new live writes');
    assert.equal(configText(env.root), configAfterFirst, 'the switch is a no-op the second time');
  });

  test('8: an empty plan still flips the switch and reports nothing to backfill', (t) => {
    const env = useBackfillEnv(t, SMALL);
    if (!env) return;
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0011-empty-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.planning'));
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), `${JSON.stringify({ github: { enabled: true, repo: 'o/r' } }, null, 2)}\n`);
    fx.initGitFixture(root, env.home);

    const res = m0011().migrate(ctxFor(env, { root }));
    assert.equal(res.code, 'not_implemented', res.notes);
    assert.match(res.notes, /nothing to backfill/);
    const switched = `${JSON.stringify({ github: { enabled: true, repo: 'o/r', store: true } }, null, 2)}\n`;
    assert.equal(configText(root), switched);
    assert.equal(env.fake.writes().length, 0);

    // ensureStoreSwitch is idempotent: already on -> unchanged bytes, no backup.
    const again = m0011().ensureStoreSwitch(ctxFor(env, { root }));
    assert.equal(again.changed, false);
    assert.equal(configText(root), switched);
  });
});
