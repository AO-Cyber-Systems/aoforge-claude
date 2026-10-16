---
objective: 78-remove-the-rename-shims
trd: "06"
type: standard
wave: 2
depends_on: ["78-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/coexistence.cjs
  - plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs
  - plugins/aoforge/hooks/coexistence-guard.js
  - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
  - plugins/aoforge/hooks/sync-runtime.js
  - plugins/aoforge/hooks/sync-runtime.legacy.test.js
  - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
  - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
  - plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs
autonomous: true
requirements: [SC-3, SC-4]
must_haves:
  truths:
    - "coexistence.cjs is the one module for global pre-rename detection: the old plugin enabled (existing), `legacyEnvVariables(env)`, `legacyRuntimeHome(home)` / `legacyRuntimeState(home)` ({present, migrated}) and `interimUserFiles(home)`; none of them makes an old name work"
    - "The coexistence-guard SessionStart hook queues at most ONE global notice per session listing each finding with its fix: old plugin enabled, `DEVFLOW_*` variables set (each with its `AOFORGE_*` name), the pre-rename runtime home present and never migrated, known files left in `~/.aoforge/`; nothing found -> no notice; stdout stays empty, exit 0"
    - "sync-runtime no longer runs the pre-rename runtime-state migration; runtime-state-migrate.cjs and its test are deleted; the global upgrade (df-* move, managed block) still runs after a mirror"
    - "Doctor check 15 is report-only: no fix export; its finding names the session-start move (global upgrade) or the manual move"
    - "Doctor check 16 is report-only: no fix export; findings plugin-enabled, runtime-not-migrated, runtime-leftover and legacy-env each name the 3.0.x path or the manual step; none says 'for one release' or 'honors'"
    - "Doctor check 17 keeps its fix (moves 3.0.0's files out of `~/.aoforge/`), and its finding says AOForge no longer reads them there"
    - "doctor.cjs builds ctx.paths.legacyMirrorDir from coexistence.legacyRuntimeHome, not compat"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/coexistence.cjs
      provides: "global pre-rename and 3.0.0-leftover detectors plus the notice text"
      exports: [detectLegacyPlugin, coexistenceMessage, legacyEnvVariables, legacyRuntimeHome, legacyRuntimeState, interimUserFiles, legacyNotices, TO_RUNTIME, TO_WATCH, LEGACY_STATE_MARKER]
  key_links:
    - from: plugins/aoforge/hooks/coexistence-guard.js
      to: coexistence.legacyNotices
      via: "one notice per session, key prefix coexistence:"
      pattern: "legacyNotices"
    - from: plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs
      to: coexistence.TO_RUNTIME / TO_WATCH
      via: "one list of 3.0.0's dot-dir files for the notice and the doctor"
      pattern: "TO_RUNTIME"
---

# TRD 78-06: Global leftovers — one SessionStart notice and read-only doctor checks 15/16; check 17 keeps its fix

<objective>
Make everything the rename left in the user's home visible once, without reading it: the old plugin still enabled,
`DEVFLOW_*` variables that no longer work, a pre-rename runtime home that 3.1 no longer migrates, and files 3.0.0 left
in `~/.aoforge/`. Retire the automatic pre-rename runtime-state migration, make doctor checks 15 and 16 report-only,
and keep check 17's move.

Purpose: SC-3 (each legacy doctor check decided with its reason) and SC-4 (a `DEVFLOW_*` environment gets one clear
message naming the fix). The env alias itself is removed in 78-10 and compat's legacy exports in 78-11.
Output: coexistence.cjs detectors, a richer coexistence-guard notice, rewritten checks 15/16/17, no runtime-state
migration.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/72-install-and-naming-cleanup/72-15-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/coexistence.cjs
@plugins/aoforge/hooks/coexistence-guard.js
@plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-06): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`.
- `SHIM_RELEASE` ('3.0.x') comes from legacy-names.cjs (78-01).

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Doctor check 15 `legacy-df-install`: KEEP, report-only (fix removed).** Reason: pre-plugin `df-*` skills and agents
  shadow AOForge commands for any 2.x user, and detection is one readdir per directory. The move itself remains in the
  sync-runtime global upgrade (objective 36, not a rename shim), so the doctor fix only duplicated it.
- **Doctor check 16 `legacy-plugin-runtime`: KEEP, report-only (fix removed).** Reason: the old plugin enabled beside
  AOForge runs its gates twice, the pre-rename runtime home holds calibration and the GitHub outbox that 3.1 no longer
  carries over, and `DEVFLOW_*` variables now silently stop working: each needs one report. The conversions are
  3.0.x's (a 3.0.x session, or `doctor --global --fix` under 3.0.x) or the documented manual steps.
- **Doctor check 17 `user-dot-dir`: KEEP WITH its fix.** Reason: `~/.aoforge/` holds files AOForge 3.0.0 itself wrote
  under the AOForge name; no 3.0.x release moves them (the move is 3.1's own objective-73 change), so there is no 3.0.x
  path to point at, and with the interim readers removed (78-05, 78-11) the move is the only way defaults.json, the
  Brave key, the watch allowlist and the daemon's files keep effect. The fix is a reversible move that never deletes or
  overwrites.
- **sync-runtime's pre-rename runtime-state migration (TRD 72-07): REMOVE.** Reason: it is an automatic conversion of
  pre-rename state, which 3.1 leaves to 3.0.x; the notice and check 16 name the path.
- **coexistence-guard + coexistence.cjs: KEEP (report-only), extended.** Reason: they only report.
</context>

<embedded_context>

<codebase_examples>
coexistence-guard.js `run()` today (one notice per session, key prefix `coexistence:`):
```js
const result = (detect || coexistence.detectLegacyPlugin)({ userHome: home });
const message = coexistence.coexistenceMessage(result);
if (!message) return { status: 'not-enabled' };
const file = notices.globalNoticesPath(home);
const key = sessionKey(payload);
const existing = notices.readNotices(file);
if (existing.some((n) => n.key === key)) return { status: 'already-told' };
if (existing.some((n) => n.consumed !== true && typeof n.key === 'string' && n.key.startsWith(KEY_PREFIX))) return { status: 'pending' };
const notice = notices.appendNotice(file, { source: SOURCE, level: result.pointer ? 'info' : 'action', key, message }, { now });
```
notices: `message` is one line; `detail` is optional text (at most 40 lines).
Check 16 today has `legacyEnvVariables(env)`, `discover(ctx)` (plugin, legacyHome, marker, pending via
runtime-state-migrate.migrationPending) and a `fix()` that migrates or moves. Check 17 holds the lists:
```js
const TO_WATCH = [PID_FILE, `${NAMES.watch}.log`, 'launchd-stdout.log', 'launchd-stderr.log', 'systemd-stdout.log', 'systemd-stderr.log'];
const TO_RUNTIME = ['defaults.json', 'brave_api_key', `${NAMES.watch}-allow.json`];
```
sync-runtime.js `migrateLegacyRuntimeOnce()` (lines ~100-125) is called after a good mirror and on the fast path.
</codebase_examples>

<anti_patterns>
- Do not read any value out of the pre-rename runtime home, `~/.aoforge/` or a `DEVFLOW_*` variable to USE it; only
  detect presence (and the migration marker's presence).
- Do not edit the `aliasLegacyEnv` lines in coexistence-guard.js and sync-runtime.js (78-10 sweeps them). Note: while
  78-10 has not landed, aliasLegacyEnv still copies `DEVFLOW_X` to `AOFORGE_X` in the hook's own process; detection
  must look at the `LEGACY.envPrefix` keys, which stay set either way.
- Do not remove global-upgrade's df-* move or its managed-block maintenance from sync-runtime.
- Do not edit hooks/sync-runtime.test.js (78-08 owns it this wave: its fake-plugin-root closure lists the libs the
  global upgrade loads). Run it, do not change it.
- Do not touch compat.cjs (78-11 deletes `legacyRuntimeHome` there after this TRD stops using it).
- Never edit Claude Code settings or run `claude plugin ...`.
</anti_patterns>

<error_recovery>
- doctor.e2e.test.cjs / doctor.test.cjs may exercise check 16's fix: switch those cases to "report-only, nothing moved"
  and list them in the SUMMARY.
- If `hook-inventory.test.cjs` or `hooks.json` tests pin the coexistence-guard description, update the pin.
- If deleting runtime-state-migrate breaks an import elsewhere (`rg -n "runtime-state-migrate"`), that importer is in
  scope: remove the use.
</error_recovery>

</embedded_context>

<gotchas>
- The migration marker name `.legacy-state-migrated.json` moves to coexistence.cjs as `LEGACY_STATE_MARKER`
  (detector constant); its text has no legacy name in it.
- `legacy-runtime-fixtures.cjs` serves runtime-state-migrate's test and check 16's; trim it to what check 16 and the
  notice tests still use, or delete it if nothing does.
- On the user's own machine `~/.claude/devflow/` is present AND migrated: the notice must stay quiet for that case
  (only check 16 reports `runtime-leftover`).
- Check 15's fix is removed; `doctor --global --fix` must not report it as fixable.
</gotchas>

## Test list

Outermost first; fake homes from `legacy-doctor-fixtures.cjs` / `legacy-plugin-fixtures.cjs` (hand-built).
1. coexistence-guard hook (spawned, scratch HOME, payload with a session id): env with `DEVFLOW_SKIP_EDIT_GATE=1` and
   nothing else -> one global notice whose text names `DEVFLOW_SKIP_EDIT_GATE`, `AOFORGE_SKIP_EDIT_GATE` and says it is
   no longer read; stdout empty; exit 0. A second SessionStart with the same session id queues nothing.
2. Same hook: the pre-rename runtime home present and no migration marker -> the notice names it and the 3.0.x path;
   present WITH the marker -> no notice for it.
3. Same hook: `~/.aoforge/defaults.json` present -> the notice names `aof-tools doctor --global --fix`.
4. Same hook: old plugin enabled (existing cases) still produce the plugin line; nothing at all -> no notice.
5. Several findings at once -> exactly one notice; `message` one line, `detail` one line per finding.
6. sync-runtime (fake plugin root, scratch HOME with a pre-rename runtime home and no marker): after a mirror the new
   home has no copied state and no marker; the global upgrade still ran.
7. Doctor check 15: `run` warns with the move text; the module exports no `fix`.
8. Doctor check 16: each of the four findings with its 3.1 text; no `fix` export; `doctor --global --fix` leaves the
   pre-rename runtime home in place.
9. Doctor check 17: unchanged fix behaviour (existing cases), finding text says "no longer read".
10. coexistence unit: `legacyEnvVariables` ignores the bare prefix and undefined values; `legacyRuntimeState`
    {present:false} / {present:true, migrated:false} / {present:true, migrated:true}; `interimUserFiles` lists only
    TO_RUNTIME/TO_WATCH names that are files.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixtures, RED tests and the coexistence detectors</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-doctor-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs, plugins/aoforge/hooks/coexistence-guard.legacy.test.js, plugins/aoforge/aoforge/bin/lib/coexistence.cjs</files>
  <action>
Fixtures: extend `leftoverHome(...)` (hand-built) with `interimFiles: ['defaults.json', ...]` and `migrated: bool`
options if missing. RED: cases 1-5 and 10; commit failing.
GREEN (coexistence.cjs): move `legacyEnvVariables` here from check 16; add `legacyRuntimeHome(home)`
(`<home>/.claude/<LEGACY.runtimeDir>`), `LEGACY_STATE_MARKER`, `legacyRuntimeState(home)`, `TO_WATCH`/`TO_RUNTIME`
(moved from check 17, built from NAMES), `interimUserFiles(home)` and `legacyNotices({ env, userHome })` ->
`[{ kind, level, text }]` with one sentence per finding naming its fix (env: "no longer read; rename <X> to <Y> where you
set it"; runtime home: "AOForge no longer migrates it: run AOForge <SHIM_RELEASE> once, or copy it by hand — see
docs/MIGRATING-TO-AOFORGE.md"; dot dir: "AOForge no longer reads them there: \`aof-tools doctor --global --fix\` moves
them"; plugin: `coexistenceMessage` as today).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs` passes case 10 after GREEN; cases 1-5 still fail (the hook is Task 2).</verify>
  <done>RED commit, then GREEN commit for the detectors.</done>
  <recovery>If moving the lists out of check 17 breaks its tests before Task 3, have check 17 import them now (one-line change) and keep its behaviour.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — one SessionStart notice; retire the runtime-state migration</name>
  <files>plugins/aoforge/hooks/coexistence-guard.js, plugins/aoforge/hooks/sync-runtime.js, plugins/aoforge/hooks/sync-runtime.legacy.test.js, plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs, plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs</files>
  <action>
