---
objective: 78-remove-the-rename-shims
trd: "05"
subsystem: watch-daemon
tags: [rename, shims, aoforge-watch, watcher-state, pid-file, gate-interactive, handoff]

requires:
  - objective: 73-handoff-gaps-and-result-injection
    provides: the 73-12 watch state directory for the pid file and log, and the one-release reader of the 3.0.0 files in ~/.aoforge/ removed here
  - objective: 72-rename-to-aoforge
    provides: the 72-12 reader of the pre-rename daemon's pid file and its `legacy` record, removed here
provides:
  - "watcher-state reads, writes and removes only pidFilePath() (the watch state directory, or $AOFORGE_HANDOFF_PID_FILE) as the daemon record; no record carries `legacy`; ELEGACYDAEMON and readablePidFile are gone; the module requires only fs/os/path"
  - "watcher-state.interimDaemon() -> null | { pid, file, live }: reads ~/.aoforge/aoforge-watch.pid (where AOForge 3.0.0 kept it) and probes the pid with signal 0 (EPERM live, ESRCH dead); null for no file, malformed JSON, a non-positive-integer pid, or with the override set"
  - "aoforge-watch start refuses with exit 2 while a 3.0.0 daemon is alive, naming its pid and file, `kill <pid>`, the install-service rerun and `aoforge-watch start`; status prints the same text as a stderr `warning:` line (stdout JSON unchanged); logs prints only the watch-state log"
  - "gate-interactive, handoff-results.watcherWatching, watcher-daemon's tick and flutter-ui setup have no branch keyed on a `legacy` record"
  - "daemon-polish-fixtures.seedInterimPid(home, { live, watching }) seeds a 3.0.0 pid file with a self-expiring detached sleeper or an exited child's pid"
affects: [78-06-global-legacy-notices-and-doctor, 78-10-env-alias-removal, 78-11-compat-single-name, 78-12-docs-and-close-out]

tech-stack:
  added: []
  patterns:
    - "A removed read shim whose old reader could still be running gets a read-only detector that names it (pid, file, the stop command) instead of serving from its file"
    - "A liveness probe for a pid read from a user file accepts only a positive integer, so kill(0|negative, 0) never probes a process group"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs
    - plugins/aoforge/aoforge/bin/lib/handoff-results.cjs
    - plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs
    - plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.cjs
    - plugins/aoforge/hooks/gate-interactive.js
    - plugins/aoforge/hooks/gate-interactive.test.js
    - plugins/aoforge/hooks/inject-handoff-results.test.js
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs

key-decisions:
  - "A live 3.0.0 daemon is detected, not adopted. Reason: the user removed the 3.0.0 pid/log readers; without a detector, `aoforge-watch start` would start a second daemon next to one still serving from `~/.aoforge/`. Probing a pid with signal 0 makes nothing work under the old location; it only names what to stop"
  - "interimDaemon() returns null while AOFORGE_HANDOFF_PID_FILE is set: the override already meant 'this file and nothing else', and it keeps override-based tests from refusing because of the real home"
  - "The status warning goes to stderr so the JSON on stdout stays parseable; the JSON itself is unchanged (running:false, no extra field)"
  - "stop, add-project and remove-project ignore the 3.0.0 file entirely (no signal, no rewrite); only start refuses and status warns"
  - "A stale 3.0.0 pid file changes nothing and is left in place: moving it is doctor check 17's job (78-06)"
  - "isWatcherLive() keeps its catch-all probe (any error = not live); only the new detector treats EPERM as live, as the TRD specified"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-16
tokens_input: 17709642
tokens_output: 86330
tokens_cache_read: 17478858
tokens_cache_write: 230588
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 05: The watch daemon reads its pid and log from the runtime home only Summary

One-liner: watcher-state reads, writes and removes one pid file (the watch state directory) and nothing else, `aoforge-watch logs` prints one log, and a daemon AOForge 3.0.0 started is named by a signal-0 detector so `aoforge-watch start` refuses (exit 2, pid, `kill <pid>`, the service reinstall) instead of starting a second daemon beside it.

## Progress
- [x] Task 1: Fixtures and RED tests — 1170213c
- [x] Task 2: GREEN — watcher-state and aoforge-watch — fcd35f5f
- [x] Task 3: GREEN — consumers stop testing for a legacy record — 8f092762

## What changed

