'use strict';

/**
 * gh-pr-e2e.test.cjs (TRD 49-14): the objective branch and pull-request lifecycle, end to end, plus store-off parity.
 *
 * One fixture objective ("49", issued as #100 with TRDs 49-01..49-03 as #101-#103) runs the whole lifecycle in the
 * order the execute-objective prose runs it: `gh pr start`, `gh trd start`, two parallel wave worktrees cut from the
 * objective branch that each commit through `df-tools commit` and merge back `--no-ff`, `summary post`, a scope comment
 * from a stranger gated until an assignee confirms it, `gh pr sync`, `verification post`, `gh pr merge` and
 * `gh pr reconcile`. GitHub is the in-memory fake (49-01) installed through gh-client's seam; `origin` is a local bare
 * repo (49-04 makeGitRemote) and the project root is a clone of it, with origin's branches mirrored into the fake before
 * every call and a branch DELETE mirrored back, exactly as GitHub holds branches (the harness of gh-pr-reconcile.test.cjs).
 *
 *   describe 1  the lifecycle, one shared state:
 *     1 SC1   one PR, `Closes #N` = the objective issue + the three TRD issues; TRDs frozen
 *     2 SC2   two wave worktrees merge back; one PR, origin holds only `main` + the objective branch; every non-merge
 *             commit on the objective branch carries `Refs #<issue>`
 *     3       `summary post` removes `devflow:in-progress` and moves the PR summary to `TRDs complete 2/3`
 *     4 SC3   a stranger's scope is pending (not in `gh trd spec`) until an assignee runs `gh trd confirm-scope`
 *     5       verify pass: PR ready, `devflow/verification` success on the head, wiki-diff comment, objective issue open
 *     6       merge -> reconcile: every issue closed, both branches gone, `gh pull --all` ran, a second reconcile writes nothing
 *   describe 2  7  the merge-queue variant (exit 3 until the queue lands it; the closing-keyword cap leaves stragglers)
 *   describe 3  8  store off (`github.store:false`): zero gh calls, no `Refs`, `pr_lifecycle:false`, every `gh pr` verb skipped
 *
 * Library calls run in-process (the gh stub does not cross a process boundary), the clock never really sleeps and
 * `gh pull --all` is counted, not run (the fake does not serve what it reads). Nothing touches the real ~/.claude, the
 * network or port 8080.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const client = require('./gh-client.cjs');
const cache = require('./gh-cache.cjs');
const outbox = require('./gh-outbox.cjs');
const mappingLib = require('./gh-mapping.cjs');
const trdLib = require('./gh-trd.cjs');
const bodyLib = require('./gh-body.cjs');
const wikiLib = require('./gh-wiki.cjs');
const commentsLib = require('./gh-comments.cjs');
const prLib = require('./gh-pr.cjs');
const prCli = require('./gh-pr-cli.cjs');
const storeCli = require('./gh-store-cli.cjs');
const verbs = require('./planning-verbs.cjs');
const init = require('./init.cjs');
const { cmdCommit } = require('./misc.cjs');
const { cmdExecContextWorktree } = require('./exec-context.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');
const { createWikiRemote } = require('./__fixtures__/wiki-remote.cjs');

const GIT = gitAvailable();
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const OBJ = '49';
const OBJ_DIR = '49-lifecycle-demo';
const BRANCH = `df/objective-${OBJ_DIR}`;
const IN_PROGRESS = 'devflow:in-progress';
// the fixture's objective 7 becomes objective 49: [fixture file, this test's file]
const TRDS = {
  '49-01': ['07-01-alpha-TRD.md', '49-01-alpha-TRD.md'],
  '49-02': ['07-02-beta-TRD.md', '49-02-beta-TRD.md'],
  '49-03': ['07-03-gamma-TRD.md', '49-03-gamma-TRD.md'],
};

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
const jsonOf = (r) => JSON.parse(r.stdout);

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
 * The hermetic env, a git clone (of a local bare origin) holding a store-shaped `.planning/` cache for objective 49, the
 * fake GitHub on the clone's `main`, and the mapping: objective issue #100 and TRD issues #101-#103 (ninety-nine unrelated
 * issues come first, so the numbers are the ones a real repository would have and "unrelated issues are left alone" is
 * checkable). `wiki` adds a local wiki remote; `assignees` are the objective issue's assignees.
 */
