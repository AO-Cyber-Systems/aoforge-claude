---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
  - .aoforge/todos/pending/est-11-follow-up-objective-75.md
autonomous: true
requirements: [EST-11]
must_haves:
  truths:
    - "75-RETEST-REPORT.md has a row for each of 68, 69, 70, 71 and 72. A scored row compares the pre-recorded run-state estimate (agent minutes and cost, p50 and P90, source prospective) with the SUMMARY actual, giving the ratio and whether P90 covered it. An unscored row names the eligibility check (E1-E5) it failed and the evidence"
    - "The eligibility table (E1-E5 per candidate) was committed before the scoring run, and the report cites both commits"
    - "The report states the EST-11 verdict, met or not met, under rule 4 of the pre-registered rule (OBJECTIVE.md and this TRD). It gives the scored set's median ratio and P90 coverage (objectives and TRDs) for agent minutes and for cost, as `estimate backtest` printed them"
    - "Objective 72 is reported as unscored with both causes. Its original run state has no objective-level estimate (72-01, the user accepted it as unscored), and its only archived history file was started after 72-01..72-25 had run"
    - "When the verdict is not met, the report names the miscalibrated classes the verb flagged (or says it flagged none) and the follow-up. The follow-up todo exists in .aoforge/todos/pending with the disposition fields"
    - "The live calibration still hashes to f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134. No calibrate write was made, and no estimator code, rates, calibration, run-state, history or SUMMARY file changed"
  artifacts:
    - path: .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
      provides: "EST-11 retest report: eligibility, verbatim backtest results, verdict, classes and follow-up, limits, defects, reproduce"
      contains: "EST-11"
  key_links:
    - from: 75-RETEST-REPORT.md eligibility table
      to: "~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/<N>-*.json"
      via: "E1-E5 read from each archived run state, before scoring"
      pattern: "inputs_digest"
    - from: 75-RETEST-REPORT.md Results
      to: "aof-tools estimate backtest <S> --calibration calibration-f4d1ffa9.json"
      via: "one scoring run (JSON and --raw), output pasted verbatim"
      pattern: "Executor estimates against actuals"
---

# TRD 75-01: Score EST-11 on 68-72 with the pre-recorded estimates

<objective>
Re-test EST-08's criterion prospectively, as EST-11 requires. For each of objectives 68-72, decide whether a run-state
estimate was recorded before execution with the frozen calibration. Score the eligible ones exactly once against what
their SUMMARYs recorded, and publish the honest verdict under the rule pre-registered in OBJECTIVE.md (repeated below).

Purpose: SC-1 and SC-2 of objective 75. This is the prospective test that 64 (reconstructed estimates) could not run.
Output: `75-RETEST-REPORT.md`, plus an EST-11 follow-up todo when the verdict is not met.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/OBJECTIVE.md
@.aoforge/objectives/67-minutes-recalibration/67-FREEZE.md

Read narrowly (`rg -n`, then `offset`/`limit`), do not load whole files:
- `.aoforge/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` (35 KB): the report shape to follow
  (frontmatter, Verdict first, What was compared, Results, Miscalibrated classes and follow-up, Defects found, Reproduce).
  Read its frontmatter and the `## Verdict` section only.
- `.aoforge/objectives/72-install-and-naming-cleanup/72-01-SUMMARY.md` lines 49-82: the unscored acceptance for 72.
- `.aoforge/decisions/resolved/DECISION-003.md` lines 43-66: the protocol (V5 says 75 checks each run state's digest; V6
  lists the limits, including the E8 noise floor: a five-objective SC2 sample passes 58.7%-75.1% of the time by spread
  alone).
