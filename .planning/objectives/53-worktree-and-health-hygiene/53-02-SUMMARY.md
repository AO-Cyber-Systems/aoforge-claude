# Objective 53 TRD 02: One rule for which TRDs have a summary (checkpoint)

## Progress
- [x] Task 1: trdKey helper; health I001, consistency and objective-job-index pair on it — RED 3f8f4425, GREEN 3235b127
- [ ] Task 2: find-objective, verify objective-completeness and gate-executor-stop agree — RED committed (this commit); next step: in plugins/devflow/devflow/bin/lib/objective.cjs searchObjectiveInDir and plugins/devflow/devflow/bin/lib/verify.cjs cmdVerifyObjectiveCompleteness compare `trdKey` on both sides, and widen summaryExists in plugins/devflow/hooks/gate-executor-stop.js to an exact-name fast path then a readdir regex `^<escaped id>(?:-.+)?-SUMMARY\.md$`; then run summary-pairing, objective, hook and reconcile tests, record before/after I001 counts for this repo, and commit `fix(53-02): ...`
