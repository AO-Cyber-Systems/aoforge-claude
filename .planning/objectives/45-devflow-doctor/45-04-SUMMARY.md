---
objective: 45-devflow-doctor
trd: "04"
job: 45-04
subsystem: tooling
tags: [df-tools, doctor, check-registry, cli, diagnostics]

requires: []
provides:
  - "lib/doctor.cjs engine: loadChecks, buildContext, runChecks, runDoctor, summarize, contractIssues"
  - "lib/doctor-cli.cjs: parseDoctorArgs, resolveProject, renderText, runDoctorCli"
  - "`df-tools doctor [--fix] [--json] [--path <dir>] [--global]` dispatch arm + help.cjs entry"
  - "lib/doctor-checks/README.md: the check contract wave 2 (45-05/06/07) implements"
  - "__fixtures__/doctor-fixtures.cjs: shared builders for every doctor check test"
affects: [45-05, 45-06, 45-07, 45-08, 45-09]

tech-stack:
  added: []
  patterns:
    - "Filename-sorted check registry (NN-<slug>.cjs) whose contract violations become error results instead of throwing"
    - "Pure run* CLI front-end returning {ok, result, text, json}; the dispatcher only maps to output()/error()"
    - "Fix pass then full re-run: the report carries post-fix results and a separate fixes array"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doctor.cjs
    - plugins/devflow/devflow/bin/lib/doctor.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-cli.cjs
    - plugins/devflow/devflow/bin/lib/doctor-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
    - plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "A result is fixable only if run() says fixable:true AND the module exports fix(); a check cannot advertise a fix it lacks"
  - "Invalid modules always report (scope 'global', id = filename slug), whatever the requested scope"
  - "A duplicate id is invalid for the later file; the first file keeps the id"
  - "--path with --global, a stray positional, and --path at a missing dir are usage errors (exit 1)"
  - "The CLI result adds a `notes` array (project-resolution info) to the engine report; additive to schema_version 1"
  - "Text tags pad to the width of [error] so ids align ([ok]    id — …); the TRD sample showed ok/warn only"

patterns-established:
  - "Doctor checks read the machine only through ctx.userHome / ctx.env / ctx.paths, never os.homedir() or process.env"
  - "DEVFLOW_DOCTOR_CHECKS_DIR is a test-only checksDir override for spawned end-to-end tests"

requirements-completed: [DOC-04]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-09-30
tokens_input: 9510360
tokens_output: 76113
tokens_cache_read: 9355433
tokens_cache_write: 154783
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 45 TRD 04: Doctor core, check registry, CLI and dispatch Summary

**`df-tools doctor` engine: a filename-sorted check registry that never crashes on a bad module, read-only by default, and a `--fix` pass that applies only fixes the checks mark safe. It threads each fix's changed paths into `ctx.changedThisRun`, re-runs every check, and reports a stable schema_version-1 JSON or aligned text. The contract for wave 2 lives in `doctor-checks/README.md`.**

## Performance

- Tasks: 3/3 (5 commits: 1 fixture, 2 RED, 2 GREEN)
- Tests added: 26 engine (doctor.test.cjs) + 25 CLI (doctor-cli.test.cjs)
- Files: 6 created, 2 modified

## Accomplishments

- **Engine (`lib/doctor.cjs`)**:
  - `loadChecks({checksDir})` returns `[{file, id, mod} | {file, id, invalid}]`, sorted by filename. It loads only files matching `/^(\d{2})-([a-z0-9-]+)\.cjs$/`, so `*.test.cjs` and README never load.
  - Four failure kinds become one error result each (`invalid doctor check: …`): a load failure, a contract violation, a duplicate id, and a non-function `fix`. The other checks still run.
  - `buildContext` asserts that `userHome` is absolute, realpaths `projectRoot`, and derives every `ctx.paths` entry. It honours `DEVFLOW_PROGRESS_GUARD_DIR` and `DEVFLOW_AWARENESS_DIR`.
  - `runDoctor` works in two modes:
    - **Report mode** never calls `fix()`.
    - **Fix mode** calls `fix()` only for fixable results, in registry order. Before the next fix runs, it adds each applied fix's project-relative `changed` paths to `ctx.changedThisRun`. It then re-runs every check.
  - When `run()` throws, the check becomes an error result. When `fix()` throws, the fix entry becomes `{applied:false, refused:'fix threw: …'}`.
  - An unknown severity is coerced to `error`, with a note in the finding.
