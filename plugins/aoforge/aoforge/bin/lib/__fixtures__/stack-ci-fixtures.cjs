'use strict';

// Hand-built GitHub Actions workflow builders for stack-ci / stack-shell / stack-classify tests
// (TRD 42-03). Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated
// test data. Every YAML body here is INVENTED (`svc/`, `app/`, `chart/`) and only MODELLED on a
// failure shape observed in real fleet workflows — no workflow text is copied from any real repo.
//
// One builder per shape. Each returns an absolute temp repo root containing
// `.github/workflows/<file>`; call `cleanup(root)` when done. Nothing here asserts.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * makeWorkflowRepo({ workflows }) -> absolute repo root
 *
 * `workflows` maps a file NAME (`ci.yml`, `release.yaml`) to its text; each is written to
 * `<root>/.github/workflows/<name>`. `files` writes any other repo file at `<root>/<relPath>`.
 */
function makeWorkflowRepo({ workflows = {}, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-ci-'));
  const dir = path.join(root, '.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(workflows)) {
    fs.writeFileSync(path.join(dir, name), text, 'utf-8');
  }
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

/** cleanup(...dirs) — best-effort recursive removal of temp roots. */
function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

// ─── Workflow text (exported so unit tests can feed _parseWorkflowText directly) ───

const CONTINUATION_YML = `name: security
on: [push]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Static analysis
        run: |
          gosec -exclude=G304 \\
            -fmt sarif ./...
`;

const FLAG_FRAGMENT_YML = `name: release
on: [workflow_dispatch]
jobs:
  ios:
    runs-on: macos-latest
    steps:
      - name: Build iOS
        run: |
          flutter build ipa \\
            --build-number="\${{ inputs.buildNumber }}"
`;

const COMMENT_AS_TEST_YML = `name: ci
on: [push]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - name: Unit tests
        run: |
          # run the tests
          go test ./...
`;

const ECHO_ONLY_YML = `name: publish
on: [push]
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Announce
        run: echo "Published svc 1.2.3"
      - name: Mixed
        run: |
          echo x
          make build
`;

const CONTROL_FRAGMENT_YML = `name: preconditions
on: [push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Preconditions
        run: |
          test -f svc/go.mod || {
            echo missing; exit 1
          }
`;

const WORKING_DIR_DEFAULTS_YML = `name: layered
on: [push]
defaults:
  run:
    working-directory: svc
jobs:
  lib:
    runs-on: ubuntu-latest
    steps:
      - name: Vet
        run: go vet ./...
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - name: Unit
        run: npm test
      - name: Chart
        working-directory: chart
        run: helm lint .
`;

const USES_ACTIONS_YML = `name: actions
on: [push]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Lint
        uses: golangci/golangci-lint-action@v6
        with:
          version: latest
`;

const QUOTED_PIPE_YML = `name: quoted
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Patch and test
        run: sed -i 's|a|b|' svc/version.txt && go test ./...
`;

const MIXED_TOOLS_YML = `name: gates
on: [push]
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - name: SAST
        run: gosec ./...
      - name: Vulnerabilities
        run: govulncheck ./...
      - name: Chart lint
        run: helm lint chart/
      - name: End to end
        run: npx playwright test
      - name: Vet
        run: go vet ./...
      - name: Tests
        run: go test -race -coverprofile=c.out ./...
      - name: Analyze
        run: flutter analyze --no-fatal-infos
`;

const SCHEDULE_YML = `name: nightly
on:
  schedule:
    - cron: '0 3 * * 1'
  workflow_dispatch:
jobs:
  vulns:
    runs-on: ubuntu-latest
    steps:
      - name: Vuln scan
        continue-on-error: true
        run: govulncheck ./...
      - name: Strict tests
        run: go test ./...
`;

const NO_SCHEDULE_YML = `name: pr
on:
  pull_request:
    branches: [main]
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: go test ./...
`;

const MALFORMED_YML = `name: broken
on: [push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - name: Good
        run: go vet ./...
   - this: is
  [[[ not : yaml {{{
      - run: "unterminated
      - run: |
          go test ./...
`;

// TRD 42-14 (D1): CI that checks THIS repo out into a subdir (`path: svcrepo`) and a sibling repo
// into `libs/pkg-a` (`repository:` + `path:`). Invented names; the shape is the observed one.
// Block `with:` spelling, with the self-checkout path also used as a job default.
const SELF_CHECKOUT_YML = `name: svc
on: [push]
jobs:
  go:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: svcrepo/go
    steps:
      - uses: actions/checkout@v4
        with:
          path: svcrepo
      - name: Checkout pkg-a
        uses: actions/checkout@v4
        with:
          repository: org/pkg-a
          path: libs/pkg-a
      - name: Unit
        run: go test ./...
      - name: Vet
        working-directory: svcrepo/go
        run: go vet ./...
      - name: Root
        working-directory: svcrepo
        run: make check
      - name: Lib analyze
        working-directory: libs/pkg-a
        run: flutter analyze
  plain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Workspace
        working-directory: \${{ github.workspace }}/go
        run: go build ./...
      - name: Dotted
        working-directory: ./go
        run: go vet ./...
`;

// Flow-map `with: { … }` spelling of the same two checkouts.
const SIBLING_CHECKOUT_YML = `name: flow
on: [push]
jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { path: svcrepo }
      - uses: actions/checkout@v4
        with: { repository: 'org/pkg-a', path: "libs/pkg-a" }
      - name: Unit
        run: go test ./...
        working-directory: svcrepo/go
      - name: Lib analyze
        run: flutter analyze
        working-directory: libs/pkg-a
      - name: Lib test
        run: flutter test
        working-directory: \${{ github.workspace }}/libs/pkg-a/sub
`;

// ─── Builders ────────────────────────────────────────────────────────────────

const GO_TREE = { 'go/go.mod': 'module example.com/svcrepo\n\ngo 1.22\n', 'go/main.go': 'package main\n\nfunc main() {}\n' };

const continuationShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': CONTINUATION_YML } });
const flagFragmentShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': FLAG_FRAGMENT_YML } });
const commentAsTestShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': COMMENT_AS_TEST_YML } });
const echoOnlyShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': ECHO_ONLY_YML } });
const controlFragmentShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': CONTROL_FRAGMENT_YML } });
const workingDirDefaultsShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': WORKING_DIR_DEFAULTS_YML } });
const usesActionsShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': USES_ACTIONS_YML } });
const quotedPipeShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': QUOTED_PIPE_YML } });
const mixedToolsShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': MIXED_TOOLS_YML } });
const scheduleShape = () => makeWorkflowRepo({ workflows: { 'nightly.yml': SCHEDULE_YML, 'pr.yml': NO_SCHEDULE_YML } });
/** Self checkout at `path: svcrepo` + sibling `libs/pkg-a` (block `with:`); the repo holds `go/`. */
const selfCheckoutPathShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': SELF_CHECKOUT_YML }, files: GO_TREE });
/** The same two checkouts in flow-map `with: { … }` spelling; the repo holds `go/`. */
const siblingCheckoutShape = () => makeWorkflowRepo({ workflows: { 'ci.yml': SIBLING_CHECKOUT_YML }, files: GO_TREE });

/** Three files in deliberately unsorted creation order, mixing `.yml` and `.yaml`, plus a non-workflow. */
const multiFileShape = () => makeWorkflowRepo({
  workflows: {
    'zz-last.yml': 'name: z\non: [push]\njobs:\n  z:\n    runs-on: x\n    steps:\n      - run: cargo test\n',
    'aa-first.yaml': 'name: a\non: [push]\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: go vet ./...\n',
    'mm-middle.yml': 'name: m\non: [push]\njobs:\n  m:\n    runs-on: x\n    steps:\n      - run: npm test\n',
    'README.md': '# not a workflow\n',
  },
});

/** One well-formed file and one garbled file; a reader must yield the good one and never throw. */
const malformedShape = () => makeWorkflowRepo({
  workflows: {
    'a-good.yml': 'name: g\non: [push]\njobs:\n  g:\n    runs-on: x\n    steps:\n      - run: go build ./...\n',
    'b-bad.yml': MALFORMED_YML,
  },
});

module.exports = {
  makeWorkflowRepo,
  cleanup,
  continuationShape,
  flagFragmentShape,
  commentAsTestShape,
  echoOnlyShape,
  controlFragmentShape,
  workingDirDefaultsShape,
  usesActionsShape,
  quotedPipeShape,
  mixedToolsShape,
  scheduleShape,
  multiFileShape,
  malformedShape,
  selfCheckoutPathShape,
  siblingCheckoutShape,
  // raw text, for `_parseWorkflowText` unit tests that need no filesystem
  TEXT: {
    CONTINUATION_YML,
    FLAG_FRAGMENT_YML,
    COMMENT_AS_TEST_YML,
    ECHO_ONLY_YML,
    CONTROL_FRAGMENT_YML,
    WORKING_DIR_DEFAULTS_YML,
    USES_ACTIONS_YML,
    QUOTED_PIPE_YML,
    MIXED_TOOLS_YML,
    SCHEDULE_YML,
    NO_SCHEDULE_YML,
    MALFORMED_YML,
    SELF_CHECKOUT_YML,
    SIBLING_CHECKOUT_YML,
  },
};
