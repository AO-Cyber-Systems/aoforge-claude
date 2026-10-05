'use strict';

// df-tools merge-driver: state-json | install | uninstall | resolve (TRD 59-01, tests 11-20).
//
// Spawns the real df-tools binary. Every git operation runs in a hermetic temp repository built by
// __fixtures__/state-merge-fixtures.cjs (GIT_CONFIG_GLOBAL=/dev/null, temp HOME, explicit identity);
// this repository's git configuration is never touched. Git-dependent tests skip, visibly, when git
// is not on PATH. Test 20 is a pure unit test of driverBinPath.

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { driverCommand, driverBinPath } = require('./merge-driver-cli.cjs');
const { gitAvailable } = require('./__fixtures__/wiki-remote.cjs');
const {
  stateDoc, decision, stateText, archiveText, makeWaveRepo,
} = require('./__fixtures__/state-merge-fixtures.cjs');

const BIN = path.join(__dirname, '..', 'df-tools.cjs');
const REAL_BIN = fs.realpathSync(BIN); // install records the real path of the df-tools that ran
const SKIP_GIT = gitAvailable() ? false : 'git is not available';

const BEGIN = '# >>> devflow merge drivers (df-tools merge-driver install)';
const END = '# <<< devflow merge drivers';
const BLOCK = [
  BEGIN,
  '**/.planning/state.json merge=devflow-state-json',
  '**/.planning/STATE_ARCHIVE.md merge=union',
  END,
].join('\n') + '\n';

const d0 = decision('58', 'base decision');
const d1 = decision('59', 'decision from branch A');
const d2 = decision('59', 'decision from branch B');
const rowA = { objective: '59', job: '01', duration: '5min', tasks: '3', files: '4' };
const rowB = { objective: '59', job: '02', duration: '7min', tasks: '2', files: '6' };

function dftools(repo, args, opts = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: opts.cwd || repo.root,
    env: repo.env,
    encoding: 'utf-8',
  });
}

function infoAttributes(repo) {
  return path.join(repo.root, '.git', 'info', 'attributes');
}

function readOrEmpty(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

/** Base commit holding d0 and an archive with d0, plus branches A and B that each append at the same place. */
function waveRepo() {
  const repo = makeWaveRepo({
    state: stateDoc({ decisions: [d0] }),
    archive: archiveText({ decisions: [d0] }),
  });
  repo.branchWith('A', {
    '.planning/state.json': stateText(stateDoc({ decisions: [d0, d1], metrics: { jobs_completed: 1 } })),
    '.planning/STATE_ARCHIVE.md': archiveText({ decisions: [d0, d1], metrics: [rowA] }),
  });
  repo.branchWith('B', {
    '.planning/state.json': stateText(stateDoc({ decisions: [d0, d2], metrics: { jobs_completed: 1 } })),
    '.planning/STATE_ARCHIVE.md': archiveText({ decisions: [d0, d2], metrics: [rowB] }),
  });
  return repo;
}

function unmerged(repo) {
  return repo.git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean).sort();
}