- coexistence-guard.js `run()`: collect `legacyNotices({ env, userHome: home })` (plugin detection stays injectable via
  `detect`); none -> `{ status: 'nothing' }` (keep 'not-enabled' as an alias if tests rely on it); one -> `message` is
  its text; several -> `message` = `AOForge found N leftovers from before 3.1 that it no longer reads; see below`,
  `detail` = one line each. Level `info` only when the sole finding is the pointer plugin, else `action`. Same
  per-session key and pending rules. Rewrite the header comment.
- sync-runtime.js: delete `migrateLegacyRuntimeOnce` and both call sites and the header lines about it; keep everything
  else. `git rm` runtime-state-migrate.cjs and its legacy test; rewrite sync-runtime.legacy.test.js to case 6 (and
  delete its migration cases); trim or delete legacy-runtime-fixtures.cjs per the gotchas.
  </action>
  <verify>`node --test plugins/aoforge/hooks/coexistence-guard.legacy.test.js plugins/aoforge/hooks/sync-runtime.legacy.test.js plugins/aoforge/hooks/sync-runtime.test.js plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs plugins/aoforge/hooks/route-results.test.js` passes; `rg -n "runtime-state-migrate|migrateLegacyRuntime" plugins/aoforge --glob '!*.md'` finds nothing but check 16 (fixed in Task 3).</verify>
  <done>Cases 1-6 green.</done>
  <recovery>If route-results renders `detail` poorly for several lines, keep `message` self-sufficient (list the kinds) so the one line alone names what to do.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — doctor checks 15 and 16 report-only, 17 reworded, doctor ctx path</name>
  <files>plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs, plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs, plugins/aoforge/aoforge/bin/lib/doctor.cjs</files>
  <action>
