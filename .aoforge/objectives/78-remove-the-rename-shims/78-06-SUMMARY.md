---
objective: 78-remove-the-rename-shims
trd: "06"
subsystem: global-legacy-notices
tags: [rename-shims, coexistence, doctor, sync-runtime, SC-3, SC-4]
requires: ["78-01"]
provides:
  - "coexistence.cjs: the one module for global pre-rename detection: legacyEnvVariables, legacyRuntimeHome, legacyRuntimeState ({present, migrated}), interimUserFiles, legacyNotices, TO_RUNTIME, TO_WATCH, LEGACY_STATE_MARKER (plus REMOVED_IN '3.1.0' and MIGRATION_GUIDE)"
  - "coexistence-guard: ONE SessionStart notice per session for every global leftover, each with its fix (noticeFor exported)"
  - "doctor checks 15 and 16 report-only; check 17 keeps its fix over coexistence's file lists"
  - "sync-runtime converts no pre-rename state; runtime-state-migrate.cjs deleted (copyNoClobber moved into state-rekey.cjs)"
affects: [78-10, 78-11, 78-12]
tech-stack:
  added: []
  patterns:
    - "Detect, never use: a DEVFLOW_* variable, the old runtime home and ~/.aoforge/ files are checked for presence only; no value is read and the env object is never changed"
    - "One finding list (legacyNotices) feeds the SessionStart notice; doctor check 16 reports the same findings plus the post-migration leftover"
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/coexistence.cjs
    - plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs
    - plugins/aoforge/hooks/coexistence-guard.js
    - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
    - plugins/aoforge/hooks/sync-runtime.js
    - plugins/aoforge/hooks/sync-runtime.legacy.test.js
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs
    - plugins/aoforge/aoforge/bin/lib/state-rekey.cjs
  deleted:
    - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
    - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs
decisions:
  - "Doctor check 15 legacy-df-install: KEEP, report-only (fix removed); the move stays in the objective-36 global upgrade"
  - "Doctor check 16 legacy-plugin-runtime: KEEP, report-only (fix removed); the conversions are 3.0.x's or the documented manual steps"
  - "Doctor check 17 user-dot-dir: KEEP WITH its fix; no 3.0.x release moves 3.0.0's ~/.aoforge files"
  - "sync-runtime's pre-rename runtime-state migration (TRD 72-07): REMOVE; the notice and check 16 name the path"
  - "coexistence-guard + coexistence.cjs: KEEP (report-only), extended to every global leftover"
requirements-completed: [SC-3, SC-4]
metrics:
  duration: 14min
  completed: 2026-10-16
  tasks: 3
  files: 18
status: complete
tokens_input: 29969051
tokens_output: 124270
tokens_cache_read: 29655295
tokens_cache_write: 313506
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 06: Global legacy notices and doctor Summary

**One SessionStart notice per session now names every leftover the rename left in the user's home: the old plugin still enabled, `DEVFLOW_*` variables that are no longer read, a pre-rename runtime home that no 3.0.x session migrated, and files AOForge 3.0.0 left in `~/.aoforge/`. Each comes with its fix. sync-runtime no longer converts any pre-rename state, doctor checks 15 and 16 are report-only, and check 17 keeps its reversible move.**

## Progress
- [x] Task 1: Fixtures, RED tests and the coexistence detectors — RED d0206f08, GREEN 000134fa
- [x] Task 2: GREEN — one SessionStart notice; retire the runtime-state migration — RED d5b76293, GREEN ae182860
- [x] Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path — RED 7d622593, GREEN b430a848

## What was built

- **`coexistence.cjs`** is now the one module for global pre-rename detection. Every function reports presence only. None reads a value, changes `env` or makes an old name work.
  - `legacyEnvVariables(env)` moved here from check 16. It ignores the bare prefix and undefined values, sorts, and gives each name its `AOFORGE_*` form.
  - `legacyRuntimeHome(home)` returns `<home>/.claude/<LEGACY.runtimeDir>`.
  - `LEGACY_STATE_MARKER` is `.legacy-state-migrated.json`.
  - `legacyRuntimeState(home)` returns `{present, migrated}`. `present` means a directory, and a symlinked one counts. `migrated` means the marker exists under the new home.
  - `TO_RUNTIME` and `TO_WATCH` moved here from check 17. They are built from NAMES and frozen.
  - `interimUserFiles(home)` returns the known names that are regular files in `~/.aoforge/`, sorted.
  - `legacyNotices({env, userHome, detect})` returns `[{kind, level, text}]` in a fixed order: plugin-enabled, legacy-env, runtime-not-migrated, user-dot-dir. Each entry is one line naming its fix. Its level is `info` only for the pointer plugin.
  - The module also exports `REMOVED_IN` (`'3.1.0'`) and `MIGRATION_GUIDE`.
