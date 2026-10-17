'use strict';

/**
 * planning-verbs-worktree.test.cjs — quick 36 (D4): in local mode a planning verb run from a linked worktree that has its
 * own planning directory reads and writes THAT worktree, and its printed `wrote <dir>/<rel>` names the directory it
 * actually wrote.
 *
 * Why: every planning verb resolved the MAIN checkout (planning-mode.resolveMainRoot), which prefers main whenever main
 * has a planning dir. `quick put 34 <slug>` run from a worktree whose tree used the legacy planning directory wrote the
 * main checkout's `.aoforge/quick/34-.../34-JOB.md` and printed `wrote .aoforge/quick/...`. Only `summary post|checkpoint`
 * used the checkout holding the caller (TRD 53-01), and even they found the TRD in main. One resolver,
 * planning-mode.resolveVerbRoot, now decides the root for every verb.
 *
 *   25  main tracks `.aoforge/`; the worktree branch renames it to the legacy dir. `quick put` from the worktree writes
 *       `<wt>/<legacy>/quick/34-demo/34-JOB.md`, main gains no `quick/`, prose says `wrote <legacy>/quick/...`, and the
 *       `--raw` path is under the worktree
 *   26  `quick summary` finds the task dir in the worktree and writes its SUMMARY there
 *   27  `summary checkpoint 08-01` for an objective only the worktree has exits 0 and writes the worktree
 *   28  `doc put PROJECT.md` writes the worktree; main's PROJECT.md is unchanged
 *   29  `planning draft` seeds the draft from the worktree's file, under the MAIN repo key
 *   30  reverse layout: main tracks the legacy dir, the worktree renames it to `.aoforge/`; `quick put` writes the worktree
 *   31  guard: the planning dir is gitignored, so the worktree has none; `quick put` falls back to main
 *   s1  guard: store config in main; `summary checkpoint` from the cross-layout worktree still writes MAIN's
 *       `.trd-progress/` and leaves the worktree's planning dir untouched (D-14)
 *
 * no_llm_test_data: every repo is a disposable `git init -b main` under the OS temp dir with a fake HOME,
 * GIT_CONFIG_GLOBAL=/dev/null and TMPDIR pointed at a per-test dir (so `planning draft` writes no draft under the real
 * tmpdir). aof-tools runs as a child process with `--cwd`. Nothing touches this repository, ~/.claude or the network.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { repoKey } = require('./gh-outbox.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const JOB_REL = 'quick/34-demo/34-JOB.md';
const JOB_TEXT = '# Quick 34: demo\n\nWorktree job text.\n';
const QSUM_TEXT = '# Quick 34 summary\n\n## Self-Check: PASSED\n';
const CHECKPOINT_TEXT = '# Summary 08-01\n\n## Progress\n- [x] Task 1: first — (this commit)\n- [ ] Task 2: second — next step: edit a.cjs\n';
const MAIN_PROJECT = '# Project (main copy)\n';
const WT_PROJECT = '# Project (worktree copy)\n';

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
 * A git repo on `main` whose planning dir is `planningDir` (tracked unless `ignorePlanning`): config, ROADMAP, PROJECT.md
 * and the 07-01 TRD, one init commit. `holder` is a separate temp dir for the worktree, `tmp` the TMPDIR of every spawn.
 */
