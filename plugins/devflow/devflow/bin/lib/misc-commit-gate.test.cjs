'use strict';

/**
 * misc-commit-gate.test.cjs — TRD 50-06 tests 1-9 (GEN-01): `df-tools commit` enforces the objective branch in store mode.
 *
 *   1    store mode on the default branch → exit 1, `reason: default_branch`, nothing staged, HEAD unchanged
 *   2    store mode on a branch no `prs` entry names → `unlinked_branch` (and a detached HEAD → `detached_head`)
 *   3    store mode on the linked branch → committed
 *   4    a `df/exec-*` worktree whose main checkout is on the linked branch → committed; refused when it is not
 *   5    DEVFLOW_SKIP_GH_GATE=1 → the refused commit lands, `gate_escaped: true`, and the MAIN checkout's
 *        `.override-log.jsonl` gains a `gate: gh` entry; an allowed commit is never marked escaped
 *   6    on a linked branch an unscoped message still gets `Refs #<objective issue>`; a scoped one is unchanged
 *   7    local mode (`github.store` false): result keys and message bytes are today's, with no gh call and no
 *        gate module even loaded
 *   8    every requested path ignored → still `skipped_gitignored`, exit 0 (the gate is not reached)
 *   9    a merge or rebase in progress skips the gate (the `merge_in_progress` refusal owns that case)
 *
 * no_llm_test_data: every repo is a disposable `git init -b main` under the OS temp dir with a fake HOME (gitEnv). The
 * default branch resolves through the `main` fallback, so no remote exists. A `gh` shim first on PATH records every call
 * and fails; no test may leave a line in it. df-tools runs as a child process with `--cwd`, and DEVFLOW_ALLOW_RAW_COMMIT,
 * DEVFLOW_SKIP_GH_GATE and its reason variable start unset. Nothing touches this repository, the real ~/.claude, the
 * network or any port.
 */

