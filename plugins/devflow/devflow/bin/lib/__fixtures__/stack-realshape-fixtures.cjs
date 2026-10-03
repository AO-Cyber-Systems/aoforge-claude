'use strict';

// stack-realshape-fixtures.cjs — real evidence SHAPES, invented content (TRD 43-09, gap closure cycle 1).
//
// The 43-06 goldens passed on fixtures built to fit the rules (a `fmt-check` that runs
// `git diff --exit-code`), while the real fleet kept drifting. Each builder here reproduces the
// EVIDENCE SHAPE of one surveyed 43-ROLLOUT drift row: which targets exist, their prerequisite chains,
// which CI steps call what, and the competing candidates the drafter must choose between. The surveyed
// row is cited by its 43-ROLLOUT key only (for example "devflowops.format row"); no line, name, path or
// workflow text of a fleet repository is copied. Only the structural tokens that carry a rule are kept:
// a `-check` / `-verify` suffix, a captured `$(git diff …)` tested non-empty, a `mktemp` snapshot
// compared with `diff -q`, a `##` help comment, a workflow-level `env:` block, an install step that
// prints a tool's version.
//
// Shapes are named by STRUCTURE, never by repository (the realshape suite guards this).
//
// REALSHAPE = { <shapeName>: { build, tools, expect, absent, extraAllowed, noEvidence } }
//   build         () -> absolute root of a fresh temp repository
//   tools         the stub tools on PATH (stack-drafter-fixtures fakeToolchain)
//   expect        { extends, components, commands } — what a reviewer would commit; compared with the
//                 draft by stack-drift-compare's compareDrift (effective run/apply/cwd per key)
//   absent        keys that must NOT be among the draft's own commands
//   extraAllowed  keys whose conflict or more_specific row is tolerated (each with its reason inline)
//   noEvidence    commands that must not appear as any evidence item (any key)
//
// Makefile recipe lines need a literal tab, hence `\t`.

const detectFx = require('./stack-detect-fixtures.cjs');
const drafterFx = require('./stack-drafter-fixtures.cjs');

const { goMod, flutterPubspec } = detectFx;
const { makeWhole, DEFAULT_TOOLCHAIN } = drafterFx;

const GO_MAIN = 'package main\n\nfunc main() {}\n';
const DART_MAIN = "void main() {\n  print('ok');\n}\n";

const wf = (lines) => `${lines.join('\n')}\n`;
const mk = (lines) => `${lines.join('\n')}\n`;

// ─── captured-diff check (devflowops.format and devflowops.tidy rows) ─────────

/**
 * captureDiffCheckShape() — a Go root whose check targets run their writer as a prerequisite and then
 * CAPTURE `git diff` output into a shell variable, test it non-empty and `exit 1`. No
 * `git diff --exit-code` anywhere. The formatter is a `go run` batch tool plus an in-place `sed`
 * (no gofmt), so the writer target is known only by its name. CI never names the check targets: it
 * runs an aggregate (`make -B checks-server`) whose prerequisites they are.
 *
 * Competing candidates: the go tier's `test -z "$(gofmt -l .)"` and `go mod tidy -diff` (inherited),
 * the writers `make fmt` / `make tidy`, the checks `make fmt-check` / `make tidy-check`.
 * Reviewed: format `make fmt-check` apply `make fmt`; tidy `make tidy-check` apply `make tidy`.
 */
