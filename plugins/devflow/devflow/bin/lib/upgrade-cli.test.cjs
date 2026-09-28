'use strict';

// upgrade-cli.test.cjs — TRD 36-03 Task 1: `df-tools upgrade` end to end.
//
// Every case spawns the CHECKOUT df-tools.cjs (never the ~/.claude/devflow mirror) with
// env: gitEnv(fakeHome), so HOME — and therefore os.homedir(), the backup root and the global
// CLAUDE.md — is a mkdtemp directory. Projects are mkdtemp fixtures from upgrade-fixtures.cjs.
// Nothing here reads or writes the real ~/.claude, and nothing touches this repository.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/upgrade-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const PLUGIN_JSON = path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json');
const PLUGIN_VERSION = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf-8')).version;
// TRD 38-08 test 14: 0007 (doc-refs-fix) was decided by running this suite, not by guessing.
// fx.makeV1Project()'s default CLAUDE.md (fx.LEGACY_CLAUDE_MD_BLOCK) and STATE.md carry no
// /devflow: or /df: token, so 0007 detects applies:false on the v1 fixture and is left out of
// AUTO_IDS — it is reported under `skipped`, never `pending` or `applied`. See test 12 below.
const AUTO_IDS = ['0001', '0002', '0003', '0004', '0005'];
// v=2 as of TRD 37-10 (global-claude-md template bumped to add /devflow:adopt).
const MANAGED_START = '<!-- DEVFLOW:START v=2 src=global-claude-md -->';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function tmpDir(prefix) {
  return track(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// -> { status, stdout, stderr, json } for `df-tools upgrade <args>` with HOME=<home>.
function upgrade(args, { cwd, home }) {
  const r = spawnSync(process.execPath, [DF_TOOLS, 'upgrade', ...args], {
    cwd,
    env: fx.gitEnv(home),
    encoding: 'utf-8',
    timeout: 60000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* raw or error output */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function v1Setup() {
  const home = track(fx.makeFakeHome());
  const project = track(fx.makeV1Project());
  return { home, project };
}

function readProjectMd(project) {
  return fs.readFileSync(path.join(project, '.planning', 'PROJECT.md'), 'utf-8');
}

function readConfig(project) {
  return JSON.parse(fs.readFileSync(path.join(project, '.planning', 'config.json'), 'utf-8'));
}

describe('df-tools upgrade (project)', () => {
  test('1. DoD check: v1 project lists 0001-0005 auto and 0006 confirm, writes nothing', () => {
    const { home, project } = v1Setup();
    const before = fx.snapshot(project);

    const r = upgrade(['--check', '--path', project], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json, `JSON on stdout; got ${r.stdout}`);
    assert.deepEqual(r.json.pending.map((p) => p.id), AUTO_IDS);
    assert.ok(r.json.pending.every((p) => p.safety === 'auto'), 'every pending migration is auto');
    assert.deepEqual(r.json.pending_confirm.map((p) => p.id), ['0006']);
    assert.equal(r.json.from, null);
    assert.equal(r.json.to, PLUGIN_VERSION);
    assert.equal(r.json.up_to_date, false);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), []);
  });

  test('2. DoD apply: changes exactly changed_files, stamps the version, backs up under HOME', () => {
    const { home, project } = v1Setup();
    const before = fx.snapshot(project);

    const r = upgrade(['--apply', '--path', project], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(r.json.applied.map((a) => a.id), AUTO_IDS);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), r.json.changed_files);
    assert.ok(r.json.changed_files.includes('.planning/config.json'));

    const conf = readConfig(project);
    assert.equal(conf.devflow.version, PLUGIN_VERSION);
    for (const id of AUTO_IDS) assert.ok(conf.devflow.migrations_applied.includes(id), `${id} recorded`);

    assert.ok(r.json.backup, 'backup path reported');
    assert.ok(fs.existsSync(r.json.backup), 'backup exists');
    assert.ok(r.json.backup.startsWith(path.join(home, '.claude', 'devflow', 'backups') + path.sep),
      `backup under the fake HOME; got ${r.json.backup}`);
    assert.ok(path.relative(project, r.json.backup).startsWith('..'), 'backup is outside the project');

    assert.doesNotMatch(readProjectMd(project), /^kind:/m, 'the confirm migration did not run');
    assert.deepEqual(r.json.pending_confirm.map((p) => p.id), ['0006']);
  });

  test('3. DoD idempotence: a second --apply is a no-op', () => {
    const { home, project } = v1Setup();
    const first = upgrade(['--apply'], { cwd: project, home });
    assert.equal(first.status, 0, first.stderr);
    const mid = fx.snapshot(project);

    const r = upgrade(['--apply'], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.applied, []);
    assert.deepEqual(r.json.changed_files, []);
    assert.equal(r.json.backup, null);
    assert.deepEqual(fx.diffSnapshots(mid, fx.snapshot(project)), []);
  });

  test('4. --apply --only 0006 --kind plugin applies the confirm migration', () => {
    const { home, project } = v1Setup();
    assert.equal(upgrade(['--apply'], { cwd: project, home }).status, 0);

    const r = upgrade(['--apply', '--only', '0006', '--kind', 'plugin'], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(r.json.applied.map((a) => a.id), ['0006']);
    assert.ok(r.json.changed_files.includes('.planning/PROJECT.md'));
    assert.match(readProjectMd(project), /^kind: plugin$/m);
    assert.equal(r.json.up_to_date, true);
    assert.ok(readConfig(project).devflow.migrations_applied.includes('0006'));

    const again = upgrade(['--check'], { cwd: project, home });
    assert.equal(again.json.up_to_date, true);
  });

  test('5. --apply --only 0006 without --kind fails and leaves PROJECT.md alone', () => {
    const { home, project } = v1Setup();
    const before = readProjectMd(project);

    const r = upgrade(['--apply', '--only', '0006'], { cwd: project, home });
    assert.equal(r.status, 1);
    assert.ok(r.json, `report on stdout; got ${r.stdout}`);
    assert.equal(r.json.failed[0].id, '0006');
    assert.match(r.json.failed[0].error, /--kind/);
    assert.equal(readProjectMd(project), before);
  });

  test('6. no mode flag means --check', () => {
    const { home, project } = v1Setup();
    const before = fx.snapshot(project);

    const r = upgrade([], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.pending.map((p) => p.id), AUTO_IDS);
    assert.deepEqual(r.json.pending_confirm.map((p) => p.id), ['0006']);
    assert.equal(r.json.backup, null);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), []);
  });

  test('7. --check with --apply, and an unknown flag, exit non-zero with a clear message', () => {
    const { home, project } = v1Setup();
    const before = fx.snapshot(project);

    const both = upgrade(['--check', '--apply'], { cwd: project, home });
    assert.notEqual(both.status, 0);
    assert.match(both.stderr, /--check/);
    assert.match(both.stderr, /--apply/);

    const bogus = upgrade(['--bogus'], { cwd: project, home });
    assert.notEqual(bogus.status, 0);
    assert.match(bogus.stderr, /--bogus/);
    for (const flag of ['--check', '--apply', '--only', '--confirm', '--path', '--global']) {
      assert.ok(bogus.stderr.includes(flag), `valid flags listed (${flag}); got ${bogus.stderr}`);
    }
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), []);
  });

  test('7b. an unknown --only id is a registry error: exit 1 with a report naming it', () => {
    const { home, project } = v1Setup();
    const before = fx.snapshot(project);

    const r = upgrade(['--apply', '--only', '9999'], { cwd: project, home });
    assert.equal(r.status, 1);
    assert.ok(r.json, `report on stdout; got ${r.stdout}`);
    assert.match(JSON.stringify(r.json), /unknown migration id 9999/);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), []);
  });

  test('8. outside a DevFlow project: --apply and --check both refuse', () => {
    const home = track(fx.makeFakeHome());
    const empty = tmpDir('df-upgrade-cli-empty-');

    const apply = upgrade(['--apply'], { cwd: empty, home });
    assert.notEqual(apply.status, 0);
    assert.match(apply.stderr, /not a DevFlow project/);
    assert.deepEqual(fs.readdirSync(empty), [], 'nothing written');

    const check = upgrade(['--check', '--path', empty], { cwd: home, home });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /not a DevFlow project/);
  });

  test('9. --raw prints a one-line summary', () => {
    const { home, project } = v1Setup();
    const r = upgrade(['--raw', '--check'], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '5 pending (0001,0002,0003,0004,0005); 1 needs confirmation (0006)');

    const current = track(fx.makeStampedProject(PLUGIN_VERSION));
    const up = upgrade(['--check', '--raw'], { cwd: current, home });
    assert.equal(up.status, 0, up.stderr);
    assert.equal(up.stdout.trim(), `up to date (v${PLUGIN_VERSION})`);
  });
});

