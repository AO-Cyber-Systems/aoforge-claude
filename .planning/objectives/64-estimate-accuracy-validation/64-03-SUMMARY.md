---
objective: 64-estimate-accuracy-validation
trd: "03"
subsystem: estimation
tags: [estimate, calibration, backtest, tokens, backfill, provenance]

requires:
  - objective: 58-estimation-engine-and-surfacing
    provides: estimate objective --all, the frozen calibration (5cf42c4b, 58-10), the run store
  - objective: 57-estimation-data-foundation
    provides: tokens backfill (EST-07), calibration-inputs, token-usage
provides:
  - "Provenance evidence for the frozen calibration and 63's prospective run state"
affects: [64-04, 64-05]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions: []

patterns-established: []

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 0min
completed: 2026-10-07
---

# Objective 64 TRD 03: Frozen inputs and token backfill Summary

**In progress.**

## Progress
- [x] Task 1: Provenance of the frozen calibration and 63's run state, the drift list, and the 63 reproduction — 482535cc
- [x] Task 2: Backfill the token history of 58-63 (dry run, write, guard, commit, idempotence) — c0d1f157
- [x] Task 3: Audit the actuals (SUMMARY minutes vs executor transcript spans for 59-63) — (this commit)

## Provenance

| Item | Measured | Expected | Match |
|---|---|---|---|
| `shasum -a 256 ~/.claude/devflow/calibration.json` (live) | `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` | `5cf42c4b…1fbea` | yes |
| `shasum -a 256 ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` (frozen copy) | `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` | `5cf42c4b…1fbea` | yes |
| frozen copy mtime (`stat -f '%m'`) | `1791229680` (2026-10-05 15:48:00 local) | 1791229680 | yes |
| live calibration mtime | `1791229680` (2026-10-05 15:48:00 local) | unchanged since 58-10 | yes |
| Objective 59 first commit `401a9145` (`docs(59): create objective TRDs`) | `1791236515` (2026-10-05T17:41:55-04:00) | 1791236515 | yes |
| calibration older than 59's first commit | 1791229680 < 1791236515 (6,835 s, 1h 53m earlier) | earlier | yes |
| frozen `version` / `data_as_of` / `samples` | `2` / `2026-10-05` / `{tasks: 746, trds: 323, with_tokens: 236}` | same | yes |
| frozen `inputs_digest` | `sha256:254f7950caf2a37e8d3159dc80f6e9505de46eecdee5d440f3e3a70121091f89` | (recorded) | n/a |
| frozen `classifier_version` | `1` | (recorded) | n/a |
| 63 run state in history (`history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json`) | `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee` | `08f88f9f…fdee` | yes |

Neither recovery path in error_recovery was needed: the live file was not rebuilt, the frozen copy is intact and the 63
history copy is byte-identical to the one the planner preserved. Every estimate shown while 59-63 were planned and
built was made from this one calibration (323 TRDs, `data_as_of` 2026-10-05), and it holds no 59-63 data: it is out of
sample for all five objectives.

## Estimator drift

`git log cce70b30..HEAD` over the objective-estimate path (estimate.cjs, estimate-rollup.cjs, estimate-math.cjs,
calibration-inputs.cjs, calibrator.cjs, objective.cjs, roadmap.cjs, misc.cjs, config.cjs, helpers.cjs,
references/model-rates.json):

| Commit | Date | Subject |
|---|---|---|
| `047730ea` | 2026-10-05T18:05:32-04:00 | fix(59-05): roadmap_updated reports whether ROADMAP.md changed |
| `e67dd32d` | 2026-10-05T18:10:21-04:00 | fix(59-04): milestone complete counts only the milestone's objectives |
| `a49e8b16` | 2026-10-05T18:12:08-04:00 | merge: wave 2 TRD 59-05 |

`git diff --stat cce70b30 HEAD` over the same files: `objective.cjs | 24 +++-`, `roadmap.cjs | 166 +++---`
(2 files, +125/-65). The other nine files are byte-identical to 58's completion.

