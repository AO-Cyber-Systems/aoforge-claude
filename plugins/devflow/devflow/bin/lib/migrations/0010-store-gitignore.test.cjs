'use strict';

// TRD 48-10 — migration 0010 store-gitignore (test list items 8-14, GWP-04, U-1, D-17).
//
// no_llm_test_data: every project is a hand-built temp git repo (initGitFixture: local identity, signing off). The
// outbox journal and cache index live under hermeticEnv()'s temp DEVFLOW_OUTBOX_DIR, seeded only through the real
// gh-outbox.enqueue / gh-cache.recordCacheBaseline. Backups go to the hermetic temp home. Nothing here runs against
// this repository, the real ~/.claude, GitHub, the network or any port.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const upgrade = require('../upgrade.cjs');
const outbox = require('../gh-outbox.cjs');
const ghCache = require('../gh-cache.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { hermeticEnv } = require('../__fixtures__/gh-store-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0010-store-gitignore.cjs');
const TOOLS_PATH = path.join(__dirname, '..', '..', 'df-tools.cjs');
const PLUGIN_VERSION = '2.13.0';
const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const BLOCK = [
  '# >>> devflow store (0010) >>>',
  '.planning/*',
  '!.planning/config.json',
  '!.planning/STACK.md',
  '# <<< devflow store (0010) <<<',
].join('\n');

// planning-relative rel -> content. Classes per planning-paths (48-01).
const FILES = {
  'STACK.md': '# Stack\n',                                        // tracked-config
  'PROJECT.md': '# Project\n',                                    // cache
  'objectives/07-x/OBJECTIVE.md': '# Objective 07\n',             // cache
  'objectives/07-x/07-01-a-TRD.md': '# TRD 07-01\n',              // cache
  'ROADMAP.md': '# Roadmap\n',                                    // generated
  'STATE.md': '# State\n',                                        // generated
  'STATE_ARCHIVE.md': '# Archive\n',                              // runtime
  'workstreams/a.md': '# Workstream a\n',                         // runtime
};
const CACHE_RELS = ['PROJECT.md', 'objectives/07-x/07-01-a-TRD.md', 'objectives/07-x/OBJECTIVE.md'];

let henv;
const cleanup = [];
beforeEach(() => {
  henv = hermeticEnv();
});
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  henv.restore();
});

function m0010() {
  return require(MIGRATION_PATH);
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function config({ store }) {
  return {
    commit_docs: true,
    github: { enabled: store, store, repo: 'acme/widgets' },
    devflow: { version: PLUGIN_VERSION, migrations_applied: [], upgraded_at: '2026-10-01T00:00:00.000Z' },
  };
}

/** A git repo with every FILES entry tracked (plus `extra`), store mode on or off, `.gitignore` optional. */
function project({ store = true, extra = {}, gitignore = null } = {}) {
  const home = henv.env.HOME;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0010-')));
  cleanup.push(root);
  write(root, '.planning/config.json', `${JSON.stringify(config({ store }), null, 2)}\n`);
  for (const [rel, content] of Object.entries({ ...FILES, ...extra })) write(root, `.planning/${rel}`, content);
  write(root, 'src/a.cjs', 'module.exports = 1;\n');
  if (gitignore !== null) write(root, '.gitignore', gitignore);
  fx.initGitFixture(root, home);
  return { root, home };
}

function ctxFor(p, { dryRun = false } = {}) {
  return { projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

function git(p, ...args) {
  return execFileSync('git', ['-C', p.root, ...args], {
    env: fx.gitEnv(p.home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function lsPlanning(p) {
  return git(p, 'ls-files', '--', '.planning').split('\n').filter(Boolean).sort();
}

function gitignoreText(p) {
  const f = path.join(p.root, '.gitignore');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null;
}

function baselineAll(p) {
  const r = ghCache.recordCacheBaseline(p.root, CACHE_RELS);
  assert.deepEqual(r.recorded.sort(), [...CACHE_RELS].sort(), 'precondition: every cache file baselined');
}

function backupsDir(home) {
  return path.join(home, '.claude', 'devflow', 'backups');
}

describe('migration 0010 store-gitignore: contract', () => {
  test('id 0010, safety confirm (never auto), since 2.13.0; the registry picks it up', () => {
    const m = m0010();
    assert.equal(m.id, '0010');
    assert.equal(m.safety, 'confirm');
    assert.equal(m.since, '2.13.0');
    assert.equal(m.title, 'Gitignore the planning cache in GitHub store mode');
    for (const fn of ['detect', 'apply', 'discover', 'migrate']) assert.equal(typeof m[fn], 'function', fn);
    const entry = upgrade.loadRegistry().find((r) => r.id === '0010');
    assert.ok(entry, '0010 is registered');
    assert.equal(entry.safety, 'confirm');
  });
});

describe('migration 0010: local mode is never touched (test 8)', () => {
  test('8. local mode with a tracked .planning/ → detect not applicable; apply/migrate change nothing', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ store: false });
    const before = lsPlanning(p);

    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, false);
    assert.match(det.reason, /local mode/);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.deepEqual(m0010().apply(ctxFor(p)).changed, []);
    assert.equal(gitignoreText(p), null, 'no .gitignore written');
    assert.deepEqual(lsPlanning(p), before, 'index untouched');
    assert.equal(fs.existsSync(backupsDir(p.home)), false, 'no backup in local mode');
  });

  test('8b. github.enabled true but store off → not applicable', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ store: false });
    write(p.root, '.planning/config.json', `${JSON.stringify({ github: { enabled: true, store: false } })}\n`);
    assert.equal(m0010().detect(ctxFor(p)).applies, false);
  });

  test('8c. store mode → detect applies, naming the tracked count', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, true);
    assert.match(det.reason, /8 \.planning\/ path\(s\) still tracked/);
  });
});