- `plugins/aoforge/aoforge/bin/lib/estimate-backtest.cjs` lines 1-45 (the pinned constants BAND 0.3,
  COVERAGE_TARGET 0.8, MIN_OBJECTIVES 3, PRIMARY_METRICS agent_minutes + cost_usd) and lines 196-300 (`pickEstimate`
  judges the run state's persisted `estimate.execution`, `source: 'prospective'`; `compareWall`).
- `plugins/aoforge/aoforge/bin/lib/estimate-cli.cjs` lines 505-550: `runBacktest` takes each objective's latest
  finished run (`store.latestRun`) from the main checkout's history.
</context>

<embedded_context>

<codebase_examples>
The data, as found at planning (re-read it; do not trust these lines blindly):

```
~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/
  68-2026-10-08T16_19_42_082Z.json  69-2026-10-08T17_40_18_425Z.json  70-2026-10-08T18_39_35_873Z.json
  71-2026-10-08T19_32_28_948Z.json  72-2026-10-09T15_51_08_860Z.json  (+63, 65, 66, 67, 73: not candidates)
~/.claude/aoforge/state/estimates/history/devflow-claude-d3dccfe9/   pre-rename key: 68-71 byte-identical copies
~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json       72's ORIGINAL run state (current file, never
                                                                     finished): estimate.line "No estimate: objective 72
                                                                     has no minutes data in the calibration; ..."
~/.claude/aoforge/calibration.json                                   live calibration, sha256 f4d1ffa9...
~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json           frozen copy, same sha256
```

A run-state file's shape (68's): `{version, objective, started_at, finished_at, estimate: {line, wall_minutes,
confidence, execution: {wall_minutes, agent_minutes, tokens_input, tokens_output, cost_usd}, total: {...},
calibration: {path, version, data_as_of, samples, method: {minutes, through_objective, window_objectives},
inputs_digest}}, waves: [{wave, trds, p50, p90, started_at, finished_at, actual_minutes}]}`. 68's
`calibration.path` names the pre-rename runtime home. E3 compares the digest and method, never the path.

Backtest output (`estimate-format.cjs` lines 632-637): `### Verdict` (per-metric SC2/SC3 lines, then
`EST-08: <met|not met>`), `### Executor estimates against actuals`, `### Wall time (prospective run states)`,
`### Task classes`, `### Miscalibrated classes`, `### Exclusions`. The JSON form carries
`verdict: {sc2, sc3, est08, miscalibrated, follow_up_required}`. Large JSON is written to a temp file and printed as
`@file:<path>`.
</codebase_examples>

<anti_patterns>
- **Never pass 72 to `estimate backtest`.** `latestRun` would pick the 2026-10-09T15:51 one-TRD estimate and label it
  `prospective`, which is wrong. 72 is reported from the eligibility table only.
- No live `calibrate` (any form without `--out <scratch>`), no edit to `estimate*.cjs`, `calibrat*.cjs`,
  `calibration-inputs.cjs`, `model-rates.json`, the calibration files, any run-state or history file, or any SUMMARY's
  `duration` / `tokens_*`. No `tokens backfill --write`.
- No second scoring run with a different calibration, method, objective set or rule after seeing the result. The JSON
  form and the `--raw` form are one run each, with identical inputs. A crashed process (non-zero exit with no output)
  may be re-run once with identical inputs, and that is recorded.
- The verb's markdown says `EST-08: <verdict>`. Do not paste that line as the EST-11 verdict. It is the EST-08 rule
  applied to S. EST-11 is decided by rule 4.
- Do not substitute 73 or 74 for 72, and do not drop a failing objective from S after scoring.
- Do not write under `.aoforge/` with Write/Edit. Use `planning draft` + `doc put` and `todo add --from`.
- Do not "round into a pass". Print unrounded decision values as the verb gives them. Ratios in prose use the verb's
  rounding.
</anti_patterns>

<error_recovery>
- `estimate backtest` exits 1 with `objective <N> not found`: run it with `--cwd /Users/justin/dev/aoforge-claude` (a
  worktree may lack the history root). Never change the objective list to make it run.
- The live calibration hash is not f4d1ffa9: do not score. Restore it with
  `cp ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json ~/.claude/aoforge/calibration.json`, re-hash, and
  record the incident in the report (67-FREEZE section 2). The scoring passes the frozen copy by `--calibration`
  anyway, so the restore protects later estimates, not this score.
- An installed lib differs from the repository copy (`cmp` in Task 1): stop and report it in the SUMMARY as a blocker.
  Do not pick a copy silently. The planning check on 2026-10-10 found them all equal.
- `doc put` refuses with `stale draft`: re-run `planning draft` (it reseeds and keeps `<draft>.stale`), merge your
  text into the fresh draft, and publish again.
</error_recovery>

</embedded_context>

