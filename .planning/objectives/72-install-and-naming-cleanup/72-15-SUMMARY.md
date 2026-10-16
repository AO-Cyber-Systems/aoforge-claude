---
objective: 72-install-and-naming-cleanup
trd: "15"
subsystem: doctor
tags: [aoforge-rename, doctor, inst-01, legacy-leftovers, shims]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY (installPrefix, runtimeDir, envPrefix, plugin, checksCaller, configKey), compat.legacyRuntimeHome"
  - phase: 72-05
    provides: "planning-layout.cjs legacyPlanningIssue (W066), legacy-layout-fixtures planningProject"
  - phase: 72-07
    provides: "runtime-state-migrate.cjs migrateLegacyRuntime / migrationPending / MARKER_FILE, legacy-runtime-fixtures legacyRuntimeHome"
  - phase: 72-08
    provides: "W067 legacy-config-key, migrations 0012 and 0013"
  - phase: 72-10
    provides: "coexistence.cjs detectLegacyPlugin / coexistenceMessage, legacy-plugin-fixtures writePluginState"
  - phase: 72-11
    provides: "checks-pin collectPinFindings `legacy` and `path`, legacy-gh-fixtures legacyCaller"
provides:
  - "doctor check 15 legacy-df-install (global, INST-01): legacy-prefixed entries under ~/.claude/skills and ~/.claude/agents warn; the fix is global-upgrade's moveLegacy into ~/.claude/aoforge/backups/legacy-<ts>/ (never a delete); non-prefixed skills are never listed or moved"
  - "doctor check 16 legacy-plugin-runtime (global): details.findings[] of kind plugin-enabled (report-only, fix_command `claude plugin disable devflow@aocyber`), runtime-not-migrated (fix: 72-07 migration), runtime-leftover (fix: the old runtime home moved whole into backups/legacy-<old runtime dir>-runtime-<ts>/, refused while the old plugin is enabled), legacy-env (report-only, names each variable and its AOFORGE_ form)"
  - "doctor check 27 legacy-planning-layout (project, report-only): owns W066/W067 in the doctor with fix commands `aof-tools upgrade --apply --only 0012` / `--only 0013`; a both-directories W066 carries its manual fix in the finding"
  - "check 22 DEFERRED gains W066 and W067"
  - "check 26: a legacy managed caller workflow always warns (`legacy caller workflow ...`) with fix_command `aof-tools gh rebrand --dry-run`, never the gh setup re-pin; ok findings name the file actually read"
  - "planning-layout.cjs legacyConfigKeyIssue(root): the one W067 detection, called by validate health Check 22 and doctor check 27"
  - "global-upgrade.moveLegacy({prefix}): a `legacy` / `legacy-...` backup directory prefix (anything else throws), so backup-prune never enters it"
  - "doctor ctx.paths.legacyMirrorDir (= compat.legacyRuntimeHome(userHome))"
  - "__fixtures__/legacy-doctor-fixtures.cjs: leftoverHome, leftoverProject, doctorCtx"
affects: [72-16, 72-17, 72-21]

tech-stack:
  added: []
  patterns:
    - "A doctor check with several independent problems reports details.findings[] (kind, severity, message, fixable, fix_command); the check is fixable when at least one finding has a fix and every finding that has one is safe now; report-only findings never block it"
    - "A global check returns absolute `changed` paths so the engine never takes them for project paths (ctx.changedThisRun)"
    - "A doctor check reuses the validate detection function (planning-layout.cjs) rather than parsing validate output, so both print the same text"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/doctor.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/21-22-project.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/26-checks-workflow-pin.cjs
    - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
    - plugins/aoforge/aoforge/bin/lib/validate.cjs

key-decisions:
  - "Check 16's id is legacy-plugin-runtime, not the TRD's legacy-<old product>-runtime: the rename guard forbids the legacy product word in tracked file paths and contents outside its allowlist, and CONTEXT leaves doctor check ids to Claude's discretion"
  - "Check 16's migration fix is offered even while the old plugin is enabled (the SessionStart hook runs the same migration on the first AOForge session); only the leftover move is refused while it is enabled. One step per --fix run: migrate, then the next run moves the leftover"
  - "A legacy managed caller always warns, stale or not: it calls the old repository's workflow until it is rebranded. An unmanaged legacy file is the user's own and keeps the existing not-managed ok"
  - "Check 15 reports skills and agents only; findLegacy's runtime VERSION entry stays the global upgrade's business"
  - "The legacy-env finding does not say whether the AOFORGE_ form is also set: aof-tools aliases legacy variables at startup, so in a CLI run it always is"

