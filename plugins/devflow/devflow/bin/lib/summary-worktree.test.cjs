'use strict';

/**
 * summary-worktree.test.cjs — TRD 53-01 tests 1-3, 6 and the local-mode guards: `summary checkpoint|post` run from a linked
 * executor worktree write the checkout that commits them.
 *
 * Why: objective 52 hit this five times. In local mode both verbs resolved the MAIN checkout even inside a worktree, so
 * every parallel executor left an untracked SUMMARY in main, committed its own copy on `df/exec-*`, and `git merge` then
 * refused to overwrite the untracked file.
 *
 *   1  local mode, real git: both verbs write `<wt>/.planning/objectives/<dir>/<NN-MM>-SUMMARY.md` and nothing under
 *      main; `df-tools commit` from the worktree commits it; `git merge --no-ff` into main exits 0, the SUMMARY arrives
 *      tracked and `git status --porcelain` is empty
 *   2  gate-executor-stop finds a SUMMARY that exists only in the worktree (the hook needs no change)
 *   3  store mode (set in MAIN's config): `summary checkpoint` still writes MAIN's `.trd-progress/<trd>.md` and creates
 *      nothing under the worktree's `.planning/` (D-14)
 *   6  an existing `07-01-demo-SUMMARY.md` committed in the worktree is overwritten, no second `07-01-SUMMARY.md`
 *   g  guards that hold before and after the fix: from the main checkout the verbs write main (D-01); a worktree with no
 *      `.planning/` (planning untracked) falls back to main
 *
 * no_llm_test_data: every repo is a disposable `git init -b main` under the OS temp dir with a fake HOME and
 * GIT_CONFIG_GLOBAL=/dev/null. df-tools runs as a child process with `--cwd`. `summary post` is local mode in every test
 * but 3, which covers store mode with `summary checkpoint` only: that verb never reaches `gh`, while a store-mode
 * `summary post` queues a GitHub write. Nothing touches this repository, the real ~/.claude, the network or any port.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const HOOK_PATH = path.join(__dirname, '..', '..', '..', 'hooks', 'gate-executor-stop.js');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const OBJ_DIR = '07-demo';
const SUMMARY_REL = `.planning/objectives/${OBJ_DIR}/07-01-SUMMARY.md`;
const NAMED_SUMMARY_REL = `.planning/objectives/${OBJ_DIR}/07-01-demo-SUMMARY.md`;
const CHECKPOINT_TEXT = '# Summary 07-01\n\n## Progress\n- [x] Task 1: first — (this commit)\n- [ ] Task 2: second — next step: edit a.cjs\n';
const POST_TEXT = '# Summary 07-01\n\n## Progress\n- [x] Task 1: first — abc1234\n- [x] Task 2: second — def5678\n\n## Self-Check: PASSED\n';

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

const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

function envFor(p) {
  const env = { ...fx.gitEnv(p.home), GIT_CONFIG_GLOBAL: '/dev/null' };
  for (const key of ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_GH_GATE', 'DEVFLOW_SKIP_GH_GATE_REASON']) delete env[key];
  return env;
}

function git(p, dir, ...args) {
  return spawnSync('git', ['-C', dir, ...args], { env: envFor(p), encoding: 'utf-8' });
}

function gitOk(p, dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], {
    env: envFor(p), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * A git repo on `main`: config (tracked), ROADMAP and the 07-01 TRD, one init commit. `ignorePlanning` instead ignores
 * `.planning/` so the directory exists on disk in main but is untracked (a linked worktree then has none).
 */
function project({ config = {}, ignorePlanning = false } = {}) {
  const home = fx.makeFakeHome();
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-sum-wt-main-')));
  const holder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-sum-wt-tree-')));
  cleanup.push(main, home, holder);
  write(main, '.planning/config.json', `${JSON.stringify(config)}\n`);
  write(main, '.planning/ROADMAP.md', '# Roadmap\n\n### Objective 7: Demo\n');
  write(main, `.planning/objectives/${OBJ_DIR}/07-01-demo-TRD.md`, '# TRD 07-01\n');
  write(main, 'src/keep.cjs', 'module.exports = 0;\n');
  if (ignorePlanning) write(main, '.gitignore', '.planning/\n');
  fx.initGitFixture(main, home);
  return { main, home, holder };
}

/** `git worktree add -b df/exec-07-01 <holder>/wt`, the way the orchestrator provisions an executor. */
function addWorktree(p) {
  const wt = path.join(p.holder, 'wt');
  gitOk(p, p.main, 'worktree', 'add', '-q', '-b', 'df/exec-07-01', wt);
  return fs.realpathSync(wt);
}

/** `df-tools --cwd <dir> <args...>` with `input` on stdin (`--from -`). */
function df(p, dir, args, input) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', dir, ...args], {
    cwd: dir, env: envFor(p), encoding: 'utf-8', input,
  });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* raw */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

const summaryVerb = (p, dir, sub, text, extra = []) => df(p, dir, ['summary', sub, '07-01', '--from', '-', '--raw', ...extra], text);

