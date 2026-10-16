---
objective: 78-remove-the-rename-shims
trd: "05"
type: standard
wave: 2
depends_on: ["78-04"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
  - plugins/aoforge/aoforge/bin/lib/handoff-results.cjs
  - plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs
  - plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.cjs
  - plugins/aoforge/hooks/gate-interactive.js
  - plugins/aoforge/hooks/gate-interactive.test.js
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
autonomous: true
requirements: [SC-1]
must_haves:
  truths:
    - "watcher-state reads and removes only the watch-state pid file (`~/.claude/aoforge/state/watch/aoforge-watch.pid`, or $AOFORGE_HANDOFF_PID_FILE); it never reads `~/.aoforge/aoforge-watch.pid` as the daemon record and never reads the pre-rename daemon's file; no record carries `legacy`; ELEGACYDAEMON is gone"
    - "`aoforge-watch logs` prints only the watch-state log"
    - "`interimDaemon()` reports a daemon AOForge 3.0.0 started (pid file `~/.aoforge/aoforge-watch.pid`, process alive by signal 0) without adopting it; `aoforge-watch start` refuses (exit 2) while one is live, naming its pid, `kill <pid>` and the service reinstall; `aoforge-watch status` prints the same as a warning"
    - "gate-interactive, handoff-results, watcher-daemon and flutter-ui-setup no longer test for a `legacy` pid record"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
      provides: "single-location pid record plus the 3.0.0-daemon detector"
      exports: [pidFilePath, readPidFile, writePidFile, removePidFile, isWatcherLive, interimDaemon]
  key_links:
    - from: plugins/aoforge/aoforge/bin/aoforge-watch.cjs cmdStart
      to: watcher-state.interimDaemon
      via: "a live 3.0.0 daemon is named instead of a second daemon starting beside it"
      pattern: "interimDaemon"
---

# TRD 78-05: The watch daemon reads its pid and log from the runtime home only

<objective>
Remove the one-release readers that let 3.x find the watch daemon's pid file and log in `~/.aoforge/` (where 3.0.0 kept
them, TRD 73-11/73-12) and in the pre-rename dot directory (TRD 72-12), and the `legacy` record that came with them.
Because a daemon 3.0.0 started is the same program reading its old pid file, add a detector so `aoforge-watch start`
names it instead of starting a second daemon beside it.

Purpose: SC-1 (no legacy dot-dir fallback for watch state; the 3.0.0 `~/.aoforge` pid/log readers are removed, as the
user decided). Moving the leftover files stays doctor check 17's job (78-06).
Output: a single-location watcher-state, a 3.0.0-daemon refusal, simplified consumers.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/73-handoff-gaps-and-result-injection/73-12-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/watcher-state.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-05): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use a scratch HOME (`process.env.HOME` per test); never the real `~/.claude` or `~/.aoforge`. Never start a
  real daemon against the user's home. Never port 8080. Never push, tag or release.
