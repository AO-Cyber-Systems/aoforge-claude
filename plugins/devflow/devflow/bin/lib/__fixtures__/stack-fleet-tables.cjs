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
// evidence), aodex.build, eden-libs.test, eden-libs.codegen, eden-libs.format (tiered placement), eden-libs.build
// (workspace root) and, out
// of scope but closed by the same rules, politihub.test and politihub.build. The tiered placement also
// closed eden-biz.e2e_env, which 43-11 had claimed (root runner recipes are root candidates wherever
// their body runs).
// 43-11 removed justinforme.codegen and smartWellness.codegen (a mixed aggregate never fills a key a pure
// candidate fills) and eden-biz.codegen (a drift check of one leg of the generator is a partial_check), and
// re-tagged ao-terminal.deps as a flag-only residual for the 43-15 decision.
// 43-12 removed aoedge.lint (a task-runner target named for the key is the declared entry point, even when
// its body is the tier default), aocore.audit (a script not named for the key that runs the tier
// default reduces to that default) and aocore.lint (a lint action with a fixed CLI equivalent is a
// candidate, and a dedicated linter outranks the default within a source).
// 43-13 removed aocore.build (single-binary CI build variants of several packages are narrow; the tier default
// applies with the primary component's cwd) and re-tagged aocore.test as a flag-only residual for the 43-15
// decision (a lane expanding a variable its step assigns at run time ranks after a plain one, so the light CI
// lane fills test, verbatim).
const KNOWN_DRIFT = {
  aocore: [
    {
      keys: ['test'],
      closes: '43-15',
      residual: 'flag-only: flag order and -coverprofile differ from the CI lane; no general rule derives the hand-edited value',
      reason: 'test: draft `go test -short ./... -race -coverprofile=coverage.out -timeout 5m (cwd go)` vs committed '
        + '`go test -short -race ./... -timeout 5m (cwd go)` (seeded as the heavy `-p 1 … -skip "${SKIP}" …` lane; 43-13 '
        + 'ranked the runtime-parameterised lane after the plain one)',
    },
  ],
  'ao-terminal': [
    {
      keys: ['deps'],
      closes: '43-15',
      residual: 'flag-only: CI adds --no-audit --no-fund; the reviewed value dropped them by hand',
      reason: 'deps: draft `npm ci --no-audit --no-fund` vs committed `npm ci` (seeded as `task init`; 43-11 made the '
        + 'one-shot bootstrap a mixed_aggregate note, so the CI install line fills deps, verbatim)',
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
