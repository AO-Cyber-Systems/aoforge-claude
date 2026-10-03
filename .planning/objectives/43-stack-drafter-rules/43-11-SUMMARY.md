# Objective 43 TRD 11: Aggregates, codegen target choice and environment targets Summary

## Progress
- [x] Task 1 RED: unitKeys/legs (E23), mixed-aggregate draft tests (M1-M4), realshape mixedAggregateCodegenShape and bootstrapTaskShape, justinforme/smartWellness codegen and ao-terminal deps removed from KNOWN_DRIFT — a7b300c2
- [x] Task 1 GREEN: unitKeys + target.legs in stack-evidence; mixed_aggregate filter in stack-draft, narrowed to single-purpose keys after fleet regression; E13 re-baselined (legs); ao-terminal.deps re-tagged flag-only residual — 73af3619
- [x] Task 2 RED: envRole (K29), driftWriter (E24), partial_check (P1-P5) and env teardown/reset (T1-T5) tests, realshape partialDriftCheckShape and scenarioStackShape, eden-biz.codegen removed from KNOWN_DRIFT — (this commit)
- [ ] Task 2 GREEN — next step: export envRole from stack-classify.cjs; expose driftWriter from driftCheckOf through classifyTarget/classifyStep into the pushed item in stack-evidence.cjs; in stack-draft.cjs evaluateKey add the env_teardown/env_reset filter for e2e/e2e_env and the partial_check refinement of R5; run the scoped stack-*/adopt-* suite
