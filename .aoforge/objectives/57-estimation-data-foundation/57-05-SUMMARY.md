---
objective: 57-estimation-data-foundation
job: "05"
subsystem: estimation
tags: [calibration, percentiles, model-rates, deterministic-output, node-test]

requires:
  - objective: 57-estimation-data-foundation
    provides: calibration-inputs.cjs (discoverProjects, collectProject, loadRates, rateFor, classifyTask) and model-rates.json from 57-02
provides:
  - lib/calibrator.cjs, buildCalibration over any set of projects, plus the deterministic calibration.json writer
  - the calibration.json schema (version 1) that 57-06's `calibrate` CLI writes and Objective 58's estimator reads
affects: [57-06-tokens-and-calibrate-cli, 57-07-backfill-dogfood-and-docs, 58-estimation-engine]

tech-stack:
  added: []
  patterns:
    - nearest-rank percentiles (`sorted[ceil(p*n)-1]`), so every reported value is an observed sample
    - round once, at output; split a TRD's outcome equally across its auto tasks before any rounding
    - no wall-clock value in the file: `data_as_of` is the latest SUMMARY `completed` date, `inputs_digest` hashes the inputs

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/calibrator.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  modified: []

key-decisions:
  - "inputs_digest also covers the per-project `sources` counts, so metric rows that join no TRD change the digest as they change the output"
  - "A TRD with only one of tokens_input / tokens_output is not a token sample; absent cache counts are zero"
  - "A planned gap-closure TRD counts toward the gap-closure probability even before it has a SUMMARY"

requirements-completed: []

duration: 10min
completed: 2026-10-05
tokens_input: 6357323
tokens_output: 57150
tokens_cache_read: 6237167
tokens_cache_write: 120052
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 57 TRD 05: Calibrator Summary

**`buildCalibration` turns the planning history into per-task-class p50/P90 minutes, tokens and dollars, and `writeCalibration` writes it as sorted-key JSON only when the bytes change.**

## Progress
- [x] Task 1: nearestRank, statBlock, sampleCost, buildCalibration — 370c6b54 (RED 601830e2)
- [x] Task 2: stableStringify, inputs_digest, writeCalibration, defaultCalibrationPath — 223a532a (RED 4fa9c165)

## Accomplishments

- `calibrator.cjs` exports `nearestRank`, `statBlock`, `sampleCost`, `buildCalibration`, `stableStringify`,
  `writeCalibration`, `defaultCalibrationPath` and `CALIBRATION_VERSION` (1). It reads no clock and never resolves the
  home directory at load or for an explicit path.
