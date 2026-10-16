---
objective: 78-remove-the-rename-shims
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/validate.cjs
  - plugins/aoforge/aoforge/bin/lib/help.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs
autonomous: true
requirements: [SC-3, SC-4]
must_haves:
  truths:
    - "planning-layout.cjs detects the pre-rename layout on its own (no compat.cjs fallback): `isLegacyPlanning(root)` is true only when `<root>/.planning/` is a directory holding at least one of config.json, STATE.md, ROADMAP.md, PROJECT.md and `<root>/.aoforge/` is not a directory; `bothPlanningDirs(root)` is true when both are directories"
    - "`findLegacyLayoutRoot(start, { home })` walks up from `start`, never returns $HOME or searches above it, returns null as soon as it meets a directory holding `.aoforge/`, and returns the first directory with the legacy layout"
    - "`legacyLayoutMessage(root)` is ONE line that names `.planning/`, says AOForge no longer reads it, and names both fixes: AOForge 3.0.x (`aof-tools upgrade --apply`) and the manual `git mv .planning .aoforge`, plus the migration guide"
    - "W066 (legacy) makes `validate health` return status broken with that message and fix, before any other check; W066 (both) stays a warning; neither names `--only 0012`"
    - "W067 fires whenever `.aoforge/config.json` carries the pre-rename stamp key: only that key -> fix `rename the key to \"aoforge\"`; both keys -> fix `delete the pre-rename key`; neither names `--only 0013`"
    - "W069 legacy-claude-md-block fires when the project CLAUDE.md holds a managed-block START marker under the pre-rename tag; it is a warning naming the marker rename (and AOForge 3.0.x as the alternative); `hasLegacyBlockMarker(text)` and `legacyBlockMessage(fileLabel)` -> `{ message, fix }` are exported for 78-08 (project and global CLAUDE.md use the same text)"
    - "doctor check 27 stays report-only and reports W066 (both), W067 and W069 with the 3.0.x/manual fix; doctor check 22 defers W069 to it; `aof-tools doctor` in a legacy-only project prints the one legacy message as a note and runs no project checks"
    - "legacy-names.cjs exports SHIM_RELEASE = '3.0.x' (the last release line that carries the shims and migrations 0012-0014); SHIM_REMOVAL is unchanged here (78-12 sets it)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
      provides: "every project-level pre-rename detector and the one legacy-layout message"
      exports: [isLegacyPlanning, bothPlanningDirs, findLegacyLayoutRoot, legacyLayoutMessage, legacyPlanningIssue, legacyConfigKeyIssue, legacyClaudeMdIssue, legacyBlockMessage, hasLegacyBlockMarker, advisoryLine, MIGRATION_GUIDE]
    - path: plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs
      provides: "unit tests of the detectors (legacy names as input)"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/validate.cjs Check 1
      to: planning-layout.legacyPlanningIssue
      via: "a legacy-only root returns broken with the legacy message before any other check"
      pattern: "legacyPlanningIssue"
    - from: plugins/aoforge/aoforge/bin/lib/doctor-cli.cjs resolveProject
      to: planning-layout.findLegacyLayoutRoot / isLegacyPlanning
      via: "a legacy-only project yields projectRoot null plus the legacy message as a note"
      pattern: "legacyLayoutMessage"
    - from: plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs DEFERRED
      to: W069
      via: "W066, W067 and W069 show once, under check 27"
      pattern: "W069"
---

# TRD 78-01: Legacy-layout detectors and the one message

<objective>
Build every project-level detector the 3.1.0 removal needs, independent of the compat.cjs fallback, and point the
reporters (validate health, doctor check 27, doctor's project resolution) at them with the 3.0.x / manual fix instead
of the migrations that 78-07 and 78-08 retire.

Purpose: SC-3 (each legacy check is kept as read-only reporting naming the 3.0.x path, with the reason recorded) and
SC-4 (an old-layout project gets one clear message naming the fix). Later TRDs call these detectors: 78-07 (the CLI
guard and the SessionStart notice), 78-08 (the managed-block refusal) and 78-11 (compat drops its fallback).
Output: planning-layout.cjs detectors, rewired reporters, tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
@plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
@plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs
@plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-01): <desc>" --files <paths>`.
  The failing test is committed before its implementation (RED commit, then GREEN commit).
- Tests build mkdtemp projects and a scratch HOME. Never write to the real `~/.claude`. Never use port 8080.
  Never push, tag or release.