| File | Change | Can it affect `estimateObjective`? |
|---|---|---|
| objective.cjs | `cmdObjectiveRemove` and `cmdObjectiveComplete` write ROADMAP.md only when its text changed and report `roadmap_updated` from that comparison | No. The estimator imports only `findObjectiveInternal` (estimate.cjs:39, estimate-rollup.cjs:29), which no hunk touches. |
| roadmap.cjs | `cmdMilestoneComplete` scoped to the milestone's objectives (new helpers `completionScope`, `countTaskElements`, `summaryOneLiner`) and `state_updated` from a text comparison | No. The estimator imports only `getRoadmapObjectiveInternal` (estimate-rollup.cjs:30), which no hunk touches. |

Adjacent modules outside the named path, checked for completeness: `estimate-cli.cjs`, `estimate-format.cjs`,
`estimate-run-store.cjs`, `trd-identify.cjs`, `agent-overhead.cjs`, `token-usage.cjs`, `token-backfill.cjs`,
`tokens-cli.cjs` and `frontmatter.cjs` are unchanged. `estimate-milestone.cjs` changed (`5feacc3e` refactor(59-04):
milestone objective selection moved to milestone-scope.cjs), which is the milestone path, not the objective path.
`df-tools.cjs` changed only in help text and the `merge-driver`, `state advance-job --objective`, `telemetry --scan` and
`todo sync` dispatch; the `estimate` dispatch is untouched.

Conclusion: the objective-estimate path is unchanged in every function `estimate objective N --all` executes. The
reproduction below is the proof.

## Reproduction of 63

