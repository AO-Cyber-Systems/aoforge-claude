'use strict';

// planning-verbs-pr.test.cjs (TRD 49-11) — TRD completion and verify pass drive the objective PR (GPR-03), and the
// objective issue is not closed at verify time while its PR is unmerged (GPR-04, 49 Pitfall 3).
//
// Test list (TRD 49-11):
//   close   8  objective set-status complete defers the close while a PR is unmerged (RED on objective 48's code)
//           9  the same after the PR merged: the close is queued   10 no PR on record: closed as today
//   summary 1  label removal + upsert-pr refresh in ONE enqueue, no title    2 no PR: comment + label only
//           1b a pending `trd start` label add is not re-added by the removal   1c no refresh for a merged PR
//   verify  3  passed -> post-status success + pr-ready + wiki-diff comment   4 unchanged wiki -> "No wiki pages changed"
//           5  gaps_found -> failure, no ready   6 human_needed -> pending, no ready   7 docs mode -> no wiki-diff op
//   local   11 summary / verification / set-status complete: today's bytes, zero gh calls, even with a `prs` entry
//
// Hermetic: hermeticEnv() temp HOME / outbox / cache dirs, the stateful fake GitHub through the gh-client seam, a fake
// clock, the wiki is a local bare repo over file://. No real GitHub, no network, no port, never ~/.claude.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const verbs = require('./planning-verbs.cjs');
const gh = require('./gh.cjs');
const ob = require('./objective-branch.cjs');
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const comments = require('./gh-comments.cjs');
const wikiLib = require('./gh-wiki.cjs');
const bodyLib = require('./gh-body.cjs');
const { LEGACY } = require('./legacy-names.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DIR = STORE_FIXTURE.objectiveDir;
const OBJ_REL = `objectives/${DIR}`;
const BRANCH = 'df/objective-07-store-demo';
const TIP = `feed${'0'.repeat(36)}`;
const PR_TITLE = '[Objective 7] Store demo';
const IN_PROGRESS = 'aoforge:in-progress';
// `summary post` removes the default label and its legacy twin (TRD 72-11); the flusher drops one the issue lacks.
const IN_PROGRESS_FORMS = [IN_PROGRESS, `${LEGACY.markerNs}:in-progress`];

// ─── Harness ─────────────────────────────────────────────────────────────────

let S;

/**
 * Hermetic env + store-shaped project (objective 7, three TRDs) + fake GitHub + fake clock, rebuilt before every
 * test. `store` selects github.store; `sync` runs gh.syncObjective('7') once so the issues exist; `hasWiki: false`
 * makes the fake repo wiki-less (pages go to docs/).
 */
function useProject({ store = true, sync = true, hasWiki = true } = {}) {
  beforeEach((t) => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store, hasWiki });
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
    S = { envh, project, root: project.root, fake, clock, remote, restoreGit, savedRemote, skipped: false };
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
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (...rel) => path.join(S.root, '.aoforge', ...rel);
const readRel = (rel) => fs.readFileSync(planning(rel), 'utf8');
const mappingNow = () => mappingLib.readMappingV3(S.root);
const allOps = () => outbox.readJournal(S.root).journal.ops;
const pendingOps = () => allOps().filter((o) => o.status === 'pending');
const opsOf = (kind, list = pendingOps()) => list.filter((o) => o.kind === kind);
const objectiveIssue = () => S.fake.issues.find((i) => i.number === mappingLib.getEntry(mappingNow(), '7').issue_id);
const trdIssue = (id) => S.fake.issues.find((i) => i.number === mappingLib.getTrd(mappingNow(), id).issue_number);
const prRecord = () => S.fake.issues.find((i) => i.pr);
const closeOps = (list = allOps()) => list.filter((o) => o.kind === 'patch-issue' && o.payload && o.payload.state === 'closed');

function flushNow() {
  const f = flushLib.flush(S.root, { wait: false });
  assert.equal(f.status, 'flushed', JSON.stringify(f));
  return f;
}

/** Record `prs['7']` (a PR that exists only in the mapping): what `gh pr start` leaves before the PR is flushed. */
function recordPr(patch = {}) {
  const m = mappingNow();
  mappingLib.setPr(m, '7', { branch: BRANCH, base: 'main', ...patch });
  assert.ok(mappingLib.writeMappingV3(S.root, m).ok);
}

/** Create the objective's draft PR through the flusher (as `gh pr start` does), then return its mapping entry. */
function startPr({ wikiBase = null } = {}) {
  S.fake.pushRef(BRANCH, TIP);
  const q = outbox.enqueue(S.root, [{ kind: 'upsert-pr', target: { id: '7' }, payload: { branch: BRANCH, base: 'main', title: PR_TITLE } }]);
  assert.equal(q.ok, true, JSON.stringify(q));
  flushNow();
  if (wikiBase) recordPr({ wiki_base_sha: wikiBase });
  const entry = mappingLib.getPr(mappingNow(), '7');
  assert.ok(entry && entry.number, 'the PR was created and mapped');
  return entry;
}

const VERIFICATION_PASSED = [
  '---', 'objective: 07-store-demo', 'status: passed', 'score: 12/12 must-haves', '---', '', '# Objective 7 Verification', '',
  'Every success criterion holds.', '',
].join('\n');
const verificationText = (status, score) => [
  '---', 'objective: 07-store-demo', `status: ${status}`, ...(score ? [`score: ${score}`] : []), '---', '', '# Objective 7 Verification', '',
  'Findings.', '',
].join('\n');
const NEW_SUMMARY = `${STORE_FIXTURE.summary}\nUpdated by summary post.\n`;

// ─── Task 1: the objective issue does not close at verify time ───────────────

describe('49-11 objective set-status complete while the PR is unmerged', () => {
  useProject({ store: true, sync: true });

  test('8. a PR on record without merged_at: the status is written, no close is queued or sent, close_deferred names the PR', () => {
    if (S.skipped) return;
    const entry = startPr();
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.close_deferred, `pr #${entry.number}`);
    assert.ok(r.warnings.some((w) => w.includes(`stays open until pr #${entry.number} merges`)), `objective complete prints warnings: ${r.warnings}`);
    assert.match(readRel(`${OBJ_REL}/OBJECTIVE.md`), /^status: complete$/m);
    assert.deepEqual(closeOps(), [], 'no op ever carried state closed');
    assert.equal(objectiveIssue().state, 'OPEN', 'the objective issue stays open until its PR merges');
  });

  test('8b. a PR recorded only in the mapping (branch pushed, PR not created yet) defers the close too', () => {
    if (S.skipped) return;
    recordPr();
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete', noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.close_deferred, `pr (branch ${BRANCH})`);
    assert.deepEqual(closeOps(), []);
  });

  test('8c. cancelled and reopened are not deferred: only complete waits for the merge', () => {
    if (S.skipped) return;
    startPr();
    const c = verbs.objectiveSetStatus(S.root, { id: '7', status: 'cancelled', noFlush: true });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(c.close_deferred, undefined);
    assert.equal(closeOps().length, 1, 'cancelled still closes the issue');
  });

  test('9. after reconcile recorded merged_at, complete closes the objective issue as completed', () => {
    if (S.skipped) return;
    startPr();
    recordPr({ merged_at: '2026-10-01T12:00:00Z' });
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.close_deferred, undefined);
    assert.equal(objectiveIssue().state, 'CLOSED');
    assert.equal(objectiveIssue().stateReason, 'completed');
  });

  test('10. no PR on record (objective never started): complete closes the issue as today', () => {
    if (S.skipped) return;
    const r = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.close_deferred, undefined);
    assert.equal(objectiveIssue().state, 'CLOSED');
    assert.equal(objectiveIssue().stateReason, 'completed');
  });
});

