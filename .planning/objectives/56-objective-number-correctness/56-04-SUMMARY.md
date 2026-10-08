---
objective: 56-objective-number-correctness
trd: "04"
subsystem: df-tools ROADMAP field parsing
tags: [roadmap, goal, depends-on, bold-label, gh-sync, bootstrap, reconcile, text-escape]

requires:
  - objective: 56-objective-number-correctness
    provides: 56-02 boldLabelPattern and the leading-zero-tolerant objectiveNumPattern in text-escape.cjs
provides:
  - "roadmap get-objective / analyze / getRoadmapObjectiveInternal read **Goal**: and **Depends on**: (v1.5 form) as well as the colon-inside form"
  - "gh listObjectives (issue-body goal) and bootstrapObjectiveMd (OBJECTIVE.md ## Goal) read both label forms"
  - "roadmap-reconcile's Progress-row matcher goes through objectiveNumPattern"
affects: [56-05, init plan-objective, gh sync, roadmap analyze]

tech-stack:
  added: []
  patterns:
    - "one definition of the bold-label rule: boldLabelPattern(label), never an inline (?::\\*\\*|\\*\\*:)"
    - "one definition of the objective-number rule, including ROADMAP Progress-table first cells"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
    - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
    - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
    - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
    - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs

key-decisions:
  - "GOAL_RE and DEPENDS_RE are hoisted to module scope in roadmap.cjs and reused at all four read sites; gh.cjs hoists its own GOAL_RE; project-bootstrap builds its Goal regex locally and keeps its no-`i`-flag case sensitivity"
  - "The Success Criteria regex is untouched (it already accepts both forms)"
  - "objMatch in _updateProgressTable is only tested for truthiness, so the capture group is dropped with the swap"

patterns-established:
  - "v1.5 fixture builder v15Section(num, name, { goal, requirements, dependsOn, criteria, form }) in roadmap.test.cjs: hand-built literal ROADMAP lines in either label form"

requirements-completed: [ONUM-03]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-05
tokens_input: 7639341
tokens_output: 33449
tokens_cache_read: 7502069
tokens_cache_write: 137150
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 56 TRD 04: ROADMAP field labels Summary

**`roadmap get-objective 56` now returns its goal: `**Goal**:` and `**Depends on**:` (the v1.5 colon-outside form) read everywhere `**Goal:**` did, through `boldLabelPattern`, and reconcile's Progress-row matcher shares `objectiveNumPattern`.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-05T16:24Z
- **Completed:** 2026-10-05T16:29Z
- **Tasks:** 2
- **Files modified:** 8 (4 production, 4 test)

## Accomplishments

- `roadmap get-objective`, `roadmap analyze` and `getRoadmapObjectiveInternal` (init plan-objective, gh-pr, gh) read the Goal in either label form, and `roadmap analyze` reads Depends on in either form. Live check: `roadmap get-objective 56` prints the objective 56 goal, and `roadmap analyze --raw` reports a non-null goal for each of objectives 55-64 (it reported `goal: null` for every v1.5 objective before).
- gh `listObjectives` (so `readObjectiveState` and the issue body) and `bootstrapObjectiveMd` (so a new OBJECTIVE.md `## Goal`) read both forms. A `**Goal**:` section no longer scaffolds the `_(extract from ROADMAP.md ...)_` placeholder.
- roadmap-reconcile's `_updateProgressTable` matches the first cell with `(?:Objective\s+)?` + `objectiveNumPattern`, which removes the last hand-built `N|0N` alternation in a ROADMAP regex. It updates `| 5 |`, `| 05 |` and `| Objective 5 |` and never `| 15 |` or `| 50 |`.
- ONUM-03 is pinned at roadmap and bootstrap level: `### Objective 04:` is found for `get-objective 4`, and `### Objective 05:` for `05-*`.
- `rg -n -F -e 'Goal:\*\*' -e 'Depends on:\*\*'` over `bin/lib` (production files, fixtures excluded) prints nothing.

## Task Commits

1. Task 1 RED: `259f1373` test(56-04): roadmap get-objective/analyze read **Goal**: and **Depends on**:
2. Task 1 GREEN: `20f0768d` fix(56-04): roadmap reads **Goal**: and **Depends on**: as well as the colon-inside form
3. Task 2 RED: `ddadfed1` test(56-04): gh, bootstrap and reconcile read the v1.5 ROADMAP shape
4. Task 2 GREEN: `0502b222` fix(56-04): gh issue goal, OBJECTIVE.md bootstrap goal and the reconcile row matcher use the shared patterns

## Progress

- [x] Task 1: Hand-built v1.5 ROADMAP fixture + roadmap.cjs reads **Goal**: and **Depends on**: — 259f1373, 20f0768d
- [x] Task 2: gh listObjectives, OBJECTIVE.md bootstrap and the reconcile progress row use the shared patterns — ddadfed1, 0502b222

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan adjustments (test-only)

