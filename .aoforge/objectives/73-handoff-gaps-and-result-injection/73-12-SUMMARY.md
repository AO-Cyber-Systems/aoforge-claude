---
objective: 73-handoff-gaps-and-result-injection
trd: "12"
subsystem: watcher
tags: [watcher, aoforge-watch, runtime-home, watcher-allowlist, gate-interactive, gap-closure, G5]

requires:
  - objective: 73
    provides: "73-10: interactive-commands.cjs (matchInvocations, labelled INTERACTIVE_PATTERNS, CMD_POS) and the shared case table __fixtures__/interactive-command-cases.cjs; gate-interactive reads the daemon through watcher-state.readPidFile"
  - objective: 73
    provides: "73-11: compat.watchStateDir and compat.resolveUserFile (current / interim / legacy, with currentDir)"
provides:
  - "watcher-state writes the pid file to <home>/.claude/aoforge/state/watch/aoforge-watch.pid (AOFORGE_HANDOFF_PID_FILE still overrides, and then nothing else is read); WATCH_DIR_SEGMENTS exported and pinned equal to compat.watchStateDir"
  - "aoforge-watch writes its log to <home>/.claude/aoforge/state/watch/aoforge-watch.log; `logs` falls back to the 3.0.0 log for one release"
  - "A 3.0.0 pid file (<home>/.aoforge/aoforge-watch.pid) is read as the same AOForge daemon (no legacy flag); add/remove-project rewrite that file; removePidFile clears it"
  - "watcher-allowlist built-ins are interactive-commands.INTERACTIVE_PATTERNS (marked builtin) validated per invocation with matchInvocations: the daemon accepts exactly what gate-interactive hands off"
affects: [73-13 service logs and doctor check, 73-14 docs, aoforge-watch, gate-interactive, statusline watcher segment, flutter-ui setup]

tech-stack:
  added: []
  patterns:
    - "A writer writes one place, a reader resolves through compat.resolveUserFile with currentDir; the one-release interim location is read and cleared, never written"
    - "One matcher for the hook and the daemon: built-in allowlist entries carry the shared module's own RegExp objects, so a test can pin `strictEqual` identity and no second copy can drift"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs
    - plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.test.cjs
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
    - plugins/aoforge/hooks/gate-interactive.test.js

key-decisions:
  - "The 3.0.0 pid file is the same AOForge daemon, not legacy: it is read for status/stop/start/isWatcherLive/gate-interactive, add/remove rewrite it (that daemon rereads its own file), and removePidFile clears it; the pre-rename file stays legacy, read last, never written or removed"
  - "Daemon built-in allowlist entries are the shared matcher's own patterns, validated per invocation; a hit wins, a skipped call is refused as non-interactive, user entries keep whole-command regex semantics, the deny list still runs first on the whole text"

patterns-established:
  - "CLI tests that signal a child of the test process run the CLI asynchronously (runCliAsync): a zombie still answers kill(pid, 0)"

