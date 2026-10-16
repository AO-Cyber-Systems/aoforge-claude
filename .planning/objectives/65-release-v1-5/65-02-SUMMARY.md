---
objective: 65-release-v1-5
trd: "02"
subsystem: release
tags: [release, v2.14.0, push, pull-request, ci]

requires:
  - objective: 65-01
    provides: signed release commit fad0442b and pre-live validation

provides:
  - "origin/feat/stack-profile-loader pushed (510 commits, 20b75f3b..82ecabfe), then 82ecabfe..e7dc109c with the two CI fixes"
  - "release PR #126 feat/stack-profile-loader -> main, titled `Release 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)`, all 7 checks green at e7dc109c"

affects: [65-03]

key-files:
  created: []
  modified: []

key-decisions:
  - "Each live step ran only after the user's literal `approved` reply: the branch push, the PR open, and the second push of the CI fixes."
  - "The first CI run failed two gates. These were fixed on the branch as quick tasks 32 and 33, not waived or added to known-test-failures."
  - "Quick 32: hook-runner.js settled 150 ms after child exit even when the pipes had not drained, so on a loaded runner a hook's output was lost. That caused hook-coexistence tests 10 and 11 to fail on a different hook each run. It now waits for close, with a 2000 ms grace. Commits 433e6804 (RED) and 1e12f7f0."
  - "Quick 33: the CodeQL check flagged 13 new alerts (12 high) against a main kept at 0 by objective 54. Fixes: estimate-format table cells now use mdCell (backslash before pipe), the install-hint tests assert exactly, and the merge-sequence test helper spawns with argv and no shell. Commits 52160f6b..8d4396af."

requirements-completed: []

duration: ~90min (including two CI cycles)
completed: 2026-10-08
---

# 65-02 Summary: push branch and open release PR

## Outcome
- Push 1, after the user approved: `20b75f3b..82ecabfe  feat/stack-profile-loader -> feat/stack-profile-loader`.
- PR open, after the user approved: https://github.com/AO-Cyber-Systems/devflow-claude/pull/126. Its headRefOid was 82ecabfe. The body came from the CHANGELOG 2.14.0 section and the 65-01 numbers, and ends with the attribution line.
- First CI run on 82ecabfe failed two checks:
  - `test (npm test, gated)` had 5 failures. PW-9 is a known failure. The other four were hook-coexistence tests 10 and 11, which got empty output from auto-continue.js and changelog-on-tag.js. A re-run of the failed job failed again, this time with a different case (user-garbage: 0 errors where 1 was expected). Locally the suite passed 3/3.
  - `CodeQL` reported 13 new alerts.
- Fixes: quick 32 and quick 33. Locally `npm test` went to 11075 tests, 11041 pass, 0 fail, 34 skipped.
- Push 2, after the user approved: `82ecabfe..e7dc109c`.
- CI on e7dc109c passed all seven checks: Analyze (actions, javascript-typescript, ruby), CodeQL, build, harness, and test (npm test, gated). The PR was MERGEABLE and CLEAN.

## Deviations
- The TRD assumed the PR would go green on its first CI run. It needed two fix tasks, run as /devflow:quick 32 and 33, plus a second push. Each push had its own approval.