- **watcher-state.cjs.** `readPidFile()` reads `pidFilePath()` only; `removePidFile()` removes only that file;
  `addWatchedProject` / `removeWatchedProject` rewrite only that file and throw `ENOPIDFILE` when it is absent.
  Deleted: `readablePidFile`, `legacyDaemonError` (`ELEGACYDAEMON`), both `current.legacy` throws, and the
  fail-open `require` of compat.cjs and legacy-names.cjs. The module now requires only `fs`, `os` and `path`, so a stub
  runtime that copies it alone (the status line) has nothing to fail open on. New `interimDaemon()` reads
  `<home>/.aoforge/aoforge-watch.pid` (`INTERIM_DOT_DIR`, AOForge's own 3.0.0 user directory) and returns
  `{ pid, file, live }`. The header now names one location plus the detector.
- **aoforge-watch.cjs.** `logs` prints `logFilePath()` only (`readableLogFile` and the `resolveUserFile` import are
  gone). `start`, after the `--install-service` chain and before the already-running check, refuses with exit 2 while
  `interimDaemon()` is live:
  `aoforge-watch: an aoforge-watch daemon started by AOForge 3.0.0 is still running (pid N, <file>); this release no longer reads that file. Stop it with `kill N` (a login service: run `aoforge-watch install-service --project <path>` again), then run `aoforge-watch start``.
  The detached start refuses before it spawns anything. `status` prints the same text as
  `aoforge-watch: warning: ...` on stderr after its JSON. The `aliasLegacyEnv` line is untouched (78-10).
- **Consumers.** gate-interactive `readWatcherInfo()` returns watcher-state's record as is; handoff-results
  `watcherWatching` drops `|| info.legacy`; watcher-daemon's tick drops `!pidInfo.legacy &&`; flutter-ui setup drops
  the "predates the rename" advisory branch and keeps the stale-pid advisory.
- **Fixture.** `seedInterimPid(home, { live, watching })` in daemon-polish-fixtures.cjs: `live: true` spawns a
  detached sleeper (`setInterval` plus a 120 s self-exit, so a crashed test cannot leak it) and returns `stop()`;
  `live: false` records the pid of an exited `spawnSync` child.

## Decisions

- **A live 3.0.0 daemon is detected, not adopted.** Reason: the user removed the 3.0.0 pid/log readers; without a
  detector, `aoforge-watch start` would start a second daemon next to one still serving from `~/.aoforge/`. Probing a
  pid with signal 0 makes nothing work under the old location; it only names what to stop.
- With `AOFORGE_HANDOFF_PID_FILE` set the detector reads nothing (null), matching the override's existing "this file
  and nothing else" meaning.
- The status warning is on stderr; the JSON on stdout is byte-for-byte what a clean home prints.
- stop / add-project / remove-project ignore the 3.0.0 file: no signal, no rewrite. A stale 3.0.0 file is left for
  doctor check 17.
- `isWatcherLive()` keeps its catch-all probe; only `interimDaemon()` treats EPERM as live.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The detector accepts only a positive-integer pid**
- **Found during:** Task 2
- **Issue:** a pid file holding `0` or a negative number would make `process.kill(pid, 0)` probe a process group and
  report "live", so `start` would refuse forever on a corrupt file.
- **Fix:** `interimDaemon()` returns null unless `Number.isInteger(pid) && pid > 0`. Test 14d covers a non-numeric
  pid and JSON null (1170213c) and, added after the suite run, pid 0, -1 and 1.5 (ce9a3409).
- **Files modified:** watcher-state.cjs, watcher-state.test.cjs
- **Commit:** fcd35f5f (tests in 1170213c and ce9a3409)

### Additions beyond the test list

- watcher-state test 15: the module's `require`s are exactly `fs`, `os`, `path`, and a copy of it alone in a scratch
  directory reads the record and the detector (the TRD's "should not need compat at all").
- watcher-state test 14e (override set -> null) and 14f (the detector never writes or removes the 3.0.0 file).
- aoforge-watch: stop / add-project / remove-project leave a live 3.0.0 daemon and its file alone; the detached start
  refuses too.
- Case 7 asserted directly: a `legacy` key inside the daemon's own record changes nothing in handoff-results (14f),
  watcher-daemon (D-5b) and gate-interactive. These were written with Task 3 (the TRD places case 7 there) and shown
  to fail on the pre-Task-3 consumers by reverse-applying the source diff: exactly those 3 failed (261/264 pass), then
  the diff was re-applied.
- watcher-daemon.test.cjs and inject-handoff-results.test.js are outside `files_modified` but named by Task 3's
  action/verify; the first gained D-5b, the second only a corrected comment.
- file-identities test 7: two comments only ("refused: the legacy daemon" -> "refused: no daemon record"); its code is
  78-11's.

## Hand-off (outside this TRD's files)

- **78-12 (docs):** `docs/MIGRATING-TO-AOFORGE.md:85` and `site/content/docs/getting-started/migrating-to-aoforge.md:89`
  still describe `ELEGACYDAEMON`; `docs/USER-GUIDE.md:136` says status/stop see the pre-rename daemon and add/remove
  refuse it with `ELEGACYDAEMON`; `CLAUDE.md:69` (the `watchStateDir` clause) says watcher-state and status/stop/logs
  still read 3.0.0's files in `~/.aoforge/`. None is true after this TRD. The new start refusal / status warning
  should be documented.
- **78-11 or 78-12:** `__fixtures__/handoff-fixtures.cjs` `writePidFile` doc comment (lines 100-101) still says
  watcher-state reads the pre-rename file "and marks `legacy`". The `legacy: true` option itself is still useful (it
  writes a file at the pre-rename location for "not read" tests).
- **78-06 (doctor 17):** unchanged contract: the 3.0.0 pid file and log are still left in `~/.aoforge/` for check 17
  to move; while the 3.0.0 daemon is alive check 17 stays report-only, and `aoforge-watch start` now says the same.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test watcher-state.test.cjs aoforge-watch.test.cjs hooks/gate-interactive.test.js file-identities.legacy.test.cjs` | 1 | PASS (expected fail: 20 failures, all new or rewritten cases; 256 pass) |
| 2: GREEN watcher-state + CLI | `node --test watcher-state.test.cjs aoforge-watch.test.cjs file-identities.legacy.test.cjs` | 0 | PASS (98/98, 0 skipped); `rg -n "ELEGACYDAEMON\|legacyName\|resolveUserFile\|LEGACY"` over watcher-state.cjs and aoforge-watch.cjs finds nothing |
| 3: GREEN consumers | `node --test hooks/gate-interactive.test.js hooks/inject-handoff-results.test.js handoff-results.test.cjs flutter-ui-setup.test.cjs watcher-daemon.test.cjs` | 0 | PASS (325/325, 0 skipped); `rg -n "\.legacy\b"` over the four consumers finds nothing |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (cases 1-6) | the Task 1 verify set | 1 | FAIL (correct): 20 fail on the old behaviour (3.0.0 log printed, "already running" instead of the 3.0.0 refusal, no status warning, stop signals the 3.0.0 daemon, start clears the stale 3.0.0 file, `interimDaemon` not a function, legacy record read, ELEGACYDAEMON, export surface) |
| RED (case 7) | Task 3 tests with the consumer diff reverse-applied | 1 | FAIL (correct): exactly 14f, D-5b and the gate-interactive case-7 test |
| GREEN (Task 2) | the Task 2 verify set | 0 | PASS (correct) |
| GREEN (Task 3) | the Task 3 verify set | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` file set minus `watcher-shell.test.cjs` (393 files; runner `run-suite-78-05.cjs` in the session scratchpad; `node_modules` symlinked from the main checkout, not committed), after Task 3 | 1 | 12550 tests, 12518 pass, 3 fail, 29 skipped (112.0 s). No failure comes from this TRD's code, so it is not a clean PASS |

The 3 failures:
- `requirements-agreement.repo.test.cjs` 11 and `validate-requirements.test.cjs` 9: EST-11 / objective 75, present at
  the wave base (known, not fixed here).
- `roadmap-reconcile.test.cjs` E2E1 (zero drift in this repo's ROADMAP): reported `78-05` as `trd_summary_exists`
  because the Task 3 progress checkpoint had every task ticked while ROADMAP.md still had `- [ ] 78-05`. That is the
  in-flight state of this TRD; `roadmap update-job-progress 78` in the close-out ticks the line (re-run below).

`watcher-shell.test.cjs` was excluded on purpose: its W-3 fish-shell test hangs to timeout on this machine.

Skipped (29): GIT_INTEGRATION / GH_INTEGRATION / live-home cases, pwsh PW-8/PW-9 (no pwsh), the aoedge STACK.md
case, and 0012 9/9b (78-07). No node-pty suite skipped: with `node_modules` linked, the aoforge-watch attended
terminal (AT-E2E-1/2, AT-CLI-1..4) and handoff-e2e suites ran and passed.

After ce9a3409: `watcher-state.test.cjs` 47/47.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (one pid record, no `legacy`, no ELEGACYDAEMON; logs prints one log; interimDaemon
  reports without adopting, start exit 2 naming pid / `kill <pid>` / install-service, status warns; the four
  consumers have no `legacy` branch)
- Key link: `aoforge-watch.cjs` `cmdStart` -> `watcher-state.interimDaemon` (through `liveInterimDaemon()`)
- `rg -n "os.homedir\(\)"` over watcher-state.test.cjs and aoforge-watch.test.cjs: nothing. Every test sets a scratch
  HOME; the real `~/.aoforge/` does not exist on this machine and was never written
- `rename-guard.repo.test.cjs`: PASS (26/26)
- Gate failures: none caused by this TRD (see Validation Gate Results)
- Requirements: SC-1 is an objective-wide success criterion; this TRD covers its watch-daemon share and it closes with
  the objective, so `requirements-completed` stays empty (as in 78-04)

## Self-Check: PASSED

- FOUND: commits 1170213c, fcd35f5f, 8f092762, ce9a3409 (`git log --oneline 5eb8c38e..HEAD`)
- FOUND: all 14 key files and this SUMMARY, tracked (`git ls-files --error-unmatch`); working tree clean
- No sleeper process leaked after the RED and GREEN runs (`pgrep` finds none)
