---
objective: 67-minutes-recalibration
verified: 2026-10-08T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Objective 67: Minutes recalibration Verification Report

**Objective Goal:** Minute estimates use a method chosen and frozen before any objective is scored with it, so the next accuracy test is honest.
**Status:** passed. **Re-verification:** No.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: decision names method, provenance, protocol; committed before any scoring | VERIFIED | `.planning/decisions/resolved/DECISION-003.md` committed d888f557 (09:28:01); first 67-04 scoring commits f0e46e5f (09:58), 5de8dec8 (10:02). Decision precedes scoring by 30 min. |
| 2 | SC-2: calibration identity names method and parameters, byte-identical | VERIFIED | Live `~/.claude/devflow/calibration.json` sha256 f4d1ffa9... equals 67-FREEZE.md; version 3 method `{trd_level, window 10, through 66}`; FREEZE records `unchanged` on identical rebuild and `cmp` clean frozen copy. |
| 3 | SC-3: validation excludes 68-72; check shows no input reached the calibration | VERIFIED | FREEZE section 4: through-66 snapshots with and without hand-built 68-72 objectives `cmp` identical; control without `--through` differs, so the fixture is not inert. Live file's last kept objective is 66. |
| 4 | SC-4: installed `estimate` uses new calibration | VERIFIED | Re-run read-only: installed 2.15.0 (`.plugin-version`), `estimate trd 66-01` reports calibration path = live file, version 3, method trd_level/through 66/window 10; minutes p50 10 / p90 19 with `minutes_basis: trd_level`, n=73 (task sum would be 11.7). |

**Score:** 4/4

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| EST-10 | Method chosen and frozen before scoring; provenance and protocol recorded | SATISFIED | Marked `[x]` and "Objective 67 / Complete" in REQUIREMENTS.md; covered by SC-1 to SC-4. No orphaned requirements (EST-11 is mapped to objective 75). |

## Known deviation assessed

67-09 fixed `state add-blocker` (spaced "Blockers / Concerns" heading) in the repo copy only (58ae63e5, 994b93ef); installed 2.15.0 still has the bug. It affects none of SC-1..4: it concerns STATE.md bookkeeping, not calibrate or estimate. The freeze blocker is present in STATE.md (line 229). Advisory: the fix ships in a later release.

## Anti-Patterns / Functional

None found in verified artifacts (67-FREEZE.md passes artifact check). Not a UI objective; Step 8 skipped. Calibration was not rebuilt; only read-only checks and `estimate` runs were used.
