'use strict';

// gh-sync-store.test.cjs (TRD 47-12) — `gh sync` as the push path of the authoritative store.
//
//   github.store false/absent  -> exactly objective 46 (no sub-issues, no REST create, no journal)
//   github.store true          -> 46's find-or-create, then the hierarchy through the outbox, then the
//                                 wiki Roadmap page and the cache baseline
//
// Hermetic: the fake GitHub is installed only through `gh._setRunGh`, the clock is fake, HOME / outbox /
// cache dirs are temp dirs from `hermeticEnv()`, and the wiki is a local bare repo reached over file://.
// Nothing here reaches GitHub, the real ~/.claude or this repository's .planning/, and nothing binds a port.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const ghCache = require('./gh-cache.cjs');
const ghTrd = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const mappingLib = require('./gh-mapping.cjs');
const comments = require('./gh-comments.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 8, 30, 12, 0, 0);
const OBJ_BASE = `objectives/${STORE_FIXTURE.objectiveDir}`;

/** Per-test state; `useStore()` rebuilds it before every test of the describe it is called in. */
let S;

/**
 * Hermetic env + store project + fake GitHub + fake clock. `wiki:true` also stands up a local wiki remote
 * and isolates git; otherwise `DEVFLOW_WIKI_REMOTE` names a path that does not exist so a test that has not
 * asked for a wiki cannot reach a real one.
 */
function useStore({ store = true, wiki = true, fake: fakeOverrides = {}, project: projectOverrides = {} } = {}) {
  beforeEach(() => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store, ...projectOverrides });
    const fake = createFakeGitHub({ ...project.fakeOptions, ...fakeOverrides });
    const clock = { t: T0 };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();
    const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
    let restoreGit = () => {};
    let remote = null;
    if (wiki && gitAvailable()) {
      restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
      remote = createWikiRemote();
      process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;
    } else {
      process.env.DEVFLOW_WIKI_REMOTE = pathToFileURL(path.join(envh.root, 'no-wiki.git')).href;
    }
    S = { envh, project, root: project.root, fake, clock, remote, restoreGit, savedRemote };
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
    else process.env.DEVFLOW_WIKI_REMOTE = S.savedRemote;
    S.envh.restore();
    S.project.cleanup();
  });
}

const needsGit = (t) => (gitAvailable() ? false : (t.skip('git is not available'), true));
const objectiveDir = () => path.join(S.root, '.planning', 'objectives', STORE_FIXTURE.objectiveDir);
const outboxDir = () => S.envh.env.DEVFLOW_OUTBOX_DIR;
const journalOps = () => outbox.readJournal(S.root).journal.ops;
const mappingNow = () => mappingLib.readMappingV3(S.root);
const trdNumber = (id) => mappingLib.getTrd(mappingNow(), id).issue_number;
const issueByNumber = (n) => S.fake.issues.find((i) => i.number === n);
const getJson = (endpoint) => JSON.parse(S.fake.runGh(['api', endpoint]).stdout);
const sync = (arg = '7') => gh.syncObjective(arg, S.root);
const sections = (body) => (name) => body.split(`<!-- devflow:begin ${name} -->`).length - 1;
const isObjectiveBodyEdit = (n) => (argv) => argv.includes('PATCH') && argv.some((a) => a === `repos/o/r/issues/${n}`);
const isTrdCreate = (argv) => argv.includes('POST') && argv.some((a) => /^repos\/o\/r\/issues$/.test(a));

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write };
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  return out;
}

/** A second, one-TRD objective so `sync --all` has something to order. */
function addSecondObjective() {
  const dir = path.join(S.root, '.planning', 'objectives', '08-second');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'OBJECTIVE.md'), '---\nobjective: 08-second\n---\n\n# Objective 8: Second\n');
  fs.writeFileSync(
    path.join(dir, '08-01-one-TRD.md'),
    '---\nobjective: 08-second\ntrd: "01"\ntype: standard\nwave: 1\ndepends_on: []\n---\n\n# TRD 8-01: one\n',
  );
  const roadmap = path.join(S.root, '.planning', 'ROADMAP.md');
  fs.writeFileSync(
    roadmap,
    `${fs.readFileSync(roadmap, 'utf8')}\n### Objective 8: Second\n**Goal:** A second objective\n\n**Success Criteria** (what must be TRUE):\n  1. It syncs\n`,
  );
}

// ─── Store off: objective 46, unchanged (test 1) ─────────────────────────────

