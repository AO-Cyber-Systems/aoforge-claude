---
objective: 78-remove-the-rename-shims
trd: "07"
type: standard
wave: 2
depends_on: ["78-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade-retired.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/git-busy.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/aof-tools.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
  - plugins/aoforge/hooks/upgrade-project.js
  - plugins/aoforge/hooks/upgrade-project.legacy.test.js
autonomous: true
requirements: [SC-2, SC-4]
must_haves:
  truths:
    - "Migrations 0012 and 0013 and their tests are gone; the registry loads without them; a stamp whose migrations_applied lists 0012/0013/0014 still upgrades cleanly"
    - "`aof-tools upgrade --apply --only 0012` (or 0013, 0014) exits 1 with one line saying the migration was retired after AOForge 3.0.x and naming 3.0.x or the manual step (docs/MIGRATING-TO-AOFORGE.md)"
    - "upgrade.readStamp reads only the `aoforge` key; writeStamp never reads, moves or deletes the pre-rename key"
    - "upgrade.apply / check on a legacy-only root writes nothing and reports the legacy layout (defence in depth for any caller)"
    - "In a legacy-only project (cwd or any ancestor below $HOME, no `.aoforge/` nearer), every aof-tools command that reads or writes the project's planning tree exits 1 with `legacyLayoutMessage(root)` and creates no `.aoforge/`; doctor and validate report instead; global-only commands (and `upgrade --global|--prune|--register`) run"
    - "The upgrade-project SessionStart hook, in a legacy-only project, queues ONE global notice (key `legacy-layout:<root>`) carrying `legacyLayoutMessage(root)`, runs no migration, commits nothing and creates no `.aoforge/`; it works whether or not compat still resolves `.planning/` (before and after 78-11)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs
      provides: "which aof-tools commands refuse in a legacy-only project, with a reason per exemption"
      exports: [legacyLayoutGuard, EXEMPT_COMMANDS]
    - path: plugins/aoforge/aoforge/bin/lib/upgrade-retired.legacy.test.cjs
      provides: "retired migration ids give the 3.0.x message"
  key_links:
    - from: plugins/aoforge/aoforge/bin/aof-tools.cjs main()
      to: legacy-layout-guard.legacyLayoutGuard
      via: "checked once before dispatch, after --cwd and the flag check"
      pattern: "legacyLayoutGuard"
    - from: plugins/aoforge/hooks/upgrade-project.js
      to: planning-layout.findLegacyLayoutRoot / legacyLayoutMessage
      via: "global notice instead of migration 0012"
      pattern: "legacy-layout:"
---

# TRD 78-07: Retire migrations 0012/0013; an old-layout project gets one message and no second planning tree

<objective>
Remove the planning-directory move (0012) and the config-key rename (0013), the upgrade runner's read of the
pre-rename stamp key, and the hook's 0012 path. In their place: a CLI guard that refuses project commands in a
legacy-only project with the one message from 78-01, a SessionStart notice with the same text, and a clear answer for
`--only 0012|0013|0014`.

Purpose: SC-2 (migrations 0012/0013 removed) and SC-4 (one clear message naming the fix; no tool silently writes a
second planning tree). compat still resolves `.planning/` until 78-11; everything here must hold in both states.
Output: no 0012/0013, guard module + wiring, rewritten hook path, tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/78-remove-the-rename-shims/78-01-SUMMARY.md (detector names and exact message)
@plugins/aoforge/aoforge/bin/lib/upgrade.cjs (lines 1-40, 150-230, 330-350, 400-560)
@plugins/aoforge/hooks/upgrade-project.js (lines 1-140, 330-420)
@plugins/aoforge/aoforge/bin/lib/help.cjs (COMMANDS: `mutates`)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-07): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use mkdtemp repos and a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`.
- `main` rewrote aof-tools.cjs as a lazy CLI (objectives 76/77): keep the aof-tools.cjs change to a require plus a
  few lines in `main()` so the reconcile is a small conflict.

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Migrations 0012 and 0013: REMOVED** (user decision). Their ids stay reserved: `RETIRED_MIGRATIONS` maps
  0012/0013/0014 to a message, so `--only` names the 3.0.x path instead of "unknown migration id".
- **The upgrade runner's generic `deferred` mechanism and the hook's HEAD-only-path commit handling: KEPT.** They name
  no legacy name and serve any migration that defers or deletes (0002 renames with fs).
- **The stamp writer no longer removes the pre-rename key.** Reason: 3.1 code touches old names only to report them;
  W067 (78-01) tells the user to delete it. A pre-rename-only stamp reads as "no stamp", which is safe because every
  migration is detection-based.
- **Guard scope:** commands that read or write the project's planning tree refuse; `doctor` and `validate` report;
  commands that only touch `~/.claude/aoforge` or git config run. Each exemption carries its reason in the module.
</context>

<embedded_context>

<codebase_examples>
aof-tools.cjs main(), where the guard goes (after the flag check, before `switch (command)`):
```js
if (HELP_TABLE[command] && HELP_TABLE[command].mutates) {
  const unknownFlag = checkFlags(args, FLAG_SPEC);
  if (unknownFlag) error(formatUnknownFlag(unknownFlag));
}
// 78-07: insert here
switch (command) {
```
upgrade.cjs stamp reading today:
```js
function stampObject(config) {
  if (!config) return null;
  if (isPlainObject(config[STAMP_KEY])) return config[STAMP_KEY];
  if (isPlainObject(config[LEGACY_STAMP_KEY])) return config[LEGACY_STAMP_KEY];
  return null;
}
```
and `writeStamp` rebuilds the object to drop `LEGACY_STAMP_KEY`. The `--only` resolution throws
`new RegistryError(unknown.map((id) => `unknown migration id ${id}`))` (line ~345).
upgrade-project.js main path:
```js
const root = findProjectRoot(process.cwd());
if (!root) return;
...
if (stamp === to && !isLegacyPlanning(root)) return; // FAST PATH (a legacy directory always leaves it: 0012)
```
Global notice pattern (coexistence-guard.js): `notices.appendNotice(notices.globalNoticesPath(home), { source, level,
key, message }, { now })` — a notice whose key matches an unconsumed one replaces it.
</codebase_examples>

<anti_patterns>
- Never write a PROJECT notice for a legacy-only root: `notices.projectNoticesPath` resolves under `.aoforge/` and
  would create the second planning tree. Use the global notices file.
- Do not guard `doctor`, `validate`, `help`, or read-only global commands; do not guard by "not mutating" alone:
  `init` is read-only but is what every skill calls first, so it must refuse.
- Do not remove `git-busy.cjs` (the hook uses it); only its comment names 0012.
- Do not edit `hooks/upgrade-project.js`'s `aliasLegacyEnv` line (78-10) or compat.cjs (78-11).
- Do not delete `upgrade-fixtures.cjs`; trim only the 0012-specific helpers if nothing else uses them.
</anti_patterns>

<error_recovery>
- planning-layout.legacy.test.cjs cases 3-4 (from 72-05) expect reads/writes to work in a legacy-only project: they
  become the refusal cases here (test-list 5-6). Cases 7-8 (both layout, aoforge layout) must keep passing.
- If 0010's tests reference 0012's re-upsert (78-04 may have left a comment), delete those cases here.
- If the doctor check 21 (pending migrations) test pins the registry size, update the pin.
- If a suite relies on `upgrade --apply` creating `.aoforge/config.json` in a directory with a legacy layout, it is a
  0012-era test: rewrite it to an empty directory or delete it.
</error_recovery>

</embedded_context>

<gotchas>
- The guard must resolve the legacy root by walking up from cwd (planning-layout.findLegacyLayoutRoot), so a subdir of
  a legacy project is covered too; the walk returns null as soon as a real `.aoforge/` project is nearer.
- `upgrade` exemptions are flag-based: `--global`, `--prune` and `--register` touch only the user's runtime state.
- Before 78-11, compat.findProjectRoot still returns a legacy-only root, so the hook must check
  `planningLayout.isLegacyPlanning(root)` on a found root as well as handle a null root.
- The notice key uses the realpath of the root so one project is told once per session even through a symlink.
</gotchas>

## Test list

Outermost first; fixtures: `legacy-layout-fixtures.planningProject({ layout: 'legacy', git: true })` (hand-built).
1. Hook (spawned, scratch HOME, cwd = legacy-only project, then a subdir of it): one global notice, key
   `legacy-layout:<realpath>`, message === `legacyLayoutMessage(root)`; no `.aoforge/` anywhere under the project;
   `git status --porcelain` unchanged; no migration ran; stdout empty; exit 0. A second run leaves one unconsumed notice.
2. Hook in an `.aoforge/` project whose config has only the pre-rename stamp key: the normal upgrade runs, writes an
   `aoforge` stamp and leaves the pre-rename key in place.
3. `aof-tools upgrade --apply --only 0012` (and 0013, 0014) in an `.aoforge/` project: exit 1, one line naming
   "retired", `3.0.x` and the guide; nothing written.
4. `upgrade --check --raw` with a stamp listing 0012/0013/0014: no error; those ids are simply recorded.
5. CLI guard, legacy-only cwd: `state load`, `init plan-objective 1`, `roadmap analyze`, `objective add "X"`,
   `config-set workflow.x true`, `todo add "x"`, `upgrade --apply`, `planning mode`, `commit "x" --files a` each exit
   1 with stderr containing `legacyLayoutMessage(root)`; no `.aoforge/` is created; the legacy directory is
   byte-identical.
6. CLI guard, same cwd: `doctor --raw` and `validate health --raw` report (78-01 behaviour, exit codes as they define);
   `resolve-model executor`, `current-timestamp`, `estimate --help`-free read such as `generate-slug "a b"`, and
   `upgrade --global --check` run normally.
7. CLI guard in an `.aoforge/` project nested below a legacy one: commands run (nearest real project wins). In a
   both-layout project: commands run (W066 both is advisory).
8. `legacyLayoutGuard` unit: guarded/exempt classification for every command in help.cjs COMMANDS (table-driven; the
   exempt set equals `EXEMPT_COMMANDS`, each with a non-empty reason).
9. upgrade.cjs: `readStamp` on a pre-rename-only config -> null; `writeStamp` on a config holding both keys keeps the
   pre-rename key byte-identical; `apply` on a legacy-only root returns a report naming the legacy layout and writes
   nothing.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED + GREEN — retire 0012/0013, stamp key, retired ids, legacy refusal in upgrade.cjs</name>
  <files>plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0013-config-key-rename.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-migration-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/upgrade.cjs, plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs, plugins/aoforge/aoforge/bin/lib/upgrade-retired.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/git-busy.cjs</files>
  <action>
RED: cases 3, 4 and 9 in upgrade-retired.legacy.test.cjs (and upgrade.test.cjs for the stamp cases that need no legacy
spelling). Commit failing.
GREEN:
- `git rm` 0012 and 0013 (sources and legacy tests). Delete legacy-migration-fixtures.cjs if its only users were those
  two tests and the hook legacy test (Task 2 rewrites that test without it); otherwise trim.
- upgrade.cjs: drop LEGACY_STAMP_KEY and the LEGACY import; `stampObject` reads STAMP_KEY only; `writeStamp` sets
  STAMP_KEY in place (append when absent) and never touches other keys. Add `RETIRED_MIGRATIONS = Object.freeze({
  '0012': 'planning-dir move', '0013': 'config-key rename', '0014': 'CLAUDE.md rebrand' })`; in the `--only`
  resolution, a retired id throws a RegistryError whose problem line is `migration <id> (<title>) was retired after
  AOForge <SHIM_RELEASE>: run it with AOForge <SHIM_RELEASE>, or do it by hand (docs/MIGRATING-TO-AOFORGE.md,
  "Upgrading from 2.x")`. A known id (0014 until 78-08 deletes it) resolves normally. In `apply` and `check`, when
  `planningLayout.isLegacyPlanning(projectRoot)`: return the usual report shape with nothing applied and a
  `legacy_layout` field holding `legacyLayoutMessage(projectRoot)`. Rewrite the header comment (no "one release").
- git-busy.cjs: comment no longer names 0012.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/upgrade-retired.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/21-pending-migrations.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/*.test.cjs` passes (skip absent files); `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/upgrade.cjs` finds nothing.</verify>
  <done>Cases 3, 4, 9 green; no 0012/0013 in the registry.</done>
  <recovery>If a registry test asserts contiguous ids, assert "sorted and unique" instead and say why in the SUMMARY (ids 0012-0014 are retired, not reused).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED + GREEN — the SessionStart hook tells a legacy-only project once</name>
  <files>plugins/aoforge/hooks/upgrade-project.js, plugins/aoforge/hooks/upgrade-project.legacy.test.js</files>
  <action>
RED: cases 1-2 in upgrade-project.legacy.test.js (replace the 0012/0013 cases). Commit failing.
GREEN in upgrade-project.js:
- After the `AOFORGE_SKIP_UPGRADE` check: `const found = findProjectRoot(process.cwd());` then
  `const legacyRoot = found ? (layout.isLegacyPlanning(found) ? found : null) : layout.findLegacyLayoutRoot(process.cwd());`
  If `legacyRoot`: append a GLOBAL notice `{ source: 'upgrade-project', level: 'action', key:
  'legacy-layout:' + realpath(legacyRoot), message: layout.legacyLayoutMessage(legacyRoot) }` and return. Load
  planning-layout from the bundled LIB like upgrade.cjs (fail open on MODULE_NOT_FOUND, one stderr line on any other
  error).
- Fast path: `if (stamp === to) return;` and drop the compat `isLegacyPlanning` import.
- Rewrite the header steps 1-4 and the 0012-specific comments (deferral notice text stays generic: it names the
  migration id and `aof-tools upgrade --apply --only <id>`).
  </action>
  <verify>`node --test plugins/aoforge/hooks/upgrade-project.legacy.test.js plugins/aoforge/hooks/upgrade-project.test.js plugins/aoforge/hooks/route-results.test.js` passes (skip absent files).</verify>
  <done>Cases 1-2 green.</done>
  <recovery>If the hook test harness only supports project notices, read the global file at `<scratch HOME>/.claude/aoforge/.aoforge-notices.json` directly.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: RED + GREEN — the aof-tools guard</name>
  <files>plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.cjs, plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs, plugins/aoforge/aoforge/bin/aof-tools.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs</files>
  <action>
RED: cases 5-8 (5-7 spawn `aof-tools --cwd <root>`; rewrite planning-layout.legacy.test.cjs cases 3-4 to the refusal).
Commit failing.
GREEN:
- New `legacy-layout-guard.cjs`: `EXEMPT_COMMANDS` = frozen map command -> reason (start from: doctor, validate
  "report the layout"; transcript-export, tokens, calibrate, estimate "transcripts and ~/.claude/aoforge state only";
  handoff "the watch queue in ~/.claude/aoforge"; merge-driver "git config only"; global-config "user config only";
  changelog "CHANGELOG.md only"; plus any other mutating command whose code you confirm never resolves the planning
  root — grep its lib for planningRoot/planningRel/findProjectRoot before exempting). `legacyLayoutGuard({ command,
  args, cwd, commands })` -> null when the command is exempt, when it is neither `mutates` nor `init`, when `upgrade`
  carries `--global`, `--prune` or `--register`, or when `findLegacyLayoutRoot(cwd)` is null; else
  `{ root, message: legacyLayoutMessage(root) }`.
- aof-tools.cjs: one require and, before the switch, `const legacy = legacyLayoutGuard({ command, args, cwd, commands:
  HELP_TABLE }); if (legacy) error(legacy.message);` (error() prints and exits 1).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/legacy-layout-guard.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/help-delegation.test.cjs plugins/aoforge/aoforge/bin/lib/flag-spec.repo.test.cjs` passes (skip absent files).</verify>
  <done>Cases 5-8 green; a legacy-only project never gains `.aoforge/` through aof-tools.</done>
  <recovery>If a widely used read path (e.g. statusline calling `aof-tools`) starts failing in legacy fixtures used by unrelated suites, switch those fixtures to layout `aoforge`; never widen EXEMPT_COMMANDS without the grep evidence.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- Cases 1-9 green; RED before GREEN per task.
- `git ls-files 'plugins/aoforge/aoforge/bin/lib/migrations/0012*' 'plugins/aoforge/aoforge/bin/lib/migrations/0013*'` prints nothing.
- In a scratch legacy-only repo, `node plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> state load` prints the
  one message and `<repo>/.aoforge` does not exist afterwards.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- No 0012/0013; no stamp read under the old key; one message from the CLI and the hook; no second planning tree.
  Decisions recorded.
</success_criteria>

<output>
After completion, write `78-07-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-07 --from <draft>`
(after `tokens stamp 78-07 --draft <draft>`). Include the Decisions table and the EXEMPT_COMMANDS table with reasons.
</output>
