---
objective: 64-estimate-accuracy-validation
verified: 2026-10-07T00:00:00Z
status: human_needed
score: 2/3 must-haves verified (SC1 and SC3 met; SC2 measured and not met)
human_verification:
  - test: "Decide whether to accept the EST-08 not-met verdict as the objective's outcome"
    expected: "Accept: objective closes with EST-08 left unchecked (report and todo recalibrate-estimate-minutes-est-08-not-met carry the follow-up). Also confirm EST-08 checkbox is re-opened after `objective complete 64` ticks it."
    why_human: "Accuracy target is not met by honest measurement; accepting that is a product decision, not a code gap. No estimator tuning is recommended."
---

# Objective 64: Estimate accuracy validation - Verification Report

**Goal:** Show the estimation engine is accurate enough to trust against real executions.
**Status:** human_needed

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 (SC1) | Report compares estimate with actual for five objectives | VERIFIED | 64-ACCURACY-REPORT.md has rows for 59-63 |
| 2 (SC2) | Median estimate within +-30% of actual | NOT MET (honestly measured) | Agent minutes median ratio 1.51, 2 of 5 in band; cost median 0.86, 4 of 5 in band |
| 3 (SC3) | P90 covers >=80% or report names miscalibrated classes and follow-up | VERIFIED | P90 covers 5/5 objectives, 40/41 TRDs (minutes); cost 80%/83%; report also lists 9 miscalibrated class/metric pairs and a follow-up todo |

## Reproducibility

Reran `estimate backtest 59,60,61,62,63 --calibration calibration-5cf42c4b.json --raw` read-only. Output matches the report: ratio 1.51, 1.45 pooled, same per-objective rows, same inputs_digest sha256:254f7950..., "EST-08: not met". The wall-time estimate reproduced within 0.05 min. Targeted `estimate-backtest.test.cjs`: 47 pass, 0 fail. No estimator code under `plugins` has uncommitted changes (git status clean for that path). The report discloses its limits: no prospective executor estimates exist for 59-62, so rows are reconstructed from an out-of-sample calibration, and an after-the-fact calibration that prints "met" is explicitly not treated as the verdict.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| EST-08 | NOT MET, accounted for | REQUIREMENTS.md line 65 unchecked with "not met" note; traceability row names report and follow-up todo `recalibrate-estimate-minutes-est-08-not-met` (present in .planning/todos/pending) |

No orphaned requirement IDs.

## Miscalibrated classes (named in report)

Minutes: code_tdd, prompt_tdd, other biased high; test, prompt biased low. Cost: prompt_tdd, test, test_tdd, prompt (p90 narrow/biased low).

## Notes

- `objective complete 64` will auto-tick the EST-08 checkbox; the report flags that it must be re-opened.
- Functional UI verification, design review: not applicable (no UI). Deployment verification: not applicable.

## Human Verification Required

1. Accept the EST-08 not-met verdict (expected valid outcome per the user) and decide on scheduling the recalibration todo. No gap closure that tunes the estimator is recommended.

---
_Verifier: Claude (verifier)_