<gotchas>
- E5 needs the first SUMMARY commit under **either** planning directory name. The objective dirs were moved with
  `git mv` in 72, so with rename detection the add shows under the pre-rename path. Query both pathspecs and take the
  earliest committer date (`%cI`). Compare it with `started_at` as instants (`Date.parse`), not as strings.
- The pre-rename planning directory name is spelled in commands here only. The report lives under `.aoforge/` (not
  scanned by the rename guard), so naming it there is fine. Do not add the name to any tracked file outside `.aoforge/`.
- `estimate backtest` prints large JSON as `@file:<path>`. Copy that file into your scratch evidence directory before
  the temp file is cleaned up.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Preconditions and eligibility (E1-E5), committed before any scoring</name>
  <files>.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md</files>
  <action>
Work in a scratch evidence directory under the session scratchpad (`mktemp -d`). Run one plain command per Bash call.

1. Freeze and runtime checks (record every output line in the evidence dir):
   - `shasum -a 256 ~/.claude/aoforge/calibration.json ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json`:
     both must print `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`.
   - `cat ~/.claude/aoforge/.plugin-version` (expect 3.0.0).
   - `shasum -a 256` of the five candidate history files and of `~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json`,
     saved to the evidence dir (Task 2 proves they did not change).
   - For each lib in estimate-backtest, estimate-cli, estimate-rollup, estimate, estimate-math, estimate-format,
     estimate-run-store, calibration-inputs, calibrator, trd-identify: `cmp plugins/aoforge/aoforge/bin/lib/<f>.cjs
     ~/.claude/aoforge/bin/lib/<f>.cjs`. Also run `cmp plugins/aoforge/aoforge/references/model-rates.json
     ~/.claude/aoforge/references/model-rates.json`, and `git diff --quiet v3.0.0 HEAD -- <those paths>` (exit 0).
     All equal means the installed runtime scores. State in the report that it was chosen and why: the libs are
     identical, it is the runtime users run, and 67-FREEZE was built with the installed runtime.
2. For each candidate N in 68 69 70 71 72, read the run state(s) with a read-only `node -e` that prints `started_at`,
   `finished_at`, `estimate.line`, `estimate.calibration.inputs_digest`, `estimate.calibration.method` (as JSON),
   `estimate.execution.agent_minutes`, `estimate.execution.cost_usd` and `waves[0].trds`:
   - the archived file(s) `~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/<N>-*.json`;
   - for 68-71, `cmp` against the pre-rename key copy under `history/devflow-claude-d3dccfe9/` (record same or differ);
   - for 72 also the original run state `~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json` (objective
     must read `72`) and the 72-01 SUMMARY's `run_state:` line.
3. E5 timestamp per N: `git log --diff-filter=A --format=%cI --reverse -- '.aoforge/objectives/<N>-*/<N>-*-SUMMARY.md'`
   and the same with the pre-rename planning directory name in place of `.aoforge` (two plain commands). Take the
   earliest date of the two. E5 holds when `Date.parse(started_at) < Date.parse(earliest)`.
4. Apply E1-E5 exactly as written in OBJECTIVE.md "The EST-11 scoring rule". S is the set of candidates passing all five.
   Expected at planning: S = 68, 69, 70, 71. 72 fails E4 on its original run state, and its archived file fails E5. If
   the data says otherwise, follow the data and record the difference.
5. Draft the report: `node ~/.claude/aoforge/bin/aof-tools.cjs planning draft
   objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md`. Write it with:
   - frontmatter: `objective`, `type: retest-report`, `requirement: EST-11`, `verdict: pending`,
     `rule: pre-registered in OBJECTIVE.md and 75-01-TRD.md`, `candidates: [68, 69, 70, 71, 72]`, `scored: [...]`,
     `unscored: {72: "<checks failed>"}`, `calibration_sha256`, `inputs_digest`, `method`, `runtime: installed 3.0.0
     (libs cmp-equal to repository HEAD)`, `generated`.
   - `## Verdict`: "Pending: scored in Task 2 after this eligibility commit."
   - `## Forward-stamp coverage (EST-09)`: "Measured in TRD 75-05, after the objective's other TRDs ran."
   - `## The rule`: rules 1-6, copied verbatim from OBJECTIVE.md.
   - `## What was compared`: the E1-E5 table, one row per candidate. Columns: history file, finished, digest, method,
     objective estimate (p50 agent minutes / cost), started_at, first SUMMARY commit, result (scored or unscored: the
     failed checks). Under it, 72's two causes in prose: the original run state's `No estimate` line, 72-01's user
     acceptance (`unscored`), and the later file started at 15:51 with "1 TRD left". Then the freeze and runtime checks.
   Publish with `node ~/.claude/aoforge/bin/aof-tools.cjs doc put
   objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md --from <draft>`.
