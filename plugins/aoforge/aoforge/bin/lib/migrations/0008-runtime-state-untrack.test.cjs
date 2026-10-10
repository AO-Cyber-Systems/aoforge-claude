'use strict';

// TRD 44-06 — migration 0008 runtime-state-untrack (test list items 5-8).
//
// no_llm_test_data: every project comes from makeTrackedRuntimeStateProject (upgrade-fixtures.cjs):
// a disposable temp git repo with a local identity, signing off, and a fake HOME. Fixture git
// calls go through gitEnv(home). Nothing here runs against this repository or the real ~/.claude.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { LEGACY } = require('../legacy-names.cjs');

const MIGRATION_PATH = path.join(__dirname, '0008-runtime-state-untrack.cjs');
const GUARD = '.aoforge/.progress-guard.json';
const CACHE = '.aoforge/.awareness-cache.json';
const LOG = '.aoforge/.dup-detect-log.jsonl'; // TRD 75-02: the third runtime-state file
const TODOS_CACHE = '.aoforge/.check-todos-cache.json'; // TRD 75-02 audit: check-todos.cjs
const DEPRECATION_LOG = '.aoforge/.deprecation-log.jsonl'; // TRD 75-02 audit: skill-route.cjs
const OVERRIDE_LOG = '.aoforge/.override-log.jsonl'; // TRD 75-02 audit: override.cjs
// Every root path 0008 covers, in the migration's own order. The .gitignore bodies below derive from it.
const ALL_RUNTIME = [GUARD, CACHE, LOG, TODOS_CACHE, DEPRECATION_LOG, OVERRIDE_LOG];
const GITIGNORE = '.gitignore';
const HEADER = '# AOForge runtime state (migration 0008)';
const PLUGIN_VERSION = '2.12.0';

const HAS_GIT = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0008() {
  return require(MIGRATION_PATH);
}

function project(opts) {
  const p = fx.makeTrackedRuntimeStateProject(opts);
  cleanup.push(p.root, p.home);
  return p;
}

