---
objective: 58-estimation-engine-and-surfacing
job: "08"
subsystem: estimation
tags: [estimate, cli, text-renderers, run-state, status-line, df-tools]

requires: [58-04, 58-05, 58-06, 58-07]
provides:
  - "estimate-format.cjs: formatMinutes, formatTokens, formatUsd, roundResult, verdict, taskLine, trdLine, objectiveLine, objectiveTable, milestoneLine, milestoneTable, waveStartLine, waveDoneLine, finishLine"
  - "estimate-cli.cjs: runEstimate({argv, cwd, env, now}), parseArgs, USAGE"
  - "df-tools estimate task|trd|objective|milestone|start|wave|finish (dispatcher case, COMMANDS.estimate, header doc)"
affects: [58-09 planning and build surfacing, 58-10 dogfood and docs]

tech-stack:
  added: []
  patterns:
    - "Rounded once, at output: the engine returns raw numbers, roundResult rounds the JSON and each formatter rounds the figure it prints, both from the raw result"
    - "No data, no number: an unusable calibration is {available: false, reason, calibration_path} and `No estimate: <reason>`, exit 0"
    - "The clock is the injected `now`; the run verbs are the only writers of the out-of-repo run state"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-format.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.cjs
    - plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "JSON results carry `line` (all verbs) and `table` (objective and milestone); `calibration` is {path, version, data_as_of, samples} so the table footer can name the calibration's age and TRD count"
  - "wave --done and finish read only the run state: the estimate they compare against was stored by `start` (the execution wall for finish, the wave's p50/p90 for wave); neither needs a calibration"
  - "A state for another objective, a finished one or one idle for more than 12 hours is not a live run: wave --start starts a new run, wave --done and finish report `actual unknown (no run state)`"
  - "A --checkpoint task needs no calibration: it is a human wait and never a number"
  - "objective --all marks the result `all: true` and the text says `TRDs estimated`, not `TRDs left`, so a backtest cannot be read as remaining work"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-05
tokens_input: 13981196
tokens_output: 118568
tokens_cache_read: 13736798
tokens_cache_write: 244260
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 58 TRD 08: `df-tools estimate` Summary

**`df-tools estimate task|trd|objective|milestone|start|wave|finish` prints median and P90 minutes, tokens and dollars with sample count and confidence (JSON by default, paste-ready text with `--raw`), says `No estimate: <reason>` instead of a number when the calibration is unusable, and the run verbs keep the status line's state current and print actual against estimate with a verdict.**

## Progress
- [x] Task 1: Text renderers and output rounding (estimate-format.cjs) — RED f79bf1d4, GREEN 5721cfd1
- [x] Task 2: estimate task|trd|objective|milestone, dispatcher and help — RED 2e9f3703, GREEN fb4f07c0
- [x] Task 3: estimate start|wave|finish — RED 3efb0559, GREEN 2d1dab9f

## Usage (58-09 embeds this block)

```
df-tools estimate task (--files <a[,b]> [--tdd] [--trd-type <t>] | --class <name> | --checkpoint) [--calibration <file>] [--raw]
df-tools estimate trd <trd-id|path> [--calibration <file>] [--raw]
df-tools estimate objective <N> [--all] [--table|--line] [--calibration <file>] [--raw]
df-tools estimate milestone [vX.Y] [--table|--line] [--calibration <file>] [--raw]
df-tools estimate start <N> [--calibration <file>] [--raw]
df-tools estimate wave <N> <wave> (--start|--done) [--calibration <file>] [--raw]
df-tools estimate finish <N> [--raw]
```

Calibration: `--calibration`, else `DEVFLOW_CALIBRATION_PATH`, else `~/.claude/devflow/calibration.json`. Run state: `DEVFLOW_ESTIMATE_STATE_DIR`, else `~/.claude/devflow/state/estimates/<repo-key>.json` (never in the repository). Exit 0 for every estimate (including no estimate), exit 1 for usage errors and an objective, TRD or milestone that does not exist. JSON by default; `--raw` prints the text (`--table` for the table of objective and milestone, otherwise one line).

## One example of each text form

