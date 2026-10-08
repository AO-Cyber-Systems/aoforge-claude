---
objective: 64-estimate-accuracy-validation
trd: "07"
type: standard
wave: 5
depends_on: ["64-06"]
files_modified:
  - scripts/estimate-window-eval.cjs
  - scripts/estimate-window-eval.test.cjs
  - .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
autonomous: true
requirements: [EST-08]
gap_closure: true
must_haves:
  truths:
    - "Every number in the diagnosis comes from the repository as it stood before objective 59's first commit (`git archive 401a9145^ .planning`); no SUMMARY, actual, calibration or backtest of objectives 59-63 is read, and the extracted snapshot lists no objective numbered 59 or above"
    - "Each suspect for the minutes bias (older or slower history, the duration source, executor overhead counted twice, the classifier sending tasks to the wrong class, TRD minutes against task count, the composition of TRDs into an objective) is tested with a printed number and given a one-sentence verdict (`supported`, `not supported` or `inconclusive`) in 64-DIAGNOSIS.md"
    - "A recency window for `calibrate` is selected only by the pre-registered rolling-origin rule on objectives 46-58 of the snapshot, over the fixed grid {10, 15, 20, 30, 40} against all-history; the doc records the table, the rule, the decision (`build_window` with a window of N objectives, or `stop`) and the sha256 of the script's JSON output"
    - "Before any windowed calibration is scored on 59-63, the committed doc freezes the validation protocol and the ship rule (verbatim from this TRD), the provenance of the protocol, and the noise floor of the SC2 test (the share of 5-objective samples of pre-59 ratios whose median lands in band)"
    - "`scripts/estimate-window-eval.cjs` is built test first with hand-built fixtures; its JSON output has no filesystem path and no timestamp and is identical on two runs"
    - "No file under plugins/ changes in this TRD, the constants of `estimate-backtest.cjs` are untouched, and `~/.claude/devflow/calibration.json` still hashes to 5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea"
  artifacts:
    - path: scripts/estimate-window-eval.cjs
      provides: "report subcommand: era, task-count, class other, duration-source and composition tables, the candidate sweep, the selection rule and the noise floor, over a pre-59 snapshot"
    - path: scripts/estimate-window-eval.test.cjs
      provides: "hand-built-fixture tests for ranking, cuts, rows, summaries, the selection rule, the noise floor, the tables and the CLI"
    - path: .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
      provides: "the committed diagnosis, the frozen decision and window, the validation protocol and the ship rule"
  key_links:
    - "git archive 401a9145^ .planning -> scripts/estimate-window-eval.cjs report -> 64-DIAGNOSIS.md `decision` and `window_objectives` (read by 64-08, 64-09 and 64-10)"
    - "calibrator.buildCalibration (in memory, no overhead) + estimate.estimateTrdText + estimate-math.sumCorrelated -> candidate TRD and objective rows"
---

# TRD 64-07: Diagnose why agent minutes run high on pre-59 history, and freeze the method before scoring 59-63 (EST-08, gap closure)

<objective>
64-05 measured EST-08 as **not met**: on objectives 59-63 the median estimate of agent minutes is 1.51 times the
actual (2 of 5 objectives within ±30%); cost passes (0.86); the P90 covers. The user chose to fix the minutes estimate
now and re-run the backtest. Two locked rules bind everything in 64-07 to 64-10, and this TRD is where they are made
concrete:

1. **Fix the method, not the target.** Diagnose before changing anything. No fudge multiplier fitted to 59-63, no
   change to the EST-08 thresholds in `estimate-backtest.cjs`, no change to the actuals.
2. **Validation must be honest.** A calibration that contains 59-63 is in-sample and does not count. Any parameter the
   fix introduces is chosen on a history that excludes 59-63 and frozen, in a committed document, before 59-63 is
   scored.

This TRD does the diagnosis and the parameter choice on the repository as it stood before 59's first commit, and
writes both down. It changes no estimator code. The fix it can select is a **recency window** for `calibrate` (64-08
builds it, 64-09 validates it); `stop` (no candidate beats the current method on pre-59 evidence) is a valid outcome
and then 64-08 and 64-09 do nothing.