function ctxFor({ root, home }, { dryRun = false } = {}) {
  return { projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

function git({ root, home }, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: fx.gitEnv(home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function trackedRuntime(p) {
  return git(p, 'ls-files', '--', GUARD, CACHE).split('\n').filter(Boolean).sort();
}

function readRel(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

function indexSnapshot(p) {
  return git(p, 'ls-files', '-s');
}

describe('migration 0008 runtime-state-untrack', () => {
  // ─── 8. contract + registry ─────────────────────────────────────────────────

  test('8. contract: id 0008, safety auto, semver since, RUNTIME_STATE_FILES; registry has it, in id order', () => {
    const m = m0008();
    assert.equal(m.id, '0008');
    assert.equal(m.safety, 'auto');
    assert.equal(m.since, '2.12.0');
    assert.equal(typeof m.title, 'string');
    assert.ok(m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    // TRD 75-02: the dup-detect log and three audited dotfiles joined the list; RUNTIME_STATE_FILES derives from
    // RUNTIME_STATE_BASENAMES.
    assert.deepEqual(m.RUNTIME_STATE_FILES, ALL_RUNTIME);

    const registry = upgrade.loadRegistry();
    const ids = registry.map((r) => r.id);
    assert.deepEqual(ids, [...ids].sort(), 'registry is in id order');
    // 0008 used to be the newest migration; later ones (0009+) sort after it, so assert it is present
    // and is the newest id AT OR BELOW itself rather than the last entry in the registry.
    assert.ok(ids.includes('0008'), '0008 is registered');
    assert.equal(ids.filter((id) => id <= '0008').pop(), '0008');
    const entry = registry.find((r) => r.id === '0008');
    assert.equal(entry.safety, 'auto');
  });

  // ─── 5. detect ──────────────────────────────────────────────────────────────

  test('5a. tracked guard file -> applies', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, true);
    assert.match(det.reason, /\.progress-guard\.json/);
    assert.match(det.reason, /tracked/);
  });

  test('5b. untracked, unignored awareness cache on disk -> applies', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [CACHE] });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, true);
    assert.match(det.reason, /\.awareness-cache\.json/);
  });

  test('5c. both files absent -> applies:false (a fresh fixture is unaffected)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [] });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, false);
  });

  test('5d. both files ignored and untracked -> applies:false', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [GUARD, CACHE], gitignore: `${GUARD}\n${CACHE}\n` });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, false);
  });

  test('5d2. a .aoforge/ rule counts as ignored (check-ignore, not string matching) -> applies:false', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [GUARD, CACHE], gitignore: '.aoforge/\n' });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, false);
  });

  test('5e. non-git directory -> applies:false, reason "not a git work tree"', () => {
    const root = fx.makeStampedProject('2.0.0');
    const home = fx.makeFakeHome();
    cleanup.push(root, home);
    fs.writeFileSync(path.join(root, GUARD), '{}\n');
    const det = m0008().detect({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun: true, options: {} });
    assert.equal(det.applies, false);
    assert.equal(det.reason, 'not a git work tree');
  });

  test('5f. dryRun apply writes nothing and runs no mutating git command', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD], untrackedPresent: [CACHE] });
    const beforeFiles = fx.snapshot(p.root);
    const beforeIndex = indexSnapshot(p);

    const res = m0008().apply(ctxFor(p, { dryRun: true }));
    assert.deepEqual(res.changed, [GITIGNORE, GUARD], 'reports what WOULD change');
    assert.deepEqual(fx.diffSnapshots(beforeFiles, fx.snapshot(p.root)), [], 'no file written');
    assert.equal(indexSnapshot(p), beforeIndex, 'index untouched (no git rm --cached)');
    assert.deepEqual(trackedRuntime(p), [GUARD]);
  });

  // ─── 6. apply ───────────────────────────────────────────────────────────────

  test('6a. .gitignore absent -> created with the comment and every entry; tracked file untracked, kept on disk', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    const guardBytes = readRel(p.root, GUARD);

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE, GUARD]);
    assert.match(String(res.notes), /untracked: \.aoforge\/\.progress-guard\.json/);
    // TRD 75-02: the root paths always need cover, so every root entry is written, in the migration's order.
    assert.equal(readRel(p.root, GITIGNORE), `${HEADER}\n${ALL_RUNTIME.join('\n')}\n`);
    assert.deepEqual(trackedRuntime(p), [], 'guard file no longer in the index');
    assert.equal(readRel(p.root, GUARD), guardBytes, 'working copy never deleted or rewritten');
    assert.equal(git(p, 'check-ignore', '--no-index', '--', GUARD).trim(), GUARD, 'now ignored');
  });

  test('6b. .gitignore with .aoforge/ -> no entries added, but the tracked file is still rm --cached', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD, CACHE], gitignore: '.aoforge/\n' });

    const res = m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), '.aoforge/\n', '.gitignore byte-identical');
    assert.deepEqual(res.changed, [GUARD, CACHE].sort(), '.gitignore omitted from changed');
    assert.deepEqual(trackedRuntime(p), []);
    assert.ok(fs.existsSync(path.join(p.root, GUARD)));
    assert.ok(fs.existsSync(path.join(p.root, CACHE)));
  });

  test('6c. .gitignore with only the guard entry -> only the missing entries are appended', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const original = `node_modules/\n${GUARD}\n`;
    const p = project({ tracked: [GUARD], gitignore: original });

    const res = m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), `${original}\n${HEADER}\n${ALL_RUNTIME.filter((f) => f !== GUARD).join('\n')}\n`);
    assert.deepEqual(res.changed, [GITIGNORE, GUARD]);
    assert.deepEqual(trackedRuntime(p), []);
  });

  test('6d. .gitignore without a trailing newline -> append stays newline-safe', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD], gitignore: 'node_modules/' });

    m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), `node_modules/\n\n${HEADER}\n${ALL_RUNTIME.join('\n')}\n`);
  });

  test('6e. only an untracked, unignored cache on disk -> changed is [.gitignore]; nothing to untrack', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [CACHE] });

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE]);
    assert.ok(fs.existsSync(path.join(p.root, CACHE)));
    assert.equal(git(p, 'status', '--porcelain', '--', CACHE), '', 'cache no longer shows as untracked');
  });

  test('6f. staged copy differs from HEAD and from the working file (hook rewrote it after git add) -> still untracked', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    fs.writeFileSync(path.join(p.root, GUARD), '{\n  "count": 2\n}\n');
    git(p, 'add', '--', GUARD);
    const latest = '{\n  "count": 3\n}\n';
    fs.writeFileSync(path.join(p.root, GUARD), latest);

    // Precondition: this is the state in which a plain `git rm --cached` refuses.
    const plain = spawnSync('git', ['-C', p.root, 'rm', '--cached', '--quiet', '--', GUARD], {
      env: fx.gitEnv(p.home), encoding: 'utf-8',
    });
    assert.notEqual(plain.status, 0, 'plain rm --cached refuses a staged copy that differs from both sides');

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE, GUARD]);
    assert.deepEqual(trackedRuntime(p), []);
    assert.equal(readRel(p.root, GUARD), latest, 'working copy keeps the latest bytes');
  });

  // ─── 7. idempotency ─────────────────────────────────────────────────────────

  test('7. apply -> detect applies:false; a second apply is a no-op (changed [], .gitignore byte-identical)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD], untrackedPresent: [CACHE], gitignore: 'dist/\n' });
    const m = m0008();

    m.apply(ctxFor(p));
    const det = m.detect(ctxFor(p, { dryRun: true }));
    assert.equal(det.applies, false, `detect after apply: ${det.reason}`);

    const gitignoreAfterFirst = readRel(p.root, GITIGNORE);
    const indexAfterFirst = indexSnapshot(p);
    const second = m.apply(ctxFor(p));
    assert.deepEqual(second.changed, []);
    assert.equal(readRel(p.root, GITIGNORE), gitignoreAfterFirst);
    assert.equal(indexSnapshot(p), indexAfterFirst);
  });

  // ─── runner integration ─────────────────────────────────────────────────────

  test('runner: upgrade.apply on a tracked guard file applies 0008 and unions its paths into changed_files', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });

    const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION });
    assert.deepEqual(report.failed, []);
    assert.ok(report.applied.some((a) => a.id === '0008'), `applied: ${JSON.stringify(report.applied)}`);
    assert.deepEqual(report.changed_files, [GITIGNORE, GUARD, '.aoforge/config.json'].sort());
    assert.deepEqual(trackedRuntime(p), []);
  });
});

