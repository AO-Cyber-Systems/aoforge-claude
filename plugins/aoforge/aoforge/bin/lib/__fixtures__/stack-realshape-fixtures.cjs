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
//   noteTags      optional { present, absent }: note `tag`s the draft must (not) carry (TRD 43-10)
//   noteStatuses  optional { present, absent }: note `status`es the draft must (not) carry (TRD 43-11)
//
// Makefile recipe lines need a literal tab, hence `\t`.

const detectFx = require('./stack-detect-fixtures.cjs');
const drafterFx = require('./stack-drafter-fixtures.cjs');

const { goMod, flutterPubspec, dartPubspec } = detectFx;
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

// ─── root image build beside a component build (aodex.build and politihub.build rows, TRD 43-10) ─

/**
 * imageBuildRootShape() — a `general` root with a Go service in `server/` and a Flutter client in `ui/`
 * that has its own Dockerfile. The service's Makefile has build and test; its CI runs the Go tools
 * directly (`go vet`, `go build`, `go test`). The ONLY root-level build evidence is one release
 * workflow step: a `docker build` of the client image (`--target builder`, build args carrying
 * `${{ }}` expressions, `-f ./ui/Dockerfile ./ui`). It is unverifiable (a workflow expression), and
 * it is an image build, which packages what the repository builds and is not the build.
 *
 * Per-area counts (runner + CI items, canonical build/test/lint ones): server 5 and 5, ui 2 and 2.
 * Reviewed: build `make build`, test `make test` and lint `go vet ./...`, all with cwd `server`.
 */
function imageBuildRootShape() {
  return makeWhole({
    'README.md': '# cardroom\n',
    'server/go.mod': goMod('cardroom'),
    'server/main.go': GO_MAIN,
    'server/cmd/roomd/main.go': GO_MAIN,
    'server/Makefile': mk([
      '.PHONY: build test',
      '',
      'build: ## Build the server binary',
      '\tgo build -o bin/roomd ./cmd/roomd',
      '',
      'test: ## Run the unit tests',
      '\tgo test ./...',
    ]),
    'ui/pubspec.yaml': flutterPubspec('cardroom_ui'),
    'ui/lib/main.dart': DART_MAIN,
    'ui/Dockerfile': 'FROM scratch AS builder\nCOPY . /src\n',
    '.github/workflows/server.yml': wf([
      'name: server',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: server',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go build ./cmd/roomd',
      '      - run: go test ./... -count=1',
    ]),
    '.github/workflows/ui.yml': wf([
      'name: ui',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: ui',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter test',
      '      - run: flutter build web --release',
    ]),
    '.github/workflows/release-ui.yml': wf([
      'name: release-ui',
      'on:',
      '  push:',
      '    tags: ["v*"]',
      'jobs:',
      '  image:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - id: ref',
      '        run: echo "version=${GITHUB_REF_NAME}" >> "$GITHUB_OUTPUT"',
      '      - name: Build the client image',
      '        run: docker build --target builder -t cardroom-ui-builder --build-arg VERSION=${{ steps.ref.outputs.version }} --build-arg COMMIT=${{ github.sha }} -f ./ui/Dockerfile ./ui',
    ]),
  });
}

// ─── workspace root runner (eden-libs rows, TRD 43-10) ────────────────────────

/**
 * workspaceRunnerShape() — a workspace of sibling packages under a `general` root with no manifest of its
 * own: two Dart packages, a Flutter package with a nested example app, two Go modules (one holds an `e2e/`
 * node package), and `gateway/`, a Go checkout with its own `.git` that is NOT a component. The ONLY
 * interface is the root `justfile`, whose recipes FAN OUT: `setup` runs `pub get` in four dirs, `fmt`,
 * `test` and `lint` run their tool in five, `generate` runs one tool in the nested checkout (one leg),
 * `bundle-gallery` runs two commands in the Flutter package, `build-site` and `smoke-gallery` depend on it,
 * `a11y-gate` depends on `build-wasm`, `check` aggregates four recipes, and `package-site` is a
 * `#!/usr/bin/env bash` recipe at the root that depends on `build-site` and ends in `docker build`. Package
 * CI runs `dart` / `go` per package with a working-directory, never `just`.
 *
 * Today the first Dart package is the primary component: `just test` is filed as a note under the nested
 * checkout it enters first, so `test` is that package's CI `dart test`, `generate` is lost, `fmt` is lost,
 * and `build` is the packaging recipe (the only recipe that runs at the root). The primary-less workspace
 * takes every root recipe, wherever its body runs.
 *
 * Reviewed: lint `just lint`; test `just test`; build `just bundle-gallery` (a depended-on, high
 * confidence recipe; not the packaging recipe); deps `just setup`; codegen `just generate`; format
 * `discover` with apply `just fmt`.
 */
