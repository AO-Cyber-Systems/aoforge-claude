---
objective: 71-stack-drafter-and-verify-policy
verified: 2026-10-08T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Objective 71: Stack drafter and verify policy Verification Report

**Objective Goal:** The stack drafter picks the gate that actually scans, and `stack verify --run` has a stated policy for tests that need services and builds that write artifacts.
**Status:** passed
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Real gate preferred over `--self-test` step | VERIFIED | `self_test` filter in stack-draft.cjs; ST1-ST7 tests pass; fleet harness `selfTestDrafts` guard; 71-05 SC-1 before/after on aodex |
| 2 | buf lint coverage drafted; closed rows removed from ACCEPTED and guarded | VERIFIED | `declared_linters` in stack-draft.cjs; `AUX_LINTERS`/`linterToolOf` in stack-classify.cjs; no `aodex.audit` row in ACCEPTED; OPEN refresh-pending rows for justinforme/smartWellness; harness passes |
| 3 | `--run` skips service-backed tests as `env_required`; opt-in `--allow-services` | VERIFIED | `RUN_POLICY.services`, `env_required` skip and `optIn` in stack-verify.cjs; flag-spec and help.cjs list `--allow-services`; cases 1-17 pass |
| 4 | Untracked build output restored/reported, does not halt other components | VERIFIED | `isBuildOutput`, `RUN_POLICY.buildOutputDirs`, `build_outputs` in stack-verify.cjs; run-guard build-output tests pass |

**Score:** 4/4

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SDR-09 | SATISFIED | TRDs 71-01, 71-02; REQUIREMENTS.md checked and mapped to Objective 71 |
| SDR-10 | SATISFIED | TRDs 71-03, 71-04; REQUIREMENTS.md checked and mapped to Objective 71 |

No orphaned requirements.

## Functional Verification

Ran stack-draft, stack-verify-services, stack-verify-run-guard, stack-evidence and stack-drafter-fleet tests: 336 tests, 335 pass, 0 fail, 1 skipped.
Docs: `env_required` in templates/stack.md, `allow-services` in CLAUDE.md. A follow-up todo for the justinforme/smartWellness committed-file refresh exists. Runtime drives (SC-1 to SC-4 on scratch clones) are recorded in 71-05-SUMMARY.md; not re-run here.

## Anti-Patterns

None blocking found in the checked files.

## Human Verification

None required.

## Gaps Summary

None. Deployment verification: not_available (not applicable; CLI tooling).

_Verifier: Claude (verifier)_
