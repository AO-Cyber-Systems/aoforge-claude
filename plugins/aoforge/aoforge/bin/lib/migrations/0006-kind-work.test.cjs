'use strict';

// TRD 36-04b — migration 0006 kind-work (test list items 11-18).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs).
// Nothing touches the real ~/.claude: every userHome is a mkdtemp fake home.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');
const { extractFrontmatter } = require('../frontmatter.cjs');
const { VALID_KINDS } = require('../intent.cjs');

const MIGRATION_PATH = path.join(__dirname, '0006-kind-work.cjs');
const PROJECT_REL = '.aoforge/PROJECT.md';
const BETA_REL = '.aoforge/objectives/02-beta/OBJECTIVE.md';
const PLUGIN_VERSION = '2.11.0';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0006() {
  return require(MIGRATION_PATH);
}

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function ctxFor(root, { dryRun = false, options = {} } = {}) {
  const home = track(fx.makeFakeHome());
  return { projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun, options };
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

function frontmatterOf(root, rel) {
  return extractFrontmatter(read(root, rel)) || {};
}

function migrateBackupDirs(root) {
  return fs.readdirSync(path.join(root, '.aoforge')).filter((e) => e.startsWith('.migrate-backup-'));
}

// v1 fixture plus an OBJECTIVE.md in 02-beta that has no `work` (the fixture's 01-alpha has one).
function v1WithWorklessObjective() {
  const root = track(fx.makeV1Project());
  fs.writeFileSync(path.join(root, BETA_REL), '---\nobjective: 02-beta\n---\n\n# Objective 02 — Beta\n\n## Goal\n\nBeta goal\n', 'utf-8');
  return root;
}

describe('migration 0006 kind-work', () => {
  test('11. contract: id 0006, safety confirm, semver since; loadRegistry() (default dir) includes it', () => {
    const m = m0006();
    assert.equal(m.id, '0006');
    assert.equal(m.safety, 'confirm');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.ok(typeof m.title === 'string' && m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0006');
    assert.ok(entry, 'registry includes 0006');
    assert.equal(entry.safety, 'confirm');
  });

  test('12. v1 fixture (PROJECT.md without kind) -> detect applies; reason mentions kind', () => {
    const m = m0006();
    const root = track(fx.makeV1Project());
    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /kind/);
  });

  test('13. PROJECT.md with kind: api -> detect false; no PROJECT.md -> detect false', () => {
    const m = m0006();
    const withKind = track(fx.makeV1Project({ projectKind: 'api' }));
    assert.equal(m.detect(ctxFor(withKind)).applies, false);

    const noProject = track(fx.makeV1Project());
    fs.rmSync(path.join(noProject, PROJECT_REL));
    const det = m.detect(ctxFor(noProject));
    assert.equal(det.applies, false);
    assert.match(det.reason, /PROJECT\.md/);
  });

  test('14. apply without ctx.options.kind -> throws needs --kind (naming the valid kinds); PROJECT.md unchanged', () => {
    const m = m0006();
    const root = track(fx.makeV1Project());
    const before = read(root, PROJECT_REL);

    assert.throws(() => m.apply(ctxFor(root)), (e) => {
      assert.match(e.message, /needs --kind/);
      for (const k of VALID_KINDS) assert.ok(e.message.includes(k), `message names ${k}`);
      return true;
    });
    assert.equal(read(root, PROJECT_REL), before);
  });

  test('15. apply {kind: plugin, defaultWork: feature} -> kind + default_work set, workless objectives get work; no in-repo backup', () => {
    const m = m0006();
    const root = v1WithWorklessObjective();
    const alphaBefore = read(root, '.aoforge/objectives/01-alpha/OBJECTIVE.md');

    const res = m.apply(ctxFor(root, { options: { kind: 'plugin', defaultWork: 'feature' } }));

    const pfm = frontmatterOf(root, PROJECT_REL);
    assert.equal(pfm.kind, 'plugin');
    assert.equal(pfm.default_work, 'feature');
    assert.equal(frontmatterOf(root, BETA_REL).work, 'feature');
    assert.equal(read(root, '.aoforge/objectives/01-alpha/OBJECTIVE.md'), alphaBefore, '01-alpha already had work');

    assert.deepEqual([...res.changed].sort(), [BETA_REL, PROJECT_REL].sort());
    assert.deepEqual(migrateBackupDirs(root), []);
  });

  test('16. runner: check -> pending_confirm; apply() leaves PROJECT.md; apply({only:[0006], options}) writes it', () => {
    const root = track(fx.makeV1Project());
    const home = track(fx.makeFakeHome());
    const projectBefore = read(root, PROJECT_REL);

    const checked = upgrade.check({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.ok(checked.pending_confirm.some((p) => p.id === '0006'), '0006 is pending_confirm');
    assert.ok(!checked.pending.some((p) => p.id === '0006'), '0006 is never auto-pending');

    const autoOnly = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(read(root, PROJECT_REL), projectBefore, 'PROJECT.md untouched without only/confirm');
    assert.ok(autoOnly.pending_confirm.some((p) => p.id === '0006'));
    assert.ok(!autoOnly.applied.some((a) => a.id === '0006'));

    const confirmed = upgrade.apply({
      projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION,
      only: ['0006'], options: { kind: 'plugin' },
    });
    assert.deepEqual(confirmed.failed, []);
    const applied = confirmed.applied.find((a) => a.id === '0006');
    assert.ok(applied, '0006 applied');
    assert.ok(applied.changed.includes(PROJECT_REL));
    assert.equal(frontmatterOf(root, PROJECT_REL).kind, 'plugin');
    assert.deepEqual(migrateBackupDirs(root), [], 'the runner backs up outside the repo; 0006 adds none');
  });

  test('17. dryRun writes nothing and still returns changed', () => {
    const m = m0006();
    const root = v1WithWorklessObjective();
    const before = fx.snapshot(root);
    const res = m.apply(ctxFor(root, { dryRun: true, options: { kind: 'plugin', defaultWork: 'feature' } }));
    assert.deepEqual([...res.changed].sort(), [BETA_REL, PROJECT_REL].sort());
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
  });

  test('18. second apply -> detect false', () => {
    const m = m0006();
    const root = track(fx.makeV1Project());
    const ctx = ctxFor(root, { options: { kind: 'plugin' } });
    m.apply(ctx);
    assert.equal(m.detect(ctx).applies, false);
  });
});
