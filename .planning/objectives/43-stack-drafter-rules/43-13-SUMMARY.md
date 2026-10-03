# Objective 43 TRD 13: CI variants never displace the canonical build and test Summary

## Progress
- [x] Task 1 RED: K31 buildBreadth (stack-classify), NB1-NB7 narrow builds (stack-draft), realshape ciVariantComponentShape build expectation (single-binary variants in three workflows and a db-tests script building two binaries), aocore.build removed from KNOWN_DRIFT — (this commit)
- [ ] Task 1 GREEN: buildBreadth + the narrow-build filter with tier-default fallback — next step: export `buildBreadth(inv)` from plugins/devflow/devflow/bin/lib/stack-classify.cjs, add the `key === 'build'` narrow filter and `narrow_fallback` note to evaluateKey in stack-draft.cjs, then run the realshape suite and the fleet harness
- [ ] Task 2 RED: runtimeVars (stack-ci), runtimeVar (stack-evidence), runtime rank (stack-draft), realshape test expectation, aocore.test out of KNOWN_DRIFT
- [ ] Task 2 GREEN: runtime-assigned variables rank after plain ones
