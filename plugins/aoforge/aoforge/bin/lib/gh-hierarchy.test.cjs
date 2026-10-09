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
const { pathToFileURL } = require('node:url');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const trd = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');
const comments = require('./gh-comments.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const objectiveDir = (root) => path.join(root, '.aoforge', 'objectives', STORE_FIXTURE.objectiveDir);

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
    assert.deepEqual(plan.labels, { trd: 'aoforge:trd', decision: 'aoforge:decision' });
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
    fs.mkdirSync(path.join(project.root, '.aoforge', 'codebase'));
    fs.writeFileSync(path.join(project.root, '.aoforge', 'codebase', 'STACK.md'), '# stack\n');
    fs.writeFileSync(path.join(project.root, '.aoforge', 'codebase', 'notes.txt'), 'x\n');
    fs.rmSync(path.join(project.root, '.aoforge', 'REQUIREMENTS.md'));
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
      labels: ['aoforge:trd'],
      milestone_title: 'v9.9',
      type: 'TRD',
    });
    assert.deepEqual(ops[9].payload, {
      mode: 'replace',
      text: `<!-- aoforge:file=07-01-alpha-SUMMARY.md -->\n${STORE_FIXTURE.summary}`,
    });
    assert.deepEqual(ops[10].payload, { pages: plan.pages, message: 'aoforge: objective 7' });
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

// ─── Push + flush on the fake (tests 5-11, 14) ───────────────────────────────

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const SECTIONS = Object.freeze({ summary: 'Summary text', criteria: '- [ ] one\n- [ ] two', footer: 'Footer text' });
const NATIVE = Object.freeze({ types: 'native', fields: 'native', hierarchy: 'native', pages: 'docs', writable: true });
const CAPS = Object.freeze({ issue_fields: { available: true, ids: { work: 11, kind: 12 } } });

/** Per-test state; `useStore()` rebuilds it before every test of the describe it is called in. */
let S;

/**
 * Hermetic env, a store project, a fake GitHub installed through the client seam and a fake clock whose
 * sleep advances it. `AOFORGE_WIKI_REMOTE` points at a path that does not exist, so a test that has not
 * set up a wiki cannot reach a real one by accident.
 */
function useStore({ fake: fakeOverrides = {}, project: projectOverrides = {} } = {}) {
  beforeEach(() => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store: true, ...projectOverrides });
    const fake = createFakeGitHub({ ...project.fakeOptions, ...fakeOverrides });
    const clock = { t: T0, sleeps: [] };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.sleeps.push(ms); clock.t += ms; });
    client._setRunGh(fake.runGh);
    const savedRemote = process.env.AOFORGE_WIKI_REMOTE;
    process.env.AOFORGE_WIKI_REMOTE = pathToFileURL(path.join(envh.root, 'no-wiki.git')).href;
    S = { envh, project, root: project.root, fake, clock, savedRemote };
  });
  afterEach(() => {
    client._resetClient();
    if (S.savedRemote === undefined) delete process.env.AOFORGE_WIKI_REMOTE;
    else process.env.AOFORGE_WIKI_REMOTE = S.savedRemote;
    S.envh.restore();
    S.project.cleanup();
  });
}

const issueByNumber = (n) => S.fake.issues.find((i) => i.number === n);
const mappingNow = () => mappingLib.readMappingV3(S.root);
const trdNumber = (id) => mappingLib.getTrd(mappingNow(), id).issue_number;
const getJson = (endpoint) => JSON.parse(S.fake.runGh(['api', endpoint]).stdout);

/** The objective issue (marker + all four managed sections) seeded in the fake and mapped, as 46 leaves it. */
function seedObjective({ criteria = SECTIONS.criteria } = {}) {
  const body = bodyLib.mergeManaged('', { summary: SECTIONS.summary, criteria, trds: '_None yet._', footer: SECTIONS.footer }, '7').body;
  const n = S.fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['aoforge:objective'] });
  const mapping = mappingNow();
  mappingLib.setEntry(mapping, '7', { issue_id: n });
  assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
  return n;
}

