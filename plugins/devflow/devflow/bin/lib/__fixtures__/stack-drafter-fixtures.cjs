'use strict';

// Whole-repo failure-shape builders for the stack drafter (TRD 42-07).
// Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated test data.
//
// Each builder writes ONE invented repository into its own `fs.mkdtemp` directory and returns the
// absolute root. The shapes are modelled on the fleet failures catalogued in 42-RESEARCH (a
// multi-area service repo whose CI defaults to `svc/`, a Flutter release job with a `\`-continued
// `--build-number="${{ }}"`, a comment line read as a test, an echo-only release workflow, a
// `test -f x || {` control fragment, a `\`-continued `go test` beside a `sed -i`, a manifest-only
// Flutter app, empty and docs-only repos, a CI tool that is not installed). No directory name,
// module path or file body is copied from a real repository.
//
// The builders compose the lower-level fixture helpers: file writing and chmod come from
// stack-runner-fixtures, manifest bodies from stack-detect-fixtures, stub binaries and the fake
// home from stack-verify-fixtures. Makefile recipe lines need a literal tab, hence `\t`.

const path = require('path');

const runnerFx = require('./stack-runner-fixtures.cjs');
const detectFx = require('./stack-detect-fixtures.cjs');
const verifyFx = require('./stack-verify-fixtures.cjs');

const { goMod, flutterPubspec, dartPubspec } = detectFx;

/** The stub tools every e2e fake PATH carries (TRD 42-07 Task 1, plus gofmt for the go tier's format gate). */
const DEFAULT_TOOLCHAIN = Object.freeze([
  'go', 'gofmt', 'dart', 'flutter', 'make', 'just', 'task', 'golangci-lint', 'govulncheck', 'helm', 'maestro',
]);

/** makeWhole(files, { modes }) -> absolute root. `files` maps repo-relative path -> text. */
function makeWhole(files, { modes = {} } = {}) {
  return runnerFx.makeRepo(files, { modes });
}

/** cleanup(...roots) removes every root given (null entries are skipped). */
function cleanup(...roots) {
  for (const root of roots) {
    if (root) runnerFx.cleanup(root);
  }
}

/**
 * fakeToolchain(names = DEFAULT_TOOLCHAIN) -> dir of `#!/bin/sh` stubs (stack-verify's fakeBin).
 * Put ONLY this dir on PATH: a real tool leaking in from the node dir would make a
 * binary_missing case resolve.
 */
function fakeToolchain(names = DEFAULT_TOOLCHAIN) {
  return verifyFx.fakeBin([...names]);
}

/** fakeEmptyHome() -> a temp HOME with no org profiles and no tool dirs, so the bundled tier resolves. */
function fakeEmptyHome() {
  return verifyFx.fakeHome({});
}

const GO_MAIN = 'package main\n\nfunc main() {}\n';
const DART_MAIN = "void main() {\n  print('ok');\n}\n";

function wf(lines) {
  return `${lines.join('\n')}\n`;
}

/**
 * 1. multiAreaCiShape() — aocore-shaped.
 *
 *   svc/            go.mod, main.go, .golangci.yml, scripts/vulncheck.sh (a govulncheck wrapper)
 *   app/, admin/    Flutter apps
 *   portal/         package.json (vitest + playwright), an unsupported node area
 *   chart/          a Helm chart (a flag, never an area)
 *   ci.yml          workflow-level `defaults.run.working-directory: svc`; golangci-lint-action,
 *                   go vet, go test, a `\`-continued `gosec ... -fmt sarif ...`, the wrapper
 *   checks.yml      `helm lint chart/`, `npx playwright test` in portal/, a Flutter job in app/
 */