describe('merge-driver state-json', () => {
  test('11. writes the merge into <ours>, prints nothing, exits 0; an unparsable <theirs> exits 1 and leaves <ours> alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-mdrv-'));
    try {
      const baseF = path.join(dir, 'base.json');
      const oursF = path.join(dir, 'ours.json');
      const theirsF = path.join(dir, 'theirs.json');
      fs.writeFileSync(baseF, stateText(stateDoc({ decisions: [d0] })));
      fs.writeFileSync(oursF, stateText(stateDoc({ decisions: [d0, d1] })));
      fs.writeFileSync(theirsF, stateText(stateDoc({ decisions: [d0, d2] })));

      const ok = spawnSync(process.execPath, [BIN, 'merge-driver', 'state-json', baseF, oursF, theirsF], { cwd: dir, encoding: 'utf-8' });
      assert.strictEqual(ok.status, 0, ok.stderr);
      assert.strictEqual(ok.stdout, '');
      assert.strictEqual(fs.readFileSync(oursF, 'utf-8'), stateText(stateDoc({ decisions: [d0, d1, d2] })));

      const before = fs.readFileSync(oursF, 'utf-8');
      fs.writeFileSync(theirsF, '{ not json');
      const bad = spawnSync(process.execPath, [BIN, 'merge-driver', 'state-json', baseF, oursF, theirsF], { cwd: dir, encoding: 'utf-8' });
      assert.strictEqual(bad.status, 1);
      assert.match(bad.stderr, /theirs/);
      assert.strictEqual(fs.readFileSync(oursF, 'utf-8'), before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('11b. a missing base file is an empty base', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-mdrv-'));
    try {
      const oursF = path.join(dir, 'ours.json');
      const theirsF = path.join(dir, 'theirs.json');
      fs.writeFileSync(oursF, stateText(stateDoc({ decisions: [d1] })));
      fs.writeFileSync(theirsF, stateText(stateDoc({ decisions: [d2] })));
      const r = spawnSync(process.execPath, [BIN, 'merge-driver', 'state-json', path.join(dir, 'absent.json'), oursF, theirsF], { cwd: dir, encoding: 'utf-8' });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(oursF, 'utf-8')).decisions, [d1, d2]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('merge-driver install', () => {
  test('12. --check writes nothing; install writes the block and the driver; a second install changes nothing', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const attr = infoAttributes(repo);
      const config = path.join(repo.root, '.git', 'config');
      const configBefore = fs.readFileSync(config, 'utf-8');

      const check0 = dftools(repo, ['merge-driver', 'install', '--check']);
      assert.strictEqual(check0.status, 0, check0.stderr);
      assert.strictEqual(JSON.parse(check0.stdout).installed, false);
      assert.strictEqual(fs.existsSync(attr), false);
      assert.strictEqual(fs.readFileSync(config, 'utf-8'), configBefore);

      const first = dftools(repo, ['merge-driver', 'install']);
      assert.strictEqual(first.status, 0, first.stderr);
      const firstOut = JSON.parse(first.stdout);
      assert.strictEqual(firstOut.changed, true);
      assert.strictEqual(firstOut.installed, true);
      assert.strictEqual(fs.readFileSync(attr, 'utf-8'), BLOCK);
      assert.strictEqual(repo.git(['config', '--local', '--get', 'merge.devflow-state-json.driver']), driverCommand(REAL_BIN));
      assert.strictEqual(firstOut.bin, REAL_BIN);
      assert.ok(repo.git(['config', '--local', '--get', 'merge.devflow-state-json.name']).length > 0);

      const attrAfter = fs.readFileSync(attr, 'utf-8');
      const configAfter = fs.readFileSync(config, 'utf-8');
      const second = dftools(repo, ['merge-driver', 'install']);
      assert.strictEqual(second.status, 0, second.stderr);
      assert.strictEqual(JSON.parse(second.stdout).changed, false);
      assert.strictEqual(fs.readFileSync(attr, 'utf-8'), attrAfter);
      assert.strictEqual(fs.readFileSync(config, 'utf-8'), configAfter);

      const check1 = dftools(repo, ['merge-driver', 'install', '--check']);
      assert.strictEqual(JSON.parse(check1.stdout).installed, true);
    } finally {
      repo.cleanup();
    }
  });

  test('12b. outside a git repository, install exits 1 and says so', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const plain = path.join(path.dirname(repo.root), 'plain');
      fs.mkdirSync(plain);
      const r = spawnSync(process.execPath, [BIN, 'merge-driver', 'install'], {
        cwd: plain,
        env: { ...repo.env, GIT_CEILING_DIRECTORIES: path.dirname(repo.root) },
        encoding: 'utf-8',
      });
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /git repository/i);
    } finally {
      repo.cleanup();
    }
  });

  test('13. install from a linked worktree writes the COMMON info/attributes and the shared config', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const wt = path.join(path.dirname(repo.root), 'wt');
      repo.git(['worktree', 'add', wt, '-b', 'wt-branch']);
      const r = dftools(repo, ['merge-driver', 'install'], { cwd: wt });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.strictEqual(fs.readFileSync(infoAttributes(repo), 'utf-8'), BLOCK);
      assert.match(repo.git(['check-attr', 'merge', '--', '.planning/state.json']), /devflow-state-json/);
      assert.match(repo.git(['check-attr', 'merge', '--', '.planning/STATE_ARCHIVE.md']), /union/);
      assert.strictEqual(repo.git(['config', '--local', '--get', 'merge.devflow-state-json.driver']), driverCommand(REAL_BIN));
    } finally {
      repo.cleanup();
    }
  });

  test('14. lines the user already had are kept; a rerun replaces only the managed block, in place', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const attr = infoAttributes(repo);
      fs.mkdirSync(path.dirname(attr), { recursive: true });
      fs.writeFileSync(attr, '*.png binary\n');
      assert.strictEqual(dftools(repo, ['merge-driver', 'install']).status, 0);
      assert.strictEqual(fs.readFileSync(attr, 'utf-8'), '*.png binary\n' + BLOCK);

      fs.writeFileSync(attr, `*.png binary\n${BEGIN}\nstale line\n${END}\n*.md text\n`);
      const r = dftools(repo, ['merge-driver', 'install']);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.strictEqual(JSON.parse(r.stdout).changed, true);
      assert.strictEqual(fs.readFileSync(attr, 'utf-8'), '*.png binary\n' + BLOCK + '*.md text\n');
    } finally {
      repo.cleanup();
    }
  });
});

