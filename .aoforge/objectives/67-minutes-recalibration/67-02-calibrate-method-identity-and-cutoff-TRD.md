---
objective: 67-minutes-recalibration
trd: "02"
type: standard
wave: 2
depends_on: ["67-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
  - plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - scripts/estimate-window-eval.cjs
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "`buildCalibration` writes calibration version 3 with a `method` block `{minutes, window_objectives, through_objective}` that names the requested minutes method (`task_sum` default or `trd_level`), the requested window (10 by default, null for all) and the requested cutoff (null by default); the block is part of `inputs_digest`"
    - "With `through: N`, objective directories numbered above N or with no number, and their STATE_ARCHIVE and state.json metric rows, are dropped at collection, before any statistic or count: a project that adds objectives 67-72 (TRDs, SUMMARYs with minutes and tokens, archive rows, metrics_log entries) and a no-number directory gives a through-66 calibration byte-identical to the same project without them, for both minutes methods, while without the cutoff the two differ"
    - "Unchanged inputs and options give byte-identical text, and a second `writeCalibration` reports `changed: false`; `task_sum` and `trd_level` builds have identical statistic blocks and differ only in `method`, `notes` and `inputs_digest`"
    - "`df-tools calibrate --minutes <task_sum|trd_level> --through <N>` passes both through, names them in the summary line and in the result JSON; a bad value is a usage error (exit 1) naming the flag; help.cjs and the df-tools header name both flags"
    - "scripts/estimate-window-eval.cjs pins `minutes: 'task_sum'` at every buildCalibration call, so 64's frozen selection cannot follow a later default change"
    - "Nothing scores any real objective here: every test uses hand-built fixtures in temp directories, and ~/.claude/devflow/calibration.json is untouched"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrator.cjs
      provides: "CALIBRATION_VERSION 3, MINUTES_METHODS, DEFAULT_MINUTES_METHOD, the method block, the minutes and through options, their notes and digest component"
      contains: "through_objective"
    - path: plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
      provides: "collectProject(root, {through}) and the shared cutoff helpers"
      contains: "through"
    - path: plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
      provides: "--minutes and --through flags, validation, summary text, result.method"
      contains: "--through"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
      provides: "FUTURE_SPEC / pastSpec: the hand-built 64-72 project for the cutoff proof"
      contains: "FUTURE_SPEC"
  key_links:
    - "calibrate --minutes M --through N -> calibrator.buildCalibration({minutes, through}) -> calibration-inputs.collectProject(root, {through}) -> every block -> method block + inputs_digest"
    - "calibration v3 method block -> 67-03 estimator (reads method.minutes) -> 67-04 validation cuts (--through N-1) -> 67-09 frozen EST-11 calibration (--through 66)"
---

# TRD 67-02: `calibrate` names its method and enforces a cutoff (EST-10 SC-2, SC-3)

## Precondition (read first)

`ls .planning/decisions/resolved/` lists the decision 67-01 recorded (expected DECISION-003) and
`node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/decisions/resolved/DECISION-003.md --field status`
prints `resolved`. If not, stop: this TRD builds what that decision names.

<objective>
Give `calibrate` the two capabilities DECISION-003 needs, and nothing else:

1. **A method identity.** Calibration version 3 always carries
   `method: {minutes: 'task_sum'|'trd_level', window_objectives: <N>|null, through_objective: <N>|null}`, the requested
   parameters, inside `inputs_digest`. `minutes` is new: the calibrator computes the same statistics either way; the
   field tells the estimator (67-03) how to build a TRD's minutes. The default stays `task_sum` here; 67-05 changes it
   only if the pre-registered ship rule says so.
2. **A cutoff** (`through`). Objectives numbered above N are dropped at collection, before anything is read from them
   or counted, so a later objective can never change the calibration. This is the mechanism that keeps EST-11's
   objectives (68-72) out of the frozen calibration by parameter rather than by timing, and that 67-04 uses to cut the
   leave-future-out validation calibrations (`--through N-1`).

Purpose: SC-2 (identity names the method and its parameters; byte-identical on unchanged inputs) and the code half of
SC-3 (a test proves objectives 67-72 do not reach a through-66 calibration).
Output: library + CLI + fixtures + tests; the 64 selection script pinned to `task_sum`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/OBJECTIVE.md
@.planning/decisions/resolved/DECISION-003.md

Applied user playbook (~/.claude/CLAUDE.md, TDD & Quality): plugin kind is strict TDD — write the failing test first,
see it fail for the stated reason, then implement to green, one test at a time.

## Binding rules
- Use the repository df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …`. One plain command per Bash call (this
  TRD runs in a worktree beside 67-03; the worktree-isolation guard refuses compound commands).
- **Never write `~/.claude/devflow/calibration.json`.** Every test passes `--out`/a temp path; `shasum -a 256
  ~/.claude/devflow/calibration.json` is `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648` at the start
  and at the end.
- **Score nothing.** No `estimate backtest`, no run of `scripts/estimate-*.cjs` on real data, no `calibrate` of this
  repository. The validation is 67-04's, once, after this TRD.
- Do not touch `plugins/devflow/devflow/bin/lib/estimate*.cjs` (67-03 owns them, in parallel) or
  `__fixtures__/estimate-fixtures.cjs`. Do not change `estimate-backtest.cjs` constants or `scripts/estimate-rolling-backtest.cjs`.
- Strict TDD per the test list. Fixtures are hand-built (`makeCalibrationProject` specs); no generated data, no
  property-based library, no `.feature` files.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (RED `test(67-02): …`, GREEN
  `feat(67-02): …`). Never use port 8080.
</context>

## Design (fixed here; no judgement needed while coding)

**calibration-inputs.cjs**
- `assertThrough(through)`: `undefined` and `null` pass; otherwise `typeof through === 'number'`, finite and `>= 0`, else
  `throw new Error('through must be a non-negative number or null')`.
- `withinThrough(token, through)`: true when `through` is null/undefined; else `objectiveNumber(token) !== null &&
  objectiveNumber(token) <= through`. Works for directory names (`66-c`) and metric-row tokens (`66`, `66-c`).
- `collectProject(root, options = {})`: read `options.through` (call `assertThrough`). Filter `dirNames` with
  `withinThrough` immediately after listing them, before any file in a directory is read; filter the rows from
  `readMetricRows(base)` with `withinThrough(row.objective, through)` before any metric count or join. `objectives` in
  the result is the filtered list. With no `through` the function is byte-for-byte today's.
- Export `assertThrough` and `withinThrough`.

**calibrator.cjs**
- `CALIBRATION_VERSION = 3`; `MINUTES_METHODS = Object.freeze(['task_sum', 'trd_level'])`;
  `DEFAULT_MINUTES_METHOD = 'task_sum'` (exported, with a comment: "67-05 sets this from the pre-registered ship rule of
  DECISION-003").
- `buildCalibration({paths, ratesPath, transcriptsRoot, window, minutes, through})`: `minutes === undefined` →
  `DEFAULT_MINUTES_METHOD`; any other value not in `MINUTES_METHODS` (including null) → `throw new Error('minutes must be
  one of task_sum, trd_level')`. `through === undefined` → null; validate with `ci.assertThrough`. Pass `{through}` to
  every `ci.collectProject(root, {through})` call. The window applies after the cutoff (the N most recent objectives
  with samples at or below `through`).
- Output adds `method: {minutes, window_objectives: <effective window: number or null>, through_objective: <through or
  null>}` (the requested values, present even when nothing was dropped) and `version: 3`. `inputsDigest` gains a
  `method` component (same object) in its payload; keep the existing `window` component as is.
- Notes, appended in this order after the existing ones (base NOTES, then the window note when present):
  - through set: `` `Through objective ${through}: objective directories numbered above it, or with no number, are not read, and their STATE_ARCHIVE and state.json metric rows are not counted. agent_overhead comes from transcripts and is not cut.` ``
  - minutes `trd_level`: `'Minutes method trd_level: an estimate takes a TRD\'s minutes from trd_level.minutes whatever its task count; task_classes minutes still describe single tasks (estimate task) and are not summed into a TRD.'`
- Statistic blocks are computed exactly as today for both minutes methods. The calibrator does not compute anything new
  for `trd_level`: `trd_level.minutes` already exists.

**calibrate-cli.cjs**
- `VALUE_FLAGS` gains `minutes` and `through`. `--minutes` must be `task_sum` or `trd_level`, else
  `usageError('--minutes must be task_sum or trd_level, got <json>')`. `--through` must match `/^\d+(?:\.\d+)?$/` and be
  a safe finite number, else `usageError('--through must be an objective number (for example 66), got <json>')`.
  Missing value: the existing `needs a value` error.
- Pass `minutes` and `through` to `buildCalibration`. Result JSON adds `method: calibration.method`. Summary text
  appends ` · minutes <m>` always and ` · through objective <N>` when set, after the window text.
- USAGE, the header comment, `help.cjs` `calibrate` usage/details and the `case 'calibrate'` comment in df-tools.cjs
  (line ~924) and its header line (~166) name `--minutes <task_sum|trd_level>` and `--through <N>`.

**scripts/estimate-window-eval.cjs** — add `minutes: 'task_sum'` to the three `buildCalibration` calls (lines ~211, ~448,
~464), with the comment `// pinned: 64's frozen selection used the per-task sum (67-02)`. Its tests pass unchanged.

<embedded_context>

<codebase_examples>
The 64-08 window is the pattern to copy: an option validated up front (`assertWindow`), applied to the project list
right after collection, recorded in the output and in the digest:

```js
function buildCalibration({ paths, ratesPath = ci.RATES_PATH, transcriptsRoot = null, window } = {}) {
  const effectiveWindow = window === undefined ? DEFAULT_WINDOW_OBJECTIVES : window;
  assertWindow(effectiveWindow);
  ...
  const projectRoots = ci.discoverProjects(paths);
  const windowed = applyWindow(projectRoots.map((root) => ci.collectProject(root)), effectiveWindow);
```

```js
  // Only a window that dropped something is an input: an absent key keeps the digest of an unwindowed build.
  if (windowBlock !== null) payload.window = { objectives: windowBlock.objectives };
```

Fixture spec shape (`__fixtures__/calibration-fixtures.cjs` header): `{name, objectives: [{dir, trds: [{nn, slug,
frontmatter, tasks, summary}]}], stateArchiveRows: ['| Objective 56 P01 | 11min | 3 tasks | 16 files |'], stateJson:
{metrics_log: [...]}}`. ALPHA_SPEC's priced token model is `claude-opus-5-5`.

CLI tests spawn the real binary with `--cwd`/HOME isolation and `--out <tmp>` (see `calibrate-cli.test.cjs` for the
helper); `calibrate-cli.test.cjs:191` currently asserts `written.version, 2`.
</codebase_examples>

<anti_patterns>
- Filtering objectives above `through` after `collectProject` (as the window does): the STATE_ARCHIVE metric counts in
  `sources` and the digest would still change when objective 68 adds a row. The cut must happen inside collection.
- Recording the effective window only when something was dropped. SC-2 asks the identity to name the parameters; the
  `window` block keeps describing what was dropped, the `method` block names what was asked.
- Making `minutes` change any statistic in the calibrator. The estimator applies the method; the calibrator records it.
- "Fixing" a failing old test by loosening it. Only the tests listed under "Deliberate test changes" change, and each is
  named in the SUMMARY with its before/after assertion.
</anti_patterns>

<error_recovery>
- A test outside the listed ones fails after the version bump: read it. If it asserts version 2 or the no-trace bytes of
  a built calibration, it belongs to the deliberate changes: update it the same way and add it to the SUMMARY list.
  Anything else is a real regression: fix the code, not the test.
- `scripts/estimate-window-eval.test.cjs` fails after the pin: the pin must not change any number (task_sum is today's
  behaviour). Revert the pin, re-run, and compare; report the difference instead of adjusting expectations.
- A spawned CLI test reaches `~/.claude`: it is missing `--out` or HOME isolation; fix the test before going on.
</error_recovery>

</embedded_context>

## Test list

Outermost first within each task. **FUTURE_SPEC** (name `future`, added to `calibration-fixtures.cjs` and exported with
a `pastSpec()` builder):
- objectives `64-a`, `65-b`, `66-c`: one TRD `01` each, two auto `code_tdd` tasks (`files: ['lib/x.cjs', 'lib/x.test.cjs']`,
  `tdd: true`), SUMMARY `duration: 20min`, `completed: 2026-10-0<n>` (64 → 01, 65 → 02, 66 → 03);
- objectives `67-d`, `68-e`, `69-f`, `70-g`, `71-h`, `72-i`: the same TRD shape, SUMMARY `duration: 90min`,
  `completed: 2026-10-2<n>`, `tokens_input: 5000000`, `tokens_output: 50000`, `token_model: claude-opus-5-5`;
- a directory `notes-x` (no number) with the same 90-minute TRD and SUMMARY;
- `stateArchiveRows`: one row per objective 64-72, e.g. `| Objective 64 P01 | 20min | 2 tasks | 2 files |` and
  `| Objective 68 P01 | 90min | 2 tasks | 2 files |`;
- `stateJson: {metrics_log: [{objective: '70', job: '70-01', duration: '90min', tasks: 2, files: 2}]}`.

`pastSpec()` returns FUTURE_SPEC (cloned) without `67-d`…`72-i` and `notes-x`, with only the 64-66 archive rows and
without `stateJson`, under the same name `future` (so the collectProject label is equal).

Task 1 (`calibration-inputs.test.cjs`):
1. `collectProject(future, {through: 66})`: `objectives` is `['64-a', '65-b', '66-c']`, `trds.length` 3, and
   `metrics.rows` 3 (the 67-72 archive rows and the state.json entry are not counted); `collectProject(future)` has 10
   objective directories and `metrics.rows` 10.
2. `collectProject(future, {through: 66})` deep-equals `collectProject(past, {through: 66})` on `objectives`, `trds`,
   `metrics` and `label` (the cut happens before anything is read).
3. Decimal and missing numbers: objectives `12-a`, `12.1-b`, `13-c`, `misc` with `through: 12` keep only `12-a`; with no
   `through` all four are kept.
4. `through: 0` keeps a `0-x` directory and drops `1-y`.
5. `assertThrough` throws `through must be a non-negative number or null` for -1, NaN, Infinity, '66', true; passes
   null, undefined, 0, 66, 12.5. `withinThrough('66-c', 66)` true, `withinThrough('68', 66)` false,
   `withinThrough('notes-x', 66)` false, `withinThrough('notes-x', null)` true.

Task 2 (`calibrator.test.cjs`):
6. **SC-3 proof.** For `minutes` in `task_sum` and `trd_level`, and for `window` undefined and null:
   `stableStringify(buildCalibration({paths: [future], through: 66, minutes, window, transcriptsRoot: null}))` equals the
   same call on `[past]`. Control: with `through` omitted the two strings differ (and `samples.trds` is 10 against 3),
   so the 67-72 data would change the file if it were read. Then `writeCalibration(tmp, futureCal)` followed by
   `writeCalibration(tmp, pastCal)` reports `changed: false`.
7. Identity: a default build of `past` has `version: 3` and `method` deep-equal
   `{minutes: 'task_sum', window_objectives: 10, through_objective: null}`; `{window: null}` gives
   `window_objectives: null`; `{window: 7, through: 66, minutes: 'trd_level'}` gives `{minutes: 'trd_level',
   window_objectives: 7, through_objective: 66}`.
8. Methods share the statistics: `task_sum` and `trd_level` builds of `past` have deep-equal `samples`, `sources`,
   `trd_level`, `task_classes`, `objective_level`, `probabilities`, `agent_overhead` and `data_as_of`; their
   `inputs_digest` differ; the `trd_level` build's last note is the minutes note above.
9. Through note and data: `buildCalibration({paths: [future], through: 66})` has `data_as_of` `2026-10-03` (not a 67-72
   date), `trd_level.minutes.max` 20 (no 90-minute TRD), and the through note in `notes`.
10. Byte identity: two builds with the same options give the same text; the same options with `through: 66` and
   `through: null` on `past` give equal statistic blocks and different `method` and `inputs_digest`.
11. Window after cutoff: `{paths: [future], through: 66, window: 2}` keeps `65-b` and `66-c`
    (`window.projects[0].first === '65-b'`, `last === '66-c'`, `samples.trds` 2).
12. Invalid `minutes` throws `minutes must be one of task_sum, trd_level`: `'trd-level'`, `'TRD_LEVEL'`, `''`, null, 5.
13. `MINUTES_METHODS` is `['task_sum', 'trd_level']`, `DEFAULT_MINUTES_METHOD` is `'task_sum'`, `CALIBRATION_VERSION`
    is 3.
14. `scripts/estimate-window-eval.test.cjs` passes unchanged after the pin, and `rg -n "minutes: 'task_sum'"
    scripts/estimate-window-eval.cjs` shows three call sites.

Task 3 (`calibrate-cli.test.cjs`, help tests):
15. Spawned `df-tools calibrate --paths <future> --no-overhead --minutes trd_level --through 66 --out <tmp>/c.json`: exit 0;
    stdout contains `minutes trd_level` and `through objective 66`; the file's `method` is
    `{minutes: 'trd_level', window_objectives: 10, through_objective: 66}` and `samples.trds` 3.
16. The same command again prints `unchanged`; the JSON form (no `--raw`) reports `changed: false` and carries `method`.
17. `--minutes task_sum` and no `--minutes` write byte-identical files.
18. Usage errors exit 1 and name the flag: `--minutes`, `--minutes trd-level`, `--minutes all`, `--through`,
    `--through -1`, `--through abc`, `--through 6x`.
19. `--dry-run --minutes trd_level --through 66` writes nothing; the result JSON carries `method`.
20. `help.cjs` usage and details for `calibrate`, USAGE in calibrate-cli.cjs and the df-tools.cjs header and
    `case 'calibrate'` comment name `--minutes <task_sum|trd_level>` and `--through <N>`; `dispatch-completeness.test.cjs`
    and the help tests pass.

**Deliberate test changes** (existing tests that assert what v3 changes; update each, list each in the SUMMARY):
- `calibrator.test.cjs` assertions of `version, 2` on built calibrations (about lines 243, 615, 840) → `CALIBRATION_VERSION`.
- 64-08 test "2: a window that drops nothing leaves no trace" and 64-10 tests "3" and "5": keep every assertion about
  the absent `window` key, equal statistic blocks, notes and `data_as_of`; replace the whole-text equality between
  different requested windows with (a) equality of everything except `method` and `inputs_digest`, and (b)
  `method.window_objectives` equal to the requested value. Whole-text equality still holds between builds with the same
  requested parameters (`{}` and `{window: 10}`), and the test asserts that too.
- `calibrate-cli.test.cjs:191` `written.version, 2` → 3.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FUTURE_SPEC fixture builder and the collection cutoff in calibration-inputs</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</files>
  <action>
First add `FUTURE_SPEC` and `pastSpec()` to `calibration-fixtures.cjs` exactly as the test list describes (literal
strings, no loops that invent values beyond the listed objectives; a small loop over the listed numbers is fine) and
export them. Then tests 1-5, one at a time: write the test, run
`node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs`, see it fail for the stated reason (for
test 1: `metrics.rows` 10, not 3), implement `assertThrough`, `withinThrough` and the `collectProject(root, {through})`
filters (Design), see it pass. Commit RED and GREEN separately.

# CRITICAL: filter dirNames before the loop that reads TRD and SUMMARY files, and filter metric rows before the
# counting loop. A row whose objective token has no number is dropped under a cutoff.
# PATTERN: objectiveNumber/rankObjectives already live in this file (TRD 64-08 region); put the new helpers beside them.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` passes, including tests 1-5
- `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` still passes (no behaviour change without `through`)
  </verify>
  <done>collectProject cuts at `through` before reading or counting anything; the fixture exists for Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Calibration v3 method block, minutes and through options, digest and notes; pin the 64 selection script</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs, scripts/estimate-window-eval.cjs</files>
  <action>
Tests 6-14 one at a time (RED, then GREEN), implementing the calibrator part of Design. Start with test 6 (the SC-3
proof) and its control; it fails first because `buildCalibration` ignores `through`. Then the identity (7), the
shared statistics (8), the note and data (9), byte identity (10), window after cutoff (11), validation (12) and the
constants (13). Make the deliberate test changes listed above as part of the GREEN step that bumps the version, and
name each in the commit body.

Then pin the selection script (Design) and run test 14:
`node --test scripts/estimate-window-eval.test.cjs`.

# CRITICAL: `method` holds the REQUESTED window (effectiveWindow) and through, even when nothing is dropped.
# GOTCHA: `inputsDigest` is called with the windowed project list; add the method object to its payload, do not
#         recompute it from the output.
# PATTERN: assertWindow / effectiveWindow for option handling.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs scripts/estimate-window-eval.test.cjs` passes
- `rg -n "CALIBRATION_VERSION = 3|DEFAULT_MINUTES_METHOD = 'task_sum'" plugins/devflow/devflow/bin/lib/calibrator.cjs` finds both
- `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` is still `9ef7d108…`
  </verify>
  <done>Calibration v3 names its method and parameters in the file and the digest; a through-66 calibration is provably
blind to objectives 67-72; the 64 selection script is pinned.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: `calibrate --minutes` and `--through` flags, summary text, help and header</name>
  <files>plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Tests 15-20 one at a time (RED, then GREEN), implementing the CLI part of Design, then the `calibrate-cli.test.cjs:191`
deliberate change. Update USAGE and the header comment of calibrate-cli.cjs (describe `minutes` and `through` the way
`window` is described), `help.cjs` usage and details, and the two df-tools.cjs comments.

Finish with the scoped suite and then the full suite:
`node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs`
then `npm test`. Record total/pass/fail/skipped in the SUMMARY. Known environment failures in a provisioned worktree
(66-01 SUMMARY): ten `node-pty` tests in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` (`Cannot find module
'node-pty'`, no `node_modules` in the worktree) and `roadmap-reconcile.test.cjs` E2E1 while this TRD's own SUMMARY
exists and its ROADMAP box is unticked. Any other failure is a regression of this TRD: fix the code.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs` passes, including tests 15-20
- `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --minutes nope --no-overhead --out <scratch>/never.json` exits 1, names `--minutes` and writes nothing
- `npm test` shows no failure beyond the known environment failures named in the action
  </verify>
  <done>`calibrate --minutes M --through N` works end to end, its result names the method, and the docs inside the CLI
name both flags.</done>
</task>

</tasks>

<verification>
- SC-2: the v3 file names `method {minutes, window_objectives, through_objective}`; the digest includes it; unchanged
  inputs and options give byte-identical text and `changed: false` (tests 6, 10, 16).
- SC-3 (code half): test 6 shows objectives 67-72 and a no-number directory, with their archive rows and metrics_log
  entry, leave a through-66 calibration byte-identical, with a control proving the data would otherwise change it.
- The live calibration hash is unchanged; nothing real was scored.
</verification>

<success_criteria>
- All 20 listed tests exist and pass; every deliberate test change is listed with before/after in the SUMMARY.
- `npm test` has no new failure.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-02-SUMMARY.md` via `summary post`, `requirements-completed: []`, with
the deliberate test changes, the RED/GREEN commit list and the suite numbers.
</output>
