---
objective: 73-handoff-gaps-and-result-injection
trd: "11"
subsystem: compat
tags: [compat, user-files, runtime-home, watcher-allowlist, gap-closure, G5]

requires:
  - objective: 73
    provides: "73-09: home-dot-dir-fixtures.cjs (temp homes) and compat.home.test.cjs"
  - objective: 72
    provides: "compat.userDotFile, runtimeHome and the NAMES/LEGACY maps in legacy-names.cjs"
provides:
  - "compat.userDotFile reads a user file from the runtime home (~/.claude/aoforge/<name>) first, then ~/.aoforge/<name> (AOForge 3.0.0, one release), then the pre-rename dot directory, else returns the runtime-home path"
  - "compat.resolveUserFile(home, name, { fsImpl, legacyName, currentDir }) -> { file, which: 'current' | 'interim' | 'legacy' }"
  - "compat.watchStateDir(home) = <home>/.claude/aoforge/state/watch (for 73-12 and 73-13)"
  - "home-dot-dir-fixtures.cjs: userFileDir(home, where) and writeUserFile(home, where, name, content), where in 'current' | 'interim' | 'watch'"
affects: [73-12 watch daemon state dir, 73-13 service logs and doctor check, 73-14 docs, config-ensure-section, init new-project, aoforge-watch allowlist]

tech-stack:
  added: []
  patterns:
    - "One resolver with its source: userDotFile is a thin wrapper over resolveUserFile, so every reader of a user file shares the order and a caller that needs to know where a file came from (pid, log) asks resolveUserFile"
    - "Fixture locations built from NAMES, not from compat, so the fixture does not lean on the code under test"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
    - plugins/aoforge/aoforge/bin/lib/config.cjs
    - plugins/aoforge/aoforge/bin/lib/init.cjs

key-decisions:
  - "User files resolve runtime home first, ~/.aoforge/ (3.0.0) second, the pre-rename dot directory third; the newest location wins when several hold the file, and nothing is merged across them"
  - "The resolver only stats: no auto-migration on read. Moving leftovers out of ~/.aoforge/ is 73-13's doctor check, on request"
  - "NAMES.userDotDir is unchanged: it still names the 3.0.0 location read for one release"

patterns-established:
  - "resolveUserFile's currentDir option lets a file whose current home is not the runtime-home root (the daemon's pid and log under state/watch) share the same interim and legacy fallbacks"

