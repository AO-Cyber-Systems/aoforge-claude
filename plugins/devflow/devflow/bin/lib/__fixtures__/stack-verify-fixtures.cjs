'use strict';

// Hand-built fixtures for stack-verify.cjs tests (TRD 42-06).
//
// Nothing here depends on what is installed on the machine running the tests. A "binary" is a
// hand-written `#!/bin/sh` stub in a temp dir that the test puts on a fake PATH; a "home" is a temp
// dir with the tool directories `resolveBinary` scans. File text is INVENTED, never copied from a
// repo under `~/dev`. Recipe lines in a Makefile need a literal tab, hence the `\t` escapes.

const fs = require('fs');
const path = require('path');
const os = require('os');

const runnerFx = require('./stack-runner-fixtures.cjs');

const { makeRepo, cleanup } = runnerFx;

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeStub(dir, name, exitCode) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\nexit ${exitCode}\n`, 'utf-8');
  fs.chmodSync(file, 0o755);
  return file;
}

/**
 * fakeBin(names, { failing = [] }) -> dir of `#!/bin/sh` stubs, chmod 755. Names in `failing`
 * exit 3; the rest exit 0. Put the dir (plus the node dir) on PATH to test resolution and `--run`
 * without any real tool.
 */
function fakeBin(names = [], { failing = [] } = {}) {
  const dir = mkTmp('df-verify-bin-');
  for (const name of names) writeStub(dir, name, 0);
  for (const name of failing) writeStub(dir, name, 3);
  return dir;
}

/**
 * fakeHome({ goBin, localBin, maestroBin, miseShims }) -> fake home dir with executable stubs in
 * the directories resolveBinary scans below `~`.
 */
function fakeHome({ goBin = [], localBin = [], maestroBin = [], miseShims = [] } = {}) {
  const home = mkTmp('df-verify-home-');
  const spec = [
    ['go/bin', goBin],
    ['.local/bin', localBin],
    ['.maestro/bin', maestroBin],
    ['.local/share/mise/shims', miseShims],
  ];
  for (const [rel, names] of spec) {
    for (const name of names) writeStub(path.join(home, rel), name, 0);
  }
  return home;
}

/**
 * verifyRepo() — the static-resolver fixture.
 *
 *   svc/Makefile     test, lint            (no include)
 *   inc/Makefile     build, plus `include common.mk` (a name it does not define is undecidable)
 *   Taskfile.yml     lint:go, build
 *   justfile         test
 *   package.json     scripts build, lint, test; pnpm-lock.yaml beside it
 *   bin/test.sh      executable
 *   scripts/x.sh     NOT executable
 *   cmd/tool/main.go an empty placeholder
 */