describe('github.store off', () => {
  useStore({ store: false, wiki: false });

  test('1. gh sync performs only 46\'s calls: no sub-issues, no REST create, no journal, no hierarchy', () => {
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.created, true);
    assert.equal(res.hierarchy, undefined);
    assert.equal(res.roadmap_page, undefined);
    assert.equal(res.outbox, undefined);

    const calls = S.fake.calls().map((a) => a.join(' '));
    assert.equal(calls.some((c) => /sub_issues|dependencies/.test(c)), false, calls.join('\n'));
    assert.equal(S.fake.calls().some(isTrdCreate), false, 'no REST issue create');
    assert.equal(S.fake.issues.length, 1, 'only the objective issue exists');
    assert.equal(fs.existsSync(outboxDir()), false, 'no journal, no outbox directory');
  });

  test('1b. github.store must be the boolean true: the string "true" is not store mode', () => {
    const file = path.join(S.root, '.planning', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    cfg.github.store = 'true';
    fs.writeFileSync(file, JSON.stringify(cfg));
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.hierarchy, undefined);
    assert.equal(S.fake.issues.length, 1);
    assert.equal(fs.existsSync(outboxDir()), false);
  });
});

// ─── Store on: the whole hierarchy through one sync (tests 2-4, 9) ───────────

describe('github.store on, organisation repo with a wiki', () => {
  useStore();

  test('2. one sync: objective issue (46), 3 TRD sub-issues, blocked-by, SUMMARY comment, wiki pages, ONE copy of each managed section', (t) => {
    if (needsGit(t)) return;
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.created, true, 'the objective issue is still created by 46');
    assert.equal(res.hierarchy.outbox, 'flushed', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'pushed');
    assert.equal(res.outbox, undefined, 'a completed flush reports no pending/halted marker');

    const obj = res.issue_number;
    const numbers = ['7-01', '7-02', '7-03'].map(trdNumber);
    assert.deepEqual(getJson(`repos/o/r/issues/${obj}/sub_issues`).map((i) => i.number), numbers);
    assert.deepEqual(getJson(`repos/o/r/issues/${numbers[2]}/dependencies/blocked_by`).map((i) => i.number), [numbers[0]]);

    const decoded = comments.decodeFileComment(S.fake.comments.filter((c) => c.issue_number === numbers[0]), '7-01', 'summary');
    assert.equal(decoded.ok, true, JSON.stringify(decoded));
    assert.equal(decoded.text, STORE_FIXTURE.summary);

    const body = issueByNumber(obj).body;
    const count = sections(body);
    for (const name of ['summary', 'criteria', 'trds', 'wiki', 'footer']) assert.equal(count(name), 1, `${name} appears once`);
    assert.equal(bodyLib.extractSection(body, 'trds'), '3 TRDs, tracked as sub-issues.', 'the native trds line, not 46\'s list');

    for (const page of ['Objective-7-store-demo', 'Project', 'Requirements', 'Roadmap']) {
      assert.equal(typeof S.remote.readRemotePage(page), 'string', `${page} page exists on the wiki`);
    }
    assert.equal(S.remote.readRemotePage('Objective-7-store-demo'), STORE_FIXTURE.objective);
    const roadmap = S.remote.readRemotePage('Roadmap');
    assert.ok(roadmap.includes(ghCache.GENERATED_HEADER), 'the Roadmap page carries the generated header');
    const model = ghCache.readRemoteModel(S.root);
    assert.equal(model.ok, true, JSON.stringify(model));
    assert.equal(roadmap, ghCache.renderRoadmap(model), 'the page is the renderer output for the issues as they are now');
  });

  test('3. no direct `issue edit` for the objective body: every body write is the flusher\'s REST PATCH', (t) => {
    if (needsGit(t)) return;
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(S.fake.calls().filter((a) => a[0] === 'issue' && a[1] === 'edit').length, 0);
    assert.ok(S.fake.writes().some(isObjectiveBodyEdit(res.issue_number)), 'the flusher patched the objective body');

    // a second sync with a changed local criterion still edits only through the flusher
    const roadmap = path.join(S.root, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmap, fs.readFileSync(roadmap, 'utf8').replace('1. The demo objective pushes to GitHub', '1. The demo objective is pushed to GitHub'));
    const again = sync();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(S.fake.calls().filter((a) => a[0] === 'issue' && a[1] === 'edit').length, 0);
  });

  test('4. an unchanged re-run performs zero gh writes', (t) => {
    if (needsGit(t)) return;
    const first = sync();
    assert.equal(first.ok, true, JSON.stringify(first));
    const before = S.fake.writes().length;
    assert.ok(before > 0);

    const again = sync();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.created, false);
    assert.equal(again.hierarchy.outbox, 'flushed', JSON.stringify(again.hierarchy));
    // 46's only non-idempotent bootstraps are the label/milestone ensure (create path only) and the sticky
    // state comment (edited only when its content, timestamp aside, changed). None applies to a re-run.
    const extra = S.fake.writes().slice(before);
    assert.deepEqual(extra, [], JSON.stringify(extra));
  });

  test('9. after a complete sync the cache index holds a hash for every pushed file', (t) => {
    if (needsGit(t)) return;
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    const index = outbox.readCacheIndex(S.root);
    const expected = [
      ...STORE_FIXTURE.trdFiles.map((f) => `${OBJ_BASE}/${f}`),
      `${OBJ_BASE}/${STORE_FIXTURE.summaryFile}`,
      `${OBJ_BASE}/OBJECTIVE.md`,
      `${OBJ_BASE}/07-CONTEXT.md`,
      `${OBJ_BASE}/07-RESEARCH.md`,
      'PROJECT.md',
      'REQUIREMENTS.md',
    ];
    for (const rel of expected) {
      const text = fs.readFileSync(path.join(S.root, '.planning', rel), 'utf8');
      assert.equal(index[rel], ghTrd.contentHash(text), `${rel} baseline recorded`);
    }
  });

  test('5. sync --all enqueues every objective and flushes once at the end, objective 7 before 8', (t) => {
    if (needsGit(t)) return;
    addSecondObjective();
    const realFlush = flushLib.flush;
    let flushes = 0;
    flushLib.flush = (...args) => { flushes += 1; return realFlush(...args); };
    let res;
    try {
      res = gh.syncAll(S.root);
    } finally {
      flushLib.flush = realFlush;
    }
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.results.length, 2);
    assert.equal(flushes, 1, 'one flush for the whole run');
    assert.equal(res.hierarchy.outbox, 'flushed', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'pushed');

    const titles = S.fake.issues.map((i) => i.title);
    const at = (needle) => titles.findIndex((x) => x.includes(needle));
    assert.ok(at('[TRD 07-03]') > -1 && at('[TRD 08-01]') > -1, titles.join('\n'));
    assert.ok(at('[TRD 07-03]') < at('[TRD 08-01]'), `objective 7 ops run before objective 8: ${titles.join(' | ')}`);
    assert.equal(journalOps().filter((op) => op.status !== 'done').length, 0, 'the journal is drained');

    const map = mappingNow();
    assert.ok(map.trds['7-01'] && map.trds['8-01'], 'the final mapping write kept the flusher\'s TRD entries');
    assert.ok(map.objectives['7'] && map.objectives['8']);
  });
});