describe('merge-driver in a wave merge', () => {
  test('15. with the driver installed two branches that appended to both files merge with no conflict; without it they conflict', { skip: SKIP_GIT }, () => {
    const repo = waveRepo();
    try {
      assert.strictEqual(dftools(repo, ['merge-driver', 'install']).status, 0);
      const a = repo.run(['merge', '--no-ff', 'A', '-m', 'merge A']);
      assert.strictEqual(a.status, 0, a.stdout + a.stderr);
      const b = repo.run(['merge', '--no-ff', 'B', '-m', 'merge B']);
      assert.strictEqual(b.status, 0, b.stdout + b.stderr);
      assert.deepStrictEqual(unmerged(repo), []);

      const state = JSON.parse(fs.readFileSync(path.join(repo.root, '.planning', 'state.json'), 'utf-8'));
      assert.deepStrictEqual(state.decisions, [d0, d1, d2]);
      assert.strictEqual(state.metrics.jobs_completed, 2);
      const archive = fs.readFileSync(path.join(repo.root, '.planning', 'STATE_ARCHIVE.md'), 'utf-8');
      assert.match(archive, /\| Objective 59 P01 \|/);
      assert.match(archive, /\| Objective 59 P02 \|/);
      assert.match(archive, /decision from branch A/);
      assert.match(archive, /decision from branch B/);
    } finally {
      repo.cleanup();
    }

    const control = waveRepo();
    try {
      const a = control.run(['merge', '--no-ff', 'A', '-m', 'merge A']);
      assert.strictEqual(a.status, 0, a.stdout + a.stderr);
      const b = control.run(['merge', '--no-ff', 'B', '-m', 'merge B']);
      assert.strictEqual(b.status, 1);
      assert.deepStrictEqual(unmerged(control), ['.planning/STATE_ARCHIVE.md', '.planning/state.json']);
    } finally {
      control.cleanup();
    }
  });

  test('16. resolve completes a merge that already stopped: JSON-aware for state.json, union for the archive', { skip: SKIP_GIT }, () => {
    const repo = waveRepo();
    try {
      assert.strictEqual(repo.run(['merge', '--no-ff', 'A', '-m', 'merge A']).status, 0);
      assert.strictEqual(repo.run(['merge', '--no-ff', 'B', '-m', 'merge B']).status, 1);

      const s = dftools(repo, ['merge-driver', 'resolve', '.planning/state.json']);
      assert.strictEqual(s.status, 0, s.stderr);
      assert.strictEqual(JSON.parse(s.stdout).staged, true);
      const a = dftools(repo, ['merge-driver', 'resolve', '.planning/STATE_ARCHIVE.md']);
      assert.strictEqual(a.status, 0, a.stderr);
      assert.strictEqual(JSON.parse(a.stdout).strategy, 'union');

      assert.deepStrictEqual(unmerged(repo), []);
      repo.git(['commit', '--no-edit']);
      const state = JSON.parse(fs.readFileSync(path.join(repo.root, '.planning', 'state.json'), 'utf-8'));
      assert.deepStrictEqual(state.decisions, [d0, d1, d2]);
      const archive = fs.readFileSync(path.join(repo.root, '.planning', 'STATE_ARCHIVE.md'), 'utf-8');
      assert.match(archive, /decision from branch A/);
      assert.match(archive, /decision from branch B/);
    } finally {
      repo.cleanup();
    }
  });

  test('17. resolve refuses any other path, and a path with no conflicted stages', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const other = dftools(repo, ['merge-driver', 'resolve', 'src/a.js']);
      assert.strictEqual(other.status, 1);
      assert.match(other.stderr, /\.planning\/state\.json/);
      assert.match(other.stderr, /STATE_ARCHIVE\.md/);

      const none = dftools(repo, ['merge-driver', 'resolve', '.planning/state.json']);
      assert.strictEqual(none.status, 1);
      assert.match(none.stderr, /no conflicted stages/);
    } finally {
      repo.cleanup();
    }
  });
});

