# Objective 43 TRD 12: Authored targets, wrappers and lint actions versus the tier default Summary

## Progress
- [x] Task 1 RED: declared-target (DT1-DT4) and wrapper (W1-W5) draft tests, realshape declaredDefaultTargetShape and ciVariantComponentShape (lint held in extraAllowed until Task 2), aoedge.lint and aocore.audit removed from KNOWN_DRIFT — (this commit)
- [ ] Task 1 GREEN — next step: in stack-draft.cjs evaluateKey, skip the equivalent() inherit for a task-runner target named for the key (canonicalName), reduce a `script` candidate not named for the key whose bodyInvocations run the governing default (bare(), redirection targets dropped) to that default (formEntry + cwd in the primary, inherited at a tier root) with a `wrapper` note; update the 42-07 header; run the realshape, fleet and golden suites
- [ ] Task 2 RED: lookupUsesCli (K), stack-ci `with: working-directory` (C), linter-preference draft tests; drop lint from ciVariantComponentShape extraAllowed; remove aocore.lint from KNOWN_DRIFT
- [ ] Task 2 GREEN: USES_CLI + lookupUsesCli in stack-classify, step.with in stack-ci, uses items in stack-evidence readCi, lint linter preference in stack-draft rankOf