describe('df-tools upgrade --global', () => {
  test('10. DoD global: --global only plans; --global --confirm adopts the managed block', () => {
    const home = track(fx.makeFakeHome({ claudeMd: fx.HAND_WRITTEN_ROUTING }));
    const claudeMd = path.join(home, '.claude', 'CLAUDE.md');
    const before = fx.snapshot(home);

    const plan = upgrade(['--global'], { cwd: home, home });
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(plan.json.block.action, 'adopt_pending');
    assert.equal(plan.json.dryRun, true);
    assert.equal(fs.readFileSync(claudeMd, 'utf-8'), fx.HAND_WRITTEN_ROUTING);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(home)), [], 'check writes nothing under HOME');

    const adopt = upgrade(['--global', '--confirm'], { cwd: home, home });
    assert.equal(adopt.status, 0, adopt.stderr);
    assert.equal(adopt.json.block.action, 'adopted');
    const after = fs.readFileSync(claudeMd, 'utf-8');
    assert.ok(after.includes(MANAGED_START), 'managed block present');
    assert.ok(after.includes('## TDD & Quality'), 'text outside the routing section kept');
  });

  test('10b. --global rejects project-only flags', () => {
    const home = track(fx.makeFakeHome());
    const r = upgrade(['--global', '--path', home], { cwd: home, home });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--global/);
    assert.match(r.stderr, /--path/);
  });
});

