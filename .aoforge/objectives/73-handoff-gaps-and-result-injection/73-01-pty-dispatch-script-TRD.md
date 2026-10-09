---
objective: 73-handoff-gaps-and-result-injection
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs
  - plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs
autonomous: true
requirements: [HND-01]
must_haves:
  truths:
    - "Gap 1 (dispatch-wrapper isatty) is closed: in PTY mode with the bash/zsh wrapper, a dispatched command sees a terminal on fd 1 and fd 2 (`[ -t 1 ]` and `[ -t 2 ]` both succeed), proven by a test that failed on the pre-73 wrapper"
    - "Gap 2 (wrapper stdin race) is closed: in PTY mode, `printf 'Enter value: ' > /dev/tty; read V; echo got=$V` captures `got=answer-73` when a data listener writes `answer-73\\r` after the prompt appears, proven by a test that failed (timeout or wrong value) on the pre-73 wrapper"
    - "Each PTY dispatch writes exactly one line to the PTY (`. '<script path>'` + CR). The wrapper body lives in a 0600 file inside a 0700 directory private to the session; the file is removed when the dispatch settles (done, failed, timeout, shell_died, killed) and kill() removes the directory"
    - "A Ctrl+C (`\\x03`) written to the PTY while a dispatched command runs still produces the END sentinel: the result is exit_code 130, status failed, well inside the dispatch timeout, and the next dispatch on the same session succeeds"
    - "A command that contains a newline, or ends in a `# comment`, completes in PTY mode"
    - "PTY-mode output contract (bash/zsh): stdout carries the command's stdout and stderr together and stderr is '' because both fds are the terminal. Pipe mode and the fish/powershell wrappers keep the separate-stream replay protocol byte for byte"
    - "The PTY shell never persists history: the bash/zsh PTY init lines unset HISTFILE and turn history off"
    - "Every PTY behaviour above also holds under zsh when zsh is installed (the daemon defaults to $SHELL, which is zsh on macOS); the zsh variants skip only when zsh is absent"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs
      provides: "ptyScript(cmd, markers) -> script text; sourceLine(scriptPath) -> one shell line; PTY initLines gain the history guard"
      exports: ["shellName", "shellArgs", "lineSep", "initLines", "wrapCommand", "ptyScript", "sourceLine"]
    - path: plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs
      provides: "PTY dispatch through a private script file and one input line when the wrapper has ptyScript; sentinelMarkers(id)"
      exports: ["ShellSession", "ShellSessionClosed", "splitDispatchOutput", "sentinelMarkers"]
    - path: plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs
      provides: "gap 1 / gap 2 / Ctrl+C / comment regression tests, bash and zsh"
  key_links:
    - from: "ShellSession.dispatch (PTY branch)"
      to: "wrappers/bash.cjs ptyScript + sourceLine"
      via: "write the script file, then this._writeRaw(wrapper.sourceLine(file) + '\\r')"
      pattern: "sourceLine\\("
    - from: "ShellSession.dispatch"
      to: "sentinelMarkers(id)"
      via: "one function names BEGIN/DELIM/END for dispatch, ptyScript and (in 73-03) the daemon"
      pattern: "sentinelMarkers\\("
---

# TRD 73-01: The PTY dispatch script keeps the terminal and sends one line (gaps 1 and 2)

<objective>
Close two of the three PTY handoff gaps that objective 19 found and parked (`19-05-mock-auth-e2e-SUMMARY.md`,
"Architectural Findings"), and make Ctrl+C survivable, by changing how the bash/zsh wrapper runs a command in the
daemon's PTY.

