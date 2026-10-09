---
objective: 59-state-and-merge-plumbing
job: "05"
trd: "05"
subsystem: objective-ops
tags: [df-tools, objective, roadmap, tool-02, truthful-flags]

requires: [59-01]
provides:
  - "objective remove --confirm: roadmap_updated is true only when ROADMAP.md's text changed; ROADMAP.md is not rewritten otherwise"
  - "objective complete: roadmap_updated is true only when ROADMAP.md was written; an idempotent re-run reports false"
  - "lib/__fixtures__/objective-flags-fixtures.cjs: roadmapFor() and flagsProject() temp-project builders"
affects: [59-07 dogfood-and-docs]

tech-stack:
  added: []
  patterns:
    - "TOOL-02 compare-then-write: hold the original text, compare after the edits, write and report only on a difference"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/objective-flags-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs

key-decisions:
  - "objective.test.cjs 48-14 case 1d pinned the old defect (roadmap_updated true for an unchanged ROADMAP); changed to false on the orchestrator's instruction, commit 06c3b1c7"
  - "TRD test 7 (objective.test.cjs passes unchanged) is a gate run, not a case in objective-change-flags.test.cjs"

requirements-completed: [PLMB-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-05
tokens_input: 20031307
tokens_output: 66538
tokens_cache_read: 19864117
tokens_cache_write: 166910
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 59 TRD 05: objective change flags Summary

**`objective remove --confirm` and `objective complete` now report `roadmap_updated` from a before/after comparison of ROADMAP.md and write it only when it changed, the same compare-then-write rule TOOL-02 gave `state_updated`.**

## Progress
- [x] Task 1: Fixture builder for remove/complete projects — 11550f94
- [x] Task 2: roadmap_updated reports a real change (tests 1-7) — RED 91c9862f, GREEN 047730ea

## Accomplishments
- `cmdObjectiveRemove` keeps the ROADMAP text it read, compares after the section/checkbox/row removal and the renumber pass, and writes only on a difference. The directory renames are done either way, and `roadmap_updated` is the comparison, no longer a constant `true`.
- `cmdObjectiveComplete` starts from `roadmapUpdated = false`, compares around its one ROADMAP write, and reports that instead of `fs.existsSync(roadmapPath)`. The REQUIREMENTS.md block still reads the updated `roadmapContent`; it is untouched.
- `objective-change-flags.test.cjs` spawns the real binary on temp projects under a fake HOME. Tests 2 and 5 also pin the file mtime to 2020 first and assert it is unchanged afterwards, which proves no write happened rather than inferring it from bytes.

## Task Commits
1. Task 1: `11550f94` test(59-05): objective flags fixture builder
2. Task 2 RED: `91c9862f` test(59-05): roadmap_updated tracks a real change
3. Task 2 GREEN: `047730ea` fix(59-05): roadmap_updated reports whether ROADMAP.md changed
4. Orchestrator-directed pin fix: `06c3b1c7` test(59-05): case 1d pins roadmap_updated false for an unchanged ROADMAP

## Deviations from Plan

### Stale pin in objective.test.cjs (the TRD's error_recovery case; fixed on the orchestrator's instruction)

**[Orchestrator-directed edit outside files_modified] objective.test.cjs 48-14 case 1d pinned `roadmap_updated: true` for a run that does not change ROADMAP.md**
- **Found during:** Task 2 GREEN, scoped gate.
- **Evidence:** the same test asserts `p.read('ROADMAP.md') === STORE_FIXTURE.roadmap`, so ROADMAP.md is byte-identical after `objective complete 7`, while the pin said `roadmap_updated: true`. The fixture's section uses `**Plans:**`, with no checkbox, progress table or `**Jobs:**` line, so nothing is edited. The pin recorded the old `fs.existsSync` defect.
- **First action:** none to the test, because it is outside this TRD's files and the TRD says to report rather than edit it. Reported to the orchestrator in the TRD-complete message.
- **Resolution:** the orchestrator decided the pin recorded the old defect and directed the fix. Commit 06c3b1c7 changes the one assertion to `roadmap_updated: false` with a comment saying ROADMAP.md is byte-identical, so nothing changed. `objective.test.cjs` is now 54/54.
- **Related:** TRD test 7 is therefore run as a gate (now 54/54) and not embedded as a case in `objective-change-flags.test.cjs`. I first wrote it there as a nested `node --test` run, saw it fail for exactly this reason, and removed it in the GREEN commit 047730ea: it would only have failed twice for one cause.

### Other

None. The two source edits are exactly the two ROADMAP writes and the two flags the TRD names.

## Deferred Issues

**Pre-existing, out of scope, not fixed: `objective remove` rewrites dates in ROADMAP.md.** The renumber pass replaces every `NN-NN` token for objectives above the removed one (`Job references: 18-01 -> 17-01`) across the whole file. Reproduced on a temp project: removing objective 1 from a ROADMAP whose progress row held `2026-03-15` left `2025-02-15` (`03-15` became `02-15`, then `26-02` became `25-02`). The change is real, so `roadmap_updated: true` is correct for it, but the bytes are wrong. The new fixture deliberately contains no dates for this reason. Worth a TRD of its own; 59-07's dogfood on a scratch copy would show it if the real ROADMAP carries dates, which it does.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | `node -e "const f=require('.../objective-flags-fixtures.cjs'); ... p.read('ROADMAP.md').includes('### Objective 1: A')"` printed `true`, TRD file present, cleanup removed the root | 0 | PASS |
| 2 RED: tests 1-6 | `node --test .../objective-change-flags.test.cjs` | 1 | FAIL as intended (tests 2 and 5 failed on `roadmap_updated`; 1, 3, 4, 6 are controls and passed) |
| 2 GREEN: tests 1-6 | `node --test .../objective-change-flags.test.cjs` | 0 | PASS (6/6) |
| 2 GREEN: test 7 gate | `node --test .../objective.test.cjs` | 1 | 53/54; only 48-14 case 1d failed (stale pin, see Deviations) |
| Pin fix (06c3b1c7) | `node --test .../objective.test.cjs` | 0 | PASS (54/54) |
| Pin fix (06c3b1c7) | `node --test .../objective-change-flags.test.cjs` | 0 | PASS (6/6) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs` | 1 | FAIL (correct): 2 and 5 reported `true !== false` on `roadmap_updated` |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs` | 0 | PASS (correct): 6/6 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test objective-change-flags.test.cjs objective.test.cjs` | 0 | PASS after 06c3b1c7: 6/6 new tests, objective.test.cjs 54/54 (before it: 53/54, the stale 1d pin) |
| test | `npm --prefix <worktree> test` | 1 | 9744 tests, 12 fail, run BEFORE 06c3b1c7; see below. With the pin fixed, 11 remain, all environmental or known baseline |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

The 12 `npm test` failures in the worktree, classified:
- 9 are `devflow-watch.test.cjs` (4) and `handoff-e2e.test.cjs` (5), all daemon tests. A linked worktree has no `node_modules`, and these tests need it. With `node_modules` symlinked in temporarily, `devflow-watch.test.cjs` passed 22/22 and `handoff-e2e.test.cjs` passed 11/13 (one skip, plus MA-7). The symlink was removed afterwards. The same suite run in the main checkout at the same base commit passed all of them.
- 2 are on the TRD's known-baseline list: roadmap-reconcile E2E1 and stack-drafter-fleet github-enterprise-migration. MA-7 (also known) is skipped in the worktree for the same missing-`node_modules` reason and fails when it runs.
- 1 was objective.test.cjs 48-14 case 1d, this TRD's stale pin. It is fixed by 06c3b1c7 (the full suite was not re-run after it; objective.test.cjs was re-run alone and passes 54/54).

Baseline for comparison: the main checkout, same commit, `npm test` gave 9738 tests with 2 failures (MA-7, github-enterprise-migration).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 3/3, with a caveat on the third. `remove` and `complete` report `roadmap_updated` only on a real change (tests 1-6). "Existing objective.test.cjs cases pass unchanged" holds for 53 of 54 as written; case 1d pinned the old defect and was changed by the orchestrator's instruction (06c3b1c7), after which the file is 54/54.
- Gate failures: none remaining from this TRD

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/objective-flags-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/objective-change-flags.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/objective.cjs (modified)
- FOUND: plugins/devflow/devflow/bin/lib/objective.test.cjs (case 1d pin changed)
- FOUND commits: 11550f94, 91c9862f, 047730ea, 06c3b1c7
