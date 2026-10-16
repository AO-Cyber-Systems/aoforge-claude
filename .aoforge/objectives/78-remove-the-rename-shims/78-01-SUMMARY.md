---
objective: 78-remove-the-rename-shims
trd: "01"
subsystem: planning-layout
tags: [rename-shims, legacy-layout, validate-health, doctor, W066, W067, W069]
requires: []
provides:
  - "planning-layout.cjs detectors independent of compat: isLegacyPlanning, bothPlanningDirs, findLegacyLayoutRoot"
  - "legacyLayoutMessage(root): the one legacy-layout line (3.0.x path, git mv, migration guide)"
  - "legacyBlockMessage / hasLegacyBlockMarker / LEGACY_BLOCK_START_RE for 78-08's managed-block refusal"
  - "SHIM_RELEASE = '3.0.x' in legacy-names.cjs"
  - "W069 legacy-claude-md-block (validate health Check 23, doctor check 27)"
affects: [78-07, 78-08, 78-11, 78-12]
tech-stack:
  added: []
  patterns:
    - "Legacy detection reads the filesystem directly; compat is asked only for $HOME (userHomeDir, isUserHome)"
    - "A legacy-only root is never a project: validate returns one broken W066, doctor resolves no project and prints a note"
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
    - plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/validate.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs
decisions:
  - "Doctor check 27 legacy-planning-layout: KEEP, report-only, now W066 (both), W067 and W069 with the 3.0.x/manual fix and no fix_command"
  - "validate health W066/W067: KEEP as reporting; W066 legacy-only is the one broken result (Check 0), W066 both stays a warning; W067 also fires with both keys"
  - "New W069 legacy-claude-md-block reports a project CLAUDE.md block under the pre-rename markers"
  - "W069 is the new code because main already uses W068 (objective 76/77 decision-log check)"
requirements-completed: [SC-3, SC-4]
metrics:
  duration: 17min
  completed: 2026-10-16
  tasks: 3
  files: 14
status: complete
tokens_input: 23223893
tokens_output: 103247
tokens_cache_read: 22911393
tokens_cache_write: 312280
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 01: Legacy-layout detectors and the one message Summary

**Pre-rename layout detection moved into planning-layout.cjs, independent of the compat fallback: a legacy-only project gets one broken W066 (validate) or one doctor note naming AOForge 3.0.x and `git mv`, both-directories stays a W066 warning, W067 now also covers both config keys, and the new W069 reports a CLAUDE.md block under the old markers.**

## Progress
- [x] Task 1: Fixture builders for the 3.1 legacy layouts — b614aa00
- [x] Task 2: Detectors in planning-layout.cjs (independent of compat) — RED 33914301, GREEN 9f1ec392
- [x] Task 3: Reporters — validate health, doctor 27/22, doctor project resolution, help text — RED 1f1b6640, GREEN 63c8dbf2

## What was built

- `legacy-names.cjs`: `SHIM_RELEASE = '3.0.x'` (the last release line with the shims and migrations 0012-0014). `SHIM_REMOVAL` is unchanged (78-12 sets it).
- `planning-layout.cjs` (rewritten): its only compat import is `{ userHomeDir, isUserHome }`.
  - `isLegacyPlanning(root)`: the legacy directory is a directory holding at least one of config.json, STATE.md, ROADMAP.md or PROJECT.md (`PLANNING_MARKERS`), and `.aoforge/` is not a directory. It uses statSync with `throwIfNoEntry: false` and treats ENOTDIR as absence.
  - `bothPlanningDirs(root)`: both are directories.
  - `findLegacyLayoutRoot(start, { home })`: walks up. At $HOME it returns null, in any symlinked form, and never searches above it. A directory holding `.aoforge/` also returns null, because the nearer real project wins. The first legacy-only directory is returned. Home is read per call, and `home: ''` disables the stop.
  - `legacyLayoutMessage(root)`: one line. It names the root and `.planning/` and says AOForge no longer reads it. It names both fixes, AOForge 3.0.x (`aof-tools upgrade --apply`) and the manual `git mv .planning .aoforge` plus the config-key rename. It points at `docs/MIGRATING-TO-AOFORGE.md` ("Upgrading from 2.x").
  - `legacyPlanningIssue` (W066): `both` keeps today's text. `legacy` splits the message into its problem (`message`) and its fix (`fix`).
  - `legacyConfigKeyIssue` (W067): reads `<root>/.aoforge/config.json` only. With the pre-rename key alone, the fix renames the key to "aoforge". With both keys, the fix deletes the pre-rename key.
  - `hasLegacyBlockMarker(text)` and `LEGACY_BLOCK_START_RE`: `<!--\s*<LEGACY.blockTag>:START\b`, case-sensitive, built with `escapeRegExp`.
  - `legacyBlockMessage(fileLabel)` returns `{ message, fix }`. `legacyClaudeMdIssue(root)` returns W069.
  - `MIGRATION_ID` and `CONFIG_MIGRATION_ID` were removed, because nothing imports them any more.
