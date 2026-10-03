# Objective 43 TRD 12: Authored targets, wrappers and lint actions versus the tier default Summary

## Progress
- [x] Task 1 RED: declared-target (DT1-DT4) and wrapper (W1-W5) draft tests, realshape declaredDefaultTargetShape and ciVariantComponentShape (lint held in extraAllowed until Task 2), aoedge.lint and aocore.audit removed from KNOWN_DRIFT — 8bbc2d09
- [x] Task 1 GREEN: declaredTarget (narrowed twice on the fleet: whole body = default with no prerequisite; name does not restate the default's command word), wraps() + `wrapper` note, bare() drops a detached redirection target; DT3 re-baselined, DT5 added — 949a3cfa
- [x] Task 2 RED: K30 (lookupUsesCli, USES_CLI, isDedicatedLinter), C15 (`step.with['working-directory']`), L1-L5 linter preference; ciVariantComponentShape asserts lint and an `alternate` note; aocore.lint removed from KNOWN_DRIFT — (this commit)
- [ ] Task 2 GREEN — next step: add USES_CLI, lookupUsesCli and isDedicatedLinter to stack-classify.cjs (update the USES_MAP comment); record `with['working-directory']` in stack-ci.cjs parseDoc; push a CI item per USES_CLI `uses` step in stack-evidence.cjs readCi; add the lint linter-preference element to rankOf and the `alternate` note for the displaced default linter in stack-draft.cjs; run the scoped stack-*/adopt-* suite and the fleet harness
