---
objective: 45-devflow-doctor
trd: "08"
job: 45-08
subsystem: doctor
tags: [doctor, e2e, sc4, sc5, fixture, aodex, doc-06]
requires: [45-04, 45-05, 45-06, 45-07, 45-10]
provides:
  - "makeAodexLikeState() fixture: the full 2026-09-29 aodex/runtime reproduction"
  - "doctor.e2e.test.cjs: SC4 (report -> fix -> report converges) and SC5 (staged-changes refusal) through the real df-tools dispatch"
affects: [45-09]
tech-stack:
  added: []
  patterns:
    - "e2e doctor tests spawn the real dispatcher with gitEnv(home) + USERPROFILE and every inherited DEVFLOW_* var dropped, then assert on --json fields only"
    - "real-home canary: a read-only two-level name listing of ~/.claude/devflow/{state,backups} taken at file load and compared by the last test"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
key-decisions:
  - "The fixture keeps the guard and awareness state dirs inside the fake home (df-state/…), reached through DEVFLOW_PROGRESS_GUARD_DIR / DEVFLOW_AWARENESS_DIR, so cleanup() of home + root removes everything and the read-only test hashes all of it."
  - "PROJECT.md gets a committed `## Requirements` section so validate-health is clean (W001 otherwise, per the 45-06 note); validate-health is then asserted ok rather than loosened."
  - "`.planning/.skill-active` is listed in .git/info/exclude so the untracked marker never dirties .planning/ for the worktree guards."
  - "Engine version is read from plugins/devflow/.claude-plugin/plugin.json at test time; the project stamp is 2.0.0 so it is always behind."
duration: 8m
completed: 2026-09-30
tokens_input: 7872089
tokens_output: 45664
tokens_cache_read: 7710403
tokens_cache_write: 161572
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 08: Doctor end-to-end on an aodex-like fixture Summary

The real `df-tools doctor` CLI, run against a literal reproduction of the 2026-09-29 aodex state, detects every DOC-05 problem. One `--fix` pass converges so that only the report-only plugin-cache warn remains, and unrelated staged work blocks the index-changing fixes (SC4 + SC5 proven, 8/8 e2e tests green).

## What was built

- **`makeAodexLikeState()`** (in `__fixtures__/doctor-fixtures.cjs`) builds the state entirely from literals, never from `~/dev/aodex`:
  - **Install:** devflow@aocyber 2.11.0 is installed with the real `hooks/sync-runtime.js` and `devflow/bin/lib/runtime-digest.cjs`, so the runtime-mirror fix really runs.
  - **Mirror and cache:** the mirror is at 2.10.1, with stale 2.7.1/2.10.1 cache dirs.
  - **Project:** a git project stamped 2.0.0 that tracks `.planning/.progress-guard.json` and `flutter/.planning/.progress-guard.json`, plus an untracked, unignored `.planning/.awareness-cache.json`.
  - **Markers and state:**
    - an expired `.planning/.skill-active`, excluded through `.git/info/exclude`
    - two guard session files aged 2 days
    - an orphan awareness entry and a 2 MiB one
    - seven January-2026 backups under `repoKey(root)`
  - **Return value:** `{home, root, installPath, guardDir, awarenessDir, env, cleanup}`. The literals (`AODEX_*`) are exported so tests assert against the same values.
- **`doctor.e2e.test.cjs`** holds tests 1-8 from the TRD. Each test builds its own fixture and cleans it up in `afterEach`, spawns `df-tools doctor … --json` with `cwd = fixture root`, and follows the `@file:` large-output prefix.

## Observed end-to-end behavior (the proof)

| Run | Result |
|---|---|
| report | `broken`, fixable 7. runtime-mirror and legacy-runtime-state are **error**. plugin-cache, pending-migrations (0008 pending), skill-markers, guard-state, awareness-state (1 orphaned, 1 oversized) and backups (2 past retention) are **warn**. hooks-registry, model-profiles and validate-health are ok. |
| `--fix` | 7/7 fixes `applied:true`. The legacy fix untracks both guard files, writes `.gitignore` and deletes the working copies, and its notes carry `df-tools.cjs commit "chore: untrack DevFlow runtime state" --files .gitignore …`. pending-migrations then stamps the engine version. It is not refused, because the `changedThisRun` exclude wiring holds. |
| second report | `degraded`: fixable 0, error 0, and the only non-ok result is `plugin-cache:warn` |
| git after fix | Staged: `D .planning/.progress-guard.json` and `D flutter/.planning/.progress-guard.json` only. All three runtime paths are ignored (`check-ignore`), and none is on disk. |
| SC5 (`src/unrelated.txt` staged) | legacy-runtime-state is an error with `fixable:false`, and its finding names `src/unrelated.txt`. pending-migrations is `fixable:false` with 0008 still pending. The runtime-mirror, skill-markers, guard-state, awareness-state and backups fixes are applied. `git diff --cached` is `src/unrelated.txt` only. Both guard files stay tracked and on disk, and no `.gitignore` is written. |
| `--global` | Exactly the 7 global checks run, and `scope.project` is null. |
| canary | The real `~/.claude/devflow/state` and `~/.claude/devflow/backups` listings are identical before and after (the test checks this, and a manual `ls -la` shows the same mtimes). |

## Deviations from Plan

None. The TRD was executed as written.

### Cross-TRD fixes

None. The e2e suite exposed no defect in the 45-04 core or in any 45-05/06/07 check, so no check was modified and no `fix(45-08)` commit was needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: makeAodexLikeState fixture | `node -e "…makeAodexLikeState(); console.log(Object.keys(s).join(',')); s.cleanup()"` → `home,root,installPath,guardDir,awarenessDir,env,cleanup`; home/root gone after cleanup | 0 | PASS |
| 2: e2e SC4 + SC5 tests | `node --test plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` → 8 tests, 8 pass | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none | n/a | n/a |
| test | `node --test doctor.e2e.test.cjs doctor*.test.cjs doctor-checks/*.test.cjs` → 189 tests, 189 pass | 0 | PASS |
| wave | `npm test` → 5797 tests, 5764 pass, 1 fail, 32 skipped | 1 | PASS (only a known pre-existing failure) |

The single wave failure is `handoff-e2e.test.cjs` MA-7 ("doctl auth init with unset DIGITALOCEAN_TOKEN"). It is in the handoff pipeline e2e category already recorded as pre-existing in 45-06. It depends on the operator machine's doctl behaviour and imports neither file this TRD touched. No stray files were left in the checkout.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | n/a: the e2e suite targets behavior already shipped by 45-04..07 and exposed no defect, so there was no product change to drive | n/a | n/a |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (every DOC-05 id non-ok on the report; fix applied + converged with plugin-cache the only warn; SC5 refusal with staged file untouched and guard files still tracked; real-home canary unchanged)
- Gate failures: None (wave: one known pre-existing handoff e2e failure)

## Commits

- `ee74d39` test(45-08): aodex-like doctor fixture
- `3bb6208` test(45-08): doctor end-to-end on aodex-like state

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs
- FOUND: ee74d39, 3bb6208 (`git log 82d22b3..HEAD`)
