---
objective: 58-estimation-engine-and-surfacing
trd: "08"
type: standard
wave: 5
depends_on: ["58-04", "58-07"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-format.cjs
  - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
  - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [EST-02, EST-03, EST-05]
must_haves:
  truths:
    - "`df-tools estimate task --files <a,b> [--tdd] | --class <c> | --checkpoint` prints the class, median and P90 minutes, tokens and dollars, the sample count and the confidence label (JSON by default, one line with --raw)"
    - "`df-tools estimate trd <id|path>`, `estimate objective <N> [--all]` and `estimate milestone [vX.Y]` print the composed estimate; objective and milestone render a markdown table with --table and one line with --line"
    - "With no usable calibration every estimate verb exits 0 and says `No estimate: <reason>` naming `df-tools calibrate`, never a number"
    - "`estimate start <N>` writes the run state the status line reads; `estimate wave <N> <W> --start|--done` records wave timing and --done prints actual against the estimate with a verdict; `estimate finish <N>` prints the objective's actual against estimate and is idempotent"
    - "Numbers are rounded once, at output (minutes 1 decimal, tokens whole, dollars 4 decimals in JSON, 2 in text)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-format.cjs
      provides: "formatMinutes, formatTokens, formatUsd, roundResult, verdict, taskLine, trdLine, objectiveLine, objectiveTable, milestoneLine, milestoneTable, waveStartLine, waveDoneLine, finishLine"
    - path: plugins/devflow/devflow/bin/lib/estimate-cli.cjs
      provides: "runEstimate({argv, cwd, env, now}), USAGE"
  key_links:
    - "df-tools.cjs case 'estimate' -> estimate-cli.runEstimate -> estimate / estimate-rollup / estimate-milestone -> estimate-format"
    - "estimate start|wave|finish -> estimate-run-store.writeRunState (58-04) -> statusline segment"
    - "58-09 plan-objective, planner, build and execute-objective prose call these verbs"
---

# TRD 58-08: `df-tools estimate` (EST-02, EST-03, EST-05)

<objective>
Wire the engine to the command line, with text renderers the planner, build and execute-objective prose paste verbatim,
and the run verbs that keep the status line's state file current.

```
df-tools estimate task (--files <a[,b]> [--tdd] [--trd-type <t>] | --class <name> | --checkpoint) [--calibration <file>] [--raw]
df-tools estimate trd <trd-id|path> [--calibration <file>] [--raw]
df-tools estimate objective <N> [--all] [--table|--line] [--calibration <file>] [--raw]
df-tools estimate milestone [vX.Y] [--table|--line] [--calibration <file>] [--raw]
df-tools estimate start <N> [--calibration <file>] [--raw]
df-tools estimate wave <N> <wave> (--start|--done) [--raw]
df-tools estimate finish <N> [--raw]
```

JSON by default (rounded; objective and milestone results include `line` and `table`); `--raw` prints the text
(`--table` for objective/milestone, otherwise the one line). Calibration path: `--calibration`, else
`DEVFLOW_CALIBRATION_PATH`, else `~/.claude/devflow/calibration.json`. Exit 0 for every estimate, including "no
estimate"; exit 1 for usage errors and an objective or TRD that does not exist.

Run verbs (the status line's only writer; state in 58-04's store):

- `start <N>`: estimate the objective's remaining TRDs; write state `{version: 1, objective, started_at: now,
  updated_at: now, finished_at: null, estimate: {line, wall_minutes: execution.wall_minutes, confidence}, waves:
  [{wave, trds, p50, p90, started_at: null, finished_at: null, actual_minutes: null}]}`; print the objective line.
  With no calibration the waves carry null estimates and the line says why.
- `wave <N> <W> --start`: no live state for N (missing, other objective, finished or stale) -> run `start` first. A wave
  missing from the state (e.g. a gap-closure wave) is added from a fresh estimate, or with null estimates. Set
  `started_at` if unset; print `Wave W estimate: ...`.
- `wave <N> <W> --done`: set `finished_at`, `actual_minutes`; print actual vs estimate and the verdict
  (`at or under median`, `within P90`, `over P90`). No state: `Wave W: actual unknown (no run state)`, exit 0.
- `finish <N>`: set `finished_at` once; print `Objective N execution: actual ... · estimate ... · <verdict>` against
  the execution (waves-only) estimate, because the run ends at execute-objective's aggregate step. A second call
  reprints the same line from the stored times.

Purpose: EST-02 and EST-03 at the command line; EST-05's run state, wave reports and finish line.
Output: estimate-format.cjs, estimate-cli.cjs (+ tests), the dispatcher case, help entry and header doc lines.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                      ← MODIFY (case 'estimate', header doc)
└── lib/
    ├── estimate-format.cjs           ← CREATE
    ├── estimate-format.test.cjs      ← CREATE
    ├── estimate-cli.cjs              ← CREATE
    ├── estimate-cli.test.cjs         ← CREATE
    └── help.cjs                      ← MODIFY (COMMANDS.estimate)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-08): ...` RED, then `feat(58-08): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- `runEstimate({argv, cwd, env, now})` is pure apart from the state write: unit tests call it directly with an injected
  `now` (epoch ms), a fixture project as cwd, `--calibration <temp file>` and `env.DEVFLOW_ESTIMATE_STATE_DIR` set to a
  temp dir. Spawn tests set `HOME` to a temp dir, strip `DEVFLOW_CALIBRATION_PATH` unless the test sets it, and set
  `DEVFLOW_ESTIMATE_STATE_DIR`. Nothing reads or writes the real `~/.claude`.
- Fixtures: `MILESTONE_SPEC`, `CAL_V2`, `writeCalibrationFile` from estimate-fixtures.cjs. Literal expected strings.

## Test list

Outermost first.

`estimate-cli.test.cjs`, spawned (`node plugins/devflow/devflow/bin/df-tools.cjs ...`):

1. `estimate` with no subcommand exits 1 with the usage line; `estimate --help` exits 0 and prints it.
2. In the MILESTONE fixture with `DEVFLOW_CALIBRATION_PATH=<CAL_V2 file>`: `estimate objective 80 --table --raw` prints
   a table whose first line is `| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |`; `estimate task --class
   code_tdd --raw` prints exactly one line starting `Task code_tdd: 6 min (P90 18 min)`.
3. Fake HOME, no calibration file: `estimate objective 80 --raw` exits 0 and prints a line starting `No estimate:` that
   contains `df-tools calibrate`.

`estimate-cli.test.cjs`, direct `runEstimate` (T0 = `Date.parse('2026-10-05T18:00:00.000Z')`):

4. `task --files lib/a.cjs,lib/a.test.cjs --tdd`: result class `code_tdd`, minutes `{p50: 6, p90: 18, n: 32}`, samples
   30, confidence high; text `Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.40 (P90 $2.20) · n=30,
   confidence high`. `task --class config` text ends with `(config has 2 samples; using all tasks)`. `task --checkpoint`
   gives `Task checkpoint: human wait, not estimated`. No selector, `--files` with `--class`, or `--class nope` -> usage
   error (the last lists the classes).
5. `trd 80-01`: text `TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 2 tasks · confidence high`.
6. `objective 80`: JSON `total.wall_minutes` `{p50: 25.6, p90: 69.2}` (rounded), `line` and `table` present, and
   `calibration` `{path, version: 2, data_as_of: '2026-10-05'}`. `objective 81 --line` contains `unplanned, from 30 past
   objectives` and `confidence low`; `objective 82 --line` is `Objective 82: all TRDs done (1 of 1)`; `objective 99` -> error
   `objective 99 not found`.
7. `milestone --table`: rows for 80, 81 and 83, a bold total row, `Done: 82. Cancelled: 84.`; `milestone v0.9 --line`
   contains `no objectives left`.
8. `start 80` at T0: the state file `statePath(root, {env})` holds objective `'80'`, 2 waves (`trds` [80-01, 80-02] and
   [80-03]), wave 1 p50 about 12.26; text equals `objective 80 --line`'s text.
9. `wave 80 1 --start` at T0, `wave 80 1 --done` at T0 + 14 min: text `Wave 1: actual 14 min · estimate 12 min median,
   P90 36 min · within P90`. `wave 80 2 --start` at T0 + 15 min: the store's `remainingMinutes(state, T0 + 20 min)` is
   about 1 (wave 2's 6 minus 5 elapsed), wave 2.
10. With no state: `wave 81 1 --start` creates one (unplanned, wave 1 added with null estimates) and prints
    `Wave 1: no estimate`; `wave 80 1 --done` prints `Wave 1: actual unknown (no run state)`, exit 0; `--start --done`
    together is a usage error.
11. `finish 80` at T0 + 30 min (after test 9's calls): `Objective 80 execution: actual 30 min · estimate 19 min median,
    P90 52 min · within P90`; `finish 80` again at T0 + 60 min prints the same line; the store's `formatStatusSegment`
    is then `''`.

`estimate-format.test.cjs` (pure, literal inputs):

12. `formatMinutes`: 5.04 -> `5 min`; 59.6 -> `1h 00m`; 75 -> `1h 15m`; 125 -> `2h 05m`; null -> `n/a`.
    `formatTokens`: 3600000 -> `3.6M`; 21000000 -> `21.0M`; 29000 -> `29K`; 950 -> `950`. `formatUsd`: 1.4 -> `$1.40`.
13. `roundResult`: under `minutes`, `wall_minutes`, `agent_minutes` -> 1 decimal; `tokens_input`, `tokens_output` ->
    whole; `cost_usd` -> 4 decimals; `probability` -> 4 decimals; other keys untouched; input not mutated.
14. `verdict(5, {p50: 6, p90: 18})` `at or under median`; `(14, {p50: 12.26, p90: 36})` `within P90`; `(40, {p50: 12,
    p90: 36})` `over P90`; a null estimate gives null.
15. `objectiveTable(OBJ_RESULT)` and `objectiveLine(OBJ_RESULT)` equal the literal strings below; so do
    `milestoneTable(MS_RESULT)` and `milestoneLine(MS_RESULT)`.

`OBJ_RESULT` (literal in the test): objective `'80'`, status `partial`, trds `{total: 4, done: 1, remaining: 3}`, 2
waves, total wall 25.6464 / 69.1577, agent 30.1 / 75.2, tokens_input 12400000 / 21000000, tokens_output 98000 / 170000,
cost 6.8 / 10.9, overhead `[{agent: 'verifier', spawns: 1}]`, gap_closure `{probability: 0.1, n: 40, extra:
{wall_minutes: {p50: 31, p90: 70}, cost_usd: {p50: 5.8, p90: 10}}}`, confidence `medium`, weakest `{name: '80-02',
class: 'doc', n: 10}`, calibration `{data_as_of: '2026-10-05', samples: {trds: 50}}`:

```
| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |
|---|---|---|
| Wall time | 26 min | 1h 09m |
| Agent time | 30 min | 1h 15m |
| Tokens in / out | 12.4M / 98K | 21.0M / 170K |
| Cost | $6.80 | $10.90 |