- Rename guard: a legacy name may be spelled only in `legacy-names.cjs`, `__fixtures__/legacy-*` and `*.legacy.test.*`.
  Everywhere else build it from `LEGACY` (destructure `planningDir` as the existing modules do, so a dotted access never
  spells the directory).
- `main` already uses W068 (objective 76/77's decision-log check) and migration 0015. This TRD takes **W069**; record
  the choice in the SUMMARY so the main reconcile can check it.

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Doctor check 27 `legacy-planning-layout`: KEEP, report-only.** Reason: a project still on `.planning/`, a stale
  `devflow{}` key or `DEVFLOW` CLAUDE.md markers is exactly the "old layout" SC-4 must name; detection reads two
  directories and one file and makes nothing work under the old name. Its fix commands change from
  `upgrade --apply --only 0012/0013` (retired by 78-07) to the 3.0.x path or the manual step.
- **validate health W066 / W067: KEEP as reporting.** W066 (legacy-only) becomes the one broken result naming the fix
  (after 78-11 nothing else can read such a project); W066 (both) stays a warning. W067 now also fires when both keys
  exist (3.1 never merges or removes the pre-rename key; 78-07 stops the stamp writer from touching it).
- **New W069 `legacy-claude-md-block`:** reports a project CLAUDE.md block under the pre-rename markers, which 78-08
  stops reading (and migration 0014 goes with it).
</context>

<embedded_context>

<codebase_examples>
Current W066 detector (planning-layout.cjs) — it delegates the layout test to compat, which 78-11 will strip:
```js
const { isLegacyPlanning, bothPlanningDirs, planningRoot, planningRel } = require('./compat.cjs');
const { NAMES, LEGACY, SHIM_REMOVAL } = require('./legacy-names.cjs');
function legacyPlanningIssue(root) {
  if (bothPlanningDirs(root)) return { code: CODE, layout: 'both', message: ..., fix: ... };
  if (isLegacyPlanning(root)) return { code: CODE, layout: 'legacy', message: ..., fix: `Run \`aof-tools upgrade --apply --only ${MIGRATION_ID}\` ...` };
  return null;
}
```
Destructuring pattern every module uses so the source never spells the old directory:
```js
const { planningDir: NEW_DIR } = NAMES;
const { planningDir: OLD_DIR } = LEGACY;
```
validate.cjs Check 1 early return (the shape to reuse for the legacy-only case):
```js
if (!fs.existsSync(planningDir)) {
  addIssue('error', 'E001', `${planningDirLabel()} directory not found`, 'Run /aoforge:new-project to initialize');
  output({ engine_version: pluginVersion(), schema_version: 1, status: 'broken', errors, warnings, info, repairable_count: 0 }, raw);
  return;
}
```
The $HOME stop rule to mirror in `findLegacyLayoutRoot` lives in compat.cjs (`userHomeDir`, `isUserHome`,
`homeMatcher`): reuse `userHomeDir()`/`isUserHome()` from compat (they stay in 3.1), do not copy them.
The doctor check contract: `module.exports = { id, title, scope: 'project'|'global', run(ctx), fix?(ctx) }`; `run`
returns `{ severity: 'ok'|'warn'|'error', finding, fixable, details?, fix_command? }` (doctor-checks/README.md).
</codebase_examples>

<anti_patterns>
- Do not call compat.isLegacyPlanning / compat.bothPlanningDirs / compat.planningRoot from the detectors: after 78-11
  compat only knows `.aoforge/`. Read `<root>/<OLD_DIR>` and `<root>/<NEW_DIR>` directly; read W067's config from
  `<root>/<NEW_DIR>/config.json` explicitly.
- Do not treat any `.planning/` directory as a legacy project: require at least one planning marker file inside it
  (config.json, STATE.md, ROADMAP.md, PROJECT.md). An unrelated `.planning/` must not trigger the guard 78-07 builds.
- Do not reuse the old wording "AOForge reads it for one release" or `--only 0012`/`--only 0013` anywhere.
- Do not edit `legacy-doctor-fixtures.cjs` (78-06 owns it) or `init.cjs` (its advisory uses `advisoryLine`, which keeps
  working unchanged).
- "legacy" also names older, unrelated things: managed-block `meta.legacy` (an unversioned marker), 0010's
  `found.legacy` (pre-TRD JOB names), `20-legacy-runtime-state` (pre-45 in-repo state). None of them is a rename shim.
</anti_patterns>

<error_recovery>
- planning-layout.legacy.test.cjs (the 72-05 outside-in contract) still expects cases 3-4 (reads and writes in a
  legacy-only project succeed) because compat still falls back until 78-11 and the CLI guard lands in 78-07. In this
  TRD change only what this TRD's behaviour breaks (cases 5-6: the W066 text and severity); leave a comment naming 78-07
  and 78-11 as the owners of cases 3-4.
- If `validate health` is used by other suites on a legacy fixture and they now see `broken`, update those expectations
  in the same commit and list them in the SUMMARY.
</error_recovery>

</embedded_context>

<gotchas>
- The legacy-layout fixture `planningProject({ layout: 'legacy' })` writes `.planning/` with STATE.md, ROADMAP.md and
  config.json; extend it rather than writing new trees by hand (fixture_strategy: generators, hand-built only).
- `validate health` runs with `cwd` as the root (no walk). `doctor` walks (resolveProject). Keep both behaviours.
- help.cjs line ~239 (the `validate` entry `details`) is the only help text naming W066/W067; update it to W066/W067/W069
  with the new fixes. help.cjs feeds `site/data` through scripts/gen-docs-data.cjs at docs build time: do not edit
  `site/` here.
</gotchas>

## Test list

Outermost first (CLI, then module). Every case uses hand-built fixtures from `legacy-layout-fixtures.cjs`.

CLI (`node aof-tools.cjs --cwd <root> ...`, scratch HOME):
1. Legacy-only project: `validate health --raw` -> `status: "broken"`, an issue W066 whose message names the legacy
   directory and whose fix names `3.0.x`, `git mv` and the migration guide; no other check ran (no W003/E002 noise);
   `.aoforge/` was not created.
2. Both directories: `validate health --raw` -> W066 warning "both exist ... ignored"; status not broken by W066 alone.
3. `.aoforge/config.json` with only the pre-rename stamp key -> W067 with fix "rename the key"; with both keys -> W067
   with fix "delete the pre-rename key"; with only `aoforge` -> no W067.
4. CLAUDE.md holding `<!-- <LEGACY.blockTag>:START ... -->` ... END -> W069 warning; an AOFORGE block -> none; no
   CLAUDE.md -> none.
5. `doctor --raw` (or `--json`) run inside a legacy-only project -> no project checks in the report, and a note equal to
   `legacyLayoutMessage(root)`; run inside a subdirectory of it -> the same note (walk).
6. `doctor` in a both-layout / W067 / W069 project -> check 27 `warn` listing each code once; check 22 does not repeat
   them; no finding names `--only 0012` or `--only 0013`.

Module (`planning-layout-detect.legacy.test.cjs`):
7. `isLegacyPlanning`: legacy dir with a marker -> true; legacy dir empty or holding only unrelated files -> false; a
   FILE named like the legacy dir -> false; both dirs -> false.
8. `bothPlanningDirs`: true only when both are directories.
9. `findLegacyLayoutRoot`: from a nested subdir of a legacy project -> the project root; from inside an `.aoforge/`
   project nested under a legacy one -> null (the nearer real project wins); reaching $HOME (fake home that itself holds
   a legacy layout) -> null; `home: ''` disables the stop.
10. `legacyLayoutMessage(root)` is a single line (no `\n`) containing `.planning/`, `.aoforge`, `3.0.x`, `git mv` and
    `MIGRATING-TO-AOFORGE`.
11. `hasLegacyBlockMarker(text)`: true for a START marker under the legacy tag (any attributes, CRLF too), false for an
    AOFORGE marker, for the legacy tag in prose without the comment syntax, and for an END-only marker.
    `legacyBlockMessage('~/.claude/CLAUDE.md')` names that label, both pre-rename markers, the AOFORGE tag and `3.0.x`.
12. legacy-names: `SHIM_RELEASE === '3.0.x'`; existing assertions on NAMES/LEGACY unchanged.

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for the 3.1 legacy layouts</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs</files>
  <action>
Extend the hand-built fixture module (no generated data) with what the test list needs:
- `planningProject({ layout, configKey, claudeMd, markers })`: `configKey` in `'aoforge' | 'legacy' | 'both' | null`
  writes `.aoforge/config.json` (or the legacy dir's config.json for layout `legacy`) with a fixed stamp object
  (`{ version: '3.0.0', migrations_applied: ['0001'], upgraded_at: '2026-10-01T00:00:00.000Z' }`) under the requested
  key(s); `claudeMd: 'legacy-block' | 'aoforge-block' | null` writes a CLAUDE.md with a fixed managed block under the
  chosen tag; `markers: false` creates an empty legacy dir (for the "unrelated directory" case).
- `nestedHome()` helper: a fake HOME directory that itself holds a legacy layout, with a project below it, for the
  $HOME stop case.
Keep the existing exports and defaults byte-compatible so current callers are unaffected. Write the test list above as
a comment block at the top of the new test file `planning-layout-detect.legacy.test.cjs` (no tests yet).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs'); const p=f.planningProject({layout:'aoforge',configKey:'both',claudeMd:'legacy-block'}); console.log(require('fs').readFileSync(p.root+'/.aoforge/config.json','utf8').length>0, require('fs').existsSync(p.root+'/CLAUDE.md')); p.cleanup&&p.cleanup()"  prints `true true`; `node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs` still passes.</verify>
  <done>The fixture builds every layout/config/CLAUDE.md variant in the test list; existing callers unchanged.</done>
  <recovery>If an existing caller's output changes, revert the default and add the new behaviour behind a new option.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Detectors in planning-layout.cjs (independent of compat)</name>
  <files>plugins/aoforge/aoforge/bin/lib/planning-layout.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/legacy-names.cjs, plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs</files>
  <action>
RED: write test-list cases 7-12 in `planning-layout-detect.legacy.test.cjs` (and case 12 in legacy-names.legacy.test.cjs);
commit them failing.

GREEN:
- legacy-names.cjs: add `SHIM_RELEASE = '3.0.x'` with a comment ("the last release line that carries the one-release
  shims and migrations 0012-0014; every 3.1 legacy message names it as the conversion path"). Export it. Leave
  `SHIM_REMOVAL` alone (78-12 changes it once every consumer is gone).
- planning-layout.cjs: drop the compat imports of isLegacyPlanning/bothPlanningDirs/planningRoot/planningRel. Implement
  and export:
  - `isLegacyPlanning(root)`, `bothPlanningDirs(root)` (statSync with throwIfNoEntry:false; ENOTDIR is absence).
  - `findLegacyLayoutRoot(start, { home = userHomeDir() } = {})`: walk up; at each dir, if it is $HOME (compat
    `isUserHome`) return null; if it holds `NEW_DIR` as a directory return null; if `isLegacyPlanning(dir)` return dir;
    stop at the filesystem root. Read home per call (never cached).
  - `MIGRATION_GUIDE = 'docs/MIGRATING-TO-AOFORGE.md'` (the guide in the aoforge-claude repository; 78-12 adds the
    "Upgrading from 2.x" section the message points at).
  - `legacyLayoutMessage(root)`: one line, e.g. `<root> still uses the pre-rename planning directory <OLD>/, which
    AOForge no longer reads. Move it with AOForge <SHIM_RELEASE> (\`aof-tools upgrade --apply\`) or by hand:
    \`git mv <OLD> <NEW>\`, then rename a "<LEGACY.configKey>" key in <NEW>/config.json to "<NAMES.configKey>" (see
    <MIGRATION_GUIDE>, "Upgrading from 2.x").` Build every name from NAMES/LEGACY.
  - `legacyPlanningIssue(root)`: `both` -> warning text as today (legacy ignored; move what you need, then delete it);
    `legacy` -> `{ code: 'W066', layout: 'legacy', message: legacyLayoutMessage(root) minus its fix part, fix: <the
    fix part> }` — keep message and fix as two fields so validate/doctor can print both; no `--only`.
  - `legacyConfigKeyIssue(root)`: read `<root>/<NEW_DIR>/config.json` directly; legacy key present -> W067; fix depends
    on whether the new key exists (see truths).
  - `hasLegacyBlockMarker(text)`: regex for `<!--\s*<LEGACY.blockTag>:START\b` (case-sensitive, matches the managed-block
    START syntax), built with `escapeRegExp` from text-escape.cjs.
  - `legacyBlockMessage(fileLabel)` -> `{ message, fix }`: message `legacy-claude-md-block: <fileLabel> holds a
    managed block under the pre-rename <LEGACY.blockTag> markers, which AOForge no longer updates`; fix `Rename
    <!-- <LEGACY.blockTag>:START and <!-- <LEGACY.blockTag>:END to <NAMES.blockTag>; the next upgrade refreshes the
    block (or run AOForge <SHIM_RELEASE>'s upgrade once)`.
  - `legacyClaudeMdIssue(root)`: W069 `{ code, ...legacyBlockMessage('CLAUDE.md') }` when `<root>/CLAUDE.md` exists and
    `hasLegacyBlockMarker` is true.
  - Keep `advisoryLine`, `CODE`, `CONFIG_CODE`; add `CLAUDE_MD_CODE = 'W069'`. Remove `MIGRATION_ID` and
    `CONFIG_MIGRATION_ID` exports only if nothing else imports them after Task 3 (doctor 27 does today; Task 3 drops
    that use) — grep first.
  - Rewrite the header comment: what each detector reports in 3.1 and that the module spells no legacy name.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs` passes after GREEN and failed at the RED commit; `rg -n "require\('./compat.cjs'\)" plugins/aoforge/aoforge/bin/lib/planning-layout.cjs` shows only the userHomeDir/isUserHome import.</verify>
  <done>Cases 7-12 green; planning-layout.cjs no longer asks compat which directory is the planning directory.</done>
  <recovery>If importing compat's isUserHome creates a require cycle, inline a call to `fs.realpathSync` comparison mirroring compat.homeMatcher.isHome and note it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Reporters — validate health, doctor 27/22, doctor project resolution, help text</name>
  <files>plugins/aoforge/aoforge/bin/lib/validate.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/22-validate-health.cjs, plugins/aoforge/aoforge/bin/lib/doctor-cli.cjs, plugins/aoforge/aoforge/bin/lib/help.cjs, plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs</files>
  <action>
RED: test-list cases 1-6 (CLI level) — put 1-4 in planning-layout.legacy.test.cjs (rewrite its cases 5-6 and add the
new ones; keep cases 3-4 as they are with a comment naming 78-07/78-11 as their owners) and 5-6 in
27-legacy-planning-layout.legacy.test.cjs. Commit failing.

GREEN:
- validate.cjs: before Check 1, `const legacy = planningLayout.legacyPlanningIssue(cwd); if (legacy && legacy.layout
  === 'legacy')` -> addIssue('error', 'W066', message, fix) and return the broken report (same shape as the E001 return,
  `repairable_count: 0`). Checks 21/22 keep the both-layout W066 warning and W067; add Check 23 W069 via
  `legacyClaudeMdIssue(cwd)` (warning, not repairable). Rewrite the comments: no "one release", no 0012/0013.
- doctor-checks/27: report W066 (both), W067, W069 from planning-layout; `fix_command` only where a single command is
  the fix (none now: every fix is manual or the 3.0.x path) — so drop `fix_command`, keep each finding's `fix` text in
  the line. Update the header comment with the KEEP decision and its reason (see Decisions above).
- doctor-checks/22: add W069 to its DEFERRED list beside W066/W067.
- doctor-cli.cjs `resolveProject`: after `findProjectRoot` (with or without `--path`), if the found root
  `isLegacyPlanning`, or nothing was found and `findLegacyLayoutRoot(cwd)` returns a root, return
  `{ projectRoot: null, note: legacyLayoutMessage(root) }`. This works before and after 78-11 (compat may or may not
  still find the legacy root).
- help.cjs `validate` details: describe W066 (legacy -> broken, both -> warning), W067 and W069 with the 3.1 fixes.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/validate.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs plugins/aoforge/aoforge/bin/lib/help.test.cjs` passes; `rg -n -e "--only 0012" -e "--only 0013" -e "for one release" plugins/aoforge/aoforge/bin/lib/planning-layout.cjs plugins/aoforge/aoforge/bin/lib/validate.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.cjs plugins/aoforge/aoforge/bin/lib/help.cjs` finds nothing.</verify>
  <done>Cases 1-6 green; every reporter names the 3.0.x / manual fix; W069 shows once (check 27).</done>
  <recovery>If help.test.cjs pins the old details text, update the pin in the same commit. If doctor.e2e expects project checks in a legacy fixture, switch that fixture to layout `aoforge` unless the test is about the legacy layout.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.cjs files&gt;)</test>
</validation_gates>

<verification>
- `node --test plugins/aoforge/aoforge/bin/lib/planning-layout-detect.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/27-legacy-planning-layout.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/validate.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
- The RED commit for Tasks 2 and 3 precedes the GREEN commit (`git log --oneline`).
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate health --raw` in this repository still reports no W066/W067/W069.
</verification>

<success_criteria>
- Every project-level pre-rename case (only `.planning/`, both, stale key, old markers) has one detector and one text.
- No reporter names a migration that 78-07/78-08 retire.
- The KEEP decisions for check 27 and W066/W067 and the new W069 are recorded with reasons in the SUMMARY.
</success_criteria>

<output>
After completion, write `78-01-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-01 --from <draft>`
(after `tokens stamp 78-01 --draft <draft>`). Include the Decisions table (check 27, W066/W067, W069 and the W069 code
choice versus main's W068) and the list of other suites whose expectations changed.
</output>
