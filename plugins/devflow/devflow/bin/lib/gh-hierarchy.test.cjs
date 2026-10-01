'use strict';

/**
 * Tests for lib/gh-hierarchy.cjs (TRD 47-09): one local objective -> the ordered outbox ops that build its
 * GitHub hierarchy (objective -> TRD sub-issues -> blocked-by edges, Decisions, pages).
 *
 * Hermetic: the fake GitHub (`__fixtures__/gh-fake.cjs`) is installed through the client seam, HOME / outbox
 * / cache dirs are temp dirs from `hermeticEnv()`, and the wiki is a local bare repo. Nothing here reaches
 * GitHub or the real ~/.claude, and nothing binds a port.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hierarchy = require('./gh-hierarchy.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const trd = require('./gh-trd.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

const objectiveDir = (root) => path.join(root, '.planning', 'objectives', STORE_FIXTURE.objectiveDir);

// ─── Pure planning (tests 1-4) ───────────────────────────────────────────────

describe('pure planning', () => {
  let envh;
  let project;
  beforeEach(() => {
    envh = hermeticEnv();
    project = makeStoreProject({ store: true });
    // planning is local-only: any gh call from it is a bug, so make it loud
    client._setRunGh(() => { throw new Error('pure planning must not call gh'); });
  });
  afterEach(() => {
    client._resetClient();
    envh.restore();
    project.cleanup();
  });

  test('1. readObjectiveTrds lists the TRD files of the objective, sorted by id, text verbatim', () => {
    const trds = hierarchy.readObjectiveTrds(project.root, '7');
    assert.deepEqual(trds.map((t) => t.id), ['7-01', '7-02', '7-03']);
    assert.deepEqual(trds.map((t) => t.file), STORE_FIXTURE.trdFiles);
    assert.deepEqual(trds.map((t) => t.wave), [1, 1, 2]);
    assert.deepEqual(trds.map((t) => t.depends_on), [[], [], ['7-01']]);
    for (const t of trds) {
      assert.equal(t.text, STORE_FIXTURE.trds[t.file], `${t.id} text is the file, byte for byte`);
      assert.deepEqual(Object.keys(t).sort(), ['depends_on', 'file', 'id', 'text', 'wave']);
    }
    assert.equal(trds[2].text.endsWith('\n'), false, 'the fixture TRD without a trailing newline is not trimmed or padded');
  });

  test('1b. any spelling of the objective works; SUMMARY and other files are not TRDs; a stray TRD of another objective is skipped with a warning', () => {
    fs.writeFileSync(path.join(objectiveDir(project.root), '08-01-stray-TRD.md'), '---\nwave: 1\n---\n# stray\n');
    fs.writeFileSync(path.join(objectiveDir(project.root), '07-notes.md'), 'not a TRD\n');
    const warnings = [];
    const trds = hierarchy.readObjectiveTrds(project.root, '07-store-demo', { warnings });
    assert.deepEqual(trds.map((t) => t.id), ['7-01', '7-02', '7-03']);
    assert.ok(warnings.some((w) => /08-01-stray-TRD\.md/.test(w)), JSON.stringify(warnings));
  });

  test('1c. an unknown objective is an error naming it', () => {
    assert.throws(() => hierarchy.readObjectiveTrds(project.root, '99'), /objective 99/);
  });

  test('2. waveEdges: depends_on edges, implicit lower-wave edges, normalised ids, warnings, cycles', () => {
    const fromDisk = hierarchy.readObjectiveTrds(project.root, '7');
    assert.deepEqual(hierarchy.waveEdges(fromDisk), [{ blocker: '7-01', blocked: '7-03' }]);

    const t = (id, wave, depends_on = []) => ({ id, file: `x-${id}`, text: '', wave, depends_on });

    // a wave-2 TRD with empty depends_on is blocked by every wave-1 TRD
    assert.deepEqual(
      hierarchy.waveEdges([t('7-01', 1), t('7-02', 1), t('7-03', 2)]),
      [{ blocker: '7-01', blocked: '7-03' }, { blocker: '7-02', blocked: '7-03' }],
    );

    // ... and a wave-3 TRD only by the NEAREST lower wave
    assert.deepEqual(
      hierarchy.waveEdges([t('7-01', 1), t('7-02', 2), t('7-03', 3)]),
      [{ blocker: '7-01', blocked: '7-02' }, { blocker: '7-02', blocked: '7-03' }],
    );

    // a declared dependency wins over the implicit edges; the slug form is normalised
    assert.deepEqual(
      hierarchy.waveEdges([t('7-01', 1), t('7-02', 1), t('7-03', 2, ['07-02-beta'])]),
      [{ blocker: '7-02', blocked: '7-03' }],
    );

    // wave 1 with no dependencies has no edges; duplicates collapse
    assert.deepEqual(hierarchy.waveEdges([t('7-01', 1), t('7-02', 2, ['7-01', '07-01'])]), [{ blocker: '7-01', blocked: '7-02' }]);

    // a dependency on a TRD that is not in the objective: a warning and no edge
    const warnings = [];
    assert.deepEqual(hierarchy.waveEdges([t('7-01', 1), t('7-02', 1, ['7-09']), t('7-03', 1, ['8-01'])], { warnings }), []);
    assert.ok(warnings.some((w) => /7-09/.test(w)), JSON.stringify(warnings));
    assert.ok(warnings.some((w) => /8-01/.test(w)), JSON.stringify(warnings));

    // a cycle is an error naming the TRDs on it
    assert.throws(
      () => hierarchy.waveEdges([t('7-01', 1, ['7-02']), t('7-02', 1, ['7-01'])]),
      /cycle.*7-01.*7-02|cycle.*7-02.*7-01/i,
    );
    assert.throws(() => hierarchy.waveEdges([t('7-01', 1, ['7-01'])]), /cycle/i);
  });

  test('3. planPush: oversized TRDs refuse the whole objective and name every offender; exactly 60,000 is ok with a warning', () => {
    // re-assert the fixture lengths against the real codec
    for (const n of [60000, 60001]) {
      const text = oversizedTrdText(n, { id: '7-04', file: '07-04-big-TRD.md' });
      assert.equal(trd.encodeTrdBody({ id: '7-04', file: '07-04-big-TRD.md', text }).length, n);
    }

    const dir = objectiveDir(project.root);
    fs.writeFileSync(path.join(dir, '07-04-big-TRD.md'), oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' }));
    fs.writeFileSync(path.join(dir, '07-05-huge-TRD.md'), oversizedTrdText(61000, { id: '7-05', file: '07-05-huge-TRD.md' }));
    const refused = hierarchy.planPush(project.root, '7');
    assert.equal(refused.ok, false);
    assert.equal(refused.refused, 'budget');
    assert.deepEqual(refused.over, [{ id: '7-04', chars: 60001 }, { id: '7-05', chars: 61000 }]);
    assert.match(refused.message, /TRD 07-04 is 60,001 characters \(limit 60,000\): narrow it or move work to a follow-up TRD/);
    assert.match(refused.message, /TRD 07-05 is 61,000 characters/);

    fs.rmSync(path.join(dir, '07-05-huge-TRD.md'));
    fs.writeFileSync(path.join(dir, '07-04-big-TRD.md'), oversizedTrdText(60000, { id: '7-04', file: '07-04-big-TRD.md' }));
    const plan = hierarchy.planPush(project.root, '7');
    assert.equal(plan.ok, true, JSON.stringify(plan));
    assert.deepEqual(plan.warn, [{ id: '7-04', chars: 60000 }]);
    assert.ok(plan.warnings.some((w) => /7-04/.test(w) && /60,000/.test(w)), JSON.stringify(plan.warnings));
  });

  test('3b. more than 100 TRDs refuse the objective; a dependency cycle refuses it too', () => {
    const dir = objectiveDir(project.root);
    for (let i = 4; i <= 101; i++) {
      const nn = String(i).padStart(2, '0');
      fs.writeFileSync(path.join(dir, `07-${nn}-pad-TRD.md`), `---\nwave: 1\ndepends_on: []\n---\n# ${nn}\n`);
    }
    const tooMany = hierarchy.planPush(project.root, '7');
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.refused, 'budget');
    assert.match(tooMany.message, /101 TRDs.*limit is 100|limit is 100/);

    const second = makeStoreProject({ store: true });
    try {
      const d = objectiveDir(second.root);
      fs.writeFileSync(path.join(d, '07-01-alpha-TRD.md'), '---\nwave: 1\ndepends_on: ["07-03"]\n---\n# a\n');
      const cyc = hierarchy.planPush(second.root, '7');
      assert.equal(cyc.ok, false);
      assert.equal(cyc.refused, 'cycle');
      assert.match(cyc.error, /cycle/i);
    } finally {
      second.cleanup();
    }
  });

  test('3c. planPush resolves work, kind, milestone and labels from local files and reads nothing from GitHub', () => {
    const plan = hierarchy.planPush(project.root, '7');
    assert.equal(plan.ok, true, JSON.stringify(plan));
    assert.deepEqual(plan.objective, { id: '7', dir: '07-store-demo' });
    assert.equal(plan.work, 'feature');
    assert.equal(plan.kind, 'plugin');
    assert.equal(plan.milestone_title, 'v9.9');
    assert.deepEqual(plan.labels, { trd: 'devflow:trd', decision: 'devflow:decision' });
    assert.deepEqual(plan.edges, [{ blocker: '7-01', blocked: '7-03' }]);
    assert.deepEqual(plan.summaries.map((s) => [s.trdId, s.file]), [['7-01', '07-01-alpha-SUMMARY.md']]);
    assert.equal(plan.summaries[0].text, STORE_FIXTURE.summary);
    assert.equal(plan.verification, null);
    assert.deepEqual(plan.pages, hierarchy.REFERENCE_PAGES(project.root, '07-store-demo'));
  });

  test('3d. REFERENCE_PAGES names only the cache files that exist and map to a wiki page', () => {
    assert.deepEqual(hierarchy.REFERENCE_PAGES(project.root, '07-store-demo'), [
      'PROJECT.md',
      'REQUIREMENTS.md',
      'objectives/07-store-demo/OBJECTIVE.md',
      'objectives/07-store-demo/07-CONTEXT.md',
      'objectives/07-store-demo/07-RESEARCH.md',
    ]);
    fs.mkdirSync(path.join(project.root, '.planning', 'codebase'));
    fs.writeFileSync(path.join(project.root, '.planning', 'codebase', 'STACK.md'), '# stack\n');
    fs.writeFileSync(path.join(project.root, '.planning', 'codebase', 'notes.txt'), 'x\n');
    fs.rmSync(path.join(project.root, '.planning', 'REQUIREMENTS.md'));
    fs.rmSync(path.join(objectiveDir(project.root), '07-RESEARCH.md'));
    assert.deepEqual(hierarchy.REFERENCE_PAGES(project.root, '07-store-demo'), [
      'PROJECT.md',
      'codebase/STACK.md',
      'objectives/07-store-demo/OBJECTIVE.md',
      'objectives/07-store-demo/07-CONTEXT.md',
    ]);
  });

  test('4. buildOps emits the ops in the documented order, each a valid outbox op', () => {
    const plan = hierarchy.planPush(project.root, '7');
    assert.equal(plan.ok, true);
    const sections = { summary: 'S', criteria: '- [ ] one', footer: 'F', trds: '- [ ] stale', wiki: 'x', meta: 'y' };
    const ops = hierarchy.buildOps(plan, { objectiveSections: sections });

    assert.deepEqual(ops.map((o) => [o.kind, o.target]), [
      ['patch-issue', { id: '7' }],
      ['set-fields', { id: '7' }],
      ['upsert-issue', { id: '7-01', role: 'trd' }],
      ['upsert-issue', { id: '7-02', role: 'trd' }],
      ['upsert-issue', { id: '7-03', role: 'trd' }],
      ['link-sub-issue', { parent: '7', child: '7-01' }],
      ['link-sub-issue', { parent: '7', child: '7-02' }],
      ['link-sub-issue', { parent: '7', child: '7-03' }],
      ['block', { blocked: '7-03', blocker: '7-01' }],
      ['upsert-comment', { id: '7-01', kind: 'summary' }],
      ['wiki-push', { store: 'pages' }],
      ['patch-body', { id: '7' }],
    ]);
    for (const op of ops) assert.deepEqual(outbox.validateOp(op), { ok: true }, `${op.kind}: ${JSON.stringify(outbox.validateOp(op))}`);

    assert.deepEqual(ops[0].payload, { type: 'Objective' });
    assert.deepEqual(ops[1].payload, { values: { work: 'feature', kind: 'plugin' } });
    assert.deepEqual(ops[2].payload, {
      title: '[TRD 07-01] alpha',
      body: trd.encodeTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text: STORE_FIXTURE.trds['07-01-alpha-TRD.md'] }),
      labels: ['devflow:trd'],
      milestone_title: 'v9.9',
      type: 'TRD',
    });
    assert.deepEqual(ops[9].payload, {
      mode: 'replace',
      text: `<!-- devflow:file=07-01-alpha-SUMMARY.md -->\n${STORE_FIXTURE.summary}`,
    });
    assert.deepEqual(ops[10].payload, { pages: plan.pages, message: 'devflow: objective 7' });
    // the objective body has ONE writer: the caller's summary/criteria/footer; wiki, trds and meta are derived
    assert.deepEqual(ops[11].payload, {
      mode: 'managed',
      sections: { summary: 'S', criteria: '- [ ] one', footer: 'F' },
      preserve_ticks: true,
      derive: { wiki: { dir: '07-store-demo' }, trds: true, meta: { type: 'Objective', work: 'feature', kind: 'plugin' } },
    });
  });

  test('4b. buildOps without sections still derives wiki/trds/meta; unknown work/kind and no pages shrink the plan', () => {
    const plan = hierarchy.planPush(project.root, '7');
    const bare = hierarchy.buildOps({ ...plan, work: null, kind: null, summaries: [], pages: [] });
    assert.deepEqual(bare.map((o) => o.kind), [
      'patch-issue', 'upsert-issue', 'upsert-issue', 'upsert-issue',
      'link-sub-issue', 'link-sub-issue', 'link-sub-issue', 'block', 'patch-body',
    ]);
    assert.deepEqual(bare[bare.length - 1].payload, {
      mode: 'managed', sections: {}, preserve_ticks: true,
      derive: { wiki: { dir: '07-store-demo' }, trds: true, meta: { type: 'Objective' } },
    });
  });

  test('4c. a VERIFICATION file becomes the objective verification comment, after the SUMMARY comments', () => {
    fs.writeFileSync(path.join(objectiveDir(project.root), '07-VERIFICATION.md'), '# Verification\n\nAll good.\n');
    const plan = hierarchy.planPush(project.root, '7');
    assert.deepEqual(plan.verification, { file: '07-VERIFICATION.md', text: '# Verification\n\nAll good.\n' });
    const ops = hierarchy.buildOps(plan);
    const kinds = ops.map((o) => `${o.kind}:${o.target.id || ''}:${o.target.kind || ''}`);
    assert.ok(kinds.indexOf('upsert-comment:7:verification') > kinds.indexOf('upsert-comment:7-01:summary'), kinds.join('\n'));
    assert.ok(kinds.indexOf('upsert-comment:7:verification') < kinds.indexOf('wiki-push::'), kinds.join('\n'));
  });
});
