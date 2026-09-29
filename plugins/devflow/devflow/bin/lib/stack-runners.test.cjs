'use strict';

// stack-runners.test.cjs — Test list (TRD 42-04), outermost (readRunners over a repo) to
// innermost (per-format parsers).
//
//  1. Root Makefile + svc/Makefile: targets from both; svc targets carry dir 'svc' and
//     invocation `make -C svc test`.
//  2. Makefile bodies: `\` continuations joined, `@`/`-` prefixes stripped; variables, .PHONY and
//     pattern rules are not targets. Recipes REQUIRE a leading tab (space-indented lines are not
//     recipe lines).
//  3. `include`: hasTarget is 'unknown' for a name not defined statically, true for a defined
//     one; a Makefile with no include gives false.
//  4. Taskfile: `:` in names, `cmd:` / `cmds:` flow list, `aliases:`; hasTarget resolves an alias.
//  5. Taskfile `cmds:` items in `- cmd:` and `- task:` form (`task: other` -> body `task other`).
//  6. justfile: params, `@` quiet prefix, `alias t := test`, `set shell := [...]`; bodies verbatim.
//  7. package.json + lockfile: pnpm / yarn / bun / npm manager; `test` -> `<mgr> test`.
//  8. Conventional scripts: bin/ + scripts/ *.sh; a non-executable one is listed executable:false.
//  9. Depth limit (default 1) and skip-dirs.
// 10. Exec enrichment through an injected exec; ENOENT leaves the static result unchanged.
// 11. Empty repo -> [] and no throw.
//
// Fixtures are hand-built (`__fixtures__/stack-runner-fixtures.cjs`), never generated.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const fx = require('./__fixtures__/stack-runner-fixtures.cjs');
const {
  readRunners,
  hasTarget,
  RUNNER_FILES,
  SKIP_DIRS,
  _parseMakefile,
} = require('./stack-runners.cjs');

const roots = [];
function track(root) { roots.push(root); return root; }
afterEach(() => { while (roots.length) fx.cleanup(roots.pop()); });

function find(targets, runner, dir, name) {
  return targets.find((t) => t.runner === runner && t.dir === dir && t.name === name);
}

describe('readRunners — Makefile (root and one level down)', () => {
  test('1. root and svc Makefiles are both read; svc targets use `make -C svc`', () => {
    const root = track(fx.makefileMonorepo());
    const targets = readRunners(root);

    const rootTest = find(targets, 'make', '', 'test');
    assert.ok(rootTest, 'root test target');
    assert.equal(rootTest.file, 'Makefile');
    assert.equal(rootTest.invocation, 'make test');

    const svcTest = find(targets, 'make', 'svc', 'test');
    assert.ok(svcTest, 'svc test target');
    assert.equal(svcTest.file, 'svc/Makefile');
    assert.equal(svcTest.invocation, 'make -C svc test');

    const svcNames = targets.filter((t) => t.dir === 'svc').map((t) => t.name);
    assert.deepEqual(
      svcNames.sort(),
      ['build', 'drift-check', 'generate', 'lint', 'test', 'vet'],
    );
    assert.equal(find(targets, 'make', 'svc', 'drift-check').invocation, 'make -C svc drift-check');
    assert.deepEqual(find(targets, 'make', 'svc', 'test').aliases, []);
  });

  test('1b. targets are sorted by (dir, runner, name)', () => {
    const root = track(fx.makefileMonorepo());
    const keys = readRunners(root).map((t) => [t.dir, t.runner, t.name]);
    const sorted = [...keys].sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      return 0;
    });
    assert.deepEqual(keys, sorted);
    assert.equal(keys[0][0], '', 'root targets come first');
  });

  test('2. bodies: continuations joined, @ and - prefixes stripped', () => {
    const root = track(fx.makefileMonorepo());
    const targets = readRunners(root);

    assert.deepEqual(find(targets, 'make', '', 'test').body, ['go test -race ./...']);
    assert.deepEqual(
      find(targets, 'make', '', 'lint').body,
      ['echo linting', 'golangci-lint run ./...'],
    );
    assert.deepEqual(
      find(targets, 'make', 'svc', 'test').body,
      ['go test -race -count=1 -coverprofile=cover.out ./...'],
    );
    assert.deepEqual(find(targets, 'make', 'svc', 'lint').body, ['golangci-lint run']);
    assert.deepEqual(
      find(targets, 'make', 'svc', 'drift-check').body,
      ['git diff --exit-code -- gen/'],
    );
    // A rule with prerequisites but no recipe is still a target, with an empty body.
    assert.deepEqual(find(targets, 'make', '', 'all').body, []);
  });

  test('2b. .PHONY, variable assignments and pattern rules are not targets', () => {
    const root = track(fx.makefileMonorepo());
    const names = readRunners(root).filter((t) => t.dir === '').map((t) => t.name).sort();
    assert.deepEqual(names, ['all', 'lint', 'test']);
  });

  test('2c. _parseMakefile: recipes REQUIRE a leading tab (space-indented lines are not recipe lines)', () => {
    const spaced = 'test:\n    go test ./...\n';
    const tabbed = 'test:\n\tgo test ./...\n';
    assert.deepEqual(_parseMakefile(spaced).targets, [{ name: 'test', body: [] }]);
    assert.deepEqual(_parseMakefile(tabbed).targets, [{ name: 'test', body: ['go test ./...'] }]);
  });

  test('2d. _parseMakefile: inline `; recipe`, several targets on one line, and merged rules', () => {
    const text = [
      'a b: dep ; echo shared',
      'test: build',
      'test:',
      '\tgo test ./...',
      '',
    ].join('\n');
    const byName = Object.fromEntries(_parseMakefile(text).targets.map((t) => [t.name, t.body]));
    assert.deepEqual(byName.a, ['echo shared']);
    assert.deepEqual(byName.b, ['echo shared']);
    assert.deepEqual(byName.test, ['go test ./...'], 'a repeated target accumulates its recipe');
  });

  test('2e. _parseMakefile: ::= / ?= / += / = assignments, define blocks, special targets, comments', () => {
    const text = [
      'A ::= 1',
      'B ?= 2',
      'C += 3',
      'D = x:y',
      '.SUFFIXES:',
      '.DEFAULT_GOAL := all',
      '# lint: not a target',
      'define BLOCK',
      'hidden:',
      '\techo hidden',
      'endef',
      'real:',
      '\t# a shell comment line',
      '',
      '\techo real',
      '',
    ].join('\n');
    assert.deepEqual(_parseMakefile(text).targets, [{ name: 'real', body: ['echo real'] }]);
  });

  test('2f. _parseMakefile: include / -include / sinclude set hasInclude', () => {
    assert.equal(_parseMakefile('include a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('-include a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('sinclude a.mk\nx:\n').hasInclude, true);
    assert.equal(_parseMakefile('x:\n\techo include y\n').hasInclude, false);
  });
});

