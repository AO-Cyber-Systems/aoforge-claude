'use strict';

/**
 * gh-backfill.test.cjs — TRD 51-03 (GMD-01, GMD-02)
 *
 * The pure core of the GitHub backfill: classify local history (shipped / cancelled / open objectives, done /
 * deferred / open TRDs) and turn finished work into `patch-issue` close ops (G1), price a backfill with an
 * upper-bound request estimate (G3), detect a queue to resume, and book live writes into the budget window (G5).
 * Test 8 (the seam guard) lives in gh-seam.repo.test.cjs.
 *
 * Fixtures are hand-built under os.tmpdir() (`makeStoreProject` for one objective with TRDs, small inline
 * writers for multi-objective histories). Nothing here calls GitHub: gh-client's runner is replaced with one
 * that throws, so any gh call fails the test that made it. Nothing touches the real ~/.claude.
 */

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backfill = require('./gh-backfill.cjs');
const outbox = require('./gh-outbox.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const client = require('./gh-client.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

// Any gh call from the code under test is a failure: the backfill core is local-only.
before(() => {
  client._setRunGh(() => {
    throw new Error('gh-backfill must not call gh');
  });
});
after(() => client._setRunGh(null));

// ─── inline fixture helpers ──────────────────────────────────────────────────

const doc = (lines) => `${lines.join('\n')}\n`;

function trdText(objectiveDir, nn, wave = 1) {
  return doc([
    '---',
    `objective: ${objectiveDir}`,
    `trd: "${nn}"`,
    'type: standard',
    `wave: ${wave}`,
    'depends_on: []',
    '---',
    '',
    `# TRD ${nn}`,
  ]);
}

function objectiveText(status) {
  const fm = ['---', 'work: feature'];
  if (status) fm.push(`status: ${status}`);
  fm.push('---', '', '# Objective');
  return doc(fm);
}

/**
 * Write a multi-objective project. `spec` is `[{dir, status?, trds: [{nn, slug, summary:boolean}]}]`;
 * `progress` is a list of `| first cell | status |` pairs rendered as the ROADMAP Progress table.
 */
function writeHistoryProject(spec, progress = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-backfill-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(path.join(planning, 'objectives'), { recursive: true });
  const roadmap = ['# Roadmap', '', '## Objectives', ''];
  for (const o of spec) roadmap.push(`### Objective ${o.dir.split('-')[0]}: ${o.dir}`, '');
  if (progress.length > 0) {
    roadmap.push('## Progress', '', '| Objective | Milestone | Plans | Status | Completed |', '|---|---|---|---|---|');
    for (const [cell, status] of progress) roadmap.push(`| ${cell} | v1.0 | 1/1 | ${status} | 2026-01-01 |`);
    roadmap.push('');
  }
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), doc(roadmap));
  for (const o of spec) {
    const dir = path.join(planning, 'objectives', o.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'OBJECTIVE.md'), objectiveText(o.status));
    const prefix = o.dir.split('-')[0];
    for (const t of o.trds || []) {
      fs.writeFileSync(path.join(dir, `${prefix}-${t.nn}-${t.slug}-TRD.md`), trdText(o.dir, t.nn));
      if (t.summary) fs.writeFileSync(path.join(dir, `${prefix}-${t.nn}-SUMMARY.md`), doc(['# Summary']));
    }
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const byId = (history, id) => history.objectives.find((o) => o.id === id);
const trdStates = (objective) => Object.fromEntries(objective.trds.map((t) => [t.id, t.state]));

function assertValidOps(ops) {
  for (const op of ops) {
    const v = outbox.validateOp(op);
    assert.ok(v.ok, `op must pass outbox.validateOp: ${v.error} in ${JSON.stringify(op)}`);
  }
}

const closeOp = (id, reason) => ({ kind: 'patch-issue', target: { id }, payload: { state: 'closed', state_reason: reason } });

// ─── test 1: the Progress parser ─────────────────────────────────────────────