function setup({ store = true, wiki = false, fake: fakeOptions = {}, assignees = ['alice'] } = {}) {
  const envh = hermeticEnv();
  const g = makeGitRemote();
  const project = makeStoreProject({ store, hasWiki: wiki });
  const root = g.work;
  fs.cpSync(path.join(project.root, '.planning'), path.join(root, '.planning'), { recursive: true });
  project.cleanup();

  const objectives = path.join(root, '.planning', 'objectives');
  fs.renameSync(path.join(objectives, STORE_FIXTURE.objectiveDir), path.join(objectives, OBJ_DIR));
  const dir = path.join(objectives, OBJ_DIR);
  for (const [from, to] of Object.values(TRDS)) fs.renameSync(path.join(dir, from), path.join(dir, to));
  fs.rmSync(path.join(dir, STORE_FIXTURE.summaryFile));
  fs.renameSync(path.join(dir, '07-CONTEXT.md'), path.join(dir, '49-CONTEXT.md'));
  fs.renameSync(path.join(dir, '07-RESEARCH.md'), path.join(dir, '49-RESEARCH.md'));
  const roadmap = path.join(root, '.planning', 'ROADMAP.md');
  fs.writeFileSync(roadmap, fs.readFileSync(roadmap, 'utf8').replace(/Objective 7\b/g, 'Objective 49').replace(/\b07-0(\d)-/g, '49-0$1-'));

  const c0 = g.git(root, ['rev-parse', 'HEAD']);
  const fake = createFakeGitHub({
    repo: 'o/r', hasWiki: wiki, refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name), ...fakeOptions,
  });
  const clock = { t: T0 };
  client._setNow(() => clock.t);
  client._setSleep((ms) => { clock.t += ms; });

  const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
  const remote = wiki ? createWikiRemote() : null;
  if (remote) process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;

  S = { envh, g, root, fake, c0, remote, savedRemote, objN: null, trdN: {}, viewer: null, pulls: 0, savedPullAll: cache.pullAll };
  cache.pullAll = () => { S.pulls += 1; return { ok: true, attention: [] }; };
  client._setRunGh((args, opts) => {
    syncRefs();
    const r = fake.runGh(args, opts);
    const text = args.join(' ');
    // the signed-in user a `confirm-scope` reads: the test picks who is at the keyboard
    if (S.viewer && text === 'api user') return { ...r, stdout: JSON.stringify({ login: S.viewer, id: 7, type: 'User' }) };
    // GitHub's branch deletes and a merge's new commit on main show up in origin, as they would on GitHub
    const del = /--method DELETE repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(\S+)/.exec(text);
    if (del && r.ok) g.git(g.origin, ['update-ref', '-d', `refs/heads/${decodeURIComponent(del[1])}`]);
    if (/PUT .*pulls\/\d+\/merge/.test(text) && r.ok) g.advanceOrigin({ message: 'squash merge' });
    return r;
  });

  for (let i = 1; i <= 99; i++) fake.seedIssue({ title: `Unrelated issue ${i}` });
  const body = bodyLib.mergeManaged('', { summary: 'Mine', criteria: '- [ ] one', trds: '_None yet._', footer: 'Footer' }, OBJ).body;
  S.objN = fake.seedIssue({ title: '[Objective 49] Lifecycle demo', body, labels: ['devflow:objective'], assignees });
  const mapping = mappingLib.readMappingV3(root);
  mappingLib.setEntry(mapping, OBJ, { issue_id: S.objN });
  for (const [id, [fixtureFile, file]] of Object.entries(TRDS)) {
    const n = fake.seedIssue({
      title: `[TRD ${id}] ${file}`,
      body: trdLib.encodeTrdBody({ id, file, text: STORE_FIXTURE.trds[fixtureFile] }),
      labels: ['devflow:trd'],
    });
    mappingLib.setTrd(mapping, id, { issue_number: n, rest_id: 1_000_000 + n });
    S.trdN[id] = n;
  }
  assert.ok(mappingLib.writeMappingV3(root, mapping).ok);
  return S;
}

