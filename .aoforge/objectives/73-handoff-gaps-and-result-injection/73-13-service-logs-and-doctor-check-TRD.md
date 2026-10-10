---
objective: 73-handoff-gaps-and-result-injection
trd: "13"
type: standard
wave: 3
depends_on: ["73-11"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/service-installer.cjs
  - plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
  - plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs
autonomous: true
gap_closure: true
requirements: [HND-03]
must_haves:
  truths:
    - "A newly installed launchd plist writes StandardOutPath / StandardErrorPath to `<home>/.claude/aoforge/state/watch/launchd-{stdout,stderr}.log`, a systemd unit to `%h/.claude/aoforge/state/watch/systemd-{stdout,stderr}.log`, and installService creates that directory (never `<home>/.aoforge`)"
    - "`aof-tools doctor --global` reports check `user-dot-dir`: ok when `~/.aoforge/` does not exist; warn, fixable, when it holds only files AOForge 3.0.0 wrote there (the watch daemon's pid, log and service logs; defaults.json, brave_api_key, aoforge-watch-allow.json)"
    - "`doctor --global --fix` moves each such file to its new home (watch files to `~/.claude/aoforge/state/watch/`, user files to `~/.claude/aoforge/`), moves a stale pid file and any file whose destination already exists into `~/.claude/aoforge/backups/aoforge-dot-dir-<timestamp>/` instead, never overwrites and never deletes, and removes `~/.aoforge/` only when it is then empty"
    - "The fix is refused (report-only, naming the command) while the pid file there names a live process (`aoforge-watch stop` first) or an installed launchd plist / systemd unit still names `/.aoforge/` (reinstall the service first)"
    - "When `~/.aoforge/` holds planning files (STATE.md, ROADMAP.md, PROJECT.md, config.json or objectives/), the check is report-only: it says $HOME is never an AOForge project and touches nothing"
    - "Files the check does not know are listed and left in place; the directory then stays"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
      provides: "global doctor check for a leftover ~/.aoforge/ and its safe, reversible fix"
      exports: ["id", "title", "scope", "run", "fix"]
    - path: plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs
      provides: "fake-home tests for every run/fix branch"
    - path: plugins/aoforge/aoforge/bin/lib/service-installer.cjs
      provides: "service logs in the watch state directory; servicePaths(home)"
      exports: ["installService", "uninstallService", "renderLaunchdPlist", "renderSystemdUnit", "servicePaths"]
  key_links:
    - from: "17-user-dot-dir.cjs"
      to: "compat.watchStateDir / compat.runtimeHome"
      via: "destinations for moved files"
      pattern: "watchStateDir"
    - from: "17-user-dot-dir.cjs fix"
      to: "global-upgrade.moveEntry"
      via: "the one verified mover (rename, EXDEV copy-verify-remove)"
      pattern: "moveEntry"
    - from: "17-user-dot-dir.cjs run"
      to: "service-installer.servicePaths"
      via: "detects an installed service that still logs into ~/.aoforge/"
      pattern: "servicePaths"
---

# TRD 73-13: Service logs leave ~/.aoforge, and doctor cleans up a leftover ~/.aoforge

<objective>
Gap G5, the last two items in `73-VERIFICATION.md`'s `missing` list.

1. `service-installer.cjs` (`_aoforgeLogDir`, line 57; the systemd unit's `%h/.aoforge/...` lines) points the
   launchd/systemd logs of an installed watch service into `~/.aoforge/`. Move them to the watch state directory
   (`compat.watchStateDir`, 73-11) so no AOForge writer is left that creates `~/.aoforge/`.
2. A machine that ran 3.0.0's watcher, its service, or `/aoforge:settings` "save as defaults" already has a
   `~/.aoforge/`. After 73-09 it no longer turns $HOME into a project, and after 73-11/73-12 its files are still read
   for one release, but it should go. A global doctor check reports it and, with `--fix`, moves what AOForge put there
   to the new locations, never deleting and never overwriting.

Purpose: G5 (verifier's missing items 1 and 4). Output: the service paths, check 17 `user-dot-dir`, its tests, the
README row and the e2e id list.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixture builders (fake
homes), no property-based libraries, no `.feature` files. User playbook: failing test first, one at a time.

Read 73-11's SUMMARY (`watchStateDir`, `resolveUserFile`, `home-dot-dir-fixtures.cjs` builders as built).

Read narrowly:
- `plugins/aoforge/aoforge/bin/lib/service-installer.cjs`: `LABEL` 24, path helpers 52-57, `renderLaunchdPlist`
  64-101, `renderSystemdUnit` 107-123, `installService` 135-160, exports 194-201.
- `plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs` 105-130 (P-8, the launchd log path test) and the
  systemd render test.
- `plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md` (the whole contract, ~80 lines) and
  `15-legacy-df-install.cjs` (80 lines: house style for a global check whose fix moves into backups, never deletes).
- `plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs` 1-60 (fake-home test style,
  running the check through `doctor.cjs` and through the CLI with HOME pointed at the fake home).
- `plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs` 140-158 (`moveEntry`, not exported today) and exports 534-545.
- `plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs` 115-127 (`GLOBAL_IDS`: add `user-dot-dir`).
- `plugins/aoforge/aoforge/bin/lib/doctor.cjs` 40-55 and 215-230 (`ctx.paths`: `backupsDir`, `mirrorDir`).
</context>

## Test list

**service-installer (`service-installer.test.cjs`):**
1. P-8 rewritten: the plist's StandardOutPath / StandardErrorPath are `<HOME>/.claude/aoforge/state/watch/launchd-stdout.log`
   and `...-stderr.log` (built with `compat.watchStateDir`).
2. The systemd unit's StandardOutput / StandardError are `append:%h/.claude/aoforge/state/watch/systemd-stdout.log` /
   `...-stderr.log`.
3. `installService({ platform: 'darwin', ... })` with `_setRunExec` stubbed creates `watchStateDir(HOME)` and no
   `<HOME>/.aoforge`.
4. `servicePaths(home)` -> `{ launchd: <home>/Library/LaunchAgents/com.aocyber.aoforge-watch.plist, systemd: <home>/.config/systemd/user/aoforge-watch.service }`.

**Doctor check 17 (`17-user-dot-dir.test.cjs`, fake homes; `run`/`fix` called through `doctor.cjs` as check 15's
tests do, plus one CLI case):**
5. No `~/.aoforge` -> `ok`, not fixable.
6. `~/.aoforge/{aoforge-watch.log, defaults.json}` -> `warn`, fixable, finding names both files and their new homes.
7. Fix on case 6 -> `aoforge-watch.log` in `~/.claude/aoforge/state/watch/`, `defaults.json` in `~/.claude/aoforge/`,
   `~/.aoforge` removed, `changed` lists the absolute new paths; re-run is `ok`.
8. Destination exists (`~/.claude/aoforge/defaults.json` already there) -> the `~/.aoforge` copy goes to
   `backups/aoforge-dot-dir-<ts>/defaults.json`, the existing file is byte-identical afterwards.
9. Stale pid (`aoforge-watch.pid` with pid 999999) -> moved to the backup directory, not to the watch directory.
10. Live pid (`process.pid`) -> `warn`, not fixable, `fix_command` names `aoforge-watch stop`; nothing moves.
11. An installed plist under the fake home's `Library/LaunchAgents/` whose text contains `/.aoforge/` -> not fixable,
    finding names reinstalling the service (`aoforge-watch uninstall-service`, then `install-service` as the CLI
    spells it); nothing moves.
12. Planning files (`~/.aoforge/STATE.md`, `~/.aoforge/objectives/`) -> `warn`, report-only, finding says $HOME is
    never an AOForge project; nothing moves.
13. An unknown file (`~/.aoforge/notes.txt`) beside a known one -> fix moves the known one, leaves `notes.txt`, keeps
    the directory, notes name it; re-run is `warn` naming `notes.txt`, not fixable.
14. CLI: `aof-tools doctor --global --json` with HOME = fake home holding case 6 reports `user-dot-dir` as `warn`;
    `--fix` then reports it `ok`.
15. `doctor.e2e.test.cjs` `GLOBAL_IDS` includes `user-dot-dir` and the e2e run passes.

<embedded_context>

<codebase_examples>
Check skeleton (house style of `15-legacy-df-install.cjs`; every path from ctx, never `os.homedir()`/`process.env`):
```js
'use strict';
// Doctor check: user-dot-dir (objective 73, TRD 73-13, gap G5).
//
// AOForge 3.0.0 kept user files and the watch daemon's files in ~/.aoforge/, the planning directory's name. 73-09
// stops $HOME from ever being a project and 73-11/73-12 moved the files to the runtime home, reading the old copies
// for one release. This check finds a leftover ~/.aoforge/ and, on --fix, moves what AOForge put there:
//
//   absent                                        -> ok
//   planning files inside                          -> warn, report-only ($HOME is never a project; yours to move)
//   live daemon pid / service still logging there  -> warn, report-only, names the command to run first
//   known files                                     -> warn, fixable: moved to the new home, or into
//                                                      backups/aoforge-dot-dir-<ts>/ when the destination exists or
//                                                      the pid is stale; never deleted, never overwritten
//   unknown files                                   -> listed, left in place (the directory stays)

const fs = require('fs');
const path = require('path');
const { NAMES } = require('../legacy-names.cjs');
const { watchStateDir, runtimeHome } = require('../compat.cjs');
const { moveEntry } = require('../global-upgrade.cjs');
const { servicePaths } = require('../service-installer.cjs');

const TO_WATCH = ['aoforge-watch.pid', 'aoforge-watch.log', 'launchd-stdout.log', 'launchd-stderr.log',
  'systemd-stdout.log', 'systemd-stderr.log'];
const TO_RUNTIME = ['defaults.json', 'brave_api_key', 'aoforge-watch-allow.json'];
const PLANNING = ['STATE.md', 'ROADMAP.md', 'PROJECT.md', 'config.json', 'objectives'];

function scan(ctx) {
  // dir = path.join(ctx.userHome, NAMES.userDotDir); not a directory -> { absent: true }
  // entries: readdir; classify into known (with destination), planning, unknown
  // pidLive: read <dir>/aoforge-watch.pid JSON, typeof pid === 'number' && process.kill(pid, 0) succeeds
  // servicesPointing: for each of servicePaths(ctx.userHome) that is a file whose text includes `/${NAMES.userDotDir}/`
}
function run(ctx) { /* severity/finding/fixable/fix_command/details from scan */ }
function fix(ctx) {
  // re-scan; refuse ({ applied: false, refused }) unless fixable now
  // backupDir = path.join(ctx.paths.backupsDir, `aoforge-dot-dir-${stamp(ctx.now)}`)   (stamp: ISO with ':' and '.' -> '-')
  // for each known regular file: dest = stale pid ? backup : (exists(dest) ? backup : dest); mkdir parent; moveEntry
  // rmdir the directory only if readdir is now empty
  // return { applied, changed: [absolute new paths], backup: backupDir if used, notes }
}
module.exports = { id: 'user-dot-dir', title: 'Files AOForge 3.0.0 left in ~/.aoforge', scope: 'global', run, fix };
```
service-installer:
```js
const { watchStateDir } = require('./compat.cjs');
function _watchLogDir() { return watchStateDir(_userHome()); }            // replaces _aoforgeLogDir
// systemd: StandardOutput=append:%h/.claude/aoforge/state/watch/systemd-stdout.log   (systemd expands %h, not $HOME)
function servicePaths(home) {
  return {
    launchd: path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`),
    systemd: path.join(home, '.config', 'systemd', 'user', 'aoforge-watch.service'),
  };
}
```
Build the systemd `%h/...` suffix from `path.relative(home, watchStateDir(home))` with posix separators, so it cannot
drift from compat.
</codebase_examples>

<anti_patterns>
- Never delete a user file. A file whose destination exists goes to the backup directory; the user decides.
- Never move anything while a daemon is live or a service still logs there; never edit or reload a service
  (`launchctl`/`systemctl`) from the doctor.
- Never touch planning files or unknown files in `~/.aoforge/`.
- Do not read `os.homedir()` or `process.env` in the check (README "What a check must not do"); tests pass a fake home.
- Do not run the real `doctor --global --fix` against this machine's home in the tests or as a verification step; the
  CLI case uses a fake HOME. Whether to run it on the real machine is the user's call (note it in the SUMMARY).
- Do not run `aoforge-watch install-service` for real: tests stub `_runExec`.
- No generated test data.
</anti_patterns>

<error_recovery>
- A test that expects `ok` after the fix sees `warn`: an empty `~/.aoforge/` was left (rmdir skipped) or a stale
  temp file appeared; list the directory in the assertion message.
- The CLI case reads the real home: the child env must set HOME (and USERPROFILE) to the fake home, as check 15's CLI
  test does.
- `doctor.e2e.test.cjs` fails on id order: it compares sorted lists; just add the id.
- `moveEntry` throws on EXDEV verification: the fake home and its backups live under one temp dir, so EXDEV should not
  occur in tests; if it does, `os.tmpdir()` and the fake home are on different volumes; keep both under one mkdtemp.
</error_recovery>

</embedded_context>

<gotchas>
- `home-dot-dir-fixtures.cjs` is shared (73-09/73-11); this TRD may extend it (73-12, the same wave, does not touch
  it). Useful builders: `withDotDirFiles(home, files)`, `writeServiceFile(home, kind, text)`.
- The README's range table names every global check: add `17-user-dot-dir` (TRD 73-13) to the `10-19` row.
- `doctor --global` runs global checks only; without `--global` they still run. This check is global.
- This executor runs under the INSTALLED 3.0.0 plugin, whose gate-interactive still matches inside quoted arguments:
  never put a TTY command name inside a quoted Bash argument or a commit message; delete any stray
  `.aoforge-handoff/pending/<id>.json` a denied call leaves.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Service logs in the watch state directory</name>
  <files>plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs, plugins/aoforge/aoforge/bin/lib/service-installer.cjs</files>
  <action>
RED: rewrite P-8 and the systemd render expectation (items 1-2) and add items 3-4; run them and commit the tests
(`test(73-13): pin the watch service logs in the runtime home`). GREEN: replace `_aoforgeLogDir` with the watch state
directory, build the systemd `%h/...` paths from it, export `servicePaths(home)`, and keep `installService`'s mkdir
on the new directory. Commit `fix(73-13): write the watch service logs to the runtime home`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs exits 0 after the GREEN commit (non-zero at the RED commit); rg -n -F '/.aoforge' plugins/aoforge/aoforge/bin/lib/service-installer.cjs and rg -n "_aoforgeLogDir" plugins/aoforge/aoforge/bin/lib/service-installer.cjs find nothing (the launchd label `com.aocyber.aoforge-watch` is expected and is not a path)</verify>
  <done>An installed service logs to `~/.claude/aoforge/state/watch/`; nothing in the installer names `~/.aoforge/`.</done>
  <recovery>If a launchd plist test depends on HOME being read at render time, keep `_userHome()` per call (no caching).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED, doctor check user-dot-dir</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs</files>
  <action>
Extend the fixtures with the builders in gotchas. Write test list items 5-14 in `17-user-dot-dir.test.cjs` (header:
the G5 reason, the branches, "no_llm_test_data: hand-built fake homes") and add `user-dot-dir` to `GLOBAL_IDS`
(item 15). Run: everything fails (the module does not exist; the e2e id list mismatches). Commit the tests alone:
`test(73-13): pin the doctor check for a leftover dot directory`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs exits non-zero for the missing check</verify>
  <done>The check's behaviour is pinned by failing tests; RED output captured.</done>
  <recovery>If the e2e file fails for an unrelated reason before the change, record the baseline failure and compare against it in Task 3.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN, check 17 and its README row</name>
  <files>plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs, plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md</files>
  <action>
Export `moveEntry` from `global-upgrade.cjs` (no behaviour change). Implement the check per codebase_examples; make
items 5-15 pass one at a time. Add `17-user-dot-dir` (TRD 73-13: a leftover `~/.aoforge/`; fix moves AOForge's files
to the runtime home or into `backups/aoforge-dot-dir-<ts>/`, never deletes; report-only for planning files, a live
daemon or a service still logging there) to the README's `10-19` row. Run the doctor tests and the full suite. Commit
`feat(73-13): doctor check for files left in the user dot directory`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs exits 0; npm test shows no new failures</verify>
  <done>`doctor --global` reports a leftover `~/.aoforge/` and `--fix` empties it safely; check 15's tests still pass with the shared mover exported.</done>
  <recovery>If exporting `moveEntry` breaks a global-upgrade test that pins the export list, add the name to that list rather than duplicating the mover.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "id: 'user-dot-dir'" plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs` finds the id.
- `rg -n "17-user-dot-dir" plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md` finds the row.
- `rg -n -F '/.aoforge' plugins/aoforge/aoforge/bin/lib/service-installer.cjs` finds nothing.
- RED commits precede GREEN commits; full suite has no new failures.
</verification>

<success_criteria>
- No AOForge writer creates `~/.aoforge/` any more, the installed service included.
- A user who ran 3.0.0 can see the leftover directory in `doctor --global` and clear it with `--fix`, losing nothing.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-13-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table, the check's branches as built, and a note that running
`doctor --global --fix` on the user's own machine is their call.
</output>
