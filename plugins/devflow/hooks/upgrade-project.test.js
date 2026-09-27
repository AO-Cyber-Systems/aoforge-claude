'use strict';

/**
 * Tests for upgrade-project.js — the SessionStart hook that upgrades a behind DevFlow project in
 * place (TRD 36-05, UPG-05).
 *
 * Every spawn runs with cwd = a disposable fixture project and HOME = a disposable fake home
 * (`gitEnv(fakeHome)`), and CLAUDE_PLUGIN_ROOT = this repo's plugin dir, which is only READ.
 * Nothing here touches the real ~/.claude or this repository. Git fixtures come from
 * `initGitFixture`, which disables signing on the FIXTURE repo only; the signing-failure case
 * re-enables it on its own fixture with a gpg program that always fails.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const F = require('../devflow/bin/lib/__fixtures__/upgrade-fixtures.cjs');

const HOOK = path.join(__dirname, 'upgrade-project.js');
const ROUTE = path.join(__dirname, 'route-results.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const BUNDLED = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'),
).version;
const NOTICES_REL = '.planning/.devflow-notices.json';
const SUBJECT = `chore(devflow): upgrade project to v${BUNDLED}`;
const ESCAPES = ['DEVFLOW_SKIP_UPGRADE', 'DEVFLOW_SKIP_NOTICES', 'DEVFLOW_SKIP_HANDOFF_RESULTS'];

const cleanup = [];
after(() => {
  for (const d of cleanup) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function hookEnv(home, extra = {}) {
  const env = { ...F.gitEnv(home), CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT };
  for (const k of ESCAPES) delete env[k];
  return { ...env, ...extra };
}

function runHook(cwd, home, extra) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd, env: hookEnv(home, extra), encoding: 'utf-8', input: '{}', timeout: 60000,
  });
  assert.equal(r.status, 0, `hook must exit 0 (stderr: ${r.stderr})`);
  assert.equal(r.stdout, '', 'SessionStart hook stdout must stay empty');
  return r;
}

function runRoute(cwd, home, extra) {
  return spawnSync(process.execPath, [ROUTE], {
    cwd, env: hookEnv(home, extra), encoding: 'utf-8', input: '{}', timeout: 30000,
  });
}

function git(root, home, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: F.gitEnv(home), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitCount(root, home) {
  return Number(git(root, home, 'rev-list', '--count', 'HEAD'));
}

function gitPath(root, home, name) {
  return path.resolve(root, git(root, home, 'rev-parse', '--git-path', name));
}

function readNotices(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, NOTICES_REL), 'utf-8')).notices;
  } catch {
    return [];
  }
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

function commitNotice(root) {
  return readNotices(root).find((n) => n.source === 'upgrade-commit');
}

function applyNotice(root) {
  return readNotices(root).find((n) => n.source === 'upgrade-project' && n.detail && n.detail.changed_files);
}

function skipNotice(root) {
  return readNotices(root).find((n) => n.source === 'upgrade-project' && n.level === 'warn' &&
    /not committed/.test(n.message));
}

function setup({ gitRepo = true, v1 = {} } = {}) {
  const home = F.makeFakeHome();
  const root = F.makeV1Project(v1);
  cleanup.push(home, root);
  if (gitRepo) F.initGitFixture(root, home);
  return { home, root };
}

function readConfig(root) {
  return JSON.parse(fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf-8'));
}

function assertMigrated(root) {
  const cfg = readConfig(root);
  assert.equal(cfg.devflow && cfg.devflow.version, BUNDLED, 'config.json stamped with the bundled version');
  assert.equal(typeof cfg.planning, 'object', 'config.json nested');
  const obj = path.join(root, '.planning', 'objectives');
  assert.ok(fs.existsSync(path.join(obj, '01-alpha', '01-01-TRD.md')), 'JOB renamed to TRD');
  assert.ok(!fs.existsSync(path.join(obj, '01-alpha', '01-01-JOB.md')), 'old JOB path gone');
  assert.ok(fs.existsSync(path.join(root, '.planning', 'state.json')), 'state.json seeded');
  assert.ok(fs.existsSync(path.join(obj, '02-beta', 'OBJECTIVE.md')), '02-beta OBJECTIVE.md backfilled');
  assert.match(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8'), /<!-- DEVFLOW:START v=2 /);
}

function assertSkipped(root, home, before, pattern) {
  const n = skipNotice(root);
  assert.ok(n, `expected a warn "not committed" notice, got ${JSON.stringify(readNotices(root))}`);
  assert.match(n.message, pattern);
  assert.equal(commitCount(root, home), before, 'no new commit');
  assert.equal(commitNotice(root), undefined, 'no commit child ran');
  assertMigrated(root);
}

function lockPathFor(home, root) {
  const real = fs.realpathSync(root);
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return path.join(home, '.claude', 'devflow', 'locks', `${slug}-${hash8}.lock`);
}

/** Run the hook on a clean git fixture and wait for the detached child to finish. */
function runAndWaitForCommit(root, home) {
  const before = commitCount(root, home);
  runHook(root, home);
  const done = pollUntil(() => commitNotice(root));
  assert.ok(done, 'the detached commit child wrote its notice within 20 s');
  return before;
}