// ─── Task 2: summary post and verification post drive the PR ─────────────────

describe('49-11 summary post: label removal and PR refresh in one enqueue', () => {
  useProject({ store: true, sync: true });

  test('1. PR on record: the summary comment, the in-progress label removal and the PR summary refresh are queued together; one flush applies them; the PR title is kept', () => {
    if (S.skipped) return;
    const entry = startPr();
    assert.equal(comments.enqueueTrdStart(S.root, { trdId: '7-01' }).ok, true);
    flushNow();
    assert.ok(trdIssue('7-01').labels.includes(IN_PROGRESS), 'trd start put the label on');
    prRecord().title = 'A human renamed this PR';

    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.queued.enqueued.length, 3, 'one enqueue carries the comment, the label removal and the PR refresh');
    assert.equal(r.pr_refresh, undefined, 'a refresh that was queued needs no note');
    const pending = pendingOps();
    const summary = opsOf('upsert-comment', pending);
    assert.equal(summary.length, 1);
    assert.deepEqual(summary[0].target, { id: '7-01', kind: 'summary' });
    assert.equal(summary[0].payload.mode, 'replace');
    const patch = opsOf('patch-issue', pending);
    assert.equal(patch.length, 1);
    assert.deepEqual(patch[0].target, { id: '7-01' });
    assert.deepEqual(patch[0].payload, { labels_remove: IN_PROGRESS_FORMS });
    const pr = opsOf('upsert-pr', pending);
    assert.equal(pr.length, 1);
    assert.deepEqual(pr[0].target, { id: '7' });
    assert.deepEqual(pr[0].payload, { branch: BRANCH, base: 'main', summary: 'TRDs complete 1/3' });
    assert.equal('title' in pr[0].payload, false, 'the title is create-only (49-05); the refresh carries none');
    assert.equal(pending.length, 3);

    const writes = S.fake.writes().length;
    flushNow();
    assert.ok(S.fake.writes().length > writes);
    assert.equal(trdIssue('7-01').labels.includes(IN_PROGRESS), false, 'the label is gone');
    assert.equal(bodyLib.extractSection(prRecord().body, 'summary'), 'TRDs complete 1/3');
    assert.equal(prRecord().title, 'A human renamed this PR', 'the remote title is kept');
    assert.equal(prRecord().number, entry.number);
    assert.equal(S.fake.comments.filter((c) => c.issue_number === trdIssue('7-01').number && c.body.includes('Updated by summary post.')).length, 1);

    // The second TRD completing moves the count.
    const two = verbs.summaryPost(S.root, { trd: '07-02', text: 'two\n' });
    assert.equal(two.ok, true, JSON.stringify(two));
    assert.equal(bodyLib.extractSection(prRecord().body, 'summary'), 'TRDs complete 2/3');
  });

  test('1b. a `trd start` label add still pending is not re-added: the removal replaces it in the one patch-issue', () => {
    if (S.skipped) return;
    startPr();
    assert.equal(comments.enqueueTrdStart(S.root, { trdId: '7-01' }).ok, true);
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    const patch = opsOf('patch-issue').filter((o) => o.target.id === '7-01');
    assert.equal(patch.length, 1, 'both land on one op (same kind and target)');
    assert.deepEqual(patch[0].payload, { labels_remove: IN_PROGRESS_FORMS });
    flushNow();
    assert.equal(trdIssue('7-01').labels.includes(IN_PROGRESS), false);
  });

  test('1c. a merged PR is not refreshed (the label still comes off)', () => {
    if (S.skipped) return;
    startPr();
    recordPr({ merged_at: '2026-10-01T12:00:00Z' });
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pr_refresh, 'skipped (pr merged)');
    assert.deepEqual(opsOf('upsert-pr'), []);
    assert.equal(opsOf('patch-issue').length, 1);
  });

  test('1d. a PR creation still pending keeps its title and wiki: the refresh merges into the queued upsert-pr', () => {
    if (S.skipped) return;
    recordPr();
    const wiki = { dir: DIR, page: 'Objective-7-store-demo', url: 'https://github.com/o/r/wiki/Objective-7-store-demo/abc1234', sha: 'abc1234' };
    const q = outbox.enqueue(S.root, [{ kind: 'upsert-pr', target: { id: '7' }, payload: { branch: BRANCH, base: 'main', title: PR_TITLE, wiki } }]);
    assert.equal(q.ok, true, JSON.stringify(q));
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    const pr = opsOf('upsert-pr');
    assert.equal(pr.length, 1, 'coalesced, not duplicated');
    assert.deepEqual(pr[0].payload, { branch: BRANCH, base: 'main', title: PR_TITLE, wiki, summary: 'TRDs complete 1/3' });
  });

  test('1e. a PR entry with no base on record: no refresh op, and the note says why', () => {
    if (S.skipped) return;
    recordPr({ base: null });
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pr_refresh, 'skipped (no branch on record)');
    assert.deepEqual(opsOf('upsert-pr'), []);
    assert.equal(opsOf('upsert-comment').length, 1);
  });

  test('2. no PR on record: the summary comment and the label removal only, no PR op', () => {
    if (S.skipped) return;
    const labels = [...trdIssue('7-01').labels];
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    assert.equal(r.pr_refresh, undefined);
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['patch-issue', 'upsert-comment']);
    assert.deepEqual(opsOf('patch-issue')[0].payload, { labels_remove: IN_PROGRESS_FORMS });
    flushNow();
    assert.deepEqual(trdIssue('7-01').labels, labels, 'a TRD that never had the label is left alone');
    assert.equal(S.fake.issues.some((i) => i.pr), false, 'no PR was created');
  });

  test('2b. the configured in-progress label is the one removed', () => {
    if (S.skipped) return;
    const cfgFile = planning('config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    cfg.github.labels = { ...(cfg.github.labels || {}), in_progress: 'wip' };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
    const r = verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(opsOf('patch-issue')[0].payload, { labels_remove: ['wip'] });
  });
});

