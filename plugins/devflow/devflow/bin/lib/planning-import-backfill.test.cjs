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
const flushLib = require('./gh-outbox-flush.cjs');
const ledger = require('./planning-ledger.cjs');
const mappingLib = require('./gh-mapping.cjs');
const backfill = require('./gh-backfill.cjs');
const client = require('./gh-client.cjs');
const gh = require('./gh.cjs');
const { useBackfillEnv } = require('./__fixtures__/gh-backfill-fixtures.cjs');

const REFUSAL = 'planning import needs github.store: true';
const HOUR_MS = 60 * 60 * 1000;
/** The op kinds a hierarchy / entity / decision / doc push queues: every one of them must run before a history close. */
const CREATE_KINDS = new Set(['upsert-issue', 'link-sub-issue', 'block', 'upsert-comment', 'set-fields', 'patch-body', 'wiki-push']);
const TRD_ID_RE = /^\d+(?:\.\d+)?-\d+$/;

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

// ─── 3-5: queuing the history, noFlush, calibration ─────────────────────────

const journalOps = (root) => (journalExists(root) ? outbox.readJournal(root).journal.ops : []);

/** A fresh gh "run" on the same fake and clock: a new process gets a new per-run write budget. */
function nextRun(env) {
  client._resetClient();
  client._setNow(() => env.clock.t);
  client._setSleep((ms) => { env.clock.t += ms; });
  gh._setRunGh(env.fake.runGh);
}

/** A write only the flusher makes: a sub-issue link, a blocked-by edge, an issue PATCH or a comment on a TRD. */
function isFlushWrite(args) {
  const p = args.find((a) => typeof a === 'string' && a.startsWith('repos/')) || '';
  return /\/sub_issues$|\/dependencies\/blocked_by$/.test(p) || (/\/issues\/\d+$/.test(p) && args.includes('PATCH'));
}

const issueOf = (env, number) => env.fake.issues.find((i) => i.number === number);