Includes 1 verifier spawn and gap closure (10% likely, n=40; +31 min, +$5.80 if it happens). Confidence: medium (weakest: 80-02 doc, n=10). Calibration 2026-10-05, 50 TRDs.
```

`Objective 80 estimate: 26 min median (P90 1h 09m) wall · $6.80 (P90 $10.90) · 3 TRDs left in 2 waves · confidence medium`

`MS_RESULT`: version `v1.0`; objectives 80 (partial, 3 of 4 left, wall 25.6464 / 69.1577, cost 6.8, medium), 81
(unplanned, wall 62.2252 / 184.6035, cost 17.9788, low), 82 (done), 83 (planned, 1 TRD, wall 8.9727 / 23.5003, cost 2.1,
medium), 84 (cancelled); overhead integration-checker 1; total wall 109.2527 / 276.3459, cost 29.4 / 58.1; confidence
low; weakest `{name: '81', status: 'unplanned'}`:

```
| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |
|---|---|---|---|---|---|
| 80 Alpha | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $6.80 | medium |
| 81 Beta | unplanned | 1h 02m | 3h 05m | $17.98 | low |
| 83 Delta | planned, 1 TRD | 9 min | 24 min | $2.10 | medium |
| **v1.0 total (3 objectives left)** | | **1h 49m** | **4h 36m** | **$29.40** | **low** |