describe('parseProgress (test 1)', () => {
  const roadmap = doc([
    '# Roadmap',
    '',
    '## Objectives',
    '',
    '| 99. Not the progress table | v9 | 1/1 | Complete | 2026-01-01 |',
    '',
    '## Progress',
    '',
    '| Objective | Milestone | Plans | Status | Completed |',
    '|---|---|---|---|---|',
    '| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |',
    '| 27-41 (15 objectives) | v1.3 | 107/109 | Complete (27-03, 28-06 deferred) | 2026-09-28 |',
    '| 42. Codebase-aware stack drafter | v1.4 | 15/15 | Verified: gaps_found (5/6 SC) | 2026-09-29 |',
    '| 26. GitHub issue auto-build monitor | v1.4 | 0/— | Cancelled (killed in 51-01) | — |',
    '| 2.1. A decimal insert | v1.1 | 1/1 | Complete | 2026-05-01 |',
    '',
    '## Notes',
    '',
    '| 98. After the progress table | v9 | 1/1 | Complete | 2026-01-01 |',
  ]);

  test('the three first-cell shapes yield the right objective sets', () => {
    const rows = backfill.parseProgress(roadmap);
    assert.equal(rows.length, 5, 'only rows of the ## Progress table are parsed');

    assert.deepEqual(rows[0].ids, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '24'], 'en-dash range + comma list');
    assert.equal(rows[0].state, 'complete');

    const range = [];
    for (let n = 27; n <= 41; n++) range.push(String(n));
    assert.deepEqual(rows[1].ids, range, 'hyphen range');
    assert.equal(rows[1].state, 'complete', 'a status cell starting "Complete" is complete');

    assert.deepEqual(rows[2].ids, ['42'], '"42. Name" shape');
    assert.equal(rows[2].state, null, 'a verified-with-gaps status is neither complete nor cancelled');

    assert.deepEqual(rows[3].ids, ['26']);
    assert.equal(rows[3].state, 'cancelled', 'a status cell starting "Cancelled" is cancelled');

    assert.deepEqual(rows[4].ids, ['2.1'], 'a decimal objective in the name shape');
  });

  test('progressStateOf: which row covers an objective', () => {
    const rows = backfill.parseProgress(roadmap);
    assert.equal(backfill.progressStateOf(rows, '6'), 'complete');
    assert.equal(backfill.progressStateOf(rows, '06-unified-check-todos'), 'complete', 'any spelling of the id');
    assert.equal(backfill.progressStateOf(rows, '24'), 'complete');
    assert.equal(backfill.progressStateOf(rows, '33'), 'complete');
    assert.equal(backfill.progressStateOf(rows, '26'), 'cancelled');
    assert.equal(backfill.progressStateOf(rows, '42'), null);
    assert.equal(backfill.progressStateOf(rows, '25'), null, 'not covered by any row');
    assert.equal(backfill.progressStateOf(rows, '99'), null, 'a table outside ## Progress is ignored');
    assert.equal(backfill.progressStateOf(rows, '98'), null, 'a table after ## Progress is ignored');
    assert.equal(backfill.progressStateOf(rows, '2.1'), 'complete');
  });

  test('a missing or malformed table is total: no rows, never a throw', () => {
    assert.deepEqual(backfill.parseProgress(''), []);
    assert.deepEqual(backfill.parseProgress(null), []);
    assert.deepEqual(backfill.parseProgress('## Progress\n\nno table here\n'), []);
    assert.deepEqual(backfill.parseProgress('## Progress\n\n| Objective | Plans |\n|---|---|\n| 1. A | 1/1 |\n'), [],
      'a table without a Status column classifies nothing');
    assert.equal(backfill.progressStateOf([], '1'), null);
  });
});

// ─── test 2: historyOf ───────────────────────────────────────────────────────