`df-tools estimate objective 63 --all --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
(run from the 64-03 checkout, JSON to the scratchpad), compared with the persisted run state rounded to 0.1:

| Cell | Run state (raw) | Run state (0.1) | Reconstructed | diff | reproduced |
|---|---|---|---|---|---|
| objective wall p50 | 96.61616043566684 | 96.6 | 96.6 | 0.00 | yes |
| objective wall P90 | 290.40059551531397 | 290.4 | 290.4 | 0.00 | yes |
| W1 (63-01,63-05) p50 | 19.738206139394915 | 19.7 | 19.7 | 0.00 | yes |
| W1 (63-01,63-05) P90 | 67.31643574086333 | 67.3 | 67.3 | 0.00 | yes |
| W2 (63-02) p50 | 14.5 | 14.5 | 14.5 | 0.00 | yes |
| W2 (63-02) P90 | 54.100000000000016 | 54.1 | 54.1 | 0.00 | yes |
| W3 (63-03,63-04) p50 | 16.21765152054369 | 16.2 | 16.2 | 0.00 | yes |
| W3 (63-03,63-04) P90 | 42.59996074545397 | 42.6 | 42.6 | 0.00 | yes |
| W4 (63-06) p50 | 9.500000000000002 | 9.5 | 9.5 | 0.00 | yes |
| W4 (63-06) P90 | 36.60000000000001 | 36.6 | 36.6 | 0.00 | yes |
| W5 (63-07) p50 | 25.000000000000007 | 25 | 25 | 0.00 | yes |
| W5 (63-07) P90 | 102.50000000000001 | 102.5 | 102.5 | 0.00 | yes |

**Verdict: reproduced, 12 of 12 cells, every diff 0.00.**

The persisted estimate line also reproduces: the run state's `line` reads "1h 43m median (P90 5h 04m) wall · $22.08
(P90 $34.02)", and the reconstruction's `total` is wall p50 102.8 / P90 304.2 minutes (1h 43m / 5h 04m) and cost p50
$22.0785 / P90 $34.0153. Note for 64-04/64-05: the run state's `estimate.wall_minutes` (96.6 / 290.4) is the
**execution** wall (`execution.wall_minutes`), while the printed line shows the **total** (execution plus one verifier
spawn, 102.8 / 304.2). A prospective comparison must say which of the two it uses.

Since the code path is unchanged and 63 reproduces exactly, a reconstruction of 59-62 from the frozen calibration and
the TRDs as executed is what the engine would have printed at planning time.

The TRD inputs are also the ones the estimate saw: `git log 401a9145^..HEAD` over the 59-63 `*-TRD.md` files shows
only planning-time commits: each objective's `docs(NN): create objective TRDs` plus two checker revisions made before
execution started (`725c38b4` fix(59): revise TRDs based on checker feedback, 17:46 on 2026-10-05, five minutes after
`401a9145`; `6ca818a8` fix(62): split 62-09 into 62-09 and 62-11, 4 minutes after `9ad19b1c`). No TRD of 59-63 was
edited during or after execution.

## Token backfill

All runs from the 64-03 checkout with the repository df-tools (`--cwd <checkout>`): the backfill matched transcripts
against the main checkout (`repo: /Users/justin/dev/devflow-claude`) and read and wrote SUMMARYs in the 64-03 checkout.

**Dry run** (`tokens backfill --raw`):

```
summaries 450 · already stamped 245 · recovered 41 · unrecovered 164 (no_transcript 157, unkeyed 7)
executor transcripts 944 (identified 295, unidentified 81, ambiguous 3, foreign 565)
```

Recovered ids (JSON form): 58-01 58-04 58-05 58-06 58-07 58-08 58-09 · 59-01..59-07 · 60-01..60-07 · 61-01 61-03 61-06
61-07 61-08 61-09 · 62-02 62-03 62-04 62-06 62-07 62-09 62-10 62-11 · 63-03 63-04 63-05 63-06 63-07 · **64-03**.
That is the expected 40 plus 64-03: this TRD's own SUMMARY, which exists since Task 1's checkpoint commit and whose live
transcript the index already identifies. No TRD of 58-64 is unrecovered; the 164 unrecovered are all older history
(no_transcript 157, unkeyed 7).

**Write** (`tokens backfill --write --raw`):

```
summaries 450 · already stamped 245 · recovered 41 · unrecovered 164 (no_transcript 157, unkeyed 7)
executor transcripts 944 (identified 295, unidentified 81, ambiguous 3, foreign 565)
written 41 · unchanged 0 · skipped 0 · failed 0
```

**Diff guard (57-07), first run, on the full write:**

```json
{"files":41,"non_summary":[],"outside_58_63":[".planning/objectives/64-estimate-accuracy-validation/64-03-SUMMARY.md"],"bad_count":0,"bad":[]}
```

The one file outside 58-63 was 64-03's own in-flight checkpoint, stamped with the partial tokens of a still-running
executor (`tokens_input: 2321210`, `tokens_source: "backfill"`). That is wrong data for this TRD, so it was reverted
with `git restore` on that one path (see Deviations); its final token fields come from the forward stamp
(`tokens stamp --draft`) right before `summary post`.

**Diff guard, second run, after the revert (the state committed):**

```json
{"files":40,"non_summary":[],"outside_58_63":[],"bad_count":0,"bad":[]}
```

**Coverage after the write** over the 41 SUMMARYs of 59-63: `rg --files-without-match '^tokens_input:'` over the five
directories prints nothing. Every one of the 41 carries token fields.

## Forward-stamp gap

| tokens_source | Count (59-63) | TRDs |
|---|---|---|
| `"live"` (EST-06 forward stamp) | 8 | 61-02, 61-04, 61-05, 62-01, 62-05, 62-08, 63-01, 63-02 |
| `"backfill"` (EST-07, this TRD) | 33 | the other 33 |
| none | 0 | |

**Defect finding:** EST-06 forward-stamped 8 of 41 executor SUMMARYs (19.5%) in the five objectives built after the
engine shipped, and none at all in 59 or 60. Likely cause, found while recording this: the stamp step is in the
repository's `agents/executor.md` (line 1066, `tokens stamp … --draft`), in the mirrored
`~/.claude/devflow/workflows/execute-trd.md` and in `templates/summary.md`, but **no installed executor agent prompt
has it**: `rg -l "tokens stamp"` over `~/.claude/plugins/cache/aocyber/devflow/{2.7.1,2.10.1,2.11.0,2.12.0,2.13.1}/agents/executor.md`
and `~/.claude/plugins/marketplaces/aocyber/plugins/devflow/agents/executor.md` matches none. The spawned executor
therefore stamps only when it happens to follow the @-referenced workflow or template text. The fix is a release that
ships the current `agents/executor.md` (the repository already has the step), not a code change; noted for 64-05/64-06.

## Actuals audit

Scratch script `<scratchpad>/actuals-audit.cjs` (not committed), run as
`node <scratchpad>/actuals-audit.cjs /Users/justin/dev/devflow-claude`: `calibration-inputs.collectProject` for SUMMARY
minutes and their source, `token-usage.indexExecutorTranscripts` + `tokensForTrd` for each TRD's executor
transcript(s), `agent-overhead.transcriptSpanMinutes` (first to last record) for the measured span, summed over a TRD's
transcripts. Ratio = SUMMARY minutes / transcript minutes.

| TRD | SUMMARY min | source | transcripts | transcript min | ratio |
|---|---|---|---|---|---|
| 59-01 | 12 | summary | 1 | 12.5 | 0.96 |
| 59-02 | 8 | summary | 1 | 7.6 | 1.06 |
| 59-03 | 10 | summary | 1 | 10.5 | 0.95 |
| 59-04 | 10 | summary | 1 | 10.8 | 0.93 |
| 59-05 | 9 | summary | 1 | 10.8 | 0.84 |
| 59-06 | 25 | summary | 1 | 30.8 | 0.81 |
| 59-07 | 10 | summary | 1 | 11 | 0.91 |
| 60-01 | 10 | summary | 1 | 11.7 | 0.85 |
| 60-02 | 25 | summary | 1 | 1035.7 | 0.02 (outlier) |
| 60-03 | 5 | summary | 1 | 5.5 | 0.9 |
| 60-04 | 5 | summary | 1 | 5.6 | 0.89 |
| 60-05 | 8 | summary | 1 | 8.6 | 0.93 |
| 60-06 | 8 | summary | 1 | 6.9 | 1.16 |
| 60-07 | 13 | summary | 1 | 12.8 | 1.01 |
| 61-01 | 10 | summary | 1 | 12 | 0.84 |
| 61-02 | 8 | summary | 1 | 9 | 0.89 |
| 61-03 | 5 | metric | 1 | 8.7 | 0.58 |
| 61-04 | 5 | summary | 1 | 5.1 | 0.98 |
| 61-05 | 6 | summary | 1 | 6.7 | 0.9 |
| 61-06 | 7 | summary | 1 | 7.3 | 0.96 |
| 61-07 | 10 | summary | 1 | 10.7 | 0.93 |
| 61-08 | 8 | summary | 1 | 7.1 | 1.12 |
| 61-09 | 11 | summary | 1 | 13.4 | 0.82 |
| 62-01 | 7 | summary | 1 | 7.8 | 0.9 |
| 62-02 | 14 | metric | 1 | 14.8 | 0.95 |
| 62-03 | 10 | summary | 1 | 10.6 | 0.95 |
| 62-04 | 8 | metric | 1 | 9.4 | 0.85 |
| 62-05 | 8 | summary | 1 | 7.2 | 1.11 |
| 62-06 | 3 | summary | 1 | 3.9 | 0.76 |
| 62-07 | 4 | summary | 1 | 4.6 | 0.87 |
| 62-08 | 12 | summary | 1 | 13.5 | 0.89 |
| 62-09 | 7 | metric | 1 | 8.8 | 0.79 |
| 62-10 | 17 | summary | 1 | 18.3 | 0.93 |
| 62-11 | 6 | summary | 1 | 7.5 | 0.8 |
| 63-01 | 11 | summary | 1 | 14.6 | 0.75 |
| 63-02 | 11 | summary | 1 | 11.9 | 0.92 |
| 63-03 | 8 | summary | 1 | 8 | 1 |
| 63-04 | 6 | summary | 1 | 5.9 | 1.02 |
| 63-05 | 17 | summary | 1 | 17.8 | 0.96 |
| 63-06 | 45 | summary | 1 | 50.4 | 0.89 |
| 63-07 | 14 | summary | 1 | 19 | 0.74 |

**Coverage:** 41 of 41 TRDs have a transcript (none `no transcript`); every TRD has exactly one executor transcript
(none resumed into a second one). Minute source: 37 `summary`, 4 `metric` (61-03, 62-02, 62-04, 62-09: the four with
a nested or missing SUMMARY `duration`, as the TRD predicted).

**Totals and spread:**

| Measure | Value |
|---|---|
| median ratio (41 TRDs) | **0.91** (P25 0.83, P75 0.96) |
| sum SUMMARY minutes / sum transcript minutes, raw | 436 / 1494.8 = 0.29 (dominated by 60-02) |
| same, 60-02 span with its idle gap removed (33.3) | 436 / 492.4 = **0.89** |
| same, 60-02 excluded | 411 / 459.1 = 0.90 |
| outliers (\|ratio - 1\| > 0.5) | **60-02** only (61-03, 0.58, is the nearest miss) |

Per objective (raw spans; 60 corrected in brackets):

| Objective | TRDs | SUMMARY min | transcript min | median ratio | aggregate ratio |
|---|---|---|---|---|---|
| 59 | 7 | 84 | 94.0 | 0.93 | 0.89 |
| 60 | 7 | 74 | 1086.8 [84.4] | 0.91 | 0.07 [0.88] |
| 61 | 9 | 70 | 80.0 | 0.90 | 0.88 |
| 62 | 11 | 96 | 106.4 | 0.89 | 0.90 |
| 63 | 7 | 112 | 127.6 | 0.92 | 0.88 |

**The outlier, 60-02.** Its transcript (`5eaa8cbb…/subagents/agent-aaa2db569973ca156.jsonl`) runs from
2026-10-06T00:50:43Z to 18:06:23Z. At 01:23:01 the run was interrupted (`[Request interrupted by user]`, after a 15.4-min
stall in which nothing was recorded; the orchestrator's later message calls it a stream-watchdog stall). It sat idle
for 1,002.4 minutes (16.7 h) and was resumed at 18:05:24 by an orchestrator SendMessage; it then finished in about one
minute (verify, SUMMARY post, docs commit). Span without the idle gap: 33.3 min (ratio 0.75); without the stall as
well, about 18 min. The SUMMARY's 25 min sits between the two. This is a transcript-span artefact, not a bad SUMMARY:
a first-to-last span counts any idle wait inside one transcript, so 64-05 must not use raw spans as actuals.

**Objective 63, measured wave time vs the TRDs in the wave** (run state `actual_minutes`, timed by `estimate wave` from
wave start to wave finish, so it includes merge and orchestration):

| Wave | TRDs | measured wave min | max SUMMARY min | SUMMARY / measured | max transcript min | transcript / measured |
|---|---|---|---|---|---|---|
| 1 | 63-01, 63-05 | 18.6 | 17 | 0.92 | 17.8 | 0.96 |
| 2 | 63-02 | 12.2 | 11 | 0.90 | 11.9 | 0.98 |
| 3 | 63-03, 63-04 | 8.4 | 8 | 0.95 | 8.0 | 0.95 |
| 4 | 63-06 | 50.6 | 45 | 0.89 | 50.4 | 1.00 |
| 5 | 63-07 | 19.3 | 14 | 0.73 | 19.0 | 0.98 |
| total | | 109.1 | 95 | 0.87 | 107.1 | 0.98 |

**What it means.** The median ratio is 0.91, not 1: SUMMARY durations are whole minutes reported by the executor and
run about 9-11% below the measured executor time (aggregate 0.89 with 60-02's idle gap removed, the same 0.88-0.90 in
every objective). On 63, the transcript span is within 0-5% of the independently measured wave time, while the SUMMARY
minutes are 13% short in total and 27% short on wave 5. So the SUMMARY "actual" is a consistent ~10% undercount of real
executor wall time, not noise. Because the calibration is built from the same SUMMARY field, the estimates share that
bias: an estimate that matches SUMMARY actuals will undershoot measured wall time by roughly 10%, and a comparison
against measured wave time (63's run state) should expect the estimate to read about 10% low for that reason alone.
64-05 should state the minute comparison on the SUMMARY basis (like for like with the calibration) and quote this
ratio beside it; the token/cost actuals are unaffected (they come from transcripts directly).
