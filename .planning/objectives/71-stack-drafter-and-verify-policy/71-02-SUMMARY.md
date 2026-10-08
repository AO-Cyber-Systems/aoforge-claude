---
objective: 71-stack-drafter-and-verify-policy
job: "02"
subsystem: stack-drafter
tags: [fleet-harness, drift, self-test, refresh-pending, ratchet]
requires:
  - objective: 71-stack-drafter-and-verify-policy
    provides: "71-01 self-test rule and declared-linters rule"
provides:
  - "selfTestDrafts guard: a fleet draft that picks a self-test beside its gate fails the harness"
  - "OPEN pending: 'refresh' rows for justinforme and smartWellness lint"
affects: [71-05 dogfood and docs]
requirements-completed: [SDR-09]
started: 2026-10-08T19:48:16Z
---

# Objective 71 TRD 02: Fleet tables and guards Summary

(in progress)

## Progress
- [ ] Task 1: `selfTestDrafts` guard and refresh-pending OPEN rows, on synthetic data — next step: add `selfTestDrafts` to stack-drift-compare.cjs and the refresh note branch to `assess` in stack-drafter-fleet.test.cjs (GREEN)
- [ ] Task 2: Tables updated, per-repo self-test guard wired, real-fleet run green
