---
objective: 64-estimate-accuracy-validation
type: validation
requirement: EST-08
window_objectives: 10
harness_control: reproduced
est08: not met
ship_default: true
generated: 2026-10-07
---

# Objective 64: pre-registered rolling validation of the recency window (59-63)

Result in one paragraph. The frozen protocol of 64-DIAGNOSIS.md section 6 ran once on objectives 59-63. The old method reproduces 64-05's published rolling table exactly (every printed figure equal), so the harness is sound. The new method (`--window 10`) leaves **EST-08 not met**: the agent-minutes median ratio falls from 1.348 to 1.238, which flips agent-minutes SC2 from fail to pass, but the number of objectives inside the band stays at 2 of 5, and cost SC3 still fails with the same 32 of 41 TRDs covered by P90 (78% against a target of 80%). The pre-registered ship rule returns **`ship_default: true`**, because the minutes median is closer to 1 and no status that passed under the old method fails under the new. This is a five-objective result: read section 9 before relying on it.

## 1. What ran

Protocol: 64-DIAGNOSIS.md section 6 (V1 to V5), run once, with no change to any repository file (`git status --short plugins scripts` printed nothing at the start and at the end) and no change to the window, the cuts or the rule after a number was seen. The scratch directory held the snapshots and outputs; nothing under `~/.claude/devflow/` was written.

Frozen inputs, read from 64-DIAGNOSIS.md: `decision: build_window`, `window_objectives: 10`, `selection_output_sha256: fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`. The document has one commit (`34515181`) and no uncommitted change. Before scoring, the selection was re-run on the pre-59 snapshot (`git archive 401a9145^ .planning`, `scripts/estimate-window-eval.cjs report --eval 46-58 --grid 10,15,20,30,40 --label pre59`) and its JSON hashes to `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`: the frozen digest reproduces.

Cuts (V1): the data of objective N is `git archive <first>^ .planning`, `<first>` being the first commit of N.

| Objective | First commit | Objective directories in the cut | Leak pattern (listing) | Leak check |
|---|---|---|---|---|
| 59 | `401a9145` | 61 | `^(59\|6[0-3])-` | printed nothing |
| 60 | `05a5b5f4` | 62 | `^(60\|6[1-3])-` | printed nothing |
| 61 | `d7b9c938` | 63 | `^(61\|6[23])-` | printed nothing |
| 62 | `9ad19b1c` | 64 | `^(62\|63)-` | printed nothing |
| 63 | `26e4e57f` | 65 | `^63-` | printed nothing |

Methods (V2), with `<cut>` the extracted snapshot and `<scratch>/cal-{old,new}-N.json` the outputs (`--out`, never the live path):

- old: `calibrate --paths <cut> --no-overhead --window all --out <scratch>/cal-old-N.json --raw`
- new: `calibrate --paths <cut> --no-overhead --window 10 --out <scratch>/cal-new-N.json --raw`

Summary lines the calibrator printed (TRDs, tasks, tasks with tokens):

| Cut | Old (`--window all`) | New (`--window 10`) |
|---|---|---|
| 59 | 324 TRDs, 749 tasks, 237 with tokens | 90 TRDs, 200 tasks, 83 with tokens (dropped 310 TRDs) |
| 60 | 331 TRDs, 766 tasks, 237 with tokens | 82 TRDs, 187 tasks, 68 with tokens (dropped 325 TRDs) |
| 61 | 338 TRDs, 784 tasks, 237 with tokens | 76 TRDs, 178 tasks, 55 with tokens (dropped 338 TRDs) |
| 62 | 347 TRDs, 805 tasks, 240 with tokens | 75 TRDs, 174 tasks, 48 with tokens (dropped 348 TRDs) |
| 63 | 358 TRDs, 831 tasks, 243 with tokens | 80 TRDs, 186 tasks, 45 with tokens (dropped 354 TRDs) |

Scoring (V3 and V4): `node scripts/estimate-rolling-backtest.cjs --old 59=… --old 63=…` alone for the control, then once with `--old` and `--new` for the same five objectives (section 10). Each objective is estimated from its own cut calibration against its own TRDs as executed (the same input 64-05 used) and judged by `buildBacktest` with the unchanged constants (band 30%, coverage target 80%). Positive control first (section 2); the new set was scored only after it reproduced.

