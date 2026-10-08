---
objective: 64-estimate-accuracy-validation
trd: "05"
type: standard
wave: 3
depends_on: ["64-03", "64-04"]
files_modified:
  - .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
  - .planning/REQUIREMENTS.md
  - ".planning/todos/pending/*.md"
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "64-ACCURACY-REPORT.md compares estimate with actual for objectives 59, 60, 61, 62 and 63 (success criterion 1): executor agent minutes and cost per objective and per TRD, and Objective 63's execution wall time and waves from its prospective run state"
    - "The report states the EST-08 verdict computed by `estimate backtest` from the rules fixed in 64-01 (median ratio within ±30%, P90 covering >= 80% of objectives and of TRDs, for agent minutes and for cost), with the numbers behind each criterion and without changing any threshold after seeing the data"
    - "Every number is labelled prospective (persisted before execution: 63's wall estimate) or reconstructed (today's estimator on the frozen pre-59 calibration and the TRDs as executed), with the frozen calibration's sha256, the 63 reproduction result and the estimator drift list as the basis, and the current-code caveat stated"
    - "If SC2 or SC3 fails for a primary metric, the report names the miscalibrated task classes (from the class tables) and a follow-up, and a pending todo records that follow-up; no estimator code is changed to make the numbers pass"
    - "REQUIREMENTS.md records EST-08 as the verdict says: ticked through `requirements mark-complete` only when met; otherwise left unchecked with a traceability status naming the report and the follow-up"
    - "The secondary analyses are present and labelled as such: rolling leave-future-out calibrations (one per objective, from the git snapshot before its first commit), a v1.4-onward window diagnostic, the in-sample 55-57 reference, and the actuals audit from 64-03"
  artifacts:
    - path: .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
      provides: "the EST-08 accuracy report"
    - path: .planning/REQUIREMENTS.md
      provides: "EST-08 status per the verdict"
  key_links:
    - "estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json -> report verdict and tables"
    - "git archive <first commit>^ .planning -> calibrate --paths <snapshot> --no-overhead --out <scratch> -> estimate backtest N (rolling)"
    - "verdict -> requirements mark-complete EST-08 (met) | doc put REQUIREMENTS.md + todo add (not met)"
---

# TRD 64-05: Run the out-of-sample backtest and write the accuracy report (EST-08)

<objective>
This is the TRD that answers EST-08. Everything before it built the instrument (64-01, 64-02, 64-04) and pinned the
inputs (64-03). Here the instrument runs on the five objectives executed after the engine shipped, and the result is
written down whatever it is.

**What is compared.**
- *Primary (the verdict):* `estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`.
  That calibration is the exact file every estimate during 59-63 was made from (64-03 proved its hash and age), so it
  is out of sample for all five. The executor estimates are **reconstructed** (today's estimator, the TRDs as
  executed); 63's wall estimate is **prospective** (persisted in its run state before execution), and 64-03 showed the
  reconstruction reproduces it. Like-for-like: executor `agent_minutes` vs summed SUMMARY minutes, executor `cost_usd`
  vs priced SUMMARY tokens.
- *Secondary (information, not the verdict):*
  1. Rolling leave-future-out: for each objective, a calibration built from the repository exactly as it stood before
     that objective's first commit (`git archive <first>^ .planning`), `--no-overhead`, in the scratchpad. It answers
     "would recalibrating before each objective have helped?". Executor metrics only (`total` lacks overhead there).
  2. Window diagnostic: the pre-59 snapshot restricted to objectives 42-58 (v1.4 onward, about a week of history).
     It tests whether older, slower history explains a minutes bias.
  3. In-sample reference: `estimate backtest 55,56,57` on the frozen calibration (these are inside it), for
     continuity with 58-10's table.
  4. The actuals audit from 64-03 (SUMMARY minutes against transcript spans) and the forward-stamp gap.

**The verdict rules are not chosen here.** They are constants in `estimate-backtest.cjs` (64-01): SC2 passes for a
metric when the median of the five per-objective ratios (`p50 / actual`) is within 0.70-1.30; SC3 passes when P90
covers at least 80% of objectives and at least 80% of TRDs; EST-08 is met only when both pass for agent minutes and
for cost. Report what the verb prints.

