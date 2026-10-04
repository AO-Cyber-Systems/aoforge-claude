# Objective 53 TRD 02: One rule for which TRDs have a summary (checkpoint)

## Progress
- [ ] Task 1: trdKey helper; health I001, consistency and objective-job-index pair on it — RED committed (this commit); next step: add and export `trdKey` in plugins/devflow/devflow/bin/lib/helpers.cjs, then use it in validate.cjs Check 7 and the consistency orphan check and in misc.cjs cmdObjectiveJobIndex (completedJobIds), and commit `fix(53-02): ...`
- [ ] Task 2: find-objective, verify objective-completeness and gate-executor-stop agree — next step: add the summaryExists cases to plugins/devflow/hooks/gate-executor-stop.test.js and an objective.test.cjs case, commit RED, then pair objective.cjs searchObjectiveInDir, verify.cjs cmdVerifyObjectiveCompleteness and the hook on the key
