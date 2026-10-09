'use strict';

/**
 * commit-staged-removal.test.cjs — TRD 44-06 test list items 2-4.
 *
 * `aof-tools commit --files <paths>` commits with a pathspec (`git commit -m msg -- <paths>`). For
 * that `--only` form git re-stages every listed path from the WORKING TREE, so a file that was
 * just `git rm --cached` (migration 0008) but still exists on disk is silently re-tracked. These
 * tests pin the staged-removal path:
 *
 *   2. the removal is committed: HEAD no longer tracks the file, the working copy survives;
 *   3. with unrelated paths already staged it REFUSES (exit 1) instead of sweeping them in;
 *   4. an ordinary pathspec commit, and an ordinary `git rm` (file gone from disk), behave
 *      exactly as before — foreign staged work stays staged and out of the commit.
 *
 * no_llm_test_data: projects come from makeTrackedRuntimeStateProject (upgrade-fixtures.cjs) —
 * disposable temp repos, local identity, signing off, fake HOME via gitEnv(home). aof-tools is
 * spawned with `--cwd <fixture>`; nothing runs against this repository.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const m0008 = require('./migrations/0008-runtime-state-untrack.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const GUARD = '.aoforge/.progress-guard.json';
const GITIGNORE = '.gitignore';
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function project(opts) {
  const p = fx.makeTrackedRuntimeStateProject(opts);
  cleanup.push(p.root, p.home);
  return p;
}

function git({ root, home }, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: fx.gitEnv(home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function dfCommit({ root, home }, message, files) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', root, 'commit', message, '--files', ...files], {
    cwd: root, env: fx.gitEnv(home), encoding: 'utf-8',
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

/** 0008 applied directly: guard file ignored and `rm --cached`, still on disk. */
function afterMigration(p) {
  m0008.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: '2.12.0', dryRun: false, options: {} });
  assert.equal(git(p, 'ls-files', '--', GUARD), '', 'precondition: 0008 removed the guard from the index');
  assert.ok(fs.existsSync(path.join(p.root, GUARD)), 'precondition: working copy still on disk');
}

function headFiles(p) {
  return lines(git(p, 'ls-tree', '-r', '--name-only', 'HEAD'));
}

function lastCommitFiles(p) {
  return lines(git(p, 'show', '--name-only', '--no-renames', '--format=', 'HEAD')).sort();
}

