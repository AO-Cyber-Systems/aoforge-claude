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
- [x] Task 1: Provenance of the frozen calibration and 63's run state, the drift list, and the 63 reproduction — (this commit)
- [ ] Task 2: Backfill the token history of 58-63 — next step: run `df-tools tokens backfill --raw` (dry run) from the 64-03 checkout, record counts by reason, then `--write`, run the 57-07 diff guard, commit the changed SUMMARY paths from `git diff --name-only`.
- [ ] Task 3: Audit the actuals (SUMMARY minutes vs executor transcript spans for 59-63)

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