- **`coexistence-guard.js`**: `run()` collects `legacyNotices`, and the new `noticeFor(found)` composes the notice.
  - With one finding, the message is that finding's text and `detail` is null.
  - With several, the message reads "AOForge found N leftovers from before 3.1 that it no longer reads; see below", and `detail` holds one `- <text>` line per finding.
  - The level is `info` only when the pointer plugin is the sole finding.
  - Nothing found returns `{status: 'nothing'}`. No test relied on `'not-enabled'`, so no alias was kept.
  - The per-session key and the pending rules are unchanged. The `aliasLegacyEnv` lines were left for 78-10.
- **`sync-runtime.js`**: `migrateLegacyRuntimeOnce` and both of its call sites (after a mirror, and on the fast path) are gone, along with their header lines. The objective-36 global upgrade is untouched.
- **`runtime-state-migrate.cjs`** and its legacy test were deleted. Its only other importer, `state-rekey.cjs`, now has its own `copyNoClobber`, with the same behaviour and without the unused `leaveOut`.
- **Doctor check 15**: there is no `fix` export and `fixable` is false. The finding names the global upgrade, which runs at session start after a plugin update or on demand with `aof-tools upgrade --global --apply`, and the manual move. `fix_command` is the on-demand global upgrade.
- **Doctor check 16**: there is no `fix` export, and `FIX_KINDS`, the migration import and `moveLegacy` are gone. Detection comes from coexistence.
  - plugin-enabled keeps `claude plugin disable …`.
  - runtime-not-migrated names AOForge 3.0.x (one session migrates it) or a copy by hand, with the guide.
  - runtime-leftover gives a manual `mkdir -p <backups>/legacy-<old dir>-runtime-<date> && mv <old home> <that>/`. The command is prefixed by the disable command while the old plugin is enabled, and paths are shell-quoted.
  - legacy-env reads "no longer read since 3.1.0: rename each where it is set".
  - When the leftover command already starts with the disable command, the check names it once.
- **Doctor check 17**: it imports `TO_WATCH` and `TO_RUNTIME` from coexistence. Both findings for known files now say "AOForge no longer reads them there". The `fix` is byte for byte as before. The header records the KEEP-WITH-FIX decision.
- **`doctor.cjs`**: `ctx.paths.legacyMirrorDir` comes from `coexistence.legacyRuntimeHome`. The compat import is gone.
- **Fixtures**:
  - `leftoverHome` gained `interimFiles` (a name ending in `/` makes a directory) and a `dotDir` path. `migrated: true` now writes a hand-built marker record instead of running the deleted migration. `MIGRATION_MARKER` is exported.
  - `legacy-runtime-fixtures.cjs` lost the `withAoforge` option, which only the deleted test used. Its header lists the remaining users.

Sample notice with all four findings, as route-results renders it:

```
- [action] AOForge found 4 leftovers from before 3.1 that it no longer reads; see below
  - The DevFlow plugin (devflow@aocyber v2.15.0) is still enabled beside AOForge, so its hooks and gates may run twice. Disable it: claude plugin disable devflow@aocyber
  - The DEVFLOW_* variables DEVFLOW_SKIP_EDIT_GATE and DEVFLOW_SKIP_UPGRADE are no longer read since AOForge 3.1.0; rename DEVFLOW_SKIP_EDIT_GATE to AOFORGE_SKIP_EDIT_GATE and DEVFLOW_SKIP_UPGRADE to AOFORGE_SKIP_UPGRADE where you set them (shell profile or launch environment)
  - The DevFlow runtime home ~/.claude/devflow/ was never migrated to ~/.claude/aoforge/ (calibration, estimates, backups and the GitHub outbox), and AOForge no longer migrates it: run AOForge 3.0.x once (one session migrates it), or copy it by hand (see docs/MIGRATING-TO-AOFORGE.md)
  - ~/.aoforge/ still holds files AOForge 3.0.0 wrote (aoforge-watch.log, defaults.json); AOForge no longer reads them there: `aof-tools doctor --global --fix` moves them
```

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Doctor check 15 `legacy-df-install` | KEEP, report-only (fix removed) | Pre-plugin `df-*` skills and agents shadow AOForge commands for any 2.x user, and detection is one readdir per directory. The move itself stays in the sync-runtime global upgrade (objective 36, not a rename shim), so the doctor fix only duplicated it. |
| Doctor check 16 `legacy-plugin-runtime` | KEEP, report-only (fix removed) | With the old plugin enabled beside AOForge, its gates run twice. The pre-rename runtime home holds calibration and the GitHub outbox, which 3.1 no longer carries over, and `DEVFLOW_*` variables now stop working silently. Each needs one report. The conversions belong to 3.0.x (a 3.0.x session, or `doctor --global --fix` under 3.0.x) or to the documented manual steps. |
| Doctor check 17 `user-dot-dir` | KEEP WITH its fix | `~/.aoforge/` holds files that AOForge 3.0.0 itself wrote under the AOForge name. No 3.0.x release moves them, because the move is 3.1's own objective-73 change, so there is no 3.0.x path to point at. With the interim readers removed (78-05, 78-11), the move is the only way defaults.json, the Brave key, the watch allowlist and the daemon's files keep effect. The fix is a reversible move that never deletes or overwrites. |
| sync-runtime's pre-rename runtime-state migration (TRD 72-07) | REMOVE | It is an automatic conversion of pre-rename state, which 3.1 leaves to 3.0.x. The notice and check 16 name the path. |
| coexistence-guard + coexistence.cjs | KEEP (report-only), extended | They only report. The notice now covers all four global leftovers in one notice per session. |
| A migrated pre-rename runtime home | Quiet in the notice, reported by check 16 as `runtime-leftover` | The TRD gotcha: the user's own machine has `~/.claude/devflow/` present and migrated, and that must not raise a notice on every session. |
| Check 15 names `aof-tools upgrade --global --apply` | Added beside the session-start move | A session start runs the global upgrade only after a fresh mirror (a plugin update). An entry that reappears under a current mirror would wait until the next update, so the finding also names the on-demand form of the same upgrade. |
| `copyNoClobber` | Moved into `state-rekey.cjs` | It was the only remaining importer of the deleted module (TRD error_recovery: that importer is in scope). |

