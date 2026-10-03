'use strict';

// Golden-shape builders for the stack drafter (TRD 43-06, objective 43's success criterion).
//
// Objective 42 hand-fixed eleven fleet drafts; the frozen results are
// `.planning/objectives/42-codebase-aware-stack-drafter/overrides/*.STACK.md`. Each builder below
// writes ONE invented repository whose EVIDENCE has the shape the override's `provenance.sources`
// describe (manifests that make the areas detectable, task-runner targets, CI workflow steps), and
// GOLDEN holds what `stack init` must draft for it: the override's `extends`, `components` and, per
// command key, `run` / `apply` / `cwd`.
//
// What is invented and what is not. The expected output names some paths and target names (`go/`,
// `tsunami/`, `make openapi-verify`, `./scripts/eden/build.sh`, `helm/aocore-gateway/`), so those
// exist in the fixtures under the same names: they ARE the expected output. Everything else is
// invented for this file: module names, binary names, recipe and script bodies, every other target,
// workflow file names and their steps. No file body is copied from a fleet repository, and no
// drafter rule may name one of these repositories (TRD 43-06 binding rules).
//
// Comparison scope (stack-drafter-golden.test.cjs): extends, the components set, and per key
// run/apply/cwd. `when`, `scoped`, `timeout_s`, `loop` and `provenance` are out of scope.
//
// HAND_ONLY: keys a human chose that no general rule can derive (governance in TRD 43-06). Started as
// exactly the user-confirmed set; every later entry carries its one-line reason and is listed for user
// acceptance at the 43-07 checkpoint.
// KEY_ALIASES: a golden key spelled differently from the drafter's canonical key.
// EXTRA_ALLOWED: a ROOT key the draft may carry though the override lacks it (same governance).
//
// Makefile recipe lines need a literal tab, hence `\t`.

const detectFx = require('./stack-detect-fixtures.cjs');
const drafterFx = require('./stack-drafter-fixtures.cjs');

const { goMod, flutterPubspec, dartPubspec } = detectFx;
const { makeWhole } = drafterFx;

const GO_MAIN = 'package main\n\nfunc main() {}\n';
const DART_MAIN = "void main() {\n  print('ok');\n}\n";

const wf = (lines) => `${lines.join('\n')}\n`;
const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const sh = (...lines) => `#!/bin/sh\nset -eu\n${lines.join('\n')}\n`;
const mk = (lines) => `${lines.join('\n')}\n`;

/** The stub tools the drafter's verifier must find on PATH: the e2e default plus what a golden runs. */
const TOOLS = Object.freeze({
  base: drafterFx.DEFAULT_TOOLCHAIN,
  node: ['npm', 'npx'],
  shell: ['bash', 'sh', 'shellcheck'],
  docker: ['docker'],
});
const toolsFor = (...extra) => [...TOOLS.base, ...extra.flatMap((k) => TOOLS[k])];

// ─── 1. ao-terminal ───────────────────────────────────────────────────────────

/**
 * goldenTerminalShape() — a Go desktop-terminal repo (`beaconterm`): a root Go module with an
 * Electron/TypeScript frontend at the root (root package.json), a Go `tsunami/` component with a node
 * frontend of its own, and node `docs/`. Sources: Taskfile.yml (internal helper tasks, a `build:backend`
 * fan-out, `check:ts`, `generate`, a one-shot `init`), five workflows, three package.json, TESTING.md.
 */
function goldenTerminalShape() {
  const taskfile = [
    "version: '3'",
    '',
    'tasks:',
    '  init:',
    '    desc: One-shot developer bootstrap.',
    '    cmds:',
    '      - task: npm:install',
    '      - task: go:mod:tidy',
    '      - npm --prefix docs install',
    '',
    '  npm:install:',
    '    internal: true',
    '    cmd: npm install',
    '',
    '  go:mod:tidy:',
    '    internal: true',
    '    cmd: go mod tidy',
    '',
    '  generate:',
    '    desc: Regenerate the TypeScript bindings from the Go types.',
    '    cmds:',
    '      - go run ./cmd/gentypes',
    '',
    '  check:ts:',
    '    desc: Typecheck the frontend.',
    '    cmd: npx tsc --noEmit -p .',
    '',
    '  build:server:',
    '    cmd: go build -o dist/bin/beaconsrv ./cmd/server',
    '',
    '  build:shell:',
    '    cmd: go build -o dist/bin/beaconsh ./cmd/shell',
    '',
    '  build:backend:',
    '    desc: Build every Go binary.',
    '    cmds:',
    '      - task: build:server',
    '      - task: build:shell',
    '',
    '  build:frontend:',
    '    cmd: npm run build:web',
    '',
    '  package:',
    '    deps: [build:backend, build:frontend]',
    '    cmd: npx electron-builder --publish never',
    '',
  ].join('\n');
  return makeWhole({
    'go.mod': goMod('beaconterm'),
    'main.go': GO_MAIN,
    'cmd/server/main.go': GO_MAIN,
    'cmd/shell/main.go': GO_MAIN,
    'cmd/gentypes/main.go': GO_MAIN,
    'package.json': json({ name: 'beaconterm', private: true, scripts: { dev: 'electron-vite dev', 'build:web': 'electron-vite build', test: 'vitest' } }),
    'tsconfig.json': '{ "compilerOptions": { "strict": true, "noEmit": true } }\n',
    'docs/package.json': json({ name: 'beaconterm-docs', private: true, scripts: { build: 'docusaurus build', start: 'docusaurus start' } }),
    'tsunami/go.mod': goMod('beaconwidgets'),
    'tsunami/main.go': GO_MAIN,
    'tsunami/frontend/package.json': json({ name: 'beaconwidgets-ui', private: true, scripts: { build: 'vite build', dev: 'vite' } }),
    'Taskfile.yml': taskfile,
    '.github/workflows/build.yml': wf([
      'name: build',
      'on: [push, pull_request]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - uses: actions/setup-node@v4',
      '      - run: npm ci',
      '      - run: task generate',
      '      - run: task build:backend',
      '      - run: task check:ts',
      '      - name: go tests',
      '        run: go test ./...',
      '      - name: frontend tests',
      '        run: npx vitest --run',
    ]),
    '.github/workflows/egress-guard.yml': wf([
      'name: egress-guard',
      'on: [pull_request]',
      'jobs:',
      '  guard:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go test ./pkg/egressguard/...',
    ]),
    '.github/workflows/codeql.yml': wf([
      'name: codeql',
      'on: [push]',
      'jobs:',
      '  analyze:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: github/codeql-action/init@v3',
      '      - uses: github/codeql-action/analyze@v3',
    ]),
    '.github/workflows/copilot-setup-steps.yml': wf([
      'name: copilot setup',
      'on: [workflow_dispatch]',
      'jobs:',
      '  copilot-setup-steps:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: npm ci',
      '      - run: go mod download',
    ]),
    '.github/workflows/docsite.yml': wf([
      'name: docsite',
      'on: [push]',
      'jobs:',
      '  site:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: docs',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: npm ci',
      '      - run: npm run build',
    ]),
    '.planning/codebase/TESTING.md': [
      '# Testing',
      '',
      'Go packages:',
      '',
      '```bash',
      'go test ./...',
      '```',
      '',
      'Frontend unit tests:',
      '',
      '```bash',
      'npx vitest --run',
      '```',
      '',
    ].join('\n'),
  });
}