function captureDiffCheckShape() {
  return makeWhole({
    'go.mod': goMod('quillstack'),
    'main.go': GO_MAIN,
    'cmd/quillstack/main.go': GO_MAIN,
    'views/page.tmpl': '<p>{{ .Title }}</p>\n',
    'tools/batchfmt/main.go': GO_MAIN,
    Makefile: mk([
      'GO ?= go',
      'FMT_TOOL ?= example.invalid/batchfmt@v0.3.1',
      'SOURCE_DIRS := cmd internal',
      'VIEW_DIR := views',
      'NOTICES := assets/THIRD_PARTY.txt',
      'SED_I := sed -i',
      '',
      '.PHONY: fmt',
      'fmt:',
      "\t@FMT_TOOL=$(FMT_TOOL) $(GO) run tools/batchfmt/main.go reformat -w '{file-list}'",
      "\t$(eval VIEWS := $(shell find $(VIEW_DIR) -type f -name '*.tmpl'))",
      '\t@# collapse padding inside template delimiters',
      "\t@$(SED_I) -e 's/{{[ ]*/{{/g' -e 's/[ ]*}}/}}/g' $(VIEWS)",
      '',
      '.PHONY: fmt-check',
      'fmt-check: fmt',
      '\t@out=$$(git diff --color=never $(SOURCE_DIRS) $(VIEW_DIR)); \\',
      '\tif [ -n "$$out" ]; then \\',
      '\t  echo "Formatting drift: run \'make fmt\' and commit."; \\',
      '\t  echo "$${out}"; \\',
      '\t  exit 1; \\',
      '\tfi',
      '',
      '.PHONY: tidy',
      'tidy:',
      "\t$(eval LOW_GO := $(shell awk '/^go /{print $$2}' go.mod))",
      '\t$(GO) mod tidy -compat=$(LOW_GO)',
      '\t@$(MAKE) -s $(NOTICES)',
      '',
      '.PHONY: tidy-check',
      'tidy-check: tidy',
      '\t@out=$$(git diff --color=never go.mod go.sum $(NOTICES)); \\',
      '\tif [ -n "$$out" ]; then \\',
      '\t\techo "Module drift: run \'make tidy\' and commit."; \\',
      '\t\techo "$${out}"; \\',
      '\t\texit 1; \\',
      '\tfi',
      '',
      '$(NOTICES): go.mod go.sum',
      '\t$(GO) run tools/notices/main.go > $@',
      '',
      '.PHONY: checks-server',
      'checks-server: tidy-check fmt-check',
    ]),
    '.github/workflows/server-checks.yml': wf([
      'name: server-checks',
      'on: [pull_request]',
      'jobs:',
      '  server:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: make -B checks-server # rebuild every prerequisite, notices included',
    ]),
  });
}

// ─── snapshot-diff verify (aodex.codegen row) ─────────────────────────────────

/**
 * snapshotVerifyShape() — a `general` root with a Go server in `go/` and a Flutter client in
 * `flutter/`. The server Makefile pairs a generator (`schema-regen`) with a verify target whose ONE
 * multi-line recipe snapshots the generated files into a `mktemp -d` dir, regenerates, and fails with
 * `exit 1` when `diff -q <snapshot>/<f> <f>` reports a difference (restoring the snapshot first). The
 * verify target has no prerequisite: the writer is an earlier statement of its own recipe. CI runs
 * the verify target from `go/`; the Flutter workflow runs `build_runner` (a competing codegen in
 * another component).
 *
 * Reviewed: codegen `make schema-verify` apply `make schema-regen`, cwd `go`; build and test are the
 * server Makefile's, cwd `go`.
 */