**Why a recency window is the candidate** (planning-time reading of the code and of pre-59 history; scratch runs on
the pre-59 snapshot only; the executor re-derives every figure and the doc quotes the executor's figures, not these):

- The estimate of a TRD is the sum, over its tasks, of the class median of a *per-task share* (a TRD's minutes split
  equally over its auto tasks); objectives add TRDs with a correlated sum (rho 0.5). Nothing adds executor overhead:
  `execution.agent_minutes` is `sumCorrelated` of the TRD estimates and the verifier is only in `total`.
- In sample, the whole-history calibration is median-correct at TRD level (257 TRDs with minutes: median p50 / actual
  1.00, pooled 0.69) but not by era: objectives 20-50 ran a median 13-18 minutes per TRD (p90 about 45-55), objectives
  51-58 about 10 (in-sample ratio 1.31). History is not stationary, and the medians are taken over all of it.
- Class `other` (tasks with no `<files>`: smoke runs, full-suite gates) has p50 11.0 minutes per task from 14 samples;
  four of them come from the 45-90 minute adopt-smoke TRDs 37-11 to 37-14, while later `other` tasks took 3-22 minutes.
- A rolling-origin sweep over objectives 46-58 is noisy: the all-history median objective ratio is about 1.1 with only
  5 of 13 objectives in band, and the windows are not monotone (30, 20 and 15 objectives worse than all, 10 better).
  The window is therefore a *candidate with weak support*, which is why the rule below is written down before the run
  and why `stop` exists.
- Task-count scaling (in sample k=2 ratio 0.91, k=3 ratio 1.29, flatter in recent eras) is real but second order, and
  not a candidate here (scope); the diagnosis records it and the existing todo stays open for it.

**The pre-registered text** (selection rule, validation protocol, ship rule, provenance) is in `<codebase_examples>`;
copy it verbatim into 64-DIAGNOSIS.md. Do not reword the rule after seeing the table.

Purpose: a diagnosed, evidenced, frozen method choice that cannot be tuned to 59-63.
Output: `scripts/estimate-window-eval.cjs` (+ test), `64-DIAGNOSIS.md` with `decision` and `window_objectives`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …` (the mirror lacks `backtest`).
  One plain command per Bash call; redirect output to files in the scratchpad (`<scratch>`) rather than piping.
- **Never write `~/.claude/devflow/calibration.json`**, and never delete `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
  or anything under `~/.claude/devflow/state/estimates/history/`. The script builds calibrations in memory
  (`calibrator.buildCalibration`) and must not call `writeCalibration` or `defaultCalibrationPath`. At the end,
  `shasum -a 256 ~/.claude/devflow/calibration.json` must still be `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`.
- **Pre-59 data only.** The script and its tests read the extracted snapshot and hand-built fixtures, never the live
  `.planning/objectives/59-*` to `63-*`. Do not run `estimate backtest` in this TRD.
- Do not change `plugins/` (verify with `git show --stat` on each commit), the constants of `estimate-backtest.cjs`
  (import `BAND` and `COVERAGE_TARGET`, never redefine them), thresholds, inputs or actuals.
- Planning writes go through verbs: the doc with `planning draft` + Write + `doc put`. Never Write or Edit a file under
  `.planning/` directly. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Test data is hand-built (fixture builders `makeCalibrationProject` / `makeEstimateProject` in
  `plugins/devflow/devflow/bin/lib/__fixtures__/`); no generated data, no property-based library, no `.feature` files.
- Never use port 8080.

## Test list

Outermost first, in `scripts/estimate-window-eval.test.cjs` (Node test runner, hand-built fixtures). Write one test, see
it fail, implement it, then the next. Items 1-8 belong to Task 1, items 9-18 to Task 2. Item 1 is written first and
stays red until items 4-8 exist; commit RED once and GREEN once per task.

1. `rollingSweep` on the step-change fixture (objectives 1-6, see codebase_examples), `evalObjectives: ['6-f']`,
   windows `['all', 2]`: the `all` candidate's objective row has TRD p50 40 each and objective ratio 4; the `2` candidate
   has TRD p50 10 each and ratio 1 (the hand numbers above); the temporary cut directories are removed afterwards.
2. `selectWindow` over hand-built candidate summaries `{window, s, in_band, obj_coverage, trd_coverage, trd_bias}`:
   (a) smaller S, coverages 1.0, trd_bias and in_band no worse than `all` -> `{decision:'build_window', window}`;
   (b) smaller S but fewer objectives in band -> ineligible -> `stop`; (c) obj_coverage 0.75 -> ineligible; (d) trd_bias
   worse than `all` -> ineligible; (e) two eligible windows with S 0.050 and 0.065 -> the larger W; with S 0.050 and
   0.080 -> the smaller S; (f) no window with S below `all`'s -> `stop`; each result carries `reasons` per window.
3. `noiseFloor([0.4, 0.5, 1.0, 1.9, 2.0, 2.5], 5)` -> `{subsets: 6, in_band: 3, share: 0.5}` (hand count: the median
   of each 5-subset is 1.9, 1.9, 1.9, 1.0, 1.0, 1.0); `noiseFloor` of fewer values than `k` -> `{subsets: 0, share: null}`.
4. `summarizeCandidate(objectiveRows, trdRows)`: ratios `[0.5, 1.0, 2.0]` -> median 1.0, `s` 0, `in_band` 1; TRD rows
   with actual below / above P90 give `trd_coverage` as the share covered; `median` is the conventional median
   (import `median` from `estimate-backtest.cjs`).
5. `objectiveRow(trdRows)`: two TRD rows (p50 10, 10; p90 10, 10; actual 12, 8) -> p50 20, P90 20, `sum_p50` 20 (the
   sum of the TRD p50s), actual 20, ratio 1, covered true; a TRD row without an estimate is left out of the estimate AND of the actual (partial-sum rule).
6. `cutProject({snapshotRoot, before, window, dest})`: dest holds only objectives numbered below `before` that are
   sample-bearing, the last `window` of them, plus `STATE_ARCHIVE.md` and `state.json` when the snapshot has them;
   `window: null` keeps all; an objective of TRDs with no SUMMARY is not sample-bearing and consumes no slot.
7. `objectiveNumber` and `rankObjectives`: `['9-a','10-b','10-c','10.5-d','11-e','foo']` stays in that order
   (numeric, not lexical; `foo` last); `objectiveNumber('12.1-x')` is 12.1 and `objectiveNumber('foo')` is null.
8. `recentObjectives(ranked, W)`: the last W; `null` or `'all'` -> all; W above the count -> all.

9. Spawned `node scripts/estimate-window-eval.cjs report --snapshot <fixture root> --eval 6-6 --grid 2 --label fixture --json <tmp>/d.json --raw`
   on the step-change fixture: exit 0; stdout contains `### Selection`, a `decision` line `build_window` with window 2, and
   the `all` ratio `4.00` beside `2` ratio `1.00`; `<tmp>/d.json` parses, has `selection.decision === 'build_window'`
   and `selection.window === 2`.
10. Determinism: the same command run on two copies of the fixture in different directories writes byte-identical JSON,
    and the JSON text contains no `/` path of either directory and no ISO date.
11. Usage errors exit 1: no subcommand, an unknown subcommand, `report` without `--snapshot`, `--grid 0`, `--grid abc`,
    `--eval 7-3`, an unknown flag, a `--snapshot` that is not a directory with `.planning/objectives`.
12. `eraTable(rows, 4)`: eight hand-built rows ordered by objective split into four equal-count eras (2 rows each); the
    result names each era's objective range, n, median and mean actual, median p50, median ratio and pooled ratio
    (hand-computed from the rows).
13. `taskCountTable(rows)`: rows with k = 1, 2, 3, 4, 5 -> groups `1`, `2`, `3`, `4+` with n, median actual, median p50 and
    median ratio; a group with no rows is omitted.
14. `otherClassTable(project, cal)`: a fixture with two filesless tasks (class `other`) in TRDs of 90 and 4 minutes
    lists each (TRD id, TRD minutes, k, share) in the order of TRD id, plus the class's `n`, p50 and P90 from the
    calibration, and how many of its samples sit in TRDs of 45 minutes or more.
15. `durationSourceTable(project)`: counts and median minutes for `summary` and `metric` duration sources (a fixture
    TRD with only a STATE_ARCHIVE row is `metric`).
16. `compositionTable(objectiveRows)`: for rows with sum of TRD p50 `P`, composed p50 `F` and actual `A`: median `F / P`
    (the inflation of the correlated sum over the sum of medians), median `P / A` and pooled `sum P / sum A`.
17. Characterization test (suspect S3, written against the CURRENT code, must pass without changing plugins/): with
    `makeEstimateProject` (two TRDs in objective 90, each a SUMMARY-less plan) and a `makeCalibration()` object that has
    `agent_overhead` samples for planner and verifier, `estimateObjective(cal, root, 90, {all: true}).execution.agent_minutes`
    equals `em.summarize(em.sumCorrelated(<the two TRD minutes distributions>))` exactly: no overhead term is in it.
18. `classCounts(cal)` returns `{class: minutes.n}` for every class but `all`, sorted by name.

<embedded_context>

<codebase_examples>
Current code the script composes (read these before writing; do not copy their bodies):

```js
// calibrator.cjs:   buildCalibration({paths, ratesPath, transcriptsRoot}) -> calibration object, in memory
//                   (transcriptsRoot null = no overhead scan; collectProject(root) -> {trds, objectives, metrics, ...})
// estimate.cjs:     estimateTrdText(cal, text, {id}) -> {minutes: {p50, p90}|null, tasks, ...}; takes any object with task_classes
// estimate-math.cjs fitQuantiles({p50, p90}), sumCorrelated(dists, rho = 0.5), summarize(dist) -> {p50, p90}
// estimate-rollup.cjs estimateObjective: execution.agent_minutes = stat(sumCorrelated(trd minutes distributions))
// estimate-backtest.cjs exports BAND (0.3), COVERAGE_TARGET (0.8), MIN_OBJECTIVES (3), median(values)
// calibration-inputs.cjs collectProject(root): each trd = {id, objective_dir, autonomous, minutes, duration_source,
//                   summary: {tokens_input, tokens_output, ...}|null, tasks: [{type, tdd, files}]}
```

Fixture the tests build with `makeCalibrationProject` (a step change in speed; every number below is hand-computable).
Objectives `1-a` to `6-f`, each with TRDs `01` and `02`, each TRD with two auto tasks classed `code_tdd`
(`files: ['lib/x.cjs', 'lib/x.test.cjs']`, `tdd: true`) and a SUMMARY `duration`: objectives 1-3 `40min` per TRD (task
share 20), objectives 4-6 `10min` per TRD (task share 5). Evaluating objective 6 with history 1-5: all-history has 12
shares of 20 and 8 of 5, nearest-rank p50 = 20, so each TRD is estimated 40 minutes against an actual of 10 (ratio 4);
`window 2` keeps objectives 4 and 5, every share is 5, each TRD is estimated 10 (ratio 1).

Pre-registered text (copy verbatim into 64-DIAGNOSIS.md sections 2, 4, 6 and 7):

```
## 2. Provenance of this protocol
The recency family was suggested by 64-05's diagnostics on 59-63 (its 42-58 window run) and by the gap-closure request,
so the family is not blind to 59-63; the parameter value is. The grid, the statistic and the eligibility rule were fixed
by the planner after a dry run on the pre-59 snapshot only (a rolling-origin sweep of windows all, 40, 30, 20, 15, 10, 8
and 5 over objectives 46-58) and before any windowed calibration was scored on 59-63. That sweep gave W=5 and W=8 a
lower or similar statistic S than W=10; they are excluded by a sample-size floor (when the planner counted classes at
the end of the snapshot, W=5 left prompt, prompt_tdd and test_tdd under the estimator's 5-sample class floor; W=8 did
not, so 10 is a round-number lower bound, not a derived one; section 4 reports the same counts at the last selection
cut). No 59-63 actual was used to choose anything in this document.

## 4. Selection rule (fixed before the run)
Selection set: the pre-59 snapshot (`git archive 401a9145^ .planning`), objectives numbered 46 to 58 that have at least
one autonomous TRD with SUMMARY minutes. For each such objective N and each candidate W in {all, 10, 15, 20, 30, 40}
the calibration is built in memory (no overhead) from the snapshot objectives numbered below N, keeping the W most
recent that have samples (all of them for `all`). N's TRDs that have minutes are estimated from their text with that
calibration; the objective row sums those TRDs only: actual = their minutes, p50 and P90 = the correlated sum (rho 0.5)
exactly as estimateObjective composes execution.agent_minutes. Per candidate: S = |ln(median of the objective ratios
p50/actual)|; in_band = objectives with ratio in [1-BAND, 1+BAND]; obj_coverage = share of objectives with actual <= P90;
trd_coverage = the same over TRD rows; trd_bias = |ln(median TRD ratio)|.
A window W != all is eligible only if obj_coverage >= COVERAGE_TARGET, trd_coverage >= COVERAGE_TARGET,
trd_bias <= all's trd_bias, in_band >= all's in_band, and S < all's S. The decision is the eligible window with the
smallest S; windows whose S differ by at most 0.02 resolve to the larger W. No eligible window means decision `stop`.

## 6. Validation protocol (pre-registered; run once by 64-09)
V1 Cuts: for N = 59, 60, 61, 62, 63 with first commits 401a9145, 05a5b5f4, d7b9c938, 9ad19b1c, 26e4e57f, the data is
`git archive <first>^ .planning`. No other cut and no later data.
V2 Methods: old = `calibrate --paths <cut> --no-overhead --window all`; new = the same with `--window <window_objectives>`
(the value frozen above). No other window is run, before or after.
V3 Positive control: the old-method rolling rows must reproduce 64-05's published rolling table to its printed digits
(minutes p50/P90 and cost p50/P90 per objective, and the aggregate medians and pooled ratios). If they do not, nothing
is scored and the harness is reported defective.
V4 Verdict: each objective is estimated from its own cut calibration (estimateObjective, every TRD) and the five
estimates go through buildBacktest; its est08 is the verdict of the new method (met only when SC2 and SC3 pass for agent
minutes and for cost; thresholds are the unchanged constants of estimate-backtest.cjs). A met result is the EST-08
verdict; anything else leaves EST-08 not met. There is no second attempt: no other window, cut or rule after the result.
V5 Prospective point: objective 63's persisted wall estimate (run state sha256
08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee) is reported unchanged and never judged.
V6 Limits to state: five objectives is a small sample (see the noise floor), the cuts are leave-future-out
reconstructions (today's code on old data), and true prospective confirmation needs the next five objectives run with
the run history from 64-02.

## 7. Ship rule (pre-registered; coded as `shipRule` in scripts/estimate-rolling-backtest.cjs, read by 64-10)
ship_default is true when the new method's rolling verdict is `met`, or when its agent-minutes median ratio is closer to
1 than the old method's rolling one (smaller |ln ratio|) and none of the four verdict statuses (SC2 and SC3, agent
minutes and cost) that passes under the old method fails under the new. Then 64-10 makes the window the default of
`calibrate` and regenerates the live calibration, saying so. Otherwise the window stays an opt-in flag and the live
calibration is not touched.
```

64-DIAGNOSIS.md skeleton (fill from the run; keep it factual and short):

```markdown
---
objective: 64-estimate-accuracy-validation
type: diagnosis
requirement: EST-08
decision: build_window | stop
window_objectives: <integer; omit when stop>
grid: [10, 15, 20, 30, 40]
snapshot_ref: 401a9145^
selection_set: objectives 46-58, rolling origin by objective number inside the snapshot
selection_output_sha256: <sha256 of <scratch>/diagnosis.json>
generated: <YYYY-MM-DD>
---

# Objective 64: why agent minutes run high (pre-59 evidence) and the frozen method

## 1. Question and constraints      <64-05 verdict in one paragraph; the two locked rules>
## 2. Provenance of this protocol   <verbatim>
## 3. Suspects                      <table: suspect | deciding number (quoted from the run) | verdict (supported / not supported / inconclusive)
                                     S1 older or slower history (eras) · S2 duration source · S3 executor overhead counted twice
                                     (the characterization test in scripts/estimate-window-eval.test.cjs) · S4 classifier, class other
                                     · S5 TRD minutes against task count · S6 composition (rho 0.5) · S7 drift in the per-objective ratios>
## 4. Selection                     <verbatim rule; the candidate table (S, in_band, coverages, trd_bias, per-objective ratios);
                                     class sample counts at the last cut for W=10 and W=5; the decision and why>
## 5. Noise floor                   <noiseFloor of the all-history ratios and of the chosen window's: the share of 5-objective samples whose median is in band>
## 6. Validation protocol           <verbatim>
## 7. Ship rule                     <verbatim>
## 8. Reproduce                     <exact commands, scratch paths as placeholders>
```
</codebase_examples>

<anti_patterns>
- Do not read, print or compare any 59-63 SUMMARY, actual or calibration here; do not run `estimate backtest`.
- Do not widen the grid, add a candidate, change the eligibility rule or re-run with another snapshot after seeing the
  table. If a bug is found in the script, fix it with a failing test first, re-run the same command, and say so in
  the SUMMARY.
- Do not write a verdict sentence without the number that decides it.
- Do not put a timestamp, a hostname or a scratch path in the script's JSON (the sha256 recorded in the doc must
  reproduce on any machine).
