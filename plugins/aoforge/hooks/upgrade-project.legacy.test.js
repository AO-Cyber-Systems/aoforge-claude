'use strict';

/**
 * upgrade-project.js on a legacy project (objective 72, TRD 72-08, INST-04): the SessionStart hook moves `.planning/`
 * to `.aoforge/` (migration 0012) and renames the config stamp key (0013), and commits the move as ONE rename commit.
 *
 * Test list (outermost)
 *  1. A clean legacy git project with a `devflow{version:"2.15.0"}` stamp: after the hook, `.aoforge/` exists and
 *     `.planning/` does not; `git log -1 --name-status` shows only renames of the planning files (R100, except
 *     config.json, whose stamp changed in the same commit) plus `M .gitignore`; `git status --porcelain` is empty;
 *     `.aoforge/config.json` has `aoforge.version` = the bundled version and no `devflow` key.
 *  2. A tracked-dirty legacy project (STATE.md modified): no move, no commit; `.aoforge/.aoforge-notices.json` is not
 *     created; the notice lands in `.planning/` and names "dirty" and `aof-tools upgrade --apply --only 0012`.
 *  3. A mid-merge legacy project (MERGE_HEAD): deferred with reason `merge`.
 *  4. A second session after case 1: the fast path (no migration, no commit, no notice, no backup).
 *  5. A second session after case 2, with the tree clean again: the move happens (the legacy layout kept the
 *     project off the fast path).
 *
 * Every spawn: cwd = the fixture, HOME = the fixture's fake home, CLAUDE_PLUGIN_ROOT = this repository's plugin
 * directory (only read). The detached commit child is awaited with a bounded poll on `git rev-list --count`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../aoforge/bin/lib/legacy-names.cjs');
const { legacyProject } = require('../aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs');

const HOOK = path.join(__dirname, 'upgrade-project.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const BUNDLED = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8')).version;
const SUBJECT = `chore(aoforge): upgrade project to v${BUNDLED}`;
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const ONLY_0012 = 'aof-tools upgrade --apply --only 0012';

function hookEnv(p) {
  return {
    ...p.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    [`${NAMES.envPrefix}SKIP_PRUNE`]: '1',
    [`${NAMES.envPrefix}SKIP_TRANSCRIPT_EXPORT`]: '1',
  };
}

function runHook(p) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd: p.root, env: hookEnv(p), encoding: 'utf-8', input: '{}', timeout: 60000,
  });
  assert.equal(r.status, 0, `hook must exit 0 (stderr: ${r.stderr})`);
  assert.equal(r.stdout, '', 'SessionStart stdout stays empty');
  return r;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pollUntil(fn, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v || Date.now() >= end) return v;
    sleep(200);
  }
}

function commitCount(p) {
  return Number(p.git(['rev-list', '--count', 'HEAD']).trim());
}

function noticesIn(p, dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(p.root, dir, NAMES.notices), 'utf-8')).notices || [];
  } catch {
    return [];
  }
}

/** The hook's deferral notice (notices.cjs keeps source/level/message/detail/key; the kind rides in detail). */
function isDeferral(n) {
  return n.source === 'upgrade-project' && n.detail && n.detail.kind === 'deferred' && n.detail.id === '0012';
}

function backups(p) {
  const base = path.join(p.home, '.claude', NAMES.runtimeDir, 'backups');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).flatMap((k) => fs.readdirSync(path.join(base, k)).map((ts) => `${k}/${ts}`)).sort();
}

function trackedPlanning(p, dir) {
  return p.git(['ls-files', '--', dir]).trim().split('\n').filter(Boolean).sort();
}

/** Run the hook and wait for its detached commit child: the commit count rising, then the child's notice. */
function runHookAndAwaitCommit(p) {
  const before = commitCount(p);
  runHook(p);
  const landed = pollUntil(() => commitCount(p) > before);
  assert.ok(landed, `the background commit landed (notices: ${JSON.stringify(noticesIn(p, NEW))})`);
  pollUntil(() => noticesIn(p, NEW).some((n) => n.source === 'upgrade-commit'));
}

/** Case 1's assertions over a project the hook has just moved. */
function assertMovedAndCommitted(p, legacyTracked) {
  assert.ok(fs.existsSync(path.join(p.root, NEW)), `${NEW}/ exists`);
  assert.equal(fs.existsSync(path.join(p.root, OLD)), false, `${OLD}/ is gone`);
  assert.equal(p.git(['log', '-1', '--format=%s']).trim(), SUBJECT);

  const lines = p.git(['log', '-1', '--name-status', '--format=']).trim().split('\n').filter(Boolean);
  const renames = [];
  for (const line of lines) {
    const [status, a, b] = line.split('\t');
    if (status === 'M' && a === '.gitignore') continue;
    assert.match(status, /^R\d{3}$/, `only renames and M .gitignore: ${lines.join(' | ')}`);
    assert.equal(b, `${NEW}/${a.slice(OLD.length + 1)}`, line);
    if (a !== `${OLD}/config.json`) assert.equal(status, 'R100', `an exact rename: ${line}`);
    renames.push(a);
  }
  assert.deepEqual(renames.sort(), legacyTracked, 'every tracked planning file was renamed');

  assert.equal(p.git(['status', '--porcelain']), '', 'the work tree is clean after the commit');
  const cfg = JSON.parse(fs.readFileSync(path.join(p.root, NEW, 'config.json'), 'utf-8'));
  assert.equal(cfg.aoforge && cfg.aoforge.version, BUNDLED);
  assert.equal(LEGACY.configKey in cfg, false, 'no legacy stamp key');
  assert.ok(fs.existsSync(path.join(p.root, NEW, '.skill-active')), 'the excluded marker moved along');
}

