---
objective: 73-handoff-gaps-and-result-injection
trd: "13"
subsystem: doctor
tags: [doctor, service-installer, user-dot-dir, watch, gap-closure, G5]

requires:
  - objective: 73
    provides: "73-11: compat.watchStateDir / runtimeHome and home-dot-dir-fixtures.cjs (mkHome, userFileDir, writeUserFile)"
  - objective: 72
    provides: "72-15: doctor check house style (15-legacy-df-install) and global-upgrade's verified mover"
provides:
  - "service-installer: the launchd plist and systemd unit log to ~/.claude/aoforge/state/watch/{launchd,systemd}-{stdout,stderr}.log; installService creates that directory and never ~/.aoforge"
  - "service-installer.servicePaths(home) -> { launchd, systemd } service file paths"
  - "doctor check 17 user-dot-dir (global): reports a leftover ~/.aoforge/ and, with --fix, moves what AOForge 3.0.0 wrote there"
  - "global-upgrade exports moveEntry (no behaviour change)"
  - "home-dot-dir-fixtures.cjs: withDotDirFiles, watchPidText, serviceFilePath, writeServiceFile"
affects: [73-14 gap-closure docs, aoforge-watch install-service, doctor --global]

tech-stack:
  added: []
  patterns:
    - "The systemd %h path is derived from compat.watchStateDir (path.relative from a placeholder home, posix separators), so it cannot drift from compat"
    - "A doctor fix checks every target with lstat before moving and keeps the file in place when the target exists, because renameSync would overwrite"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/service-installer.cjs
    - plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
    - plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs

key-decisions:
  - "A leftover ~/.aoforge/ is cleared by a global doctor check on request, never on read or at session start: the fix moves files and never deletes or overwrites them"
  - "The fix waits while a pid file there names a live process (signal 0; EPERM counts as live) or an installed plist/unit still names /.aoforge/; launchd and systemd are never touched by the doctor"
  - "The reinstall command carries the service's own --project, read from the installed plist or unit"
  - "A symlinked ~/.aoforge keeps its link and its target; an empty real directory is removed"

patterns-established:
  - "Doctor fixes that relocate user files: classify into known (destination), planning (report-only) and unknown (left in place); known files whose destination exists go to backups/<name>-<ts>/"