const push = (extra = {}) => hierarchy.pushHierarchy(S.root, '7', { objectiveSections: SECTIONS, flush: true, ...extra });
const journalOps = () => outbox.readJournal(S.root).journal.ops;

/** Run `fn(remote)` with a seeded local wiki remote wired in through AOFORGE_WIKI_REMOTE and isolated git. */
function withWikiRemote(fn) {
  const restoreGit = applyGitTestEnv(path.join(S.envh.root, 'home'));
  const remote = createWikiRemote();
  process.env.AOFORGE_WIKI_REMOTE = remote.remoteUrl;
  try {
    return fn(remote);
  } finally {
    restoreGit();
    remote.cleanup();
  }
}

describe('budget refusal (SC2)', () => {
  useStore();

  test('5. an oversized TRD refuses the objective: zero journal ops, zero gh writes, zero gh calls', () => {
    seedObjective();
    fs.writeFileSync(
      path.join(objectiveDir(S.root), '07-04-big-TRD.md'),
      oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' }),
    );
    const writesBefore = S.fake.writes().length;
    const callsBefore = S.fake.calls().length;

    const res = push();
    assert.equal(res.ok, false);
    assert.equal(res.refused, 'budget');
    assert.deepEqual(res.over, [{ id: '7-04', chars: 60001 }]);
    assert.match(res.message, /TRD 07-04 is 60,001 characters/);

    assert.deepEqual(journalOps(), []);
    assert.equal(S.fake.writes().length, writesBefore);
    assert.equal(S.fake.calls().length, callsBefore, 'the gate runs before any capability probe');
  });

  test('5b. a project with github disabled is skipped; an objective with no issue yet says how to get one', () => {
    const noIssue = push();
    assert.equal(noIssue.ok, false);
    assert.equal(noIssue.error, 'objective 7 has no issue yet; run aof-tools gh sync 7');
    assert.deepEqual(journalOps(), []);

    const cfgFile = path.join(S.root, '.aoforge', 'config.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ github: { enabled: false, repo: 'o/r' } }));
    const off = push();
    assert.equal(off.ok, true);
    assert.equal(off.skipped, true);
    assert.equal(S.fake.calls().length, 0);
  });
});

describe('pushHierarchy: native org with a wiki (SC1 push half)', () => {
  useStore();

  test('6. one push + flush builds sub-issues in id order, the blocked-by edge, TRD bodies, fields and the wiki link', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    const obj = seedObjective();
    withWikiRemote((remote) => {
      const res = push();
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal(res.flush.status, 'flushed', JSON.stringify(res.flush));
      assert.deepEqual(res.degraded, []);

      const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
      assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers);
      assert.deepEqual(getJson(`repos/o/r/issues/${numbers[2]}/dependencies/blocked_by`).map((i) => i.number), [numbers[0]]);
      assert.deepEqual(getJson(`repos/o/r/issues/${numbers[1]}/dependencies/blocked_by`), []);

      for (const [i, id] of ['7-01', '7-02', '7-03'].entries()) {
        const issue = issueByNumber(numbers[i]);
        const file = STORE_FIXTURE.trdFiles[i];
        assert.deepEqual(trd.decodeTrdBody(issue.body), { ok: true, id, file, text: STORE_FIXTURE.trds[file] });
        assert.equal(issue.type, 'TRD');
        assert.ok(issue.labels.includes('aoforge:trd'));
        assert.equal(issue.milestone, 'v9.9');
      }
      assert.equal(issueByNumber(trdNumber('7-03')).title, '[TRD 07-03] gamma');

      const objective = issueByNumber(obj);
      assert.equal(objective.type, 'Objective');
      const fieldValues = JSON.stringify(objective.fieldValues);
      assert.ok(fieldValues.includes('feature') && fieldValues.includes('plugin'), fieldValues);

      // the objective body: caller sections, derived trds line, wiki section at the pushed revision
      assert.equal(bodyLib.extractSection(objective.body, 'summary'), 'Summary text');
      assert.equal(bodyLib.extractSection(objective.body, 'criteria'), SECTIONS.criteria);
      assert.equal(bodyLib.extractSection(objective.body, 'trds'), '3 TRDs, tracked as sub-issues.');
      assert.equal(bodyLib.parseDirMarker(objective.body), '07-store-demo');
      const wikiSection = bodyLib.extractSection(objective.body, 'wiki');
      assert.ok(wikiSection.includes(remote.headSha().slice(0, 7)), wikiSection);
      assert.equal(bodyLib.extractSection(objective.body, 'meta'), null, 'native types and fields need no meta section');

      assert.equal(remote.readRemotePage('Objective-7-store-demo'), STORE_FIXTURE.objective);
      assert.equal(remote.readRemotePage('Project'), STORE_FIXTURE.project);
    });
  });

  test('7. a SUMMARY file becomes a kind=summary comment on its TRD whose decode is the file', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    seedObjective();
    withWikiRemote(() => {
      assert.equal(push().flush.status, 'flushed');
      const n = trdNumber('7-01');
      const mine = S.fake.comments.filter((c) => c.issue_number === n);
      const decoded = comments.decodeFileComment(mine, '7-01', 'summary');
      assert.equal(decoded.ok, true, JSON.stringify(decoded));
      assert.equal(decoded.file, STORE_FIXTURE.summaryFile);
      assert.equal(decoded.text, STORE_FIXTURE.summary);
      assert.equal(S.fake.comments.filter((c) => c.issue_number === trdNumber('7-02')).length, 0);
    });
  });

  test('8. a tick made on GitHub survives a re-push without a halt; an edited criterion TEXT halts', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    const obj = seedObjective();
    withWikiRemote(() => {
      assert.equal(push().flush.status, 'flushed');

      const ticked = issueByNumber(obj).body.replace('- [ ] one', '- [x] one');
      assert.notEqual(ticked, issueByNumber(obj).body);
      S.fake.humanEditBody(obj, ticked);
      const again = push();
      assert.equal(again.flush.status, 'flushed', JSON.stringify(again.flush));
      assert.equal(bodyLib.extractSection(issueByNumber(obj).body, 'criteria'), '- [x] one\n- [ ] two', 'preserve_ticks keeps it');

      S.fake.humanEditBody(obj, issueByNumber(obj).body.replace('- [ ] two', '- [ ] two, reworded by a human'));
      const halted = push();
      assert.equal(halted.flush.status, 'halted', JSON.stringify(halted.flush));
      assert.equal(halted.flush.halted.reason, 'remote-edit');
      assert.match(bodyLib.extractSection(issueByNumber(obj).body, 'criteria'), /reworded by a human/, 'the human text is not overwritten');
    });
  });

  test('9. re-pushing an unchanged objective performs zero gh writes', (t) => {
    if (!gitAvailable()) return t.skip('git is not available');
    seedObjective();
    withWikiRemote(() => {
      assert.equal(push().flush.status, 'flushed');
      const before = S.fake.writes().length;
      assert.ok(before > 0);
      const again = push();
      assert.equal(again.flush.status, 'flushed', JSON.stringify(again.flush));
      assert.equal(S.fake.writes().length, before, JSON.stringify(S.fake.writes().slice(before)));
    });
  });
});