function project({ config = {}, ignorePlanning = false, planningDir = NEW } = {}) {
  const home = fx.makeFakeHome();
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-main-')));
  const holder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-tree-')));
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-verb-wt-tmp-')));
  cleanup.push(main, home, holder, tmp);
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

/** The cross-layout fixture of tests 25-29: main tracks `.aoforge/`, the worktree uses the legacy dir. */
function crossLayout(opts = {}) {
  const p = project(opts);
  const wt = addWorktree(p, { from: NEW, renameTo: OLD });
  assert.equal(exists(wt, NEW), false, 'fixture: the worktree has no .aoforge/');
  assert.equal(exists(wt, OLD), true, 'fixture: the worktree has the legacy planning dir');
  return { p, wt };
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

const under = (child, parent) => {
  const rel = path.relative(fs.realpathSync(parent), child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

describe('planning verbs in a linked worktree, local mode (quick 36)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('25. quick put writes the worktree\'s legacy planning dir and says so; main gains nothing', () => {
    const { p, wt } = crossLayout();
    const prose = aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
    assert.equal(prose.status, 0, prose.err || prose.out);
    assert.equal(read(wt, `${OLD}/${JOB_REL}`), JOB_TEXT, 'the JOB lands in the worktree');
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main has no quick/ dir');
    assert.ok(prose.out.includes(`wrote ${OLD}/${JOB_REL}`), prose.out);

    const raw = aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-', '--raw'], JOB_TEXT);
    assert.equal(raw.status, 0, raw.err || raw.out);
    assert.ok(under(fs.realpathSync(raw.json.path), wt), `raw path ${raw.json.path} is under the worktree`);
    assert.equal(fs.realpathSync(raw.json.path), fs.realpathSync(path.join(wt, OLD, JOB_REL)));
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main still has no quick/ dir');
  });

  test('26. quick summary finds the task in the worktree and writes its SUMMARY there', () => {
    const { p, wt } = crossLayout();
    assert.equal(aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT).status, 0);
    const r = aof(p, wt, ['quick', 'summary', '34', '--from', '-', '--raw'], QSUM_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${OLD}/quick/34-demo/34-SUMMARY.md`), QSUM_TEXT);
    assert.equal(exists(p.main, `${NEW}/quick`), false, 'main has no quick/ dir');
  });

  test('27. summary checkpoint for an objective only the worktree has writes the worktree', () => {
    const { p, wt } = crossLayout();
    write(wt, `${OLD}/objectives/08-wt-only/08-01-x-TRD.md`, '# TRD 08-01\n');
    gitOk(p, wt, 'add', `${OLD}/objectives/08-wt-only/08-01-x-TRD.md`);
    gitOk(p, wt, 'commit', '-qm', 'trd 08-01');
    const r = aof(p, wt, ['summary', 'checkpoint', '08-01', '--from', '-', '--raw'], CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${OLD}/objectives/08-wt-only/08-01-SUMMARY.md`), CHECKPOINT_TEXT);
    assert.equal(exists(p.main, `${NEW}/objectives/08-wt-only`), false, 'nothing in main');
  });

  test('28. doc put PROJECT.md writes the worktree; main\'s PROJECT.md is unchanged', () => {
    const { p, wt } = crossLayout();
    const r = aof(p, wt, ['doc', 'put', 'PROJECT.md', '--from', '-', '--raw'], WT_PROJECT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${OLD}/PROJECT.md`), WT_PROJECT);
    assert.equal(read(p.main, `${NEW}/PROJECT.md`), MAIN_PROJECT);
  });

  test('29. planning draft seeds from the worktree\'s file; the draft stays under the MAIN repo key', () => {
    const { p, wt } = crossLayout();
    assert.equal(aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT).status, 0);
    // A different copy at the same rel in main: the draft must not be seeded from it.
    write(p.main, `${NEW}/${JOB_REL}`, '# Quick 34: demo\n\nStale main copy.\n');
    const r = aof(p, wt, ['planning', 'draft', JOB_REL]);
    assert.equal(r.status, 0, r.err || r.out);
    const draft = r.out.split('\n')[0];
    assert.equal(fs.readFileSync(draft, 'utf-8'), JOB_TEXT, 'the draft holds the worktree text');
    assert.ok(under(draft, p.tmp), `the draft ${draft} is under the test TMPDIR`);
    assert.ok(draft.split(path.sep).includes(repoKey(p.main)), `the draft ${draft} is keyed on main (${repoKey(p.main)})`);
  });

  test('30. reverse layout: main tracks the legacy dir, the worktree uses .aoforge/; quick put writes the worktree', () => {
    const p = project({ planningDir: OLD });
    const wt = addWorktree(p, { from: OLD, renameTo: NEW });
    const r = aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(wt, `${NEW}/${JOB_REL}`), JOB_TEXT);
    assert.ok(r.out.includes(`wrote ${NEW}/${JOB_REL}`), r.out);
    assert.equal(exists(p.main, `${OLD}/quick`), false, 'main has no quick/ dir');
    assert.equal(exists(p.main, NEW), false, 'main gained no .aoforge/');
  });
});

describe('planning verbs in a linked worktree, guards (quick 36)', { skip: !HAS_GIT && 'git not available' }, () => {
  test('31. a worktree with no planning dir (gitignored) falls back to main', () => {
    const p = project({ ignorePlanning: true });
    const wt = addWorktree(p);
    assert.equal(exists(wt, NEW), false, 'fixture: the worktree has no .aoforge/');
    const r = aof(p, wt, ['quick', 'put', '34', 'demo', '--from', '-'], JOB_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(read(p.main, `${NEW}/${JOB_REL}`), JOB_TEXT, 'main took the write');
    assert.equal(exists(wt, NEW), false, 'the worktree gained no .aoforge/');
    assert.equal(exists(wt, OLD), false, 'nor a legacy dir');
  });

  test('s1. store config in main: summary checkpoint from the worktree writes MAIN\'s .trd-progress (D-14)', () => {
    const { p, wt } = crossLayout({ config: { github: { enabled: true, store: true } } });
    const list = (dir) => {
      const out = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name));
          else out.push(path.relative(dir, path.join(d, e.name)));
        }
      };
      walk(dir);
      return out.sort();
    };
    const before = list(path.join(wt, OLD));
    const r = aof(p, wt, ['summary', 'checkpoint', '07-01', '--from', '-', '--raw'], CHECKPOINT_TEXT);
    assert.equal(r.status, 0, r.err || r.out);
    assert.equal(r.json.mode, 'store');
    assert.equal(read(p.main, `${NEW}/.trd-progress/7-01.md`), CHECKPOINT_TEXT, "main's progress file holds it");
    assert.deepEqual(list(path.join(wt, OLD)), before, "the worktree's planning dir is untouched");
  });
});