- `.aoforge` as the USER dot directory is `NAMES.userDotDir` (AOForge's own 3.0.0 name, not a legacy name); the
  pre-rename one is `LEGACY.userDotDir`.

Decision this TRD records (copy, with its reason, into the SUMMARY):
- **A live 3.0.0 daemon is detected, not adopted.** Reason: the user removed the 3.0.0 pid/log readers; without a
  detector, `aoforge-watch start` would start a second daemon next to one still serving from `~/.aoforge/`. Probing a
  pid with signal 0 makes nothing work under the old location; it only names what to stop.
</context>

<embedded_context>

<codebase_examples>
watcher-state.cjs today:
```js
const INTERIM_DOT_DIR = '.aoforge';
function readablePidFile() {
  ...
  const r = compat.resolveUserFile(homeDir(), PID_FILE_NAME, { fsImpl: fs, legacyName: `${LEGACY.watch}.pid`, currentDir: path.dirname(current) });
  return { file: r.file, legacy: r.which === 'legacy', interim: r.which === 'interim' };
}
function legacyDaemonError(pid) { ... err.code = 'ELEGACYDAEMON'; ... }
function removePidFile() {
  const files = [pidFilePath()];
  if (!process.env.AOFORGE_HANDOFF_PID_FILE) files.push(path.join(homeDir(), INTERIM_DOT_DIR, PID_FILE_NAME));
  ...
}
```
aoforge-watch.cjs:
```js
function readableLogFile() {
  return resolveUserFile(homeDir(), LOG_FILE_NAME, { currentDir: watchStateDir(homeDir()) }).file;
}
```
Consumers of the `legacy` flag: hooks/gate-interactive.js `return info && !info.legacy ? info : null;`,
lib/handoff-results.cjs `if (!info || info.legacy) return false;`, lib/watcher-daemon.cjs
`(pidInfo && !pidInfo.legacy && Array.isArray(pidInfo.watching) ...)`, lib/flutter-ui-setup.cjs (advisory branch).
</codebase_examples>

<anti_patterns>
- Do not keep reading `~/.aoforge/aoforge-watch.pid` as the record "just for stop": the detector reports, it does not
  serve status/stop/add-project from that file.
- Do not signal any process other than with signal 0, and never in tests against a real pid you did not spawn.
- Do not touch compat.cjs (`resolveUserFile` simplification is 78-11) or watcher-allowlist.cjs (78-11).
- Do not touch the `aliasLegacyEnv` line in aoforge-watch.cjs or gate-interactive.js (78-10).
- Keep the "spelled here because stub runtimes copy this file alone" design: watcher-state must still work without
  compat.cjs present (fail open on MODULE_NOT_FOUND) — after this TRD it should not need compat at all.
</anti_patterns>

<error_recovery>
- The node-pty daemon suites may skip on this machine without node-pty linked; the pid-file logic is testable without
  them. Do not chase pty failures unrelated to this TRD; say which suites skipped.
- If service-installer tests read the 3.0.0 log location, leave them unless they fail; check 17 (78-06) owns service
  log leftovers.
</error_recovery>

</embedded_context>

<gotchas>
- `isWatcherLive()` must now consider only the current record; a test that seeded only `~/.aoforge/aoforge-watch.pid`
  and expected "live" flips to "not live" plus an `interimDaemon()` hit.
- file-identities.legacy.test.cjs tests 6b and 6c (pre-rename daemon pid and flutter-ui setup) belong to this TRD:
  rewrite them to "not read" / "no special case". Leave tests 4, 5, 6 and 7 (user files) for 78-11.
- The deleted ELEGACYDAEMON code may be named in docs; 78-12 updates docs.
</gotchas>

## Test list

Outermost first; fake homes from `__fixtures__/daemon-polish-fixtures.cjs` (extend it by hand; no generated data).
1. `aoforge-watch start` with a scratch HOME whose `~/.aoforge/aoforge-watch.pid` names a live process the test
   spawned (`node -e "setInterval(()=>{},1e4)"`): exit 2, stderr names the pid, `kill <pid>` and
   `install-service`, and no pid file is written under the watch-state directory. With a stale pid (dead process):
   start proceeds normally.
2. `aoforge-watch status` in the same live case: prints the 3.0.0-daemon warning; in a clean home: unchanged output.
3. `aoforge-watch logs` with only `~/.aoforge/aoforge-watch.log`: prints nothing from it (reports no log).
4. `readPidFile()` with only `~/.aoforge/aoforge-watch.pid` or only the pre-rename daemon's pid file: null;
   `removePidFile()` leaves both of those files untouched; with the watch-state file: as before.
5. `interimDaemon()`: null with no file; `{ pid, live: false }` for a stale pid; `{ pid, live: true }` for a live one;
   malformed JSON -> null.
6. gate-interactive with only a 3.0.0 pid file present: treats the daemon as not live (asks for `! cmd`), never queues
   to it.
7. handoff-results / watcher-daemon / flutter-ui-setup: no behaviour keyed on a `legacy` record (the fields are absent
   from every record).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixtures and RED tests</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/daemon-polish-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs, plugins/aoforge/hooks/gate-interactive.test.js, plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs</files>
  <action>
Add a hand-built helper to daemon-polish-fixtures.cjs: `seedInterimPid(home, { live })` writes
`<home>/.aoforge/aoforge-watch.pid` with `{ pid, version: '3.0.0', watching: [] }`, where `live: true` spawns a
detached sleeper whose pid is used and returns a `stop()` that kills it; `live: false` uses a pid known dead (spawn and
wait for exit). Write cases 1-6 (rewrite the 73-12 interim cases and 72-12 legacy cases in watcher-state.test.cjs and
file-identities 6b/6c to the new behaviour). Commit failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs` fails only on the new/rewritten cases.</verify>
  <done>RED commit with cases 1-6; every spawned sleeper is killed in `after`.</done>
  <recovery>If spawning a live process is flaky in CI, use `process.pid` of the test runner itself as the "live" pid (signal 0 succeeds) and a pid from an exited child as "stale".</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — watcher-state and aoforge-watch</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-state.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.cjs</files>
  <action>
- watcher-state.cjs: `readPidFile()` reads `pidFilePath()` only; delete `readablePidFile`, the compat/LEGACY requires,
  `legacyDaemonError` and both `current.legacy` throws in add/removeWatchedProject; `removePidFile()` removes only
  `pidFilePath()`. Keep INTERIM_DOT_DIR as the detector's location and add `interimDaemon()` ->
  `null | { pid, file, live }` (read `<home>/<INTERIM_DOT_DIR>/aoforge-watch.pid`, parse, `process.kill(pid, 0)` in a
  try: EPERM counts as live, ESRCH as dead). Rewrite the header ("Read order" becomes one location plus the detector).
- aoforge-watch.cjs: `readableLogFile()` -> `logFilePath()`; drop the resolveUserFile import if unused. In `cmdStart`,
  before the "already running" check, if `interimDaemon()` is live: print `an aoforge-watch daemon started by AOForge
  3.0.0 is still running (pid N, <file>); this release no longer reads that file. Stop it with \`kill N\` (a login
  service: run \`aoforge-watch install-service --project <path>\` again), then run \`aoforge-watch start\`` and exit 2.
  In `cmdStatus`, print the same text as a `warning:` line when live.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs` passes (except tests 4-7 of file-identities, which still pass unchanged); `rg -n "ELEGACYDAEMON|legacyName|resolveUserFile|LEGACY" plugins/aoforge/aoforge/bin/lib/watcher-state.cjs plugins/aoforge/aoforge/bin/aoforge-watch.cjs` finds nothing.</verify>
  <done>Cases 1-5 green.</done>
  <recovery>If removing the compat require breaks the "stub runtime copies this file alone" test, that test now simply passes with fewer branches; update its comment, not the code.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — consumers stop testing for a legacy record</name>
  <files>plugins/aoforge/hooks/gate-interactive.js, plugins/aoforge/aoforge/bin/lib/handoff-results.cjs, plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs, plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs, plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.cjs</files>
  <action>
Remove each `legacy` check (gate-interactive `!info.legacy`, handoff-results `info.legacy`, watcher-daemon
`!pidInfo.legacy`, flutter-ui-setup's legacy advisory branch) and its comment. Update tests that seeded a `legacy: true`
record (handoff-results.test.cjs, inject-handoff-results.test.js, flutter-ui-setup tests) to the plain behaviour or
delete the case when it only covered the removed branch.
  </action>
  <verify>`node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs plugins/aoforge/aoforge/bin/lib/flutter-ui-setup*.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-daemon*.test.cjs` passes (pty-dependent suites may skip; say which); `rg -n "\.legacy\b" plugins/aoforge/hooks/gate-interactive.js plugins/aoforge/aoforge/bin/lib/handoff-results.cjs plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.cjs` finds nothing.</verify>
  <done>Cases 6-7 green.</done>
  <recovery>If a test fixture writes `legacy: true` into a pid file, drop the field from the fixture rather than keeping a dead branch.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- Cases 1-7 green; RED before GREEN.
- No test touches the real home: `rg -n "os.homedir\(\)" plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs` shows no use outside HOME overrides.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- The watch daemon has one pid file and one log; a 3.0.0 daemon is named, never duplicated. Decision recorded.
</success_criteria>

<output>
After completion, write `78-05-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-05 --from <draft>`
(after `tokens stamp 78-05 --draft <draft>`). Name any pty suites that skipped.
</output>
