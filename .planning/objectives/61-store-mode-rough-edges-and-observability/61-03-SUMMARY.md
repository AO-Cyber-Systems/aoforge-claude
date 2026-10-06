---
objective: 61-store-mode-rough-edges-and-observability
trd: "03"
subsystem: github-store
tags: [store-mode, gh-pr, naming, tdd]
requires: []
provides:
  - "objective-name.cjs: objectiveHeadingName, bareSlug, objectiveDisplayName (one name chain for issue and PR titles)"
affects: [gh.cjs readObjectiveState, gh-pr.cjs objectiveName]
tech-stack:
  added: []
  patterns: ["one shared pure chain module, called by both title builders"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/objective-name.cjs
    - plugins/devflow/devflow/bin/lib/objective-name.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-pr.cjs
key-decisions:
  - "Titles stay create-only: gh pr sync never sends a title, and no existing PR is renamed (a human may have edited the remote title)"
requirements-completed: [STOR-02]
metrics:
  duration: "about 5 minutes"
  completed: 2026-10-06
---

# Objective 61 TRD 03: Objective PR titles use the objective name Summary

A fresh-store `gh pr start` now titles the PR `Objective <N>: <name>` from the same chain as the objective issue (ROADMAP name, then the OBJECTIVE.md heading, then the slug without its number prefix), so the live-run mismatch `Objective 2: goodbye-cli` beside `[Objective 2] Goodbye CLI` cannot recur.

## Progress
- [x] Task 1: objective-name.cjs, and gh.cjs's issue name moves onto it (tests 1-3) — RED 5191a004, GREEN c6bf4cdd
- [x] Task 2: gh-pr's PR title uses the objective name (tests 4-8) — RED 93eb022f, GREEN c7606b69

## What changed

- `lib/objective-name.cjs` (new, `fs` and `path` only): `objectiveHeadingName` moved verbatim from gh.cjs, plus `bareSlug` and `objectiveDisplayName({roadmapName, objDir, dirName, number})`.
- `gh.cjs`: the local `objectiveHeadingName` is deleted; `readObjectiveState` calls `objectiveDisplayName`. The issue name is the same for every real input (the 55-04 store-naming suite is unchanged and green).
- `gh-pr.cjs`: `objectiveName(root, id, info)` calls `objectiveDisplayName` with `objDir = join(root, info.directory)` and `dirName = basename(info.directory)`. Its doc comment names the full chain and STOR-02.

## Deviations from Plan

None - TRD executed as written. Two small notes, neither a rule deviation:

- Test 8 asserts only the sync behaviour. The start-title assertion lives in test 4, so test 8 passes before the fix as the TRD expected ("may already pass"). It also overwrites the PR title in the fake as a human would, and proves `gh pr sync` leaves it.
- `bareSlug` returns null for a name that is only a number prefix (`07-`), so `objectiveDisplayName` falls through to `objective <number>`. The old inline expression would have returned an empty string there. No real objective directory has that shape.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../objective-name.test.cjs` | 1 | FAIL (module not found) |
| GREEN (task 1) | `node --test .../objective-name.test.cjs .../gh-store-naming.test.cjs .../gh-sync.test.cjs .../gh-body.test.cjs` | 0 | PASS (156 tests) |
| RED (task 2) | `node --test .../gh-pr-title.test.cjs` | 1 | FAIL (tests 4 and 7: slug title `Objective 7: store-demo`; 5, 6, 8 pass as guards) |
| GREEN (task 2) | `node --test .../gh-pr-title.test.cjs .../gh-pr.test.cjs .../gh-pr-cli.test.cjs .../gh-pr-e2e.test.cjs .../gh-pr-reconcile.test.cjs` | 0 | PASS (108 tests) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: objective-name.cjs and gh.cjs issue name | `node --test objective-name.test.cjs gh-store-naming.test.cjs gh-sync.test.cjs gh-body.test.cjs` | 0 | PASS |
| 2: gh-pr PR title | `node --test gh-pr-title.test.cjs gh-pr.test.cjs gh-pr-cli.test.cjs gh-pr-e2e.test.cjs gh-pr-reconcile.test.cjs` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task (scoped test) | `node --test objective-name.test.cjs gh-pr-title.test.cjs gh-pr.test.cjs gh-store-naming.test.cjs` | 0 | PASS (49 tests) |
| single definition | `rg -n "function objectiveHeadingName" plugins/devflow/devflow/bin/lib` (one match, objective-name.cjs) | 0 | PASS |
| full suite (widening check) | `npm test` (exit code not captured: output was filtered) | n/a | 11 failing tests, none caused by this TRD (see below) |

Full-suite failures (10,153 tests, 10,092 pass, 11 fail, 50 skipped), none caused by this TRD:

- 9 daemon and handoff tests (`devflow-watch`, `handoff-e2e`: PID file, start/stop, route-results 15s timeouts, LK-1/LK-2). They require none of gh.cjs, gh-pr.cjs or objective-name.cjs. Run alone against the base checkout they pass except MA-7 (`doctl auth init`), which also fails at base. The rest are load-sensitive under the full parallel run.
- `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md` (`stack-drafter-fleet.test.cjs`): fails at the base checkout too (reads real repos under `~/dev`).
- `E2E1: SELF-TEST` (`roadmap-reconcile.test.cjs`): reports drift in this worktree because this TRD's own SUMMARY exists while the ROADMAP line for `61-03-pr-title-objective-name-TRD.md` is still `[ ]`. `roadmap update-job-progress` (run in the state step) is the fix. It reads `process.cwd()`, so it passes against the main checkout.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (fresh-store PR title from the heading, one shared chain, ROADMAP name still wins with `Objective 7: Store demo` unchanged, titles create-only)
- Gate failures: none attributable to this TRD (see above)

## Discovered commands

None. The stack profile (general) supplied `test: npm test (scoped: node --test {files})`; `lint`, `build`, `format` are `none`.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/objective-name.cjs
- FOUND: plugins/devflow/devflow/bin/lib/objective-name.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-pr-title.test.cjs
- FOUND commits: 5191a004, c6bf4cdd, 93eb022f, c7606b69
