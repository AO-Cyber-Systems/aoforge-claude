---
objective: 71-stack-drafter-and-verify-policy
trd: "04"
subsystem: stack-verify
tags: [stack-verify, run-policy, build-outputs, effect-guard]
---

# Objective 71 TRD 04: A build's own output is restored and reported, not a reason to stop other gates Summary

## Progress
- [x] Task 1: Fixture builder for a root build beside a Flutter component — aea0da13
- [x] Task 2: Build outputs are restored, reported and do not halt (in-process) — RED 0752c625, GREEN (this commit)
- [ ] Task 3: The CLI shows build outputs and runs the other component's gate — next step: add the `CLI: build outputs (TRD 71-04)` describe (cases 1-2), then append ` build_outputs=<n>` in `rawTable`