requirements-completed: [HND-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-10
---

# Objective 73 TRD 13: Service logs leave ~/.aoforge, and doctor cleans up a leftover ~/.aoforge Summary

**The watch service now logs into `~/.claude/aoforge/state/watch/`. A new global doctor check, `user-dot-dir`, reports a leftover `~/.aoforge/` and its `--fix` moves AOForge 3.0.0's files to the runtime home, or into `backups/aoforge-dot-dir-<ts>/`, without deleting or overwriting anything.**

## Progress
- [x] Task 1: Service logs in the watch state directory — c9a02d10 (RED), f69468f4 (GREEN)
- [x] Task 2: RED, doctor check user-dot-dir — b36341ff
- [x] Task 3: GREEN, check 17 and its README row — (this commit)

## What was built

**service-installer.cjs.** `_aoforgeLogDir` is gone. The launchd plist's `StandardOutPath`/`StandardErrorPath` are `watchStateDir(HOME)/launchd-{stdout,stderr}.log`, with HOME read per call. The systemd unit's `StandardOutput`/`StandardError` are `append:%h/.claude/aoforge/state/watch/systemd-{stdout,stderr}.log`, and the `%h/...` suffix is derived from `watchStateDir`. `installService` creates the watch state directory. `servicePaths(home)` is exported, and the installer's own plist and unit paths go through it. `rg -F '/.aoforge'` finds nothing in the installer.

**Doctor check 17 `user-dot-dir` (global), branches as built:**

| State of `~/.aoforge` | Result | `--fix` |
|---|---|---|
| absent (or not a directory) | ok | none |
| holds planning files (STATE.md, ROADMAP.md, PROJECT.md, config.json, objectives) | warn, report-only: "$HOME is never an AOForge project" | nothing touched |
| pid file names a live process (signal 0, EPERM = live) | warn, report-only, `fix_command` = `node ~/.claude/aoforge/bin/aoforge-watch.cjs stop` | nothing touched |
| installed plist/unit (`servicePaths`) still contains `/.aoforge/` | warn, report-only, `fix_command` = `... uninstall-service && ... install-service --project <the service's own project>` | nothing touched |
| known files: watch pid/log/launchd/systemd logs, defaults.json, brave_api_key, aoforge-watch-allow.json (regular files) | warn, fixable; the finding names each file and its destination | watch files go to `~/.claude/aoforge/state/watch/` and user files to `~/.claude/aoforge/`. A stale pid file, or any file whose destination exists, goes to `~/.claude/aoforge/backups/aoforge-dot-dir-<ts>/`. A target that already exists (including a taken backup slot) keeps the file where it is |
| unknown entries (anything else, or a known name that is not a regular file) | listed in the finding; when they are all that is left: warn, not fixable | left in place, and the directory stays |
| empty real directory | warn, fixable | `rmdir` |
| symlinked `~/.aoforge` | files handled as above | the link and its target stay. Once the target is empty: warn, not fixable, "symlink" |

Every move uses `global-upgrade.moveEntry`: a rename, or on EXDEV a copy that is verified before the original is removed. `changed` lists the absolute new paths. `backup` is set only when the backup directory was used.

**Running `doctor --global --fix` on this machine is the user's call.** No test or verification step in this TRD ran it against the real home. Every test uses an mkdtemp fake home, and the CLI case sets HOME and USERPROFILE to it.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Service logs (RED, c9a02d10) | `node --test plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs` | 1 (7 failing: P-8, U-5, I-13, I-14, SP-1, SP-2, EX-1) | PASS (RED correct) |
| 1: Service logs (GREEN, f69468f4) | `node --test plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs` | 0 (30/30) | PASS |
| 1: no dot-dir path | `rg -n -F '/.aoforge' .../service-installer.cjs`; `rg -n _aoforgeLogDir ...` | 1 (no match) | PASS |
| 1: regression | `node --test plugins/aoforge/aoforge/bin/aoforge-watch.test.cjs` | 0 (28/28) | PASS |
| 2: RED (b36341ff) | `node --test .../doctor-checks/17-user-dot-dir.test.cjs .../doctor.e2e.test.cjs` | 1 (module missing; e2e 7 id list) | PASS (RED correct) |
| 2: fixture consumers | `node --test compat.home/compat.legacy/planning-mode/home-project-detection tests` | 0 (91/91) | PASS |
| 3: GREEN | `node --test .../17-user-dot-dir.test.cjs` | 0 (17/17) | PASS |
| 3: GREEN | `node --test .../doctor.e2e.test.cjs .../15-legacy-df-install.legacy.test.cjs` | 0 (18/18) | PASS |
| 3: verification greps | `rg -n "id: 'user-dot-dir'" ...`; `rg -n "17-user-dot-dir" README.md` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/aoforge/aoforge/bin/lib/service-installer.test.cjs` | 1 | FAIL (correct): old `.aoforge` paths, no `servicePaths` |
| GREEN (Task 1) | same | 0 | PASS (correct) |
| RED (Task 2) | `node --test .../doctor-checks/17-user-dot-dir.test.cjs .../doctor.e2e.test.cjs` | 1 | FAIL (correct): `Cannot find module './17-user-dot-dir.cjs'`; e2e 7 missing `user-dot-dir` |
| GREEN (Task 3) | same plus `15-legacy-df-install.legacy.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test service-installer.test.cjs 17-user-dot-dir.test.cjs doctor.e2e.test.cjs` | 0 | PASS |
| test (full) | `npm test` | 1 at the Task 3 commit (12392 pass, 32 skipped, 1 fail), 0 for E2E1 after the roadmap tick | PASS: no new failures. The one failure was `roadmap-reconcile.test.cjs` E2E1, the repo ROADMAP drift self-test. It flags `73-13` unticked while its checkpoint SUMMARY exists, and `roadmap update-job-progress` in the state step clears it |
| lint | none | - | not_available |
| build | none | - | not_available |

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written, with these additions inside its scope:

- **[Rule 2 - Missing critical functionality] No overwrite on rename.** `moveEntry` uses `renameSync`, which overwrites an existing file on POSIX. The fix therefore checks every target with lstat first and keeps the file in `~/.aoforge` when the target exists, including a backup slot already taken by a run with the same timestamp. Pinned by test 8b.
- **Extra branches pinned by tests:** an empty `~/.aoforge` (removed), a symlinked `~/.aoforge` (link and target kept), a systemd unit that still logs there (11b), and a service that already logs to the runtime home, which does not block the fix (11c). The reinstall `fix_command` carries the service's own `--project`, read from the plist or unit.
- **SP-2 (extra test):** install writes its service file at the path `servicePaths(HOME)` names.

## Notes for follow-up

- macOS can drop a `.DS_Store` into `~/.aoforge/`. Under the TRD's rule ("files the check does not know are listed and left in place") that keeps the directory. Moving `.DS_Store` into the backup would be a small, safe extension if the user wants it.
- `aoforge-watch.cjs` and the watcher-state pid path belong to 73-12 and were not touched.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths (service log paths and mkdir; ok/warn/fixable; the fix's destinations, backups and rmdir; refusals for a live pid and a service; report-only for planning files; unknown files left)
- Gate failures: None
