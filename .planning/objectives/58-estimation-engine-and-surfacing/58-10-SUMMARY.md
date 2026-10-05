---
objective: 58-estimation-engine-and-surfacing
job: "10"
subsystem: estimation
tags: [estimate, calibrate, dogfood, backtest, run-state, status-line, docs]

requires: [58-09]
provides:
  - "Live evidence that calibrate writes a deterministic version 2 calibration.json with measured agent overhead on this repository"
  - "Live df-tools estimate task|trd|objective|milestone output and an in-sample backtest of objectives 55-57 (information for Objective 64)"
  - "Live run-state and status line smoke (start, wave, finish)"
  - "CHANGELOG [Unreleased], CLAUDE.md, USER-GUIDE Estimates section and the statusline HOOK_DOCS text"
affects: [Objective 64 estimate accuracy validation]

key-files:
  created: []
  modified: []

key-decisions: []

requirements-completed: []

completed: 2026-10-05
---

# Objective 58 TRD 10: Dogfood the estimates on this repository, then document them Summary

**Work in progress.**

## Progress
- [x] Task 1: Calibrate v2 and estimate this repository live, with an in-sample backtest — 6a538169
- [x] Task 2: Run-state and status line smoke — (this commit)
- [x] Task 3: CHANGELOG, CLAUDE.md, USER-GUIDE, hook doc; full test run — (this commit)

## Task 1 evidence (calibrate v2 and live estimates)

### calibrate, twice (repo copy)

```
calibration /Users/justin/.claude/devflow/calibration.json: changed · 323 TRDs, 746 tasks, 236 with tokens · classes code_tdd 426, test_tdd 101, prompt 53, doc 51, prompt_tdd 44, schema_tdd 19, code 18, other 13, test 12, doc_tdd 5, config 3, schema 1 · overhead verifier 31, planner 26, job-checker 22, objective-researcher 11, integration-checker 4, roadmapper 1
calibration /Users/justin/.claude/devflow/calibration.json: unchanged · (same line)
```

| Run | Result | `shasum -a 256 ~/.claude/devflow/calibration.json` |
|---|---|---|
| 1 | changed (the file 57-07 wrote was version 1) | `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` |
| 2 | unchanged | `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` |

File contents checked with a scratch script: `version` 2; top-level keys `agent_overhead, agent_overhead_sources, classifier_version, data_as_of, inputs_digest, model_aliases, models, notes, objective_level, probabilities, rates_as_of, samples, sources, task_classes, trd_level, unpriced_models, version`.

Measured agent overhead (samples; p50 / P90 minutes; p50 / P90 cost):

| Agent | Samples | Minutes p50 / P90 | Cost p50 / P90 |
|---|---|---|---|
| planner | 26 | 19.6 / 42.9 | $6.25 / $10.99 |
| job-checker | 22 | 0.8 / 9.9 | $0.25 / $2.01 |
| verifier | 31 | 3.1 / 5.0 | $0.87 / $1.76 |
| objective-researcher | 11 | 6.7 / 14.5 | $1.84 / $3.27 |
| integration-checker | 4 | 2.1 / 5.8 | $0.24 / $1.57 |
| roadmapper | 1 | 1.5 / 1.5 | $0.32 / $0.32 |

`agent_overhead_sources`: `{"foreign":344,"matched":95,"quick":36,"scanned":true,"spawns":475,"unreadable":0}`.

`objective_level`: `samples` 48; minutes p50 54 / P90 134 (n=12); cost p50 $27.37 / P90 $49.05 (n=20); `trds` p50 7 / P90 15; `tasks` p50 15 / P90 32.

### Live estimates (repo copy, `--raw`)

`estimate task --files plugins/devflow/devflow/bin/lib/estimate.cjs,plugins/devflow/devflow/bin/lib/estimate.test.cjs --tdd --raw`

```
Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.35 (P90 $2.20) · n=332, confidence high
```

`estimate trd 58-05 --raw`

