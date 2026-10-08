'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation).
// TRD 36-01: the upgrade runner. Order is outermost (report shape) to innermost (helpers).
//
// Fixture self-checks (upgrade-fixtures.cjs drift is caught here):
//   F1. makeV1Project() has the v1 shape (flat config, JOB files, no state.json, 02-beta without
//       OBJECTIVE.md, PROJECT.md without kind, CLAUDE.md with the unversioned block)
//   F2. makeFakeHome({legacy:true, claudeMd}) has the legacy leftovers, keep-me, and CLAUDE.md
//   F3. makeStampedProject() has nested config + stamp, TRD files, state.json, kind
//   F4. initGitFixture commits once in the fixture only, with signing off locally
//   F5. migrationSource/makeRegistryDir produce loadable modules; snapshot/diffSnapshots agree
//
// Registry (loadRegistry):
//   1. Missing registry dir → [].
//   2. 0003-c.cjs, 0001-a.cjs, 0002-b.cjs → returned in id order 0001, 0002, 0003.
//   3. 0001-a.test.cjs and README.md in the dir are ignored.
//   4. Missing detect (or apply) → RegistryError; problems names the file and the missing field.
//   5. safety: 'maybe' → RegistryError naming the allowed values auto|confirm.
//   6. id '0002' inside file 0001-a.cjs → RegistryError (id/filename mismatch).
//   7. Two files with id 0001 → RegistryError (duplicate id), problems lists BOTH files.
//   8. since: 'soon' → RegistryError (must be X.Y.Z).
//   9. Several bad files → ONE error whose problems has one entry per bad file.
//   9b. Rewriting a registry file is picked up by the next loadRegistry (require cache cleared).
//
// check():
//   10. v1 fixture + {0001 auto applies, 0002 auto not-applicable, 0003 confirm applies} →
//       pending=[0001] (safety/title/reason), pending_confirm=[0003], skipped=[{0002, reason}],
//       from null, to pluginVersion.
//   11. check() writes nothing: snapshot before === after, no backups/ dir under the fake home.
//   12. A detect that throws → failed entry with phase 'detect'; up_to_date false.
//
// apply():
//   13. Applies 0001 only (0003 confirm, not named) → applied=[0001], pending_confirm=[0003],
//       changed_files = 0001's paths + .planning/config.json.
//   14. only:['0003'] → runs 0003 not 0001; stamp version NOT advanced; migrations_applied has 0003.
//   15. confirm:true → runs 0001 and 0003; stamp version === to.
//   16. only:['9999'] → throws RegistryError "unknown migration id 9999".
//   17. Backup at <home>/.claude/aoforge/backups/<slug>-<8 hex>/<ts>/ with PRE-apply config.json
//       and CLAUDE.md; path.relative(project, backup) starts with '..'.
//   18. Two applies with the same `now` → distinct backup dirs (-1 suffix), never overwritten.
//   19. apply throws → failed=[{id, phase:'apply', error}], later migrations do NOT run, stamp
//       version not advanced, report returned (no throw).
//   20. changed: ['/abs/x'] or ['../x'] → failed with a path error.
//   21. dryRun:true → ctx.dryRun === true, no stamp, no backup, tree unchanged; changed_files
//       lists what WOULD change.
//   22. Second apply → applied [], changed_files [], backup null, tree byte-identical.
//   23. Stamp-only: stamped 2.0.0, nothing applies, to 2.10.1 → stamp rewritten,
//       changed_files ['.planning/config.json'], backup null, other keys + key order preserved.
//   24. ctx shape: a probe records {projectRoot, userHome, pluginVersion, dryRun, options} exactly.
//
// Stamp helpers:
//   25. readStamp → null when config.json absent or has no aoforge; the stamp otherwise.
//   26. config.json not valid JSON → apply does not write it; failed has {id:'stamp', error}.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const {
  makeFakeHome,
  HAND_WRITTEN_ROUTING,
  makeV1Project,
  makeStampedProject,
  initGitFixture,
  gitEnv,
  migrationSource,
  makeRegistryDir,
  snapshot,
  diffSnapshots,
  LEGACY_CLAUDE_MD_BLOCK,
  FIXTURE_STAMP_TIME,
} = require('./__fixtures__/upgrade-fixtures.cjs');

const upgrade = require('./upgrade.cjs');

// ─── Temp-dir bookkeeping ─────────────────────────────────────────────────────

const created = [];
function track(dir) { created.push(dir); return dir; }
after(() => { for (const dir of created) fs.rmSync(dir, { recursive: true, force: true }); });

const home = () => track(makeFakeHome());
const v1 = (opts) => track(makeV1Project(opts));
const registry = (files) => track(makeRegistryDir(files));
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

const VALID = {
  detect: '    return { applies: false, reason: "nothing to do" };',
  apply: '    return { changed: [], notes: null };',
};

// ─── Fixture self-checks ──────────────────────────────────────────────────────

