'use strict';

// planning-import.test.cjs (TRD 48-12, test 11) — `planning import [--dry-run]` moves a project's existing local work
// into the store (D-17), so migration 0010 has nothing left without a baseline.
//
//   11   a store project seeded with a todo, a debug session, a quick dir, research/a.md, a milestone archive, a
//        hand-maintained MILESTONES.md section, a 61,000-char TRD, a decision without `trd:` and a legacy-named TRD:
//        per-kind queued counts, `refused` names the TRD, `kept_local` names the decision and the legacy TRD;
//        --dry-run writes nothing; a second import enqueues nothing
//   11b  an importable objective is pushed as one hierarchy, a decision with `trd:` becomes a Decision issue; idempotent
//   11c  local mode refuses
//
// Hermetic: hermeticEnv(), the fake through the gh-client seam, a fake clock, a local wiki remote over file://.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { planImport } = require('./planning-import.cjs');
const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DIR = STORE_FIXTURE.objectiveDir;
const HINT = 'split it or move bulk to a linked file';

let S;

function useProject({ store = true } = {}) {
  beforeEach((t) => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store });
    const fake = createFakeGitHub(project.fakeOptions);
    const clock = { t: T0 };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();
    const savedRemote = process.env.AOFORGE_WIKI_REMOTE;
    let restoreGit = () => {};
    let remote = null;
    if (gitAvailable()) {
      restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
      remote = createWikiRemote();
      process.env.AOFORGE_WIKI_REMOTE = remote.remoteUrl;
    }
    S = { envh, project, root: project.root, fake, remote, restoreGit, savedRemote };
    if (store && !gitAvailable()) t.skip('git is not available: import pushes wiki pages');
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.AOFORGE_WIKI_REMOTE;
    else process.env.AOFORGE_WIKI_REMOTE = S.savedRemote;
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (rel) => path.join(S.root, '.aoforge', ...rel.split('/'));
function seed(rel, text) {
  fs.mkdirSync(path.dirname(planning(rel)), { recursive: true });
  fs.writeFileSync(planning(rel), text);
}
const journalOps = () => (fs.existsSync(outbox.journalPath(S.root)) ? outbox.readJournal(S.root).journal.ops : []);
const total = (queued) => Object.values(queued).reduce((a, b) => a + b, 0);
const entities = () => mappingLib.readMappingV3(S.root).entities || {};

