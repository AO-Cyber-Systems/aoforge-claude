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
const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const comments = require('./gh-comments.cjs');
const wikiLib = require('./gh-wiki.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const DIR = STORE_FIXTURE.objectiveDir;
const OBJ_REL = `objectives/${DIR}`;
const BRANCH = 'df/objective-07-store-demo';
const TIP = `feed${'0'.repeat(36)}`;
const PR_TITLE = '[Objective 7] Store demo';
const IN_PROGRESS = 'devflow:in-progress';

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

    const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
    let restoreGit = () => {};
    let remote = null;
    if (gitAvailable()) {
      restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
      remote = createWikiRemote();
      process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;
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
    if (S.savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
    else process.env.DEVFLOW_WIKI_REMOTE = S.savedRemote;
    S.envh.restore();
    S.project.cleanup();
  });
}

const planning = (...rel) => path.join(S.root, '.planning', ...rel);
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