describe('historyOf (test 2)', () => {
  let project;
  before(() => {
    project = writeHistoryProject([
      { dir: '01-status-complete', status: 'complete', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: false }] },
      { dir: '02-all-summarised', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: true }] },
      { dir: '03-progress-range', status: 'registered', trds: [{ nn: '01', slug: 'a', summary: false }] },
      { dir: '04-progress-range', trds: [] },
      { dir: '05-status-cancelled', status: 'cancelled', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: false }] },
      { dir: '06-partial', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: false }] },
      { dir: '07-progress-cancelled', trds: [{ nn: '01', slug: 'a', summary: false }] },
      { dir: '08-no-trds', trds: [] },
      { dir: '09-reopened', status: 'reopened', trds: [{ nn: '01', slug: 'a', summary: true }] },
    ], [
      ['3–4 (2 objectives)', 'Complete'],
      ['7. Progress cancelled', 'Cancelled'],
      ['9. Reopened', 'Complete'],
    ]);
  });
  after(() => project.cleanup());

  test('every objective is classified from local files only', () => {
    const h = backfill.historyOf(project.root);
    assert.deepEqual(h.objectives.map((o) => o.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);

    assert.equal(byId(h, '1').state, 'shipped', 'status: complete');
    assert.equal(byId(h, '1').source, 'frontmatter');
    assert.equal(byId(h, '2').state, 'shipped', 'all TRDs summarised and no status');
    assert.equal(byId(h, '2').source, 'summaries');
    assert.equal(byId(h, '3').state, 'shipped', 'progress Complete covering a range');
    assert.equal(byId(h, '3').source, 'progress');
    assert.equal(byId(h, '4').state, 'shipped', 'the same range covers its other end');
    assert.equal(byId(h, '5').state, 'cancelled', 'status: cancelled');
    assert.equal(byId(h, '6').state, 'open', 'partial SUMMARYs and no status');
    assert.equal(byId(h, '7').state, 'cancelled', 'progress Cancelled');
    assert.equal(byId(h, '8').state, 'open', 'no TRDs and nothing else: open (an empty objective is not shipped)');
    assert.equal(byId(h, '9').state, 'open', 'status: reopened beats a stale Complete progress row');
  });

  test('TRDs are done (SUMMARY), deferred (no SUMMARY in a shipped objective) or open', () => {
    const h = backfill.historyOf(project.root);
    assert.deepEqual(trdStates(byId(h, '1')), { '1-01': 'done', '1-02': 'deferred' });
    assert.deepEqual(trdStates(byId(h, '2')), { '2-01': 'done', '2-02': 'done' });
    assert.deepEqual(trdStates(byId(h, '3')), { '3-01': 'deferred' });
    assert.deepEqual(trdStates(byId(h, '5')), { '5-01': 'done', '5-02': 'cancelled' });
    assert.deepEqual(trdStates(byId(h, '6')), { '6-01': 'done', '6-02': 'open' });
    assert.deepEqual(trdStates(byId(h, '7')), { '7-01': 'cancelled' });
    assert.equal(byId(h, '1').trds[0].summary, '01-01-SUMMARY.md', 'the SUMMARY file is named as written');
    assert.equal(byId(h, '1').trds[1].summary, null);
  });

  test('a legacy file name is skipped with a warning, never classified', () => {
    const dir = path.join(project.root, '.planning', 'objectives', '06-partial');
    fs.writeFileSync(path.join(dir, '06-03a-legacy-TRD.md'), trdText('06-partial', '03a'));
    try {
      const h = backfill.historyOf(project.root);
      assert.deepEqual(Object.keys(trdStates(byId(h, '6'))), ['6-01', '6-02']);
      assert.ok(h.warnings.some((w) => w.includes('06-03a-legacy-TRD.md')), h.warnings.join('\n'));
    } finally {
      fs.rmSync(path.join(dir, '06-03a-legacy-TRD.md'));
    }
  });

  test('a project with no .planning/ is an empty history, not a throw', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-backfill-empty-'));
    try {
      assert.deepEqual(backfill.historyOf(empty).objectives, []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ─── test 3: historyOps ──────────────────────────────────────────────────────

describe('historyOps (test 3)', () => {
  const objectiveFile = (p) => path.join(p.root, '.planning', 'objectives', p.objectiveDir, 'OBJECTIVE.md');
  const setStatus = (p, status) => {
    const file = objectiveFile(p);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^status: .*$/m, `status: ${status}`));
  };
  const objectiveDir = (p) => path.join(p.root, '.planning', 'objectives', p.objectiveDir);

  test('shipped objective, 3 TRDs (one deferred): 2 completed + 1 not_planned TRD ops, then the objective', () => {
    const p = makeStoreProject();
    try {
      setStatus(p, 'complete');
      fs.writeFileSync(path.join(objectiveDir(p), '07-02-beta-SUMMARY.md'), doc(['# Beta Summary']));
      const ops = backfill.historyOps(p.root, ['7']);
      assert.deepEqual(ops, [
        closeOp('7-01', 'completed'),
        closeOp('7-02', 'completed'),
        closeOp('7-03', 'not_planned'),
        closeOp('7', 'completed'),
      ]);
      assertValidOps(ops);
    } finally {
      p.cleanup();
    }
  });

  test('cancelled objective: every un-summarised TRD and the objective close as not_planned', () => {
    const p = makeStoreProject();
    try {
      setStatus(p, 'cancelled');
      fs.rmSync(path.join(objectiveDir(p), p.summaryFile));
      const ops = backfill.historyOps(p.root, ['7']);
      assert.deepEqual(ops, [
        closeOp('7-01', 'not_planned'),
        closeOp('7-02', 'not_planned'),
        closeOp('7-03', 'not_planned'),
        closeOp('7', 'not_planned'),
      ]);
      assertValidOps(ops);
    } finally {
      p.cleanup();
    }
  });

  test('cancelled objective: a TRD that did ship still closes as completed', () => {
    const p = makeStoreProject();
    try {
      setStatus(p, 'cancelled');
      const ops = backfill.historyOps(p.root, ['7']);
      assert.deepEqual(ops, [
        closeOp('7-01', 'completed'),
        closeOp('7-02', 'not_planned'),
        closeOp('7-03', 'not_planned'),
        closeOp('7', 'not_planned'),
      ]);
      assertValidOps(ops);
    } finally {
      p.cleanup();
    }
  });

  test('open objective: ops only for summarised TRDs, no objective op', () => {
    const p = makeStoreProject();
    try {
      const ops = backfill.historyOps(p.root, ['7']);
      assert.deepEqual(ops, [closeOp('7-01', 'completed')]);
      assertValidOps(ops);
    } finally {
      p.cleanup();
    }
  });

  test('ids: any spelling selects the objective, an unknown id selects nothing, no ids means every objective', () => {
    const p = makeStoreProject();
    try {
      assert.deepEqual(backfill.historyOps(p.root, ['07-store-demo']), [closeOp('7-01', 'completed')]);
      assert.deepEqual(backfill.historyOps(p.root, ['8']), []);
      assert.deepEqual(backfill.historyOps(p.root, []), []);
      assert.deepEqual(backfill.historyOps(p.root), [closeOp('7-01', 'completed')]);
    } finally {
      p.cleanup();
    }
  });

  test('every target id is one the hierarchy push creates, so the flusher patches the right issue', () => {
    const p = makeStoreProject();
    try {
      setStatus(p, 'complete');
      const ops = backfill.historyOps(p.root, ['7']);
      const plan = ghHierarchy.planPush(p.root, '7');
      assert.ok(plan.ok, plan.error || plan.message);
      const built = ghHierarchy.buildOps(plan);
      const created = new Set([plan.objective.id, ...built.filter((o) => o.kind === 'upsert-issue').map((o) => o.target.id)]);
      for (const op of ops) assert.ok(created.has(op.target.id), `${op.target.id} is not an id buildOps targets`);
      assert.equal(ops.length, created.size, 'one close op per issue the push creates');
    } finally {
      p.cleanup();
    }
  });

  test('a multi-objective history: objectives in id order, each objective op after its TRD ops', () => {
    const project = writeHistoryProject([
      { dir: '01-shipped', status: 'complete', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: false }] },
      { dir: '02-open', trds: [{ nn: '01', slug: 'a', summary: true }, { nn: '02', slug: 'b', summary: false }] },
      { dir: '10-cancelled', status: 'cancelled', trds: [] },
    ]);
    try {
      const ops = backfill.historyOps(project.root);
      assert.deepEqual(ops, [
        closeOp('1-01', 'completed'),
        closeOp('1-02', 'not_planned'),
        closeOp('1', 'completed'),
        closeOp('2-01', 'completed'),
        closeOp('10', 'not_planned'),
      ]);
      assertValidOps(ops);
    } finally {
      project.cleanup();
    }
  });
});

