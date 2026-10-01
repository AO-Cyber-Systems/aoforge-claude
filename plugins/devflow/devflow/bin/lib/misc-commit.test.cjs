'use strict';

/**
 * misc-commit.test.cjs — TRD 48-10 tests 1-7 (D-20): `df-tools commit` in a partially ignored `.planning/`.
 *
 * Store mode gitignores `.planning/*` except config.json and STACK.md (U-1, migration 0010). The old gate probed
 * only the WHOLE `.planning` directory, so a requested TRD path under the new layout fell through to `git add`
 * (refused: ignored) and to a pathspec commit that git rejects ("did not match any file(s) known to git").
 *
 *   1-4  characterization of today's results: planning only, planning + code, `.planning` wholly ignored,
 *        `commit_docs: false`. These pin the result keys and the committed file set.
 *   5-6  the U-1 block: an ignored planning path git knows nothing about is reported in `skipped_planning` and
 *        not staged; config.json and code still commit; only ignored paths → `skipped_gitignored`.
 *   7    store-off parity: no block → a planning path commits exactly as today, with no `skipped_planning` key.
 *   7b-d parity for ignored paths git DOES know about: a tracked ignored file still commits, and a staged removal
 *        of a now-ignored path (migration 0008's and 0010's follow-up commit) is still recorded (TRD 44-06).
 *
 * no_llm_test_data: every repo is a disposable `git init` under the OS temp dir with a fake HOME (gitEnv), local
 * identity and signing off. df-tools is spawned with `--cwd <fixture>`; nothing runs against this repository, the
 * real ~/.claude, the network or any port.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const U1_BLOCK = [
  '# >>> devflow store (0010) >>>',
  '.planning/*',
  '!.planning/config.json',
  '!.planning/STACK.md',
  '# <<< devflow store (0010) <<<',
  '',
].join('\n');
const TRD = '.planning/objectives/07-x/07-01-a-TRD.md';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function git({ root, home }, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: fx.gitEnv(home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

/**
 * A git repo whose first commit holds `files` (rel -> content). `gitignore` (string) is committed with it.
 * config.json defaults to commit_docs:true.
 */
function repo({ files = {}, gitignore = null, commitDocs = true } = {}) {
  const home = fx.makeFakeHome();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-misc-commit-')));
  cleanup.push(root, home);
  const all = { 'src/keep.cjs': 'module.exports = 0;\n', ...files };
  if (commitDocs !== null) all['.planning/config.json'] = `${JSON.stringify({ commit_docs: commitDocs })}\n`;
  if (gitignore !== null) all['.gitignore'] = gitignore;
  for (const [rel, content] of Object.entries(all)) write(root, rel, content);
  fx.initGitFixture(root, home);
  return { root, home };
}

function dfCommit({ root, home }, message, files, { raw = false } = {}) {
  const args = [TOOLS_PATH, '--cwd', root, 'commit', message, '--files', ...files, ...(raw ? ['--raw'] : [])];
  const r = spawnSync(process.execPath, args, { cwd: root, env: fx.gitEnv(home), encoding: 'utf-8' });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* raw or not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

function head(p) {
  return git(p, 'rev-parse', 'HEAD');
}

function lastCommitFiles(p) {
  return lines(git(p, 'show', '--name-only', '--no-renames', '--format=', 'HEAD')).sort();
}

function headFiles(p) {
  return lines(git(p, 'ls-tree', '-r', '--name-only', 'HEAD'));
}

describe('df-tools commit: characterization (tests 1-4)', () => {
  test('1. (a) planning-only commit → committed, exactly the planning path, keys {committed, hash, reason}', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo();
    write(p.root, '.planning/STATE.md', '# State\n');

    const r = dfCommit(p, 'docs: state', ['.planning/STATE.md']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(r.json.committed, true);
    assert.equal(r.json.reason, 'committed');
    assert.deepEqual(lastCommitFiles(p), ['.planning/STATE.md']);
  });

  test('2. (b) planning + code → both committed, no skipped_planning key', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo();
    write(p.root, '.planning/STATE.md', '# State\n');
    write(p.root, 'src/a.cjs', 'module.exports = 1;\n');

    const r = dfCommit(p, 'docs: both', ['.planning/STATE.md', 'src/a.cjs']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(r.json.committed, true);
    assert.deepEqual(lastCommitFiles(p), ['.planning/STATE.md', 'src/a.cjs']);
  });

  test('3. (c) .planning wholly ignored → planning dropped into skipped_planning; planning only → skipped_gitignored', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ commitDocs: null, gitignore: '.planning/\n' });
    write(p.root, '.planning/config.json', '{"commit_docs":true}\n');
    write(p.root, '.planning/STATE.md', '# State\n');
    write(p.root, 'src/a.cjs', 'module.exports = 1;\n');

    const r = dfCommit(p, 'docs: both', ['.planning/STATE.md', 'src/a.cjs']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(r.json, { committed: true, hash: r.json.hash, reason: 'committed', skipped_planning: ['.planning/STATE.md'] });
    assert.deepEqual(lastCommitFiles(p), ['src/a.cjs']);

    const before = head(p);
    const only = dfCommit(p, 'docs: planning only', ['.planning/STATE.md']);
    assert.equal(only.status, 0, only.err);
    assert.deepEqual(only.json, { committed: false, hash: null, reason: 'skipped_gitignored' });
    assert.equal(head(p), before);
    assert.equal(dfCommit(p, 'docs: planning only', ['.planning/STATE.md'], { raw: true }).out, 'skipped');
  });

  test('4. (d) commit_docs:false → planning dropped; planning only → skipped_commit_docs_false', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ commitDocs: false });
    write(p.root, '.planning/STATE.md', '# State\n');
    write(p.root, 'src/a.cjs', 'module.exports = 1;\n');

    const r = dfCommit(p, 'docs: both', ['.planning/STATE.md', 'src/a.cjs']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(r.json, { committed: true, hash: r.json.hash, reason: 'committed', skipped_planning: ['.planning/STATE.md'] });
    assert.deepEqual(lastCommitFiles(p), ['src/a.cjs']);

    const before = head(p);
    const only = dfCommit(p, 'docs: planning only', ['.planning/STATE.md']);
    assert.equal(only.status, 0, only.err);
    assert.deepEqual(only.json, { committed: false, hash: null, reason: 'skipped_commit_docs_false' });
    assert.equal(head(p), before);
  });
});

