---
mode: quick
id: 25-move-progress-guard-state-out-of-project
status: complete
started: 2026-09-30T00:38:15Z
completed: 2026-09-29
subsystem: hooks
tags: [progress-guard, telemetry, context-discipline, tdd]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/progress-guard-store.cjs
    - plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs
  modified:
    - plugins/devflow/hooks/guard-no-progress.js
    - plugins/devflow/hooks/guard-no-progress.test.js
    - plugins/devflow/devflow/bin/lib/telemetry.cjs
    - plugins/devflow/devflow/bin/lib/telemetry.test.cjs
    - CHANGELOG.md
    - CLAUDE.md
decisions:
  - "Guard state is one file per session under $DEVFLOW_PROGRESS_GUARD_DIR or ~/.claude/devflow/state/progress-guard/. The hook never writes into the repo."
  - "Stale siblings (>24h mtime) are pruned only when the session's own file did not exist before the write. That is one readdir per session, deterministic, with no Math.random."
  - "Telemetry filters per-session files by project (realpath of the directory containing .planning) and has no fallback read of the legacy .planning/.progress-guard.json."
---

# Quick 25: Move progress-guard state out of the project tree

`guard-no-progress.js` now keeps its state in per-session files under `~/.claude/devflow/state/progress-guard/` (override `DEVFLOW_PROGRESS_GUARD_DIR`) instead of rewriting `.planning/.progress-guard.json` on every tool call. `df-tools telemetry` reads the new files, filtered to the current project.

## Progress

- [x] Preflight: `exec-context check` passed (checkout `/Users/justin/dev/devflow-claude`, branch `feat/stack-profile-loader`, base `7ad7b34` visible).
- [x] Task 1 RED: store tests (24 cases) fail on the missing module. Committed `e3f67b6`.
- [x] Task 1 GREEN: `progress-guard-store.cjs`, 24/24 pass, requires only fs/os/path. Committed `92f80cd`.
- [x] Task 2 RED: hook tests reworked (cases 1-9 plus extras) and telemetry tests rewritten (cases 13-15 plus extras). 15 of 41 fail against the old code. Committed `a144802`.
- [x] Task 2 GREEN: hook and telemetry rewired, 41/41 pass. Committed `2b673aa`.
- [x] Task 3: CHANGELOG `### Fixed` entry, CLAUDE.md `guard-no-progress.js` bullet, `npm test`, awareness-cache investigation. Committed `d397e93`.

## Commits

| Hash | Message |
|---|---|
| e3f67b6 | test(quick-25): progress-guard per-session store (RED) |
| 92f80cd | fix(quick-25): add per-session progress-guard store |
| a144802 | test(quick-25): guard state leaves .planning; telemetry reads per-session files (RED) |
| 2b673aa | fix(quick-25): progress-guard state out of the repo; telemetry follows |
| d397e93 | docs(quick-25): changelog + CLAUDE.md for progress-guard state move |

## What changed

- **`bin/lib/progress-guard-store.cjs` (new).** Exports `stateDir`, `sanitizeSessionId`, `sessionFile`, `readSession`, `writeSession`, `pruneStale`, `listSessions`. Node builtins only. The session id is allowlist-sanitized to `[A-Za-z0-9_-]`, capped at 128 characters, and mapped to `unknown` when empty or only `_`/`-`. Every fs operation fails open (null, false or 0, never a throw).
- **`hooks/guard-no-progress.js`.** Derives `project` (realpath of the directory holding `.planning`), reads the session file, calls `record()`, writes `{guard, updated, project}`, and prunes stale siblings only when the session file did not exist before this call. `STATE_FILE`, `loadState`, `saveState` and the object-`prune` are gone. Exports are now `{ findPlanningDir, IGNORED_TOOLS, SESSION_TTL_MS }`. The trip and output block below the write is unchanged, so the escalation ladder (warn on the 3rd identical call, `ask` on the 5th, no re-fire on the 6th) is preserved.
- **`bin/lib/telemetry.cjs`.** `collect({ ..., progressGuardDir = store.stateDir() })` reads through `listSessions`, filters to `project === realpath(dirname(planningDir))`, and keeps the same output shape and advisory text. The Sources header is updated.
- **Untouched by design:** `bin/lib/progress-guard.cjs`, migration 0008 and its test, and the other legacy-path tests. `git diff --stat 7ad7b34 -- progress-guard.cjs migrations/` is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Edit gate denied Write with no skill marker live**
- **Found during:** Task 1 (first Write)
- **Issue:** `gate-edits.js` denied the write. The executor runs in ambient mode with no `.planning/.skill-active` marker, and no `devflow:` agent type reached the hook.
- **Fix:** Started the marker the way the gate's own message prescribes for a running skill (`df-tools skill-active --start quick`), and ended it at the end of the task. No gate config or escape variable was changed.
- **Files modified:** none (the marker is gitignored runtime state)

### Test design additions (beyond the listed cases)

