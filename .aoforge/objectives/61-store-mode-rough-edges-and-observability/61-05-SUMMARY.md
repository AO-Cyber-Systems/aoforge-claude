---
objective: 61-store-mode-rough-edges-and-observability
job: "05"
subsystem: hooks
tags: [transcript-export, sessionstart, throttle, observability, detached-child]

requires:
  - objective: 37-backup-prune
    provides: the runThrottled stamp pattern and the upgrade-project.js step 0 placement this mirrors
provides:
  - transcript-export-schedule.cjs (THROTTLE_MS, SKIP_ENV, stampPath, readStamp, decide, claim, exportArgs, runScheduled)
  - upgrade-project.js step 0b, a throttled detached `df-tools transcript-export` at SessionStart
  - DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1, an escape independent of the prune and upgrade escapes
affects: [objective-61 documentation, USER-GUIDE hook escape list, CLAUDE.md Hooks section]

tech-stack:
  added: []
  patterns:
    - "claim-then-spawn: write the 24 h stamp before spawning, so concurrent sessions start one export"
    - "detached, unref'd child running the BUNDLED df-tools (never the mirror) for work too slow for SessionStart"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/transcript-export-schedule.cjs
    - plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs
  modified:
    - plugins/devflow/hooks/upgrade-project.js
    - plugins/devflow/hooks/upgrade-project.test.js

key-decisions:
  - "The throttle boundary mirrors backup-prune exactly: age < 24 h is throttled, exactly 24 h is due"
  - "decide() checks the skip env, then the projects dir, then the stamp, in that order of precedence"
  - "spawnChild is injected, so the library never spawns and tests use a spy"

patterns-established:
  - "A SessionStart step that can be slow runs as a detached child and is claimed before it is spawned"

requirements-completed: [OBS-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-10-06
tokens_input: 5345852
tokens_output: 35350
tokens_cache_read: 5237502
tokens_cache_write: 108248
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 61 TRD 05: transcript-export schedule Summary

**SessionStart now starts a detached `df-tools transcript-export` at most once per 24 h, claimed by a stamp under `~/.claude/devflow/state/` before the spawn, with its own `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` escape.**

## Progress
- [x] Task 1: transcript-export-schedule.cjs, the throttle, claim and arguments (tests 1-5) — RED e00ede14, GREEN f097b886
- [x] Task 2: upgrade-project.js step 0b, the SessionStart wiring (tests 6-12) — RED 30bba2ec, GREEN b7b40db2

## What was built

`transcript-export-schedule.cjs` decides when the export runs. `decide` returns `skip-env`, `no-transcripts` or
`throttled` (in that order) or `{ run: true }`. A missing, unparseable or future-dated (more than 5 min ahead) stamp
means run. `claim` writes `{ last_run_at }` to `~/.claude/devflow/state/transcript-export/last-run.json` through a
temp file and a rename. `exportArgs` passes `--root` and `--out` explicitly and never `--full`. `runScheduled` is
decide, claim, then the injected `spawnChild`; a spawn that throws propagates with the claim standing.

`upgrade-project.js` step 0b sits right after the prune and before every upgrade early return, so it runs in every
session, DevFlow project or not. `spawnTranscriptExport` is `spawn(process.execPath, args, { detached: true,
stdio: 'ignore' })` with an `error` listener and `unref()`, running the bundled `DF_TOOLS`. Any failure writes one
`[devflow] transcript export skipped: <msg>` line to stderr; stdout stays empty and the upgrade steps still run. The
header comment documents step 0b, why it is a detached child, the claim-then-spawn order, the stamp path and the
three independent escapes.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: schedule module | `node --test plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs` | 0 (23 tests) | PASS |
| 2: hook step 0b | `node --test plugins/devflow/hooks/upgrade-project.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs` | 0 (113 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../transcript-export-schedule.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | `node --test .../transcript-export-schedule.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="objective 61" .../upgrade-project.test.js` | 1 (tests 6, 7, 9, 11 failed; 8 and 10 pass trivially) | FAIL (correct) |
| GREEN (task 2) | same | 0 (6/6) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test` on the schedule test, upgrade-project test and planning-writes audit | 0 (113 pass) | PASS |
| test (full suite) | `npm test` | 1 (10106 pass, 10 fail, 50 skipped) | see Deferred Issues |

`planning-writes.audit.test.js` stayed green with no edit: its worlds have no `.claude/projects`, so the step spawns
nothing there. No allowlist row was added.

## Deviations from Plan

None - TRD executed exactly as written. `planning-writes.audit.test.js` needed no change (the TRD allowed one only if
its runs needed the skip env).

## Deferred Issues

The full `npm test` run shows 10 failures, none in a file this TRD touches:

- `devflow-watch.test.cjs` (start/foreground, multi-project start) and `handoff-e2e.test.cjs` (6 tests): the daemon
  does not start from this worktree (`.df-worktrees/...`). `devflow-watch.test.cjs` passes 22/22 in the main
  checkout and fails 4 in this worktree, with identical code apart from this TRD's five files, and neither
  `devflow-watch.cjs` nor the handoff e2e loads any of them. Worktree-environment issue.
- `stack-drafter-fleet.test.cjs` ("stack init against the real fleet") and its `github-enterprise-migration` case:
  committed `STACK.md` vs a draft in a repository outside this checkout.
- `roadmap-reconcile.test.cjs` E2E1 (self-test): reported that ROADMAP line `- [ ] 61-05-...` should be `[x]` once
  this TRD's SUMMARY exists. Resolved by recording progress (`roadmap update-job-progress`), see the state section
  of the orchestrator's commits.

## Documentation not touched (outside this TRD's file list)

`CLAUDE.md` (Hooks section, `upgrade-project.js` entry) still lists only `DEVFLOW_SKIP_UPGRADE` and
`DEVFLOW_SKIP_PRUNE`. It should gain `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` (step 0b) when the objective's docs TRD runs.

## Discovered commands

None. The stack profile supplied `test` (`node --test {files}` scoped, `npm test` full).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (daily detached export in every session; the escapes are independent; claim before
  spawn; no `.claude/projects` means no spawn and no write; one stderr line on failure with stdout empty, exit 0
  and the upgrade still applying; the 3.6 GB first run happens in the child)
- Gate failures: None in touched files; 10 pre-existing or environmental failures listed under Deferred Issues

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/transcript-export-schedule.cjs
- FOUND: plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs
- FOUND: plugins/devflow/hooks/upgrade-project.js (step 0b and header comment, `rg -n "transcript-export"`)
- FOUND: plugins/devflow/hooks/upgrade-project.test.js
- FOUND commits: e00ede14, f097b886, 30bba2ec, b7b40db2
