---
objective: 58-estimation-engine-and-surfacing
trd: "03"
subsystem: telemetry
tags: [calibration, agent-overhead, objective-level, estimation, cli]

# Dependency graph
requires:
  - objective: 58-estimation-engine-and-surfacing
    provides: "58-02 agent-overhead.collectOverhead, OVERHEAD_AGENTS and the overhead transcript fixtures"
  - objective: 57-estimation-data-foundation
    provides: "calibrator.cjs (57-05), calibrate-cli.cjs (57-06), token-usage.defaultTranscriptRoot"
provides:
  - "calibration.json version 2: agent_overhead, agent_overhead_sources, objective_level"
  - "buildCalibration({paths, ratesPath, transcriptsRoot})"
  - "df-tools calibrate --root <dir> | --no-overhead, result.overhead and the ' · overhead ...' raw suffix"
affects: [58-05 task and TRD estimates, 58-06 objective rollup, 58-07 milestone rollup, 58-08 estimate CLI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Transcripts are read only when a root is passed; only the CLI resolves ~/.claude/projects, at call time"
    - "A multi-model spawn is priced per model and summed; any unpriced model leaves the whole spawn's cost null"
    - "An objective counts for a metric only when every TRD in it has that metric"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/calibrator.cjs
    - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
    - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "The inputs digest hashes the normalized overhead samples plus the overhead counts (the counts appear in agent_overhead_sources, so they are output inputs); null when no root was scanned"
  - "--no-overhead prints ' · overhead skipped' in the raw line, not 'none', so an unscanned file is not mistaken for a scan that found nothing"

patterns-established:
  - "calibration.json version 2 key table (below): 58-05..58-07 read these keys"

requirements-completed: []

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 6min
completed: 2026-10-05
tokens_input: 6676860
tokens_output: 41681
tokens_cache_read: 6536088
tokens_cache_write: 140668
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 58 TRD 03: Calibration v2 Summary

**calibration.json version 2 adds measured per-spawn overhead for the six non-executor agents (priced per model) and per-objective serial history for unplanned objectives, and `df-tools calibrate` scans subagent transcripts for it (`--root`, `--no-overhead`).**

## Progress
- [x] Task 1: agent_overhead block, version 2, notes and digest — 04396e8e (RED 3507760d)
- [x] Task 2: objective_level history — c6faebe8 (RED 6fb00ab3)
- [x] Task 3: calibrate --root / --no-overhead, help and header — 738419bb (RED a6c83d23)

## What was built

`CALIBRATION_VERSION` is 2. `buildCalibration` gained `transcriptsRoot` (default `null`: no transcript is read). The BETA numbers (task classes, trd_level, probabilities, costs) are unchanged: the new blocks are computed after, and apart from, `task_classes` and `trd_level`.

### Version 2 additions (what 58-05..58-07 read)

| Key | Shape | Meaning |
|---|---|---|
| `agent_overhead.<agent>` | `{samples, minutes, tokens_input, tokens_output, cost_usd}`, each metric a `{n, p50, p90, min, max}` block (minutes rounded to 0.1, tokens to integers, dollars to 4 places) | One spawn of `integration-checker`, `job-checker`, `objective-researcher`, `planner`, `roadmapper` or `verifier`. All six keys always exist, empty (`samples: 0`, all-null blocks) when unscanned or unmeasured. Executors are not here: task values already include executor overhead pro rata. |
| `agent_overhead.<agent>.cost_usd` | stat block | Each spawn priced per model through `sampleCost` and `model-rates.json`, summed over its models. A spawn with an unpriced model, or no usage, has no cost (it still counts in `samples` and `minutes`). |
| `agent_overhead_sources` | `{scanned, spawns, matched, foreign, quick, unreadable}` | `scanned` is false when no transcripts root was passed. `foreign` spawns belong to other repositories; `quick` are quick-plan planners. |
| `objective_level` | `{samples, trds, tasks, minutes, tokens_input, tokens_output, cost_usd}`, each but `samples` a stat block | One row per objective with at least one sample TRD. `trds` is its TRD count, `tasks` its auto-task count, and a metric is the sum over its TRDs only when every TRD has it. `minutes` is serial executor time, not wall time. For `/devflow:build` at start and `estimate milestone` when an objective is not planned yet. |
| `unpriced_models` | sorted list | Now also lists models that only overhead spawns used. |
| `inputs_digest` | `sha256:...` | Changes with an overhead transcript (samples and counts), never with a path or mtime. |
| `notes` | 5 strings | The two new ones are the verbatim agent_overhead and objective_level notes. |

BETA `objective_level`: `samples` 2; `trds` p50 2 / p90 3; `tasks` p50 2 / p90 6; `minutes` n 1, 30 (70-a = 10 + 8 + 12; 71-b is left out because 71-b/01 is autonomous:false and has no minutes); tokens and cost n 0.

### CLI

`df-tools calibrate [--paths] [--out] [--rates] [--root <dir> | --no-overhead] [--dry-run] [--raw]`. `--root` resolves against cwd; with neither flag the root is `token-usage.defaultTranscriptRoot()` called inside `runCalibrate` (never at load). Both flags together is a usage error. The JSON result gains `overhead: {scanned, spawns, matched, foreign, quick, unreadable, agents}` where `agents` maps each agent with samples to its count. The raw line gains ` · overhead planner 1, verifier 1` (samples descending, then name), ` · overhead none` when a scan found nothing, ` · overhead skipped` with `--no-overhead`. The help entry and the df-tools.cjs header carry both flags.

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written.

### Judgement calls (not Rules 1-4)

1. **Digest includes the overhead counts**, not only the sorted samples. `agent_overhead_sources` writes those counts into the file, so a foreign-spawn count change must move the digest or the file's bytes could change under an unchanged digest. Mirrors how `sources` is hashed for unjoined metric rows.
2. **`--no-overhead` raw suffix is `overhead skipped`** (the TRD's `<list|none>` covers a scan). `none` would read as "scanned, found nothing".
3. **Extra tests beyond the TRD list:** an objective with an unmeasured TRD and a fully measured one (summing tokens and dollars), an empty project for `objective_level`, a relative `--root`, and `--no-overhead` ignoring transcripts that exist under HOME.
4. **`requirements mark-complete EST-03` was NOT run**, per the dispatch: the orchestrator marks requirements at objective completion. `requirements-completed` is `[]`. `state advance-job` was also skipped (PLMB-01).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: agent_overhead block, version 2, notes and digest | `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` (42 tests, every pre-existing one included) | 0 | PASS |
| 2: objective_level history | `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` (45 tests) | 0 | PASS |
| 3: calibrate --root / --no-overhead, help and header | `node --test calibrate-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs doc-surfaces.test.cjs` (43 tests) | 0 | PASS |

`rg -n "Date\(|toISOString|Date\.now" plugins/devflow/devflow/bin/lib/calibrator.cjs` prints nothing. The real `~/.claude/devflow/calibration.json` was not touched: every library test passes `transcriptsRoot` from `makeProjectsRoot`, every CLI test spawns with a fresh HOME and `DEVFLOW_CALIBRATION_PATH` removed.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, tests 7-9 + version 1 to 2) | `node --test calibrator.test.cjs` | 1 (6 failures: `version` 1 !== 2, `agent_overhead` undefined, digest unchanged by overhead) | FAIL (correct) |
| GREEN (Task 1) | `node --test calibrator.test.cjs` | 0 (42/42) | PASS (correct) |
| RED (Task 2, test 10) | `node --test --test-name-pattern=objective_level calibrator.test.cjs` | 1 (`objective_level` undefined, 3/3 fail) | FAIL (correct) |
| GREEN (Task 2) | `node --test calibrator.test.cjs` | 0 (45/45) | PASS (correct) |
| RED (Task 3, CLI tests 1-6 + raw suffix) | `node --test calibrate-cli.test.cjs` | 1 (8 failures: unknown flag `--root`, no `overhead` in the result, old raw line) | FAIL (correct) |
| GREEN (Task 3) | `node --test calibrate-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs doc-surfaces.test.cjs` | 0 (43/43) | PASS (correct) |

RED commits 3507760d, 6fb00ab3, a6c83d23; GREEN commits 04396e8e, c6faebe8, 738419bb. The changed pre-existing assertions (version 1 to 2 in two places, the `--raw` line, the CLI file version) are in the RED commits.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test calibrator.test.cjs calibrate-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs agent-overhead.test.cjs` | 0 (91/91) | PASS |
| test | `npm test` (9579 tests, 9516 pass) | 1 | PASS for this TRD: 13 failures, none in files this TRD touches |

`npm test` failures are all known baseline: `devflow-watch` (5) and `handoff-e2e` (6, including LK-1 and LK-2) need `node_modules/node-pty`, absent in this worktree; `roadmap-reconcile` E2E1 (1, unticked TRD of the running objective); `stack-drafter-fleet` github-enterprise-migration (1).

## Discovered commands

None. `test` and `test_scoped` come from the TRD and `.planning/STACK.md`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (v2 agent_overhead per OVERHEAD_AGENTS entry; per-model pricing with unpriced_models; objective_level counting only fully measured objectives; no transcript read without a root and a call-time default root in the CLI; byte-identical reruns and an inputs_digest that follows overhead transcripts)
- Gate failures: none attributable to this TRD

## Self-Check: PASSED

- FOUND: calibrator.cjs, calibrator.test.cjs, calibrate-cli.cjs, calibrate-cli.test.cjs, help.cjs, df-tools.cjs (all under plugins/devflow/devflow/bin)
- FOUND commits: 3507760d, 04396e8e, 6fb00ab3, c6faebe8, a6c83d23, 738419bb