// ─── TRD 45-02: nested `.aoforge/` runtime state (DOC-02) ─────────────────────
//
// aodex also tracks `flutter/.aoforge/.progress-guard.json`, which the root-only 0008 never saw.
// Discovery goes through git pathspecs (`:(glob)**/.aoforge/<name>`), never a filesystem walk.

const NESTED_GUARD = 'flutter/.aoforge/.progress-guard.json';
const NESTED_CACHE = 'packages/app/.aoforge/.awareness-cache.json';
const RUNTIME_GLOBS = [
  ':(glob)**/.aoforge/.progress-guard.json',
  ':(glob)**/.aoforge/.awareness-cache.json',
];

/** Every runtime-state path git tracks at any depth, sorted. */
function trackedRuntimeAnyDepth(p) {
  return git(p, 'ls-files', '--', ...RUNTIME_GLOBS).split('\n').filter(Boolean).sort();
}

function isIgnored(p, rel) {
  const r = spawnSync('git', ['-C', p.root, '-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '--', rel], {
    env: fx.gitEnv(p.home), encoding: 'utf-8',
  });
  return r.status === 0;
}

describe('nested runtime state (TRD 45-02)', () => {
  test('1. isRuntimeStatePath: `.aoforge/<basename>` at any depth, nothing else', () => {
    const { isRuntimeStatePath, RUNTIME_STATE_BASENAMES } = m0008();
    assert.deepEqual(RUNTIME_STATE_BASENAMES, ALL_RUNTIME.map((f) => path.posix.basename(f))); // 75-02
    assert.equal(isRuntimeStatePath('.aoforge/.progress-guard.json'), true);
    assert.equal(isRuntimeStatePath('flutter/.aoforge/.awareness-cache.json'), true);
    assert.equal(isRuntimeStatePath('a/b/c/.aoforge/.progress-guard.json'), true);
    assert.equal(isRuntimeStatePath('.aoforge/progress-guard.json'), false);
    assert.equal(isRuntimeStatePath('x/planning/.progress-guard.json'), false);
    assert.equal(isRuntimeStatePath('.aoforge/sub/.progress-guard.json'), false);
    assert.equal(isRuntimeStatePath('.progress-guard.json'), false);
  });

  test('2. tracked nested guard only (root clean) -> applies, reason names the nested path', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [NESTED_GUARD] });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, true);
    assert.match(det.reason, /tracked: /);
    assert.ok(det.reason.includes(NESTED_GUARD), det.reason);
  });

  test('3. apply on a nested tracked guard: untracked, working copy byte-identical, now ignored', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [NESTED_GUARD] });
    const bytes = readRel(p.root, NESTED_GUARD);

    const res = m0008().apply(ctxFor(p));
    assert.ok(res.changed.includes(NESTED_GUARD), JSON.stringify(res.changed));
    assert.ok(res.changed.includes(GITIGNORE));
    assert.deepEqual(trackedRuntimeAnyDepth(p), [], 'nested file no longer in the index');
    assert.equal(readRel(p.root, NESTED_GUARD), bytes, 'working copy never deleted or rewritten');
    assert.equal(git(p, 'check-ignore', '--no-index', '--', NESTED_GUARD).trim(), NESTED_GUARD);
  });

  test('4. aodex shape (root guard + nested guard + nested cache): all untracked, all ignored, changed sorted', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD, NESTED_GUARD, NESTED_CACHE] });
    const sizes = [GUARD, NESTED_GUARD, NESTED_CACHE].map((rel) => readRel(p.root, rel));

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE, ...[GUARD, NESTED_GUARD, NESTED_CACHE].sort()]);
    assert.deepEqual(trackedRuntimeAnyDepth(p), []);
    for (const rel of [GUARD, NESTED_GUARD, NESTED_CACHE]) {
      assert.ok(isIgnored(p, rel), `${rel} is ignored`);
      assert.ok(fs.existsSync(path.join(p.root, rel)), `${rel} still on disk`);
    }
    assert.deepEqual([GUARD, NESTED_GUARD, NESTED_CACHE].map((rel) => readRel(p.root, rel)), sizes);
  });

  test('5. re-run after apply: detect applies:false; a second apply leaves .gitignore byte-identical, changed []', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD, NESTED_GUARD, NESTED_CACHE] });
    const m = m0008();

    m.apply(ctxFor(p));
    assert.deepEqual(trackedRuntimeAnyDepth(p), [], 'first apply untracked every depth');
    const det = m.detect(ctxFor(p, { dryRun: true }));
    assert.equal(det.applies, false, `detect after apply: ${det.reason}`);

    const gitignoreAfterFirst = readRel(p.root, GITIGNORE);
    const indexAfterFirst = indexSnapshot(p);
    const second = m.apply(ctxFor(p));
    assert.deepEqual(second.changed, []);
    assert.equal(readRel(p.root, GITIGNORE), gitignoreAfterFirst);
    assert.equal(indexSnapshot(p), indexAfterFirst);
  });

  test('6. nested file present, untracked and unignored -> applies; afterwards ignored and still on disk', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [NESTED_GUARD] });
    const m = m0008();

    const det = m.detect(ctxFor(p));
    assert.equal(det.applies, true);
    assert.match(det.reason, /present and not ignored: /);
    assert.ok(det.reason.includes(NESTED_GUARD), det.reason);

    m.apply(ctxFor(p));
    assert.ok(isIgnored(p, NESTED_GUARD));
    assert.ok(fs.existsSync(path.join(p.root, NESTED_GUARD)));
    assert.equal(m.detect(ctxFor(p, { dryRun: true })).applies, false);
  });

  test('7. nested file already ignored by a `**/.aoforge/` rule and untracked -> applies:false', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [NESTED_GUARD], gitignore: '**/.aoforge/\n' });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, false, det.reason);
  });

  test('9. discover(ctx) -> {tracked, present, unignored}: project-relative posix paths, sorted, deduped', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD, NESTED_GUARD], untrackedPresent: [NESTED_CACHE] });
    const found = m0008().discover(ctxFor(p));

    assert.deepEqual(Object.keys(found).sort(), ['present', 'tracked', 'unignored']);
    assert.deepEqual(found.tracked, [GUARD, NESTED_GUARD].sort());
    assert.deepEqual(found.present, [GUARD, NESTED_GUARD, NESTED_CACHE].sort());
    assert.deepEqual(found.unignored, [NESTED_CACHE]);
    for (const rel of [...found.tracked, ...found.present, ...found.unignored]) {
      assert.ok(!rel.includes('\\') && !path.isAbsolute(rel), `${rel} is project-relative posix`);
    }
  });

  test('discover on a non-git directory is empty rather than throwing', () => {
    const root = fx.makeStampedProject('2.0.0');
    const home = fx.makeFakeHome();
    cleanup.push(root, home);
    fs.mkdirSync(path.join(root, 'flutter/.aoforge'), { recursive: true });
    fs.writeFileSync(path.join(root, NESTED_GUARD), '{}\n');
    const found = m0008().discover({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun: true, options: {} });
    assert.deepEqual(found, { tracked: [], present: [], unignored: [] });
  });
});

