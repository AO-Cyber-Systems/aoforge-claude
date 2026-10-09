---
objective: 69-drafts-health-and-doctor
trd: "04"
type: standard
wave: 2
depends_on: ["69-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
autonomous: true
requirements: [TOOL-09]
must_haves:
  truths:
    - "`df-tools doctor` reports check `skill-markers` as an error naming E006 when `.planning/.skill-active` is tracked in git, and as a warning (W064 / the existing stale wording) when an untracked marker is stale"
    - "`doctor --fix` on a tracked stale marker untracks and removes that one file, reports `changed: ['.planning/.skill-active']` and a `df-tools commit ... --files .planning/.skill-active` note, and leaves every other path untouched"
    - "`doctor --fix` refuses the tracked-marker fix while an unrelated change is staged (DOC-06), unless that staged path is the doctor's own earlier change (`ctx.changedThisRun`), and never unlinks a tracked marker it could not untrack"
    - "Check `validate-health` defers E006 and W064 (listed in details.deferred, never in its finding), and counts only non-deferred repairable issues when deciding whether it is fixable"
    - "A doctor run on a project whose only problem is a tracked stale marker reports it once (check 23), and after `--fix` both checks are ok"
    - "Check 23 has no local copy of the skill-active classification; it calls skill-marker-health.cjs"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
      provides: "skill-markers check over skill-marker-health (tracked + stale) and .edit-override (unchanged)"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
      provides: "DEFERRED gains E006 and W064; repairable count over non-deferred issues"
      contains: "'E006'"
  key_links:
    - from: "doctor-checks/23-skill-markers.cjs run/fix"
      to: "skill-marker-health.cjs inspect / planRepair / repair"
      via: "ctx.env and ctx.changedThisRun passed through as env / exclude"
      pattern: "planRepair\\("
    - from: "doctor-checks/23-skill-markers.cjs fix"
      to: "doctor-checks/20-legacy-runtime-state.cjs commitNote"
      via: "the commit note (store-mode aware) for an untracked marker"
      pattern: "commitNote\\("
---

# TRD 69-04: Doctor owns the skill-marker codes and catches tracked markers (TOOL-09, doctor side)

<objective>
Doctor check 23 (`skill-markers`) removes a stale `.planning/.skill-active`, but it does not know whether the marker is
tracked, and it unlinks it either way: on a committed marker that leaves a working-tree deletion of a tracked file and
the gate still open in every other clone. 69-02 put marker inspection and safe repair in `lib/skill-marker-health.cjs`
and made `validate health` report E006/W064. Now move check 23 onto that module: a tracked marker is an error, its fix
is the guarded untrack (plus removal when stale), and check 22 defers both codes so the problem shows once. Check 22
also stops counting deferred repairable issues as its own, or it would run `validate health --repair` for a problem it
does not report.

Purpose: success criterion 2 (doctor half). Output: check 23 and 22 changes, tests, README row.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs
@plugins/devflow/devflow/bin/lib/skill-marker-health.cjs
@plugins/devflow/devflow/bin/lib/doctor-checks/README.md

Read with offset/limit:
- `plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs` 1-120 (header, `DEFERRED`, `classify`, `run`)
  and 126-150 (`fix`).
- `plugins/devflow/devflow/bin/lib/doctor-checks/20-legacy-runtime-state.cjs` 36-60 (`commitNote`, exported) and
  238-252 (exports).
- `plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs` (existing tests 15-18; keep them passing).
- `plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs` 295-330 (`healthJson`, the DEFERRED contract
  test) and the `ctx.exec` stub tests near 400-450.
- `plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs` (69-02): `makeMarkerProject`.

## Binding rules
- Strict TDD on both tasks; one test at a time.
- Fixtures: `makeMarkerProject` (69-02) for git projects; the existing `project()` helper (git: false) for the old
  tests. Fake homes only; never the real `~/.claude` and never this repository's live marker.
- Parallel wave: 69-05 edits validate.cjs, df-tools.cjs, help.cjs, flag-spec.cjs. Do not edit them or
  skill-marker-health.cjs (report a needed change in the SUMMARY instead). One plain command per Bash call; commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- The doctor never commits; a fix that untracks returns the commit command in `notes`.
- `.edit-override` handling in check 23 is unchanged (5-minute TTL, unlink).

## Result shape for check 23
- `details.stale`: `[{file, reason}]` as today (the skill marker when stale, tracked or not; the edit-override when
  stale), so existing tests keep their assertions.
- `details.tracked`: `['.planning/.skill-active']` when tracked, else `[]`. `details.codes`: the E006/W064 code that
  applies (`[]` when only the edit-override is stale). `details.skill`: the inspect state; `details.skill_plan`: the plan.
- `severity`: `error` when tracked, else `warn` when anything is stale, else `ok`.
- `finding`: tracked -> `tracked edit-gate marker: .planning/.skill-active is in the git index (E006), so it holds the edit gate open in every clone`
  (+ ` and is stale (<reason>)`); stale entries keep today's `stale edit-gate marker(s) holding the gate open: <file> (<reason>); ...`
  (a tracked stale marker is described by the tracked sentence only); parts joined with `; `.
- `fixable`: the skill plan is fixable, or the edit-override is stale. When the skill plan is refused, append
  ` — skill marker fix refused: <reason>` and set `fix_command` to
  `commit or unstage your changes (<reason>), then re-run \`node ~/.claude/devflow/bin/df-tools.cjs doctor --fix\``
  (for a guard refusal) or the refusal text itself (live and not ignored).
</context>

## Test list

`23-skill-markers.test.cjs` (task 1; git projects from makeMarkerProject, ctx from `doctor.buildContext({projectRoot, userHome, env, now})`):
1. Whole engine: `doctor.runDoctor({..., fix: true, checks: [require('./22-validate-health.cjs'), markers]})` on a
   project whose only problem is a tracked expired marker -> before the fix check 23 is `error` with `details.codes`
   `['E006']` and check 22's `details.deferred` includes `E006` while its finding does not mention it; after the fix
   check 23 is `ok`, `git status --porcelain=v1` is exactly `D  .planning/.skill-active`, the fix entry's `changed` is
   `['.planning/.skill-active']` and its `notes` contain `--files .planning/.skill-active`.
2. Tracked live ignored marker -> `error`, fixable; fix untracks it and the working file is byte-identical.
3. Tracked live marker that is not ignored -> `error`, `fixable: false`, `fix_command` mentions `.gitignore`; calling
   `fix()` directly applies nothing and leaves the index and the file as they were.
4. Tracked expired marker plus an unrelated staged `notes.txt` -> `fixable: false`, finding contains
   `staged changes present`; with `ctx.changedThisRun = new Set(['notes.txt'])` -> fixable true.
5. Guard refused: `fix()` never unlinks the tracked marker (porcelain has no ` D`, the file exists).
6. Untracked stale marker in a git project -> `warn`, `details.codes` `['W064']`, fix removes only it; `details.tracked`
   is `[]`.
7. Existing tests 15-18 and "both stale" still pass unchanged (git: false projects).
8. Check 23's source no longer defines `classifySkillActive` (`assert.doesNotMatch(src, /function classifySkillActive/)`).

`21-22-project.test.cjs` (task 2):
9. The DEFERRED contract test lists `E006` and `W064` (after `E020`; keep the array sorted as the module defines it).
10. Stubbed validate JSON (`ctx.exec`) with only `E006` (`repairable: true`) and `repairable_count: 1` -> check 22 is
    `ok`, `fixable: false`, `details.deferred` `['E006']`, `details.repairable_count` `0`.
11. Stubbed JSON with `W003` (`repairable: true`) and `W064` (`repairable: true`) -> fixable (repairable count 1).

<embedded_context>

<codebase_examples>
Check 22's current repairable count (the line to change):

```js
const repairable = Number(json.repairable_count) || 0;
return { errors, warnings, info, deferred, repairable };
```
becomes a count over the already-filtered lists:
```js
const repairable = [...errors, ...warnings].filter((i) => i && i.repairable === true).length;
```

The commit note check 20 already builds (exported; local and store mode):

```js
const legacy = require('./20-legacy-runtime-state.cjs');
notes.push(legacy.commitNote(root, ['.planning/.skill-active']));
// local: "commit with: node ~/.claude/devflow/bin/df-tools.cjs commit \"chore: untrack DevFlow runtime state\" --files .planning/.skill-active"
```

Check 23's fix loop today (keep it for `.edit-override` only):

```js
for (const m of MARKERS) {
  const reason = m.classify(root, nowMs);      // race-safe re-classify
  if (!reason) { if (fs.existsSync(abs)) skipped.push(m.file); continue; }
  fs.unlinkSync(abs); changed.push(m.file);
}
```
</codebase_examples>

<anti_patterns>
- Do not unlink `.planning/.skill-active` in check 23 directly any more: every action on it goes through
  `smh.repair`, which untracks before removing and refuses when the guard does.
- Do not keep a second classification in check 23: import from skill-marker-health.cjs (README: never re-implement).
- Do not make check 22 fixable on deferred codes, and do not filter `repairs_performed` in check 22's fix: when it runs
  `validate health --repair` for its own issues and validate also repairs the marker, reporting that change is correct.
- Do not split tracked markers into a new check file: two checks acting on one file would race in `--fix`.
</anti_patterns>

<error_recovery>
- Test 1 shows check 22 fixable: the stub project has another repairable issue; make it healthy (makeMarkerProject is a
  stamped project) or assert on the specific codes.
- Test 1's check 22 spawn is slow or fetches: it runs the real `validate health` through `ctx.dfToolsPath`; if Check 11
  tries the network, set the env the other real-spawn test (test 13 in 21-22-project.test.cjs) uses.
- An existing test-15 assertion on `finding` text fails: the stale wording must stay byte-identical for untracked
  markers; only tracked markers get the new sentence.
</error_recovery>

</embedded_context>

<gotchas>
- `ctx.changedThisRun` may be a Set or an array; pass it as `exclude` (doctor-git's `toExcluder` accepts both).
- Pass `ctx.env` (not `process.env`) to every skill-marker-health call; tests rely on `gitEnv(home)`.
- `nowMsOf(ctx)` already exists in check 23; pass it as `nowMs`.
- `doctor.runDoctor` re-runs every check after fixes; the post-fix report is what test 1 asserts.
- The README's ownership table is prose other docs quote: update the 20-29 row and check 22's header comment list
  (one line per owner) together.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Check 23 over skill-marker-health (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs</files>
  <action>
RED: tests 1-6 and 8 (1-5 fail today: a tracked marker is only "stale", and the fix unlinks without untracking).
Commit `test(69-04): doctor skill-markers catches tracked markers`.

GREEN in 23-skill-markers.cjs:
- `const smh = require('../skill-marker-health.cjs'); const legacy = require('./20-legacy-runtime-state.cjs');`
- Delete the local `classifySkillActive` and the `.skill-active` entry of `MARKERS` (MARKERS keeps `.edit-override`).
- `run(ctx)`: `skill = smh.inspect(root, { nowMs, env: ctx.env })`, `plan = smh.planRepair(root, skill, { env: ctx.env, exclude: ctx.changedThisRun })`,
  `override = classifyEditOverride(root, nowMs)`; build the result exactly as "Result shape for check 23" says.
- `fix(ctx)`: `r = smh.repair(root, { nowMs, env: ctx.env, exclude: ctx.changedThisRun })`; when it untracked or
  removed, `changed.push('.planning/.skill-active')`; notes `untracked: .planning/.skill-active` +
  `legacy.commitNote(root, ['.planning/.skill-active'])` when untracked, `removed: .planning/.skill-active` when
  removed, `skill marker left alone: <r.refused>` when refused; then the existing `.edit-override` loop. Return
  `{ applied: false, refused: r.refused || undefined, notes }` when nothing changed, else `{ applied: true, changed, notes }`.
- Header comment: add the tracked case, E006/W064 ownership (validate Check 19 renders the same module; check 22
  defers), and that the git guard now applies to the tracked case only.
Commit `feat(69-04): skill-markers check handles tracked markers through skill-marker-health`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs` passes.</verify>
  <done>Tests 1-8 pass (1-6 and 8 RED first); old tests 15-18 unchanged and passing.</done>
  <recovery>If test 1 cannot see check 22 defer E006 because DEFERRED is not updated yet, write task 2's DEFERRED change first and note the order in the SUMMARY; the RED/GREEN pairs stay per test.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Check 22 defers E006/W064 and counts only its own repairs (tests 9-11)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/README.md</files>
  <action>
RED: tests 9-11. Commit `test(69-04): validate-health defers the skill-marker codes`.

GREEN:
1. 22-validate-health.cjs: `DEFERRED = ['E006', 'E020', 'I022', 'W040', 'W057', 'W058', 'W059', 'W060', 'W061', 'W062', 'W063', 'W064']`
   (keep whatever order test 9 pins; sorted is simplest); header list gains
   `E006 / W064  skill-active marker — skill-markers (check 23), TRD 69-04`; `classify` computes `repairable` over the
   non-deferred errors and warnings (codebase_examples); the `fixable when ...` header line says "non-deferred".
2. README.md: the 20-29 row's `23-skill-markers` entry becomes
   `23-skill-markers` (TRD 69-04: tracked markers too; owns E006/W064, which `22` defers; the tracked fix is an index change behind the DOC-06 guard).
Commit `feat(69-04): validate-health defers E006/W064 and ignores deferred repairs`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` passes; the full suite (validation_gates) has no new failure.</verify>
  <done>Tests 9-11 went RED then GREEN; a tracked marker is reported once across the doctor.</done>
  <recovery>If doctor.e2e.test.cjs counts results or codes and now differs, read what it pins; adjust only an assertion that encoded the old double-report, and say so in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs plugins/devflow/devflow/bin/lib/doctor-cli.test.cjs</test_scoped>
<!-- lint/typecheck/build: none in the stack profile. Record the failing set before the first change; only known
     environment failures (MA-7 handoff-e2e doctl) may remain. If git signing prompts hang micro.test.cjs locally, use
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'. -->
</validation_gates>

<verification>
- SC-2 (doctor half): test 1 shows `doctor` flagging a tracked stale marker once and `--fix` untracking and removing only
  it; tests 3-5 show the unsafe cases are refused; test 6 shows stale untracked markers still work.
</verification>

<success_criteria>
- Tests 1-11 pass (RED first where listed); full suite at baseline.
- `rg -n "function classifySkillActive" plugins/devflow/devflow/bin/lib/doctor-checks/23-skill-markers.cjs` finds
  nothing, and `rg -n "smh\.(inspect|planRepair|repair)\(" ` on the same file finds the run and fix calls.
</success_criteria>

<output>
After completion, publish `69-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post 69-04 --from <draft>`,
as execute-trd describes (stamp tokens first). Frontmatter `requirements-completed: [TOOL-09]`.
</output>
