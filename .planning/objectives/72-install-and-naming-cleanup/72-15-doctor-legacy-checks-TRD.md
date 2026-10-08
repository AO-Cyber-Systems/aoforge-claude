---
objective: 72-install-and-naming-cleanup
trd: "15"
type: standard
wave: 6
depends_on: ["72-07", "72-08", "72-10", "72-11"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/26-checks-workflow-pin.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md
autonomous: true
requirements: [INST-01, INST-03]
must_haves:
  truths:
    - "Doctor check 15 `legacy-df-install` (global) reports every `df-*` entry under `~/.claude/skills` and `~/.claude/agents` as a warning; `doctor --fix` moves them into `~/.claude/aoforge/backups/legacy-<ts>/` through global-upgrade's mover (never deletes); with none present it is ok"
    - "Doctor check 16 `legacy-devflow-runtime` (global) reports: devflow@aocyber still enabled (fix command `claude plugin disable devflow@aocyber`, report-only); a legacy runtime home not yet migrated (fixable: runs the 72-07 migration); a legacy runtime home left after migration with the old plugin disabled (fixable: moved whole into `~/.claude/aoforge/backups/legacy-devflow-runtime-<ts>/`; refused while the old plugin is enabled); legacy-prefixed variables set in the environment (report-only, names them and their AOForge forms)"
    - "Doctor check 27 `legacy-planning-layout` (project) owns W066 and W067 (check 22 defers both) and reports them with fix commands `aof-tools upgrade --apply --only 0012` / `--only 0013` (report-only: a directory move is an index change the user commits)"
    - "Doctor check 26 reports a legacy managed caller workflow as `legacy` with the fix command `aof-tools gh rebrand --dry-run` and never offers a pin bump for it"
    - "The doctor README's range table lists 15, 16 and 27; every check obeys the contract (ctx.userHome/ctx.env only)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs
      provides: "INST-01: df-* reappearance"
    - path: plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.cjs
      provides: "devflow leftovers: plugin enabled, runtime home, env"
    - path: plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
      provides: "W066/W067 owner"
  key_links:
    - from: "15-legacy-df-install.cjs fix"
      to: "global-upgrade.cjs findLegacy/moveLegacy"
      via: "require; no second mover"
      pattern: "moveLegacy"
    - from: "16-legacy-devflow-runtime.cjs"
      to: "coexistence.cjs detectLegacyPlugin + runtime-state-migrate.cjs"
      via: "require"
      pattern: "detectLegacyPlugin"
---

# TRD 72-15: Doctor finds what the rename left behind

<objective>
INST-01 requires that `doctor` flags a legacy `df-*` skill or agent that reappears. The rename adds more leftovers
worth flagging: the old plugin still enabled, the old runtime home, legacy environment variables, and projects still
on the legacy planning layout or config key. Add three doctor checks for them, with safe fixes where a fix is safe and
reversible, and teach check 26 about legacy caller workflows.

Purpose: INST-01 (doctor flags df-* reappearance), INST-03 (advisories naming each migration).
Output: doctor checks 15, 16, 27; check 22 defers W066/W067; check 26 legacy callers; README.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read: `doctor-checks/README.md` (contract, ranges, rules: never read os.homedir/process.env, use ctx; `fixable` only
when safe and reversible now; DOC-06 index guard); `doctor-checks/20-legacy-runtime-state.cjs` (a check with a fix and
backups, the model); `doctor-checks/22-validate-health.cjs` 10-30 (DEFERRED); `doctor-checks/26-checks-workflow-pin.cjs`;
`doctor.cjs` (where `ctx.paths` is built: add `legacyMirrorDir`); `global-upgrade.cjs` `findLegacy`/`moveLegacy`;
72-07's `runtime-state-migrate.cjs`, 72-10's `coexistence.cjs`, 72-11's `checks-pin` `legacy` flag.

This machine at planning: `~/.claude/skills` holds only `synced`, `~/.claude/agents` is empty (the 36-06 mover already
ran), so check 15 is `ok` today; the test creates the reappearance.
</context>

## Test list

All in-process through the doctor engine with a fake home (`ctx.userHome`) and injected env, then one CLI case.

**15-legacy-df-install**
1. Fake home with `~/.claude/skills/df-quick/SKILL.md` and `~/.claude/agents/df-planner.md` -> warn, finding names both,
   fixable.
2. `--fix` -> both moved under `~/.claude/aoforge/backups/legacy-<ts>/skills|agents/`, originals gone, nothing deleted
   (backup contents equal), re-run -> ok.
3. A non-df skill (`synced`) is never reported or moved.

**16-legacy-devflow-runtime**
4. Old plugin enabled (72-10 fixture) -> warn with `fix_command` `claude plugin disable devflow@aocyber`, fixable false
   for that finding.
5. Legacy home present, no migration marker -> warn, fixable; `--fix` runs the migration (marker written).
6. Legacy home present, marker present, old plugin disabled -> warn, fixable; `--fix` moves the whole legacy home into
   the backups dir; re-run -> ok.
7. Same as 6 but the old plugin enabled -> fix refused with a reason naming the disable command.
8. `ctx.env` with a legacy-prefixed skip variable -> finding names it and its AOForge form; never fixable.

**27-legacy-planning-layout** (project scope, 72-05/72-08 fixtures)
9. Legacy layout -> W066 with `--only 0012`; legacy config key -> W067 with `--only 0013`; both -> both; AOForge layout
   -> ok.
10. Check 22's report on the same project lists W066/W067 under `details.deferred`, never in its own severity.

**26-checks-workflow-pin**
11. A legacy managed caller -> finding `legacy caller workflow`, `fix_command: aof-tools gh rebrand --dry-run`, no pin
    fix offered.

**CLI**
12. `aof-tools doctor --global --json` on fake home 1 lists `legacy-df-install` with severity warn.

<embedded_context>

<codebase_examples>
Check module shape (README contract):
```js
module.exports = {
  id: 'legacy-df-install', title: 'Legacy df-* skills and agents', scope: 'global',
  run(ctx) { /* ctx.userHome, ctx.paths */ return { severity, finding, fixable, fix_command, details }; },
  fix(ctx, result) { return { applied, changed, backup, notes }; },
};
```
</codebase_examples>

<anti_patterns>
- Never delete: moves into backups only, and only when reversible now.
- Never edit Claude Code plugin settings or run `claude plugin ...` from doctor; report the command.
- Never read `os.homedir()` or `process.env` in a check.
- Legacy names from LEGACY (`installPrefix` for `df-`); literals only in fixtures and `*.legacy.test.*`.
</anti_patterns>

<error_recovery>
- If the engine's id uniqueness test lists ids, add the three new ids there.
- If `21-pending-migrations` also reports 0012/0013 as pending, that is expected (it reports any pending migration);
  27 adds the W-code view and the specific command.
</error_recovery>

</embedded_context>

<gotchas>
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- `ctx.paths.mirrorDir` is `~/.claude/aoforge` after 72-04; add `legacyMirrorDir` (= `compat.legacyRuntimeHome`).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: homes and projects with leftovers</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/doctor.cjs</files>
  <action>
`leftoverHome({ dfSkills = [], dfAgents = [], legacyRuntime = false, migrated = false, devflowEnabled = false })` built
on 72-07's `legacyRuntimeHome` and 72-10's `pluginHome`; `doctorCtx({ home, env, projectRoot })` returning a ctx the way
`doctor.cjs` builds it (export the builder from doctor.cjs if it is not exported; add `paths.legacyMirrorDir` there).
Check with `node -e`. Commit (`test(72-15): leftover fixtures; doctor ctx legacyMirrorDir`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doctor.test.cjs</verify>
  <done>Fixtures build; doctor suite passes with the new path key.</done>
  <recovery>If doctor.cjs builds ctx inline, extract a `buildCtx` function with no behaviour change first.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Checks 15 and 16 (global)</name>
  <files>plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.cjs</files>
  <action>
RED: tests 1-8 and 12. Run: fail. Commit RED.

GREEN: both checks per the truths, reusing global-upgrade's mover, coexistence detection and the runtime migration;
16 reports each finding in `details.findings[]` and its overall severity is the worst of them; fixable only when every
fixable finding's fix is safe now. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-devflow-runtime.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs</verify>
  <done>Tests 1-8 and 12 pass; existing global check suites pass.</done>
  <recovery>If one check grows unwieldy, keep the env finding report-only and short; do not add a fourth check.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Check 27, check 22 deferral, check 26 legacy callers, README</name>
  <files>plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/26-checks-workflow-pin.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/README.md</files>
  <action>
RED: tests 9-11. Run: fail. Commit RED.

GREEN: check 27 (report-only, runs validate's W066/W067 detection through the same compat/upgrade helpers, not by
parsing validate output); `DEFERRED` in check 22 gains W066 and W067 with a one-line owner comment; check 26 branches
on `legacy: true`. README: range table rows for 15, 16 (TRD 72-15) and 27 (owns W066/W067). Run all doctor-check suites
and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/*.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.test.cjs</verify>
  <done>Tests 9-11 pass; all doctor suites pass; full suite at baseline.</done>
  <recovery>If check 22's tests pin the DEFERRED list, extend the expectation with W066 and W067.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs doctor --global --json` on this machine runs every global check
  without a contract error (it may report the still-enabled devflow plugin; expected until 72-21).
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs doctor --json` in this repo reports W066/W067 via check 27 (expected
  until 72-21).
</verification>

<success_criteria>
- A reappearing `df-*` skill or agent, a lingering old plugin or runtime, and a project on the legacy layout are all
  flagged with the exact way out.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-15-SUMMARY.md` through
`df-tools summary post`.
</output>
