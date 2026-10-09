---
objective: 45-devflow-doctor
trd: "07"
job: 45-07
subsystem: doctor
tags: [doctor, state-hygiene, guard-state, awareness-cache, backups, prune]
requires: [45-01, 45-04]
provides:
  - "doctor check guard-state (global, fixable)"
  - "doctor check awareness-state (global, fixable)"
  - "doctor check backups (global, fixable)"
affects: [45-08]
tech-stack:
  added: []
  patterns:
    - "check composes the existing store/prune module instead of re-implementing its sweep"
    - "fix() reports absolute `changed` paths for state outside the project so ctx.changedThisRun stays project-only"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doctor-checks/30-guard-state.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/31-awareness-state.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/32-backups.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/30-31-state.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/32-backups.test.cjs
  modified: []
key-decisions:
  - "guard-state mirrors SESSION_TTL_MS (24h) instead of requiring the hook: the doctor runs from the ~/.claude/devflow mirror, which does not ship hooks/. A test requires the hook and asserts equality."
  - "awareness-state never deletes a fresh, live, individually-small entry because the dir is large: a dir over 20 MiB with nothing removable is an unfixable warn with a fix_command."
  - "backups delegates retention entirely to runPrune (dry run for detection, real run for the fix); only the size-threshold case is the doctor's own logic."
duration: 4m
completed: 2026-09-30
tokens_input: 2863753
tokens_output: 40733
tokens_cache_read: 2768516
tokens_cache_write: 95177
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 07: Doctor state-hygiene checks Summary

Three global doctor checks (`guard-state`, `awareness-state`, `backups`) that report stale or oversized DevFlow runtime state and prune it, each composing the existing store or prune module.

## What was built

- **30-guard-state** — counts top-level `*.json` files in `ctx.paths.progressGuardDir` older than 24h (the same predicate as `progress-guard-store.pruneStale`). Warn and fixable when any exist. The fix calls `store.pruneStale(dir, now, TTL)`. A missing dir is `ok` "no guard state" and is not created.
- **31-awareness-state** — classifies `awareness-store.listEntries` as `orphaned` (recorded `project` path gone), `stale` (>7d) or `oversized` (single file >1 MiB). Warn and fixable, with `details.entries` giving each file and its reasons. The fix runs `pruneStale(dir, now, STALE_MS, {orphans:true})`, then unlinks oversized files one by one. A dir total over 20 MiB with nothing removable is a warn that is not fixable, with a `fix_command`. The legacy-shaped 640KB entry for a live, fresh project is `ok`.
- **32-backups** — `runPrune({dryRun:true})` decides what is past retention: warn and fixable, and the fix is `runPrune` itself, so exactly the dry-run set goes. With nothing prunable and a total over `DEVFLOW_DOCTOR_BACKUP_WARN_BYTES` (500 MiB default; invalid values fall back to the default) it warns, not fixable, and `fix_command` names `<mirror>/global-config.json` keys `backups.retain_days` / `backups.keep_min` plus `upgrade --prune`. Otherwise `ok` with `details {bytes, repos, kept}`. No backups dir is `ok` and nothing is created.

All three are `scope: 'global'` and take every path from `ctx.paths` / `ctx.userHome`. None deletes outside its own state dir.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TRD names the wrong retention config file**
- **Found during:** Task 2 (reading `backup-prune.readRetention`)
- **Issue:** TRD test 9 says `fix_command` names `.claude/devflow/config.json` retention keys, but `readRetention` reads `<home>/.claude/devflow/global-config.json` (`backups.retain_days`, `backups.keep_min`). The TRD itself said "whatever readRetention reads; cite the real key names".
- **Fix:** `fix_command` cites the real file and keys, and the test asserts `global-config.json`, `backups.retain_days` and `backups.keep_min`.
- **Files modified:** `32-backups.cjs`, `32-backups.test.cjs`
- **Commit:** ac6dea6