Kept inside the plan's intent, no scope change:
- Hook: `run()` asserts `DEVFLOW_PROGRESS_GUARD_DIR` is set, so no test can reach the real `~/.claude`. Also added: a pre-existing legacy `.planning/.progress-guard.json` is left byte- and mtime-identical, a missing `session_id` is recorded as `unknown`, prune runs once per session (not on a later call), and the export surface check.
- Telemetry: the legacy file is never read (a streak-8 legacy file gives `worst_streak` 0), a session file with no `project` field is ignored, and `progressGuardDir` defaults to the env override.
- Verified afterwards that `~/.claude/devflow/state/progress-guard` does not exist, so no test wrote to the real home.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: store | `node --test plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs` (24 pass); `rg -n "require\(" progress-guard-store.cjs` shows only fs, os, path | 0 | PASS |
| 2: hook + telemetry | `node --test plugins/devflow/hooks/guard-no-progress.test.js plugins/devflow/devflow/bin/lib/telemetry.test.cjs` (41 pass); `git diff --stat 7ad7b34 -- progress-guard.cjs migrations/` empty; `rg progress-guard.json` in hook and telemetry hits comments only | 0 | PASS |
| 3: docs + suite | `rg -n "progress-guard" CLAUDE.md CHANGELOG.md` shows the new notes; `npm test` 5435 tests, 5402 pass, 1 fail (pre-existing, below), 32 skipped | 1 | PASS with 1 pre-existing unrelated failure |

Manual smoke (job verification block): `echo '{"session_id":"smoke",...}' | DEVFLOW_PROGRESS_GUARD_DIR=<scratch>/pg node plugins/devflow/hooks/guard-no-progress.js` exited 0, created `<scratch>/pg/smoke.json` and left `<scratch>/.planning/` empty.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (store) | `node --test plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (store) | same | 0 (24/24) | PASS (correct) |
| RED (hook + telemetry) | `node --test plugins/devflow/hooks/guard-no-progress.test.js plugins/devflow/devflow/bin/lib/telemetry.test.cjs` | 1 (15 of 41 fail) | FAIL (correct) |
| GREEN (hook + telemetry) | same | 0 (41/41) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | 1 failure, pre-existing and unrelated (see below) |

**The one failing test:** `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` in `handoff-e2e.test.cjs` (a PTY/daemon test that shells out to real `doctl`). It fails identically on the untouched base commit `7ad7b34`, run in a scratch worktree, and `DIGITALOCEAN_TOKEN` is not set here. The test does not reference the progress guard. It is not caused by this change.

## Awareness-cache investigation (read-only, nothing changed)

`.planning/.awareness-cache.json` is written by `lib/awareness.cjs` `writeCache()` (merge semantics), called only from `lib/awareness-cli.cjs` (`scan-peer`, `scan-org`, `show`).

**Events that write it**
- `SessionStart` only, via `hooks/awareness-cache-populate.js` (registered in `hooks.json`, no matcher). It reads the cache, and if the peer and/or org section's `fetched_at` is older than the 10-minute TTL it spawns a detached, fire-and-forget `df-tools awareness scan-peer --no-fetch`, `scan-org`, or `show --refresh --raw` (both stale, or no cache).
- On demand: a user-invoked `/devflow:awareness` or `df-tools awareness ...`.
- Not written from any `PreToolUse`, `PostToolUse` or `UserPromptSubmit` path. `hooks.json` registers only `SessionStart` (sync-runtime, upgrade-project, awareness-cache-populate, classify-session), `Stop`, `SubagentStop`, `UserPromptSubmit` (route-intent, route-results) and `PreToolUse` (gate-commits, changelog-on-tag, gate-interactive, gate-edits, guard-no-progress). None of the non-SessionStart ones touch the awareness cache.

**Expected writes per session:** one to two `writeCache` calls shortly after `SessionStart` (the combined refresh writes peer, then org). `SessionStart` also fires on resume, clear and compact, but the 10-minute TTL gates each refresh, so a section is rewritten at most once per 10 minutes and only when a `SessionStart` fires. Nothing re-checks the TTL mid-session, so TTL expiry alone never causes rewrites.

**Per-call churn:** No. This is not the guard's problem, because there is no per-tool-call write.

**Worth knowing:** the file in this repo is **656,930 bytes (~640KB)**, roughly 250x the old guard file. If the file watcher attaches a change note or diff for it after a refresh, that is a large one-off cost near the start of a session, though bounded to at most a couple per session and not per call. I did not confirm how the harness treats a file this large, and did not change anything. If that turns out to matter, the same fix applies: move it out of `.planning/` (e.g. under `~/.claude/devflow/state/`) or shrink what `scanPeer` stores. Migration 0008 already gitignores and untracks it, so the git side is handled.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (no in-repo write; env/default state dir; per-session isolation; sanitized filenames; once-per-session 24h prune; ladder unchanged; fail-open on unwritable dir and corrupt file; telemetry reads new files scoped to project; `progress-guard.cjs` and migration 0008 unchanged)
- Gate failures: `handoff-e2e` MA-7 (pre-existing on base, unrelated)
- STATE.md and ROADMAP.md were not modified (quick task; ROADMAP excluded by instruction, and the STATE.md quick-task table was left to the orchestrator).

## Self-Check: PASSED

All created and modified files exist; all five task commits are present in `git log`.
