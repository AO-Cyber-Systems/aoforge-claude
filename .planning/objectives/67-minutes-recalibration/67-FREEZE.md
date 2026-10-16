---
objective: 67-minutes-recalibration
type: freeze
requirement: EST-10
decision: DECISION-003
validation: 67-VALIDATION.md
method:
  minutes: trd_level
  window_objectives: 10
  through_objective: 66
calibration_sha256: f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134
inputs_digest: sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0
data_as_of: 2026-10-08
samples:
  trds: 75
  tasks: 177
  with_tokens: 72
frozen_copy: ~/.claude/devflow/state/backtest/calibration-f4d1ffa9.json
previous_live_sha256: 9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648
previous_copy: ~/.claude/devflow/state/backtest/calibration-9ef7d108.json
built_with: installed 2.15.0
built_from: 9e3cc964c44b259edf3c1caf448c201021de9055
generated: 2026-10-08
---

# Objective 67: the frozen EST-11 calibration

## 1. What this calibration is

`~/.claude/devflow/calibration.json` is the calibration objectives 68-72 (EST-11) are estimated with. It was built once, by the **installed** 2.15.0 runtime, with the minutes method that `67-VALIDATION.md` selected (`method_selected: trd_level`, DECISION-003), a window of the 10 most recent objectives, and a cutoff at objective 66. Nothing numbered above 66 is read, so objectives 68-72 cannot reach it.

The exact build command:

```
node /Users/justin/.claude/devflow/bin/df-tools.cjs calibrate --paths /Users/justin/dev/devflow-claude --minutes trd_level --window 10 --through 66 --raw
```

| Field | Value |
|---|---|
| version | 3 |
| method | `{minutes: trd_level, window_objectives: 10, through_objective: 66}` |
| sha256 | `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134` |
| inputs_digest | `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0` |
| data_as_of | 2026-10-08 |
| samples | 75 TRDs, 177 tasks, 72 with tokens |
| window | objectives `57-estimation-data-foundation` to `66-executor-token-stamp` (10 kept, 52 dropped, 384 TRDs dropped) |
| trd_level.minutes | min 3, p50 10, p90 19, max 45, n 73 |
| built with | installed 2.15.0 (gitCommitSha `2f01cd77f5ad70518302ad53e35f5478b704fd5d`), mirror digest `sha256:0174e1c6a1dc70b95abad7cefc4ce057ebf6457a12d618061cb81a169b9448bb` |
| built from | repository HEAD `9e3cc964c44b259edf3c1caf448c201021de9055` |
| frozen copy | `~/.claude/devflow/state/backtest/calibration-f4d1ffa9.json` (byte-identical, `cmp` clean) |
| previous live file | sha256 `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`, kept as `~/.claude/devflow/state/backtest/calibration-9ef7d108.json` |

## 2. The rule

**Do not run `df-tools calibrate` in any form that writes the live file until objective 75 has scored 68-72.** A rebuild changes the calibration the five runs are being compared against, and the comparison is then meaningless. Forms with `--out <scratch>` and `--no-overhead` are safe.

If it happens anyway, restore the frozen copy and check the hash:

```
cp ~/.claude/devflow/state/backtest/calibration-f4d1ffa9.json ~/.claude/devflow/calibration.json
shasum -a 256 ~/.claude/devflow/calibration.json
```

The second command must print `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`. Record the incident in the objective 75 report.

## 3. The check for objective 75

For each of objectives 68, 69, 70, 71 and 72, read its run-state history file under `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/` (named `<objective>-<started_at>.json`). Each file must satisfy both:

- `estimate.calibration.inputs_digest` equals `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0`
- `estimate.calibration.method` equals `{minutes: trd_level, window_objectives: 10, through_objective: 66}`

Compare the method field by field and numerically: `df-tools frontmatter get` reads this file's nested integers (`window_objectives`, `through_objective`) as strings, while the run state and the calibration hold numbers. A mismatch is reported in the objective 75 verdict and is never ignored: it means that run was estimated with a different calibration, and its error cannot be attributed to the frozen method. A run with no history file, or with `estimate.calibration` null, is reported as unscored.

## 4. Evidence

All commands used `node /Users/justin/.claude/devflow/bin/df-tools.cjs` (the installed runtime) except the planning verbs and the commit. Scratch files lived in a `mktemp -d` directory under the session scratchpad.

### Mirror and install

