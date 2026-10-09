---
objective: 69-drafts-health-and-doctor
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/doctor-git.cjs
  - plugins/devflow/devflow/bin/lib/doctor-git.test.cjs
  - plugins/devflow/devflow/bin/lib/skill-marker-health.cjs
  - plugins/devflow/devflow/bin/lib/skill-marker-health.test.cjs
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs
autonomous: true
requirements: [TOOL-09]
must_haves:
  truths:
    - "`df-tools validate health` reports E006 `skill-marker-tracked` (an error) when `.planning/.skill-active` is in the git index, and W064 `skill-marker-stale` (a warning) when an untracked marker is expired, unparseable or empty, or has no expires_at and is older than the 8h TTL"
    - "A live, untracked marker produces neither code"
    - "`validate health --repair` on a tracked stale marker leaves exactly one change: `git status --porcelain` is `D  .planning/.skill-active`, the working file is gone, HEAD has not moved and every other file is byte-identical"
    - "`--repair` on a tracked live marker that is ignored untracks it and keeps the working file byte-identical; on a tracked live marker that is NOT ignored it changes nothing and the E006 fix names `.gitignore`"
    - "`--repair` refuses any index change while an unrelated change is staged (DOC-06 guard), and then removes nothing"
    - "A failing marker check is reported (W064 `skill-marker-check-failed`), never silent"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/skill-marker-health.cjs
      provides: "shared marker inspection and repair for validate health (Check 19) and doctor check 23"
      exports: ["MARKER_REL", "CODES", "classifySkillActive", "inspect", "planRepair", "findings", "repair"]
    - path: plugins/devflow/devflow/bin/lib/doctor-git.cjs
      provides: "checkIgnored(root, paths, opts) -> Set (repository ignore rules; global excludes off)"
      exports: ["checkIgnored"]
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs
      provides: "makeMarkerProject({git, marker, tracked, ignored, stagedOther, now})"
  key_links:
    - from: "validate.cjs cmdValidateHealth Check 19"
      to: "skill-marker-health.cjs inspect / findings / repair"
      via: "addIssue per finding; repairs.push('repairSkillMarker'); repair case calls repair()"
      pattern: "repairSkillMarker"
    - from: "skill-marker-health.cjs planRepair"
      to: "doctor-git.cjs indexChangeGuard / rmCached / checkIgnored / lsFiles"
      via: "guarded index change; git rm --cached of the one path"
      pattern: "indexChangeGuard\\("
---

# TRD 69-02: Health catches a tracked or stale `.skill-active` marker, and `--repair` fixes only it (TOOL-09, validate side)

<objective>
`hooks/gate-edits.js` lets any edit through while `.planning/.skill-active` says a skill is running. It skips a marker
whose `expires_at` has passed, but a marker with no `expires_at` never expires there, an unparseable one counts as live
(fail open), and a marker committed to git holds the gate open in every clone. The 2026-07-31 fleet audit found two
repos with committed markers (66 and 77 days old) and 11 of 30 with leaked ones. `validate health` checks none of this;
doctor check 23 catches stale markers but not tracked ones.

