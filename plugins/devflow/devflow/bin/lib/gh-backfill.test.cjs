'use strict';

/**
 * gh-backfill.test.cjs — TRD 51-03 (GMD-01, GMD-02)
 *
 * The pure core of the GitHub backfill: classify local history (shipped / cancelled / open objectives, done /
 * deferred / open TRDs) and turn finished work into `patch-issue` close ops (G1).
 *
 * Fixtures are hand-built under os.tmpdir() (`makeStoreProject` for one objective with TRDs, small inline
 * writers for multi-objective histories). Nothing here calls GitHub: gh-client's runner is replaced with one
 * that throws, so any gh call fails the test that made it. Nothing touches the real ~/.claude.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backfill = require('./gh-backfill.cjs');
const outbox = require('./gh-outbox.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const client = require('./gh-client.cjs');
const { makeStoreProject } = require('./__fixtures__/gh-store-fixtures.cjs');

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
    assert.equal(byId(h, '1').trds[0].summary, '1-01-SUMMARY.md', 'the SUMMARY file is named');
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
