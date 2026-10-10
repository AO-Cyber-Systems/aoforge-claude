---
objective: 75-prospective-estimate-retest-and-todo-sweep
type: retest-report
requirement: EST-11
verdict: pending
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

Pending: scored in Task 2 after this eligibility commit.

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
- sha256 of the files this TRD must not change (Task 2 compares against these):

| File | sha256 |
|---|---|
| `history/aoforge-claude-df646fc2/68-2026-10-08T16_19_42_082Z.json` | `373a3842a36bde976ec8216eb221c4a44f65505ba47ac043682fcf1ff6e6d6ea` |
| `history/aoforge-claude-df646fc2/69-2026-10-08T17_40_18_425Z.json` | `f7ed0861b5427aec83ce9ce819dc75a17c7dd2d086a5cec362dfb4f61a5bdf4e` |
| `history/aoforge-claude-df646fc2/70-2026-10-08T18_39_35_873Z.json` | `e345d26bb1fc4e25cad70086e61c48469c681cb8a7215458102619b1330bdb65` |
| `history/aoforge-claude-df646fc2/71-2026-10-08T19_32_28_948Z.json` | `60cbbe7741ae79eaf3f4ad36776b5a8b3f00fec958dfed8170480555e5eac381` |
| `history/aoforge-claude-df646fc2/72-2026-10-09T15_51_08_860Z.json` | `5271b463c56356a869458137d35971cd67e107337aab8ceab4203ac0e0aefc70` |
| `estimates/devflow-claude-d3dccfe9.json` (72, original) | `7967f23c3d8ccb455cda6b150b3ad64510ddf96621315dc28df95253711f7c1b` |