// ─── 2. aocore ────────────────────────────────────────────────────────────────

/**
 * goldenCoreShape() — a multi-stack gateway repo with no root manifest: a Go service in `go/` (CI runs
 * its spec generator before build/test), a second Go tool in `dev/devedge/`, Flutter apps in `admin/`
 * and `portal/` (portal/build.sh validates the API spec and refreshes the portal client), a node e2e
 * package under `admin/e2e/`, and a Helm chart. No task runner: every command is a CI step. Sources:
 * six workflows and admin/e2e/package.json.
 */
function goldenCoreShape() {
  return makeWhole({
    'README.md': '# orbit gateway\n',
    'go/go.mod': goMod('orbitgw'),
    'go/main.go': GO_MAIN,
    'go/internal/spec/spec.go': 'package spec\n\n//go:generate go run ./gen\n',
    'go/.golangci.yml': 'run:\n  timeout: 5m\n',
    'dev/devedge/go.mod': goMod('orbitedge'),
    'dev/devedge/main.go': GO_MAIN,
    'admin/pubspec.yaml': flutterPubspec('orbit_admin'),
    'admin/lib/main.dart': DART_MAIN,
    'admin/e2e/package.json': json({ name: 'orbit-admin-e2e', private: true, scripts: { test: 'playwright test' } }),
    'portal/pubspec.yaml': flutterPubspec('orbit_portal'),
    'portal/lib/main.dart': DART_MAIN,
    'portal/build.sh': sh('npx --yes @redocly/cli lint go/api/openapi.yaml', 'dart run build_runner build --delete-conflicting-outputs'),
    'helm/aocore-gateway/Chart.yaml': 'apiVersion: v2\nname: orbit-gateway\nversion: 0.1.0\n',
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: generate the spec bindings',
      '        run: go generate ./internal/spec/...',
      '      - run: go build ./...',
      '      - run: go test -short -race ./... -timeout 5m',
      '      - run: golangci-lint run ./...',
      '      - run: govulncheck ./...',
    ]),
    '.github/workflows/go-heavy.yml': wf([
      'name: go-heavy',
      'on: [workflow_dispatch]',
      'jobs:',
      '  soak:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: go',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: go generate ./internal/spec/...',
      "      - run: go test -race -run 'Soak|Load' ./...",
      '  devedge:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: dev/devedge',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: go build ./...',
      '      - run: go test -race ./...',
    ]),
    '.github/workflows/flutter.yml': wf([
      'name: flutter',
      'on: [push, pull_request]',
      'jobs:',
      '  admin:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: admin',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
      '  portal:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: portal',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/flutter-heavy.yml': wf([
      'name: flutter-heavy',
      'on: [workflow_dispatch]',
      'jobs:',
      '  admin-integration:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: integration',
      '        working-directory: admin',
      '        run: flutter test integration_test',
    ]),
    '.github/workflows/helm-validate.yml': wf([
      'name: helm-validate',
      'on: [pull_request]',
      'jobs:',
      '  chart:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: helm lint helm/aocore-gateway/',
    ]),
    '.github/workflows/portal.yml': wf([
      'name: portal',
      'on: [push]',
      'jobs:',
      '  portal:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: bash portal/build.sh',
      '      - name: web bundle',
      '        working-directory: portal',
      '        run: flutter build web --release',
    ]),
  }, { modes: { 'portal/build.sh': 0o755 } });
}

// ─── 3. aodex ─────────────────────────────────────────────────────────────────

/**
 * goldenDexShape() — a Go server in `go/` driven by `go/Makefile` (build, test, an OpenAPI drift check
 * `openapi-verify` that regenerates through `openapi-regen` then fails on a diff, and boundary checks)
 * and a Flutter client in `flutter/` (maestro flows, a node e2e package, several platform builds). No
 * root manifest. Sources: go/Makefile, five workflows, flutter/e2e/package.json, flutter/.maestro/.
 */