**For the user:** your own `~/.claude/devflow/` leftover was migrated under 3.0.x, so 3.1 raises no notice for it. Doctor check 16 reports it as `runtime-leftover` and names the manual `mv` into `~/.claude/aoforge/backups/legacy-devflow-runtime-<date>/`. 3.1's doctor will not move it. Either do that move, or run `doctor --global --fix` under 3.0.x, before you install 3.1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] state-rekey.cjs imported copyNoClobber from the deleted module**
- **Found during:** Task 2
- **Issue:** `state-rekey.cjs` required `copyNoClobber` from `runtime-state-migrate.cjs`. Deleting the module would break `aof-tools state rekey`.
- **Fix:** Moved `copyTree` and `copyNoClobber` into `state-rekey.cjs`, minus the migration-only `leaveOut` set, and dropped the require. state-rekey.test.cjs passes unchanged. The file is outside files_modified, but the TRD's error_recovery puts that importer in scope, and no wave-2 peer touches it.
- **Commit:** ae182860

**2. [Rule 1 - Bug] Check 15's "start a Claude Code session" alone would not move a reappeared entry**
- **Found during:** Task 3
- **Issue:** sync-runtime runs the global upgrade only after a good mirror. On the equal-version fast path it exits first, so a new session under a current mirror never moves the entries.
- **Fix:** The finding names the global upgrade "at session start after a plugin update, or now with `aof-tools upgrade --global --apply`", plus the manual move. `fix_command` is `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --apply`, the existing upgrade-cli path that runs the same `runGlobalUpgrade`.
- **Commit:** b430a848

**3. sync-runtime case 6 uses the repository plugin root, not a copied-closure fake root**
- The TRD's test list says "fake plugin root". The test spawns the real hook with `CLAUDE_PLUGIN_ROOT` set to this repository's plugin and a scratch HOME, as the old legacy test did, and with the global upgrade enabled. This keeps it independent of 78-08's closure list in `sync-runtime.test.js`, which 78-08 owns and may shrink this wave. A copied closure that names `legacy-rewrite.cjs` would break if 78-08 deletes it. The real home is never touched.

### Known gap between commits
From ae182860 (Task 2 GREEN) to b430a848 (Task 3 GREEN), doctor check 16 still required the deleted `runtime-state-migrate.cjs`, so the engine marked it invalid and its suite failed to load. The TRD assigns the check 16 rewrite to Task 3. At b430a848 everything is green.

### Left for other TRDs
- **78-10:** the `aliasLegacyEnv` lines in `coexistence-guard.js` (top level and in `run()`) and `sync-runtime.js` were not touched. `coexistence-guard.legacy.test.js` test 9 still expects `DEVFLOW_SKIP_COEXISTENCE=1` to skip, which is true only while the alias runs. Once the alias is gone, that variable instead produces a legacy-env notice.
- **78-11:** `compat.legacyRuntimeHome` now has no caller outside `compat.legacy.test.cjs`, so it can be deleted.
- **78-12 (docs):**
  - `plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md`: checks 15 and 16 still say "fix"; 17 does not mention "no longer read".
  - `scripts/gen-docs-data.cjs`: the coexistence-guard description names only the plugin.
  - `CLAUDE.md`: the sync-runtime bullet still describes the runtime state migration, and the doctor bullet still describes the 15/16 fixes.
  - `docs/MIGRATING-TO-AOFORGE.md` and its site page: the check 15/16 rows and the "Clean up the old runtime home" step.
  - `docs/USER-GUIDE.md` and `CHANGELOG.md`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Detectors | `node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs` (17 pass after GREEN; hook cases 1-5 still red until Task 2, as planned) | 0 | PASS |