**A failed criterion is a valid outcome.** Planning-time numbers (from a scratch run, before the token backfill)
suggest agent-minute medians run high (ratios roughly 0.95-2.1, median about 1.5) while P90 covers every objective.
If that holds, EST-08 is not met on minutes: the report names the classes the class table flags, and the follow-up
goes to a todo. Do not change estimator code, thresholds or inputs to make a number pass.

Purpose: success criteria 1-3 of Objective 64, and EST-08's status, on evidence anyone can rerun.
Output: `64-ACCURACY-REPORT.md`, EST-08's REQUIREMENTS status, and a follow-up todo when needed.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …` (the mirror lacks `backtest`).
  One plain command per Bash call; redirect JSON to scratchpad files rather than piping.
- **Never write `~/.claude/devflow/calibration.json`.** Every `calibrate` here has `--out <scratchpad>/…`; every
  estimate has `--calibration <file>`. At the end, `shasum -a 256 ~/.claude/devflow/calibration.json` must still be
  `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`.
- Scratch snapshots, tars, calibrations and JSON dumps go in the session scratchpad; delete the extracted snapshots at
  the end (keep the JSON results until the report is written).
- Planning writes go through verbs only: the report with `planning draft` + Write + `doc put`; REQUIREMENTS.md with
  `requirements mark-complete` or `planning draft` + Edit + `doc put`; todos with `todo add --from`. Never Write or
  Edit a file under `.planning/` directly.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- EST-08: this TRD alone decides it. Met: `node plugins/devflow/devflow/bin/df-tools.cjs requirements mark-complete EST-08`
  and `requirements-completed: [EST-08]`. Not met: no mark-complete, `requirements-completed: []`, and the status edit
  in Task 3.
- Never use port 8080.

<embedded_context>

<codebase_examples>
Inputs (from 64-03; re-check the two hashes before Task 1):

| Item | Value |
|---|---|
| Frozen calibration | `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`, sha256 `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`, 323 TRDs, data_as_of 2026-10-05 |
| 63 run state | `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json`, sha256 `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee` |
| First commit per objective (cutoff = `<first>^`) | 59 `401a9145`, 60 `05a5b5f4`, 61 `d7b9c938`, 62 `9ad19b1c`, 63 `26e4e57f` |
| Snapshot calibrate check (planning time) | `calibrate --paths <cut-59> --no-overhead` read 324 TRDs, 749 tasks, 237 with tokens (the frozen file has 323: it predates 58-10's own SUMMARY) |

58-10's in-sample table (objectives 55-57, the frozen calibration's own data), for the continuity section:

| Objective | Agent min p50 / P90 | Actual | Median / actual | Cost p50 / P90 | Actual | Median / actual |
|---|---|---|---|---|---|---|
| 55 | 133.6 / 395.7 | 68 (6 of 8 TRDs had minutes) | 1.96 | $21.66 / $32.67 | $23.06 | 0.94 |
| 56 | 74.6 / 218.5 | 27 (4 of 5) | 2.76 | $15.83 / $23.58 | $15.72 | 1.01 |
| 57 | 109.5 / 302.7 | 72 | 1.52 | $22.61 / $32.81 | $21.41 | 1.06 |

Report skeleton (`64-ACCURACY-REPORT.md`; fill every section from the runs, keep it factual and short):