// ─── test 4: estimate, the cost table ────────────────────────────────────────

/** A minimal op of `kind`; only `kind` (and set-fields' `values`) matter to the estimate. */
const opOf = (kind, payload = {}) => ({ kind, target: { id: '7' }, payload });
const repeat = (n, kind, payload) => Array.from({ length: n }, () => opOf(kind, payload));

describe('estimate (test 4)', () => {
  test('the cost table holds the documented upper bounds', () => {
    assert.deepEqual({ ...backfill.COST }, {
      'upsert-issue': 2,
      'link-sub-issue': 1,
      block: 1,
      'upsert-comment': 1,
      'patch-issue': 1,
      'patch-body': 1,
      'set-fields': 4,
      'wiki-push': 0,
      milestone: 2,
      'live-create': 3,
      unknown: 2,
      read: 2,
    });
    assert.ok(Object.isFrozen(backfill.COST), 'the table is frozen');
  });

  test('a hand-built op list plus one live create prices exactly from COST', () => {
    const ops = [
      ...repeat(3, 'upsert-issue'),
      ...repeat(2, 'link-sub-issue'),
      ...repeat(1, 'block'),
      ...repeat(2, 'patch-issue'),
      ...repeat(1, 'wiki-push'),
    ];
    const e = backfill.estimate({ ops, live_creates: 1 });
    const C = backfill.COST;
    assert.equal(e.writes_max, 3 * C['upsert-issue'] + 2 * C['link-sub-issue'] + C.block + 2 * C['patch-issue'] + C['wiki-push'] + C['live-create']);
    assert.equal(e.writes_max, 14);
    assert.equal(e.ops, 10, 'nine listed ops and one live create');
    assert.equal(e.reads_approx, 10 * C.read, 'two reads per op (informational)');
    assert.deepEqual(e.by_kind, {
      'upsert-issue': 3, 'link-sub-issue': 2, block: 1, 'patch-issue': 2, 'wiki-push': 1, 'live-create': 1,
    });
    assert.deepEqual(e.writes_by_kind, {
      'upsert-issue': 6, 'link-sub-issue': 2, block: 1, 'patch-issue': 2, 'wiki-push': 0, 'live-create': 3,
    });
    assert.equal(e.live_creates, 1);
    assert.equal(e.wiki_pushes, 0, 'wiki pushes passed as a count, none here');
    assert.equal(e.milestones, 0);
    assert.deepEqual(e.unknown_kinds, []);
  });

  test('an unknown kind is priced at 2 and listed; set-fields costs one write per field (4 when it cannot tell)', () => {
    const e = backfill.estimate({
      ops: [
        opOf('mystery'),
        opOf('mystery'),
        opOf('upsert-pr'),
        opOf('set-fields', { values: { work: 'feature', kind: 'plugin' } }),
        opOf('set-fields', {}),
        null,
      ],
    });
    assert.deepEqual(e.unknown_kinds, ['(invalid)', 'mystery', 'upsert-pr'], 'sorted, deduped');
    assert.equal(e.by_kind.mystery, 2);
    assert.equal(e.writes_by_kind.mystery, 4);
    assert.equal(e.writes_by_kind['upsert-pr'], 2, 'an outbox kind the table does not price is never under-estimated');
    assert.equal(e.writes_by_kind['set-fields'], 2 + 4);
    assert.equal(e.writes_max, 4 + 2 + 6 + 2, 'a null op is junk priced like an unknown kind');
  });

  test('wiki pushes, milestones and live creates passed as counts', () => {
    const e = backfill.estimate({ ops: [], live_creates: 2, wiki_pushes: 1, milestones: 3 });
    assert.equal(e.writes_max, 2 * 3 + 0 + 3 * 2);
    assert.equal(e.ops, 6);
    assert.deepEqual(e.by_kind, { 'live-create': 2, 'wiki-push': 1, milestone: 3 });
  });

  test('estimate is pure and total: junk input is zero, never a throw, and the input is not mutated', () => {
    for (const junk of [undefined, null, 7, 'x', { ops: 'nope' }, { live_creates: -2, milestones: Number.NaN }]) {
      const e = backfill.estimate(junk);
      assert.equal(e.writes_max, 0, JSON.stringify(junk));
      assert.equal(e.ops, 0);
    }
    const input = { ops: [opOf('block')], live_creates: 1 };
    const frozen = JSON.stringify(input);
    backfill.estimate(input);
    assert.equal(JSON.stringify(input), frozen);
    assert.deepEqual(backfill.estimate([opOf('block')]).by_kind, { block: 1 }, 'a bare op array is the op list');
    assert.equal(backfill.estimate({ live_creates: 1.5 }).live_creates, 2, 'a fractional count rounds up (an upper bound)');
  });
});