describe('aof-tools commit: staged removals of ignored files (TRD 44-06)', () => {
  test('2. after 0008, commit --files .gitignore <guard> records the removal; working copy survives', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    const guardBytes = fs.readFileSync(path.join(p.root, GUARD), 'utf-8');
    afterMigration(p);

    const r = dfCommit(p, 'chore: x', [GITIGNORE, GUARD]);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.equal(r.json && r.json.committed, true, r.out);

    const tree = headFiles(p);
    assert.ok(!tree.includes(GUARD), 'HEAD no longer tracks the guard file');
    assert.ok(tree.includes(GITIGNORE), '.gitignore is committed');
    assert.deepEqual(lastCommitFiles(p), [GITIGNORE, GUARD].sort(), 'the commit is exactly the two paths');
    assert.equal(fs.readFileSync(path.join(p.root, GUARD), 'utf-8'), guardBytes, 'working copy kept');
    assert.equal(git(p, 'status', '--porcelain'), '', 'nothing left dirty or staged');
  });

  test('2b. a hook rewrote the guard file after 0008 -> still committed as a deletion, never as content', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    afterMigration(p);
    fs.writeFileSync(path.join(p.root, GUARD), '{\n  "count": 42\n}\n');

    const r = dfCommit(p, 'chore: x', [GITIGNORE, GUARD, '.aoforge/config.json']);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.equal(r.json && r.json.committed, true, r.out);
    assert.ok(!headFiles(p).includes(GUARD));
    assert.equal(git(p, 'ls-files', '--', GUARD), '', 'not re-added to the index');
  });

  test('3. an unrelated staged file -> exit 1, staged_removal_with_foreign_index, HEAD unchanged, file still staged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    afterMigration(p);
    fs.mkdirSync(path.join(p.root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(p.root, 'src', 'other.js'), 'module.exports = 1;\n');
    git(p, 'add', '--', 'src/other.js');
    const headBefore = git(p, 'rev-parse', 'HEAD');

    const r = dfCommit(p, 'chore: x', [GITIGNORE, GUARD]);
    assert.equal(r.status, 1, `exit 1 (out: ${r.out})`);
    assert.equal(r.json && r.json.committed, false);
    assert.equal(r.json.reason, 'staged_removal_with_foreign_index');
    assert.ok(Array.isArray(r.json.staged) && r.json.staged.includes('src/other.js'), JSON.stringify(r.json));
    assert.equal(typeof r.json.error, 'string');
    assert.equal(git(p, 'rev-parse', 'HEAD'), headBefore, 'HEAD unchanged');
    assert.ok(lines(git(p, 'diff', '--cached', '--name-only')).includes('src/other.js'), 'src/other.js still staged');
  });

  test('4. regression: a normal pathspec commit of modified tracked files is unchanged; foreign staged work stays out', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [] });
    fs.appendFileSync(path.join(p.root, '.aoforge', 'STATE.md'), '\n- extra line\n');
    fs.appendFileSync(path.join(p.root, '.aoforge', 'ROADMAP.md'), '\n### Objective 3: Gamma\n');
    fs.writeFileSync(path.join(p.root, 'notes.txt'), 'mine\n');
    git(p, 'add', '--', 'notes.txt');

    const r = dfCommit(p, 'docs: update', ['.aoforge/STATE.md', '.aoforge/ROADMAP.md']);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.json && r.json.committed, true, r.out);
    assert.deepEqual(lastCommitFiles(p), ['.aoforge/ROADMAP.md', '.aoforge/STATE.md']);
    assert.equal(git(p, 'diff', '--cached', '--name-only'), 'notes.txt', 'notes.txt still staged, not committed');
  });

  test('4b. regression: a plain git rm (file gone from disk) still commits by pathspec beside foreign staged work', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [] });
    git(p, 'rm', '-q', '--', '.aoforge/ROADMAP.md');
    fs.writeFileSync(path.join(p.root, 'notes.txt'), 'mine\n');
    git(p, 'add', '--', 'notes.txt');

    const r = dfCommit(p, 'docs: drop roadmap', ['.aoforge/ROADMAP.md']);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.json && r.json.committed, true, r.out);
    assert.deepEqual(lastCommitFiles(p), ['.aoforge/ROADMAP.md']);
    assert.ok(!headFiles(p).includes('.aoforge/ROADMAP.md'));
    assert.equal(git(p, 'diff', '--cached', '--name-only'), 'notes.txt', 'notes.txt still staged');
  });

  test('4c. regression: the first commit on an unborn branch still works', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const home = fx.makeFakeHome();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-commit-unborn-'));
    cleanup.push(root, home);
    const p = { root, home };
    git(p, 'init', '-q', '-b', 'main');
    git(p, 'config', 'user.name', 'AOForge Fixture');
    git(p, 'config', 'user.email', 'fixture@aoforge.invalid');
    git(p, 'config', 'commit.gpgsign', 'false');
    fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aoforge', 'config.json'), '{"commit_docs":true}\n');
    fs.writeFileSync(path.join(root, '.aoforge', 'NOTES.md'), 'first\n');

    const r = dfCommit(p, 'docs: first', ['.aoforge/config.json', '.aoforge/NOTES.md']);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.json && r.json.committed, true, r.out);
    assert.deepEqual(headFiles(p).sort(), ['.aoforge/NOTES.md', '.aoforge/config.json']);
  });
});
