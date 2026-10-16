---
objective: 54-codeql-cleanup
trd: "06"
subsystem: tooling
tags: [codeql, regex-injection, incomplete-sanitization, roadmap, node-cjs]

requires:
  - phase: 54-01
    provides: "lib/text-escape.cjs: escapeRegExp, objectiveNumPattern"
provides:
  - "objective.cjs, roadmap.cjs and workstreams.cjs build every objective-number RegExp with objectiveNumPattern (trailing boundary, every dot escaped)"
  - "objective complete reads the Requirements line from the objective's own section and escapes each requirement ID"
  - "workstreams.test.cjs (new): regression tests for workstreams checkbox matching"
affects: [54-09, 54-10]

tech-stack:
  added: []
  patterns:
    - "objectiveNumPattern at every interpolation site, harmless where `:` or `[:\\s]` already follows"
    - "Section-anchored lookup: find the `#{2,4} Objective N:` header, slice to the next Objective header, then search the slice"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/workstreams.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
    - plugins/devflow/devflow/bin/lib/workstreams.cjs

key-decisions:
  - "Requirements lookup now needs a `#{2,4} Objective N:` header; an objective that exists only as a checklist line updates no requirements"
  - "roadmap-progress.cjs and searchObjectiveInDir left alone (see Out-of-scope findings)"

requirements-completed: ["54-A"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-10-04
tokens_input: 8513228
tokens_output: 41582
tokens_cache_read: 8365890
tokens_cache_write: 147206
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 54 TRD 06: Objective-number regexes in objective.cjs, roadmap.cjs and workstreams.cjs Summary

**Every objective-number RegExp in the three ROADMAP-editing modules now goes through `text-escape.cjs`; three real matching bugs (an unbounded `Objective 1` matching `Objective 12`, a Requirements lookup that read the wrong section, and a crash on free-text Requirements lines) are fixed with RED-first tests.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-04T18:42:55Z (exec-context claim time)
- **Completed:** 2026-10-04T18:48:26Z
- **Tasks:** 2 of 2
- **Files modified:** 6 (1 created, 5 modified)

## Progress
- [x] Task 1: roadmap.cjs and workstreams.cjs on objectiveNumPattern — RED ee583e5e, GREEN b2933690
- [x] Task 2: objective.cjs on the shared helper; section-anchored, escaped Requirements update — RED 3a017541, GREEN 3288fb54

## Accomplishments

- **roadmap.cjs** (alerts 84, 65, 85, 66, 68, 74 plus unflagged :281): the header regexes at the old :105/:146, the checklist fallback, the `roadmap analyze` checkbox and the `update-job-progress` checkbox all use `objectiveNumPattern`. `roadmap analyze` no longer reports objective 1 as checked because a checked Objective 12 sits above it.
- **workstreams.cjs** (unflagged :48, :357, :363, :397): all four first-dot `.replace('.', '\\.')` interpolations replaced. `workstreams analyze` no longer takes Objective 12's (or 4.10's) checkbox as Objective 1's (or 4.1's). The reconcile table-row pattern also stops matching `| 4.1. Name |` when reconciling objective 4.
- **objective.cjs** (alerts 87, 76, 77, 78, 79, 82): `cmdObjectiveRemove` and `cmdObjectiveComplete` use `objectiveNumPattern`; the dead `objectiveEscaped` is deleted; the local `escapeRegExp` copy is gone and the file imports `text-escape.cjs` (the `0*` leading-zero sites keep calling `escapeRegExp`, unchanged).
- **Requirements update:** the lookup is anchored to the objective's own `#{2,4}` section and each requirement ID is passed through `escapeRegExp`. Objective 54's own Requirements line (`none (security/correctness tech debt; see ...)`) used to make `objective complete` throw `Unterminated group`; it now exits 0.
- After this TRD there is no `function escapeRegExp` outside `text-escape.cjs` in `lib/` (excluding tests), and no first-dot `.replace('.', ...)` or `.replace(/\./g, ...)` escape in the three files.

## Task Commits

1. Task 1 RED: `ee583e5e` test(54-06): failing tests for objective-number boundaries in roadmap and workstreams
2. Task 1 GREEN: `b2933690` fix(54-06): escape objective numbers with a trailing boundary in roadmap and workstreams
3. Task 2 RED: `3a017541` test(54-06): failing tests for objective remove/complete matching and requirement IDs
4. Task 2 GREEN: `3288fb54` fix(54-06): shared escapes in objective remove/complete; anchor Requirements lookup to the objective's section

## Decisions Made

