---
objective: 43-stack-drafter-rules
trd: "06"
status: in-progress
---

# Objective 43 TRD 06: Golden equivalence for all 11 override shapes (in progress)

## Progress
- [x] Task 1: Golden fixtures and equivalence suite (RED) — (this commit)
- [ ] Task 2: Close residual divergences with general rules (GREEN) — next step: in stack-draft.cjs pickPrimaryComponent, rank a component whose CI steps run its own task-runner targets first (aodex, politihub), with a P7 unit test in stack-draft.test.cjs, then re-run `node --test plugins/devflow/devflow/bin/lib/stack-drafter-golden.test.cjs`
- [ ] Task 3: Docs and the full suite

## RED divergences (Task 1)

PASS: aocore, eden-biz. Diverging: ao-terminal, aodex, aoedge, devcluster, devflowops, EdenDocs, navigators,
politihub, quanta-local (see the Task 1 commit body for the per-golden list).