```
TRD 58-05: 10 min (P90 24 min) · $2.63 (P90 $4.36) · 2 tasks · confidence low
```

`estimate objective 57 --all --table --raw` (see Deviations 1: the formatter short-circuits on a done objective)

```
Objective 57: all TRDs done (7 of 7)
```

`estimate objective 59 --table --raw` (see Deviations 2: exit 1)

```
Error: objective 59 not found
```

`estimate milestone --table --raw`

```
| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |
|---|---|---|---|---|---|
| 58 Estimation engine and surfacing | partial, 1 of 10 TRDs left | 25 min | 1h 25m | $4.83 | low |
| 59 State and merge plumbing | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| 60 Edit gate enforces the action | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| 61 Store-mode rough edges and observability | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| 62 Built-in sweep | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| 63 Todo store, hook coexistence and built-in inventory | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| 64 Estimate accuracy validation | unplanned | 1h 16m | 3h 24m | $35.34 | low |
| **v1.5 total (7 objectives left)** | | **8h 55m** | **20h 03m** | **$226.43** | **low** |

Done: 55, 56, 57. Includes 1 integration-checker spawn. Confidence: low (weakest: 59 unplanned). Calibration 2026-10-05, 323 TRDs.
Note: 59 (State and merge plumbing): in the ROADMAP but has no directory yet; estimated from 12 objectives of history, not from a plan
(the same Note line for 60, 61, 62, 63 and 64)
```

`estimate objective 58 --all --line --raw`

```
Objective 58 estimate: 2h 19m median (P90 5h 42m) wall · $32.69 (P90 $48.34) · 10 TRDs estimated in 7 waves · confidence low
```

### In-sample backtest of objectives 55, 56, 57 (information for Objective 64, not a gate)

These three objectives are inside the 323-TRD calibration, so every row is optimistic: the estimator has already seen the data it is compared with. Estimates are `estimate objective N --all` JSON `execution.agent_minutes` and `execution.cost_usd` (executor work only, like for like with SUMMARY durations and tokens; the verifier and gap-closure overhead in `total` is left out). Actuals are the sum of `parseDurationMinutes(duration)` over the objective's SUMMARYs and `calibrator.sampleCost` over their stamped token fields with `references/model-rates.json`, from a scratch script (not committed). Objectives 55 and 56 each have SUMMARYs without a parseable duration (6 of 8 and 4 of 5 TRDs carry minutes), so their actual minutes are an undercount.

| Objective | TRDs (with minutes / priced) | Agent min estimate p50 / P90 | Actual agent min | Actual <= P90 | Median / actual | Cost estimate p50 / P90 | Actual cost | Actual <= P90 | Median / actual |
|---|---|---|---|---|---|---|---|---|---|
| 55 | 8 (6 / 8) | 133.6 / 395.7 | 68 | yes | 1.96 | $21.66 / $32.67 | $23.06 | yes | 0.94 |
| 56 | 5 (4 / 5) | 74.6 / 218.5 | 27 | yes | 2.76 | $15.83 / $23.58 | $15.72 | yes | 1.01 |
| 57 | 7 (7 / 7) | 109.5 / 302.7 | 72 | yes | 1.52 | $22.61 / $32.81 | $21.41 | yes | 1.06 |

Reading for Objective 64: cost medians land within 6% of actual on all three, minutes medians run 1.5x to 2.8x high (the p50 sits well above what these executors took), and every actual is under its P90. All of it is in-sample.

## Task 2 evidence (run state and status line smoke)

Scratch HOME `<scratchpad>/smoke/home` held copies of `estimate-run-store.cjs` and `upgrade.cjs` under `.claude/devflow/bin/lib/`; scratch state dir `<scratchpad>/smoke/state`. Every `estimate` command ran with the inline prefix `env DEVFLOW_ESTIMATE_STATE_DIR=<scratch state>` and read the real calibration file (read only). The render script (scratch, not committed) spawned `plugins/devflow/hooks/statusline.js` with `HOME=<scratch home>`, the same state dir and `workspace.current_dir` = this repository.

