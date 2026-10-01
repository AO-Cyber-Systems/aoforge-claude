'use strict';

/**
 * Tests for lib/gh-pr.cjs reconcile and merge (TRD 49-12): `gh pr reconcile` and `gh pr merge`.
 *
 * Hermetic, the same shape as gh-pr.test.cjs: the project root IS a git clone (a local bare `origin`, 49-04
 * makeGitRemote) holding a store-shaped `.planning/` cache; GitHub is the in-memory fake (49-01) installed through
 * gh-client's seam, with origin's branches mirrored into it before every call (`syncRefs`) and a DELETE of a branch
 * mirrored back to origin, exactly as GitHub holds branches. A squash merge's new commit on main is made by
 * `advanceOrigin`. `gh.updateProjectFields` and `gh-cache.pullAll` are stubbed through `opts.deps` (the fake does
 * not model Projects). The clock never really sleeps. Nothing touches the real ~/.claude, a real remote or port 8080.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const mappingLib = require('./gh-mapping.cjs');
const trdLib = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const prLib = require('./gh-pr.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');

const GIT = gitAvailable();
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const BRANCH = 'df/objective-07-store-demo';
const TRD_FILES = { '7-01': '07-01-alpha-TRD.md', '7-02': '07-02-beta-TRD.md' };

let S = null;

/** Make every branch origin holds known to the fake, as GitHub knows what was pushed to it. */
function syncRefs() {
  let out = '';
  try {
    out = S.g.git(S.g.origin, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']);
  } catch (_) {
    return;
  }
  for (const line of out.split('\n')) {
    const [name, sha] = line.trim().split(' ');
    if (name && sha) S.fake.pushRef(name, sha);
  }
}

/**
 * The project, the fake GitHub and a git clone whose `main` is the fake's `main`. Objective 7 and TRDs 7-01 and 7-02
 * are issued and mapped. `fake` carries createFakeGitHub options (`mergeQueue`, `closeKeywordCap`).
 */
function setup({ store = true, fake: fakeOptions = {} } = {}) {
  const envh = hermeticEnv();
  const g = makeGitRemote();
  const project = makeStoreProject({ store, hasWiki: false });
  fs.cpSync(path.join(project.root, '.planning'), path.join(g.work, '.planning'), { recursive: true });
  project.cleanup();
  const root = g.work;
  fs.rmSync(path.join(root, '.planning', 'objectives', '07-store-demo', '07-03-gamma-TRD.md'));

  const c0 = g.git(root, ['rev-parse', 'HEAD']);
  const fake = createFakeGitHub({
    repo: 'o/r', hasWiki: false, refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name), ...fakeOptions,
  });
  const clock = { t: T0 };
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  S = { envh, g, root, fake, c0, objN: null, trdN: {}, project: { calls: [], error: null }, pull: { calls: [] } };
  client._setRunGh((args, opts) => {
    syncRefs();
    const r = fake.runGh(args, opts);
    const text = args.join(' ');
    const del = /--method DELETE repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(\S+)/.exec(text);
    if (del && r.ok) S.g.git(S.g.origin, ['update-ref', '-d', `refs/heads/${decodeURIComponent(del[1])}`]);
    if (/PUT .*pulls\/\d+\/merge/.test(text) && r.ok) S.g.advanceOrigin({ message: 'squash merge' });
    return r;
  });

  const body = bodyLib.mergeManaged('', { summary: 'Mine', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, '7').body;
  S.objN = fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['devflow:objective'] });
  const mapping = mappingLib.readMappingV3(root);
  mappingLib.setEntry(mapping, '7', { issue_id: S.objN });
  for (const id of Object.keys(TRD_FILES)) {
    const n = fake.seedIssue({
      title: `[TRD ${id}] ${TRD_FILES[id]}`,
      body: trdLib.encodeTrdBody({ id, file: TRD_FILES[id], text: STORE_FIXTURE.trds[TRD_FILES[id]] }),
      labels: ['devflow:trd'],
    });
    mappingLib.setTrd(mapping, id, { issue_number: n, rest_id: 1_000_000 + n });
    S.trdN[id] = n;
  }
  assert.ok(mappingLib.writeMappingV3(root, mapping).ok);
  return S;
}

afterEach(() => {
  if (!S) return;
  client._resetClient();
  S.g.cleanup();
  S.envh.restore();
  S = null;
});