// A wiki clone with one page committed (the base) and, optionally, a second page changed after it.
function wikiFixture({ change = true } = {}) {
  assert.equal(verbs.docPut(S.root, { rel: 'research/a.md', text: '# A\n\nFirst.\n' }).ok, true);
  const base = wikiLib.headSha(S.root);
  assert.ok(base, 'the wiki clone exists');
  if (change) assert.equal(verbs.docPut(S.root, { rel: 'research/b.md', text: '# B\n\nChanged during the objective.\n' }).ok, true);
  return base;
}
const statusesOn = (sha) => (S.fake.statuses[sha] || []).filter((s) => s.context === 'aoforge/verification');
const prComments = () => S.fake.comments.filter((c) => prRecord() && c.issue_number === prRecord().number);

describe('49-11 verification post: status, ready and the wiki diff', () => {
  useProject({ store: true, sync: true });

  test('3. passed: post-status success, pr-ready and the wiki-diff comment are queued with the verification comment; a flush marks the PR ready', () => {
    if (S.skipped) return;
    const base = wikiFixture();
    startPr({ wikiBase: base });
    assert.equal(prRecord().pr.draft, true);

    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.queued.enqueued.length, 4, 'one enqueue: the comment, the status, ready and the wiki diff');
    const pending = pendingOps();
    assert.deepEqual(opsOf('upsert-comment', pending)[0].target, { id: '7', kind: 'verification' });
    const status = opsOf('post-status', pending);
    assert.equal(status.length, 1);
    assert.deepEqual(status[0].target, { id: '7', context: 'aoforge/verification' });
    assert.deepEqual(status[0].payload, { state: 'success', description: 'Objective 7 verified (12/12 must-haves)' });
    assert.equal('sha' in status[0].payload, false, 'the flusher resolves the PR head at flush (49-10)');
    assert.deepEqual(opsOf('pr-ready', pending)[0].target, { id: '7' });
    const diff = opsOf('upsert-pr-comment', pending);
    assert.equal(diff.length, 1);
    assert.deepEqual(diff[0].target, { id: '7', kind: 'wiki-diff' });
    assert.equal(diff[0].payload.mode, 'replace');
    assert.ok(diff[0].payload.text.startsWith('## Wiki changes during objective 7\n'), diff[0].payload.text);
    assert.match(diff[0].payload.text, /```diff\n/);
    assert.match(diff[0].payload.text, /Research-b\.md/);
    assert.match(diff[0].payload.text, /\+Changed during the objective\./);
    assert.doesNotMatch(diff[0].payload.text, /Research-a\.md/, 'only what changed since wiki_base_sha');

    flushNow();
    assert.equal(prRecord().pr.draft, false, 'the PR is ready for review');
    const posted = statusesOn(TIP);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'success');
    assert.equal(posted[0].description, 'Objective 7 verified (12/12 must-haves)');
    const sticky = prComments().filter((c) => c.body.includes('Research-b.md'));
    assert.equal(sticky.length, 1, 'the wiki diff is a comment on the PR');
    assert.equal(objectiveIssue().state, 'OPEN', 'verify pass does not close the objective issue');
  });

  test('3b. a re-run on every verify pass is a no-op on GitHub (status, ready and comment are idempotent)', () => {
    if (S.skipped) return;
    startPr({ wikiBase: wikiFixture() });
    assert.equal(verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED }).ok, true);
    const writes = S.fake.writes().length;
    const again = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED });
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.exit, 0, JSON.stringify(again));
    assert.equal(S.fake.writes().length, writes, 'zero writes on the second pass');
    assert.equal(statusesOn(TIP).length, 1);
  });

  test('3c. no PR on record: only the verification comment, as objective 48 left it', () => {
    if (S.skipped) return;
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
  });

  test('3d. a merged PR gets no status, ready or diff', () => {
    if (S.skipped) return;
    startPr();
    recordPr({ merged_at: '2026-10-01T12:00:00Z' });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
  });

  test('3e. a verdict that cannot be read (no frontmatter status) posts no PR status and says so', () => {
    if (S.skipped) return;
    startPr();
    const r = verbs.verificationPost(S.root, { objective: '7', text: '# Objective 7 Verification\n\nstatus: passed\n', noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
    assert.ok(r.warnings.some((w) => /no recognised `status:`/.test(w)), r.warnings.join('\n'));
    const odd = verbs.verificationPost(S.root, { objective: '7', text: verificationText('in_progress'), noFlush: true });
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
    assert.ok(odd.warnings.some((w) => /in_progress/.test(w)), odd.warnings.join('\n'));
  });

  test('3f. the description is the score when there is one, never longer than 140 characters', () => {
    if (S.skipped) return;
    startPr();
    const bare = verbs.verificationPost(S.root, { objective: '7', text: verificationText('passed'), noFlush: true });
    assert.equal(bare.ok, true, JSON.stringify(bare));
    assert.equal(opsOf('post-status')[0].payload.description, 'Objective 7 verified');
    const long = verbs.verificationPost(S.root, { objective: '7', text: verificationText('passed', `${'9/9 '.repeat(60)}must-haves`), noFlush: true });
    assert.equal(long.ok, true, JSON.stringify(long));
    const d = opsOf('post-status')[0].payload.description;
    assert.ok(d.length <= 140 && d.startsWith('Objective 7 verified ('), d);
  });

  test('4. the wiki is unchanged since wiki_base_sha: the comment says so', () => {
    if (S.skipped) return;
    startPr({ wikiBase: wikiFixture({ change: false }) });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    const diff = opsOf('upsert-pr-comment');
    assert.equal(diff.length, 1);
    assert.equal(diff[0].payload.text, 'No wiki pages changed during this objective.');
  });

  test('4b. a wiki page that itself contains a code fence cannot close the diff block early', () => {
    if (S.skipped) return;
    const base = wikiFixture({ change: false });
    assert.equal(verbs.docPut(S.root, { rel: 'research/c.md', text: '# C\n\n```js\nconst x = 1;\n```\n' }).ok, true);
    startPr({ wikiBase: base });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    const text = opsOf('upsert-pr-comment')[0].payload.text;
    assert.match(text, /\n````diff\n/, 'a four-backtick fence around a diff holding a three-backtick fence');
    assert.ok(text.endsWith('\n````'), text);
  });

  test('5. gaps_found: post-status failure, no ready, no wiki diff; the PR stays a draft', () => {
    if (S.skipped) return;
    startPr({ wikiBase: wikiFixture() });
    const r = verbs.verificationPost(S.root, { objective: '7', text: verificationText('gaps_found', '10/12 must-haves') });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    const sent = statusesOn(TIP);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].state, 'failure');
    assert.equal(sent[0].description, 'Objective 7 verification found gaps (10/12 must-haves)');
    assert.equal(prRecord().pr.draft, true);
    assert.equal(opsOf('pr-ready', allOps()).length + opsOf('upsert-pr-comment', allOps()).length, 0);
  });

  test('6. human_needed: post-status pending, no ready', () => {
    if (S.skipped) return;
    startPr();
    const r = verbs.verificationPost(S.root, { objective: '7', text: verificationText('human_needed'), noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    const status = opsOf('post-status');
    assert.equal(status.length, 1);
    assert.deepEqual(status[0].payload, { state: 'pending', description: 'Objective 7 needs human verification' });
    assert.equal(opsOf('pr-ready').length, 0);
    assert.equal(opsOf('upsert-pr-comment').length, 0);
    flushNow();
    assert.equal(prRecord().pr.draft, true);
    assert.equal(statusesOn(TIP)[0].state, 'pending');
  });

  test('7b. a wiki base the clone does not know: no diff op, a warning, status and ready still queued', () => {
    if (S.skipped) return;
    wikiFixture();
    startPr({ wikiBase: 'deadbeefdeadbeefdeadbeef' });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['post-status', 'pr-ready', 'upsert-comment']);
    assert.ok(r.warnings.some((w) => /wiki diff not posted/.test(w)), r.warnings.join('\n'));
  });
});

describe('49-11 verification post in pages (docs) mode', () => {
  useProject({ store: true, sync: true, hasWiki: false });

  test('7. no wiki diff op (the pages are in the PR files); status and ready are still queued', () => {
    if (S.skipped) return;
    startPr();
    assert.equal(wikiLib.headSha(S.root), null, 'docs mode has no wiki clone');
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['post-status', 'pr-ready', 'upsert-comment']);
    assert.deepEqual(r.warnings, [], 'no clone is not worth a warning');
    flushNow();
    assert.equal(prRecord().pr.draft, false);
    assert.equal(statusesOn(TIP).length, 1);
  });
});

// ─── 55-03: refuse before writing while the linked branch has unpushed commits ───

const LOCAL_TIP = `c0de${'1'.repeat(36)}`;
const REMOTE_TIP = `feed${'2'.repeat(36)}`;

/**
 * Stub objective-branch's git seam (the only place planning-verbs reaches git): the local linked branch is `ahead`
 * commits past origin's tip (`local:false` is a clone that has no such branch; `fail` makes `rev-list` fail). Returns
 * every argv the seam saw. Restore with `ob._resetRunGit()` (afterEach).
 */
function stubGit({ ahead = 1, local = true, fail = false } = {}) {
  const calls = [];
  const ok = (stdout = '') => ({ ok: true, status: 0, stdout, stderr: '' });
  const shas = Array.from({ length: ahead }, (_, i) => `${(i + 3).toString(16)}`.repeat(40));
  ob._setRunGit((args) => {
    calls.push(args);
    const line = args.join(' ');
    if (line === 'rev-parse --is-inside-work-tree') return ok('true\n');
    if (args[0] === 'rev-parse' && line.includes('refs/heads/')) {
      return local ? ok(`${LOCAL_TIP}\n`) : { ok: false, status: 1, stdout: '', stderr: '' };
    }
    if (args[0] === 'fetch') return ok();
    if (args[0] === 'rev-parse' && line.includes('refs/remotes/')) return ok(`${REMOTE_TIP}\n`);
    if (args[0] === 'rev-list') {
      return fail ? { ok: false, status: 128, stdout: '', stderr: 'fatal: bad object' } : ok(shas.length ? `${shas.join('\n')}\n` : '');
    }
    return { ok: false, status: 128, stdout: '', stderr: `unexpected git ${line}` };
  });
  return calls;
}

const VERIFICATION_REL = `${OBJ_REL}/07-VERIFICATION.md`;

describe('55-03 verification post refuses unpushed work', () => {
  useProject({ store: true, sync: true });
  afterEach(() => ob._resetRunGit());

  test('4. a passed verdict with the local linked branch 1 commit ahead: refused naming gh pr sync, before the cache file or any op', () => {
    if (S.skipped) return;
    startPr();
    const opsBefore = allOps().length;
    const kindsBefore = (kind) => opsOf(kind, allOps()).length;
    const before = Object.fromEntries(['post-status', 'pr-ready', 'upsert-comment', 'upsert-pr-comment'].map((k) => [k, kindsBefore(k)]));
    const calls = stubGit({ ahead: 1 });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.exit, 1, JSON.stringify(r));
    assert.match(r.error, /aof-tools gh pr sync 7\b/);
    assert.match(r.error, /1 unpushed commit\b/);
    assert.ok(r.error.includes(BRANCH), 'the branch is named');
    assert.ok(calls.length > 0, 'the git seam was asked');
    assert.equal(fs.existsSync(planning(VERIFICATION_REL)), false, 'the VERIFICATION cache file was not created');
    assert.equal(allOps().length, opsBefore, 'nothing was queued');
    for (const kind of Object.keys(before)) {
      assert.equal(opsOf(kind, allOps()).length, before[kind], `no new ${kind} op`);
    }
    assert.equal(opsOf('post-status', allOps()).length, 0, 'no post-status op at all');
    assert.equal(opsOf('pr-ready', allOps()).length, 0, 'no pr-ready op at all');
    assert.equal(S.fake.writes().filter((w) => /statuses/.test(w.join(' '))).length, 0, 'no status reached GitHub');
  });

  test('4b. after the branch is pushed the same call goes through: file written, comment, status and ready queued', () => {
    if (S.skipped) return;
    startPr();
    stubGit({ ahead: 1 });
    assert.equal(verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true }).ok, false);
    stubGit({ ahead: 0 });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(fs.readFileSync(planning(VERIFICATION_REL), 'utf8'), VERIFICATION_PASSED);
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['post-status', 'pr-ready', 'upsert-comment']);
  });

  test('5. every verdict that would post a status is refused: gaps_found (a failure on a head without the code) and human_needed too', () => {
    if (S.skipped) return;
    startPr();
    const opsBefore = allOps().length;
    stubGit({ ahead: 2 });
    for (const status of ['gaps_found', 'human_needed']) {
      const r = verbs.verificationPost(S.root, { objective: '7', text: verificationText(status), noFlush: true });
      assert.equal(r.ok, false, `${status}: ${JSON.stringify(r)}`);
      assert.match(r.error, /aof-tools gh pr sync 7\b/, status);
      assert.match(r.error, /2 unpushed commits\b/, status);
    }
    assert.equal(fs.existsSync(planning(VERIFICATION_REL)), false);
    assert.equal(allOps().length, opsBefore);
  });

  test('5b. a verdict that posts no status (no recognised frontmatter status) is not guarded: nothing to certify, no git call', () => {
    if (S.skipped) return;
    startPr();
    const calls = stubGit({ ahead: 1 });
    const r = verbs.verificationPost(S.root, { objective: '7', text: verificationText('in_progress'), noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(calls.length, 0, 'the git seam was not asked');
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
  });

  test('6. no PR on record: no guard and no git call; a merged PR: no guard and no git call', () => {
    if (S.skipped) return;
    const calls = stubGit({ ahead: 1 });
    const none = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(none.ok, true, JSON.stringify(none));
    assert.deepEqual(pendingOps().map((o) => o.kind), ['upsert-comment']);
    assert.equal(calls.length, 0, 'no PR on record: git not asked');

    ob._resetRunGit();
    startPr();
    recordPr({ merged_at: '2026-10-01T12:00:00Z' });
    const again = stubGit({ ahead: 1 });
    const merged = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(merged.ok, true, JSON.stringify(merged));
    assert.equal(again.length, 0, 'merged PR: git not asked');
  });

  test('6b. a git failure while counting is a warning on the result, never a refusal: the verb still writes and queues', () => {
    if (S.skipped) return;
    startPr();
    stubGit({ ahead: 1, fail: true });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.warnings.some((w) => /could not tell whether .* unpushed/.test(w)), r.warnings.join('\n'));
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['post-status', 'pr-ready', 'upsert-comment']);
    assert.ok(fs.existsSync(planning(VERIFICATION_REL)));
  });

  test('6c. the linked branch is not in this clone, or the PR entry has no branch on record: no guard, no warning', () => {
    if (S.skipped) return;
    startPr();
    stubGit({ local: false });
    const absent = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(absent.ok, true, JSON.stringify(absent));
    assert.equal(absent.warnings.filter((w) => /unpushed/.test(w)).length, 0);

    const m = mappingNow();
    delete m.prs['7'].branch;
    assert.ok(mappingLib.writeMappingV3(S.root, m).ok);
    const calls = stubGit({ ahead: 1 });
    const noBranch = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(noBranch.ok, true, JSON.stringify(noBranch));
    assert.equal(calls.length, 0, 'no branch on record: nothing to compare');
  });

  test('7. the checkout is not a git work tree (the store fixture, real git): no guard and no warning', () => {
    if (S.skipped) return;
    startPr();
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED, noFlush: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.warnings.filter((w) => /unpushed|git work tree/.test(w)).length, 0, r.warnings.join('\n'));
    assert.deepEqual(pendingOps().map((o) => o.kind).sort(), ['post-status', 'pr-ready', 'upsert-comment']);
  });
});

describe('49-11 local mode is today\'s write (D-01)', () => {
  useProject({ store: false, sync: false });
  afterEach(() => ob._resetRunGit());

  test('11b. (55-03) local mode with a `prs` entry and an ahead branch: verification post writes today\'s bytes with zero git calls', () => {
    recordPr({ number: 12 });
    const calls = stubGit({ ahead: 3 });
    const r = verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.mode, 'local');
    assert.ok(Buffer.from(VERIFICATION_PASSED).equals(fs.readFileSync(planning(VERIFICATION_REL))), 'same bytes');
    assert.equal(calls.length, 0, 'zero git calls');
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');
  });

  test('11. summary post, verification post and set-status complete write today\'s bytes with zero gh calls, even with a `prs` entry', () => {
    recordPr({ number: 12 });
    const cases = [
      [verbs.summaryPost(S.root, { trd: '07-01', text: NEW_SUMMARY }), `${OBJ_REL}/07-01-alpha-SUMMARY.md`, NEW_SUMMARY],
      [verbs.summaryPost(S.root, { trd: '07-02', text: 'two\n' }), `${OBJ_REL}/07-02-SUMMARY.md`, 'two\n'],
      [verbs.verificationPost(S.root, { objective: '7', text: VERIFICATION_PASSED }), `${OBJ_REL}/07-VERIFICATION.md`, VERIFICATION_PASSED],
    ];
    for (const [r, rel, text] of cases) {
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.mode, 'local');
      assert.equal(r.exit, 0);
      assert.equal(r.rel, rel);
      assert.equal(r.pr_refresh, undefined);
      assert.ok(Buffer.from(text).equals(fs.readFileSync(planning(rel))), `${rel}: same bytes`);
    }
    const done = verbs.objectiveSetStatus(S.root, { id: '7', status: 'complete' });
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.delegate, 'objective complete', 'local mode still delegates to cmdObjectiveComplete');
    assert.equal(done.close_deferred, undefined);
    assert.equal(readRel(`${OBJ_REL}/OBJECTIVE.md`), STORE_FIXTURE.objective.replace('status: planned', 'status: complete'));
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');
    assert.equal(fs.existsSync(outbox.journalPath(S.root)), false, 'no journal');
  });
});