Captured from the repository copy of df-tools against the MILESTONE fixture and the literal CAL_V2 calibration (so the figures are fixture figures):

```
Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.40 (P90 $2.20) · n=30, confidence high
Task checkpoint: human wait, not estimated
TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 2 tasks · confidence high
Objective 80 estimate: 26 min median (P90 1h 09m) wall · $6.38 (P90 $11.07) · 3 TRDs left in 2 waves · confidence medium
Objective 82: all TRDs done (1 of 1)
Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $28.37 (P90 $63.28) · 3 objectives left (1 unplanned) · confidence low
Wave 1 estimate: 12 min median, P90 36 min
Wave 1: actual 14 min · estimate 12 min median, P90 36 min · within P90
Objective 80 execution: actual 30 min · estimate 19 min median, P90 52 min · within P90
No estimate: no calibration file at <home>/.claude/devflow/calibration.json; run df-tools calibrate to build it
```

`objective 80 --table`:

```
| Objective 80 (3 TRDs left, 2 waves) | Median | P90 |
|---|---|---|
| Wall time | 26 min | 1h 09m |
| Agent time | 30 min | 1h 16m |
| Tokens in / out | 16.2M / 127K | 30.1M / 226K |
| Cost | $6.38 | $11.07 |

Includes 1 verifier spawn and gap closure (10% likely, n=40; +25 min, +$6.08 if it happens). Confidence: medium (weakest: 80-02 doc, n=10). Calibration 2026-10-05, 50 TRDs.
```

`milestone --table`:

```
| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |
|---|---|---|---|---|---|
| 80 Alpha | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $6.38 | medium |
| 81 Beta | unplanned | 1h 02m | 3h 05m | $17.98 | low |
| 83 Delta | planned, 1 TRD | 9 min | 24 min | $1.90 | medium |
| **v1.0 total (3 objectives left)** | | **1h 49m** | **4h 36m** | **$28.37** | **low** |

Done: 82. Cancelled: 84. Includes 1 integration-checker spawn. Confidence: low (weakest: 81 unplanned). Calibration 2026-10-05, 50 TRDs.
Note: 81 (Beta): unplanned (no TRDs); estimated from 30 objectives of history, not from a plan
```

An unplanned objective's table (`objective 81 --table`) has the header `| Objective 81 (unplanned) | Median | P90 |`, a `Wall time (serial, unplanned)` row, no Agent time row, and `Note:` lines for the basis and for gap closure not being added.

## Run verbs

- `start <N>`: estimates the remaining TRDs and writes the schema-v1 state (objective, `started_at`, `estimate: {line, wall_minutes: execution wall, confidence}`, one wave record per remaining wave with its p50/p90); prints the objective line. With no calibration the waves carry null estimates (taken from the TRDs' frontmatter waves) and the line is `No estimate: ...`.
- `wave <N> <W> --start`: no live state for N (missing, other objective, finished, idle more than 12 h) runs `start` first; a wave the state lacks (a gap-closure wave) is added from a fresh estimate or with null estimates; sets `started_at` only when unset; always bumps `updated_at`.
- `wave <N> <W> --done`: sets `finished_at` and `actual_minutes`, prints actual against the estimate and the verdict (`at or under median`, `within P90`, `over P90`); a second call reprints and writes nothing; with no state, `Wave W: actual unknown (no run state)`, exit 0.
- `finish <N>`: sets `finished_at` once; prints the run's actual against the execution (waves-only) estimate; a second call reprints the same line from the stored times. The status line segment is empty afterwards.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Text renderers (estimate-format.cjs) | `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs` (29 tests) | 0 | PASS |
| 2: task, trd, objective, milestone, dispatcher, help | `node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` (81 tests with the format suite) | 0 | PASS |
| 3: start, wave, finish | `node --test plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` plus format, help and dispatch suites (139 tests) | 0 | PASS |

TRD tests 1-15 are all present: 1-3 and the run-verb spawn tests spawn the real df-tools; 4-11 call `runEstimate` with `now = T0` (2026-10-05T18:00:00.000Z) and a temp state directory; 12-15 are pure. The estimate-cli suite holds 47 tests, the format suite 29.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, f79bf1d4) | `node --test .../estimate-format.test.cjs` | 1 (Cannot find module ./estimate-format.cjs) | FAIL (correct) |
| GREEN (Task 1, 5721cfd1) | same | 0 (29 pass) | PASS (correct) |
| RED (Task 2, 2e9f3703) | `node --test .../estimate-cli.test.cjs` | 1 (Cannot find module ./estimate-cli.cjs) | FAIL (correct) |
| GREEN (Task 2, fb4f07c0) | same | 0 (30 pass after the cost assertions were made to follow the JSON, see Deviations) | PASS (correct) |
| RED (Task 3, 3efb0559) | same | 1 (31 pass, 16 fail: `start`, `wave`, `finish` were unknown subcommands, a usage error) | FAIL (correct) |
| GREEN (Task 3, 2d1dab9f) | same plus run-store, format, help, dispatch | 0 (47 pass in the CLI suite, 139 across the five files) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 | PASS |
| test | `npm test` | 1 (9700 tests, 9665 pass, 3 fail, 32 skipped) | PASS against baseline: the 3 failures are the known ones |

