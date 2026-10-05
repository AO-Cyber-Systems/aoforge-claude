---
objective: 55-store-live-smoke-fixes
trd: "02"
subsystem: github-store
tags: [ci, sparse-checkout, outbox, wiki]
requires: []
provides:
  - "devflow-checks.yml sparse checkout includes references/ in all three jobs"
  - "guard test running gh-check-cli from the workflow's own sparse checkout"
  - "gh outbox flush retries a halted blocked wiki-push once per flush"
key-files:
  modified:
    - .github/workflows/devflow-checks.yml
    - plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
---

# Objective 55 TRD 02: Required checks load from their sparse checkout; a blocked wiki push retries on flush Summary

(In progress.)

## Progress
- [x] Task 1: Sparse-checkout guard test, then add references/ to all three jobs — 6d5c0b56 (RED), (this commit: GREEN)
- [ ] Task 2: Flush retries a halted blocked wiki-push once — next step: add RED test 12b to /Users/justin/dev/.df-worktrees/devflow-claude/55-02/plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs and unit tests 6-7 to gh-outbox-flush.test.cjs