// ─── cases ────────────────────────────────────────────────────────────────────

describe('upgrade-project: no-op paths', () => {
  test('1: outside a DevFlow project → exit 0, empty stdout, nothing under the fake home', () => {
    const home = F.makeFakeHome();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-upgrade-plain-'));
    cleanup.push(home, dir);
    fs.writeFileSync(path.join(dir, 'README.md'), 'not devflow\n');
    runHook(dir, home);
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'backups')));
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'locks')));
  });

  test('2: DEVFLOW_SKIP_UPGRADE=1 in a behind project → nothing changes', () => {
    const { home, root } = setup();
    const snap = F.snapshot(root);
    runHook(root, home, { DEVFLOW_SKIP_UPGRADE: '1' });
    assert.deepEqual(F.diffSnapshots(snap, F.snapshot(root)), []);
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'backups')));
  });

  test('3: fast path — stamped with the bundled version → nothing written, no commit, no notices', () => {
    const home = F.makeFakeHome();
    const root = F.makeStampedProject(BUNDLED);
    cleanup.push(home, root);
    F.initGitFixture(root, home);
    const snap = F.snapshot(root);
    const before = commitCount(root, home);
    runHook(root, home);
    assert.deepEqual(F.diffSnapshots(snap, F.snapshot(root)), []);
    assert.equal(commitCount(root, home), before);
    assert.ok(!fs.existsSync(path.join(root, NOTICES_REL)));
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'backups')));
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'locks')));
  });
});

describe('upgrade-project: apply + detached commit', () => {
  test('4 (DoD): one background commit of exactly changed_files', () => {
    const { home, root } = setup();
    const before = runAndWaitForCommit(root, home);
    assertMigrated(root);

    const done = commitNotice(root);
    assert.equal(done.level, 'info', `commit notice: ${done.message}`);
    assert.equal(commitCount(root, home), before + 1, 'exactly one new commit');
    assert.equal(git(root, home, 'log', '-1', '--format=%s'), SUBJECT);

    const changed = applyNotice(root).detail.changed_files;
    assert.ok(changed.length > 0);
    // --no-renames: a JOB→TRD rename is two changed_files entries (old + new path); rename
    // detection would fold them into one line.
    const committed = git(root, home, 'show', '--name-only', '--no-renames', '--format=', 'HEAD')
      .split('\n').filter(Boolean);
    assert.deepEqual([...committed].sort(), [...changed].sort());
    assert.equal(git(root, home, 'status', '--porcelain'), '', 'working tree clean after the commit');
  });

  test('5: an unrelated staged file stays staged and is not in the upgrade commit', () => {
    const { home, root } = setup();
    fs.writeFileSync(path.join(root, 'notes.txt'), 'my notes\n');
    git(root, home, 'add', 'notes.txt');
    runAndWaitForCommit(root, home);
    assert.equal(git(root, home, 'log', '-1', '--format=%s'), SUBJECT);
    const committed = git(root, home, 'show', '--name-only', '--format=', 'HEAD').split('\n');
    assert.ok(!committed.includes('notes.txt'), 'notes.txt not committed');
    assert.equal(git(root, home, 'diff', '--cached', '--name-only'), 'notes.txt', 'notes.txt still staged');
  });

  test('6: the backup lands under the fake home, not in the project', () => {
    const { home, root } = setup();
    runAndWaitForCommit(root, home);
    const backups = path.join(home, '.claude', 'devflow', 'backups');
    assert.ok(fs.existsSync(backups) && fs.readdirSync(backups).length === 1, 'one backup slug dir');
    const n = applyNotice(root);
    const backup = String(n.detail.backup);
    assert.ok(backup.startsWith(home) || backup.startsWith(fs.realpathSync(home)), `backup path ${backup}`);
    assert.ok(!Object.keys(F.snapshot(root)).some((p) => p.includes('backups/')));
  });

  test('19: mirror independence — the fake home has no ~/.claude/devflow/bin and the commit still lands', () => {
    const { home, root } = setup();
    const mirrorBin = path.join(home, '.claude', 'devflow', 'bin');
    assert.ok(!fs.existsSync(mirrorBin));
    const before = runAndWaitForCommit(root, home);
    assert.equal(commitNotice(root).level, 'info');
    assert.equal(commitCount(root, home), before + 1);
    assert.ok(!fs.existsSync(mirrorBin), 'the hook never created or used a home mirror');
  });
});

