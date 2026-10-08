'use strict';

// stack-fleet-tables.cjs — the tables behind the real-fleet drift harness (TRD 43-08, final in 43-15).
//
// stack-drafter-fleet.test.cjs redrafts every fleet repo (`aof-tools --cwd <repo> stack init`, no
// --write) and compares the draft with the repo's committed `.planning/STACK.md` in the 43-07 scope
// (stack-drift-compare.cjs). Two tables decide what that comparison may tolerate. There is no third:
// the harness asserts that this module exports exactly FLEET, ACCEPTED and OPEN.
//
//   FLEET     the 33 repos of the 43-07 run plan, all under the fleet root (default ~/dev).
//   ACCEPTED  differences a USER accepted. It grows only by user decision and is never widened to make
//             the harness green. The accepted HAND_ONLY keys are not listed here: the harness imports
//             them from stack-golden-fixtures.cjs (HAND_ONLY).
//   OPEN      differences nobody has accepted and no drafter rule closes yet. The harness reports each
//             with t.diagnostic and does not fail on it, but it is a RATCHET: an OPEN key that no longer
//             drifts fails with "remove it". OPEN rows keep the objective at gaps_found for the verifier,
//             except a `pending: 'refresh'` row (below).
//             An OPEN entry may carry `pending: 'refresh'` (TRD 71-02): a drafter rule closed the gap and the
//             repo's committed STACK.md predates it. Refreshing that file is a commit in the repo and needs the
//             user, tracked as a todo. Such a row is a follow-up, not a drafter gap: the harness reports it as
//             "refresh pending", and the ratchet still applies. If the rule regresses the row stops drifting
//             and fails with "remove it", and once the repo's file is refreshed the row is removed. Its reason
//             names the draft and the committed value.
//
// Both are { <repo>: [ entry, ... ] }, one entry per (repo, reason):
//   keys     the row keys (`extends`, `components` and command keys, in the draft's spelling)
//   kind     ACCEPTED only: 'conflict' (committed and draft both carry a command and differ) or
//            'more_specific' (the draft only adds a key or resolves a committed `discover`). A row is
//            tolerated only as the kind that was accepted, so an accepted more-specific row cannot
//            hide a later conflict on the same key.
//   reason   what the draft says against what the committed file says, and why it stays
//   decided  ACCEPTED only: the date of the user decision (YYYY-MM-DD)
//   by       ACCEPTED only: 'user'
//   pending  OPEN only, optional: 'refresh' (see OPEN above); no other value
//
// KNOWN_DRIFT (the 43-08 ratchet of today's conflicts) is gone. Its rows were closed by 43-09..43-14
// drafter rules and refreshes, or decided by the user at the 43-15 checkpoint (`accept-all`, 2026-10-03,
// recorded verbatim in 43-ROLLOUT.md `## Gap closure cycle 1`). `aodex.audit` left ACCEPTED in TRD 71-02: TRD 71-01's
// self-test rule now drafts the govulncheck gate step, so the row that excused the self-test pick described a draft
// that no longer exists. The harness guards that rule with a per-repo self-test check, not with this table.
//
// No fleet repo's file body is stored here beyond the one-line command values in `reason`.

const FLEET = [
  'ao-terminal', 'aocore', 'aodex', 'aoedge', 'aofamily', 'aoid', 'aoinference', 'AOSignal', 'aostudio',
  'devcluster', 'devflow', 'devflow-test', 'devflowops', 'dfip', 'eden-biz', 'eden-circle', 'eden-libs',
  'eden-platform-go', 'eden-press', 'eden-ui-flutter', 'EdenDocs', 'github-enterprise-migration',
  'justinforme', 'navigators', 'opsCluster', 'politihub', 'qrCodeBuilder', 'quanta-local',
  'recycling-oracle', 'smartWellness', 'torrentConsole', 'trades', 'videoArchive',
];

const DECIDED = '2026-10-03';