function goldenDexShape() {
  return makeWhole({
    'README.md': '# dex\n',
    'go/go.mod': goMod('dexsvc'),
    'go/main.go': GO_MAIN,
    'go/cmd/server/main.go': GO_MAIN,
    'go/internal/api/doc.go': 'package api\n\n//go:generate go run ./gen -spec openapi.yaml\n',
    'go/Makefile': mk([
      'GO ?= go',
      '',
      '.PHONY: build test run openapi-regen openapi-verify check-ledger-readonly check-no-debug-routes',
      '',
      'build:',
      '\t$(GO) build -o bin/dexd ./cmd/server',
      '',
      'test:',
      '\t$(GO) test -race -count=1 ./...',
      '',
      'run: build',
      '\t./bin/dexd',
      '',
      'openapi-regen:',
      '\t$(GO) generate ./internal/api/...',
      '',
      'openapi-verify: openapi-regen',
      '\tgit diff --exit-code -- internal/api/',
      '',
      'check-ledger-readonly:',
      '\t$(GO) run ./tools/boundary -rule ledger-readonly',
      '',
      'check-no-debug-routes:',
      '\t$(GO) run ./tools/boundary -rule no-debug-routes',
    ]),
    'flutter/pubspec.yaml': flutterPubspec('dex_client'),
    'flutter/lib/main.dart': DART_MAIN,
    'flutter/e2e/package.json': json({ name: 'dex-client-e2e', private: true, scripts: { test: 'playwright test' } }),
    'flutter/.maestro/login.yaml': 'appId: invalid.example.dex\n---\n- launchApp\n',
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: make build',
      '      - run: make test',
      '      - run: make openapi-verify',
      '      - run: make check-ledger-readonly check-no-debug-routes',
    ]),
    '.github/workflows/flutter.yml': wf([
      'name: flutter',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: flutter',
      'jobs:',
      '  flutter:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/build-ios.yml': wf([
      'name: build-ios',
      'on: [workflow_dispatch]',
      'jobs:',
      '  ios:',
      '    runs-on: macos-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: ipa',
      '        working-directory: flutter',
      '        run: flutter build ipa --no-codesign',
    ]),
    '.github/workflows/build-macos.yml': wf([
      'name: build-macos',
      'on: [workflow_dispatch]',
      'jobs:',
      '  macos:',
      '    runs-on: macos-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: app',
      '        working-directory: flutter',
      '        run: flutter build macos --release',
    ]),
    '.github/workflows/release-flutter.yml': wf([
      'name: release-flutter',
      'on:',
      '  push:',
      "    tags: ['v*']",
      'jobs:',
      '  android:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: apk',
      '        working-directory: flutter',
      '        run: flutter build apk --release',
    ]),
  });
}

// ─── 4. aoedge ────────────────────────────────────────────────────────────────

/**
 * goldenEdgeShape() — a Go edge proxy (`edgeproxy`) with a root Makefile: a FIPS build (the shipping
 * configuration) and a non-FIPS dev variant, test, lint, fmt, tidy, and acceptance scenario suites run
 * against a live edge. Sources: Makefile, ci.yml, release.yml.
 */
function goldenEdgeShape() {
  return makeWhole({
    'go.mod': goMod('edgeproxy'),
    'main.go': GO_MAIN,
    'cmd/edge/main.go': GO_MAIN,
    Makefile: mk([
      'GO ?= go',
      'BIN := bin/edged',
      '',
      '.PHONY: build-fips build-dev test lint fmt tidy acceptance acceptance-tls',
      '',
      'build-fips:',
      '\tGOEXPERIMENT=boringcrypto $(GO) build -tags fips -o $(BIN) ./cmd/edge',
      '',
      'build-dev:',
      '\t$(GO) build -o $(BIN)-dev ./cmd/edge',
      '',
      'test:',
      '\t$(GO) test -race -count=1 ./...',
      '',
      'lint:',
      '\tgolangci-lint run --timeout 5m ./...',
      '',
      'fmt:',
      '\tgofmt -w .',
      '',
      'tidy:',
      '\t$(GO) mod tidy',
      '',
      'acceptance:',
      '\t$(GO) test -tags acceptance -count=1 ./acceptance/...',
      '',
      'acceptance-tls:',
      '\t$(GO) test -tags acceptance -count=1 -run TLS ./acceptance/...',
    ]),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [push, pull_request]',
      'jobs:',
      '  ci:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: format',
      '        run: test -z "$(gofmt -l .)"',
      '      - run: go mod tidy -diff',
      '      - run: make lint',
      '      - run: make test',
      '      - run: make build-fips',
    ]),
    '.github/workflows/release.yml': wf([
      'name: release',
      'on:',
      '  push:',
      "    tags: ['v*']",
      'jobs:',
      '  release:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make build-fips',
    ]),
  });
}

// ─── 5. devcluster ────────────────────────────────────────────────────────────

/**
 * goldenClusterShape() — a shell CLI for a local cluster, with no root manifest and one Go tool in
 * `tools/devproxy/`. `bin/build.sh <app>` builds an APP's image (not this repo); `bin/test.sh` asserts a
 * LIVE cluster; the offline gate is the T0 self-test, which CI runs beside shellcheck. Sources:
 * bin/build.sh, bin/test.sh (and the offline-gate workflow those two scripts are not part of).
 */
function goldenClusterShape() {
  return makeWhole({
    'README.md': '# local cluster tooling\n',
    'bin/build.sh': sh('app="$1"', 'docker build -t "localhost:5001/$app:dev" "apps/$app"'),
    'bin/test.sh': sh(
      'kubectl get nodes',
      'kubectl -n platform rollout status deploy/ingress --timeout=120s',
      'curl -fsS https://ingress.cluster.invalid/healthz',
    ),
    'bin/up.sh': sh('kind create cluster --name dev', 'kubectl apply -k gitops/base'),
    'lib/common.sh': 'log() { printf "%s\\n" "$*"; }\n',
    't0-conformance/selftest.sh': sh('sh t0-conformance/layout.sh', 'sh t0-conformance/manifests.sh'),
    't0-conformance/layout.sh': sh('test -d gitops/base'),
    't0-conformance/manifests.sh': sh('grep -q "kind: Kustomization" gitops/base/kustomization.yaml'),
    'gitops/base/kustomization.yaml': 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: []\n',
    'tools/devproxy/go.mod': goMod('clusterproxy'),
    'tools/devproxy/main.go': GO_MAIN,
    '.github/workflows/offline.yml': wf([
      'name: offline',
      'on: [push, pull_request]',
      'jobs:',
      '  scripts:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh',
      '      - run: bash t0-conformance/selftest.sh',
      '  proxy:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: tools/devproxy',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go test ./...',
    ]),
  }, {
    modes: {
      'bin/build.sh': 0o755,
      'bin/test.sh': 0o755,
      'bin/up.sh': 0o755,
      't0-conformance/selftest.sh': 0o755,
    },
  });
}

// ─── 6. devflowops ────────────────────────────────────────────────────────────

/**
 * goldenFlowopsShape() — a Go forge (`forgeops`) with a node frontend at the root and a Flutter app in
 * `flutter/`. The root Makefile aggregates by prerequisite (`build: frontend backend`), calls Go through
 * variables (`$(GO)`, `$(GOLANGCI_LINT)`), and pairs check and apply targets (`lint`/`lint-fix`,
 * `fmt-check`/`fmt`, `tidy-check`/`tidy`, where the check target runs its apply sibling as a
 * prerequisite and then fails on a git diff). Sources: Makefile, a contrib mixin Makefile,
 * flutter/Makefile, four workflows.
 */