6. Commit the report and the SUMMARY checkpoint:
   `aof-tools commit "docs(75-01): EST-11 eligibility for 68-72, recorded before scoring" --files <report> <summary>`.
   This commit is the proof that eligibility was fixed before any score existed. Record its hash.
  </action>
  <verify>shasum lines show f4d1ffa9... twice; every cmp is silent; `rg -n -e 'verdict: pending' -e '## What was compared' .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md` matches; `git log -1 --format=%s` is the eligibility commit; `shasum -a 256` of the five candidate history files and 72's original run state is saved to the evidence dir (Task 2 compares against it)</verify>
  <done>S is fixed and committed with one row of evidence per candidate. No backtest has run yet.</done>
  <recovery>A wrong row (misread JSON): fix it with a new draft and `doc put`, and commit as a second eligibility commit before scoring. Never after scoring.</recovery>
</task>

<task type="auto">
  <name>Task 2: Score S once, publish the verdict, classes and follow-up</name>
  <files>.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md, .aoforge/todos/pending/(EST-11 follow-up, only when not met)</files>
  <action>
1. Score once, from the installed runtime, with S comma-joined (expected `68,69,70,71`):
   - JSON: `node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude estimate backtest <S>
     --calibration /Users/justin/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json`. Save the output, or the
     `@file:` target, into the evidence dir.
   - Markdown: the same command with `--raw`. Save it.
   Check from the JSON that every scored objective's `agent_minutes.source` and `cost_usd.source` is `prospective`. A
   `reconstructed` source on a scored objective is a defect: report it and do not re-score.
2. Decide EST-11 by rule 4: met only if S has all five candidates and `verdict.est08 === 'met'`. Otherwise not met.
   List every reason: each unscored candidate with its failed check, and each `sc2`/`sc3` that is not `pass`, per metric.
3. Read-only diagnosis of 72's missing estimate:
   `node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude estimate objective 72 --calibration
   /Users/justin/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json` (print only, no run state written). Record
   the reason text verbatim, and the cause if the output shows it. If it now gives an estimate, say so: it means a
   later change produced one, and it still was not recorded before execution.