const { describe, test, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const gm = require('./gh-mapping.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
const SRC = 'src/keep.cjs';
const LINKED = '50-enforce';

const U1_BLOCK = [
  '# >>> devflow store (0010) >>>',
  '.planning/*',
  '!.planning/config.json',
  '!.planning/STACK.md',
  '# <<< devflow store (0010) <<<',
  '',
].join('\n');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A preload that records every require of a gate or trailer module, so "local mode never loads it" is observable.
let preloadDir = null;
before(() => {
  preloadDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-gate-preload-')));
  fs.writeFileSync(path.join(preloadDir, 'preload.cjs'), [
    "const Module = require('module');",
    "const fs = require('fs');",
    'const load = Module._load;',
    'Module._load = function (request, ...rest) {',
    '  if (process.env.DF_REQ_LOG && /(gh-gate|commit-trailer|override)(\\.cjs)?$/.test(request)) {',
    "    fs.appendFileSync(process.env.DF_REQ_LOG, request + '\\n');",
    '  }',
    '  return load.call(this, request, ...rest);',
    '};',
    '',
  ].join('\n'));
});
after(() => {
  if (preloadDir) fs.rmSync(preloadDir, { recursive: true, force: true });
});

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function git(p, ...args) {
  return execFileSync('git', ['-C', p.root, ...args], {
    env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitAt(p, dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], {
    env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * A git repo on `main` shaped like a store-mode project: config.json (tracked) turns on `github.enabled` and
 * `github.store` (`store`), `.gitignore` carries the U-1 block, and the v3 mapping — written AFTER the init commit, so it
 * is untracked and a linked worktree never sees it — holds objective 50 (issue 500), TRD 50-02 (issue 502) and the PR
 * entry that links branch `50-enforce` to objective 50.
 */
function storeRepo({ store = true } = {}) {
  const home = fx.makeFakeHome();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-misc-gate-')));
  const shim = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-gate-shim-')));
  cleanup.push(root, home, shim);
  const ghLog = path.join(shim, 'gh-calls.log');
  fs.writeFileSync(path.join(shim, 'gh'), `#!/bin/sh\necho "$@" >> "${ghLog}"\nexit 1\n`, { mode: 0o755 });

  write(root, SRC, 'module.exports = 0;\n');
  write(root, '.planning/config.json', `${JSON.stringify({ commit_docs: true, github: { enabled: true, store } })}\n`);
  write(root, '.gitignore', U1_BLOCK);
  fx.initGitFixture(root, home);

  const m = gm.emptyMapping();
  gm.setEntry(m, '50', { issue_id: 500 });
  gm.setTrd(m, '50-02', { issue_number: 502, rest_id: 9502 });
  gm.setPr(m, '50', { branch: LINKED });
  const w = gm.writeMappingV3(root, m);
  assert.equal(w.ok, true, w.error);
  return { root, home, shim, ghLog };
}

/** `df-tools --cwd <dir> commit <args...>` with a clean gate environment plus `env`. */
function dfRun(p, args, { dir = p.root, env = {} } = {}) {
  const base = { ...fx.gitEnv(p.home), PATH: `${p.shim}${path.delimiter}${process.env.PATH}` };
  for (const key of ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_GH_GATE', 'DEVFLOW_SKIP_GH_GATE_REASON']) delete base[key];
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', dir, 'commit', ...args], {
    cwd: dir, env: { ...base, ...env }, encoding: 'utf-8',
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* raw */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

function dfCommit(p, message, files, opts) {
  return dfRun(p, [message, '--files', ...files], opts);
}

function head(p, dir = p.root) {
  return gitAt(p, dir, 'rev-parse', 'HEAD');
}

function staged(p, dir = p.root) {
  return gitAt(p, dir, 'diff', '--cached', '--name-only');
}

function headMessage(p, dir = p.root) {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%B'], {
    env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\n+$/, '');
}

function ghCalls(p) {
  return fs.existsSync(p.ghLog) ? fs.readFileSync(p.ghLog, 'utf-8').split('\n').filter(Boolean) : [];
}

function addWorktree(p, name, branch) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-misc-gate-wt-')));
  cleanup.push(parent);
  const wt = path.join(parent, name);
  git(p, 'worktree', 'add', '-q', '-b', branch, wt);
  return wt;
}

function overrideLog(root) {
  const file = path.join(root, '.planning', '.override-log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Assert a refused commit left no trace: exit 1, not committed, nothing staged, HEAD and the working change intact. */
function assertRefused(p, r, before, reason) {
  assert.equal(r.status, 1, `${r.out} ${r.err}`);
  assert.equal(r.json.committed, false, r.out);
  assert.equal(r.json.hash, null);
  assert.equal(r.json.reason, reason, r.out);
  assert.equal(typeof r.json.error, 'string');
  assert.equal(staged(p), '', 'a refused commit stages nothing');
  assert.equal(head(p), before, 'HEAD is unchanged');
  assert.equal(git(p, 'status', '--porcelain', '--', SRC), ` M ${SRC}`, 'the change is still an unstaged edit');
}

describe('50-06 the default and unlinked branches (tests 1-3)', () => {
  test('1a. store mode on the default branch → exit 1, default_branch, nothing staged, HEAD unchanged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 1;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): x', [SRC]);
    assertRefused(p, r, before, 'default_branch');
    assert.equal(r.json.branch, 'main');
    assert.match(r.json.error, /default branch/);
    assert.deepEqual(ghCalls(p), [], 'the gate is offline');
  });

  test('1b. --raw prints the reason and still exits 1', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 2;\n');

    const r = dfRun(p, ['feat(50-02): x', '--files', SRC, '--raw']);
    assert.equal(r.status, 1);
    assert.equal(r.out, 'default_branch');
    assert.equal(staged(p), '');
  });

  test('1c. --amend is gated like any commit', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 3;\n');
    const before = head(p);

    const r = dfRun(p, ['ignored by amend', '--amend', '--files', SRC]);
    assertRefused(p, r, before, 'default_branch');
    assert.equal(gitAt(p, p.root, 'rev-list', '--count', 'HEAD'), '1', 'the init commit was not rewritten');
  });

  test('2a. store mode on a branch no prs entry names → unlinked_branch, nothing staged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', 'feat/x');
    write(p.root, SRC, 'module.exports = 4;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): x', [SRC]);
    assertRefused(p, r, before, 'unlinked_branch');
    assert.equal(r.json.branch, 'feat/x');
    assert.match(r.json.error, /gh pr start/);
  });

  test('2b. a detached HEAD → detached_head with a null branch', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '--detach');
    write(p.root, SRC, 'module.exports = 5;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): x', [SRC]);
    assertRefused(p, r, before, 'detached_head');
    assert.equal(r.json.branch, null);
  });

  test('3. store mode on the linked branch → committed, exactly the requested path', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 6;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): add the thing', [SRC]);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.reason, 'committed');
    assert.ok(!('gate_escaped' in r.json), 'an allowed commit is not an escape');
    assert.notEqual(head(p), before);
    assert.equal(gitAt(p, p.root, 'show', '--name-only', '--no-renames', '--format=', 'HEAD'), SRC);
    assert.deepEqual(ghCalls(p), [], 'the gate is offline');
    assert.deepEqual(overrideLog(p.root), [], 'no override is logged for an allowed commit');
  });
});