const writesNow = () => S.fake.writes().length;
const branchNow = () => S.g.git(S.root, ['branch', '--show-current']);
const headNow = () => S.g.git(S.root, ['rev-parse', 'HEAD']);
const originMain = () => S.g.git(S.g.origin, ['rev-parse', 'refs/heads/main']);
const localBranches = () => S.g.git(S.root, ['branch', '--list', '--format=%(refname:short)']).split('\n').filter(Boolean);
const issue = (n) => S.fake.issues.find((i) => i.number === n);
const isOpen = (n) => issue(n).state === 'OPEN';
const queueNow = () => outbox.readJournal(S.root).journal.ops;
const prNumber = () => mappingLib.getPr(mappingLib.readMappingV3(S.root), '7').number;
const prRecord = () => mappingLib.getPr(mappingLib.readMappingV3(S.root), '7');
const allIssues = () => [S.objN, ...Object.values(S.trdN)];
const patchWrites = () => S.fake.writes().filter((w) => w.includes('PATCH') && /issues\/\d+/.test(w.join(' ')));
const deleteWrites = () => S.fake.writes().filter((w) => w.includes('DELETE'));

const deps = () => ({
  updateProjectFields: (ref, projectId, fields) => {
    S.project.calls.push({ ref, projectId, fields });
    return S.project.error
      ? { ok: false, error: S.project.error, fields_updated: [], warnings: [] }
      : { ok: true, item_id: 'PVTI_1', fields_updated: Object.keys(fields), warnings: [] };
  },
  pullAll: (root, o) => {
    S.pull.calls.push({ root, o });
    return { ok: true, attention: [] };
  },
});

const reconcile = (opts = {}) => prLib.reconcileObjectivePr(S.root, '7', { deps: deps(), ...opts });

function startPr() {
  const r = prLib.startObjectivePr(S.root, '7');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.flush.status, 'flushed', JSON.stringify(r.flush));
  return r;
}

/** Give the project an `org_project` so a reconcile has a Project to move to Done. */
function configureProject(id = 'PVT_demo') {
  const file = path.join(S.root, '.planning', 'PROJECT.md');
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.startsWith('---\n') ? text.replace('---\n', `---\norg_project: ${id}\n`) : `---\norg_project: ${id}\n---\n${text}`);
}

/** A branch at the PR's pushed tip: everything the PR head contains. */
const branchAtHead = (name) => S.g.git(S.root, ['branch', name, headNow()]);

