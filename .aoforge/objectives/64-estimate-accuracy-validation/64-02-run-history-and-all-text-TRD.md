---
objective: 64-estimate-accuracy-validation
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/estimate-run-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
  - plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "A finished run is archived out of the repository at <state dir>/history/<repo-key>/<objective>-<started_at>.json (both parts through the store's sanitize), atomically and idempotently: archiving the same state twice writes once"
    - "`estimate finish` archives the run it closes, and `estimate start` (and a `wave --start` that begins a new run) archives a finished previous run before overwriting it, so a later objective's run no longer destroys an earlier objective's prospective estimate"
    - "`listRunHistory` and `latestRun(projectRoot, objective)` read the archive (and the current run file) without ever throwing: malformed or wrong-version files are skipped"
    - "A run started after this TRD records, besides the existing line/wall_minutes/confidence, the estimate's `execution` and `total` blocks and the calibration it came from (path, version, data_as_of, samples, inputs_digest), so the next validation compares against a truly prospective executor estimate"
    - "`estimate objective <N> --all` on a done objective prints the estimate in its text forms (`--line`, `--table`) instead of `all TRDs done`; without `--all` a done objective still prints `all TRDs done`"
    - "The status line is unaffected: estimate-run-store.cjs still loads only node builtins and ./upgrade.cjs, and readRunState still reads only <state dir>/<repo-key>.json"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
      provides: "historyDir, historyPath, archiveRunState, listRunHistory, latestRun (plus the existing API)"
    - path: plugins/devflow/devflow/bin/lib/estimate-cli.cjs
      provides: "archive on finish and before a run is replaced; enriched estimate block in new run states"
    - path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
      provides: "objectiveLine/objectiveTable render a done objective's estimate when `all` is set"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/estimate-run-fixtures.cjs
      provides: "hand-built run-state builders (finishedRun, liveRun) including Objective 63's real run state"
  key_links:
    - "estimate finish / start / wave --start (new run) -> store.archiveRunState -> <state dir>/history/<repo-key>/"
    - "64-04 estimate backtest -> store.latestRun(mainRoot, N) -> the prospective run for objective N"
---

# TRD 64-02: Keep every finished run, enrich what a run records, and fix the done-objective `--all` text (EST-08)

<objective>
Objective 64 found that the engine's only prospective record is fragile. The estimate run state is one file per
repository, `~/.claude/devflow/state/estimates/<repo-key>.json`, overwritten by every `estimate start`: the
pre-execution estimates for Objectives 59-62 are gone, and 63's survives only because no objective has started since.
It also records only the wall-time estimate, so executor minutes and cost can never be compared prospectively.

This TRD makes the next validation prospective instead of reconstructed:

1. **Run history.** A finished run is archived to `<state dir>/history/<repo-key>/<objective>-<started_at>.json`,
   outside the repository like the run state itself. `finish` archives the run it closes; `start` and a `wave --start`
   that begins a new run archive a finished previous run before overwriting it (this covers runs finished before this
   TRD shipped). An unfinished, abandoned run is still overwritten as today.
2. **Richer run state.** The `estimate` block of a new run also records `execution` and `total` (the same
   `{wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd}` blocks, each `{p50, p90}` or null, unrounded)
   and `calibration` (`{path, version, data_as_of, samples, inputs_digest}`). The schema version stays 1: the new keys
   are optional, old states still read, and the status line ignores them.
3. **The `--all` text defect** (58-10 Deviation 1): `estimate objective N --all --line|--table` on a done objective
   prints `all TRDs done (7 of 7)` and hides the backtest. With `all` set, the text forms render the estimate
   (`7 TRDs estimated in 5 waves`); without it, a done objective keeps its `all TRDs done` line.

History file name: `${sanitize(state.objective)}-${sanitize(state.started_at)}.json` with the store's existing
`sanitize` (only `[A-Za-z0-9_-]` survives), so Objective 63's run is
`63-2026-10-06T23_55_36_062Z.json`. The planner already copied 63's run state to exactly that path under
`~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/` (sha256
`08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`) because executing this objective's own
`estimate start 64` overwrites the live file. Keep the naming exactly so that file is found by `latestRun`.