1. **Test names O16 and O17 instead of O12 and O13.** project-bootstrap.test.cjs already has `O12`, `O13`, `O14` and `O15` (backfillAllObjectives and the 04.1 / no-Goal tests). The TRD's two new bootstrap tests are `O16` (`**Goal**:` colon outside) and `O17` (`### Objective 05:` heading, guard).
2. **Added `RU-56c`.** The TRD's test 11 (`RU-56a`, plus the `5` and `Objective 5` repeat as `RU-56b`) are guards: the old `${objectiveNum}|${paddedNum}` alternation already rejected `15` and `50` for a bare `5` heading, so they passed before the swap. The genuinely RED case is a zero-padded heading (`### Objective 05:`, captured verbatim as `'05'`) against a bare `| 5 |` row: the old matcher only tried `05`, the shared pattern accepts both. `RU-56c` pins that, and it failed before the change.
3. **Test 7 is `13c` in gh-sync.test.cjs** and rewrites the per-test `root` ROADMAP in place (the fixture root is rebuilt in `beforeEach`, so nothing leaks). It also asserts the old-form `02.1-b` goal still reads.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: roadmap.cjs reads both label forms | `node --test plugins/devflow/devflow/bin/lib/roadmap.test.cjs` (44 tests) | 0 | PASS |
| 1: live ROADMAP | `df-tools roadmap get-objective 56` | 0 | PASS (goal non-null) |
| 1: no colon-inside readers | `rg -n -F -e 'Goal:\*\*' -e 'Depends on:\*\*' roadmap.cjs` | 1 (no matches) | PASS |
| 2: gh, bootstrap, reconcile | `node --test gh-sync project-bootstrap roadmap-reconcile roadmap-reconcile-cli roadmap` (179 tests) | 0 | PASS |
| 2: no colon-inside readers | `rg -n -F 'Goal:\*\*' bin/lib --glob '!*.test.cjs' --glob '!**/__fixtures__/**'` | 1 (no matches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern 56-04 roadmap.test.cjs` | 1 (tests 1, 2, 3, 5 failed: goal `null`) | FAIL (correct) |
| GREEN (Task 1) | `node --test roadmap.test.cjs` | 0 (44/44) | PASS (correct) |
| RED (Task 2) | `node --test gh-sync project-bootstrap roadmap-reconcile` | 1 (13c, O16, RU-56c failed) | FAIL (correct) |
| GREEN (Task 2) | same plus roadmap-reconcile-cli and roadmap | 0 (179/179) | PASS (correct) |

Test 4 (no Goal never borrows the next section's), test 5's heading half, O17, RU-56a and RU-56b are guards and passed before the change, as the TRD intends.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test roadmap gh-sync project-bootstrap roadmap-reconcile` | 0 | PASS |
| test | `npm test` | 1 | see below |

`npm test` in this worktree (`node_modules` symlinked): 9267 tests, 9232 pass, 3 fail, 32 skipped. None is caused by this TRD:

- **`MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` (handoff-e2e, PTY-path mock auth)**: known baseline failure on this machine.
- **`github-enterprise-migration: draft has no unaccepted conflict` (stack-drafter-fleet, "stack init against the real fleet")**: known baseline failure, depends on the real fleet.
- **`E2E1: SELF-TEST — reconcile dry-run ... zero drift` (roadmap-reconcile.test.cjs)**: the only drift reported is `- [ ] 56-04-roadmap-field-labels-TRD.md` while 56-04 has a SUMMARY. It is cleared by the `roadmap update-job-progress` step that follows this SUMMARY (same as 56-02).

## Discovered commands

None. The stack profile was `general` and every command came from it (`npm test`, `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (get-objective 56 and getRoadmapObjectiveInternal return a `**Goal**:` goal; analyze reports goal and depends_on for both forms; gh `readObjectiveState` returns the goal; bootstrap writes the goal instead of the placeholder; a Goal-less section never borrows the next one's; `### Objective 04:` found for `4` and `05` bootstrap; reconcile matcher via `objectiveNumPattern` never touches `| 15 |` or `| 50 |`)
- Gate failures: the 3 `npm test` failures above, none attributable to this change

## Issues Encountered

One process slip, no effect on the result: the first `npm test` was launched from the main checkout (the Bash tool's cwd) rather than the worktree. I killed it within seconds and re-ran with `npm --prefix <worktree> test`. The reported totals are from the worktree run.

## Next

Out-of-scope follow-ups found at plan time, recorded and not fixed here:

- **`**Jobs:**` vs `**TRDs**:`** in roadmap-progress. The v1.5 ROADMAP writes `**TRDs**:` (or `**TRDs:**`), a different label from the `**Jobs:**` line roadmap-progress reads and writes.
- **roadmap-reconcile `**Status:**` read and write.** Its writer emits `**Status:**` and v1.5 sections have no Status line, so the objective rollup never fires for them.
- **`_findObjectiveSections` integer-only `### Objective (\d+):`.** A decimal objective (`### Objective 4.1:`) is invisible to the reconcile rollup and its Progress-row update.

56-05 (changelog and dogfood) can rely on `roadmap get-objective 56`, `roadmap analyze` and `init plan-objective` returning the real goal.

## Self-Check: PASSED

- FOUND: roadmap.cjs, roadmap.test.cjs, gh.cjs, gh-sync.test.cjs, project-bootstrap.cjs, project-bootstrap.test.cjs, roadmap-reconcile.cjs, roadmap-reconcile.test.cjs
- FOUND commits: 259f1373, 20f0768d, ddadfed1, 0502b222