describe('migration 0010: preconditions (tests 9-10)', () => {
  test('9. a pending outbox op → refused naming "1 pending op"; .gitignore and index unchanged', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const q = outbox.enqueue(p.root, [{ kind: 'link-sub-issue', target: { parent: '07', child: '07-01' } }]);
    assert.equal(q.ok, true, JSON.stringify(q));
    const before = lsPlanning(p);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.match(res.refused, /1 pending op/);
    assert.ok(res.details.includes('outbox: 1 pending op(s)'), JSON.stringify(res.details));
    assert.match(res.refused, /planning import/);
    assert.match(res.refused, /gh outbox flush/);
    assert.match(res.refused, /gh pull --all/);
    assert.equal(gitignoreText(p), null);
    assert.deepEqual(lsPlanning(p), before);

    assert.throws(() => m0010().apply(ctxFor(p)), /1 pending op/, 'the runner adapter throws the refusal');
  });

  test('9b. through upgrade.apply --only 0010 --confirm the refusal is a failure: no stamp, nothing untracked', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    outbox.enqueue(p.root, [{ kind: 'link-sub-issue', target: { parent: '07', child: '07-01' } }]);
    const before = lsPlanning(p);

    const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: '0010', confirm: true });
    const failed = report.failed.find((f) => f.id === '0010');
    assert.ok(failed, JSON.stringify(report));
    assert.match(failed.error, /1 pending op/);
    assert.ok(!report.applied.some((a) => a.id === '0010'));
    assert.deepEqual(lsPlanning(p), before);
    const stamp = JSON.parse(fs.readFileSync(path.join(p.root, '.planning/config.json'), 'utf-8')).devflow;
    assert.ok(!stamp.migrations_applied.includes('0010'), 'a refusal is never stamped as applied');
  });

  test('10. a cache file with no baseline / changed since sync → each listed', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    ghCache.recordCacheBaseline(p.root, ['PROJECT.md', 'objectives/07-x/OBJECTIVE.md']);
    write(p.root, '.planning/PROJECT.md', '# Project (edited)\n');

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.ok(res.details.includes('objectives/07-x/07-01-a-TRD.md: not on GitHub yet (no baseline)'), JSON.stringify(res.details));
    assert.ok(res.details.includes('PROJECT.md: changed since last sync'), JSON.stringify(res.details));
    assert.ok(!res.details.some((d) => d.startsWith('objectives/07-x/OBJECTIVE.md')), 'a baselined file is not listed');
    assert.equal(gitignoreText(p), null);
  });

  test('10b. a tracked legacy TRD name (NN-MM-TRD-<slug>.md) blocks apply instead of being silently untracked', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ extra: { 'objectives/07-x/07-02-TRD-legacy-name.md': '# legacy TRD\n' } });
    baselineAll(p);
    const before = lsPlanning(p);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.ok(
      res.details.includes('objectives/07-x/07-02-TRD-legacy-name.md: legacy TRD name has no GitHub home; rename it to 07-02-legacy-name-TRD.md'),
      JSON.stringify(res.details),
    );
    assert.deepEqual(lsPlanning(p), before);
    assert.match(m0010().detect(ctxFor(p)).reason, /1 legacy TRD name/);
  });
});