describe('fixtures (upgrade-fixtures.cjs)', () => {
  test('F1: makeV1Project() has the v1 shape', () => {
    const root = v1();
    for (const rel of [
      '.planning/PROJECT.md', '.planning/ROADMAP.md', '.planning/STATE.md', '.planning/config.json',
      '.planning/objectives/01-alpha/OBJECTIVE.md', '.planning/objectives/01-alpha/01-01-JOB.md',
      '.planning/objectives/01-alpha/01-01-SUMMARY.md', '.planning/objectives/02-beta/02-01-JOB.md',
      'CLAUDE.md',
    ]) {
      assert.ok(exists(root, rel), `missing ${rel}`);
    }
    assert.ok(!exists(root, '.planning/state.json'));
    assert.ok(!exists(root, '.planning/objectives/02-beta/OBJECTIVE.md'));
    const config = JSON.parse(read(root, '.planning/config.json'));
    assert.equal(config.commit_docs, true);
    assert.equal(config.job_checker, false);
    assert.equal(config.parallelization, false);
    assert.equal(config.aoforge, undefined);
    assert.doesNotMatch(read(root, '.planning/PROJECT.md'), /^kind:/m);
    assert.match(read(root, '.planning/PROJECT.md'), /## What This Is/);
    assert.match(read(root, '.planning/ROADMAP.md'), /### Objective 2: Beta\n\*\*Goal:\*\* Beta goal/);
    assert.match(read(root, '.planning/STATE.md'), /\*\*Current Objective:\*\* 01/);
    const claude = read(root, 'CLAUDE.md');
    assert.ok(claude.startsWith('# My notes\n\nkeep me\n\n'));
    assert.ok(claude.includes(LEGACY_CLAUDE_MD_BLOCK));
    assert.ok(claude.endsWith('\n\n## After\n\nkeep me too\n'));

    const modern = v1({ flatConfig: false, jobFiles: false, stateJson: true, missingObjectiveMd: false,
      projectKind: 'api', claudeMdBlock: null });
    assert.ok(exists(modern, '.planning/objectives/02-beta/02-01-TRD.md'));
    assert.ok(exists(modern, '.planning/objectives/02-beta/OBJECTIVE.md'));
    assert.ok(exists(modern, '.planning/state.json'));
    assert.ok(!exists(modern, 'CLAUDE.md'));
    assert.match(read(modern, '.planning/PROJECT.md'), /^kind: api$/m);
    assert.equal(typeof JSON.parse(read(modern, '.planning/config.json')).workflow, 'object');

    const none = v1({ claudeMdBlock: 'none' });
    assert.doesNotMatch(read(none, 'CLAUDE.md'), /AOFORGE:START/);
  });

  test('F2: makeFakeHome({legacy:true, claudeMd}) has the legacy leftovers', () => {
    const h = track(makeFakeHome({ legacy: true, claudeMd: HAND_WRITTEN_ROUTING }));
    for (const rel of ['.claude/skills/df-plan/SKILL.md', '.claude/agents/df-planner.md',
      '.claude/aoforge/VERSION', '.claude/skills/keep-me/SKILL.md', '.claude/CLAUDE.md']) {
      assert.ok(exists(h, rel), `missing ${rel}`);
    }
    assert.equal(read(h, '.claude/aoforge/VERSION'), '1.20.4');
    assert.match(read(h, '.claude/CLAUDE.md'), /# AOForge Routing/);
    assert.match(read(h, '.claude/CLAUDE.md'), /## TDD & Quality/);
    const bare = home();
    assert.deepEqual(fs.readdirSync(path.join(bare, '.claude')), []);
  });

  test('F3: makeStampedProject() is current-shape and stamped', () => {
    const root = track(makeStampedProject('2.0.0', { migrations_applied: ['0001'] }));
    const config = JSON.parse(read(root, '.planning/config.json'));
    assert.equal(config.aoforge.version, '2.0.0');
    assert.deepEqual(config.aoforge.migrations_applied, ['0001']);
    assert.equal(typeof config.aoforge.upgraded_at, 'string');
    assert.equal(typeof config.workflow, 'object');
    assert.ok(exists(root, '.planning/state.json'));
    assert.ok(exists(root, '.planning/objectives/01-alpha/01-01-TRD.md'));
    assert.ok(!exists(root, '.planning/objectives/01-alpha/01-01-JOB.md'));
    assert.ok(exists(root, '.planning/objectives/02-beta/OBJECTIVE.md'));
    assert.match(read(root, '.planning/PROJECT.md'), /^kind: /m);
    assert.doesNotMatch(read(root, 'CLAUDE.md'), /AOFORGE:START/);
  });

  test('F4: initGitFixture commits once, in the fixture only, signing off locally', () => {
    const h = home();
    const root = v1();
    initGitFixture(root, h);
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { env: gitEnv(h), encoding: 'utf-8' }).trim();
    assert.equal(fs.realpathSync(git('rev-parse', '--show-toplevel')), fs.realpathSync(root));
    assert.equal(git('rev-list', '--count', 'HEAD'), '1');
    assert.equal(git('config', '--local', 'commit.gpgsign'), 'false');
    assert.equal(git('config', '--local', 'tag.gpgsign'), 'false');
    assert.equal(git('status', '--porcelain'), '');
    const env = gitEnv(h);
    assert.equal(env.HOME, h);
    assert.equal(env.XDG_CONFIG_HOME, path.join(h, '.config'));
    assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
  });

  test('F5: migrationSource + makeRegistryDir load; snapshot/diffSnapshots agree', () => {
    const dir = registry({ '0001-a.cjs': migrationSource({ id: '0001', ...VALID }) });
    const mod = require(path.join(dir, '0001-a.cjs'));
    assert.equal(mod.id, '0001');
    assert.equal(mod.safety, 'auto');
    assert.equal(mod.since, '2.11.0');
    assert.deepEqual(mod.detect({}), { applies: false, reason: 'nothing to do' });
    const noDetect = require(path.join(registry({ 'x.cjs': migrationSource({ id: '0001', apply: VALID.apply }) }), 'x.cjs'));
    assert.equal('detect' in noDetect, false);

    const root = v1();
    const a = snapshot(root);
    assert.ok(a['.planning/config.json']);
    fs.writeFileSync(path.join(root, 'new.txt'), 'x');
    fs.writeFileSync(path.join(root, '.planning/STATE.md'), 'changed');
    fs.rmSync(path.join(root, 'CLAUDE.md'));
    assert.deepEqual(diffSnapshots(a, snapshot(root)), ['.planning/STATE.md', 'CLAUDE.md', 'new.txt']);
  });
});

// ─── Registry (loadRegistry) ──────────────────────────────────────────────────

function catchRegistryError(fn) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, 'expected a RegistryError');
  assert.ok(err instanceof upgrade.RegistryError, `expected RegistryError, got ${err && err.name}: ${err && err.message}`);
  assert.ok(Array.isArray(err.problems), 'RegistryError.problems must be an array');
  return err;
}

describe('loadRegistry', () => {
  test('1: missing registry dir → []', () => {
    const missing = path.join(os.tmpdir(), 'df-upgrade-no-such-registry-' + process.pid);
    assert.deepEqual(upgrade.loadRegistry({ registryDir: missing }), []);
  });

  test('DEFAULT_REGISTRY_DIR is lib/migrations', () => {
    assert.equal(upgrade.DEFAULT_REGISTRY_DIR, path.join(__dirname, 'migrations'));
  });

  test('2: migrations are returned in numeric id order', () => {
    const dir = registry({
      '0003-c.cjs': migrationSource({ id: '0003', title: 'c', ...VALID }),
      '0001-a.cjs': migrationSource({ id: '0001', title: 'a', ...VALID }),
      '0002-b.cjs': migrationSource({ id: '0002', title: 'b', safety: 'confirm', ...VALID }),
    });
    const list = upgrade.loadRegistry({ registryDir: dir });
    assert.deepEqual(list.map((m) => m.id), ['0001', '0002', '0003']);
    assert.deepEqual(list.map((m) => m.title), ['a', 'b', 'c']);
    assert.equal(list[1].safety, 'confirm');
    assert.equal(typeof list[0].detect, 'function');
    assert.equal(typeof list[0].apply, 'function');
  });

  test('3: *.test.cjs and non NNNN-slug.cjs files are ignored', () => {
    const dir = registry({
      '0001-a.cjs': migrationSource({ id: '0001', ...VALID }),
      '0001-a.test.cjs': "throw new Error('a test file must never be loaded as a migration');\n",
      'README.md': '# migrations\n',
      'helper.cjs': "throw new Error('not a migration');\n",
    });
    assert.deepEqual(upgrade.loadRegistry({ registryDir: dir }).map((m) => m.id), ['0001']);
  });

  test('4: missing detect or apply → RegistryError naming the file and the field', () => {
    const noDetect = registry({ '0001-a.cjs': migrationSource({ id: '0001', apply: VALID.apply }) });
    const e1 = catchRegistryError(() => upgrade.loadRegistry({ registryDir: noDetect }));
    assert.equal(e1.problems.length, 1);
    assert.match(e1.problems[0], /0001-a\.cjs/);
    assert.match(e1.problems[0], /detect/);

    const noApply = registry({ '0001-a.cjs': migrationSource({ id: '0001', detect: VALID.detect }) });
    const e2 = catchRegistryError(() => upgrade.loadRegistry({ registryDir: noApply }));
    assert.match(e2.problems[0], /0001-a\.cjs/);
    assert.match(e2.problems[0], /apply/);
  });

  test("5: safety 'maybe' → RegistryError naming auto|confirm", () => {
    const dir = registry({ '0001-a.cjs': migrationSource({ id: '0001', safety: 'maybe', ...VALID }) });
    const err = catchRegistryError(() => upgrade.loadRegistry({ registryDir: dir }));
    assert.match(err.problems[0], /0001-a\.cjs/);
    assert.match(err.problems[0], /auto\|confirm/);
    assert.match(err.problems[0], /maybe/);
  });

  test('6: id/filename mismatch → RegistryError', () => {
    const dir = registry({ '0001-a.cjs': migrationSource({ id: '0002', ...VALID }) });
    const err = catchRegistryError(() => upgrade.loadRegistry({ registryDir: dir }));
    assert.match(err.problems[0], /0001-a\.cjs/);
    assert.match(err.problems[0], /0002/);
    assert.match(err.problems[0], /filename|mismatch/i);
  });

  test('7: duplicate id → RegistryError listing BOTH files', () => {
    const dir = registry({
      '0001-a.cjs': migrationSource({ id: '0001', ...VALID }),
      '0001-b.cjs': migrationSource({ id: '0001', ...VALID }),
    });
    const err = catchRegistryError(() => upgrade.loadRegistry({ registryDir: dir }));
    const all = err.problems.join('\n');
    assert.match(all, /duplicate/i);
    assert.match(all, /0001-a\.cjs/);
    assert.match(all, /0001-b\.cjs/);
    assert.match(err.message, /0001-a\.cjs/);
    assert.match(err.message, /0001-b\.cjs/);
  });

  test("8: since 'soon' → RegistryError (must be X.Y.Z)", () => {
    const dir = registry({ '0001-a.cjs': migrationSource({ id: '0001', since: 'soon', ...VALID }) });
    const err = catchRegistryError(() => upgrade.loadRegistry({ registryDir: dir }));
    assert.match(err.problems[0], /0001-a\.cjs/);
    assert.match(err.problems[0], /since/);
    assert.match(err.problems[0], /X\.Y\.Z/);
  });

  test('9: several bad files → ONE error with one problem entry per bad file', () => {
    const dir = registry({
      '0001-a.cjs': migrationSource({ id: '0001', ...VALID }),                      // good
      '0002-b.cjs': migrationSource({ id: '0002', safety: 'maybe', since: 'soon', ...VALID }), // bad x2
      '0003-c.cjs': migrationSource({ id: '0003', apply: VALID.apply }),            // bad: detect
      '0004-d.cjs': migrationSource({ id: '0005', title: '', ...VALID }),           // bad: id, title
      '0006-e.cjs': 'this is not javascript (\n',                                   // bad: load
    });
    const err = catchRegistryError(() => upgrade.loadRegistry({ registryDir: dir }));
    assert.equal(err.problems.length, 4, JSON.stringify(err.problems, null, 2));
    for (const f of ['0002-b.cjs', '0003-c.cjs', '0004-d.cjs', '0006-e.cjs']) {
      assert.equal(err.problems.filter((p) => p.includes(f)).length, 1, `exactly one entry for ${f}`);
    }
    assert.ok(!err.problems.some((p) => p.includes('0001-a.cjs')));
    const b = err.problems.find((p) => p.includes('0002-b.cjs'));
    assert.match(b, /safety/);
    assert.match(b, /since/);
    assert.match(err.problems.find((p) => p.includes('0004-d.cjs')), /title/);
  });

  test('9b: a rewritten registry file is picked up (require cache cleared)', () => {
    const dir = registry({ '0001-a.cjs': migrationSource({ id: '0001', title: 'first', ...VALID }) });
    assert.equal(upgrade.loadRegistry({ registryDir: dir })[0].title, 'first');
    fs.writeFileSync(path.join(dir, '0001-a.cjs'), migrationSource({ id: '0001', title: 'second', ...VALID }));
    assert.equal(upgrade.loadRegistry({ registryDir: dir })[0].title, 'second');
  });
});

// ─── Fixture registries for check/apply ───────────────────────────────────────

const PV = '2.11.0';
const NOW = new Date('2026-09-27T12:00:00.000Z');
const NOW_DIR = '2026-09-27T12-00-00-000Z';
const REPORT_KEYS = ['applied', 'backup', 'changed_files', 'failed', 'from', 'pending', 'pending_confirm',
  'skipped', 'to', 'up_to_date'];

// Idempotent marker migration: applies while `.planning/MIGRATED-<id>` is absent, honours dryRun.
function markerMigration(id, { safety = 'auto' } = {}) {
  return migrationSource({
    id,
    title: `mark ${id}`,
    safety,
    detect: `    const p = path.join(ctx.projectRoot, '.planning', 'MIGRATED-${id}');
    return fs.existsSync(p) ? { applies: false, reason: 'marker present' } : { applies: true, reason: 'marker ${id} missing' };`,
    apply: `    if (!ctx.dryRun) fs.writeFileSync(path.join(ctx.projectRoot, '.planning', 'MIGRATED-${id}'), 'ok\\n');
    return { changed: ['.planning/MIGRATED-${id}'], notes: 'wrote marker ${id}' };`,
  });
}

function notApplicable(id) {
  return migrationSource({
    id,
    title: `noop ${id}`,
    detect: "    return { applies: false, reason: 'not needed here' };",
    apply: "    throw new Error('a non-applicable migration must never run');",
  });
}

function throwingApply(id) {
  return migrationSource({
    id,
    title: `boom ${id}`,
    detect: "    return { applies: true, reason: 'always' };",
    apply: `    throw new Error('apply boom ${id}');`,
  });
}

// Records every ctx it receives in globalThis.__df36Probe; always applicable; honours dryRun.
function probeMigration(id) {
  return migrationSource({
    id,
    title: `probe ${id}`,
    detect: `    (globalThis.__df36Probe = globalThis.__df36Probe || []).push({ phase: 'detect', ctx });
    return { applies: !fs.existsSync(path.join(ctx.projectRoot, 'PROBE.txt')), reason: 'probe' };`,
    apply: `    (globalThis.__df36Probe = globalThis.__df36Probe || []).push({ phase: 'apply', ctx });
    if (!ctx.dryRun) fs.writeFileSync(path.join(ctx.projectRoot, 'PROBE.txt'), 'probe\\n');
    return { changed: ['PROBE.txt'], notes: null };`,
  });
}

// {0001 auto applies, 0002 auto not-applicable, 0003 confirm applies}
function standardRegistry() {
  return registry({
    '0001-mark.cjs': markerMigration('0001'),
    '0002-noop.cjs': notApplicable('0002'),
    '0003-confirm.cjs': markerMigration('0003', { safety: 'confirm' }),
  });
}

function backupsRoot(h) { return path.join(h, '.claude', 'aoforge', 'backups'); }

// ─── check() ──────────────────────────────────────────────────────────────────

describe('check', () => {
  test('10: classifies pending / pending_confirm / skipped; from null, to pluginVersion', () => {
    const project = v1();
    const h = home();
    const r = upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: standardRegistry() });
    assert.deepEqual(Object.keys(r).sort(), REPORT_KEYS);
    assert.deepEqual(r.pending, [{ id: '0001', title: 'mark 0001', safety: 'auto', reason: 'marker 0001 missing' }]);
    assert.deepEqual(r.pending_confirm, [{ id: '0003', title: 'mark 0003', reason: 'marker 0003 missing' }]);
    assert.deepEqual(r.skipped, [{ id: '0002', reason: 'not needed here' }]);
    assert.equal(r.from, null);
    assert.equal(r.to, PV);
    assert.equal(r.up_to_date, false);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.changed_files, []);
    assert.equal(r.backup, null);
  });

  test('10b: `only` narrows check; a stamped project with nothing applicable is up_to_date', () => {
    const project = v1();
    const h = home();
    const narrowed = upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), only: ['0003'] });
    assert.deepEqual(narrowed.pending, []);
    assert.deepEqual(narrowed.pending_confirm.map((p) => p.id), ['0003']);
    assert.deepEqual(narrowed.skipped, []);

    const current = track(makeStampedProject(PV));
    const r = upgrade.check({ projectRoot: current, userHome: h, pluginVersion: PV,
      registryDir: registry({ '0002-noop.cjs': notApplicable('0002') }) });
    assert.equal(r.from, PV);
    assert.equal(r.up_to_date, true);

    const behind = track(makeStampedProject('2.0.0'));
    const r2 = upgrade.check({ projectRoot: behind, userHome: h, pluginVersion: PV,
      registryDir: registry({ '0002-noop.cjs': notApplicable('0002') }) });
    assert.equal(r2.from, '2.0.0');
    assert.equal(r2.up_to_date, false);
  });

  test('11: check() writes nothing — project and home byte-identical, no backups dir', () => {
    const project = v1();
    const h = home();
    const reg = standardRegistry();
    const before = snapshot(project);
    const homeBefore = snapshot(h);
    upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg });
    assert.deepEqual(diffSnapshots(before, snapshot(project)), []);
    assert.deepEqual(diffSnapshots(homeBefore, snapshot(h)), []);
    assert.ok(!fs.existsSync(backupsRoot(h)));
  });

  test('12: a detect that throws → failed (phase detect); never up_to_date', () => {
    const project = track(makeStampedProject(PV));
    const h = home();
    const reg = registry({
      '0001-bad.cjs': migrationSource({ id: '0001', detect: "    throw new Error('detect boom');", apply: VALID.apply }),
    });
    const r = upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg });
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].id, '0001');
    assert.equal(r.failed[0].phase, 'detect');
    assert.match(r.failed[0].error, /detect boom/);
    assert.equal(r.up_to_date, false);
  });
});

