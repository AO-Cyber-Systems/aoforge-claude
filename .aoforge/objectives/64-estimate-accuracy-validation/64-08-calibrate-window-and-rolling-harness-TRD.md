---
objective: 64-estimate-accuracy-validation
trd: "08"
type: standard
wave: 6
depends_on: ["64-07"]
files_modified:
  - plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
  - plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - scripts/estimate-window-eval.cjs
  - scripts/estimate-rolling-backtest.cjs
  - scripts/estimate-rolling-backtest.test.cjs
autonomous: true
requirements: [EST-08]
gap_closure: true
must_haves:
  truths:
    - "`buildCalibration({paths, window})` with a positive integer W drops, per project and before any statistic, every TRD of the objectives ranked older than the W most recent objectives that have a sample (ordered by objective number, then directory name); `sources`, `samples`, `trd_level`, `task_classes`, `objective_level`, `probabilities`, `data_as_of` and `inputs_digest` all follow the retained TRDs, and agent overhead is not windowed"
    - "With `window` absent, `null`, or large enough to drop nothing, the output is byte-identical to today's: no `window` key, the same notes, the same digest; with a window that drops something the file carries a `window` block (objectives, and per project the first and last kept objective, the kept and dropped objective counts and the dropped TRD count) and one extra note"
    - "`df-tools calibrate --window <N|all>` passes the window through; `all` means no window; a zero, negative, fractional or non-numeric value is a usage error (exit 1); the summary line names the window; help and the df-tools header name the flag; the default stays OFF in this TRD"
    - "Windowing is the same selection the pre-registered sweep used: a calibration with `window: W` equals a calibration over a directory holding only the retained objectives, on every statistic block, and scripts/estimate-window-eval.cjs takes its objective ranking and windowing from the library, with its tests unchanged and its `report` JSON over the pre-59 snapshot hashing to the `selection_output_sha256` frozen in 64-DIAGNOSIS.md"
    - "`scripts/estimate-rolling-backtest.cjs` estimates each objective from its OWN calibration file, sends the estimates through `buildBacktest`, prints the verdict and, when both a `--old` and a `--new` set are given, the before/after table and `shipRule` (the pre-registered ship rule as tested code); a missing calibration is an exclusion, never a fallback; it never reads or writes a default calibration path"
    - "Nothing in this TRD scores objectives 59-63: every test uses hand-built fixtures, `estimate backtest` is not run, and the constants of `estimate-backtest.cjs` are untouched"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrator.cjs
      provides: "the `window` option, `applyWindow`, the `window` block, the extra note and the digest component"
    - path: plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
      provides: "objectiveNumber, rankObjectives, hasOutcome, windowObjectives (pure helpers shared by the calibrator and the evaluation scripts)"
    - path: plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
      provides: "the `--window <N|all>` flag, validation and summary text"
    - path: scripts/estimate-rolling-backtest.cjs
      provides: "rollingBacktest, shipRule and the CLI used by 64-09"
  key_links:
    - "calibrate --window W -> calibrator.buildCalibration({window}) -> calibration-inputs.windowObjectives -> filtered project -> every block"
    - "scripts/estimate-window-eval.cjs cutProject -> calibration-inputs.windowObjectives (single source of the ranking and the window)"
    - "64-09: calibrate --window all|W per cut -> scripts/estimate-rolling-backtest.cjs --old/--new -> buildBacktest -> shipRule"
---

# TRD 64-08: `calibrate --window` and the rolling-origin backtest harness (EST-08, gap closure)

## Precondition (read first)

Run `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md --field decision`.

- `stop`: change nothing. Write `64-08-SUMMARY.md` saying this TRD was skipped by the pre-registered stop rule in
  64-DIAGNOSIS.md (`requirements-completed: []`) and finish.
- `build_window`: continue. Also check `git log --format=%h -- .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md`
  lists exactly one commit (the doc is frozen). The window VALUE is not used in code here: the default stays off.

<objective>
64-07 diagnosed the minutes bias on pre-59 history and froze a method: a recency window for `calibrate`. This TRD builds
that capability and the instrument that will score it, and nothing else. It is deliberately all the code of the
validation: 64-09 then runs a frozen protocol with no code change allowed.

