'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation).
// TRD 37-03: backup pruning — pure policy, throttled runner, registration (objective 37, ADP-05).
//
// Local helper: seedBackups(home, repoDir, ages) creates
//   <home>/.claude/devflow/backups/<repoDir>/<ts>/.planning/config.json for each age in days, with
//   ts = new Date(NOW - age*86400000).toISOString().replace(/[:.]/g, '-'). A name collision (two
//   ages that round to the same ts) gets '-1', '-2', ... appended, exactly like upgrade.cjs
//   backupDirFor. NOW is a fixed new Date('2026-09-28T12:00:00.000Z').
//
// runThrottled / runPrune (fake HOME):
//   1. DoD: repo A with ages [1, 2, 3, 4, 5, 20, 30] → the newest 5 (1..5 days) are kept; the 20-
//      and 30-day backups are beyond keep_min and older than 14 days, so both are removed. Assert
//      removed = exactly those two, kept = 5.
//   2. DoD: repo B with ages [15, 16, 17] → all kept (fewer than 5; keep_min protects them).
//   3. DoD: repo C with ages [1, 2, 3, 4, 5, 6, 13] → none removed (13 < 14 days).
//   4. DoD: 7 backups all 30 days old → exactly the oldest 2 removed.
//   5. Boundary: a 6th-newest backup exactly 14 days old (now - time === 14*86400000) is kept; 14
//      days + 1 ms is removed.
//   6. DoD throttle: runThrottled twice at NOW and NOW+23h → second returns {throttled: true},
//      removes nothing, .last-prune.json bytes unchanged. At NOW+24h+1ms it runs again.
//   7. runPrune (unthrottled, used by the CLI) runs even inside the 24h window and rewrites the
//      stamp.
//   8. dryRun: true → report lists what WOULD be removed; tree snapshot unchanged; no stamp
//      written.
//   9. No <home>/.claude/devflow/backups/ → {skipped: 'no-backups'}; the dir is not created; no
//      stamp.
//   10. Untouchable entries: legacy-2026-09-01T00-00-00-000Z/skills/x,
//       global-2026-09-01T00-00-00-000Z/CLAUDE.md, .registry.json, notes.txt, and a dir Weird_Name
//       all survive a run where everything else is ancient.
//   11. Unparseable ts dir backups/app-deadbeef/not-a-date/ (plus 6 ancient parseable ones) → never
//       removed, listed in unparsed; the keep_min count ignores it.
//   12. Collision suffix: <ts>-1 and <ts>-2 names parse to the same time as <ts> and order after
//       it (stable).
//   13. Config override: global-config.json {"backups": {"retain_days": 3, "keep_min": 2}} → repo
//       with ages [1, 2, 4, 5] removes 4 and 5.
//   14. Invalid config: retain_days: 0, keep_min: "x" → defaults used, two entries in warnings;
//       unparseable global-config.json → defaults, one warning.
//   15. A removal failure (make one ts dir's parent read-only via chmod 0o555, restore in finally)
//       → reported in failed, the run continues with other repos, and the stamp is still written.
//
// planPrune (pure):
//   16. Empty input → {remove: [], keep: [], unparsed: []}.
//   17. Two repos are independent: repo X's newest-5 protection does not count repo Y's backups.
//   18. Output is deterministic: remove sorted by repo then time ascending.
//
// parseBackupTime (pure):
//   19. 2026-09-27T23-33-24-984Z → Date.UTC(2026, 8, 27, 23, 33, 24, 984); ...Z-3 → same time,
//       suffix 3; 2026-13-01T... / abc → null.
//
// register:
//   20. register({userHome, projectRoot}) → .registry.json has repos[repoKey(projectRoot)] =
//       {path: realpath(projectRoot), registered_at: NOW.toISOString()}; creates the backups dir
//       when absent.
//   21. Re-register at a later now → registered_at unchanged, file otherwise identical; two repos
//       → two entries.
//   22. repoKey(projectRoot) equals
//       path.basename(path.dirname(upgrade.backupDirFor({projectRoot, userHome, now}))) for a
//       mkdtemp project with an uppercase, dotted basename (My.App).
//
// No real home:
//   23. Source check: backup-prune.cjs contains no os.homedir( call (read the file in the test and
//       assert).

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const upgrade = require('./upgrade.cjs');
const prune = require('./backup-prune.cjs');