- **Section-anchored lookup requires a header.** The old lazy regex found a Requirements line from any mention of `Objective N`, including a bare checklist entry with no detail section. The anchored lookup, as the TRD specified, needs `### Objective N:` (2-4 hashes). That matches how `objective remove` and `roadmap get-objective` already find a section. No existing test relied on the looser behaviour.
- **`next` section boundary uses `\s*`** (as in the TRD's snippet) where `roadmap.cjs` uses `\s+` for the same idiom. It is a superset, so a `##Objective 3` heading also ends the slice; it cannot cut a section short that the header regex would have found.
- **Variable name `objectiveEscaped` kept** in `cmdRoadmapUpdateJobProgress` and `targetEscaped` in `cmdObjectiveRemove`: they now hold the escaped pattern with the lookahead, and renaming them would only widen the diff.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: roadmap and workstreams | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs plugins/devflow/devflow/bin/lib/workstreams.test.cjs plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs` | 0 (49 pass, 0 fail) | PASS |
| 1: df-tools suite | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 (153 pass, 0 fail; run after Task 1 and again after Task 2) | PASS |
| 1: done-check | `rg -n "replace\('\.'\|replace\(/\\\\\./g" roadmap.cjs workstreams.cjs` | 1 (no output, as required) | PASS |
| 2: objective | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/objective-branch.test.cjs plugins/devflow/devflow/bin/lib/text-escape.test.cjs` | 0 (81 pass, 0 fail) | PASS |
| 2: done-check | `rg -n "function escapeRegExp\|replace\('\.'\|replace\(/\\\\\./g" objective.cjs roadmap.cjs workstreams.cjs` | 1 (no output, as required) | PASS |
| TRD verification: free-text Requirements on a scratch copy | `df-tools --cwd <scratch copy of .planning/ with stub REQUIREMENTS.md> objective complete 54 --raw` | 0 | PASS |

The scratch copy was built under the session scratchpad from this repo's `.planning/ROADMAP.md` and `objectives/54-codeql-cleanup/`, plus a stub REQUIREMENTS.md. Objective 54's Requirements line is the free-text one that crashed before.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test roadmap.test.cjs workstreams.test.cjs` | 1 (items 1, 8 and 9 fail; 2 and 3 pass) | FAIL (correct) |
| GREEN (Task 1) | `node --test roadmap.test.cjs workstreams.test.cjs roadmap-progress.test.cjs` | 0 (49/49) | PASS (correct) |
| RED (Task 2) | `node --test objective.test.cjs` | 1 (items 4 and 5 fail; 6 and 7 pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test objective.test.cjs objective-branch.test.cjs text-escape.test.cjs` | 0 (81/81) | PASS (correct) |
| REFACTOR | not applicable (the swap is the implementation) | n/a | n/a |

Why each RED failed:

- Item 1 (`roadmap analyze`): `roadmap_complete` was `true` for objective 1, taken from the checked Objective 12 line.
- Item 8 (`workstreams analyze`): `completed_objectives` was `['1', '12']`, expected `['12']`.
- Item 9 (`workstreams analyze`, decimals): `completed_objectives` was `['4.1', '4.10']`. The TRD expected only item 8 to be RED; the first-dot escape plus missing boundary made `4.1` match `4.10` too, so 9 was RED as well.
- Item 4 (`objective complete 2`): R-2 was not ticked (the lookup captured objective 1's `R-1` line).
- Item 5 (free-text Requirements): `objective.cjs:914` threw on the unescaped token `(tech`.

**Regression guards that passed on unmodified code, kept as tests:** roadmap items 2 and 3 (the `:` and `[:\s]` after the number already rejected `4.10`) and objective items 6 and 7 (`4.1.2` and `4.10` were already rejected at every remove/complete site). They pin that behaviour across the helper swap, as the TRD asked.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over the roadmap, workstreams, roadmap-progress, objective, objective-branch, text-escape and df-tools test files | 0 | PASS |
| test (full) | `npm test` | not run | not_available: deferred to TRD 54-09 by the dispatch instruction to run only tests relevant to the changed files |

The TRD's `<validation_gates>` names `npm test`. This run did not execute it, so the full suite is not claimed as passing here, and `verification.gates_passed` is 0 for that reason. The scoped runs above are supporting evidence only.

## Deviations from Plan

None to the code or task scope: the TRD was executed as written.

### Process notes (not deviations)

- Item 9 was RED where the TRD predicted a pass-or-fail unknown; see TDD Evidence.
- One scoped edit command ran inside a single Bash call that began with `cd` (the worktree discipline asks for one plain command per call). It was not refused and changed nothing outside the worktree; every later command used absolute paths or `git -C`.
- The main checkout's `git status` after the run matches the session-start snapshot (11 untracked files, none from this run).

## Out-of-scope findings (not fixed, for a follow-up)

- `searchObjectiveInDir` (`objective.cjs:15`) finds an objective directory with `d.startsWith(normalized)`. With directories `04.10-ten` and no `04.1-*`, `findObjectiveInternal('4.1')` returns the 4.10 directory. It is a path-prefix bug, not a regex site, so it is outside this TRD. The new tests avoid it by always creating `04.1-one`.
- `roadmap-progress.cjs` `updateJobsLine`'s `(?:[.:]|\s|$)` lets `4` match a `4.1` header (noted in the TRD as TRD 54-01's file and a follow-up).

## Auth Gates

None.

## Discovered commands

None. The stack profile (`general`) supplied `test` as `npm test` with scoped form `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (every truth in the TRD frontmatter: helper used at all sites with no first-dot escapes left; `roadmap analyze` objective 1 vs 12; `workstreams analyze` objective 1 vs 12; `objective complete 2` scoped to its own section; free-text Requirements line does not throw; decimal 4.1 never touches 4.10 or 4.1.2; objective.cjs imports text-escape.cjs and its local copy is gone)
- Gate failures: None. The full `npm test` gate was not run (deferred to TRD 54-09).

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/workstreams.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/objective.cjs`, `roadmap.cjs`, `workstreams.cjs` (edited)
- FOUND: `plugins/devflow/devflow/bin/lib/objective.test.cjs`, `roadmap.test.cjs` (edited)
- FOUND: commit `ee583e5e` (test, RED, Task 1)
- FOUND: commit `b2933690` (fix, GREEN, Task 1)
- FOUND: commit `3a017541` (test, RED, Task 2)
- FOUND: commit `3288fb54` (fix, GREEN, Task 2)
- Commits are on branch `df/exec-54-06`; the main checkout carries no files from this run.