- `installed_plugins.json` devflow@aocyber: version 2.15.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.15.0`. `~/.claude/devflow/.plugin-version`: 2.15.0.
- `cmp` of the eight mirrored libs (calibrator, calibration-inputs, calibrate-cli, estimate, estimate-cli, estimate-format, estimate-rollup, estimate-math) against `git show v2.15.0:plugins/devflow/devflow/bin/lib/<f>`: all equal.
- `doctor --json` (report only): engine_version 2.15.0, `runtime-mirror` ok (installed, mirror and marker digests equal), error 0.

### SC-2: the calibration names its method and rebuilds byte-identical

- Build (live write 1 of 2) printed `changed · 75 TRDs, 177 tasks, 72 with tokens · ... · window 10 objectives (dropped 384 TRDs) · minutes trd_level · through objective 66`. sha256 afterwards: `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`.
- Identical rebuild (live write 2 of 2) printed `unchanged`. sha256 afterwards: `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`.
- Frozen copy `cmp`s equal to the live file.
- Read-back: version 3, method deep-equals the frozen method, `window.projects[0].last` = `66-executor-token-stamp`, `sources` lists only `devflow-claude`.

### SC-3: no input from 68-72 reaches the through-66 calibration

Two snapshots of `git archive HEAD .planning`, both under a directory named `devflow-claude` (`<scratch>/a/devflow-claude`, `<scratch>/b/devflow-claude`) so the project label is the same. Snapshot b gained hand-built objectives 68-72: one TRD each (two `tdd="true"` tasks on `lib/x.cjs, lib/x.test.cjs`), a SUMMARY with `duration: 90min`, `tokens_input: 5000000`, `tokens_output: 50000`, and a `| Objective N P01 | 90min | 2 tasks | 2 files |` row appended to the Performance Metrics table of `STATE_ARCHIVE.md` (rows for 70-72 confirmed at lines 370-372, that table being the last section of the file).

| Run | Result |
|---|---|
| `calibrate --paths a/devflow-claude --minutes trd_level --window 10 --through 66 --no-overhead --out a.json` | 75 TRDs, 177 tasks, 72 with tokens |
| same for b | 75 TRDs, 177 tasks, 72 with tokens |
| `cmp a.json b.json` | no difference |
| control, no `--through`: `a-all.json` | 76 TRDs, 177 tasks, 73 with tokens (window reaches the newest real objectives) |
| control, no `--through`: `b-all.json` | 37 TRDs, 82 tasks, 34 with tokens (window shifted onto 63-72) |
| `cmp a-all.json b-all.json` | differ (char 3636, line 199) |

The control shows the 68-72 data does change a calibration when the cutoff is absent, so the identical through-66 pair is evidence of the cutoff and not of an inert fixture.

Consistency with the live file (`a.json` against `~/.claude/devflow/calibration.json`): `samples`, `sources`, `trd_level`, `task_classes`, `objective_level`, `probabilities`, `method`, `window`, `notes`, `data_as_of`, `classifier_version`, `model_aliases`, `models`, `rates_as_of` and `version` deep-equal; `unpriced_models` equal. Only `agent_overhead`, `agent_overhead_sources` and `inputs_digest` differ, because the live file scanned transcripts and `a.json` ran with `--no-overhead`. No TRD-derived block differs. The live file's last kept objective is `66-executor-token-stamp`.

### SC-4: the installed estimator uses the frozen calibration

- `estimate objective 66 --all` (JSON): `calibration.path` = `/Users/justin/.claude/devflow/calibration.json`, `calibration.version` = 3, `calibration.method` = `{minutes: trd_level, through_objective: 66, window_objectives: 10}`, `calibration.data_as_of` = 2026-10-08, samples 75 / 177 / 72.
- `estimate objective 66 --all --table --raw` text: `... Calibration 2026-10-08, 75 TRDs, minutes trd_level (window 10, through objective 66).` (with `--all` a `Note:` line follows that sentence; plain `--raw` prints only the one-line summary).
- `estimate trd 66-01` (a 3-auto-task TRD, the most in objective 66; 66-02 also has 3): `minutes` = `{p50: 10, p90: 19}`, equal to the live `trd_level.minutes` p50 10 / p90 19; `minutes_basis` = `trd_level`; `minutes_samples` = 73; the note reads "minutes from TRD-level history (n=73 TRDs), not the sum of task minutes". A task sum would have been 11.7 (3.7 + 4 + 4).