**2. [Rule 1 - Bug] backups `changed` paths are absolute, not backups-root-relative**
- **Found during:** Task 2 design against `doctor.runDoctor`
- **Issue:** TRD says the fix returns `changed: removed`, but `runPrune` reports paths relative to the backups root. The engine adds every relative `changed` entry to `ctx.changedThisRun` as a project path (the DOC-06 guard set), which would record backup dirs as project files.
- **Fix:** `changed` is `path.join(ctx.paths.backupsDir, rel)`. Guard-state and awareness-state also return absolute paths. The test asserts every `changed` path is absolute and that the relative form equals the dry-run set.
- **Files modified:** `32-backups.cjs`
- **Commit:** ac6dea6

**3. [Rule 1 - Bug] Inconsistent `details.entries` shape in my own RED test**
- **Found during:** Task 1 GREEN
- **Issue:** The RED test for awareness-state used `details.entries` as an array in the warn case (test 4) and a number in the ok case (test 5). Same key, two types.
- **Fix:** `details.entries` is always the flagged list (empty when ok), with `details.count` (parseable entries) and `details.totalSize` alongside. Test 5 was updated in the GREEN commit.
- **Files modified:** `30-31-state.test.cjs`
- **Commit:** 437faf1

### Additions beyond the TRD's test list (Rule 2)

Extra tests for edge cases that guard the "never delete outside its remit" rules: singular wording (1b), engine-level `--fix` runs for all three checks (1c, 6b, 7c), non-json files / subdirs / no-`project` entries untouched (4c), stale+oversized reasons combined (4b), dir over 20 MiB with and without removable entries (5b, 5c), `keep_min` protecting entries (7b), the default-threshold ok case (9b) and an invalid threshold override (9c). 20 tests in total versus the TRD's 9.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: guard-state + awareness-state | `node --test .../doctor-checks/30-31-state.test.cjs` | 0 (13/13) | PASS |
| 2: backups | `node --test .../doctor-checks/32-backups.test.cjs` | 0 (7/7) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../30-31-state.test.cjs` | 1 (`Cannot find module './30-guard-state.cjs'`) | FAIL (correct) |
| GREEN (task 1) | `node --test .../30-31-state.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test .../32-backups.test.cjs` | 1 (`Cannot find module './32-backups.cjs'`) | FAIL (correct) |
| GREEN (task 2) | `node --test .../32-backups.test.cjs` | 0 | PASS (correct) |

Commits: `9f0958f` test (RED), `437faf1` feat (GREEN), `249c730` test (RED), `ac6dea6` feat (GREEN).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../doctor-checks/30-31-state.test.cjs .../doctor-checks/32-backups.test.cjs` | 0 (20/20) | PASS |
| engine regression | `node --test .../lib/doctor.test.cjs .../lib/doctor-cli.test.cjs` | 0 (51/51) | PASS |
| loader | `doctor.loadChecks({})` lists `guard-state`, `awareness-state`, `backups` with no `invalid` | 0 | PASS |
| wave (`npm test`) | not run in the worktree (no node_modules; devflow-watch/handoff-e2e failures are expected there) | n/a | not run |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (guard-state TTL and fix; awareness-state classification and fix; backups dry-run, fix and threshold; global scope with ctx-only paths; no deletion outside the check's own state dir)
- Gate failures: None
- Isolation: every test sets `userHome` and both state-dir env overrides inside an `fs.mkdtemp` fake home. `runPrune` is only ever called with the fake home. No child process was spawned, and the real `~/.claude` was never read or written.

## Self-Check: PASSED

- FOUND: 30-guard-state.cjs, 31-awareness-state.cjs, 32-backups.cjs, 30-31-state.test.cjs, 32-backups.test.cjs (all under `plugins/devflow/devflow/bin/lib/doctor-checks/`)
- FOUND commits: 9f0958f, 437faf1, 249c730, ac6dea6 on `df/exec-45-07`
