---
objective: 72-install-and-naming-cleanup
trd: "12"
subsystem: compat
tags: [rename, legacy-shims, inst-03, stack-mcp, todo-sync, watch-daemon, adopt]
requires: ["72-02 compat.userDotFile + legacy-names", "72-05 planning-dir fallback", "72-10 legacy identities in gates"]
provides:
  - "stack mcp treats a .mcp.json entry owned through the legacy ownership key as its own and rewrites it with the AOForge key only"
  - "todo replay and the todo-sync Stop hook read the legacy TaskCreate metadata key after the AOForge one"
  - "defaults.json, the Brave key file and the watch allowlist read from ~/.aoforge/ first, the legacy dot dir second"
  - "watch pid read falls back to the legacy daemon's file (marked legacy: true); writes and removals touch ~/.aoforge/ only"
  - "adopt resumes an in-progress adopt on the legacy branch; refuses a stale legacy branch and both branches at once"
affects: [72-13, 72-15, 72-17]
tech-stack:
  added: []
  patterns:
    - "compat.userDotFile(home, name, fs, legacyName) for user files whose name changed too"
    - "a legacy record carries legacy: true so dispatchers can refuse it"
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs
    - plugins/aoforge/aoforge/bin/lib/todo-session.cjs
    - plugins/aoforge/hooks/todo-sync.js
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/config.cjs
    - plugins/aoforge/aoforge/bin/lib/init.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
    - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
    - plugins/aoforge/aoforge/bin/lib/flutter-ui-setup.cjs
    - plugins/aoforge/aoforge/bin/lib/adopt.cjs
key-decisions:
  - "A pid record read from the legacy daemon's file is marked legacy: true. status/stop/start see the daemon, but add/remove-project refuse it (ELEGACYDAEMON) and flutter-ui setup and the daemon tick never use it, because the legacy daemon watches its own handoff directories, not .aoforge-handoff/."
  - "adopt: both adopt branches existing is a new refusal reason, adopt-branch-conflict, checked before resume and before rule 11. A stale legacy adopt branch with no marker refuses as adopt-branch-exists, naming it."
  - "compat.userDotFile gained an optional legacyName argument (default name) for the watch files, whose file names were renamed as well as their directory."
metrics:
  duration: 22min
  completed: 2026-10-09
tokens_input: 30819438
tokens_output: 114840
tokens_cache_read: 30484858
tokens_cache_write: 334308
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 12: File-level legacy identities Summary

Read-side shims for four kinds of legacy names that live in users' files, each building its names from LEGACY. Users' `.mcp.json` entries owned through the legacy env key are rewritten with the AOForge key. Session todos are matched on the legacy metadata key. Files under `~/.devflow/` are read second and never written. An adopt begun on `devflow/adopt` resumes on that branch.

## Progress
- [x] Task 1: Fixture builder: legacy identities in user files — c2532f20
- [x] Task 2: MCP ownership and todo metadata read both keys — d66a8787 (RED), 148fe7f2 (GREEN)
- [x] Task 3: User dot files and the legacy adopt branch — 2a27b127 (RED), a130dcbf (GREEN)

## What was built

- **Fixtures** (`__fixtures__/legacy-identity-fixtures.cjs`) are typed out with literal legacy names:
  - `legacyMcpJson({ owned, foreign, ownerKey })`. Owned entries come first and foreign ones follow. The same builder with `ownerKey` set to the AOForge key gives the expected rewrite.
  - `legacyTodoTranscript({ stem, title, subject, taskId, metadataKey })`, built on the 63-01 transcript builders.
  - `legacyDotHome({ files, newFiles })`. It always seeds the devflowops sentinels `devflow.sqlite` and `sessions.json`, and offers `listLegacy()` (path, size and sha256 of every file) for before/after checks.
  - `legacyAdoptRepo({ withNewBranch, mapped })`: a go-service repo on `devflow/adopt` with the in-progress `devflow-adopt.json` marker and the 8 mapped docs under `.planning/codebase/`.
