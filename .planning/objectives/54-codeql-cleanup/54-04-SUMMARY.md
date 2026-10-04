# Objective 54 TRD 04: execFileSync in the verify/flutter-ui test files Summary

## Progress
- [x] Task 1: execFileSync in api-contract, flutter-ui-dogfood and flutter-ui-eval-planner-default tests (alerts 102-106, 116) — (this commit)
- [ ] Task 2: execFileSync in flutter-ui-eval-dogfood and verifier-ui-eval-invocation tests (alerts 115, 117, 118, 119) — next step: in flutter-ui-eval-dogfood.test.cjs convert runRaw/runJSON (:24-40) to argv arrays, update the 16 call sites plus the direct calls at :385 and :402, then apply the Case V1 quote guard and whitespace split in verifier-ui-eval-invocation.test.cjs:158-176
