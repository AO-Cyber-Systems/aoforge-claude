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
    // the token owner is alice, the objective issue's assignee: what DevFlow posts (a confirm included) is posted as alice
    repo: 'o/r', hasWiki: wiki, viewer: 'alice', refs: { main: c0 }, onCreateBranch: (name) => g.createRemoteBranch(name), ...fakeOptions,
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

  test('4. SC3: a stranger\'s scope is pending, outside `gh trd spec`, until an assignee confirms it; only then does it apply', () => {
    const n3 = S.trdN['49-03'];
    const scope = 'Mallory proposes an extra check.';
    S.fake.seedComment(n3, trdLib.buildScopeComment(1, scope), { login: 'mallory' });

    const spec = commentsLib.readEffectiveSpec(S.root, '49-03');
    assert.equal(spec.ok, true, JSON.stringify(spec));
    assert.deepEqual(spec.assignees, ['alice']);
    assert.deepEqual(spec.applied, [], 'nothing applies');
    assert.equal(spec.text.includes(scope), false, 'the stranger\'s text is not in the spec');
    assert.deepEqual(spec.pending.map((p) => [p.n, p.author]), [[1, 'mallory']]);

    const cliSpec = trdCmd(['spec', '49-03']);
    assert.equal(exitOf(cliSpec), 0);
    assert.equal(jsonOf(cliSpec).text.includes(scope), false);
    assert.deepEqual(jsonOf(cliSpec).pending.map((p) => p.n), [1]);
    const status = prLib.prStatus(S.root, OBJ);
    assert.deepEqual((status.pending_scopes['49-03'] || []).map((p) => [p.n, p.author]), [[1, 'mallory']], 'gh pr status lists it too');

    // the stranger cannot confirm their own scope
    S.viewer = 'mallory';
    const writes = writesNow();
    const refused = trdCmd(['confirm-scope', '49-03', '1']);
    assert.equal(exitOf(refused), 1, refused.stdout + refused.stderr);
    assert.match(jsonOf(refused).error, /mallory is not an assignee/);
    assert.equal(writesNow(), writes);
    assert.equal(pendingOps().length, 0, 'nothing was queued');
    assert.equal(commentsLib.readEffectiveSpec(S.root, '49-03').text.includes(scope), false);

    // an assignee can: the confirm is queued, flushed, and the scope then applies
    S.viewer = 'alice';
    const ok = trdCmd(['confirm-scope', '49-03', '1']);
    assert.equal(exitOf(ok), 0, ok.stdout + ok.stderr);
    assert.ok(writesNow() > writes, 'the confirm reached GitHub');
    flushed();
    S.viewer = null;
    const after = commentsLib.readEffectiveSpec(S.root, '49-03');
    assert.deepEqual(after.applied, [1]);
    assert.deepEqual(after.pending, []);
    assert.ok(after.text.includes(scope), 'the confirmed scope is part of the spec');
    assert.ok(commentsOn(n3).some((c) => c.body.includes('devflow:scope-confirm') && c.user.login === 'alice'), 'the confirm is signed by alice');
    assert.deepEqual(prLib.prStatus(S.root, OBJ).pending_scopes, {}, 'no pending scope is left');
  });

  test('5. verify pass: the PR is ready, devflow/verification is success on its head, the wiki diff is on the PR; the objective issue stays open', () => {
    assert.equal(verbs.docPut(S.root, { rel: 'research/b.md', text: '# B\n\nChanged during the objective.\n' }).ok, true);
    const sync = prLib.syncObjectivePr(S.root, OBJ);
    assert.equal(sync.ok, true, JSON.stringify(sync));
    assert.equal(prNow().draft, true, 'a draft until the verify pass');

    const r = verbs.verificationPost(S.root, { objective: OBJ, text: VERIFICATION });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0, JSON.stringify(r));
    flushed();

    const pr = prNow();
    assert.equal(pr.draft, false, 'ready for review');
    assert.equal(pr.head.sha, headNow());
    const posted = (S.fake.statuses[pr.head.sha] || []).filter((s) => s.context === 'devflow/verification');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].state, 'success');
    const status = prLib.prStatus(S.root, OBJ);
    assert.equal(status.pr.state, 'ready');
    assert.equal(status.verification.state, 'success');
    assert.deepEqual(status.errors, []);

    const diff = commentsOn(prNumber()).filter((c) => c.body.includes('Research-b.md'));
    assert.equal(diff.length, 1, 'one wiki-diff comment on the PR');
    assert.match(diff[0].body, /Wiki changes during objective 49/);
    assert.match(diff[0].body, /\+Changed during the objective\./);
    assert.doesNotMatch(diff[0].body, /Research-a\.md/, 'only what changed since the objective started');

    // marking the objective complete before the merge defers the close: the PR's merge closes it
    const complete = verbs.objectiveSetStatus(S.root, { id: OBJ, status: 'complete' });
    assert.equal(complete.ok, true, JSON.stringify(complete));
    assert.equal(complete.close_deferred, `pr #${prNumber()}`);
    assert.equal(queueNow().filter((o) => o.kind === 'patch-issue' && o.payload && o.payload.state === 'closed').length, 0, 'no close was ever queued');
    for (const n of allIssues()) assert.equal(isOpen(n), true, `#${n} is still open before the merge`);
  });

  test('6. merge then reconcile: every issue is closed, both branches are gone, gh pull --all ran; a second reconcile writes nothing', () => {
    const n = prNumber();
    const unrelatedOpen = () => S.fake.issues.filter((i) => i.number < 100 && i.state === 'OPEN').length;
    assert.equal(unrelatedOpen(), 99);

    const r = prLib.mergeObjectivePr(S.root, OBJ);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.merged, true);
    assert.equal(r.method, 'squash');
    assert.equal(prNow().merged, true);
    for (const num of allIssues()) assert.equal(isOpen(num), false, `#${num} is closed`);
    assert.equal(unrelatedOpen(), 99, 'unrelated issues were left alone');
    assert.equal(S.fake.refs[BRANCH], undefined, 'the remote objective branch is gone');
    assert.deepEqual(originHeads(), ['main']);
    assert.equal(branchNow(), 'main', 'the checkout is back on the default branch');
    assert.equal(headNow(), originMain(), 'local main holds the merge');
    assert.equal(S.g.git(S.root, ['log', '-1', '--format=%s', 'main']), 'squash merge');
    assert.deepEqual(localBranches(), ['main'], 'the local objective branch is deleted');
    assert.equal(S.pulls, 1, 'gh pull --all ran once');
    assert.equal(typeof prRecord().merged_at, 'string');
    assert.equal(typeof prRecord().reconciled_at, 'string');
    assert.equal(prRecord().number, n);

    // reconcile again, through the CLI: a no-op on GitHub and on disk
    const writes = writesNow();
    const head = headNow();
    const again = prCmd(['reconcile', OBJ]);
    assert.equal(exitOf(again), 0, again.stdout + again.stderr);
    assert.equal(jsonOf(again).already_reconciled, true);
    assert.deepEqual(jsonOf(again).closed, []);
    assert.equal(writesNow(), writes, 'zero GitHub writes');
    assert.equal(headNow(), head);
    assert.deepEqual(localBranches(), ['main']);
    assert.equal(S.pulls, 1, 'the cache is not pulled again');
    assert.equal(pendingOps().length, 0);
  });
});