## 2. Positive control

`harness_control: reproduced`. The old-method rolling result (`roll-old.json`, from `--old` only) was compared to 64-05's published table at its printed digits: minutes at one decimal, cost at two, ratios at three, calibration sizes in TRDs, and every aggregate figure and status of the old method. Every row below is equal.

| Obj | Figure | Expected (64-05) | Observed | Equal |
|---|---|---|---|---|
| 59 | min p50 | 108.4 | 108.4 | yes |
| 59 | min P90 | 334.3 | 334.3 | yes |
| 59 | min ratio | 1.291 | 1.291 | yes |
| 59 | cost p50 | 20.04 | 20.04 | yes |
| 59 | cost P90 | 28.48 | 28.48 | yes |
| 59 | cost ratio | 0.839 | 0.839 | yes |
| 59 | cal TRDs | 324 | 324 | yes |
| 60 | min p50 | 99.8 | 99.8 | yes |
| 60 | min P90 | 288.0 | 288.0 | yes |
| 60 | min ratio | 1.348 | 1.348 | yes |
| 60 | cost p50 | 21.19 | 21.19 | yes |
| 60 | cost P90 | 29.63 | 29.63 | yes |
| 60 | cost ratio | 1.071 | 1.071 | yes |
| 60 | cal TRDs | 331 | 331 | yes |
| 61 | min p50 | 123.0 | 123.0 | yes |
| 61 | min P90 | 383.9 | 383.9 | yes |
| 61 | min ratio | 1.758 | 1.758 | yes |
| 61 | cost p50 | 27.37 | 27.37 | yes |
| 61 | cost P90 | 39.61 | 39.61 | yes |
| 61 | cost ratio | 0.993 | 0.993 | yes |
| 61 | cal TRDs | 338 | 338 | yes |
| 62 | min p50 | 141.6 | 141.6 | yes |
| 62 | min P90 | 403.9 | 403.9 | yes |
| 62 | min ratio | 1.475 | 1.475 | yes |
| 62 | cost p50 | 29.13 | 29.13 | yes |
| 62 | cost P90 | 41.16 | 41.16 | yes |
| 62 | cost ratio | 0.637 | 0.637 | yes |
| 62 | cal TRDs | 347 | 347 | yes |
| 63 | min p50 | 82.8 | 82.8 | yes |
| 63 | min P90 | 294.1 | 294.1 | yes |
| 63 | min ratio | 0.739 | 0.739 | yes |
| 63 | cost p50 | 19.43 | 19.43 | yes |
| 63 | cost P90 | 29.51 | 29.51 | yes |
| 63 | cost ratio | 0.715 | 0.715 | yes |
| 63 | cal TRDs | 358 | 358 | yes |
| all | min median ratio | 1.348 | 1.348 | yes |
| all | min pooled ratio | 1.274 | 1.274 | yes |
| all | min in band | 2 | 2 | yes |
| all | min P90 covers objectives | 5 | 5 | yes |
| all | min P90 covers TRDs | 40 | 40 | yes |
| all | min SC2 | fail | fail | yes |
| all | min SC3 | pass | pass | yes |
| all | cost median ratio | 0.839 | 0.839 | yes |
| all | cost pooled ratio | 0.813 | 0.813 | yes |
| all | cost in band | 4 | 4 | yes |
| all | cost P90 covers objectives | 4 | 4 | yes |
| all | cost P90 covers TRDs | 32 | 32 | yes |
| all | cost SC2 | pass | pass | yes |
| all | cost SC3 | fail | fail | yes |
| all | EST-08 | not met | not met | yes |

One note on the comparison itself: the first run of the scratch comparison script read the calibration size from a wrong field name and printed `NaN` in the `cal TRDs` rows (so its last line said `FAILED`). The harness output already listed 324, 331, 338, 347 and 358 in its Calibrations table; the script's field was corrected (`samples.trds`) and it was run again over the same unchanged `roll-old.json`. No harness input or code changed.

