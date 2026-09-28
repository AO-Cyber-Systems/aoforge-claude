'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Fixture self-checks (makeFixture):
//   1. go-service → go.mod, main.go, internal/orders/handler.go, internal/orders/handler_test.go,
//      internal/orders/store.go, Makefile, .github/workflows/ci.yml, README.md exist; `git log
//      --oneline` has exactly 1 line; branch `main`; `commit.gpgsign` local is `false`; porcelain
//      empty.
//   2. flutter-app → pubspec.yaml (with `flutter:` sdk dependency), lib/main.dart,
//      lib/src/app.dart, lib/src/habit_list.dart, test/habit_list_test.dart,
//      analysis_options.yaml, README.md; one commit; clean.
//   3. node-cli → package.json (`bin`, `scripts.test = "node --test"`), bin/todo.js,
//      lib/store.js, lib/format.js, test/store.test.js, README.md; one commit; clean.
//   4. empty → only README.md tracked; one commit; clean.
//   5. devflow → go-service shape plus .planning/PROJECT.md (frontmatter `kind: api`),
//      .planning/ROADMAP.md, .planning/STATE.md, .planning/config.json with a `devflow` stamp;
//      all committed; clean.
//   6. dirty → go-service committed, then main.go modified and notes.txt untracked: porcelain
//      lists exactly " M main.go" and "?? notes.txt".
//   7. writeMappedDocs(root) writes the 8 docs (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE,
//      CONVENTIONS, TESTING, PATTERNS, CONCERNS) under .planning/codebase/, each >= 21 lines;
//      writeProjectMd(root, {name, kind, defaultWork}) writes frontmatter kind/default_work and
//      the sections ## What This Is, ## Core Value, ## Requirements (### Validated, ### Active,
//      ### Out of Scope), ## Constraints; writeInferences(root, items) writes
//      .planning/.adopt-inferences.json as a JSON array.
//   8. Factory CLI: `node adopt-fixtures.cjs make go-service <dir>` prints {"root": "<abs>"} and
//      exits 0; the same command on a non-empty <dir> exits non-zero and writes nothing; a <dir>
//      whose parent is inside a git work tree (a fixture repo) exits non-zero and writes nothing.
//
// classify (pure):
//   9. `has_planning: true` with code and a manifest → devflow.
//   10. `code_files: 0, has_manifest: false` → greenfield.
//   11. `code_files: 0, has_manifest: true` (package.json only) → brownfield.
//   12. `code_files: 3, has_manifest: false` (main.go without go.mod) → brownfield.
//   13. `is_scratch_dir: true` with code → scratch; `is_scratch_dir: true` without code or
//       manifest → greenfield.
//   14. `has_planning: true, is_scratch_dir: true` → devflow.
//
// collectSignals / detectRepoState (IO, `scratchPrefixes: []` unless the test is about scratch):
//   15. go-service → brownfield, `primary_lang: 'go'`, `code_files >= 4`, has_manifest, has_git,
//       `git_age_days === 0`, `has_planning: false`.
//   16. flutter-app → brownfield, `primary_lang: 'dart'`; node-cli → brownfield, `primary_lang`
//       as `detectManifest` reports for package.json without tsconfig (`javascript`).
//   17. empty → greenfield; devflow → devflow, `has_codebase_map: false`; after
//       `writeMappedDocs`, `has_codebase_map: true`.
//   18. dirty → brownfield (the detector does not look at git cleanliness).
//   19. `scratchPrefixes: [parent + path.sep]` → go-service becomes `scratch`; `userHome` = H and
//       root under `H/Downloads/x` → `is_scratch_dir: true`; `userHome: null` → the Downloads
//       rule is off.
//   20. `node_modules/`, `.git/`, `build/`, `.dart_tool/` contents are not counted (write 20 .js
//       files under node_modules/x/, count unchanged).
//   21. Org-profile marker extensions count: fake home with an org profile whose detect markers
//       include `*.foo`, repo with 3 .foo files and no other code → `code_files === 3`; the same
//       repo with `userHome: null` → 0.
//   22. Not a git repo (plain mkdtemp dir with main.go) → `has_git: false`, `git_age_days: null`,
//       state still brownfield.
//
// derive:
//   23. `is_substantive` table: {age 8, files 0, manifest} → true; {age 0, files 11, manifest} →
//       true; {age 0, files 10, manifest} → false; {age 30, files 50, no manifest} → false;
//       {age 30, files 50, manifest, scratch} → false; {age null, files 11, manifest} → true.
//   24. `should_offer_map`: {planning, no map, 50 files} → true; 49 → false; map present → false;
//       no planning → false; `threshold: 10` honoured.
//   25. `has_code_or_manifest` = code_files > 0 OR has_manifest.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const {
  makeFixture,
  writeMappedDocs,
  writeProjectMd,
  writeInferences,
  makeFakeHome,
  gitEnv,
} = require('./__fixtures__/adopt-fixtures.cjs');