// ─── TRD 75-02: the dup-detect log is runtime state too ───────────────────────
//
// dup-detect.cjs recordResolution appends to `.aoforge/.dup-detect-log.jsonl`. In the 72-25 fleet sweep it was a tracked
// file with uncommitted changes (it alone made 0012 defer in two repositories) or an untracked, unignored file that an
// upgrade commit swept in. Cases 6-8 and 10 of the 75-02 test list (case 9 is in the 0012 legacy suite).

const NESTED_LOG = 'flutter/.aoforge/.dup-detect-log.jsonl';
const LEGACY_DIR = LEGACY.planningDir;
const NESTED_LEGACY_LOG = `sub/${LEGACY_DIR}/.dup-detect-log.jsonl`;

describe('the dup-detect log (TRD 75-02)', () => {
  test('6. a tracked log is detected, apply untracks it (index only) and the working file is byte-identical', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [LOG] });
    const bytes = readRel(p.root, LOG);
    assert.equal(bytes, fx.RUNTIME_STATE_CONTENT['.dup-detect-log.jsonl'], 'precondition: the fixture body');

    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, true, det.reason);
    assert.ok(det.reason.includes(LOG), det.reason);

    const res = m0008().apply(ctxFor(p));
    assert.ok(res.changed.includes(LOG), JSON.stringify(res.changed));
    assert.ok(res.changed.includes(GITIGNORE), JSON.stringify(res.changed));
    assert.equal(git(p, 'ls-files', '--', LOG).trim(), '', 'the log is no longer in the index');
    assert.equal(readRel(p.root, LOG), bytes, 'working copy never deleted or rewritten');
    assert.equal(git(p, 'check-ignore', '--no-index', '--', LOG).trim(), LOG, 'now ignored');
  });

  test('7a. an untracked, unignored log gets a .gitignore entry and git reports it ignored', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [LOG] });
    assert.equal(m0008().detect(ctxFor(p)).applies, true);

    const res = m0008().apply(ctxFor(p));
    assert.ok(res.changed.includes(GITIGNORE), JSON.stringify(res.changed));
    assert.ok(readRel(p.root, GITIGNORE).split('\n').includes(LOG), readRel(p.root, GITIGNORE));
    assert.equal(git(p, 'check-ignore', '--no-index', '--', LOG).trim(), LOG);
    assert.equal(git(p, 'status', '--porcelain', '--', LOG), '', 'no longer shows as untracked');
    assert.ok(fs.existsSync(path.join(p.root, LOG)), 'still on disk');
  });

  test('7b. under both planning directory names, at any depth: the nested log is covered by a `**/<dir>/` entry', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [NESTED_LOG, NESTED_LEGACY_LOG] });
    const det = m0008().detect(ctxFor(p));
    assert.equal(det.applies, true, det.reason);
    assert.ok(det.reason.includes(NESTED_LOG) && det.reason.includes(NESTED_LEGACY_LOG), det.reason);

    m0008().apply(ctxFor(p));
    const lines = readRel(p.root, GITIGNORE).split('\n');
    assert.ok(lines.includes('**/.aoforge/.dup-detect-log.jsonl'), lines.join('|'));
    assert.ok(lines.includes(`**/${LEGACY_DIR}/.dup-detect-log.jsonl`), lines.join('|'));
    assert.ok(isIgnored(p, NESTED_LOG), `${NESTED_LOG} is ignored`);
    assert.ok(isIgnored(p, NESTED_LEGACY_LOG), `${NESTED_LEGACY_LOG} is ignored`);
    assert.equal(m0008().detect(ctxFor(p, { dryRun: true })).applies, false);
  });

  test('8. isRuntimeStatePath: the log at the root and nested is runtime state; STATE.md is not', () => {
    const { isRuntimeStatePath, RUNTIME_STATE_BASENAMES } = m0008();
    assert.ok(RUNTIME_STATE_BASENAMES.includes('.dup-detect-log.jsonl'), RUNTIME_STATE_BASENAMES.join('|'));
    assert.equal(isRuntimeStatePath(LOG), true);
    assert.equal(isRuntimeStatePath(NESTED_LOG), true);
    assert.equal(isRuntimeStatePath(NESTED_LEGACY_LOG), true);
    assert.equal(isRuntimeStatePath('.aoforge/STATE.md'), false);
    assert.equal(isRuntimeStatePath('.aoforge/sub/.dup-detect-log.jsonl'), false);
    assert.equal(isRuntimeStatePath('.dup-detect-log.jsonl'), false);
  });

  test('10. a project already stamped with 0008 and a tracked log still detects 0008 (detection-based runner)', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [LOG] });
    upgrade.writeStamp(p.root, { version: '2.12.0', migrations_applied: ['0001', '0008'], upgraded_at: '2026-10-01T00:00:00.000Z' });

    assert.equal(m0008().detect(ctxFor(p)).applies, true, 'detect ignores the stamp');
    const report = upgrade.check({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, only: ['0008'] });
    assert.deepEqual(report.pending.map((x) => x.id), ['0008'], JSON.stringify(report));
  });
});