1. **`calibrate --window <N|all>`.** The calibrator keeps, per project, the N most recent objectives that have a sample
   (ordered by objective number, then directory name) and drops the TRDs of older objectives before any statistic. The
   default is off, so every existing output is byte-identical; 64-10 decides, by the pre-registered ship rule, whether
   the default becomes the frozen window.
2. **The rolling harness** `scripts/estimate-rolling-backtest.cjs`. `estimate backtest` takes one calibration; a
   leave-future-out backtest needs one per objective. The harness loads one calibration file per objective, estimates
   each objective with its own (`estimateObjective(cal, repo, N, {all: true})`), and sends the five estimates through
   `buildBacktest`: the same code that issued the 64-05 verdict. With a second set (`--new`) it prints the before/after
   table and applies `shipRule`, the ship rule frozen in 64-DIAGNOSIS.md section 7, as tested code written before any
   score exists.

Design (fixed here, so no judgement is needed while coding):

- The window is applied to the project list right after `collectProject`, so `sources`, `samples`, `trd_level`,
  `task_classes`, `objective_level`, `probabilities` and `data_as_of` all describe the retained TRDs. Agent overhead
  (from transcripts) is not windowed.
- A `window` block exists only when at least one objective was dropped: a window that drops nothing leaves no trace and
  no digest change, because the calibration is then identical.
- `calibration.version` stays 2: `window` is optional metadata the estimator ignores.