const { makeHome, profileMd } = require('./__fixtures__/stack-profile-fixtures.cjs');

const { classify, derive, detectRepoState } = require('./repo-state.cjs');

const FACTORY_PATH = path.join(__dirname, '__fixtures__', 'adopt-fixtures.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

let parent;
let home;

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'df-repo-state-parent-'));
  home = makeFakeHome();
});

afterEach(() => {
  fs.rmSync(parent, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

function porcelain(root) {
  return execFileSync('git', ['-C', root, 'status', '--porcelain'], {
    env: gitEnv(home),
    encoding: 'utf-8',
  });
}

function gitLocalConfig(root, key) {
  return execFileSync('git', ['-C', root, 'config', '--local', key], {
    env: gitEnv(home),
    encoding: 'utf-8',
  }).trim();
}

function currentBranch(root) {
  return execFileSync('git', ['-C', root, 'branch', '--show-current'], {
    env: gitEnv(home),
    encoding: 'utf-8',
  }).trim();
}

function oneLineLog(root) {
  return execFileSync('git', ['-C', root, 'log', '--oneline'], {
    env: gitEnv(home),
    encoding: 'utf-8',
  });
}

// ─── makeFixture self-checks ──────────────────────────────────────────────────

describe('makeFixture — self-checks', () => {
  test('1. go-service: expected files, one commit, branch main, gpgsign off, clean', () => {
    const root = makeFixture('go-service', { parent, home });
    for (const rel of [
      'go.mod',
      'main.go',
      'internal/orders/handler.go',
      'internal/orders/handler_test.go',
      'internal/orders/store.go',
      'Makefile',
      '.github/workflows/ci.yml',
      'README.md',
    ]) {
      assert.ok(fs.existsSync(path.join(root, rel)), `expected ${rel} to exist`);
    }
    assert.strictEqual(oneLineLog(root).trim().split('\n').length, 1);
    assert.strictEqual(currentBranch(root), 'main');
    assert.strictEqual(gitLocalConfig(root, 'commit.gpgsign'), 'false');
    assert.strictEqual(porcelain(root), '');
  });

  test('2. flutter-app: expected files, one commit, clean', () => {
    const root = makeFixture('flutter-app', { parent, home });
    const pubspec = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf-8');
    assert.match(pubspec, /flutter:\s*\n\s*sdk:\s*flutter/);
    for (const rel of [
      'lib/main.dart',
      'lib/src/app.dart',
      'lib/src/habit_list.dart',
      'test/habit_list_test.dart',
      'analysis_options.yaml',
      'README.md',
    ]) {
      assert.ok(fs.existsSync(path.join(root, rel)), `expected ${rel} to exist`);
    }
    assert.strictEqual(oneLineLog(root).trim().split('\n').length, 1);
    assert.strictEqual(porcelain(root), '');
  });

  test('3. node-cli: expected files, one commit, clean', () => {
    const root = makeFixture('node-cli', { parent, home });
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    assert.ok(pkg.bin && pkg.bin.todo);
    assert.strictEqual(pkg.scripts.test, 'node --test');
    for (const rel of ['bin/todo.js', 'lib/store.js', 'lib/format.js', 'test/store.test.js', 'README.md']) {
      assert.ok(fs.existsSync(path.join(root, rel)), `expected ${rel} to exist`);
    }
    assert.strictEqual(oneLineLog(root).trim().split('\n').length, 1);
    assert.strictEqual(porcelain(root), '');
  });

  test('4. empty: only README.md tracked, one commit, clean', () => {
    const root = makeFixture('empty', { parent, home });
    const tracked = execFileSync('git', ['-C', root, 'ls-files'], { env: gitEnv(home), encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.deepStrictEqual(tracked, ['README.md']);
    assert.strictEqual(oneLineLog(root).trim().split('\n').length, 1);
    assert.strictEqual(porcelain(root), '');
  });

  test('5. devflow: go-service shape + planning docs, committed, clean', () => {
    const root = makeFixture('devflow', { parent, home });
    assert.ok(fs.existsSync(path.join(root, 'go.mod')));
    const projectMd = fs.readFileSync(path.join(root, '.planning/PROJECT.md'), 'utf-8');
    assert.match(projectMd, /kind: api/);
    assert.ok(fs.existsSync(path.join(root, '.planning/ROADMAP.md')));
    assert.ok(fs.existsSync(path.join(root, '.planning/STATE.md')));
    const config = JSON.parse(fs.readFileSync(path.join(root, '.planning/config.json'), 'utf-8'));
    assert.ok(config.devflow && config.devflow.version);
    assert.strictEqual(porcelain(root), '');
  });

  test('6. dirty: modified main.go + untracked notes.txt', () => {
    const root = makeFixture('dirty', { parent, home });
    const status = porcelain(root).split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(status, [' M main.go', '?? notes.txt'].sort());
  });

  test('7. writeMappedDocs / writeProjectMd / writeInferences', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-repo-state-docs-'));
    const docs = writeMappedDocs(root);
    const names = ['STACK', 'INTEGRATIONS', 'ARCHITECTURE', 'STRUCTURE', 'CONVENTIONS', 'TESTING', 'PATTERNS', 'CONCERNS'];
    for (const name of names) {
      const file = path.join(root, '.planning/codebase', `${name}.md`);
      assert.ok(fs.existsSync(file), `expected ${name}.md`);
      const lineCount = fs.readFileSync(file, 'utf-8').split('\n').length;
      assert.ok(lineCount >= 21, `${name}.md has ${lineCount} lines`);
    }
    assert.strictEqual(docs.length, 8);

    writeProjectMd(root, { name: 'Fixture App', kind: 'api', defaultWork: 'feature' });
    const projectMd = fs.readFileSync(path.join(root, '.planning/PROJECT.md'), 'utf-8');
    assert.match(projectMd, /kind: api/);
    assert.match(projectMd, /default_work: feature/);
    for (const heading of [
      '## What This Is',
      '## Core Value',
      '## Requirements',
      '### Validated',
      '### Active',
      '### Out of Scope',
      '## Constraints',
    ]) {
      assert.ok(projectMd.includes(heading), `expected heading ${heading}`);
    }

    writeInferences(root, [{ field: 'kind', value: 'api', confidence: 'high', evidence: 'go.mod' }]);
    const inferences = JSON.parse(fs.readFileSync(path.join(root, '.planning/.adopt-inferences.json'), 'utf-8'));
    assert.ok(Array.isArray(inferences));
    assert.strictEqual(inferences[0].field, 'kind');

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('8. factory CLI: make prints root, refuses non-empty dir, refuses nested-in-work-tree', () => {
    const dir = path.join(parent, 'cli-fixture');
    const out = execFileSync('node', [FACTORY_PATH, 'make', 'go-service', dir, '--home', home], { encoding: 'utf-8' });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.root, dir);
    assert.ok(fs.existsSync(path.join(dir, 'go.mod')));

    const nonEmptyDir = fs.mkdtempSync(path.join(parent, 'non-empty-'));
    fs.writeFileSync(path.join(nonEmptyDir, 'existing.txt'), 'x', 'utf-8');
    const before = fs.readdirSync(nonEmptyDir);
    const r1 = spawnSync('node', [FACTORY_PATH, 'make', 'node-cli', nonEmptyDir, '--home', home], { encoding: 'utf-8' });
    assert.notStrictEqual(r1.status, 0);
    assert.deepStrictEqual(fs.readdirSync(nonEmptyDir), before);

    const nestedDir = path.join(dir, 'nested');
    const r2 = spawnSync('node', [FACTORY_PATH, 'make', 'node-cli', nestedDir, '--home', home], { encoding: 'utf-8' });
    assert.notStrictEqual(r2.status, 0);
    assert.strictEqual(fs.existsSync(nestedDir), false);
  });
});

// ─── classify — pure ──────────────────────────────────────────────────────────

describe('classify — pure', () => {
  test('9. has_planning true with code and manifest -> devflow', () => {
    assert.strictEqual(
      classify({ has_planning: true, code_files: 5, has_manifest: true, is_scratch_dir: false }),
      'devflow'
    );
  });

  test('10. code_files 0, has_manifest false -> greenfield', () => {
    assert.strictEqual(
      classify({ has_planning: false, code_files: 0, has_manifest: false, is_scratch_dir: false }),
      'greenfield'
    );
  });

  test('11. code_files 0, has_manifest true (package.json only) -> brownfield', () => {
    assert.strictEqual(
      classify({ has_planning: false, code_files: 0, has_manifest: true, is_scratch_dir: false }),
      'brownfield'
    );
  });

  test('12. code_files 3, has_manifest false (main.go without go.mod) -> brownfield', () => {
    assert.strictEqual(
      classify({ has_planning: false, code_files: 3, has_manifest: false, is_scratch_dir: false }),
      'brownfield'
    );
  });

  test('13. is_scratch_dir true with code -> scratch; without code or manifest -> greenfield', () => {
    assert.strictEqual(
      classify({ has_planning: false, code_files: 3, has_manifest: false, is_scratch_dir: true }),
      'scratch'
    );
    assert.strictEqual(
      classify({ has_planning: false, code_files: 0, has_manifest: false, is_scratch_dir: true }),
      'greenfield'
    );
  });

  test('14. has_planning true, is_scratch_dir true -> devflow', () => {
    assert.strictEqual(
      classify({ has_planning: true, code_files: 0, has_manifest: false, is_scratch_dir: true }),
      'devflow'
    );
  });
});

// ─── collectSignals / detectRepoState — IO ────────────────────────────────────

describe('collectSignals / detectRepoState', () => {
  test('15. go-service -> brownfield, go signals', () => {
    const root = makeFixture('go-service', { parent, home });
    const { state, signals } = detectRepoState(root, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(state, 'brownfield');
    assert.strictEqual(signals.primary_lang, 'go');
    assert.ok(signals.code_files >= 4, `expected >=4 code files, got ${signals.code_files}`);
    assert.strictEqual(signals.has_manifest, true);
    assert.strictEqual(signals.has_git, true);
    assert.strictEqual(signals.git_age_days, 0);
    assert.strictEqual(signals.has_planning, false);
  });

  test('16. flutter-app -> dart; node-cli -> javascript', () => {
    const flutterRoot = makeFixture('flutter-app', { parent, home });
    const flutter = detectRepoState(flutterRoot, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(flutter.state, 'brownfield');
    assert.strictEqual(flutter.signals.primary_lang, 'dart');

    const nodeRoot = makeFixture('node-cli', { parent, home, name: 'node-cli-16' });
    const node = detectRepoState(nodeRoot, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(node.state, 'brownfield');
    assert.strictEqual(node.signals.primary_lang, 'javascript');
  });

  test('17. empty -> greenfield; devflow -> devflow, codebase map toggles', () => {
    const emptyRoot = makeFixture('empty', { parent, home });
    assert.strictEqual(detectRepoState(emptyRoot, { userHome: home, scratchPrefixes: [] }).state, 'greenfield');

    const devflowRoot = makeFixture('devflow', { parent, home });
    const before = detectRepoState(devflowRoot, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(before.state, 'devflow');
    assert.strictEqual(before.signals.has_codebase_map, false);

    writeMappedDocs(devflowRoot);
    const after = detectRepoState(devflowRoot, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(after.signals.has_codebase_map, true);
  });

  test('18. dirty -> brownfield regardless of cleanliness', () => {
    const root = makeFixture('dirty', { parent, home });
    assert.strictEqual(detectRepoState(root, { userHome: home, scratchPrefixes: [] }).state, 'brownfield');
  });

  test('19. scratchPrefixes and Downloads rule', () => {
    const root = makeFixture('go-service', { parent, home, name: 'scratch-check' });
    const scratchResult = detectRepoState(root, { userHome: home, scratchPrefixes: [parent + path.sep] });
    assert.strictEqual(scratchResult.state, 'scratch');

    const downloadsDir = path.join(home, 'Downloads', 'x');
    fs.mkdirSync(downloadsDir, { recursive: true });
    const withHome = detectRepoState(downloadsDir, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(withHome.signals.is_scratch_dir, true);

    const withoutHome = detectRepoState(downloadsDir, { userHome: null, scratchPrefixes: [] });
    assert.strictEqual(withoutHome.signals.is_scratch_dir, false);
  });

  test('20. node_modules/.git/build/.dart_tool contents are not counted', () => {
    const root = makeFixture('node-cli', { parent, home, name: 'exclude-check' });
    const before = detectRepoState(root, { userHome: home, scratchPrefixes: [] }).signals.code_files;

    const nmDir = path.join(root, 'node_modules', 'x');
    fs.mkdirSync(nmDir, { recursive: true });
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(nmDir, `f${i}.js`), '// noop\n', 'utf-8');
    }

    const after = detectRepoState(root, { userHome: home, scratchPrefixes: [] }).signals.code_files;
    assert.strictEqual(after, before);
  });

  test('21. org-profile *.foo marker extends the counted extension set', () => {
    const orgHome = makeHome({
      stacks: {
        fooprofile: profileMd({
          yaml: 'id: fooprofile\ndetect:\n  - "*.foo"\nlanguages:\n  - foo',
        }),
      },
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-repo-state-foo-'));
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(root, `f${i}.foo`), 'x', 'utf-8');
    }

    const withHome = detectRepoState(root, { userHome: orgHome, scratchPrefixes: [] });
    assert.strictEqual(withHome.signals.code_files, 3);

    const withoutHome = detectRepoState(root, { userHome: null, scratchPrefixes: [] });
    assert.strictEqual(withoutHome.signals.code_files, 0);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(orgHome, { recursive: true, force: true });
  });

  test('22. not a git repo -> has_git false, git_age_days null, state still brownfield', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-repo-state-nogit-'));
    fs.writeFileSync(path.join(root, 'main.go'), 'package main\n', 'utf-8');
    const result = detectRepoState(root, { userHome: home, scratchPrefixes: [] });
    assert.strictEqual(result.signals.has_git, false);
    assert.strictEqual(result.signals.git_age_days, null);
    assert.strictEqual(result.state, 'brownfield');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ─── derive — pure ────────────────────────────────────────────────────────────

describe('derive', () => {
  test('23. is_substantive table', () => {
    const cases = [
      [{ git_age_days: 8, code_files: 0, has_manifest: true, is_scratch_dir: false }, true],
      [{ git_age_days: 0, code_files: 11, has_manifest: true, is_scratch_dir: false }, true],
      [{ git_age_days: 0, code_files: 10, has_manifest: true, is_scratch_dir: false }, false],
      [{ git_age_days: 30, code_files: 50, has_manifest: false, is_scratch_dir: false }, false],
      [{ git_age_days: 30, code_files: 50, has_manifest: true, is_scratch_dir: true }, false],
      [{ git_age_days: null, code_files: 11, has_manifest: true, is_scratch_dir: false }, true],
    ];
    for (const [signals, expected] of cases) {
      assert.strictEqual(
        derive({ has_planning: false, has_codebase_map: false, ...signals }).is_substantive,
        expected,
        `signals ${JSON.stringify(signals)}`
      );
    }
  });

  test('24. should_offer_map', () => {
    assert.strictEqual(
      derive({ has_planning: true, has_codebase_map: false, code_files: 50 }).should_offer_map,
      true
    );
    assert.strictEqual(
      derive({ has_planning: true, has_codebase_map: false, code_files: 49 }).should_offer_map,
      false
    );
    assert.strictEqual(
      derive({ has_planning: true, has_codebase_map: true, code_files: 999 }).should_offer_map,
      false
    );
    assert.strictEqual(
      derive({ has_planning: false, has_codebase_map: false, code_files: 999 }).should_offer_map,
      false
    );
    assert.strictEqual(
      derive({ has_planning: true, has_codebase_map: false, code_files: 10 }, { mapThreshold: 10 }).should_offer_map,
      true
    );
  });

  test('25. has_code_or_manifest', () => {
    assert.strictEqual(derive({ code_files: 0, has_manifest: false }).has_code_or_manifest, false);
    assert.strictEqual(derive({ code_files: 1, has_manifest: false }).has_code_or_manifest, true);
    assert.strictEqual(derive({ code_files: 0, has_manifest: true }).has_code_or_manifest, true);
  });
});