- **Gap 1, dispatch-wrapper isatty.** Today the wrapper runs `{ cmd ; } > $__DFW_OUT 2> $__DFW_ERR` and replays the
  files after the command exits. A tool that checks `isatty(stdout)` (doctl's bubble-tea TUI: "unknown terminal") sees
  regular files and quits.
- **Gap 2, wrapper stdin race.** Today `dispatch()` writes all ten wrapper lines to the PTY in one `_writeRaw`. A
  command that reads stdin (`read`, a passphrase prompt) consumes the next queued wrapper line as its answer before the
  prompt detector can inject anything, and the dispatch hangs or captures garbage.
- **Ctrl+C.** A `\x03` makes the tty driver flush the queued wrapper lines, so `END` is never printed and the dispatch
  runs to its 10-minute timeout, which also kills the shell.

The fix, for the bash/zsh wrapper in PTY mode only: write the wrapper body to a private script file and send one line,
`. '<file>'`. The script prints BEGIN, runs the command with stdout and stderr still on the terminal (in-band output),
then prints DELIM and END. An INT trap held for the whole script lets a Ctrl+C kill only the command. The sentinel fence
(BEGIN/DELIM/END) and `splitDispatchOutput` stay; what changes is that in PTY mode stderr arrives with stdout.

Purpose: HND-01 (gaps 1 and 2) and the base the gap-3 fix (73-03) and attended mode (73-05) build on.
Output: `ptyScript`/`sourceLine` in `wrappers/bash.cjs`, the script-file PTY dispatch and `sentinelMarkers` in
`watcher-shell.cjs`, regression tests shown RED on the old wrapper then GREEN.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (failing test first, one test at a time, per the user's CLAUDE.md
playbook), test list first, hand-built fixtures (`no_llm_test_data`), no property-based libraries, no `.feature` files.

Read narrowly (`rg -n` first, then `Read` with offset/limit):
- `plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs`: header 1-53 (protocol description, rewrite it), constructor
  89-112, `attachDataListener` 123, `injectInput` 146, `spawn` 161 (PTY `onData` 184-192, init write 202-203),
  `_tryComplete` 348, `dispatch` 387-437 (sentinel names 395-397, the batched write 430-433), `kill` 439,
  `splitDispatchOutput` 564, exports 601.
- `plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs` (whole file, ~70 lines): `initLines` 21, `wrapCommand` 58.
- `plugins/aoforge/aoforge/bin/lib/wrappers/index.cjs`: `getWrapper` (bash and zsh share bash.cjs).
- `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`: `SHELL = 'bash'` 30, `ptyAvailable`/`withPTYSession`
  140-153, PTY group 157-284 (PTY-4 at ~196 asserts a separate stderr: it changes), data-listener group 316-437 (DL-5 is
  PTY), bracketed-paste group 515, readiness group 594.
- `plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs` (pins `wrapCommand` output; leave those assertions alone).
- `.aoforge/objectives/19-pty-handoff-watcher/19-05-mock-auth-e2e-SUMMARY.md` "Gap 1" and "Gap 2" (the evidence).
</context>

## Test list

Outermost first: a real PTY `ShellSession` (node-pty, `interactive: true`), then the wrapper module in-process.
Every PTY test is gated by `ptySkip`; the zsh variants also skip when `zsh` is not on PATH (`spawnSync('zsh',
['-c','exit 0']).status === 0`). Run each of 1-6 for `bash` and, where available, `zsh` (a small `for (const shell of
SHELLS)` loop around the test bodies, shell name in the test title).

**ShellSession, PTY mode** (`watcher-shell.test.cjs`, new group "objective 73: PTY dispatch script"):
1. Gap 1: dispatch `if [ -t 1 ]; then echo out=tty; else echo out=file; fi; if [ -t 2 ]; then echo err=tty >&2; else
   echo err=file >&2; fi` -> `r.stdout` contains `out=tty` and `err=tty`; `r.stderr === ''`; `exit_code 0`.
   Old wrapper: `out=file`, and `err=file` lands in `r.stderr`.
2. Gap 2: attach a data listener that accumulates chunks and, the first time the buffer contains `Enter value:`, calls
   `s.injectInput('answer-73\r')`; dispatch `printf 'Enter value: ' > /dev/tty; read V; echo "got=$V"` with
   `{ timeout_ms: 8000 }` -> `status 'done'`, `exit_code 0`, `r.stdout` matches `/got=answer-73/`. Old wrapper:
   `read` takes a wrapper line; timeout or a wrong `got=`.
3. Ctrl+C completes: attach a listener that injects `\x03` once (the first time the buffer contains `started-73`);
   dispatch `sh -c 'echo started-73; exec sleep 5'` with `{ timeout_ms: 8000 }` -> resolves in under 4000 ms with
   `exit_code 130`, `status 'failed'`; then `s.dispatch(next id, 'echo still-alive')` -> `stdout 'still-alive\n'`.
   Old wrapper: `status 'timeout'` at 8000 ms and a dead session.
4. A trailing comment: dispatch `echo a-73 # trailing comment` -> `stdout 'a-73\n'`, `exit_code 0` (old: the comment
   swallows ` ; } > $__DFW_OUT ...` and the dispatch hangs; use `{ timeout_ms: 5000 }`).
5. A two-line command: dispatch `"echo l1\necho l2"` -> `stdout 'l1\nl2\n'`.
6. One input line per dispatch: wrap `s.proc.write` with a spy after `spawn()`; one `dispatch('p-one', 'echo one')` ->
   exactly one write whose text matches `/^\. '.+'\r$/`.
7. The script file: during a dispatch of `ls -ld "$(dirname "$AOFW_SCRIPT")"; stat -f %Lp "$AOFW_SCRIPT" 2>/dev/null ||
   stat -c %a "$AOFW_SCRIPT"` the output shows mode `600` (the script exports its own path as `AOFW_SCRIPT` for this
   purpose) and the directory is `drwx------`; after the dispatch resolves, the file no longer exists; after
   `s.kill()`, the directory no longer exists (read its path from the internal `s._scriptDir`).
8. PTY-4 (changed contract): `echo err 1>&2` in PTY mode -> `stdout 'err\n'`, `stderr ''`. Rename the test to say both
   fds are the terminal in PTY mode.
9. History guard: the PTY session's `echo "${HISTFILE-unset}"` prints `unset`.

**Wrapper module, in-process** (`wrappers/bash.test.cjs`):
10. `ptyScript('doctl auth init', markers)` returns text whose lines are, in order: `trap ':' INT`, the BEGIN echo,
    `{`, the command on its own line, `}`, an `__DFW_RC=$?` capture, the terminal restore, the DELIM echo, the END echo
    with `$__DFW_RC`, `trap - INT`; it also sets `AOFW_SCRIPT`.
11. `sourceLine("/tmp/a b/x.sh")` -> `. '/tmp/a b/x.sh'`; a path containing `'` is escaped as `'\''`.
12. `initLines('pty')` contains `unset HISTFILE 2>/dev/null` and `set +o history 2>/dev/null`; `initLines('pipe')` is
    unchanged (deep-equal the old array).
13. `wrapCommand` output is unchanged (the existing assertions keep passing; do not edit them).

**Pipe mode** (unchanged): every existing pipe-mode test in `watcher-shell.test.cjs` passes untouched, including
`stderr === 'err\n'`.

<embedded_context>

<codebase_examples>
The wrapper today (`wrappers/bash.cjs` 58-70). Keep it; pipe mode and anything without `ptyScript` still use it:
```js
  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    ...
    return [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
  },
```
The batched write that causes gap 2 (`watcher-shell.cjs` 430-433):
```js
      const wrappedLines = this._wrapper.wrapCommand(cmd, id);
      const sep = this._isPTY ? '\r' : this._wrapper.lineSep;
      this._writeRaw(wrappedLines.join(sep));
```
The script `ptyScript(cmd, { begin, delim, end })` should produce (bash/zsh; the command is on its own line so a
trailing comment or a newline inside it cannot break the fence):
```sh
AOFW_SCRIPT='<path of this file>'
trap ':' INT
echo __DFW_BEGIN_<id>__
{
<cmd>
}
__DFW_RC=$?
stty sane 2>/dev/null; stty -echo 2>/dev/null
echo __DFW_DELIM_<id>__
echo __DFW_END_<id>__:$__DFW_RC
trap - INT
```
`ptyScript` gets the path as an option (`ptyScript(cmd, markers, { scriptPath })`) so it can set `AOFW_SCRIPT`; the
session writes the file and sends `wrapper.sourceLine(path) + '\r'`. Why each line:
- `trap ':' INT` for the whole script: an interactive shell aborts the rest of a sourced script when its foreground
  child dies of SIGINT, unless INT is trapped. With the trap, the child dies (children get the default disposition),
  the shell runs `:` and goes on to print DELIM and END. It is released only after END, so a late `\x03` cannot land
  in the gap between the command and END. `set +o monitor` (init lines) keeps the command in the terminal's
  foreground group, so `\x03` reaches it.
- `stty sane; stty -echo` after the command: a TUI killed mid-run can leave the tty raw; this restores cooked mode
  with echo off before the next dispatch.
- No `echo` before DELIM: `splitDispatchOutput` already handles DELIM on the line after the output; output that ends
  without a newline behaves as it does today (not this TRD's concern).

`splitDispatchOutput` (564-588) reads stdout between BEGIN and DELIM and stderr between DELIM and END. With the in-band
script the DELIM-END section is empty, so `stderr === ''` falls out with no parser change. Keep the PTY normalization in
`_tryComplete` (bracketed paste strip, `\r\n` -> `\n`).

The PTY test helper (`watcher-shell.test.cjs` 145-153), reuse it with `{ shell }`:
```js
async function withPTYSession(opts, fn) {
  const session = new ShellSession({ shell: SHELL, interactive: true, ...opts });
  await session.spawn();
  try { await fn(session); } finally { try { await session.kill(); } catch {} }
}
```
Readiness, not sleeps: the gap-2 and Ctrl+C tests inject on seeing text in the stream (issue #93 is why the repo bans
sleep-based readiness, see the `_awaitShellReady` comment at `spawn`).
</codebase_examples>

<anti_patterns>
- Do not run the user's command in a subshell `( cmd )` to contain SIGINT: it breaks shell-flow commands (`nvm use`,
  `export FOO=bar` must persist across dispatches; PTY-5 pins that).
- Do not write the wrapper lines one at a time with delays. That is the timing guess issue #93 removed from `spawn()`.
- Do not change `wrapCommand`, the pipe-mode path, or the fish/powershell wrappers. They keep the replay protocol; a
  wrapper opts into the script path by exporting `ptyScript` and `sourceLine`.
- Do not turn echo on for the command. Echo off is why nothing a user or the detector types is ever captured in a done
  record; a tool that wants echo turns it on itself.
- Do not put the script in the project directory or in `.aoforge/`: it holds the command text and must be private to
  the daemon (0700 dir under `os.tmpdir()`, 0600 file).
- Do not rename the `__DFW_` sentinel prefix. It is protocol, the bracketed-paste tests and 73-05's mirror read it; the
  rename guard already allows it.
</anti_patterns>

<error_recovery>
- zsh prints `no such option: history` despite `2>/dev/null`: the error goes to the shell's stderr, which is the PTY, but
  it is emitted during init, before the readiness probe, and `spawn()` drains the prelude. If a test still sees it,
  guard the line as `[ -n "$BASH_VERSION" ] && set +o history`.
- The Ctrl+C test returns `exit_code 0` after about 5 s: the `\x03` arrived before `sh` started, the shell ran the trap
  and then ran the whole command. Inject only after `started-73` is in the buffer (the child has printed, so it is
  running). If it is still flaky, assert `status !== 'timeout'` and elapsed < 6000 ms, and say so in the SUMMARY.
- zsh does not continue the script after SIGINT with the trap set: try `trap 'true' INT` (some zsh versions treat `:`
  differently). zsh's `{ ... } always { ... }` would work but is not bash syntax, so do not put it in the shared
  script. If zsh still aborts, report the observed zsh behaviour in the SUMMARY, keep bash GREEN, and mark only the zsh
  Ctrl+C test `todo` with that behaviour in its message. Do not hide it with a skip.
- `stat -f` vs `stat -c`: macOS has `-f %Lp`, GNU has `-c %a`; the test command tries both.
</error_recovery>

</embedded_context>

<gotchas>
- The daemon's shell is `$SHELL` unless `--shell` is given, and `$SHELL` is `/bin/zsh` on this machine. bash.cjs serves
  zsh too (`wrappers/index.cjs`). A fix that only works in bash fixes nothing for the live run (73-07).
- `stty -echo` in the init lines is what keeps PTY input out of the capture. The sourced script is read from the file,
  not the tty, so its lines are never echoed either.
- The readiness probe (`_awaitShellReady`) and the init lines are still batched; nothing reads stdin there, so leave
  them.
- A timed-out dispatch kills the shell (`dispatch` timeout handler). Remove the script file there too.
- 72-27's gotcha applies at the end: tick this TRD's ROADMAP box (`roadmap update-job-progress 73`) before the final
  full-suite run, or `roadmap-reconcile.test.cjs` E2E1 fails on the unticked line.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the gap 1 / gap 2 / Ctrl+C / comment regression tests against the current wrapper</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs, plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs</files>
  <action>
Add the test list's items 1-7 and 9 to a new `describe('watcher-shell — objective 73: PTY dispatch script', ...)` group
in `watcher-shell.test.cjs`, and items 10-12 to `wrappers/bash.test.cjs`. Build the fixtures by hand: a `SHELLS` list
(`['bash']` plus `'zsh'` when it runs), a `listenUntil(session, text, onSeen)` helper that accumulates listener chunks
and calls `onSeen` once, and the probe commands as named constants (`TTY_PROBE`, `READ_PROBE`, `INT_PROBE`). Do not
touch PTY-4 yet.

Run the scoped suite against the unchanged source and record the RED evidence: which tests fail and how (gap 1:
`out=file`; gap 2: timeout or a wrong `got=`; Ctrl+C: `status 'timeout'`; comment: timeout; 6: several writes; 7/9:
no `AOFW_SCRIPT`, `HISTFILE` set; 10-12: `ptyScript is not a function`). Commit the tests alone
(`test(73-01): ...`) so the RED state is in history.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs exits non-zero, and the failures are exactly the new objective-73 tests (every pre-existing test still passes)</verify>
  <done>The new tests exist and fail on the old wrapper for the reasons above; the RED run's output is captured for the SUMMARY's TDD evidence table; nothing under src changed.</done>
  <recovery>If node-pty fails to load (`require('node-pty')` throws), run `npm install` at the repo root (the postinstall chmods spawn-helper) and retry; the PTY tests must run, not skip, on this machine.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, ptyScript/sourceLine and the one-line script-file PTY dispatch</name>
  <files>plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs, plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs, plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs</files>
  <action>
In `wrappers/bash.cjs`: add `ptyScript(cmd, markers, { scriptPath })` and `sourceLine(scriptPath)` as shown in
codebase_examples, and append `unset HISTFILE 2>/dev/null` and `set +o history 2>/dev/null` to the PTY branch of
`initLines` only. Update the interface comment: `ptyScript`/`sourceLine` are optional; a wrapper without them keeps the
replay protocol.

In `watcher-shell.cjs`:
1. Export `sentinelMarkers(id)` -> `{ begin, delim, end }` (`__DFW_BEGIN_<id>__` etc.) and use it in `dispatch`.
2. In `dispatch`, when `this._isPTY && typeof this._wrapper.ptyScript === 'function'`: lazily create
   `this._scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aoforge-watch-'))` (chmod 0700), write
   `<dir>/<id>.sh` with mode 0600, then `this._writeRaw(this._wrapper.sourceLine(file) + '\r')`. Record the path on
   the dispatch object; remove the file in every settle path (`_tryComplete`, the timeout handler, `_onExit`, `kill`)
   with a small `_cleanupScript(d)` that never throws. `kill()` also removes `_scriptDir`.
3. Otherwise (pipe mode, fish, powershell): the existing batched `wrapCommand` write, unchanged.
4. Rewrite the header comment (1-53) to describe both protocols: the in-band script for bash/zsh in PTY mode (why:
   gaps 1 and 2 and Ctrl+C, objective 73) and the replay protocol for pipe mode and the other wrappers.

Change PTY-4 to the new contract (test list item 8). Make Task 1's tests pass one at a time; then run the whole file.
Commit as `feat(73-01): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/index.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/fish.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/powershell.test.cjs exits 0 with the bash objective-73 tests passing (not skipped) and the zsh variants passing on this machine</verify>
  <done>Gap 1, gap 2, Ctrl+C, comment and two-line tests pass under bash and zsh; one write per PTY dispatch; script file 0600 and removed; pipe-mode and other-wrapper tests unchanged and green.</done>
  <recovery>If an existing PTY test regresses (bracketed paste, readiness, PTY-5 env persistence), diff its captured buffer against the old protocol: the script must not run the command in a subshell and must not emit anything between BEGIN and the command. `git stash` the source change to compare against the RED baseline.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: the PTY daemon path end to end, and the full-suite gate</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs</files>
  <action>
Prove the new path through the existing daemon pipeline without touching the daemon (73-03 owns it): run
`node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` and record the result. Expected: the 10 baseline tests
still pass; MA-6-synth may now pass instead of skipping (gap 2 closed) and MA-6 may get past "unknown terminal" (gap 1
closed). Record which of MA-6-synth, MA-7, MA-6 now pass or still skip, with the skip reason text, for 73-03 (which
rewrites those tests). Do not edit `handoff-e2e.test.cjs` here.

Add one more PTY test to the objective-73 group if any behaviour seen there is not yet pinned (for example, a
dispatch after a timed-out dispatch gets `ShellSessionClosed`, which 73-05's respawn relies on). Then run the full
suite (`npm test`; if `micro.test.cjs` hangs on commit signing, the STACK.md glob that excludes it). Baseline before
this objective: 11,955 tests, 11,919 pass, 35 skipped, 0 fail apart from the roadmap-reconcile E2E1 gotcha.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0 (no failures; skips only with a recorded reason), then npm test (or the STACK.md glob) shows no new failures against the baseline</verify>
  <done>The e2e file passes with no new failures and its MA-* outcomes are recorded in the SUMMARY; the full suite has no new failures; the SUMMARY carries RED evidence for gaps 1 and 2 and the Ctrl+C test (commit hash and failing output).</done>
  <recovery>If the e2e LK-2 test (SIGTERM with a dispatch in flight) regresses, check that `kill()` and the timeout path still destroy the PTY and that `_cleanupScript` never throws or awaits.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs   (scoped, per task)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available (the stack profile defines no lint gate)</lint>
<build>not_available (no build step)</build>
</validation_gates>

<verification>
- `rg -n "sourceLine\(|ptyScript\(" plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs` shows the PTY branch uses both.
- `rg -n "trap ':' INT" plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs` finds the trap; `rg -n "unset HISTFILE"` the guard.
- The SUMMARY's TDD table names the RED commit and the failing output for gap 1, gap 2 and Ctrl+C.
- No change to `wrappers/fish.cjs`, `wrappers/powershell.cjs` or the pipe-mode path (`git diff --stat` lists only the four files).
</verification>

<success_criteria>
- Gap 1 and gap 2 each have a regression test that failed on the old wrapper and passes now, under bash and zsh.
- A Ctrl+C mid-command yields exit 130 and a live session instead of a 10-minute hang.
- One input line per PTY dispatch; the script file is private and cleaned up.
- No regression in the full suite.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-01-SUMMARY.md` (through
`aof-tools summary post`), including the TDD evidence table and the MA-* outcomes observed in Task 3.
</output>
