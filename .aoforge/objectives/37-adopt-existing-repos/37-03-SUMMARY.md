---
objective: 37-adopt-existing-repos
job: "03"
subsystem: infra
tags: [backups, retention, pruning, cjs, node-test, upgrade]

# Dependency graph
requires:
  - objective: 37-adopt-existing-repos (01)
    provides: adopt fixture factory + repo-state detector conventions (fake HOME, mkdtemp git fixtures)
provides:
  - Pure backup-retention policy (`planPrune`) — keep_min protection + retain_days age cutoff
  - Throttled runner (`runPrune`/`runThrottled`) with a 24h `.last-prune.json` stamp
  - Repo registry (`register`) keyed by the shared `repoKey` helper
  - `repoKey(projectRoot)` extracted out of `upgrade.cjs` and shared between both modules
affects: [objective-36-sessionstart-hook, upgrade.cjs, backup-prune.cjs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "userHome/now dependency injection so tests never touch the real ~/.claude"
    - "Global config read directly from disk (never via global-config.cjs's readConfig, which binds os.homedir() at load time)"
    - "Directory-name safety allowlist (REPO_DIR_RE) + path-containment check before any fs.rmSync"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/backup-prune.cjs
    - plugins/devflow/devflow/bin/lib/backup-prune.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/upgrade.cjs

key-decisions:
  - "repoKey(projectRoot) extracted from upgrade.cjs's backupDirFor and exported, so backup-prune's register() computes the same directory key without duplicating slug/hash8 logic."
  - "planPrune sorts parseable backups newest-first (time desc, suffix asc on ties) so a same-timestamp collision (<ts>, <ts>-1, <ts>-2) treats the un-suffixed name as newest."
  - "Global config is read directly from <userHome>/.claude/devflow/global-config.json, not via global-config.cjs, because that module resolves its path from the real OS home dir at require time."

patterns-established:
  - "Pattern: pure policy function (planPrune) separated from impure runner (runPrune) — policy is unit-testable without touching fs."

requirements-completed: [ADP-05]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 55min
completed: 2026-09-28
tokens_input: 6371466
tokens_output: 84022
tokens_cache_read: 6113421
tokens_cache_write: 257929
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 03: Backup Retention Policy Summary

**Pure `planPrune` retention policy (14-day/keep-min-5) plus a 24h-throttled `runPrune`/`runThrottled` runner and repo registry, sharing a `repoKey` helper extracted out of `upgrade.cjs`**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-28T00:51:29-04:00 (first TRD commit)
- **Completed:** 2026-09-28T00:54:46-04:00 (last TRD commit) + summary/gate wrap-up
- **Tasks:** 2 (TDD: RED+GREEN each)
- **Files modified:** 3 (1 new impl, 1 new test, 1 modified)

## Accomplishments
- `planPrune` — pure retention policy: newest `keep_min` backups per repo always kept; the rest removed iff `now - time > retain_days * 86400000`; unparseable ts entries never touched.
- `runPrune`/`runThrottled` — throttled runner with a `.last-prune.json` stamp (24h throttle), `dryRun` support, per-removal failure capture (`failed: [{path, error}]`), and a directory-name safety allowlist (`REPO_DIR_RE`) plus path-containment check before any `fs.rmSync`.
- `register` — repo registry at `.registry.json`, keyed by the new shared `repoKey(projectRoot)` helper, preserving `registered_at` across re-registration.
- `repoKey` extracted from `upgrade.cjs`'s `backupDirFor` and exported, confirmed byte-identical to the directory `backupDirFor` already used (test 22) — zero regression across `upgrade.cjs`'s existing 35 tests.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: repoKey extraction + pure policy (tests 16-19, 22, 23) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` | 0 | PASS |
| 2: runner/throttle/config/register (tests 1-15, 20, 21) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` | 0 | PASS |
| upgrade.cjs regression (repoKey refactor) | `node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs` | 0 | PASS (35/35, unchanged) |

## Task Commits

Each task was committed atomically as a TDD RED/GREEN pair:

1. **Task 1 RED: pure policy + repoKey tests** - `1ab5c36` (test)
2. **Task 1 GREEN: pure policy + upgrade.repoKey** - `7fc274f` (feat)
3. **Task 2 RED: runner/throttle/registry tests** - `16079e6` (test)
4. **Task 2 GREEN: throttled pruner with registry** - `6529b5d` (feat)

**Plan metadata:** SUMMARY commit follows this file (docs).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| regression (full suite, excl. micro.test.cjs) | `node --test $(find plugins -name '*.test.cjs' ! -name 'micro.test.cjs')` | 1 (1 failing test) | PASS — baseline-relative (see below) |

**Regression gate classification:**

- **Observed totals:** tests 3840, suites 547, pass 3807, fail 1, cancelled 0, skipped 32, todo 0, duration 43781.3ms.
- **Failures found:** 1 — `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` / `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`.
- **Classification:** matches `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` exactly (same file:line, same test name) → **pre-existing, not a regression**. TSV was not edited.
- **Net result:** 0 new failures introduced by this TRD's changes. Gate: PASS.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1: repoKey + pure policy) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` (before `planPrune`/`parseBackupTime`/`upgrade.repoKey` existed) | 1 | FAIL (correct — module/exports missing) |
| GREEN (Task 1) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` (after implementing `planPrune`, `parseBackupTime`, extracting `upgrade.repoKey`) | 0 | PASS (correct) |
| RED (Task 2: runner/throttle/registry) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` (before `runPrune`/`runThrottled`/`register` existed) | 1 | FAIL (correct — exports missing) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` | 0 | PASS (correct — 24/24 tests, 5 suites) |
| Regression (upgrade.cjs unaffected) | `node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs` | 0 | PASS (35/35, unchanged before/after `repoKey` extraction) |

Final confirmed state (re-run at summary time): `backup-prune.test.cjs` → tests 24, suites 5, pass 24, fail 0. `upgrade.test.cjs` → tests 35, suites 5, pass 35, fail 0.

## Post-TRD Verification

- **Auto-fix cycles used:** 0 (two test-fixture bugs were caught and fixed within the same RED/GREEN cycle before committing — see Deviations; neither required a post-hoc auto-fix cycle against committed code)
- **Must-haves verified:** all TRD-listed tests (1-23, plus sub-case 14b) implemented and passing; `repoKey` shared between `upgrade.cjs` and `backup-prune.cjs`; global-config override path confirmed not to use `global-config.cjs`
- **Gate failures:** None (1 failure observed in the full regression run, classified pre-existing per `baseline-failures.tsv`)

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/backup-prune.cjs` - Pure `planPrune` policy + `runPrune`/`runThrottled` runner + `register` repo-registry helper
- `plugins/devflow/devflow/bin/lib/backup-prune.test.cjs` - 24-test suite (23 TRD-numbered cases + sub-case 14b) covering policy, runner, throttle, config override, and registry behavior
- `plugins/devflow/devflow/bin/lib/upgrade.cjs` - Extracted and exported `repoKey(projectRoot)`; `backupDirFor` now calls it instead of inlining slug/hash8 computation

## Decisions Made
- Read `global-config.json` directly from disk in `backup-prune.cjs` rather than via `global-config.cjs`'s `readConfig()`, since that module binds `os.homedir()` at require time and would silently defeat the fake-HOME test isolation.
- Sort tie-break on `planPrune`: time descending, suffix ascending — makes a same-second name collision (`<ts>`, `<ts>-1`, `<ts>-2`) treat the un-suffixed name as newest, consistent with `upgrade.cjs`'s existing collision-suffix scheme.
- Safety allowlist `REPO_DIR_RE` plus an explicit path-containment check gate every `fs.rmSync` call, in addition to only ever removing directories that pass `lstatSync().isDirectory()`.

## Deviations from Plan

None from the TRD's specified behavior. Two self-authored test-fixture bugs were found and fixed during the TDD RED/GREEN cycle, before either commit landed — these are implementation-detail corrections to the test file itself, not deviations from the TRD's spec:

### Auto-fixed Issues

**1. [Rule 1 - Bug in own test] Source-scan test (23) tripped on the word "os.homedir()" inside a code comment**
- **Found during:** Task 2 GREEN phase, first run of the full backup-prune.test.cjs suite
- **Issue:** `readRetention`'s docstring comment said "...resolves its path from the real os.homedir() at load time)", which contains the literal substring `os.homedir(` that test 23 scans for and rejects.
- **Fix:** Reworded the comment to "...resolves its path from the real operating-system home dir at load time)" — same meaning, no longer matches the banned substring.
- **Files modified:** `plugins/devflow/devflow/bin/lib/backup-prune.cjs`
- **Verification:** `node --test backup-prune.test.cjs` — test 23 passes.
- **Committed in:** `6529b5d` (Task 2 GREEN commit)

**2. [Rule 1 - Bug in own test] Chmod-based removal-failure test (15) never exercised the failure path**
- **Found during:** Task 2 GREEN phase
- **Issue:** Test 15 originally seeded only 2 backups per repo (`[20, 30]` days old); with the default `keep_min: 5`, both were fully protected, so `planPrune` never proposed a removal candidate and the chmod-EACCES assertion (`report.failed.length >= 1`) always evaluated against 0 removals attempted.
- **Fix:** Verified the OS-level chmod/EACCES mechanism independently via a standalone reproduction script, then re-seeded the test with `[1, 2, 3, 4, 5, 20, 30]` days (7 entries, matching test 1's DoD shape) for both the failing repo and a sibling healthy repo, giving exactly 2 genuine removal candidates per repo. Updated assertions to check `report.failed.length === 2` and that the specific entries survive/are removed as expected.
- **Files modified:** `plugins/devflow/devflow/bin/lib/backup-prune.test.cjs`
- **Verification:** `node --test backup-prune.test.cjs` — test 15 (including sub-case 14b) passes, chmod failure path genuinely exercised.
- **Committed in:** `6529b5d` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both confined to the test file/comment, caught before either commit)
**Impact on plan:** None on scope — both were self-authored test-correctness fixes made within the same TDD cycle, not additions or changes to the TRD's required behavior.

## Issues Encountered
None outstanding. All commits succeeded on first attempt via `df-tools commit` (no signing failures, no gate blocks).

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `backup-prune.cjs` is ready to be wired into the objective-36 SessionStart path (`runThrottled`) — this TRD implements the policy/runner/registry only; wiring is out of this TRD's scope per its task list.
- `repoKey` is now a single shared source of truth between `upgrade.cjs` and `backup-prune.cjs` — no known blockers for downstream TRDs depending on either module.

---
*Objective: 37-adopt-existing-repos*
*Completed: 2026-09-28*