- `validate.cjs`:
  - New Check 0, before Check 1: a legacy-only root returns `broken` with the single error W066 and `repairable_count: 0`. No other check runs and nothing is written, `--repair` included.
  - Check 21 now reports only the both-directories W066, as a warning. Check 22 reports W067.
  - New Check 23 reports W069, a warning that is not repairable.
- `doctor-checks/27`: reports W066, W067 and W069 from planning-layout. It drops `fix_command` and keeps each fix in the finding line.
- `doctor-checks/22`: W069 joins `DEFERRED`.
- `doctor-cli.cjs resolveProject`: a legacy-only root, given with `--path`, found by compat or found by `findLegacyLayoutRoot`, yields `{ projectRoot: null, note: legacyLayoutMessage(realpath(root)) }`. This works before and after 78-11.
- `help.cjs`: the `validate` details now describe W066 (broken for legacy-only, a warning for both), W067 (both fixes) and W069.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Doctor check 27 `legacy-planning-layout` | KEEP, report-only | A project still on `.planning/`, a stale pre-rename config key or pre-rename CLAUDE.md markers is exactly the "old layout" SC-4 must name. Detection reads two directories and two files and makes nothing work under the old name. Its fixes changed from `upgrade --apply --only 0012/0013` (retired by 78-07) to the 3.0.x path or the manual step, so the check has no `fix_command`. |
| validate health W066 / W067 | KEEP as reporting | W066 legacy-only becomes the one broken result naming the fix, because after 78-11 nothing else can read such a project. W066 both stays a warning. W067 also fires when both keys exist, because 3.1 never merges or removes the pre-rename key (78-07 stops the stamp writer from touching it). |
| New W069 `legacy-claude-md-block` | Added (validate Check 23, doctor check 27; check 22 defers it) | It reports a project CLAUDE.md block under the pre-rename markers. 78-08 stops reading those markers, and migration 0014 goes with it. |
| W069 code choice | W069, not W068 | `main` already uses W068 (objective 76/77 decision-log check) and migration 0015. The main reconcile should check that W069 is still free. |
| Legacy-only is "Check 0" in validate | Early return before Check 1 | During RED the legacy fixture showed W009 as repairable, so `--repair` would have written state.json into the legacy directory. The early return makes the report read-only for such a root. |
| W067 reads `.aoforge/config.json` only | A config in the legacy directory is part of the W066 problem | This follows the TRD's anti-pattern (no `compat.planningRoot`). A legacy-only project therefore shows W066 alone, and the legacy message already names the key rename. |
| `bothPlanningDirs` | Pure directory test (no markers) | This is the TRD truth. The both-directories W066 warning keeps its 3.0 behaviour. Only `isLegacyPlanning` requires a planning marker, so an unrelated legacy-named directory never triggers the 78-07 guard. |
| Extra exports | `PLANNING_MARKERS`, `LEGACY_BLOCK_START_RE` | They let 78-08 pin its own `LEGACY_START_RE` equal to planning-layout's, and 78-07 reuse the marker list. |
| compat import | `isUserHome` reused, no inline copy | compat requires only legacy-names, so there is no require cycle and the recovery path was not needed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 0013 migration test expectations followed the W067 change**
- **Found during:** Task 2 (GREEN)
- **Issue:** `migrations/0013-config-key-rename.legacy.test.cjs` tests 13/13b pinned the `--only 0013` fix and "both keys -> no W067".
- **Fix:** Test 13 now expects the "rename the key" fix and no `--only`. Test 13b expects W067 with "delete the pre-rename key" for both keys, and nothing for the new key alone. The file is owned and retired by 78-07 (wave 2), so there is no conflict with wave-1 peers.
- **Commit:** 9f1ec392

**2. [Rule 3 - Blocking] doctor check 22 DEFERRED pin**
- **Found during:** Task 3 (RED)
- **Issue:** `doctor-checks/21-22-project.test.cjs` pins `DEFERRED` exactly. Adding W069 breaks the pin.
- **Fix:** Added W069 to the pinned list.
- **Commit:** 1f1b6640

**3. Fixture init commit uses `--allow-empty`**
- `planningProject({ markers: false })` with git and an empty legacy directory leaves git nothing to commit. Existing callers get the same tree; only the commit flag differs.
- **Commit:** b614aa00