| 2: Notice, no migration | `node --test hooks/coexistence-guard.legacy.test.js hooks/sync-runtime.legacy.test.js hooks/sync-runtime.test.js bin/lib/coexistence.legacy.test.cjs hooks/route-results.test.js bin/lib/state-rekey.test.cjs` (123 pass); `hooks/hook-coexistence.test.js hooks/planning-writes.audit.test.js hooks/classify-session.test.js` (351 pass); `rg -n "runtime-state-migrate\|migrateLegacyRuntime" plugins/aoforge --glob '!*.md'` showed only check 16 | 0 | PASS |
| 3: Doctor 15/16/17 | `node --test doctor-checks/15-legacy-df-install.legacy.test.cjs doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs doctor-checks/17-user-dot-dir.test.cjs doctor.test.cjs doctor.e2e.test.cjs` (81 pass); all `doctor-checks/*.test.cjs` (270 pass); `doctor-cli.test.cjs rename-guard.repo.test.cjs hook-inventory.test.cjs compat.legacy.test.cjs` (pass); `rg -n "legacyRuntimeHome" doctor.cjs` shows only the coexistence import | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED (d0206f08) | `node --test coexistence.legacy.test.cjs coexistence-guard.legacy.test.js` | 1 (14 of 32 fail: missing exports; hook cases 1-3, 5) | FAIL (correct) |
| Task 1 GREEN (000134fa) | `node --test coexistence.legacy.test.cjs` | 0 (17 pass) | PASS (correct) |
| Task 2 RED (d5b76293) | `node --test hooks/sync-runtime.legacy.test.js` | 1 (the migration marker exists, cases 6 and 6b) | FAIL (correct) |
| Task 2 GREEN (ae182860) | the Task 2 verify set | 0 | PASS (correct) |
| Task 3 RED (7d622593) | `node --test 15-….legacy.test.cjs 16-….legacy.test.cjs 17-user-dot-dir.test.cjs` | 1 (9 fail: check 15 exports fix; check 16 cannot load; check 17 wording and lists) | FAIL (correct) |
| Task 3 GREEN (b430a848) | the Task 3 verify set | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on every touched suite (above) | 0 | PASS |
| test (full) | npm test globs minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`: 392 files, 12547 tests, 12490 pass, 15 fail, 42 skipped | 1 | PASS (no new failures) |

The full run excluded `watcher-shell.test.cjs`, because its W-3 fish-shell test hangs to timeout on this machine. All 15 failures sit in four files that fail at the wave base too:
- `aoforge-watch.test.cjs` and `handoff-e2e.test.cjs`: node-pty is not installed in a worktree without node_modules.
- `requirements-agreement.repo.test.cjs` and `validate-requirements.test.cjs`: the repository's own W065 finding (objective 75 EST-11).

None of the failures is in a file this TRD touched or in a suite that loads one.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7:
  - the coexistence detectors and exports;
  - one notice per session with each fix, silent when empty;
  - sync-runtime runs no migration, the module is deleted, and the global upgrade still runs;
  - check 15 has no fix and names the global upgrade and the manual move;
  - check 16 has no fix, carries the four 3.1 texts, and says neither "for one release" nor "honors";
  - check 17 keeps its fix and says "no longer reads them there";
  - `doctor.cjs` takes `legacyMirrorDir` from coexistence.
- `git ls-files plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs` prints nothing.
- Gate failures: None introduced (the 15 pre-existing failures are listed above)

## Self-Check: PASSED

- FOUND: coexistence.cjs, coexistence-guard.js, sync-runtime.js, sync-runtime.legacy.test.js, doctor-checks/15-legacy-df-install.cjs, doctor-checks/16-legacy-plugin-runtime.cjs, doctor-checks/17-user-dot-dir.cjs, doctor.cjs, state-rekey.cjs, legacy-doctor-fixtures.cjs, legacy-runtime-fixtures.cjs
- DELETED as planned: runtime-state-migrate.cjs, runtime-state-migrate.legacy.test.cjs
- FOUND commits (`git log 5eb8c38e..HEAD`): d0206f08, 000134fa, d5b76293, ae182860, 7d622593, b430a848
