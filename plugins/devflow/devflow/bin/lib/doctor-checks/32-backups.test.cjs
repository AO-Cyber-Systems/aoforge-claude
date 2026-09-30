'use strict';

// TRD 45-07 (DOC-05, state hygiene) — the `backups` doctor check (32).
//
// no_llm_test_data: every backup dir is a literal, hand-written name in backup-prune's timestamp
// format (`<ISO with [:.] -> ->` , see backup-prune.cjs TS_RE) under an `fs.mkdtemp` fake home.
// Retention comes from a literal `<home>/.claude/devflow/global-config.json`, the file
// backup-prune.readRetention reads. Every runPrune call here (the check's and the test's own dry
// run) gets the fake home as `userHome`, so nothing can touch the real ~/.claude.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const backupPrune = require('../backup-prune.cjs');
const { makeDoctorHome } = require('../__fixtures__/doctor-fixtures.cjs');
const backups = require('./32-backups.cjs');

const NOW = new Date('2026-09-30T12:00:00.000Z');
const REPO = 'myrepo-0a1b2c3d';

const homes = [];
after(() => {
  for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
});

function newHome() {
  const home = makeDoctorHome();
  assert.ok(fs.realpathSync(home).startsWith(fs.realpathSync(os.tmpdir()) + path.sep), 'fake home must be under the OS temp dir');
  homes.push(home);
  return home;
}

const backupsDirOf = (home) => path.join(home, '.claude', 'devflow', 'backups');

function makeCtx(home, env = {}) {
  return doctor.buildContext({ userHome: home, env, now: NOW, pluginVersion: '0.0.0-test' });
}

function writeRetention(home, backupsCfg) {
  const file = path.join(home, '.claude', 'devflow', 'global-config.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ backups: backupsCfg }, null, 2) + '\n', 'utf8');
}

function writeBackup(home, repo, name, payload = '{"backed":"up"}\n') {
  const dir = path.join(backupsDirOf(home), repo, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), payload, 'utf8');
  return dir;
}

// Five backups well past the default 14-day retention, plus one from yesterday.
const OLD_NAMES = [
  '2026-08-01T10-00-00-000Z',
  '2026-08-05T10-00-00-000Z',
  '2026-08-10T10-00-00-000Z',
  '2026-08-15T10-00-00-000Z',
  '2026-08-20T10-00-00-000Z',
];
const FRESH_NAME = '2026-09-29T10-00-00-000Z';

test('7. backups: 5 past retention (keep_min 1 respected) -> warn fixable; fix removes exactly the dry-run set; re-run ok', () => {
  const home = newHome();
  writeRetention(home, { retain_days: 14, keep_min: 1 });
  for (const n of OLD_NAMES) writeBackup(home, REPO, n);
  writeBackup(home, REPO, FRESH_NAME);
  const registry = path.join(backupsDirOf(home), '.registry.json');
  fs.writeFileSync(registry, '{"repos":{}}\n', 'utf8');

  const dry = backupPrune.runPrune({ userHome: home, now: NOW, dryRun: true }).removed.slice().sort();
  assert.equal(dry.length, 5, 'fixture sanity: the 5 old ones are past retention, the fresh one is the kept newest');

  const ctx = makeCtx(home);
  assert.equal(backups.id, 'backups');
  assert.equal(backups.scope, 'global');

  const res = backups.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /5 backups past retention/);
  assert.equal(res.fixable, true);
  assert.deepEqual(res.details.removable.slice().sort(), dry);
  assert.equal(fs.readdirSync(path.join(backupsDirOf(home), REPO)).length, 6, 'run() is read-only');

  const out = backups.fix(ctx, res);
  assert.equal(out.applied, true);
  assert.ok(out.changed.every((p) => path.isAbsolute(p)), 'changed paths are absolute so the engine never mistakes them for project paths');
  assert.deepEqual(out.changed.map((p) => path.relative(backupsDirOf(home), p).split(path.sep).join('/')).sort(), dry);
  assert.deepEqual(fs.readdirSync(path.join(backupsDirOf(home), REPO)), [FRESH_NAME], 'only the newest backup remains');
  assert.ok(fs.existsSync(registry), 'the registry file is never touched');

  const again = backups.run(ctx);
  assert.equal(again.severity, 'ok');
  assert.equal(again.fixable, false);
  assert.equal(again.details.kept, 1);
});

test('7b. backups: keep_min protects the newest entries even when all are past retention', () => {
  const home = newHome();
  writeRetention(home, { retain_days: 14, keep_min: 2 });
  for (const n of OLD_NAMES) writeBackup(home, REPO, n);

  const res = backups.run(makeCtx(home));
  assert.equal(res.severity, 'warn');
  assert.match(res.finding, /3 backups past retention/);
  assert.deepEqual(
    res.details.removable.slice().sort(),
    OLD_NAMES.slice(0, 3).map((n) => `${REPO}/${n}`),
    'the two newest survive',
  );
});