| Step | Command | Output |
|---|---|---|
| 1 | `estimate start 58 --raw` | `Objective 58 estimate: 25 min median (P90 1h 25m) wall · $4.83 (P90 $9.91) · 1 TRD left in 1 wave · confidence low` |
| 2 | `estimate wave 58 7 --start --raw` | `Wave 7 estimate: 20 min median, P90 1h 09m` |
| 3 | status line render (during the run) | `Smoke │ devflow-claude │ ⏱ 58 W7/7 ~20m left` (contains `⏱ 58`) |
| 4 | `estimate wave 58 7 --done --raw` | `Wave 7: actual 0 min · estimate 20 min median, P90 1h 09m · at or under median` |
| 5 | `estimate finish 58 --raw` | `Objective 58 execution: actual 0 min · estimate 20 min median, P90 1h 09m · at or under median` |
| 6 | `estimate finish 58 --raw` (again) | identical to step 5 |
| 7 | status line render (after finish) | `Smoke │ devflow-claude` (no `⏱`) |

The wave ran for 0.1717 minutes (the commands were issued seconds apart), hence `actual 0 min`. The stored estimate is the execution wall (19.7 / 69.3), which is what `finish` compares against; the `start` line (25 min median) adds the verifier overhead.

`~/.claude/devflow/state/estimates/` does not exist after the smoke: nothing was written under the real state directory.

## Task 3 evidence (docs and full test run)

Changed files (`git diff --stat`): CHANGELOG.md (+28/-2), CLAUDE.md (+2/-2), docs/USER-GUIDE.md (+39/-4), scripts/gen-docs-data.cjs (+1/-1).

- **CHANGELOG [Unreleased].** Added: `estimate task|trd|objective|milestone` (with this repository's live figures), `estimate start|wave|finish` and the status line segment, the estimate surfacing in PLANNING COMPLETE, plan-objective, `/devflow:build` and the wave reports. Changed: `calibrate` measures agent overhead (`--root`, `--no-overhead`), calibration.json version 2 (`agent_overhead`, `agent_overhead_sources`, `objective_level`), with this repository's sample counts.
- **CLAUDE.md.** The Estimation data bullet now covers agent overhead, version 2, the `estimate` verbs, the run-state location and override, and the eight new modules; the `statusline.js` hook line gains the estimated-time-remaining clause. Net growth: two lines edited, 746 characters (27,387 to 28,133).
- **docs/USER-GUIDE.md.** The `calibrate` bullet, the `--root`/`--no-overhead` flags and the keys bullet are updated for version 2; a new `### Estimates (df-tools estimate)` section follows `### Estimation data` with the seven command forms, live output lines, the composition method, the confidence labels, where estimates appear, the run state, the status line segment and the rho 0.5 assumption; the hook table's `statusline.js` row is extended. The Table of Contents lists only top-level headings, so it needed no entry.
- **scripts/gen-docs-data.cjs.** The `statusline.js` HOOK_DOCS sentence ends with ", plus estimated time remaining while an objective builds." `site/data/devflow.json` is not regenerated (the release does that).

| Check | Command | Result |
|---|---|---|
| scoped doc tests | `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 26 tests, 26 pass, 0 fail |
| docs advisories | `df-tools validate docs --raw` (repo copy) | `no documentation advisories` |
| full suite | `npm test` | exit 1: 9706 tests, 9671 pass, 3 fail, 32 skipped, 0 cancelled |

The three `npm test` failures are the known baseline set, and the counts are identical to 58-09's run (this TRD adds no tests):

1. `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` (`handoff-e2e.test.cjs:795`, handoff pipeline PTY mock auth).
2. `E2E1: SELF-TEST reconcile dry-run against this repo ROADMAP shows zero drift` (`roadmap-reconcile.test.cjs:1029`): it names `trd_summary_exists` for 58-10 itself, since the SUMMARY now exists while the ROADMAP box stays unticked until the orchestrator completes the objective.
3. `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md` (`stack init against the real fleet`, TRD 43-08).
