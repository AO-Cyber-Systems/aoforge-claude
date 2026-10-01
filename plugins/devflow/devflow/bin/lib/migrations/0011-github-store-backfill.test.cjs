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
