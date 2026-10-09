---
objective: 73-handoff-gaps-and-result-injection
job: "05"
subsystem: handoff-watcher
tags: [pty, attended, raw-mode, node-pty, respawn, proxy, foreground]

requires:
  - objective: 73-01
    provides: the in-band PTY dispatch (one source line per dispatch; Ctrl+C ends in END:130)
  - objective: 73-03
    provides: "attachDataListener(fn, { liveOnly: true }), the live command window with no sentinel text"
provides:
  - "watcher-attend.cjs createSessionHandle({ makeSession, log }): a ShellSession facade that respawns a dead shell before the next dispatch"
  - "watcher-attend.cjs attachTerminal(handle, { input, output, log }): mirror, key forwarding and framing around each dispatch"
  - "aoforge-watch start --foreground is attended when stdin and stdout are TTYs; --no-attend and AOFORGE_WATCH_UNATTENDED=1 opt out"
affects: [73-07 live TTY demonstration, 73-08 docs and close-out]

tech-stack:
  added: []
  patterns:
    - "A Proxy facade over a mutable current session: own methods for spawn/dispatch/kill/listeners, everything else forwarded at call time with all arguments"
    - "The facade keeps a registry of attached listeners and re-attaches them to a respawned shell"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
    - .aoforge/ROADMAP.md

key-decisions:
  - "The facade owns a listener registry and re-attaches it to a respawned shell, because processOnce attaches its prompt detector BEFORE it calls dispatch (a respawn inside dispatch would otherwise leave the detector on the dead shell)"
  - "The command text and id in the start/end lines are stripped of control characters and the command is capped at 200 characters, so a pending record cannot drive the user's terminal through the framing"
  - "The unattended/attended line is a second line after the unchanged 'started (pid N, projects X)' line; the log gets an info line for it too"
  - "finish() in runForeground calls the terminal detach so an exit mid-dispatch leaves the terminal in its normal mode"

patterns-established:
  - "Tests that play the user: run the daemon under node-pty, read what it prints, type into it, never use inputs.secrets"
  - "Look for a prompt AFTER the dispatch frame in the daemon's terminal output: the start line quotes the command text, so the prompt text also appears there"