## 3. Result: new method

The harness output for the new set, unedited (`<scratch>/roll-both.md`, section "New method (--new)", verdict through the aggregate table):

### Verdict

- Agent minutes: SC2 pass (median ratio 1.24, 2 of 5 objectives in ±30%) · SC3 pass (P90 covers 5 of 5 objectives (100%) and 40 of 41 TRDs (98%); target 80%)
- Cost: SC2 pass (median ratio 0.80, 3 of 5 objectives in ±30%) · SC3 fail (P90 covers 4 of 5 objectives (80%) and 32 of 41 TRDs (78%); target 80%)

EST-08: not met

### Executor estimates against actuals

| Objective | TRDs | Source | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 59 State and merge plumbing | 7 | reconstructed | 1h 21m / 3h 43m | 1h 24m | 0.96 | yes | $19.03 / $25.80 | $23.88 | 0.80 | yes |
| 60 Edit gate enforces the action | 7 | reconstructed | 1h 32m / 3h 34m | 1h 14m | 1.24 | yes | $19.97 / $28.30 | $19.79 | 1.01 | yes |
| 61 Store-mode rough edges and observability | 9 | reconstructed | 1h 41m / 3h 45m | 1h 10m | 1.44 | yes | $25.95 / $37.59 | $27.57 | 0.94 | yes |
| 62 Built-in sweep | 11 | reconstructed | 2h 14m / 4h 45m | 1h 36m | 1.39 | yes | $30.40 / $44.03 | $45.75 | 0.66 | no |
| 63 Todo store, hook coexistence and built-in inventory | 7 | reconstructed | 1h 18m / 2h 52m | 1h 52m | 0.70 | yes | $18.05 / $27.85 | $27.16 | 0.66 | yes |

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.24 | 1.11 | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 3 of 5 (60%) |
| Cost | 5 | 0.80 | 0.79 | 3 of 5 | 4 of 5 (80%) | 32 of 41 (78%) | 1 of 5 (20%) |

The same five objectives at full precision (`roll-both.json`, `new.objectives`), for the rows the markdown rounds:

| Objective | Minutes p50 / P90 / actual (min) | Minutes ratio | In band | <= P90 | Cost p50 / P90 / actual (USD) | Cost ratio | In band | <= P90 |
|---|---|---|---|---|---|---|---|---|
| 59 | 80.6 / 223.4 / 84 | 0.959 | yes | yes | 19.0268 / 25.7994 / 23.8786 | 0.797 | yes | yes |
| 60 | 91.6 / 214.4 / 74 | 1.238 | yes | yes | 19.9731 / 28.2953 / 19.7921 | 1.009 | yes | yes |
| 61 | 100.6 / 224.9 / 70 | 1.437 | no | yes | 25.9458 / 37.5934 / 27.5684 | 0.941 | yes | yes |
| 62 | 133.8 / 285.2 / 96 | 1.394 | no | yes | 30.3968 / 44.0281 / 45.7525 | 0.664 | no | no |
| 63 | 78.1 / 171.8 / 112 | 0.697 | no | yes | 18.0529 / 27.8531 / 27.1594 | 0.665 | no | yes |

New-method summary (`new.summary`): agent minutes median 1.238, pooled 1.112, in band 2, P90 covers 5 of 5 objectives and 40 of 41 TRDs (0.9756), SC2 pass, SC3 pass; cost median 0.797, pooled 0.787, in band 3, P90 covers 4 of 5 objectives (0.80) and 32 of 41 TRDs (0.7805), SC2 pass, SC3 fail. `new.verdict.est08` is `not met`. The status that blocks `met` is cost SC3: the TRD coverage of 78% is below the 80% target, exactly as under the old method.

## 4. Before and after

The harness table (`roll-both.md`, "Before and after"), unedited:

| Objective | Minutes ratio old | Minutes ratio new | Cost ratio old | Cost ratio new |
|---|---|---|---|---|
| 59 | 1.29 | 0.96 | 0.84 | 0.80 |
| 60 | 1.35 | 1.24 | 1.07 | 1.01 |
| 61 | 1.76 | 1.44 | 0.99 | 0.94 |
| 62 | 1.48 | 1.39 | 0.64 | 0.66 |
| 63 | 0.74 | 0.70 | 0.72 | 0.66 |

