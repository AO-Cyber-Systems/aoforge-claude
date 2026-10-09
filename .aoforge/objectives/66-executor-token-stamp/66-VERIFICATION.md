---
objective: 66-executor-token-stamp
verified: 2026-10-08T00:00:00Z
status: human_needed
score: 2/3 must-haves verified
human_verification:
  - test: "Decide whether EST-09 may be closed with measured v1.6 coverage 0.75 (6/8)"
    expected: "Either accept (2 misses are objective 65 TRDs 65-02/65-03, executed before the stamp existed, reason no_transcript) or keep Pending until a later release meets 95%"
    why_human: "Judgment on requirement wording and on excluding pre-feature TRDs"
---

# Objective 66: Executor Token Stamp Verification Report

**Goal:** Every executor SUMMARY records its own token usage at write time.
**Status:** human_needed

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Repo `agents/executor.md` has `tokens stamp ... --draft`; a repo test guards it | VERIFIED (repo) | executor.md line 1066; `executor-token-stamp.repo.test.cjs`; full `node --test` run: 1412 pass, 0 fail. Installed runtime 2.14.0 does not carry it yet: release is a recorded follow-up |
| 2 | Executor SUMMARY carries tokens_input/tokens_output with no backfill | VERIFIED | 66-01..66-04 SUMMARYs each carry both; `tokens coverage --objective 66` = 4/4, ratio 1, all class live |
| 3 | A command reports v1.6 forward-stamp coverage, measured and recorded | VERIFIED (command), target NOT met | `tokens coverage --milestone v1.6` = 6/8 = 0.75, met:false; misses 65-02 and 65-03 (no_transcript); reported unrounded |

## EST-09 wording

REQUIREMENTS.md: "Every new executor SUMMARY carries tokens_input / tokens_output. Forward-stamp coverage is >=95% over the TRDs executed in v1.6, and the coverage is measured and reported." The wording requires 95% to be met, not merely measured. At 0.75 over the milestone it is unmet, so the Pending status (reverted by 66-04) is correct. Objective-66-only coverage is 100%; the shortfall is wholly objective 65 TRDs executed before the stamping existed. Roadmap criterion 3 says "target at least 95%, measured number printed and recorded", which is satisfied for measurement and not for target.

## Requirements Coverage

EST-09 claimed by 66-01..66-04; REQUIREMENTS.md row: Pending. No orphans.

## Anti-patterns

None found in checked areas. Functional UI verification: skipped (not a UI objective).

## Follow-ups

- Release a plugin version carrying 66 so the installed executor.md has the stamp step.
- Coverage will reach the target only for future v1.6 TRDs, or if the milestone scope is redefined to exclude pre-feature TRDs (human decision).
