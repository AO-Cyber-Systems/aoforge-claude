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
//   17. Backup at <home>/.claude/devflow/backups/<slug>-<8 hex>/<ts>/ with PRE-apply config.json
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
//   25. readStamp → null when config.json absent or has no devflow; the stamp otherwise.
//   26. config.json not valid JSON → apply does not write it; failed has {id:'stamp', error}.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
    assert.equal(config.devflow, undefined);
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
    assert.doesNotMatch(read(none, 'CLAUDE.md'), /DEVFLOW:START/);
  });

  test('F2: makeFakeHome({legacy:true, claudeMd}) has the legacy leftovers', () => {
    const h = track(makeFakeHome({ legacy: true, claudeMd: HAND_WRITTEN_ROUTING }));
    for (const rel of ['.claude/skills/df-plan/SKILL.md', '.claude/agents/df-planner.md',
      '.claude/devflow/VERSION', '.claude/skills/keep-me/SKILL.md', '.claude/CLAUDE.md']) {
      assert.ok(exists(h, rel), `missing ${rel}`);
    }
    assert.equal(read(h, '.claude/devflow/VERSION'), '1.20.4');
    assert.match(read(h, '.claude/CLAUDE.md'), /# DevFlow Routing/);
    assert.match(read(h, '.claude/CLAUDE.md'), /## TDD & Quality/);
    const bare = home();
    assert.deepEqual(fs.readdirSync(path.join(bare, '.claude')), []);
  });

  test('F3: makeStampedProject() is current-shape and stamped', () => {
    const root = track(makeStampedProject('2.0.0', { migrations_applied: ['0001'] }));
    const config = JSON.parse(read(root, '.planning/config.json'));
    assert.equal(config.devflow.version, '2.0.0');
    assert.deepEqual(config.devflow.migrations_applied, ['0001']);
    assert.equal(typeof config.devflow.upgraded_at, 'string');
    assert.equal(typeof config.workflow, 'object');
    assert.ok(exists(root, '.planning/state.json'));
    assert.ok(exists(root, '.planning/objectives/01-alpha/01-01-TRD.md'));
    assert.ok(!exists(root, '.planning/objectives/01-alpha/01-01-JOB.md'));
    assert.ok(exists(root, '.planning/objectives/02-beta/OBJECTIVE.md'));
    assert.match(read(root, '.planning/PROJECT.md'), /^kind: /m);
    assert.doesNotMatch(read(root, 'CLAUDE.md'), /DEVFLOW:START/);
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
