---
objective: 51-github-migration-and-docs
verified: 2026-10-01T00:00:00Z
status: passed
score: 10/10 TRD must-have sets verified (3/3 success criteria, 4/4 requirements)
gaps: []
notes:
  - "The full suite's single failure is the known pre-existing MA-7 (handoff-e2e.test.cjs:795, doctl auth init). It fails because a real doctl is installed on this machine, and it is reported here, not masked."
  - "A first real-repository backfill against a throwaway repo is documented as a manual UAT step (USER-GUIDE line 766). It is not part of CI and was not run here, because the rules forbid real GitHub API calls."
  - "`validate consistency` passed: true with 0 errors. Its 176 warnings are pre-existing classes (on-disk objectives missing from ROADMAP, slug-named TRD vs SUMMARY name matching) and none is specific to 51."
---

# Objective 51: GitHub migration and docs, Verification Report

**Objective Goal:** Existing DevFlow projects move to GitHub as the system of record in place, and the docs describe the new model.
**Verified:** 2026-10-01
**Status:** passed
**Re-verification:** No (initial verification)

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Backfill of a 20-objective fixture stays under the secondary limits and resumes after interruption | VERIFIED | `0011-github-store-backfill.apply.test.cjs` (4 tests: SC1 hour-budget stop, then resume, plus pacing from `fake.writeTimes()`: 1,000 ms gaps, 80/60 s, 450/3,600 s). `0011-...resume.test.cjs` (7 tests: maxOps/offline interruption, mapping loss, 403 retry-after, human-edit halt + resolve, bare `--apply --confirm` reaches 0011). All pass. |
| 2 | Re-running the migration is a no-op | VERIFIED | The SC2 scenario in the apply test (`upgrade --check` shows 0011/0010 not applicable, re-apply makes zero gh writes, and the tree, config and journal are unchanged, as is a never-enabled project's tree). `gh-backfill.e2e.test.cjs` runs the real CLI with a temp HOME and a `gh` PATH shim. |
| 3 | Docs pass doc-refs; objective 26 re-based or killed; npm test green apart from MA-7 | VERIFIED | `doc-refs.repo.test.cjs` passes. Objective 26 was killed (see below). Full `npm test`: 8396 tests, 8363 pass, 1 fail (MA-7 only), 32 skipped. |

## Observable Truths by TRD

| TRD | Must-haves | Status | Evidence |
|-----|------------|--------|----------|
| 51-01 | Objective 26 killed and recorded | VERIFIED | 26/OBJECTIVE.md has `status: cancelled` and a `## Disposition` section ("Killed 2026-10-01 ... GMD-04") with the locked design kept below it. The kill appears on ROADMAP lines 8, 325 and 365, and objective 51's SC list includes "objective 26 killed; decision recorded" (line 308). It is in STATE.md Recent Decisions (line 54) and PROJECT.md (line 131). `.planning/decisions/resolved/DECISION-002.md` (trd 51-01, resolved). The directory was not renumbered. |
| 51-02 | Deterministic 20x5 fixture with variants | VERIFIED | `__fixtures__/gh-backfill-fixtures.cjs` (677 lines). `gh-backfill-fixtures.test.cjs` passes. |
| 51-03 | historyOf/historyOps/estimate/hasPendingOps/recordLiveWrites; seam guard | VERIFIED | `gh-backfill.cjs` exports all of them (lines 485-494). It has no spawn, execFile or `ghWrite(`. `gh-backfill.test.cjs` and `gh-seam.repo.test.cjs` pass. |
| 51-04 | 0010 defers during a backfill; store-mode commit steps | VERIFIED | 0010 detect defers with a reason naming `--only 0011 --confirm` (lines 263-274). `DEVFLOW_SKIP_GH_GATE=1` commit steps appear in 0010 (line 78) and in doctor check 20 (store mode only, line 55). Both test files pass. |
| 51-05 | Estimate + preview in `planning import --dry-run`; noFlush; calibration | VERIFIED | `planning-import-backfill.test.cjs`, `planning-import.test.cjs` and `planning-verbs-cli.test.cjs` pass. 0011 calls `planImport(main, {noFlush:true})` (line 427). |
| 51-06 | Migration 0011 registration, detect, preflight, store switch, queue | VERIFIED | `id '0011'`, `safety: 'confirm'`, `since: '2.13.0'` (lines 1009-1013). Exports detect, preflightLocal, preflightRemote, ensureStoreSwitch and queue. `recordLiveWrites` is wired (line 432). `0011-...test.cjs` passes. |
| 51-07 | Drain, verify, 0010 hand-off | VERIFIED | `drain` (line 628), `verify` (line 770) and `migrate` (line 880) are present, and the hand-off calls `0010.migrate` in-process. There are no leftover "not yet" stubs. The apply test passes. |
| 51-08 | Resilience scenarios + CLI e2e; seam guard | VERIFIED | The resume and e2e tests pass. 0011 spawns nothing (its git reads go through the named runGit seam), and the gh-seam test passes. |
| 51-09 | `/devflow:gh-sync` repurposed as store operator | VERIFIED | SKILL.md has modes `migrate [--dry-run]`, status, flush, pull, `setup [--apply]`, `release <tag>`, and `<objective>|--all` as mirror mode. Migrate shows the plan, asks for approval, then applies `--only 0011 --confirm`. Flow chains say "flushes the outbox" and use `release {tag}`. README names `gh sync --all` and the store model. `skill-route.cjs` (DEPRECATION_MAP/REMOVED_COMMANDS) is unchanged. `gh-sync-skill.repo.test.cjs` passes. |
| 51-10 | CLAUDE.md slimmed; USER-GUIDE, CHANGELOG and proposal updated | VERIFIED | CLAUDE.md is 26,186 chars against the 30,869 baseline, a drop of 4,683 (4,000 or more required). USER-GUIDE has "GitHub is the system of record (store mode)" (line 684), "Migrating an existing project" (line 688), "Mirror mode (store off)" (line 999), migrations table rows 0007-0011 with safety, hourly-budget/halted troubleshooting and a throwaway-repo UAT note. "derivative" appears nowhere. CHANGELOG [Unreleased] has the objective 51 entries, including the objective 26 kill. The proposal has "Planning refinements (objective 51)" (line 136). |

## Requirements Coverage

| Requirement | Source TRDs | Status | Evidence |
|-------------|-------------|--------|----------|
| GMD-01 | 51-02..51-08 | SATISFIED | Migration 0011 (confirm, paced, resumable, idempotent) hands off to 0010 |
| GMD-02 | 51-02, 51-03, 51-05, 51-06, 51-08 | SATISFIED | `planning import --dry-run` estimate + 0011 detect/dry-run plan, with zero gh calls |
| GMD-03 | 51-09, 51-10 | SATISFIED | gh-sync repurposed; USER-GUIDE and CLAUDE.md rewritten; doc-refs green |
| GMD-04 | 51-01 | SATISFIED | Objective 26 killed, DECISION-002 resolved |

There are no orphaned requirements. The TRDs together cover all four OBJECTIVE.md IDs.

## Test Evidence

- Targeted run (15 files: 0010/0011 tests, gh-backfill*, gh-sync-skill, doc-refs, planning-writes, gh-seam, planning-import*, planning-verbs-cli, doctor check 20): **172 tests, 172 pass, 0 fail**.
- Full `npm test`: **8396 tests, 8363 pass, 1 fail (MA-7, pre-existing environmental), 32 skipped**.

## Anti-Patterns

None blocking. 0011 has no remaining "not yet" stubs from 51-06, and gh-backfill.cjs and migration 0011 contain no direct gh or git spawns (pinned by the seam test).

## Functional Verification

_Skipped: this is a backend/CLI objective. The CLI path is covered by `gh-backfill.e2e.test.cjs` through a `gh` PATH shim and a temp HOME._

## Human Verification Required

None blocks this objective. The one optional item is the documented manual UAT: run the first real backfill against a throwaway GitHub repository before migrating a real one.

## Gaps Summary

There are no gaps. Every TRD must-have is backed by code that exists, has real content, is wired in, and is covered by passing tests.

---

_Verified: 2026-10-01_
_Verifier: Claude (verifier)_