// ─── TRD 75-02, step 2 of the todo: the dotfile audit ─────────────────────────
//
// Every dotfile the runtime writes under the planning directory was classified (the table is in 75-02-SUMMARY.md). The
// three below are appended or rewritten at runtime on every machine, are never meant to be shared, and this
// repository's own .gitignore already lists them as local state. One named case each.

/** A tracked `rel` is detected, untracked by apply (working copy byte-identical) and ignored afterwards. */
function assertRuntimeStateUntracked(t, rel) {
  if (!HAS_GIT) return t.skip('git not installed');
  assert.equal(m0008().isRuntimeStatePath(rel), true, `${rel} is runtime state`);
  assert.equal(m0008().isRuntimeStatePath(`flutter/${rel}`), true, `and nested`);
  const p = project({ tracked: [rel] });
  const bytes = readRel(p.root, rel);

  const det = m0008().detect(ctxFor(p));
  assert.equal(det.applies, true, det.reason);
  assert.ok(det.reason.includes(rel), det.reason);

  const res = m0008().apply(ctxFor(p));
  assert.ok(res.changed.includes(rel), JSON.stringify(res.changed));
  assert.equal(git(p, 'ls-files', '--', rel).trim(), '', 'no longer in the index');
  assert.equal(readRel(p.root, rel), bytes, 'working copy never deleted or rewritten');
  assert.equal(git(p, 'check-ignore', '--no-index', '--', rel).trim(), rel, 'now ignored');
}

