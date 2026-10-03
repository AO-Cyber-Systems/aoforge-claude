# Objective 43 TRD 12: Authored targets, wrappers and lint actions versus the tier default Summary

## Progress
- [x] Task 1 RED: declared-target (DT1-DT4) and wrapper (W1-W5) draft tests, realshape declaredDefaultTargetShape and ciVariantComponentShape (lint held in extraAllowed until Task 2), aoedge.lint and aocore.audit removed from KNOWN_DRIFT — 8bbc2d09
- [x] Task 1 GREEN: declaredTarget (narrowed twice on the fleet: whole body = default with no prerequisite; name does not restate the default's command word), wraps() + `wrapper` note, bare() drops a detached redirection target; DT3 re-baselined, DT5 added — (this commit)
- [ ] Task 2 RED — next step: add K tests for lookupUsesCli (@ref, sha, sub-path, non-entry null) in stack-classify.test.cjs, C tests for `step.with['working-directory']` in stack-ci.test.cjs, linter-preference tests (L1-L4) in stack-draft.test.cjs; drop `lint` from ciVariantComponentShape extraAllowed; remove the aocore.lint entry from KNOWN_DRIFT; commit RED
- [ ] Task 2 GREEN: USES_CLI + lookupUsesCli in stack-classify, step.with in stack-ci, uses items in stack-evidence readCi, lint linter preference in stack-draft rankOf