function multiAreaCiShape() {
  return makeWhole({
    'svc/go.mod': goMod('orbit-svc'),
    'svc/main.go': GO_MAIN,
    'svc/.golangci.yml': 'run:\n  timeout: 5m\n',
    'svc/scripts/vulncheck.sh': '#!/bin/sh\nset -eu\ngovulncheck ./...\n',
    'app/pubspec.yaml': flutterPubspec('orbit_app'),
    'app/lib/main.dart': DART_MAIN,
    'admin/pubspec.yaml': flutterPubspec('orbit_admin'),
    'admin/lib/main.dart': DART_MAIN,
    'portal/package.json': JSON.stringify({
      name: 'orbit-portal',
      private: true,
      scripts: { test: 'vitest run', e2e: 'playwright test' },
    }, null, 2),
    'chart/Chart.yaml': 'apiVersion: v2\nname: orbit\nversion: 0.1.0\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on:',
      '  push:',
      '    branches: [main]',
      'defaults:',
      '  run:',
      '    working-directory: svc',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - uses: golangci/golangci-lint-action@v6',
      '      - name: vet',
      '        run: go vet ./...',
      '      - name: test',
      '        run: go test -race -count=1 ./...',
      '      - name: gosec',
      '        run: |',
      '          gosec -exclude=G104 \\',
      '            -fmt sarif \\',
      '            -out gosec.sarif \\',
      '            ./...',
      '      - name: vulncheck',
      '        run: ./scripts/vulncheck.sh',
    ]),
    '.github/workflows/checks.yml': wf([
      'name: checks',
      'on: [pull_request]',
      'jobs:',
      '  chart:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: helm lint chart/',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: playwright',
      '        working-directory: portal',
      '        run: npx playwright test',
      '  app:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: app',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter analyze --no-fatal-infos',
      '      - run: flutter test',
    ]),
  }, { modes: { 'svc/scripts/vulncheck.sh': 0o755 } });
}

/**
 * 2. fragmentBuildShape() — eden-biz-shaped.
 *
 *   svc/       go.mod + Makefile (test, build)
 *   app/       Flutter app + Makefile (analyze, ipa)
 *   api-dart/  a PURE Dart package (must be `dart`, never `flutter`)
 *   ios.yml    `flutter build ipa \` continued onto `--build-number="${{ github.run_number }}"`
 */
function fragmentBuildShape() {
  return makeWhole({
    'svc/go.mod': goMod('ledger-svc'),
    'svc/main.go': GO_MAIN,
    'svc/Makefile': [
      '.PHONY: test build',
      'test:',
      '\tgo test ./...',
      '',
      'build:',
      '\tgo build -o bin/api ./...',
      '',
    ].join('\n'),
    'app/pubspec.yaml': flutterPubspec('ledger_app'),
    'app/lib/main.dart': DART_MAIN,
    'app/Makefile': [
      'analyze:',
      '\tflutter analyze',
      '',
      'ipa:',
      '\tflutter build ipa --release',
      '',
    ].join('\n'),
    'api-dart/pubspec.yaml': dartPubspec('ledger_api'),
    'api-dart/lib/ledger_api.dart': 'int answer() => 42;\n',
    '.github/workflows/ios.yml': wf([
      'name: ios',
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  ios:',
      '    runs-on: macos-latest',
      '    defaults:',
      '      run:',
      '        working-directory: app',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: build',
      '        run: |',
      '          flutter build ipa \\',
      '            --release \\',
      '            --build-number="${{ github.run_number }}"',
    ]),
  });
}

/**
 * 3. commentTestShape() — devflow-shaped: a root Go module whose CI block opens with a
 * `# run tests` comment, then go vet, the gofmt gate and a `gopls version | head -1` probe.
 */
function commentTestShape() {
  return makeWhole({
    'go.mod': goMod('relay'),
    'main.go': GO_MAIN,
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: checks',
      '        run: |',
      '          # run tests',
      '          go vet ./...',
      '          test -z "$(gofmt -l .)"',
      '          gopls version | head -1',
    ]),
  });
}

/**
 * 4. echoReleaseShape() — aoinference-shaped: the only Go module lives in `control-plane/`, whose
 * Makefile has lint / vet / test / build; the one workflow is a release job that only echoes.
 */
function echoReleaseShape() {
  return makeWhole({
    'control-plane/go.mod': goMod('beacon-cp'),
    'control-plane/main.go': GO_MAIN,
    'control-plane/Makefile': [
      '.PHONY: lint vet test build',
      'lint:',
      '\tgolangci-lint run',
      '',
      'vet:',
      '\tgo vet ./...',
      '',
      'test:',
      '\tgo test ./...',
      '',
      'build:',
      '\tgo build -o bin/cp ./...',
      '',
    ].join('\n'),
    'README.md': '# Beacon\n',
    '.github/workflows/release.yml': wf([
      'name: release',
      'on:',
      '  push:',
      '    tags: ["v*"]',
      'jobs:',
      '  publish:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: echo "Published ${{ github.ref_name }}"',
    ]),
  });
}

