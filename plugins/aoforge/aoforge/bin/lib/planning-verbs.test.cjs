'use strict';

// planning-verbs.test.cjs (TRD 48-11) — the core planning verbs in both modes.
//
// Every verb is tested in LOCAL mode first (github.store off, the D-01 invariant: same path, same bytes, zero gh
// calls, no outbox journal, no ledger), then in STORE mode against one stateful fake GitHub and one local wiki
// remote. The fake is installed in local mode too, only to prove that nothing calls it.
//
// Test list (TRD 48-11):
//   local   1 putTrd bytes + zero calls   2 budget/bulk only warn   3 the other verbs   4 set-status
//           5 doc put refuses issue-backed files
//   store   6 put ×3 --no-push + plan push   7 budget refusal   8 frozen / offline freeze state
//           9 summary post   10 summary checkpoint   11 verification post   12 doc put -> wiki
//           13 set-status complete / cancelled   14 --no-flush, then `gh outbox flush` settles
//           15 a worktree writes the MAIN checkout   16 draftPath   18 doc put refuses a stale draft (TRD 69-01)
//
// Hermetic: hermeticEnv() temp HOME / outbox / cache dirs, the fake installed through the gh-client seam, a fake
// clock, the wiki is a local bare repo over file://. No real GitHub, no network, no port, never ~/.claude.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const verbs = require('./planning-verbs.cjs');
const gh = require('./gh.cjs');
const cli = require('./gh-store-cli.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const ledger = require('./planning-ledger.cjs');
const mappingLib = require('./gh-mapping.cjs');
const ghTrd = require('./gh-trd.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DIR = STORE_FIXTURE.objectiveDir;
const OBJ_REL = `objectives/${DIR}`;

// ─── Harness ─────────────────────────────────────────────────────────────────

/** Run fn with process.exit / stdout / stderr captured. The first exit code wins; exit does not throw. */
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

const exitOf = (r) => (r.code === null ? 0 : r.code);

let S;

/**
 * Hermetic env + store-shaped project + fake GitHub + fake clock, rebuilt before every test of the describe.
 * `store` selects github.store; `strip` removes the fixture's TRD files before anything else; `sync` runs
 * gh.syncObjective('7') once (online) so the objective issue exists. The wiki remote is set up whenever git is
 * available, so a flush that pushes pages has somewhere to push them.
 */
function useProject({ store = false, sync = false, strip = false } = {}) {
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
    S = { envh, project, root: project.root, fake, clock, remote, restoreGit, savedRemote, skipped: false, extra: [] };

    if (strip) for (const f of STORE_FIXTURE.trdFiles) fs.rmSync(planning(OBJ_REL, f));
    if (store && !gitAvailable()) {
      S.skipped = true;
      t.skip('git is not available: store-mode verbs push wiki pages');
      return;
    }
    if (sync) {
      const r = gh.syncObjective('7', S.root);
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.AOFORGE_WIKI_REMOTE;
    else process.env.AOFORGE_WIKI_REMOTE = S.savedRemote;
    for (const p of S.extra) fs.rmSync(p, { recursive: true, force: true });
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (...rel) => path.join(S.root, '.planning', ...rel);
const readRel = (rel) => fs.readFileSync(planning(rel), 'utf8');
const journalExists = (root = S.root) => fs.existsSync(outbox.journalPath(root));
const ledgerExists = (root = S.root) => fs.existsSync(ledger.ledgerPath(root));
const ledgerEntries = (root = S.root) => ledger.readLedger(root).entries;
const pendingOps = (root = S.root) => outbox.readJournal(root).journal.ops.filter((o) => o.status === 'pending');
const mappingNow = () => mappingLib.readMappingV3(S.root);
const objectiveIssue = () => S.fake.issues.find((i) => i.number === mappingLib.getEntry(mappingNow(), '7').issue_id);
const trdIssueNumber = (id) => mappingLib.getTrd(mappingNow(), id).issue_number;
const trdIssues = () => S.fake.issues.filter((i) => i.labels.includes('aoforge:trd'));

/** A small, valid TRD for objective 7 (its id comes from the file name). */
function smallTrd(nn, title = 'x') {
  return [
    '---',
    'objective: 07-store-demo',
    `trd: "${nn}"`,
    'type: standard',
    'wave: 1',
    'depends_on: []',
    '---',
    '',
    `# TRD 07-${nn}: ${title}`,
    '',
    '<task type="auto">',
    `  <name>Task 1: ${title}</name>`,
    '</task>',
    '',
  ].join('\n');
}

// ─── LOCAL mode (D-01) ───────────────────────────────────────────────────────

describe('local mode: putTrd is today\'s file write (D-01)', () => {
  useProject({ store: false });

  test('1. writes the TRD with the input bytes, zero gh calls, no journal, no ledger', () => {
    const text = smallTrd('04');
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-04-x-TRD.md', text });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.mode, 'local');
    assert.equal(r.exit, 0);
    assert.equal(r.rel, `${OBJ_REL}/07-04-x-TRD.md`);
    assert.equal(r.path, path.join(fs.realpathSync(S.root), '.planning', OBJ_REL, '07-04-x-TRD.md'));
    assert.ok(Buffer.from(text).equals(fs.readFileSync(planning(OBJ_REL, '07-04-x-TRD.md'))), 'same bytes');
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');
    assert.equal(journalExists(), false, 'no outbox journal');
    assert.equal(ledgerExists(), false, 'no ledger');
  });

  test('1b. a file that is not a TRD of this objective is refused before anything is written', () => {
    const other = verbs.putTrd(S.root, { objective: '7', file: '08-01-x-TRD.md', text: smallTrd('01') });
    assert.equal(other.ok, false);
    assert.equal(other.exit, 1);
    assert.match(other.error, /objective 7/);
    const notTrd = verbs.putTrd(S.root, { objective: '7', file: '07-01-notes.md', text: 'x\n' });
    assert.equal(notTrd.ok, false);
    assert.match(notTrd.error, /TRD file name/);
    const unknown = verbs.putTrd(S.root, { objective: '99', file: '99-01-x-TRD.md', text: 'x\n' });
    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /99/);
    assert.equal(fs.existsSync(planning(OBJ_REL, '08-01-x-TRD.md')), false);
    assert.equal(S.fake.calls().length, 0);
  });

  test('2. local mode only warns: a 61,000-char TRD is written; a 9,000-char fenced block warns', () => {
    const big = oversizedTrdText(61000, { id: '7-04', file: '07-04-big-TRD.md' });
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-04-big-TRD.md', text: big });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(readRel(`${OBJ_REL}/07-04-big-TRD.md`), big);
    assert.ok(r.warnings.some((w) => /\bover\b/.test(w)), `a warning names over: ${JSON.stringify(r.warnings)}`);

    const fenced = `${smallTrd('05')}\n\`\`\`text\n${'y'.repeat(9000)}\n\`\`\`\n`;
    const b = verbs.putTrd(S.root, { objective: '7', file: '07-05-bulk-TRD.md', text: fenced });
    assert.equal(b.ok, true);
    assert.equal(readRel(`${OBJ_REL}/07-05-bulk-TRD.md`), fenced);
    assert.ok(b.warnings.some((w) => /fenced block/.test(w)), `a bulk warning: ${JSON.stringify(b.warnings)}`);
    assert.equal(S.fake.calls().length, 0);
    assert.equal(journalExists(), false);
  });

  test('2b. planPush is skipped in local mode with zero calls', () => {
    const r = verbs.planPush(S.root, '7');
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'local');
    assert.equal(r.skipped, 'local mode');
    assert.equal(r.exit, 0);
    assert.equal(S.fake.calls().length, 0);
  });
});

describe('draftPath (D-13)', () => {
  useProject({ store: false });

  test('16. a path under os.tmpdir()/aoforge-drafts/<repoKey>/<rel>, seeded once from the cache', () => {
    const rel = `${OBJ_REL}/07-01-alpha-TRD.md`;
    const base = path.join(os.tmpdir(), 'aoforge-drafts', outbox.repoKey(fs.realpathSync(S.root)));
    S.extra.push(base);
    const p = verbs.draftPath(S.root, rel);
    assert.equal(p, path.join(base, ...rel.split('/')));
    assert.ok(path.isAbsolute(p));
    assert.equal(fs.readFileSync(p, 'utf8'), STORE_FIXTURE.trds['07-01-alpha-TRD.md'], 'seeded with the cache text');

    fs.writeFileSync(p, 'my edit\n');
    assert.equal(verbs.draftPath(S.root, rel), p);
    assert.equal(fs.readFileSync(p, 'utf8'), 'my edit\n', 'an edited draft whose base is current is never overwritten');

    const fresh = verbs.draftPath(S.root, `${OBJ_REL}/07-09-new-TRD.md`);
    assert.equal(fs.existsSync(fresh), false, 'no cache file -> no seed');
    assert.equal(fs.existsSync(path.dirname(fresh)), true, 'its directory exists');
    assert.throws(() => verbs.draftPath(S.root, '../escape.md'), TypeError);
    assert.equal(S.fake.calls().length, 0);
  });
});

// ─── STORE mode ──────────────────────────────────────────────────────────────

describe('store mode: put-trd --no-push ×3, then plan push', () => {
  useProject({ store: true, sync: true, strip: true });

  test('6. three TRD sub-issues after plan push; ledger empty; the cache index holds the three hashes', () => {
    if (S.skipped) return;
    assert.equal(trdIssues().length, 0, 'no TRD issue before the push');
    for (const f of STORE_FIXTURE.trdFiles) {
      const r = verbs.putTrd(S.root, { objective: '7', file: f, text: STORE_FIXTURE.trds[f], noPush: true });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.mode, 'store');
      assert.equal(r.exit, 0);
      assert.equal(r.queued, undefined, '--no-push queues nothing');
      assert.equal(readRel(`${OBJ_REL}/${f}`), STORE_FIXTURE.trds[f]);
    }
    assert.equal(pendingOps().length, 0, 'nothing queued by --no-push');
    assert.deepEqual(Object.keys(ledgerEntries()).sort(), STORE_FIXTURE.trdFiles.map((f) => `${OBJ_REL}/${f}`).sort());
    const idxBefore = outbox.readCacheIndex(S.root);
    for (const f of STORE_FIXTURE.trdFiles) assert.equal(idxBefore[`${OBJ_REL}/${f}`], undefined, 'no baseline at write time');

    const pushed = verbs.planPush(S.root, '7');
    assert.equal(pushed.ok, true, JSON.stringify(pushed));
    assert.equal(pushed.exit, 0, JSON.stringify(pushed));
    assert.equal(trdIssues().length, 3);
    assert.equal(objectiveIssue().subIssues.length, 3);
    assert.deepEqual(ledgerEntries(), {}, 'the ledger is settled after the flush');
    const idx = outbox.readCacheIndex(S.root);
    for (const f of STORE_FIXTURE.trdFiles) {
      assert.equal(idx[`${OBJ_REL}/${f}`], ghTrd.contentHash(STORE_FIXTURE.trds[f]), `${f} baselined`);
    }
  });
});

describe('store mode: put-trd budget refusal (U-2, D-06)', () => {
  useProject({ store: true });

  test('7. over 60,000 encoded chars -> refused:budget, nothing written, zero gh calls', () => {
    if (S.skipped) return;
    const big = oversizedTrdText(60001, { id: '7-04', file: '07-04-big-TRD.md' });
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-04-big-TRD.md', text: big });
    assert.equal(r.ok, false);
    assert.equal(r.refused, 'budget');
    assert.equal(r.exit, 1);
    assert.match(r.error, /60,000/);
    assert.equal(fs.existsSync(planning(OBJ_REL, '07-04-big-TRD.md')), false, 'not written');
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');
    assert.equal(journalExists(), false);
    assert.equal(ledgerExists(), false);
  });

  test('7b. 40,000+ warns in store mode and is still written', () => {
    if (S.skipped) return;
    S.fake.setOffline(true);
    const warn = oversizedTrdText(45000, { id: '7-04', file: '07-04-big-TRD.md' });
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-04-big-TRD.md', text: warn, noPush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.warnings.some((w) => /40,000/.test(w)), JSON.stringify(r.warnings));
    assert.equal(readRel(`${OBJ_REL}/07-04-big-TRD.md`), warn);
  });
});

describe('store mode: frozen TRDs and unknown freeze state', () => {
  useProject({ store: true, sync: true });

  test('8. a frozen TRD is refused naming `gh trd scope`; nothing is written', () => {
    if (S.skipped) return;
    const frozen = capture(() => cli.cmdGhTrd(S.root, ['freeze', '07-01'], true));
    assert.equal(exitOf(frozen), 0, frozen.stdout + frozen.stderr);
    const before = readRel(`${OBJ_REL}/07-01-alpha-TRD.md`);
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-01-alpha-TRD.md', text: `${before}\nmore\n` });
    assert.equal(r.ok, false);
    assert.equal(r.refused, 'frozen');
    assert.equal(r.exit, 1);
    assert.match(r.error, /gh trd scope/);
    assert.equal(readRel(`${OBJ_REL}/07-01-alpha-TRD.md`), before, 'untouched');
    assert.equal(Object.hasOwn(ledgerEntries(), `${OBJ_REL}/07-01-alpha-TRD.md`), false);
  });

  test('8b. offline: freeze state unknown -> warning, proceeds, exit 3 (pending)', () => {
    if (S.skipped) return;
    S.fake.setOffline(true);
    const text = `${STORE_FIXTURE.trds['07-02-beta-TRD.md']}\nAn offline edit.\n`;
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-02-beta-TRD.md', text });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 3, JSON.stringify(r));
    assert.ok(r.warnings.some((w) => /freeze state unknown/.test(w)), JSON.stringify(r.warnings));
    assert.equal(readRel(`${OBJ_REL}/07-02-beta-TRD.md`), text);
    assert.equal(ledgerEntries()[`${OBJ_REL}/07-02-beta-TRD.md`].hash, ghTrd.contentHash(text), 'in the ledger');
    assert.notEqual(outbox.readCacheIndex(S.root)[`${OBJ_REL}/07-02-beta-TRD.md`], ghTrd.contentHash(text), 'not baselined');
    assert.ok(pendingOps().length > 0, 'the push is queued');
  });
});

describe('store mode: a worktree writes the MAIN checkout (D-14)', () => {
  useProject({ store: true, sync: true });

  test('15. putTrd from a linked worktree writes main/.planning and the main journal', () => {
    if (S.skipped) return;
    const main = fs.realpathSync(S.root);
    const gitdir = path.join(main, '.git', 'worktrees', 'wt1');
    fs.mkdirSync(gitdir, { recursive: true });
    const wt = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pv-wt-')));
    S.extra.push(wt);
    fs.writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
    fs.writeFileSync(path.join(gitdir, 'gitdir'), `${path.join(wt, '.git')}\n`);
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitdir}\n`);
    fs.cpSync(path.join(main, '.planning'), path.join(wt, '.planning'), { recursive: true });

    const rel = `${OBJ_REL}/07-02-beta-TRD.md`;
    const original = readRel(rel);
    const text = `${original}\nEdited from a worktree.\n`;
    const r = verbs.putTrd(wt, { objective: '7', file: '07-02-beta-TRD.md', text, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.path, path.join(main, '.planning', ...rel.split('/')));
    assert.equal(fs.readFileSync(path.join(main, '.planning', ...rel.split('/')), 'utf8'), text, 'main written');
    assert.equal(fs.readFileSync(path.join(wt, '.planning', ...rel.split('/')), 'utf8'), original, 'worktree untouched');
    assert.ok(pendingOps(main).some((o) => o.kind === 'upsert-issue' && o.target.id === '7-02'), 'main journal');
    assert.equal(journalExists(wt), false, 'no worktree journal');
    assert.equal(ledgerEntries(main)[rel].hash, ghTrd.contentHash(text));
    assert.equal(ledgerExists(wt), false, 'no worktree ledger');
  });
});

// ─── Task 2: objective, summary, verification and doc verbs ──────────────────

const commentsOn = (number) => S.fake.comments.filter((c) => c.issue_number === number);
const NEW_SUMMARY = `${STORE_FIXTURE.summary}\nUpdated by summary post.\n`;
const VERIFICATION = '# Objective 7 Verification\n\nstatus: passed\n\nEvery success criterion holds.\n';

describe('local mode: the other verbs write today\'s files (D-01)', () => {
  useProject({ store: false });

  test('3. objective put, summary post/checkpoint, verification post, doc put -> exact files, zero calls', () => {
    const objective = `${STORE_FIXTURE.objective}\nA local edit.\n`;
    const cases = [
      [verbs.objectivePut(S.root, { id: '7', text: objective }), `${OBJ_REL}/OBJECTIVE.md`, objective],
      [verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY }), `${OBJ_REL}/07-01-alpha-SUMMARY.md`, NEW_SUMMARY],
      [verbs.summaryPost(S.root, { trd: '07-02', text: 'two\n' }), `${OBJ_REL}/07-02-SUMMARY.md`, 'two\n'],
      [verbs.summaryCheckpoint(S.root, { trd: '07-03', text: 'wip\n' }), `${OBJ_REL}/07-03-SUMMARY.md`, 'wip\n'],
      [verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION }), `${OBJ_REL}/07-VERIFICATION.md`, VERIFICATION],
      [verbs.docPut(S.root, { rel: 'PROJECT.md', text: '# P\n' }), 'PROJECT.md', '# P\n'],
    ];
    for (const [r, rel, text] of cases) {
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.mode, 'local');
      assert.equal(r.exit, 0);
      assert.equal(r.rel, rel);
      assert.ok(Buffer.from(text).equals(fs.readFileSync(planning(rel))), `${rel}: same bytes`);
    }
    assert.equal(fs.existsSync(planning('.trd-progress')), false, 'no checkpoint file in local mode');
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');
    assert.equal(journalExists(), false);
    assert.equal(ledgerExists(), false);
  });

  test('4. set-status edits only the status line; complete delegates; an unknown status lists them', () => {
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'verifying' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(readRel(`${OBJ_REL}/OBJECTIVE.md`), STORE_FIXTURE.objective.replace('status: planned', 'status: verifying'));

    const done = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(done.ok, true);
    assert.equal(done.delegate, 'objective complete');
    assert.equal(readRel(`${OBJ_REL}/OBJECTIVE.md`), STORE_FIXTURE.objective.replace('status: planned', 'status: complete'));

    const bogus = verbs.objectiveSetStatus(S.root, { id: '7', status: 'bogus' });
    assert.equal(bogus.ok, false);
    assert.equal(bogus.exit, 1);
    for (const s of verbs.STATUSES) assert.ok(bogus.error.includes(s), `${s} is listed`);
    assert.deepEqual(verbs.STATUSES, ['planned', 'in_progress', 'verifying', 'complete', 'cancelled', 'reopened']);
    assert.equal(S.fake.calls().length, 0);
    assert.equal(journalExists(), false);
  });

  test('5. doc put refuses files another verb owns, naming the class and the verb', () => {
    const trdRel = `${OBJ_REL}/07-01-alpha-TRD.md`;
    const before = readRel(trdRel);
    const r = verbs.docPut(S.root, { rel: trdRel, text: 'nope\n' });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 1);
    assert.match(r.error, /plan put-trd/);
    assert.match(r.error, /cache/);
    assert.equal(readRel(trdRel), before, 'not written');
    assert.match(verbs.docPut(S.root, { rel: `${OBJ_REL}/OBJECTIVE.md`, text: 'x\n' }).error, /objective put/);
    assert.match(verbs.docPut(S.root, { rel: 'STATE.md', text: 'x\n' }).error, /generated/);
    assert.match(verbs.docPut(S.root, { rel: '.trd-progress/7-01.md', text: 'x\n' }).error, /runtime/);
    assert.equal(S.fake.calls().length, 0);
  });
});

describe('store mode: summary, checkpoint, verification and status verbs', () => {
  useProject({ store: true, sync: true });

  test('9. summary post -> the summary comment on the TRD issue; the checkpoint file is removed', () => {
    if (S.skipped) return;
    fs.mkdirSync(planning('.trd-progress'), { recursive: true });
    fs.writeFileSync(planning('.trd-progress', '7-01.md'), 'wip\n');
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.rel, `${OBJ_REL}/07-01-alpha-SUMMARY.md`);
    assert.equal(readRel(r.rel), NEW_SUMMARY);
    const summaries = commentsOn(trdIssueNumber('7-01')).filter((c) => c.body.includes('kind=summary'));
    assert.equal(summaries.length, 1, 'one sticky summary comment');
    assert.ok(summaries[0].body.includes('Updated by summary post.'));
    assert.equal(fs.existsSync(planning('.trd-progress', '7-01.md')), false, 'checkpoint removed');
    assert.deepEqual(ledgerEntries(), {});
    assert.equal(outbox.readCacheIndex(S.root)[r.rel], ghTrd.contentHash(NEW_SUMMARY));
  });

  test('10. summary checkpoint -> .trd-progress/<trd>.md, zero calls, no ledger entry, nothing queued', () => {
    if (S.skipped) return;
    const calls = S.fake.calls().length;
    const r = verbs.summaryCheckpoint(S.root, { trd: '07-02', text: 'task 1 done\n' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.rel, '.trd-progress/7-02.md');
    assert.equal(fs.readFileSync(planning('.trd-progress', '7-02.md'), 'utf8'), 'task 1 done\n');
    assert.equal(fs.existsSync(planning(OBJ_REL, '07-02-SUMMARY.md')), false);
    assert.equal(S.fake.calls().length, calls, 'zero gh calls');
    assert.deepEqual(ledgerEntries(), {});
    assert.equal(pendingOps().length, 0);
  });

  test('11. verification post -> the sticky verification comment on the objective issue', () => {
    if (S.skipped) return;
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(readRel(`${OBJ_REL}/07-VERIFICATION.md`), VERIFICATION);
    const found = commentsOn(objectiveIssue().number).filter((c) => c.body.includes('kind=verification'));
    assert.equal(found.length, 1);
    assert.ok(found[0].body.includes('Every success criterion holds.'));
    assert.deepEqual(ledgerEntries(), {});
  });

  test('13. set-status complete closes the objective issue as completed; the frontmatter follows', () => {
    if (S.skipped) return;
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.delegate, undefined, 'store mode closes the issue itself');
    const issue = objectiveIssue();
    assert.equal(issue.state, 'CLOSED');
    assert.equal(issue.stateReason, 'completed');
    assert.match(readRel(`${OBJ_REL}/OBJECTIVE.md`), /^status: complete$/m);
  });

  test('13b. set-status cancelled closes it as not planned; in_progress only edits the frontmatter', () => {
    if (S.skipped) return;
    const writes = S.fake.writes().length;
    const moving = verbs.objectiveSetStatus(S.root, { id: '7', status: 'in_progress' });
    assert.equal(moving.ok, true, JSON.stringify(moving));
    assert.equal(objectiveIssue().state, 'OPEN');
    assert.match(readRel(`${OBJ_REL}/OBJECTIVE.md`), /^status: in_progress$/m);
    assert.ok(!S.fake.writes().slice(writes).some((w) => w.join(' ').includes('"state"')), 'no state change sent');

    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'cancelled' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(objectiveIssue().state, 'CLOSED');
    assert.equal(objectiveIssue().stateReason, 'not_planned');
  });
});

describe('store mode: doc put -> wiki pages', () => {
  useProject({ store: true, sync: true });

  test('12. research/a.md -> Research-a; 07-CONTEXT.md -> the objective context page', () => {
    if (S.skipped) return;
    const research = '# Research note a\n\nFindings.\n';
    const r = verbs.docPut(S.root, { rel: 'research/a.md', text: research });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(readRel('research/a.md'), research);
    assert.equal(S.remote.readRemotePage('Research-a'), research);

    const context = `${STORE_FIXTURE.context}\n- One more decision.\n`;
    const c = verbs.docPut(S.root, { rel: `${OBJ_REL}/07-CONTEXT.md`, text: context, message: 'context edit' });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(S.remote.readRemotePage('Objective-7-store-demo-Context'), context);
    assert.deepEqual(ledgerEntries(), {});
    assert.equal(outbox.readCacheIndex(S.root)['research/a.md'], ghTrd.contentHash(research));
  });

  test('18. a stale draft is refused: nothing written, no gh call, no outbox op (TOOL-06)', () => {
    if (S.skipped) return;
    const rel = 'research/a.md';
    S.extra.push(path.join(os.tmpdir(), 'aoforge-drafts', outbox.repoKey(fs.realpathSync(S.root))));
    const first = verbs.docPut(S.root, { rel, text: '# Research note a\n\nv1\n' });
    assert.equal(first.ok, true, JSON.stringify(first));

    const draft = verbs.draftPath(S.root, rel);
    assert.equal(fs.readFileSync(draft, 'utf8'), '# Research note a\n\nv1\n');
    fs.writeFileSync(draft, '# Research note a\n\nmy edit of v1\n');

    // Another writer changes the cache file after the draft was seeded.
    const elsewhere = path.join(S.envh.root, 'elsewhere.md');
    const changed = '# Research note a\n\nv2 from someone else\n';
    fs.writeFileSync(elsewhere, changed);
    const second = verbs.docPut(S.root, { rel, text: changed, from: elsewhere });
    assert.equal(second.ok, true, JSON.stringify(second));

    const calls = S.fake.calls().length;
    const ops = outbox.readJournal(S.root).journal.ops.length;
    const res = verbs.docPut(S.root, { rel, text: fs.readFileSync(draft, 'utf8'), from: draft });
    assert.equal(res.ok, false, JSON.stringify(res));
    assert.equal(res.refused, 'stale draft');
    assert.match(res.error, /planning draft research\/a\.md/);
    assert.equal(readRel(rel), changed, 'the cache file is unchanged');
    assert.equal(S.remote.readRemotePage('Research-a'), changed, 'the wiki page is unchanged');
    assert.equal(S.fake.calls().length, calls, 'no gh call');
    assert.equal(outbox.readJournal(S.root).journal.ops.length, ops, 'no outbox op');
  });
});

// ─── Task 3: a later `gh outbox flush` settles verb writes ───────────────────

describe('store mode: --no-flush, then `gh outbox flush` settles the ledger (D-15)', () => {
  useProject({ store: true, sync: true });

  test('14. queued only; the CLI flush baselines it and empties its ledger entry; an unqueued write stays', () => {
    if (S.skipped) return;
    const rel = `${OBJ_REL}/07-04-x-TRD.md`;
    const text = smallTrd('04');
    const r = verbs.putTrd(S.root, { objective: '7', file: '07-04-x-TRD.md', text, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.ok(r.queued.enqueued.length + r.queued.coalesced.length > 0, 'something queued');
    assert.ok(pendingOps().some((o) => o.kind === 'upsert-issue' && o.target.id === '7-04'), 'the journal holds the op');
    assert.equal(ledgerEntries()[rel].verb, 'plan put-trd');
    assert.equal(outbox.readCacheIndex(S.root)[rel], undefined, 'no baseline before the flush');

    // Written after the push was queued, with --no-push: GitHub will not have it, so no flush may baseline it.
    const later = `${OBJ_REL}/07-05-y-TRD.md`;
    const np = verbs.putTrd(S.root, { objective: '7', file: '07-05-y-TRD.md', text: smallTrd('05', 'y'), noPush: true });
    assert.equal(np.ok, true, JSON.stringify(np));
    assert.equal(ledgerEntries()[later].verb, 'plan put-trd (not queued)');

    const out = capture(() => cli.cmdGhOutbox(S.root, ['flush'], true));
    assert.equal(exitOf(out), 0, out.stdout + out.stderr);
    const payload = JSON.parse(out.stdout);
    assert.equal(payload.status, 'flushed');
    assert.ok(payload.settled.includes(rel), JSON.stringify(payload.settled));
    assert.ok(!payload.settled.includes(later));
    assert.equal(Object.hasOwn(ledgerEntries(), rel), false, 'settled entry forgotten');
    assert.equal(Object.hasOwn(ledgerEntries(), later), true, 'the unqueued write stays');
    const idx = outbox.readCacheIndex(S.root);
    assert.equal(idx[rel], ghTrd.contentHash(text), 'baselined after the flush');
    assert.equal(idx[later], undefined, 'never baselined');
    assert.ok(trdIssues().some((i) => i.title.includes('07-04') || i.body.includes('aoforge:id=7-04')), 'the TRD issue exists');
  });
});