- **stack-mcp**: `isManaged` accepts `<AOFORGE_|legacy prefix>MANAGED === 'stack'` (`OWNED_KEYS`). Generated entries use `MANAGED_KEY` (exported), so a legacy-owned entry is replaced in place with the AOForge key alone and a stale one is dropped. A foreign entry, including one with the legacy key set to any other value, is untouched.
- **todo-session**: `TODO_META_KEYS = [aoforge_todo, legacy key]`. The first present key wins, which keeps the old semantics exactly for the AOForge key. **hooks/todo-sync.js**: its cheap prefilter also accepts the legacy key, so a transcript identified by the legacy key alone still reaches the library.
- **User dot files**: config-ensure-section (`defaults.json`, `brave_api_key`) and `init new-project` (`brave_api_key`) resolve through `compat.userDotFile`. The watch allowlist resolves `aoforge-watch-allow.json`, else the legacy daemon's `<legacy>-watch-allow.json`.
- **Watch pid** (`watcher-state`):
  - `readPidFile()` reads `~/.aoforge/aoforge-watch.pid`, else the legacy daemon's pid file, and marks the latter `legacy: true`.
  - `pidFilePath()`, `writePidFile()` and `removePidFile()` touch the `~/.aoforge/` file only.
  - `add/removeWatchedProject` throw `ELEGACYDAEMON` on a legacy record.
  - The compat require is fail-open (MODULE_NOT_FOUND only), because the statusline fixtures copy this file alone.
  - `flutter-ui-setup` does not dispatch installs to a legacy daemon and prints a clear advisory instead. The daemon tick never adopts a legacy watch list.
- **adopt**:
  - `ADOPT_BRANCH` and `MARKER_NAME` are built from NAMES.
  - `readMarker` reads the new marker, else the legacy one. `writeMarker` writes the new name only, so the legacy marker is never rewritten.
  - `gitFacts` reports `legacy_branch_exists`.
  - `decideRoute`: both branches give `adopt-branch-conflict` (named, before resume and before rule 11). A legacy branch with no marker gives `adopt-branch-exists`, naming it.
  - The preflight `adopt.branch` is the marker's branch on resume.
  - `renderReport` (now exported) names that branch in the report and in its `git merge` line.

## Hand-off

- **72-13 (or a later TRD)**: three single-namespace items from the 72-10 hand-off are outside this TRD's file-level scope and were not changed:
  - `hooks/lib/edit-override.js` OVERRIDE_PHRASES (the live gate ignores the old phrase).
  - `lib/skill-requires.cjs` `PLUGIN_PREFIX`.
  - `init.cjs normalizeAgentKey`, which strips only `df-`. No caller passes a namespaced agent type today; every `resolve-model` call uses a bare name.
