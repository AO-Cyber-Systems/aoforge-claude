'use strict';

// TRD 48-10 — migration 0010 store-gitignore (test list items 8-14, GWP-04, U-1, D-17).
// TRD 51-04 — detect defers to an in-progress backfill (tests 1-4, G4); store-mode commit follow-up (test 5, G6).
// TRD 52-01 — STORE_COMMIT_STEPS is the commit-steps builder's store form and names `gh pr start` (test 10).
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
const steps = require('../commit-steps.cjs');

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
  // `kind` set so the confirm migration 0006 is not applicable: `--only 0010 --confirm` lets EVERY applicable
  // confirm migration run (upgrade.cjs selects `named || confirm`), and 0006 without `--kind` fails and halts.
  'PROJECT.md': '---\nkind: app\ndefault_work: feature\n---\n\n# Project\n', // cache
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
    assert.match(det.reason, /7 \.planning\/ path\(s\) still tracked/);
    assert.equal(det.tracked, 7);
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

  // TRD 51-04 (G4): this test used to expect a FAILURE here. A failed 0010 halts every later migration in the runner, so
  // a resumed 0011 backfill (whose queued ops are exactly these pending ones) could never be reached by a bare
  // `upgrade --apply --confirm`. A pending-only journal now makes 0010's detect defer: the runner SKIPS it with the
  // resume command, nothing fails, nothing is untracked and nothing is stamped. `migrate` still refuses (test 9).
  test('9b. through upgrade.apply --only 0010 --confirm a pending op SKIPS 0010 (G4): no failure, no stamp, nothing untracked', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    outbox.enqueue(p.root, [{ kind: 'link-sub-issue', target: { parent: '07', child: '07-01' } }]);
    const before = lsPlanning(p);

    const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: '0010', confirm: true });
    assert.ok(!report.failed.some((f) => f.id === '0010'), `0010 must not fail (it would halt later migrations): ${JSON.stringify(report.failed)}`);
    const skipped = report.skipped.find((s) => s.id === '0010');
    assert.ok(skipped, JSON.stringify(report));
    assert.match(skipped.reason, /--only 0011/);
    assert.ok(!report.applied.some((a) => a.id === '0010'));
    assert.deepEqual(lsPlanning(p), before);
    assert.equal(gitignoreText(p), null);
    const stamp = JSON.parse(fs.readFileSync(path.join(p.root, '.planning/config.json'), 'utf-8')).devflow;
    assert.ok(!stamp.migrations_applied.includes('0010'), 'a deferral is never stamped as applied');
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