Done: 82. Cancelled: 84. Includes 1 integration-checker spawn. Confidence: low (weakest: 81 unplanned).
```

`Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $29.40 (P90 $58.10) · 3 objectives left (1 unplanned) · confidence low`

<embedded_context>

<codebase_examples>
CLI front-end shape to copy (calibrate-cli.cjs, 57-06): a pure `run*` returning `{ok, result, text, exit}` or `{ok:
false, message}`, `parseArgs` with VALUE_FLAGS / BOOL_FLAGS, usage errors as `${message}\nUsage: ${USAGE}`. Dispatcher
case (df-tools.cjs):

```js
case 'calibrate': {
  // df-tools calibrate [--paths a,b] [--out file] [--rates file] [--dry-run] — TRD 57-06
  const { output: outputCalibrate } = require('./lib/helpers.cjs');
  const { runCalibrate } = require('./lib/calibrate-cli.cjs');
  const r = runCalibrate({ argv: args.slice(1), cwd, env: process.env });
  if (!r.ok) error(r.message);
  outputCalibrate(r.result, raw, r.text, r.exit || 0);
  break;
}
```

`helpers.output(result, raw, rawValue, exitCode)` prints `rawValue` under `--raw`, else the JSON. help.cjs entry shape:
`'calibrate': { usage: 'df-tools calibrate ...', summary: '...', mutates: true, details: '...' }`.

Engine surface: `estimate.loadCalibration(file, env)`, `estimateTask`, `estimateTrd(cal, cwd, ref)` (58-05);
`estimate-rollup.estimateObjective(cal, cwd, n, {all})` (58-06); `estimate-milestone.estimateMilestone(cal, cwd,
{version})` (58-07); `estimate-run-store.findProjectRoot / readRunState / writeRunState / remainingMinutes /
formatStatusSegment / STALE_MS` (58-04).
</codebase_examples>

<anti_patterns>
- Printing an estimate number when calibration is missing or unusable. The text is `No estimate: <reason>`.
- Rounding before composing. The engine returns raw numbers; `roundResult` and the formatters round at output only.
- Reading the real clock inside `runEstimate`. Use the injected `now` (the dispatcher passes `Date.now`).
- Writing run state anywhere but the store (never `.planning/`).
</anti_patterns>

<error_recovery>
- If dispatch-completeness fails with `Unknown command: estimate`, the case is missing or misspelled in df-tools.cjs.
- If help.test.cjs fails, the COMMANDS key or the `df-tools estimate` usage prefix is wrong.
- If a formatter string differs only in rounding, check `Math.round` before splitting hours and minutes (59.6 must give
  `1h 00m`, never `0h 60m`).
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
@plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
@plugins/devflow/devflow/bin/lib/estimate-milestone.cjs
@plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
</context>

<gotchas>
- The table's first column header counts remaining TRDs and waves; `1 TRD` / `1 wave` in the singular.
- Footer pieces are joined in this order: overhead (`Includes N <agent> spawn(s)` plus ` and gap closure (...)` when
  present), `Confidence: <label> (weakest: <name>[ <class|status>][, n=<n>])`, then `Calibration <data_as_of>, <trds>
  TRDs.` Notes (checkpoint TRDs, unplanned basis, missing data) follow on their own lines prefixed `Note: `.
- Unplanned objective table (`estimate objective 81 --table`): the header is `| Objective 81 (unplanned) | Median | P90 |`,
  the first row is labelled `Wall time (serial, unplanned)`, there is no separate Agent time row, and a `Note:` line
  says the figures come from N past objectives because the objective has no TRDs yet.
- help.cjs `estimate` entry: `mutates: true` (start/wave/finish write the run state); details name the calibration and
  state-dir env overrides (`DEVFLOW_CALIBRATION_PATH`, `DEVFLOW_ESTIMATE_STATE_DIR`) and the exit codes.
- df-tools.cjs header: add the seven `estimate` forms under "Estimation data:".
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Text renderers and output rounding (estimate-format.cjs)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-format.cjs, plugins/devflow/devflow/bin/lib/estimate-format.test.cjs</files>
  <action>
RED: tests 12-15 (OBJ_RESULT, MS_RESULT and the expected strings as literals in the test). Commit
`test(58-08): estimate text renderers`.

GREEN: implement the exports listed in must_haves.artifacts as pure functions. `taskLine` covers the fallback suffix,
the checkpoint form and `No estimate: <reason>` for `{available: false}`; `trdLine`, `objectiveLine` (planned, partial,
unplanned, done, unavailable), `objectiveTable`, `milestoneLine`, `milestoneTable`, `waveStartLine({wave, p50, p90})`,
`waveDoneLine({wave, actual, p50, p90})`, `finishLine({objective, actual, wall})`. `verdict(actual, {p50, p90})`.
Commit `feat(58-08): estimate text renderers`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs` passes.</verify>
  <done>Tests 12-15 pass after a recorded RED; strings match the literals byte for byte.</done>
  <recovery>If a literal looks wrong on inspection (not just the implementation), fix the literal only when the rule in gotchas supports the new text, and record it as a deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: estimate task|trd|objective|milestone, dispatcher and help</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-cli.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 1-7. Commit `test(58-08): df-tools estimate task, trd, objective and milestone`.

