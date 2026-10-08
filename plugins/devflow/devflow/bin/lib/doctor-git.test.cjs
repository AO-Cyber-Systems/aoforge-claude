'use strict';

// Tests for lib/doctor-git.cjs — the DOC-06 git guard every index-changing doctor fix consults
// (TRD 45-06, tests 1-3a).
//
// no_llm_test_data: every repo here is a hand-built fixture under the OS temp dir
// (doctor-fixtures.makeDoctorProject / upgrade-fixtures.makeTrackedRuntimeStateProject). Every git
// call — the test's own and the module's — runs with gitEnv(home): a fake HOME, no system config,
// so the real ~/.claude and the operator's git config are never touched.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const dg = require('./doctor-git.cjs');
const { makeDoctorProject, makeDoctorHome } = require('./__fixtures__/doctor-fixtures.cjs');
const { gitEnv, makeTrackedRuntimeStateProject } = require('./__fixtures__/upgrade-fixtures.cjs');

function git(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function append(root, rel, content) {
  fs.appendFileSync(path.join(root, rel), content, 'utf-8');
}

function commitGitignore(root, home, content) {
  write(root, '.gitignore', content);
  git(root, home, 'add', '--', '.gitignore');
  git(root, home, 'commit', '-q', '-m', 'add .gitignore');
}

describe('doctor-git: stagedPaths / isGitRepo (test 1)', () => {
  test('a clean repo has no staged paths', () => {
    const { root, home } = makeDoctorProject();
    const opts = { env: gitEnv(home) };
    assert.equal(dg.isGitRepo(root, opts), true);
    assert.deepEqual(dg.stagedPaths(root, opts), []);
  });

  test('staged adds, modifications and deletes are all listed, sorted', () => {
    const { root, home } = makeDoctorProject();
    write(root, 'src/new.txt', 'new file\n');
    git(root, home, 'add', '--', 'src/new.txt');
    append(root, '.planning/ROADMAP.md', '\nA staged edit.\n');
    git(root, home, 'add', '--', '.planning/ROADMAP.md');
    git(root, home, 'rm', '-q', '--', '.planning/STATE.md');

    assert.deepEqual(dg.stagedPaths(root, { env: gitEnv(home) }),
      ['.planning/ROADMAP.md', '.planning/STATE.md', 'src/new.txt']);
  });

  test('unstaged edits and untracked files are not staged paths', () => {
    const { root, home } = makeDoctorProject();
    append(root, '.planning/ROADMAP.md', '\nAn unstaged edit.\n');
    write(root, 'src/untracked.txt', 'untracked\n');
    assert.deepEqual(dg.stagedPaths(root, { env: gitEnv(home) }), []);
  });

  test('a directory that is not a git repo reports isGitRepo:false and no staged paths', () => {
    const { root, home } = makeDoctorProject({ git: false });
    const opts = { env: gitEnv(home) };
    assert.equal(dg.isGitRepo(root, opts), false);
    assert.deepEqual(dg.stagedPaths(root, opts), []);
  });
});

describe('doctor-git: dirtyPaths (test 2)', () => {
  test('reports staged and unstaged changes under the given pathspecs only', () => {
    const { root, home } = makeDoctorProject();
    commitGitignore(root, home, 'node_modules/\n');

    append(root, '.planning/ROADMAP.md', '\nUnstaged edit.\n');          // unstaged, in scope
    append(root, '.planning/PROJECT.md', '\nStaged edit.\n');           // staged, in scope
    git(root, home, 'add', '--', '.planning/PROJECT.md');
    append(root, '.gitignore', 'dist/\n');                                // unstaged, in scope
    append(root, 'CLAUDE.md', '\nOut of scope edit.\n');                 // out of scope
    write(root, 'src/other.txt', 'staged but out of scope\n');
    git(root, home, 'add', '--', 'src/other.txt');

    assert.deepEqual(dg.dirtyPaths(root, ['.planning', '.gitignore'], { env: gitEnv(home) }),
      ['.gitignore', '.planning/PROJECT.md', '.planning/ROADMAP.md']);
  });

  test('a clean tree gives [] and a non-repo gives []', () => {
    const { root, home } = makeDoctorProject();
    assert.deepEqual(dg.dirtyPaths(root, ['.planning'], { env: gitEnv(home) }), []);
    const plain = makeDoctorProject({ git: false });
    assert.deepEqual(dg.dirtyPaths(plain.root, ['.planning'], { env: gitEnv(plain.home) }), []);
  });
});

describe('doctor-git: indexChangeGuard / worktreeGuard (test 3)', () => {
  test('clean repo → ok', () => {
    const { root, home } = makeDoctorProject();
    assert.deepEqual(dg.indexChangeGuard(root, { env: gitEnv(home) }), { ok: true });
    assert.deepEqual(dg.worktreeGuard(root, ['.planning', '.gitignore'], { env: gitEnv(home) }), { ok: true });
  });

  test('something staged → refused with the exact staged paths', () => {
    const { root, home } = makeDoctorProject();
    write(root, 'src/app.txt', 'unrelated work\n');
    git(root, home, 'add', '--', 'src/app.txt');
    assert.deepEqual(dg.indexChangeGuard(root, { env: gitEnv(home) }),
      { ok: false, reason: 'staged changes present: src/app.txt' });
  });

  test('.gitignore with unstaged edits → refused', () => {
    const { root, home } = makeDoctorProject();
    commitGitignore(root, home, 'node_modules/\n');
    append(root, '.gitignore', 'dist/\n');
    const g = dg.indexChangeGuard(root, { env: gitEnv(home) });
    assert.equal(g.ok, false);
    assert.match(g.reason, /\.gitignore/);
  });

  test('an untracked .gitignore also counts as an uncommitted .gitignore change', () => {
    const { root, home } = makeDoctorProject();
    write(root, '.gitignore', 'node_modules/\n');
    const g = dg.indexChangeGuard(root, { env: gitEnv(home) });
    assert.equal(g.ok, false);
    assert.match(g.reason, /\.gitignore/);
  });

  test('worktreeGuard refuses on a dirty path under its pathspecs and names it', () => {
    const { root, home } = makeDoctorProject();
    append(root, '.planning/ROADMAP.md', '\nUser edit.\n');
    const g = dg.worktreeGuard(root, ['.planning', 'CLAUDE.md', '.gitignore'], { env: gitEnv(home) });
    assert.equal(g.ok, false);
    assert.match(g.reason, /uncommitted changes/);
    assert.match(g.reason, /\.planning\/ROADMAP\.md/);
  });

  test('outside a git repo: the index guard refuses (n/a), the worktree guard lets fixes proceed', () => {
    const { root, home } = makeDoctorProject({ git: false });
    const idx = dg.indexChangeGuard(root, { env: gitEnv(home) });
    assert.equal(idx.ok, false);
    assert.match(idx.reason, /not a git repo/);
    assert.equal(dg.worktreeGuard(root, ['.planning'], { env: gitEnv(home) }).ok, true);
  });
});

describe('doctor-git: exclude = the doctor\'s own earlier changes (test 3a)', () => {
  function ownChangesFixture() {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({
      home,
      tracked: ['.planning/.progress-guard.json'],
      gitignore: 'node_modules/\n',
    });
    // What the legacy fix leaves behind: a staged removal and an edited .gitignore.
    git(root, home, 'rm', '-q', '--cached', '--', '.planning/.progress-guard.json');
    append(root, '.gitignore', '.planning/.progress-guard.json\n');
    return { root, home };
  }

  test('staged removal + modified .gitignore, both excluded → both guards ok', () => {
    const { root, home } = ownChangesFixture();
    const exclude = new Set(['.planning/.progress-guard.json', '.gitignore']);
    assert.deepEqual(dg.indexChangeGuard(root, { env: gitEnv(home), exclude }), { ok: true });
    assert.deepEqual(dg.worktreeGuard(root, ['.planning', 'CLAUDE.md', '.gitignore'], { env: gitEnv(home), exclude }),
      { ok: true });
  });

  test('without exclude the same state is refused', () => {
    const { root, home } = ownChangesFixture();
    assert.equal(dg.indexChangeGuard(root, { env: gitEnv(home) }).ok, false);
    assert.equal(dg.worktreeGuard(root, ['.planning', '.gitignore'], { env: gitEnv(home) }).ok, false);
  });

  test('one extra foreign staged path → refused, naming only the foreign path', () => {
    const { root, home } = ownChangesFixture();
    write(root, 'src/foreign.txt', 'user work\n');
    git(root, home, 'add', '--', 'src/foreign.txt');
    const exclude = new Set(['.planning/.progress-guard.json', '.gitignore']);
    const g = dg.indexChangeGuard(root, { env: gitEnv(home), exclude });
    assert.deepEqual(g, { ok: false, reason: 'staged changes present: src/foreign.txt' });
  });

  test('worktreeGuard names only the foreign dirty path', () => {
    const { root, home } = ownChangesFixture();
    append(root, '.planning/ROADMAP.md', '\nUser edit.\n');
    const exclude = new Set(['.planning/.progress-guard.json', '.gitignore']);
    const g = dg.worktreeGuard(root, ['.planning', '.gitignore'], { env: gitEnv(home), exclude });
    assert.equal(g.ok, false);
    assert.match(g.reason, /\.planning\/ROADMAP\.md/);
    assert.doesNotMatch(g.reason, /progress-guard|\.gitignore/);
  });

  test('exclude may also be an array or a predicate', () => {
    const { root, home } = ownChangesFixture();
    assert.equal(dg.indexChangeGuard(root, {
      env: gitEnv(home), exclude: ['.planning/.progress-guard.json', '.gitignore'],
    }).ok, true);
    assert.equal(dg.indexChangeGuard(root, {
      env: gitEnv(home), exclude: (rel) => rel === '.gitignore' || rel.endsWith('.progress-guard.json'),
    }).ok, true);
  });
});

describe('doctor-git: lsFiles / rmCached', () => {
  test('lsFiles lists tracked or untracked matches of glob pathspecs at any depth', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({ home, tracked: ['.planning/.autonomous-resume-10'] });
    write(root, 'flutter/.planning/.autonomous-retry-agent1', 'x\n');
    const specs = [':(glob)**/.planning/.autonomous-retry-*', ':(glob)**/.planning/.autonomous-resume-*'];
    assert.deepEqual(dg.lsFiles(root, specs, { env: gitEnv(home) }), ['.planning/.autonomous-resume-10']);
    assert.deepEqual(dg.lsFiles(root, specs, { env: gitEnv(home), others: true }),
      ['flutter/.planning/.autonomous-retry-agent1']);
  });

  test('rmCached drops index entries only; the working file stays', () => {
    const home = makeDoctorHome();
    const { root } = makeTrackedRuntimeStateProject({ home, tracked: ['.planning/.autonomous-resume-10'] });
    dg.rmCached(root, ['.planning/.autonomous-resume-10'], { env: gitEnv(home) });
    assert.equal(git(root, home, 'ls-files', '--', '.planning/.autonomous-resume-10'), '');
    assert.equal(fs.existsSync(path.join(root, '.planning/.autonomous-resume-10')), true);
    assert.deepEqual(dg.stagedPaths(root, { env: gitEnv(home) }), ['.planning/.autonomous-resume-10']);
  });
});

