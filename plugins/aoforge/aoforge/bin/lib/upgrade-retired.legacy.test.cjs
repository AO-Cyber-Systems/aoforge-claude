'use strict';

// upgrade-retired.legacy.test.cjs (objective 78, TRD 78-07, SC-2/SC-4). Migrations 0012 (planning-dir move) and
// 0013 (config-key rename) are gone, and 0014 (CLAUDE.md rebrand) goes with TRD 78-08. Their ids stay reserved
// (upgrade.RETIRED_MIGRATIONS), so `--only` names the AOForge 3.0.x path instead of "unknown migration id". The
// stamp is read under the new config key only, the stamp writer never touches the pre-rename key, and the runner
// writes nothing in a project that still has only the pre-rename planning directory.
//
// Test list (outermost first; numbers are the TRD 78-07 test list):
//   3.  `aof-tools upgrade --apply --only 0012` (and 0013) in an `.aoforge/` project: exit 1, one line naming
//       "retired", AOForge 3.0.x and the migration guide; nothing written, no backup. 0014 gives the same line once
//       the registry no longer carries it, and resolves normally while it does.
//   3b. Library: `only` naming a retired id the registry lacks -> RegistryError whose one problem is that line
//       (apply and check); a retired id the registry carries resolves normally; a never-assigned id is still
//       "unknown migration id"; RETIRED_MIGRATIONS is frozen and lists exactly 0012, 0013, 0014.
//   4.  `upgrade --check --raw` with a stamp listing 0012/0013/0014: exit 0, no registry error; `--check` JSON has
//       no failure; `--apply` keeps those ids in migrations_applied.
//   9.  readStamp on a config with only the pre-rename key -> null; with both keys -> the new key's stamp.
//       writeStamp beside the pre-rename key leaves it byte-identical: alone, the new key is appended after it;
//       both, the new key is updated in place. apply on such a config stamps the new key and keeps the old one.
//   9c. apply and check on a legacy-only root: nothing applied, nothing written (no `.aoforge/`, no backup, the
//       tree byte-identical), and the report carries `legacy_layout` === legacyLayoutMessage(root) and one
//       `failed` entry with that message.
//   9b. The shipped registry loads, carries neither 0012 nor 0013, and its ids are sorted and unique (0012-0014
//       are retired, not reused).
//
// Fixtures: legacy-layout-fixtures.planningProject (hand-built trees, fake HOME) and upgrade-fixtures
// (makeStampedProject, makeFakeHome, makeRegistryDir). Every spawn gets the fixture HOME; nothing touches the real one.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY, SHIM_RELEASE } = require('./legacy-names.cjs');
const { legacyLayoutMessage, MIGRATION_GUIDE } = require('./planning-layout.cjs');
const { planningProject, STAMP } = require('./__fixtures__/legacy-layout-fixtures.cjs');
const {
  makeStampedProject,
  makeFakeHome,
  makeRegistryDir,
  migrationSource,
  snapshot,
  diffSnapshots,
  gitEnv,
} = require('./__fixtures__/upgrade-fixtures.cjs');
const upgrade = require('./upgrade.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const PLUGIN_VERSION = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json'), 'utf-8')).version;
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const NOW = new Date('2026-10-16T12:00:00.000Z');

const TITLES = { '0012': 'planning-dir move', '0013': 'config-key rename', '0014': 'CLAUDE.md rebrand' };

/** The one problem line a retired id gives. */
function retiredLine(id) {
  return `migration ${id} (${TITLES[id]}) was retired after ${NAMES.product} ${SHIM_RELEASE}: `
    + `run it with ${NAMES.product} ${SHIM_RELEASE}, or do it by hand (${MIGRATION_GUIDE}, "Upgrading from 2.x")`;
}

const created = [];
const track = (dir) => { created.push(dir); return dir; };
after(() => { for (const dir of created) fs.rmSync(dir, { recursive: true, force: true }); });

/** gitEnv(home) without any product env prefix from the caller. */
function cleanEnv(home) {
  const env = gitEnv(home);
  for (const key of Object.keys(env)) {
    if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) delete env[key];
  }
  return env;
}