describe('the dotfile audit (TRD 75-02)', () => {
  test('12a. .check-todos-cache.json (check-todos.cjs: a TTL cache rewritten on every todo list) is runtime state', (t) => {
    assertRuntimeStateUntracked(t, TODOS_CACHE);
  });

  test('12b. .deprecation-log.jsonl (skill-route.cjs: a local audit trail, gitignored by locked decision) is runtime state', (t) => {
    assertRuntimeStateUntracked(t, DEPRECATION_LOG);
  });

  test('12c. .override-log.jsonl (override.cjs: a bounded local audit log) is runtime state', (t) => {
    assertRuntimeStateUntracked(t, OVERRIDE_LOG);
  });

  test('12d. dotfiles that are committed by design, transient, or owned elsewhere are NOT 0008 runtime state', () => {
    const { isRuntimeStatePath } = m0008();
    // committed by design: the GitHub mapping and the sync state the pull/drift commands compare against
    assert.equal(isRuntimeStatePath('.aoforge/.gh-mapping.json'), false);
    assert.equal(isRuntimeStatePath('.aoforge/.gh-sync-state.json'), false);
    // transient (removed by the flow that wrote it) or one-shot (adopt excludes it from its own commit)
    assert.equal(isRuntimeStatePath('.aoforge/.micro-description'), false);
    assert.equal(isRuntimeStatePath('.aoforge/.adopt-inferences.json'), false);
    // owned by other checks: validate health E006/W064 and doctor 23 (skill markers), the notices store, doctor 20 (markers)
    assert.equal(isRuntimeStatePath('.aoforge/.skill-active'), false);
    assert.equal(isRuntimeStatePath('.aoforge/.edit-override'), false);
    assert.equal(isRuntimeStatePath('.aoforge/.aoforge-notices.json'), false);
    assert.equal(isRuntimeStatePath('.aoforge/.autonomous-retry-abc'), false);
  });
});
