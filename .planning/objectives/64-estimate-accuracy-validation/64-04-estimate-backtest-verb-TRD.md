---
objective: 64-estimate-accuracy-validation
trd: "04"
type: standard
wave: 2
depends_on: ["64-01", "64-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "`df-tools estimate backtest <N[,N...]> [--calibration <file>] [--raw]` compares every listed objective's estimate (estimateObjective with all: true) with its measured actuals through estimate-backtest.buildBacktest and prints JSON by default, the markdown report with --raw"
    - "The JSON carries the calibration used (path, version, data_as_of, samples, inputs_digest), the per-objective rows, the class tables, the summary and the verdict; it is rounded once at output, with ratios to 3 decimals and coverages to 4, and every verdict computed before rounding"
    - "The prospective run for each objective is looked up in the run history of the MAIN checkout (planning-mode.resolveMainRoot), so a backtest run from a worktree still finds Objective 63's run state"
    - "No usable calibration is `No estimate: <reason>`, exit 0; an objective that does not exist, a malformed list and an unreadable model-rates file exit 1"
    - "The report text names, per primary metric, the median ratio, objectives in band, objective and TRD P90 coverage, the SC2/SC3 verdicts, EST-08 met or not met, the miscalibrated classes, every exclusion with its TRD ids, and whether each executor estimate is prospective or reconstructed"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-cli.cjs
      provides: "the `backtest` subcommand (runBacktest) and its USAGE form"
    - path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
      provides: "backtestLine and backtestReport renderers; DECIMALS for ratio, median_ratio, pooled_ratio, coverage, trd_coverage, under_median_share"
    - path: plugins/devflow/devflow/bin/lib/help.cjs
      provides: "estimate help naming backtest"
  key_links:
    - "estimate backtest -> rollup.estimateObjective(cal, base, N, {all: true}) + ci.collectProject(root) + ci.loadRates() + store.latestRun(mainRoot, N) -> estimate-backtest.buildBacktest -> fmt.backtestReport"
    - "64-05 runs `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 --calibration <frozen copy>` live"
---

# TRD 64-04: `df-tools estimate backtest` (EST-08)

<objective>
Wire the comparison library (64-01) and the run history (64-02) into one verb, so the accuracy check is a command
anyone can rerun, not a scratch script:

```
df-tools estimate backtest <N[,N...]> [--calibration <file>] [--raw]
```

For each listed objective it estimates every TRD as the engine would before execution
(`estimateObjective(cal, base, N, {all: true})`), reads the measured actuals (`collectProject` over the checkout),
prices them (`loadRates()`, the shipped `references/model-rates.json`), finds the objective's last finished run state
in the main checkout's run history (`latestRun`), and hands all of it to `buildBacktest`. JSON by default; `--raw`
prints the markdown report that 64-05 pastes into the accuracy report.

`backtestLine(result)` is one line, for example (illustrative numbers):

```
Backtest 59, 60, 61, 62, 63: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 40 of 41 TRDs) · cost median ratio 0.98 (5 of 5, P90 5 of 5, 41 of 41) · EST-08 not met
```

`backtestReport(result)` is markdown, in this order:

1. `### Verdict` — one line per primary metric with SC2 and SC3 (`pass` / `fail` / `insufficient`) and the numbers
   behind them, then `EST-08: met|not met`.
2. `### Executor estimates against actuals` — one row per objective:
   `| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |`
   (an excluded metric shows `excluded: <reason> (<ids>)` in its cells), then a summary row per metric
   (median ratio, pooled ratio, in band, objective coverage, TRD coverage, share at or under median).
3. `### Wall time (prospective run states)` — per objective with a run state: estimate p50 / P90, actual, ratio,
   covered, `reproduced`; then the per-wave rows. `none recorded` when no objective has one.
4. `### Task classes` — two tables (minutes, cost): class, tasks, median ratio, coverage, flags/verdict.
5. `### Miscalibrated classes` — bullets, or `none`.
6. `### Exclusions` — every excluded metric with reason and TRD ids, or `none`.
7. A footer: calibration path, `data_as_of`, samples, `inputs_digest`, `band ±30%, coverage target 80%`.

Purpose: EST-08's report is reproducible with one command; later objectives can be checked the same way.
Output: the verb, its renderers, help, and tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(64-04): ...` RED, then `feat(64-04): ...` GREEN, one test at a time.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per
  Bash call.
- `runBacktest` follows the existing shape: pure, returns `{ok, result, text, exit}` or `{ok: false, message}`; the
  dispatcher's `case 'estimate'` already maps it (no dispatch change needed beyond the header comment).
- Tests never touch the real `~/.claude`: inject `DEVFLOW_CALIBRATION_PATH` / `--calibration` and
  `DEVFLOW_ESTIMATE_STATE_DIR`; spawn tests set `HOME` to a temp dir. Project trees come from
  `__fixtures__/backtest-fixtures.cjs` (`makeBacktestProject`, 64-01) and calibrations from
  `__fixtures__/estimate-fixtures.cjs` (`makeCalibration`, `writeCalibrationFile`); run states from
  `__fixtures__/estimate-run-fixtures.cjs` (64-02) archived with `store.archiveRunState`. Hand-built data only.
- `requirements: [EST-08]` names the requirement this TRD serves. **Do not run `requirements mark-complete EST-08`**;
  record `requirements-completed: []` (64-05 decides EST-08).
- Never write `~/.claude/devflow/calibration.json`. Never use port 8080.

## Test list

Outermost first.

`estimate-cli.test.cjs`:

1. Spawned `df-tools estimate backtest 90,91 --calibration <file> --raw` on the backtest fixture project: exit 0,
   stdout starts with `### Verdict`, contains `EST-08: not met` (2 objectives < MIN_OBJECTIVES gives `insufficient`)
   and `### Exclusions` naming `91-beta`'s TRD without a duration.
2. `runEstimate(['backtest', '90,91'])` JSON: `available: true`, `objectives.length` 2, `calibration` has `path`,
   `version`, `data_as_of`, `samples`, `inputs_digest`; `verdict.est08` `'not met'`; `line` equals
   `fmt.backtestLine(result)`; numbers rounded (a ratio has at most 3 decimals) while `within_band` matches the
   unrounded computation (fixture with a ratio of 1.3004: rounds to 1.3, `within_band` false).
3. A finished run state for objective 90 archived (64-02 store) under the injected state dir is used:
   `objectives[0].wall_minutes.source` is `'prospective'`; when the run state carries `estimate.execution`, the row's
   `agent_minutes.source` is `'prospective'`.
4. The history lookup uses the main checkout: running from a git worktree of the fixture project (create one with
   `git worktree add` in the test's temp dir, after `git init` + commit of the fixture) still finds the run archived
   under the main checkout's key. If creating a worktree in the test is impractical, unit-test the root choice through
   an exported `backtestRunRoot(base, deps)` with an injected `resolveMainRoot`.
5. No calibration: `No estimate: <reason>`, exit 0, `available: false`.
6. Usage errors exit 1: no positional, `59,,60`, `abc`, two positionals, an unknown flag. An unknown objective
   (`99`) exits 1 with `objective 99 not found`.
7. `USAGE` names all eight forms (`task`, `trd`, `objective`, `milestone`, `start`, `wave`, `finish`, `backtest`).

`estimate-format.test.cjs` (literal `buildBacktest`-shaped results from the 64-01 fixture builders):

8. `backtestLine` for a five-objective result: the exact string, in the format of the objective section's example
   line (that example's numbers are illustrative; the test's numbers come from its own fixture), and an `insufficient`
   metric printed as `insufficient (2 objectives)`.
9. `backtestReport`: section headings in the order listed; an excluded metric renders `excluded: incomplete actuals
   (91-01)`; `### Wall time` says `none recorded` without run states; `### Miscalibrated classes` lists
   `code_tdd (minutes): biased_high, median ratio 1.62, coverage 100%` style bullets, or `none`.
10. `roundResult` on a backtest result: `ratio` 3 decimals, `median_ratio`/`pooled_ratio` 3, `coverage`/`trd_coverage`/
    `under_median_share` 4, `actual` under `agent_minutes` 1, under `cost_usd` 4; booleans and strings untouched.

<embedded_context>

<codebase_examples>
The subcommand table and a handler to copy (estimate-cli.cjs):

```js
const SPECS = {
  ...
  objective: { values: ['calibration'], bools: ['all', 'table', 'line'], min: 1, max: 1, what: 'an objective number' },
  finish: { values: [], bools: [], min: 1, max: 1, what: 'an objective number' },
};
const OBJECTIVE_NUMBER = /^\d+(?:\.\d+)?$/;

function runObjective(parsed, env, base) {
  const loaded = loadCal(parsed.flags, env, base);
  if (!loaded.ok) return noEstimateResult(loaded, true);
  const all = parsed.bools.all === true;
  const { full, line, table } = objectiveOutput(rollup.estimateObjective(loaded.cal, base, parsed.positionals[0], { all }), loaded, all);
  const text = parsed.bools.table ? table : line;
  return { ok: true, result: { ...fmt.roundResult(full), line, table }, text, exit: 0 };
}
const runRoot = (base) => store.findProjectRoot(base) || base;
```

Add `backtest: { values: ['calibration'], bools: [], min: 1, max: 1, what: 'objective numbers, comma separated (59,60,61)' }`
and validate each comma piece against `OBJECTIVE_NUMBER` in `validate(parsed)` (an empty piece is a usage error).

The handler:

```
runBacktest(parsed, env, base):
  loaded = loadCal(...); !ok -> noEstimateResult(loaded, false)
  numbers = positional.split(',')
  root = runRoot(base)
  estimates = numbers.map(n => rollup.estimateObjective(loaded.cal, base, n, {all: true}))   // throws 'objective N not found' -> exit 1
  project = ci.collectProject(root)
  rates = ci.loadRates(); !rates.ok -> {ok: false, message: rates.error}
  historyRoot = require('./planning-mode.cjs').resolveMainRoot(base) || root
  runs = {}; for each estimate: runs[e.objective] = store.latestRun(historyRoot, e.objective, {env})
  bt = backtest.buildBacktest({estimates, project, rates, runs})
  calibration = {...loaded.meta, inputs_digest: loaded.cal.inputs_digest || null}
  full = {available: true, ...bt, calibration}
  line = fmt.backtestLine(full); report = fmt.backtestReport(full)
  return {ok: true, result: {...fmt.roundResult(full), line, report}, text: report, exit: 0}
```

`roundResult`'s nearest-key rule (estimate-format.cjs): a number takes the decimals of the nearest enclosing key in
`DECIMALS`; `n` is never rounded. Add `ratio: 3, median_ratio: 3, pooled_ratio: 3, coverage: 4, trd_coverage: 4,
under_median_share: 4`. `actual` has no entry, so it inherits from `agent_minutes` (1) or `cost_usd` (4) — that is the
intended result; `wall_minutes` likewise gives its `actual` 1 decimal.

The help entry to extend (help.cjs, `'estimate'`): add `| backtest <N[,N...]>` to `usage`, and to `details`:
"backtest <N[,N...]> compares each listed objective's estimate (every TRD, as before execution) with its measured
executor minutes (SUMMARY duration, else the STATE_ARCHIVE row) and priced SUMMARY tokens, uses the objective's last
finished run state when the run history holds one (prospective), and prints the EST-08 verdict: median within ±30%,
P90 covering at least 80% of objectives and TRDs; --raw prints the markdown report." Also mention that `finish`
archives the run to `<state dir>/history/<repo-key>/` (64-02). Update the `df-tools.cjs` header comment block
(lines ~170-183) with the `estimate backtest` line.
</codebase_examples>

<anti_patterns>
- Do not compute verdicts in the CLI or the renderer: they come from `buildBacktest` on unrounded numbers; the renderer
  only prints them.
- Do not look up run history with `runRoot(base)` alone: from a worktree that keys the worktree path and misses the run
  state the main checkout's `estimate start` wrote.
- Do not read `DEVFLOW_CALIBRATION_PATH` for anything but the calibration; the rates file is the shipped one.
- Do not print `all TRDs done` for a backtest: `--all` is implied.
</anti_patterns>

<error_recovery>
- `estimateObjective` throws for an objective without a directory: return `{ok: false, message}` (exit 1), as
  `objective` does.
- A project with no `.planning/objectives` (collectProject finds nothing): every objective is excluded with
  `incomplete actuals`, exit 0; the verdict is `insufficient`/`not met`.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/backtest-fixtures.cjs
@.planning/objectives/64-estimate-accuracy-validation/64-01-SUMMARY.md
@.planning/objectives/64-estimate-accuracy-validation/64-02-SUMMARY.md
</context>

<gotchas>
- estimate-cli.test.cjs has a test `USAGE names all seven forms`: update it to eight, do not delete it.
- `fmt.formatPercent` exists for coverage (`100%`, `80%`); reuse it and `formatMinutes` / `formatUsd` for cells.
- The fixture objective numbers 90/91 must not collide with the existing estimate-cli fixtures (80-83) if you reuse
  the same temp project; a separate project per describe block is simplest.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: The backtest subcommand — parsing, inputs, run-history lookup and JSON (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-cli.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Test-list items 2-7, one at a time (item 1 lands in Task 2 with the renderer). Implement `runBacktest` per
codebase_examples; `backtestLine`/`backtestReport` may be minimal stubs in estimate-format.cjs until Task 2 (a stub
that returns `''` keeps item 2's `line` assertion for Task 2 — write item 2's line assertion in Task 2). Add the SPECS
entry, the comma-list validation, the eighth USAGE form, the HANDLERS entry, the help.cjs `usage`/`details` text and
the df-tools.cjs header line. Update the estimate-cli.cjs module header (forms list).

# CRITICAL: verdicts come from buildBacktest; the CLI only rounds and renders.
# GOTCHA: `validate(parsed)` currently checks `OBJECTIVE_NUMBER` for objective-number subcommands; add the list rule for backtest only.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs estimate --help` lists `backtest`.</verify>
  <done>Items 2-7 pass; the JSON result carries calibration identity, rows, classes, summary and verdict; history is read from the main checkout.</done>
  <recovery>If the worktree test (item 4) is flaky in CI (git identity, signing), switch to the injected `backtestRunRoot(base, deps)` unit form named in the test list and record the choice in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: backtestLine, backtestReport and the rounding rules, then the spawned --raw report (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-format.cjs, plugins/devflow/devflow/bin/lib/estimate-format.test.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs</files>
  <action>
Test-list items 8-10, then item 1 (spawned `--raw`) and item 2's `line` assertion. Implement the two renderers in the
section order of the objective, using the existing helpers (`formatMinutes`, `formatUsd`, `formatPercent`, `plural`).
Add the DECIMALS entries. Export `backtestLine` and `backtestReport`.

Ratios print with 2 decimals in text (`1.51`), coverages as `n of m` plus percent where a share is shown; the JSON
keeps 3/4 decimals.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-backtest.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw` (read-only, real repo) prints the report with a `### Wall time` row for 63 showing `reproduced: yes`.</verify>
  <done>Items 1 and 8-10 pass; the live read-only smoke on 63 renders a report with its prospective wall row.</done>
  <recovery>If the live smoke on 63 finds no run state, check `ls ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/` (64-03 preserves it) and that the lookup root is the main checkout; record the outcome, the smoke is not a gate for this TRD.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-format.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- The scoped tests pass; `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` still passes.
- `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw` renders the report.
- `rg -n "backtest" plugins/devflow/devflow/bin/lib/help.cjs plugins/devflow/devflow/bin/df-tools.cjs` shows the help and header lines.
</verification>

<success_criteria>
- One command produces the EST-08 comparison, JSON or markdown, from the code-pinned rules.
- Prospective run states are found from any checkout of the repository.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-04-SUMMARY.md` with
`requirements-completed: []`.
</output>