describe('49-12 gh pr reconcile', { skip: GIT ? false : 'git is not available' }, () => {
  test('6. an open PR is pending with zero writes and nothing queued; after a human merge the reconcile completes', () => {
    setup();
    startPr();
    const n = prNumber();
    const w = writesNow();
    const before = headNow();

    const open = reconcile();
    assert.equal(open.ok, true, JSON.stringify(open));
    assert.equal(open.pending, true);
    assert.equal(open.pr.number, n);
    assert.equal(writesNow(), w, 'zero writes while the PR is open');
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0, 'nothing queued (no delete-branch)');
    assert.equal(headNow(), before);
    assert.equal(branchNow(), BRANCH, 'the checkout did not move');
    assert.equal(S.pull.calls.length, 0);

    S.fake.humanMergePr(n, { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.notEqual(r.pending, true);
    for (const num of allIssues()) assert.equal(isOpen(num), false, `#${num} is closed`);
    assert.equal(S.fake.refs[BRANCH], undefined, 'the remote branch is gone');
    assert.equal(branchNow(), 'main');
    assert.equal(headNow(), originMain(), 'main is at origin\'s tip');
    assert.ok(!localBranches().includes(BRANCH), 'the local objective branch is deleted');
    assert.equal(S.pull.calls.length, 1, 'pullAll ran once');
    const rec = prRecord();
    assert.equal(typeof rec.merged_at, 'string');
    assert.equal(typeof rec.reconciled_at, 'string');
    assert.equal(r.project, 'none');
    assert.equal(r.local, 'done');
  });

  test('6b. a PR waiting in the merge queue is still open: pending, zero writes', () => {
    setup({ fake: { mergeQueue: true } });
    startPr();
    assert.equal(outbox.enqueue(S.root, [{ kind: 'pr-ready', target: { id: '7' }, payload: {} }]).ok, true);
    assert.equal(flushLib.flush(S.root, { wait: false }).status, 'flushed');
    assert.equal(outbox.enqueue(S.root, [{ kind: 'pr-merge', target: { id: '7' }, payload: {} }]).ok, true);
    assert.equal(flushLib.flush(S.root, { wait: false }).status, 'flushed');
    assert.equal(issue(prNumber()).pr.queued, true, 'the PR is enqueued, not merged');

    const w = writesNow();
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pending, true);
    assert.equal(writesNow(), w);
    assert.equal(S.fake.refs[BRANCH] !== undefined, true, 'the branch of a queued PR is never deleted');
  });

  test('7. the closing-keyword cap leaves stragglers: reconcile closes the open ones (two patch-issue ops) and not the closed one', () => {
    setup({ fake: { closeKeywordCap: 1 } });
    startPr();
    const n = prNumber();
    S.fake.humanMergePr(n, { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    assert.equal(isOpen(S.objN), false, 'the first link closed with the merge');
    assert.equal(isOpen(S.trdN['7-01']), true);
    assert.equal(isOpen(S.trdN['7-02']), true);

    const w = writesNow();
    const patched = patchWrites().length;
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(isOpen(S.trdN['7-01']), false);
    assert.equal(isOpen(S.trdN['7-02']), false);
    assert.deepEqual(r.closed.sort(), [S.trdN['7-01'], S.trdN['7-02']].sort(), 'only the stragglers were closed');
    assert.equal(patchWrites().length - patched, 2, 'two patch-issue writes, none for the already-closed objective');
    assert.equal(writesNow() - w, 3, 'two issue patches and one branch delete');
  });

  test('8. a PR closed without merging is exit-1 material: nothing is closed or deleted', () => {
    setup();
    startPr();
    const n = prNumber();
    const closed = S.fake.runGh(['api', '--method', 'PATCH', `repos/o/r/pulls/${n}`, '-f', 'state=closed']);
    assert.equal(closed.ok, true, closed.stderr);
    const w = writesNow();
    const r = reconcile();
    assert.equal(r.ok, false);
    assert.match(r.error, /closed without merging/);
    assert.equal(writesNow(), w);
    for (const num of allIssues()) assert.equal(isOpen(num), true, `#${num} is untouched`);
    assert.notEqual(S.fake.refs[BRANCH], undefined);
    assert.equal(branchNow(), BRANCH);
    assert.equal(S.pull.calls.length, 0);
    assert.equal(prRecord().reconciled_at, undefined);
  });

  test('9. a second reconcile makes zero GitHub writes and no git changes', () => {
    setup();
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    assert.equal(reconcile().ok, true);
    const w = writesNow();
    const head = headNow();
    const branches = localBranches();
    const first = prRecord().reconciled_at;

    const again = reconcile();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.already_reconciled, true);
    assert.deepEqual(again.closed, []);
    assert.equal(writesNow(), w, 'zero writes');
    assert.equal(headNow(), head);
    assert.deepEqual(localBranches(), branches);
    assert.equal(prRecord().reconciled_at, first, 'the first reconcile time is kept');
    assert.equal(S.pull.calls.length, 1, 'no second pull');
  });

  test('10. a squash merge leaves every branch "unmerged" to git: the objective branch and this objective\'s exec branches are force-deleted when their tips are in the PR head; other objectives are untouched', () => {
    setup();
    startPr();
    // wave work lands on an exec branch, is merged into the objective branch, and the PR is refreshed
    S.g.git(S.root, ['switch', '-q', '-c', 'df/exec-7-01']);
    S.g.commitFile(S.root, 'a.txt', 'one\n', 'feat(7-01): first wave');
    S.g.git(S.root, ['switch', '-q', BRANCH]);
    S.g.git(S.root, ['merge', '-q', '--ff-only', 'df/exec-7-01']);
    assert.equal(prLib.syncObjectivePr(S.root, '7').ok, true);
    branchAtHead('df/exec-7-02');
    branchAtHead('df/exec-8-01');

    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });

    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    const left = localBranches();
    assert.ok(!left.includes(BRANCH), 'objective branch deleted');
    assert.ok(!left.includes('df/exec-7-01'), 'exec 7-01 deleted');
    assert.ok(!left.includes('df/exec-7-02'), 'exec 7-02 deleted');
    assert.ok(left.includes('df/exec-8-01'), 'another objective\'s exec branch is untouched');
    assert.ok(left.includes('main'));
    assert.deepEqual(r.kept, []);
    assert.deepEqual(r.deleted_local.sort(), [BRANCH, 'df/exec-7-01', 'df/exec-7-02'].sort());
  });

  test('10a. unpushed or unmerged work is never lost: a branch whose tip is not in the PR head is kept, named, and warned about; GitHub is still reconciled', () => {
    setup();
    startPr();
    S.g.git(S.root, ['switch', '-q', '-c', 'df/exec-7-03']);
    S.g.commitFile(S.root, 'never.txt', 'never merged\n', 'feat(7-03): never merged');
    S.g.git(S.root, ['switch', '-q', BRANCH]);
    S.g.commitFile(S.root, 'late.txt', 'late\n', 'feat(7-01): an unpushed commit');
    const lateTip = headNow();

    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    const left = localBranches();
    assert.ok(left.includes(BRANCH), 'the objective branch with an unpushed commit is kept');
    assert.ok(left.includes('df/exec-7-03'), 'the unmerged exec branch is kept');
    assert.equal(S.g.git(S.root, ['rev-parse', BRANCH]), lateTip);
    assert.deepEqual(r.kept.map((k) => k.branch).sort(), [BRANCH, 'df/exec-7-03'].sort());
    for (const k of r.kept) assert.match(k.reason, /not in the merged PR/);
    assert.ok(r.warnings.some((x) => x.includes(BRANCH)), 'a warning names the objective branch');
    assert.ok(r.warnings.some((x) => x.includes('df/exec-7-03')), 'a warning names the exec branch');
    assert.equal(branchNow(), 'main');
    for (const num of allIssues()) assert.equal(isOpen(num), false, `#${num} is closed`);
    assert.equal(S.fake.refs[BRANCH], undefined, 'the remote branch is deleted');
  });

  test('11. a dirty tracked file skips every local step with a warning; the GitHub side is still reconciled and the run can be repeated', () => {
    setup();
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    fs.writeFileSync(path.join(S.root, 'README.md'), '# fixture\nedited\n');

    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.local, 'skipped (dirty tree)');
    assert.ok(r.warnings.some((x) => /dirty|uncommitted/i.test(x)));
    for (const num of allIssues()) assert.equal(isOpen(num), false);
    assert.equal(S.fake.refs[BRANCH], undefined);
    assert.equal(branchNow(), BRANCH, 'the checkout did not move');
    assert.ok(localBranches().includes(BRANCH));
    assert.equal(S.pull.calls.length, 0, 'the cache pull is a local step too');
    assert.equal(prRecord().reconciled_at, undefined, 'not reconciled until the local steps ran');

    S.g.git(S.root, ['checkout', '--', 'README.md']);
    const again = reconcile();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.local, 'done');
    assert.equal(branchNow(), 'main');
    assert.ok(!localBranches().includes(BRANCH));
    assert.equal(typeof prRecord().reconciled_at, 'string');
  });

  test('12. a configured Project is moved to Done once; none is project:"none"; a failing Project write is a warning, not a failure', () => {
    setup();
    configureProject('PVT_demo');
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(S.project.calls.length, 1);
    assert.deepEqual(S.project.calls[0].fields, { Status: 'Done' });
    assert.equal(S.project.calls[0].projectId, 'PVT_demo');
    assert.equal(S.project.calls[0].ref, `o/r#${S.objN}`);
    assert.equal(r.project, 'done');
    assert.equal(reconcile().ok, true);
    assert.equal(S.project.calls.length, 1, 'a second reconcile does not write the Project again');
  });

  test('12b. no project configured: project is "none" and updateProjectFields is not called', () => {
    setup();
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = reconcile();
    assert.equal(r.project, 'none');
    assert.equal(S.project.calls.length, 0);
  });

  test('12c. a Project write that fails (no Projects scope) is project:"error: ..." with a warning; the rest is reconciled and the run can be repeated', () => {
    setup();
    configureProject('PVT_demo');
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    S.project.error = 'missing the project scope';
    const r = reconcile();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(r.project, /^error: missing the project scope/);
    assert.ok(r.warnings.some((x) => x.includes('missing the project scope')));
    for (const num of allIssues()) assert.equal(isOpen(num), false);
    assert.ok(!localBranches().includes(BRANCH));
    assert.equal(prRecord().reconciled_at, undefined, 'a failed Project step leaves the reconcile open');

    S.project.error = null;
    const again = reconcile();
    assert.equal(again.project, 'done');
    assert.equal(typeof prRecord().reconciled_at, 'string');
  });

  test('13. GitHub that cannot be read is an error with nothing changed; an unstarted objective is an error naming gh pr start', () => {
    setup();
    const unstarted = reconcile();
    assert.equal(unstarted.ok, false);
    assert.match(unstarted.error, /gh pr start 7/);

    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.fake.setOffline(true);
    const head = headNow();
    const r = reconcile();
    assert.equal(r.ok, false);
    assert.equal(headNow(), head);
    assert.equal(branchNow(), BRANCH);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0);
  });

  test('14. local mode: reconcile is skipped with zero gh calls and no git change', () => {
    setup({ store: false });
    const head = headNow();
    const r = reconcile();
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.deepEqual(S.fake.calls(), []);
    assert.equal(headNow(), head);
  });

  test('15. a reconcile run with --no-flush leaves the GitHub ops queued and does nothing locally', () => {
    setup({ fake: { closeKeywordCap: 1 } });
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = reconcile({ flush: false });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.flush, null);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 3, 'two patch-issue ops and one delete-branch');
    assert.equal(branchNow(), BRANCH, 'no local step before GitHub is reconciled');
    assert.equal(deleteWrites().length, 0);
    assert.equal(S.pull.calls.length, 0);
  });
});

