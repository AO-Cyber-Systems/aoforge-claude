---
objective: 64-estimate-accuracy-validation
trd: "05"
subsystem: estimation
tags: [estimate, backtest, EST-08, accuracy-report, calibration]

requires:
  - objective: 64-estimate-accuracy-validation (64-03)
    provides: frozen calibration 5cf42c4b proof, token backfill of 59-63, actuals audit
  - objective: 64-estimate-accuracy-validation (64-04)
    provides: the `estimate backtest` verb

provides:
  - "EST-08 verdict (not met) on out-of-sample evidence, from one rerunnable verb"

key-files:
  created: []
  modified: []

requirements-completed: []  # EST-08 not met: no mark-complete

duration: in progress
completed: 2026-10-07
---

# Objective 64 TRD 05: Out-of-sample backtest and accuracy report Summary

**In progress.**

## Progress
- [x] Task 1: Primary out-of-sample backtest of 59-63 on the frozen calibration, plus the in-sample reference — (this commit)
- [ ] Task 2: Rolling leave-future-out and window diagnostics from git snapshots — next step: `git archive --format=tar -o <scratch>/b5/cut-59.tar 401a9145^ .planning`, extract, `calibrate --paths ... --no-overhead --out <scratch>/b5/cal-cut-59.json`, then `estimate backtest 59 --calibration` that file
- [ ] Task 3: Write 64-ACCURACY-REPORT.md, set EST-08's status, record the follow-up, commit — next step: `planning draft objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md`, write it, `doc put`

## Primary result

Command (repository df-tools, scratch output; hashes re-checked first and unchanged: live and frozen calibration
`5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`, 63 run state `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`):

`node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json [--raw]`

JSON `line` (verbatim): `Backtest 59, 60, 61, 62, 63: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 40 of 41 TRDs) · cost median ratio 0.86 (4 of 5, P90 4 of 5, 34 of 41) · EST-08 not met`

`verdict.est08` = `"not met"`; `verdict.sc2` = {agent_minutes: fail, cost_usd: pass}; `verdict.sc3` = {agent_minutes: pass, cost_usd: pass}; `follow_up_required: true`.

| Metric | Compared | Median ratio | Pooled ratio | In band (0.70-1.30) | P90 covers objectives | P90 covers TRDs | At or under median |
|---|---|---|---|---|---|---|---|
| Agent minutes | 5 | 1.51 (1.514) | 1.45 (1.448) | 2 of 5 | 5 of 5 (100%) | 40 of 41 (98%) | 4 of 5 (80%) |
| Cost | 5 | 0.86 (0.862) | 0.84 (0.839) | 4 of 5 | 4 of 5 (80%) | 34 of 41 (83%) | 2 of 5 (40%) |

Per objective (all five `reconstructed`; ratio = p50 / actual; actuals on the SUMMARY basis, priced tokens for cost):

| Objective | TRDs | Agent min p50 / P90 | Actual | Ratio | <= P90 | Cost p50 / P90 | Actual | Ratio | <= P90 |
|---|---|---|---|---|---|---|---|---|---|
| 59 | 7 | 1h 48m / 5h 34m | 1h 24m | 1.29 | yes | $20.59 / $29.43 | $23.88 | 0.86 | yes |
| 60 | 7 | 1h 52m / 5h 25m | 1h 14m | 1.51 | yes | $22.55 / $32.37 | $19.79 | 1.14 | yes |
| 61 | 9 | 2h 28m / 6h 41m | 1h 10m | 2.11 | yes | $27.92 / $40.55 | $27.57 | 1.01 | yes |
| 62 | 11 | 2h 37m / 8h 14m | 1h 36m | 1.63 | yes | $29.28 / $41.18 | $45.75 | 0.64 | no |
| 63 | 7 | 1h 46m / 5h 31m | 1h 52m | 0.95 | yes | $20.56 / $30.50 | $27.16 | 0.76 | yes |

Wall time (63, prospective run state; reported, never judged): execution-only estimate 1h 37m / 4h 50m, reconstructed
1h 37m / 4h 50m (`Reproduced yes`), actual 1h 51m, ratio 0.87, within P90. Waves: 1 (63-01, 63-05) 20 min / 1h 07m vs 19
min (1.06, covered); 2 (63-02) 15 / 54 vs 12 (1.19, covered); 3 (63-03, 63-04) 16 / 43 vs 8 (1.92, covered); 4 (63-06)
10 / 37 vs 51 (0.19, **not covered**); 5 (63-07) 25 / 1h 43m vs 19 (1.30, covered). 59-62: no run state recorded.

TRDs whose P90 did not cover the actual: minutes, 63-06 (p50 9.5, P90 36.6, actual 45); cost, 59-05 ($2.28 / $3.41 vs
$5.06), 62-02 ($1.74 / $3.36 vs $5.99), 62-08 ($2.18 / $3.13 vs $5.95), 62-09 ($2.18 / $3.13 vs $4.30), 62-10 ($3.04 /
$6.08 vs $8.33), 62-11 ($2.18 / $3.13 vs $4.04), 63-01 ($2.28 / $3.41 vs $4.01). TRDs inside the +-30% band: minutes 13
of 41, cost 25 of 41.

Miscalibrated classes (the verb's flags): minutes code_tdd (41 tasks, 1.80, biased_high), prompt_tdd (19, 1.88,
biased_high), test (13, 0.68, biased_low), other (9, 2.54, biased_high), prompt (3, 0.53, biased_low); cost prompt_tdd
(19, 0.78, coverage 68%, p90_too_narrow), test (13, 0.81, 69%, p90_too_narrow), test_tdd (5, 0.65, biased_low), prompt (3,
0.27, 33%, biased_low and p90_too_narrow). Exclusions: none.

Margins worth stating: cost objective coverage is 4 of 5, exactly the 80% target; cost TRD coverage 34 of 41 passes
with one TRD to spare at 33 of 41 (80.5%) and fails at 32 (78.0%).

## In-sample reference

`estimate backtest 55,56,57 --calibration <frozen> --raw` (these objectives are inside the frozen calibration, so this
is a reference, not out of sample). The estimates and the cost columns match 58-10's table to the printed digit. The
minute actuals differ for 55 and 56: 58-10 summed the TRDs that had minutes, while the verb compares an objective only
when every TRD has minutes (55 is excluded because of 55-06) and reads 56 at 36 min against 58-10's 27.

| Objective | Agent min p50 / P90 today | Actual today (58-10) | Ratio today (58-10) | Cost p50 / P90 | Actual | Ratio today (58-10) |
|---|---|---|---|---|---|---|
| 55 | 2h 14m / 6h 36m (133.6 / 395.7) | excluded, 55-06 has no minutes (68, 6 of 8 TRDs) | n/a (1.96) | $21.66 / $32.67 | $23.06 | 0.94 (0.94) |
| 56 | 1h 15m / 3h 39m (74.6 / 218.5) | 36 (27, 4 of 5 TRDs) | 2.07 (2.76) | $15.83 / $23.58 | $15.72 | 1.01 (1.01) |
| 57 | 1h 49m / 5h 03m (109.5 / 302.7) | 72 (72) | 1.52 (1.52) | $22.61 / $32.81 | $21.41 | 1.06 (1.06) |

Verdict block of the in-sample run: agent minutes `insufficient (2 objectives compared, 3 needed)`, cost SC2 pass (median
1.01, 3 of 3 in band) and SC3 pass (3 of 3 objectives, 20 of 20 TRDs). Even in sample, minutes run high (median 1.80 over
two objectives; code_tdd 1.64 and doc 2.67 flagged biased_high).