function verifyRepo() {
  return makeRepo({
    'svc/Makefile': [
      '.PHONY: test lint',
      'test:',
      '\tgo test ./...',
      '',
      'lint:',
      '\tgolangci-lint run',
      '',
    ].join('\n'),
    'inc/Makefile': [
      'include common.mk',
      '',
      'build:',
      '\t@echo build',
      '',
    ].join('\n'),
    'Taskfile.yml': [
      "version: '3'",
      'tasks:',
      '  lint:go:',
      '    cmds:',
      '      - golangci-lint run',
      '  build:',
      '    cmds:',
      '      - go build ./...',
      '',
    ].join('\n'),
    justfile: [
      'test:',
      '    go test ./...',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({
      name: 'fixture-app',
      scripts: { build: 'tsc', lint: 'eslint .', test: 'vitest run' },
    }, null, 2),
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'bin/test.sh': '#!/bin/sh\ngo test ./...\n',
    'scripts/x.sh': '#!/bin/sh\necho x\n',
    'cmd/tool/main.go': '',
  }, {
    modes: { 'bin/test.sh': 0o755, 'scripts/x.sh': 0o644 },
  });
}

/**
 * bodyRepo() — the deny-policy-on-bodies fixture (Test list 5b). Every target/script below is
 * invented; a "dangerous" body is only ever SCANNED by the tests, never executed.
 */
function bodyRepo() {
  return makeRepo({
    Makefile: [
      'build:',
      '\tdocker push registry/x:tag',
      '',
      'lint:',
      '\tgolangci-lint run',
      '',
      'chain:',
      '\t$(MAKE) push',
      '',
      'push:',
      '\tdocker push registry/x:tag',
      '',
      'deploy-check:',
      '\t./scripts/deploy.sh',
      '',
      'wrapped-ok:',
      '\t./scripts/lint.sh',
      '',
      'needs-dep: lint',
      '\tgolangci-lint run',
      '',
      'pushes-quoted:',
      '\tsh -c "git push origin main"',
      '',
    ].join('\n'),
    'Taskfile.yml': [
      "version: '3'",
      'tasks:',
      '  ship:',
      '    cmds:',
      '      - kubectl apply -f k8s/',
      '  fine:',
      '    cmds:',
      '      - golangci-lint run',
      '',
    ].join('\n'),
    justfile: [
      'release:',
      '    gh release create v1',
      '',
      'fine:',
      '    golangci-lint run',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({
      name: 'body-app',
      scripts: {
        build: 'tsc && npm publish',
        lint: 'eslint . && git push',
        check: 'tsc --noEmit',
        chained: 'npm run check && tsc',
        hooked: 'tsc',
        posthooked: 'npm publish',
      },
    }, null, 2),
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'scripts/release.sh': '#!/bin/sh\ngit push origin main\n',
    'scripts/ci.sh': '#!/bin/sh\ndocker push x\n',
    'scripts/deploy.sh': '#!/bin/sh\nkubectl apply -f k8s/\n',
    'scripts/lint.sh': '#!/bin/sh\ngolangci-lint run ./...\n',
    'scripts/outer.sh': '#!/bin/sh\n./scripts/inner.sh\n',
    'scripts/outer-make.sh': '#!/bin/sh\nmake push\n',
    'scripts/inner.sh': '#!/bin/sh\ngolangci-lint run\n',
    'scripts/continued.sh': '#!/bin/sh\ndocker \\\n  push x\n',
    'scripts/sourced.sh': '#!/bin/sh\n. ./scripts/inner.sh\n',
    'scripts/binary.dat': 'ELF\u0000\u0001\u0002',
    'bin/check': '#!/bin/sh\nnpm publish\n',
  }, {
    modes: {
      'scripts/release.sh': 0o755,
      'scripts/ci.sh': 0o755,
      'scripts/deploy.sh': 0o755,
      'scripts/lint.sh': 0o755,
      'scripts/outer.sh': 0o755,
      'scripts/outer-make.sh': 0o755,
      'scripts/inner.sh': 0o755,
      'scripts/continued.sh': 0o755,
      'scripts/sourced.sh': 0o755,
      'scripts/binary.dat': 0o755,
      'bin/check': 0o755,
    },
  });
}

// ─── Effect-guard fixtures (TRD 43-02) ────────────────────────────────────────
//
// The `--run` effect guard snapshots a real git work tree around the spawned command, so its tests
// need a REAL scratch repo and a REAL spawn of a stub tool that really writes files. Both live in a
// mkdtemp dir; nothing here ever points at a repository under `~/dev`.

const { spawnSync } = require('child_process');

/** True when `git` is on PATH. The guard tests `t.skip` without it. */
function gitAvailable() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  return !r.error && r.status === 0;
}

/**
 * gitIn(cwd, args) -> stdout. Runs git through `spawnSync` with the raw-commit escape in `env` (never
 * as a shell prefix) and throws on a non-zero exit, so a broken fixture fails loudly.
 */
function gitIn(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });
  if (r.error || r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.error ? r.error.message : r.stderr}`);
  return r.stdout;
}

/**
 * mutatingToolBin(name, shBody) -> dir holding one `#!/bin/sh` stub called `name`.
 *
 * Before `shBody` runs, the stub appends its arguments to `<dir>/<name>.calls`, so a test can count
 * how many times it was invoked (`stubCalls`). `shBody` runs in the gate's cwd and is where the stub
 * mutates the work tree. Put the dir on PATH ahead of the real PATH.
 */