Purpose: future objectives leave a prospective estimate behind for the next accuracy check; 64-04 reads it.
Output: run-store history API, CLI wiring, the format fix, and a run-state fixture builder.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── __fixtures__/estimate-run-fixtures.cjs   ← CREATE
├── estimate-run-store.cjs                   ← MODIFY (history API)
├── estimate-run-store.test.cjs              ← MODIFY
├── estimate-cli.cjs                         ← MODIFY (archive; enriched estimate block)
├── estimate-cli.test.cjs                    ← MODIFY
├── estimate-format.cjs                      ← MODIFY (done + all renders the estimate)
└── estimate-format.test.cjs                 ← MODIFY
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(64-02): ...` RED, then `feat(64-02): ...` / `fix(64-02): ...` GREEN, one test at a time.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per
  Bash call.
- **The store stays hook-safe.** `estimate-run-store.cjs` is loaded by `hooks/statusline.js`: node builtins plus
  `./upgrade.cjs` only, nothing read at module load, `os.homedir()` read only when a path is built. Reading never
  throws. The history is written only by `df-tools estimate` (the store's WRITER RULE); update the module header to say
  so and to document the history layout.
- **Runtime state never goes in the repository or `.planning/`** (`hooks/planning-writes.audit.test.js`). Tests inject
  `DEVFLOW_ESTIMATE_STATE_DIR` / `home`; spawn tests set `HOME` to a temp dir. Never touch the real `~/.claude`.
- Fixtures are hand-built literals (`no_llm_test_data`); no property-based library; no `.feature` files.
- Same wave: 64-01 owns `estimate-backtest.cjs` and `__fixtures__/backtest-fixtures.cjs`; 64-03 owns SUMMARY files.
  64-04 (wave 2) will add the `backtest` subcommand to `estimate-cli.cjs` and a renderer to `estimate-format.cjs`
  after you; do not add them here.
- `requirements: [EST-08]` names the requirement this TRD serves. **Do not run `requirements mark-complete EST-08`**;
  record `requirements-completed: []` (64-05 decides EST-08).
- Never write `~/.claude/devflow/calibration.json` or the real state directory. Never use port 8080.

## Test list

Outermost first.

`estimate-cli.test.cjs` (existing `describe('8-11: ...')` harness: `runEstimate` with injected `now`,
`DEVFLOW_CALIBRATION_PATH` and `DEVFLOW_ESTIMATE_STATE_DIR` under the test scratch dir):

1. `finish 80` writes `<runDir>/history/<repoKey>/80-<sanitized started_at>.json` whose content equals the finished
   run state; a second `finish 80` does not rewrite it (mtime and bytes unchanged) and still prints the same line.
2. After `finish 80`, `start 80` (a new run) leaves the archived file unchanged and writes the new live state; with a
   finished state that was never archived (written directly through `store.writeRunState`, as a pre-64 run would be),
   `start 81` archives it first, then overwrites the live file.
3. An unfinished state for another objective is overwritten by `start` without being archived (history unchanged).
4. `wave 80 1 --start` that begins a new run (previous run finished) archives the previous run like `start`.
5. `start 80` records `estimate.execution` and `estimate.total` equal to the objective estimate's unrounded
   `execution`/`total` blocks (compare with `rollup.estimateObjective` on the same fixture), and
   `estimate.calibration` = `{path, version, data_as_of, samples, inputs_digest}` of the calibration used; with no
   usable calibration all three are null and the run still records its waves.
6. The existing assertions still hold: `estimate.line`, `estimate.wall_minutes`, `estimate.confidence`, the waves,
   test 11's "a second finish does not write" (now also: the history file is not rewritten), and "the run verbs wrote
   only under the state directory" extended to walk `history/` recursively with no `.tmp` left anywhere.
7. `objective 82 --all --line` (done fixture objective) prints `Objective 82 estimate: ... · 1 TRD estimated in 1 wave
   · confidence ...`; `objective 82 --line` without `--all` still prints `Objective 82: all TRDs done (1 of 1)`.

`estimate-format.test.cjs`:

8. `objectiveLine(done, all: true)` renders the estimate line with `TRDs estimated`; `objectiveTable` likewise renders
   the table; `all` false keeps `all TRDs done (n of m)` for both (existing test at line ~324 stays green).

`estimate-run-store.test.cjs` (unit; inject `env`/`home`):

9. `historyDir(root, opts)` is `<stateRoot>/history/<repoKeyOf(root)>`; `historyPath(root, state, opts)` ends with
   `63-2026-10-06T23_55_36_062Z.json` for Objective 63's real run state (fixture `objective63Run()`), and a hostile
   objective such as `../x` cannot leave the history directory.
10. `archiveRunState(root, finishedState, opts)` writes `JSON.stringify(state, null, 2) + '\n'` atomically and returns
    `{path, written: true}`; a second call returns `{written: false}` without rewriting; an unfinished state returns
    `{path: null, written: false, reason: 'not finished'}`; a non-run-state value returns `reason: 'not a run state'`.
11. `listRunHistory(root, opts)`: valid states sorted by `started_at`; a malformed file, a `version: 2` file, a `.tmp`
    file and a missing directory are skipped or give `[]`; never throws.
12. `latestRun(root, '63', opts)`: the newest finished run for the objective from the history and the current run file
    together (the current file wins on equal `started_at`); null when none; an unfinished current run is ignored.
13. Archiving Objective 63's fixture state through `archiveRunState` reproduces the planner's copy byte for byte:
    sha256 of the written file is `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`.

<embedded_context>

<codebase_examples>
The store's existing pieces to build on (estimate-run-store.cjs):

```js
function stateRoot(env = process.env, home) {
  const override = env && env.DEVFLOW_ESTIMATE_STATE_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'devflow', 'state', 'estimates');
}
/** Allowlist sanitizer: only [A-Za-z0-9_-] survives, so a name can never carry a path out of the state dir. */
function sanitize(name) { ... }
function statePath(projectRoot, opts) {
  const { env, home } = opts || {};
  return path.join(stateRoot(env, home), `${repoKeyOf(projectRoot)}.json`);
}
function writeRunState(projectRoot, state, opts) {
  const file = statePath(projectRoot, opts);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (err) { fs.rmSync(tmp, { force: true }); throw err; }
  return { path: file };
}
```

Where the CLI writes a new run today (estimate-cli.cjs): `runStart` calls `newRunState(objective, plan, now)` then
`store.writeRunState(runRoot(base), state, { env })`; `waveStart` builds a new run when `!isLive(run, objective, now)`;
`runFinish` sets `finished_at` once (idempotent) then prints `finishLine`. `planObjective` builds the `estimate` block:

```js
const result = rollup.estimateObjective(loaded.cal, base, objective);
const output = objectiveOutput(result, loaded, false);
return {
  waves: result.waves.map((w) => newWave(w.wave, w.trds, w.wall_minutes)),
  line: output.line,
  estimate: { line: output.line, wall_minutes: result.execution ? result.execution.wall_minutes : null, confidence: result.confidence },
  output,
};
```

Add `execution: result.execution || null`, `total: result.total || null` and `calibration: {...loaded.meta,
inputs_digest: loaded.cal.inputs_digest || null}` there; in the no-calibration branch all three are null.

The done short-circuit to change (estimate-format.cjs):

```js
function objectiveLine(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  if (r.status === 'done') return `Objective ${r.objective}: all TRDs done (${r.trds.done} of ${r.trds.total})`;
  ...
function objectiveTable(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  if (r.status === 'done') return objectiveLine(r);
```

Make both short-circuits `r.status === 'done' && !r.all`. `trdsLeft(r)` already prints `estimated` when `r.all`.
`runObjective` already passes `all` into `objectiveOutput`.

Objective 63's real run state, verbatim (the fixture `objective63Run()` must reproduce these bytes when written with
`JSON.stringify(state, null, 2) + '\n'`; keep every digit):

```json
{"version":1,"objective":"63","started_at":"2026-10-06T23:55:36.062Z","updated_at":"2026-10-07T01:46:41.099Z","finished_at":"2026-10-07T01:46:41.099Z","estimate":{"line":"Objective 63 estimate: 1h 43m median (P90 5h 04m) wall · $22.08 (P90 $34.02) · 7 TRDs left in 5 waves · confidence low","wall_minutes":{"p50":96.61616043566684,"p90":290.40059551531397},"confidence":"low"},"waves":[{"wave":1,"trds":["63-01","63-05"],"p50":19.738206139394915,"p90":67.31643574086333,"started_at":"2026-10-06T23:56:09.280Z","finished_at":"2026-10-07T00:14:43.608Z","actual_minutes":18.572133333333333},{"wave":2,"trds":["63-02"],"p50":14.5,"p90":54.100000000000016,"started_at":"2026-10-07T00:15:05.024Z","finished_at":"2026-10-07T00:27:16.835Z","actual_minutes":12.19685},{"wave":3,"trds":["63-03","63-04"],"p50":16.21765152054369,"p90":42.59996074545397,"started_at":"2026-10-07T00:27:17.554Z","finished_at":"2026-10-07T00:35:44.197Z","actual_minutes":8.44405},{"wave":4,"trds":["63-06"],"p50":9.500000000000002,"p90":36.60000000000001,"started_at":"2026-10-07T00:35:54.113Z","finished_at":"2026-10-07T01:26:30.878Z","actual_minutes":50.61275},{"wave":5,"trds":["63-07"],"p50":25.000000000000007,"p90":102.50000000000001,"started_at":"2026-10-07T01:26:34.071Z","finished_at":"2026-10-07T01:45:52.070Z","actual_minutes":19.299983333333333}]}
```
</codebase_examples>

<anti_patterns>
- Do not bump `STATE_VERSION`: `isRunState` requires `version === STATE_VERSION`, so a bump would make every existing
  state (63's included) read as "no run". Add optional keys only.
- Do not let the status line path pay for history: `readRunState` and `formatStatusSegment` must not list or read the
  history directory.
- Do not archive unfinished runs: an abandoned run's partial waves are not an outcome, and archiving them would let a
  later backtest compare against a run that never finished.
- Do not compute the history key from a worktree path when the run state was keyed elsewhere: archive with the same
  `runRoot(base)` the run state uses (64-04 resolves the main checkout for its lookup).
</anti_patterns>

<error_recovery>
- `archiveRunState` hits a filesystem error: remove its `.tmp` and throw, like `writeRunState`. In the CLI, a failed
  archive must not lose the live state: archive before overwriting, and if the archive throws, report the error
  (`{ok: false, message}`) without writing the new run.
- An existing test asserts the full `estimate` object with `deepEqual`: extend the expected object with the three new
  keys rather than loosening the assertion.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
@plugins/devflow/devflow/bin/lib/estimate-cli.cjs
</context>

<gotchas>
- `estimate-cli.test.cjs` line ~562 ("the run verbs wrote only under the state directory") reads `fs.readdirSync(runDir)`
  non-recursively; extend it to recurse into `history/`.
- Test 11 in estimate-cli.test.cjs checks that a second `finish` does not write (`updated_at` unchanged); the archive
  must be idempotent for that to stay true.
- `repoKeyOf(projectRoot)` realpaths the path; in tests the fixture root is already realpath'd (`makeEstimateProject`).
- `sanitize` caps names at 200 characters; an ISO timestamp is 24.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Run-state fixture builders, then the history store API (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/estimate-run-fixtures.cjs, plugins/devflow/devflow/bin/lib/estimate-run-store.cjs, plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs</files>
  <action>
First write `__fixtures__/estimate-run-fixtures.cjs` (header: hand-built literals, no generated data, never the real
~/.claude): `objective63Run()` returns a fresh copy of the verbatim JSON in codebase_examples; `finishedRun({objective,
started_at, finished_at, waves, estimate})` and `liveRun({...})` build small states with overrides.

Then test-list items 9-13, one at a time (RED commit, GREEN commit):

```
historyDir(root, opts)        = path.join(stateRoot(env, home), 'history', repoKeyOf(root))
historyPath(root, state, opts) = path.join(historyDir(root, opts), `${sanitize(state.objective)}-${sanitize(state.started_at)}.json`)
archiveRunState(root, state, opts):
  !isRunState(state)            -> {path: null, written: false, reason: 'not a run state'}
  !state.finished_at            -> {path: null, written: false, reason: 'not finished'}
  text = JSON.stringify(state, null, 2) + '\n'; same bytes on disk -> {path, written: false}
  else mkdir -p, write <file>.tmp, rename (rm tmp on error, rethrow) -> {path, written: true}
listRunHistory(root, opts): readdir (missing dir -> []), only *.json, parse each in try/catch, keep isRunState,
  sort by started_at then file name
latestRun(root, objective, opts): candidates = history + readRunState(root, opts); keep objective === String(objective)
  and finished_at; newest started_at wins (current file wins a tie); null when none
```
Export the five functions; update the module header (history layout, writer rule, never read by the status line).

# CRITICAL: no new requires in this module beyond fs, os, path and ./upgrade.cjs.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` passes; `rg -n "require\\(" plugins/devflow/devflow/bin/lib/estimate-run-store.cjs` shows only fs, os, path and ./upgrade.cjs; `node --test plugins/devflow/hooks/statusline-estimate.test.js` still passes.</verify>
  <done>Items 9-13 pass, including the byte-exact sha256 of Objective 63's archived state.</done>
  <recovery>If the sha256 in item 13 differs, diff the fixture against the verbatim JSON in codebase_examples (a float digit or key order changed); fix the fixture, never the expected hash.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Archive in the run verbs, enrich the estimate block, and render a done objective's --all estimate (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-cli.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs, plugins/devflow/devflow/bin/lib/estimate-format.cjs, plugins/devflow/devflow/bin/lib/estimate-format.test.cjs</files>
  <action>
Test-list items 1-8, one at a time.

estimate-cli.cjs:
```
replaceRun(root, previous, next, env):     // used by runStart and by waveStart when it creates a run
  if previous && previous.finished_at: store.archiveRunState(root, previous, {env})   // throws -> {ok:false}
  return store.writeRunState(root, next, {env})
runFinish: after setting finished_at (or finding it already set), store.archiveRunState(root, state, {env})
planObjective: estimate block gains execution, total, calibration (see codebase_examples); null in the no-calibration branch
```
`runStart` must read the previous state (`store.readRunState(runRoot(base), {env})`) before writing the new one.
Update the module header's run-verb paragraph (history, enriched estimate block).

estimate-format.cjs: both done short-circuits become `r.status === 'done' && !r.all` (fix commit:
`fix(64-02): estimate objective --all renders a done objective's estimate`).

# GOTCHA: `waveStart` creates a new run in two places (not live; and the plan branch for a missing wave) — only the
#   first replaces the live state; route it through replaceRun.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-format.test.cjs plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/hooks/statusline-estimate.test.js` passes; `node plugins/devflow/devflow/bin/df-tools.cjs estimate objective 63 --all --line --raw` (repo source, real calibration, read-only) prints `Objective 63 estimate: ... 7 TRDs estimated in 5 waves ...` instead of `all TRDs done`.</verify>
  <done>Items 1-8 pass; finish and run replacement archive finished runs; new runs carry execution/total/calibration; the done-objective `--all` text shows the estimate.</done>
  <recovery>If an existing estimate-cli test breaks because it deep-compares the run state, extend its expectation with the new keys; if `estimate-surfacing.repo.test.cjs` pins prose that mentions `all TRDs done`, leave the prose (64-06 updates docs) and only adjust a pin that tests the changed `--all` behaviour.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-format.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- The scoped test command above passes, plus `node --test plugins/devflow/hooks/statusline-estimate.test.js` and
  `node --test plugins/devflow/hooks/planning-writes.audit.test.js`.
- `node plugins/devflow/devflow/bin/df-tools.cjs estimate objective 63 --all --line --raw` shows the estimate.
- No test reads or writes the real `~/.claude/devflow/state/estimates/` (grep the new tests for `DEVFLOW_ESTIMATE_STATE_DIR`
  or an injected `home`).
</verification>

<success_criteria>
- Finished runs survive later runs, in an out-of-repo history keyed like the run state.
- New run states carry the executor and total estimates and the calibration identity.
- The done-objective `--all` text defect from 58-10 is fixed.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-02-SUMMARY.md` with
`requirements-completed: []`.
</output>
