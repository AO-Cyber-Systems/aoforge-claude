'use strict';

/**
 * Tests for lib/gh-pr.cjs (TRD 49-09): `gh pr start | sync | status` — the objective branch and its one draft PR.
 *
 * Hermetic: the project, the outbox and the capability cache live under os.tmpdir() (hermeticEnv); GitHub is the
 * in-memory fake (49-01) installed through gh-client's seam; git is a local bare `origin` plus a clone on `main`
 * (49-04 makeGitRemote), and the project root IS that clone, so the real git seam runs against real git. The fake's
 * branches are kept in step with what origin holds (`syncRefs`, run before every gh call), exactly as GitHub sees a
 * push. The clock never really sleeps. Nothing touches the real ~/.claude, a real remote or port 8080.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const client = require('./gh-client.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const trdLib = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const comments = require('./gh-comments.cjs');
const wikiLib = require('./gh-wiki.cjs');
const prLib = require('./gh-pr.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');
const { createWikiRemote } = require('./__fixtures__/wiki-remote.cjs');

const GIT = gitAvailable();
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const BRANCH = 'df/objective-07-store-demo'; // objective_branch_template with the fixture's directory name
const TRD_FILES = { '7-01': '07-01-alpha-TRD.md', '7-02': '07-02-beta-TRD.md', '7-03': '07-03-gamma-TRD.md' };

let S = null;

/** Make every branch origin holds known to the fake, as GitHub knows what was pushed to it. */
function syncRefs() {
  let out = '';
  try {
    out = S.g.git(S.g.origin, ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']);
  } catch (_) {
    return; // origin is gone (an offline test)
  }
  for (const line of out.split('\n')) {
    const [name, sha] = line.trim().split(' ');
    if (name && sha) S.fake.pushRef(name, sha);
  }
}

function seedTrd(id) {
  const file = TRD_FILES[id];
  const n = S.fake.seedIssue({
    title: `[TRD ${id}] ${file}`,
    body: trdLib.encodeTrdBody({ id, file, text: STORE_FIXTURE.trds[file] }),
    labels: ['devflow:trd'],
  });
  const mapping = mappingLib.readMappingV3(S.root);
  mappingLib.setTrd(mapping, id, { issue_number: n, rest_id: 1_000_000 + n });
  assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
  return n;
}

/**
 * A git clone with a store-shaped `.planning/` cache inside it, a fake GitHub whose `main` is the clone's tip, and
 * the objective (and, by default, TRDs 7-01 and 7-02) issued and mapped.
 */
function setup({ store = true, wiki = false, mapObjective = true, trds = ['7-01', '7-02'] } = {}) {
  const envh = hermeticEnv();
  const g = makeGitRemote();
  const project = makeStoreProject({ store, hasWiki: false });
  fs.cpSync(path.join(project.root, '.planning'), path.join(g.work, '.planning'), { recursive: true });
  project.cleanup();
  const root = g.work;
  // Two TRD files and one SUMMARY: "TRDs complete 1/2".
  fs.rmSync(path.join(root, '.planning', 'objectives', '07-store-demo', TRD_FILES['7-03']));

  const c0 = g.git(root, ['rev-parse', 'HEAD']);
  const fake = createFakeGitHub({
    repo: 'o/r', hasWiki: false, refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name),
  });
  const clock = { t: T0 };
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });
  S = { envh, g, root, fake, c0, clock, intercept: null, wikiRemote: null, savedWikiEnv: process.env.DEVFLOW_WIKI_REMOTE, objN: null, trdN: {} };
  client._setRunGh((args, opts) => {
    if (S.intercept) {
      const r = S.intercept(args);
      if (r) return r;
    }
    syncRefs();
    return fake.runGh(args, opts);
  });

  if (mapObjective) {
    const body = bodyLib.mergeManaged('', { summary: 'Mine', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, '7').body;
    S.objN = fake.seedIssue({ title: '[Objective 7] Store demo', body, labels: ['devflow:objective'], assignees: ['alice'] });
    const mapping = mappingLib.readMappingV3(root);
    mappingLib.setEntry(mapping, '7', { issue_id: S.objN });
    assert.ok(mappingLib.writeMappingV3(root, mapping).ok);
    for (const id of trds) S.trdN[id] = seedTrd(id);
  }
  if (wiki) {
    S.wikiRemote = createWikiRemote({ seed: { 'Home.md': '# Home\n', 'Objective-7-store-demo.md': '# Objective 7\n' } });
    process.env.DEVFLOW_WIKI_REMOTE = S.wikiRemote.remoteUrl;
    const c = wikiLib.ensureClone(root);
    assert.equal(c.ok, true, JSON.stringify(c));
  }
  return S;
}