describe('pushHierarchy: user-owned repo without a wiki (SC5 push half)', () => {
  useStore({ fake: { ownerType: 'User', hasWiki: false }, project: { ownerType: 'User', hasWiki: false } });

  test('10. labels + a meta section, native sub-issues and blocked-by, pages under docs/aoforge/', () => {
    const obj = seedObjective();
    const res = push();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.flush.status, 'flushed', JSON.stringify(res.flush));
    assert.deepEqual(res.degraded, ['types', 'fields', 'wiki']);

    const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
    for (const n of numbers) {
      const issue = issueByNumber(n);
      assert.equal(issue.type, null);
      assert.ok(issue.labels.includes('aoforge:trd'), issue.labels.join());
      assert.ok(issue.labels.includes('aoforge:type/trd'), issue.labels.join());
    }
    const objective = issueByNumber(obj);
    assert.ok(objective.labels.includes('aoforge:type/objective'), objective.labels.join());
    assert.deepEqual(bodyLib.parseMeta(bodyLib.extractSection(objective.body, 'meta')), { type: 'Objective', work: 'feature', kind: 'plugin' });

    assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers);
    assert.deepEqual(getJson(`repos/o/r/issues/${numbers[2]}/dependencies/blocked_by`).map((i) => i.number), [numbers[0]]);

    assert.equal(
      fs.readFileSync(path.join(S.root, 'docs', 'aoforge', 'Objective-7-store-demo.md'), 'utf8'),
      STORE_FIXTURE.objective,
    );
    assert.equal(fs.existsSync(path.join(S.root, '.aoforge', 'wiki')), false, 'no wiki clone is created');
    assert.match(bodyLib.extractSection(objective.body, 'wiki'), /docs\/aoforge\/Objective-7-store-demo\.md/);
  });
});

