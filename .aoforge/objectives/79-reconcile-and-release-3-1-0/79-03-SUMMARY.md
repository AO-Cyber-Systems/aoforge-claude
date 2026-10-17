---
objective: 79-reconcile-and-release-3-1-0
trd: "03"
status: checkpoint
---

# Objective 79 TRD 03: Re-prove pre-bash one-process equivalence on the merged hooks Summary

## Progress
- [x] Task 1: Fixture builder and hand-built corpus — (this commit)
- [ ] Task 2: Equivalence test, mutation proof, and fixes for any divergence — next step: write plugins/aoforge/hooks/pre-bash-equivalence.test.js (registration, one test per CORPUS entry spawning pre-bash.js vs the five hooks merged with pre-bash.merge, the SEQUENCES step comparison, sanity anchors, mutation against a scratch copy without gate-interactive) and run it with a scratch HOME before touching any hook
- [ ] Task 3: Hook-domain triage rows and registration checks
