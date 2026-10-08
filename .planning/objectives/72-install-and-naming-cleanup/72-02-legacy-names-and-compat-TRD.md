---
objective: 72-install-and-naming-cleanup
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/legacy-names.cjs
  - plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs
  - plugins/devflow/devflow/bin/lib/compat.cjs
  - plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs
autonomous: true
requirements: [INST-02, INST-03]
must_haves:
  truths:
    - "`legacy-names.cjs` exports frozen `NAMES` and `LEGACY` objects holding every pair of the 72-CONTEXT name map (product, slug, upper, cli, banner, planningDir, runtimeDir, envPrefix, agentNs, commandNs, configKey, blockTag, markerNs, checkContextNs, userDotDir, notices, repo, pagesProject, checksWorkflow, checksCaller, watch, adoptBranch, plugin), plus LEGACY-only `commandNsShort` ('/df:'), `commandDash` ('/df-') and `installPrefix` ('df-')"
    - "`legacy-names.cjs` is the ONLY non-test, non-fixture module that spells a legacy name; `compat.cjs` builds every legacy string from `LEGACY`"
    - "`aliasLegacyEnv(env)` copies each `DEVFLOW_<X>` to `AOFORGE_<X>` only when `AOFORGE_<X>` is unset (the AOFORGE form wins when both are set), returns the sorted list of aliased names, and never deletes the legacy key"
    - "`planningDirName(root)` returns `.aoforge` when that directory exists, else `.planning` when that exists, else `.aoforge`; `planningRoot(root)` joins it; `isLegacyPlanning(root)` is true only for a `.planning`-only root; `bothPlanningDirs(root)` is true when both exist"
    - "`findProjectRoot(start)` returns the nearest ancestor (or start) holding `.aoforge/` or `.planning/`, preferring neither by depth (nearest wins) and `.aoforge` at the same level; null when none within the walk limit"
    - "`isOwnAgentType(t)` is true for `aoforge:*` and `devflow:*` and false for anything else (including null and `aoforgex:`)"
    - "`userDotFile(home, name)` reads `~/.aoforge/<name>` first and falls back to `~/.devflow/<name>`; with neither present it returns the `~/.aoforge/<name>` write path"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/legacy-names.cjs
      provides: "single source of the old and new names (NAMES, LEGACY, SHIM_REMOVAL)"
      exports: ["NAMES", "LEGACY", "SHIM_REMOVAL"]
    - path: plugins/devflow/devflow/bin/lib/compat.cjs
      provides: "one-release shim primitives"
      exports: ["aliasLegacyEnv", "planningDirName", "planningRoot", "isLegacyPlanning", "bothPlanningDirs", "findProjectRoot", "isOwnAgentType", "userDotFile", "runtimeHome", "legacyRuntimeHome"]
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs
      provides: "hand-built legacy inputs: project layouts, env, fake home"
      exports: ["projectTree", "legacyEnv", "fakeHome"]
  key_links:
    - from: "compat.cjs"
      to: "legacy-names.cjs LEGACY/NAMES"
      via: "require; no string literal of a legacy name in compat.cjs"
      pattern: "require\\('./legacy-names.cjs'\\)"
---

# TRD 72-02: The name map and the one-release shim primitives

<objective>
Every later TRD of 72 needs the same answers: what the old and new names are, how a `DEVFLOW_*` variable keeps
working, where a project's planning directory is when it may be `.aoforge/` or `.planning/`, and whether an agent type
is ours. Put the name map in one module and the shim primitives in another, test-first, before the mechanical rename
(72-04) moves everything.

Purpose: INST-03's shims live in one place, and INST-02's repo test (72-04) can allowlist a single module.
Output: `legacy-names.cjs`, `compat.cjs`, `__fixtures__/legacy-fixtures.cjs`, and their `*.legacy.test.cjs` tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict (RED, GREEN, optional REFACTOR as atomic commits per task), test list
first, hand-built fixtures, no property-based libraries, no `.feature` files. User playbook: failing test first, one
test at a time.