4. When not met: create the follow-up todo. Draft a file in the scratchpad with frontmatter `title: Follow up EST-11
   not met (objective 75)`, `area: estimation`, `created: <ISO now>`, `disposition: follow-up`, `disposition_reason:
   "EST-11 not met in objective 75 (<one-line reasons>); this todo carries the next step"`, `disposition_target: "the
   next estimation objective (next milestone)"`, `disposition_date: <today>`, `disposition_by: objective 75 (TODO-01)`.
   Its body has:
   - `## Problem`: the verdict, S, the medians and coverages, the flagged classes (or "none flagged").
   - `## Solution`: the follow-up. (a) Record `estimate start <N>` before the first wave. 72's run was created by
     `estimate wave --start` with no objective estimate, so the execute-objective workflow or `wave --start` must
     guarantee an objective-level estimate. (b) Re-run the retest on the next five agent-only objectives. (c) Each
     flagged class with its direction (biased high/low, P90 too narrow).
   - `## Disposition`: one paragraph.
   Publish with `node ~/.claude/aoforge/bin/aof-tools.cjs todo add --stem est-11-follow-up-objective-75 --from <draft>`
   (the fixed stem keeps `files_modified` and 75-04's inventory exact).
5. Re-seed the report draft (`planning draft ...75-RETEST-REPORT.md`). Set frontmatter `verdict: met|not met`,
   `verdict_on_scored: <est08 on S>` and `eligibility_commit: <Task 1 hash>` (the scoring commit's hash goes in the
   SUMMARY, since a file cannot name the commit that adds it). Fill the sections:
   - `## Verdict`, first: **EST-11 met** or **EST-11 not met**, then every rule-4 reason. Give the scored-set figures
     per metric: median ratio, in-band count, P90 coverage of objectives and of TRDs, and the verb's verdict on S
     labelled "on the N scored objectives (EST-08 rule)". Then one sentence: nothing was tuned, and the calibration
     sha256 is unchanged.
   - `## Results`: the `--raw` markdown verbatim (Verdict through Exclusions), under a note that its `EST-08:` line is
     the EST-08 rule on S, not the EST-11 verdict.
   - `## Miscalibrated classes and follow-up` (SC-2): when not met, the classes the verb flagged (or that it flagged
     none, so the miss is the missing fifth estimate), the follow-up todo stem and the next steps. When met, say so.
   - `## Wall time (reported, not judged)`: the verb's wall section summarised: median of p50/measured wall over S, and
     how many measured walls fell at or under P90. Wall is not judged because the pinned rule is agent_minutes and cost.
   - `## Limits`: S has 4 (or |S|) objectives. The E8 noise floor (58.7-75.1% pass by spread alone). trd_level gives
     every TRD the same minutes (p50 10, P90 19), so TRD-level coverage measures the spread of TRD durations. SUMMARY
     minutes run about 0.91 of the transcript span (64).
   - `## Defects found`: 72's run state was created by `wave --start` without an objective estimate.
     `estimate backtest` takes the latest finished run, so a later partial `estimate start` replaces the pre-execution
     one for any objective. Add anything else found.
   - `## Freeze status`: the live calibration is still f4d1ffa9. The 67-FREEZE rule lifts now that 68-72 are scored.
     It was not rebuilt here; rebuilding is the follow-up's call.
   - `## Reproduce`: the exact commands, with hashes.
   Publish with `doc put`, then commit: `aof-tools commit "docs(75-01): EST-11 retest scored once on <S>: <verdict>"
   --files <report> <todo path if created> <summary>`.
  </action>
  <verify>`rg -n -e '^verdict: ' .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md` prints met or not met (never pending); `rg -n -e 'Executor estimates against actuals' -e 'Miscalibrated classes and follow-up' -e '## Limits' <report>` all match; the JSON shows source prospective for every scored objective; `shasum -a 256 ~/.claude/aoforge/calibration.json` still f4d1ffa9...; the history and run-state hashes equal the ones saved in Task 1; when not met, `rg -n -e '^disposition_reason: ' .aoforge/todos/pending/est-11-follow-up-objective-75.md` matches; `git log --format=%h --stat -2 -- plugins/` shows no commit from this TRD (no code changed)</verify>
  <done>EST-11 has a recorded verdict from one scoring run under the pre-registered rule, every row has a value or an unscored reason, and a not-met verdict names its classes and follow-up.</done>
  <recovery>A scoring command fails mechanically: record the exit code and stderr in the report under Defects found, re-run once with identical inputs, and if it fails again stop and report the blocker (verdict stays pending). Never change inputs to make it pass.</recovery>
</task>

</tasks>

<validation_gates>
<test>not_available for this TRD (no code); the guard tests run in 75-05</test>
</validation_gates>

<verification>
- Eligibility commit precedes scoring commit (`git log --format='%h %s' -- .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md`).
- The report's verdict follows rule 4 from the verb's JSON. Recompute it from the saved JSON with a read-only `node -e`.
- Calibration sha256 unchanged; no file under `plugins/` or `~/.claude/aoforge/state/estimates/` changed.
</verification>

<success_criteria>
- SC-1: rows for 68-72, median ratio and P90 coverage, verdict stated, nothing tuned.
- SC-2: on a not-met verdict, the classes and the follow-up are named, and nothing is rounded into a pass.
</success_criteria>

<output>
After completion, write `75-01-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 75-01 --from <draft>`
(stamp tokens first: `tokens stamp 75-01 --draft <draft>`). Record S, the verdict, the two commit hashes, the follow-up
todo stem, and `requirements-completed: [EST-11]` only if EST-11 is met. Otherwise put EST-11 under a "reported, not
met" line, not under requirements-completed.
</output>