- **72-06 hand-off, `hooks/gate-interactive.js`**: it still reads only `~/.aoforge/aoforge-watch.pid`. That is deliberate. A legacy daemon watches the legacy handoff directories, so routing a command to it would hang.
- **`hooks/statusline.js`** (opt-in `daemon.status_line`): it shows the green `▶ watcher` while only a legacy daemon runs, because `isWatcherLive()` is true for it. This is cosmetic. Skipping a `legacy` record there would make it consistent with gate-interactive.
- **`aoforge-watch start`** refuses with "already running (pid N)" while a legacy daemon runs. `aoforge-watch stop` stops it, because the pid read falls back and the legacy daemon removes its own file. The message does not say the running daemon is the legacy one.
- **72-15 / 72-17**: the new adopt refusal reason `adopt-branch-conflict` and the `ELEGACYDAEMON` error code are not in the user guide.
- `service-installer.cjs` (log dir) needs no fallback, as the TRD says: it writes the new directory only.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | `node -e "…require('…/legacy-identity-fixtures.cjs')…Object.keys(f)"` prints the 4 builders (+ constants, `listTree`), plus a shape check: legacy and new-key MCP docs, a 2-record transcript, a dot home with sentinels, adopt repos with and without the new branch, and full cleanup | 0 | PASS |
| 2: MCP + todo keys | `node --test file-identities.legacy.test.cjs stack-mcp.test.cjs todo-session.test.cjs todo-sync.test.cjs hooks/todo-sync.test.js` | 0 (137/137) | PASS |
| 2: touched hook | `node --test rename-guard.repo.test.cjs hooks/planning-writes.audit.test.js hooks/hook-coexistence.test.js` | 0 (302/302) | PASS |
| 3: dot files + adopt | `node --test file-identities.legacy.test.cjs` | 0 (20/20) | PASS |
| 3: touched suites | config, init, adopt-{e2e,preflight,report,scaffold,skill-contract}, watcher-{allowlist,state,daemon}, compat.legacy, flutter-ui-setup, planning-layout.legacy, statusline, gate-interactive, rename-guard | 0 apart from the node-pty daemon suites; those pass with node-pty linked (below) | PASS |
| 3: daemon suites | `node --test aoforge-watch.test.cjs handoff-e2e.test.cjs watcher-shell.test.cjs` with the main checkout's node_modules temporarily symlinked in | 0 | PASS |
| verification | `rg -n "userDotFile" config.cjs init.cjs watcher-allowlist.cjs watcher-state.cjs` hits every read site (config 97/101, init 683, allowlist 136, state 57) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test file-identities.legacy.test.cjs` | 1 (5 fail: 1, 1b, 3, 3b, 3d; controls 2, 2b, 3c pass) | FAIL (correct) |
| GREEN (Task 2) | same + stack-mcp, todo-session, todo-sync, hooks/todo-sync | 0 (137 pass) | PASS (correct) |
| RED (Task 3) | `node --test file-identities.legacy.test.cjs` | 1 (9 fail: 4, 5, 6, 6b, 8, 8c, 8d, 8e, 8f; guards 6c, 7, 8b pass) | FAIL (correct) |
| GREEN (Task 3) | same + touched suites + full suite | 0 (20/20; full suite 0 fail) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 3) | `node --test '<wt>/plugins/aoforge/**/!(micro).test.cjs' '<wt>/plugins/aoforge/**/*.test.js' '<wt>/scripts/**/*.test.cjs'` (absolute globs into the worktree, node-pty linked in from the main checkout) | 0: 11,724 tests, 11,689 pass, 35 skipped, 0 fail | PASS |

The E2E1 roadmap-drift baseline did not fail in this worktree. `npm test` was not run, because it includes `micro.test.cjs` (excluded as in 72-04 to 72-10). An earlier run of the same gate with the dot reporter also exited 0, but its output had 13 `X` characters and no failure list. The spec-reporter rerun above reports 0 failures and no `✖`.

## Discovered commands

None. The test command came from the TRD's validation gate.

## Estimate

`estimate trd 72-12`: 10 min (P90 19 min), $3.72 (P90 $6.01), 3 tasks, confidence medium. `estimate start` was not re-run, because the wave's run state was already recorded. Measured: about 22 min, above P90. The full suite ran twice (about 3.5 min each), and the watcher design needed a pass over every pid-file consumer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The todo-sync Stop hook's prefilter knew only the AOForge key**
- **Found during:** Task 2
- **Issue:** `hooks/todo-sync.js` skips a transcript that holds neither `Todo: ` nor `aoforge_todo`. A todo identified by the legacy metadata key alone never reached the library.
- **Fix:** the markers are built from legacy-names (both keys). A stub tree without the libs keeps the AOForge key. Covered by test 3d (spawned hook).
- **Files modified:** plugins/aoforge/hooks/todo-sync.js
- **Commit:** 148fe7f2

**2. [Rule 3 - Blocking] `compat.userDotFile` takes one file name; the watch files were renamed too**
- **Found during:** Task 3
- **Issue:** the legacy files are `~/.devflow/devflow-watch.pid` and `devflow-watch-allow.json`, not `~/.devflow/aoforge-watch.*`.
- **Fix:** an optional 4th argument `legacyName` (default `name`), additive.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/compat.cjs
- **Commit:** a130dcbf

**3. [Rule 2 - Missing critical] A legacy daemon must never receive dispatches**
- **Found during:** Task 3 (reviewing every `readPidFile` / `isWatcherLive` caller)
- **Issue:** with the pid read falling back, three callers would have used the old daemon as if it were AOForge's:
  - `flutter-ui setup` would dispatch installs to `.aoforge-handoff/pending`, which the legacy daemon never reads, and report `dispatched`.
  - `add-project` would copy the legacy pid record into `~/.aoforge/`.
  - The daemon tick would adopt the legacy watch list.
- **Fix:** records read from the legacy file carry `legacy: true`. flutter-ui-setup and the daemon tick skip them, and add/remove throw `ELEGACYDAEMON`. Covered by tests 6b and 6c (6c fails if the flutter guard is removed).
- **Files modified:** watcher-state.cjs, flutter-ui-setup.cjs, watcher-daemon.cjs
- **Commit:** a130dcbf

**4. [Rule 1 - Bug] The adopt report named `aoforge/adopt` for a resumed legacy adopt**
- **Found during:** Task 3
- **Issue:** `renderReport` used `ADOPT_BRANCH` in the Branch line and the `git merge` hint.
- **Fix:** it takes `branch` (the preflight's adopt branch, which is the marker's on resume) and is exported for test 8f.
- **Files modified:** adopt.cjs
- **Commit:** a130dcbf

### Choices the TRD left open

- **Where "both branches → refuse" sits.** It is checked inside the in-progress-marker rule (before resume) and again before rule 11, so it holds with or without a marker. It does not apply to an already-adopted (tracked ROADMAP) project or a greenfield one, matching rule 11's scope.
- **A stale legacy adopt branch with no marker** refuses as `adopt-branch-exists`. Otherwise `begin` would start a second branch beside it.
- **The adopt marker** is read new-first, legacy-second. A resumed legacy adopt writes `aoforge-adopt.json` (branch `devflow/adopt` preserved) and leaves `devflow-adopt.json` as it was.
- **Test 4** runs `config-ensure-section`, which is the "config load" that reads `defaults.json`. `loadConfig` never reads user files.

## Post-TRD Verification

- Auto-fix cycles used: 0. Every GREEN run passed on the first attempt after implementation.
- Must-haves verified: 4/4
  - MCP ownership: tests 1, 1b, 2 and 2b. Legacy-owned entries are rewritten with the AOForge key only, a stale one is dropped, and foreign entries (neither key, or the legacy key with another value) are byte-identical.
  - Todo metadata: tests 3, 3b and 3c (replay), and 3d (spawned Stop hook archives under the legacy-key stem).
  - User dot files: tests 4-7. Reads fall back, writes go to `~/.aoforge/`, and the `~/.devflow/` listing (with the `devflow.sqlite` and `sessions.json` sentinels) is identical after every operation.
  - Legacy adopt branch: tests 8-8f. A legacy adopt resumes on `devflow/adopt` with no second branch, a fresh repo uses `aoforge/adopt`, both branches refuse naming both, and a stale legacy branch refuses.
- Gate failures: None.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
- FOUND: plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
- FOUND: c2532f20, d66a8787, 148fe7f2, 2a27b127, a130dcbf on `df/exec-72-12-file-level-legacy-identities`
- Worktree clean after the last task commit. The temporary node_modules symlink was removed. No real `~/.aoforge`, `~/.devflow` or `~/.claude` path was used: every home in the tests is a temp dir.
