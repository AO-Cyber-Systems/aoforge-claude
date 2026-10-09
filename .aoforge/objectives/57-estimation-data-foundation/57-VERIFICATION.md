---
objective: 57-estimation-data-foundation
verified: 2026-10-05T00:00:00Z
status: passed
score: 4/4 must-haves verified
notes:
  - kind: requirements_bookkeeping
    note: "EST-01 is still unticked ('Pending') in REQUIREMENTS.md although delivered; tick it on completion. EST-06/EST-07 ticks are now backed by code."
  - kind: backfill_coverage
    note: "Dry run: 397 SUMMARYs, 234 stamped, 0 further recoverable, 163 unrecovered (156 no_transcript, 7 unkeyed). History predating retained transcripts cannot be recovered."
  - kind: deployment_verification
    note: "deployment_verification: not_available (not a deployable-manifest objective). ~/.claude/devflow mirror holds old code until re-sync."
---

# Objective 57: Estimation data foundation Verification Report

**Objective Goal:** Token usage is recorded for new executions and recovered for history, and a calibration file turns that history into per-task-class medians and P90s.
**Status:** passed
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New executor SUMMARY carries tokens_input/tokens_output | VERIFIED | `tokens stamp` verb (tokens-cli.cjs); executor.md self_check runs it before `summary post` (lines ~1056-1063); summary.md template documents fields; 57-07-SUMMARY.md itself carries tokens_input 4403849 / tokens_output 22405; stamp e2e tests pass |
| 2 | Retroactive pass fills history from transcripts via context parser and reports recovered/unrecovered | VERIFIED | Dry run of `tokens backfill` printed counts (234 already stamped, 0 recovered, 163 unrecovered with by_reason); dry run is default, `--write` required; tests 57-04/57-06 pass |
| 3 | `calibrate` writes calibration.json from SUMMARY frontmatter, STATE_ARCHIVE metrics, rates, with sample count per class | VERIFIED | `calibrate --out <scratch>` wrote file: 314 TRDs, 726 tasks, per-class counts for 12 classes, 64 metric rows joined, `unpriced_models: []`, inputs_digest |
| 4 | Re-run on unchanged inputs gives the same file | VERIFIED | Two runs to separate files; `cmp` shows byte-identical; unit tests also cover mtime changes and directory moves |

**Score:** 4/4

## Locked constraints

| Constraint | Status | Evidence |
|---|---|---|
| Rates in one file with source and as_of per entry | OK | references/model-rates.json, every model has https source + as_of 2026-10-05; validator tests reject missing source |
| No wall-clock timestamp in calibration.json | OK | no generated/timestamp fields; `data_as_of` is derived from rates; "no clock value reaches the output" test passes |
| Tests never write real calibration.json | OK | calibrate-cli.test.cjs uses mkdtemp fake HOME for every spawn |
| Backfill dry-run default, needs --write | OK | ran without flag, no files changed |
| Commit ecd446f4 only added token lines | OK | 231 files, 1386 insertions, 0 deletions; each file +6 / -0 |

## Test run

57-scoped suites (token-usage, token-backfill, calibration-inputs, calibrator, calibrate-cli, tokens-cli): 181 pass, 0 fail.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| EST-06 | SATISFIED | forward stamp verb + executor prose + template; real SUMMARYs stamped |
| EST-07 | SATISFIED | backfill reuses transcript parser (token-usage.cjs); 234 SUMMARYs stamped; report of unrecovered |
| EST-01 | SATISFIED (checkbox unticked) | `calibrate` verified above |

No orphaned requirements.

## Anti-Patterns

None found in the exercised code paths.

## Human Verification

None required.

## Gaps Summary

None. 163 historical SUMMARYs are unrecoverable because no transcript remains; this is reported, as the criterion requires, not a defect.

_Verifier: Claude (verifier)_
