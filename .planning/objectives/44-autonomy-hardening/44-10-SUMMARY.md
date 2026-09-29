# Objective 44 TRD 10: gap closure (stale REBASE_HEAD, SUMMARY path in gate reason) Summary

## Progress

- Task 1 RED (300c4b0): gate-commits tests for the stale REBASE_HEAD case written and failing (4 fail / 80 pass, exit 1).
- Task 1 GREEN (0673c95): `gitOpInProgress()` detects a rebase only via `rebase-merge/` or `rebase-apply/`, and the header comment is updated. Gate tests pass 170/170. Live check: the fixed hook DENIES a raw commit in the main checkout, which has a stale REBASE_HEAD.
- Task 2 RED (000a160): `trdDirFor` unit tests, decide() reason tests and an e2e case, all failing (7 fail / 57 pass, exit 1).
- Task 2 GREEN: added `trdDirFor(id, roots)` and `summaryRelPath()`, and `blockReason(id, summaryRel)` now names `.planning/objectives/<dir>/<id>-SUMMARY.md` when the TRD file is found. Executor-stop and verify-commits tests pass 80/80. Committed in this step.
- Next: full `npm test`, then finish this SUMMARY with evidence and a Self-Check.