Purpose: a tested, opt-in recency window and a harness that applies the frozen protocol and ship rule mechanically.
Output: the library change, the CLI flag, the harness script, and the pre-59 selection reproduced through the library.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …`. One plain command per Bash call.
- **Never write `~/.claude/devflow/calibration.json`.** Tests use temp directories; the harness never imports
  `writeCalibration` or `defaultCalibrationPath` (a test reads its own source and asserts it). At the end
  `shasum -a 256 ~/.claude/devflow/calibration.json` is still `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`.
  Do not delete `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` or anything under `~/.claude/devflow/state/estimates/history/`.
- **Do not score 59-63.** No `estimate backtest`, no calibration of a 59-63 cut, no run of the harness on real data in this
  TRD. The only real-data command is the pre-59 `report` re-run in Task 1's verify.
- Do not change the constants of `estimate-backtest.cjs`, any threshold, any input or any actual.
- Strict TDD: write each test of the list, see it fail for the stated reason, implement, repeat. Fixtures are hand-built
  (`makeCalibrationProject`, `makeBacktestProject`, `makeCalibration`); no generated data, no property-based library, no `.feature` files.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never use port 8080.

## Test list

Outermost first within each task. **SLOPE fixture** (`makeCalibrationProject`, name `slope`): objectives `1-a` to `7-g`,
each with TRDs `01` and `02`, each TRD with two auto `code_tdd` tasks (`files: ['lib/x.cjs', 'lib/x.test.cjs']`,
`tdd: true`) and a SUMMARY `duration`: objectives 1-5 `40min` per TRD (task share 20), objectives 6-7 `10min` (share 5).
Unwindowed: 28 shares, eight of 5 and twenty of 20, nearest-rank p50 20; `window: 2` keeps 6-f and 7-g, every share is 5,
p50 5.

Task 1 (`calibration-inputs.test.cjs`, `calibrator.test.cjs`, `scripts/estimate-window-eval.test.cjs`):

1. `buildCalibration({paths: [slope], window: 2, transcriptsRoot: null})`: `task_classes.code_tdd.minutes.p50` 5 (unwindowed
   20), `samples.trds` 4, `trd_level.samples` 4, `window` equals `{objectives: 2, projects: [{project: 'slope', first: '6-f',
   last: '7-g', kept_objectives: 2, dropped_objectives: 5, dropped_trds: 10}]}`, `notes` has one more entry than the default
   (the window note), and `inputs_digest` differs from the unwindowed one.
2. No trace when nothing is dropped: `stableStringify` of `buildCalibration({paths})`, of `{window: null}` and of
   `{window: 7}` and `{window: 99}` are the same string; `Object.keys` has no `window`; `notes.length` is unchanged.
3. Numeric order: objectives `9-a`, `10-b`, `11-c` (two TRDs each, `10min`, `20min`, `30min`), window 2 keeps 10-b and
   11-c (`window.projects[0].first === '10-b'`); lexical order would keep 11 and 9.
4. An objective with no outcome (TRDs without SUMMARY) consumes no slot: `1-a`, `2-b` (no SUMMARY), `3-c`, `4-d`, window
   2 keeps 3-c and 4-d and drops 1-a and 2-b (`dropped_objectives` 2); window 3 keeps 1-a, 3-c, 4-d with 2-b between them
   untouched and drops nothing (no `window` key).
5. Downstream consistency (SLOPE, window 3): `sources[0].trds`, `samples.trds`, `samples.tasks`, `objective_level.samples`
   and `probabilities.gap_closure.n` count only retained TRDs; `data_as_of` equals the unwindowed value; two builds give the
   same digest; windows 2 and 3 give different digests.
6. Per project: two projects (two `makeCalibrationProject` roots), window 1 keeps each project's own latest objective.
7. Invalid windows throw `window must be a positive integer or null`: 0, -1, 1.5, '2', NaN, Infinity, true.
8. Equivalence with the directory-copy selection: SLOPE with `window: 3` and a calibration over a directory holding only
   objectives 5-e, 6-f, 7-g (copied) have deep-equal `samples`, `trd_level`, `task_classes`, `objective_level`,
   `probabilities` and `data_as_of`.
9. `calibration-inputs.test.cjs`: `objectiveNumber('12.1-x')` is 12.1, `objectiveNumber('foo')` is null;
   `rankObjectives(['9-a','10-b','10-c','10.5-d','11-e','foo'])` keeps that order; `hasOutcome` is true for a TRD with
   minutes or with both token counts and false for one token count or none;
   `windowObjectives(project, window)` returns `{kept, dropped, cutoff}` as described in the implementation.
10. `scripts/estimate-window-eval.test.cjs` items 1-18 still pass unchanged after the script takes its ranking and windowing
    from the library.

Task 2 (`calibrate-cli.test.cjs`):

11. Spawned `df-tools calibrate --paths <slope> --window 2 --no-overhead --out <tmp>/c.json`: exit 0; stdout names
    `window 2 objectives (dropped 10 TRDs)`; the file has `window.objectives` 2 and `samples.trds` 4.
12. `--window all` and no flag write byte-identical files (the default is off here).
13. Usage errors exit 1 and name the flag: `--window 0`, `--window -3`, `--window 2.5`, `--window abc`, `--window` (no value).
14. `--dry-run --window 2` writes nothing; the result JSON carries `window`; `changed` is computed as for any dry run.
15. `help.cjs` usage and details for `calibrate` and the header comment in df-tools.cjs name `--window <N|all>`;
    `dispatch-completeness.test.cjs` and the help tests pass.

Task 3 (`scripts/estimate-rolling-backtest.test.cjs`; fixture: `BACKTEST_SPEC` cloned with `91-beta` TRD 02 given
`duration: '12min'` and a third measured objective `92-gamma`; three hand-built calibrations from `makeCalibration` whose
`code_tdd` and `all` minutes p50 differ):

16. `rollingBacktest({base, old: {'90': calA, '91': calB, '92': calC}})`: each objective's `agent_minutes.p50` equals
    `estimateObjective(calX, base, N, {all: true}).execution.agent_minutes.p50`, and the three differ.
17. The verdict equals `buildBacktest` over the same three estimates (`est08`, `sc2`, `sc3`).
18. A missing calibration for objective 91: it is listed in `excluded_inputs` as `{objective: '91', reason: 'no calibration'}`,
    is not estimated with another objective's calibration, and with two objectives left the metrics are `insufficient`.
19. `shipRule(oldResult, newResult)`, table driven: (a) new `est08` met -> `ship_default` true; (b) new not met, minutes
    median closer to 1 (|ln|), no status that passed under old fails under new -> true; (c) improved but cost SC2
    passed under old and fails under new -> false with that regression listed; (d) new median farther from 1 -> false;
    (e) `insufficient` counts as not pass on both sides. The result carries `minutes_median_old`, `minutes_median_new`,
    `improved`, `regressions` and `reason`.
20. CLI `--old 90=<f> --old 91=<f> --old 92=<f> --raw`: exit 0, stdout contains `### Verdict` and `EST-08:`; with `--new` as
    well it prints a before/after table and a line `Ship default: true|false`; exits 1 for no `--old`, `--old 90` without
    `=file`, a missing file, an unreadable calibration (the `loadCalibration` reason is printed) and an unknown flag.