describe('merge-driver uninstall', () => {
  test('18. removes exactly the managed block and the config section; idempotent; a never-installed repo is a no-op', { skip: SKIP_GIT }, () => {
    const repo = makeWaveRepo({ state: stateDoc(), archive: archiveText({}) });
    try {
      const attr = infoAttributes(repo);
      const config = path.join(repo.root, '.git', 'config');

      const idle = dftools(repo, ['merge-driver', 'uninstall']);
      assert.strictEqual(idle.status, 0, idle.stderr);
      assert.strictEqual(JSON.parse(idle.stdout).changed, false);

      fs.mkdirSync(path.dirname(attr), { recursive: true });
      fs.writeFileSync(attr, '*.png binary\n');
      assert.strictEqual(dftools(repo, ['merge-driver', 'install']).status, 0);

      const un = dftools(repo, ['merge-driver', 'uninstall']);
      assert.strictEqual(un.status, 0, un.stderr);
      const unOut = JSON.parse(un.stdout);
      assert.strictEqual(unOut.changed, true);
      assert.strictEqual(unOut.installed, false);
      const attrText = fs.readFileSync(attr, 'utf-8');
      assert.ok(attrText.includes('*.png binary'), 'the user line must survive');
      assert.ok(!attrText.includes('devflow merge drivers'), 'no managed marker may remain');
      assert.ok(!attrText.includes('devflow-state-json'), 'no managed attribute may remain');
      const cfg = repo.run(['config', '--get-regexp', '^merge\\.devflow-state-json\\.']);
      assert.strictEqual(cfg.status, 1);
      assert.strictEqual(cfg.stdout, '');
      assert.strictEqual(JSON.parse(dftools(repo, ['merge-driver', 'install', '--check']).stdout).installed, false);

      const attrBefore = fs.readFileSync(attr, 'utf-8');
      const configBefore = fs.readFileSync(config, 'utf-8');
      const again = dftools(repo, ['merge-driver', 'uninstall']);
      assert.strictEqual(again.status, 0, again.stderr);
      assert.strictEqual(JSON.parse(again.stdout).changed, false);
      assert.strictEqual(fs.readFileSync(attr, 'utf-8'), attrBefore);
      assert.strictEqual(fs.readFileSync(config, 'utf-8'), configBefore);
    } finally {
      repo.cleanup();
    }
  });
});