/** Spawn `aof-tools --cwd <root> upgrade ...` from the fake home, so only --cwd can find the project. */
function runUpgrade(root, home, args) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', root, 'upgrade', ...args], {
    cwd: home, env: cleanEnv(home), encoding: 'utf-8', timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: `${r.stdout || ''}${r.stderr || ''}` };
}

const backupsDir = (home) => path.join(home, '.claude', NAMES.runtimeDir, 'backups');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const shippedIds = () => upgrade.loadRegistry().map((m) => m.id);

function aoforgeProject(version = '3.0.0', applied = ['0001']) {
  return track(makeStampedProject(version, { migrations_applied: applied }));
}

// ─── 3. the CLI names the 3.0.x path for a retired id ─────────────────────────

describe('3. upgrade --only <retired id>', () => {
  for (const id of ['0012', '0013']) {
    test(`3. --apply --only ${id}: exit 1, one line naming retired, ${SHIM_RELEASE} and the guide; nothing written`, () => {
      const root = aoforgeProject();
      const home = track(makeFakeHome());
      const before = snapshot(root);
      const r = runUpgrade(root, home, ['--apply', '--only', id, '--raw']);
      assert.equal(r.status, 1, r.out);
      const lines = r.stdout.trim().split('\n');
      assert.equal(lines.length, 1, r.out);
      assert.ok(lines[0].includes(retiredLine(id)), r.out);
      for (const part of ['retired', SHIM_RELEASE, MIGRATION_GUIDE]) assert.ok(lines[0].includes(part), `${part}: ${r.out}`);
      assert.equal(/unknown migration id/.test(r.out), false, r.out);
      assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
      assert.equal(fs.existsSync(backupsDir(home)), false, 'no backup');
    });
  }

  test('3. --only 0014: the retired line once the registry drops it, a normal run while it carries it', () => {
    const root = aoforgeProject();
    const home = track(makeFakeHome());
    const r = runUpgrade(root, home, ['--check', '--only', '0014', '--raw']);
    if (shippedIds().includes('0014')) {
      assert.equal(r.status, 0, r.out);
      assert.equal(r.out.includes('retired'), false, r.out);
    } else {
      assert.equal(r.status, 1, r.out);
      assert.ok(r.stdout.includes(retiredLine('0014')), r.out);
    }
  });
});

// ─── 3b. the library ──────────────────────────────────────────────────────────

describe('3b. RETIRED_MIGRATIONS in the runner', () => {
  const mark = (id) => migrationSource({
    id,
    title: `mark ${id}`,
    detect: `    const p = path.join(ctx.projectRoot, '${NEW}', 'MIGRATED-${id}');
    return fs.existsSync(p) ? { applies: false, reason: 'marker present' } : { applies: true, reason: 'marker missing' };`,
    apply: `    if (!ctx.dryRun) fs.writeFileSync(path.join(ctx.projectRoot, '${NEW}', 'MIGRATED-${id}'), 'ok\\n');
    return { changed: ['${NEW}/MIGRATED-${id}'], notes: null };`,
  });

  test('3b. RETIRED_MIGRATIONS is frozen and lists exactly 0012, 0013 and 0014 with their titles', () => {
    assert.ok(Object.isFrozen(upgrade.RETIRED_MIGRATIONS));
    assert.deepEqual({ ...upgrade.RETIRED_MIGRATIONS }, TITLES);
  });

  test('3b. a retired id the registry lacks -> RegistryError with the one line (apply and check), nothing written', () => {
    const root = aoforgeProject();
    const home = track(makeFakeHome());
    const registryDir = track(makeRegistryDir({ '0001-mark.cjs': mark('0001') }));
    const before = snapshot(root);
    for (const id of ['0012', '0013', '0014']) {
      for (const run of [upgrade.apply, upgrade.check]) {
        assert.throws(
          () => run({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, registryDir, only: [id], now: NOW }),
          (e) => e instanceof upgrade.RegistryError && e.problems.length === 1 && e.problems[0] === retiredLine(id),
        );
      }
    }
    assert.deepEqual(diffSnapshots(before, snapshot(root)), []);
    assert.equal(fs.existsSync(backupsDir(home)), false);
  });

  test('3b. a retired id the registry still carries resolves normally', () => {
    const root = aoforgeProject();
    const home = track(makeFakeHome());
    const registryDir = track(makeRegistryDir({ '0014-mark.cjs': mark('0014') }));
    const r = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, registryDir, only: ['0014'], now: NOW });
    assert.deepEqual(r.applied.map((a) => a.id), ['0014']);
    assert.ok(fs.existsSync(path.join(root, NEW, 'MIGRATED-0014')));
  });

  test('3b. a never-assigned id is still unknown, beside a retired one', () => {
    const root = aoforgeProject();
    const home = track(makeFakeHome());
    const registryDir = track(makeRegistryDir({ '0001-mark.cjs': mark('0001') }));
    assert.throws(
      () => upgrade.check({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, registryDir, only: ['0013', '0099'] }),
      (e) => e instanceof upgrade.RegistryError
        && JSON.stringify(e.problems) === JSON.stringify([retiredLine('0013'), 'unknown migration id 0099']),
    );
  });
});

