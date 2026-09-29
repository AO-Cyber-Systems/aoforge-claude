'use strict';

// Hand-built repositories for `df-tools stack report` (TRD 42-08, SDR-06).
// Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated test data.
//
// Each builder writes ONE invented repository into its own `fs.mkdtemp` directory and returns the
// absolute root. Every builder drives one state of one or more REPORT_CHECKS rows (present, absent
// or weak); the comment above each names the rows it is for. No directory name, module path or file
// body is copied from a real repository.
//
// Composition: file writing comes from stack-drafter-fixtures (which wraps stack-runner-fixtures),
// manifest bodies from stack-detect-fixtures. Makefile recipe lines need a literal tab, hence `\t`.

const drafterFx = require('./stack-drafter-fixtures.cjs');
const detectFx = require('./stack-detect-fixtures.cjs');

const { makeWhole, cleanup, fakeToolchain, fakeEmptyHome } = drafterFx;
const { goMod, flutterPubspec, dartPubspec } = detectFx;

const GO_MAIN = 'package main\n\nfunc main() {}\n';
const DART_MAIN = "void main() {\n  print('ok');\n}\n";

function wf(lines) {
  return `${lines.join('\n')}\n`;
}

function mk(lines) {
  return `${lines.join('\n')}\n`;
}

/**
 * goGapsShape() — a root Go module whose CI runs only `go test ./...` (no -race, no vet, no
 * govulncheck), and a Makefile with a `test` target only.
 * Drives: GO-RACE, GO-VET, GO-VULN, GO-FMT (gap); GO-LINT, GO-TIDY (weak); GO-COVER, GO-SAST,
 * CI-HYGIENE (info). No DART-* / FLUT-* / JS-* rows.
 */
function goGapsShape() {
  return makeWhole({
    'go.mod': goMod('ledger'),
    'main.go': GO_MAIN,
    Makefile: mk(['test:', '\tgo test ./...']),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go test ./...',
    ]),
  });
}

/** The pieces of a minimal Flutter APP (lib/main.dart plus a platform dir). */
function flutterAppFiles(name) {
  return {
    'pubspec.yaml': flutterPubspec(name),
    'lib/main.dart': DART_MAIN,
    'android/app/build.gradle': '// placeholder\n',
  };
}

/**
 * flutterAppNoMaestro() — a Flutter app (lib/main.dart + android/) with CI `flutter analyze` and
 * `flutter test`, and no `.maestro/`, `patrol_test/` or runner target.
 * Drives: FLUT-MAESTRO (info), DART-FORMAT (gap), DART-COVER (info).
 */
function flutterAppNoMaestro() {
  return makeWhole({
    ...flutterAppFiles('trail_log'),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  app:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
  });
}

/**
 * flutterAppWithMaestro() — the same app with `.maestro/` flows that CI runs (`maestro test
 * .maestro`), plus a `dart pub outdated` step that can never fail.
 * Drives: FLUT-MAESTRO (present: no row), DART-OUTDATED (info).
 */
function flutterAppWithMaestro() {
  return makeWhole({
    ...flutterAppFiles('trail_log'),
    '.maestro/login.yaml': 'appId: invalid.example.trail\n---\n- launchApp\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  app:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter analyze',
      '      - run: flutter test --coverage',
      '      - run: dart pub outdated',
      '      - run: maestro test .maestro',
    ]),
  });
}

/**
 * weakAnalyzersShape() — `svc/` Go + `app/` Flutter, each CI job defaulting to its directory.
 * svc: a bare `gofmt -l .`, `go vet ./... || true`, and golangci-lint under
 * `continue-on-error: true`. app: `flutter analyze --no-fatal-infos`.
 * Drives: GO-FMT, GO-LINT, GO-VET, DART-ANALYZE (weak); DART-TEST (gap: app never tests).
 */
function weakAnalyzersShape() {
  return makeWhole({
    'svc/go.mod': goMod('beacon'),
    'svc/main.go': GO_MAIN,
    'app/pubspec.yaml': flutterPubspec('beacon_app'),
    'app/lib/main.dart': DART_MAIN,
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: svc',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: gofmt -l .',
      '      - run: go vet ./... || true',
      '      - name: lint',
      '        continue-on-error: true',
      '        run: golangci-lint run ./...',
      '  flutter:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: app',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: flutter analyze --no-fatal-infos',
    ]),
  });
}