requirements-completed: [INST-01, INST-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 42min
completed: 2026-10-09
tokens_input: 28523970
tokens_output: 104416
tokens_cache_read: 27750343
tokens_cache_write: 773365
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 15: Doctor finds what the rename left behind Summary

**Three new doctor checks: a reappearing legacy `df-*` skill or agent (fix: moved into backups), a lingering old plugin, runtime home or legacy env variable (fix: migrate, or move the old home whole into backups once the old plugin is disabled), and a project still on `.planning/` or the legacy config key (W066/W067, report-only with the exact migration command). Check 26 also routes a legacy caller workflow to `gh rebrand --dry-run`.**

## Progress
- [x] Task 1: Fixture builder: homes and projects with leftovers — 489d2ef5
- [x] Task 2: Checks 15 and 16 (global) — RED f8156b6d, GREEN e27f9151
- [x] Task 3: Check 27, check 22 deferral, check 26 legacy callers, README — RED 08420e83, GREEN 7253e7a1

## What was built

- **Fixtures** (`legacy-doctor-fixtures.cjs`).
  - `leftoverHome({ dfSkills, dfAgents, otherSkills = ['synced'], legacyRuntime, migrated, devflowEnabled })` is built on 72-07's `legacyRuntimeHome` and 72-10's `writePluginState`. AOForge 3.0.0 is installed in every case.
  - `devflowEnabled` is `null` (not installed), `true` (installed with no settings entry, so enabled) or `false` (disabled in settings.json). `migrated` runs the real 72-07 migration once, at a fixed `now`.
  - `leftoverProject({ layout, configKey, git })` is built on 72-05's `planningProject`. `doctorCtx({ home, env = {}, projectRoot })` builds the context through `doctor.buildContext`.
- **Engine**: `ctx.paths.legacyMirrorDir` = `compat.legacyRuntimeHome(userHome)`, with its typedef, the README contract block, and doctor test 8.
- **Check 15 `legacy-df-install`** (global). Discovery is `findLegacy` filtered to `skills/` and `agents/` entries with `LEGACY.installPrefix`; the fix is `moveLegacy(home, entries, { now })`.
  - The finding names every entry. `changed` paths are absolute.
  - A user's own skill (`synced`) is never listed or moved.
- **Check 16 `legacy-plugin-runtime`** (global). It reads `detectLegacyPlugin`, `migrationPending` and `ctx.paths.legacyMirrorDir`, and its fix re-discovers before acting:
  - **runtime-not-migrated**: runs `migrateLegacyRuntime`.
  - **runtime-leftover**: if the old plugin is enabled, the fix is refused with `claude plugin disable devflow@aocyber` named. Otherwise the whole home is moved with `moveLegacy(home, [LEGACY.runtimeDir], { prefix: 'legacy-<runtimeDir>-runtime' })`, which leaves it at `backups/legacy-devflow-runtime-<ts>/devflow/`.
  - The overall `fix_command` is the unique commands of the report-only and refused findings. The source spells no legacy name and requires no `child_process`.
- **Check 27 `legacy-planning-layout`** (project, no `fix`). W066 comes from `legacyPlanningIssue` and W067 from the new `legacyConfigKeyIssue`.
  - The commands are `node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --only 0012` and `--only 0013`. When both apply they are joined with ` && `, the move first.
  - A both-directories W066 has no command. Its fix text goes in the finding instead.
- **Check 22**: `DEFERRED` gains `W066`, `W067`, with a one-line owner comment.
- **Check 26**: a legacy managed caller returns a warn result:
  - finding `legacy caller workflow <path> predates the AOForge rename[; <W062 message>]. Rebrand it ...`
  - `fix_command` `node ~/.claude/aoforge/bin/aof-tools.cjs gh rebrand --dry-run`
  - `details.legacy`, plus the W062 `code`/`fix` when it is stale.
  - `okFinding` now names `r.path` (the 72-11 hand-off).
- **README**: range-table entries for 15 and 16 (TRD 72-15) and 27 (owns W066/W067), and the check 26 legacy note.

## Hand-off

- **72-21 (install and dogfood)**: on this machine, `aof-tools doctor --global` reports two things, both expected now: the old plugin is enabled (report-only), and the old runtime home is not migrated (fixable).
  - **Do not run `doctor --global --fix` before AOForge is installed.** It would run the one-time 72-07 migration early, while 2.15.0 keeps writing the old home. Per the 72-07 hand-off, the migration runs once, so those later writes would stay behind.
  - The order is: install AOForge (its first session migrates), disable the old plugin, then `doctor --global --fix` moves the old home into `~/.claude/aoforge/backups/legacy-devflow-runtime-<ts>/`.
  - `aof-tools doctor` in this repository reports W066 and W067 through check 27 until the 0012/0013 move. Check 21 also lists 0012/0013 as pending.
- **72-16 (gh rebrand)**: check 26 prints `aof-tools gh rebrand --dry-run`. If the verb or flag lands under another name, update `REBRAND_COMMAND` in `doctor-checks/26-checks-workflow-pin.cjs` and the `REBRAND` constant in `27-legacy-planning-layout.legacy.test.cjs`.
- **72-17 (docs)**: the user guide does not yet describe checks 15, 16 or 27, which check owns W066/W067 in the doctor, the `legacy-<runtime dir>-runtime-<ts>` backup directory, the one-step-per-run fix of check 16, or check 26's legacy branch.
- **Not changed (pre-existing, from 72-04)**: `global-upgrade.findLegacy` looks for a stuck `aoforge/VERSION`. Before the rename it looked for the old runtime home's `VERSION`, and the codemod renamed that path. Nothing writes the new path. A stuck file in the old home is now covered by check 16's leftover move. `global-upgrade.test.cjs` test 2 pins the current form, so changing it belongs with the shim removal or a global-upgrade TRD.
- **Shim removal (the release after 3.0.0)**: checks 16 and 27 report shim-era state. They can stay as diagnostics after the shims go, or be removed together with them.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builder | `node --test plugins/aoforge/aoforge/bin/lib/doctor.test.cjs` (26/26) | 0 | PASS |
| 2: Checks 15 and 16 | `node --test .../15-legacy-df-install.legacy.test.cjs .../16-legacy-plugin-runtime.legacy.test.cjs .../11-12-install.test.cjs` + doctor.e2e + global-upgrade(.legacy) + sync-runtime (56 + 15 + 62) | 0 | PASS |
| 3: Check 27, 22, 26, README | `node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/*.test.cjs` (241/241) + doctor.test, doctor.e2e, doctor-cli, planning-layout.legacy, 0013 legacy (120/120) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test .../15-legacy-df-install.legacy.test.cjs .../16-legacy-plugin-runtime.legacy.test.cjs` (Cannot find module) | 1 | FAIL (correct) |
| GREEN (Task 2) | same (24/24) | 0 | PASS (correct) |
| RED (Task 3) | `node --test .../27-legacy-planning-layout.legacy.test.cjs` (Cannot find module) | 1 | FAIL (correct) |
| GREEN (Task 3) | same + 26-checks-workflow-pin.test.cjs (21/21) | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test '<wt>/plugins/aoforge/**/!(micro).test.cjs' '<wt>/plugins/aoforge/**/*.test.js' '<wt>/plugins/devflow/**/*.test.js' '<wt>/scripts/**/*.test.cjs'`: 11904 tests, 11844 pass, 51 skipped, 9 fail | 1 | PASS at baseline: all 9 failures are the watch daemon (`aoforge-watch.test.cjs` start/stop and multi-project C-2, handoff pipeline end-to-end), which cannot start in a worktree without `node_modules`/node-pty, as the dispatch expects. No failure is in a file this TRD touched. |
| repo gates | `node --test '<wt>/plugins/aoforge/**/*.repo.test.cjs'` (rename guard, doc-refs, planning-writes, ...) | 0 | PASS (236/236) |

Live checks, report mode only (no `--fix` against the real home or this repo):
- `aof-tools doctor --global --json` on this machine: every global check ran without a contract error. legacy-df-install is ok; legacy-plugin-runtime warns plugin-enabled + runtime-not-migrated (expected until 72-21).
- `aof-tools --cwd <worktree> doctor --json`: legacy-planning-layout reports W066 + W067 with both commands. validate-health lists `deferred: [W040, W066, W067]`.

## Discovered commands

None. The test command came from the TRD's validation gate and `package.json`.

## Estimate

`estimate trd 72-15` (the wave's run state was already started; `estimate start` was not re-run): 10 min (P90 19 min), $3.76 (P90 $5.99), 3 tasks, confidence low. Actual: 42 min.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Check 16 is `legacy-plugin-runtime`, not `legacy-devflow-runtime`**
- **Found during:** Task 2 (design)
- **Issue:** The TRD's id and file name spell the legacy product word. `rename-guard.repo.test.cjs` test 2 rejects it in tracked paths and contents outside its allowlist, and the README range table would have to name it too.
- **Fix:** id `legacy-plugin-runtime`; files `16-legacy-plugin-runtime.cjs` and `.legacy.test.cjs`. The backup directory keeps the TRD's name (`legacy-devflow-runtime-<ts>`), built from `LEGACY.runtimeDir`. CONTEXT leaves doctor check ids to Claude's discretion.
- **Commit:** f8156b6d, e27f9151

**2. [Rule 2 - Missing] One W067 detection, shared by validate and the doctor**
- **Found during:** Task 3
- **Issue:** W067 was inline in validate.cjs. The README forbids re-implementing validate logic, and the TRD asks check 27 to use the same helpers.
- **Fix:** `planning-layout.legacyConfigKeyIssue(root)`. validate.cjs Check 22 now calls it, with byte-identical text. Check 27 test 9 compares its messages and fixes with a real `validate health` spawn. These two files were not in `files_modified`.
- **Commit:** 7253e7a1

**3. [Rule 2 - Missing] `moveLegacy` backup-directory prefix**
- **Found during:** Task 2
- **Issue:** The runtime-home move needs the TRD's `legacy-devflow-runtime-<ts>` directory, and the only mover hard-coded `legacy-<ts>`.
- **Fix:** an optional `prefix` (default `legacy`). Anything that does not start with `legacy` throws, so backup-prune, which skips `legacy-*`, never prunes the moved home. New unit test 2b in global-upgrade.test.cjs. These files were not in `files_modified`.
- **Commit:** e27f9151

**4. [Rule 3 - Blocking] doctor.e2e.test.cjs id sets and env**
- **Found during:** Task 2 and Task 3
- **Issue:** e2e test 7 pins the exact `--global` id set. Its child env also stripped only the new prefix, so a developer's legacy-prefixed variable would make check 16 warn and break the converged report in tests 3-4.
- **Fix:** GLOBAL_IDS and PROJECT_IDS gain the three ids, and the child env strips both prefixes (built from NAMES/LEGACY).
- **Commit:** e27f9151, 7253e7a1

**5. Test expectation updated (planned recovery)**: `21-22-project.test.cjs` pins `DEFERRED` and now includes W066 and W067.

**6. Minor:** the fixture option `devflowEnabled` defaults to `null` (not installed) rather than `false`; `false` means installed and disabled, which test 6 needs. Test 12 (CLI) lives in the check 15 test file.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. Check 15 warns on, moves and backs up df-* entries. Check 16 covers its four cases. Check 27 owns W066/W067 and check 22 defers them. Check 26 routes the legacy caller to the rebrand dry run. The README lists 15, 16 and 27, and every new check reads only through ctx (each contract test greps its source for `os.homedir`/`process.env`).
- Gate failures: none beyond the worktree daemon baseline (9 tests, node-pty unavailable)

## Self-Check: PASSED

- Created files: all 7 present (fixture, checks 15/16/27 and their three `.legacy.test.cjs` files).
- Commits: 489d2ef5, f8156b6d, e27f9151, 08420e83, 7253e7a1 are all on `df/exec-72-15-doctor-legacy-checks`; the worktree is clean.
- Every doctor suite (doctor-checks 241/241, engine, e2e, CLI) and the repository gates (236/236) pass. The full gate is at the worktree baseline (9 daemon failures, none in a touched file).