</anti_patterns>

<error_recovery>
- `git rev-parse 401a9145^` fails: `git log --oneline --all -- .planning/objectives/59-*` and take the first commit
  of objective 59's directory; use its parent and record the substitution in the SUMMARY and the doc.
- `calibrate`-side errors from `buildCalibration` on a cut (no project found): a cut has no `.planning/objectives`;
  check `cutProject` copied at least one objective (the fixture test covers an empty history).
- `doc put` refuses or fails: read its message (it names the fix), re-run `planning draft` for the exact rel path,
  correct the draft, run it again; nothing was published on a non-zero exit.
- The live calibration hash changed: stop, record it, restore nothing; report to the orchestrator.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
@.planning/objectives/64-estimate-accuracy-validation/64-05-SUMMARY.md
@plugins/devflow/devflow/bin/lib/estimate-backtest.cjs
</context>

<gotchas>
- Objective numbers are not unique (three directories are numbered 10, and decimal numbers like 12.1 exist). Order by
  (numeric prefix, directory name); a directory without a numeric prefix sorts last; each directory is one objective.
- `collectProject` reads `.planning/STATE_ARCHIVE.md` and `.planning/state.json` for metric-row durations: `cutProject`
  must copy both when present, or a cut loses the minutes of TRDs whose SUMMARY has no duration.