### Other suites whose expectations changed
- `plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs`: tests 13 and 13b (W067 text, and both keys now reported).
- `plugins/aoforge/aoforge/bin/lib/doctor-checks/21-22-project.test.cjs`: the `DEFERRED` pin gains W069.
- `plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs`:
  - Cases 5 and 6 were rewritten. Case 5 is now broken status with one W066 error and the 3.0.x/`git mv` fix. Case 6 carries the init advisory with the same fix.
  - Added 5b (`--repair` writes nothing), 7b (both-directories is a warning, not broken), 9 (W067) and 10 (W069).
  - Cases 3-4 are kept, with a comment naming 78-07 and 78-11 as their owners.
- `plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs`:
  - Tests 9 and 10 were rewritten. Test 9 covers W066 both, W067 alone and with both keys, W069, all three together, a legacy root handed over directly, the shared text with validate, and `--fix` doing nothing. Test 10 covers check 22 deferring W069.
  - Added 12 (the doctor CLI note at the root, from a subdirectory and with `--path`) and 13 (the doctor CLI on a both/W067/W069 project).

### Known gap between commits
From 9f1ec392 (Task 2 GREEN) to 63c8dbf2 (Task 3 GREEN), the old W066/W067 assertions in `planning-layout.legacy.test.cjs` and `27-legacy-planning-layout.legacy.test.cjs` were red. The TRD assigns their rewrite to Task 3. At 63c8dbf2 they are green.

### Left for other TRDs
- `plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md` still describes check 27 with `--only 0012` / `--only 0013`. 78-12 owns that file and it is in 78-12's files_modified, so this TRD left it alone.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "...planningProject({layout:'aoforge',configKey:'both',claudeMd:'legacy-block'})..."` prints `true true`; `node --test planning-layout.legacy.test.cjs` | 0 / 0 (63 pass) | PASS |
| 2: Detectors | `node --test planning-layout-detect.legacy.test.cjs legacy-names.legacy.test.cjs` (RED at 33914301: 35 fail; GREEN: 42 pass); `rg "require('./compat.cjs')" planning-layout.cjs` shows only `{ userHomeDir, isUserHome }` | 1 then 0 | PASS |
| 3: Reporters | `node --test planning-layout.legacy.test.cjs doctor-checks/27-legacy-planning-layout.legacy.test.cjs validate.test.cjs doctor.test.cjs doctor.e2e.test.cjs help.test.cjs doctor-checks/21-22-project.test.cjs planning-layout-detect.legacy.test.cjs rename-guard.repo.test.cjs`; `rg -e "--only 0012" -e "--only 0013" -e "for one release"` over planning-layout/validate/27/help finds nothing | 0 / 1 (no match) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 2 RED (33914301) | `node --test planning-layout-detect.legacy.test.cjs legacy-names.legacy.test.cjs` | 1 (35 of 42 fail: missing exports, SHIM_RELEASE undefined) | FAIL (correct) |
| Task 2 GREEN (9f1ec392) | same | 0 (42 pass) | PASS (correct) |
| Task 3 RED (1f1b6640) | `node --test planning-layout.legacy.test.cjs doctor-checks/27-legacy-planning-layout.legacy.test.cjs` | 1 (validate not broken, no W069, doctor resolved the legacy root, W069 not deferred) | FAIL (correct) |
| Task 3 GREEN (63c8dbf2) | the Task 3 verify set above | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on every touched suite (above) | 0 | PASS |
| test (full) | npm test globs minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`: 394 files, 12551 tests, 12499 pass, 12 fail, 40 skipped | 1 | PASS (no new failures) |

The full run excluded `watcher-shell.test.cjs`, because its W-3 fish-shell test hangs to timeout on this machine. The 12 failures sit in 4 files, and each file also fails at the wave base 268a7a47, checked in a scratch clone:
- `aoforge-watch.test.cjs` and `handoff-e2e.test.cjs`: node-pty is not installed in a checkout without node_modules. aoforge-watch shows 2 failures alone, the same as at the base; the other 2 seen in the full run are load timing.
- `requirements-agreement.repo.test.cjs` and `validate-requirements.test.cjs`: the repository's own W065 finding (objective 75 EST-11 is not in requirements-completed).

`node plugins/aoforge/aoforge/bin/aof-tools.cjs validate health --raw` in this repository reports no W066, W067 or W069. It shows only the existing W065.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (detectors without compat fallback; findLegacyLayoutRoot walk and $HOME stop; one-line legacyLayoutMessage; W066 broken/warning without `--only 0012`; W067 both fixes without `--only 0013`; W069 plus exported marker/message helpers; doctor 27 report-only with 22 deferring W069 and the legacy-only note; SHIM_RELEASE)
- Gate failures: None introduced (12 failures present at the wave base, listed above)

## Self-Check: PASSED

- FOUND: planning-layout.cjs, planning-layout-detect.legacy.test.cjs, legacy-layout-fixtures.cjs, 27-legacy-planning-layout.cjs, legacy-names.cjs
- FOUND commits: b614aa00, 33914301, 9f1ec392, 1f1b6640, 63c8dbf2
