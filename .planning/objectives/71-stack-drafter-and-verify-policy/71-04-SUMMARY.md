---
objective: 71-stack-drafter-and-verify-policy
trd: "04"
subsystem: stack-verify
tags: [stack-verify, run-policy, build-outputs, effect-guard]
---

# Objective 71 TRD 04: A build's own output is restored and reported, not a reason to stop other gates Summary

## Progress
- [x] Task 1: Fixture builder for a root build beside a Flutter component — (this commit)
- [ ] Task 2: Build outputs are restored, reported and do not halt (in-process) — next step: add the `build outputs are restored and do not halt (TRD 71-04)` describe (cases 3-10) to `stack-verify-run-guard.test.cjs`, run RED, commit, then implement `isBuildOutput` and the `guardEffects` partition in `stack-verify.cjs`
- [ ] Task 3: The CLI shows build outputs and runs the other component's gate — next step: add the `CLI: build outputs (TRD 71-04)` describe (cases 1-2), then append ` build_outputs=<n>` in `rawTable`