function workspaceRunnerShape() {
  return detectFx.makeGitTree({
    'README.md': '# gridworks\n',
    justfile: [
      'set shell := ["zsh", "-lc"]',
      '',
      'setup:',
      '  (cd api-dart && dart pub get)',
      '  (cd ui-kit && flutter pub get)',
      '  (cd ui-kit/example && flutter pub get)',
      '  (cd doc-model && dart pub get)',
      '',
      'generate:',
      '  (cd gateway && ~/bin/buf generate)',
      '',
      'fmt:',
      '  (cd web-kit && gofmt -w .)',
      '  (cd api-dart && dart format .)',
      '  (cd ui-kit && dart format .)',
      '  (cd doc-model && dart format .)',
      '  (cd docs-site && gofmt -w .)',
      '',
      'test:',
      '  (cd gateway && go test ./...)',
      '  (cd ui-kit && flutter test)',
      '  (cd web-kit && go test ./...)',
      '  (cd docs-site && go test ./...)',
      '  (cd doc-model && dart test)',
      '',
      'lint:',
      '  (cd api-dart && dart analyze)',
      '  (cd ui-kit && flutter analyze)',
      '  (cd web-kit && go vet ./...)',
      '  (cd docs-site && go vet ./...)',
      '  (cd doc-model && dart analyze --fatal-warnings)',
      '',
      '# serve-docs serves the docs site preview on PORT 8091 ONLY.',
      'serve-docs:',
      '  (cd docs-site && go run ./cmd/docsite serve --port 8091)',
      '',
      '# bundle-gallery builds the component gallery into a static web bundle and emits its slice of the',
      '# search index. The base href is mandatory: the docs site serves the bundle under /gallery/.',
      'bundle-gallery:',
      '  (cd ui-kit && flutter build web --base-href /gallery/)',
      '  (cd ui-kit && flutter test tool/emit_index.dart)',
      '',
      '# build-site builds the whole docs site into docs-site/out, wiring in the gallery bundle.',
      'build-site: bundle-gallery',
      '  (cd docs-site && go run ./cmd/docsite build -o out --gallery-bundle ../ui-kit/build/web)',
      '',
      '# smoke-gallery runs the build-smoke assertions against the produced bundle.',
      'smoke-gallery: bundle-gallery',
      '  (cd ui-kit && flutter test test/gallery_smoke_test.dart)',
      '',
      'check: generate fmt lint test',
      '',
      'down:',
      '  docker compose -f compose.yaml down -v',
      '',
      '# build-wasm compiles the render binary and vendors the toolchain-paired shim.',
      'build-wasm:',
      '  (cd web-kit && GOOS=js GOARCH=wasm go build -o ../docs-site/static/js/render.wasm ./cmd/wasm-render/)',
      '  cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" docs-site/static/js/wasm_exec.js',
      '',
      '# a11y-gate builds the render binary, then audits the site in a browser on PORT 8091 ONLY.',
      'a11y-gate: build-wasm',
      '  (cd docs-site/e2e && npm ci && npx playwright test a11y.spec.ts)',
      '',
      '# package-site turns the built site into one reproducible tarball and a container image.',
      'package-site: build-site',
      '  #!/usr/bin/env bash',
      '  set -euo pipefail',
      '  GTAR="$(command -v gtar || true)"',
      '  [ -n "$GTAR" ] || { echo "GNU tar is required: brew install gnu-tar"; exit 1; }',
      '  mkdir -p docs-site/dist',
      '  "$GTAR" --sort=name --mtime=\'1970-01-01 00:00:00Z\' --owner=0 --group=0 --numeric-owner -cf docs-site/dist/site.tar -C docs-site/out .',
      '  gzip -n -9 -c docs-site/dist/site.tar > docs-site/dist/site.tar.gz',
      '  docker build -t site:local docs-site',
      '',
    ].join('\n'),
    'api-dart/pubspec.yaml': dartPubspec('gridworks_api'),
    'api-dart/lib/gridworks_api.dart': 'library gridworks_api;\n',
    'doc-model/pubspec.yaml': dartPubspec('gridworks_doc_model'),
    'doc-model/lib/gridworks_doc_model.dart': 'library gridworks_doc_model;\n',
    'ui-kit/pubspec.yaml': flutterPubspec('gridworks_ui'),
    'ui-kit/lib/main.dart': DART_MAIN,
    'ui-kit/example/pubspec.yaml': flutterPubspec('gridworks_ui_example'),
    'ui-kit/example/lib/main.dart': DART_MAIN,
    'web-kit/go.mod': goMod('gridworks-web'),
    'web-kit/main.go': GO_MAIN,
    'docs-site/go.mod': goMod('gridworks-docs'),
    'docs-site/main.go': GO_MAIN,
    'docs-site/e2e/package.json': JSON.stringify({ name: 'gridworks-docs-e2e', private: true, scripts: { test: 'playwright test' } }),
    'gateway/go.mod': goMod('gridworks-gateway'),
    'gateway/main.go': GO_MAIN,
    'gateway/.git/HEAD': 'ref: refs/heads/main\n',
    '.github/workflows/api-dart.yml': wf([
      'name: api-dart',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: api-dart',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: dart-lang/setup-dart@v1',
      '      - run: dart pub get',
      '      - run: dart analyze',
      '      - run: dart test',
    ]),
    '.github/workflows/web-kit.yml': wf([
      'name: web-kit',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: web-kit',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go vet ./...',
      '      - run: go test ./...',
    ]),
  });
}

// ─── mixed codegen aggregate (justinforme.codegen and smartWellness.codegen rows) ────

/**
 * mixedAggregateCodegenShape() — a Go root whose Makefile's FIRST target (the default goal) is the proto
 * generator `proto:` (`buf lint`, then `buf generate`); then `sqlc:`; then `gen-sdk: proto`, which proves a
 * client SDK in a sibling checkout OUTSIDE the repo compiles (two `@cd /abs/path && dart …` lines: `dart pub
 * get`, `dart analyze`); then the aggregate `generate: proto sqlc gen-sdk`. An acceptance target re-runs
 * `$(MAKE) gen-sdk`, greps, and runs the client suites. CI runs `sqlc generate` and `buf generate` raw and
 * prints "run 'make generate'" when the tree moved. A Flutter client is a component.
 *
 * Competing codegen candidates: `make generate` (named for the key, but it also pulls deps and lint through
 * gen-sdk), `make proto`, `make sqlc`, the two CI lines. deps: `make gen-sdk` and the acceptance target, both
 * mixed, neither pure. Reviewed: codegen `make proto`, deps `make gen-sdk`, build and test the Makefile's.
 */