requirements-completed: [HND-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 26min
completed: 2026-10-10
tokens_input: 28441627
tokens_output: 98928
tokens_cache_read: 27992961
tokens_cache_write: 448390
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 73 TRD 12: The watch daemon's pid file and log live in the watch state directory Summary

**aoforge-watch now keeps its pid file and log in `~/.claude/aoforge/state/watch/` and never creates `~/.aoforge/`; a daemon started by 3.0.0 is still found, updated and cleared for one release; and the daemon's built-in allowlist is gate-interactive's own per-invocation matcher, so it runs exactly what the hook hands off.**

## Progress

- [x] Task 1: RED, the daemon's files in the watch directory, the 3.0.0 read, and hook/daemon agreement — c2121c3f
- [x] Task 2: GREEN, watcher-state and aoforge-watch on the watch directory; the allowlist on the shared matcher — 058ba810 (pid file and log), 48412588 (allowlist)
- [x] Task 3: neighbours follow the layout; gate-interactive pinned on it — 61064803

## Resolution order as built

Pid file (`watcher-state.readablePidFile`, through `compat.resolveUserFile(home, 'aoforge-watch.pid', { legacyName: 'devflow-watch.pid', currentDir: <watch dir> })`), first existing file wins:

| Order | Path | Record | Written | Removed by removePidFile |
|---|---|---|---|---|
| override | `$AOFORGE_HANDOFF_PID_FILE` | as read | yes | yes (nothing else is read or removed) |
| 1 current | `<home>/.claude/aoforge/state/watch/aoforge-watch.pid` | as read | yes (the only write target) | yes |
| 2 interim | `<home>/.aoforge/aoforge-watch.pid` (AOForge 3.0.0) | as read, no `legacy` key | only by add/remove-project when it is the file read | yes |
| 3 legacy | `<home>/.devflow/devflow-watch.pid` (pre-rename) | `legacy: true` | never (add/remove throw ELEGACYDAEMON) | never |

Without `compat.cjs` beside it (stub runtimes that copy watcher-state alone, e.g. the status-line fixture) only the current path is read.

Log (`aoforge-watch`): the daemon writes `logFilePath()` = `watchStateDir(home)/aoforge-watch.log`; `logs` prints `readableLogFile()` = `resolveUserFile(home, 'aoforge-watch.log', { currentDir: watchStateDir(home) }).file`, so the watch-directory log, else the 3.0.0 log at `<home>/.aoforge/aoforge-watch.log`, else `(no log file yet)`.

## Agreement result (hook vs daemon, from the RED run)

The old regex allowlist disagreed with gate-interactive on 12 rows of 73-10's case table, all fixed:

- Gated by the hook but refused by the old daemon (2): `ssh-keygen -y -N "" -f k` (the `(?!.*\s-N\s)` lookahead) and `gh auth login; echo --with-token` (whole-command skipIf).
- Not gated by the hook but accepted by the old daemon (10): `rg "a|ssh-keygen" file` (quoted `|` read as a pipe), the three heredoc-data rows (`cat > notes.md <<'EOF'`, `<<EOF`, `<<-EOF` with `npm login` in the body), the five read-only key rows (`ssh-keygen -lf key.pub`, `-l -f key.pub`, `-E sha256 -lf key.pub`, `-F github.com`, `-R github.com`) and `ssh-keygen -y -f k -P ""`.
- Item 19's extra case `rg "a|npm login" f` was also accepted by the old daemon; it is refused now.

No case-table row needed changing; `interactive-commands.cjs` and the case table are untouched.

## Tests that pin the one-release 3.0.0 read

These go with the shims in the release after 3.0.0:

- `watcher-state.test.cjs`: TRD 73-12 items 7 (override ignores a 3.0.0 file), 9, 10, 11 and 12 (`interimPidFile` helper).
- `aoforge-watch.test.cjs`: TRD 73-12 items 2 (3.0.0 log), 3, 4 and 5 (`interimFile` helper).
- `hooks/gate-interactive.test.js`: TRD 73-12 item 14, "a live pid file only where AOForge 3.0.0 kept it".
- `watcher-allowlist.test.cjs`: 73-11's interim allowlist tests (unchanged here).

## Task Commits

1. **Task 1: RED** — `c2121c3f` (test)
2. **Task 2: GREEN pid file and log** — `058ba810` (fix)
3. **Task 2: GREEN allowlist on the shared matcher** — `48412588` (fix)
4. **Task 3: neighbours and gate-interactive item 14** — `61064803` (test)

## Accomplishments

- `watcher-state.cjs`: `PID_DIR_NAME` replaced by `WATCH_DIR_SEGMENTS` (exported, frozen, pinned equal to `compat.watchStateDir`) and `INTERIM_DOT_DIR`; `readablePidFile` goes through `compat.resolveUserFile` with `currentDir` and reports `{ file, legacy, interim }`; `readPidFile` still marks only `legacy`; `removePidFile` removes the current and the 3.0.0 file (never the pre-rename one, and only the override file when the override is set); add/remove write the file they read. Header rewritten.
- `aoforge-watch.cjs`: `LOG_DIR_NAME` gone; `logFilePath()` is in `watchStateDir`, `readableLogFile()` feeds `logs`; the header's `logs` entry names the new path and the one-release fallback.
- `watcher-daemon.cjs`: the audit comment names the new log path.
- `watcher-allowlist.cjs`: the 23 `rx()` built-ins are gone; `DEFAULT_PATTERNS` is `INTERACTIVE_PATTERNS` mapped to frozen `{ label, match, builtin: true }`; `validateCommand` keeps empty / length / deny / empty-allowlist first and unchanged, then `matchInvocations` for built-ins (hit accepts with its label, a skipped call is refused with the unchanged non-interactive reason), then today's loop for user entries only; `CMD_POS` comes from the shared module (deny list only); header NOTE rewritten.
- Tests: watcher-state items 7-13 and EX-1, CLI items 1-6, allowlist items 16-20 (case table rows run through the hook and the daemon), gate-interactive item 14; handoff-e2e, flutter-ui-setup, daemon-polish fixtures and file-identities 6b moved to the current layout.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test watcher-state.test.cjs aoforge-watch.test.cjs watcher-allowlist.test.cjs` | 1 | PASS (red as required): 173 tests, 37 fail |
| 2: GREEN | `node --test watcher-state.test.cjs aoforge-watch.test.cjs watcher-allowlist.test.cjs watcher-daemon.test.cjs handoff-results.test.cjs hooks/statusline.test.js` (plus interactive-commands.test.cjs and hooks/gate-interactive.test.js) | 0 | PASS: 543 tests, 543 pass |
| 3: neighbours | `node --test handoff-e2e.test.cjs flutter-ui-setup.test.cjs file-identities.legacy.test.cjs hooks/gate-interactive.test.js` | 0 | PASS: 234 tests, 234 pass, 0 skipped |
| 3: full suite | `npm test` | 1 | PASS (no new failures): 12,485 tests, 12,452 pass, 32 skipped, 1 fail (E2E1, see Issues) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test watcher-state.test.cjs aoforge-watch.test.cjs watcher-allowlist.test.cjs` | 1 | FAIL (correct): 37 of 173. watcher-state 8 (pidFilePath path, items 7, 8, 9, 10, 11, 13, EX-1); CLI 14 (every test that waits for or pre-writes the watch-directory pid, the log tests, items 1, 2 and 4, C-1/C-2/C-7/C-8/C-9, AT-E2E-1's log read); allowlist 15 (the 12 agreement rows listed above, item 19's two cases, item 20). Items 3, 5 and 12 passed against the old code, where the 3.0.0 path was the current path: they are regression guards, as 18 and the existing allowlist tests are |
| GREEN (pid, log) | `node --test watcher-state.test.cjs aoforge-watch.test.cjs` | 0 | PASS (correct): 66/66 |
| GREEN (allowlist) | `node --test watcher-allowlist.test.cjs` | 0 | PASS (correct): 107/107 |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test watcher-state.test.cjs aoforge-watch.test.cjs watcher-allowlist.test.cjs handoff-e2e.test.cjs` (covered by the Task 2 and Task 3 runs) | 0 | PASS |
| test (full) | `npm test` | 1 | PASS for this TRD: the only failure is E2E1 (ROADMAP drift from this TRD's own checkpoint SUMMARY, cleared by the end-of-TRD roadmap update) |
| lint | not_available | n/a | not_available |
| build | not_available | n/a | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] daemon-polish fixture moved in Task 2, not Task 3**
- **Found during:** Task 2 (its verify set includes `hooks/statusline.test.js`)
- **Issue:** the status-line fixture copies `watcher-state.cjs` alone into the temp runtime home, with no `compat.cjs` beside it, so it reads only the watch-directory pid file; with the fixture still writing `~/.aoforge/`, 9 status-line tests (A-1..A-7, F-2, P-2) failed
- **Fix:** `buildPidFileFixture` and `buildStatuslineEnv` write `watchStateDir(home)/aoforge-watch.pid`, JSDoc updated (it also says why the stub has no fallback)
- **Files modified:** `plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs`
- **Commit:** 058ba810

**2. [Rule 1 - Bug] CLI tests C-1 and C-2 leaked their daemon on a failed assertion**
- **Found during:** Task 1 (the RED run hung)
- **Issue:** both tests read the pid file before their `try/finally` killed the daemon, so a missing file left a foreground daemon running with the test's pipes open and the test file never exited (two leaked test daemons in temp HOMEs, stopped by pid; the user's watcher was not touched)
- **Fix:** `endDaemon` (SIGTERM, then SIGKILL past the stop budget) in `finally`; item 4 uses it too
- **Files modified:** `aoforge-watch.test.cjs`
- **Commit:** c2121c3f

**3. [Rule 1 - Bug] item 1 waits for the daemon's signal handlers before SIGTERM**
- **Found during:** Task 2
- **Issue:** the daemon installs its SIGTERM handler a few synchronous steps after writing its pid file; a SIGTERM in that window ends it by the default action, leaving the pid file, which would make item 1's "pid file removed on exit" assertion flaky
- **Fix:** item 1 waits for the `(un)attended:` line, printed just before the handlers, as AT-CLI-1 already does
- **Files modified:** `aoforge-watch.test.cjs`
- **Commit:** 058ba810

**4. [Scope] user allowlist writers in the CLI test moved to the runtime home**
- `aoforge-watch.test.cjs` `writeAttendAllowFile` (not listed in the TRD's line references) wrote `~/.aoforge/aoforge-watch-allow.json`; it now writes `compat.runtimeHome(home)`, like handoff-e2e's `writeAllowFile` and `writeMockAllowFile`, so no test daemon run creates `~/.aoforge/`.

## Issues Encountered

- Full suite E2E1 in `roadmap-reconcile.test.cjs` fails on ROADMAP drift: this TRD's checkpoint SUMMARY exists while its ROADMAP line is unticked. 73-10 saw the same; the end-of-TRD `roadmap update-job-progress` clears it.
- Item 14 in gate-interactive passed on first run, as the TRD expected: it pins 73-10's wiring (the hook reads the daemon through watcher-state) on the new layout.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 truths (pid and log in the watch directory; no `<home>/.aoforge` after start/stop; the 3.0.0 pid read as AOForge by status, stop, start, isWatcherLive, gate-interactive and add/remove; removePidFile clears new + 3.0.0, never pre-rename; pre-rename stays legacy; logs falls back to the 3.0.0 log; WATCH_DIR_SEGMENTS pinned to watchStateDir; every GATED row accepted with its label and every NOT_GATED row refused; allowlist contract kept)
- `rg -n "PID_DIR_NAME|LOG_DIR_NAME" plugins/aoforge/aoforge/bin` finds nothing; `WATCH_DIR_SEGMENTS` and `INTERIM_DOT_DIR` are in watcher-state.cjs; `watchStateDir` is in aoforge-watch.cjs; `matchInvocations` / `interactive-commands` are in watcher-allowlist.cjs and `rx(` appears only in the helper and the two deny entries
- `rg -n -e "'\.aoforge', 'aoforge-watch" plugins/aoforge -g '*.test.*' -g '__fixtures__/*'` prints one line, gate-interactive item 14's deliberate 3.0.0 pid file
- Gate failures: None

## Self-Check: PASSED

- Commits c2121c3f, 058ba810, 48412588 and 61064803 are on `df/exec-73-12-watch-daemon-state-dir` (base 2300e640).
- FOUND: watcher-state.cjs, aoforge-watch.cjs, watcher-allowlist.cjs, watcher-allowlist.test.cjs, 73-12-SUMMARY.md.
- No test daemon left running from this worktree; no stray `.aoforge-handoff/pending` record; none of 73-13's files touched.
