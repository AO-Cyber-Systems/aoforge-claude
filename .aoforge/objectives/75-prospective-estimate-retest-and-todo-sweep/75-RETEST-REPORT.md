---
objective: 75-prospective-estimate-retest-and-todo-sweep
type: retest-report
requirement: EST-11
verdict: not met
verdict_on_scored: met
eligibility_commit: eb3538af
rule: pre-registered in OBJECTIVE.md and 75-01-TRD.md
candidates: [68, 69, 70, 71, 72]
scored: [68, 69, 70, 71]
unscored:
  72: "E1, E2 and E4 fail on the original run state (not archived, finished_at null, no objective-level estimate); E5 fails on the archived file (started 2026-10-09T15:51:08.860Z, after 72-01..72-25 had run)"
calibration_sha256: f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134
inputs_digest: sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0
method: {minutes: trd_level, window_objectives: 10, through_objective: 66}
runtime: installed 3.0.0 (libs cmp-equal to repository HEAD)
generated: 2026-10-10T06:20:44Z
---

# EST-11 retest report: objective 75, TRD 75-01

## Verdict

**EST-11 not met.** Rule 4 of the pre-registered rule makes EST-11 met only if the scored set S has all five candidates
and `est08` is `met`. S has four.

There is one reason: **objective 72 is unscored.** Its original run state fails E1 (not archived), E2 (`finished_at`
null) and E4 (no objective-level estimate: `No estimate: objective 72 has no minutes data in the calibration`). Its only
archived file fails E5 (started 2026-10-09T15:51:08.860Z, after 72-01..72-25 had run). Detail under "What was compared".

No SC failed on the scored set. Neither `sc2` nor `sc3` failed for agent minutes or for cost on S, so there is no
second reason. The miss is the missing fifth estimate, not the calibration.

Scored-set figures (S = 68, 69, 70, 71; unrounded values as the verb's JSON gives them, prose as it rounds them):

| Metric | Median ratio (p50 / actual) | Pooled ratio | In band (0.70-1.30) | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|
| Agent minutes | 1.086 (1.09) | 1.063 | 4 of 4 | 4 of 4 (100%) | 21 of 21 (100%) | 3 of 4 (75%) |
| Cost | 1.14 (1.14) | 1.117 | 4 of 4 | 4 of 4 (100%) | 19 of 21 (90.48%) | 4 of 4 (100%) |

The verb's verdict on S, labelled "on the 4 scored objectives (EST-08 rule)": **met** (`sc2` pass and `sc3` pass for
both metrics). That verdict is reported only. It does not decide EST-11: a four-objective set cannot meet a five-objective
criterion.

Every scored objective's `agent_minutes.source` and `cost_usd.source` is `prospective` in the JSON (68, 69, 70, 71):
the estimates were read from the run states recorded before execution, not reconstructed.

Nothing was tuned. The scoring ran once in JSON form and once in `--raw` form with identical inputs, against the frozen
calibration whose sha256 is still `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`. The eligibility
table was committed (`eb3538af`) before the scoring run existed.

## Forward-stamp coverage (EST-09)

Measured in TRD 75-05, after the objective's other TRDs ran.

## The rule

Pre-registered 2026-10-10 in `OBJECTIVE.md` ("The EST-11 scoring rule"), before any scoring run. Copied verbatim:

1. Candidates: 68, 69, 70, 71, 72, the first five objectives executed after EST-10 shipped. No substitute is drawn from
   73, 74 or 75: the ROADMAP sequencing keeps them out of the scored five because human wait dominates their minutes.
2. A candidate is scored only if it has a run state meeting every check:
   - E1: archived under `~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/`.
   - E2: `finished_at` is set.
   - E3: `estimate.calibration.inputs_digest` is
     `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0`, and `estimate.calibration.method` is
     `{minutes: trd_level, window_objectives: 10, through_objective: 66}`, compared field by field and numerically.
   - E4: `estimate.execution.agent_minutes.p50` and `estimate.execution.cost_usd.p50` are finite numbers, so an
     objective-level estimate exists.
   - E5: `started_at` is earlier than the first commit that added any `<N>-*-SUMMARY.md` under either planning
     directory name, so the estimate was recorded before execution.
3. The scored set S is scored once by the installed runtime:
   `estimate backtest <S> --calibration ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json`, run once in JSON
   form and once in `--raw` form with identical inputs. The verb's pinned constants (64-01) decide each metric
   (agent_minutes, cost_usd). SC2 passes when the median of p50/actual is within 0.70-1.30. SC3 passes when P90 covers
   at least 80% of the compared objectives and of the compared TRDs. `est08` is met only when SC2 and SC3 pass for both
   metrics.