/**
 * 5. controlFragmentShape() — eden-circle-shaped: a root go.mod + Makefile, and a CI block whose
 * `test -f config.yaml || {` guard spans several physical lines before `go test -race ./...`.
 */
function controlFragmentShape() {
  return makeWhole({
    'go.mod': goMod('circle'),
    'main.go': GO_MAIN,
    Makefile: [
      '.PHONY: test lint',
      'test:',
      '\tgo test -race -count=1 ./...',
      '',
      'lint:',
      '\tgo vet ./...',
      '',
    ].join('\n'),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: |',
      '          test -f config.yaml || {',
      '            echo "config.yaml missing"',
      '            exit 1',
      '          }',
      '          go test -race ./...',
    ]),
  });
}

/**
 * 6. continuationSedShape() — aodex/politihub continuation shape: a `sed -i 's|a|b|'` rewrite
 * step, then a `\`-continued `go test` spread over four physical lines.
 */
function continuationSedShape() {
  return makeWhole({
    'go.mod': goMod('dex'),
    'main.go': GO_MAIN,
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      "      - run: sed -i 's|example.invalid/old|example.invalid/dex|' go.mod",
      '      - run: |',
      '          go test \\',
      '            -race \\',
      '            -coverprofile=cover.out \\',
      '            ./...',
    ]),
  });
}

/** 7. manifestOnlyFlutterShape() — a Flutter app with Maestro flows; no CI, no task runner. */
function manifestOnlyFlutterShape() {
  return makeWhole({
    'pubspec.yaml': flutterPubspec('trail_app'),
    'lib/main.dart': DART_MAIN,
    '.maestro/login.yaml': 'appId: invalid.example.trail\n---\n- launchApp\n',
  });
}

/** 8a. emptyShape() — a repo with nothing in it. */
function emptyShape() {
  return makeWhole({});
}

/** 8b. docsOnlyShape() — markdown only: no manifest, no CI, no runner. */
function docsOnlyShape() {
  return makeWhole({
    'README.md': '# Field notes\n\nNothing to build here.\n',
    'docs/guide.md': '# Guide\n\nRead me.\n',
  });
}

/** 9a. gosecOnlyShape() — a root Go module whose only security gate is a `\`-continued gosec. */
function gosecOnlyShape() {
  return makeWhole({
    'go.mod': goMod('vault'),
    'main.go': GO_MAIN,
    '.github/workflows/security.yml': wf([
      'name: security',
      'on: [push]',
      'jobs:',
      '  sast:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: |',
      '          gosec -exclude=G104 \\',
      '            ./...',
    ]),
  });
}

/** 9. missingBinaryShape() — a root Go module whose CI tests with ginkgo, which is NOT installed. */
function missingBinaryShape() {
  return makeWhole({
    'go.mod': goMod('spindle'),
    'main.go': GO_MAIN,
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: ginkgo -r -p',
    ]),
  });
}

/**
 * evidenceShape() — a small repo for collectEvidence's composition test (TRD 42-07 test 16):
 * `svc/` Go module with a Makefile, CI defaulting to `svc`, a continued go test, a comment, an
 * echo, and a root package.json.
 */
function evidenceShape() {
  return makeWhole({
    'svc/go.mod': goMod('probe-svc'),
    'svc/main.go': GO_MAIN,
    'svc/Makefile': [
      'test:',
      '\tgo test -race ./...',
      '',
      'fmt:',
      '\tgofmt -w .',
      '',
      'announce:',
      '\t@echo done',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({ name: 'probe-tools', private: true, scripts: { lint: 'eslint .' } }, null, 2),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'defaults:',
      '  run:',
      '    working-directory: svc',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: |',
      '          # run the tests',
      '          echo "starting"',
      '          go test \\',
      '            -count=1 \\',
      '            ./...',
      '      - run: make test',
    ]),
  });
}