- **CLI (`lib/doctor-cli.cjs`)**:
  - `parseDoctorArgs` resolves `--path` against the cwd. `resolveProject` uses the `--path` dir only if it has a `.planning/` directory. With no `--path`, it walks up from the cwd.
  - `renderText` prints one aligned line per check with a `(fixable)` or `(run: <fix_command>)` hint, then the fixes section (in fix mode), then the `status:` line last.
  - `runDoctorCli` returns `{ok, result, text, json}`. Any completed run exits 0; only usage errors exit 1.
- **Dispatch and help**: `case 'doctor'` sits next to `telemetry` in df-tools.cjs, and help.cjs has a `doctor` entry marked `mutates`. The dispatcher's pre-switch answers `doctor --help` without running any check.
- **Fixtures (`__fixtures__/doctor-fixtures.cjs`)**: `makeDoctorHome`, `makeInstalledPlugin`, `copyRealRuntimeFiles`, `makeMirror`, `makePluginCacheDirs`, `makeDoctorProject`, `writeStubCheck`, `makeChecksDir`. All write only under the OS temp dir; the home builders assert that.

## Check-module contract (for 45-05 / 45-06 / 45-07)

```
module.exports = {
  id: 'kebab-id',                 // unique; also the result id  (/^[a-z0-9]+(-[a-z0-9]+)*$/)
  title: 'Human title',           // non-empty string
  scope: 'global' | 'project',    // project checks only run when ctx.projectRoot is set
  run(ctx) -> { severity: 'ok'|'warn'|'error', finding: string, fixable: boolean,
                fix_command?: string, details?: object },
  fix?(ctx, result) -> { applied: boolean, refused?: string, changed?: string[], backup?: string, notes?: string },
};
ctx = { projectRoot, userHome, env, now, pluginVersion, dfToolsPath, changedThisRun: Set<string>,
        paths: { claudeDir, mirrorDir, installedPluginsJson, pluginCacheRoot, progressGuardDir, awarenessDir, backupsDir } }
```

- File name is `NN-<slug>.cjs`: 10-19 global install checks (45-05), 20-29 project checks (45-06), 30-39 state hygiene (45-07).
- Build a test ctx with `doctor.buildContext({projectRoot, userHome: <fake home>, env: {...}, now})`, or run the engine with `doctor.runDoctor({..., checks: [require('./NN-id.cjs')]})`.
- In `fix().changed`, give project-relative posix paths; absolute entries are not added to `changedThisRun`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] help.cjs rendered a string `details` one character per line**
- **Found during:** Task 3 (`df-tools upgrade --help` printed each character of its details on its own line)
- **Issue:** `commandUsage` did `lines.push('', ...c.details)`, which works for the array form (`commit`) but spreads a string into characters. `upgrade` and `adopt` were already affected, and the new `doctor` entry (a string, per the TRD) would have been too.
- **Fix:** `lines.push('', ...[].concat(c.details))`, plus a doctor-cli test asserting that a string details renders verbatim.
- **Files modified:** plugins/devflow/devflow/bin/lib/help.cjs
- **Commit:** 3c2d2fa

**2. [Rule 1 - Bug] writeStubCheck could not omit `title`/`scope`**
- **Found during:** Task 2 RED authoring
- **Issue:** destructuring defaults (`title = 'Stub check'`) apply to an explicit `undefined`, so a contract-violation stub could not drop the field.
- **Fix:** the defaults now apply only when the key is absent; an explicit `undefined` omits the field.
- **Files modified:** plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
- **Commit:** 9461d68