- Over the hand-built BETA history the numbers are exactly the TRD's: code_tdd minutes `{n:5, p50:4, p90:8, min:4,
  max:8}`, all-class minutes `{n:7, p50:5, p90:8}`, TRD-level minutes `{n:4, p50:8, p90:12}` (71-b/01's 30 human-wait
  minutes excluded), the Opus 5.5 token record costs $0.1496 per TRD and $0.0499 per task, gap closure 0.5 over 2
  objectives, checkpoint 0.2 over 5 TRDs. Rates matched the TRD's expectation, so no number was recomputed.
- Read-only smoke over this repo's own `.planning` (not written anywhere): 246 sample TRDs, 553 task samples, 0 with
  tokens (57-04 backfills them), 13 classes, `data_as_of` 2026-10-05, no unpriced models, two builds byte-identical.

## calibration.json schema (version 1)

Keys are sorted at every depth on write; the file is 2-space JSON with a trailing newline. There is no timestamp.

| Key | Meaning |
|---|---|
| `version` | 1 (`CALIBRATION_VERSION`); bump when the shape changes |
| `classifier_version` | `calibration-inputs.CLASSIFIER_VERSION`; 58's estimator must classify with the same version |
| `data_as_of` | latest SUMMARY `completed` date (`YYYY-MM-DD`) over all collected TRDs, or null |
| `inputs_digest` | `sha256:<hex>` of the normalized inputs (classifier version, rates, per-TRD values, `sources`); no paths or mtimes |
| `notes` | three fixed strings: tasks split a TRD's outcome equally and include executor overhead pro rata (do not add it on top); minutes exclude `autonomous:false` TRDs, tokens still count; cost uses the 5-minute cache-write rate and percentiles are nearest-rank |
| `samples` | `{trds, tasks, with_tokens}`: sample TRDs (minutes or both token fields), task samples, TRDs with both token fields |
| `sources` | per project, sorted by `project`: `{project, trds, summaries, with_minutes, with_tokens, no_outcome, metric_rows, metric_rows_joined, metric_rows_ambiguous}` (`with_minutes` counts raw minutes, before the autonomous:false exclusion) |
| `trd_level` | `{samples, minutes, tasks, tokens_input, tokens_output, cost_usd}`; each stat block is `{n, p50, p90, min, max}`; `tasks` is the auto-task count per TRD |
| `task_classes` | `all` plus every class that has a sample: `{samples, minutes, tokens_input, tokens_output, cost_usd, files}` (`files` is the `<files>` count per task). Values are per task: the TRD's outcome divided by its auto-task count |
| `probabilities` | `gap_closure` `{value, n}` over objectives with a sample TRD, `checkpoint` `{value, n}` over sample TRDs; `value` is null when n is 0 |
| `models`, `model_aliases`, `rates_as_of` | copied from model-rates.json (per-model rates in USD per million tokens, with `source` and `as_of`) |
| `unpriced_models` | sorted unique model ids seen with tokens but no rate; their samples have no `cost_usd` |

Rounding happens once, when a stat block is built: minutes and `tasks`/`files` to 1 decimal, tokens to an integer,
`cost_usd` and probabilities to 4 decimals. An empty history builds: counts are zero, `task_classes` is `{all}`, stat
blocks are `{n:0, p50:null, ...}`, `data_as_of` is null.

Public functions for 57-06 and Objective 58:
`buildCalibration({paths, ratesPath})` (throws an Error naming the rates file when `loadRates` fails),
`stableStringify(obj)`, `writeCalibration(outPath, obj) -> {path, changed, bytes}` (atomic: `<file>.tmp` then rename;
`outPath` falsy falls back to `defaultCalibrationPath()`), `defaultCalibrationPath(env = process.env)`
(`DEVFLOW_CALIBRATION_PATH`, else `<HOME>/.claude/devflow/calibration.json`, HOME read per call).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: buildCalibration | `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` (17 tests, tests 1, 2, 3, 8, 9) | 0 | PASS |
| 2: writer and digest | `node --test calibrator.test.cjs calibration-inputs.test.cjs` (117 tests, tests 1-9) | 0 | PASS |
| 2: no clock | `rg -n "Date\(\|toISOString\|Date\.now" plugins/devflow/devflow/bin/lib/calibrator.cjs` | 1 (no matches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test lib/calibrator.test.cjs` | 1 | FAIL (module `calibrator.cjs` not found; correct, nothing existed yet) |
| GREEN (task 1) | same | 0 | PASS (17 tests) |
| RED (task 2) | same | 1 | FAIL (16 of 36: `stableStringify`, `writeCalibration`, `defaultCalibrationPath` absent, `inputs_digest` undefined) |
| GREEN (task 2) | same plus calibration-inputs tests | 0 | PASS (36 and 117 tests) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test lib/calibrator.test.cjs lib/calibration-inputs.test.cjs` | 0 | PASS (117) |
| test (task 1) | `npm --prefix <worktree> test`: 9427 tests, 9392 pass, 3 fail, 32 skipped | 1 | only the known baseline failures |
| test (task 2) | `npm --prefix <worktree> test`: 9446 tests, 9411 pass, 3 fail, 32 skipped | 1 | only the known baseline failures |

The three failures in both runs: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration
(real fleet), and roadmap-reconcile E2E1, which clears once `roadmap update-job-progress 57` ticks this TRD. None is in
a file this TRD touches. The tests never write the real `~/.claude/devflow/calibration.json` (it does not exist after
the runs): every write test uses a mkdtemp path, the HOME test sets `process.env.HOME` and restores it in `finally`.

## Discovered commands

None. `npm test` and the scoped `node --test` form came from the stack profile.

## Deviations from Plan

None - TRD executed exactly as written, with three small choices recorded under key-decisions:

- The digest also hashes `sources` (the TRD's formula named classifier version, rates and TRDs). Unmatched or
  ambiguous metric rows change `sources` and so the file; with `sources` in the digest it changes whenever the file can.
- The digest projects each TRD to the values that can change the output: it omits task names and the raw duration
  spelling (`~45min` and `45min` give the same minutes).
- `inputs_digest` was added in Task 2 with its tests (test 7), not Task 1, so each RED commit covers what its GREEN adds.

57-02's exports were used as they are; `ALPHA_SPEC` was exported and had the documented shape, so no recovery was needed.

## Issues Encountered

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (stats and n per class; BETA numbers; rates-only pricing with `unpriced_models`; no timestamp;
  byte-identical rebuild after every mtime changes; changed-only write with an unchanged mtime and no home lookup;
  autonomous:false minutes excluded, probabilities reported with n)
- Gate failures: none beyond the three known baseline failures

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/calibrator.cjs
- FOUND: plugins/devflow/devflow/bin/lib/calibrator.test.cjs
- FOUND: 601830e2, 370c6b54, 4fa9c165, 223a532a (all on df/exec-57-05)