function mixedAggregateCodegenShape() {
  return makeWhole({
    'go.mod': goMod('ballotdesk'),
    'main.go': GO_MAIN,
    'cmd/api/main.go': GO_MAIN,
    'proto/ballot/v1/ballot.proto': 'syntax = "proto3";\npackage ballot.v1;\n',
    'buf.yaml': 'version: v2\nmodules:\n  - path: proto\n',
    'buf.gen.yaml': 'version: v2\nplugins: []\n',
    'sqlc.yaml': 'version: "2"\nsql: []\n',
    'clients/desk/pubspec.yaml': flutterPubspec('desk_app'),
    'clients/desk/lib/main.dart': DART_MAIN,
    Makefile: mk([
      '.PHONY: proto sqlc generate gen-sdk build test lint acceptance',
      '',
      '# ── Code generation ──────────────────────────────',
      '',
      'proto:',
      '\tbuf lint',
      '\tbuf generate',
      '',
      'sqlc:',
      '\tsqlc generate',
      '',
      '## gen-sdk: regenerate the Dart client SDK (it lives in a sibling checkout), then prove it compiles.',
      'gen-sdk: proto',
      '\t@echo "==> checking the client SDK after codegen"',
      '\t@cd /srv/checkouts/ballotdesk-sdk-dart && dart pub get >/dev/null',
      '\t@cd /srv/checkouts/ballotdesk-sdk-dart && dart analyze',
      '\t@echo "PASS: client SDK regenerated and clean"',
      '',
      'generate: proto sqlc gen-sdk',
      '',
      '# ── Build, test, lint ────────────────────────────',
      '',
      'build:',
      '\tgo build -o bin/api ./cmd/api',
      '',
      'test:',
      '\tgo test ./...',
      '',
      'lint:',
      '\tgo vet ./...',
      '\tbuf lint',
      '',
      '## acceptance: regenerate, then run every client suite',
      'acceptance:',
      '\t@$(MAKE) gen-sdk',
      '\t@count=$$(grep -r "TODO(sdk)" /srv/checkouts/ballotdesk/clients/desk/lib | wc -l | tr -d " "); \\',
      '\t  if [ "$$count" -ne 0 ]; then echo "FAIL: $$count markers"; exit 1; fi',
      '\t@cd /srv/checkouts/ballotdesk/clients/desk && flutter pub get >/dev/null && flutter analyze && flutter test',
      '\t@cd /srv/checkouts/ballotdesk-sdk-dart && dart pub get >/dev/null && dart test',
    ]),
    '.github/workflows/ci.yml': wf([
      'name: CI',
      'on: [pull_request]',
      'jobs:',
      '  verify-generation:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: Install generators',
      '        run: |',
      '          go install example.invalid/sqlc/cmd/sqlc@latest',
      '          go install example.invalid/buf/cmd/buf@latest',
      '      - name: sqlc',
      '        run: sqlc generate',
      '      - name: buf',
      '        run: buf generate',
      '      - name: No drift',
      '        run: |',
      '          if [ -n "$(git status --porcelain)" ]; then',
      '            echo "generated code is stale: run \'make generate\' and commit"',
      '            exit 1',
      '          fi',
      '  unit:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go test -v ./...',
    ]),
  });
}

// ─── bootstrap task (ao-terminal.deps row) ────────────────────────────────────

/**
 * bootstrapTaskShape() — a Go root with a root package.json and a docs site (node, unsupported). The
 * Taskfile's `init:` is a one-shot developer bootstrap whose cmds run `npm install`, `go mod tidy`, then
 * `cd docs && npm install`. Internal tasks `npm:install` and `go:mod:tidy` (`internal: true`) are the
 * prerequisites of the public build and typecheck tasks. CI installs with `npm ci --no-audit --no-fund` in a
 * step named for the lockfile, and a setup workflow runs `go mod download`.
 *
 * Competing deps candidates: `task init` (it also tidies), the CI `npm ci …` and `go mod download` lines.
 * Reviewed: deps = the CI install line; the drafter keeps it VERBATIM (no flag is ever stripped).
 */
function bootstrapTaskShape() {
  return makeWhole({
    'go.mod': goMod('panelterm'),
    'main.go': GO_MAIN,
    'cmd/server/main.go': GO_MAIN,
    'package.json': `${JSON.stringify({ name: 'panelterm', private: true, devDependencies: { typescript: '^5.6.0' } }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({ name: 'panelterm', lockfileVersion: 3, packages: {} }, null, 2)}\n`,
    'docs/package.json': `${JSON.stringify({ name: 'panelterm-docs', private: true, scripts: { build: 'docusaurus build' } }, null, 2)}\n`,
    'Taskfile.yml': mk([
      "version: '3'",
      '',
      'tasks:',
      '  build:backend:',
      '    desc: Build the server binary.',
      '    cmds:',
      '      - task: build:server',
      '',
      '  build:server:',
      '    desc: Build the server for this platform.',
      '    cmds:',
      '      - task: build:server:internal',
      '    deps:',
      '      - go:mod:tidy',
      '',
      '  build:server:internal:',
      '    internal: true',
      '    cmd: go build -o dist/bin/panelterm ./cmd/server',
      '',
      '  check:ts:',
      '    desc: Typecheck the TypeScript code.',
      '    cmd: npx tsc --noEmit',
      '    deps:',
      '      - npm:install',
      '',
      '  init:',
      '    desc: Initialize the project for development.',
      '    cmds:',
      '      - npm install',
      '      - go mod tidy',
      '      - cd docs && npm install',
      '',
      '  npm:install:',
      '    desc: Runs `npm install`',
      '    internal: true',
      '    sources:',
      '      - package-lock.json',
      '      - package.json',
      '    cmd: npm install',
      '',
      '  go:mod:tidy:',
      '    desc: Runs `go mod tidy`',
      '    internal: true',
      '    sources:',
      '      - go.mod',
      '    cmd: go mod tidy',
    ]),
    '.github/workflows/build.yml': wf([
      'name: build',
      'on: [pull_request]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '      - name: npm ci (locked)',
      '        run: npm ci --no-audit --no-fund',
      '      - uses: actions/setup-go@v5',
      '      - run: go test ./...',
    ]),
    '.github/workflows/setup-steps.yml': wf([
      'name: setup steps',
      'on: [workflow_dispatch]',
      'jobs:',
      '  setup:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go mod download',
    ]),
  });
}

// ─── partial drift check (eden-biz.codegen row) ───────────────────────────────

/**
 * partialDriftCheckShape() — a `general` root with a Go server in `go/` (the primary: its CI builds and tests
 * there) and a Flutter app in `app/`. The server Makefile's aggregate generator is `generate: views styles
 * buf-generate`: `views:` regenerates the view templates file by file (`find … | sort | while read -r f; do
 * <gen> -f "$$f" || exit 1; done`), `styles:` runs the CSS bundler (classifies to nothing), `buf-generate:` runs
 * `cd .. && buf generate`. `views-check: views` then fails on `git diff --exit-code` over the views dir: a drift
 * check of ONE leg. There are also a narrow `proto-gen:` (`cd .. && buf generate --path a --path b`), a watcher
 * and a `dev:` target that backgrounds watchers. `build: generate`. A root CI drift workflow runs `buf
 * generate`; a views drift workflow loops the generator in `go/`.
 *
 * Reviewed: codegen `make generate`, cwd `go`, no apply; build and test the server Makefile's, cwd `go`.
 */