- A sample-bearing objective is one with at least one TRD for which `minutes !== null` or both token counts are
  numbers (the rule `calibrator.trdSample` returns null on). A directory of TRDs with no SUMMARY does not count.
- `estimate.estimateTrdText` needs a calibration object (not a file); the result of `buildCalibration` works as is.
- The partial-sum rule is a pre-59 stand-in: only 6 of the 13 selection objectives have minutes on every TRD, so the
  objective row sums the TRDs that have minutes (estimate and actual alike). It is not the SC2 statistic of the final
  validation, which only compares objectives with complete actuals.
- `scripts/**/*.test.cjs` runs under `npm test`: keep the tests on fixtures (no git, no network, no `~/.claude`).
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Selection core of scripts/estimate-window-eval.cjs — ranking, cuts, rows, summaries, the rule, the noise floor (RED then GREEN)</name>
  <files>scripts/estimate-window-eval.cjs, scripts/estimate-window-eval.test.cjs</files>
  <action>
Implement the test-list items for this task (see ## Test list), one at a time, RED then GREEN.

Create `scripts/estimate-window-eval.cjs` (CommonJS, `'use strict'`, a header comment stating: pre-59 evaluation tool for
objective 64 (EST-08); reads a snapshot directory, builds calibrations in memory, writes nothing outside the temp cut
directories it removes; never touches `~/.claude`). Export: `objectiveNumber`, `rankObjectives`, `sampleObjectives`,
`recentObjectives`, `cutProject`, `trdRows`, `objectiveRow`, `summarizeCandidate`, `rollingSweep`, `selectWindow`,
`noiseFloor`. Require the library by relative path (`../plugins/devflow/devflow/bin/lib/...`).

- `sampleObjectives(project)`: directory names with at least one sample-bearing TRD (see gotchas).
- `cutProject`: `fs.cpSync` of each kept objective directory into `<dest>/.planning/objectives/`; returns `{kept}`.
- `trdRows(cal, snapshotRoot, project, dir)`: for each autonomous TRD of `dir` with `minutes !== null` and a plan file,
  `estimate.estimateTrdText(cal, text, {id})`; row `{id, k, actual, p50, p90}` (k = non-checkpoint tasks); skip a TRD with
  no minutes estimate.
- `objectiveRow(rows)`: `em.summarize(em.sumCorrelated(rows.map(r => em.fitQuantiles({p50: r.p50, p90: r.p90}))))`, plus `sum_p50`, `actual`, `ratio`, `covered`.
- `rollingSweep({snapshotRoot, evalObjectives, windows, scratchDir?})`: for each window and eval objective, `cutProject` into
  a `fs.mkdtempSync` directory, `calibrator.buildCalibration({paths: [dir], transcriptsRoot: null})`, rows, remove the
  directory. Returns `[{window, objectives: [{objective, rows, row}], summary}]`; `windows` may contain `'all'`.
- `selectWindow(summaries)`: implements section 4 of the pre-registered text exactly; `COVERAGE_TARGET` is imported.
- `noiseFloor(ratios, k)`: enumerate the k-subsets deterministically (no random numbers) and count medians in
  `[1 - BAND, 1 + BAND]`.

# CRITICAL: BAND, COVERAGE_TARGET and median come from estimate-backtest.cjs; do not redefine them.
# GOTCHA: the only temp directories are `fs.mkdtempSync` cuts, removed in a `finally`.
# PATTERN: fixture builders in plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs.
  </action>
  <verify>`node --test scripts/estimate-window-eval.test.cjs` passes (items 1-8).</verify>
  <done>Items 1-8 pass; the selection rule and the noise floor are code with tests, written before the pre-59 run.</done>
  <recovery>If `buildCalibration` over a one-objective cut throws on an empty history, assert the thrown message in a test and have the sweep treat "no samples" as a candidate with no rows, never as a pass.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The diagnostic tables, the report renderer and the CLI (RED then GREEN)</name>
  <files>scripts/estimate-window-eval.cjs, scripts/estimate-window-eval.test.cjs</files>
  <action>
Implement the test-list items for this task (see ## Test list), one at a time, RED then GREEN.

Add to the same script and export: `eraTable`, `taskCountTable`, `otherClassTable`, `durationSourceTable`,
`compositionTable`, `classCounts`, `report`, `formatReport`, `main`.

- `report({snapshotRoot, evalObjectives, windows, label})`: `project = ci.collectProject(snapshotRoot)`; the in-sample
  calibration for items 12-16 is `buildCalibration({paths: [snapshotRoot], transcriptsRoot: null})` (the whole
  snapshot); the sweep is `rollingSweep`; the selection is `selectWindow`; the noise floor is computed for `all` and for
  the chosen window (or `all` only on `stop`); `class_counts` is `classCounts` of the calibrations of the LAST eval
  objective at W=10 and W=5 (cut with `cutProject`). Return one plain object:
  `{label, eval, grid, eras, task_count, other_class, duration_source, composition, candidates, selection, noise_floor, class_counts}`.
  Numbers are unrounded; no path, no timestamp.
- `formatReport(result)`: markdown, in this order: `### Eras (S1)`, `### Task count (S5)`, `### Class other (S4)`,
  `### Duration source (S2)`, `### Composition (S6)`, `### Selection`, `### Noise floor`, `### Class sample counts`. Ratios
  print with 2 decimals, `S` with 3.
- CLI `report --snapshot <dir> [--eval 46-58 | 46,47,...] [--grid 10,15,20,30,40] [--label text] [--json <file>] [--raw]`:
  defaults `--eval 46-58`, `--grid 10,15,20,30,40`, `--label snapshot`; `--raw` prints `formatReport`, otherwise the JSON;
  `--json <file>` writes the JSON (2-space indent, trailing newline). `main` is guarded by `require.main === module`.
- Eras: `eraTable(rows, 4)` splits the rows (ordered by objective) into four consecutive groups of equal size (sizes differ
  by at most one); no hand-picked boundary.

# CRITICAL: the CLI must not accept or create any path under `~/.claude` and must not import `writeCalibration`.
# GOTCHA: item 17 passes against the current code; it is a characterization test, so there is no RED for it; say so in the SUMMARY.
  </action>
  <verify>`node --test scripts/estimate-window-eval.test.cjs` passes (items 1-18); `node scripts/estimate-window-eval.cjs report` with no flags exits 1 with a usage line; `git show --stat HEAD` for the task commits lists only the two script files.</verify>
  <done>Items 9-18 pass; the report is deterministic and path-free; suspect S3 has an executable test.</done>
  <recovery>If the spawned CLI test is slow, build the fixture once per `describe` and reuse it; if item 10 finds a path in the JSON, the offender is the label or an error message echoing the dir: pass only `--label`.</recovery>
</task>

<task type="auto">
  <name>Task 3: Run the diagnosis on the pre-59 snapshot, freeze the decision, write and commit 64-DIAGNOSIS.md</name>
  <files>.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md</files>
  <action>
1. Snapshot and leak check:
   - `git rev-parse 401a9145^`
   - `mkdir -p <scratch>/pre59`
   - `git archive --format=tar -o <scratch>/pre59.tar 401a9145^ .planning`
   - `tar -xf <scratch>/pre59.tar -C <scratch>/pre59`
   - `ls <scratch>/pre59/.planning/objectives` redirected to `<scratch>/pre59-objectives.txt`, then
     `rg -n "^(59|6[0-9])-" <scratch>/pre59-objectives.txt`: it must print nothing (record that in the SUMMARY).
2. Run, once with the markdown and the JSON:
   `node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/diagnosis.json --raw`
   redirected to `<scratch>/diagnosis.md`. Run it a second time with `--json <scratch>/diagnosis-2.json`
   (no `--raw`) and confirm `shasum -a 256 <scratch>/diagnosis.json <scratch>/diagnosis-2.json` prints two equal digests.
   Record that digest as `selection_output_sha256`.
3. Write the doc to the skeleton in codebase_examples: `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md`;
   Write the printed draft path; then `doc put objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md --from <draft>`.
   - Section 3: one row per suspect, each verdict a sentence quoting the deciding number from `<scratch>/diagnosis.md`
     (S3 cites test item 17). Verdict words: `supported`, `not supported`, `inconclusive`.
   - Section 4: paste the candidate table; state `decision` and `window_objectives` (omit the field on `stop`), and
     say plainly how strong the evidence is (the sweep is non-monotone in W, the chosen window's S advantage over `all`
     against the spread of the per-objective ratios).
   - Section 5: the noise floor of `all` and of the chosen window, stated as "an estimator whose ratios have this
     spread passes SC2 on a random 5-objective sample X% of the time".
   - Sections 2, 6, 7 verbatim from codebase_examples.
4. Check the frontmatter reads back: `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md --field decision`
   and `--field window_objectives`.
5. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(64-07): diagnosis of the minutes bias on pre-59 history and the frozen method" --files .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md`.
   Then `git log --format=%h -- .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` must list exactly one commit: the doc is
   not edited after the freeze.
6. `shasum -a 256 ~/.claude/devflow/calibration.json` is still `5cf42c4b…`; `git status --short plugins` prints nothing.
  </action>
  <verify>`frontmatter get … --field decision` prints `build_window` or `stop`; the doc has sections 1-8; `selection_output_sha256` equals the digest of `<scratch>/diagnosis.json`; the leak check printed nothing; the live calibration hash is unchanged.</verify>
  <done>The diagnosis, the decision and the validation protocol are committed before any windowed calibration touches 59-63.</done>
  <recovery>If the run says `stop`, that is the result: write the doc with `decision: stop`, omit `window_objectives`, and say in section 4 that no window beat all-history on the pre-registered rule. Do not widen the grid. 64-08 and 64-09 then skip, and 64-10 records the diagnosis without a method change.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test scripts/estimate-window-eval.test.cjs</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test scripts/estimate-window-eval.test.cjs` passes; `git show --stat` of every commit in this TRD lists no file under `plugins/`.
- `rg -n "^decision:|^window_objectives:|^selection_output_sha256:" .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` shows the frozen fields.
- The snapshot listing has no objective numbered 59 or above; `shasum -a 256 ~/.claude/devflow/calibration.json` is `5cf42c4b…`.
</verification>

<success_criteria>
- The minutes bias has a diagnosis with numbers per suspect, from pre-59 data only.
- The method choice (a recency window of N objectives, or no change) is frozen in a committed document together with the validation protocol and the ship rule, before 59-63 is scored.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-07-SUMMARY.md` with
`requirements-completed: []`. State the decision, the window, the digest and the leak-check result.
</output>