// ─── test 5: estimate time fields and rendering ──────────────────────────────

describe('estimate time fields (test 5)', () => {
  test('900 writes: 12 minutes at least, 2 hour windows, 1 full hourly wait', () => {
    const e = backfill.estimate({ ops: repeat(450, 'upsert-issue') });
    assert.equal(e.writes_max, 900);
    assert.equal(e.minutes_min, 12);
    assert.equal(e.hour_windows, 2);
    assert.equal(e.hours_min, 1);
    assert.equal(e.minutes_min, Math.ceil(900 / outbox.BUDGET.minute), 'paced by outbox.BUDGET');
    assert.equal(e.hour_windows, Math.ceil(900 / outbox.BUDGET.hour));
  });

  test('0 writes: every time field is zero', () => {
    const e = backfill.estimate({ ops: repeat(3, 'wiki-push') });
    assert.equal(e.writes_max, 0);
    assert.equal(e.minutes_min, 0);
    assert.equal(e.hour_windows, 0);
    assert.equal(e.hours_min, 0);
  });

  test('the hour boundary: 450 writes fit one window, 451 need a second', () => {
    const at = (n) => backfill.estimate({ ops: repeat(n, 'patch-issue') });
    assert.deepEqual([at(450).hour_windows, at(450).hours_min], [1, 0]);
    assert.deepEqual([at(451).hour_windows, at(451).hours_min], [2, 1]);
  });

  test('renderEstimate is one line naming the upper bound, the op count and the pacing', () => {
    const big = backfill.estimate({ ops: [...repeat(540, 'link-sub-issue'), ...repeat(72, 'wiki-push')] });
    assert.equal(backfill.renderEstimate(big),
      '~540 writes (upper bound) in 612 ops; at 80/min and 450/h at least 1 h of hourly-budget waits');

    const small = backfill.estimate({ ops: repeat(9, 'link-sub-issue'), live_creates: 1 });
    assert.equal(backfill.renderEstimate(small),
      '~12 writes (upper bound) in 10 ops; at 80/min and 450/h at least 1 min, within one hourly budget');

    assert.equal(backfill.renderEstimate(backfill.estimate({})), '~0 writes (upper bound) in 0 ops; nothing to pace');

    const odd = backfill.renderEstimate(backfill.estimate({ ops: [opOf('mystery')] }));
    assert.match(odd, /1 op of unknown kind \(mystery\) priced at 2 writes/);
    assert.ok(!odd.includes('\n'), 'one line');
    assert.equal(backfill.renderEstimate(null), backfill.renderEstimate(backfill.estimate({})), 'total');
  });
});