describe('50-06 executor worktrees (test 4)', () => {
  test('4a. a df/exec-* worktree whose main checkout is on the linked branch → committed', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    const wt = addWorktree(p, 'exec-50-03', 'df/exec-50-03');
    assert.ok(!fs.existsSync(path.join(wt, '.planning', '.gh-mapping.json')), 'the worktree holds no mapping of its own');
    write(wt, SRC, 'module.exports = 7;\n');

    const r = dfCommit(p, 'feat(50-02): from the worktree', [SRC], { dir: wt });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(gitAt(p, wt, 'show', '--name-only', '--no-renames', '--format=', 'HEAD'), SRC);
    assert.deepEqual(ghCalls(p), []);
  });

  test('4b. the same worktree is refused when the main checkout is not on a linked branch', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    const wt = addWorktree(p, 'exec-50-03', 'df/exec-50-03');
    write(wt, SRC, 'module.exports = 8;\n');
    const before = head(p, wt);

    const r = dfCommit(p, 'feat(50-02): from the worktree', [SRC], { dir: wt });
    assert.equal(r.status, 1, `${r.out} ${r.err}`);
    assert.equal(r.json.reason, 'unlinked_branch', r.out);
    assert.equal(r.json.branch, 'df/exec-50-03');
    assert.match(r.json.error, /main/);
    assert.equal(staged(p, wt), '');
    assert.equal(head(p, wt), before);
  });
});

