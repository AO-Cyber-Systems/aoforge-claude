---
objective: 64-estimate-accuracy-validation
verified: 2026-10-07T22:00:00Z
status: human_needed
score: 2/3 must-haves verified (SC1 and SC3 met; SC2 measured and not met)
re_verification:
  previous_status: human_needed
  previous_score: 2/3
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Accept the EST-08 not-met verdict as the objective's outcome"
    expected: "Objective closes with EST-08 unchecked. After `objective complete 64` auto-ticks the checkbox, re-open it (REQUIREMENTS.md line 65). Schedule todo recalibrate-estimate-minutes-est-08-not-met."
    why_human: "The accuracy target is not met by honest measurement. Accepting that, and the shipped window-10 default that does not meet it, is a product decision, not a code gap."
---

# Objective 64: Estimate accuracy validation - Verification Report (re-verification after 64-07..64-10)

**Goal:** Show the estimation engine is accurate enough to trust, against real executions.
**Headline: default changed but EST-08 not met.** The `calibrate` default is now a recency window of 10 objectives (`DEFAULT_WINDOW_OBJECTIVES = 10`, calibrator.cjs:21), but the pre-registered validation on 59-63 still returns EST-08 not met.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Report compares estimate with actual for objectives 59-63 | VERIFIED | 64-ACCURACY-REPORT.md has rows for all five; the rolling table (old vs new) is in 64-VALIDATION.md |
| SC2 | Median estimate within +-30% of actual | NOT MET (honestly measured) | Frozen calibration: minutes median 1.51, 2 of 5 in band. Rolling old 1.348; rolling new (window 10) 1.238 with 2 of 5 in band. Cost median 0.797, 3 of 5 in band under the new method |
| SC3 | P90 covers >=80%, or report names miscalibrated classes and follow-up | VERIFIED via second branch (and met for minutes) | Minutes P90 covers 5/5 objectives and 40/41 TRDs. Cost P90 covers 4/5 objectives but 32/41 TRDs = 78%, below 80%. The report names 9 miscalibrated class/metric pairs and the follow-up todo exists: `.planning/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md` |

**Score:** 2/3. The "or names classes and follow-up" branch of SC3 is satisfied in substance, since cost P90 fails the coverage test and the report plus todo supply the alternative. It does not rescue SC2 or the EST-08 requirement.

## Rules held (checked against the repo)

| Rule | Result | Evidence |
|---|---|---|
| No multiplier fitted to 59-63 | HELD | Window was chosen from objectives 46-58 only (64-DIAGNOSIS.md, `--eval 46-58`, label pre59); no correction factor in the calibrator |
| EST-08 thresholds unchanged | HELD | `estimate-backtest.cjs` has `BAND = 0.3`, `COVERAGE_TARGET = 0.8`; last commit touching it is 1bb18b88 (64-04), before 64-07 |
| Actuals unchanged | HELD | `git status --short plugins scripts` is clean; the control reproduced every printed figure of 64-05 |
| 64-DIAGNOSIS.md frozen | HELD | One commit (34515181); `decision: build_window`, `window_objectives: 10`, `selection_output_sha256: fdf60e66...` |
| 64-08 hash gate recorded | HELD | 64-08-SUMMARY.md "Hash gate" section; pre-59 selection hash equals the frozen digest |
| 64-09 run once, frozen protocol | HELD | 64-VALIDATION.md: `harness_control: reproduced`, control scored before the new method, one scoring run. One scratch-script field-name slip (`NaN` in the comparison) was disclosed and fixed without touching harness inputs |
| Default changed, EST-08 not met stated prominently | HELD | Stated at the head of 64-ACCURACY-REPORT.md, in 64-10-SUMMARY.md, in CHANGELOG, and in REQUIREMENTS.md line 65 and traceability row 122 |
| live calibration.json not written by this verification | HELD | Not touched here. The live file hashes to 9ef7d108..., which 64-10 recorded: it was deliberately regenerated (5cf42c4b to 9ef7d108) when the default flipped. The frozen copy `calibration-5cf42c4b.json` still hashes to 5cf42c4b |

## Honest assessment of the ship decision

64-09 reports `est08: not met` and `ship_default: true`. The shipped decision rests on the pre-registered ship rule (minutes median closer to 1, no previously passing status fails), not on EST-08 being met. Minutes SC2 flips from fail to pass at the median level (1.348 to 1.238) but the in-band objective count stays at 2 of 5, and cost SC3 is unchanged at 78%. The evidence is five objectives, leave-future-out reconstruction, and prospective confirmation is still needed (section 9 of 64-VALIDATION.md). The ship was not hidden. Whether the window default is worth keeping on this evidence is the user's call.

## Requirements Coverage

| Requirement | TRDs claiming | Status | Evidence |
|---|---|---|---|
| EST-08 | all ten (64-01..64-10) | NOT MET, fully accounted for | REQUIREMENTS.md line 65 unchecked with not-met note, traceability row 122 |

No orphaned IDs; all ten TRD frontmatters carry `requirements: [EST-08]` and it is the only objective-64 requirement.

## Anti-patterns, functional and deployment verification

No stubs or blockers found in the estimator or harness scripts. No UI (functional and design review skipped). Deployment verification not applicable. Full `npm test` was reported passing (11071 tests, 0 fail) and was not re-run.

## Human Verification Required

1. Accept the EST-08 not-met verdict and the shipped window-10 default; re-open the EST-08 checkbox after `objective complete 64`; schedule the recalibration todo. No estimator-tuning gap closure is recommended.

---
_Verifier: Claude (verifier)_