/**
 * makeExpansionShape() — CI runs `make lint` (body: `golangci-lint run ./...`) and `make loop`,
 * a target that calls itself.
 * Drives: GO-LINT present through one level of runner expansion; the cycle guard.
 */
function makeExpansionShape() {
  return makeWhole({
    'go.mod': goMod('relay'),
    'main.go': GO_MAIN,
    Makefile: mk([
      'lint:',
      '\tgolangci-lint run ./...',
      '',
      'loop:',
      '\tmake loop',
    ]),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make lint',
      '      - run: make loop',
    ]),
  });
}

/**
 * wrapperScriptShape() — CI (on push AND a schedule) runs `./scripts/vuln-gate.sh`, whose body
 * runs govulncheck.
 * Drives: GO-VULN present through the wrapper script (scheduled, so no weak row either).
 */
function wrapperScriptShape() {
  return makeWhole({
    'go.mod': goMod('sentinel'),
    'main.go': GO_MAIN,
    'scripts/vuln-gate.sh': mk(['#!/bin/sh', 'set -e', '# scan for known vulnerabilities', 'govulncheck ./...']),
    '.github/workflows/security.yml': wf([
      'name: security',
      'on:',
      '  push:',
      '  schedule:',
      "    - cron: '0 6 * * 1'",
      'jobs:',
      '  vuln:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: ./scripts/vuln-gate.sh',
    ]),
  }, { modes: { 'scripts/vuln-gate.sh': 0o755 } });
}

/**
 * usesActionShape() — the only lint step is `uses: golangci/golangci-lint-action@v6`.
 * Drives: GO-LINT present from a `uses:` record.
 */
function usesActionShape() {
  return makeWhole({
    'go.mod': goMod('orbit'),
    'main.go': GO_MAIN,
    '.github/workflows/lint.yml': wf([
      'name: lint',
      'on: [push]',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: golangci/golangci-lint-action@v6',
      '        with:',
      '          version: v2.1',
    ]),
  });
}

/**
 * localMirrorShape({ runnerHasVet }) — CI runs `go vet ./...`; the Makefile has a `vet` target
 * running the same thing only when `runnerHasVet`, else just `build`.
 * Drives: LOCAL-MIRROR (gap naming `lint` when the runner lacks vet; no row when it has it).
 */
function localMirrorShape({ runnerHasVet = false } = {}) {
  return makeWhole({
    'go.mod': goMod('mirror'),
    'main.go': GO_MAIN,
    Makefile: runnerHasVet ? mk(['vet:', '\tgo vet ./...']) : mk(['build:', '\tgo build ./...']),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  vet:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: go vet ./...',
    ]),
  });
}

/**
 * noCiShape() — a root Go module with a Makefile and no `.github/workflows` at all.
 * Drives: CI-MISSING (info); no per-check CI gap rows.
 */
function noCiShape() {
  return makeWhole({
    'go.mod': goMod('quiet'),
    'main.go': GO_MAIN,
    Makefile: mk(['test:', '\tgo test ./...']),
  });
}

/**
 * helmOnlyLintShape() — a Go module with a chart at `deploy/chart/`; CI runs `helm lint` only
 * (no `helm template | kubeconform`).
 * Drives: HELM-LINT (gap: lint only).
 */
function helmOnlyLintShape() {
  return makeWhole({
    'go.mod': goMod('harbor-lite'),
    'main.go': GO_MAIN,
    'deploy/chart/Chart.yaml': 'apiVersion: v2\nname: harbor-lite\nversion: 0.1.0\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  chart:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: helm lint deploy/chart',
    ]),
  });
}

/**
 * sqlcNoDriftShape() — `sqlc.yaml` present; CI runs `sqlc generate` and tests, but never
 * `git diff --exit-code` after the generator.
 * Drives: GO-GEN-DRIFT (gap).
 */
function sqlcNoDriftShape() {
  return makeWhole({
    'go.mod': goMod('queries'),
    'main.go': GO_MAIN,
    'sqlc.yaml': 'version: "2"\nsql: []\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: sqlc generate',
      '      - run: go test -race ./...',
    ]),
  });
}

/**
 * sqlcWithDriftShape() — the counter-example: `sqlc generate` followed by `git diff --exit-code`.
 * Drives: GO-GEN-DRIFT present (no row).
 */
function sqlcWithDriftShape() {
  return makeWhole({
    'go.mod': goMod('queries'),
    'main.go': GO_MAIN,
    'sqlc.yaml': 'version: "2"\nsql: []\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  drift:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: |',
      '          sqlc generate',
      '          git diff --exit-code',
    ]),
  });
}