/**
 * terminalShape() — ao-terminal-SHAPED (TRD 42-13: G1 + G2 + G3 together), git-backed, invented
 * names throughout.
 *
 *   .gitignore            `dist/`, with a Go module generated into dist/scaffoldapp/ (G1: never
 *                         a component)
 *   go.mod, main.go       the root Go module
 *   frontend/, docs/      package.json each: unsupported node areas
 *   Taskfile.yml          build:agent:internal (a real `go build`, listed FIRST, depended on by the
 *                         build:agent fan-out), build:agent:quickdev, build:backend (a `task:` fan-out
 *                         that `package` depends on), build:frontend, build:macos, dev (G3: the
 *                         canonical pick is build:backend)
 *   guard.yml             `go test -c -o /tmp/guard.test ./tests/guard/` (G2: compile-only) and
 *                         `go test ./pkg/guardnet/...` (G2: one package sub-tree); neither is the
 *                         repo-wide test
 *
 * Callers skip when stack-detect-fixtures.hasGit() is false.
 */
function terminalShape() {
  const taskfile = [
    "version: '3'",
    '',
    'tasks:',
    '  build:agent:internal:',
    '    cmd: go build -trimpath -o dist/bin/agent ./cmd/agent',
    '    internal: true',
    '',
    '  build:agent:quickdev:',
    '    cmds:',
    '      - go build -o dist/bin/agent-dev ./cmd/agent',
    '',
    '  build:agent:',
    '    deps:',
    '      - task: build:agent:internal',
    '        vars:',
    '          GOOS: linux',
    '      - task: build:agent:internal',
    '        vars:',
    '          GOOS: darwin',
    '',
    '  build:backend:',
    '    desc: Build the daemon and the agent.',
    '    cmds:',
    '      - task: build:daemon',
    '      - task: build:agent',
    '',
    '  build:daemon:',
    '    cmd: go build -o dist/bin/daemon ./cmd/daemon',
    '',
    '  build:frontend:',
    '    cmd: npm --prefix frontend run build',
    '',
    '  build:macos:',
    '    cmd: go build -o dist/bin/daemon-darwin ./cmd/daemon',
    '',
    '  dev:',
    '    deps: [build:agent:quickdev]',
    '    cmd: go run ./cmd/daemon',
    '',
    '  package:',
    '    deps:',
    '      - build:backend',
    '    cmds:',
    '      - npm --prefix frontend run package',
    '',
  ].join('\n');
  return detectFx.makeGitTree({
    '.gitignore': 'dist/\nnode_modules/\n',
    'go.mod': goMod('beacon'),
    'main.go': GO_MAIN,
    'dist/scaffoldapp/go.mod': goMod('scaffoldapp'),
    'dist/scaffoldapp/main.go': GO_MAIN,
    'frontend/package.json': JSON.stringify({
      name: 'beacon-frontend',
      private: true,
      scripts: { build: 'vite build', test: 'vitest run' },
    }, null, 2),
    'docs/package.json': JSON.stringify({
      name: 'beacon-docs',
      private: true,
      scripts: { build: 'docusaurus build' },
    }, null, 2),
    'Taskfile.yml': taskfile,
    '.github/workflows/guard.yml': wf([
      'name: guard',
      'on: [push]',
      'jobs:',
      '  guard:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: compile the egress guard',
      '        run: go test -c -o /tmp/guard.test ./tests/guard/',
      '      - name: guard package tests',
      '        run: go test ./pkg/guardnet/...',
    ]),
  }, { track: ['dist/scaffoldapp/go.mod'] });
}

/** Every e2e shape, by name, for "for each fixture" assertions. */
const SHAPES = Object.freeze({
  multiAreaCiShape,
  fragmentBuildShape,
  commentTestShape,
  echoReleaseShape,
  controlFragmentShape,
  continuationSedShape,
  manifestOnlyFlutterShape,
  emptyShape,
  docsOnlyShape,
  gosecOnlyShape,
  missingBinaryShape,
});

module.exports = {
  DEFAULT_TOOLCHAIN,
  makeWhole,
  cleanup,
  fakeToolchain,
  fakeEmptyHome,
  multiAreaCiShape,
  fragmentBuildShape,
  commentTestShape,
  echoReleaseShape,
  controlFragmentShape,
  continuationSedShape,
  manifestOnlyFlutterShape,
  emptyShape,
  docsOnlyShape,
  gosecOnlyShape,
  missingBinaryShape,
  evidenceShape,
  terminalShape,
  hasGit: detectFx.hasGit,
  SHAPES,
  // for callers that need the joined path of a fixture file
  join: (root, rel) => path.join(root, rel),
};