function teardown() {
  if (!S) return;
  cache.pullAll = S.savedPullAll;
  client._resetClient();
  if (S.remote) S.remote.cleanup();
  if (S.savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
  else process.env.DEVFLOW_WIKI_REMOTE = S.savedRemote;
  S.g.cleanup();
  S.envh.restore();
  S = null;
}

/** A public GitHub read through the fake (it records the call, so the store-off describe never uses it). */
function ghGet(route) {
  const r = S.fake.runGh(['api', route]);
  assert.equal(r.ok, true, `${route}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const branchNow = () => S.g.git(S.root, ['branch', '--show-current']);
const headNow = () => S.g.git(S.root, ['rev-parse', 'HEAD']);
const originMain = () => S.g.git(S.g.origin, ['rev-parse', 'refs/heads/main']);
const originHeads = () => S.g.git(S.root, ['ls-remote', '--heads', 'origin']).split('\n').filter(Boolean).map((l) => l.split('\t')[1].replace('refs/heads/', '')).sort();
const localBranches = () => S.g.git(S.root, ['branch', '--list', '--format=%(refname:short)']).split('\n').filter(Boolean);
const issue = (n) => S.fake.issues.find((i) => i.number === n);
const isOpen = (n) => issue(n).state === 'OPEN';
const allIssues = () => [S.objN, ...Object.values(S.trdN)];
const writesNow = () => S.fake.writes().length;
const queueNow = () => outbox.readJournal(S.root).journal.ops;
const pendingOps = () => queueNow().filter((o) => o.status !== 'done');
const prRecord = () => mappingLib.getPr(mappingLib.readMappingV3(S.root), OBJ);
const prNumber = () => prRecord().number;
const prNow = () => ghGet(`repos/o/r/pulls/${prNumber()}`);
const commentsOn = (n) => ghGet(`repos/o/r/issues/${n}/comments`);

/** A wave worktree cut from the objective branch the way the prose cuts it (`exec-context worktree`). */
function addWorktree(id) {
  const r = capture(() => cmdExecContextWorktree(S.root, ['--repo', S.root, '--id', id, '--base', BRANCH], false));
  assert.equal(exitOf(r), 0, r.stdout + r.stderr);
  return jsonOf(r);
}

/** Write `rel` in `cwd` and commit it through `df-tools commit` (the in-process cmdCommit); the parsed JSON result. */
function commitIn(cwd, message, rel, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  fs.writeFileSync(path.join(cwd, rel), text);
  const r = capture(() => cmdCommit(cwd, message, [rel], false));
  assert.equal(exitOf(r), 0, r.stdout + r.stderr);
  return jsonOf(r);
}

const trdCmd = (args) => capture(() => storeCli.cmdGhTrd(S.root, args, true));
const prCmd = (args) => capture(() => prCli.cmdGhPr(S.root, args, true));
const flushed = () => assert.equal(pendingOps().length, 0, JSON.stringify(pendingOps()));

const VERIFICATION = [
  '---', `objective: ${OBJ_DIR}`, 'status: passed', 'score: 12/12 must-haves', '---', '', '# Objective 49 Verification', '',
  'Every success criterion holds.', '',
].join('\n');

// ─── The lifecycle ───────────────────────────────────────────────────────────

describe('49-14 the objective lifecycle, start to reconcile', { skip: GIT ? false : 'git is not available' }, () => {
  before(() => { setup({ wiki: true }); });
  after(teardown);

  test('1. SC1: three TRDs, one PR; its Closes set is the objective issue plus the three TRD issues; the TRDs are frozen', () => {
    assert.deepEqual([S.objN, ...Object.values(S.trdN)], [100, 101, 102, 103]);
    // the wiki baseline exists before the objective starts, so the PR pins the revision it will be diffed against
    assert.equal(verbs.docPut(S.root, { rel: 'research/a.md', text: '# A\n\nBefore the objective.\n' }).ok, true);
    const base = wikiLib.headSha(S.root);
    assert.ok(base, 'the wiki clone exists');

    const r = prLib.startObjectivePr(S.root, OBJ);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.flush.status, 'flushed', JSON.stringify(r.flush));
    assert.equal(r.branch, BRANCH);
    assert.equal(branchNow(), BRANCH, 'the checkout is on the objective branch');
    assert.deepEqual([...r.frozen].sort(), ['49-01', '49-02', '49-03']);
    assert.deepEqual(r.freeze_errors, []);

    const pulls = ghGet('repos/o/r/pulls?state=all');
    assert.equal(pulls.length, 1, 'exactly one pull request');
    const closes = [...pulls[0].body.matchAll(/^Closes #(\d+)$/gm)].map((m) => Number(m[1]));
    assert.deepEqual(closes, [100, 101, 102, 103]);
    assert.deepEqual(closes, [S.objN, S.trdN['49-01'], S.trdN['49-02'], S.trdN['49-03']]);
    assert.equal(pulls[0].draft, true, 'the PR starts as a draft');
    assert.equal(pulls[0].head.ref, BRANCH);
    assert.equal(pulls[0].base.ref, 'main');

    const rec = prRecord();
    assert.equal(rec.number, pulls[0].number);
    assert.equal(rec.branch, BRANCH);
    assert.equal(rec.wiki_base_sha, base, 'the wiki revision the objective started from is on record');
    assert.deepEqual(prLib.closesFor(S.root, OBJ), closes, 'the mapping derives the same set');
    assert.deepEqual(prLib.prStatus(S.root, OBJ).closes_missing, [], 'the body misses none of them');

    // the start commit is the only commit of the branch, and it names the objective issue
    const messages = S.g.git(S.root, ['log', 'main..HEAD', '--format=%B%x00']).split('\0').map((m) => m.trim()).filter(Boolean);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /^chore\(49\): start objective 49\n\nRefs #100$/);

    // re-running changes nothing: no second PR, no second start commit
    const head = headNow();
    const again = prLib.startObjectivePr(S.root, OBJ);
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(ghGet('repos/o/r/pulls?state=all').length, 1);
    assert.equal(headNow(), head);
    assert.deepEqual(again.frozen, []);
  });

  test('2. SC2: two wave worktrees cut from the objective branch commit with Refs and merge back; one PR, two remote branches', () => {
    for (const id of ['49-01', '49-02']) {
      const started = trdCmd(['start', id]);
      assert.equal(exitOf(started), 0, started.stdout + started.stderr);
      assert.ok(issue(S.trdN[id]).labels.includes(IN_PROGRESS), `${id} is in progress`);
    }

    const w1 = addWorktree('49-01');
    const w2 = addWorktree('49-02');
    assert.equal(w1.branch, 'df/exec-49-01');
    assert.equal(w2.branch, 'df/exec-49-02');
    assert.equal(w1.base_sha, headNow(), 'a wave starts from the objective branch tip');
    assert.equal(w1.merge_into, S.root);

    const c1 = commitIn(w1.worktree_path, 'feat(49-01): a', 'src/a.txt', 'a\n');
    const c2 = commitIn(w2.worktree_path, 'feat(49-02): b', 'src/b.txt', 'b\n');
    assert.equal(c1.committed, true, JSON.stringify(c1));
    assert.equal(c2.committed, true, JSON.stringify(c2));
    assert.equal(c1.refs, S.trdN['49-01']);
    assert.equal(c2.refs, S.trdN['49-02']);

    for (const w of [w1, w2]) {
      S.g.git(S.root, ['merge', '--no-ff', '--no-edit', w.branch]);
      S.g.git(S.root, ['worktree', 'remove', '--force', w.worktree_path]);
      S.g.git(S.root, ['branch', '-d', w.branch]);
    }
    assert.deepEqual(localBranches().filter((b) => b.startsWith('df/exec-')), [], 'no wave branch is left');

    const sync = prLib.syncObjectivePr(S.root, OBJ);
    assert.equal(sync.ok, true, JSON.stringify(sync));
    assert.equal(sync.push.ok, true, JSON.stringify(sync.push));
    assert.equal(sync.flush.status, 'flushed', JSON.stringify(sync.flush));

    const pulls = ghGet('repos/o/r/pulls?state=all');
    assert.equal(pulls.length, 1, 'still exactly one PR: none for a df/exec-* branch');
    assert.equal(pulls[0].number, prNumber());
    assert.deepEqual(originHeads(), ['main', BRANCH].sort(), 'origin has only the default branch and the objective branch');
    assert.equal(prNow().head.sha, headNow(), 'the PR is at the merged tip');

    const messages = S.g.git(S.root, ['log', 'main..HEAD', '--no-merges', '--format=%B%x00']).split('\0').map((m) => m.trim()).filter(Boolean);
    assert.equal(messages.length, 3, 'the start commit and the two wave commits');
    const wanted = [`Refs #${S.objN}`, `Refs #${S.trdN['49-01']}`, `Refs #${S.trdN['49-02']}`];
    for (const m of messages) assert.ok(/^Refs #\d+$/m.test(m), `every commit carries Refs: ${m}`);
    assert.deepEqual(messages.map((m) => /^Refs #\d+$/m.exec(m)[0]).sort(), wanted.sort());
    const merges = S.g.git(S.root, ['log', 'main..HEAD', '--merges', '--format=%H']).split('\n').filter(Boolean);
    assert.equal(merges.length, 2, 'the two --no-ff merges');
  });

  test('3. summary post: devflow:in-progress comes off the TRD and the PR summary reads TRDs complete 2/3', () => {
    const first = verbs.summaryPost(S.root, { trd: '49-01', text: '# 49-01 summary\n\nDone.\n' });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(issue(S.trdN['49-01']).labels.includes(IN_PROGRESS), false, 'the label is gone from 49-01');
    assert.equal(bodyLib.extractSection(prNow().body, 'summary'), 'TRDs complete 1/3');

    const second = verbs.summaryPost(S.root, { trd: '49-02', text: '# 49-02 summary\n\nDone.\n' });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(issue(S.trdN['49-02']).labels.includes(IN_PROGRESS), false, 'the label is gone from 49-02');
    assert.equal(bodyLib.extractSection(prNow().body, 'summary'), 'TRDs complete 2/3');
    assert.ok(commentsOn(S.trdN['49-01']).some((c) => c.body.includes('49-01 summary')), 'the summary is on the TRD issue');
    flushed();
    assert.equal(ghGet('repos/o/r/pulls?state=all').length, 1);
  });
});
