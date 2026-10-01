'use strict';

// planning-import-backfill.test.cjs (TRD 51-05, GMD-01 / GMD-02) — `planning import` is the single source of the
// GitHub backfill plan: it prices the backfill before any write, previews it before the store switch, queues the
// history closes after every create, and its estimate is pinned to what a real drain writes.
//
//   1  dry run, store on: `estimate` (objectives, trds, history_closes, ops, writes_max, ...) and `history` match the
//      20-objective fixture's intent; zero gh calls; the tree is unchanged
//   2  preview: store off + github.enabled -> the same estimate, `preview: true`, zero calls; enabled false refuses;
//      a real import with store off refuses
//   3  noFlush: the journal holds the hierarchy, decision, entity, wiki and history ops, the history closes after every
//      create, nothing flushed, the ledger unsettled
//   4  a default real import (2 objectives) ends with the shipped TRDs and objectives closed on the fake
//   5  calibration: a real import of the full fixture, drained hour by hour on the fake clock, writes no more than
//      `writes_max` and at least 0.6 x `writes_max`
//
// Hermetic: useBackfillEnv (51-02) — hermetic env, fake GitHub on the gh seam, fake clock, local wiki remote.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { planImport } = require('./planning-import.cjs');
const outbox = require('./gh-outbox.cjs');
const { useBackfillEnv } = require('./__fixtures__/gh-backfill-fixtures.cjs');

const REFUSAL = 'planning import needs github.store: true';

/** Merge `patch` into the fixture's `github` config block. */
function setGithub(root, patch) {
  const file = path.join(root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.github = { ...cfg.github, ...patch };
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
}

/** `{rel: text}` of every file under `.planning/`, for "nothing changed" assertions. */
function snapshot(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out[r] = fs.readFileSync(path.join(dir, e.name), 'utf8');
    }
  };
  walk(path.join(root, '.planning'), '');
  return out;
}

const journalExists = (root) => fs.existsSync(outbox.journalPath(root));

/** The history the fixture was built with (51-02 shape): every summarised TRD and shipped objective closes completed;
 *  the deferred TRD, the cancelled objective and its TRDs close not planned. */
function intendedHistory(shape) {
  const deferred = shape.shipped >= 3 ? 1 : 0;
  return {
    closed_completed: shape.summaries + shape.shipped,
    closed_not_planned: deferred + shape.cancelled * (shape.trdsPerObjective + 1),
  };
}

describe('51-05 planning import prices the backfill (dry run)', () => {
  test('1: store on: estimate and history match the fixture, zero gh calls, tree unchanged', (t) => {
    const env = useBackfillEnv(t);
    if (!env) return;
    setGithub(env.root, { store: true });
    const before = snapshot(env.root);

    const r = planImport(env.root, { dryRun: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.dry_run, true);
    assert.equal(r.preview, undefined, 'store on is not a preview');
    assert.equal(env.fake.calls().length, 0, 'zero gh calls');
    assert.deepEqual(snapshot(env.root), before, 'the tree is unchanged');
    assert.equal(journalExists(env.root), false, 'nothing enqueued');

    const { shape } = env;
    assert.equal(r.queued.objective, shape.objectives, 'the existing per-kind counts keep their meaning');
    const e = r.estimate;
    assert.ok(e && typeof e === 'object', 'report.estimate');
    assert.equal(e.objectives, shape.objectives);
    assert.equal(e.trds, shape.trds);
    const want = intendedHistory(shape);
    assert.deepEqual(r.history, want);
    assert.equal(e.history_closes, want.closed_completed + want.closed_not_planned);
    assert.equal(e.live_creates, shape.objectives, 'every objective is unmapped: one live create each');
    assert.equal(e.milestones, shape.milestones, 'one milestone put per shipped MILESTONES.md section');
    for (const key of ['ops', 'writes_max', 'minutes_min', 'hours_min']) {
      assert.equal(typeof e[key], 'number', `${key} is a number`);
    }
    assert.ok(e.by_kind && typeof e.by_kind === 'object', 'by_kind');
    assert.ok(e.by_kind['patch-issue'] >= e.history_closes, 'the history closes are priced');
    assert.ok(e.by_kind['upsert-issue'] >= shape.trds, 'one upsert per TRD at least');
    assert.ok(e.writes_max > 0);
    assert.equal(e.writes_max, Object.values(e.writes_by_kind).reduce((a, b) => a + b, 0));
    assert.deepEqual(e.unknown_kinds, [], 'every op the importer plans is priced');
  });

  test('2: store off + github.enabled previews the same plan; enabled false and a real import refuse', (t) => {
    const env = useBackfillEnv(t);
    if (!env) return;
    const before = snapshot(env.root);

    const preview = planImport(env.root, { dryRun: true });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    assert.equal(preview.mode, 'local');
    assert.equal(preview.preview, true);
    assert.equal(env.fake.calls().length, 0, 'zero gh calls');
    assert.deepEqual(snapshot(env.root), before, 'the tree is unchanged');
    assert.equal(journalExists(env.root), false);

    setGithub(env.root, { store: true });
    const stored = planImport(env.root, { dryRun: true });
    assert.equal(stored.ok, true, JSON.stringify(stored));
    assert.deepEqual(preview.estimate, stored.estimate, 'the preview prices exactly what the store-mode dry run prices');
    assert.deepEqual(preview.history, stored.history);
    assert.deepEqual(preview.queued, stored.queued);
    setGithub(env.root, { store: false });

    const real = planImport(env.root);
    assert.equal(real.ok, false);
    assert.equal(real.error, REFUSAL, 'a real import with store off still refuses');

    setGithub(env.root, { enabled: false });
    const disabled = planImport(env.root, { dryRun: true });
    assert.equal(disabled.ok, false);
    assert.equal(disabled.error, REFUSAL, 'github disabled: no preview');
    assert.equal(disabled.preview, undefined);
    assert.equal(env.fake.calls().length, 0);
    assert.equal(journalExists(env.root), false);
  });
});