EST-08 old: not met; new: not met

Full precision from `roll-both.json` (`old.objectives` and `new.objectives`), with the same objectives and the same actuals:

| Objective | Minutes ratio old | Minutes ratio new | Cost ratio old | Cost ratio new |
|---|---|---|---|---|
| 59 | 1.291 | 0.959 | 0.839 | 0.797 |
| 60 | 1.348 | 1.238 | 1.071 | 1.009 |
| 61 | 1.758 | 1.437 | 0.993 | 0.941 |
| 62 | 1.475 | 1.394 | 0.637 | 0.664 |
| 63 | 0.739 | 0.697 | 0.715 | 0.665 |

Aggregate, old method (`old.summary`, harness table `roll-both.md`):

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.35 | 1.27 | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 4 of 5 (80%) |
| Cost | 5 | 0.84 | 0.81 | 4 of 5 | 4 of 5 (80%) | 32 of 41 (78%) | 1 of 5 (20%) |

Aggregate, new method (`new.summary`, harness table `roll-both.md`):

| Metric | Compared | Median ratio | Pooled ratio | In band | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.24 | 1.11 | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 3 of 5 (60%) |
| Cost | 5 | 0.80 | 0.79 | 3 of 5 | 4 of 5 (80%) | 32 of 41 (78%) | 1 of 5 (20%) |

| Status | Old method | New method |
|---|---|---|
| Agent minutes SC2 (median ratio within the band) | fail (1.348) | pass (1.238) |
| Agent minutes SC3 (P90 coverage) | pass | pass |
| Cost SC2 | pass (0.839) | pass (0.797) |
| Cost SC3 (P90 coverage) | fail | fail |
| EST-08 | not met | not met |

Reading the table, using only the numbers above: the minutes ratio moves toward 1 for objectives 59, 60, 61 and 62 and away from 1 for 63 (0.739 to 0.697); the median falls by 0.110 and the pooled ratio by 0.162; objectives in band stay at 2 of 5 (59 and 63 under the old method, 59 and 60 under the new); 61 (1.437) and 62 (1.394) stay above the band and 63 falls just under it. The cost median moves from 0.839 to 0.797, further below 1, and objectives in band go from 4 of 5 to 3 of 5 (63 leaves the band at 0.665); the ship rule does not look at that.

For reference, the primary result of 64-05 on the frozen calibration (64-DIAGNOSIS.md section 1): median agent-minutes ratio 1.51, 2 of 5 objectives within the band, SC2 fail; cost passes with median ratio 0.86; the P90 covers. The rolling old-method rows above differ from it because each objective here is estimated from its own leave-future-out cut rather than one frozen calibration, and they are the control of this run.

## 5. Classes

Flagged classes (`Miscalibrated classes` of the harness), old method then new method:

Old method:

- code_tdd (minutes): biased_high, median ratio 1.59, coverage 100%
- prompt_tdd (minutes): biased_high, median ratio 1.88, coverage 100%
- prompt (minutes): biased_low, median ratio 0.53, coverage 100%
- prompt_tdd (cost): p90_too_narrow, median ratio 0.78, coverage 68%
- test (cost): p90_too_narrow, median ratio 0.78, coverage 69%
- code (cost): p90_too_narrow, median ratio 0.70, coverage 17%
- test_tdd (cost): biased_low, median ratio 0.65, coverage 80%
- prompt (cost): biased_low, p90_too_narrow, median ratio 0.27, coverage 33%

New method:

- prompt_tdd (minutes): biased_high, median ratio 1.88, coverage 100%
- test_tdd (minutes): biased_low, median ratio 0.65, coverage 80%
- prompt_tdd (cost): p90_too_narrow, median ratio 0.88, coverage 68%
- test (cost): biased_low, p90_too_narrow, median ratio 0.53, coverage 8%
- test_tdd (cost): biased_low, p90_too_narrow, median ratio 0.58, coverage 60%
- prompt (cost): biased_low, p90_too_narrow, median ratio 0.62, coverage 33%