describe('hasTarget — Makefile', () => {
  test('3. include-expanded Makefile: unknown when not static, true when defined', () => {
    const root = track(fx.makefileWithInclude());
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'build' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'lint' }), 'unknown');
  });

  test('3b. a Makefile with no include gives false for a missing target', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'lint' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: '', name: 'nope' }), false);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc', name: 'vet' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc', name: 'nope' }), false);
  });

  test('3c. a directory with no Makefile, an escaping dir, and an unrecognised runner', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: 'nowhere', name: 'test' }), false);
    assert.equal(hasTarget(root, { runner: 'make', dir: '../..', name: 'test' }), false);
    assert.equal(hasTarget(root, { runner: 'bazel', dir: '', name: 'test' }), 'unknown');
  });

  test('3d. dir spellings "", ".", "./svc" and "svc/" are normalised', () => {
    const root = track(fx.makefileMonorepo());
    assert.equal(hasTarget(root, { runner: 'make', dir: '.', name: 'test' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: './svc', name: 'vet' }), true);
    assert.equal(hasTarget(root, { runner: 'make', dir: 'svc/', name: 'vet' }), true);
  });
});

describe('readRunners — walk limits', () => {
  test('9. runner files deeper than maxDepth (default 1) are ignored', () => {
    const root = track(fx.makeRepo({
      'Makefile': 'top:\n\techo top\n',
      'one/Makefile': 'mid:\n\techo mid\n',
      'one/two/Makefile': 'deep:\n\techo deep\n',
    }));
    const names = (opts) => readRunners(root, opts).map((t) => t.name).sort();
    assert.deepEqual(names(), ['mid', 'top']);
    assert.deepEqual(names({ maxDepth: 0 }), ['top']);
    assert.deepEqual(names({ maxDepth: 2 }), ['deep', 'mid', 'top']);
  });

  test('9b. skip-dirs are never read, however deep maxDepth allows', () => {
    const files = { 'Makefile': 'top:\n\techo top\n' };
    for (const dir of ['node_modules', '.git', 'vendor', 'third_party', '.worktrees', '.dart_tool', 'build']) {
      files[`${dir}/Makefile`] = `skipped_${dir.replace(/\W/g, '_')}:\n\techo x\n`;
    }
    const root = track(fx.makeRepo(files));
    assert.deepEqual(readRunners(root, { maxDepth: 3 }).map((t) => t.name), ['top']);
  });

  test('9c. SKIP_DIRS and RUNNER_FILES are exported and cover the documented names', () => {
    for (const dir of ['node_modules', '.git', 'vendor', 'third_party', '.worktrees', '.dart_tool', 'build']) {
      assert.ok(SKIP_DIRS.has(dir), `${dir} skipped`);
    }
    assert.ok(RUNNER_FILES.make.includes('Makefile'));
    assert.ok(RUNNER_FILES.task.includes('Taskfile.yml'));
    assert.ok(RUNNER_FILES.task.includes('Taskfile.yaml'));
    assert.ok(RUNNER_FILES.just.includes('justfile'));
    assert.ok(RUNNER_FILES.npm.includes('package.json'));
  });

  test('11. an empty repo gives [] and never throws; neither does a missing root', () => {
    const root = track(fx.emptyRepo());
    assert.deepEqual(readRunners(root), []);
    assert.deepEqual(readRunners(`${root}/does-not-exist`), []);
  });
});
