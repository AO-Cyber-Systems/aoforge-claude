'use strict';

// objective-branch.test.cjs (TRD 49-04) — the git seam for the objective branch.
//
// Real git, temp repos only: every repository comes from `makeGitRemote()` (a bare origin and a clone under
// os.tmpdir(), isolated config, temp HOME). Nothing here touches the repo's own .git, the real ~/.claude,
// the network or `gh`. The argv test (9) swaps the runner for a stub and never spawns anything.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ob = require('./objective-branch.cjs');
const { makeGitRemote, gitAvailable } = require('./__fixtures__/git-remote.cjs');

const HAS_GIT = gitAvailable();
const OBJ = 'df/objective-49-x';

describe('objective-branch git seam', { skip: !HAS_GIT && 'git not installed' }, () => {
  const remotes = [];

  function setup() {
    const g = makeGitRemote();
    remotes.push(g);
    return g;
  }

  afterEach(() => {
    ob._resetRunGit();
    while (remotes.length) remotes.pop().cleanup();
  });

  test('1. makeGitRemote: a bare origin and a clone on main with one commit', () => {
    const g = setup();
    assert.ok(fs.existsSync(g.origin) && fs.existsSync(g.work));
    assert.equal(g.git(g.work, ['branch', '--show-current']), 'main');
    assert.equal(g.git(g.work, ['rev-list', '--count', 'HEAD']), '1');
    assert.match(g.git(g.work, ['ls-remote', 'origin']), /refs\/heads\/main/);
    assert.equal(process.env.GIT_CONFIG_GLOBAL, '/dev/null', 'the isolation is installed for the module under test');
    assert.equal(g.git(g.work, ['config', '--local', 'user.email']), 'dev@example.invalid');
  });

  test('1b. cleanup removes the temp dirs and restores the environment', () => {
    const before = process.env.GIT_CONFIG_GLOBAL;
    const g = makeGitRemote();
    const root = g.root;
    g.cleanup();
    g.cleanup();
    assert.equal(fs.existsSync(root), false);
    assert.equal(process.env.GIT_CONFIG_GLOBAL, before);
  });

  test('2. remoteTip: the tip on origin, or {ok:true, sha:null} for a branch origin does not have', () => {
    const g = setup();
    const head = ob.headSha(g.work);
    assert.equal(head.ok, true);
    assert.equal(ob.remoteTip(g.work, 'main').sha, head.sha);
    assert.deepEqual(ob.remoteTip(g.work, 'nope'), { ok: true, sha: null });
  });

  test('2b. remoteTip does not match a different ref that merely ends in the same name', () => {
    const g = setup();
    g.createRemoteBranch('feature/refs/heads/main', 'main');
    g.advanceOrigin();
    assert.equal(ob.remoteTip(g.work, 'main').sha, g.git(g.origin, ['rev-parse', 'refs/heads/main']));
  });

  test('3. fetchBranch + switchTo track origin/<branch> when no local branch exists', () => {
    const g = setup();
    g.createRemoteBranch(OBJ);
    const f = ob.fetchBranch(g.work, OBJ);
    assert.equal(f.ok, true, JSON.stringify(f));
    const s = ob.switchTo(g.work, OBJ);
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.equal(s.created, true);
    assert.equal(ob.currentBranch(g.work).branch, OBJ);
    assert.equal(g.git(g.work, ['rev-parse', '--abbrev-ref', '@{u}']), `origin/${OBJ}`);
  });

  test('3b. switchTo fetches by itself when origin/<branch> is not fetched yet', () => {
    const g = setup();
    g.createRemoteBranch(OBJ);
    assert.equal(g.run(g.work, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${OBJ}`]).status, 1, 'control: not fetched');
    const s = ob.switchTo(g.work, OBJ);
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.equal(ob.currentBranch(g.work).branch, OBJ);
  });

  test('3c. switchTo an existing local branch switches without creating; already there is a no-op', () => {
    const g = setup();
    g.git(g.work, ['branch', 'df/local-only']);
    const s = ob.switchTo(g.work, 'df/local-only');
    assert.deepEqual([s.ok, s.created, s.switched], [true, false, true]);
    const again = ob.switchTo(g.work, 'df/local-only');
    assert.deepEqual([again.ok, again.created, again.switched], [true, false, false]);
  });

  test('3d. switchTo a branch origin does not have is {ok:false} and the checkout does not move', () => {
    const g = setup();
    const r = ob.switchTo(g.work, 'df/objective-404-missing');
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 0);
    assert.equal(ob.currentBranch(g.work).branch, 'main');
  });

  test('4. switchTo refuses when a tracked file is modified, naming it; untracked files do not block', () => {
    const g = setup();
    g.createRemoteBranch(OBJ);
    fs.writeFileSync(path.join(g.work, 'README.md'), '# dirty\n');
    const blocked = ob.switchTo(g.work, OBJ);
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /README\.md/);
    assert.equal(ob.currentBranch(g.work).branch, 'main', 'the checkout did not move');

    g.git(g.work, ['checkout', '--', 'README.md']);
    fs.writeFileSync(path.join(g.work, 'scratch.txt'), 'untracked\n');
    const ok = ob.switchTo(g.work, OBJ);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ob.currentBranch(g.work).branch, OBJ);
  });

  test('4b. isTrackedClean: clean, dirty with the file list, and untracked-only is clean', () => {
    const g = setup();
    assert.deepEqual(ob.isTrackedClean(g.work), { ok: true, clean: true, files: [] });
    fs.writeFileSync(path.join(g.work, 'scratch.txt'), 'untracked\n');
    assert.equal(ob.isTrackedClean(g.work).clean, true);
    fs.writeFileSync(path.join(g.work, 'README.md'), '# dirty\n');
    assert.deepEqual(ob.isTrackedClean(g.work), { ok: true, clean: false, files: ['README.md'] });
  });

  test('4c. currentBranch: a branch name, and null for a detached HEAD', () => {
    const g = setup();
    assert.deepEqual(ob.currentBranch(g.work), { ok: true, branch: 'main', detached: false });
    g.git(g.work, ['checkout', '-q', '--detach']);
    assert.deepEqual(ob.currentBranch(g.work), { ok: true, branch: null, detached: true });
  });

  test('5. startCommit: an empty commit with exactly the message given, returning its sha', () => {
    const g = setup();
    const before = g.git(g.work, ['rev-parse', 'HEAD']);
    const message = 'chore(49): start objective 49\n\nRefs #120';
    const r = ob.startCommit(g.work, message);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.notEqual(r.sha, before);
    assert.equal(r.sha, g.git(g.work, ['rev-parse', 'HEAD']));
    assert.equal(g.git(g.work, ['log', '-1', '--format=%B']), message);
    assert.equal(g.git(g.work, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']), '', 'no files changed');
    assert.equal(g.git(g.work, ['rev-parse', 'HEAD~1']), before);
  });

  test('5b. startCommit refuses an empty message and refuses to sweep in staged changes', () => {
    const g = setup();
    assert.equal(ob.startCommit(g.work, '  \n').ok, false);
    assert.equal(ob.startCommit(g.work, undefined).ok, false);

    fs.writeFileSync(path.join(g.work, 'staged.txt'), 'x\n');
    g.git(g.work, ['add', 'staged.txt']);
    const before = g.git(g.work, ['rev-parse', 'HEAD']);
    const r = ob.startCommit(g.work, 'chore(49): start objective 49\n\nRefs #1');
    assert.equal(r.ok, false);
    assert.match(r.error, /staged/i);
    assert.equal(g.git(g.work, ['rev-parse', 'HEAD']), before, 'no commit was made');
  });

  test('6. push -u publishes the branch: origin\'s tip equals the local head', () => {
    const g = setup();
    g.git(g.work, ['switch', '-q', '-c', OBJ]);
    const c = ob.startCommit(g.work, 'chore(49): start objective 49\n\nRefs #120');
    assert.equal(c.ok, true);
    assert.deepEqual(ob.remoteTip(g.work, OBJ), { ok: true, sha: null }, 'control: not on origin yet');

    const p = ob.push(g.work, OBJ, { setUpstream: true });
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(ob.remoteTip(g.work, OBJ).sha, c.sha);
    assert.equal(g.git(g.work, ['rev-parse', '--abbrev-ref', '@{u}']), `origin/${OBJ}`);
  });

  test('6b. a rejected push is {ok:false, error, stderr}, never a throw, and never forced', () => {
    const g = setup();
    g.git(g.work, ['switch', '-q', '-c', OBJ]);
    ob.startCommit(g.work, 'chore(49): one');
    assert.equal(ob.push(g.work, OBJ, { setUpstream: true }).ok, true);
    g.git(g.work, ['reset', '-q', '--hard', 'HEAD~1']);
    ob.startCommit(g.work, 'chore(49): diverged');
    const tip = ob.remoteTip(g.work, OBJ).sha;
    const p = ob.push(g.work, OBJ);
    assert.equal(p.ok, false);
    assert.ok(p.error.length > 0 && typeof p.stderr === 'string');
    assert.equal(ob.remoteTip(g.work, OBJ).sha, tip, 'origin was not overwritten');
  });

  test('7. listLocal and deleteLocal: list by pattern, delete a merged branch, never the current or default', () => {
    const g = setup();
    g.git(g.work, ['branch', 'df/exec-49-01']);
    g.git(g.work, ['branch', 'df/exec-49-02']);
    g.git(g.work, ['branch', 'df/objective-49-x']);
    const l = ob.listLocal(g.work, 'df/exec-*');
    assert.equal(l.ok, true);
    assert.deepEqual(l.branches.sort(), ['df/exec-49-01', 'df/exec-49-02']);
    assert.deepEqual(ob.listLocal(g.work, 'nothing-*'), { ok: true, branches: [] });
    assert.deepEqual(ob.listLocal(g.work).branches.sort(), ['df/exec-49-01', 'df/exec-49-02', 'df/objective-49-x', 'main']);

    const d = ob.deleteLocal(g.work, 'df/exec-49-01');
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.deepEqual(ob.listLocal(g.work, 'df/exec-*').branches, ['df/exec-49-02']);

    // the current branch
    g.git(g.work, ['switch', '-q', 'df/exec-49-02']);
    for (const force of [false, true]) {
      const cur = ob.deleteLocal(g.work, 'df/exec-49-02', { force });
      assert.equal(cur.ok, false, `current branch, force=${force}`);
      assert.match(cur.error, /current/i);
    }
    // the default branch, from another branch
    for (const force of [false, true]) {
      const def = ob.deleteLocal(g.work, 'main', { force });
      assert.equal(def.ok, false, `default branch, force=${force}`);
      assert.match(def.error, /default/i);
    }
    assert.ok(ob.listLocal(g.work, 'main').branches.includes('main'));
  });

  test('7a. an unmerged branch is kept by deleteLocal and removed with {force:true} (branch -D)', () => {
    const g = setup();
    g.git(g.work, ['switch', '-q', '-c', 'df/exec-49-03']);
    g.commitFile(g.work, 'exec.txt', 'work\n', 'feat(49-03): work');
    g.git(g.work, ['switch', '-q', 'main']);

    const kept = ob.deleteLocal(g.work, 'df/exec-49-03');
    assert.equal(kept.ok, false);
    assert.ok(kept.error.length > 0);
    assert.deepEqual(ob.listLocal(g.work, 'df/exec-49-03').branches, ['df/exec-49-03'], 'the branch is still there');

    const calls = [];
    ob._setRunGit((args, opts) => { calls.push(args); return ob.realRunGit(args, opts); });
    const forced = ob.deleteLocal(g.work, 'df/exec-49-03', { force: true });
    assert.equal(forced.ok, true, JSON.stringify(forced));
    assert.ok(calls.some((a) => a[0] === 'branch' && a[1] === '-D' && a[2] === 'df/exec-49-03'), JSON.stringify(calls));
    assert.deepEqual(ob.listLocal(g.work, 'df/exec-49-03').branches, []);
  });

  test('7a-2. deleteLocal protects origin/HEAD\'s branch even when it is not main or master', () => {
    const g = setup();
    g.git(g.work, ['branch', 'trunk']);
    g.git(g.work, ['push', '-q', 'origin', 'trunk']);
    g.git(g.work, ['fetch', '-q', 'origin']);
    g.git(g.work, ['remote', 'set-head', 'origin', 'trunk']);
    const r = ob.deleteLocal(g.work, 'trunk', { force: true });
    assert.equal(r.ok, false);
    assert.match(r.error, /default/i);
    assert.equal(ob.defaultBranch(g.work).branch, 'trunk');
  });

  test('7a-3. defaultBranch falls back to a local main or master when origin/HEAD is unset', () => {
    const g = setup();
    g.git(g.work, ['remote', 'set-head', 'origin', '-d']);
    assert.deepEqual(ob.defaultBranch(g.work), { ok: true, branch: 'main', source: 'fallback' });
    assert.equal(ob.deleteLocal(g.work, 'main', { force: true }).ok, false, 'still protected');
  });

  test('7b. isAncestor: true when merged into history, false for a diverged branch, ok:false for a bad sha', () => {
    const g = setup();
    g.git(g.work, ['switch', '-q', '-c', 'df/exec-49-04']);
    g.commitFile(g.work, 'a.txt', 'a\n', 'feat(49-04): a');
    g.git(g.work, ['switch', '-q', 'main']);
    g.git(g.work, ['merge', '-q', '--no-ff', '-m', 'merge exec', 'df/exec-49-04']);
    g.git(g.work, ['switch', '-q', '-c', 'df/exec-49-05', 'HEAD~1']);
    g.commitFile(g.work, 'b.txt', 'b\n', 'feat(49-05): b');
    g.git(g.work, ['switch', '-q', 'main']);

    const head = ob.headSha(g.work);
    const merged = ob.branchTip(g.work, 'df/exec-49-04');
    const diverged = ob.branchTip(g.work, 'df/exec-49-05');
    assert.equal(merged.ok, true);
    assert.deepEqual(ob.isAncestor(g.work, merged.sha, head.sha), { ok: true, ancestor: true });
    assert.deepEqual(ob.isAncestor(g.work, diverged.sha, head.sha), { ok: true, ancestor: false });
    // the {ok, sha} results the tip functions return are accepted directly
    assert.deepEqual(ob.isAncestor(g.work, merged, head), { ok: true, ancestor: true });

    const bad = ob.isAncestor(g.work, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', head.sha);
    assert.equal(bad.ok, false);
    assert.ok(bad.error.length > 0);
    assert.equal(ob.isAncestor(g.work, '--all', head.sha).ok, false, 'an option-looking rev is refused');
  });

  test('7c. branchTip: the local sha, or {ok:true, sha:null} when there is no such local branch', () => {
    const g = setup();
    assert.equal(ob.branchTip(g.work, 'main').sha, g.git(g.work, ['rev-parse', 'main']));
    assert.deepEqual(ob.branchTip(g.work, 'df/nope'), { ok: true, sha: null });
  });

  test('8. syncDefault switches to main and fast-forwards it from origin', () => {
    const g = setup();
    g.git(g.work, ['switch', '-q', '-c', OBJ]);
    const advanced = g.advanceOrigin();
    assert.notEqual(advanced, g.git(g.work, ['rev-parse', 'main']), 'control: local main is behind');

    const r = ob.syncDefault(g.work, 'main');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.sha, advanced);
    assert.equal(r.updated, true);
    assert.equal(ob.currentBranch(g.work).branch, 'main');
    assert.equal(g.git(g.work, ['rev-parse', 'HEAD']), advanced);
    assert.ok(fs.existsSync(path.join(g.work, 'advance.txt')));

    const again = ob.syncDefault(g.work, 'main');
    assert.deepEqual([again.ok, again.updated, again.sha], [true, false, advanced]);
  });

  test('8b. syncDefault is {ok:false} when main cannot fast-forward, and when tracked files are dirty', () => {
    const g = setup();
    g.commitFile(g.work, 'local.txt', 'local\n', 'chore: local only');
    g.advanceOrigin();
    const diverged = ob.syncDefault(g.work, 'main');
    assert.equal(diverged.ok, false);
    assert.ok(diverged.error.length > 0);

    const h = setup();
    h.git(h.work, ['switch', '-q', '-c', OBJ]);
    fs.writeFileSync(path.join(h.work, 'README.md'), '# dirty\n');
    const dirty = ob.syncDefault(h.work, 'main');
    assert.equal(dirty.ok, false);
    assert.match(dirty.error, /README\.md/);
    assert.equal(ob.currentBranch(h.work).branch, OBJ);
  });

  test('9. _setRunGit captures argv: push sends push -u origin <branch>; _resetRunGit restores', () => {
    const calls = [];
    ob._setRunGit((args, opts) => {
      calls.push({ args, cwd: opts && opts.cwd });
      return { ok: true, status: 0, stdout: '', stderr: '' };
    });
    const r = ob.push('/nowhere', OBJ, { setUpstream: true });
    assert.equal(r.ok, true);
    assert.deepEqual(calls.map((c) => c.args), [['push', '-u', 'origin', OBJ]]);
    assert.equal(calls[0].cwd, '/nowhere');

    calls.length = 0;
    ob.push('/nowhere', OBJ);
    assert.deepEqual(calls.map((c) => c.args), [['push', 'origin', OBJ]]);

    ob._resetRunGit();
    const real = ob.push('/definitely/not/a/real/dir', OBJ);
    assert.equal(real.ok, false, 'the real runner is back and reports the missing directory');
    assert.equal(calls.length, 1, 'the stub saw no further calls');
  });

  test('9b. git failures are results, not throws: a missing git, a non-repository, a bad branch name', () => {
    ob._setRunGit(() => ({ ok: false, status: null, stdout: '', stderr: 'git: command not found' }));
    const r = ob.headSha('/x');
    assert.equal(r.ok, false);
    assert.match(r.error, /command not found/);
    ob._resetRunGit();

    const g = setup();
    for (const bad of ['', '-x', 'a..b', 'a b', 'x/', 'a.lock', undefined, 42]) {
      assert.equal(ob.switchTo(g.work, bad).ok, false, `switchTo(${String(bad)})`);
      assert.equal(ob.push(g.work, bad).ok, false, `push(${String(bad)})`);
      assert.equal(ob.deleteLocal(g.work, bad).ok, false, `deleteLocal(${String(bad)})`);
    }
    const notRepo = ob.headSha(path.join(g.root, 'home'));
    assert.equal(notRepo.ok, false);
  });
});