requirements-completed: [HND-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-10-10
tokens_input: 8599763
tokens_output: 43451
tokens_cache_read: 8460996
tokens_cache_write: 138627
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 73 TRD 11: User files resolve from the runtime home Summary

**compat.userDotFile now reads defaults.json, the Brave API key and the watch allowlist from the runtime home (`~/.claude/aoforge/`) first, falling back to `~/.aoforge/` (3.0.0) and the pre-rename dot directory for one release, through a new `resolveUserFile` that reports its source; `watchStateDir` is in place for 73-12.**

## Progress
- [x] Task 1: RED, the resolver order and the watch directory — 61a4e031
- [x] Task 2: GREEN, resolveUserFile, watchStateDir and the comments that named ~/.aoforge — 1aa3e399

## Performance

- Started: 2026-10-10T01:33:59Z (preflight claim), finished 2026-10-10T01:40:41Z
- Tasks: 2, each committed individually (RED 61a4e031 precedes GREEN 1aa3e399)
- Files modified: 8

## Resolution order as built

`resolveUserFile(home, name, { fsImpl = fs, legacyName = name, currentDir = runtimeHome(home) })`, first existing
FILE wins (a directory at a path is skipped, as `isFile` does):

| which | path | status |
|---|---|---|
| `current` | `<currentDir>/<name>`, default `<home>/.claude/aoforge/<name>` | where the file belongs; the only place a writer writes |
| `interim` | `<home>/.aoforge/<name>` (`NAMES.userDotDir`) | AOForge 3.0.0 kept user files here; read for one release |
| `legacy` | `<home>/<LEGACY.userDotDir>/<legacyName>` | pre-rename; read for one release |
| (none) | the `current` path, `which: 'current'` | |

`userDotFile(home, name, fsImpl, legacyName)` is `resolveUserFile(home, name, { fsImpl, legacyName }).file`, so its
three callers (config-ensure-section's Brave key and defaults.json, init new-project's Brave key, the watch allowlist)
changed order with no change at the call site. `watchStateDir(home)` is `<home>/.claude/aoforge/state/watch`.

## Accomplishments

- `compat.cjs`: `watchStateDir` and `resolveUserFile` added after `runtimeHome` and exported; `userDotFile` is a thin
  wrapper; the header's primitive list names all three.
- Comments that said user files live in `~/.aoforge/` now name the runtime home first and call `~/.aoforge/` the 3.0.0
  location: `watcher-allowlist.cjs` header and `userAllowFilePath` JSDoc, `config.cjs` 94-101, `init.cjs` 681. No
  behaviour change in those three files.
- `home-dot-dir-fixtures.cjs`: `userFileDir` and `writeUserFile` (`'current' | 'interim' | 'watch'`), built from
  `NAMES`; no pre-rename builder added there.
- Between 73-11 and 73-12 the daemon still writes `~/.aoforge/aoforge-watch.pid`; the resolver finds it as `interim`,
  the same path watcher-state compares against, so the watcher-state and aoforge-watch suites stay green unchanged.

## Task Commits

1. **Task 1: RED** — `61a4e031` (test)
2. **Task 2: GREEN** — `1aa3e399` (fix)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test compat.home.test.cjs compat.legacy.test.cjs watcher-allowlist.test.cjs` | 1 | PASS (red as required): 90 tests, 16 fail |
| 2: GREEN | `node --test compat.home.test.cjs compat.legacy.test.cjs watcher-allowlist.test.cjs file-identities.legacy.test.cjs watcher-state.test.cjs ../aoforge-watch.test.cjs` | 0 | PASS: 164 tests, 164 pass |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test compat.home.test.cjs compat.legacy.test.cjs watcher-allowlist.test.cjs` | 1 | FAIL (correct): 16 of 90 fail. compat.home 73-11 1-7 (`watchStateDir` / `resolveUserFile` not functions); compat.legacy 14 and 14c (wrong order: `~/.aoforge/` returned instead of the runtime home), 14b, 14d, 14e (`resolveUserFile` missing); allowlist: default path, runtime-home-wins, malformed and not-a-string (file at the new default not read). The interim-only allowlist test passed, as a regression guard should |
| GREEN | the same three files | 0 | PASS (correct): 90 of 90 |
| GREEN (wider) | the Task 2 verify set (adds file-identities.legacy, watcher-state, aoforge-watch) | 0 | PASS (correct): 164 of 164, including 72-12 tests 4, 5, 6, 6b, 6c and 7 |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.test.cjs` | 0 | PASS (90/90) |
| test (full) | `npm test` (run as `npm --prefix <checkout> test`) | 1 | PASS (no new failures): 12,404 tests, 12,371 pass, 32 skipped, 1 fail. The one failure is E2E1 in roadmap-reconcile.test.cjs, the known transient drift: this TRD's progress-checkpoint SUMMARY exists while its ROADMAP line is still unticked (73-10 recorded the same). The end-of-TRD `roadmap update-job-progress` clears it |
| test (re-run after the roadmap update) | `node --test plugins/aoforge/aoforge/bin/lib/roadmap-reconcile.test.cjs` | 0 | PASS (63/63, E2E1 included) |
| rename guard | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 | PASS (20/20) |
| lint | not_available | n/a | not_available |
| build | not_available | n/a | not_available |

## Deviations from Plan

### Auto-fixed Issues

None in the code: the TRD executed as written.

### Additions within scope

**1. [Rule 2 - test coverage] Pins beyond the test list**
- **Found during:** Task 1
- **What:** compat.home 2 and compat.legacy 14c also assert that resolving creates nothing (no `~/.claude`, no
  `~/.aoforge/`, no pre-rename directory), covering truth 4 directly rather than only through file-identities 7.
  compat.home 4 asserts the `~/.aoforge/` file is left as it was. compat.home 5 adds the "nothing anywhere" case
  (the path under `currentDir`). compat.legacy 14e also pins that without `legacyName` the pre-rename file is not looked
  for under the new name. compat.home 6 checks `userDotFile` as well as `resolveUserFile`.
- **Files:** compat.home.test.cjs, compat.legacy.test.cjs
- **Commit:** 61a4e031

**2. Fixture helper `userFileDir` exported beside `writeUserFile`**
- The TRD suggested `writeUserFile` only; `userFileDir(home, where)` is the directory half, used by compat.home 1 and 6
  to name a location without writing a file there. Both are built from `NAMES` (not compat) so the fixture does not
  depend on the unit under test.

**3. The 14-series tests use `writeUserFile` from home-dot-dir-fixtures for the runtime-home file**
- legacy-fixtures.cjs `fakeHome` writes only `~/.aoforge/` and the pre-rename directory and is not in this TRD's file
  list; compat.legacy.test.cjs builds its home with `fakeHome` and adds the runtime-home file with `writeUserFile`
  (`'current'`), so no fixture outside the TRD changed and no pre-rename builder was added to home-dot-dir-fixtures.

## Issues Encountered

- RED counts differ slightly from the TRD's prediction: compat.home 6 and compat.legacy 14b and 14e also fail at RED,
  because they assert `resolveUserFile`'s `which` (missing export) as well as `userDotFile`'s path. Their `userDotFile`
  halves would have passed on the old code, as the TRD expected.
- `rg -n "userDotDir" plugins/aoforge -g '!*.test.*'` finds no code joining the dot directory by hand other than
  compat.cjs and the fixtures; handoff-fixtures.cjs builds the pre-rename pid path from `LEGACY.userDotDir` (a test
  fixture, owned by 73-12). watcher-state.cjs still names `.aoforge` as its write directory (`PID_DIR_NAME`) and reads
  through `userDotFile`, untouched here as the TRD requires (73-12 owns it).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (truth 1 by compat.home 2-4 and compat.legacy 14-14d; truth 2 by allowlist 9-10 and
  file-identities 72-12 4-6; truth 3 by compat.home 1, 5 and the exports; truth 4 by compat.home 2 and compat.legacy 14c
  (nothing created) and file-identities 7 (nothing moved); truth 5 by file-identities 4-7 unchanged)
- `rg -n "function (resolveUserFile|watchStateDir)" compat.cjs` finds both (lines 293, 314); both in `module.exports`
- `rg -n -F '~/.aoforge'` over config.cjs, init.cjs and watcher-allowlist.cjs prints four comment lines, each calling it
  the AOForge 3.0.0 location
- Gate failures: None (E2E1's roadmap drift was transient and cleared by the roadmap update)
- `requirements mark-complete HND-03` reported `not_found`: HND-03 is already ticked Complete in REQUIREMENTS.md (line 43
  and the traceability row), so nothing changed

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/compat.cjs, compat.home.test.cjs, compat.legacy.test.cjs,
  watcher-allowlist.test.cjs, watcher-allowlist.cjs, config.cjs, init.cjs, __fixtures__/home-dot-dir-fixtures.cjs
- FOUND: 61a4e031 (test, RED) and 1aa3e399 (fix, GREEN) on df/exec-73-11-user-files-in-runtime-home, based on 16691deb
- No test reads or writes the real `~/.aoforge/` or `~/.claude/aoforge/`: compat tests pass temp homes explicitly, the
  allowlist tests set HOME to a temp directory per test and restore it
- No stray `.aoforge-handoff/pending/` record in the checkout