describe('pushHierarchy: frozen TRDs, read-only tokens, offline', () => {
  useStore({ fake: { hasWiki: false }, project: { hasWiki: false } });

  test('11. a frozen TRD body is never patched: a drift warning, no halt', () => {
    seedObjective();
    assert.equal(push().flush.status, 'flushed');
    const n = trdNumber('7-01');
    const original = issueByNumber(n).body;

    const frozen = comments.freezeTrd(S.root, '7-01', { now: T0 });
    assert.equal(frozen.ok, true, JSON.stringify(frozen));
    assert.equal(flushLib.flush(S.root, { modes: NATIVE, caps: CAPS }).status, 'flushed');

    const file = path.join(objectiveDir(S.root), '07-01-alpha-TRD.md');
    fs.writeFileSync(file, `${STORE_FIXTURE.trds['07-01-alpha-TRD.md']}\nAn edit made after the freeze.\n`);
    const again = push();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.flush.status, 'flushed', JSON.stringify(again.flush));
    assert.equal(issueByNumber(n).body, original, 'the frozen body is unchanged on GitHub');
    assert.ok(
      again.flush.warnings.some((w) => /7-01/.test(w.message) && /frozen|drift/i.test(w.message)),
      JSON.stringify(again.flush.warnings),
    );
  });

  test('5c. pushed offline, the ops are queued and the flush stays pending; the same queue flushes once online', () => {
    seedObjective();
    S.fake.setOffline(true);
    const res = push();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.flush.status, 'pending', JSON.stringify(res.flush));
    assert.equal(res.flush.reason, 'offline');
    assert.ok(journalOps().length >= 12, `${journalOps().length} ops queued`);
    assert.equal(S.fake.writes().filter((a) => a.includes('POST')).length, 0);

    S.fake.setOffline(false);
    const flushed = flushLib.flush(S.root, {});
    assert.equal(flushed.status, 'flushed', JSON.stringify(flushed));
    assert.deepEqual(getJson(`repos/o/r/issues/${mappingNow().objectives['7'].issue_id}/sub_issues`).length, 3);
  });
});

describe('pushHierarchy: read-only token (14)', () => {
  useStore({ fake: { push: false, hasWiki: false }, project: { hasWiki: false } });

  test('14. writable:false refuses before anything is enqueued', () => {
    seedObjective();
    const writesBefore = S.fake.writes().length;
    const res = push();
    assert.equal(res.ok, false);
    assert.equal(res.refused, 'readonly');
    assert.match(res.error, /push access|read-only|not writable/i);
    assert.deepEqual(journalOps(), []);
    assert.equal(S.fake.writes().length, writesBefore);
  });
});