requirements-completed: [HND-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-09
tokens_input: 9795272
tokens_output: 78830
tokens_cache_read: 9619179
tokens_cache_write: 175967
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 73 TRD 05: Attended watch terminal Summary

**`aoforge-watch start --foreground` run in a terminal now mirrors a queued command's live output there and forwards the keys typed there to the command, so the user answers the prompt themselves (done record `status done`, `exit_code 0`, stdout `hello ada`); Ctrl+C during a command ends it with exit 130 while the daemon keeps serving; a dead shell is replaced before the next dispatch.**

## Progress
- [x] Task 1: Fakes and RED tests for the facade and the terminal attachment - 4ba9c263
- [x] Task 2: GREEN, watcher-attend.cjs - 1bf3cc3d
- [x] Task 3: runForeground attended, and the end-to-end PTY test that plays the user - 4c4ee4fa (RED), 1c32b9ba (GREEN)

## Performance

- **Tasks:** 3 of 3
- **Files modified:** 5 (the 4 in the TRD's files_modified, plus ROADMAP.md through `roadmap update-job-progress`)
- **Commits:** 4ba9c263 (RED, module), 1bf3cc3d (GREEN, module), 4c4ee4fa (RED, CLI), 1c32b9ba (GREEN, CLI)

## Accomplishments

- The command to start the attended watch terminal (for 73-07), from this checkout: `node /Users/justin/dev/aoforge-claude/plugins/aoforge/aoforge/bin/aoforge-watch.cjs start --foreground --project <project dir>` (add `--shell zsh` or `--shell bash`; the default is `$SHELL`). It must be run in a real terminal. The installed 3.0.0 runtime does not carry this TRD.
- End to end under a real PTY, the daemon mirrors `Your name: ` into its own terminal; the test types `ada\r` there as the user would; the done record is `status 'done'`, `exit_code 0`, stdout contains `hello ada`. The daemon's terminal showed the start line (id, command, bell) and `att-1 finished: done (exit 0)`. The log holds `dispatching att-1:` and `completed att-1 status=done exit=0` and no `ada`.
- Ctrl+C (`\x03` typed in the daemon terminal) during `bash -c 'echo started-73; exec sleep 30'` gives a done record with `exit_code 130` well under 5 s, the daemon pid stays alive, and a second pending command completes.
- `--no-attend`, `AOFORGE_WATCH_UNATTENDED=1` and piped stdio each print `aoforge-watch: unattended: ...`; the unattended run prints no frame and no bell. The `aoforge-watch: started (pid N, projects X)` line is byte for byte unchanged and stays first.
- `createSessionHandle` against a REAL `ShellSession` (scratch smoke, not committed): after a 1.5 s dispatch timeout kills the shell, the next dispatch logs `respawned shell` and completes; a live-only listener attached before the timeout still saw the later output; after `kill()` a dispatch rejects with `ShellSessionClosed` and no shell is made.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (commit 4ba9c263) | `node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs` | 1 (23 tests, 23 fail, every one `Cannot find module './watcher-attend.cjs'`) | FAIL (correct) |
| GREEN (commit 1bf3cc3d) | same | 0 (23 pass, 0 fail) | PASS (correct) |
| RED (commit 4c4ee4fa) | `NODE_PATH=<main>/node_modules node --test --test-name-pattern="TRD 73-05" plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs` | 1 (6 tests, 6 fail) | FAIL (correct) |
| GREEN (commit 1c32b9ba) | same | 0 (6 pass; 5 consecutive runs) | PASS (correct) |

RED failures on the pre-73-05 code, captured before any source change:

| Test (TRD item) | Observed on the old code |
|---|---|
| AT-E2E-1 (1, 2) | `the attended startup line within 15000ms (terminal tail: "aoforge-watch: started (pid 37781, projects /var/folders/.../dfw-cli-Qjtu3L)\r\n")`: no attended line, so no mirror and no forwarding |
| AT-E2E-2 (3) | same: no attended line |
| AT-CLI-3 (5, `--no-attend`) | `the unattended startup line within 15000ms`: only the started line existed |
| AT-CLI-4 (5, env) | same |
| AT-CLI-1 (4, piped) | `the unattended startup line within 15000ms (... "aoforge-watch: started (pid 72588, ...)\n")` |
| AT-CLI-2 (header) | the `start` entry in the header comment did not mention `--no-attend` |
| SH-1..SH-6, FW-1..FW-5, AT-1..AT-12 (6 to 11) | `Cannot find module './watcher-attend.cjs'` |

A first RED run of the CLI group showed four false passes in about 2 ms each: `test(name, attendPtySkip, { timeout }, fn)` passed four arguments to a three-argument function, so the callback was never run. Skip and timeout now travel in one options object (`attendOpts`) and the RED run above is the corrected one.

Test-list mapping: TRD item 1 and 2 = AT-E2E-1, 3 = AT-E2E-2, 4 = AT-CLI-1, 5 = AT-CLI-3 and AT-CLI-4, 6 = SH-1..SH-4, 7 = FW-1..FW-3, 8 = AT-1, 9 = AT-3, 10 = AT-4, 11 = AT-5 and AT-6. Additions: SH-5 (failed respawn retries), SH-6 (dispatch before spawn), FW-4 (listeners follow the respawn), FW-5 (not a thenable), AT-2, AT-7..AT-12, AT-CLI-2.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs` (expected non-zero; 23 of 23 fail on the missing module) | 1 | PASS (RED as designed) |
| 2: GREEN | `node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs` | 0 | PASS (23 of 23) |
| 3: CLI and e2e | `NODE_PATH=<main>/node_modules node --test aoforge-watch.test.cjs lib/watcher-attend.test.cjs handoff-e2e.test.cjs lib/watcher-daemon.test.cjs lib/watcher-shell.test.cjs`; PTY tests ran (not skipped) | 0 | PASS (191 tests, 189 pass, 0 fail, 2 skipped = fish and pwsh not installed) |

### End-to-end (TRD verification row)

AT-E2E-1, the PTY test that plays the user, passed and was not skipped. Done record: `status 'done'`, `exit_code 0` (stdout `hello ada`). AT-E2E-2 done record: `exit_code 130`; the follow-up command `bash -c 'echo again-73'` is `status 'done'`.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on the five watcher files above | 0 | PASS |
| test (full) | `NODE_PATH=<main>/node_modules npm test` | 1 | 12,157 tests, 12,124 pass, 1 fail, 32 skipped. The one failure is not this TRD's (see below). Before this TRD the base is 73-04's tip; 73-03 reported 12,101 tests; this TRD adds 29 (23 + 6) |
| lint | not configured | not_available | not_available |
| build | not configured | not_available | not_available |

The one full-suite failure is `doctor-checks/11-12-install.test.cjs` test 11, "the SHIPPED plugin hooks/ + plugin.json are consistent": `hook file(s) neither registered nor marked DRAFT: hooks/inject-handoff-results.js`. That file arrived with 73-04 and is registered by 73-06 (hooks.json), which runs in parallel in this wave. None of the files this TRD touched is involved; the test passes once 73-06 lands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Listeners follow a respawn**
- **Found during:** Task 1 (designing the facade against processOnce)
- **Issue:** The TRD's facade forwards `attachDataListener` to the current shell. processOnce attaches its prompt detector BEFORE it calls `dispatch`; if that dispatch then respawns the shell, the detector would stay on the dead one and a token-passing command following a timeout would never be answered.
- **Fix:** The handle records `{ fn, opts }` for every listener attached through it, drops it on detach, and re-attaches the survivors (with their options) to a respawned shell before the dispatch runs. Tests FW-4 and AT-12.
- **Files modified:** `watcher-attend.cjs`, `watcher-attend.test.cjs`
- **Commit:** 4ba9c263, 1bf3cc3d

**2. [Rule 2 - Missing critical functionality] The framing cannot drive the user's terminal**
- **Found during:** Task 2
- **Issue:** The start line prints the handoff id and command from a record on disk. A command with escape sequences could move the cursor, retitle the window or reorder text.
- **Fix:** Control characters (C0, DEL, C1, U+2028/2029, bidi overrides) become spaces in the id, command and status; the command is capped at 200 characters. The command's OWN output is still mirrored verbatim. Test AT-9.
- **Files modified:** `watcher-attend.cjs`, `watcher-attend.test.cjs`
- **Commit:** 4ba9c263, 1bf3cc3d

**3. [Rule 2 - Missing critical functionality] A multi-byte key is forwarded whole**
- **Found during:** Task 2
- **Issue:** The TRD's forwarder does `buf.toString('utf8')` per chunk, which corrupts a character split across two reads.
- **Fix:** A `StringDecoder` per dispatch. Test AT-8.
- **Commit:** 4ba9c263, 1bf3cc3d

**4. [Rule 1 - Bug in the plan's test approach] The prompt text is also in the start line**
- **Found during:** Task 3
- **Issue:** The TRD has the test wait for `Your name:` in the daemon's terminal output, but the start line quotes the command text, which contains `Your name: `. The test would type `ada` before the command had even started (and `started-73` in AT-E2E-2 likewise).
- **Fix:** `afterFrame()` looks for the prompt after the frame's second line (`Ctrl+C interrupts the command`). The TRD's command is used unchanged. The node-pty terminal doubles the carriage return (`\r\r\n`, ONLCR), so the marker is matched without its line ending.
- **Files modified:** `aoforge-watch.test.cjs`
- **Commit:** 4c4ee4fa, 1c32b9ba

**5. [Rule 2 - Missing critical functionality] The terminal is restored on any exit**
- **Found during:** Task 3
- **Issue:** `finish()` ends the process with `process.exit`; the shutdown deadline can fire while a dispatch holds the terminal in raw mode.
- **Fix:** `finish()` calls the terminal's detach function first.
- **Files modified:** `aoforge-watch.cjs`
- **Commit:** 1c32b9ba

### Notes (not deviations)

- Task 3 has two commits (RED tests 4c4ee4fa, GREEN 1c32b9ba), the same RED/GREEN split as the other tasks.
- A bare worktree has no `node_modules`; the PTY tests ran with `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules`. Nothing under version control changed.
- `roadmap update-job-progress 73` was run before the full-suite run and ticked this TRD's box.
- My first attempt to edit `aoforge-watch.cjs` with a Python heredoc through Bash was caught by the gate-interactive hook: the comment text I was inserting named a key-generation tool, which the hook reads as a TTY command. It queued `.aoforge-handoff/pending/h-2fa44a27.json` in the MAIN checkout. No daemon was running; I deleted that stray record and made the edits with the Edit tool. A false positive worth knowing: the hook scans the whole command text, so a heredoc that merely mentions such a tool is gated.

## Known limitations (for 73-07 and 73-08)

- **Typeahead:** with the terminal in its normal mode between commands, stdin is paused, so anything typed while no command runs sits in the kernel's tty queue and is delivered to the NEXT command when its dispatch starts. Type nothing between commands. Fixing it needs a input flush (not available from Node without a native call) or a read-and-discard loop while idle; neither is in this TRD.
- **PTY size:** the daemon's inner PTY stays 80x24 whatever the user's terminal is (TRD anti-pattern: not resized here; 73-08 documents it).
- **No echo:** the inner PTY keeps echo off (by design), so what the user types at a plain `read` is not shown; a tool that wants echo turns it on itself.
- **Stopping during a command:** in raw mode Ctrl+C goes to the command, not the daemon. To stop the daemon mid-command use `aoforge-watch stop` from another terminal.

## Auth gates

None.

## Discovered commands

None. `.aoforge/STACK.md` provides `npm test` with the scoped form `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (attended mirror and key forwarding under a real PTY; normal mode outside a dispatch and Ctrl+C reaching the command with the daemon alive; no key logged or stored, log keeps only dispatch and completion lines; `--no-attend`, the env var and non-TTY run unattended with dispatch unchanged; start and end frames with the bell and no input echoed; respawn with `respawned shell` and no respawn after `kill()`; facade forwards all methods and arguments including `{ liveOnly: true }`; end-to-end `hello ada`)
- `rg -n "createSessionHandle\(|attachTerminal\(" plugins/aoforge/aoforge/bin/aoforge-watch.cjs` finds both; `rg -n "liveOnly: true" plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs` finds the mirror.
- Gate failures: the full suite's one failure belongs to 73-04/73-06 (hook registration), not this TRD.

## Issues Encountered

- Four false passes in the first RED run of the CLI tests (a wrong `test()` argument shape), and `\r\r\n` instead of `\r\n` from the node-pty terminal, both test-side and fixed (see TDD Evidence and deviation 4).

## Next Phase Readiness

73-07 can run the attended daemon live with the command in Accomplishments. 73-08 should document: the attended/unattended rule and `--no-attend`, `AOFORGE_WATCH_UNATTENDED=1`, Ctrl+C semantics, the typeahead limitation, the 80x24 PTY, and that the respawn log line is `respawned shell`.

## Self-Check: PASSED

- Files: watcher-attend.cjs, watcher-attend.test.cjs, aoforge-watch.cjs and aoforge-watch.test.cjs are present and modified in the worktree.
- Commits: 4ba9c263, 1bf3cc3d, 4c4ee4fa and 1c32b9ba exist on branch df/exec-73-05-attended-watch-terminal.