describe('upgrade-project: skip rules (no commit, changes left applied)', () => {
  test('7 (DoD): rebase in progress → no commit after 5 s, applied, warn notice', () => {
    const { home, root } = setup();
    fs.mkdirSync(gitPath(root, home, 'rebase-merge'), { recursive: true });
    const before = commitCount(root, home);
    runHook(root, home);
    sleep(5000);
    assertSkipped(root, home, before, /rebase in progress/);
  });

  test('8 (DoD): route-results emits the skip notice exactly once', () => {
    const { home, root } = setup();
    fs.mkdirSync(gitPath(root, home, 'rebase-merge'), { recursive: true });
    runHook(root, home);
    const r1 = runRoute(root, home);
    assert.equal(r1.status, 0, r1.stderr);
    assert.ok(r1.stdout.length > 0, 'first prompt emits the notices');
    const ctx = JSON.parse(r1.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /DevFlow notices/);
    assert.match(ctx, /rebase in progress/);
    const r2 = runRoute(root, home);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(r2.stdout, '', 'second prompt emits nothing');
  });

  test('9: merge in progress (MERGE_HEAD) → no commit, notice names merge', () => {
    const { home, root } = setup();
    fs.writeFileSync(gitPath(root, home, 'MERGE_HEAD'), `${git(root, home, 'rev-parse', 'HEAD')}\n`);
    const before = commitCount(root, home);
    runHook(root, home);
    assertSkipped(root, home, before, /merge in progress/);
  });

  test('10: cherry-pick in progress (CHERRY_PICK_HEAD) → no commit', () => {
    const { home, root } = setup();
    fs.writeFileSync(gitPath(root, home, 'CHERRY_PICK_HEAD'), `${git(root, home, 'rev-parse', 'HEAD')}\n`);
    const before = commitCount(root, home);
    runHook(root, home);
    assertSkipped(root, home, before, /cherry-pick in progress/);
  });

  test('11: bisect in progress (BISECT_LOG) → no commit', () => {
    const { home, root } = setup();
    fs.writeFileSync(gitPath(root, home, 'BISECT_LOG'), 'git bisect start\n');
    const before = commitCount(root, home);
    runHook(root, home);
    assertSkipped(root, home, before, /bisect in progress/);
  });

  test('12: detached HEAD → no commit, notice names detached HEAD', () => {
    const { home, root } = setup();
    git(root, home, 'checkout', '-q', '--detach');
    const before = commitCount(root, home);
    runHook(root, home);
    assertSkipped(root, home, before, /detached HEAD/);
  });

  test('13: dirty-before — a changed file had uncommitted edits → applied, no commit, file named', () => {
    const { home, root } = setup();
    const cfgPath = path.join(root, '.planning', 'config.json');
    const cfg = readConfig(root);
    fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, research: true }, null, 2) + '\n');
    const before = commitCount(root, home);
    runHook(root, home);
    assertSkipped(root, home, before, /uncommitted edits/);
    assert.match(skipNotice(root).message, /\.planning\/config\.json/);
  });

  test('14: signing failure → no commit, warn notice from upgrade-commit, signing never disabled', () => {
    const { home, root } = setup();
    const failSign = path.join(home, 'fail-sign.sh');
    fs.writeFileSync(failSign, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    git(root, home, 'config', '--local', 'commit.gpgsign', 'true');
    git(root, home, 'config', '--local', 'gpg.format', 'openpgp');
    git(root, home, 'config', '--local', 'gpg.program', failSign);
    const before = commitCount(root, home);
    runHook(root, home);
    const n = pollUntil(() => commitNotice(root));
    assert.ok(n, 'the commit child reported within 20 s');
    assert.equal(n.level, 'warn');
    assert.match(n.message, /not committed/);
    assert.equal(commitCount(root, home), before, 'no commit — and never retried unsigned');
    assert.equal(git(root, home, 'config', '--local', 'commit.gpgsign'), 'true', 'signing never flipped');
    const cfg = readConfig(root);
    assert.equal(cfg.devflow.version, BUNDLED, 'migrations stay applied');
  });

  test('17: not a git repository → applied, notice says so, nothing spawned', () => {
    const { home, root } = setup({ gitRepo: false });
    runHook(root, home);
    assertMigrated(root);
    const n = skipNotice(root);
    assert.ok(n, JSON.stringify(readNotices(root)));
    assert.match(n.message, /not a git repository/);
    sleep(1000);
    assert.equal(commitNotice(root), undefined, 'no commit child');
  });
});