describe('migration 0010: defers to an in-progress backfill (TRD 51-04 tests 1-4, G4)', () => {
  const TWO_OPS = [
    { kind: 'link-sub-issue', target: { parent: '07', child: '07-01' } },
    { kind: 'link-sub-issue', target: { parent: '07', child: '07-02' } },
  ];

  function enqueueTwo(p) {
    const q = outbox.enqueue(p.root, TWO_OPS);
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.equal(q.enqueued.length, 2, JSON.stringify(q));
    return q;
  }

  test('1. store on, 2 pending ops (none blocked, not halted) → detect not applicable, naming the 0011 resume command', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    enqueueTwo(p);

    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, false, JSON.stringify(det));
    assert.match(det.reason, /GitHub backfill in progress/);
    assert.match(det.reason, /2 outbox op\(s\) pending/);
    assert.ok(det.reason.includes('df-tools upgrade --apply --only 0011 --confirm'), det.reason);
    assert.match(det.reason, /gh-flush hook/);
  });

  test('2. migrate on the same state still refuses with the unchanged text; apply throws; nothing written', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    enqueueTwo(p);
    const before = lsPlanning(p);

    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.deepEqual(res.details, ['outbox: 2 pending op(s)']);
    assert.match(res.refused, /^0010 refused \(1 blocker\(s\)\): outbox: 2 pending op\(s\)\. Get everything onto GitHub first/);
    assert.throws(() => m0010().apply(ctxFor(p)), /2 pending op/);
    assert.equal(gitignoreText(p), null);
    assert.deepEqual(lsPlanning(p), before);
    assert.equal(fs.existsSync(backupsDir(p.home)), false, 'a refusal makes no backup');
  });

  test('3. a blocked op → detect still applies; migrate refuses naming it', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const q = enqueueTwo(p);
    assert.equal(outbox.markBlocked(p.root, q.enqueued[0], 'remote edit').ok, true);

    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, true, det.reason);
    assert.doesNotMatch(det.reason, /backfill in progress/);
    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.ok(res.details.includes('outbox: 1 blocked op(s)'), JSON.stringify(res.details));
    assert.ok(res.details.includes('outbox: 1 pending op(s)'), JSON.stringify(res.details));
  });

  test('3b. a halted journal (with pending ops) → detect still applies; migrate refuses naming the halt', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    const q = enqueueTwo(p);
    assert.equal(outbox.setHalted(p.root, { reason: 'remote-edit', seq: q.enqueued[0], detail: 'edited on GitHub' }).ok, true);

    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, true, det.reason);
    assert.doesNotMatch(det.reason, /backfill in progress/);
    const res = m0010().migrate(ctxFor(p));
    assert.equal(res.applied, false);
    assert.ok(res.details.includes('outbox: halted (remote-edit)'), JSON.stringify(res.details));
  });

  test('4. store on, empty journal, cache tracked → detect applies (unchanged)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, true, det.reason);
    assert.match(det.reason, /7 \.planning\/ path\(s\) still tracked/);
    assert.equal(det.tracked, 7);
  });

  test('4b. a deferral never hides an already-finished migration: block current + nothing tracked stays "nothing to do"', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project();
    baselineAll(p);
    assert.equal(m0010().migrate(ctxFor(p)).applied, true);
    enqueueTwo(p);
    const det = m0010().detect(ctxFor(p));
    assert.equal(det.applies, false);
    assert.match(det.reason, /only config\.json and STACK\.md are tracked/);
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

    // TRD 50-06: store mode is on and this commit lands on the default branch, which the store-mode gate refuses; the
    // staged-removal handling is what this test is about, so it takes the logged escape.
    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', p.root, 'commit', 'chore: gitignore the planning cache', '--files', '.gitignore', '.planning/'], {
      cwd: p.root, env: { ...fx.gitEnv(p.home), DEVFLOW_SKIP_GH_GATE: '1' }, encoding: 'utf-8',
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

describe('migration 0010: store-mode commit follow-up (TRD 51-04 test 5, G6)', () => {
  // The printed escaped commit line, parsed back into its parts so 5b runs exactly what the notes print.
  const ESCAPED_COMMIT_RE =
    /^\s*DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="([^"]+)" node ~\/\.claude\/devflow\/bin\/df-tools\.cjs commit "([^"]+)" --files (.+)$/m;

  /** A PATH dir holding a `gh` that logs and fails, so nothing here can reach the real GitHub CLI. */
  function ghShim() {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-m0010-gh-')));
    cleanup.push(dir);
    const log = path.join(dir, 'gh.log');
    fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`, { mode: 0o755 });
    return { dir, log };
  }

  function dfCommit(p, shim, message, files, env = {}) {
    const base = { ...fx.gitEnv(p.home), PATH: `${shim.dir}${path.delimiter}${process.env.PATH}` };
    for (const key of ['DEVFLOW_ALLOW_RAW_COMMIT', 'DEVFLOW_SKIP_GH_GATE', 'DEVFLOW_SKIP_GH_GATE_REASON']) delete base[key];
    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', p.root, 'commit', message, '--files', ...files], {
      cwd: p.root, env: { ...base, ...env }, encoding: 'utf-8',
    });
    let json = null;
    try { json = JSON.parse((r.stdout || '').trim()); } catch { /* raw */ }
    return { status: r.status, out: `${r.stdout || ''} ${r.stderr || ''}`, json };
  }

  test('5. the notes print the branch → logged-escape commit → push → PR sequence, never the bare refused command', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const m = m0010();
    assert.equal(typeof m.STORE_COMMIT_STEPS, 'string', 'STORE_COMMIT_STEPS is exported (51-07 prints it after 0011)');
    const p = project();
    baselineAll(p);

    const res = m.migrate(ctxFor(p));
    assert.equal(res.applied, true, JSON.stringify(res));
    assert.ok(res.notes.includes(m.STORE_COMMIT_STEPS), res.notes);
    const s = res.notes;
    const sw = s.indexOf('git switch -c devflow-store-cache');
    const esc = s.indexOf('DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration"');
    const push = s.indexOf('git push -u origin devflow-store-cache');
    assert.ok(sw >= 0 && esc > sw && push > esc, `branch, then escaped commit, then push: ${s}`);
    assert.match(s, /--files \.gitignore \.planning\//);
    assert.match(s, /pull request/);
    assert.match(s, /gate gh/, 'says the escape is logged');
    assert.doesNotMatch(s, /commit with: node /, 'the bare command store mode refuses is gone');

    const p2 = project();
    baselineAll(p2);
    const dry = m.migrate(ctxFor(p2, { dryRun: true }));
    assert.equal(dry.dryRun, true, JSON.stringify(dry));
    assert.ok(dry.notes.includes(m.STORE_COMMIT_STEPS), `a dry run prints the same steps: ${dry.notes}`);
    assert.doesNotMatch(dry.notes, /commit with: node /);
  });

  test('5c (52-01). STORE_COMMIT_STEPS is the builder\'s store form and names the gh pr start route; one escaped line', () => {
    const m = m0010();
    const expected = steps.branchCommitSteps({
      branch: 'devflow-store-cache',
      reason: 'store migration',
      command: steps.commitCommand('chore: gitignore the planning cache (store mode)', ['.gitignore', '.planning/']),
    });
    assert.equal(m.STORE_COMMIT_STEPS, expected);
    assert.match(m.STORE_COMMIT_STEPS, /df-tools gh pr start <objective>/);
    assert.ok(m.STORE_COMMIT_STEPS.endsWith(
      'commit there with: node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" ' +
      '--files .gitignore .planning/'), m.STORE_COMMIT_STEPS);
    assert.equal(m.STORE_COMMIT_STEPS.match(/^\s*DEVFLOW_SKIP_GH_GATE=1 /gm).length, 1, 'ESCAPED_COMMIT_RE matches once');
  });

  test('5b. the printed steps work in store mode: bare commit refused on the new branch, the escaped one lands and logs gate gh', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const m = m0010();
    const p = project();
    baselineAll(p);
    assert.equal(m.migrate(ctxFor(p)).applied, true);
    const shim = ghShim();

    const parsed = ESCAPED_COMMIT_RE.exec(m.STORE_COMMIT_STEPS);
    assert.ok(parsed, `an escaped df-tools commit line is printed: ${m.STORE_COMMIT_STEPS}`);
    const [, reason, message, filesText] = parsed;
    const files = filesText.trim().split(/\s+/);
    assert.deepEqual(files, ['.gitignore', '.planning/']);

    git(p, 'switch', '-q', '-c', 'devflow-store-cache');
    const bare = dfCommit(p, shim, message, files);
    assert.equal(bare.status, 1, `without the escape the gate refuses: ${bare.out}`);
    assert.equal(bare.json && bare.json.reason, 'unlinked_branch', bare.out);

    const r = dfCommit(p, shim, message, files, { DEVFLOW_SKIP_GH_GATE: '1', DEVFLOW_SKIP_GH_GATE_REASON: reason });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.json.committed, true, r.out);
    assert.equal(r.json.gate_escaped, true, r.out);
    const tree = git(p, 'ls-tree', '-r', '--name-only', 'HEAD', '--', '.planning').split('\n').filter(Boolean).sort();
    assert.deepEqual(tree, ['.planning/STACK.md', '.planning/config.json']);
    assert.equal(git(p, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'devflow-store-cache');

    const logFile = path.join(p.root, '.planning', '.override-log.jsonl');
    const log = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(log.length, 1);
    assert.equal(log[0].gate, 'gh');
    assert.equal(log[0].reason, 'store migration');
    assert.equal(fs.existsSync(shim.log), false, 'the printed commit step needs no gh call');
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
