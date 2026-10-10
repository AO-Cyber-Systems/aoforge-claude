---
objective: 74-operations-decisions
trd: "08"
subsystem: ci
tags: [github-rulesets, branch-protection, OPS-02, read-only, re-scope, deferred-ops-03]
status: in-progress
---

# Objective 74 TRD 08: Merge and verify on main (re-scoped to read-only ruleset verification) Summary

Checkpoint in progress. Re-scoped by the user: no merge, no domain move; read-only verification of the `main` ruleset only.

## Progress
- [x] Task 1: Approval gate: merge the ops pull request into main — DEFERRED with OPS-03, not executed (this commit)
- [ ] Task 2: Verify the success criteria on main (ruleset verified read-only; judge not applicable; deploy deferred) — next step: record the GET of rules/branches/main, the GET of ruleset 24829006, `ruleset-check compare` exit 0, the workflow list on main and PR #130's read-only state in this draft, then `summary checkpoint` and commit
- [ ] Task 3: The user decides on moving the docs domain to aoforge-docs — not started

## Task 1: merge gate, deferred with OPS-03

Not executed. The user's direction (relayed by the orchestrator): PR #130 must NOT be merged. After 74-05 reverted the
74-01 judge commits out of `ops/74-ci-operations`, the PR's net diff holds only OPS-03 content (the Cloudflare
deploy-target diagnostic and the `docs.yml` deploy change), and the user deferred OPS-03 (74-06, commit ab9f8d24).
No `gh pr merge` was run, no approval was asked for, and the PR stays open.