function partialDriftCheckShape() {
  return makeWhole({
    'README.md': '# tidewell\n',
    'buf.yaml': 'version: v2\nmodules:\n  - path: proto\n',
    'buf.gen.yaml': 'version: v2\nplugins: []\n',
    'proto/tide/v1/tide.proto': 'syntax = "proto3";\npackage tide.v1;\n',
    'go/go.mod': goMod('tidewell'),
    'go/main.go': GO_MAIN,
    'go/cmd/tide-api/main.go': GO_MAIN,
    'go/internal/views/home.templ': 'package views\n\ntempl Home() { <p>tide</p> }\n',
    'go/static/css/site-input.css': '@tailwind base;\n',
    'go/Makefile': mk([
      'BINARY := bin/tide-api',
      '',
      '.PHONY: build test views views-check views-watch styles buf-generate generate proto-gen dev',
      '',
      'build: generate',
      '\tgo build -o $(BINARY) ./cmd/tide-api',
      '',
      '# ── Views (generated *_templ.go are committed) ──',
      '',
      'views:',
      "\t@find internal/views -name '*.templ' | sort | while read -r f; do \\",
      '\t  templ generate -f "$$f" || exit 1; \\',
      '\tdone',
      '',
      '## views-check: regenerate the views, then fail on any drift (CI gate)',
      'views-check: views',
      '\t@if ! git diff --exit-code --stat -- internal/views; then \\',
      "\t  echo \"views drift: run 'make views' and commit\"; \\",
      '\t  git diff -- internal/views; \\',
      '\t  exit 1; \\',
      '\tfi',
      '\t@echo "No views drift."',
      '',
      'views-watch:',
      '\ttempl generate --watch',
      '',
      'styles:',
      '\ttailwindcss -i static/css/site-input.css -o static/css/site.css --minify',
      '',
      'buf-generate:',
      '\tcd .. && buf generate',
      '',
      'generate: views styles buf-generate',
      '',
      '## proto-gen: regenerate only the public booking protos',
      'proto-gen:',
      '\tcd .. && buf generate \\',
      '\t  --path proto/tide/v1/tide.proto \\',
      '\t  --path proto/tide/v1/tide_public.proto',
      '',
      'dev:',
      '\t@echo "Starting watchers..."',
      '\t@templ generate --watch &',
      '\t@tailwindcss -i static/css/site-input.css -o static/css/site.css --watch &',
      '\t@go run ./cmd/tide-api',
      '',
      'test:',
      '\tgo test ./...',
    ]),
    'app/pubspec.yaml': flutterPubspec('tide_app'),
    'app/lib/main.dart': DART_MAIN,
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  server:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go build ./...',
      '      - run: go test ./... -count=1',
    ]),
    '.github/workflows/proto-drift.yml': wf([
      'name: proto drift',
      'on: [pull_request]',
      'jobs:',
      '  drift:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: buf generate',
      '      - run: git diff --exit-code',
    ]),
    '.github/workflows/views-drift.yml': wf([
      'name: views drift',
      'on: [pull_request]',
      'jobs:',
      '  drift:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: go',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Regenerate views',
      '        run: |',
      "          find internal/views -name '*.templ' | sort | while read -r f; do",
      '            templ generate -f "$f" || exit 1',
      '          done',
      '      - run: git diff --exit-code -- internal/views',
    ]),
  });
}

// ─── scenario stack targets (eden-biz e2e_env and e2e rows) ───────────────────

/**
 * scenarioStackShape() — a `general` root with a Go server in `go/` (the primary) and a Flutter app in `app/`
 * whose browser suite lives in `app/web_e2e/` (node, unsupported). The ROOT Makefile is the e2e harness
 * entry point (default goal `help`): `e2e-stack-up: ## cold machine -> live e2e stack …` and `e2e-stack-down:
 * ## Tear down …; idempotent` each run a script under `app/web_e2e/scripts/`, `e2e-db-reset: ## Suite-level
 * reset …` runs a reset script, and `e2e-build-web:` delegates with `$(MAKE) -C app`. The up script brings the
 * server's infra up through `make -C go infra-up`, migrates and builds; the down script kills pids and runs
 * `make -C go infra-down`; the reset script truncates and reseeds. The server Makefile has `infra-up` /
 * `infra-down` (`cd .. && docker compose …`).
 *
 * Competing scenario candidates: e2e_env `make e2e-stack-up` and `make e2e-stack-down`; e2e `make e2e-db-reset`.
 * Reviewed: e2e_env `make e2e-stack-up`, and no e2e key (the reset is not a suite).
 */
function scenarioStackShape() {
  return makeWhole({
    'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n',
    Makefile: mk([
      '# Monorepo root Makefile: e2e harness orchestration. Component targets stay in go/ and app/.',
      '',
      '.DEFAULT_GOAL := help',
      '',
      '.PHONY: help',
      'help: ## Print available targets',
      "\t@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = \":.*?## \"}; {printf \"%-22s %s\\n\", $$1, $$2}'",
      '',
      '.PHONY: e2e-stack-up',
      'e2e-stack-up: ## Cold machine -> live e2e stack: infra, migrate, seed, server on :8091',
      '\tbash app/web_e2e/scripts/e2e-stack-up.sh',
      '',
      '.PHONY: e2e-stack-down',
      'e2e-stack-down: ## Tear down the e2e stack (server pids + docker infra); idempotent',
      '\tbash app/web_e2e/scripts/e2e-stack-down.sh',
      '',
      '.PHONY: e2e-db-reset',
      'e2e-db-reset: ## Suite-level reset: truncate + reseed; the server stays up',
      '\tbash app/web_e2e/scripts/db-reset.sh',
      '',
      '.PHONY: e2e-build-web',
      'e2e-build-web: ## Build the web e2e bundle',
      '\t$(MAKE) -C app e2e-build-web',
    ]),
    'app/web_e2e/scripts/e2e-stack-up.sh': [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"',
      'cd "$REPO_ROOT"',
      'make -C go infra-up',
      '(cd go && go run ./cmd/tide-migrate -cmd up)',
      '(cd go && go build -tags dev -o "$RUN_DIR/tide-api" ./cmd/tide-api)',
      '',
    ].join('\n'),
    'app/web_e2e/scripts/e2e-stack-down.sh': [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"',
      'cd "$REPO_ROOT"',
      'for pid in $(cat "$RUN_DIR"/*.pid 2>/dev/null); do',
      '  kill "$pid" 2>/dev/null || true',
      'done',
      'make -C go infra-down',
      '',
    ].join('\n'),
    'app/web_e2e/scripts/db-reset.sh': [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"',
      'cd "$REPO_ROOT"',
      'psql "$DATABASE_URL" -c "TRUNCATE tenants CASCADE"',
      '(cd go && go run ./cmd/seed-tenant --tenant=both)',
      '',
    ].join('\n'),
    'app/web_e2e/package.json': `${JSON.stringify({ name: 'tide-web-e2e', private: true, scripts: { test: 'playwright test' } }, null, 2)}\n`,
    'app/pubspec.yaml': flutterPubspec('tide_app'),
    'app/lib/main.dart': DART_MAIN,
    'app/Makefile': mk([
      'e2e-build-web:',
      '\tflutter build web -t lib/main_e2e.dart --dart-define=API_URL=http://localhost:8091',
    ]),
    'go/go.mod': goMod('tidewell'),
    'go/main.go': GO_MAIN,
    'go/cmd/tide-api/main.go': GO_MAIN,
    'go/Makefile': mk([
      'build:',
      '\tgo build -o bin/tide-api ./cmd/tide-api',
      '',
      'test:',
      '\tgo test ./...',
      '',
      'infra-up:',
      '\tcd .. && docker compose up -d',
      '',
      'infra-down:',
      '\tcd .. && docker compose down',
    ]),
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  server:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - run: go build ./...',
      '      - run: go test ./... -count=1',
    ]),
  }, { modes: { 'app/web_e2e/scripts/e2e-stack-up.sh': 0o755, 'app/web_e2e/scripts/e2e-stack-down.sh': 0o755, 'app/web_e2e/scripts/db-reset.sh': 0o755 } });
}

