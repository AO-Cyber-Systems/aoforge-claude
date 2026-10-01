---
objective: 50-github-enforcement-and-setup
trd: "07"
subsystem: github-store
tags: [store-mode, health, doctor, validate, offline, report-only]

requires:
  - objective: 50-04
    provides: collectStoreHealth(root, opts) and the W057-W061 findings it returns
  - objective: 48-planning-writes
    provides: the validate Check 15 / doctor check 24 patterns this copies

provides:
  - "validate health Check 16: store sync health, W057-W061 as non-repairable warnings"
  - "doctor check 25 gh-store-sync (report-only), which owns W057-W061; check 22 defers them"

affects: [50-13 USER-GUIDE W-codes]

tech-stack:
  added: []
  patterns:
    - "Compose, never re-implement: both surfaces call gh-health.collectStoreHealth through the module object"
    - "Doctor ownership by deferral: the W040 pattern, extended to W057-W061 so each problem shows once"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs

key-decisions:
  - "doctor fix_command comes from a per-code table in check 25, not from the collector's `fix` prose: the collector's fixes for a halt, a frozen drift and an orphan are sentences naming several commands, and doctor's fix_command must be one exact command. A finding's own `fix` is used only when it is exactly one plain df-tools command (flush, gh sync N, gh pr sync N)."
  - "A collector that throws is a warn in doctor (not an error): the engine would otherwise coerce the throw into an error result for a report-only advisory."
  - "Check 16 passes {home: homeDir} (as Check 15 does) so a test's fake home, not the real ~/.claude, decides where the outbox lives."

requirements-completed: [GEN-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~15min
completed: 2026-10-01
---

# Objective 50 TRD 07: validate health and doctor store sync reports Summary

**`df-tools validate health` (Check 16) and `df-tools doctor` (check 25, `gh-store-sync`) now report unsynced writes, missing links, orphans, frozen-body drift and a failed check (W057-W061) from the 50-04 collector, as report-only warnings that are never repairable; local mode is byte-identical and makes zero gh calls, and doctor's validate-health check defers the codes so each problem appears once.**

## Performance

- **Tasks:** 2/2 complete, strict TDD (RED committed before GREEN for both).
- **Tests:** 4 in `validate-gh-health.test.cjs`, 13 in `25-gh-store-sync.test.cjs`; all passing. Every test runs behind a gh seam that throws; none fired.

## Accomplishments

- **Check 16** sits after Check 15 in `validate.cjs`: `collectStoreHealth(cwd, {home: homeDir})`; each finding becomes `addIssue('warning', code, message, fix, false)`; a throw becomes `W061 gh-health-check-failed: <message>`. Store findings never enter `errors`, never move `repairable_count`, and `--repair` cannot flush or rewrite the cache.
- **D-01 (test 4):** a local-mode report deep-equals a run with the collector stubbed to `{applicable:false}`, contains none of W057-W061, never calls gh, and never creates the outbox dir.
- **Check 25 `gh-store-sync`** (project scope, no `fix`): not store mode -> ok "not a store-mode project"; no findings -> ok "no store sync problems"; otherwise one `warn`, `fixable:false`, with `fix_command` = the most urgent finding's command (halt > unsynced > frozen > links > orphans > check-failed), `details.findings` (urgency order), `details.codes`, and `details.fix_commands` (one exact command per code).
- **Deferral:** `22-validate-health.cjs` `DEFERRED` now lists W057-W061 beside E020/I022/W040, so a report whose only warning is a store code is `ok` with the code under `details.deferred`.
- **README:** the 20-29 row of the numbering table names `25-gh-store-sync`.

## Task Commits

| Task | Name | Phase | Commit |
|---|---|---|---|
| 1 | validate Check 16 (tests 1-4) | RED | 93af8d05 |
| 1 | validate Check 16 (tests 1-4) | GREEN | 75218bda |
| 2 | doctor check 25 and deferral (tests 5-7) | RED | 71f3a0a8 |
| 2 | doctor check 25 and deferral (tests 5-7) | GREEN | 3eefdc54 |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: validate Check 16 | `node --test .../validate-gh-health.test.cjs .../validate.test.cjs` | 0 (92/92) | PASS |
| 2: doctor check 25 and deferral | `node --test .../doctor-checks/25-gh-store-sync.test.cjs .../21-22-project.test.cjs .../doctor.test.cjs .../doctor.e2e.test.cjs` | 0 (66/66) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../validate-gh-health.test.cjs .../doctor-checks/25-gh-store-sync.test.cjs` | 0 | PASS (4/4, 13/13) |
| regression | `node --test .../validate.test.cjs .../doctor.test.cjs .../doctor.e2e.test.cjs` | 0 | PASS |
| extra | every `doctor-checks/*.test.cjs` (130/130), `doctor-cli.test.cjs` (26/26), `gh-health.test.cjs` (34/34) | 0 | PASS |
| extra | `gh-seam.repo.test.cjs`, `planning-writes.repo.test.cjs`, `doc-refs.repo.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../validate-gh-health.test.cjs` | 1 (4 failed on missing W057/W059/W060/W061; harness ran) | FAIL (correct) |
| GREEN (task 1) | same | 0 (4/4) | PASS (correct) |
| RED (task 2) | `node --test .../25-gh-store-sync.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 2) | same | 0 (13/13) | PASS (correct) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] validate.test.cjs test 12 pinned the exact issue codes of a store project**
- **Found during:** Task 1 regression run.
- **Issue:** Test 12 ("a drift reader that throws ...") builds a store-mode project with TRDs and no mapping and asserts the full code list. Check 16 correctly adds four W058 (objective + 3 TRDs unmapped), so the pinned list failed. The TRD expected `validate.test.cjs` to stay unchanged, but that cannot hold once Check 16 reports on a store project.
- **Fix:** The assertion now sets aside W057-W061 (Check 16's codes belong to `validate-gh-health.test.cjs`) and keeps its original intent: Checks 1-14 behave as in local mode plus the one W056. No other line changed.
- **Files modified:** plugins/devflow/devflow/bin/lib/validate.test.cjs
- **Commit:** 75218bda (with the Check 16 implementation, so history stays green)

**2. [Rule 3 - Blocking] 21-22-project.test.cjs pinned `DEFERRED` exactly**
- **Found during:** Task 2 regression run.
- **Issue:** the validate-health contract test `deepEqual`s `DEFERRED` to `['E020','I022','W040']`.
- **Fix:** expected list extended with W057-W061 and a comment pointing at 25-gh-store-sync.
- **Files modified:** plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
- **Commit:** 3eefdc54

### Environment notes (not code deviations)

- `doctor.e2e.test.cjs` did not list check ids, so no snapshot edit was needed.
- `CHANGELOG.md` is not in this TRD's `files_modified` and was not touched; the Check 16 / check 25 entries (and the USER-GUIDE W-code table) belong to the documentation TRD (50-13).
- `node --test <directory>` fails on this Node (24.13) because the directory is treated as a module; the doctor-checks suite was run by glob instead.

## Authentication Gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (store-mode W057-W061 warnings, never repairable, never an error; local mode identical and zero gh calls; doctor check 25 with a fix_command per code, report-only; check 22 defers W057-W061)
- Gate failures: None (the two red tests found were the pinned-code assertions above, fixed in the same commits)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs
- FOUND: validate.cjs, 22-validate-health.cjs, README.md, validate.test.cjs, 21-22-project.test.cjs (modified)
- FOUND commits: 93af8d05, 75218bda, 71f3a0a8, 3eefdc54 (all on df/exec-50-07; worktree clean)
