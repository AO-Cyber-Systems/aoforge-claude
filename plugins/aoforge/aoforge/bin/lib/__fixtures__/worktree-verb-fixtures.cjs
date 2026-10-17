'use strict';

/**
 * worktree-verb-fixtures.cjs — the git fixtures of quick 36's worktree cases, shared by
 * planning-verbs-worktree.test.cjs (both checkouts on `.aoforge/`) and planning-verbs-worktree.legacy.test.cjs (a
 * checkout on the pre-rename directory, which the legacy test names through LEGACY). Objective 79, TRD 79-04.
 *
 * This module never names the pre-rename directory itself: a caller passes it as `planningDir` or `renameTo`.
 *
 * no_llm_test_data: every repo is a disposable `git init -b main` under the OS temp dir with a fake HOME,
 * GIT_CONFIG_GLOBAL=/dev/null and TMPDIR pointed at a per-test dir (so `planning draft` writes no draft under the real
 * tmpdir). aof-tools runs as a child process with `--cwd`. Nothing touches this repository, ~/.claude or the network.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./upgrade-fixtures.cjs');
const { NAMES } = require('../legacy-names.cjs');

const TOOLS_PATH = path.join(__dirname, '..', '..', 'aof-tools.cjs');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const NEW = NAMES.planningDir;
const JOB_REL = 'quick/34-demo/34-JOB.md';
const JOB_TEXT = '# Quick 34: demo\n\nWorktree job text.\n';
const QSUM_TEXT = '# Quick 34 summary\n\n## Self-Check: PASSED\n';
const CHECKPOINT_TEXT = '# Summary 08-01\n\n## Progress\n- [x] Task 1: first — (this commit)\n- [ ] Task 2: second — next step: edit a.cjs\n';
const MAIN_PROJECT = '# Project (main copy)\n';
const WT_PROJECT = '# Project (worktree copy)\n';
const WT_ONLY_TRD = 'objectives/08-wt-only/08-01-x-TRD.md';

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

/** True when `child` is strictly inside `parent` (both realpath'd). */
const under = (child, parent) => {
  const rel = path.relative(fs.realpathSync(parent), child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Every file under `dir` as `{rel: base64 bytes}`, sorted; `{}` when `dir` does not exist. A byte-for-byte snapshot. */
function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs).toString('base64');
    }
  };
  walk(dir);
  return out;
}

/**
 * One test file's fixture set. `cleanup()` removes every temp dir it made; call it from the file's afterEach.
 * @returns {object}
 */
function createWorktreeFixtures() {
  const dirs = [];

  function cleanup() {
    while (dirs.length) {
      const dir = dirs.pop();
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function envFor(p) {
    const env = { ...fx.gitEnv(p.home), GIT_CONFIG_GLOBAL: '/dev/null', TMPDIR: p.tmp };
    for (const key of ['AOFORGE_ALLOW_RAW_COMMIT', 'AOFORGE_SKIP_GH_GATE', 'AOFORGE_SKIP_GH_GATE_REASON']) delete env[key];
    return env;
  }

  function gitOk(p, dir, ...args) {
    return execFileSync('git', ['-C', dir, ...args], {
      env: envFor(p), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  /**
   * A git repo on `main` whose planning dir is `planningDir` (tracked unless `ignorePlanning`): config, ROADMAP,
   * PROJECT.md and the 07-01 TRD, one init commit. `holder` is a separate temp dir for the worktree, `tmp` the TMPDIR
   * of every spawn.
   */
  function project({ config = {}, ignorePlanning = false, planningDir = NEW } = {}) {
    const home = fx.makeFakeHome();
    const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-main-')));
    const holder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-tree-')));
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-tmp-')));
    dirs.push(main, home, holder, tmp);
    write(main, `${planningDir}/config.json`, `${JSON.stringify(config)}\n`);
    write(main, `${planningDir}/ROADMAP.md`, '# Roadmap\n\n### Objective 7: Demo\n');
    write(main, `${planningDir}/PROJECT.md`, MAIN_PROJECT);
    write(main, `${planningDir}/objectives/07-demo/07-01-demo-TRD.md`, '# TRD 07-01\n');
    write(main, 'src/keep.cjs', 'module.exports = 0;\n');
    if (ignorePlanning) write(main, '.gitignore', `${planningDir}/\n`);
    fx.initGitFixture(main, home);
    return { main, home, holder, tmp };
  }

  /** `git worktree add -b exec/wt <holder>/wt`; with `renameTo`, the branch moves its planning dir there and commits it. */
  function addWorktree(p, { from, renameTo } = {}) {
    const wt = path.join(p.holder, 'wt');
    gitOk(p, p.main, 'worktree', 'add', '-q', '-b', 'exec/wt', wt);
    if (renameTo) {
      gitOk(p, wt, 'mv', from, renameTo);
      gitOk(p, wt, 'commit', '-qm', 'layout');
    }
    return fs.realpathSync(wt);
  }

  /** Commit `rel` under the worktree's `planningDir` with `content` on the worktree branch (main never sees it). */
  function commitInWorktree(p, wt, planningDir, rel, content) {
    write(wt, `${planningDir}/${rel}`, content);
    gitOk(p, wt, 'add', `${planningDir}/${rel}`);
    gitOk(p, wt, 'commit', '-qm', `wt: ${rel}`);
  }

  /** `aof-tools --cwd <dir> <args...>` with `input` on stdin (`--from -`). */
  function aof(p, dir, args, input) {
    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', dir, ...args], {
      cwd: dir, env: envFor(p), encoding: 'utf-8', input,
    });
    const out = (r.stdout || '').trim();
    let json = null;
    try { json = JSON.parse(out); } catch { /* prose */ }
    return { status: r.status, out, err: (r.stderr || '').trim(), json };
  }

  return { cleanup, envFor, gitOk, project, addWorktree, commitInWorktree, aof };
}

module.exports = {
  TOOLS_PATH,
  HAS_GIT,
  NEW,
  JOB_REL,
  JOB_TEXT,
  QSUM_TEXT,
  CHECKPOINT_TEXT,
  MAIN_PROJECT,
  WT_PROJECT,
  WT_ONLY_TRD,
  write,
  exists,
  read,
  under,
  snapshot,
  createWorktreeFixtures,
};