// ─── Budget refusal before ANY gh call (test 10a) ────────────────────────────

describe('budget refusal (SC2)', () => {
  useStore();

  test('10a. a 60,001-char TRD refuses the objective with ZERO gh calls: no auth, no objective issue, no journal', () => {
    fs.writeFileSync(
      path.join(objectiveDir(), '07-04-big-TRD.md'),
      oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' }),
    );
    const res = sync();
    assert.equal(res.ok, false, JSON.stringify(res));
    assert.equal(res.refused, 'budget');
    assert.deepEqual(res.over.map((o) => o.id), ['7-04']);
    assert.match(res.error, /7-04|07-04/);
    assert.deepEqual(S.fake.calls(), [], 'not even `gh auth status` ran');
    assert.equal(fs.existsSync(outboxDir()), false, 'nothing was queued');
    assert.equal(mappingLib.getEntry(mappingNow(), '7'), null, 'no objective issue was recorded');
  });

  test('10a-cli. `gh sync 7` exits 1 with the refusal on stderr and makes no gh call', () => {
    fs.writeFileSync(
      path.join(objectiveDir(), '07-04-big-TRD.md'),
      oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' }),
    );
    const out = capture(() => gh.cmdGhSync(S.root, ['7'], false));
    assert.equal(out.code, 1);
    assert.equal(JSON.parse(out.stderr).refused, 'budget');
    assert.deepEqual(S.fake.calls(), []);
  });

  test('10a-all. sync --all refuses only the over-budget objective and names it in its row', (t) => {
    if (needsGit(t)) return;
    addSecondObjective();
    fs.writeFileSync(
      path.join(objectiveDir(), '07-04-big-TRD.md'),
      oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' }),
    );
    const res = gh.syncAll(S.root);
    assert.equal(res.ok, false);
    assert.equal(res.failed, 1);
    const row7 = res.results.find((r) => r.id === '7');
    const row8 = res.results.find((r) => r.id === '8');
    assert.equal(row7.ok, false);
    assert.equal(row7.refused, 'budget');
    assert.equal(row8.ok, true, JSON.stringify(row8));
    assert.equal(mappingLib.getEntry(mappingNow(), '7'), null, 'objective 7 never got an issue');
  });
});

// ─── Offline (tests 6-7) ─────────────────────────────────────────────────────