describe('summary verbs in a linked worktree, local mode (TRD 53-01)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('1. checkpoint then post write the WORKTREE; main stays clean; the SUMMARY commits and merges with no collision', () => {
    const p = project();
    const wt = addWorktree(p);

    const cp = summaryVerb(p, wt, 'checkpoint', CHECKPOINT_TEXT);
    assert.equal(cp.status, 0, cp.err || cp.out);
    assert.equal(read(wt, SUMMARY_REL), CHECKPOINT_TEXT, 'checkpoint bytes land in the worktree');
    assert.equal(exists(p.main, SUMMARY_REL), false, 'checkpoint left no copy in main');

    const post = summaryVerb(p, wt, 'post', POST_TEXT);
    assert.equal(post.status, 0, post.err || post.out);
    assert.equal(read(wt, SUMMARY_REL), POST_TEXT, 'post bytes land in the worktree');
    assert.equal(exists(p.main, SUMMARY_REL), false, 'post left no copy in main');
    assert.equal(fs.realpathSync(post.json.path), fs.realpathSync(path.join(wt, SUMMARY_REL)), 'the verb reports the worktree path');
    assert.equal(gitOk(p, p.main, 'status', '--porcelain'), '', 'main has nothing untracked before the merge');

    const commit = df(p, wt, ['commit', 'docs(07-01): summary', '--files', SUMMARY_REL]);
    assert.equal(commit.status, 0, commit.err || commit.out);
    assert.equal(commit.json.committed, true, commit.out);

    const merge = git(p, p.main, 'merge', '--no-ff', '-m', 'merge df/exec-07-01', 'df/exec-07-01');
    assert.equal(merge.status, 0, `${merge.stdout}\n${merge.stderr}`);
    assert.match(gitOk(p, p.main, 'ls-files', SUMMARY_REL), /07-01-SUMMARY\.md$/, 'the SUMMARY arrives tracked');
    assert.equal(read(p.main, SUMMARY_REL), POST_TEXT);
    assert.equal(gitOk(p, p.main, 'status', '--porcelain'), '', 'main is clean after the merge');
  });

  test('2. gate-executor-stop finds a SUMMARY that exists only in the worktree', () => {
    const p = project();
    const wt = addWorktree(p);
    const r = summaryVerb(p, wt, 'checkpoint', CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(exists(p.main, SUMMARY_REL), false);

    const hook = require(HOOK_PATH);
    assert.equal(hook.summaryExists('07-01', [p.main]), false, 'main alone does not hold it');
    const roots = hook.candidateRoots({ cwd: p.main, repoRoot: p.main, gitWorktrees: hook.gitWorktrees });
    assert.ok(roots.some((root) => fs.realpathSync(root) === wt), `the worktree is a candidate root: ${roots.join(', ')}`);
    assert.equal(hook.summaryExists('07-01', roots), true, 'the executor-stop gate sees the worktree SUMMARY');
  });

  test('6. an existing 07-01-demo-SUMMARY.md committed in the worktree is overwritten; no second 07-01-SUMMARY.md', () => {
    const p = project();
    const wt = addWorktree(p);
    write(wt, NAMED_SUMMARY_REL, '# old named summary\n');
    gitOk(p, wt, 'add', NAMED_SUMMARY_REL);
    gitOk(p, wt, 'commit', '-q', '-m', 'docs(07-01): named summary');

    const r = summaryVerb(p, wt, 'post', POST_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, NAMED_SUMMARY_REL), POST_TEXT, 'the named file is overwritten in the worktree');
    assert.equal(exists(wt, SUMMARY_REL), false, 'no second 07-01-SUMMARY.md beside it');
    assert.equal(exists(p.main, NAMED_SUMMARY_REL), false, 'nothing in main');
    assert.equal(exists(p.main, SUMMARY_REL), false, 'nothing in main');
  });
});

describe('summary verbs, guards that hold before and after the fix', { skip: !HAS_GIT && 'git not available' }, () => {
  test('g1. from the MAIN checkout both verbs write main: same path, same bytes (D-01)', () => {
    const p = project();
    const cp = summaryVerb(p, p.main, 'checkpoint', CHECKPOINT_TEXT);
    assert.equal(cp.status, 0, cp.err || cp.out);
    assert.equal(read(p.main, SUMMARY_REL), CHECKPOINT_TEXT);
    const post = summaryVerb(p, p.main, 'post', POST_TEXT);
    assert.equal(post.status, 0, post.err || post.out);
    assert.equal(read(p.main, SUMMARY_REL), POST_TEXT);
    assert.equal(post.json.mode, 'local');
    assert.equal(post.json.rel, `objectives/${OBJ_DIR}/07-01-SUMMARY.md`);
  });

  test('g2. a worktree with no .planning/ (planning untracked) falls back to main', () => {
    const p = project({ ignorePlanning: true });
    const wt = addWorktree(p);
    assert.equal(exists(wt, '.planning'), false, 'fixture: the worktree has no .planning/');
    const r = summaryVerb(p, wt, 'post', POST_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(p.main, SUMMARY_REL), POST_TEXT, 'main took the write');
    assert.equal(exists(wt, '.planning'), false, 'the worktree gained no .planning/');
  });
});

describe('summary checkpoint in a linked worktree, store mode (D-14 unchanged)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('3. writes MAIN .planning/.trd-progress/<trd>.md and creates nothing under the worktree .planning/', () => {
    const p = project({ config: { github: { enabled: true, store: true } } });
    const wt = addWorktree(p);
    const before = fs.readdirSync(path.join(wt, '.planning')).sort();

    const r = summaryVerb(p, wt, 'checkpoint', CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(r.json.mode, 'store');
    // The progress file is named by the normalized TRD id (ghMapping.toTrdId): `7-01`, not `07-01`.
    assert.equal(read(p.main, '.planning/.trd-progress/7-01.md'), CHECKPOINT_TEXT, "main's progress file holds it");
    assert.equal(exists(wt, '.planning/.trd-progress'), false, 'no progress file in the worktree');
    assert.equal(exists(wt, SUMMARY_REL), false, 'no SUMMARY in the worktree');
    assert.equal(exists(p.main, SUMMARY_REL), false, 'no SUMMARY in main either: store mode keeps it in .trd-progress');
    assert.deepEqual(fs.readdirSync(path.join(wt, '.planning')).sort(), before, 'the worktree .planning/ is untouched');
  });
});
