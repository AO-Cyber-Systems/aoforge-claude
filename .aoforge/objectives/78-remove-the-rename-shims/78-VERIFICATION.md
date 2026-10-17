---
objective: 78-remove-the-rename-shims
verified: 2026-10-16T00:00:00Z
status: passed
score: 5/5 must-haves verified
notes:
  - "Requirements: none mapped to objective 78 (user decision 2026-10-16); nothing to cross-reference in REQUIREMENTS.md, no orphans."
  - "Full suite (excluding watcher-shell.test.cjs, known fish-shell hang): 12574 tests, 12545 pass, 2 fail, 27 skipped. The 2 failures are the pre-existing requirements-agreement tests (EST-11 / objective 75) in requirements-agreement.repo.test.cjs and validate-requirements.test.cjs; they predate objective 78."
  - "deployment_verification: not_available (no deployment-sensitive surface; local CLI/plugin only)."
---

# Objective 78: Remove the rename shims Verification Report

**Objective Goal:** The one-release compatibility for pre-rename names is gone in 3.1.0; only PRESERVE/history names remain; an old-layout project gets one clear message naming the 3.0.x path.
**Status:** passed
**Re-verification:** No

## Observable Truths

| # | Truth (SC) | Status | Evidence |
|---|-----------|--------|----------|
| 1 | compat.cjs keeps no pre-rename reader; no aliasLegacyEnv / DEVFLOW_ alias | VERIFIED | `rg aliasLegacyEnv plugins/` returns nothing. compat.cjs `planningDirName` returns `.aoforge` only, requires nothing from legacy-names.cjs. `DEVFLOW_` remains only in legacy-names.cjs `LEGACY.envPrefix` (name registry used for reporting) and legacy test fixtures. |
| 2 | Migrations 0012/0013/0014, pointer plugin, gen-pointer-skills, marketplace entry, package.json glob removed; SHIM_REMOVAL done | VERIFIED | No 0012-0014 files in lib/migrations (ids reserved in `RETIRED_MIGRATIONS` in upgrade.cjs, naming the 3.0.x path); `plugins/` has no devflow dir; no pointer/gen-pointer match in .claude-plugin or package.json; scripts/ has no gen-pointer-skills; `SHIM_REMOVAL = '3.1.0'`. rename-guard.repo.test.cjs: 62/62 pass. |
| 3 | Legacy doctor checks 15/16/17/27, W066/W067 kept read-only or removed, reason per check | VERIFIED | doctor-checks/README.md records each (15, 16 report-only; 17 keeps its fix; 27 report-only owning W066/W067/W069); MIGRATING-TO-AOFORGE.md lines 123-125 and table rows 346-352 repeat it. |
| 4 | Old-layout project gets one clear message; no second planning tree written | VERIFIED | Scratch git repo with only `.planning/`, scratch HOME: `validate health` reports W066 with fix naming 3.0.x `upgrade --apply` / `git mv .planning .aoforge`; `state load` and `upgrade --apply --only 0012` each exit with that single message; `ls -a` afterward shows no `.aoforge/`. old-layout.legacy.test.cjs passes. |
| 5 | Docs describe removal; suite passes; guard fails on legacy names outside trimmed ALLOW | VERIFIED | CHANGELOG [Unreleased] entries for 78-12 and the shim removal; MIGRATING-TO-AOFORGE.md and USER-GUIDE updated; CLAUDE.md core-tool bullets updated; full-suite result above (only pre-existing failures); rename-guard passes. |

**Score:** 5/5

## Requirements Coverage

None mapped to objective 78 by user decision; nothing to cross-reference.

## Anti-Patterns

None blocking found in the scanned surfaces.

## Functional Verification

Skipped: not a UI objective. CLI exercised in a scratch repo (above).

## Human Verification

None required.