// ─── apply() ──────────────────────────────────────────────────────────────────

describe('apply', () => {
  test('13: applies auto 0001 only; confirm 0003 stays pending_confirm; stamp advanced', () => {
    const project = v1();
    const h = home();
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), now: NOW });
    assert.deepEqual(Object.keys(r).sort(), REPORT_KEYS);
    assert.deepEqual(r.applied, [{ id: '0001', title: 'mark 0001', changed: ['.planning/MIGRATED-0001'],
      notes: 'wrote marker 0001' }]);
    assert.deepEqual(r.pending, []);
    assert.deepEqual(r.pending_confirm.map((p) => p.id), ['0003']);
    assert.deepEqual(r.skipped, [{ id: '0002', reason: 'not needed here' }]);
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.changed_files, ['.planning/MIGRATED-0001', '.planning/config.json']);
    assert.ok(exists(project, '.planning/MIGRATED-0001'));
    assert.ok(!exists(project, '.planning/MIGRATED-0003'));
    assert.deepEqual(upgrade.readStamp(project),
      { version: PV, migrations_applied: ['0001'], upgraded_at: NOW.toISOString() });
    assert.equal(r.from, null);
    assert.equal(r.to, PV);
  });

  test("14: only ['0003'] runs the confirm migration alone; version not advanced", () => {
    const project = v1();
    const h = home();
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), only: ['0003'], now: NOW });
    assert.deepEqual(r.applied.map((a) => a.id), ['0003']);
    assert.deepEqual(r.pending.map((p) => [p.id, p.safety]), [['0001', 'auto']]);
    assert.ok(exists(project, '.planning/MIGRATED-0003'));
    assert.ok(!exists(project, '.planning/MIGRATED-0001'));
    const stamp = upgrade.readStamp(project);
    assert.equal(stamp.version, null);
    assert.deepEqual(stamp.migrations_applied, ['0003']);
    assert.deepEqual(r.changed_files, ['.planning/MIGRATED-0003', '.planning/config.json']);

    const stamped = track(makeStampedProject('2.0.0'));
    upgrade.apply({ projectRoot: stamped, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), only: ['0003'], now: NOW });
    assert.equal(upgrade.readStamp(stamped).version, '2.0.0');
    assert.deepEqual(upgrade.readStamp(stamped).migrations_applied, ['0003']);
  });

  test('15: confirm:true runs 0001 and 0003; stamp version === to', () => {
    const project = v1();
    const h = home();
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), confirm: true, now: NOW });
    assert.deepEqual(r.applied.map((a) => a.id), ['0001', '0003']);
    assert.deepEqual(r.pending_confirm, []);
    const stamp = upgrade.readStamp(project);
    assert.equal(stamp.version, PV);
    assert.deepEqual(stamp.migrations_applied, ['0001', '0003']);
    assert.equal(r.up_to_date, true);
  });

  test("16: only ['9999'] → RegistryError 'unknown migration id 9999', nothing written", () => {
    const project = v1();
    const h = home();
    const before = snapshot(project);
    assert.throws(
      () => upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
        registryDir: standardRegistry(), only: ['9999'], now: NOW }),
      (e) => e instanceof upgrade.RegistryError && /unknown migration id 9999/.test(e.message),
    );
    assert.throws(
      () => upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV,
        registryDir: standardRegistry(), only: ['9999'] }),
      (e) => e instanceof upgrade.RegistryError,
    );
    assert.deepEqual(diffSnapshots(before, snapshot(project)), []);
    assert.ok(!fs.existsSync(backupsRoot(h)));
  });

  test('17: backup lives under <home>/.claude/aoforge/backups/<slug>-<hash8>/<ts>/ with PRE-apply bytes', () => {
    const project = v1();
    const h = home();
    const configBefore = read(project, '.planning/config.json');
    const claudeBefore = read(project, 'CLAUDE.md');
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), now: NOW });

    const real = fs.realpathSync(project);
    const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
    assert.equal(r.backup, path.join(backupsRoot(h), `${slug}-${hash8}`, NOW_DIR));
    assert.match(path.basename(path.dirname(r.backup)), /-[0-9a-f]{8}$/);
    assert.equal(fs.readFileSync(path.join(r.backup, '.planning', 'config.json'), 'utf-8'), configBefore);
    assert.equal(fs.readFileSync(path.join(r.backup, 'CLAUDE.md'), 'utf-8'), claudeBefore);
    assert.ok(fs.existsSync(path.join(r.backup, '.planning', 'objectives', '01-alpha', '01-01-JOB.md')));
    assert.ok(!fs.existsSync(path.join(r.backup, '.planning', 'MIGRATED-0001')), 'backup taken before the first write');
    assert.ok(path.relative(project, r.backup).startsWith('..'));

    // backupDirFor agrees with apply for a fresh timestamp, and refuses a dir inside the project.
    const later = new Date('2026-09-27T13:00:00.000Z');
    assert.equal(upgrade.backupDirFor({ projectRoot: project, userHome: h, now: later }),
      path.join(backupsRoot(h), `${slug}-${hash8}`, '2026-09-27T13-00-00-000Z'));
    assert.throws(() => upgrade.backupDirFor({ projectRoot: project, userHome: path.join(project, 'nested-home'), now: later }),
      /inside the project/);

    // No CLAUDE.md → backup still works and simply has none.
    const bare = v1({ claudeMdBlock: null });
    const r2 = upgrade.apply({ projectRoot: bare, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), now: NOW });
    assert.ok(fs.existsSync(path.join(r2.backup, '.planning', 'config.json')));
    assert.ok(!fs.existsSync(path.join(r2.backup, 'CLAUDE.md')));
  });

  test('18: two applies with the same `now` → distinct backup dirs, the first never overwritten', () => {
    const project = v1();
    const h = home();
    const reg = registry({
      '0001-always.cjs': migrationSource({
        id: '0001',
        title: 'always',
        detect: "    return { applies: true, reason: 'always' };",
        apply: "    if (!ctx.dryRun) fs.appendFileSync(path.join(ctx.projectRoot, '.planning', 'COUNTER'), 'x');\n    return { changed: ['.planning/COUNTER'], notes: null };",
      }),
    });
    const r1 = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW });
    const firstBackup = snapshot(r1.backup);
    const r2 = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW });
    assert.notEqual(r1.backup, r2.backup);
    assert.equal(path.basename(r1.backup), NOW_DIR);
    assert.equal(path.basename(r2.backup), `${NOW_DIR}-1`);
    assert.deepEqual(diffSnapshots(firstBackup, snapshot(r1.backup)), []);
    assert.ok(!fs.existsSync(path.join(r1.backup, '.planning', 'COUNTER')));
    assert.equal(fs.readFileSync(path.join(r2.backup, '.planning', 'COUNTER'), 'utf-8'), 'x');
  });

  test('19: an apply that throws → failed, later migrations do not run, version not advanced, no throw', () => {
    const project = v1();
    const h = home();
    const reg = registry({
      '0001-mark.cjs': markerMigration('0001'),
      '0002-boom.cjs': throwingApply('0002'),
      '0003-mark.cjs': markerMigration('0003'),
    });
    let r;
    assert.doesNotThrow(() => {
      r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW });
    });
    assert.deepEqual(r.applied.map((a) => a.id), ['0001']);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].id, '0002');
    assert.equal(r.failed[0].phase, 'apply');
    assert.match(r.failed[0].error, /apply boom 0002/);
    assert.ok(!exists(project, '.planning/MIGRATED-0003'), '0003 must not run after 0002 failed');
    assert.deepEqual(r.pending.map((p) => p.id), ['0003']);
    const stamp = upgrade.readStamp(project);
    assert.equal(stamp.version, null);
    assert.deepEqual(stamp.migrations_applied, ['0001']);
    assert.deepEqual(r.changed_files, ['.planning/MIGRATED-0001', '.planning/config.json']);
    assert.equal(r.up_to_date, false);
    assert.ok(r.backup);

    // A stamped project whose only migration throws keeps its version and its config bytes.
    const stamped = track(makeStampedProject('2.0.0'));
    const configBefore = read(stamped, '.planning/config.json');
    const r2 = upgrade.apply({ projectRoot: stamped, userHome: h, pluginVersion: PV,
      registryDir: registry({ '0001-boom.cjs': throwingApply('0001') }), now: NOW });
    assert.equal(r2.failed[0].phase, 'apply');
    assert.equal(read(stamped, '.planning/config.json'), configBefore);
    assert.deepEqual(r2.changed_files, []);
  });

  test('20: a migration reporting an absolute or `..` path → failed with a path error', () => {
    const h = home();
    for (const bad of ['/abs/x', '../x', 'a/../../x']) {
      const project = v1();
      const reg = registry({
        '0001-bad.cjs': migrationSource({
          id: '0001',
          detect: "    return { applies: true, reason: 'always' };",
          apply: `    return { changed: [${JSON.stringify(bad)}], notes: null };`,
        }),
      });
      const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW });
      assert.deepEqual(r.applied, [], bad);
      assert.equal(r.failed.length, 1, bad);
      assert.equal(r.failed[0].id, '0001');
      assert.equal(r.failed[0].phase, 'apply');
      assert.match(r.failed[0].error, /path/i, bad);
      assert.ok(!r.changed_files.includes(bad), bad);
      assert.equal(upgrade.readStamp(project), null, bad);
    }
  });

  test('21: dryRun → ctx.dryRun true, no stamp, no backup, tree unchanged; changed_files = would-change', () => {
    const project = v1();
    const h = home();
    globalThis.__df36Probe = [];
    const before = snapshot(project);
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: registry({ '0001-probe.cjs': probeMigration('0001'), '0002-mark.cjs': markerMigration('0002') }),
      dryRun: true, now: NOW });
    assert.ok(globalThis.__df36Probe.length >= 2);
    assert.ok(globalThis.__df36Probe.every((p) => p.ctx.dryRun === true));
    assert.deepEqual(globalThis.__df36Probe.map((p) => p.phase), ['detect', 'apply']);
    assert.equal(r.backup, null);
    assert.ok(!fs.existsSync(backupsRoot(h)));
    assert.deepEqual(diffSnapshots(before, snapshot(project)), []);
    assert.equal(upgrade.readStamp(project), null);
    assert.deepEqual(r.applied.map((a) => a.id), ['0001', '0002']);
    assert.deepEqual(r.changed_files, ['.planning/MIGRATED-0002', '.planning/config.json', 'PROBE.txt']);
    assert.equal(r.up_to_date, false);
  });

  test('22: a second apply is a no-op — nothing applied, no backup, tree byte-identical', () => {
    const project = v1();
    const h = home();
    const reg = standardRegistry();
    const first = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW });
    assert.deepEqual(first.applied.map((a) => a.id), ['0001']);
    const between = snapshot(project);
    const homeBetween = snapshot(h);
    const second = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg,
      now: new Date('2026-09-28T12:00:00.000Z') });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.changed_files, []);
    assert.equal(second.backup, null);
    assert.deepEqual(second.failed, []);
    assert.equal(second.from, PV);
    assert.deepEqual(diffSnapshots(between, snapshot(project)), []);
    assert.deepEqual(diffSnapshots(homeBetween, snapshot(h)), []);
  });

  test('23: stamp-only — version rewritten, nothing else touched, key order preserved, no backup', () => {
    const project = track(makeStampedProject('2.0.0', { migrations_applied: ['0001'] }));
    const h = home();
    const before = JSON.parse(read(project, '.planning/config.json'));
    const snapBefore = snapshot(project);
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: '2.10.1',
      registryDir: registry({ '0002-noop.cjs': notApplicable('0002') }), now: NOW });
    assert.deepEqual(r.applied, []);
    assert.deepEqual(r.changed_files, ['.planning/config.json']);
    assert.equal(r.backup, null);
    assert.ok(!fs.existsSync(backupsRoot(h)));
    assert.equal(r.from, '2.0.0');
    assert.equal(r.to, '2.10.1');
    assert.equal(r.up_to_date, true);
    assert.deepEqual(diffSnapshots(snapBefore, snapshot(project)), ['.planning/config.json']);

    const raw = read(project, '.planning/config.json');
    const after = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(after, null, 2) + '\n');
    assert.deepEqual(Object.keys(after), Object.keys(before));
    for (const key of Object.keys(before)) {
      if (key !== 'aoforge') assert.deepEqual(after[key], before[key], key);
    }
    assert.deepEqual(after.aoforge, { version: '2.10.1', migrations_applied: ['0001'], upgraded_at: NOW.toISOString() });
  });

  test('24: ctx is exactly {projectRoot, userHome, pluginVersion, dryRun, options}', () => {
    const project = v1();
    const h = home();
    const reg = registry({ '0001-probe.cjs': probeMigration('0001') });
    const options = { kind: 'plugin', defaultWork: 'feature' };
    const expected = { projectRoot: project, userHome: h, pluginVersion: PV, dryRun: false, options };

    globalThis.__df36Probe = [];
    upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: reg, now: NOW, options });
    assert.deepEqual(globalThis.__df36Probe.map((p) => p.phase), ['detect', 'apply']);
    for (const { ctx } of globalThis.__df36Probe) {
      assert.deepEqual(Object.keys(ctx).sort(), ['dryRun', 'options', 'pluginVersion', 'projectRoot', 'userHome']);
      assert.deepEqual(ctx, expected);
    }

    // check() hands detect the same shape, with dryRun true because check never writes.
    const fresh = v1();
    globalThis.__df36Probe = [];
    upgrade.check({ projectRoot: fresh, userHome: h, pluginVersion: PV, registryDir: reg });
    assert.equal(globalThis.__df36Probe.length, 1);
    assert.deepEqual(globalThis.__df36Probe[0].ctx,
      { projectRoot: fresh, userHome: h, pluginVersion: PV, dryRun: true, options: {} });
  });

  test('24b: apply/check without an absolute userHome throw before touching anything', () => {
    const project = v1();
    const before = snapshot(project);
    assert.throws(() => upgrade.apply({ projectRoot: project, pluginVersion: PV,
      registryDir: standardRegistry(), now: NOW }), /userHome/);
    assert.throws(() => upgrade.check({ projectRoot: project, userHome: 'relative/home', pluginVersion: PV,
      registryDir: standardRegistry() }), /userHome/);
    assert.deepEqual(diffSnapshots(before, snapshot(project)), []);
  });
});