Agent minutes: `code_tdd` (biased high, median ratio 1.59 old) is no longer flagged under the window (median ratio 1.29), `prompt` (biased low, 0.53) is no longer flagged (0.97), `prompt_tdd` stays biased high at 1.88 and `test_tdd` becomes biased low (0.79 old, 0.65 new, on 5 tasks). Cost: `code` is no longer flagged; `test` and `test_tdd` get further below 1 (test 0.78 to 0.53, test_tdd 0.65 to 0.58) and `test` coverage falls from 69% to 8%. The class lists are small samples (a class has 1 to 41 tasks over the five objectives).

## 6. Ship rule

`shipRule` (scripts/estimate-rolling-backtest.cjs, 64-DIAGNOSIS.md section 7), quoted from the harness, not recomputed:

```
Ship default: true (the agent-minutes median ratio is closer to 1 (new 1.238, old 1.348) and no passing status regresses)
```

Its fields (`roll-both.json`, `ship`):

| Field | Value |
|---|---|
| est08_old | not met |
| est08_new | not met |
| minutes_median_old | 1.348 |
| minutes_median_new | 1.238 |
| improved | true |
| regressions | [] |
| ship_default | true |
| reason | the agent-minutes median ratio is closer to 1 (new 1.238, old 1.348) and no passing status regresses |

`ship_default: true` means 64-10 makes the window the default of `calibrate` and regenerates the live calibration, saying so (64-DIAGNOSIS.md section 7). EST-08 stays not met (`est08: not met`); 64-10 records that.

## 7. Windows built

The `window` block of each new calibration (`cal-new-N.json`), and the harness Calibrations table for the new set:

| Cut | `window.objectives` | First kept | Last kept | Kept objectives | Dropped objectives | Dropped TRDs |
|---|---|---|---|---|---|---|
| 59 | 10 | 49-objective-branch-and-pr-lifecycle | 58-estimation-engine-and-surfacing | 10 | 44 | 310 |
| 60 | 10 | 50-github-enforcement-and-setup | 59-state-and-merge-plumbing | 10 | 45 | 325 |
| 61 | 10 | 51-github-migration-and-docs | 60-edit-gate-enforces-the-action | 10 | 46 | 338 |
| 62 | 10 | 52-store-mode-polish | 61-store-mode-rough-edges-and-observability | 10 | 47 | 348 |
| 63 | 10 | 53-worktree-and-health-hygiene | 62-built-in-sweep | 10 | 48 | 354 |

Dropped TRDs count every TRD of a dropped objective (including TRDs with no outcome), so kept samples plus dropped TRDs exceed the old sample count; the pre-59 snapshot, for example, holds 401 TRDs against 324 samples at cut 59 (64-08 recorded 91 of 401 TRDs kept for the pre-59 snapshot at window 10, 90 with samples).

| Objective | Data as of | Samples (TRDs) | Window | inputs_digest |
|---|---|---|---|---|
| 59 | 2026-10-05 | 90 | 10 | sha256:149a81784a4ce5c18c643228ccb123df8437898d13dda864c2960bf70771a076 |
| 60 | 2026-10-05 | 82 | 10 | sha256:84cc3679977f90b78d28c554f4943732f5029ae1472080a27b7893badebf0028 |
| 61 | 2026-10-06 | 76 | 10 | sha256:63b6aaf565968a157c71f6b78f4a357fbc9bd6f88f6616e814a69eaa2d52df5e |
| 62 | 2026-10-06 | 75 | 10 | sha256:a9887583f00cde2a34bdf415e94abc7ac578aa79815d64641c4c1c25649bbc2e |
| 63 | 2026-10-06 | 80 | 10 | sha256:d95c65cb7261a8b2b6ee31bfa98c8f7963dbcffd3e3807fc9de52397adb2a616 |

Every new calibration carries a `window` block, so each cut dropped something; the old calibrations carry `window: null` (Calibrations table of section 4).

## 8. Prospective point

