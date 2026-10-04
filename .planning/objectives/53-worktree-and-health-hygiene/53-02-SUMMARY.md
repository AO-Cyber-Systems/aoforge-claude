# Objective 53 TRD 02: One rule for which TRDs have a summary (checkpoint)

## Progress
- [x] Task 1: trdKey helper; health I001, consistency and objective-job-index pair on it — RED 3f8f4425, GREEN (this commit)
- [ ] Task 2: find-objective, verify objective-completeness and gate-executor-stop agree — next step: add the summaryExists cases (short and long name, `07-010` and `07-01x` must not match `07-01`) to plugins/devflow/hooks/gate-executor-stop.test.js and a named-TRD/short-summary case to plugins/devflow/devflow/bin/lib/objective.test.cjs, commit RED, then pair objective.cjs searchObjectiveInDir, verify.cjs cmdVerifyObjectiveCompleteness and the hook's summaryExists on the key