function snapshotVerifyShape() {
  return makeWhole({
    'README.md': '# relaydesk\n',
    'go/go.mod': goMod('relaydesk'),
    'go/main.go': GO_MAIN,
    'go/wire/contract.yaml': 'openapi: 3.0.3\ninfo: { title: relaydesk, version: 0.1.0 }\npaths: {}\n',
    'go/wire/gen.go': 'package wire\n\n//go:generate go run example.invalid/wiregen -o messages.gen.go contract.yaml\n',
    'go/wire/messages.gen.go': 'package wire\n',
    'go/wire/handlers.gen.go': 'package wire\n',
    'go/Makefile': mk([
      'GEN_FLAGS ?= -mod=mod',
      '',
      '.PHONY: build test schema-regen schema-verify',
      '',
      'build: ## Build the server binary',
      '\tgo build -o bin/relaydesk ./...',
      '',
      'test: ## Run the unit tests',
      '\tgo test ./...',
      '',
      '# wire contract: generated code must match contract.yaml',
      '',
      'schema-regen: ## Rewrite the generated wire messages and handlers',
      '\tGOFLAGS=$(GEN_FLAGS) go generate ./wire/...',
      '',
      'schema-verify: ## Regenerate into place and fail if anything moved',
      '\t@snap=$$(mktemp -d) && \\',
      '\t\tcp wire/messages.gen.go wire/handlers.gen.go $$snap/ && \\',
      '\t\tGOFLAGS=$(GEN_FLAGS) go generate ./wire/... >/dev/null 2>&1 && \\',
      '\t\tif ! diff -q $$snap/messages.gen.go wire/messages.gen.go >/dev/null || \\',
      '\t\t   ! diff -q $$snap/handlers.gen.go wire/handlers.gen.go >/dev/null; then \\',
      '\t\t\techo "wire code is stale; make schema-regen, then commit"; \\',
      "\t\t\tdiff -u $$snap/messages.gen.go wire/messages.gen.go | sed -n '1,25p' || true; \\",
      '\t\t\tcp $$snap/messages.gen.go $$snap/handlers.gen.go wire/; \\',
      '\t\t\trm -rf $$snap; \\',
      '\t\t\texit 1; \\',
      '\t\tfi && \\',
      '\t\trm -rf $$snap',
    ]),
    'flutter/pubspec.yaml': flutterPubspec('relaydesk_app', { buildRunner: true }),
    'flutter/lib/main.dart': DART_MAIN,
    '.github/workflows/server.yml': wf([
      'name: server',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  unit:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: make build',
      '      - run: make test',
      '  codegen-drift:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: Generated API is current (make schema-verify)',
      '        run: make schema-verify',
    ]),
    '.github/workflows/app.yml': wf([
      'name: app',
      'on: [pull_request]',
      'jobs:',
      '  client:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: flutter',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: dart run build_runner build --delete-conflicting-outputs',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
  });
}

// ─── workflow env + version probe (aocore.lint_helm row) ──────────────────────

/**
 * workflowEnvChartShape() — a Go root with a Helm chart. One workflow declares the chart directory in
 * a workflow-level `env:` block (beside a tool version pin and a checksum), installs a schema
 * validator in a multi-line step that ends by printing its version (`<tool> -v`), lints the chart with
 * `helm lint "${CHART_PATH}/"`, renders it with `helm template` and validates the render. A scope job
 * carries step `env:` values that are `${{ }}` expressions (runtime, never substituted).
 *
 * Competing candidates for lint_helm: the version probe, `helm lint` through the env variable, and the
 * validator run over the rendered file. Reviewed: lint_helm `helm lint deploy/charts/beacon/`.
 */
function workflowEnvChartShape() {
  return makeWhole({
    'go.mod': goMod('beaconrelay'),
    'main.go': GO_MAIN,
    'deploy/charts/beacon/Chart.yaml': 'apiVersion: v2\nname: beacon\nversion: 0.1.0\n',
    'deploy/charts/beacon/values.yaml': 'replicas: 1\n',
    'deploy/charts/beacon/values-smoke.yaml': 'replicas: 2\n',
    '.github/workflows/chart-check.yml': wf([
      'name: Chart check',
      '',
      '# Offline chart gates only: lint, render, schema-validate.',
      'on:',
      '  pull_request:',
      '    branches: [main]',
      '',
      'permissions:',
      '  contents: read',
      '',
      'env:',
      '  CHART_PATH: deploy/charts/beacon',
      '  # validator pin: bump the version and its checksum together',
      '  VALIDATOR_VERSION: "0.7.1"',
      '  VALIDATOR_SUM: "4f1c2a9e0b7d3c5a8e6f1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60"',
      '',
      'jobs:',
      '  scope:',
      '    runs-on: ubuntu-latest',
      '    outputs:',
      '      run: ${{ steps.scope.outputs.run }}',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - id: scope',
      '        env:',
      '          BASE_REF: ${{ github.event.pull_request.base.sha }}',
      '        run: echo "run=true" >> "$GITHUB_OUTPUT"',
      '',
      '  chart:',
      '    needs: [scope]',
      "    if: needs.scope.outputs.run == 'true'",
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Checkout',
      '        uses: actions/checkout@v4',
      '',
      '      - name: Set up Helm',
      '        uses: azure/setup-helm@v4',
      '        with:',
      '          version: "v3.15.0"',
      '',
      '      - name: Install the schema validator (pinned, checksum-verified)',
      '        run: |',
      '          set -euo pipefail',
      '          archive=validator-x64.tgz',
      '          wget -q -O "$archive" "https://example.invalid/validator/v${VALIDATOR_VERSION}/$archive"',
      '          printf \'%s  %s\\n\' "$VALIDATOR_SUM" "$archive" | shasum -a 256 -c',
      '          tar -xzf "$archive"',
      '          sudo mv kubeconform /usr/local/bin/',
      '          kubeconform -v',
      '',
      '      - name: Lint the chart',
      '        run: helm lint "${CHART_PATH}/"',
      '',
      '      - name: Render the chart',
      '        run: |',
      '          set -euo pipefail',
      '          helm template "${CHART_PATH}/" --values "${CHART_PATH}/values-smoke.yaml" > out.yaml',
      '          test -s out.yaml',
      '',
      '      - name: Validate the rendered objects',
      '        run: kubeconform -strict -summary out.yaml',
    ]),
  });
}

// ─── cross-stack primary (eden-biz.build and eden-biz.test rows, TRD 43-10) ───

/**
 * crossStackPrimaryShape() — a `general` root with a Go service in `server/` and a Flutter client in
 * `client/`. There is no root manifest and no root build or test. The client holds MORE evidence items
 * in total (its Makefile has two builds, a test, an analyze and a bundle target named for the e2e
 * scenario; three workflows), and ONE of its CI steps goes through its Makefile, serving that e2e
 * target. The service holds more build/test/lint items: its Makefile has build, test and an image build,
 * and its CI runs the Go tools DIRECTLY (`go vet`, `go build`, `go test`) across three workflows, never
 * `make`. The drafter must pick the service as the primary component, because the evidence that
 * decides is the build/test/lint evidence, and one CI step through a runner for an e2e target says
 * nothing about the repository's build interface.
 *
 * Per-area counts (runner + CI items, canonical build/test/lint ones): server 9 and 9, client 11 and 7.
 * Reviewed: build `make build` and test `make test` with cwd `server`; lint `go vet ./...` with cwd
 * `server` (the service's CI step); no deps, which only the client's CI supplies.
 */
function crossStackPrimaryShape() {
  return makeWhole({
    'README.md': '# tallyhall\n',
    'server/go.mod': goMod('tallyhall'),
    'server/main.go': GO_MAIN,
    'server/cmd/tallyd/main.go': GO_MAIN,
    'server/Makefile': mk([
      '.PHONY: build test image-build',
      '',
      'build: ## Build the server binary',
      '\tgo build -o bin/tallyd ./cmd/tallyd',
      '',
      'test: ## Run the unit tests',
      '\tgo test ./...',
      '',
      'image-build: ## Build the container image',
      '\tdocker build -t tallyd:local .',
    ]),
    'client/pubspec.yaml': flutterPubspec('tallyhall_client'),
    'client/lib/main.dart': DART_MAIN,
    'client/Makefile': mk([
      '.PHONY: build-web build-desktop test analyze bundle-e2e',
      '',
      'build-web: ## Release build for the web',
      '\tflutter build web --release',
      '',
      'build-desktop: ## Release build for the desktop shell',
      '\tflutter build macos --release',
      '',
      'test: ## Run unit and widget tests',
      '\tflutter test',
      '',
      'analyze: ## Static analysis',
      '\tflutter analyze',
      '',
      'bundle-e2e: ## Web bundle with the e2e entry point',
      '\tflutter build web --release -t lib/main_e2e.dart',
    ]),
    '.github/workflows/server.yml': wf([
      'name: server',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: server',
      'jobs:',
      '  unit:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go build ./...',
      '      - run: go test ./... -count=1 -timeout 20m',
    ]),
    '.github/workflows/smoke.yml': wf([
      'name: smoke',
      'on: [pull_request]',
      'jobs:',
      '  boot:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: Build the dev binary',
      '        working-directory: server',
      '        run: go build -tags dev -o /tmp/tallyd ./cmd/tallyd',
    ]),
    '.github/workflows/store.yml': wf([
      'name: store',
      'on: [pull_request]',
      'jobs:',
      '  migrate:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: server',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go build -o /tmp/tallyd ./cmd/tallyd',
      '      - run: go test ./internal/store/... -count=1',
    ]),
    '.github/workflows/client.yml': wf([
      'name: client',
      'on: [pull_request]',
      'jobs:',
      '  unit:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: client',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze',
      '      - run: flutter test',
    ]),
    '.github/workflows/client-release.yml': wf([
      'name: client-release',
      'on: [push]',
      'jobs:',
      '  web:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: client',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter build web --release',
    ]),
    '.github/workflows/client-journeys.yml': wf([
      'name: client-journeys',
      'on: [pull_request]',
      'jobs:',
      '  journeys:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: client',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - name: Build the journeys bundle',
      '        run: make bundle-e2e',
    ]),
  });
}

// ─── primary component whose CI runs tools directly (politihub row, TRD 43-10) ─

/**
 * toolDirectPrimaryShape() — a `general` root with a Go service in `core/` and a Flutter app in
 * `navigator/`. The service's Makefile has build, test and an image build with a prerequisite; its
 * only workflow runs the Go tools DIRECTLY (`go vet`, `go build`, `go test`), never `make`. The app has
 * the most CI items in the repository, spread across THREE workflows (pub get, build_runner, analyze,
 * tests, three release builds), all raw `flutter` / `dart`, and no task runner.
 *
 * Per-area counts (runner + CI items, canonical build/test/lint ones): core 8 and 7, navigator 12 and 6.
 * Reviewed: build `make build` and test `make test` with cwd `core`; lint `go vet ./...` with cwd `core`.
 */
function toolDirectPrimaryShape() {
  return makeWhole({
    'README.md': '# civicdesk\n',
    'core/go.mod': goMod('civicdesk'),
    'core/main.go': GO_MAIN,
    'core/Makefile': mk([
      '.PHONY: build test vendor-shared image-build',
      '',
      'build:',
      '\tgo build -o bin/civicd .',
      '',
      'test:',
      '\tgo test ./...',
      '',
      'vendor-shared:',
      '\tgo mod vendor',
      '',
      'image-build: vendor-shared',
      '\tdocker build -t civicd:local .',
    ]),
    'navigator/pubspec.yaml': flutterPubspec('civicdesk_navigator', { buildRunner: true }),
    'navigator/lib/main.dart': DART_MAIN,
    '.github/workflows/core.yml': wf([
      'name: core',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: core',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go vet -tags integration ./...',
      '      - run: go build ./...',
      '      - run: go test ./... -race -tags integration -p 1',
    ]),
    '.github/workflows/navigator.yml': wf([
      'name: navigator',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: navigator',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: dart run build_runner build --delete-conflicting-outputs',
      '      - run: flutter analyze',
      '      - run: flutter test',
      '      - run: flutter test --platform chrome test/core/web_store_test.dart',
      '      - run: flutter build web --release',
    ]),
    '.github/workflows/navigator-release.yml': wf([
      'name: navigator-release',
      'on:',
      '  push:',
      '    tags: ["v*"]',
      'defaults:',
      '  run:',
      '    working-directory: navigator',
      'jobs:',
      '  mobile:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: dart run build_runner build --delete-conflicting-outputs',
      '      - run: flutter build ios --release --no-codesign --build-name="${{ github.ref_name }}"',
      '      - run: flutter build appbundle --release --build-name="${{ github.ref_name }}"',
    ]),
    '.github/workflows/navigator-pages.yml': wf([
      'name: navigator-pages',
      'on:',
      '  push:',
      '    branches: [main]',
      'defaults:',
      '  run:',
      '    working-directory: navigator',
      'jobs:',
      '  deploy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: dart run build_runner build --delete-conflicting-outputs',
    ]),
  });
}

const tools = (...extra) => [...DEFAULT_TOOLCHAIN, ...extra];

const REALSHAPE = Object.freeze({
  crossStackPrimaryShape: {
    build: crossStackPrimaryShape,
    tools: tools(),
    expect: {
      extends: 'general',
      components: [{ path: 'client/', profile: 'flutter' }, { path: 'server/', profile: 'go' }],
      commands: {
        build: { run: 'make build', cwd: 'server' },
        test: { run: 'make test', cwd: 'server' },
        lint: { run: 'go vet ./...', cwd: 'server' },
      },
    },
    absent: ['deps', 'e2e'],
    extraAllowed: [],
    noEvidence: [],
  },
  toolDirectPrimaryShape: {
    build: toolDirectPrimaryShape,
    tools: tools(),
    expect: {
      extends: 'general',
      components: [{ path: 'core/', profile: 'go' }, { path: 'navigator/', profile: 'flutter' }],
      commands: {
        build: { run: 'make build', cwd: 'core' },
        test: { run: 'make test', cwd: 'core' },
        lint: { run: 'go vet ./...', cwd: 'core' },
      },
    },
    absent: ['deps', 'codegen'],
    extraAllowed: [],
    noEvidence: [],
  },
  captureDiffCheckShape: {
    build: captureDiffCheckShape,
    tools: tools(),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        format: { run: 'make fmt-check', apply: 'make fmt' },
        tidy: { run: 'make tidy-check', apply: 'make tidy' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
  },
  snapshotVerifyShape: {
    build: snapshotVerifyShape,
    tools: tools(),
    expect: {
      extends: 'general',
      components: [{ path: 'flutter/', profile: 'flutter' }, { path: 'go/', profile: 'go' }],
      commands: {
        build: { run: 'make build', cwd: 'go' },
        test: { run: 'make test', cwd: 'go' },
        codegen: { run: 'make schema-verify', apply: 'make schema-regen', cwd: 'go' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
  },
  workflowEnvChartShape: {
    build: workflowEnvChartShape,
    tools: tools('kubeconform'),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        lint_helm: { run: 'helm lint deploy/charts/beacon/' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: ['kubeconform -v'],
  },
});

module.exports = {
  REALSHAPE,
  captureDiffCheckShape,
  snapshotVerifyShape,
  workflowEnvChartShape,
  crossStackPrimaryShape,
  toolDirectPrimaryShape,
};
