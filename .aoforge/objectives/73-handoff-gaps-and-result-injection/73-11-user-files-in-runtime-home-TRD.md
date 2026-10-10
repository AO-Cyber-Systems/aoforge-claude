---
objective: 73-handoff-gaps-and-result-injection
trd: "11"
type: standard
wave: 2
depends_on: ["73-09"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
  - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs
  - plugins/aoforge/aoforge/bin/lib/config.cjs
  - plugins/aoforge/aoforge/bin/lib/init.cjs
autonomous: true
gap_closure: true
requirements: [HND-03]
must_haves:
  truths:
    - "compat.userDotFile resolves a user file from the runtime home first (`<home>/.claude/aoforge/<name>`), then `<home>/.aoforge/<name>` (where 3.0.0 kept it, read for one release), then the pre-rename dot directory, else returns the runtime-home path"
    - "defaults.json, the Brave API key and the watch allowlist follow that order with no change at their call sites; a file in any one location is found, and the newest location wins when several exist"
    - "compat exports watchStateDir(home) = `<home>/.claude/aoforge/state/watch` and resolveUserFile(home, name, { fsImpl, legacyName, currentDir }) -> { file, which: 'current' | 'interim' | 'legacy' }"
    - "Nothing in compat, config, init or the allowlist reader writes, moves or creates a file in `~/.aoforge/` or the pre-rename dot directory"
    - "The 72-12 legacy identity tests 4-7 (file-identities.legacy.test.cjs) still pass unchanged"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/compat.cjs
      provides: "watchStateDir, resolveUserFile, userDotFile with the runtime home first"
      exports: ["watchStateDir", "resolveUserFile", "userDotFile"]
    - path: plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
      provides: "unit tests for the resolver order and the watch directory"
  key_links:
    - from: "watcher-allowlist.cjs userAllowFilePath / config.cjs / init.cjs"
      to: "compat.userDotFile"
      via: "unchanged call sites; the resolver order changed"
      pattern: "userDotFile\\("
    - from: "compat.userDotFile"
      to: "compat.resolveUserFile"
      via: "thin wrapper"
      pattern: "resolveUserFile\\("
---

# TRD 73-11: User files resolve from the runtime home

<objective>
Gap G5, side (b), first half. `~/.aoforge/` is a user dot directory with the same name as the planning directory.
73-09 makes it harmless for project detection; 73-11 and 73-12 make AOForge stop using it.

This TRD moves the read path for the user's own files that `compat.userDotFile` resolves (defaults.json, the Brave API
key, the watch allowlist) to the runtime home, `~/.claude/aoforge/`, where calibration.json, audit.log, `stacks/` and
`state/**` already live. For one release the resolver still reads `~/.aoforge/` (3.0.0) and the pre-rename dot
directory, newest location first, so nobody's settings disappear. It also adds the two primitives 73-12 and 73-13
build on: `watchStateDir(home)` (the daemon's runtime directory, `~/.claude/aoforge/state/watch/`) and
`resolveUserFile` (the resolver with its source, and a configurable current directory for the pid and log).

The watch daemon's pid and log move in 73-12, the service log paths and the leftover-directory doctor check in 73-13,
prose in 73-14.

Purpose: G5 (b), user-file layer. Output: the compat resolver, its tests, the allowlist test and comments updated.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature` (gap closure): TDD strict, test list first, hand-built fixture builders, no
property-based libraries, no `.feature` files. User playbook: failing test first, one at a time.

Read 73-09's SUMMARY first (`73-09-SUMMARY.md`): `home-dot-dir-fixtures.cjs` as built and compat's new exports.

Read narrowly:
- `plugins/aoforge/aoforge/bin/lib/compat.cjs`: header comment, `isFile`, and `userDotFile` / `runtimeHome` /
  `legacyRuntimeHome` near the end (after 73-09's additions).
- `plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs` 270-305 (tests 14, 14b, 14c on `userDotFile`).
- `plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs` 1-25 (header) and 126-137 (`userAllowFilePath`).
- `plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs` 25-40 (`withHome`) and 170-205 (the default-path
  tests that expect `~/.aoforge/aoforge-watch-allow.json`).
- `plugins/aoforge/aoforge/bin/lib/config.cjs` 94-101 and `init.cjs` 681-684: callers (comments only change).
- `plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs` 262-300 (72-12 tests 4-6, which must keep
  passing) and `__fixtures__/legacy-identity-fixtures.cjs` `dotHome` 140-165 (its `newDir` is `~/.aoforge`; leave it).

Runtime home precedent: sync-runtime replaces only the mirrored subdirectories (`runtime-digest.cjs` `SUBDIRS`:
workflows, references, templates, bin, schemas, stack-profiles), so top-level files in `~/.claude/aoforge/` survive
every mirror (calibration.json does today).
</context>

## Test list

**compat (`compat.home.test.cjs`, appended; temp homes from `home-dot-dir-fixtures.cjs`):**
1. `watchStateDir(h)` is `<h>/.claude/aoforge/state/watch`.
2. `resolveUserFile(h, 'defaults.json')` with nothing on disk -> `{ file: <h>/.claude/aoforge/defaults.json, which: 'current' }`.
3. Only `<h>/.aoforge/defaults.json` -> `which: 'interim'` and that path.
4. Runtime-home file and `~/.aoforge/` file -> `which: 'current'`.
5. `resolveUserFile(h, 'x.pid', { currentDir: watchStateDir(h) })` with the file in the watch directory -> `'current'`;
   with only `<h>/.aoforge/x.pid` -> `'interim'`.
6. A directory (not a file) at the runtime-home path is skipped, as `isFile` does today.
7. `userDotFile(h, name)` equals `resolveUserFile(h, name).file` for cases 2-4.

**compat legacy (`compat.legacy.test.cjs`, the 14 series rewritten):**
8. 14: runtime-home file present with `~/.aoforge/` and pre-rename files -> the runtime-home file.
   14b: only the pre-rename file -> it (`which: 'legacy'`). 14c: none -> the runtime-home path.
   14d: `~/.aoforge/` and pre-rename -> `~/.aoforge/`. 14e: `legacyName` is honoured for the pre-rename file.

**Allowlist (`watcher-allowlist.test.cjs`):**
9. Default user file path (no override variable) is `<home>/.claude/aoforge/aoforge-watch-allow.json`.
10. A file only at `<home>/.aoforge/aoforge-watch-allow.json` is still loaded (one-release read); when both exist the
    runtime-home file wins.
11. The existing override-variable and malformed-file tests pass with the file at the new default path.

**Callers (no new tests; must stay green):**
12. `file-identities.legacy.test.cjs` 72-12 tests 4, 5, 6 and 7 pass unchanged.

<embedded_context>

<codebase_examples>
`userDotFile` today (`compat.cjs`, end of file):
```js
function userDotFile(home, name, fsImpl = fs, legacyName = name) {
  const current = path.join(home, NAMES.userDotDir, name);
  if (isFile(current, fsImpl)) return current;
  const legacy = path.join(home, LEGACY.userDotDir, legacyName);
  if (isFile(legacy, fsImpl)) return legacy;
  return current;
}
```
New (after `runtimeHome`):
```js
/** The watch daemon's runtime directory (pid, log, service logs): <home>/.claude/aoforge/state/watch (TRD 73-11). */
function watchStateDir(home) {
  return path.join(runtimeHome(home), 'state', 'watch');
}

/**
 * Where a file AOForge keeps for the user is read from. The first existing FILE wins:
 *   'current'  <currentDir>/<name>                     default currentDir: the runtime home
 *   'interim'  <home>/<NAMES.userDotDir>/<name>         AOForge 3.0.0 kept user files there; read for one release
 *   'legacy'   <home>/<LEGACY.userDotDir>/<legacyName>  pre-rename; read for one release
 * else the 'current' path, which is the only place a writer writes.
 */
function resolveUserFile(home, name, { fsImpl = fs, legacyName = name, currentDir = runtimeHome(home) } = {}) {
  const current = path.join(currentDir, name);
  if (isFile(current, fsImpl)) return { file: current, which: 'current' };
  const interim = path.join(home, NAMES.userDotDir, name);
  if (isFile(interim, fsImpl)) return { file: interim, which: 'interim' };
  const legacy = path.join(home, LEGACY.userDotDir, legacyName);
  if (isFile(legacy, fsImpl)) return { file: legacy, which: 'legacy' };
  return { file: current, which: 'current' };
}

function userDotFile(home, name, fsImpl = fs, legacyName = name) {
  return resolveUserFile(home, name, { fsImpl, legacyName }).file;
}
```
`runtimeHome` is defined below `userDotFile` today; function declarations hoist, but keep the new helpers after it
for reading order.
</codebase_examples>

<anti_patterns>
- Do not change `NAMES.userDotDir` in `legacy-names.cjs`: it still names the 3.0.0 location that is read for one
  release, and `legacy-names.legacy.test.cjs` pins the map.
- Do not copy or move a user's file on read ("auto-migrate"). Moving leftovers is 73-13's doctor check, on request.
- Do not touch watcher-state, aoforge-watch or the service installer here; 73-12 and 73-13 own them.
- Do not spell a legacy name outside `*.legacy.test.*` files and the legacy fixtures; build it from `LEGACY`.
- No generated test data; temp homes only.
</anti_patterns>

<error_recovery>
- The whole suite has other readers of user files only through `userDotFile`; if something else fails after the
  change, `rg -n "userDotDir" plugins/aoforge -g '!*.test.*'` shows any code that joined the dot directory by hand.
  Report it in the SUMMARY; fix it here only if it is a reader of the same three files.
- If test 7 of file-identities (nothing under the pre-rename dot directory is moved) fails, the resolver is writing:
  it must only stat.
</error_recovery>

</embedded_context>

<gotchas>
- `compat.home.test.cjs` and `home-dot-dir-fixtures.cjs` are 73-09's files; extend them. A useful builder:
  `writeUserFile(home, where, name, content)` with `where` in `'current' | 'interim' | 'watch'`. Never add a
  pre-rename builder there (that belongs in `legacy-identity-fixtures.cjs`).
- watcher-state still reads its pid file through `userDotFile` until 73-12 rewrites it. Between the two TRDs the read
  keeps working: the daemon writes `~/.aoforge/aoforge-watch.pid`, which the resolver now finds as `'interim'`, the same
  path watcher-state compares against, so the record is not mistaken for the pre-rename daemon's. Task 2's verify runs
  the watcher tests to prove it; do not edit watcher-state here.
- This executor runs under the INSTALLED 3.0.0 plugin, whose gate-interactive still matches inside quoted arguments:
  never put a TTY command name inside a quoted Bash argument or a commit message; delete any stray
  `.aoforge-handoff/pending/<id>.json` a denied call leaves.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the resolver order and the watch directory</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs, plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs</files>
  <action>
Add `writeUserFile` to the fixtures if the tests need it. Write test list items 1-11 one at a time: append 1-7 to
`compat.home.test.cjs`, rewrite the `userDotFile` 14 series in `compat.legacy.test.cjs` as item 8, and change
`watcher-allowlist.test.cjs`'s default-path expectations to the runtime home plus items 10-11. Run: 1-5, 7, 8 (14, 14c,
14d's `which`) and 9-10 fail (missing exports, wrong order). Commit the tests alone:
`test(73-11): pin user files in the runtime home`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs exits non-zero, failing on the missing exports and the runtime-home order</verify>
  <done>The order and the new primitives are specified by failing tests; RED output captured.</done>
  <recovery>If the rename guard fails, a legacy name was spelled outside the allowed files: build it from `LEGACY`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, resolveUserFile, watchStateDir and the comments that named ~/.aoforge</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat.cjs, plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs, plugins/aoforge/aoforge/bin/lib/config.cjs, plugins/aoforge/aoforge/bin/lib/init.cjs</files>
  <action>
Implement per codebase_examples and export both new functions; update compat's header list (userDotFile: the runtime
home, then the 3.0.0 dot directory, then the pre-rename one; watchStateDir; resolveUserFile). Update the comments that
say user files live in `~/.aoforge/`: `watcher-allowlist.cjs` header line 7 and the `userAllowFilePath` JSDoc,
`config.cjs` 94-101, `init.cjs` 681: "the runtime home (`~/.claude/aoforge/`), then `~/.aoforge/` (AOForge 3.0.0) and
the pre-rename dot directory, for one release". No behaviour change in those three files. Make items 1-12 pass one at
a time; run the full suite. Commit `fix(73-11): read user files from the runtime home first`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-state.test.cjs plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs exits 0; npm test shows no new failures</verify>
  <done>User files resolve runtime home first, 3.0.0 dot directory second, pre-rename third; `watchStateDir` and `resolveUserFile` exported; library comments no longer say files are written to `~/.aoforge/`.</done>
  <recovery>If file-identities tests 4-6 fail, the interim step is missing or out of order (they put the "new" file in `~/.aoforge/`): the 3.0.0 location must still beat the pre-rename one.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "function (resolveUserFile|watchStateDir)" plugins/aoforge/aoforge/bin/lib/compat.cjs` finds both; both are in `module.exports`.
- `rg -n -F '~/.aoforge' plugins/aoforge/aoforge/bin/lib/config.cjs plugins/aoforge/aoforge/bin/lib/init.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs` prints only lines that call it the 3.0.0 location.
- RED commit precedes GREEN; full suite has no new failures.
</verification>

<success_criteria>
- A user's defaults, Brave key and allowlist keep working wherever they are, and the runtime home is now where they
  belong.
- 73-12 and 73-13 have `watchStateDir` and `resolveUserFile` to build on.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-11-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table and the resolution order as built.
</output>