```markdown
---
objective: 64-estimate-accuracy-validation
type: accuracy-report
requirement: EST-08
verdict: met | not met
generated: <YYYY-MM-DD>
calibration_sha256: 5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea
---

# Objective 64: Estimate accuracy against objectives 59-63

## Verdict
EST-08 <met|not met>. SC1 <met: this report>. SC2 <pass|fail> (agent minutes median ratio X; cost Y).
SC3 <pass|fail> (P90 covers a of 5 objectives and b of 41 TRDs for minutes; c and d for cost).
<If not met: one sentence naming the miscalibrated classes and the follow-up todo.>

## What was compared
Prospective vs reconstructed; the frozen calibration (sha, mtime before 401a9145, 323 TRDs, out of sample for all
five); the 63 reproduction; the estimator drift list and the current-code caveat; actuals (SUMMARY minutes with the
metric-row fallback, priced tokens with model-rates.json as_of <date>, live vs backfilled token counts); exclusions.

## Results
<`estimate backtest 59,60,61,62,63 --raw` output: verdict, per-objective table, wall time, classes, exclusions>

## Miscalibrated classes and follow-up
<classes flagged, what the window and rolling diagnostics say about the cause, the todo stem(s)>

## Secondary analyses
### Rolling leave-future-out   <table: objective, cutoff, TRDs in calibration, agent min ratio / covered, cost ratio / covered; summary>
### Window: objectives 42-58    <same shape>
### In-sample reference (55-57) <today's verb vs 58-10's table>
### How good are the actuals    <64-03 audit: SUMMARY vs transcript minutes median ratio, outliers; 63 waves>

## Defects found
<e.g. forward token stamp applied to 8 of 41 SUMMARYs; the run state kept one objective (fixed in 64-02); the
`--all` text (fixed in 64-02); `objective complete` ticks an objective's requirement checkboxes regardless of a
verdict (see Status)>

## Reproduce
<the exact commands, with the scratch paths replaced by placeholders>
```

Todo file shape (`todo add --from <scratch file>`; see `.planning/todos/pending/` for examples):

```markdown
---
created: <ISO timestamp>
title: Recalibrate estimate minutes (EST-08 not met)
area: estimation
files: [plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/estimate.cjs]
---

## Problem
<the measured bias, per class, with the numbers and the report path>

## Solution
<options the diagnostics support, e.g. a recency window or per-model history in calibrate, recalibrating at
objective start, then re-run `df-tools estimate backtest` on the next five objectives>
```
</codebase_examples>

<anti_patterns>
- Do not summarise the verdict differently from what `estimate backtest` printed; quote its numbers.
- Do not present a rolling or window result as the verdict: they use calibrations that never existed at the time.
- Do not cite `reproduced` from a rolling run: only the frozen-calibration run reproduces what was shown live.
- Do not delete the scratch JSON before the report is written; do not commit scratch files.
- Do not write REQUIREMENTS.md, the report or a todo with Write/Edit under `.planning/`.
</anti_patterns>

<error_recovery>
- `estimate backtest` exits 1 for an objective: record the message, run the remaining objectives, and report the
  failed one as excluded with that reason (SC1 then names it).
- A snapshot calibrate refuses (`no DevFlow project ... found`): check the tar contains `.planning/objectives` (`tar -tf
  <tar>` redirected to a scratch file, then `rg -m3 objectives/ <that file>`), re-extract, retry once; if it still fails, report that rolling row as unavailable.
- `doc put` refuses or fails: read its message (it names the fix), correct the draft, run it again; nothing was
  published on a non-zero exit.
- The live calibration hash changed during the run: stop, record it, and re-run Task 1 from the frozen copy.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-03-SUMMARY.md
@.planning/objectives/64-estimate-accuracy-validation/64-04-SUMMARY.md
@.planning/objectives/58-estimation-engine-and-surfacing/58-10-SUMMARY.md
</context>

<gotchas>
- `git archive` takes a tree-ish: `git archive --format=tar -o <scratch>/cut-59.tar 401a9145^ .planning` then
  `tar -xf <scratch>/cut-59.tar -C <scratch>/cut-59` (create the directory first). Two commands, no pipe.
- The rolling calibrations are built with today's `calibrate` code over old data (the code-drift caveat applies to
  them too); `--no-overhead` keeps them independent of today's transcripts.
- `estimate backtest` looks up run states in the real state directory; the rolling runs will also show 63's
  prospective wall row. That row's `reproduced` is meaningful only in the frozen run.