The three `npm test` failures are the objective's recorded baseline and unrelated to this TRD: `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` (handoff pipeline, PTY mock auth), `E2E1: SELF-TEST reconcile dry-run against this repo ROADMAP shows zero drift` (it names 58-08 itself: the SUMMARY now exists while the ROADMAP box is unticked until the orchestrator completes the objective) and `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md`.

Lint, build and format are `none` in the stack profile (`not_available`, not counted as passes).

## Deviations from Plan

None - TRD executed as written. Notes where the TRD was silent or the two statements differ:

- **`calibration` in the JSON** carries `samples` as well as `{path, version, data_as_of}` (the TRD's must-have lists the three, its codebase note lists four, and the objective table footer `Calibration 2026-10-05, 50 TRDs.` needs `samples.trds`). Tests assert the three fields individually plus `samples`.
- **Cost figures in the CLI tests follow the engine's JSON.** The TRD's `OBJ_RESULT`/`MS_RESULT` cost literals (`$6.80`, `$29.40`) are inputs to the pure formatter tests (and are asserted byte for byte there); the engine's own cost for the fixture project is `$6.38` / `$28.37`, which the TRD only constrains for wall time (`26 min`, `25.6/69.2`, `1h 49m`). The CLI tests assert the wall figures literally and the cost figures against the JSON they came from, within the sanity range implied by the TRD medians. The first GREEN run of the cost literals failed for exactly this reason and the assertions, not the engine, were corrected.
- Additions: `objective --all` sets `all: true` and the text says `estimated` instead of `left`; `task --checkpoint` works without a calibration; `wave --done` on a started wave of a stale same-objective run records it (only `wave --start` treats staleness as "no run"); `wave --done` on a wave that was never started says `actual unknown (the wave was not started)`; `wave` accepts `--calibration` (used when `--start` has to run `start` or add a wave); `finish` takes no calibration (the estimate comes from the stored state).
- The `roundResult` rule table also covers `actual_minutes` (one decimal) so the run verbs' JSON is rounded by the same function; `n` is never rounded.
- An objective that exists only as a ROADMAP section (no directory) is "not found" for `estimate objective|start`, as the TRD says; the milestone verb still estimates such objectives through its own fallback.

## Discovered commands

None. `test` and `test_scoped` came from `.planning/STACK.md` and the TRD's validation gates.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (task line with class, medians, P90s, sample count and confidence; trd, objective and milestone with `--table` and `--line`; `No estimate:` naming df-tools calibrate with exit 0 for every verb; start/wave/finish with the run state, verdict and idempotent finish; numbers rounded once at output)
- Gate failures: none beyond the three known baseline failures

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-format.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-cli.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs
- FOUND: plugins/devflow/devflow/bin/df-tools.cjs (case 'estimate', header doc)
- FOUND: plugins/devflow/devflow/bin/lib/help.cjs (COMMANDS.estimate)
- FOUND commits: f79bf1d4, 5721cfd1, 2e9f3703, fb4f07c0, 3efb0559, 2d1dab9f