// ─── 4. a stamp that lists the retired ids ────────────────────────────────────

describe('4. a stamp listing 0012, 0013 and 0014', () => {
  const LISTED = ['0001', '0012', '0013', '0014'];

  test('4. --check --raw exits 0 with no registry error; --check JSON has no failure', () => {
    const root = aoforgeProject('3.0.0', LISTED);
    const home = track(makeFakeHome());
    const raw = runUpgrade(root, home, ['--check', '--raw']);
    assert.equal(raw.status, 0, raw.out);
    assert.equal(/registry|unknown migration|retired/.test(raw.out), false, raw.out);
    const j = runUpgrade(root, home, ['--check']);
    assert.equal(j.status, 0, j.out);
    assert.deepEqual(JSON.parse(j.stdout).failed, []);
  });

  test('4. --apply keeps the retired ids in migrations_applied', () => {
    const root = aoforgeProject('3.0.0', LISTED);
    const home = track(makeFakeHome());
    const r = runUpgrade(root, home, ['--apply']);
    assert.equal(r.status, 0, r.out);
    const stamp = upgrade.readStamp(root);
    assert.equal(stamp.version, PLUGIN_VERSION);
    for (const id of ['0012', '0013', '0014']) assert.ok(stamp.migrations_applied.includes(id), JSON.stringify(stamp));
  });
});

// ─── 9. the stamp key ─────────────────────────────────────────────────────────

