---
objective: 73-handoff-gaps-and-result-injection
trd: "12"
type: standard
wave: 3
depends_on: ["73-10", "73-11"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
  - plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.test.cjs
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/hooks/gate-interactive.test.js
autonomous: true
gap_closure: true
requirements: [HND-03]
must_haves:
  truths:
    - "watcher-state writes the daemon's pid file to `<home>/.claude/aoforge/state/watch/aoforge-watch.pid` (AOFORGE_HANDOFF_PID_FILE still overrides), and aoforge-watch writes its log to `<home>/.claude/aoforge/state/watch/aoforge-watch.log`"
    - "Running `aoforge-watch start --foreground` in a temp HOME and stopping it leaves no `<home>/.aoforge` directory"
    - "A pid file a 3.0.0 daemon wrote at `<home>/.aoforge/aoforge-watch.pid` is still read when the new one is absent, as the same AOForge daemon (no `legacy` flag): status, stop, start's already-running check, isWatcherLive and gate-interactive see it, and add-project / remove-project rewrite that same file so the running daemon sees the change"
    - "removePidFile removes the new pid file and the 3.0.0 one, never the pre-rename daemon's file, so `aoforge-watch stop` and `start` clear a stale 3.0.0 record"
    - "The pre-rename daemon's pid file is read last and still carries `legacy: true` (add/remove still refuse it with ELEGACYDAEMON; gate-interactive still treats it as no daemon)"
    - "`aoforge-watch logs` prints the new log, or for one release the 3.0.0 log at `<home>/.aoforge/aoforge-watch.log` when the new one does not exist"
    - "watcher-state's spelled watch directory equals compat.watchStateDir(home) (a test pins it)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
      provides: "pid file in the watch state directory; one-release read and clear of the 3.0.0 location"
      exports: ["pidFilePath", "readPidFile", "removePidFile", "addWatchedProject", "removeWatchedProject", "WATCH_DIR_SEGMENTS"]
    - path: plugins/aoforge/aoforge/bin/aoforge-watch.cjs
      provides: "log in the watch state directory; logs reads the 3.0.0 log for one release"
  key_links:
    - from: "watcher-state.cjs readablePidFile"
      to: "compat.resolveUserFile"
      via: "{ currentDir: <watch dir>, legacyName: `${LEGACY.watch}.pid` } (compat loaded fail-open)"
      pattern: "resolveUserFile"
    - from: "gate-interactive.js readWatcherInfo (73-10)"
      to: "watcher-state.readPidFile"
      via: "the hook has no pid path of its own"
      pattern: "readPidFile"
---

# TRD 73-12: The watch daemon's pid file and log live in the watch state directory

<objective>
Gap G5, side (b), second half: the cause. aoforge-watch writes its log (`aoforge-watch.cjs` `LOG_DIR_NAME = '.aoforge'`,
line 57) and watcher-state its pid file (`PID_DIR_NAME = '.aoforge'`, line 26) under `~/.aoforge/`. Objective 73's
attended daemon is the first thing that creates that directory in normal use, and it has the planning directory's
name. Move both to `~/.claude/aoforge/state/watch/` (`compat.watchStateDir`, from 73-11), beside the other per-user
runtime state.

A daemon started by 3.0.0 may still be running with its pid file in `~/.aoforge/`, and it keeps rereading that file
for its `watching` list. For one release that file is read as the same AOForge daemon (not `legacy`): status, stop,
start, add-project, remove-project, gate-interactive (through 73-10's watcher-state read) and the delivery hooks keep
working with it, and `stop`/`start` clear it. The pre-rename daemon's file is still read last, as `legacy`.

Purpose: G5 (b). Output: watcher-state and aoforge-watch on the new directory, the one-release read, and every test
and fixture that waited for or pre-wrote the old paths.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixture builders (temp
homes; `compat.watchStateDir(home)` builds every expected path), no property-based libraries, no `.feature` files.
User playbook: failing test first, one at a time.

Read 73-11's SUMMARY (`watchStateDir`, `resolveUserFile` as built) and 73-10's (gate-interactive reads the daemon
through `watcher-state.readPidFile` and ignores `legacy` records).

Read narrowly:
- `plugins/aoforge/aoforge/bin/lib/watcher-state.cjs` 1-110 (header, `homeDir`, `pidFilePath`, `readablePidFile`,
  `writePidFile`, `readPidFile`, `removePidFile`, `isWatcherLive`) and 176-245 (`addWatchedProject`,
  `removeWatchedProject`, exports).
- `plugins/aoforge/aoforge/bin/aoforge-watch.cjs`: header 30-35, constants 55-67, `cmdLogs` 149-167, `cmdStop` 169-215
  (loops until `readPidFile()` is null), `cmdStart` 217-254, `runForeground` 290-300 (log open).
- `plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs` 299 (a comment naming the old log path).
- Tests and fixtures that spell the old pid or log path (the waiting ones fail after the move; the pre-writing ones
  keep passing through the one-release read but must describe the current layout):
  - `aoforge-watch.test.cjs` 56 (`spawnForegroundDaemon` waits for the pid), 89-128, 193-196 (stale pid), 228
    (log), 360, 388 (wait), 426, 448.
  - `handoff-e2e.test.cjs` 55 and 474 (allowlist under `~/.aoforge`), 177, 363, 521 (wait for the pid), 362 (log).
  - `__fixtures__/daemon-polish-fixtures.cjs` 286 and 397 (pre-write).
  - `flutter-ui-setup.test.cjs` 145 (pre-write).
  - `file-identities.legacy.test.cjs` 302-335 (72-12 test 6b: "writes and removals touch ~/.aoforge/ only").
  - `watcher-state.test.cjs` 69-77 and the malformed-JSON test (path assertions).
- `plugins/aoforge/hooks/gate-interactive.test.js`: the 73-10 watcher-state group (daemon read without the override).
</context>

## Test list

Outermost first: the CLI, then watcher-state.

**aoforge-watch CLI (`aoforge-watch.test.cjs`, temp HOME):**
1. `start --foreground` then SIGTERM: while running, the pid file is at `compat.watchStateDir(home)/aoforge-watch.pid`
   and the log at `.../aoforge-watch.log`; after exit, `<home>/.aoforge` does not exist.
2. `logs --tail 5` reads the new log; with only `<home>/.aoforge/aoforge-watch.log` present it prints that file's
   last lines; with neither, `(no log file yet)`.
3. A live 3.0.0 pid file (`<home>/.aoforge/aoforge-watch.pid`, `pid: process.pid` of a sleeping child the test owns)
   -> `status` reports running, and `start --foreground` refuses with `already running` (exit 2).
4. A stale 3.0.0 pid file (pid 999999) -> `stop` prints not running and removes it; `start` removes it and starts.
5. `add-project` with a live 3.0.0 pid file rewrites that file's `watching`; no new-location pid file is created.
6. Existing CLI tests pass with their pid and log paths moved to the watch directory.

**watcher-state (`watcher-state.test.cjs`):**
7. `pidFilePath()` is `<home>/.claude/aoforge/state/watch/aoforge-watch.pid`; with `AOFORGE_HANDOFF_PID_FILE` set it
   is that value and no fallback is read (a 3.0.0 file in the temp home is ignored).
8. `writePidFile` creates the watch directory; `<home>/.aoforge` does not exist afterwards.
9. 3.0.0 pid only -> `readPidFile()` returns it with no `legacy` key; `isWatcherLive()` true for `process.pid`.
10. New and 3.0.0 files both present -> the new one wins.
11. `removePidFile()`: both present -> both removed; 3.0.0 only -> removed; pre-rename only -> nothing removed.
12. Pre-rename only -> `legacy: true`; add/remove throw `ELEGACYDAEMON`.
13. `path.join(home, ...WATCH_DIR_SEGMENTS)` equals `compat.watchStateDir(home)`.

**Neighbours:**
14. gate-interactive spawned with HOME = temp home and no override: a live pid file at the new location -> daemon-live
    reason; a live 3.0.0 pid file only -> daemon-live reason; a pre-rename file only -> daemon-absent reason.
15. `handoff-e2e.test.cjs`, `flutter-ui-setup.test.cjs`, `daemon-polish` consumers and `file-identities` 6b pass with
    the current layout (pre-writers write the watch directory; 6b says writes land in the watch directory).

<embedded_context>

<codebase_examples>
watcher-state (compat stays fail-open, so the watch directory is spelled here too and pinned equal by test 13):
```js
const PID_FILE_NAME = 'aoforge-watch.pid';
// <home>/.claude/aoforge/state/watch = compat.watchStateDir(home). Spelled here: some stub runtimes copy this file alone.
const WATCH_DIR_SEGMENTS = Object.freeze(['.claude', 'aoforge', 'state', 'watch']);
// Where AOForge 3.0.0 kept the pid file. Read and cleared for one release; removed with the other shims in the
// release after 3.0.0.
const INTERIM_DOT_DIR = '.aoforge';

function pidFilePath() {
  if (process.env.AOFORGE_HANDOFF_PID_FILE) return process.env.AOFORGE_HANDOFF_PID_FILE;
  return path.join(homeDir(), ...WATCH_DIR_SEGMENTS, PID_FILE_NAME);
}

/** The pid file to read: { file, legacy, interim }. */
function readablePidFile() {
  const current = pidFilePath();
  if (process.env.AOFORGE_HANDOFF_PID_FILE) return { file: current, legacy: false, interim: false };
  let compat; let LEGACY;
  try { compat = require('./compat.cjs'); ({ LEGACY } = require('./legacy-names.cjs')); }
  catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    return { file: current, legacy: false, interim: false };
  }
  const r = compat.resolveUserFile(homeDir(), PID_FILE_NAME, {
    legacyName: `${LEGACY.watch}.pid`, currentDir: path.dirname(current),
  });
  return { file: r.file, legacy: r.which === 'legacy', interim: r.which === 'interim' };
}

function removePidFile() {
  const files = [pidFilePath()];
  if (!process.env.AOFORGE_HANDOFF_PID_FILE) files.push(path.join(homeDir(), INTERIM_DOT_DIR, PID_FILE_NAME));
  for (const f of files) { try { fs.unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
}
```
`readPidFile` keeps marking only `legacy`. `addWatchedProject`/`removeWatchedProject`: after the `legacy` refusal,
write to `readablePidFile().file`, not to `pidFilePath()` (a running 3.0.0 daemon rereads its own file).

aoforge-watch (`compat` is already required at line 49):
```js
const { planningRoot, watchStateDir, resolveUserFile } = require('./lib/compat.cjs');
const LOG_FILE_NAME = 'aoforge-watch.log';
function logFilePath() { return path.join(watchStateDir(homeDir()), LOG_FILE_NAME); }      // the writer
function readableLogFile() {                                                                // cmdLogs reads this
  return resolveUserFile(homeDir(), LOG_FILE_NAME, { currentDir: watchStateDir(homeDir()) }).file;
}
```
(the pre-rename log, if any, is resolved too; pass `legacyName: \`${LEGACY.watch}.log\`` only if `LEGACY` is already
imported there; otherwise the default name simply never exists under the pre-rename directory, which is fine).
</codebase_examples>

<anti_patterns>
- Do not write, create or "migrate" anything under `~/.aoforge/` (moving leftovers is 73-13's doctor check).
- Do not mark a 3.0.0 record `legacy`: that daemon serves `.aoforge-handoff/` exactly like this one.
- Do not remove the pre-rename daemon's pid file anywhere (its daemon still runs from it until stopped; today's
  behaviour, pinned by file-identities test 7).
- Do not start a real watcher outside a test, and do not run any TTY-prompting command live. The attended terminal
  belongs to the user.
- No generated test data; build every expected path with `compat.watchStateDir(home)`, never by hand-joining
  `.claude/aoforge/state/watch` in each test.
</anti_patterns>

<error_recovery>
- `spawnForegroundDaemon` (or handoff-e2e's wait loops) times out after the change: it still waits at
  `<home>/.aoforge/aoforge-watch.pid`. Point it at `watchStateDir(home)`.
- `stop` loops for its full timeout: `removePidFile` is not clearing the 3.0.0 file, so `readPidFile()` keeps returning
  it.
- A gate-interactive daemon test fails only without the override variable: 73-10's read is not going through
  watcher-state; check `require('./gate-interactive.js').pidFilePath()` against watcher-state's.
- handoff-e2e PTY tests skip or fail for environment reasons (no zsh/bash PTY): compare with the 73-VERIFICATION
  baseline (2 skipped: fish and pwsh) before treating a failure as yours.
</error_recovery>

</embedded_context>

<gotchas>
- The CLI tests start real foreground daemons under a temp HOME; that is existing practice. Keep every new one under a
  temp HOME and kill it in `finally`.
- Item 3 needs a live pid that is not the test process's own daemon: `process.pid` works for liveness, but `stop`
  would SIGTERM the test runner. Use a child `node -e "setTimeout(()=>{},60000)"` you spawn and kill, for any test
  that runs `stop` against a live pid.
- This executor runs under the INSTALLED 3.0.0 plugin, whose gate-interactive still matches inside quoted arguments:
  never put a TTY command name inside a quoted Bash argument or a commit message; delete any stray
  `.aoforge-handoff/pending/<id>.json` a denied call leaves.
- Do not touch `service-installer.cjs` or its test (73-13 runs in the same wave and owns them) or
  `home-dot-dir-fixtures.cjs` (73-13 may extend it in this wave).
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the daemon's files in the watch directory and the 3.0.0 read</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs</files>
  <action>
Write test list items 7-13 in `watcher-state.test.cjs` (rewrite the two old path assertions) and items 1-6 in
`aoforge-watch.test.cjs` (move `spawnForegroundDaemon`'s and the other waits' pid path, and the log test's path, to
`watchStateDir(home)`), one at a time. Run both files: the new-location items, item 1's "no `<home>/.aoforge`", 2's
3.0.0 log read, 4 (stale 3.0.0 cleared), 5, 11 and 13 fail; the waits time out against the old code. Commit the tests
alone: `test(73-12): pin the watch daemon's files in the runtime home`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs exits non-zero, failing on the new locations and the 3.0.0 clear</verify>
  <done>The move and the one-release read are specified by failing tests; RED output captured.</done>
  <recovery>If a CLI test hangs rather than fails, lower its wait in the test (keep the assertion) so the RED run finishes; restore the original timeout in Task 2.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, watcher-state and aoforge-watch on the watch directory</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-state.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.cjs, plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs</files>
  <action>
Implement per codebase_examples: `WATCH_DIR_SEGMENTS` (exported) and `INTERIM_DOT_DIR` replace `PID_DIR_NAME`;
rewrite `pidFilePath`, `readablePidFile`, `removePidFile`; add/remove write the file they read. In aoforge-watch,
replace `LOG_DIR_NAME` with `watchStateDir`, add `readableLogFile` for `cmdLogs`, and update the header's `logs` line.
Rewrite watcher-state's header (where the pid file lives, the 3.0.0 read and clear, the pre-rename read) and the
`watcher-daemon.cjs` 299 comment. Make items 1-13 pass one at a time. Commit
`fix(73-12): keep the watch daemon's pid file and log in the runtime home`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs plugins/aoforge/hooks/statusline.test.js exits 0</verify>
  <done>Nothing in the watcher writes `~/.aoforge/`; a 3.0.0 daemon is still found, updated and cleared; the pre-rename daemon is still read as legacy.</done>
  <recovery>If statusline tests fail, they build a pid path by hand: read the failure; if it only needs the new path, update that line and list `hooks/statusline.test.js` in the SUMMARY as an extra file touched.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: neighbours follow the layout; gate-interactive pinned on it</name>
  <files>plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.test.cjs, plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/hooks/gate-interactive.test.js</files>
  <action>
Add test list item 14 to `gate-interactive.test.js` (it should pass at once: it pins 73-10's wiring on the new
layout; say so in the SUMMARY). Move the pid waits (177, 363, 521), the log path (362) and the allowlist writer
(`writeAllowFile`, 55 and 474: write the runtime-home file, `~/.claude/aoforge/aoforge-watch-allow.json`) in
`handoff-e2e.test.cjs`; move the pre-writers in `daemon-polish-fixtures.cjs` (286, 397; update the JSDoc at ~280) and
`flutter-ui-setup.test.cjs` (`buildFakePidFile`, 145) to `watchStateDir(home)`; rewrite file-identities 72-12 test 6b
(the write target and writes are in the watch directory; a pre-rename record is `legacy` and refused by add; test 7
unchanged). Run the full suite. Commit `test(73-12): move watcher fixtures and waits to the runtime home`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.test.cjs plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/hooks/gate-interactive.test.js exits 0; npm test shows no new failures; rg -n -e "'\.aoforge', 'aoforge-watch" plugins/aoforge -g '*.test.*' -g '__fixtures__/*' prints only tests that deliberately pin the 3.0.0 read</verify>
  <done>Every test and fixture describes the current layout, apart from the tests that pin the one-release 3.0.0 read; gate-interactive sees the daemon wherever watcher-state finds it; full suite green.</done>
  <recovery>If a daemon-polish consumer test fails after moving the pre-writer, it asserted on the old path itself: update the assertion to `watchStateDir(home)`; do not move the writer back.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "PID_DIR_NAME|LOG_DIR_NAME" plugins/aoforge/aoforge/bin` finds nothing.
- `rg -n "WATCH_DIR_SEGMENTS|INTERIM_DOT_DIR" plugins/aoforge/aoforge/bin/lib/watcher-state.cjs` finds both.
- `rg -n "watchStateDir" plugins/aoforge/aoforge/bin/aoforge-watch.cjs` finds the log path.
- Full suite: no new failures; RED commit precedes GREEN.
</verification>

<success_criteria>
- Starting aoforge-watch no longer creates `~/.aoforge/`, so the directory that turned $HOME into a project is never
  recreated.
- A daemon already running from 3.0.0 keeps working until it is restarted, and `stop`/`start` clean up after it.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-12-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table, the pid and log resolution order as built, and the list of
tests that still pin the 3.0.0 read (they go with the shims in the release after 3.0.0).
</output>
