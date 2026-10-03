# Objective 43 TRD 13: CI variants never displace the canonical build and test Summary

## Progress
- [x] Task 1 RED: K31 buildBreadth (stack-classify), NB1-NB7 narrow builds (stack-draft), realshape ciVariantComponentShape build expectation (single-binary variants in three workflows and a db-tests script building two binaries), aocore.build removed from KNOWN_DRIFT — 39bf0b85
- [x] Task 1 GREEN: buildBreadth (redirections are never operands), the narrow-build filter with tier-default fallback and `narrow_fallback` note; narrowed on the fleet to "two or more different packages, or a broad build beside"; fleet 36/36, only aocore.build changed — (this commit)
- [ ] Task 2 RED: runtimeVars (stack-ci), runtimeVar (stack-evidence), runtime rank (stack-draft), realshape test expectation, aocore.test out of KNOWN_DRIFT — next step: add C16 runtimeVars tests to plugins/devflow/devflow/bin/lib/stack-ci.test.cjs (and re-baseline the step-contract field list), E-tests for `runtimeVar` in stack-evidence.test.cjs, RT tests in stack-draft.test.cjs, the SKIP command substitution + fuzz/-run lanes in ciVariantComponentShape
- [ ] Task 2 GREEN: runtime-assigned variables rank after plain ones
