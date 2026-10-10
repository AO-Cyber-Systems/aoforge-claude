---
objective: 73-handoff-gaps-and-result-injection
trd: "09"
---

# Objective 73 TRD 09: $HOME is never an AOForge project root Summary

## Progress
- [x] Task 1: Fixture builders for temp homes — 074deb4a
- [x] Task 2: RED, the $HOME regression tests — (this commit)
- [ ] Task 3: GREEN, the $HOME stop in compat and planning-mode — next step: in plugins/aoforge/aoforge/bin/lib/compat.cjs add userHomeDir, realOr, homeMatcher (stopsAt + isHome), the exported isUserHome and the `home` option with both checks in findProjectRoot; in planning-mode.cjs make nearestPlanningRoot delegate to findProjectRoot(start, { maxUp: Infinity }) and refuse an isUserHome git-holder candidate in resolveMainRoot/resolveCheckoutRoot; give gate-edits.test.js runStoreHook a sibling temp home; run the three new test files, then npm test

RED evidence (pre-fix code, c0e6550b + 074deb4a): 13 of 33 new tests fail. Spawned hooks: 1 classify-session (emits AOFORGE PROJECT DETECTED under the watcher's home, nothing under the control home), 2 gate-edits (denies the Write in the repo below $HOME), 4 route-intent (injects the build directive), 6 gate-edits (denies a Write in $HOME itself). compat: 7, 8, 10, 11 (both symlink directions: findProjectRoot returns <base>/real and <base>/link), 13 (findProjectRoot returns the temp home), 16 (isUserHome is not a function). planning-mode: 17, 18 (resolveMainRoot returns the realpath of the temp home). Passing as planned: 3 (gate-commits: the dot directory has no ROADMAP.md or objectives/, so it never gated), 5, 9, 11 no-over-refusal, 12, 14, 15 and the existing planning-mode tests 1-5 (item 19).
