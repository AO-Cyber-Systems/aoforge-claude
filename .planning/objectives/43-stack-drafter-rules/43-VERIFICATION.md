---
objective: 43-stack-drafter-rules
verified: 2026-10-03T23:00:00Z
status: human_needed
score: 35/36 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 34/36
  gaps_closed:
    - "Success line: re-drafting the 11 override repos' shapes matches the override files; no fleet row needs a hand-fix (user-accepted rows count as decided)"
  gaps_remaining:
    - "SDR-08 partial: politihub never run under --run; 19 gates inconclusive (host cgo linker, deps not installed)"
  regressions: []
human_verification:
  - test: "Decide whether SDR-08 may close as partial (32/33 repos with a real stack verify --run result, 0 harness deltas) or needs a follow-up run"
    expected: "Either accept 32/33 plus the 19 inconclusive gates as the objective's final state, or approve a fresh run for politihub (HEAD 30be797fb85b now; 43-07 pinned 686cb0b82a9f, saw bede7bd6f3a9) and the host-blocked rows after the linker fix and trades npm install"
    why_human: "Running gates in a fleet repo needs a fresh per-run approval, and the host linker (CLT vs macOS 27 SDK) is an environment fix outside the code"
  - test: "Acknowledge the known drafter limitations accepted under accept-all"
    expected: "aodex.audit drafts the govulncheck --self-test step (scans nothing); justinforme and smartWellness `make lint` also run `buf lint`, which neither draft nor committed file carry; ao-terminal.deps and aocore.test remain hand-edited flag differences"
    why_human: "These are user-decided (accept-all, 2026-10-03) but remain real limitations; whether a later drafter TRD should take them is a product call"
---

# Objective 43: Stack drafter rules Re-Verification Report

**Goal:** Fix the drafter defects objective 42's rollout hand-fixed so re-drafting matches the 11 override files.
**Status:** human_needed. The Success line is met. SDR-08 stays partial.
**Re-verification:** Yes, after gap closure cycle 1 (TRDs 43-08..43-15).

## Success line

"Re-drafting each of the 11 override repos' shapes from fixtures yields commands equivalent to the override files; the full fleet dry run shows no row needing a hand-fix."

VERIFIED, treating user-accepted rows as decided.

- I ran `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs`: 42/42 pass. 28/28 pass for the golden and realshape suites.
- The 33-repo dry run went from 12 conflict repos to 3 (24 match, 6 more-specific). Nine of the twelve closed through general drafter rules (43-09..43-13) and the refresh of two stale committed files (43-14).
- `stack-fleet-tables.cjs` exports exactly FLEET, ACCEPTED and OPEN. KNOWN_DRIFT is deleted. OPEN is empty. ACCEPTED holds 13 entries, each `by: 'user'`, with a `kind` so an accepted more-specific row cannot hide a later conflict.
- Each accepted row traces to a verbatim user decision recorded in 43-ROLLOUT.md:
  - devcluster.lint and devcluster.test: remedy (c), the 43-07 decision.
  - ao-terminal.deps and aocore.test (the two flag-only conflicts): `accept-all`, `### Decision`, committed in 4daf6232 before the table edit in c6379a8a.
  - The 9 more-specific rows: `accept-all`, same commit.
  - 43-14: `approved` for aoinference and opsCluster. The refresh was committed locally (87ea0e1a, 9f22c0d6), not pushed, with the user work tree identical to P0.
- Caveat, stated plainly: three accepted rows are real hand-edits or limitations, not matches. These are ao-terminal.deps, aocore.test and aodex.audit (the draft picks the `--self-test` step, so it scans nothing). They are decided, not fixed. Three further `make lint` coverage gaps (dfip, justinforme and smartWellness; the last two drop `buf lint`) are accepted but are not table rows, because the harness sees no drift on them.

## TRD 43-08..43-15 must-haves

All spot-checked against code, not SUMMARYs.

- `df-tools verify artifacts` passes for every TRD: 8/8 TRDs, all artifacts exist and are substantive.
- Key-link `via` strings are prose, so the tool cannot verify them. I checked them manually. `buildBreadth`, `unitAreas`, `unitKeys`, `lookupUsesCli`, `isDriftCheck` and `USES_CLI` are present and wired across `stack-classify`, `stack-evidence` and `stack-draft`.
- The harness reads committed STACK.md from HEAD and uses the same `compareDrift` as the ROLLOUT table.
- No drafter rule names a repo. A grep of every non-test `stack-*.cjs` found fleet repo names only in two comments (`stack-draft.cjs:475`, `stack-verify.cjs:858`). No code branch is keyed on a repo.
- D20 purity holds. `stack-draft.cjs` requires only `stack-classify.cjs`, and the D20 test (`stack-draft.test.cjs:700`) passes in the full suite.
- Fleet read-only proof for 43-15: 33/33 signatures identical, two passes. Today politihub HEAD is `30be797fb85b`, equal to the 43-15 record.

## SDR-08: PARTIAL

- Gain over objective 42: real `stack verify --run` results now exist for 32 of 33 repos (previously 3 of 33). Safety is proven: 0 effect-guard mutations, 0 harness deltas, 0 HEAD moves, 161 gates run, 0 fleet writes.
- Still missing: politihub was skipped by the head-changed rule and was not re-run. Of the 98 red gates, 19 are inconclusive (15 host toolchain, 4 deps not installed). 12 are the cgo link failure on this machine's macOS 27 SDK stubs, so they say nothing about the repos.
- Gap cycle 1 deliberately did not touch this. A re-run needs a fresh per-run fleet approval and a host linker fix.
- Verdict: partial. Every repo that could run was run, safely, and the red results are recorded with causes. The remaining 1/33 plus the inconclusive rows are not a code defect. They are an approval-and-environment item for the user (see human_verification).

## Tests

- `npm test`: 8789 tests, 8756 pass, 1 fail, 32 skipped. The single failure is MA-7 doctl PTY, the known environmental failure. No regression.

## Anti-patterns

None blocking. `stack-draft.cjs` and `stack-classify.cjs` do no fs, env or spawn access.

## Functional and deployment verification

Skipped for functional (CLI objective; the fleet dry run is the runtime evidence). Deployment verification: not_available.

_Verifier: Claude (verifier)_