afterEach(() => {
  if (!S) return;
  client._resetClient();
  if (S.savedWikiEnv === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
  else process.env.DEVFLOW_WIKI_REMOTE = S.savedWikiEnv;
  if (S.wikiRemote) S.wikiRemote.cleanup();
  S.g.cleanup();
  S.envh.restore();
  S = null;
});

const writesNow = () => S.fake.writes().length;
const branchNow = () => S.g.git(S.root, ['branch', '--show-current']);
const headNow = () => S.g.git(S.root, ['rev-parse', 'HEAD']);
const queueNow = () => outbox.readJournal(S.root).journal.ops;
const prRecords = () => S.fake.issues.filter((i) => i.pr);
const closesIn = (body) => [...body.matchAll(/Closes #(\d+)/g)].map((m) => Number(m[1]));
const isLinkWrite = (w) => w.join(' ').includes('createLinkedBranch');

/** Link `name` to the objective issue the way GitHub does, and (optionally) give it one commit of its own on origin. */
function preLink(name, { commit = true } = {}) {
  const q = 'mutation($issueId: ID!, $oid: GitObjectID!, $name: String!, $repositoryId: ID!) {'
    + ' createLinkedBranch(input:{issueId:$issueId, oid:$oid, name:$name, repositoryId:$repositoryId})'
    + ' { linkedBranch { id ref { name target { oid } } } } }';
  const r = S.fake.runGh(['api', 'graphql', '-f', `query=${q}`, '-f', `issueId=I_${1_000_000 + S.objN}`,
    '-f', `oid=${S.c0}`, '-f', `name=${name}`, '-f', 'repositoryId=R_1']);
  assert.equal(r.ok, true, r.stderr);
  if (!commit) return null;
  const dir = S.g.cloneOrigin('prelink');
  S.g.git(dir, ['switch', '-q', name]);
  const sha = S.g.commitFile(dir, 'own.txt', 'own work\n', 'feat(7-01): own work');
  S.g.git(dir, ['push', '-q', 'origin', name]);
  return sha;
}

describe('49-09 gh pr start', { skip: GIT ? false : 'git is not available' }, () => {
  test('1. creates the linked branch, makes the start commit, pushes, opens ONE draft PR closing the objective and every TRD, and freezes every TRD', () => {
    setup({ wiki: true });
    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.flush.status, 'flushed', JSON.stringify(r.flush));

    assert.equal(S.fake.writes().filter(isLinkWrite).length, 1, 'exactly one createLinkedBranch');
    assert.equal(branchNow(), BRANCH);
    assert.equal(r.branch, BRANCH);
    assert.equal(r.created_branch, true);

    const head = headNow();
    assert.notEqual(head, S.c0);
    assert.equal(S.g.git(S.root, ['rev-parse', 'HEAD~1']), S.c0, 'one commit on top of main');
    const message = S.g.git(S.root, ['log', '-1', '--format=%B']);
    assert.match(message, /^chore\(7\): start objective 7\n/);
    assert.ok(message.trimEnd().endsWith(`Refs #${S.objN}`), message);
    assert.equal(r.start_commit, head);
    assert.equal(S.g.git(S.g.origin, ['rev-parse', `refs/heads/${BRANCH}`]), head, 'pushed to origin');

    const prs = prRecords();
    assert.equal(prs.length, 1, 'exactly one PR');
    assert.equal(prs[0].pr.draft, true);
    assert.equal(prs[0].pr.head.ref, BRANCH);
    assert.equal(prs[0].title, 'Objective 7: Store demo');
    assert.deepEqual(closesIn(prs[0].body), [S.objN, S.trdN['7-01'], S.trdN['7-02']]);
    const sha = wikiLib.headSha(S.root);
    assert.ok(sha, 'the wiki clone has a head');
    assert.ok(bodyLib.extractSection(prs[0].body, 'wiki').includes(`revision \`${sha}\``), 'the wiki section pins the clone head');

    const entry = mappingLib.getPr(mappingLib.readMappingV3(S.root), '7');
    assert.equal(entry.branch, BRANCH);
    assert.equal(entry.base, 'main');
    assert.equal(entry.number, prs[0].number);
    assert.equal(entry.wiki_base_sha, sha);

    for (const id of ['7-01', '7-02']) {
      assert.equal(comments.readTrdState(S.root, id).frozen, true, `${id} is frozen`);
    }
    assert.deepEqual([...r.frozen].sort(), ['7-01', '7-02']);
    assert.equal(queueNow().filter((o) => o.status !== 'done').length, 0, 'nothing is left queued');
  });

  test('2. re-running is idempotent: same branch, no second start commit, no second PR, no new writes', () => {
    setup({ wiki: true });
    assert.equal(prLib.startObjectivePr(S.root, '7').ok, true);
    const writes = writesNow();
    const head = headNow();

    const again = prLib.startObjectivePr(S.root, '7');
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.created_branch, false);
    assert.equal(again.start_commit, null);
    assert.equal(again.branch, BRANCH);
    assert.equal(writesNow(), writes, 'zero new writes');
    assert.equal(headNow(), head, 'no second start commit');
    assert.equal(prRecords().length, 1, 'no second PR');
    assert.deepEqual(again.frozen, [], 'nothing newly frozen');
    assert.deepEqual([...again.already_frozen].sort(), ['7-01', '7-02']);
  });

  test('3. an issue that already has a linked branch reuses it: no start commit when it has commits of its own; the PR is created on it', () => {
    setup();
    const own = preLink('df/objective-07-custom');
    const linkWrites = S.fake.writes().filter(isLinkWrite).length;

    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.branch, 'df/objective-07-custom');
    assert.equal(r.created_branch, false);
    assert.equal(r.start_commit, null);
    assert.equal(S.fake.writes().filter(isLinkWrite).length, linkWrites, 'no second createLinkedBranch');
    assert.equal(branchNow(), 'df/objective-07-custom');
    assert.equal(headNow(), own, 'the checkout is on the existing commit, nothing was added');
    assert.equal(prRecords().length, 1);
    assert.equal(prRecords()[0].pr.head.ref, 'df/objective-07-custom');
    assert.equal(mappingLib.getPr(mappingLib.readMappingV3(S.root), '7').branch, 'df/objective-07-custom');
  });

  test('3b. --name picks the branch to create', () => {
    setup();
    const r = prLib.startObjectivePr(S.root, '7', { name: 'df/obj-seven' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.branch, 'df/obj-seven');
    assert.equal(branchNow(), 'df/obj-seven');
  });

  test('4. a remote branch with the chosen name that is not linked to the issue is refused (--name), with nothing written and the checkout unchanged', () => {
    setup();
    S.g.createRemoteBranch(BRANCH);
    const before = headNow();
    const writes = writesNow();

    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, false);
    assert.match(r.error, /--name/);
    assert.match(r.error, new RegExp(BRANCH));
    assert.equal(writesNow(), writes);
    assert.equal(branchNow(), 'main');
    assert.equal(headNow(), before);
    assert.equal(queueNow().length, 0);
  });

  test('5. a createLinkedBranch that answers linkedBranch:null is a failure, never success: nothing queued, checkout unchanged', () => {
    setup();
    S.intercept = (args) => (args.join(' ').includes('createLinkedBranch(')
      ? { ok: true, status: 0, stdout: JSON.stringify({ data: { createLinkedBranch: { linkedBranch: null } } }), stderr: '' }
      : null);

    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, false);
    assert.match(r.error, /linked/i);
    assert.equal(queueNow().length, 0);
    assert.equal(branchNow(), 'main');
    assert.equal(prRecords().length, 0);
  });

  test('6. offline (GitHub cannot be read): failure, outbox empty, the current branch unchanged', () => {
    setup();
    S.fake.setOffline(true);
    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, false);
    assert.match(r.error, /online|read|reach/i);
    assert.equal(queueNow().length, 0);
    assert.equal(branchNow(), 'main');
    assert.equal(S.g.git(S.root, ['branch', '--list']).includes('df/objective'), false, 'no local branch was made');
  });

  test('7. a dirty tracked file refuses before any gh call', () => {
    setup();
    fs.writeFileSync(path.join(S.root, 'README.md'), '# changed\n');
    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, false);
    assert.match(r.error, /uncommitted|dirty/i);
    assert.deepEqual(S.fake.calls(), [], 'no gh call at all');
    assert.equal(branchNow(), 'main');
  });

  test('8. an objective with no mapping entry: failure telling the user to run gh sync first, before any gh call', () => {
    setup({ mapObjective: false });
    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, false);
    assert.match(r.error, /run df-tools gh sync 7 first/);
    assert.deepEqual(S.fake.calls(), []);
  });

  test('8b. an objective that is not an objective id is a failure', () => {
    setup();
    const r = prLib.startObjectivePr(S.root, 'banana');
    assert.equal(r.ok, false);
    assert.deepEqual(S.fake.calls(), []);
  });

  test('9. local mode: skipped with zero gh calls and no git change', () => {
    setup({ store: false });
    const r = prLib.startObjectivePr(S.root, '7');
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.deepEqual(S.fake.calls(), []);
    assert.equal(branchNow(), 'main');
    assert.equal(headNow(), S.c0);
  });

  test('10. branchNameFor renders objective_branch_template; closesFor is the objective issue then mapped TRDs in id order', () => {
    setup();
    assert.equal(prLib.branchNameFor(S.root, '7'), BRANCH);
    assert.equal(prLib.branchNameFor(S.root, '7', { name: 'df/x' }), 'df/x');
    assert.deepEqual(prLib.closesFor(S.root, '7'), [S.objN, S.trdN['7-01'], S.trdN['7-02']]);
    assert.deepEqual(prLib.closesFor(S.root, '99'), [], 'an unmapped objective closes nothing');
  });

  test('11. linkedBranchFor reads the issue\'s linked branches (a read: no write is recorded)', () => {
    setup();
    assert.deepEqual(prLib.linkedBranchFor(S.root, S.objN), { ok: true, issue_id: `I_${1_000_000 + S.objN}`, branches: [] });
    preLink('df/objective-07-custom', { commit: false });
    const writes = writesNow();
    const r = prLib.linkedBranchFor(S.root, S.objN);
    assert.deepEqual(r.branches, ['df/objective-07-custom']);
    assert.equal(writesNow(), writes);
  });
});