// ─── The merge queue ─────────────────────────────────────────────────────────

describe('49-14 the merge-queue variant', { skip: GIT ? false : 'git is not available' }, () => {
  // closeKeywordCap 2: the merge honours only the first two closing links, so the reconcile has stragglers to close
  before(() => { setup({ fake: { mergeQueue: true, closeKeywordCap: 2 } }); });
  after(teardown);

  test('7. merge only enqueues the PR (exit 3), reconcile waits (exit 3); once the queue lands it, reconcile closes the stragglers', () => {
    assert.equal(prLib.startObjectivePr(S.root, OBJ).ok, true);
    const verified = verbs.verificationPost(S.root, { objective: OBJ, text: VERIFICATION });
    assert.equal(verified.ok, true, JSON.stringify(verified));
    flushed();
    const n = prNumber();
    assert.equal(ghGet(`repos/o/r/pulls/${n}`).draft, false);

    const merge = prCmd(['merge', OBJ]);
    assert.equal(exitOf(merge), 3, merge.stdout + merge.stderr);
    assert.equal(jsonOf(merge).merged, false);
    assert.equal(jsonOf(merge).pending, true);
    assert.match(jsonOf(merge).reason, /gh pr reconcile 49/);
    assert.equal(ghGet(`repos/o/r/pulls/${n}`).queued, true, 'the PR is in the merge queue');
    assert.equal(ghGet(`repos/o/r/pulls/${n}`).merged, false);
    for (const num of allIssues()) assert.equal(isOpen(num), true, `#${num} is still open`);
    assert.notEqual(S.fake.refs[BRANCH], undefined, 'the branch of a queued PR is kept');
    assert.equal(branchNow(), BRANCH);

    const writes = writesNow();
    const waiting = prCmd(['reconcile', OBJ]);
    assert.equal(exitOf(waiting), 3, waiting.stdout + waiting.stderr);
    assert.equal(jsonOf(waiting).pending, true);
    assert.equal(writesNow(), writes, 'a reconcile of a queued PR writes nothing');
    assert.equal(S.pulls, 0);

    // the queue lands the PR; GitHub honours two of the four closing links
    S.fake.humanMergePr(n, { method: 'squash' });
    S.g.advanceOrigin({ message: 'merge queue lands the PR' });
    assert.equal(isOpen(S.objN), false);
    assert.equal(isOpen(S.trdN['49-01']), false);
    assert.equal(isOpen(S.trdN['49-02']), true, 'a straggler');
    assert.equal(isOpen(S.trdN['49-03']), true, 'a straggler');

    const done = prCmd(['reconcile', OBJ]);
    assert.equal(exitOf(done), 0, done.stdout + done.stderr);
    assert.deepEqual([...jsonOf(done).closed].sort(), [S.trdN['49-02'], S.trdN['49-03']].sort(), 'only the stragglers were closed');
    for (const num of allIssues()) assert.equal(isOpen(num), false, `#${num} is closed`);
    assert.equal(S.fake.refs[BRANCH], undefined);
    assert.equal(branchNow(), 'main');
    assert.equal(headNow(), originMain());
    assert.equal(S.pulls, 1);
  });
});