// ─── merge ───────────────────────────────────────────────────────────────────

const merge = (opts = {}) => prLib.mergeObjectivePr(S.root, '7', { deps: deps(), ...opts });

/** Mark the draft PR ready for review (the `pr-ready` op the verify pass queues). */
function readyPr() {
  assert.equal(outbox.enqueue(S.root, [{ kind: 'pr-ready', target: { id: '7' }, payload: {} }]).ok, true);
  const f = flushLib.flush(S.root, { wait: false });
  assert.equal(f.status, 'flushed', JSON.stringify(f));
}

/** Post the `devflow/verification` commit status on the PR head, as the verify pass does. */
function verify(state = 'success') {
  const op = { kind: 'post-status', target: { id: '7', context: 'devflow/verification' }, payload: { state, description: `Verification ${state}` } };
  assert.equal(outbox.enqueue(S.root, [op]).ok, true);
  const f = flushLib.flush(S.root, { wait: false });
  assert.equal(f.status, 'flushed', JSON.stringify(f));
}

function setMergeMethod(value) {
  const file = path.join(S.root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.github.pr = { merge_method: value };
  fs.writeFileSync(file, JSON.stringify(cfg));
}

describe('49-12 gh pr merge', { skip: GIT ? false : 'git is not available' }, () => {
  test('1. a draft PR is refused before anything is queued', () => {
    setup();
    startPr();
    verify();
    const w = writesNow();
    const r = merge();
    assert.equal(r.ok, false);
    assert.match(r.error, /PR is still a draft; run verification first/);
    assert.equal(writesNow(), w);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0);
    assert.equal(issue(prNumber()).pr.merged, false);
  });

  test('2. a ready PR with no verification status is refused, naming devflow/verification', () => {
    setup();
    startPr();
    readyPr();
    const w = writesNow();
    const r = merge();
    assert.equal(r.ok, false);
    assert.match(r.error, /devflow\/verification/);
    assert.equal(writesNow(), w);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0);
    assert.equal(issue(prNumber()).pr.merged, false);
  });

  test('2b. a verification status that is not success is refused, with its state in the message', () => {
    setup();
    startPr();
    readyPr();
    verify('failure');
    const r = merge();
    assert.equal(r.ok, false);
    assert.match(r.error, /devflow\/verification/);
    assert.match(r.error, /failure/);
    assert.equal(issue(prNumber()).pr.merged, false);
  });

  test('2c. a success posted on an earlier head does not count once the branch has moved on', () => {
    setup();
    startPr();
    readyPr();
    verify();
    S.g.commitFile(S.root, 'later.txt', 'later\n', 'feat(7-01): later work');
    assert.equal(prLib.syncObjectivePr(S.root, '7').ok, true);
    const r = merge();
    assert.equal(r.ok, false);
    assert.match(r.error, /devflow\/verification/);
    assert.equal(issue(prNumber()).pr.merged, false);
  });

  test('3. ready and verified with no queue: the PR is squash-merged and the same call reconciles', () => {
    setup();
    startPr();
    readyPr();
    verify();
    const n = prNumber();
    const r = merge();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.merged, true);
    assert.equal(r.method, 'squash');
    assert.equal(issue(n).pr.merged, true);
    assert.equal(issue(n).pr.mergeMethod, 'squash');
    for (const num of allIssues()) assert.equal(isOpen(num), false, `#${num} is closed`);
    assert.equal(S.fake.refs[BRANCH], undefined, 'the remote branch is gone');
    assert.equal(branchNow(), 'main');
    assert.equal(headNow(), originMain(), 'main is at origin\'s tip');
    assert.ok(!localBranches().includes(BRANCH));
    assert.equal(S.pull.calls.length, 1);
    assert.equal(typeof prRecord().merged_at, 'string');
    assert.equal(typeof prRecord().reconciled_at, 'string');
    assert.equal(r.local, 'done');
  });

  test('4. github.pr.merge_method overrides the squash default (and a bad value falls back to squash)', () => {
    setup();
    startPr();
    readyPr();
    verify();
    setMergeMethod('merge');
    const n = prNumber();
    const r = merge();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.method, 'merge');
    assert.equal(issue(n).pr.mergeMethod, 'merge');
  });

  test('4b. an unknown github.pr.merge_method is squash', () => {
    setup();
    startPr();
    readyPr();
    verify();
    setMergeMethod('fast-forward');
    const r = merge();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.method, 'squash');
    assert.equal(issue(prNumber()).pr.mergeMethod, 'squash');
  });

  test('5. with a merge queue the PR is only enqueued: pending, told to run gh pr reconcile, nothing closed or deleted', () => {
    setup({ fake: { mergeQueue: true } });
    startPr();
    readyPr();
    verify();
    const n = prNumber();
    const r = merge();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.merged, false);
    assert.equal(r.pending, true);
    assert.match(r.reason, /gh pr reconcile 7/);
    assert.equal(issue(n).pr.queued, true);
    assert.equal(issue(n).pr.merged, false);
    for (const num of allIssues()) assert.equal(isOpen(num), true, `#${num} is still open`);
    assert.notEqual(S.fake.refs[BRANCH], undefined, 'the branch of a queued PR is kept');
    assert.equal(branchNow(), BRANCH);
    assert.equal(S.pull.calls.length, 0);
    assert.equal(prRecord().reconciled_at, undefined);

    // the queue lands it; one reconcile finishes the job
    S.fake.humanMergePr(n);
    S.g.advanceOrigin({ message: 'merge queue lands the PR' });
    const done = reconcile();
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.pending, undefined);
    for (const num of allIssues()) assert.equal(isOpen(num), false);
    assert.equal(typeof prRecord().reconciled_at, 'string');
  });

  test('5b. an already merged PR goes straight to the reconcile without queuing a merge', () => {
    setup();
    startPr();
    S.fake.humanMergePr(prNumber(), { method: 'squash' });
    S.g.advanceOrigin({ message: 'squash merge' });
    const r = merge();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.merged, true);
    assert.equal(queueNow().filter((o) => o.kind === 'pr-merge').length, 0);
    for (const num of allIssues()) assert.equal(isOpen(num), false);
  });

  test('5c. a PR closed without merging is refused', () => {
    setup();
    startPr();
    const n = prNumber();
    assert.equal(S.fake.runGh(['api', '--method', 'PATCH', `repos/o/r/pulls/${n}`, '-f', 'state=closed']).ok, true);
    const r = merge();
    assert.equal(r.ok, false);
    assert.match(r.error, /closed without merging/);
  });

  test('5d. an objective with no pull request, or GitHub unreachable, is an error with nothing queued', () => {
    setup();
    const none = merge();
    assert.equal(none.ok, false);
    assert.match(none.error, /gh pr start 7/);

    startPr();
    readyPr();
    verify();
    S.fake.setOffline(true);
    const r = merge();
    assert.equal(r.ok, false);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0);
  });

  test('5e. --no-flush queues the merge and reports it pending', () => {
    setup();
    startPr();
    readyPr();
    verify();
    const r = merge({ flush: false });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.merged, false);
    assert.equal(r.pending, true);
    assert.equal(r.flush, null);
    assert.equal(queueNow().filter((o) => o.kind === 'pr-merge' && o.status !== 'done').length, 1);
    assert.equal(issue(prNumber()).pr.merged, false);
  });

  test('5f. local mode: merge is skipped with zero gh calls and no git change', () => {
    setup({ store: false });
    const head = headNow();
    const r = merge();
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.deepEqual(S.fake.calls(), []);
    assert.equal(headNow(), head);
  });
});