Build one shared module that inspects the marker (present, tracked, ignored, stale, live) and repairs it safely, and
wire it into `validate health` as Check 19: E006 for a tracked marker (an error: the todo's "must ERROR"), W064 for a
stale untracked one. `--repair` untracks (`git rm --cached`) and/or removes the one file, behind the same DOC-06 guard
the doctor uses, and never touches another file. 69-04 moves doctor check 23 onto the same module.

Purpose: success criterion 2 (validate half). Output: `lib/skill-marker-health.cjs`, `doctor-git.checkIgnored`, Check 19,
tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
@.planning/todos/pending/2026-07-31-harden-df-tools-health-for-tracked-and-stale-skill-active-markers.md

Read with offset/limit:
- `plugins/devflow/devflow/bin/lib/doctor-git.cjs` (150 lines; all of it is fine): `git`, `lsFiles`, `indexChangeGuard`,
  `rmCached`, `GIT_REDIRECT_VARS`.
- `plugins/devflow/devflow/bin/lib/migrations/0008-runtime-state-untrack.cjs` 110-126: the private check-ignore helper
  (`-c core.excludesFile=<os.devNull> check-ignore --no-index --stdin -z`; exit 1 = nothing ignored). Mirror it in
  doctor-git; do not refactor 0008.
- `plugins/devflow/devflow/bin/lib/validate.cjs`: `cmdValidateHealth` 186-206 (addIssue, repairs), Check 18 762-786
  (the pattern to copy), repairs 788-845, status/output 846-866.
- `plugins/devflow/devflow/bin/lib/skill-active.cjs` 60-140 (`DEFAULT_TTL_MS` 8h, `isExpired`, `markerPath`).
- `plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs` 1-80: how a validate health test runs in-process
  (output capture, `homeDir`, `mainVersionFn` stub so Check 11 does no git fetch).
- `plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs` 255-270 (`makeDoctorProject({git})`) and
  `__fixtures__/upgrade-fixtures.cjs` `gitEnv(home)`.

## Binding rules
- Strict TDD on tasks 2 and 3; one test at a time.
- Hand-built fixtures: literal marker JSON with ISO times relative to an injected `now`; temp git repos with a local
  identity and no signing. Never this repository's `.planning/.skill-active`: during execution it is the live marker
  that holds your own edit gate open.
- Parallel wave: 69-01 edits planning-verbs*.cjs, 69-03 adds requirements-agreement*.cjs. Do not edit
  `doctor-checks/23-skill-markers.cjs` or `22-validate-health.cjs` (69-04 owns them). One plain command per Bash call;
  commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Only the root `.planning/.skill-active` of the project is in scope (not nested `**/.planning/` copies), and
  `.edit-override` stays doctor check 23's business.
- No change to `hooks/gate-edits.js`: this objective hardens health and repair, not the gate.

## Decision table (planRepair)

| marker state | E/W | repairable | --repair does |
|---|---|---|---|
| untracked, live | none | - | nothing |
| untracked, stale | W064 | yes, no guard | unlink the file |
| tracked, stale | E006 | yes, guarded | `git rm --cached` + unlink |
| tracked, missing from the working tree | E006 | yes, guarded | `git rm --cached` |
| tracked, live, ignored | E006 | yes, guarded | `git rm --cached`; keep the file |
| tracked, live, not ignored | E006 | no | nothing (committing the removal would re-track it) |
| any tracked, unrelated change staged or `.gitignore` dirty | E006 | no | nothing (indexChangeGuard reason) |

Stale = `classifySkillActive` (copied verbatim from doctor check 23): expired `expires_at`; unparseable (empty or
truncated JSON) or not a JSON object; no usable `expires_at` and `started_at` (else file mtime) older than
`skillActive.DEFAULT_TTL_MS` (8h). Do not use pid liveness: the recorded pid is the df-tools subprocess, dead within
milliseconds (todo, "Do NOT use process.kill").
</context>

## Test list

`validate-skill-marker.test.cjs` (task 3; outermost first):
1. Spawned: a git fixture with a tracked expired marker. `df-tools --cwd <root> validate health` -> JSON has E006 with
   `repairable: true`, status `broken`. `validate health --repair` -> `repairs_performed` has `untrackSkillMarker` and
   `removeStaleSkillMarker`, both `success: true`, `path: '.skill-active'`; `git status --porcelain=v1` is exactly
   `D  .planning/.skill-active`; `git rev-parse HEAD` unchanged; a snapshot of every other file is identical.
2. In-process (`cmdValidateHealth(root, { homeDir, mainVersionFn, nowMs })`): untracked expired marker -> W064
   repairable; `--repair` removes only the marker.
3. Untracked live marker -> neither E006 nor W064.
4. Garbage (`{"skill": "bu`) and empty markers -> W064 whose message contains `unparseable`.
5. No `expires_at`, started 9h ago -> W064 `no expires_at`; started 1h ago -> none.
6. Tracked live ignored -> E006 repairable; `--repair` untracks it and the working file is byte-identical.
7. Tracked live not ignored -> E006 `repairable: false`, fix mentions `.gitignore`; `--repair` leaves index and file as
   they were.
8. Tracked expired with an unrelated staged file -> E006 `repairable: false`, fix names `staged changes present`;
   `--repair` changes nothing.
9. Not a git repo, expired marker -> W064 only; `--repair` removes it.
10. An injected inspector that throws (`options.skillMarkerHealth = { inspect() { throw new Error('boom') } }`) -> W064
    `skill-marker-check-failed: boom`, not repairable.

`skill-marker-health.test.cjs` (task 2):
11. `inspect` on each state in the decision table returns the right `{present, tracked, ignored, stale, live, git}`.
12. `classifySkillActive` agrees with doctor check 23's cases: expired, live, garbage, empty, non-object JSON (`[]`),
    no expires_at old / fresh (by started_at, then by mtime when started_at is missing).
13. `planRepair` returns the actions and refusals of the decision table, including `exclude` (a staged path listed in
    `exclude` does not block the guard).
14. `repair` re-inspects first: a marker that became live between `inspect` and `repair` is not unlinked.
15. `repair` never unlinks a tracked marker when the guard refuses (no ` D` in `git status`).
16. `findings`: E006 message starts `skill-marker-tracked:` and includes the stale reason when stale; W064 starts
    `skill-marker-stale:`; the E006 fix contains `df-tools.cjs commit "chore: untrack .planning/.skill-active" --files .planning/.skill-active`.

`doctor-git.test.cjs` (task 2):
17. `checkIgnored(root, ['.planning/.skill-active'])` -> contains the path when the repo `.gitignore` ignores it; empty
    when only a global excludes file (configured in the fake HOME's gitconfig) ignores it; empty (no throw) when nothing
    matches.

<embedded_context>

<codebase_examples>
The classification to copy (doctor-checks/23-skill-markers.cjs `classifySkillActive`, returns `null | reason`):

```js
let marker;
try { marker = JSON.parse(fs.readFileSync(abs, 'utf-8')); }
catch { return 'unparseable marker (the edit gate treats it as live forever)'; }
if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return 'unparseable marker (not a JSON object)';
if (marker.expires_at && Number.isFinite(Date.parse(marker.expires_at))) {
  return skillActive.isExpired(marker, nowMs) ? `expired at ${marker.expires_at}` : null;
}
// no usable expires_at: age by started_at, else mtime, against DEFAULT_TTL_MS
```

The health-check pattern to copy (validate.cjs Check 18): a `try` around the check that renders each finding with
`addIssue(severity, code, message, fix, repairable)` and a `catch` that reports `<code> <name>-check-failed: <msg>`.

The guarded index change the doctor already uses (doctor-checks/20-legacy-runtime-state.cjs):

```js
const guard = dg.indexChangeGuard(ctx.projectRoot, { env: ctx.env, exclude: ctx.changedThisRun });
if (!guard.ok) return { applied: false, refused: guard.reason };
dg.rmCached(root, found.markers.tracked, { env: ctx.env });
```
</codebase_examples>

<anti_patterns>
- Do not unlink a tracked marker without untracking it in the same repair: that leaves a working-tree deletion of a
  tracked file (a dirty tree) and the commit still carries the marker.
- Do not edit `.gitignore` in the repair: TOOL-09 says the repair touches nothing but the marker. Report the missing
  ignore rule in the fix text instead.
- Do not decide "ignored" by string-matching `.gitignore` lines: use `git check-ignore --no-index` with the user's
  global excludes switched off (the 42-14 D5 lesson in migration 0008's header).
- Do not count an unparseable marker as live. Stale and removable is the fail-closed answer.
- Do not report both E006 and W064 for one marker: E006 carries the stale reason.
</anti_patterns>

<error_recovery>
- `git check-ignore` exit 128 in a fresh repo: the path argument is outside the work tree; pass the project-relative
  posix path with `cwd: root`.
- Test 1's snapshot differs in `.planning/config.json` or STATE.md: another health repair fired (e.g. createStateJson).
  Make the fixture healthy for every other check (stamped project from makeDoctorProject) instead of loosening the
  assertion.
- A validate test hangs: Check 11 is fetching; pass `mainVersionFn: () => null` (see validate-model-ids.test.cjs).
</error_recovery>

</embedded_context>

<gotchas>
- `cmdValidateHealth` calls `output()`, which exits; in-process tests capture `process.exit`/stdout the way
  validate-model-ids.test.cjs does. Add `options.nowMs` (default `Date.now()`) and `options.skillMarkerHealth`
  (default the real module) for tests; the dispatcher keeps passing only `{ repair }`.
- `addIssue` is called before repairs run, so the report still lists E006/W064 alongside `repairs_performed`; that is
  how every other repairable issue behaves.
- Push `'repairSkillMarker'` at most once. Repair entries use `path: '.skill-active'` (relative to `.planning/`):
  doctor check 22 turns `path` into `.planning/<path>` for its `changed` list.
- `dg.lsFiles` lists the index; `git add -f` is needed to track an ignored marker in fixtures.
- Pass `env` through to every doctor-git call (`{ env }`) so a fixture's `gitEnv(home)` (no global config, no signing)
  is honoured; validate passes `process.env`.
</gotchas>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── skill-marker-health.cjs                    ← CREATE (inspect, planRepair, findings, repair)
├── skill-marker-health.test.cjs               ← CREATE (tests 11-16)
├── doctor-git.cjs                             ← MODIFY (checkIgnored)
├── doctor-git.test.cjs                        ← MODIFY (test 17)
├── validate.cjs                               ← MODIFY (Check 19 + repair case)
├── validate-skill-marker.test.cjs             ← CREATE (tests 1-10)
└── __fixtures__/skill-marker-fixtures.cjs     ← CREATE (makeMarkerProject)
</file_tree>

<tasks>

<task type="auto">
  <name>Task 1: Marker-project fixture builder</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs</files>
  <action>
Hand-built module on top of `makeDoctorProject({ git })` and `gitEnv(home)`:
- `MARKERS(now)` -> literal bodies: `live` `{skill:'build', started_at: now-1h, pid: 4242, expires_at: now+7h}`;
  `expired` `{skill:'build', started_at: now-9h, pid: 4242, expires_at: now-1h}`; `garbage` `'{"skill": "bu'`;
  `empty` `''`; `legacyOld` `{skill:'build', started_at: now-9h, pid: 4242}`; `legacyFresh` (started now-1h, no expiry).
  JSON bodies are `JSON.stringify(v, null, 2) + '\n'`.
- `makeMarkerProject({ git = true, marker = null, tracked = false, ignored = false, stagedOther = false, now = new Date('2026-10-08T12:00:00.000Z') })`
  -> writes the marker (when given), and in a git project: `ignored` appends `.planning/.skill-active` to `.gitignore`
  and commits it; `tracked` runs `git add -f .planning/.skill-active` and commits; `stagedOther` writes `notes.txt` and
  `git add notes.txt` (never committed). Git runs with `gitEnv(home)`, `-c commit.gpgsign=false`.
  Returns `{ root, home, env, now, nowMs, markerPath, git(args) -> {status, stdout}, porcelain() -> string,
  tracked() -> string[], snapshot() -> Map(rel -> sha256) of every file outside .git, cleanup() }`.
Commit `test(69-02): marker project fixture`.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs'); const p=f.makeMarkerProject({marker:'expired', tracked:true}); console.log(JSON.stringify(p.tracked()), p.porcelain()==='' ); p.cleanup()"` prints `[".planning/.skill-active"] true`.</verify>
  <done>Every row of the decision table can be built in one call.</done>
  <recovery>If the commit prompts for signing or identity, the env is not `gitEnv(home)`; pass it to every git spawn.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: skill-marker-health.cjs and doctor-git.checkIgnored (tests 11-17)</name>
  <files>plugins/devflow/devflow/bin/lib/skill-marker-health.cjs, plugins/devflow/devflow/bin/lib/skill-marker-health.test.cjs, plugins/devflow/devflow/bin/lib/doctor-git.cjs, plugins/devflow/devflow/bin/lib/doctor-git.test.cjs</files>
  <action>
RED: tests 11-17. Commit `test(69-02): skill marker inspection and repair`.

GREEN:
1. doctor-git.cjs `checkIgnored(root, paths, opts = {})`: `git -c core.excludesFile=<os.devNull> check-ignore --no-index --stdin -z`
   with the NUL-joined paths on stdin (through the module's `git()` so redirect vars are stripped); exit 0 or 1 -> Set of
   the paths reported; anything else throws `git check-ignore failed: ...`. Callers check `isGitRepo` first. Export it.
2. skill-marker-health.cjs:
```
MARKER_REL = '.planning/.skill-active'; CODES = Object.freeze({ TRACKED: 'E006', STALE: 'W064' })
DF = 'node ~/.claude/devflow/bin/df-tools.cjs'
classifySkillActive(root, nowMs)          verbatim copy of check 23's (header: 69-04 deletes check 23's copy)
inspect(root, {nowMs = Date.now(), env = process.env}):
  git = dg.isGitRepo(root, {env}); present = isFile(root/MARKER_REL)
  tracked = git && dg.lsFiles(root, [MARKER_REL], {env}).includes(MARKER_REL)
  ignored = git ? dg.checkIgnored(root, [MARKER_REL], {env}).has(MARKER_REL) : null
  stale = present ? classifySkillActive(root, nowMs) : null
  return {rel: MARKER_REL, git, present, tracked, ignored, stale, live: present && !stale}
planRepair(root, state, {env, exclude}) -> {actions: [], fixable, refused}   the decision table
findings(state, plan) -> [] | [{severity, code, message, fix, repairable: plan.fixable}]
  E006 message: `skill-marker-tracked: .planning/.skill-active is tracked in git, so a committed marker holds the edit gate open in every clone and checkout` + (stale ? ` (it is also stale: ${stale})` : '')
  E006 fix (fixable): `Run \`${DF} validate health --repair\` or \`${DF} doctor --fix\` (git rm --cached; the file is removed when stale), then commit the removal: \`${DF} commit "chore: untrack .planning/.skill-active" --files .planning/.skill-active\`` + (ignored ? '' : '. Add .planning/.skill-active to .gitignore so it is not tracked again')
  E006 fix (refused): `${plan.refused}; then run \`${DF} validate health --repair\``
  W064 message: `skill-marker-stale: .planning/.skill-active (${stale}); the edit gate stays open until it is removed`
  W064 fix: `Run \`${DF} validate health --repair\` or \`${DF} doctor --fix\` (removes only this file)`
repair(root, {nowMs, env, exclude}):
  state = inspect(root, ...); plan = planRepair(root, state, ...)   # re-inspect: race-safe
  if !plan.actions.length -> {applied: false, untracked: [], removed: [], refused: plan.refused || null, notes}
  if 'untrack': dg.rmCached(root, [MARKER_REL], {env})
  if 'remove': if classifySkillActive(root, nowMs) still non-null -> unlink (ENOENT is fine)
  -> {applied: true, untracked, removed, refused: null, notes}
```
Header comment: the two failure modes from the todo, why pid liveness is wrong, the decision table, fail-closed
classification, and that validate Check 19 and doctor check 23 (69-04) both call this module.
Commit `feat(69-02): shared skill-active marker inspection and repair`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/skill-marker-health.test.cjs plugins/devflow/devflow/bin/lib/doctor-git.test.cjs` passes.</verify>
  <done>Tests 11-17 went RED then GREEN; the module never calls output()/error() and reads no `os.homedir()`.</done>
  <recovery>If test 17's global-excludes case still reports the path, the `-c core.excludesFile` must come before the subcommand (`git -c k=v check-ignore ...`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: validate health Check 19 and its repair (tests 1-10)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs</files>
  <action>
RED: tests 1-10. Commit `test(69-02): validate health flags tracked and stale skill markers`.

GREEN in validate.cjs, after Check 18 and before "Perform repairs":
```js
// ─── Check 19: .planning/.skill-active marker (objective 69, TOOL-09) ─────
// E006 a tracked marker (holds the edit gate open in every clone), W064 a stale untracked one. Repairable when
// skill-marker-health's plan says so; the repair untracks and/or removes that one file behind the DOC-06 index
// guard. Doctor check 23 owns both codes; check 22 defers them. A check that cannot run is never silent.
try {
  const smh = options.skillMarkerHealth || require('./skill-marker-health.cjs');
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const state = smh.inspect(cwd, { nowMs, env: process.env });
  const plan = smh.planRepair(cwd, state, { env: process.env });
  for (const f of smh.findings(state, plan)) {
    addIssue(f.severity, f.code, f.message, f.fix, f.repairable);
    if (f.repairable && !repairs.includes('repairSkillMarker')) repairs.push('repairSkillMarker');
  }
} catch (e) {
  addIssue('warning', 'W064', `skill-marker-check-failed: ${e.message}`, 'Run `df-tools doctor` to see why', false);
}
```
Repair case `repairSkillMarker`: `const r = smh.repair(cwd, { nowMs, env: process.env })`; push
`{ action: 'untrackSkillMarker', success: true, path: '.skill-active' }` when it untracked,
`{ action: 'removeStaleSkillMarker', success: true, path: '.skill-active' }` when it removed, and
`{ action: 'repairSkillMarker', success: false, error: r.refused }` when it refused. (Hoist `smh`/`nowMs` so the
repair loop can use them.) Update the file's header comment list of checks if it has one.
Commit `feat(69-02): validate health Check 19 for the skill-active marker`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs` passes; the full suite (validation_gates) has no new failure.</verify>
  <done>Tests 1-10 went RED then GREEN; `--repair` changes nothing but the marker in every case.</done>
  <recovery>If doctor tests (21-22-project.test.cjs) start failing because check 22 now sees E006/W064 in a fixture, do not edit check 22 here (69-04 owns it): confirm whether the fixture really has a stale marker and report it in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/skill-marker-health.test.cjs plugins/devflow/devflow/bin/lib/doctor-git.test.cjs plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Record the failing set before the first change; only known
     environment failures (MA-7 handoff-e2e doctl) may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-2 (validate half): tests 1-9 show `validate health` flagging tracked and stale markers and `--repair` untracking or
  removing only the marker; test 10 shows a failing check is reported.
</verification>

<success_criteria>
- Tests 1-17 pass (RED first where listed); full suite at baseline.
- `rg -n "E006|W064" plugins/devflow/devflow/bin/lib/validate.cjs` finds the Check 19 block only.
</success_criteria>

<output>
After completion, publish `69-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-02 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-09]`.
</output>