describe('upgrade-project: notices, lock, exclude', () => {
  test('15: a pending confirm migration (0006) → one action notice naming the migrate command', () => {
    const { home, root } = setup({ gitRepo: false });
    runHook(root, home);
    const actions = readNotices(root).filter((n) => n.level === 'action');
    assert.equal(actions.length, 1, JSON.stringify(readNotices(root)));
    assert.match(actions[0].message, /0006/);
    assert.match(actions[0].message, /\/devflow:status check --migrate/);
  });

  test('16: a fresh held lock → nothing applied; a lock older than 120 s is stolen', () => {
    const { home, root } = setup({ gitRepo: false });
    const lock = lockPathFor(home, root);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, 'held\n');
    const snap = F.snapshot(root);
    runHook(root, home);
    assert.deepEqual(F.diffSnapshots(snap, F.snapshot(root)), [], 'nothing applied under a held lock');
    assert.ok(!fs.existsSync(path.join(home, '.claude', 'devflow', 'backups')));
    assert.ok(fs.existsSync(lock), 'a lock held by someone else is left alone');

    const old = (Date.now() - 200 * 1000) / 1000;
    fs.utimesSync(lock, old, old);
    runHook(root, home);
    assert.equal(readConfig(root).devflow.version, BUNDLED, 'stale lock stolen, run proceeded');
    assert.ok(!fs.existsSync(lock), 'lock released after the run');
  });

  test('18: .git/info/exclude gains the notices file and git status never lists it', () => {
    const { home, root } = setup();
    fs.writeFileSync(gitPath(root, home, 'CHERRY_PICK_HEAD'), `${git(root, home, 'rev-parse', 'HEAD')}\n`);
    runHook(root, home);
    assert.ok(fs.existsSync(path.join(root, NOTICES_REL)), 'notices file written');
    const exclude = fs.readFileSync(gitPath(root, home, 'info/exclude'), 'utf-8');
    assert.ok(exclude.split('\n').includes(NOTICES_REL), exclude);
    const status = git(root, home, 'status', '--porcelain', '--untracked-files=all');
    assert.ok(!status.includes('.devflow-notices.json'), status);
  });

  test('failed migration → warn notice (malformed config.json halts the run)', () => {
    const { home, root } = setup({ gitRepo: false });
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), '{ not json');
    runHook(root, home);
    const warns = readNotices(root).filter((n) => n.level === 'warn' && /fail/i.test(n.message));
    assert.equal(warns.length, 1, JSON.stringify(readNotices(root)));
  });
});
