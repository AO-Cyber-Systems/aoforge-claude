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

const MIGRATION_PATH = path.join(__dirname, '0008-runtime-state-untrack.cjs');
const GUARD = '.planning/.progress-guard.json';
const CACHE = '.planning/.awareness-cache.json';
const GITIGNORE = '.gitignore';
const HEADER = '# DevFlow runtime state (migration 0008)';
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

  test('8. contract: id 0008, safety auto, semver since, RUNTIME_STATE_FILES; registry has it last, in id order', () => {
    const m = m0008();
    assert.equal(m.id, '0008');
    assert.equal(m.safety, 'auto');
    assert.equal(m.since, '2.12.0');
    assert.equal(typeof m.title, 'string');
    assert.ok(m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    assert.deepEqual(m.RUNTIME_STATE_FILES, [GUARD, CACHE]);

    const registry = upgrade.loadRegistry();
    const ids = registry.map((r) => r.id);
    assert.deepEqual(ids, [...ids].sort(), 'registry is in id order');
    assert.equal(ids[ids.length - 1], '0008');
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

  test('5d2. a .planning/ rule counts as ignored (check-ignore, not string matching) -> applies:false', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [GUARD, CACHE], gitignore: '.planning/\n' });
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

  test('6a. .gitignore absent -> created with the comment and both entries; tracked file untracked, kept on disk', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD] });
    const guardBytes = readRel(p.root, GUARD);

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE, GUARD]);
    assert.match(String(res.notes), /untracked: \.planning\/\.progress-guard\.json/);
    assert.equal(readRel(p.root, GITIGNORE), `${HEADER}\n${GUARD}\n${CACHE}\n`);
    assert.deepEqual(trackedRuntime(p), [], 'guard file no longer in the index');
    assert.equal(readRel(p.root, GUARD), guardBytes, 'working copy never deleted or rewritten');
    assert.equal(git(p, 'check-ignore', '--no-index', '--', GUARD).trim(), GUARD, 'now ignored');
  });

  test('6b. .gitignore with .planning/ -> no entries added, but the tracked file is still rm --cached', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD, CACHE], gitignore: '.planning/\n' });

    const res = m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), '.planning/\n', '.gitignore byte-identical');
    assert.deepEqual(res.changed, [GUARD, CACHE].sort(), '.gitignore omitted from changed');
    assert.deepEqual(trackedRuntime(p), []);
    assert.ok(fs.existsSync(path.join(p.root, GUARD)));
    assert.ok(fs.existsSync(path.join(p.root, CACHE)));
  });

  test('6c. .gitignore with only the guard entry -> only the missing cache entry is appended', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const original = `node_modules/\n${GUARD}\n`;
    const p = project({ tracked: [GUARD], gitignore: original });

    const res = m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), `${original}\n${HEADER}\n${CACHE}\n`);
    assert.deepEqual(res.changed, [GITIGNORE, GUARD]);
    assert.deepEqual(trackedRuntime(p), []);
  });

  test('6d. .gitignore without a trailing newline -> append stays newline-safe', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [GUARD], gitignore: 'node_modules/' });

    m0008().apply(ctxFor(p));
    assert.equal(readRel(p.root, GITIGNORE), `node_modules/\n\n${HEADER}\n${GUARD}\n${CACHE}\n`);
  });

  test('6e. only an untracked, unignored cache on disk -> changed is [.gitignore]; nothing to untrack', (t) => {
    if (!HAS_GIT) return t.skip('git not installed');
    const p = project({ tracked: [], untrackedPresent: [CACHE] });

    const res = m0008().apply(ctxFor(p));
    assert.deepEqual(res.changed, [GITIGNORE]);
    assert.ok(fs.existsSync(path.join(p.root, CACHE)));
    assert.equal(git(p, 'status', '--porcelain', '--', CACHE), '', 'cache no longer shows as untracked');
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
    assert.deepEqual(report.changed_files, [GITIGNORE, GUARD, '.planning/config.json'].sort());
    assert.deepEqual(trackedRuntime(p), []);
  });
});