describe('df-tools upgrade --help', () => {
  test('11. --help prints the usage line and exits 0', () => {
    const home = track(fx.makeFakeHome());
    const r = upgrade(['--help'], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.startsWith('Usage: df-tools upgrade'), `got ${r.stdout.slice(0, 120)}`);
  });

  test('12. TRD 38-08 test 14: v1 fixture has no stale command tokens, so 0007 stays out of AUTO_IDS', () => {
    const { home, project } = v1Setup();

    const chk = upgrade(['--check', '--path', project], { cwd: home, home });
    assert.equal(chk.status, 0, chk.stderr);
    assert.deepEqual(chk.json.pending.map((p) => p.id), AUTO_IDS);
    assert.ok(chk.json.skipped.some((s) => s.id === '0007'), '0007 is skipped, not pending');

    const before = fx.snapshot(project);
    const r = upgrade(['--apply', '--path', project], { cwd: project, home });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(r.json.applied.map((a) => a.id), AUTO_IDS);
    assert.ok(!r.json.applied.some((a) => a.id === '0007'), '0007 did not run');
    assert.ok(r.json.skipped.some((s) => s.id === '0007'));
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(project)), r.json.changed_files);
  });
});

// ─── objective 37 — `upgrade --prune [--dry-run]` / `--register` (tests 9-14) ──────────────
//
// 9.  `--prune --dry-run` -> exit 0; JSON dry_run:true, removed lists the 2 would-be removals;
//     nothing removed; no stamp.
// 10. `--prune` -> removes them; stamp written; running --prune again at once still runs
//     (unthrottled, unlike the SessionStart hook) and removes nothing more.
// 11. `--prune` with no backups dir -> exit 0, skipped: 'no-backups'.
// 12. `--prune --apply`, `--prune --check`, `--prune --global` -> exit 1, stderr names the
//     conflict; `--dry-run` alone (no --prune) -> exit 1.
// 13. `--register` in a mkdtemp project -> exit 0, {key, path, created:true}; .registry.json has
//     the entry; again -> created:false. `--register --path <other>` registers <other>. Works
//     with no .planning/.
// 14. `df-tools upgrade --help` usage line names --prune and --register; help.test.cjs passes
//     (verified separately, not spawned from this file).

function backupsRoot(home) {
  return path.join(home, '.claude', 'devflow', 'backups');
}

