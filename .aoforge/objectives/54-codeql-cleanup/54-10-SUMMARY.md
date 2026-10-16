---
objective: 54-codeql-cleanup
trd: 54-10
subsystem: security
tags: [codeql, ci]
requirements-completed: []
completed: 2026-10-04
---

# 54-10 Summary: CodeQL confirmation and the alert 95 dismissal

The orchestrator carried out this checkpoint TRD after the user picked "draft PR, then merge + release 2.13.1".

## Done
- **Task 1 (checkpoint):** the user chose a draft PR, followed by a merge and the 2.13.1 release.
- **Task 2:** draft PR #122 (`feat/stack-profile-loader` → `main`) triggered CodeQL default setup. Every check passed: `test (npm test, gated)`, harness, and Analyze for actions, javascript-typescript and ruby. The CodeQL summary reported **1 new medium alert**: `js/shell-command-injection-from-environment` at `ui-spec-cli.test.cjs:781`. That is the 54-05 fix of former alert 122 at a moved line. Its script is constant and the node path, df-tools and arguments reach `sh` only as positional parameters, so it is a false positive. The user chose to dismiss it as a false positive once it lands on `main`. All 53 other targeted alerts are absent from the PR scan.
- **Task 3:** alert 95 (`js/regex-injection`, `handoff.cjs` `prompt_match`) was dismissed as "won't fix" with this reason: "Intended: a handoff manifest declares prompt_match as a regex by design; the value comes from the user's own manifest". Its state is verified as `dismissed`.

## Self-Check: PASSED