// ─── key-named target equal to the tier default (aoedge.lint row) ─────────────

/**
 * declaredDefaultTargetShape() — a Go root whose Makefile `lint:` target runs exactly the go tier's lint
 * default (`go vet ./...`), with a comment saying a heavier linter is not wired up yet. CI runs the same
 * `go vet ./...` line, annotated as identical to `make lint`. Build has a shipping target and a local
 * variant; `test:` runs `go test ./...` (not the tier's `-race` default); `fmt:` rewrites in place.
 *
 * Competing lint candidates: the runner target `make lint` (body = the tier default) and the raw CI line
 * (= the tier default). Reviewed: lint `make lint` (the repo's declared entry point), build
 * `make build-release`, test `make test`, format inherited with apply `make fmt`.
 */
function declaredDefaultTargetShape() {
  return makeWhole({
    'go.mod': goMod('lanternd'),
    'main.go': GO_MAIN,
    'cmd/lanternd/main.go': GO_MAIN,
    Makefile: mk([
      'LDFLAGS := -s -w',
      '',
      '.PHONY: build-release build-local test test-race lint fmt clean',
      '',
      '# build-release: the shipping binary (static, trimmed).',
      'build-release:',
      '\tCGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o lanternd ./cmd/lanternd',
      '',
      '# build-local: the same binary for a laptop.',
      'build-local:',
      '\tgo build -ldflags="$(LDFLAGS)" -o lanternd ./cmd/lanternd',
      '',
      'test:',
      '\tgo test ./...',
      '',
      'test-race:',
      '\tgo test -race ./...',
      '',
      '# lint: static analysis via go vet.',
      '# A heavier linter is not wired up yet; add it here when it is.',
      'lint:',
      '\tgo vet ./...',
      '',
      'fmt:',
      '\tgofmt -s -w .',
      '',
      'clean:',
      '\trm -f lanternd',
    ]),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    name: build / vet / test',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Check out',
      '        uses: actions/checkout@v4',
      '      - name: Set up Go',
      '        uses: actions/setup-go@v5',
      '      - name: go build ./...',
      '        run: go build ./...',
      '      - name: go vet ./...',
      '        # Same as `make lint`: the Makefile lint target is only go vet.',
      '        run: go vet ./...',
      '      - name: go test ./...',
      '        # Same as `make test`.',
      '        run: go test ./...',
    ]),
  });
}

// ─── runner-less component with CI variants (aocore lint, audit, build, test rows) ─

/**
 * ciVariantComponentShape() — a `general` root with no task runner anywhere: components `console/` and
 * `site/` (flutter), `go/` (go, the primary) and `sandbox/edge/` (go). Workflows sort flutter, go-nightly,
 * go, site. In go.yml (workflow default cwd `go`):
 *   - lint job: `go generate ./internal/spec/...`, `go vet ./...`, then a pinned
 *     `uses: golangci/golangci-lint-action@<sha> # v9.x` whose `with:` sets version, install-mode,
 *     `working-directory: go` and only-new-issues (`go/.golangci.yml` exists);
 *   - vuln-scan job: `go install …/govulncheck@<v>`, then `run: ../scripts/vuln-gate.sh`, a wrapper whose
 *     body runs `govulncheck ./... > "$OUT" 2>&1` and then applies an allowlist;
 *   - unit-test and build jobs; the build job builds one binary (`go build ./cmd/harbor-api`);
 *   - a db-tests job running `./scripts/db-backed-tests.sh` (in go/), whose body builds two more single
 *     binaries to /tmp (`cmd/migrate`, `cmd/seed`), probes docker and runs `-run`-scoped tests.
 * flutter.yml's e2e job (step cwd `go`) builds the api to /tmp to serve the browser tests. go-nightly.yml,
 * which sorts before go.yml, runs a dev-tagged variant build, e2e and `-run` lanes, fuzz lanes, a per-package
 * coverage loop, and the heavy coverage lane, whose step first assigns `SKIP="$(../scripts/print-skips.sh …)"`
 * and then runs `go test -short -p 1 ./... -race -skip "${SKIP}" …` (43-13). Every CI build is a single binary.
 *
 * Reviewed: lint `golangci-lint run ./...` and audit `govulncheck ./...`, both cwd `go`; codegen the CI
 * generate line; build the go tier default `go build ./...`; test the light unit-test lane of go.yml,
 * verbatim (all cwd go). 43-12 asserts lint and audit; 43-13 adds build (the single-binary variants are
 * narrow notes) and test (the heavy lane is a runtime_var note).
 */