describe('offline', () => {
  useStore();

  test('6. mapped objective offline: the hierarchy is queued, live steps are skipped with a warning, outbox pending', (t) => {
    if (needsGit(t)) return;
    const first = sync();
    assert.equal(first.ok, true, JSON.stringify(first));

    // a local change worth pushing
    const beta = path.join(objectiveDir(), '07-02-beta-TRD.md');
    fs.writeFileSync(beta, `${fs.readFileSync(beta, 'utf8')}\nAn edit made while offline.\n`);

    S.fake.setOffline(true);
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.outbox, 'pending');
    assert.equal(res.hierarchy.outbox, 'pending', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'skipped');
    assert.ok(res.warnings.some((w) => /offline: state comment and Project fields not updated/.test(w)), JSON.stringify(res.warnings));
    assert.ok(journalOps().some((op) => op.status !== 'done'), 'the ops are queued');

    S.fake.setOffline(false);
    const flushed = flushLib.flush(S.root, {});
    assert.equal(flushed.status, 'flushed', JSON.stringify(flushed));
    assert.ok(issueByNumber(trdNumber('7-02')).body.includes('An edit made while offline.'));

    const next = sync();
    assert.equal(next.ok, true, JSON.stringify(next));
    assert.ok(['pushed', 'unchanged'].includes(next.roadmap_page), next.roadmap_page);
    assert.ok(S.remote.readRemotePage('Roadmap').includes(ghCache.GENERATED_HEADER));
  });

  test('7. unmapped objective offline is an error: it cannot be created offline, and nothing is queued', () => {
    S.fake.setOffline(true);
    const res = sync();
    assert.equal(res.ok, false, JSON.stringify(res));
    assert.equal(res.error, 'offline');
    assert.match(res.message, /cannot be created offline/);
    assert.deepEqual(journalOps(), []);
  });
});

// ─── Pending / halted flush (test 8) ─────────────────────────────────────────

describe('a flush that does not complete', () => {
  useStore();

  test('8a. pending flush: sync is ok with outbox pending, and the Roadmap page is skipped with a warning', (t) => {
    if (needsGit(t)) return;
    S.fake.failNext(isTrdCreate, { status: null, stderr: 'error connecting to api.github.com: dial tcp: could not resolve host' });
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.outbox, 'pending');
    assert.equal(res.hierarchy.outbox, 'pending');
    assert.equal(res.roadmap_page, 'skipped');
    assert.ok(res.warnings.some((w) => /Roadmap/.test(w)), JSON.stringify(res.warnings));
    assert.equal(S.remote.readRemotePage('Roadmap'), null, 'no Roadmap page was written');
    assert.ok(journalOps().some((op) => op.status !== 'done'));
  });

  test('8b. halted flush (a human edited a criterion on GitHub): ok, outbox halted, warning names `gh outbox status`', (t) => {
    if (needsGit(t)) return;
    const first = sync();
    assert.equal(first.ok, true, JSON.stringify(first));
    const n = first.issue_number;
    const body = issueByNumber(n).body;
    const edited = body.replace('The demo objective pushes', 'The demo objective, reworded by a human, pushes');
    assert.notEqual(edited, body);
    S.fake.humanEditBody(n, edited);

    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.outbox, 'halted');
    assert.equal(res.hierarchy.outbox, 'halted', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'skipped');
    assert.ok(res.warnings.some((w) => /df-tools gh outbox status/.test(w)), JSON.stringify(res.warnings));
    assert.match(bodyLib.extractSection(issueByNumber(n).body, 'criteria'), /reworded by a human/, 'the human text is not overwritten');
  });
});

// ─── User-owned repo without a wiki (test 10) ────────────────────────────────

describe('github.store on, user-owned repo without a wiki', () => {
  useStore({ wiki: false, fake: { ownerType: 'User', hasWiki: false }, project: { ownerType: 'User', hasWiki: false } });

  test('10. labels + a meta section, and the pages (Roadmap included) land under docs/devflow/', () => {
    const res = sync();
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.hierarchy.outbox, 'flushed', JSON.stringify(res.hierarchy));
    assert.equal(res.roadmap_page, 'pushed');

    const objective = issueByNumber(res.issue_number);
    assert.ok(objective.labels.includes('devflow:type/objective'), objective.labels.join());
    assert.deepEqual(bodyLib.parseMeta(bodyLib.extractSection(objective.body, 'meta')), { type: 'Objective', work: 'feature', kind: 'plugin' });
    assert.equal(sections(objective.body)('summary'), 1);

    const docs = path.join(S.root, 'docs', 'devflow');
    assert.equal(fs.readFileSync(path.join(docs, 'Objective-7-store-demo.md'), 'utf8'), STORE_FIXTURE.objective);
    const roadmap = fs.readFileSync(path.join(docs, 'Roadmap.md'), 'utf8');
    assert.ok(roadmap.includes(ghCache.GENERATED_HEADER));
    assert.equal(fs.existsSync(path.join(S.root, '.planning', 'wiki')), false, 'no wiki clone is created');
  });
});