describe('merge-driver fail safe', () => {
  test('19. a missing binary degrades to an ordinary text conflict that resolve completes', { skip: SKIP_GIT }, () => {
    const repo = waveRepo();
    try {
      assert.strictEqual(dftools(repo, ['merge-driver', 'install']).status, 0);
      repo.git(['config', 'merge.devflow-state-json.driver', driverCommand('/nonexistent/df-tools.cjs')]);

      assert.strictEqual(repo.run(['merge', '--no-ff', 'A', '-m', 'merge A']).status, 0);
      const b = repo.run(['merge', '--no-ff', 'B', '-m', 'merge B']);
      assert.strictEqual(b.status, 1, 'the second merge must stop on a conflict, not abort');
      assert.ok(unmerged(repo).includes('.planning/state.json'));
      const text = fs.readFileSync(path.join(repo.root, '.planning', 'state.json'), 'utf-8');
      assert.match(text, /^<{7} ours$/m);
      assert.match(text, /^>{7} theirs$/m);
      assert.ok(fs.existsSync(path.join(repo.root, '.git', 'MERGE_HEAD')), 'the merge must have stopped, not aborted');

      const r = dftools(repo, ['merge-driver', 'resolve', '.planning/state.json']);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.deepStrictEqual(unmerged(repo), []);
      repo.git(['commit', '--no-edit']);
      const state = JSON.parse(fs.readFileSync(path.join(repo.root, '.planning', 'state.json'), 'utf-8'));
      assert.deepStrictEqual(state.decisions, [d0, d1, d2]);
    } finally {
      repo.cleanup();
    }
  });
});

describe('driverCommand and driverBinPath', () => {
  test('driverCommand is the fail-safe sh wrapper and refuses a path with a single quote', () => {
    assert.strictEqual(
      driverCommand('/a/b/df-tools.cjs'),
      "{ [ -f '/a/b/df-tools.cjs' ] && node '/a/b/df-tools.cjs' merge-driver state-json %O %A %B; } || git merge-file -L ours -L base -L theirs %A %O %B",
    );
    assert.throws(() => driverCommand("/a/it's/df-tools.cjs"), /'/);
  });

  test('20. driverBinPath maps a linked worktree copy to the main checkout and leaves other copies alone', () => {
    const present = new Set(['/w/main/plugins/devflow/devflow/bin/df-tools.cjs']);
    const exists = (p) => present.has(p);
    const rel = 'plugins/devflow/devflow/bin/df-tools.cjs';

    assert.strictEqual(
      driverBinPath({ runningBin: `/w/wt/${rel}`, checkoutTop: '/w/wt', mainRoot: '/w/main', exists }),
      `/w/main/${rel}`,
    );
    assert.throws(
      () => driverBinPath({ runningBin: `/w/wt/${rel}`, checkoutTop: '/w/wt', mainRoot: '/w/main', exists: () => false }),
      (err) => err.message.includes(`/w/wt/${rel}`) && err.message.includes(`/w/main/${rel}`),
    );
    assert.strictEqual(
      driverBinPath({ runningBin: '/h/.claude/devflow/bin/df-tools.cjs', checkoutTop: '/w/wt', mainRoot: '/w/main', exists }),
      '/h/.claude/devflow/bin/df-tools.cjs',
    );
    assert.strictEqual(
      driverBinPath({ runningBin: `/w/main/${rel}`, checkoutTop: '/w/main', mainRoot: '/w/main', exists }),
      `/w/main/${rel}`,
    );
  });
});