describe('df-tools commit: per-path ignore filter under the U-1 block (tests 5-6)', () => {
  test('5. ignored TRD + config.json + code → config.json and code commit; the TRD is skipped_planning; exit 0', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ gitignore: U1_BLOCK });
    write(p.root, TRD, '# TRD\n');
    write(p.root, '.planning/config.json', '{"commit_docs":true,"github":{"enabled":true,"store":true}}\n');
    write(p.root, 'src/a.cjs', 'module.exports = 1;\n');

    const r = dfCommit(p, 'docs: x', [TRD, '.planning/config.json', 'src/a.cjs']);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.reason, 'committed');
    assert.deepEqual(r.json.skipped_planning, [TRD]);
    assert.deepEqual(lastCommitFiles(p), ['.planning/config.json', 'src/a.cjs']);
    assert.equal(git(p, 'ls-files', '--', TRD), '', 'the ignored TRD was never staged');
    assert.ok(fs.existsSync(path.join(p.root, TRD)), 'working file untouched');
  });

  test('6. only ignored planning paths → {committed:false, hash:null, reason:skipped_gitignored}, HEAD unchanged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ gitignore: U1_BLOCK });
    write(p.root, TRD, '# TRD\n');
    write(p.root, '.planning/STATE.md', '# State\n');
    const before = head(p);

    const r = dfCommit(p, 'docs: x', [TRD, '.planning/STATE.md']);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.deepEqual(r.json, { committed: false, hash: null, reason: 'skipped_gitignored' });
    assert.equal(head(p), before);
    assert.equal(git(p, 'diff', '--cached', '--name-only'), '', 'nothing staged');
  });

  test('6b. no --files under the U-1 block → only the un-ignored planning files commit', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ gitignore: U1_BLOCK });
    write(p.root, TRD, '# TRD\n');
    write(p.root, '.planning/STACK.md', '# Stack\n');

    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', p.root, 'commit', 'docs: default'], {
      cwd: p.root, env: fx.gitEnv(p.home), encoding: 'utf-8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).committed, true, r.stdout);
    assert.deepEqual(lastCommitFiles(p), ['.planning/STACK.md']);
  });
});

describe('df-tools commit: store-off parity (test 7)', () => {
  test('7. local repo (no block) → a planning path commits as today, with no skipped_planning key', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo();
    write(p.root, TRD, '# TRD\n');
    write(p.root, 'src/a.cjs', 'module.exports = 1;\n');

    const r = dfCommit(p, 'docs: x', [TRD, 'src/a.cjs']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(r.json.committed, true);
    assert.deepEqual(lastCommitFiles(p), [TRD, 'src/a.cjs'].sort());
  });

  test('7b. an ignored file that is still TRACKED commits as today (ignore rules never apply to tracked files)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ files: { '.planning/.progress-guard.json': '{}\n' } });
    write(p.root, '.gitignore', '.planning/.progress-guard.json\n');
    write(p.root, '.planning/.progress-guard.json', '{"count":2}\n');

    const r = dfCommit(p, 'chore: x', ['.planning/.progress-guard.json']);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(r.json.committed, true);
    assert.deepEqual(lastCommitFiles(p), ['.planning/.progress-guard.json']);
  });

  test('7c. 0008 shape: staged removal of a now-ignored runtime file is still recorded (TRD 44-06)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ files: { '.planning/.progress-guard.json': '{}\n' } });
    write(p.root, '.gitignore', '.planning/.progress-guard.json\n');
    git(p, 'rm', '--cached', '--quiet', '--', '.planning/.progress-guard.json');

    const r = dfCommit(p, 'chore: untrack', ['.gitignore', '.planning/.progress-guard.json']);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.deepEqual(lastCommitFiles(p), ['.gitignore', '.planning/.progress-guard.json']);
    assert.ok(!headFiles(p).includes('.planning/.progress-guard.json'));
    assert.ok(fs.existsSync(path.join(p.root, '.planning/.progress-guard.json')), 'working copy kept');
  });

  test('7d. 0010 follow-up: the block + staged removal of a tracked TRD → the removal is committed, the file kept', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = repo({ files: { [TRD]: '# TRD\n' } });
    write(p.root, '.gitignore', U1_BLOCK);
    git(p, 'rm', '--cached', '--quiet', '--', TRD);

    const r = dfCommit(p, 'chore: untrack cache', ['.gitignore', TRD]);
    assert.equal(r.status, 0, `exit 0 (out: ${r.out} err: ${r.err})`);
    assert.equal(r.json.committed, true, r.out);
    assert.ok(!('skipped_planning' in r.json), 'a known-to-git path is never skipped');
    assert.deepEqual(lastCommitFiles(p), ['.gitignore', TRD].sort());
    assert.ok(!headFiles(p).includes(TRD));
    assert.equal(fs.readFileSync(path.join(p.root, TRD), 'utf-8'), '# TRD\n');
    assert.equal(git(p, 'status', '--porcelain'), '', 'nothing left dirty or staged');
  });
});