- After 64-03's backfill, cost actuals for all 41 TRDs should be present; if `### Exclusions` lists any, quote them.
- REQUIREMENTS.md: the local `objective complete` (objective.cjs, the REQUIREMENTS block after the ROADMAP update)
  turns `- [ ] **EST-08**` into `[x]` for every requirement in the objective's ROADMAP `**Requirements**:` line, and
  replaces only a `Pending` traceability status. A `Not met …` status survives; the checkbox does not.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Primary out-of-sample backtest of 59-63 on the frozen calibration, plus the in-sample reference</name>
  <files>none (scratchpad JSON and text; numbers recorded in 64-05-SUMMARY.md)</files>
  <action>
1. `shasum -a 256 ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json ~/.claude/devflow/calibration.json` and
   the 63 history file: confirm the values in codebase_examples.
2. `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
   redirected to `<scratch>/bt-primary.json`, and the same with `--raw` to `<scratch>/bt-primary.md`.
3. `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 55,56,57 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw`
   to `<scratch>/bt-insample.md`.
4. Record in the SUMMARY under `## Primary result`: the verdict block, the per-metric summary (median ratio, pooled
   ratio, in band, objective coverage, TRD coverage), each objective's row, the 63 wall row with `reproduced`, the
   flagged classes and the exclusions; under `## In-sample reference`: the 55-57 rows beside 58-10's table.
  </action>
  <verify>`<scratch>/bt-primary.json` parses and has `verdict.est08`; the SUMMARY quotes it verbatim; both hashes unchanged.</verify>
  <done>The EST-08 verdict and every number behind it are recorded from one rerunnable command.</done>
  <recovery>See error_recovery. The task changes no repository file.</recovery>
</task>

<task type="auto">
  <name>Task 2: Rolling leave-future-out and window diagnostics from git snapshots</name>
  <files>none (scratchpad snapshots, calibrations and JSON; numbers recorded in 64-05-SUMMARY.md)</files>
  <action>
For N in 59, 60, 61, 62, 63, with FIRST from the codebase_examples table (verify each with
`git log --reverse --format=%h -- .planning/objectives/<N dir>`, first line, only if a value looks wrong):

```
mkdir -p <scratch>/cut-N
git archive --format=tar -o <scratch>/cut-N.tar FIRST^ .planning
tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --out <scratch>/cal-cut-N.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest N --calibration <scratch>/cal-cut-N.json      > <scratch>/bt-roll-N.json
```

Aggregate the five rolling rows with one scratch `node` script that loads the five JSONs and calls
`require('<repo>/plugins/devflow/devflow/bin/lib/estimate-backtest.cjs').summarize(rows, classRows(rows))` on the five
`objectives[0]` rows (note in the SUMMARY that these rows were rounded at output, so the aggregate's medians are at
3-decimal precision).

Window: build `<scratch>/win-42-58/.planning/objectives/`, copy `<scratch>/cut-59/.planning/objectives/4[2-9]-*` and
`.../5[0-8]-*` into it (two `cp -R` commands) and `<scratch>/cut-59/.planning/STATE_ARCHIVE.md` into
`<scratch>/win-42-58/.planning/`; then `calibrate --paths <scratch>/win-42-58 --no-overhead --out <scratch>/cal-win.json --raw`
and `estimate backtest 59,60,61,62,63 --calibration <scratch>/cal-win.json --raw` to `<scratch>/bt-window.md`.

Record under `## Rolling leave-future-out` (per objective: cutoff, calibrate summary line, agent-minute and cost
ratio/covered; then the aggregate) and `## Window 42-58` (the verdict block and class flags). Then remove the
extracted snapshot directories and tars (`rm -rf <scratch>/cut-* <scratch>/win-42-58`), keeping the JSON/markdown.
  </action>
  <verify>Five `cal-cut-N.json` calibrate lines and five `bt-roll-N.json` files exist and are recorded; the window report is recorded; `shasum -a 256 ~/.claude/devflow/calibration.json` is still `5cf42c4b…`.</verify>
  <done>The report can say whether recalibrating before each objective, or a recent-history window, would have changed the verdict.</done>
  <recovery>A failed snapshot is reported as unavailable for that objective; the remaining rows still aggregate (with n stated). Never fall back to the live calibration for a rolling row.</recovery>