describe('doctor-git: checkIgnored (69-02, test 17)', () => {
  const MARKER = '.planning/.skill-active';

  test('a repository .gitignore rule is reported, and only the ignored paths are', () => {
    const { root, home } = makeDoctorProject();
    commitGitignore(root, home, `${MARKER}\n`);
    const ignored = dg.checkIgnored(root, [MARKER, '.planning/STATE.md'], { env: gitEnv(home) });
    assert.ok(ignored instanceof Set);
    assert.deepEqual([...ignored], [MARKER]);
  });

  test('a rule that exists only in the user global excludes file is NOT reported', () => {
    const { root, home } = makeDoctorProject();
    const excludes = path.join(home, 'global-excludes');
    fs.writeFileSync(excludes, `${MARKER}\n`, 'utf-8');
    fs.writeFileSync(path.join(home, '.gitconfig'), `[core]\n\texcludesFile = ${excludes}\n`, 'utf-8');
    // Control: with the global file honoured, git itself does ignore the marker.
    const control = spawnSync('git', ['-C', root, 'check-ignore', '--no-index', '-q', '--', MARKER], {
      env: gitEnv(home), stdio: 'ignore',
    });
    assert.equal(control.status, 0, 'the fixture really does ignore the marker through the global excludes file');
    assert.equal(dg.checkIgnored(root, [MARKER], { env: gitEnv(home) }).size, 0);
  });

  test('nothing matching gives an empty set and does not throw', () => {
    const { root, home } = makeDoctorProject();
    assert.equal(dg.checkIgnored(root, [MARKER], { env: gitEnv(home) }).size, 0);
    assert.equal(dg.checkIgnored(root, [], { env: gitEnv(home) }).size, 0);
  });
});