function goldenFlowopsShape() {
  return makeWhole({
    'go.mod': goMod('forgeops'),
    'main.go': GO_MAIN,
    'cmd/forgeops/main.go': GO_MAIN,
    'package.json': json({ name: 'forgeops-web', private: true, scripts: { build: 'webpack --mode production', lint: 'eslint web_src' } }),
    'web_src/index.js': 'export const ready = true;\n',
    Makefile: mk([
      'GO ?= go',
      'GOLANGCI_LINT ?= golangci-lint',
      'GOVULNCHECK ?= govulncheck',
      'TAGS ?= bindata',
      'EXECUTABLE ?= forgeops',
      '',
      '.PHONY: all deps deps-frontend deps-backend build frontend backend test test-frontend test-backend test-db',
      '.PHONY: lint lint-frontend lint-backend lint-fix lint-frontend-fix lint-backend-fix fmt fmt-check tidy tidy-check',
      '.PHONY: generate generate-backend security-check playwright',
      '',
      'all: build',
      '',
      'deps: deps-frontend deps-backend',
      '',
      'deps-frontend:',
      '\tnpm ci',
      '',
      'deps-backend:',
      '\t$(GO) mod download',
      '',
      'build: frontend backend',
      '',
      'frontend:',
      '\tnpm run build',
      '',
      'backend: generate-backend',
      "\t$(GO) build -tags '$(TAGS)' -o $(EXECUTABLE) ./cmd/forgeops",
      '',
      'test: test-frontend test-backend',
      '',
      'test-frontend:',
      '\tnpx vitest run',
      '',
      'test-backend:',
      "\t$(GO) test -race -tags '$(TAGS)' ./...",
      '',
      'test-db:',
      '\t$(GO) test -tags pgsql ./tests/integration/...',
      '',
      'lint: lint-frontend lint-backend',
      '',
      'lint-frontend:',
      '\tnpx eslint web_src',
      '',
      'lint-backend:',
      '\t$(GOLANGCI_LINT) run',
      '',
      'lint-fix: lint-frontend-fix lint-backend-fix',
      '',
      'lint-frontend-fix:',
      '\tnpx eslint --fix web_src',
      '',
      'lint-backend-fix:',
      '\t$(GOLANGCI_LINT) run --fix',
      '',
      'fmt:',
      '\tgofmt -s -w cmd',
      '\tnpx prettier --write web_src',
      '',
      'fmt-check: fmt',
      '\tgit diff --exit-code',
      '',
      'tidy:',
      '\t$(GO) mod tidy',
      '',
      'tidy-check: tidy',
      '\tgit diff --exit-code go.mod go.sum',
      '',
      'generate: generate-backend',
      '',
      'generate-backend:',
      "\t$(GO) generate -tags '$(TAGS)' ./...",
      '',
      'security-check:',
      '\t$(GOVULNCHECK) -show verbose ./...',
      '',
      'playwright:',
      '\tnpx playwright test',
    ]),
    'contrib/metrics-mixin/Makefile': mk([
      'lint:',
      '\tjsonnet-lint mixin.libsonnet',
      '',
      'fmt:',
      '\tjsonnetfmt -i mixin.libsonnet',
    ]),
    'flutter/pubspec.yaml': flutterPubspec('forgeops_app'),
    'flutter/lib/main.dart': DART_MAIN,
    'flutter/Makefile': mk([
      'analyze:',
      '\tflutter analyze',
      '',
      'test:',
      '\tflutter test',
      '',
      'build-web:',
      '\tflutter build web --release',
    ]),
    '.github/workflows/flutter-ci.yml': wf([
      'name: flutter-ci',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: flutter',
      'jobs:',
      '  flutter:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: make analyze',
      '      - run: make test',
    ]),
    '.github/workflows/pull-compliance.yml': wf([
      'name: compliance',
      'on: [pull_request]',
      'jobs:',
      '  backend:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make deps-backend',
      '      - run: make lint-backend',
      '      - run: make tidy-check',
      '      - run: make security-check',
      '  frontend:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make deps-frontend',
      '      - run: make lint-frontend',
    ]),
    '.github/workflows/pull-db-tests.yml': wf([
      'name: db-tests',
      'on: [pull_request]',
      'jobs:',
      '  pgsql:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make test-db',
    ]),
    '.github/workflows/pull-e2e-tests.yml': wf([
      'name: e2e',
      'on: [pull_request]',
      'jobs:',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make deps',
      '      - run: make build',
      '      - run: make playwright',
    ]),
  });
}

// ─── 7. eden-biz ──────────────────────────────────────────────────────────────

/**
 * goldenBizShape() — a multi-stack business suite with no root manifest: a Go API in `go/` (go/Makefile:
 * build, test, generate, migrate), Flutter apps in `flutter/`, `mobile/` and `pos/` (flutter/Makefile;
 * a web e2e package and maestro flows under flutter/), a pure Dart package `api-dart/`. The root
 * Makefile only brings the e2e environment up and down. CI runs a single-purpose migrations check.
 * Sources: three Makefiles, many workflows, flutter/web_e2e/package.json, flutter/.maestro/.
 */