4. EST-11 is **met** only if S has all five candidates and `est08` is `met`. Otherwise it is **not met**, and the
   report lists every reason: each unscored candidate with the check it failed, and each failing SC per metric.
5. These are reported but never decide the verdict: the verb's verdict on S alone, labelled "on the N scored
   objectives"; the prospective wall time per objective and per wave; anything about 73 or 74.
6. Nothing is tuned. This objective makes no live `calibrate` write and changes no estimator, backtest or rates code,
   calibration, run-state or history file, or SUMMARY duration or token value. Nothing is re-scored with another
   calibration, method, set or rule after the result is seen. A crashed process may be re-run once with identical inputs,
   and that is recorded.

## What was compared

Eligibility, read before any scoring run. Every value below comes from a read-only `node` read of the archived run state
under `~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/` (and, for 72, the original run state), and
from `git log --diff-filter=A` for the first SUMMARY commit under each planning directory name. Estimates are the run
state's persisted `estimate.execution` (agent minutes and cost, p50 and P90).

| N | History file | Finished | Digest (E3) | Method (E3) | Objective estimate: agent min p50 / P90; cost p50 / P90 (E4) | started_at | First SUMMARY commit (earliest of both names) | Result |
|---|---|---|---|---|---|---|---|---|
| 68 | `68-2026-10-08T16_19_42_082Z.json` | 2026-10-08T17:14:11.407Z | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | 73.5856 / 121.0657 min; $23.1358 / $33.2205 | 2026-10-08T16:19:42.082Z | 2026-10-08T12:22:05-04:00 (16:22:05Z), e5407736 | scored (E1-E5 pass) |
| 69 | `69-2026-10-08T17_40_18_425Z.json` | 2026-10-08T18:20:44.583Z | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | 62.9816 / 104.1164 min; $19.5811 / $28.2990 | 2026-10-08T17:40:18.425Z | 2026-10-08T13:42:35-04:00 (17:42:35Z), acd265e1 | scored (E1-E5 pass) |
| 70 | `70-2026-10-08T18_39_35_873Z.json` | 2026-10-08T19:00:43.842Z | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | 31.1749 / 53.2080 min; $9.1075 / $13.3269 | 2026-10-08T18:39:35.873Z | 2026-10-08T14:42:28-04:00 (18:42:28Z), d0da9584 | scored (E1-E5 pass) |
| 71 | `71-2026-10-08T19_32_28_948Z.json` | 2026-10-08T20:07:50.591Z | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | 52.3780 / 87.1607 min; $17.8199 / $25.5995 | 2026-10-08T19:32:28.948Z | 2026-10-08T15:34:12-04:00 (19:34:12Z), 658b5e6a | scored (E1-E5 pass) |
| 72 (archived) | `72-2026-10-09T15_51_08_860Z.json` | 2026-10-09T16:43:07.408Z | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | 10.0000 / 19.0000 min; $1.3206 / $1.9833 (one TRD left, 72-26) | 2026-10-09T15:51:08.860Z | 2026-10-08T18:26:35-04:00 (22:26:35Z), bf12644a | unscored: fails E5 (started 17 h after the first SUMMARY commit; 72-01..72-25 had already run) |
| 72 (original) | not archived: the live file `~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json` | `null` | `sha256:90dff7e9...faaac0` (equal) | trd_level / 10 / 66 (equal) | none: `estimate.execution` is null | 2026-10-08T22:24:56.615Z | 2026-10-08T18:26:35-04:00 (22:26:35Z), bf12644a | unscored: fails E1 (not archived), E2 (finished_at null), E4 (no objective-level estimate) |

Check by check, for the scored four: E1 holds (the file sits under the current repo key, and `cmp` shows each is
byte-identical to its copy under the pre-rename key `history/devflow-claude-d3dccfe9/`: same68, same69, same70, same71).
E2 holds (`finished_at` set). E3 holds (digest equal as a string, and `minutes`, `window_objectives` and
`through_objective` equal field by field: `trd_level`, 10 and 66; the `calibration.path` names the pre-rename runtime
home and is not compared). E4 holds (p50 and P90 finite for agent minutes and cost). E5 holds (`Date.parse(started_at)`
is earlier than the earliest SUMMARY commit as an instant: 2.4, 2.3, 2.9 and 1.7 minutes earlier for 68, 69, 70 and 71).
The first SUMMARY adds for 68-71 exist only under the pre-rename planning directory name until the 2026-10-09 `git mv`
of the directories (commit 4f0ed6b8, which shows the add under the new name); the earlier of the two is used.