function ciVariantComponentShape() {
  const setup = [
    '      - uses: actions/checkout@0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c # v4.2.0',
    '      - uses: actions/setup-go@a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 # v5.4.0',
    '        with:',
    '          go-version: "1.24.2"',
    '          cache-dependency-path: go/go.sum',
    '      - run: go generate ./internal/spec/...',
  ];
  return makeWhole({
    'README.md': '# harborline\n',
    'console/pubspec.yaml': flutterPubspec('harbor_console'),
    'console/lib/main.dart': DART_MAIN,
    'site/pubspec.yaml': flutterPubspec('harbor_site'),
    'site/lib/main.dart': DART_MAIN,
    'go/go.mod': goMod('harborline'),
    'go/main.go': GO_MAIN,
    'go/cmd/harbor-api/main.go': GO_MAIN,
    'go/cmd/migrate/main.go': GO_MAIN,
    'go/cmd/seed/main.go': GO_MAIN,
    'go/scripts/db-backed-tests.sh': [
      '#!/usr/bin/env bash',
      '# Builds the migrate and seed binaries (compiled, so their exit codes survive), migrates and seeds a',
      '# scratch database, then runs each -run-scoped target and fails on any SKIP.',
      'set -euo pipefail',
      'if ! docker info >/dev/null 2>&1; then',
      '  echo "db-backed-tests: docker is not reachable" >&2',
      '  exit 2',
      'fi',
      'go build -o /tmp/bin-migrate ./cmd/migrate',
      'go build -o /tmp/bin-seed ./cmd/seed',
      '/tmp/bin-migrate',
      '/tmp/bin-seed --tenant demo',
      'while read -r pkg expr; do',
      '  go test "$pkg" -run "$expr" -count=1 -v | tee "/tmp/${pkg//\\//_}.log"',
      '  if grep -q -- "--- SKIP" "/tmp/${pkg//\\//_}.log"; then exit 1; fi',
      'done < scripts/db-targets.txt',
      '',
    ].join('\n'),
    'go/scripts/db-targets.txt': './internal/store TestStore\n./internal/tenant TestProvision\n',
    'go/coverage-floors.txt': 'internal/store=70\ninternal/tenant=60\n',
    'scripts/print-skips.sh': [
      '#!/bin/sh',
      '# Prints a -skip regex for the named test classes (one class per --class).',
      'classes=""',
      'while [ $# -gt 0 ]; do classes="$classes $2"; shift 2; done',
      'out=""',
      'for c in $classes; do',
      '  case "$c" in',
      '    shared-db) out="${out}|TestTenantIsolation|TestAuditTrail" ;;',
      '    wall-clock) out="${out}|TestRollupWindow" ;;',
      '  esac',
      'done',
      'printf "%s\\n" "^(${out#|})$"',
      '',
    ].join('\n'),
    'go/internal/spec/spec.go': 'package spec\n\n//go:generate go run ./gen\n',
    'go/.golangci.yml': 'version: "2"\nlinters:\n  default: standard\n',
    'sandbox/edge/go.mod': goMod('harborline-edge'),
    'sandbox/edge/main.go': GO_MAIN,
    'scripts/vuln-gate.sh': [
      '#!/usr/bin/env bash',
      '# govulncheck with a short allowlist of advisories that have no fix yet.',
      'set -uo pipefail',
      'ALLOW=(',
      '  GO-2099-0001',
      ')',
      'OUT="$(mktemp)"',
      "trap 'rm -f \"$OUT\"' EXIT",
      '',
      'govulncheck ./... > "$OUT" 2>&1',
      'rc=$?',
      'cat "$OUT"',
      'if [[ $rc -eq 0 ]]; then',
      '  echo "vuln-gate: clean."',
      '  exit 0',
      'fi',
      'fail=0',
      'for id in $(grep -oE "GO-[0-9]+-[0-9]+" "$OUT" | sort -u); do',
      '  case " ${ALLOW[*]} " in',
      '    *" $id "*) echo "vuln-gate: allowed $id" ;;',
      '    *) echo "vuln-gate: $id is not allowlisted"; fail=1 ;;',
      '  esac',
      'done',
      'exit "$fail"',
      '',
    ].join('\n'),
    '.github/workflows/flutter.yml': wf([
      'name: flutter',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: console',
      'jobs:',
      '  analyze:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze --fatal-infos',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter test --platform chrome',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: Build and start the api on :4000',
      '        working-directory: go',
      '        run: |',
      '          go build -o /tmp/harbor-api ./cmd/harbor-api',
      '          /tmp/harbor-api &',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter test integration_test --platform chrome',
    ]),
    '.github/workflows/go-nightly.yml': wf([
      'name: go nightly',
      'on:',
      '  schedule:',
      "    - cron: '0 3 * * *'",
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  e2e:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go test ./internal/e2e/... -v -race -timeout 30m',
      "      - run: go test . -v -timeout 12m -run 'TestRoundTrip'",
      '  fuzz:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go test -fuzz=FuzzParseRoute -fuzztime=60s ./internal/route/',
      '      - run: go test -fuzz=FuzzDecode -fuzztime=60s ./pkg/codec/',
      '  coverage:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - name: Unit coverage (full tree, -short)',
      '        run: |',
      '          # Tests that cannot share one database are skipped here; the db-tests lane runs them alone.',
      '          SKIP="$(../scripts/print-skips.sh --class shared-db --class wall-clock)"',
      '          echo "skipping: ${SKIP}"',
      '          # -p 1: the packages share one database, so they run one at a time.',
      '          go test -short -p 1 ./... -race -skip "${SKIP}" -coverprofile=unit.out -timeout 35m',
      '      - name: Per-package coverage floors',
      '        run: |',
      '          while read -r line; do',
      '            PKG="${line%%=*}"',
      '            PROF="/tmp/cov-$(echo "$PKG" | tr \'/\' \'_\').out"',
      '            go test -short -coverprofile="$PROF" "./${PKG}/..." >/dev/null 2>&1 || true',
      '          done < coverage-floors.txt',
      '  dev-binary:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go build -tags dev -o /tmp/harbor-dev ./cmd/harbor-api',
    ]),
    '.github/workflows/go.yml': wf([
      'name: go',
      'on: [pull_request]',
      'defaults:',
      '  run:',
      '    working-directory: go',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go vet ./...',
      '      # golangci-lint v2 reads go/.golangci.yml. The action runs at the repo root unless told',
      '      # otherwise, so it gets the module dir explicitly.',
      '      - uses: golangci/golangci-lint-action@9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c # v9.1.0',
      '        with:',
      '          version: v2.5.0',
      '          install-mode: goinstall',
      '          working-directory: go',
      '          # pre-existing findings are tracked separately; only new ones fail a PR',
      '          only-new-issues: true',
      '  vuln-scan:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go install golang.org/x/vuln/cmd/govulncheck@v1.1.4',
      '      # Gated rather than bare: advisories with no fix yet are allowlisted, and expire.',
      '      - run: ../scripts/vuln-gate.sh',
      '  unit-test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go test -short ./... -race -coverprofile=coverage.out -timeout 5m',
      '      - run: go test -run=Fuzz ./internal/route/... ./pkg/codec/... -timeout 3m',
      '  db-tests:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - name: DB-backed tests (migrate, seed, run, zero-skip guard)',
      '        run: ./scripts/db-backed-tests.sh',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      ...setup,
      '      - run: go build ./cmd/harbor-api',
    ]),
    '.github/workflows/site.yml': wf([
      'name: site',
      'on: [pull_request]',
      'jobs:',
      '  analyze:',
      '    runs-on: ubuntu-latest',
      '    defaults:',
      '      run:',
      '        working-directory: site',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: subosito/flutter-action@v2',
      '      - run: flutter pub get',
      '      - run: flutter analyze --fatal-infos',
    ]),
  }, { modes: { 'scripts/vuln-gate.sh': 0o755, 'go/scripts/db-backed-tests.sh': 0o755, 'scripts/print-skips.sh': 0o755 } });
}