GREEN:
1. estimate-cli.cjs: `USAGE` (the seven forms), `parseArgs` per subcommand, `runEstimate({argv, cwd = process.cwd(),
   env = process.env, now = Date.now()})`. Load calibration once; unavailable -> `{ok: true, result: {available:
   false, reason, calibration_path}, text: 'No estimate: ' + reason, exit: 0}`. Attach `calibration: {path, version,
   data_as_of, samples}` to results; `roundResult` the JSON; set `line` / `table`.
2. df-tools.cjs: `case 'estimate'` mirroring `calibrate`, passing `now: Date.now()`; header doc lines.
3. help.cjs: `COMMANDS.estimate` per gotchas.
Commit `feat(58-08): df-tools estimate task, trd, objective and milestone`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` passes tests 1-7 and the help/dispatch suites.</verify>
  <done>Tests 1-7 pass after a recorded RED; `estimate` is dispatched and documented in help.</done>
  <recovery>If the spawned test cannot find the fixture objective, pass `--cwd <fixture root>` before `estimate` (the global flag) instead of relying on the child's cwd.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: estimate start|wave|finish (run state for the status line and wave reports)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-cli.cjs, plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs</files>
  <action>
RED: tests 8-11 (sequential calls sharing one state dir and fixture project, `now` injected). Commit
`test(58-08): estimate run verbs record waves against the estimate`.

GREEN: `start`, `wave --start|--done`, `finish` per the objective's run-verb rules, through `estimate-run-store`
(`findProjectRoot(cwd) || cwd` as the project root, `{env}` passed through). Every write sets `updated_at = now`.
Times are ISO strings of the injected `now`; `actual_minutes = (finished - started) / 60000`.
Commit `feat(58-08): estimate start, wave and finish`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` passes all tests.</verify>
  <done>Tests 8-11 pass after a recorded RED; finish is idempotent; the state file is written only under the state dir.</done>
  <recovery>If test 9's remaining time is off by the whole wave, `wave --start` did not set `started_at` (it must set it only when unset) or did not bump `updated_at`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 1: `df-tools estimate task` returns median and P90 minutes, tokens and dollars with sample count and
  confidence label (tests 2, 4).
- Success criterion 2: `estimate trd|objective|milestone` compose and include overhead and the gap-closure factor
  (tests 5-7).
- EST-05 plumbing: start/wave/finish keep the status line's state and print actual against estimate (tests 8-11).
</verification>

<success_criteria>
- estimate-format and estimate-cli suites pass; help and dispatch-completeness stay green.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-08-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Paste the usage block and one example of each text form; 58-09 embeds them in prose.
</output>