describe('48-12 planning import (store mode)', () => {
  useProject({ store: true });

  test('11: per-kind counts, refused TRD, kept-local decision and legacy TRD; dry-run writes nothing; idempotent', () => {
    seed('todos/pending/2026-09-30-old-todo.md', '---\ncreated: 2026-09-30T10:00:00.000Z\ntitle: Old todo\narea: tooling\n---\n\n## Problem\n\nOld.\n');
    seed('debug/old-bug.md', '---\nstatus: investigating\n---\n\n# Debug: old bug\n\nhypothesis: x\n');
    seed('quick/3-fix-y/3-JOB.md', '# Quick 3: fix y\n\n<task type="auto"><name>Fix y</name></task>\n');
    seed('quick/3-fix-y/3-SUMMARY.md', '# Quick 3 Summary\n\nFixed y.\n');
    seed('research/a.md', '# Research A\n\nNotes.\n');
    seed('milestones/v1.3-ROADMAP.md', '# Roadmap archive v1.3\n');
    seed('MILESTONES.md', '# Milestones\n\n## v1.3 Old (Shipped: 2026-09-28)\n\nThe old milestone shipped.\n');
    seed(`objectives/${DIR}/07-04-big-TRD.md`, oversizedTrdText(61000, { id: '7-04', file: '07-04-big-TRD.md' }));
    seed('decisions/pending/DECISION-001.md', '---\nid: DECISION-001\nstatus: pending\n---\n\n# A or B?\n');
    seed(`objectives/${DIR}/07-09-TRD-legacy.md`, '# legacy\n');

    const dry = planImport(S.root, { dryRun: true });
    assert.equal(dry.ok, true, JSON.stringify(dry));
    assert.equal(dry.dry_run, true);
    assert.equal(S.fake.writes().length, 0, 'dry-run: zero gh writes');
    assert.equal(journalOps().length, 0, 'dry-run: nothing enqueued');
    assert.equal(fs.existsSync(planning('milestones/v1.3.md')), false, 'dry-run: no cache write');

    const r = planImport(S.root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.deepEqual(r.queued, dry.queued, 'dry-run reports what the real run queues');
    assert.equal(r.queued.todo, 1);
    assert.equal(r.queued.debug, 1);
    assert.equal(r.queued.quick, 2, 'JOB + SUMMARY');
    assert.equal(r.queued.milestone, 1);
    assert.equal(r.queued.objective, 0, 'objective 7 is refused by the budget');
    assert.equal(r.queued.decision, 0);
    assert.ok(r.queued.doc >= 2, 'research/a.md and the milestone archive at least');

    assert.deepEqual(r.refused.map((x) => [x.rel, x.hint]), [[`objectives/${DIR}/07-04-big-TRD.md`, HINT]]);
    assert.ok(r.refused[0].chars > 60000);
    const kept = r.kept_local.map((k) => k.rel);
    assert.ok(kept.includes('decisions/pending/DECISION-001.md'), JSON.stringify(r.kept_local));
    assert.ok(kept.includes(`objectives/${DIR}/07-09-TRD-legacy.md`), 'legacy TRD names are reported, not skipped');
    assert.match(r.kept_local.find((k) => k.rel.endsWith('07-09-TRD-legacy.md')).reason, /07-09-legacy-TRD\.md/);

    for (const id of ['todo-2026-09-30-old-todo', 'debug-old-bug', 'quick-3']) assert.ok(entities()[id], `${id} mapped`);
    const quick = S.fake.issues.find((i) => i.number === entities()['quick-3'].issue_number);
    assert.equal(quick.state, 'CLOSED', 'a quick task with a SUMMARY is closed');
    assert.ok(S.fake.milestones.some((m) => m.title === 'v1.3'), 'native milestone from the MILESTONES.md section');
    assert.equal(S.remote.readRemotePage('Research-a'), '# Research A\n\nNotes.\n');
    const index = outbox.readCacheIndex(S.root);
    for (const rel of ['todos/pending/2026-09-30-old-todo.md', 'debug/old-bug.md', 'quick/3-fix-y/3-SUMMARY.md', 'research/a.md', 'milestones/v1.3.md']) {
      assert.ok(Object.hasOwn(index, rel), `${rel} baselined`);
    }

    const ops = journalOps().length;
    const writes = S.fake.writes().length;
    const again = planImport(S.root);
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(total(again.queued), 0, `second import queues nothing: ${JSON.stringify(again.queued)}`);
    assert.equal(journalOps().length, ops, 'no new ops');
    assert.equal(S.fake.writes().length, writes, 'no new gh writes');
    assert.equal(again.refused.length, 1, 'the refused TRD is still reported');
  });

  test('11b: an importable objective is one hierarchy push; a decision with trd: becomes a Decision issue', () => {
    seed('decisions/resolved/DECISION-001.md', '---\nid: DECISION-001\ntrd: 7-01\nstatus: resolved\nresolution: B\n---\n\n# A or B?\n');
    const r = planImport(S.root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.queued.objective, 1);
    assert.equal(r.queued.decision, 1);
    assert.deepEqual(r.refused, []);
    const index = outbox.readCacheIndex(S.root);
    for (const f of STORE_FIXTURE.trdFiles) assert.ok(Object.hasOwn(index, `objectives/${DIR}/${f}`), `${f} baselined`);
    assert.equal(fs.existsSync(planning('decisions/resolved/DECISION-001.md')), false, 'the legacy decision file moved into the store');
    assert.match(fs.readFileSync(planning('decisions/7-01-d1.md'), 'utf8'), /## Answer\n\nB\n$/);
    const dec = mappingLib.getTrd(mappingLib.readMappingV3(S.root), '7-01-d1');
    assert.equal(S.fake.issues.find((i) => i.number === dec.issue_number).state, 'CLOSED');

    // TRD 52-05 #5: the single-line `resolution: B` still queues exactly `B`.
    assert.deepEqual(answerOps().map((o) => o.payload.text), ['B']);

    const ops = journalOps().length;
    const again = planImport(S.root);
    assert.equal(total(again.queued), 0, JSON.stringify(again.queued));
    assert.equal(journalOps().length, ops);
  });

  // TRD 52-05 #4: a block-scalar resolution used to import as the bare indicator `|-`.
  test('52-05 #4: a resolved decision with a `resolution: |-` block queues the full multi-line answer', () => {
    seed('decisions/resolved/DECISION-001.md', [
      '---',
      'id: DECISION-001',
      'trd: 7-01',
      'status: resolved',
      'resolution: |-',
      '  Option B.',
      '  Reason: second line with colon',
      'resolved_at: "2026-10-04T13:49:05.343Z"',
      '---',
      '',
      '# A or B?',
      '',
    ].join('\n'));
    const r = planImport(S.root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.queued.decision, 1);
    const answer = 'Option B.\nReason: second line with colon';
    assert.deepEqual(answerOps().map((o) => o.payload.text), [answer]);
    assert.equal(fs.readFileSync(planning('decisions/7-01-d1.md'), 'utf8').endsWith(`## Answer\n\n${answer}\n`), true);
  });
});

/** The queued `answer` comment ops (decisionAnswer's upsert-comment). */
function answerOps() {
  return journalOps().filter((o) => o.kind === 'upsert-comment' && o.target && o.target.kind === 'answer');
}

describe('48-12 planning import (local mode)', () => {
  useProject({ store: false });

  test('11c: local mode refuses with nothing written', () => {
    const r = planImport(S.root);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'planning import needs github.store: true');
    assert.equal(S.fake.calls().length, 0);
    assert.equal(journalOps().length, 0);
  });
});
