---
objective: 73-handoff-gaps-and-result-injection
trd: "05"
type: standard
wave: 3
depends_on: ["73-03"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
autonomous: true
requirements: [HND-03]
must_haves:
  truths:
    - "`aoforge-watch start --foreground` run in a terminal (stdin and stdout are TTYs) is attended: while a queued command runs, its live output appears in that terminal and the keys typed there go to the command, so the user answers its prompt themselves"
    - "Outside a dispatch the terminal is in its normal mode and Ctrl+C stops the daemon as before; during a dispatch Ctrl+C reaches the command (exit 130) and the daemon keeps running"
    - "The daemon never logs, stores or echoes the forwarded keys; the log keeps only its dispatch and completion lines; the done record holds only what the command printed"
    - "`--no-attend`, `AOFORGE_WATCH_UNATTENDED=1`, or a stdin/stdout that is not a TTY (the detached `start`, launchd/systemd, tests) runs unattended, with dispatch behaviour unchanged"
    - "Each dispatch in attended mode is framed by a start line naming the handoff id and command (with the terminal bell) and an end line naming status and exit code; neither prints input or secrets"
    - "A shell that died (a dispatch timeout kills it; it can also exit) is replaced by a fresh one before the next dispatch and the log says `respawned shell`; no respawn happens during shutdown"
    - "The session facade forwards every ShellSession method with all its arguments to the current shell, including `attachDataListener(fn, { liveOnly: true })` from processOnce"
    - "End to end under a real PTY: the daemon mirrors a queued command's `Your name:` prompt into its own terminal, the test types `ada` there as the user would, and the done record's stdout contains `hello ada`; AOForge injects nothing"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs
      provides: "createSessionHandle (respawning facade) and attachTerminal (mirror + key forwarding around each dispatch)"
      exports: ["createSessionHandle", "attachTerminal"]
    - path: plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs
      provides: "in-process tests on hand-built fake session, input and output"
    - path: plugins/aoforge/aoforge/bin/aoforge-watch.cjs
      provides: "runForeground on the handle; attended/unattended decision and startup line; --no-attend"
  key_links:
    - from: "aoforge-watch.cjs runForeground"
      to: "watcher-attend.cjs createSessionHandle / attachTerminal"
      via: "the handle is the session runLoop and processOnce receive"
      pattern: "createSessionHandle\\("
    - from: "attachTerminal mirror"
      to: "ShellSession.attachDataListener(fn, { liveOnly: true })"
      via: "only the command's live bytes reach the user's terminal, never sentinels"
      pattern: "liveOnly: true"
---

# TRD 73-05: The aoforge-watch terminal is where the user answers the prompt

<objective>
The daemon runs a queued command in its own PTY, and nobody can see or answer that PTY. Token passing (`inputs.secrets`
from env or stash) is the only way a prompt gets an answer, and gate-interactive's pending records never carry
`inputs`. So a command that is gated *because* it prompts (`ssh-keygen`'s passphrase, `doctl auth init`'s token,
`gh auth login`'s questions) waits on a prompt no one sees until the 10-minute timeout, which then kills the daemon's
shell for every later command as well.

SC-3 and the locked constraint say the user runs the TTY command and AOForge never types or reads a secret. This TRD
makes that literal. When `aoforge-watch start --foreground` runs in the user's terminal, that terminal is attached to
each dispatch: the command's live output (73-03's `liveOnly` listener, so no sentinel noise) is mirrored there, and
the user's keys are forwarded to the command for the length of the dispatch. Outside a dispatch the terminal is left
alone. A detached or service-run daemon stays unattended. A facade around the shell session respawns a dead shell
before the next dispatch.

Purpose: HND-03, the piece that lets a user complete an interactive command through the daemon; 73-07 demonstrates it
live.
Output: `lib/watcher-attend.cjs` and its tests, `runForeground` on the facade, an end-to-end PTY test that plays the
user.
</objective>

<file_tree>
plugins/aoforge/aoforge/bin/
├── aoforge-watch.cjs             ← MODIFY
├── aoforge-watch.test.cjs        ← MODIFY
└── lib/
    ├── watcher-attend.cjs        ← CREATE
    └── watcher-attend.test.cjs   ← CREATE
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures (fakes written out by hand), no
property-based libraries, no `.feature` files.

Read 73-03's SUMMARY first (`73-03-SUMMARY.md`): the `liveOnly` option as built.

Read narrowly:
- `plugins/aoforge/aoforge/bin/aoforge-watch.cjs`: header 1-33, `parseFlags` 61, `cmdStart` 206-243, `startDetached`
  245 (stdio ignored: unattended), `runForeground` 279-397 (session at 310, `shutdown` 322-355, spawn + runLoop at the
  end).
- `plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs` `runLoop` 365-430 and `processOnce` 208: which session methods
  they call (`dispatch`, `attachDataListener`, `detachDataListener`, `injectInput`).
- `plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs`: `isAlive`, `kill`, the dispatch timeout handler (it kills the
  shell and sets `_closed`).
- `plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs`: CLI spawn helper ~50, the foreground start/stop group 136, the
  multi-project group 348 (teardown pattern).
- `plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` `stopDaemon` ~105-146 (kill the process group, prove it is gone)
  and the allow-file helper: copy the pattern, do not import from a test file.
</context>

## Test list

Outermost first: the daemon under a real PTY playing the user's terminal, then the CLI, then the module with fakes.

**aoforge-watch, end to end** (`aoforge-watch.test.cjs`, node-pty; skip only when node-pty is unavailable):
1. Spawn `node aoforge-watch.cjs start --foreground --project <tmp> --shell bash` with `pty.spawn` (cols 120, rows 30),
   env `HOME=<tmp home>` holding an allow file with `^bash\s+-c\s+`. Wait for the startup line containing `attended`.
   Write the pending record `bash -c 'printf "Your name: " > /dev/tty; read N; echo "hello $N"'`. When the daemon's
   terminal output contains `Your name:`, write `ada\r` to the daemon's PTY. -> the done record arrives with `status
   'done'`, stdout containing `hello ada`; the daemon's terminal showed a start line with the handoff id and an end line
   with `exit 0`. Teardown kills the process group and proves the pid is gone.
2. In that run, `<tmp home>/.aoforge/aoforge-watch.log` contains the `dispatching` and `completed` lines and does not
   contain `ada`.
3. Ctrl+C during a dispatch: same setup, pending `bash -c 'echo started-73; exec sleep 30'`; on `started-73` write
   `\x03` to the daemon's PTY -> done record `exit_code 130` in under 5 s, and the daemon is still running (its pid is
   alive and a second pending `bash -c 'echo again-73'` completes).

**aoforge-watch CLI** (`aoforge-watch.test.cjs`, spawned with pipes):
4. `start --foreground` with piped stdio -> a second startup line says `unattended`; existing CLI tests unchanged.
5. Under a PTY with `--no-attend`, and separately with `AOFORGE_WATCH_UNATTENDED=1` -> `unattended`.

**watcher-attend.cjs, in-process** (`watcher-attend.test.cjs`, fakes built by hand: `fakeSession({ alive, onDispatch
})` recording calls and arguments, `fakeInput({ isTTY })` an EventEmitter with a `setRawMode` spy plus
`pause`/`resume`, `fakeOutput()` collecting writes):
6. `createSessionHandle({ makeSession, log })`: `spawn()` makes and spawns one session; `dispatch` delegates; after the
   inner session's `isAlive()` turns false, the next `dispatch` makes and spawns a new session first and logs
   `respawned shell`; after `kill()` no new session is ever made.
7. The facade forwards unknown methods and every argument: `attachDataListener(fn, { liveOnly: true })` reaches the
   fake with both arguments; `injectInput('x')` reaches the current inner session, including after a respawn.
8. `attachTerminal(handle, { input, output, log })`, one dispatch: the output gets a start line with the id, the
   command and `\x07`; `setRawMode(true)` is called; an `input` `data` event during the dispatch reaches
   `injectInput`; the mirror listener was attached with `{ liveOnly: true }` and the chunks it receives are written to
   the output verbatim; at the end `setRawMode(false)` is called, the listeners are removed, an end line with status
   and exit code is written, and `data` after the end reaches nothing.
9. A dispatch that rejects still restores raw mode and removes the listeners.
10. Keys typed during a dispatch (`hunter2-not-a-secret`) never appear in any `log` call or in the output beyond what
    the session itself emitted.
11. An output that throws on write, or an input whose `setRawMode` throws, never fails the dispatch.

<embedded_context>

<codebase_examples>
Where the session is built today (`aoforge-watch.cjs` 310) and handed to the loop:
```js
  const session = new ShellSession({ shell, cwd: projectRoot, interactive: true });
  ...
  return session.spawn().then(() => {
    loop = daemon.runLoop({
      projectRoot, session, allowlist, log,
      notifier, notify_on_start, notify_on_complete,
    });
```
Becomes (pseudocode):
```js
  const session = createSessionHandle({
    makeSession: () => new ShellSession({ shell, cwd: projectRoot, interactive: true }),
    log,
  });
  const attended = !flags['no-attend'] && process.env.AOFORGE_WATCH_UNATTENDED !== '1'
    && process.stdin.isTTY && process.stdout.isTTY;
  if (attended) attachTerminal(session, { input: process.stdin, output: process.stdout, log });
  printOut(attended
    ? 'aoforge-watch: attended: prompts from queued commands appear here; Ctrl+C during a command interrupts it'
    : 'aoforge-watch: unattended: queued commands run without a terminal');
```
Keep the existing `aoforge-watch: started (pid N, projects X)` line exactly as it is (tests and users match it); the
attended/unattended line is a second line. `runForeground` needs the flags: pass `attend` in from `cmdStart`.

The facade: a JS `Proxy` (or an object whose prototype delegates) over a mutable `current` session, overriding
`spawn`, `dispatch` (respawn check first, then the dispatch hooks attachTerminal installs) and `kill` (sets a
`stopping` flag). Everything else is forwarded with `(...args)` so methods added later reach the shell too.

attachTerminal, per dispatch:
```js
// onStart(id, cmd):  output.write(`\r\n\x07[aoforge-watch] ${id}: ${cmd}\r\n[aoforge-watch] answer any prompt here; Ctrl+C interrupts the command\r\n`)
//                     mirror = (chunk) => output.write(chunk); handle.attachDataListener(mirror, { liveOnly: true })
//                     forward = (buf) => handle.injectInput(buf.toString('utf8'))
//                     if (input.isTTY) input.setRawMode(true); input.on('data', forward); input.resume()
// onEnd(id, result):  finally-style: input.off('data', forward); input.setRawMode(false); input.pause()
//                     handle.detachDataListener(mirror)
//                     output.write(`\r\n[aoforge-watch] ${id} finished: ${result.status} (exit ${result.exit_code})\r\n`)
```
The command text in the start line is what the log already records (`dispatching <id>: <cmd>`); it never contains a
secret value, because secrets are resolved inside processOnce and never put on the command line.
</codebase_examples>

<anti_patterns>
- Do not keep the terminal in raw mode between dispatches: Ctrl+C must stop the daemon then, as it does today.
- Do not log, buffer to disk or render the forwarded keys. Forward and forget.
- Do not turn echo on in the PTY to make typing visible. Echo off is why typed input never lands in a done record; a
  tool that wants echo turns it on itself (doctl's TUI does).
- Do not resize the daemon's PTY in this TRD; the 80x24 PTY is a documented limitation (73-08).
- Do not change `startDetached`, the service installer or `processOnce`; attended mode is a property of the foreground
  process's own terminal.
- Do not answer the prompt from AOForge in the tests through `inputs.secrets`; the test types into the daemon's terminal
  the way the user does.
</anti_patterns>

<error_recovery>
- The PTY e2e test never sees `Your name:`: check the startup line said `attended` (node-pty gives the child a TTY on
  stdin and stdout), then that the mirror listener is attached with `liveOnly` and the prompt is written to `/dev/tty`
  inside the BEGIN..DELIM window of 73-01's script.
- `ada` never reaches `read`: the forward handler must call `injectInput` on the *current* inner session; with the
  daemon's own stdin in raw mode, the test's `\r` arrives as `\r`, and the inner PTY's ICRNL turns it into the newline
  `read` needs.
- A leaked daemon after a failed assertion: reuse the process-group kill and "prove it is gone" pattern from
  `handoff-e2e.test.cjs` `stopDaemon` (issue #93); a hung test file is worse than a red one.
</error_recovery>

</embedded_context>

<gotchas>
- `process.stdin` in raw mode receives Ctrl+C as the byte `\x03`, not SIGINT; that is what makes "Ctrl+C interrupts the
  command" true during a dispatch. 73-01's INT trap makes the dispatch still finish (exit 130).
- The daemon's dispatch timeout (10 minutes) kills the shell; before this TRD that left the daemon with a dead session
  and every later record failed with `ShellSessionClosed`. The respawn fixes that; 73-01 Task 3 may have pinned the
  `ShellSessionClosed` behaviour the facade relies on.
- The live demonstration (73-07) runs the daemon from this checkout with `node <checkout>/plugins/aoforge/aoforge/bin/aoforge-watch.cjs start --foreground`.
  The installed 3.0.0 runtime does not carry this TRD.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fakes and RED tests for the facade and the terminal attachment</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs</files>
  <action>
Write the hand-built fakes and test list items 6-11 against a module that does not exist yet. Run: every test fails on
`Cannot find module`. Commit the tests alone (`test(73-05): ...`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs exits non-zero, all failures from the missing module</verify>
  <done>The facade and attachment behaviours are pinned by RED tests on hand-built fakes.</done>
  <recovery>If a fake grows logic of its own beyond recording calls, simplify it: the fakes must be obviously correct by reading them.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, watcher-attend.cjs</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs</files>
  <action>
Implement `createSessionHandle({ makeSession, log })` and `attachTerminal(handle, { input, output, log })` per
codebase_examples. Dispatch hooks run around the inner `dispatch` in a try/finally so raw mode and listeners are always
restored. Swallow I/O errors from `output.write` and `input.setRawMode`. Make items 6-11 pass one at a time. Commit
`feat(73-05): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs exits 0</verify>
  <done>Respawn, forwarding, mirroring, framing and cleanup behave as tested; no key reaches a log.</done>
  <recovery>If the Proxy approach fights `this` binding (methods called on the proxy run with the proxy as `this`), bind forwarded functions to the current inner session: `(...args) => current[name](...args)`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: runForeground attended, and the end-to-end PTY test that plays the user</name>
  <files>plugins/aoforge/aoforge/bin/aoforge-watch.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs</files>
  <action>
Write test list items 1-5 first and run them RED (no `attended` line; the prompt never reaches the daemon's terminal;
item 3 hangs to a dead session). Then wire `runForeground` per codebase_examples: the facade, the attended decision,
the second startup line, `--no-attend` documented in the header's `start` usage, and `shutdown` calling the facade's
`kill()` so no respawn happens. Make items 1-5 pass. Run the CLI tests, the watcher tests and the e2e file. Commit
`feat(73-05): ...`. Run the full suite and record the delta.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0 with the PTY tests running, then npm test (or the STACK.md glob) shows no new failures</verify>
  <done>An attended daemon lets a "user" (the test) answer a prompt in the daemon's terminal and the answer reaches the command; Ctrl+C interrupts only the command; a dead shell is respawned; unattended runs are unchanged.</done>
  <recovery>If the existing foreground start/stop tests break, the started line changed: restore it byte for byte and keep the new text on its own line.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/watcher-attend.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "createSessionHandle\(|attachTerminal\(" plugins/aoforge/aoforge/bin/aoforge-watch.cjs` finds both.
- `rg -n "liveOnly: true" plugins/aoforge/aoforge/bin/lib/watcher-attend.cjs` finds the mirror.
- The end-to-end PTY test (item 1) passed, not skipped, and its SUMMARY row quotes the done record's `status` and
  `exit_code` (not its stdout beyond `hello ada`).
</verification>

<success_criteria>
- A user can answer a queued command's prompt in the aoforge-watch terminal; AOForge types nothing.
- The daemon survives a timeout or a Ctrl+C and keeps serving.
- Unattended daemons behave as before.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-05-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table.
</output>