// ─── tests 6 and 7: the journal helpers ──────────────────────────────────────

describe('journal helpers (tests 6, 7)', () => {
  let env;
  let root;
  const T = Date.UTC(2026, 9, 1, 12, 0, 0);
  const patch = (id) => ({ kind: 'patch-issue', target: { id }, payload: { state: 'closed', state_reason: 'completed' } });

  before(() => {
    env = hermeticEnv();
  });
  after(() => env.restore());

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-backfill-journal-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: true, repo: 'o/r' } }));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('6: no journal reports all zeros and creates nothing', () => {
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 0, blocked: 0, halted: 0, any: false });
    assert.equal(fs.existsSync(outbox.journalPath(root)), false, 'reading never creates the journal');
  });

  test('6: pending, blocked and halted ops are counted', () => {
    assert.ok(outbox.enqueue(root, [patch('7-01'), patch('7-02'), patch('7-03')], { now: T }).ok);
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 3, blocked: 0, halted: 0, any: true });

    assert.ok(outbox.markBlocked(root, 2, 'needs a human').ok);
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 2, blocked: 1, halted: 0, any: true });

    assert.ok(outbox.setHalted(root, { reason: 'remote-edit', seq: 1, detail: 'edited on GitHub' }).ok);
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 2, blocked: 1, halted: 1, any: true });
  });

  test('6: a blocked op at the head of the queue halts it', () => {
    assert.ok(outbox.enqueue(root, [patch('7-01'), patch('7-02')], { now: T }).ok);
    assert.ok(outbox.markBlocked(root, 1, 'needs a human').ok);
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 1, blocked: 1, halted: 1, any: true });
  });

  test('6: done ops alone are nothing to resume', () => {
    assert.ok(outbox.enqueue(root, [patch('7-01')], { now: T }).ok);
    assert.ok(outbox.markDone(root, 1).ok);
    assert.deepEqual(backfill.hasPendingOps(root), { pending: 0, blocked: 0, halted: 0, any: false });
  });

  test('7: recordLiveWrites adds n writes to the budget window at now', () => {
    assert.ok(outbox.enqueue(root, [patch('7-01')], { now: T }).ok);
    const before = outbox.budgetCheck(outbox.readJournal(root).journal, T);
    assert.equal(before.minute, 0);

    const r = backfill.recordLiveWrites(root, 3, T);
    assert.equal(r.ok, true);
    assert.equal(r.recorded, 3);

    const { journal } = outbox.readJournal(root);
    const after = outbox.budgetCheck(journal, T);
    assert.equal(after.minute, before.minute + 3);
    assert.equal(after.hour, before.hour + 3);
    assert.equal(journal.ops.length, 1, 'queued ops are kept');
    assert.equal(journal.ops[0].status, 'pending');

    backfill.recordLiveWrites(root, 2, T + 1000);
    assert.equal(outbox.budgetCheck(outbox.readJournal(root).journal, T + 1000).minute, 5, 'writes accumulate');
    assert.equal(outbox.budgetCheck(outbox.readJournal(root).journal, T + 61 * 1000).minute, 0, 'and age out of the minute');
  });

  test('7: recordLiveWrites creates the journal when there is none yet', () => {
    backfill.recordLiveWrites(root, 2, T);
    assert.equal(outbox.budgetCheck(outbox.readJournal(root).journal, T).minute, 2);
  });

  test('7: n <= 0 (or not a number) is a no-op that leaves the journal file untouched', () => {
    for (const n of [0, -1, Number.NaN, undefined, 'three']) {
      const r = backfill.recordLiveWrites(root, n, T);
      assert.deepEqual(r, { ok: true, recorded: 0 }, String(n));
    }
    assert.equal(fs.existsSync(outbox.journalPath(root)), false, 'no journal is created');

    assert.ok(outbox.enqueue(root, [patch('7-01')], { now: T }).ok);
    const file = outbox.journalPath(root);
    const text = fs.readFileSync(file, 'utf8');
    const mtime = fs.statSync(file).mtimeMs;
    backfill.recordLiveWrites(root, 0, T + 5000);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
  });
});
