# Objective 43 TRD 13: CI variants never displace the canonical build and test Summary

## Progress
- [x] Task 1 RED: K31 buildBreadth (stack-classify), NB1-NB7 narrow builds (stack-draft), realshape ciVariantComponentShape build expectation (single-binary variants in three workflows and a db-tests script building two binaries), aocore.build removed from KNOWN_DRIFT — 39bf0b85
- [x] Task 1 GREEN: buildBreadth (redirections are never operands), the narrow-build filter with tier-default fallback and `narrow_fallback` note; narrowed on the fleet to "two or more different packages, or a broad build beside"; fleet 36/36, only aocore.build changed — 75fedd1d
- [x] Task 2 RED: C16 runtimeVars (stack-ci; step-contract field list re-baselined with `runtimeVars`), E25 runtimeVar (stack-evidence), RT1-RT4 runtime rank (stack-draft), ciVariantComponentShape heavy lane with `SKIP="$(…)"`, e2e/-run/fuzz lanes and a coverage-floor loop, test expectation the light lane; aocore.test removed from KNOWN_DRIFT — 42f7794f
- [x] Task 2 GREEN: runtimeVarsOf + step.runtimeVars (stack-ci), runtimeVar (stack-evidence), the rank element after confidence and the `runtime_var` note (stack-draft); aocore.test re-tagged as the flag-only residual for 43-15 with its exact draft value — (this commit)