function goldenBizShape() {
  return makeWhole({
    'README.md': '# ledger suite\n',
    Makefile: mk([
      '.PHONY: e2e-stack-up e2e-stack-down',
      '',
      'e2e-stack-up:',
      '\tdocker compose -f deploy/e2e/compose.yml up -d --wait',
      '',
      'e2e-stack-down:',
      '\tdocker compose -f deploy/e2e/compose.yml down -v',
    ]),
    'deploy/e2e/compose.yml': 'services:\n  api:\n    build: ../../go\n    ports:\n      - "8091:8091"\n',
    'go/go.mod': goMod('ledgerapi'),
    'go/main.go': GO_MAIN,
    'go/cmd/api/main.go': GO_MAIN,
    'go/cmd/migrate/main.go': GO_MAIN,
    'go/scripts/check-migrations_test.sh': sh('go run ./cmd/migrate verify --dir ./migrations'),
    'go/Makefile': mk([
      'GO ?= go',
      '',
      '.PHONY: build test generate migrate',
      '',
      'build:',
      '\t$(GO) build -o bin/ledger-api ./cmd/api',
      '',
      'test:',
      '\t$(GO) test -race -count=1 ./...',
      '',
      'generate:',
      '\tbuf generate',
      '\ttempl generate',
      '',
      'migrate:',
      '\t$(GO) run ./cmd/migrate up',
    ]),
    'api-dart/pubspec.yaml': dartPubspec('ledger_api_client'),
    'api-dart/lib/ledger_api_client.dart': 'library ledger_api_client;\n',
    'flutter/pubspec.yaml': flutterPubspec('ledger_web'),
    'flutter/lib/main.dart': DART_MAIN,
    'flutter/Makefile': mk([
      'analyze:',
      '\tflutter analyze',
      '',
      'test:',
      '\tflutter test',
      '',
      'build-web:',
      '\tflutter build web --release',
    ]),
    'flutter/web_e2e/package.json': json({ name: 'ledger-web-e2e', private: true, scripts: { test: 'playwright test' } }),
    'flutter/.maestro/checkout.yaml': 'appId: invalid.example.ledger\n---\n- launchApp\n',
    'mobile/pubspec.yaml': flutterPubspec('ledger_mobile'),
    'mobile/lib/main.dart': DART_MAIN,
    'pos/pubspec.yaml': flutterPubspec('ledger_pos'),
    'pos/lib/main.dart': DART_MAIN,
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: make test',
      '      - run: make build',
      '      - name: migrations',
      '        run: ./scripts/check-migrations_test.sh',
    ]),
    '.github/workflows/proto-gen-drift.yml': wf([
      'name: proto-gen-drift',
      'on: [pull_request]',
      'jobs:',
      '  drift:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: go',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make generate',
      '      - run: git diff --exit-code',
    ]),
    '.github/workflows/flutter.yml': wf([
      'name: flutter',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: flutter',
      'jobs:',
      '  web:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: make analyze',
      '      - run: make test',
    ]),
    '.github/workflows/build-app.yml': wf([
      'name: build-app',
      'on: [workflow_dispatch]',
      'jobs:',
      '  web:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: bundle',
      '        working-directory: flutter',
      '        run: make build-web',
    ]),
    '.github/workflows/mobile.yml': wf([
      'name: mobile',
      'on: [push]',
      'defaults:',
      '  run:',
      '    working-directory: mobile',
      'jobs:',
      '  mobile:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/pos.yml': wf([
      'name: pos',
      'on: [push]',
      'defaults:',
      '  run:',
      '    working-directory: pos',
      'jobs:',
      '  pos:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/web-e2e.yml': wf([
      'name: web-e2e',
      'on: [pull_request]',
      'jobs:',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: make e2e-stack-up',
      '      - name: playwright',
      '        working-directory: flutter/web_e2e',
      '        run: npx playwright test',
    ]),
  }, { modes: { 'go/scripts/check-migrations_test.sh': 0o755 } });
}

// ─── 8. EdenDocs ──────────────────────────────────────────────────────────────

/**
 * goldenDocsShape() — a C++/JS office server built with autotools (no supported root manifest) and a
 * Go WOPI sidecar in `wopi-host/`. The product build is `scripts/eden/build.sh`, after a script that
 * installs system packages and one that fetches engine assets; CI also runs a smoke test, a branding
 * check and the sidecar's scenario e2e. Sources: engine/compilerplugins/Makefile, four workflows,
 * browser/package.json, qt/test/package.json.
 */
function goldenDocsShape() {
  return makeWhole({
    'configure.ac': 'AC_INIT([invented-office], [0.1])\nAC_OUTPUT\n',
    'Makefile.am': 'SUBDIRS = browser\n',
    'browser/package.json': json({ name: 'office-browser', private: true, scripts: { build: 'rollup -c', test: 'mocha test' } }),
    'qt/test/package.json': json({ name: 'office-qt-test', private: true, scripts: { test: 'node run.js' } }),
    'engine/compilerplugins/Makefile': mk([
      'build: plugins',
      '',
      'plugins:',
      '\t$(CXX) -shared -o checks.so checks.cxx',
    ]),
    'scripts/eden/build-deps.sh': sh('sudo apt-get update', 'sudo apt-get install -y libpoco-dev libcap-dev'),
    'scripts/eden/fetch-engine-assets.sh': sh('curl -fsSL -o engine.tar.gz "$ENGINE_URL"', 'tar -xzf engine.tar.gz -C engine'),
    'scripts/eden/build.sh': sh('./autogen.sh', './configure --enable-silent-rules', 'make -j4'),
    'scripts/eden/smoke-test.sh': sh('./coolwsd --version', 'curl -fsS http://127.0.0.1:9980/hosting/discovery'),
    'scripts/eden/verify-branding.sh': sh('grep -q "Invented Office" browser/dist/branding.css'),
    'wopi-host/go.mod': goMod('wopisidecar'),
    'wopi-host/main.go': GO_MAIN,
    'wopi-host/scripts/wopi-e2e.sh': sh(
      'go build -o /tmp/wopi-host ./wopi-host',
      '/tmp/wopi-host --listen 127.0.0.1:8091 &',
      'curl -fsS http://127.0.0.1:8091/wopi/files/demo',
    ),
    '.github/workflows/build.yml': wf([
      'name: build',
      'on: [push, pull_request]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: ./scripts/eden/build-deps.sh',
      '      - run: ./scripts/eden/fetch-engine-assets.sh',
      '      - run: ./scripts/eden/build.sh',
      '      - run: ./scripts/eden/smoke-test.sh',
      '      - run: ./scripts/eden/verify-branding.sh',
    ]),
    '.github/workflows/wopi-host.yml': wf([
      'name: wopi-host',
      'on: [push, pull_request]',
      'jobs:',
      '  unit:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: wopi-host',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go test ./...',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    env:',
      '      COOLWSD_MODE: native',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: ./wopi-host/scripts/wopi-e2e.sh',
    ]),
    '.github/workflows/codeql-analysis.yml': wf([
      'name: codeql',
      'on: [push]',
      'jobs:',
      '  analyze:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: github/codeql-action/init@v3',
      '      - uses: github/codeql-action/analyze@v3',
    ]),
    '.github/workflows/docker-publish.yml': wf([
      'name: docker-publish',
      'on:',
      '  push:',
      "    tags: ['v*']",
      'jobs:',
      '  image:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: docker build -t invented/office:latest .',
    ]),
  }, {
    modes: {
      'scripts/eden/build-deps.sh': 0o755,
      'scripts/eden/fetch-engine-assets.sh': 0o755,
      'scripts/eden/build.sh': 0o755,
      'scripts/eden/smoke-test.sh': 0o755,
      'scripts/eden/verify-branding.sh': 0o755,
      'wopi-host/scripts/wopi-e2e.sh': 0o755,
    },
  });
}

// ─── 9. navigators ────────────────────────────────────────────────────────────

/**
 * goldenNavigatorsShape() — a Go API in `navigators-go/` and a Flutter app in `navigators-flutter/`,
 * driven by a root justfile whose recipes `cd` into the component (Go tests, proto + sqlc codegen, a
 * Flutter test, a local-infra bring-up), plus root maestro flows. No root manifest, no CI. Sources:
 * justfile, .maestro/.
 */
function goldenNavigatorsShape() {
  return makeWhole({
    'README.md': '# field canvassing\n',
    justfile: [
      'default:',
      '    @just --list',
      '',
      'infra:',
      '    docker compose -f deploy/local/compose.yml up -d',
      '',
      'test-go:',
      '    cd navigators-go && go test ./...',
      '',
      'test-flutter:',
      '    cd navigators-flutter && flutter test',
      '',
      'generate:',
      '    cd navigators-go && buf generate',
      '    cd navigators-go && sqlc generate',
      '',
      'sqlc:',
      '    cd navigators-go && sqlc generate',
      '',
      'run-api:',
      '    cd navigators-go && go run ./cmd/api',
      '',
    ].join('\n'),
    'deploy/local/compose.yml': 'services:\n  db:\n    image: postgres:16\n',
    '.maestro/canvass.yaml': 'appId: invalid.example.canvass\n---\n- launchApp\n',
    'navigators-go/go.mod': goMod('canvassapi'),
    'navigators-go/main.go': GO_MAIN,
    'navigators-go/cmd/api/main.go': GO_MAIN,
    'navigators-flutter/pubspec.yaml': flutterPubspec('canvass_app'),
    'navigators-flutter/lib/main.dart': DART_MAIN,
  });
}

// ─── 10. politihub ────────────────────────────────────────────────────────────

/**
 * goldenCivicShape() — a Go API in `go/` (go/Makefile: build, test, a migration helper; a node email
 * worker under it) and two Flutter apps, `flutter/` and `flutter-navigators/`. The second app carries
 * most of the CI (its own test workflow, a pages deploy and a release pipeline), none of it through a
 * task runner; the Go API's CI calls its Makefile. A tile-build script runs in `infra/tiles` (in no
 * language area). No root manifest. Sources: go/Makefile, eight workflows,
 * go/cloudflare-email-worker/package.json.
 */
function goldenCivicShape() {
  return makeWhole({
    'README.md': '# civic platform\n',
    'go/go.mod': goMod('civicapi'),
    'go/main.go': GO_MAIN,
    'go/cmd/api/main.go': GO_MAIN,
    'go/Makefile': mk([
      'GO ?= go',
      '',
      '.PHONY: build test migrate',
      '',
      'build:',
      '\t$(GO) build -o bin/civic-api ./cmd/api',
      '',
      'test:',
      '\t$(GO) test -race -count=1 ./...',
      '',
      'migrate:',
      '\t$(GO) run ./cmd/api migrate',
    ]),
    'go/cloudflare-email-worker/package.json': json({ name: 'civic-mail-worker', private: true, scripts: { deploy: 'wrangler deploy', test: 'vitest run' } }),
    'flutter/pubspec.yaml': flutterPubspec('civic_app'),
    'flutter/lib/main.dart': DART_MAIN,
    'flutter-navigators/pubspec.yaml': flutterPubspec('civic_field'),
    'flutter-navigators/lib/main.dart': DART_MAIN,
    'infra/tiles/build.sh': sh('./gen-tiles --zoom 12'),
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  go:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: make test',
      '      - run: make build',
    ]),
    '.github/workflows/deploy.yml': wf([
      'name: deploy',
      'on:',
      '  push:',
      '    branches: [main]',
      'jobs:',
      '  image:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: image',
      '        working-directory: go',
      '        run: docker build -t civic-api .',
    ]),
    '.github/workflows/flutter.yml': wf([
      'name: flutter',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: flutter',
      'jobs:',
      '  app:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/pages.yml': wf([
      'name: pages',
      'on:',
      '  push:',
      '    branches: [main]',
      'jobs:',
      '  pages:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - name: web',
      '        working-directory: flutter',
      '        run: flutter build web --base-href /app/',
    ]),
    '.github/workflows/navigators.yml': wf([
      'name: field-app',
      'on: [push, pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: flutter-navigators',
      'jobs:',
      '  field:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
      '      - run: flutter build web --release',
    ]),
    '.github/workflows/navigators-pages.yml': wf([
      'name: field-pages',
      'on:',
      '  push:',
      '    branches: [main]',
      'defaults:',
      '  run:',
      '    working-directory: flutter-navigators',
      'jobs:',
      '  pages:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter build web --base-href /field/',
    ]),
    '.github/workflows/navigators-release.yml': wf([
      'name: field-release',
      'on:',
      '  push:',
      "    tags: ['field-v*']",
      'defaults:',
      '  run:',
      '    working-directory: flutter-navigators',
      'jobs:',
      '  release:',
      '    runs-on: macos-latest',
      '    steps:',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter build apk --release',
      '      - run: flutter build ipa --no-codesign',
    ]),
    '.github/workflows/tiles-regen.yml': wf([
      'name: tiles-regen',
      'on: [workflow_dispatch]',
      'jobs:',
      '  tiles:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: tiles',
      '        working-directory: infra/tiles',
      '        run: ./build.sh',
    ]),
  }, { modes: { 'infra/tiles/build.sh': 0o755 } });
}

// ─── 11. quanta-local ─────────────────────────────────────────────────────────

/**
 * goldenQuantaShape() — a docker-compose local environment for a set of node services (`api/`,
 * `marketing/`, `mocks/`, `portal/`), with no supported language area at all. The root Makefile brings
 * the environment up, builds the images, runs a host preflight and a verify pass that needs the
 * environment up. Sources: Makefile and four package.json.
 */
function goldenQuantaShape() {
  return makeWhole({
    'README.md': '# quanta local\n',
    'compose.yml': 'services:\n  api:\n    build: ./api\n  portal:\n    build: ./portal\n',
    Makefile: mk([
      '.PHONY: up down build preflight verify logs',
      '',
      'up:',
      '\tdocker compose up -d --wait',
      '',
      'down:',
      '\tdocker compose down',
      '',
      'build:',
      '\tdocker compose build',
      '',
      'preflight:',
      '\t./scripts/preflight.sh',
      '',
      'verify:',
      '\t./scripts/host-checks.sh',
      '\tdocker compose run --rm verifier',
      '',
      'logs:',
      '\tdocker compose logs -f',
    ]),
    'scripts/preflight.sh': sh('command -v docker', 'docker info'),
    'scripts/host-checks.sh': sh('test -f compose.yml'),
    'api/package.json': json({ name: 'q-api', private: true, scripts: { start: 'node server.js', test: 'node --test' } }),
    'marketing/package.json': json({ name: 'q-marketing', private: true, scripts: { build: 'astro build' } }),
    'mocks/package.json': json({ name: 'q-mocks', private: true, scripts: { start: 'node mocks.js' } }),
    'portal/package.json': json({ name: 'q-portal', private: true, scripts: { build: 'vite build', test: 'vitest run' } }),
  }, { modes: { 'scripts/preflight.sh': 0o755, 'scripts/host-checks.sh': 0o755 } });
}

// ─── expected outputs ─────────────────────────────────────────────────────────

/**
 * GOLDEN: shape (the override file's basename) -> { extends, components, commands }, the run/apply/cwd
 * subset of `42-codebase-aware-stack-drafter/overrides/<shape>.STACK.md`. stack-drafter-golden.test.cjs
 * also checks this table against the frozen override files when they are present.
 */
const GOLDEN = Object.freeze({
  'ao-terminal': {
    extends: 'go',
    components: [{ path: 'tsunami/', profile: 'go' }],
    commands: {
      deps: { run: 'npm ci' },
      build: { run: 'task build:backend' },
      test: { run: 'go test ./...' },
      test_frontend: { run: 'npx vitest --run' },
      typecheck: { run: 'task check:ts' },
      codegen: { run: 'task generate' },
      tidy: { run: 'go mod tidy -diff', apply: 'go mod tidy' },
      bootstrap: { run: 'task init' },
    },
  },
  aocore: {
    extends: 'general',
    components: [
      { path: 'admin/', profile: 'flutter' },
      { path: 'dev/devedge/', profile: 'go' },
      { path: 'go/', profile: 'go' },
      { path: 'portal/', profile: 'flutter' },
    ],
    commands: {
      codegen: { run: 'go generate ./internal/spec/...', cwd: 'go' },
      build: { run: 'go build ./...', cwd: 'go' },
      test: { run: 'go test -short -race ./... -timeout 5m', cwd: 'go' },
      lint: { run: 'golangci-lint run ./...', cwd: 'go' },
      audit: { run: 'govulncheck ./...', cwd: 'go' },
      helm_lint: { run: 'helm lint helm/aocore-gateway/' },
      portal_codegen: { run: 'bash portal/build.sh' },
    },
  },
  aodex: {
    extends: 'general',
    components: [{ path: 'flutter/', profile: 'flutter' }, { path: 'go/', profile: 'go' }],
    commands: {
      build: { run: 'make build', cwd: 'go' },
      test: { run: 'make test', cwd: 'go' },
      codegen: { run: 'make openapi-verify', apply: 'make openapi-regen', cwd: 'go' },
      guards: { run: 'make check-no-billing-writes check-no-chromedp check-dev-bypass-boundary', cwd: 'go' },
    },
  },
  aoedge: {
    extends: 'go',
    components: [],
    commands: {
      test: { run: 'make test' },
      build: { run: 'make build-fips' },
      lint: { run: 'make lint' },
      format: { run: 'test -z "$(gofmt -l .)"', apply: 'make fmt' },
      tidy: { run: 'go mod tidy -diff', apply: 'make tidy' },
      acceptance: { run: 'make acceptance' },
    },
  },
  devcluster: {
    extends: 'general',
    components: [{ path: 'tools/devproxy/', profile: 'go' }],
    commands: {
      build: { run: 'none' },
      test: { run: 'bash t0-conformance/selftest.sh' },
      lint: { run: 'shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh' },
      cluster_test: { run: './bin/test.sh' },
    },
  },
  devflowops: {
    extends: 'go',
    components: [{ path: 'flutter/', profile: 'flutter' }],
    commands: {
      deps: { run: 'make deps' },
      build: { run: 'make build' },
      test: { run: 'make test' },
      lint: { run: 'make lint', apply: 'make lint-fix' },
      format: { run: 'make fmt-check', apply: 'make fmt' },
      tidy: { run: 'make tidy-check', apply: 'make tidy' },
      codegen: { run: 'make generate' },
      audit: { run: 'make security-check' },
      e2e: { run: 'make playwright' },
    },
  },
  'eden-biz': {
    extends: 'general',
    components: [
      { path: 'api-dart/', profile: 'dart' },
      { path: 'flutter/', profile: 'flutter' },
      { path: 'go/', profile: 'go' },
      { path: 'mobile/', profile: 'flutter' },
      { path: 'pos/', profile: 'flutter' },
    ],
    commands: {
      build: { run: 'make build', cwd: 'go' },
      test: { run: 'make test', cwd: 'go' },
      codegen: { run: 'make generate', cwd: 'go' },
      e2e_env: { run: 'make e2e-stack-up' },
    },
  },
  EdenDocs: {
    extends: 'general',
    components: [{ path: 'wopi-host/', profile: 'go' }],
    commands: {
      build: { run: './scripts/eden/build.sh' },
      test: { run: 'discover' },
      smoke: { run: './scripts/eden/smoke-test.sh' },
      branding: { run: './scripts/eden/verify-branding.sh' },
      e2e: { run: './wopi-host/scripts/wopi-e2e.sh' },
    },
  },
  navigators: {
    extends: 'general',
    components: [{ path: 'navigators-flutter/', profile: 'flutter' }, { path: 'navigators-go/', profile: 'go' }],
    commands: {
      test: { run: 'just test-go' },
      codegen: { run: 'just generate' },
      sqlc: { run: 'just sqlc' },
      e2e: { run: 'maestro test .maestro' },
    },
  },
  politihub: {
    extends: 'general',
    components: [
      { path: 'flutter-navigators/', profile: 'flutter' },
      { path: 'flutter/', profile: 'flutter' },
      { path: 'go/', profile: 'go' },
    ],
    commands: {
      build: { run: 'make build', cwd: 'go' },
      test: { run: 'make test', cwd: 'go' },
    },
  },
  'quanta-local': {
    extends: 'general',
    components: [],
    commands: {
      build: { run: 'make build' },
      test: { run: 'discover' },
      preflight: { run: 'make preflight' },
      verify: { run: 'make verify' },
    },
  },
});

/** shape -> { build, tools }: the builder and the stub tools its verifier needs on PATH. */
const GOLDEN_SHAPES = Object.freeze({
  'ao-terminal': { build: goldenTerminalShape, tools: toolsFor('node') },
  aocore: { build: goldenCoreShape, tools: toolsFor('node', 'shell') },
  aodex: { build: goldenDexShape, tools: toolsFor('node') },
  aoedge: { build: goldenEdgeShape, tools: toolsFor() },
  devcluster: { build: goldenClusterShape, tools: toolsFor('shell', 'docker') },
  devflowops: { build: goldenFlowopsShape, tools: toolsFor('node') },
  'eden-biz': { build: goldenBizShape, tools: toolsFor('node', 'docker') },
  EdenDocs: { build: goldenDocsShape, tools: toolsFor('shell', 'docker') },
  navigators: { build: goldenNavigatorsShape, tools: toolsFor('docker') },
  politihub: { build: goldenCivicShape, tools: toolsFor('node', 'docker') },
  'quanta-local': { build: goldenQuantaShape, tools: toolsFor('docker') },
});

/**
 * HAND_ONLY: shape -> keys whose value a human chose and no general rule derives. The comparison skips
 * them (the draft may carry the key or not, with any value). Governance (TRD 43-06): the starting set is
 * exactly the two keys the user confirmed on 2026-10-02; an addition must be a non-canonical,
 * repo-specific key name or a human judgment value that no general rule derives, carries its reason
 * here, and is listed in the SUMMARY for user acceptance at the 43-07 checkpoint.
 *
 *   devcluster.build          user-confirmed: `bin/build.sh <app>` builds other apps' images, so a human
 *                             judged the repo's own build to be `none`.
 *   aocore.portal_codegen     user-confirmed: a hand-named key for a component script run from the root.
 *
 * Added in TRD 43-06 — NEED USER ACCEPTANCE at the 43-07 checkpoint. All are non-canonical key names
 * the author chose; the drafter emits the canonical keys and notes these commands (or finds no gate):
 *   ao-terminal.test_frontend the root node frontend's suite beside the Go root's `test`: the drafter emits
 *                             one `test` (the tier stack's) and notes the off-stack one; the key name is the
 *                             author's split.
 *   ao-terminal.bootstrap     `task init`, a one-shot developer setup that only calls internal tasks: no
 *                             gate a classifier can read; the key name is the author's.
 *   aodex.guards              one CI step running several boundary-check targets together: the grouping and
 *                             the key name are the author's.
 *   aoedge.acceptance         `make acceptance`, scenario suites against a live edge: a non-repo-wide test
 *                             (an alternate note); the key is named after the target.
 *   devcluster.cluster_test   `./bin/test.sh` asserts a LIVE cluster: an env_unnamed note, never `test`;
 *                             the key name is the author's.
 *   EdenDocs.smoke            the smoke test is single-purpose (a narrow note under test); the key is the
 *                             author's.
 *   EdenDocs.branding         `verify-branding.sh` runs no gate a classifier reads; the key is the author's.
 *   navigators.sqlc           a second codegen recipe: the drafter emits one `codegen` (`just generate`);
 *                             a key per generator is the author's split.
 *   quanta-local.preflight    `make preflight`, host checks no classifier reads; key = the target name.
 *   quanta-local.verify       `make verify` needs the environment up (a compose run): noted, never `test`;
 *                             key = the target name.
 */
const HAND_ONLY = Object.freeze({
  devcluster: Object.freeze(['build', 'cluster_test']),
  aocore: Object.freeze(['portal_codegen']),
  'ao-terminal': Object.freeze(['test_frontend', 'bootstrap']),
  aodex: Object.freeze(['guards']),
  aoedge: Object.freeze(['acceptance']),
  EdenDocs: Object.freeze(['smoke', 'branding']),
  navigators: Object.freeze(['sqlc']),
  'quanta-local': Object.freeze(['preflight', 'verify']),
});

/** KEY_ALIASES: golden key -> the drafter's canonical key, where the hand file spelled it differently. */
const KEY_ALIASES = Object.freeze({
  helm_lint: 'lint_helm', // aocore: the classifier's key for `helm lint` / kubeconform is `lint_helm`
});

/** EXTRA_ALLOWED: shape -> root keys the draft may carry that the override lacks (HAND_ONLY governance). */
const EXTRA_ALLOWED = Object.freeze({});

module.exports = {
  GOLDEN,
  GOLDEN_SHAPES,
  HAND_ONLY,
  KEY_ALIASES,
  EXTRA_ALLOWED,
  goldenTerminalShape,
  goldenCoreShape,
  goldenDexShape,
  goldenEdgeShape,
  goldenClusterShape,
  goldenFlowopsShape,
  goldenBizShape,
  goldenDocsShape,
  goldenNavigatorsShape,
  goldenCivicShape,
  goldenQuantaShape,
};