// ─── Store off ───────────────────────────────────────────────────────────────

/** Run an init in-process; the JSON it printed. */
function runInit(fn, ...args) {
  const realWrite = process.stdout.write;
  const realExit = process.exit;
  let out = '';
  const STOP = Symbol('init-exit');
  process.stdout.write = (chunk) => { out += String(chunk); return true; };
  process.exit = () => { throw STOP; };
  try {
    fn(...args);
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    process.stdout.write = realWrite;
    process.exit = realExit;
  }
  return JSON.parse(out);
}

describe('49-14 store-off parity (github.enabled true, github.store false)', { skip: GIT ? false : 'git is not available' }, () => {
  before(() => { setup({ store: false }); });
  after(teardown);

  test('8. every gh pr and store verb is skipped with zero gh calls; commits carry no Refs; init reports pr_lifecycle:false; the objective completes as in objective 48', () => {
    const head = headNow();

    for (const [name, r] of [
      ['start', prLib.startObjectivePr(S.root, OBJ)],
      ['sync', prLib.syncObjectivePr(S.root, OBJ)],
      ['status', prLib.prStatus(S.root, OBJ)],
      ['merge', prLib.mergeObjectivePr(S.root, OBJ)],
      ['reconcile', prLib.reconcileObjectivePr(S.root, OBJ)],
    ]) {
      assert.equal(r.skipped, true, `${name} is skipped: ${JSON.stringify(r)}`);
    }
    for (const verb of ['start', 'sync', 'status', 'merge', 'reconcile']) {
      const r = prCmd([verb, OBJ]);
      assert.equal(exitOf(r), 0, `${verb}: ${r.stdout}${r.stderr}`);
      assert.equal(jsonOf(r).skipped, true, `${verb} reports skipped`);
    }
    for (const args of [['confirm-scope', '49-03', '1'], ['start', '49-01']]) {
      const r = trdCmd(args);
      assert.equal(exitOf(r), 0, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.equal(jsonOf(r).skipped, true, `gh trd ${args[0]} reports skipped`);
    }
    assert.deepEqual(S.fake.calls(), [], 'not one gh call');
    assert.equal(pendingOps().length, 0, 'nothing queued');
    assert.equal(headNow(), head, 'no git change');
    assert.equal(branchNow(), 'main');
    assert.deepEqual(localBranches(), ['main']);

    // a commit message is exactly what was passed: no Refs, no refs key in the result
    const scoped = commitIn(S.root, 'feat(49-01): a', 'src/a.txt', 'a\n');
    assert.equal(scoped.committed, true, JSON.stringify(scoped));
    assert.equal('refs' in scoped, false, 'local mode adds no refs key');
    assert.equal(S.g.git(S.root, ['log', '-1', '--format=%B']).trim(), 'feat(49-01): a');
    const objectiveWide = commitIn(S.root, 'docs(49): wave 1', 'src/b.txt', 'b\n');
    assert.equal('refs' in objectiveWide, false);
    assert.equal(S.g.git(S.root, ['log', '-1', '--format=%B']).trim(), 'docs(49): wave 1');
    assert.doesNotMatch(S.g.git(S.root, ['log', '--format=%B']), /Refs #/);

    const exec = runInit(init.cmdInitExecuteObjective, S.root, OBJ, new Set(), false, []);
    assert.equal(exec.pr_lifecycle, false);
    assert.equal('objective_branch' in exec, false, 'no objective branch is planned');
    assert.equal('pr_number' in exec, false);

    // even with a PR on record the local-mode verbs write their files and touch GitHub not at all
    const mapping = mappingLib.readMappingV3(S.root);
    mappingLib.setPr(mapping, OBJ, { branch: BRANCH, base: 'main', number: 104 });
    assert.ok(mappingLib.writeMappingV3(S.root, mapping).ok);
    const summaryText = '# 49-01 summary\n\nDone.\n';
    const summary = verbs.summaryPost(S.root, { trd: '49-01', text: summaryText });
    assert.equal(summary.ok, true, JSON.stringify(summary));
    const objDir = path.join(S.root, '.planning', 'objectives', OBJ_DIR);
    const summaries = fs.readdirSync(objDir).filter((f) => /SUMMARY\.md$/.test(f));
    assert.equal(summaries.length, 1, `one SUMMARY was written: ${summaries}`);
    assert.equal(fs.readFileSync(path.join(objDir, summaries[0]), 'utf8'), summaryText, 'today\'s bytes');
    const verification = verbs.verificationPost(S.root, { objective: OBJ, text: VERIFICATION });
    assert.equal(verification.ok, true, JSON.stringify(verification));
    assert.ok(fs.readdirSync(objDir).some((f) => /VERIFICATION\.md$/.test(f)), 'the verification is written locally');

    // as in objective 48: the status is written locally and nothing is deferred or sent
    const complete = verbs.objectiveSetStatus(S.root, { id: OBJ, status: 'complete' });
    assert.equal(complete.ok, true, JSON.stringify(complete));
    assert.equal(complete.close_deferred, undefined);
    assert.match(fs.readFileSync(path.join(objDir, 'OBJECTIVE.md'), 'utf8'), /^status: complete$/m);

    assert.deepEqual(S.fake.calls(), [], 'still not one gh call');
    assert.equal(pendingOps().length, 0);
    assert.equal(S.pulls, 0);
  });
});