21. Isolation: the CLI runs with `HOME` pointed at an empty temp directory and afterwards that directory has no `.claude`;
    the script source contains neither `writeCalibration` nor `defaultCalibrationPath`.

<embedded_context>

<codebase_examples>
Library surface to add to `calibration-inputs.cjs` (pure, exported):

```js
objectiveNumber(dir)        // 58 from '58-engine', 12.1 from '12.1-x', null without a numeric prefix
rankObjectives(dirs)        // ascending by (number, name); names without a number last, by name; returns a new array
hasOutcome(trd)             // trd.minutes !== null || (summary tokens_input and tokens_output are numbers): the rule trdSample returns null on
windowObjectives(project, window)
  // ranked = rankObjectives(distinct trd.objective_dir); withOutcome = ranked dirs with at least one hasOutcome TRD
  // window null / 'all' / withOutcome.length <= window  -> { kept: ranked, dropped: [], cutoff: null }
  // otherwise cutoff = withOutcome[withOutcome.length - window]; dropped = every ranked dir before the cutoff
  //   (with or without outcomes); kept = the rest; -> { kept, dropped, cutoff }
```

The calibrator (`calibrator.cjs`):

```js
const DEFAULT_WINDOW_OBJECTIVES = null;            // 64-10 may set the frozen window here; null means all history
buildCalibration({paths, ratesPath, transcriptsRoot = null, window})   // window undefined -> DEFAULT_WINDOW_OBJECTIVES
// validate first: null or a positive integer, else throw new Error('window must be a positive integer or null')
// right after projectList is built:  const windowed = applyWindow(projectList, effectiveWindow)   // {projects, block}
// block: null when nothing was dropped, else
//   { objectives: W, projects: [{ project, first, last, kept_objectives, dropped_objectives, dropped_trds }] } (sorted by project)
//   first = cutoff dir, last = the newest dir with an outcome, kept_objectives = kept dirs with an outcome
// output: `window` key only when block !== null; notes gets one more entry when block !== null:
//   `Window: only the ${W} most recent objectives with samples (by objective number) are read per project; older objectives are dropped before every statistic. agent_overhead is not windowed.`
// inputsDigest payload gets `window: {objectives: W}` only when block !== null (an absent key keeps today's digest)
```

CLI (`calibrate-cli.cjs`): add `window` to VALUE_FLAGS; `all` -> `null`, a positive integer string -> number, anything else a
usage error naming `--window`; pass `window` (undefined when the flag is absent) to `buildCalibration`; result JSON gets
`window: calibration.window || null`; the summary text appends ` · window ${n} objectives (dropped ${d} TRDs)` after the
counts when `calibration.window` exists (n = `objectives`, d = the sum of `dropped_trds`). USAGE string gains
`[--window <N|all>]`; update the header comment of calibrate-cli.cjs, `help.cjs` (`usage` and one `details` sentence: the
window keeps the N most recent objectives with samples per project; `all` disables it) and the df-tools.cjs header and
case comment.

Harness (`scripts/estimate-rolling-backtest.cjs`) shape:

```js
rollingBacktest({ base, old, ratesFile })      // old: { '59': <loaded calibration object>, ... }
  // for each objective with a calibration: rollup.estimateObjective(cal, base, N, { all: true })
  // project = ci.collectProject(<same root choice as estimate-cli.cjs runRoot(base)>), rates = ci.loadRates(ratesFile)
  // -> { ...buildBacktest({ estimates, project, rates, runs: {} }), excluded_inputs: [{objective, reason}], calibrations: [{objective, data_as_of, samples, inputs_digest, window}] }
shipRule(oldResult, newResult) -> { est08_old, est08_new, minutes_median_old, minutes_median_new, improved, regressions, ship_default, reason }
//   improved    = |ln(new.summary.agent_minutes.median_ratio)| < |ln(old.summary.agent_minutes.median_ratio)|
//   regressions = [{ metric, sc }] for each of agent_minutes and cost_usd x sc2 and sc3 where old.verdict[sc][metric] === 'pass' and new's is not 'pass'
//   ship_default = new.verdict.est08 === 'met' || (improved && regressions.length === 0)
// CLI: --old N=<file> (repeatable, required) [--new N=<file> ...] [--repo <dir>] [--json <file>] [--raw]
//   JSON (default): { old, new?, ship? } rounded once with fmt.roundResult; --raw: for each set `### Verdict` ... via fmt.backtestReport
//   (calibration meta { path: 'rolling: one calibration per objective', data_as_of, samples, inputs_digest }),
//   then a before/after table (objective | minutes ratio old | new | cost ratio old | new), then `Ship default: true|false (reason)`.
```
</codebase_examples>

<anti_patterns>
- Do not default the window on in this TRD, and do not read `window_objectives` into code.
- Do not apply the window anywhere but right after `collectProject`; do not window `agent_overhead`.
- Do not round before a verdict: `shipRule` and `buildBacktest` decide on unrounded values; the CLI rounds once at output.
- Do not let the harness fall back to another calibration or to the default calibration path.
- Do not duplicate the ranking or the windowing in the scripts: they call the library.
</anti_patterns>

<error_recovery>
- A calibrator test that compares bytes fails after the change: the unset path changed. Diff `stableStringify` outputs;
  the usual cause is a `window: null` key or a notes entry added unconditionally.
- `dispatch-completeness` or a help test fails: the usage line in help.cjs and the df-tools.cjs header must name the same
  flags as `USAGE` in calibrate-cli.cjs.
- The pre-59 `report` re-run does not hash to `selection_output_sha256`: the script's windowing now differs from the
  frozen one. Do not edit the doc. Find the difference (the order of dirs with equal numbers, the outcome rule) with a
  failing test on the library helper, fix the helper, and re-run; report the cause in the SUMMARY.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
@plugins/devflow/devflow/bin/lib/calibrator.cjs
@plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
@scripts/estimate-window-eval.cjs
</context>

<gotchas>
- Three objective directories share the number 10 in real history; the ranking breaks ties by name, and each directory is
  one objective.
- `trdSample` returns null on `trd.minutes === null && !hasTokens`; `hasOutcome` must be the same predicate, and
  `trdSample` should call it so the two cannot drift (a refactor under green tests).
- `sourceCounts(project)` reads `project.trds`; filter the TRDs on a copy of the project (`{...project, trds: filtered}`),
  never mutate the collected one, because `metrics` and `counts` belong to the whole history.
- The CLI parser tolerates `--raw`; `--window` takes a value that does not start with `--`.
- CLAUDE.md names `df-tools` commands in backticks and `dispatch-completeness.test.cjs` rejects a bare name that is not a
  command; flags such as `--window` are fine, but do not add a bare backticked word that is not a COMMANDS key.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: The window in the library — shared helpers, applyWindow, the block, the note, the digest; scripts take the library's windowing (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs, plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs, scripts/estimate-window-eval.cjs</files>
  <action>
Test-list items 1-10, outermost first (1, 2, 5, 6, 8, then 3, 4, 7, 9, then 10 at the end). Add the pure helpers to
calibration-inputs.cjs and export them; add `DEFAULT_WINDOW_OBJECTIVES` (null), the `window` option, `applyWindow` and the
validation to calibrator.cjs and export `DEFAULT_WINDOW_OBJECTIVES`; make `trdSample` use `ci.hasOutcome`. Then change
scripts/estimate-window-eval.cjs so `objectiveNumber` and `rankObjectives` are the library's (re-exported under the same
names) and `cutProject` selects with `ci.windowObjectives` on the project filtered to objectives numbered below `before`;
its 18 tests must stay green unchanged.

Pseudocode for `applyWindow(projectList, window)`:

1. If `window === null`: return `{projects: projectList, block: null}`.
2. For each project: `w = ci.windowObjectives(project, window)`; if `w.dropped.length === 0`, keep the project as is.
   Otherwise `kept = new Set(w.kept)`, `trds = project.trds.filter(t => kept.has(t.objective_dir))`, new project
   `{...project, trds}`, and an entry `{project: project.label, first: w.cutoff, last: newest dir with an outcome,
   kept_objectives, dropped_objectives: w.dropped.length, dropped_trds: project.trds.length - trds.length}`.
3. `block = entries.length === 0 ? null : {objectives: window, projects: entries sorted by project}`.

# CRITICAL: filter a COPY of each project; metrics and counts belong to the whole history.
# GOTCHA: the window note and the digest component exist only when `block !== null`.
# PATTERN: existing blocks in buildCalibration; keep key order irrelevant (stableStringify sorts keys).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs plugins/devflow/devflow/bin/lib/calibrator.test.cjs scripts/estimate-window-eval.test.cjs` passes. Then the reproduction check on pre-59 data only: `git archive --format=tar -o <scratch>/pre59.tar 401a9145^ .planning`, extract to `<scratch>/pre59`, run `node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/diagnosis-again.json` and `shasum -a 256 <scratch>/diagnosis-again.json` equals `selection_output_sha256` in 64-DIAGNOSIS.md.</verify>
  <done>Items 1-10 pass; the default build is byte-identical; the selection reproduces through the library helpers.</done>
  <recovery>If the digest check fails, see error_recovery; do not change the frozen doc. If `calibrator.test.cjs` has a golden that the refactor of `trdSample` breaks, revert that refactor and keep a duplicate predicate with a test that asserts the two agree.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `calibrate --window <N|all>` — flag, validation, summary line, help (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Test-list items 11-15, one at a time. Implement per codebase_examples (`calibrate-cli.cjs` section). Keep the usage-error
style of the existing flags (`usageError(message)` appends the USAGE line). Update the `help.cjs` entry and the two
df-tools.cjs comment sites.

# CRITICAL: the flag absent is `undefined` (the library default), `all` is `null` (explicitly no window); they are different today only in intent but 64-10 may make them differ in output.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --window 0` exits 1 with a message naming `--window`; `node plugins/devflow/devflow/bin/df-tools.cjs help calibrate` lists `--window <N|all>`.</verify>
  <done>Items 11-15 pass; the flag is documented in help and the header; the default remains off.</done>
  <recovery>If the help or dispatch test names a mismatch, align help.cjs `usage`, the df-tools.cjs header and `USAGE` in calibrate-cli.cjs character for character on the flag list.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: scripts/estimate-rolling-backtest.cjs — one calibration per objective, buildBacktest, shipRule, before/after (RED then GREEN)</name>
  <files>scripts/estimate-rolling-backtest.cjs, scripts/estimate-rolling-backtest.test.cjs</files>
  <action>
Test-list items 16-21, outermost first (20, then 16-19, then 21). Implement `rollingBacktest`, `shipRule`, the markdown
renderer (reuse `estimate-format.cjs` `backtestReport` and `roundResult`) and the CLI per codebase_examples. Load each
`--old`/`--new` file with `estimate.loadCalibration(file)` (it validates version and classifier) and print its `reason`
on failure. The root of the project is the same as `estimate-cli.cjs` `runRoot` (read it and mirror it). Header comment:
what the script is for (EST-08 leave-future-out validation of objective 64), that it reads calibrations only from the
files named on the command line, and that it never writes any calibration.

# CRITICAL: `shipRule` is the ship rule of 64-DIAGNOSIS.md section 7 word for word; do not add a condition.
# GOTCHA: `roundResult` is for output only; call `shipRule` on the unrounded results.
  </action>
  <verify>`node --test scripts/estimate-rolling-backtest.test.cjs` passes; `node scripts/estimate-rolling-backtest.cjs` with no flags exits 1 with a usage line; `git status --short plugins/devflow/devflow/bin/lib/estimate-backtest.cjs` prints nothing.</verify>
  <done>Items 16-21 pass; the protocol's scoring and ship rule exist as tested code before any 59-63 calibration is built.</done>
  <recovery>If a fixture objective is excluded as `incomplete actuals`, check that every TRD of that fixture objective has a SUMMARY duration and tokens (the `BACKTEST_SPEC` 91-beta TRD 02 has none until it is given one).</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs scripts/estimate-window-eval.test.cjs scripts/estimate-rolling-backtest.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- The scoped tests and `npm test` pass; `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` still passes.
- `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <fixture or snapshot> --no-overhead --window all --out <scratch>/a.json` and the same without `--window` write identical bytes.
- `git diff --stat` for the TRD's commits names no `estimate-backtest.cjs`; `shasum -a 256 ~/.claude/devflow/calibration.json` is `5cf42c4b…`.
</verification>

<success_criteria>
- `calibrate --window` exists, is tested, and is off by default.
- The pre-59 selection reproduces through the library; the rolling harness and the ship rule exist as tested code.
- Nothing about 59-63 has been scored.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-08-SUMMARY.md` with
`requirements-completed: []`. State the reproduced digest and that no 59-63 score was produced.
</output>