// Same shape as the SessionStart hook test's seedPruneBackups: ages are relative to the REAL
// Date.now(), since runPrune (unlike the hook's runThrottled) is never given a fixed `now`.
function seedBackups(home, repoDir, ages) {
  const names = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const age of ages) {
    const t = new Date(now - age * DAY_MS);
    const ts = t.toISOString().replace(/[:.]/g, '-');
    let name = ts;
    for (let n = 1; fs.existsSync(path.join(backupsRoot(home), repoDir, name)); n++) name = `${ts}-${n}`;
    fs.mkdirSync(path.join(backupsRoot(home), repoDir, name, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(backupsRoot(home), repoDir, name, '.planning', 'config.json'), '{}\n');
    names.push(name);
  }
  return names;
}

describe('df-tools upgrade --prune / --register', () => {
  test('9: --prune --dry-run lists the 2 would-be removals; nothing removed, no stamp', () => {
    const home = track(fx.makeFakeHome());
    seedBackups(home, 'app-0123abcd', [30, 30, 30, 30, 30, 30, 30]);
    const r = upgrade(['--prune', '--dry-run'], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.dry_run, true);
    assert.equal(r.json.removed.length, 2, JSON.stringify(r.json.removed));
    assert.equal(fs.readdirSync(path.join(backupsRoot(home), 'app-0123abcd')).length, 7, 'dry-run removes nothing');
    assert.ok(!fs.existsSync(path.join(backupsRoot(home), '.last-prune.json')), 'dry-run writes no stamp');
  });

  test('10: --prune removes the old backups, stamps, and a second immediate run removes nothing more', () => {
    const home = track(fx.makeFakeHome());
    seedBackups(home, 'app-0123abcd', [30, 30, 30, 30, 30, 30, 30]);
    const r = upgrade(['--prune'], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.dry_run, false);
    assert.equal(r.json.removed.length, 2);
    assert.equal(fs.readdirSync(path.join(backupsRoot(home), 'app-0123abcd')).length, 5);
    assert.ok(fs.existsSync(path.join(backupsRoot(home), '.last-prune.json')), 'stamp written');

    const again = upgrade(['--prune'], { cwd: home, home });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(again.json.removed.length, 0, '--prune is never throttled, but nothing left qualifies');
    assert.equal(fs.readdirSync(path.join(backupsRoot(home), 'app-0123abcd')).length, 5);
  });

  test('11: --prune with no backups dir -> skipped: no-backups', () => {
    const home = track(fx.makeFakeHome());
    const r = upgrade(['--prune'], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.skipped, 'no-backups');
  });

  test('12: --prune conflicts with --apply/--check/--global; --dry-run alone is rejected', () => {
    const home = track(fx.makeFakeHome());
    for (const args of [['--prune', '--apply'], ['--prune', '--check'], ['--prune', '--global']]) {
      const r = upgrade(args, { cwd: home, home });
      assert.notEqual(r.status, 0, args.join(' '));
      assert.match(r.stderr, /--prune/, args.join(' '));
    }
    const dryOnly = upgrade(['--dry-run'], { cwd: home, home });
    assert.notEqual(dryOnly.status, 0);
    assert.match(dryOnly.stderr, /--dry-run/);
  });

  test('13: --register records this repo; re-register keeps created:false; --path targets another dir', () => {
    const home = track(fx.makeFakeHome());
    const project = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-register-')));
    const upgradeLib = require('./upgrade.cjs');

    const first = upgrade(['--register'], { cwd: project, home });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.json.created, true);
    const key = upgradeLib.repoKey(fs.realpathSync(project));
    assert.equal(first.json.key, key);
    const registry = JSON.parse(fs.readFileSync(path.join(backupsRoot(home), '.registry.json'), 'utf-8'));
    assert.ok(registry.repos[key], 'registry entry present');

    const second = upgrade(['--register'], { cwd: project, home });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.created, false);

    const other = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-register-other-')));
    const viaPath = upgrade(['--register', '--path', other], { cwd: project, home });
    assert.equal(viaPath.status, 0, viaPath.stderr);
    assert.equal(viaPath.json.key, upgradeLib.repoKey(fs.realpathSync(other)));
  });

  test('14: --help usage line names --prune and --register', () => {
    const home = track(fx.makeFakeHome());
    const r = upgrade(['--help'], { cwd: home, home });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /--prune/);
    assert.match(r.stdout, /--register/);
  });
});