function mutatingToolBin(name, shBody) {
  const dir = mkTmp('df-verify-mut-');
  const marker = path.join(dir, `${name}.calls`);
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\necho "$*" >> '${marker}'\n${shBody}\n`, 'utf-8');
  fs.chmodSync(file, 0o755);
  return dir;
}

/** stubCalls(dir, name) -> the argument line of every invocation of a `mutatingToolBin` stub, in order. */
function stubCalls(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, `${name}.calls`), 'utf-8').split('\n').filter((l) => l !== '');
  } catch (_) {
    return [];
  }
}

/** The tracked files of `gitDartRepo`, with their committed text. */
const DART_REPO_FILES = Object.freeze({
  'pubspec.yaml': 'name: guard_fixture\nenvironment:\n  sdk: ^3.0.0\n',
  'analysis_options.yaml': 'include: package:lints/recommended.yaml\n',
  'pubspec.lock': '# Generated by pub\npackages: {}\n',
  'README.md': 'a guard fixture\n',
  'lib/main.dart': 'void main() {}\n',
  '.gitignore': '.dart_tool/\nbuild/\n',
});

/** The text a `preDirty` repo's `analysis_options.yaml` gets as an UNCOMMITTED user edit. */
const PRE_DIRTY_LINE = '# my own uncommitted edit\n';

/**
 * gitDartRepo({ preDirty = false, files = {} }) -> a git work tree with one commit.
 *
 * Tracked: pubspec.yaml, analysis_options.yaml, pubspec.lock, README.md, lib/main.dart, .gitignore
 * (ignoring `.dart_tool/` and `build/`). `.dart_tool/package_config.json` exists but is ignored, so
 * `flutter --no-pub` has a resolved config. `files` adds (or overrides) tracked files. With
 * `preDirty`, `analysis_options.yaml` then gets an uncommitted edit (PRE_DIRTY_LINE appended), the
 * shape aocore and aodex were in during objective 42's rollout.
 */
function gitDartRepo({ preDirty = false, files = {} } = {}) {
  const root = makeRepo({
    ...DART_REPO_FILES,
    ...files,
    '.dart_tool/package_config.json': '{"configVersion":2,"packages":[]}\n',
  });
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'user.email', 'guard@example.invalid']);
  gitIn(root, ['config', 'user.name', 'Guard Fixture']);
  gitIn(root, ['config', 'commit.gpgsign', 'false']);
  gitIn(root, ['config', 'core.autocrlf', 'false']);
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'fixture']);
  if (preDirty) fs.appendFileSync(path.join(root, 'analysis_options.yaml'), PRE_DIRTY_LINE, 'utf-8');
  return root;
}

/**
 * gitRepo({ files = {}, modes = {} }) -> a git work tree with one commit holding exactly `files`.
 *
 * The same init sequence as `gitDartRepo` (no Dart files, no ignored `.dart_tool`): `files` and `modes`
 * go to `makeRepo` as they are, so a test controls every tracked file. The work tree is clean after it.
 */
function gitRepo({ files = {}, modes = {} } = {}) {
  const root = makeRepo(files, { modes });
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'user.email', 'guard@example.invalid']);
  gitIn(root, ['config', 'user.name', 'Guard Fixture']);
  gitIn(root, ['config', 'commit.gpgsign', 'false']);
  gitIn(root, ['config', 'core.autocrlf', 'false']);
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}

/**
 * componentRepo({ rootFiles = {}, component = 'client' }) -> a git work tree with one commit: a non-Dart
 * root beside one Flutter component.
 *
 * The shape of a monorepo whose root builds a Go binary into an un-ignored `bin/` while a Flutter app lives
 * in a subdirectory: the root `.gitignore` ignores `.dart_tool/` only (NOT `bin/`, `dist/`, `out/` or
 * `target/`, so a build's output there is untracked AND unignored). The component has a `pubspec.yaml`,
 * `lib/main.dart`, its own `.gitignore` (`.dart_tool/`) and a `.dart_tool/package_config.json`, which exists
 * but is ignored (never committed), so `flutter --no-pub` finds a resolved config there. `rootFiles` adds
 * (or overrides) tracked files at the root. Every file is written before the single commit, so the work tree
 * is clean afterwards.
 */
function componentRepo({ rootFiles = {}, component = 'client' } = {}) {
  return gitRepo({
    files: {
      'README.md': 'a component fixture\n',
      '.gitignore': '.dart_tool/\n',
      [`${component}/pubspec.yaml`]: 'name: client_app\nenvironment:\n  sdk: ^3.0.0\n',
      [`${component}/lib/main.dart`]: 'void main() {}\n',
      [`${component}/.gitignore`]: '.dart_tool/\n',
      [`${component}/.dart_tool/package_config.json`]: '{"configVersion":2,"packages":[]}\n',
      ...rootFiles,
    },
  });
}

/**
 * serviceWorkflow({ job, services, env, defaultsCwd, runs }) -> the text of a one-job GitHub workflow.
 *
 * `services` is a list of container names, each written as a block `services:` child with an `image:`
 * and its own `env:` (`<NAME>_USER`), so a reader can tell a job service apart from the job's env.
 * `env` becomes the job-level `env:` block with its values written verbatim (pass `${{ secrets.DB }}`
 * to get a runtime value). `defaultsCwd` sets `defaults.run.working-directory`. `runs` is one `- run:`
 * step per entry, after a `uses: actions/checkout@v4` step.
 */
function serviceWorkflow({ job = 'suite', services = [], env = {}, defaultsCwd = null, runs = [] } = {}) {
  const lines = ['name: CI', 'on: [push]', 'jobs:', `  ${job}:`, '    runs-on: ubuntu-latest'];
  if (defaultsCwd) lines.push('    defaults:', '      run:', `        working-directory: ${defaultsCwd}`);
  if (services.length) {
    lines.push('    services:');
    for (const name of services) {
      lines.push(`      ${name}:`, `        image: ${name}:16`, '        env:', `          ${name.toUpperCase()}_USER: app`);
    }
  }
  const envKeys = Object.keys(env);
  if (envKeys.length) {
    lines.push('    env:');
    for (const k of envKeys) lines.push(`      ${k}: ${env[k]}`);
  }
  lines.push('    steps:', '      - uses: actions/checkout@v4');
  for (const cmd of runs) lines.push(`      - run: ${cmd}`);
  return `${lines.join('\n')}\n`;
}

module.exports = {
  makeRepo,
  cleanup,
  fakeBin,
  fakeHome,
  verifyRepo,
  bodyRepo,
  gitAvailable,
  gitIn,
  mutatingToolBin,
  stubCalls,
  gitDartRepo,
  gitRepo,
  componentRepo,
  serviceWorkflow,
  PRE_DIRTY_LINE,
};