// ─── Stamp helpers ────────────────────────────────────────────────────────────

describe('stamp helpers', () => {
  test('25: readStamp → null without config.json or without aoforge; the stamp otherwise', () => {
    assert.equal(upgrade.readStamp(v1()), null);
    const noConfig = v1();
    fs.rmSync(path.join(noConfig, '.planning', 'config.json'));
    assert.equal(upgrade.readStamp(noConfig), null);
    const noPlanning = track(fs.mkdtempSync(path.join(os.tmpdir(), 'df-upgrade-empty-')));
    assert.equal(upgrade.readStamp(noPlanning), null);

    const stamped = track(makeStampedProject('2.0.0', { migrations_applied: ['0001', '0002'] }));
    assert.deepEqual(upgrade.readStamp(stamped),
      { version: '2.0.0', migrations_applied: ['0001', '0002'], upgraded_at: FIXTURE_STAMP_TIME });

    // writeStamp creates config.json when absent, and preserves every other key when present.
    const stamp = { version: PV, migrations_applied: ['0001'], upgraded_at: NOW.toISOString() };
    upgrade.writeStamp(noConfig, stamp);
    assert.equal(read(noConfig, '.planning/config.json'), JSON.stringify({ aoforge: stamp }, null, 2) + '\n');
    const flat = v1();
    const flatBefore = JSON.parse(read(flat, '.planning/config.json'));
    upgrade.writeStamp(flat, stamp);
    const flatAfter = JSON.parse(read(flat, '.planning/config.json'));
    assert.deepEqual(Object.keys(flatAfter), [...Object.keys(flatBefore), 'aoforge']);
    assert.deepEqual(upgrade.readStamp(flat), stamp);
  });

  test('26: invalid config.json → apply never writes it; failed has {id:"stamp"}', () => {
    const project = v1();
    const h = home();
    fs.writeFileSync(path.join(project, '.planning', 'config.json'), '{ not json');
    const before = snapshot(project);
    const r = upgrade.apply({ projectRoot: project, userHome: h, pluginVersion: PV,
      registryDir: standardRegistry(), now: NOW });
    assert.equal(read(project, '.planning/config.json'), '{ not json');
    const stampFailure = r.failed.find((f) => f.id === 'stamp');
    assert.ok(stampFailure, JSON.stringify(r.failed));
    assert.equal(typeof stampFailure.error, 'string');
    assert.ok(stampFailure.error.length > 0);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(r.changed_files, []);
    assert.equal(r.up_to_date, false);
    assert.deepEqual(diffSnapshots(before, snapshot(project)), []);

    const c = upgrade.check({ projectRoot: project, userHome: h, pluginVersion: PV, registryDir: standardRegistry() });
    assert.ok(c.failed.some((f) => f.id === 'stamp'));
    assert.equal(c.up_to_date, false);
  });
});
