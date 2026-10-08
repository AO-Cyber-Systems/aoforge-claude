# doctor-checks — the `df-tools doctor` check contract

`df-tools doctor` (engine: `../doctor.cjs`, CLI: `../doctor-cli.cjs`) owns no check logic. Every
check is a module in this directory. The engine picks up any file named `NN-<id>.cjs` (two digits,
a dash, a kebab slug), sorted by filename, so adding a check needs no edit to the core.
`*.test.cjs` files and this README are ignored by the loader.

## Check contract

```
module.exports = {
  id: 'kebab-id',                 // unique; also the result id
  title: 'Human title',
  scope: 'global' | 'project',    // project checks only run when ctx.projectRoot is set
  run(ctx) -> {
    severity: 'ok' | 'warn' | 'error',
    finding: string,              // one line
    fixable: boolean,             // true only if fix() is safe + reversible NOW (DOC-06 considered)
    fix_command?: string,         // exact command for report-only / refused cases
    details?: object,
  },
  fix?(ctx, result) -> { applied: boolean, refused?: string, changed?: string[], backup?: string, notes?: string },
};

ctx = {
  projectRoot: string|null,   // absolute realpath of the DevFlow project root, or null
  userHome: string,           // absolute; CLI passes os.homedir(); tests pass a fake home
  env: object,                // process.env or injected (DEVFLOW_* overrides live here)
  now: Date,
  pluginVersion: string,      // running engine version (helpers.pluginVersion())
  dfToolsPath: string,        // absolute path to df-tools.cjs (for checks that spawn it)
  changedThisRun: Set<string>,// project-relative posix paths changed by EARLIER fixes in this --fix run;
                              // safety guards (DOC-06) treat these as the doctor's own, not foreign work
  paths: {                    // all derived from userHome/env — single place to override
    claudeDir, mirrorDir, installedPluginsJson, pluginCacheRoot,   // <home>/.claude/plugins/cache/aocyber/devflow
    progressGuardDir,        // env.DEVFLOW_PROGRESS_GUARD_DIR || <mirrorDir>/state/progress-guard
    awarenessDir,            // env.DEVFLOW_AWARENESS_DIR || <mirrorDir>/state/awareness
    backupsDir,              // <mirrorDir>/backups
  },
}
```

## File naming ranges

Reserved so parallel TRDs never collide:

| Range | Owner | Checks |
|-------|-------|--------|
| `10-19` | TRD 45-05 | global install checks: `10-runtime-mirror`, `11-plugin-cache`, `12-hooks-registry`, `13-model-profiles` (TRD 61-07; owns W063, which `22` defers), `14-skill-requires` (TRD 61-02; report-only, reads the installed plugin's `requires:` declarations, which the `gate-skill-requires.js` hook enforces) |
| `20-29` | TRD 45-06 | project checks: `20-legacy-runtime-state`, `21-pending-migrations`, `22-validate-health`, `23-skill-markers` (TRD 69-04: tracked markers too; owns E006/W064, which `22` defers; the tracked fix is an index change behind the DOC-06 guard), `24-store-cache-tracked`, `25-gh-store-sync` (TRD 50-07; owns W057-W061, which `22` defers), `26-checks-workflow-pin` (TRD 61-01; owns W062, which `22` defers) |
| `30-39` | TRD 45-07 | state-hygiene checks: `30-guard-state`, `31-awareness-state`, `32-backups`, `33-decision-resolution` (TRD 53-06; finds resolved decisions whose multi-line `resolution` the pre-52 writer flattened, and repairs the recoverable ones with a backup. Report-only in store mode) |

## Rules the engine enforces

- **Contract violations never crash a run.** A module that fails to load, is missing `run`, has a
  non-kebab `id`, an empty `title`, a `scope` other than `global`/`project`, a non-function `fix`,
  or an `id` already used by an earlier file becomes ONE error result
  `{id: <filename slug>, severity: 'error', finding: 'invalid doctor check: …'}`, and every other
  check still runs.
- **A throwing `run()`** becomes an error result whose `finding` names the exception. **A throwing
  `fix()`** becomes a fix entry `{applied: false, refused: 'fix threw: …'}`. Later checks still run.
- **Result normalization.** An unknown `severity` is coerced to `'error'` (the finding says so).
  `fixable` is `true` only when `run()` returned `fixable: true` AND the module exports `fix` —
  a check cannot advertise a fix it does not have. `fix_command` / `details` are kept only when
  they are a non-empty string / an object.
- **Read-only by default.** Without `--fix`, no `fix()` is ever called.
- **`--fix` order.** `fix()` runs only for results with `fixable: true`, in registry (filename)
  order. Each applied fix's project-relative `changed` paths are added to `ctx.changedThisRun`
  before the next fix runs. Then every check is re-run; the report's `checks` are the post-fix
  results, and `fixes` lists `{id, applied, refused?, changed?, backup?, notes?}` per attempt.
- **Scope.** `--global` runs only `scope: 'global'` checks. Otherwise global checks always run,
  and project checks run only when a DevFlow project was resolved (`ctx.projectRoot` non-null);
  skipped checks are absent from the report and counted nowhere.

## What a check must not do

- **Never read `os.homedir()` or `process.env` directly.** Use `ctx.userHome`, `ctx.env` and
  `ctx.paths`, so tests (which pass a fake home) never touch the real `~/.claude`.
- **Never call `output()` / `error()`** from `lib/helpers.cjs` — they `process.exit`. Return a
  result; throw only for genuinely unexpected failures.
- **Never re-implement** validate health, upgrade, backup-prune or telemetry logic. Call those
  modules and translate their answer into a result.
- **`fixable: true` is a promise** that `fix()` is safe and reversible right now, with the DOC-06
  safety guard already applied (e.g. no index-changing fix while unrelated changes are staged —
  but paths in `ctx.changedThisRun` are the doctor's own). When a fix is refused, say why in
  `refused` and give the exact manual command in the result's `fix_command`.

## Testing a check

Use the shared builders in `../__fixtures__/doctor-fixtures.cjs`: `makeDoctorHome()`,
`makeInstalledPlugin(home, {version, files})`, `copyRealRuntimeFiles(installPath, rels)`,
`makeMirror(home, {version, files, digest})`, `makePluginCacheDirs(home, versions)`,
`makeDoctorProject({home, git, version})`. Build `ctx` with `doctor.buildContext({...})` and call
the check's `run(ctx)` / `fix(ctx, result)` directly, or run the whole engine with
`doctor.runDoctor({..., checks: [require('./NN-id.cjs')]})`.