RED first: cases 7-9 (commit failing). GREEN:
- Check 15: delete `fix`; `fixable: false`; finding text "...load beside the plugin: <list>; start a Claude Code
  session (the runtime sync moves them into ~/.claude/aoforge/backups/legacy-<ts>/) or move them yourself". Header:
  the KEEP decision and reason.
- Check 16: delete `fix`, FIX_KINDS, the runtime-state-migrate and moveLegacy imports; `discover` uses
  `coexistence.legacyRuntimeState(ctx.userHome)` and `coexistence.legacyEnvVariables(ctx.env)`; each finding's `fix`
  text names the 3.0.x path or the manual step (runtime-leftover: a manual `mv` into
  `~/.claude/aoforge/backups/legacy-<old runtime dir>-runtime-<date>/`; legacy-env: "no longer read since 3.1.0: rename
  each where it is set"). Keep plugin-enabled's `fix_command` (`claude plugin disable ...`). Header: decision + reason.
- Check 17: import TO_WATCH/TO_RUNTIME from coexistence; reword findings ("AOForge no longer reads them there"); keep
  `fix` exactly as is. Header: the KEEP-WITH-FIX decision and reason.
- doctor.cjs: `legacyMirrorDir: coexistence.legacyRuntimeHome(userHome)`; drop the compat import of legacyRuntimeHome;
  update the JSDoc.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/15-legacy-df-install.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/16-legacy-plugin-runtime.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.test.cjs plugins/aoforge/aoforge/bin/lib/doctor.e2e.test.cjs` passes; `rg -n "legacyRuntimeHome" plugins/aoforge/aoforge/bin/lib/doctor.cjs` shows the coexistence import only.</verify>
  <done>Cases 7-9 green; checks 15 and 16 export no fix.</done>
  <recovery>If the doctor contract test (doctor-checks/README or doctor.test) requires `fixable` checks to export `fix`, set `fixable: false` everywhere in 15/16.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- Cases 1-10 green; RED before GREEN per task.
- `git ls-files plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs` prints nothing.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs` passes (skip if absent).
</verification>

<success_criteria>
- Every global leftover is reported once per session and by the doctor, with its fix; no pre-rename state is converted
  automatically (the objective-36 df-* move in the global upgrade predates the rename and stays). The decisions above
  are in the SUMMARY.
</success_criteria>

<output>
After completion, write `78-06-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-06 --from <draft>`
(after `tokens stamp 78-06 --draft <draft>`). Include the Decisions table (checks 15, 16, 17, runtime-state migration,
coexistence) and note for the user that their own `~/.claude/devflow/` leftover now needs the manual move or a 3.0.x
`doctor --global --fix` before they install 3.1.
</output>