describe('50-06 the logged escape (test 5)', () => {
  test('5a. DEVFLOW_SKIP_GH_GATE=1 on the default branch → the commit lands, gate_escaped, a gate:gh log entry', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 9;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): escaped', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.gate_escaped, true);
    assert.ok(!('gate_log_error' in r.json));
    assert.notEqual(head(p), before);

    const log = overrideLog(p.root);
    assert.equal(log.length, 1);
    assert.equal(log[0].gate, 'gh');
    assert.match(log[0].reason, /DEVFLOW_SKIP_GH_GATE=1/);
    assert.match(log[0].reason, /default_branch/);
    assert.match(log[0].reason, /main/);
    assert.ok(log[0].at);
    assert.deepEqual(ghCalls(p), []);
  });

  test('5b. DEVFLOW_SKIP_GH_GATE_REASON becomes the logged reason', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 10;\n');

    const r = dfCommit(p, 'feat(50-02): escaped', [SRC], {
      env: { DEVFLOW_SKIP_GH_GATE: '1', DEVFLOW_SKIP_GH_GATE_REASON: 'hotfix while the objective PR is blocked' },
    });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.gate_escaped, true);
    const log = overrideLog(p.root);
    assert.equal(log.length, 1);
    assert.equal(log[0].reason, 'hotfix while the objective PR is blocked');
  });

  test('5c. from a worktree the entry goes to the MAIN checkout\'s log, never the worktree\'s', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    const wt = addWorktree(p, 'exec-50-03', 'df/exec-50-03');
    write(wt, SRC, 'module.exports = 11;\n');

    const r = dfCommit(p, 'feat(50-02): escaped from a worktree', [SRC], { dir: wt, env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.gate_escaped, true);
    assert.equal(overrideLog(p.root).length, 1, 'the main checkout holds the entry');
    assert.deepEqual(overrideLog(wt), [], 'the worktree holds none');
    assert.match(overrideLog(p.root)[0].reason, /unlinked_branch/);
  });

  test('5d. a log failure does not block the escaped commit: gate_log_error says why', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    fs.mkdirSync(path.join(p.root, '.planning', '.override-log.jsonl'));
    write(p.root, SRC, 'module.exports = 12;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): escaped', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.gate_escaped, true);
    assert.equal(typeof r.json.gate_log_error, 'string');
    assert.ok(r.json.gate_log_error.length > 0);
    assert.notEqual(head(p), before);
  });

  test('5e. only the string "1" escapes', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 13;\n');
    const before = head(p);

    const r = dfCommit(p, 'feat(50-02): x', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: 'true' } });
    assertRefused(p, r, before, 'default_branch');
    assert.deepEqual(overrideLog(p.root), []);
  });

  test('5f. the escape on a linked branch is not an escape: no flag, no log entry', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 14;\n');

    const r = dfCommit(p, 'feat(50-02): x', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true);
    assert.ok(!('gate_escaped' in r.json));
    assert.deepEqual(overrideLog(p.root), []);
  });

  test('5g. an escaped commit that has nothing to commit logs no override', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();

    const r = dfCommit(p, 'feat(50-02): nothing', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, false);
    assert.equal(r.json.reason, 'nothing_to_commit');
    assert.deepEqual(overrideLog(p.root), [], 'nothing was overridden, so nothing is logged');
  });
});

describe('50-06 the Refs fallback on a linked branch (test 6)', () => {
  test('6a. an unscoped message gets Refs #<objective issue>', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 15;\n');

    const r = dfCommit(p, 'wip: notes', [SRC]);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.refs, 500);
    assert.equal(headMessage(p), 'wip: notes\n\nRefs #500');
  });

  test('6b. a TRD-scoped message keeps its TRD issue (the 49-07 behaviour)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 16;\n');

    const r = dfCommit(p, 'feat(50-02): x', [SRC]);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.refs, 502);
    assert.equal(headMessage(p), 'feat(50-02): x\n\nRefs #502');
  });

  test('6c. an executor worktree\'s unscoped message references the inherited objective', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    const wt = addWorktree(p, 'exec-50-03', 'df/exec-50-03');
    write(wt, SRC, 'module.exports = 17;\n');

    const r = dfCommit(p, 'wip: notes', [SRC], { dir: wt });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.refs, 500);
    assert.equal(headMessage(p, wt), 'wip: notes\n\nRefs #500');
  });

  test('6d. an escaped commit has no linked objective, so an unscoped message stays bare', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, SRC, 'module.exports = 18;\n');

    const r = dfCommit(p, 'wip: notes', [SRC], { env: { DEVFLOW_SKIP_GH_GATE: '1' } });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.refs, null);
    assert.equal(r.json.refs_reason, 'no scope');
    assert.equal(headMessage(p), 'wip: notes');
  });
});