**Naming convention this TRD establishes (72-04's repo test enforces it):** a legacy name may be spelled only in
`bin/lib/legacy-names.cjs`, in `bin/lib/__fixtures__/legacy-*.cjs`, and in test files named `*.legacy.test.cjs` /
`*.legacy.test.js`. Every other module builds legacy strings from `LEGACY`. That is why the tests here are
`*.legacy.test.cjs`.

These files are written at today's paths (`plugins/devflow/devflow/bin/lib/`); 72-04 moves them to
`plugins/aoforge/aoforge/bin/lib/` and leaves `legacy-names.cjs`, `legacy-*.cjs` fixtures and `*.legacy.test.*` content
untouched.

Read narrowly for patterns: `upgrade.cjs` 217-222 (`repoKey`), `hooks/gate-executor-stop.js` 60-95 (`findUp`,
`findProjectRoot`), `hooks/gate-edits.js` 260-270 (`isDevflowAgent`).
</context>

## Test list

All in-process (pure modules). One at a time.

**legacy-names.legacy.test.cjs**
1. `NAMES` and `LEGACY` are frozen; assigning a key throws in strict mode.
2. Every key of `NAMES` exists in `LEGACY` (same key set, except the LEGACY-only `commandNsShort`, `commandDash`,
   `installPrefix`).
3. Exact pairs from the 72-CONTEXT name map: product DevFlow/AOForge, slug devflow/aoforge, cli df-tools/aof-tools,
   runtimeDir devflow/aoforge, envPrefix DEVFLOW_/AOFORGE_, planningDir .planning/.aoforge, agentNs devflow:/aoforge:,
   commandNs /devflow:/aoforge:, configKey devflow/aoforge, blockTag DEVFLOW/AOFORGE, banner `DF ►`/`AOF ►`, repo
   devflow-claude/aoforge-claude, pagesProject devflow-docs/aoforge-docs, checksWorkflow devflow-checks.yml/
   aoforge-checks.yml, checksCaller devflow.yml/aoforge.yml, watch devflow-watch/aoforge-watch, adoptBranch
   devflow/adopt/aoforge/adopt, plugin devflow@aocyber/aoforge@aocyber, notices .devflow-notices.json/
   .aoforge-notices.json, userDotDir .devflow/.aoforge, markerNs devflow/aoforge, checkContextNs devflow//aoforge/.
4. `SHIM_REMOVAL` is the string `the release after 3.0.0`.

**compat.legacy.test.cjs**
5. `aliasLegacyEnv({ DEVFLOW_SKIP_EDIT_GATE: '1' })` sets `AOFORGE_SKIP_EDIT_GATE: '1'`, keeps the legacy key,
   returns `['AOFORGE_SKIP_EDIT_GATE']`.
6. Both set with different values: the AOFORGE value is kept, nothing returned for it.
7. `DEVFLOW_` alone (empty suffix) and a lowercase `devflow_x` are ignored.
8. Default argument is `process.env` (a test sets and restores one variable).
9. `planningDirName`: `.aoforge` only -> `.aoforge`; `.planning` only -> `.planning`; both -> `.aoforge`; neither ->
   `.aoforge`; a FILE named `.aoforge` beside a `.planning` dir -> `.planning`.
10. `planningRoot(root)` equals `path.join(root, planningDirName(root))`.
11. `isLegacyPlanning`: true only for `.planning` only; `bothPlanningDirs`: true only for both.
12. `findProjectRoot` from `root/a/b`: `.planning` at root -> root; `.aoforge` at `root/a` and `.planning` at root ->
    `root/a` (nearest wins); none -> null; walk limit respected (`maxUp` option).
13. `isOwnAgentType`: `aoforge:executor` true, `devflow:planner` true, `aoforgex:a` false, `Explore` false, `''`,
    `null`, `undefined` false.
14. `userDotFile(home, 'defaults.json')`: new present -> new; only legacy present -> legacy; neither -> new path.
15. `runtimeHome(home)` = `<home>/.claude/aoforge`; `legacyRuntimeHome(home)` = `<home>/.claude/devflow`.
16. Source guard: `compat.cjs` text contains none of `devflow`, `DevFlow`, `DEVFLOW`, `.planning`, `df-tools`
    (case-sensitive literal search) — the module builds them from `LEGACY`.

<embedded_context>

<codebase_examples>
Existing find-up shape to mirror (gate-executor-stop.js 65-79):
```js
function findUp(start, name, fsImpl = fs) {
  let dir = path.resolve(start);
  for (;;) {
    if (fsImpl.existsSync(path.join(dir, name))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
```
Directory test: use `fs.statSync(p, { throwIfNoEntry: false })` and `.isDirectory()`; a file named `.aoforge` is not a
planning dir.

Fixture builder style (hand-built, tmp dirs under `os.tmpdir()`, `fs.mkdtempSync`):
```js
function projectTree({ layout = 'aoforge', files = {} } = {}) { /* mkdtemp; mkdir per layout; write files; return root */ }
```
</codebase_examples>

<anti_patterns>
- No legacy literal in `compat.cjs` (test 16 pins it). Use `LEGACY.planningDir`, `LEGACY.envPrefix`, etc.
- Do not wire these primitives into any caller here. 72-04/05/06 and the W5 shims adopt them.
- No property-based tests; named cases only. No generated test data.
- Do not cache `planningDirName` results: a migration moves the directory mid-process (72-08).
</anti_patterns>

<error_recovery>
- If `Object.freeze` tests fail on assignment silently, the test file lacks `'use strict'`.
- If test 12 finds the repo's own `.planning` above the tmp dir, the walk escaped the fixture: pass `maxUp` or use a
  tmp root with no `.planning` above it (os.tmpdir is fine).
</error_recovery>

</embedded_context>

<gotchas>
- The live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- `micro.test.cjs` hangs on commit signing: the full suite form is
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`.
- `npm test`'s glob `plugins/devflow/**/*.test.cjs` already matches `*.legacy.test.cjs`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for legacy inputs</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs</files>
  <action>
Create the module with three hand-built builders and a header comment stating the naming convention (legacy names may
be spelled here):
- `projectTree({ layout = 'aoforge' | 'legacy' | 'both' | 'none', files = {}, nested = null })` -> `{ root, cleanup }`:
  mkdtemp; create `.aoforge/` and/or `.planning/` per layout; write `files` (relative path -> content, under root);
  `nested: 'a/b'` creates that subdirectory.
- `legacyEnv(overrides = {})` -> a plain env object with `DEVFLOW_SKIP_EDIT_GATE: '1'`,
  `DEVFLOW_CALIBRATION_PATH: '/tmp/x.json'`, merged with overrides (no process.env).
- `fakeHome({ legacyDot = {}, newDot = {} })` -> `{ home, cleanup }`: mkdtemp; files under `<home>/.devflow/` and
  `<home>/.aoforge/`.
Check with one `node -e` that each builder returns existing paths. Commit
(`test(72-02): legacy fixture builders`).
  </action>
  <verify>node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs');const p=f.projectTree({layout:'both'});console.log(require('fs').readdirSync(p.root));p.cleanup()"</verify>
  <done>The three builders exist and create the layouts they name.</done>
  <recovery>If cleanup leaves dirs, use `fs.rmSync(root, { recursive: true, force: true })`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: legacy-names.cjs, the single name map</name>
  <files>plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs, plugins/devflow/devflow/bin/lib/legacy-names.cjs</files>
  <action>
RED: tests 1-4 in `legacy-names.legacy.test.cjs` (header test list first). Run: all fail (module missing). Commit RED.

GREEN: `legacy-names.cjs` exporting `NAMES`, `LEGACY` (Object.freeze, the pairs of test 3 plus the LEGACY-only keys)
and `SHIM_REMOVAL`. Header comment: this module is the single source of the DevFlow -> AOForge name map (objective
72); legacy names may be spelled only here, in `__fixtures__/legacy-*.cjs` and in `*.legacy.test.*`; the shims that
use LEGACY are removed in the release after 3.0.0. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs</verify>
  <done>Tests 1-4 pass.</done>
  <recovery>If a pair is disputed, 72-CONTEXT.md's name map table wins; `checksCaller` and `notices` follow the
same rename rule (devflow -> aoforge).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: compat.cjs shim primitives</name>
  <files>plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs, plugins/devflow/devflow/bin/lib/compat.cjs</files>
  <action>
RED: tests 5-16 (header test list first), using the Task 1 builders. Run: all fail. Commit RED.

GREEN, `compat.cjs` (CommonJS, sync fs, no dependencies beyond `fs`, `path`, `./legacy-names.cjs`):
- `aliasLegacyEnv(env = process.env)`: for each key starting with `LEGACY.envPrefix` with a non-empty suffix, set
  `NAMES.envPrefix + suffix` when that key is `undefined`; return the sorted list of keys set.
- `planningDirName(root, fsImpl = fs)`, `planningRoot(root, fsImpl)`, `isLegacyPlanning(root, fsImpl)`,
  `bothPlanningDirs(root, fsImpl)`: directory checks via `statSync(..., { throwIfNoEntry: false })?.isDirectory()`.
- `findProjectRoot(start, { fsImpl = fs, maxUp = 64 } = {})`: walk up; at each level `.aoforge` dir or `.planning` dir
  returns that level.
- `isOwnAgentType(t)`: string starting with `NAMES.agentNs` or `LEGACY.agentNs`.
- `userDotFile(home, name, fsImpl)`, `runtimeHome(home)`, `legacyRuntimeHome(home)`.
Header comment: what each shim keeps working, that `.aoforge` always wins, and `LEGACY`'s removal note. Commit GREEN.
Run the full suite once (form in gotchas): no new failures.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs plugins/devflow/devflow/bin/lib/legacy-names.legacy.test.cjs</verify>
  <done>Tests 5-16 pass; the full suite shows no failure outside the 71-05 baseline (roadmap-reconcile E2E1 transient
only).</done>
  <recovery>If test 16 fails on a comment, reword the comment ("the legacy planning directory") rather than
allowlisting compat.cjs.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line)</test>
<test>npm test   (full suite before the last commit; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/*.legacy.test.cjs` passes.
- `rg -n -e 'devflow' -e 'DEVFLOW' -e '\.planning' -e 'df-tools' plugins/devflow/devflow/bin/lib/compat.cjs` prints
  nothing.
</verification>

<success_criteria>
- The name map has one home and the shim primitives exist, tested, ready for 72-04..72-11.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-02-SUMMARY.md` through
`df-tools summary post`.
</output>