// ─── Decisions and orphans (tests 12-13) ─────────────────────────────────────

const QUESTION = 'REST or GraphQL?';

describe('openDecision: native org (12)', () => {
  useStore({ fake: { hasWiki: false }, project: { hasWiki: false } });

  test('12. a Decision issue of type Decision blocks its TRD; ids count up, also across queued decisions', () => {
    seedObjective();
    assert.equal(push().flush.status, 'flushed');

    const opened = hierarchy.openDecision(S.root, '07-03', { question: QUESTION, now: T0 });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    assert.equal(opened.id, '7-03-d1');
    assert.equal(opened.enqueued.length, 2);

    // a second decision queued before the first is flushed takes the next number
    const second = hierarchy.openDecision(S.root, '7-03', { question: 'Which port?', now: T0 });
    assert.equal(second.id, '7-03-d2');

    assert.equal(flushLib.flush(S.root, { modes: NATIVE, caps: CAPS }).status, 'flushed');
    const d1 = mappingNow().trds['7-03-d1'];
    assert.equal(d1.role, 'decision');
    const issue = issueByNumber(d1.issue_number);
    assert.equal(issue.title, '[Decision 07-03-d1] REST or GraphQL?');
    assert.equal(issue.type, 'Decision');
    assert.ok(issue.labels.includes('aoforge:decision'), issue.labels.join());
    assert.equal(issue.body, `<!-- aoforge:id=7-03-d1 -->\n\n${QUESTION}\n`);
    assert.equal(issue.milestone, 'v9.9');

    const blockers = getJson(`repos/o/r/issues/${trdNumber('7-03')}/dependencies/blocked_by`).map((i) => i.number);
    assert.deepEqual(blockers.sort(), [trdNumber('7-01'), d1.issue_number, mappingNow().trds['7-03-d2'].issue_number].sort());
  });

  test('12b. bad input is refused before anything is queued', () => {
    seedObjective();
    assert.equal(push().flush.status, 'flushed');
    const queued = journalOps().length;
    for (const [trdId, question, re] of [
      ['7', QUESTION, /invalid TRD id/],
      ['07-01-d1', QUESTION, /invalid TRD id/],
      ['07-03', '   ', /question/],
      ['07-09', QUESTION, /07-09.*no issue|run.*gh sync/],
    ]) {
      const r = hierarchy.openDecision(S.root, trdId, { question });
      assert.equal(r.ok, false, `${trdId}: ${JSON.stringify(r)}`);
      assert.match(r.error, re);
    }
    assert.equal(journalOps().length, queued);
  });

  test('12c. a project with github disabled skips', () => {
    fs.writeFileSync(path.join(S.root, '.aoforge', 'config.json'), JSON.stringify({ github: { enabled: false, repo: 'o/r' } }));
    const r = hierarchy.openDecision(S.root, '07-03', { question: QUESTION });
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
  });

  test('13. reportOrphans lists unlinked TRD issues and linked TRDs with no local file, and writes nothing', () => {
    const obj = seedObjective();
    assert.equal(push().flush.status, 'flushed');
    const ghost = S.fake.seedIssue({
      title: '[TRD 07-09] ghost',
      body: trd.encodeTrdBody({ id: '7-09', file: '07-09-ghost-TRD.md', text: '# ghost\n' }),
      labels: ['aoforge:trd'],
    });
    const stray = S.fake.seedIssue({
      title: '[Objective 8] elsewhere',
      body: trd.encodeTrdBody({ id: '8-01', file: '08-01-x-TRD.md', text: '# x\n' }),
      labels: ['aoforge:trd'],
    });
    fs.rmSync(path.join(objectiveDir(S.root), '07-02-beta-TRD.md'));

    const writesBefore = S.fake.writes().length;
    const mappingBefore = fs.readFileSync(path.join(S.root, '.aoforge', '.gh-mapping.json'), 'utf8');
    const r = hierarchy.reportOrphans(S.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.unlinked, [{ id: '7-09', number: ghost }]);
    assert.deepEqual(r.missing_local, [{ id: '7-02', number: trdNumber('7-02') }]);
    assert.equal(r.unlinked.some((u) => u.number === stray), false, 'a TRD of another objective is not this objective\'s orphan');
    assert.equal(S.fake.writes().length, writesBefore);
    assert.equal(fs.readFileSync(path.join(S.root, '.aoforge', '.gh-mapping.json'), 'utf8'), mappingBefore);
    assert.equal(getJson(`repos/o/r/issues/${obj}/sub_issues`).length, 3, 'nothing is unlinked or deleted');
  });

  test('13b. a clean objective reports nothing; an unlinked TRD that still has a local file is listed too', () => {
    seedObjective();
    assert.equal(push().flush.status, 'flushed');
    assert.deepEqual(
      (({ unlinked, missing_local }) => ({ unlinked, missing_local }))(hierarchy.reportOrphans(S.root, '7')),
      { unlinked: [], missing_local: [] },
    );
    fs.writeFileSync(path.join(objectiveDir(S.root), '07-05-new-TRD.md'), '---\nwave: 1\n---\n# new\n');
    const n = S.fake.seedIssue({
      title: '[TRD 07-05] new',
      body: trd.encodeTrdBody({ id: '7-05', file: '07-05-new-TRD.md', text: '---\nwave: 1\n---\n# new\n' }),
      labels: ['aoforge:trd'],
    });
    assert.deepEqual(hierarchy.reportOrphans(S.root, '7').unlinked, [{ id: '7-05', number: n }]);
  });
});