**S = 68, 69, 70, 71.** Four of the five candidates are eligible.

### Objective 72 is unscored, for two independent causes

1. **The original run state has no objective-level estimate.** It was created by the orchestrator's `estimate wave 72 1
   --start` at 2026-10-08T22:24:56.615Z, not by `estimate start 72`. Its `estimate.line` reads: `No estimate: objective
   72 has no minutes data in the calibration; run df-tools calibrate`. Per-wave p50 and P90 figures exist for 17 of its 18
   waves (wave 11, TRD 72-19, has none), but `estimate.execution` is null, so E4 fails; `finished_at` is null (E2) and
   the file was never archived (E1). TRD 72-01 tried the frozen-method recalibration into a scratch file (`estimate
   objective 72` still printed `No estimate`), escalated, and the user replied `unscored`. 72-01-SUMMARY records
   `run_state: unscored (accepted: unscored)`.
2. **The only archived 72 file was started after 72-01..72-25 had run.** `history/aoforge-claude-df646fc2/72-2026-10-09T15_51_08_860Z.json`
   comes from a later `estimate start 72` made when one TRD (72-26) was left ("1 TRD left in 1 wave"). Its
   `started_at` of 2026-10-09T15:51:08.860Z is after the first SUMMARY commit for 72 (2026-10-08T22:26:35Z), so E5 fails.
   It is not a pre-execution estimate, and its figures (10 min p50 and 19 min P90, one TRD) describe the tail of the
   objective, not the objective.

72 is therefore not passed to `estimate backtest`: the verb takes each objective's latest finished run, which for 72
is that one-TRD file, and would label it `prospective`.

### Freeze and runtime checks

- `shasum -a 256 ~/.claude/aoforge/calibration.json` and the frozen copy `~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json`
  both print `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`.
- Installed runtime: `~/.claude/aoforge/.plugin-version` reads `3.0.0`.
- `cmp` between the installed and repository copies of `estimate-backtest`, `estimate-cli`, `estimate-rollup`,
  `estimate`, `estimate-math`, `estimate-format`, `estimate-run-store`, `calibration-inputs`, `calibrator`,
  `trd-identify` (all `bin/lib/*.cjs`) and `references/model-rates.json`: all equal. `git diff --quiet v3.0.0 HEAD`
  over the same paths exits 0. The installed runtime was chosen to score because the libraries are identical, it is the
  runtime users run, and 67-FREEZE was built with it.
- sha256 of the files this TRD must not change (read before scoring; re-read after scoring, all eight unchanged,
  including the live and frozen calibration at `f4d1ffa9...`):

| File | sha256 |
|---|---|
| `history/aoforge-claude-df646fc2/68-2026-10-08T16_19_42_082Z.json` | `373a3842a36bde976ec8216eb221c4a44f65505ba47ac043682fcf1ff6e6d6ea` |
| `history/aoforge-claude-df646fc2/69-2026-10-08T17_40_18_425Z.json` | `f7ed0861b5427aec83ce9ce819dc75a17c7dd2d086a5cec362dfb4f61a5bdf4e` |
| `history/aoforge-claude-df646fc2/70-2026-10-08T18_39_35_873Z.json` | `e345d26bb1fc4e25cad70086e61c48469c681cb8a7215458102619b1330bdb65` |
| `history/aoforge-claude-df646fc2/71-2026-10-08T19_32_28_948Z.json` | `60cbbe7741ae79eaf3f4ad36776b5a8b3f00fec958dfed8170480555e5eac381` |
| `history/aoforge-claude-df646fc2/72-2026-10-09T15_51_08_860Z.json` | `5271b463c56356a869458137d35971cd67e107337aab8ceab4203ac0e0aefc70` |
| `estimates/devflow-claude-d3dccfe9.json` (72, original) | `7967f23c3d8ccb455cda6b150b3ad64510ddf96621315dc28df95253711f7c1b` |

### Objective 72 after the fact (read-only)

`estimate objective 72 --calibration ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json` (print only, no run state
written) now prints `Objective 72: all TRDs done (27 of 27)`, with zero remaining TRDs and an all-zero execution
estimate. It does not give a pre-execution figure, and nothing built now could have been recorded before execution
anyway. The recorded reason from the day is the original run state's line, quoted above (`has no minutes data in the
calibration`), which `estimate-format.cjs` prints when the run's execution wall estimate is missing (lines 262 and 276).
The report does not claim a deeper cause than that.

## Results

The verb's markdown (`estimate backtest 68,69,70,71 --calibration ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json --raw`),
Verdict through Exclusions, verbatim. **Its `EST-08:` line is the EST-08 rule applied to the four scored objectives, not the
EST-11 verdict.** EST-11 is decided by rule 4, above.

### Verdict

- Agent minutes: SC2 pass (median ratio 1.09, 4 of 4 objectives in ±30%) · SC3 pass (P90 covers 4 of 4 objectives (100%) and 21 of 21 TRDs (100%); target 80%)
- Cost: SC2 pass (median ratio 1.14, 4 of 4 objectives in ±30%) · SC3 pass (P90 covers 4 of 4 objectives (100%) and 19 of 21 TRDs (90%); target 80%)

EST-08: met

### Executor estimates against actuals

| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 68 Milestone and objective verbs | 7 | prospective | 1h 14m / 2h 01m | 1h 15m | 0.98 | yes | $23.14 / $33.22 | $22.32 | 1.04 | yes |
| 69 Drafts, health and doctor | 6 | prospective | 1h 03m / 1h 44m | 1h 01m | 1.03 | yes | $19.58 / $28.30 | $16.45 | 1.19 | yes |
| 70 CLI defects and hook shape | 3 | prospective | 31 min / 53 min | 25 min | 1.25 | yes | $9.11 / $13.33 | $7.24 | 1.26 | yes |
| 71 Stack drafter and verify policy | 5 | prospective | 52 min / 1h 27m | 46 min | 1.14 | yes | $17.82 / $25.60 | $16.36 | 1.09 | yes |

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 4 | 1.09 | 1.06 | 4 of 4 | 4 of 4 (100%) | 21 of 21 (100%) | 3 of 4 (75%) |
| Cost | 4 | 1.14 | 1.12 | 4 of 4 | 4 of 4 (100%) | 19 of 21 (90%) | 4 of 4 (100%) |

### Wall time (prospective run states)

Compares `estimate.wall_minutes` of the run state (execution only: the waves, not the verifier or planning, so not the total the estimate line prints) with the measured time from `estimate start` to `estimate finish`. Reproduced: the estimate rebuilt now from this calibration matches the recorded one within 0.05 minutes. Reported, never judged.

| Objective | Estimate p50 / P90 | Reconstructed p50 / P90 | Actual | Ratio | <= P90 | Reproduced |
|---|---|---|---|---|---|---|
| 68 Milestone and objective verbs | 41 min / 1h 04m | 41 min / 1h 04m | 54 min | 0.76 | yes | yes |
| 69 Drafts, health and doctor | 39 min / 1h 02m | 39 min / 1h 02m | 40 min | 0.97 | yes | yes |
| 70 CLI defects and hook shape | 24 min / 40 min | 24 min / 40 min | 21 min | 1.12 | yes | yes |
| 71 Stack drafter and verify policy | 37 min / 1h 00m | 37 min / 1h 00m | 35 min | 1.06 | yes | yes |

| Objective | Wave | TRDs | Estimate p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|
| 68 Milestone and objective verbs | 1 | 68-01, 68-02, 68-03 | 15 min / 25 min | 18 min | 0.84 | yes |
| 68 Milestone and objective verbs | 2 | 68-04, 68-05, 68-06 | 15 min / 25 min | 17 min | 0.86 | yes |
| 68 Milestone and objective verbs | 3 | 68-07 | 10 min / 19 min | 15 min | 0.66 | yes |
| 69 Drafts, health and doctor | 1 | 69-01, 69-02, 69-03 | 15 min / 25 min | 13 min | 1.13 | yes |
| 69 Drafts, health and doctor | 2 | 69-04, 69-05 | 13 min / 23 min | 11 min | 1.18 | yes |
| 69 Drafts, health and doctor | 3 | 69-06 | 10 min / 19 min | 13 min | 0.77 | yes |
| 70 CLI defects and hook shape | 1 | 70-01, 70-02 | 13 min / 23 min | 12 min | 1.07 | yes |
| 70 CLI defects and hook shape | 2 | 70-03 | 10 min / 19 min | 7 min | 1.36 | yes |
| 71 Stack drafter and verify policy | 1 | 71-01, 71-03 | 13 min / 23 min | 15 min | 0.88 | yes |
| 71 Stack drafter and verify policy | 2 | 71-02, 71-04 | 13 min / 23 min | 10 min | 1.28 | yes |
| 71 Stack drafter and verify policy | 3 | 71-05 | 10 min / 19 min | 8 min | 1.23 | yes |

### Task classes

**Agent minutes**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 31 | 1.09 | 100% | ok |
| test | 10 | 1.17 | 100% | ok |
| other | 4 | 0.97 | 75% | miscalibrated: p90_too_narrow |
| code | 3 | 1.00 | 100% | ok |
| test_tdd | 3 | 1.43 | 100% | miscalibrated: biased_high |
| doc | 1 | 0.57 | 0% | too_few |
| prompt | 1 | 1.00 | 100% | too_few |

**Cost**

| Class | Tasks | Median ratio | P90 coverage | Verdict |
|---|---|---|---|---|
| code_tdd | 31 | 1.34 | 94% | miscalibrated: biased_high |
| test | 10 | 1.28 | 100% | ok |
| other | 4 | 0.84 | 75% | miscalibrated: p90_too_narrow |
| code | 3 | 0.84 | 100% | ok |
| test_tdd | 3 | 1.06 | 100% | ok |
| doc | 1 | 0.43 | 0% | too_few |
| prompt | 1 | 1.60 | 100% | too_few |

### Miscalibrated classes

- other (minutes): p90_too_narrow, median ratio 0.97, coverage 75%
- test_tdd (minutes): biased_high, median ratio 1.43, coverage 100%
- code_tdd (cost): biased_high, median ratio 1.34, coverage 94%
- other (cost): p90_too_narrow, median ratio 0.84, coverage 75%

### Exclusions

none

---

Calibration /Users/justin/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json, data as of 2026-10-08, samples 75 TRDs / 177 tasks / 72 with tokens, minutes trd_level, inputs_digest sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0. Band ±30%, coverage target 80%.

## Miscalibrated classes and follow-up

The verb flagged four classes on S and set `follow_up_required: false`, because SC2 and SC3 passed for both metrics:

| Metric | Class | Flag | Tasks | Median ratio | P90 coverage |
|---|---|---|---|---|---|
| agent minutes | other | p90_too_narrow | 4 | 0.968 | 75% |
| agent minutes | test_tdd | biased_high | 3 | 1.425 | 100% |
| cost | code_tdd | biased_high | 31 | 1.345 | 93.55% |
| cost | other | p90_too_narrow | 4 | 0.841 | 75% |

Three of the four rest on 3 or 4 tasks, so they are small-sample signals. `code_tdd` cost (31 tasks) is the one with a
real sample: its estimates run about 1.34 times the actual, and its P90 still covers 93.55% of the tasks.

EST-11 is not met because of the missing fifth estimate, not because of these classes. The follow-up is the todo
`est-11-follow-up-objective-75` in `.aoforge/todos/pending/`, with the disposition fields. Its steps:

1. Guarantee an objective-level estimate before wave 1 of every objective (`estimate start <N>`; or make `wave --start`
   refuse or build one), so that no objective is lost as 72 was.
2. Make `estimate backtest` choose the run that was started before execution, not the latest, so a later partial
   `estimate start` cannot replace the pre-execution estimate.
3. Re-run the retest on the next five agent-only objectives with an eligibility table committed before any score.
4. Re-check the four flagged classes on that sample before any change, each with its direction (biased high or P90
   too narrow). Nothing is tuned to pass.

## Wall time (reported, not judged)

The pinned rule judges agent minutes and cost, not wall time. On S, the verb's prospective wall comparison gives a median
ratio (p50 / measured wall) of 1.016, with the measured wall at or under the P90 for 4 of 4 objectives (100%) and for
11 of 11 waves (100%). Per objective: 68 0.76 (41 min estimate, 54 min measured), 69 0.97 (39 / 40), 70 1.12 (24 / 21),
71 1.06 (37 / 35). Each estimate reproduced within 0.05 minutes from the frozen calibration. Two waves fall outside a
±30% band, wave 3 of 68 (0.66) and wave 2 of 70 (1.36), and every wave's measured time is at or under its P90. They are
reported, not judged.

## Limits

- S has four objectives, not five. The E8 noise floor from DECISION-003 still applies: a five-objective SC2 sample
  passes 58.7% to 75.1% of the time by spread alone, so a pass on a sample this small is weak evidence that the
  calibration is right. A pass here is consistent with the calibration working; it does not prove it.
- The `trd_level` method gives every TRD the same minutes (p50 10, P90 19), so TRD-level P90 coverage (21 of 21, 100%)
  measures the spread of TRD durations rather than per-TRD skill.
- SUMMARY minutes run about 0.91 of the transcript span (objective 64), and the calibration shares that bias.
- E5 compares `started_at` with the first SUMMARY commit. The four estimates were recorded 1.7 to 2.9 minutes before
  that commit and 0.5 to 0.7 minutes before wave 1 started. That shows each estimate predates the results; it is a
  check of the pre-registered rule, not an audit of what was known when the estimate was recorded.
- Actual agent minutes and cost are the verb's measured minutes and priced token stamps, the same actuals objective 64
  compared against.

## Defects found

1. **72's run state was created by `estimate wave 72 1 --start` without an objective-level estimate** (`has no minutes
   data in the calibration`). The 72-01 gate caught it and the user accepted `unscored`, but nothing can build an
   objective-level estimate once the first wave has started and the TRDs are done. This is why the retest has four
   scored objectives rather than five.
2. **`estimate backtest` takes the latest finished run.** A later partial `estimate start` (72's, with one TRD left)
   replaces the pre-execution run for any objective, and would be labelled `prospective`. 72 was kept out by hand.
3. **`doc put` and `todo add` from a linked worktree write the MAIN checkout's `.aoforge/`** (verb rule D-14: `summary
   post|checkpoint` are the only verbs that write the caller's checkout). Run from this worktree they left an untracked
   copy in the main checkout, which would make the wave merge refuse to overwrite it. The executor copied each file into
   its own worktree, committed it there, and removed the stray main-checkout copy after the commit. The eligibility
   report, the follow-up todo and their commits are otherwise as the TRD specified.
4. No mechanical failure: both scoring runs exited 0 and nothing was re-run.

## Freeze status

The live calibration is still `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`, and no `calibrate` write was
made. The 67-FREEZE rule lifts now that 68-72 are scored (68-71) or reported unscored (72). It was not rebuilt here;
rebuilding is the follow-up's call and would need a new objective with its own validation, not a change made after
seeing this result.

## Reproduce

Eligibility (read-only):

```
shasum -a 256 ~/.claude/aoforge/calibration.json ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json
cat ~/.claude/aoforge/.plugin-version
git log --diff-filter=A --format='%cI %h' --reverse -- ':(glob).aoforge/objectives/<N>-*/<N>-*-SUMMARY.md'
git log --diff-filter=A --format='%cI %h' --reverse -- ':(glob)<pre-rename planning dir>/objectives/<N>-*/<N>-*-SUMMARY.md'
```

Scoring (once each; run from the main checkout so the history root resolves):

```
node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude estimate backtest 68,69,70,71 --calibration /Users/justin/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json
node ~/.claude/aoforge/bin/aof-tools.cjs --cwd /Users/justin/dev/aoforge-claude estimate backtest 68,69,70,71 --calibration /Users/justin/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json --raw
```

The JSON form printed `@file:<tmp>`, whose sha256 was `131c2ab0047d01c47e145b3f1e330ec79f1a0ef3ae07dac901fbe4ceb20f8084`
(verdict: `sc2` and `sc3` pass for both metrics, `est08: met`, `follow_up_required: false`, `source: prospective` on all four
objectives and both metrics). Re-running reproduces the same figures while the history files below are unchanged.

| Input | sha256 |
|---|---|
| `calibration.json` and `state/backtest/calibration-f4d1ffa9.json` | `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134` |
| `history/aoforge-claude-df646fc2/68-...json` | `373a3842a36bde976ec8216eb221c4a44f65505ba47ac043682fcf1ff6e6d6ea` |
| `history/aoforge-claude-df646fc2/69-...json` | `f7ed0861b5427aec83ce9ce819dc75a17c7dd2d086a5cec362dfb4f61a5bdf4e` |
| `history/aoforge-claude-df646fc2/70-...json` | `e345d26bb1fc4e25cad70086e61c48469c681cb8a7215458102619b1330bdb65` |
| `history/aoforge-claude-df646fc2/71-...json` | `60cbbe7741ae79eaf3f4ad36776b5a8b3f00fec958dfed8170480555e5eac381` |

Decision (rule 4), recomputed from the saved JSON with a read-only `node -e`: `S.length === 5 && verdict.est08 === 'met'`
is false, because `S.length` is 4.