</task>

<task type="auto">
  <name>Task 3: Write 64-ACCURACY-REPORT.md, set EST-08's status, record the follow-up, commit</name>
  <files>.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md, .planning/REQUIREMENTS.md, .planning/todos/pending/*.md</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md`;
   Write the report into the printed draft path following the skeleton: the Results section pastes
   `<scratch>/bt-primary.md`; every other section uses the numbers recorded in Tasks 1-2 and in 64-03's SUMMARY
   (provenance, drift, reproduction, backfill counts, actuals audit, forward-stamp gap). Label each figure prospective
   or reconstructed; state that the reconstruction runs today's estimator code (list the drift; 63 reproduced it).
   Then `node plugins/devflow/devflow/bin/df-tools.cjs doc put objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md --from <draft>`.
2. EST-08:
   - **met**: `node plugins/devflow/devflow/bin/df-tools.cjs requirements mark-complete EST-08`.
   - **not met**: `planning draft REQUIREMENTS.md`; Edit the draft so the traceability row reads
     `| EST-08 | Objective 64 | Not met: see objectives/64-…/64-ACCURACY-REPORT.md; follow-up todo <stem> |` and append
     to the EST-08 checklist line ` (validated 2026-10-07 against objectives 59-63: not met, see 64-ACCURACY-REPORT.md)`
     leaving `- [ ]`; then `doc put REQUIREMENTS.md --from <draft>`.
3. Follow-up (not met, or any SC fails): write the todo (shape in codebase_examples) to a scratchpad file and
   `node plugins/devflow/devflow/bin/df-tools.cjs todo add --from <file>`. Name the flagged classes, the numbers, what
   the rolling and window diagnostics showed, and the next check (`estimate backtest` on the next five objectives,
   which 64-02's run history makes prospective). If 64-03 confirmed the forward-stamp gap, add a second todo for it
   (EST-06 stamped 8 of 41). At most three todos; each must name a concrete next step.
4. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(64-05): estimate accuracy report for objectives 59-63 (EST-08 <met|not met>)" --files <report> .planning/REQUIREMENTS.md <todo files>`.
5. In the SUMMARY, under `## Issues for the orchestrator`, when not met: say that the local `objective complete 64`
   ticks `- [ ] **EST-08**` automatically (the traceability status survives), so whoever completes the objective must
   re-open that checkbox or record the decision.
  </action>
  <verify>`rg -n "^verdict:|^## Verdict|^## What was compared|^## Results|^## Secondary analyses|^## Reproduce" .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` finds every section; `rg -n "EST-08" .planning/REQUIREMENTS.md` shows the status matching the report's `verdict:`; `git log -1 --stat` lists the report, REQUIREMENTS.md and any todo; `shasum -a 256 ~/.claude/devflow/calibration.json` is `5cf42c4b…`.</verify>
  <done>The report exists and answers SC1-SC3 with labelled, reproducible numbers; EST-08's status matches the verdict; a follow-up todo exists whenever a criterion failed.</done>
  <recovery>If `doc put` refuses the path, re-run `planning draft` for the exact rel and retry; if REQUIREMENTS.md's draft and the file disagree (another TRD wrote it), re-draft from the current file and redo the edit.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- The report has every section of the skeleton, the verdict quoted from `estimate backtest`, and prospective vs
  reconstructed labels.
- Success criterion 1: rows for 59, 60, 61, 62 and 63. Criterion 2: the agent-minute and cost median ratios with
  pass/fail. Criterion 3: objective and TRD P90 coverage with pass/fail, and when a criterion fails, the named classes
  and the todo.
- `~/.claude/devflow/calibration.json` unchanged; no scratch file committed (`git show --stat HEAD`).
</verification>

<success_criteria>
- EST-08 is answered on out-of-sample evidence with a code-pinned rule, and its REQUIREMENTS status says so.
- A failing criterion yields named classes and a follow-up, not a code change.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-05-SUMMARY.md` with
`requirements-completed: [EST-08]` when met, `[]` when not met.
</output>