describe('51-05 planning import queues the history closes', () => {
  test('3: noFlush: every op journaled, the history closes after every create, nothing flushed, ledger unsettled', (t) => {
    const env = useBackfillEnv(t);
    if (!env) return;
    setGithub(env.root, { store: true });

    const r = planImport(env.root, { noFlush: true });
    assert.equal(r.ok, true, JSON.stringify({ error: r.error, warnings: r.warnings }));
    assert.equal(r.exit, 0);
    assert.equal(r.flush, undefined, 'noFlush: no flush report');
    assert.equal(r.queued.objective, env.shape.objectives);

    const ops = journalOps(env.root);
    assert.ok(ops.length > 0, 'the journal holds the ops');
    assert.deepEqual(ops.filter((op) => op.status !== 'pending').map((op) => op.seq), [], 'nothing flushed');
    assert.deepEqual(env.fake.writes().filter(isFlushWrite), [], 'the only writes are the live creates and milestone puts');

    // TRD closes: one per finished TRD, every one queued after every create.
    const history = backfill.historyOps(env.root, null);
    const trdCloses = history.filter((op) => TRD_ID_RE.test(op.target.id));
    const closeSeqs = ops.filter((op) => op.kind === 'patch-issue' && TRD_ID_RE.test(op.target.id) && op.payload.state === 'closed');
    assert.equal(closeSeqs.length, trdCloses.length, 'one close per finished TRD');
    const firstClose = Math.min(...closeSeqs.map((op) => op.seq));
    const lastCreate = Math.max(...ops.filter((op) => CREATE_KINDS.has(op.kind)).map((op) => op.seq));
    assert.ok(firstClose > lastCreate, `history closes (from #${firstClose}) after every create (last #${lastCreate})`);
    for (const op of trdCloses) {
      const queued = closeSeqs.find((q) => q.target.id === op.target.id);
      assert.ok(queued, `close queued for ${op.target.id}`);
      assert.equal(queued.payload.state_reason, op.payload.state_reason, op.target.id);
    }

    // Objective closes fold into the objective's own pending patch-issue (outbox coalescing), keeping its type.
    for (const op of history.filter((h) => !TRD_ID_RE.test(h.target.id))) {
      const same = ops.filter((q) => q.kind === 'patch-issue' && q.target.id === op.target.id);
      assert.equal(same.length, 1, `one patch-issue for objective ${op.target.id}`);
      assert.deepEqual(same[0].payload, { type: 'Objective', state: 'closed', state_reason: op.payload.state_reason });
    }

    // The ledger holds what was queued; nothing is baselined until a drained flush settles it.
    const entries = ledger.readLedger(env.root).entries;
    const index = outbox.readCacheIndex(env.root);
    assert.ok(Object.hasOwn(entries, env.paths.deferredTrd), 'the deferred TRD is ledgered');
    assert.equal(Object.hasOwn(index, env.paths.deferredTrd), false, 'and not baselined');
  });

  test('4: a default real import closes the shipped TRDs, objectives and milestone (2 objectives)', (t) => {
    const env = useBackfillEnv(t, { objectives: 2 });
    if (!env) return;
    setGithub(env.root, { store: true });

    const r = planImport(env.root);
    assert.equal(r.ok, true, JSON.stringify({ error: r.error, flush: r.flush }));
    assert.equal(r.exit, 0, r.prose);
    assert.equal(r.flush.status, 'flushed');
    assert.deepEqual(r.history, { closed_completed: env.shape.trds + env.shape.objectives, closed_not_planned: 0 });

    const mapping = mappingLib.readMappingV3(env.root);
    for (let n = 1; n <= env.shape.objectives; n++) {
      const objective = issueOf(env, mappingLib.getEntry(mapping, String(n)).issue_id);
      assert.equal(objective.state, 'CLOSED', `objective ${n} closed`);
      assert.equal(objective.stateReason, 'completed');
      for (let m = 1; m <= env.shape.trdsPerObjective; m++) {
        const id = `${n}-${String(m).padStart(2, '0')}`;
        const trd = issueOf(env, mappingLib.getTrd(mapping, id).issue_number);
        assert.equal(trd.state, 'CLOSED', `TRD ${id} closed`);
        assert.equal(trd.stateReason, 'completed', id);
      }
    }
    assert.deepEqual(env.fake.milestones.map((m) => [m.title, m.state]), [['v0.1', 'closed']], 'a shipped MILESTONES.md section closes');

    const again = planImport(env.root);
    assert.equal(again.ok, true, JSON.stringify(again.error));
    assert.equal(again.estimate.history_closes, 0, 'a second import closes nothing again');
  });

  // Slow-ish (~10 s): the whole 20-objective backfill against the fake, but on fake time (no real sleep).
  test('5: calibration: a drained real import writes within [0.6, 1] x writes_max', { timeout: 300000 }, (t) => {
    const env = useBackfillEnv(t);
    if (!env) return;
    setGithub(env.root, { store: true });
    const { estimate } = planImport(env.root, { dryRun: true });
    assert.ok(estimate.writes_max > 0);

    const r = planImport(env.root);
    assert.equal(r.ok, true, JSON.stringify({ error: r.error, flush: r.flush }));
    let status = r.flush.status;
    for (let round = 0; status !== 'flushed' && round <= estimate.hour_windows + 2; round++) {
      env.clock.t += HOUR_MS + 1000; // past the hourly window; a new run gets a new per-run budget
      nextRun(env);
      status = flushLib.flush(env.root, { wait: true }).status;
    }
    assert.equal(status, 'flushed', 'the backfill drains');

    const writes = env.fake.writes().length;
    assert.ok(writes <= estimate.writes_max, `writes ${writes} <= writes_max ${estimate.writes_max} (an upper bound)`);
    assert.ok(writes >= 0.6 * estimate.writes_max, `writes ${writes} >= 0.6 x writes_max ${estimate.writes_max} (not padded)`);
  });
});