describe('upgrade-project on a legacy project', () => {
  test('1 + 4. a clean legacy project is moved in one rename commit; the next session takes the fast path', () => {
    const p = legacyProject({ state: 'clean' });
    try {
      const legacyTracked = trackedPlanning(p, OLD);
      runHookAndAwaitCommit(p);
      assertMovedAndCommitted(p, legacyTracked);
      assert.ok(
        noticesIn(p, NEW).some((n) => n.source === 'upgrade-project' && /upgraded this project/.test(n.message)),
        JSON.stringify(noticesIn(p, NEW)),
      );

      // 4. the second session: fast path
      const head = p.git(['rev-parse', 'HEAD']).trim();
      const noticesBytes = fs.readFileSync(path.join(p.root, NEW, NAMES.notices), 'utf-8');
      const backupsBefore = backups(p);
      runHook(p);
      sleep(500);
      assert.equal(p.git(['rev-parse', 'HEAD']).trim(), head, 'no commit');
      assert.equal(fs.readFileSync(path.join(p.root, NEW, NAMES.notices), 'utf-8'), noticesBytes, 'no notice');
      assert.deepEqual(backups(p), backupsBefore, 'no backup');
      assert.equal(p.git(['status', '--porcelain']), '');
    } finally {
      p.cleanup();
    }
  });

  test('2 + 5. a dirty legacy project is deferred with a notice; once clean, the next session moves it', () => {
    const p = legacyProject({ state: 'dirty' });
    try {
      const head = p.git(['rev-parse', 'HEAD']).trim();
      const cfgBefore = fs.readFileSync(path.join(p.dir, 'config.json'), 'utf-8');
      runHook(p);
      sleep(500);
      assert.equal(p.git(['rev-parse', 'HEAD']).trim(), head, 'no commit');
      assert.ok(fs.existsSync(p.dir), `${OLD}/ stays`);
      assert.equal(fs.existsSync(path.join(p.root, NEW)), false, `${NEW}/ is not created`);
      assert.equal(fs.existsSync(path.join(p.root, NEW, NAMES.notices)), false);
      assert.equal(fs.readFileSync(path.join(p.dir, 'config.json'), 'utf-8'), cfgBefore, 'config.json untouched');

      const deferred = noticesIn(p, OLD).filter(isDeferral);
      assert.equal(deferred.length, 1, JSON.stringify(noticesIn(p, OLD)));
      assert.match(deferred[0].message, /dirty/);
      assert.ok(deferred[0].message.includes(ONLY_0012), deferred[0].message);
      assert.equal(deferred[0].detail.reason, 'dirty');
      assert.equal(deferred[0].detail.command, ONLY_0012);
      assert.equal(p.git(['status', '--porcelain', '--untracked-files=all']).replace(/\n+$/, ''), ` M ${OLD}/STATE.md`,
        'only the user\'s own edit is pending; the notices file is excluded');

      // 5. the user commits nothing but discards the edit; the next session is not on the fast path
      p.git(['checkout', '--', `${OLD}/STATE.md`]);
      const legacyTracked = trackedPlanning(p, OLD);
      runHookAndAwaitCommit(p);
      assertMovedAndCommitted(p, legacyTracked);
    } finally {
      p.cleanup();
    }
  });

  test('3. a merge in progress defers the move with reason merge', () => {
    const p = legacyProject({ state: 'merge' });
    try {
      const head = p.git(['rev-parse', 'HEAD']).trim();
      runHook(p);
      sleep(500);
      assert.equal(p.git(['rev-parse', 'HEAD']).trim(), head, 'no commit');
      assert.ok(fs.existsSync(p.dir), `${OLD}/ stays`);
      assert.equal(fs.existsSync(path.join(p.root, NEW)), false);
      const deferred = noticesIn(p, OLD).filter(isDeferral);
      assert.equal(deferred.length, 1, JSON.stringify(noticesIn(p, OLD)));
      assert.equal(deferred[0].detail.reason, 'merge');
      assert.match(deferred[0].message, /merge/);
      assert.ok(deferred[0].message.includes(ONLY_0012));
    } finally {
      p.cleanup();
    }
  });
});