/** missingBinaryShape() — CI tests with ginkgo, which the fake toolchain does not carry. */
const { missingBinaryShape } = drafterFx;

/**
 * polyglotShape() — one repo carrying every remaining stack:
 *   root     Go module on `go 1.26`, `buf.yaml`, a Dockerfile with two unpinned bases
 *   portal/  package.json (playwright + typescript), tsconfig.json; CI runs `npm install`
 *   mobile/  Flutter app (lib/main.dart + ios/) with build_runner, a committed `.g.dart`,
 *            `pubspec.lock`, `integration_test/`; CI runs `dart format .` and
 *            `flutter test --exclude-tags golden`
 * Drives: GO-FIX, GO-BUF, GO-GEN-DRIFT, DOCKER-LINT, DOCKER-SCAN, DOCKER-PIN, JS-CI, JS-AUDIT,
 * JS-LINT, JS-TYPE, JS-E2E, DART-FORMAT (weak), DART-CODEGEN, DART-LOCK, FLUT-INTEG, FLUT-GOLDEN.
 */
function polyglotShape() {
  return makeWhole({
    'go.mod': 'module example.invalid/prism\n\ngo 1.26\n',
    'main.go': GO_MAIN,
    'buf.yaml': 'version: v2\n',
    Dockerfile: mk([
      'FROM golang:1.26 AS build',
      'WORKDIR /src',
      'COPY . .',
      'RUN go build -o /out/prism .',
      '',
      'FROM gcr.io/distroless/static',
      'COPY --from=build /out/prism /prism',
    ]),
    'portal/package.json': JSON.stringify({
      name: 'prism-portal',
      private: true,
      scripts: { build: 'vite build' },
      devDependencies: { '@playwright/test': '^1.48.0', typescript: '^5.6.0' },
    }, null, 2),
    'portal/tsconfig.json': '{}\n',
    'mobile/pubspec.yaml': flutterPubspec('prism_mobile', { buildRunner: true }),
    'mobile/pubspec.lock': '# generated by pub\npackages: {}\n',
    'mobile/lib/main.dart': DART_MAIN,
    'mobile/lib/model.g.dart': '// GENERATED CODE - DO NOT MODIFY BY HAND\n',
    'mobile/ios/Runner/Info.plist': '<plist/>\n',
    'mobile/integration_test/app_test.dart': 'void main() {}\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: go test -race -cover ./...',
      '  portal:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: portal',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: npm install',
      '      - run: npm run build',
      '  mobile:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: mobile',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: dart format .',
      '      - run: flutter test --exclude-tags golden',
    ]),
  });
}

/** pureDartShape() — a Dart (non-Flutter) package with no CI test step; used for the DART-COVER text. */
function pureDartShape() {
  return makeWhole({
    'pubspec.yaml': dartPubspec('tally'),
    'lib/tally.dart': 'int add(int a, int b) => a + b;\n',
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push]',
      'jobs:',
      '  dart:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: dart-lang/setup-dart@v1',
      '      - run: dart analyze --fatal-infos',
      '      - run: dart test',
    ]),
  });
}

/** Every builder, by name, for "every catalogue ID is exercised" assertions. */
const SHAPES = Object.freeze({
  goGapsShape,
  flutterAppNoMaestro,
  flutterAppWithMaestro,
  weakAnalyzersShape,
  makeExpansionShape,
  wrapperScriptShape,
  usesActionShape,
  localMirrorWithoutVet: () => localMirrorShape({ runnerHasVet: false }),
  localMirrorWithVet: () => localMirrorShape({ runnerHasVet: true }),
  noCiShape,
  helmOnlyLintShape,
  sqlcNoDriftShape,
  sqlcWithDriftShape,
  missingBinaryShape,
  polyglotShape,
  pureDartShape,
});

module.exports = {
  makeWhole,
  cleanup,
  fakeToolchain,
  fakeEmptyHome,
  goGapsShape,
  flutterAppNoMaestro,
  flutterAppWithMaestro,
  weakAnalyzersShape,
  makeExpansionShape,
  wrapperScriptShape,
  usesActionShape,
  localMirrorShape,
  noCiShape,
  helmOnlyLintShape,
  sqlcNoDriftShape,
  sqlcWithDriftShape,
  missingBinaryShape,
  polyglotShape,
  pureDartShape,
  SHAPES,
};