// ─── a gate script that also tests itself (TRD 71-01, SDR-09) ─────────────────

/**
 * selfTestGateShape() — a Go root (tier root, no task runner) whose CI runs one vulnerability gate script
 * twice: first `bash scripts/vuln-gate.sh --self-test` (the script's own fixtures check, no scanner), then,
 * in the next step after `go install …/govulncheck@latest`, `bash scripts/vuln-gate.sh` (the real gate).
 * The script's body runs `govulncheck -format json ./... > "$TMP"` and a `jq` filter only on the gate path.
 *
 * Competing audit candidates: the self-test step and the gate step, same entry point, same source (ci),
 * same cwd and rank. Reviewed: audit is the gate step (`bash scripts/vuln-gate.sh`), the self-test is a
 * `self_test` note. Source order alone would pick the self-test, which scans nothing.
 */
function selfTestGateShape() {
  return makeWhole({
    'go.mod': goMod('ledgerline'),
    'main.go': GO_MAIN,
    'scripts/vuln-gate.sh': [
      '#!/usr/bin/env bash',
      '# Vulnerability gate. --self-test checks the filter against canned findings and scans nothing.',
      'set -uo pipefail',
      'TMP="$(mktemp)"',
      "trap 'rm -f \"$TMP\"' EXIT",
      '',
      'self_test() {',
      '  printf \'%s\\n\' \'{"finding":{"osv":"GO-2099-0002"}}\' > "$TMP"',
      '  if [ "$(jq -r \'.finding.osv\' "$TMP")" != "GO-2099-0002" ]; then',
      '    echo "vuln-gate: self-test failed" >&2',
      '    exit 1',
      '  fi',
      '  echo "vuln-gate: self-test ok"',
      '}',
      '',
      'gate() {',
      '  govulncheck -format json ./... > "$TMP"',
      '  if jq -e \'select(.finding != null)\' "$TMP" > /dev/null; then',
      '    echo "vuln-gate: findings reported" >&2',
      '    exit 1',
      '  fi',
      '  echo "vuln-gate: clean"',
      '}',
      '',
      'case "${1:-}" in',
      '  --self-test) self_test ;;',
      '  "") gate ;;',
      '  *) echo "unknown argument" >&2; exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
    '.github/workflows/ci.yml': wf([
      'name: ci',
      'on: [pull_request]',
      'jobs:',
      '  vulnerabilities:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-go@v5',
      '      - name: vuln gate self-test',
      '        run: bash scripts/vuln-gate.sh --self-test',
      '      - name: vuln gate',
      '        run: |',
      '          go install example.invalid/vuln/cmd/govulncheck@latest',
      '          bash scripts/vuln-gate.sh',
    ]),
  }, { modes: { 'scripts/vuln-gate.sh': 0o755 } });
}

// ─── lint targets that add linters (TRD 71-01, SDR-09) ────────────────────────

/**
 * protoLintTargetShape() — a Go root with a `buf.yaml` module whose Makefile `lint:` target runs the go
 * tier's lint default (`go vet ./...`) and then `buf lint`, unconditionally. `build:` and `test:` run the
 * go tier's own defaults (`go build ./...`, `go test -race ./...`) under names that restate their command
 * words, so they stay inherited. No CI.
 *
 * Competing lint candidates: the runner target `make lint` (body = the tier default plus an unconditional
 * linter of another tool). Reviewed: lint `make lint`, so an agent that runs the entry point also lints
 * the proto module; the draft carries a `declared_linters` info note.
 */
function protoLintTargetShape() {
  return makeWhole({
    'go.mod': goMod('ledgerline'),
    'main.go': GO_MAIN,
    'buf.yaml': 'version: v2\nmodules:\n  - path: proto\n',
    'proto/ledger/v1/ledger.proto': 'syntax = "proto3";\npackage ledger.v1;\n',
    Makefile: mk([
      '.PHONY: build test lint',
      '',
      'build:',
      '\tgo build ./...',
      '',
      'test:',
      '\tgo test -race ./...',
      '',
      'lint:',
      '\tgo vet ./...',
      '\tbuf lint',
    ]),
  });
}

/**
 * guardedLinterTargetShape() — a Go root whose Makefile `lint:` target runs `go vet ./...` and then a
 * guarded `golangci-lint run` behind `|| echo …` (the linter is optional by the Makefile's own design: it
 * prints that it only ran go vet when the linter is missing). No CI.
 *
 * Reviewed: lint stays inherited at the tier default; an optional extra line does not make the target the
 * entry point.
 */
function guardedLinterTargetShape() {
  return makeWhole({
    'go.mod': goMod('ledgerline'),
    'main.go': GO_MAIN,
    Makefile: mk([
      '.PHONY: test lint',
      '',
      'test:',
      '\tgo test -race ./...',
      '',
      'lint:',
      '\tgo vet ./...',
      '\t@command -v golangci-lint >/dev/null 2>&1 && golangci-lint run || echo "golangci-lint not installed; ran go vet only"',
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
  imageBuildRootShape: {
    build: imageBuildRootShape,
    tools: tools(),
    expect: {
      extends: 'general',
      components: [{ path: 'server/', profile: 'go' }, { path: 'ui/', profile: 'flutter' }],
      commands: {
        build: { run: 'make build', cwd: 'server' },
        test: { run: 'make test', cwd: 'server' },
        lint: { run: 'go vet ./...', cwd: 'server' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
  },
  workspaceRunnerShape: {
    build: workspaceRunnerShape,
    tools: tools(),
    expect: {
      extends: 'general',
      components: [
        { path: 'api-dart/', profile: 'dart' },
        { path: 'doc-model/', profile: 'dart' },
        { path: 'docs-site/', profile: 'go' },
        { path: 'ui-kit/', profile: 'flutter' },
        { path: 'web-kit/', profile: 'go' },
      ],
      commands: {
        lint: { run: 'just lint' },
        test: { run: 'just test' },
        build: { run: 'just bundle-gallery' },
        deps: { run: 'just setup' },
        codegen: { run: 'just generate' },
        format: { run: 'discover', apply: 'just fmt' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteTags: { present: ['root_workspace'], absent: ['primary_component'] },
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
  mixedAggregateCodegenShape: {
    build: mixedAggregateCodegenShape,
    tools: tools('buf', 'sqlc'),
    expect: {
      extends: 'go',
      components: [{ path: 'clients/desk/', profile: 'flutter' }],
      commands: {
        build: { run: 'make build' },
        test: { run: 'make test' },
        codegen: { run: 'make proto' },
        deps: { run: 'make gen-sdk' },
        // TRD 71-01: the lint target runs go vet and buf lint, so it is the lint entry point (SDR-09)
        lint: { run: 'make lint' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteStatuses: { present: ['mixed_aggregate'], absent: [] },
  },
  bootstrapTaskShape: {
    build: bootstrapTaskShape,
    tools: tools('npm', 'npx'),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        deps: { run: 'npm ci --no-audit --no-fund' },
        build: { run: 'task build:backend' },
        typecheck: { run: 'task check:ts' },
        test: { run: 'go test ./...' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteStatuses: { present: ['mixed_aggregate'], absent: [] },
  },
  partialDriftCheckShape: {
    build: partialDriftCheckShape,
    tools: tools('buf', 'templ', 'tailwindcss'),
    expect: {
      extends: 'general',
      components: [{ path: 'app/', profile: 'flutter' }, { path: 'go/', profile: 'go' }],
      commands: {
        build: { run: 'make build', cwd: 'go' },
        test: { run: 'make test', cwd: 'go' },
        codegen: { run: 'make generate', cwd: 'go' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteStatuses: { present: ['partial_check'], absent: [] },
  },
  scenarioStackShape: {
    build: scenarioStackShape,
    tools: tools('bash', 'docker', 'psql'),
    expect: {
      extends: 'general',
      components: [{ path: 'app/', profile: 'flutter' }, { path: 'go/', profile: 'go' }],
      commands: {
        build: { run: 'make build', cwd: 'go' },
        test: { run: 'make test', cwd: 'go' },
        e2e_env: { run: 'make e2e-stack-up' },
      },
    },
    absent: ['e2e'],
    extraAllowed: [],
    noEvidence: [],
    noteStatuses: { present: ['env_teardown', 'env_reset'], absent: [] },
  },
  declaredDefaultTargetShape: {
    build: declaredDefaultTargetShape,
    tools: tools(),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        build: { run: 'make build-release' },
        test: { run: 'make test' },
        lint: { run: 'make lint' },
        format: { run: 'test -z "$(gofmt -l .)"', apply: 'make fmt' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
  },
  ciVariantComponentShape: {
    build: ciVariantComponentShape,
    tools: tools('bash'),
    expect: {
      extends: 'general',
      components: [
        { path: 'console/', profile: 'flutter' },
        { path: 'go/', profile: 'go' },
        { path: 'sandbox/edge/', profile: 'go' },
        { path: 'site/', profile: 'flutter' },
      ],
      commands: {
        codegen: { run: 'go generate ./internal/spec/...', cwd: 'go' },
        lint: { run: 'golangci-lint run ./...', cwd: 'go' },
        audit: { run: 'govulncheck ./...', cwd: 'go' },
        build: { run: 'go build ./...', cwd: 'go' },
        test: { run: 'go test -short ./... -race -coverprofile=coverage.out -timeout 5m', cwd: 'go' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    // wrapper: the vuln-gate script; alternate: the `go vet ./...` line the dedicated linter displaces;
    // narrow: the single-binary CI builds and the e2e, -run and fuzz test lanes; runtime_var: the heavy lane.
    noteStatuses: { present: ['wrapper', 'alternate', 'narrow', 'runtime_var'], absent: [] },
    // narrow_fallback: every CI build is a single binary, so build is the go tier default (43-13).
    noteTags: { present: ['narrow_fallback'], absent: [] },
  },
  // TRD 71-01 (SDR-09): the gate script runs once with --self-test and once without; the gate is the audit.
  selfTestGateShape: {
    build: selfTestGateShape,
    tools: tools('bash', 'jq'),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        audit: { run: 'bash scripts/vuln-gate.sh' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteStatuses: { present: ['self_test'], absent: [] },
  },
  // TRD 71-01 (SDR-09): `lint:` runs go vet and then buf lint, unconditionally: it is the lint entry point.
  // `test:` and `build:` restate their command words and stay inherited.
  protoLintTargetShape: {
    build: protoLintTargetShape,
    tools: tools('buf'),
    expect: {
      extends: 'go',
      components: [],
      commands: {
        lint: { run: 'make lint' },
      },
    },
    absent: [],
    extraAllowed: [],
    noEvidence: [],
    noteTags: { present: ['declared_linters'], absent: [] },
  },
  // TRD 71-01 (SDR-09): the extra golangci-lint line is optional by the target's own `|| echo`: inherited.
  guardedLinterTargetShape: {
    build: guardedLinterTargetShape,
    tools: tools(),
    expect: {
      extends: 'go',
      components: [],
      commands: {},
    },
    absent: ['lint'],
    extraAllowed: [],
    noEvidence: [],
    noteTags: { present: [], absent: ['declared_linters'] },
  },
});

module.exports = {
  REALSHAPE,
  declaredDefaultTargetShape,
  ciVariantComponentShape,
  mixedAggregateCodegenShape,
  bootstrapTaskShape,
  partialDriftCheckShape,
  scenarioStackShape,
  captureDiffCheckShape,
  snapshotVerifyShape,
  workflowEnvChartShape,
  crossStackPrimaryShape,
  toolDirectPrimaryShape,
  imageBuildRootShape,
  workspaceRunnerShape,
  selfTestGateShape,
  protoLintTargetShape,
  guardedLinterTargetShape,
};