// ─── Temp-dir bookkeeping ─────────────────────────────────────────────────────

const created = [];
function track(dir) { created.push(dir); return dir; }
after(() => { for (const dir of created) fs.rmSync(dir, { recursive: true, force: true }); });

function fakeHome() {
  return track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-prune-home-')));
}

function fakeProject(basename) {
  const parent = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-prune-project-')));
  const root = path.join(parent, basename);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

const NOW = new Date('2026-09-28T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function backupsRoot(home) { return path.join(home, '.claude', 'devflow', 'backups'); }
function registryPath(home) { return path.join(backupsRoot(home), '.registry.json'); }
function stampPath(home) { return path.join(backupsRoot(home), '.last-prune.json'); }

/**
 * seedBackups(home, repoDir, ages) — writes
 * <home>/.claude/devflow/backups/<repoDir>/<ts>/.planning/config.json for each age (days before
 * NOW). A ts collision (two ages that round to the same ISO string) gets '-1', '-2', ... appended,
 * exactly like upgrade.cjs backupDirFor. Returns the ts directory names created, in call order.
 */
function seedBackups(home, repoDir, ages) {
  const names = [];
  for (const age of ages) {
    const t = new Date(NOW.getTime() - age * DAY_MS);
    const ts = t.toISOString().replace(/[:.]/g, '-');
    let name = ts;
    for (let n = 1; fs.existsSync(path.join(backupsRoot(home), repoDir, name)); n++) name = `${ts}-${n}`;
    fs.mkdirSync(path.join(backupsRoot(home), repoDir, name, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(backupsRoot(home), repoDir, name, '.planning', 'config.json'), '{}\n');
    names.push(name);
  }
  return names;
}

function writeGlobalConfig(home, value) {
  fs.mkdirSync(path.join(home, '.claude', 'devflow'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'devflow', 'global-config.json'), JSON.stringify(value));
}

const REPO_A = 'app-a-11111111';
const REPO_B = 'app-b-22222222';
const REPO_C = 'app-c-33333333';

// ─── runPrune / runThrottled (fake HOME) ───────────────────────────────────────

describe('runPrune / runThrottled (fake HOME)', () => {
  test('1: DoD — ages [1,2,3,4,5,20,30] keeps the newest 5, removes the 20- and 30-day backups', () => {
    const home = fakeHome();
    const names = seedBackups(home, REPO_A, [1, 2, 3, 4, 5, 20, 30]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.kept, 5);
    const removedNames = report.removed.map((r) => r.split('/').pop());
    assert.deepEqual(removedNames.sort(), [names[5], names[6]].sort());
    for (const n of names.slice(0, 5)) {
      assert.ok(fs.existsSync(path.join(backupsRoot(home), REPO_A, n)), `${n} kept`);
    }
    assert.ok(!fs.existsSync(path.join(backupsRoot(home), REPO_A, names[5])));
    assert.ok(!fs.existsSync(path.join(backupsRoot(home), REPO_A, names[6])));
  });

  test('2: DoD — ages [15,16,17] all kept (fewer than keep_min)', () => {
    const home = fakeHome();
    seedBackups(home, REPO_B, [15, 16, 17]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.removed.length, 0);
    assert.equal(report.kept, 3);
  });

  test('3: DoD — ages [1,2,3,4,5,6,13] none removed (13 < 14 days)', () => {
    const home = fakeHome();
    seedBackups(home, REPO_C, [1, 2, 3, 4, 5, 6, 13]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.removed.length, 0);
    assert.equal(report.kept, 7);
  });

  test('4: DoD — 7 backups all 30 days old removes exactly the oldest 2', () => {
    const home = fakeHome();
    const names = seedBackups(home, 'app-d-44444444', [30, 30, 30, 30, 30, 30, 30]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.kept, 5);
    const removedNames = report.removed.map((r) => r.split('/').pop());
    assert.deepEqual(removedNames.sort(), [names[5], names[6]].sort());
  });

  test('5: boundary — exactly 14 days old is kept, 14 days + 1ms is removed', () => {
    const home = fakeHome();
    const repo = 'app-e-55555555';
    seedBackups(home, repo, [1, 2, 3, 4, 5]);
    const exactMs = NOW.getTime() - 14 * DAY_MS;
    const overMs = exactMs - 1;
    const exactName = new Date(exactMs).toISOString().replace(/[:.]/g, '-');
    const overName = new Date(overMs).toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(path.join(backupsRoot(home), repo, exactName), { recursive: true });
    fs.mkdirSync(path.join(backupsRoot(home), repo, overName), { recursive: true });
    prune.runPrune({ userHome: home, now: NOW });
    assert.ok(fs.existsSync(path.join(backupsRoot(home), repo, exactName)), 'exactly 14 days old is kept');
    assert.ok(!fs.existsSync(path.join(backupsRoot(home), repo, overName)), '14 days + 1ms old is removed');
  });

  test('6: DoD throttle — second runThrottled within 24h is a no-op; 24h+1ms runs again', () => {
    const home = fakeHome();
    seedBackups(home, REPO_A, [20, 30]);
    const first = prune.runThrottled({ userHome: home, now: NOW });
    assert.equal(first.throttled, false);
    const stampBytes1 = fs.readFileSync(stampPath(home));

    const within = new Date(NOW.getTime() + 23 * 60 * 60 * 1000);
    const second = prune.runThrottled({ userHome: home, now: within });
    assert.deepEqual(second, { throttled: true, last_prune_at: NOW.toISOString() });
    const stampBytes2 = fs.readFileSync(stampPath(home));
    assert.ok(stampBytes1.equals(stampBytes2));

    const after24 = new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 1);
    const third = prune.runThrottled({ userHome: home, now: after24 });
    assert.equal(third.throttled, false);
  });

  test('7: runPrune (unthrottled) runs even inside the 24h window and rewrites the stamp', () => {
    const home = fakeHome();
    seedBackups(home, REPO_A, [1]);
    prune.runThrottled({ userHome: home, now: NOW });
    const stamp1 = fs.readFileSync(stampPath(home), 'utf-8');
    const within = new Date(NOW.getTime() + 60 * 60 * 1000);
    const report = prune.runPrune({ userHome: home, now: within });
    assert.equal(report.throttled, false);
    const stamp2 = fs.readFileSync(stampPath(home), 'utf-8');
    assert.notEqual(stamp1, stamp2);
    assert.equal(JSON.parse(stamp2).last_prune_at, within.toISOString());
  });

  test('8: dryRun reports what WOULD be removed, changes nothing, writes no stamp', () => {
    const home = fakeHome();
    const names = seedBackups(home, REPO_A, [1, 2, 3, 4, 5, 20, 30]);
    const report = prune.runPrune({ userHome: home, now: NOW, dryRun: true });
    assert.equal(report.dry_run, true);
    assert.equal(report.removed.length, 2);
    for (const n of names) {
      assert.ok(fs.existsSync(path.join(backupsRoot(home), REPO_A, n)), `${n} untouched by dry run`);
    }
    assert.ok(!fs.existsSync(stampPath(home)));
  });

  test('9: no backups dir → skipped, nothing created', () => {
    const home = fakeHome();
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.skipped, 'no-backups');
    assert.ok(!fs.existsSync(backupsRoot(home)));
  });

  test('10: legacy-*, global-*, dotfiles and non-matching dirs survive an ancient run', () => {
    const home = fakeHome();
    seedBackups(home, REPO_A, [100]);
    const root = backupsRoot(home);
    fs.mkdirSync(path.join(root, 'legacy-2026-09-01T00-00-00-000Z', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(root, 'legacy-2026-09-01T00-00-00-000Z', 'skills', 'x'), 'x');
    fs.mkdirSync(path.join(root, 'global-2026-09-01T00-00-00-000Z'), { recursive: true });
    fs.writeFileSync(path.join(root, 'global-2026-09-01T00-00-00-000Z', 'CLAUDE.md'), 'md');
    fs.writeFileSync(path.join(root, '.registry.json'), '{}');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'note');
    fs.mkdirSync(path.join(root, 'Weird_Name'));
    fs.writeFileSync(path.join(root, 'Weird_Name', 'inner.txt'), 'inner');

    const untouchable = [
      ['legacy-2026-09-01T00-00-00-000Z', 'skills', 'x'],
      ['global-2026-09-01T00-00-00-000Z', 'CLAUDE.md'],
      ['.registry.json'],
      ['notes.txt'],
      ['Weird_Name', 'inner.txt'],
    ].map((parts) => path.join(root, ...parts));
    const before = untouchable.map((p) => fs.readFileSync(p, 'utf-8'));

    prune.runPrune({ userHome: home, now: NOW });

    const after = untouchable.map((p) => fs.readFileSync(p, 'utf-8'));
    assert.deepEqual(before, after);
  });

  test('11: unparseable ts dir never removed, listed in unparsed, ignored by keep_min', () => {
    const home = fakeHome();
    const repo = 'app-f-66666666';
    seedBackups(home, repo, [20, 21, 22, 23, 24, 25]);
    fs.mkdirSync(path.join(backupsRoot(home), repo, 'not-a-date'));
    const report = prune.runPrune({ userHome: home, now: NOW });
    // keep_min=5 ignores the unparseable entry: of the 6 parseable ancient backups, the newest 5
    // are kept, the oldest (25 days) removed.
    assert.equal(report.kept, 5);
    assert.equal(report.removed.length, 1);
    assert.ok(fs.existsSync(path.join(backupsRoot(home), repo, 'not-a-date')));
    assert.ok(report.unparsed.some((u) => u.endsWith(`${repo}/not-a-date`)));
  });

  test('13: config override — retain_days:3, keep_min:2 removes ages [4,5] from [1,2,4,5]', () => {
    const home = fakeHome();
    writeGlobalConfig(home, { backups: { retain_days: 3, keep_min: 2 } });
    const names = seedBackups(home, REPO_A, [1, 2, 4, 5]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.retain_days, 3);
    assert.equal(report.keep_min, 2);
    assert.equal(report.kept, 2);
    const removedNames = report.removed.map((r) => r.split('/').pop());
    assert.deepEqual(removedNames.sort(), [names[2], names[3]].sort());
  });

  test('14: invalid config values fall back to defaults and are reported in warnings', () => {
    const home = fakeHome();
    writeGlobalConfig(home, { backups: { retain_days: 0, keep_min: 'x' } });
    seedBackups(home, REPO_A, [1]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.retain_days, 14);
    assert.equal(report.keep_min, 5);
    assert.equal(report.warnings.length, 2);
  });

  test('14b: unparseable global-config.json falls back to defaults with one warning', () => {
    const home = fakeHome();
    fs.mkdirSync(path.join(home, '.claude', 'devflow'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'devflow', 'global-config.json'), '{not json');
    seedBackups(home, REPO_A, [1]);
    const report = prune.runPrune({ userHome: home, now: NOW });
    assert.equal(report.retain_days, 14);
    assert.equal(report.keep_min, 5);
    assert.equal(report.warnings.length, 1);
  });

  test('15: a removal failure is reported in failed; other repos still processed; stamp still written', (t) => {
    if (process.getuid && process.getuid() === 0) { t.skip('chmod has no effect as root'); return; }
    const home = fakeHome();
    const failRepo = 'app-h-88888888';
    const okRepo = 'app-i-99999999';
    // Both repos need more than keep_min (5) backups, or nothing is ever a removal candidate.
    const failNames = seedBackups(home, failRepo, [1, 2, 3, 4, 5, 20, 30]);
    const okNames = seedBackups(home, okRepo, [1, 2, 3, 4, 5, 20, 30]);
    const repoDir = path.join(backupsRoot(home), failRepo);
    fs.chmodSync(repoDir, 0o555); // no write on the parent → the final rmdir of a ts entry fails
    try {
      const report = prune.runPrune({ userHome: home, now: NOW });
      assert.equal(report.failed.length, 2);
      assert.ok(report.failed.every((f) => f.path.includes(failRepo)));
      assert.ok(fs.existsSync(path.join(backupsRoot(home), failRepo, failNames[5])));
      assert.ok(fs.existsSync(path.join(backupsRoot(home), failRepo, failNames[6])));
      assert.ok(!fs.existsSync(path.join(backupsRoot(home), okRepo, okNames[5])));
      assert.ok(!fs.existsSync(path.join(backupsRoot(home), okRepo, okNames[6])));
      assert.ok(fs.existsSync(stampPath(home)));
    } finally {
      fs.chmodSync(repoDir, 0o755);
    }
  });
});

// ─── planPrune (pure) ───────────────────────────────────────────────────────────

describe('planPrune (pure)', () => {
  test('16: empty input', () => {
    assert.deepEqual(
      prune.planPrune({ repos: [], now: NOW, retainDays: 14, keepMin: 5 }),
      { remove: [], keep: [], unparsed: [] },
    );
  });

  test('17: two repos are independent — repo X protection does not count repo Y', () => {
    const day = (n) => NOW.getTime() - n * DAY_MS;
    const entry = (repo, days) => ({ repo, name: String(days), dir: `/x/${repo}/${days}`, time: day(days), suffix: 0 });
    const repos = [
      entry('x', 1), entry('x', 2), entry('x', 3), entry('x', 4), entry('x', 5), entry('x', 20),
      entry('y', 1),
    ];
    const { remove, keep } = prune.planPrune({ repos, now: NOW, retainDays: 14, keepMin: 5 });
    assert.equal(remove.length, 1);
    assert.equal(remove[0].repo, 'x');
    assert.equal(keep.filter((e) => e.repo === 'y').length, 1);
  });

  test('18: remove is sorted by repo then time ascending', () => {
    const day = (n) => NOW.getTime() - n * DAY_MS;
    const entry = (repo, days) => ({ repo, name: String(days), dir: `/x/${repo}/${days}`, time: day(days), suffix: 0 });
    const repos = [entry('b', 30), entry('b', 20), entry('a', 40), entry('a', 15)];
    // keepMin 0 so every entry is a removal candidate purely on retention.
    const { remove } = prune.planPrune({ repos, now: NOW, retainDays: 14, keepMin: 0 });
    assert.deepEqual(remove.map((e) => `${e.repo}:${e.name}`), ['a:40', 'a:15', 'b:30', 'b:20']);
  });
});

// ─── parseBackupTime (pure) ─────────────────────────────────────────────────────

describe('parseBackupTime (pure)', () => {
  test('19: parses the canonical name and a collision suffix; rejects invalid names', () => {
    assert.deepEqual(
      prune.parseBackupTime('2026-09-27T23-33-24-984Z'),
      { time: Date.UTC(2026, 8, 27, 23, 33, 24, 984), suffix: 0 },
    );
    assert.deepEqual(
      prune.parseBackupTime('2026-09-27T23-33-24-984Z-3'),
      { time: Date.UTC(2026, 8, 27, 23, 33, 24, 984), suffix: 3 },
    );
    assert.equal(prune.parseBackupTime('2026-13-01T00-00-00-000Z'), null);
    assert.equal(prune.parseBackupTime('abc'), null);
  });

  test('12: collision suffixes parse to the same time as the base and order after it (stable)', () => {
    const t = NOW.getTime() - 30 * DAY_MS;
    const base = new Date(t).toISOString().replace(/[:.]/g, '-');
    assert.deepEqual(prune.parseBackupTime(base), { time: t, suffix: 0 });
    assert.deepEqual(prune.parseBackupTime(`${base}-1`), { time: t, suffix: 1 });
    assert.deepEqual(prune.parseBackupTime(`${base}-2`), { time: t, suffix: 2 });

    const repos = [
      { repo: 'r', name: `${base}-2`, dir: `/r/${base}-2`, time: t, suffix: 2 },
      { repo: 'r', name: base, dir: `/r/${base}`, time: t, suffix: 0 },
      { repo: 'r', name: `${base}-1`, dir: `/r/${base}-1`, time: t, suffix: 1 },
    ];
    // keepMin 2 keeps the two lowest-suffix (newest-ordered) entries; the -2 entry is 30 days old
    // and beyond the default 14-day retention, so it is removed.
    const { keep, remove } = prune.planPrune({ repos, now: NOW, retainDays: 14, keepMin: 2 });
    assert.deepEqual(keep.map((e) => e.suffix).sort(), [0, 1]);
    assert.deepEqual(remove.map((e) => e.suffix), [2]);
  });
});

// ─── register (Task 1 slice: repoKey/backupDirFor agreement only) ──────────────

describe('register', () => {
  test('20: registers a repo, creating the backups dir when absent', () => {
    const home = fakeHome();
    const project = fakeProject('demo-app');
    const result = prune.register({ userHome: home, projectRoot: project, now: NOW });
    const real = fs.realpathSync(project);
    assert.equal(result.path, real);
    assert.equal(result.created, true);
    const registry = JSON.parse(fs.readFileSync(registryPath(home), 'utf-8'));
    assert.deepEqual(registry.repos[result.key], { path: real, registered_at: NOW.toISOString() });
  });

  test('21: re-registering keeps registered_at unchanged; two repos → two entries', () => {
    const home = fakeHome();
    const projectA = fakeProject('repo-a');
    const projectB = fakeProject('repo-b');
    prune.register({ userHome: home, projectRoot: projectA, now: NOW });
    const before = fs.readFileSync(registryPath(home), 'utf-8');

    const later = new Date(NOW.getTime() + DAY_MS);
    const result = prune.register({ userHome: home, projectRoot: projectA, now: later });
    assert.equal(result.created, false);
    const after1 = fs.readFileSync(registryPath(home), 'utf-8');
    assert.equal(before, after1);

    prune.register({ userHome: home, projectRoot: projectB, now: later });
    const registry = JSON.parse(fs.readFileSync(registryPath(home), 'utf-8'));
    assert.equal(Object.keys(registry.repos).length, 2);
    assert.equal(registry.repos[upgrade.repoKey(projectA)].registered_at, NOW.toISOString());
    assert.equal(registry.repos[upgrade.repoKey(projectB)].registered_at, later.toISOString());
  });

  test('22: repoKey(projectRoot) matches the directory upgrade.backupDirFor uses', () => {
    const home = fakeHome();
    const project = fakeProject('My.App');
    const dir = upgrade.backupDirFor({ projectRoot: project, userHome: home, now: NOW });
    assert.equal(upgrade.repoKey(project), path.basename(path.dirname(dir)));
  });
});

// ─── No real home ───────────────────────────────────────────────────────────────

describe('no real home', () => {
  test('23: backup-prune.cjs never calls os.homedir(', () => {
    const src = fs.readFileSync(path.join(__dirname, 'backup-prune.cjs'), 'utf-8');
    assert.ok(!src.includes('os.homedir('));
  });
});
