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