describe('migration 0010: apply (tests 11-12, 14)', () => {
  test('11. all baselined, empty journal → block written, only config.json + STACK.md tracked, files intact', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ gitignore: 'node_modules/\n' });
    baselineAll(p);
    const before = fx.snapshot(p.root);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.equal(gitignoreText(p), `node_modules/\n\n${BLOCK}\n`);
    assert.deepEqual(lsPlanning(p), ['.planning/STACK.md', '.planning/config.json']);
    const after = fx.snapshot(p.root);
    assert.deepEqual(fx.diffSnapshots(before, after), ['.gitignore'], 'only .gitignore changed on disk');

    assert.deepEqual(res.untracked, { cache: 3, generated: 2, runtime: 2 });
    assert.deepEqual(res.local_only, ['STATE_ARCHIVE.md', 'workstreams/a.md']);
    assert.match(res.local_only_note, /kept on this machine only after untrack \(no GitHub home\)/);
    assert.equal(res.gitignore, '.gitignore');
    assert.ok(res.changed.includes('.gitignore'));
    assert.ok(res.changed.includes('.planning/objectives/07-x/07-01-a-TRD.md'));
    assert.ok(!res.changed.includes('.planning/config.json'));

    const ci = (rel) => spawnSync('git', ['-C', p.root, 'check-ignore', '-q', '--no-index', '--', rel], { env: fx.gitEnv(p.home) }).status;
    assert.equal(ci('.planning/config.json'), 1, 'config.json is not ignored');
    assert.equal(ci('.planning/STACK.md'), 1, 'STACK.md is not ignored');
    assert.equal(ci('.planning/objectives/07-x/07-01-a-TRD.md'), 0, 'a TRD is ignored');
  });

  test('11b. the follow-up commit the notes print records every removal; working files survive', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, true);
    assert.match(res.notes, /--files \.gitignore \.planning\//);

    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', p.root, 'commit', 'chore: gitignore the planning cache', '--files', '.gitignore', '.planning/'], {
      cwd: p.root, env: fx.gitEnv(p.home), encoding: 'utf-8',
    });
    assert.equal(r.status, 0, `${r.stdout} ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).committed, true, r.stdout);
    const tree = git(p, 'ls-tree', '-r', '--name-only', 'HEAD', '--', '.planning').split('\n').filter(Boolean).sort();
    assert.deepEqual(tree, ['.planning/STACK.md', '.planning/config.json']);
    assert.equal(git(p, 'status', '--porcelain'), '');
    for (const rel of Object.keys(FILES)) assert.ok(fs.existsSync(path.join(p.root, '.planning', rel)), rel);
  });

  test('12. re-run → not applicable; .gitignore unchanged; migrate is a no-op', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    assert.equal(m0010().migrate(ctxFor(p)).applied, true);
    const gi = gitignoreText(p);
    const idx = git(p, 'ls-files', '-s');

    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, false, det.reason);
    const again = m0010().migrate(ctxFor(p));
    assert.equal(again.applied, false);
    assert.equal(gitignoreText(p), gi);
    assert.equal(git(p, 'ls-files', '-s'), idx);
  });

  test('12b. dryRun reports what would change and writes nothing (no backup, index untouched)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const before = fx.snapshot(p.root);
    const idx = git(p, 'ls-files', '-s');

    const res = m0010().apply(ctxFor(p, { dryRun: true }));
    assert.ok(res.changed.includes('.gitignore'));
    assert.ok(res.changed.includes('.planning/PROJECT.md'));
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(p.root)), []);
    assert.equal(git(p, 'ls-files', '-s'), idx);
    assert.equal(fs.existsSync(backupsDir(p.home)), false);
  });

  test('12c. an existing `.planning/` rule would hide config.json → refused, .gitignore restored byte-for-byte', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ gitignore: '.planning/\n' });
    baselineAll(p);
    const before = lsPlanning(p);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.match(res.refused, /config\.json/);
    assert.equal(gitignoreText(p), '.planning/\n');
    assert.deepEqual(lsPlanning(p), before);
  });

  test('14. backup under <userHome>/.claude/devflow/backups/<repoKey>/ before changes: .planning, .gitignore, path list', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ gitignore: 'node_modules/\n' });
    baselineAll(p);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, true);
    const keyDir = path.join(backupsDir(p.home), upgrade.repoKey(p.root));
    assert.ok(res.backup.startsWith(keyDir + path.sep), `${res.backup} under ${keyDir}`);
    assert.equal(fs.readFileSync(path.join(res.backup, '.planning', 'objectives/07-x/07-01-a-TRD.md'), 'utf-8'), FILES['objectives/07-x/07-01-a-TRD.md']);
    assert.equal(fs.readFileSync(path.join(res.backup, '0010-gitignore.before'), 'utf-8'), 'node_modules/\n');
    const list = fs.readFileSync(path.join(res.backup, '0010-untracked.txt'), 'utf-8').split('\n').filter(Boolean);
    assert.equal(list.length, 7);
    assert.ok(list.includes('.planning/workstreams/a.md'));
  });
});

describe('migration 0010: confirm safety through the runner (test 13)', () => {
  test('13. upgrade.apply without --confirm/--only leaves 0010 pending_confirm and the index untouched', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const before = lsPlanning(p);

    const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION });
    assert.ok(!report.applied.some((a) => a.id === '0010'), JSON.stringify(report.applied));
    assert.ok(report.pending_confirm.some((m) => m.id === '0010'), JSON.stringify(report.pending_confirm));
    assert.deepEqual(lsPlanning(p).filter((f) => before.includes(f)), before, 'no tracked planning path removed');
    assert.equal(gitignoreText(p), null);
  });

  test('13b. upgrade.apply --only 0010 --confirm applies it and stamps 0010', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);

    const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: '0010', confirm: true });
    assert.deepEqual(report.failed, []);
    assert.ok(report.applied.some((a) => a.id === '0010'));
    assert.deepEqual(lsPlanning(p), ['.planning/STACK.md', '.planning/config.json']);
    const stamp = JSON.parse(fs.readFileSync(path.join(p.root, '.planning/config.json'), 'utf-8')).devflow;
    assert.ok(stamp.migrations_applied.includes('0010'));
  });
});