Objective 63's persisted wall estimate is reported unchanged and never judged (V5). The run state `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json` hashes to `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee` at the start and at the end of this run. The wall row below is from the read-only frozen-calibration run (`estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw`); it equals the row quoted in the TRD. The rolling harness prints no wall rows (`Wall time: none recorded`), so the `Reproduced` flag shown here is the one of the frozen-calibration run only.

| Objective | Estimate p50 / P90 | Reconstructed p50 / P90 | Actual | Ratio | <= P90 | Reproduced |
|---|---|---|---|---|---|---|
| 63 Todo store, hook coexistence and built-in inventory | 1h 37m / 4h 50m | 1h 37m / 4h 50m | 1h 51m | 0.87 | yes | yes |

## 9. Limits

- **Five objectives.** The noise floor of 64-DIAGNOSIS.md section 5 applies: an estimator with the spread of the all-history ratios passes SC2 on a random five-objective sample 58.7% of the time, one with window 10's spread 75.1%. A single five-objective verdict is noisy in both directions. The agent-minutes SC2 flip from fail to pass is a move of the median from 1.348 to 1.238 across the 1.3 line; it is not shown to be more than that, and the count of objectives in the band did not change (2 of 5).
- **Leave-future-out reconstruction.** Each cut is today's code run on old data (`git archive <first>^ .planning`), not a calibration that existed at the time; the cuts hold only the token fields stamped at that moment. The control reproduces 64-05's old-method table exactly, which supports the harness, not the future.
- **The window was chosen on 46-58 with weak support.** 64-DIAGNOSIS.md section 4.4: the sweep over W was not monotone (only 10 beat all-history, 15, 20 and 30 were worse), the advantage in S was 0.066, and the choice was made before 59-63 were scored and not changed after. This run neither confirms nor refutes the mechanism behind the advantage.
- **What did not move.** Cost SC3 (TRD P90 coverage 32 of 41, 78%) is unchanged and is the status that keeps EST-08 at not met; the window was not designed for it. Objective 62's cost actual ($45.75) is above P90 under both methods.
- **A ship decision on a small, mixed result.** The rule asks for a minutes median closer to 1 and no regressed status; both held. The cost median moves further below 1 (0.839 to 0.797) and objective 63's minutes ratio moves further below 1 (0.739 to 0.697), which the rule does not weigh.
- **Confirmation needs the next five objectives.** True prospective confirmation needs five objectives executed after this validation, with the run history 64-02 records (`~/.claude/devflow/state/estimates/history/`), estimated from the calibration that exists before each one starts.

## 10. Reproduce

`<scratch>` is any empty directory outside the repository and the repository's own df-tools and scripts are used (the mirror lacks `backtest` and `--window`). Nothing here writes `~/.claude/devflow/calibration.json` (it hashes to `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` before and after).

```
# per N with FIRST = 59 401a9145, 60 05a5b5f4, 61 d7b9c938, 62 9ad19b1c, 63 26e4e57f
mkdir -p <scratch>/cut-N
git archive --format=tar -o <scratch>/cut-N.tar FIRST^ .planning
tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N
ls <scratch>/cut-N/.planning/objectives > <scratch>/cut-N-objectives.txt
rg -n "<leak pattern of the table in section 1>" <scratch>/cut-N-objectives.txt          # prints nothing
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window all --out <scratch>/cal-old-N.json --raw
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window 10  --out <scratch>/cal-new-N.json --raw

# positive control
node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/cal-old-59.json --old 60=<scratch>/cal-old-60.json --old 61=<scratch>/cal-old-61.json --old 62=<scratch>/cal-old-62.json --old 63=<scratch>/cal-old-63.json --json <scratch>/roll-old.json --raw > <scratch>/roll-old.md

# score, once
node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/cal-old-59.json … --old 63=<scratch>/cal-old-63.json --new 59=<scratch>/cal-new-59.json … --new 63=<scratch>/cal-new-63.json --json <scratch>/roll-both.json --raw > <scratch>/roll-both.md

# prospective point (read-only, frozen calibration)
shasum -a 256 ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json
node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw > <scratch>/wall-63.md
```

The two figures that matter for 64-10 are in the frontmatter: `est08: not met` and `ship_default: true`.