describe('9. the stamp is read and written under the new key only', () => {
  const configOf = (p) => path.join(p.root, NEW, 'config.json');
  const NEXT = { version: PLUGIN_VERSION, migrations_applied: ['0001', '0002'], upgraded_at: NOW.toISOString() };

  test('9. readStamp: pre-rename key alone -> null; both keys -> the new key\'s stamp', () => {
    const legacyOnly = planningProject({ layout: 'aoforge', configKey: 'legacy', git: false });
    const both = planningProject({ layout: 'aoforge', configKey: 'both', git: false });
    try {
      assert.equal(upgrade.readStamp(legacyOnly.root), null);
      assert.deepEqual(upgrade.readStamp(both.root), { ...STAMP });
    } finally {
      legacyOnly.cleanup();
      both.cleanup();
    }
  });

  test('9. writeStamp beside the pre-rename key alone: the new key is appended, the old one byte-identical', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'legacy', git: false });
    try {
      const before = readJson(configOf(p));
      const oldText = JSON.stringify(before[LEGACY.configKey], null, 2);
      upgrade.writeStamp(p.root, NEXT);
      const afterCfg = readJson(configOf(p));
      assert.deepEqual(Object.keys(afterCfg), [...Object.keys(before), NAMES.configKey]);
      assert.equal(JSON.stringify(afterCfg[LEGACY.configKey], null, 2), oldText);
      assert.deepEqual(afterCfg[NAMES.configKey], NEXT);
    } finally {
      p.cleanup();
    }
  });

  test('9. writeStamp with both keys: the new key is updated in place, the old one byte-identical', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'both', git: false });
    try {
      const before = readJson(configOf(p));
      const oldText = JSON.stringify(before[LEGACY.configKey], null, 2);
      upgrade.writeStamp(p.root, NEXT);
      const afterCfg = readJson(configOf(p));
      assert.deepEqual(Object.keys(afterCfg), Object.keys(before));
      assert.equal(JSON.stringify(afterCfg[LEGACY.configKey], null, 2), oldText);
      assert.deepEqual(afterCfg[NAMES.configKey], NEXT);
    } finally {
      p.cleanup();
    }
  });

  test('9. apply on a pre-rename-only stamp reads it as no stamp, stamps the new key and keeps the old one', () => {
    const p = planningProject({ layout: 'aoforge', configKey: 'legacy', git: false });
    try {
      const oldText = JSON.stringify(readJson(configOf(p))[LEGACY.configKey], null, 2);
      const registryDir = track(makeRegistryDir({}));
      const r = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION, registryDir, now: NOW });
      assert.equal(r.from, null);
      assert.deepEqual(r.failed, []);
      const cfg = readJson(configOf(p));
      assert.equal(cfg[NAMES.configKey].version, PLUGIN_VERSION);
      assert.equal(JSON.stringify(cfg[LEGACY.configKey], null, 2), oldText);
    } finally {
      p.cleanup();
    }
  });
});

// ─── 9c. a legacy-only root ───────────────────────────────────────────────────

describe('9c. apply and check on a legacy-only root write nothing and report the layout', () => {
  test('9c. apply (real registry, dry run and not), then check', () => {
    const p = planningProject({ layout: 'legacy', configKey: 'legacy', git: true });
    try {
      const message = legacyLayoutMessage(p.root);
      const before = snapshot(p.root);
      const statusBefore = p.git(['status', '--porcelain']);
      const assertNothing = (r, what) => {
        assert.equal(r.legacy_layout, message, `${what}: ${JSON.stringify(r)}`);
        assert.deepEqual(r.failed, [{ id: 'layout', phase: 'layout', error: message }], what);
        for (const k of ['applied', 'pending', 'pending_confirm', 'skipped', 'deferred', 'changed_files']) {
          assert.deepEqual(r[k], [], `${what}: ${k}`);
        }
        assert.equal(r.backup, null, what);
        assert.equal(r.up_to_date, false, what);
      };
      const common = { projectRoot: p.root, userHome: p.home, pluginVersion: PLUGIN_VERSION };
      assertNothing(upgrade.apply({ ...common, now: NOW }), 'apply');
      assertNothing(upgrade.apply({ ...common, dryRun: true, confirm: true, now: NOW }), 'apply dryRun');
      assertNothing(upgrade.check(common), 'check');
      assert.equal(fs.existsSync(path.join(p.root, NEW)), false, `${NEW} was created`);
      assert.ok(fs.existsSync(path.join(p.root, OLD, 'config.json')));
      assert.deepEqual(diffSnapshots(before, snapshot(p.root)), []);
      assert.equal(p.git(['status', '--porcelain']), statusBefore);
      assert.equal(fs.existsSync(backupsDir(p.home)), false, 'no backup');
    } finally {
      p.cleanup();
    }
  });
});

// ─── 9b. the shipped registry ─────────────────────────────────────────────────

describe('9b. the shipped registry', () => {
  test('9b. loads without 0012 and 0013; ids sorted and unique (retired ids are reserved, not reused)', () => {
    const ids = shippedIds();
    assert.equal(ids.includes('0012'), false, ids.join(','));
    assert.equal(ids.includes('0013'), false, ids.join(','));
    assert.deepEqual(ids, [...new Set(ids)].sort());
    for (const id of Object.keys(upgrade.RETIRED_MIGRATIONS || {})) {
      if (id !== '0014') assert.equal(ids.includes(id), false, `${id} is retired`);
    }
  });
});