test('7c. backups through the engine: --fix prunes and the post-fix report is ok', () => {
  const home = newHome();
  writeRetention(home, { retain_days: 14, keep_min: 1 });
  for (const n of OLD_NAMES) writeBackup(home, REPO, n);
  writeBackup(home, REPO, FRESH_NAME);
  const base = { userHome: home, env: {}, now: NOW, pluginVersion: '0.0.0-test', checks: [backups] };

  const report = doctor.runDoctor(base);
  assert.equal(report.checks[0].severity, 'warn');
  assert.equal(report.checks[0].fixable, true);
  assert.equal(fs.readdirSync(path.join(backupsDirOf(home), REPO)).length, 6, 'a report run never deletes');

  const fixed = doctor.runDoctor({ ...base, fix: true });
  assert.equal(fixed.fixes.length, 1);
  assert.equal(fixed.fixes[0].applied, true);
  assert.equal(fixed.checks[0].severity, 'ok');
  assert.deepEqual(fs.readdirSync(path.join(backupsDirOf(home), REPO)), [FRESH_NAME]);
});

test('8. backups: no backups dir -> ok and nothing is created', () => {
  const home = newHome();
  const ctx = makeCtx(home);
  const res = backups.run(ctx);
  assert.equal(res.severity, 'ok');
  assert.equal(res.fixable, false);
  assert.match(res.finding, /no backups/);
  assert.ok(!fs.existsSync(backupsDirOf(home)), 'the check must not create the backups dir');
});

test('9. backups: all within retention but over the size threshold -> unfixable warn naming the retention keys', () => {
  const home = newHome();
  const payload = 'x'.repeat(4096);
  writeBackup(home, REPO, '2026-09-27T10-00-00-000Z', payload);
  writeBackup(home, REPO, '2026-09-28T10-00-00-000Z', payload);
  writeBackup(home, REPO, FRESH_NAME, payload);

  const ctx = makeCtx(home, { DEVFLOW_DOCTOR_BACKUP_WARN_BYTES: '1000' });
  const res = backups.run(ctx);
  assert.equal(res.severity, 'warn');
  assert.equal(res.fixable, false);
  assert.ok(res.details.bytes >= 3 * 4096);
  assert.equal(res.details.repos, 1);
  assert.equal(res.details.kept, 3);
  assert.match(res.finding, /backups/);
  // backup-prune.readRetention reads <home>/.claude/devflow/global-config.json -> backups.{retain_days,keep_min}
  assert.match(res.fix_command, /global-config\.json/);
  assert.match(res.fix_command, /backups\.retain_days/);
  assert.match(res.fix_command, /backups\.keep_min/);
  assert.ok(res.fix_command.includes(ctx.paths.mirrorDir), 'names the real config path under the mirror dir');

  const engine = doctor.runDoctor({
    userHome: home, env: { DEVFLOW_DOCTOR_BACKUP_WARN_BYTES: '1000' }, now: NOW, pluginVersion: '0.0.0-test',
    checks: [backups], fix: true,
  });
  assert.equal(engine.fixes.length, 0, 'nothing to fix, so --fix never calls fix()');
  assert.equal(fs.readdirSync(path.join(backupsDirOf(home), REPO)).length, 3, 'nothing was deleted');
});

test('9b. backups: the same fixture under the default 500 MiB threshold is ok with details {bytes, repos, kept}', () => {
  const home = newHome();
  const payload = 'x'.repeat(4096);
  writeBackup(home, REPO, '2026-09-28T10-00-00-000Z', payload);
  writeBackup(home, REPO, FRESH_NAME, payload);

  const res = backups.run(makeCtx(home));
  assert.equal(res.severity, 'ok');
  assert.equal(res.fixable, false);
  assert.ok(res.details.bytes >= 2 * 4096);
  assert.equal(res.details.repos, 1);
  assert.equal(res.details.kept, 2);
  assert.equal(backups.DEFAULT_WARN_BYTES, 500 * 1024 * 1024);
});

test('9c. backups: an unusable DEVFLOW_DOCTOR_BACKUP_WARN_BYTES falls back to the 500 MiB default', () => {
  const home = newHome();
  writeBackup(home, REPO, FRESH_NAME, 'x'.repeat(4096));
  for (const bad of ['abc', '0', '-5', '']) {
    const res = backups.run(makeCtx(home, { DEVFLOW_DOCTOR_BACKUP_WARN_BYTES: bad }));
    assert.equal(res.severity, 'ok', `override ${JSON.stringify(bad)} is ignored`);
  }
});