describe('openDecision: user-owned repo (12 degraded)', () => {
  useStore({ fake: { ownerType: 'User', hasWiki: false }, project: { ownerType: 'User', hasWiki: false } });

  test('12d. the Decision is labelled aoforge:decision (and aoforge:type/decision), with no native type', () => {
    seedObjective();
    assert.equal(push().flush.status, 'flushed');
    assert.equal(hierarchy.openDecision(S.root, '07-03', { question: QUESTION }).ok, true);
    const flushed = flushLib.flush(S.root, { modes: { ...NATIVE, types: 'labels', fields: 'meta' }, caps: CAPS });
    assert.equal(flushed.status, 'flushed', JSON.stringify(flushed));
    const issue = issueByNumber(mappingNow().trds['7-03-d1'].issue_number);
    assert.equal(issue.type, null);
    assert.ok(issue.labels.includes('aoforge:decision'), issue.labels.join());
    assert.ok(issue.labels.includes('aoforge:type/decision'), issue.labels.join());
    assert.ok(getJson(`repos/o/r/issues/${trdNumber('7-03')}/dependencies/blocked_by`).some((i) => i.number === issue.number));
  });
});

describe('reportOrphans: task-list hierarchy (no sub-issues API)', () => {
  useStore({ fake: { subIssuesApi: false, hasWiki: false }, project: { hasWiki: false } });

  test('13c. linkage is read from the objective task list when the sub-issues endpoints answer 404', () => {
    const obj = seedObjective();
    const res = push();
    assert.equal(res.flush.status, 'flushed', JSON.stringify(res.flush));
    assert.equal(res.modes.hierarchy, 'tasklist');
    assert.match(bodyLib.extractSection(issueByNumber(obj).body, 'trds'), /- \[ \] #\d+ 7-01/);

    const ghost = S.fake.seedIssue({
      title: '[TRD 07-09] ghost',
      body: trd.encodeTrdBody({ id: '7-09', file: '07-09-ghost-TRD.md', text: '# ghost\n' }),
      labels: ['aoforge:trd'],
    });
    const r = hierarchy.reportOrphans(S.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.unlinked, [{ id: '7-09', number: ghost }]);
    assert.deepEqual(r.missing_local, []);
  });
});
