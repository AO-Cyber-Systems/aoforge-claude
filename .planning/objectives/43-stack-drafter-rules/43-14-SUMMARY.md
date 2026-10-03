---
objective: 43-stack-drafter-rules
trd: "14"
job: 43-14
subsystem: stack-drafter
tags: [stack, rollout, gap-closure, checkpoint]
---

# Objective 43 TRD 14: Refresh stale committed STACK.md in aoinference and opsCluster (checkpoint)

## Progress
- [x] Task 1: Preflight and preview (read-only) — 4ebc3a49
- [x] Task 2: Human approves each repo's refreshed STACK.md before any write — (this commit; reply "approved" recorded verbatim under ### Approval in 43-ROLLOUT.md)
- [ ] Task 3: Write, verify, report and commit (approved repos only); clear KNOWN_DRIFT — next step: re-check HEAD and the staged index in aoinference, snapshot P0, then run `stack init --write --force` with the checkout df-tools

## Checkpoint state

Pinned at the preview, 2026-10-03. Task 3 skips a repo whose HEAD differs from these values.

| repo | branch | HEAD | staged | dirty (porcelain -uall) | store | verdict |
|---|---|---|---|---|---|---|
| aoinference | fix/obj31-oci-source-label | c9f1bdccc2da9747fbdd9d45a7c8f98d04e4f2a1 | none | 3 | off | ok |
| opsCluster | main | a547076a0daeaec58675ca2848c2ad1fd85d2d25 | none | 8 | off | ok |

Nothing was written, staged or committed in aoinference or opsCluster. The previews and the preflight are recorded in `.planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md`, section "Gap closure: stale STACK.md refresh (TRD 43-14)".
