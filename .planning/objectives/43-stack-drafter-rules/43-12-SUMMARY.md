# Objective 43 TRD 12: Authored targets, wrappers and lint actions versus the tier default Summary

## Progress
- [x] Task 1 RED: declared-target (DT1-DT4) and wrapper (W1-W5) draft tests, realshape declaredDefaultTargetShape and ciVariantComponentShape (lint held in extraAllowed until Task 2), aoedge.lint and aocore.audit removed from KNOWN_DRIFT — 8bbc2d09
- [x] Task 1 GREEN: declaredTarget (narrowed twice on the fleet: whole body = default with no prerequisite; name does not restate the default's command word), wraps() + `wrapper` note, bare() drops a detached redirection target; DT3 re-baselined, DT5 added — 949a3cfa
- [x] Task 2 RED: K30 (lookupUsesCli, USES_CLI, isDedicatedLinter), C15 (`step.with['working-directory']`), L1-L5 linter preference; ciVariantComponentShape asserts lint and an `alternate` note; aocore.lint removed from KNOWN_DRIFT — a990483c
- [x] Task 2 GREEN: USES_CLI + lookupUsesCli + isDedicatedLinter (stack-classify), `with['working-directory']` (stack-ci), USES_CLI uses steps as CI items (stack-evidence readCi), lint linter preference in rankOf + `alternate` note for the displaced default linter (stack-draft) — (this commit)
- [ ] Final SUMMARY — next step: write the full SUMMARY (closed keys, re-baselines, KNOWN_DRIFT before/after, evidence tables) and post it with `summary post 43-12`, then update STATE/ROADMAP and run npm test
