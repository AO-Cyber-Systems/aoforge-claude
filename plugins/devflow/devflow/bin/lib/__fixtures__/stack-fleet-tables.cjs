'use strict';

// stack-fleet-tables.cjs — the tables behind the real-fleet drift harness (TRD 43-08).
//
// stack-drafter-fleet.test.cjs redrafts every fleet repo (`df-tools --cwd <repo> stack init`, no
// --write) and compares the draft with the repo's committed `.planning/STACK.md` in the 43-07 scope
// (stack-drift-compare.cjs). Three tables decide what that comparison may tolerate:
//
//   FLEET        the 33 repos of the 43-07 run plan, all under the fleet root (default ~/dev).
//   ACCEPTED     differences a USER accepted. It grows only by user decision (the 43-15 checkpoint)
//                and is never widened to make the harness green. The accepted HAND_ONLY keys are not
//                listed here: the harness imports them from stack-golden-fixtures.cjs (HAND_ONLY).
//   KNOWN_DRIFT  today's conflict rows, a RATCHET. The harness fails on any conflict outside ACCEPTED
//                and KNOWN_DRIFT, and fails when a KNOWN_DRIFT key no longer conflicts ("remove it").
//                It only shrinks: the TRD named in `closes` removes the rows it closes. The one
//                exception is a TRD that re-tags an entry as a residual (`residual: '<why no general
//                rule closes it>'`) and records the new draft value in `reason`.
//
// KNOWN_DRIFT is { <repo>: [ { keys, closes, reason, residual? } ] }: one entry per (repo, TRD that
// closes it), so a repo whose rows are closed by different TRDs has several entries.
//   keys      the conflict row keys (`extends`, `components` and command keys, in the draft's spelling)
//   closes    '43-NN' (the TRD expected to remove it) or 'out-of-scope' (recorded, not targeted)
//   reason    what the draft says against what the committed file says, as seeded on 2026-10-03
//
// No fleet repo's file body is stored here beyond the one-line command values in `reason`.

const FLEET = [
  'ao-terminal', 'aocore', 'aodex', 'aoedge', 'aofamily', 'aoid', 'aoinference', 'AOSignal', 'aostudio',
  'devcluster', 'devflow', 'devflow-test', 'devflowops', 'dfip', 'eden-biz', 'eden-circle', 'eden-libs',
  'eden-platform-go', 'eden-press', 'eden-ui-flutter', 'EdenDocs', 'github-enterprise-migration',
  'justinforme', 'navigators', 'opsCluster', 'politihub', 'qrCodeBuilder', 'quanta-local',
  'recycling-oracle', 'smartWellness', 'torrentConsole', 'trades', 'videoArchive',
];

const ACCEPTED = {
  devcluster: {
    keys: ['lint', 'test'],
    reason: 'user decision 2026-10-03, remedy (c): no CI workflow; selftest needs yq and a gitops checkout',
  },
};

// Seeded 2026-10-03 from a real run of the harness (HEADs as of that run), then compared with the 12
// conflict repos of 43-ROLLOUT.md `## Dry-run drift` (see the 43-08 SUMMARY). Each reason reads
// "key: draft `X` vs committed `Y`".
//
// 43-09 removed devflowops.format, devflowops.tidy, aodex.codegen and aocore.lint_helm (captured and
// snapshot drift checks, workflow env literals, version probes).
// 43-10 removed eden-biz.build, eden-biz.test (the primary component is chosen on build/test/lint
// evidence), aodex.build (tiered placement) and, out of scope but closed by the same rules, politihub.test
// and politihub.build.
const KNOWN_DRIFT = {
  aocore: [
    {
      keys: ['lint', 'audit'],
      closes: '43-12',
      reason: 'lint: draft `go vet ./... (cwd go)` vs committed `golangci-lint run ./... (cwd go)`; '
        + 'audit: draft `../scripts/govulncheck-gate.sh (cwd go)` vs committed `govulncheck ./... (cwd go)`',
    },
    {
      keys: ['build', 'test'],
      closes: '43-13',
      reason: 'build: draft `go build -tags dev -o /tmp/dev-edge ./cmd/dev-edge (cwd go)` vs committed `go build ./... (cwd go)`; '
        + 'test: draft `go test -short -p 1 ./... -race -skip "${SKIP}" -coverprofile=unit.out -timeout 35m (cwd go)` '
        + 'vs committed `go test -short -race ./... -timeout 5m (cwd go)`',
    },
  ],
  'eden-biz': [
    {
      keys: ['codegen', 'e2e_env'],
      closes: '43-11',
      reason: 'codegen: draft `make buf-generate (cwd go)` vs committed `make generate (cwd go)`; '
        + 'e2e_env: draft `make e2e-stack-down` vs committed `make e2e-stack-up`',
    },
  ],
  'eden-libs': [
    {
      keys: ['build', 'test', 'codegen', 'format'],
      closes: '43-10',
      reason: 'build: draft `just package-docs` vs committed `just build-flutter-explorer`; '
        + 'test: draft `dart test (cwd eden-platform-api-dart)` vs committed `just test`; '
        + 'codegen: draft `discover` vs committed `just generate`; '
        + 'format: draft `discover` vs committed `discover (apply: just fmt)`',
    },
  ],
  justinforme: [
    {
      keys: ['codegen'],
      closes: '43-11',
      reason: 'codegen: draft `make generate` vs committed `make proto`',
    },
  ],
  smartWellness: [
    {
      keys: ['codegen'],
      closes: '43-11',
      reason: 'codegen: draft `make generate` vs committed `make proto`',
    },
  ],
  'ao-terminal': [
    {
      keys: ['deps'],
      closes: '43-11',
      reason: 'deps: draft `task init` vs committed `npm ci`',
    },
  ],
  aoedge: [
    {
      keys: ['lint'],
      closes: '43-12',
      reason: 'lint: draft `go vet ./...` vs committed `make lint`',
    },
  ],
  aoinference: [
    {
      keys: ['extends', 'components', 'audit', 'build', 'codegen', 'fix', 'format', 'tidy'],
      closes: '43-14',
      reason: 'stale committed file (go root under control-plane/): extends: draft `general` vs committed `go`; '
        + 'components: draft `control-plane/|go` vs committed none; audit, fix, format: draft `discover`; '
        + 'build: draft `make build (cwd control-plane)` vs committed `go build ./... (cwd control-plane)`; '
        + 'codegen: draft `make drift-check (apply: make generate) (cwd control-plane)` vs committed `go generate ./... (cwd control-plane)`; '
        + 'tidy: draft has none vs committed `go mod tidy -diff (apply: go mod tidy) (cwd control-plane)`',
    },
  ],
  opsCluster: [
    {
      keys: ['extends', 'components', 'audit', 'codegen', 'fix', 'format', 'tidy'],
      closes: '43-14',
      reason: 'stale committed file (go root under control-plane/): extends: draft `general` vs committed `go`; '
        + 'components: draft `control-plane/|go` vs committed none; audit, codegen, fix, format: draft `discover`; '
        + 'tidy: draft has none vs committed `go mod tidy -diff (apply: go mod tidy) (cwd control-plane)`',
    },
  ],
};

module.exports = { FLEET, ACCEPTED, KNOWN_DRIFT };
