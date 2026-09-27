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
const AUTO_IDS = ['0001', '0002', '0003', '0004', '0005'];
const MANAGED_START = '<!-- DEVFLOW:START v=1 src=global-claude-md -->';

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
});