### Notes

- The TRD verify commands name the main checkout (`/Users/justin/dev/devflow-claude/...`). They were run against the worktree paths instead, since the work lives on `df/exec-45-04`.
- Test 13 names `df-tools help doctor`. df-tools has no `help` subcommand (it exits `Unknown command: help`), so help is answered by `doctor --help` / `-h` and the top-level `--help` listing, and those forms are what the test covers.
- The text format pads every tag to the width of `[error]`, so ids align. The TRD sample (`[ok]   id`, `[warn] id`) would leave `[error]` one column off.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders + contract README | `node -e "…makeDoctorHome(); makeInstalledPlugin(h,{})…"` (worktree path) → `true true` | 0 | PASS |
| 2: doctor engine | `node --test …/lib/doctor.test.cjs` → 26/26 pass | 0 | PASS |
| 3: CLI + dispatch + help | `node --test …/lib/doctor-cli.test.cjs …/lib/help.test.cjs …/lib/help-delegation.test.cjs` → 74/74 pass | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (engine, 9461d68) | `node --test …/lib/doctor.test.cjs` (Cannot find module './doctor.cjs') | 1 | FAIL (correct) |
| GREEN (engine, a6638c6) | `node --test …/lib/doctor.test.cjs` | 0 | PASS (correct) |
| RED (CLI, 39a7b32) | `node --test …/lib/doctor-cli.test.cjs` (Cannot find module './doctor-cli.cjs') | 1 | FAIL (correct) |
| GREEN (CLI, 3c2d2fa) | `node --test …/doctor-cli.test.cjs …/help.test.cjs …/help-delegation.test.cjs` | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none defined | n/a | n/a |
| test | `node --test` on each task's verify files | 0 | PASS |
| wave | `npm --prefix <worktree> test` | 1 | PASS (5427 pass / 9 fail / 50 skipped of 5486; all 9 failures are environmental, see below) |

The 9 wave failures are all in `bin/devflow-watch.test.cjs` (3) and `bin/handoff-e2e.test.cjs` (6).
Both spawn the `devflow-watch` daemon, whose `lib/watcher-shell.cjs` does `require('node-pty')`. The
provisioned worktree has no `node_modules/`; only the main checkout does. So the daemon cannot start
there. Neither file, nor anything it requires, is touched by this TRD: the diff vs 0069f9f is the six
doctor files plus a new `case 'doctor'` arm and the help entry/details fix. None of the failures is a
regression.

TRD `<verification>`:
- `HOME=<scratch fake home> df-tools --cwd <worktree> doctor --json` with the real (README-only) checks dir gives `status: healthy`, `checks: []`, `fixes: []`, `schema_version: 1`. PASS.
- `rg -n "0008|backup-prune|validate" lib/doctor.cjs` matches only comment lines (17, 18, 178). PASS.
- `df-tools doctor --help` prints `Usage: df-tools doctor [--fix] [--json] [--path <dir>] [--global]` and the details paragraph. PASS.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 truths (dispatch + help parity; registry + invalid-as-error; result shape; read-only default; fix → re-run + fixes array; throw isolation; scope rules; userHome from ctx)
- Gate failures: None

## Self-Check: PASSED

- FOUND (tracked): lib/doctor.cjs, lib/doctor.test.cjs, lib/doctor-cli.cjs, lib/doctor-cli.test.cjs, lib/doctor-checks/README.md, lib/__fixtures__/doctor-fixtures.cjs
- FOUND commits: 01e0630, 9461d68, a6638c6, 39a7b32, 3c2d2fa (`git log --oneline 0069f9f..HEAD`)
- Diff vs base is limited to the TRD's files_modified (8 files, +1852/-1)
- STATE.md / ROADMAP.md intentionally not edited: the orchestrator updates them after merging the parallel wave