const ACCEPTED = {
  devcluster: [
    {
      keys: ['lint', 'test'],
      kind: 'conflict',
      reason: 'user decision 2026-10-03, remedy (c): no CI workflow; selftest needs yq and a gitops checkout',
      decided: DECIDED,
      by: 'user',
    },
  ],

  // The two flag-only residuals of the 43-15 dry run. The drafter emits CI commands verbatim (42-07), so a
  // reviewed value that was hand-edited cannot be derived by a general rule.
  'ao-terminal': [
    {
      keys: ['deps'],
      kind: 'conflict',
      reason: 'hand-edited flags; drafter stays verbatim: draft `npm ci --no-audit --no-fund` (the only form CI runs) vs committed `npm ci`',
      decided: DECIDED,
      by: 'user',
    },
  ],
  aocore: [
    {
      keys: ['test'],
      kind: 'conflict',
      reason: 'hand-edited flags; drafter stays verbatim: draft `go test -short ./... -race -coverprofile=coverage.out -timeout 5m` '
        + '(cwd go, the verbatim light CI lane) vs committed `go test -short -race ./... -timeout 5m` (cwd go)',
      decided: DECIDED,
      by: 'user',
    },
  ],

  // The more-specific rows: the draft carries a command where the committed file says `discover` (or has no
  // key). Nothing needs fixing to use the draft; the user accepted each as the current state.
  aodex: [
    {
      keys: ['lint'],
      kind: 'more_specific',
      reason: 'draft `golangci-lint run ./...` (cwd go), from the CI golangci action with working-directory go, vs committed `discover`',
      decided: DECIDED,
      by: 'user',
    },
  ],
  aofamily: [
    {
      keys: ['build', 'deps', 'lint'],
      kind: 'more_specific',
      reason: 'the draft takes the primary component ai/go/ (3 of 4 evidence items) of a repo with four Go modules: '
        + '`go build ./...`, `go mod download`, `go vet ./...` (cwd ai/go) vs committed `discover` (build, lint) and no deps; covers one module',
      decided: DECIDED,
      by: 'user',
    },
  ],
  'eden-biz': [
    {
      keys: ['e2e'],
      kind: 'more_specific',
      reason: 'draft-only `discover` (no committed e2e): the draft carries no command',
      decided: DECIDED,
      by: 'user',
    },
  ],
  EdenDocs: [
    {
      keys: ['deps'],
      kind: 'more_specific',
      reason: 'draft-only `discover` (no committed deps): the draft carries no command',
      decided: DECIDED,
      by: 'user',
    },
  ],
  justinforme: [
    {
      keys: ['e2e'],
      kind: 'more_specific',
      reason: 'draft `make smoke-canvass` vs no committed e2e; real but weak: the target is a stub until Obj 9 ships and needs a live stack and Flutter',
      decided: DECIDED,
      by: 'user',
    },
  ],
  politihub: [
    {
      keys: ['lint'],
      kind: 'more_specific',
      reason: 'draft `go vet ./...` (cwd go) vs committed `discover`',
      decided: DECIDED,
      by: 'user',
    },
  ],
};

// The 43-15 decision was accept-all, so nothing was OPEN until TRD 71-01. Its declared-linters rule (SDR-09) drafts
// `make lint` where the Makefile `lint:` target runs `go vet ./...` AND `buf lint`; two fleet repos' committed files
// (reviewed 2026-09-29) inherit `go vet ./...`. The drafter is right and the committed files are stale, so these are
// the two TRD 71-02 rows, both `pending: 'refresh'`. The table keeps its shape for a future gap:
// { <repo>: [ { keys: ['<key>'], reason: '<why no rule closes it yet>' } ] }.
const OPEN = {
  justinforme: [
    {
      keys: ['lint'],
      pending: 'refresh',
      reason: 'TRD 71-01 (SDR-09): the draft `make lint` runs go vet AND buf lint; the committed file (reviewed 2026-09-29) '
        + 'inherits `go vet ./...`. The drafter is right; refreshing the committed file is a commit in justinforme and needs the user',
    },
  ],
  smartWellness: [
    {
      keys: ['lint'],
      pending: 'refresh',
      reason: 'TRD 71-01 (SDR-09): the draft `make lint` runs go vet AND buf lint; the committed file (reviewed 2026-09-29) '
        + 'inherits `go vet ./...`. The drafter is right; refreshing the committed file is a commit in smartWellness and needs the user',
    },
  ],
};

module.exports = { FLEET, ACCEPTED, OPEN };