describe('50-06 local mode parity (test 7)', () => {
  test('7a. github.store false: today\'s keys and message bytes, no gh call, no gate module loaded', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo({ store: false });
    write(p.root, SRC, 'module.exports = 19;\n');
    const reqLog = path.join(p.shim, 'requires.log');

    const r = dfCommit(p, 'wip: notes', [SRC], {
      env: { NODE_OPTIONS: `--require ${path.join(preloadDir, 'preload.cjs')}`, DF_REQ_LOG: reqLog },
    });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(r.json.committed, true);
    assert.equal(headMessage(p), 'wip: notes');
    assert.deepEqual(ghCalls(p), [], 'a throwing gh seam is never hit');
    assert.ok(!fs.existsSync(reqLog), 'local mode loads neither the gate, the trailer nor the override module');
  });

  test('7b. positive control: store mode on a linked branch does load them', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', LINKED);
    write(p.root, SRC, 'module.exports = 20;\n');
    const reqLog = path.join(p.shim, 'requires.log');

    const r = dfCommit(p, 'wip: notes', [SRC], {
      env: { NODE_OPTIONS: `--require ${path.join(preloadDir, 'preload.cjs')}`, DF_REQ_LOG: reqLog },
    });
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.ok(fs.existsSync(reqLog), 'the preload observes requires');
    assert.match(fs.readFileSync(reqLog, 'utf-8'), /gh-gate/);
  });

  test('7c. no github block at all: a commit on main lands exactly as before', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, '.planning/config.json', `${JSON.stringify({ commit_docs: true })}\n`);
    git(p, 'add', '.planning/config.json');
    git(p, 'commit', '-q', '-m', 'chore: drop the github block');
    write(p.root, SRC, 'module.exports = 21;\n');

    const r = dfCommit(p, 'wip: notes', [SRC]);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.deepEqual(Object.keys(r.json).sort(), ['committed', 'hash', 'reason']);
    assert.equal(headMessage(p), 'wip: notes');
  });
});

describe('50-06 the gate sits after the planning filter and before git add (tests 8-9)', () => {
  test('8a. every requested path ignored → skipped_gitignored, exit 0, gate not reached', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, '.planning/STATE.md', '# State\n');
    const before = head(p);

    const r = dfCommit(p, 'docs: state', ['.planning/STATE.md']);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.deepEqual(r.json, { committed: false, hash: null, reason: 'skipped_gitignored' });
    assert.equal(head(p), before);
  });

  test('8b. an ignored planning path next to code still reaches the gate for the code', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    write(p.root, '.planning/STATE.md', '# State\n');
    write(p.root, SRC, 'module.exports = 22;\n');
    const before = head(p);

    const r = dfCommit(p, 'docs: state and code', ['.planning/STATE.md', SRC]);
    assertRefused(p, r, before, 'default_branch');
  });

  test('9a. a merge in progress on the default branch skips the gate: merge_in_progress owns it', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    git(p, 'checkout', '-q', '-b', 'side');
    write(p.root, 'side.txt', 'side\n');
    git(p, 'add', 'side.txt');
    git(p, 'commit', '-q', '-m', 'side work');
    git(p, 'checkout', '-q', 'main');
    git(p, 'merge', '--no-commit', '--no-ff', 'side');
    assert.ok(fs.existsSync(path.join(p.root, '.git', 'MERGE_HEAD')), 'fixture: a merge is in progress');
    write(p.root, SRC, 'module.exports = 23;\n');

    const r = dfCommit(p, 'feat(50-02): resolve', [SRC]);
    assert.equal(r.status, 1, `${r.out} ${r.err}`);
    assert.equal(r.json.reason, 'merge_in_progress', r.out);
    assert.deepEqual(overrideLog(p.root), []);
  });

  test('9b. a rebase in progress on the default branch skips the gate too', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = storeRepo();
    fs.mkdirSync(path.join(p.root, '.git', 'rebase-merge'));
    write(p.root, SRC, 'module.exports = 24;\n');

    const r = dfCommit(p, 'feat(50-02): continue', [SRC]);
    assert.notEqual(r.json && r.json.reason, 'default_branch', r.out);
    assert.notEqual(r.json && r.json.reason, 'unlinked_branch', r.out);
    assert.equal(r.status, 0, `${r.out} ${r.err}`);
    assert.equal(r.json.committed, true, r.out);
  });
});
