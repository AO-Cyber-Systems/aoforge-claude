---
objective: 62-built-in-sweep
trd: "03"
subsystem: testing
tags: [builtin-audit, ratchet, repo-test, baselines, askuserquestion, taskcreate, plan-mode]

requires:
  - "62-01: builtin-audit.cjs scanner"
  - "62-02: docs/built-in-sweep.md inventory"
provides:
  - "builtin-sweep.repo.test.cjs: the BLTN-01..03 ratchet over the real skills and workflows (11 numbered tests, 16 node tests)"
  - "__fixtures__/builtin-sweep-baseline/<group>.json x8: what each conversion group still has pending"
  - "docs/built-in-sweep.md reconciled with the scanner (Detect column settled)"
affects: [62-04, 62-05, 62-06, 62-07, 62-08, 62-09, 62-10, 62-11]

tech-stack:
  added: []
  patterns:
    - "Pure check functions (data in, error lines out) with the real tree and baselines fed in by the tests, so sensitivity cases inject a mutation instead of touching files"
    - "Per-group JSON baselines keyed by file + kind + exact text (a multiset, no line numbers), after planning-writes-baseline of objective 48"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/micro-quick-debug.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/verify-work.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/plan-build.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/new-project.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/milestone.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/execute-and-map.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/todo-status-objective.json
    - plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/remaining.json
  modified:
    - plugins/devflow/devflow/bin/lib/builtin-audit.cjs
    - plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs
    - docs/built-in-sweep.md

key-decisions:
  - "No scanner pattern changed: the reconcile found every scan row flagged and every finding covered, so the scanner is unchanged apart from one regex-escape fix"
  - "A bare list head (`Options:`) is covered by any inventory row in the same file whose Before sits within 12 lines, a rule rather than a list, so it needs no edit when a conversion moves a line"
  - "An ask-misuse row is resolved when no ask-without-options finding holds its text, so BS-002 (quick.md) is a scan row even though converted calls may keep the same `AskUserQuestion(` opener"

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true

duration: 10min
completed: 2026-10-06
tokens_input: 9966314
tokens_output: 66780
tokens_cache_read: 9801507
tokens_cache_write: 164679
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 62 TRD 03: The sweep ratchet Summary

**`builtin-sweep.repo.test.cjs` turns the scanner and the inventory into a CI ratchet over the real prose: nothing new in prompts, progress, plan-mode drafts or allowed-tools may land, and eight per-group baselines list the 77 prompt findings, 6 progress flows, 3 draft flows and 13 allowed-tools pairs still pending.**

## Progress
- [x] Task 1: Reconcile the scanner with the inventory — 16566875
- [x] Task 2: builtin-sweep.repo.test.cjs and the eight baselines — RED e1bdec4b, fix b81b29bf, GREEN 0339efdd

## Accomplishments

- **Reconcile (Task 1).** A scratchpad script parsed the inventory and ran `scanSet` + `scanPrompts`. Result: 0 `scan` rows with no finding, 0 `manual` rows the scanner flags except BS-002, and 5 findings with no row (the five bare `Options:` list heads). No pattern needed to change, so there was no scanner RED phase. BS-002 (quick.md `AskUserQuestion(`) became `scan`; the inventory's Detect column is now 69 `scan` / 51 `manual`. 17 real-line cases from inventory rows were pinned in `builtin-audit.test.cjs` (96 tests in the file).
- **Ratchet (Task 2).** 11 numbered tests (16 node tests): real tree and groups (1), prompt findings against baselines as a multiset (2) and stale entries (3), baseline shape (4), progress (5), plan-mode draft review (6), allowed-tools missing and forbidden with an empty `ALLOWED_TOOLS_EXEMPT` (7), zero bad markers (8), the inventory against the tree plus every finding having a row (9a, 9b), sensitivity (10) and the flow tables (11). Failures list every offender as `file:line: kind: text (group g)`.
- **Baselines.** Eight files, written from a scratchpad generator (not committed) and read by eye. The progress, plan-mode, missing and forbidden lists match the planner's measurement exactly.

### Pending per group (the wave-3 work lists)

| Group | Owner TRD | prompts | progress | plan_mode | allowed_tools_missing | allowed_tools_forbidden |
|---|---|---|---|---|---|---|
| micro-quick-debug | 62-04 | 7 | debug, micro, quick | - | quick:TaskCreate, quick:TaskUpdate | - |
| verify-work | 62-04 | 8 | verify-work | - | verify-work:TaskCreate, verify-work:TaskUpdate | - |
| plan-build | 62-05 | 6 | build, plan-objective | plan-objective | plan-objective:TaskCreate, plan-objective:TaskUpdate | build:ExitPlanMode, plan-objective:ExitPlanMode |
| new-project | 62-06 | 7 | - | new-project | new-project:TaskCreate, new-project:TaskUpdate | - |
| milestone | 62-07 | 10 | - | milestone-complete | - | - |
| execute-and-map | 62-08 | 14 | - | - | execute-objective:TaskUpdate | - |
| todo-status-objective | 62-09 | 17 | - | - | - | - |
| remaining | 62-11 | 8 | - | - | cleanup:AskUserQuestion, flow:AskUserQuestion | - |
| **Total** | | **77** | **6** | **3** | **11** | **2** |

Removing an entry from a baseline fails the test naming it (tried: one prompt, one progress flow and one forbidden pair removed from `plan-build.json`, each named; then restored).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Reconcile | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` (96 tests) and the reconcile script printing 0 scan rows without a finding, 5 findings without a row (covered by the proximity rule) | 0 | PASS |
| 2: Ratchet | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` (16 node tests, all 11 numbered tests) | 0 | PASS |
| 2: Prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs` (244 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2, e1bdec4b) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 1 (5 of 16 fail: tests 2, 5, 6, 7, 9a; no baselines) | FAIL (correct) |
| GREEN (Task 2, 0339efdd) | `node --test plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 0 (16 pass) | PASS (correct) |

Task 1 had no RED phase: the reconcile found no scanner gap, so the new cases in `builtin-audit.test.cjs` pass on the existing module (they pin the agreement between the inventory and the scanner rather than drive a change).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs` | 0 (112 pass) | PASS |
| prose suite | `node --test 'plugins/devflow/devflow/bin/lib/*.repo.test.cjs' plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 (with builtin-audit.test.cjs: 244 pass) | PASS |
| full suite | `npm test` | 1 | 10450 pass, 3 fail, 32 skipped (see below) |

`npm test` failures (none touches a file this TRD changed):
- `E2E1: SELF-TEST — reconcile dry-run ... zero drift` (roadmap-reconcile.test.cjs): reports 62-03 as `[ ]` in ROADMAP.md while its SUMMARY exists. Expected mid-run; `roadmap update-job-progress` at the end of this TRD resolves it (re-checked below).
- `github-enterprise-migration: draft has no unaccepted conflict with the committed STACK.md` (stack-drafter-fleet.test.cjs) and `stack init against the real fleet`: read other repositories under `~/dev` and compare their STACK.md files.
- `handoff pipeline — PTY-path mock auth` / `MA-7 doctl auth init`: need a PTY and a doctl login on this machine.

## Discovered commands

None. `test` came from the stack profile (`node --test {files}`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] builtin-audit.cjs hand-rolled a regex escape**
- **Found during:** Task 2 (the prose suite, `regex-escape.repo.test.cjs`, TRD 56-01)
- **Issue:** 62-01's `parseToolList` built its key pattern with a hand-rolled `'\\$&'` escape, which the 56-01 guard fails on (`builtin-audit.cjs:309 meta-escape`). The suite was red from wave 1 on.
- **Fix:** `parseToolList` now uses `escapeRegExp` from `./text-escape.cjs`. Behaviour is the same for the keys it receives (`allowed-tools`, `disallowed-tools`; a `-` outside a character class needs no escape).
- **Files modified:** plugins/devflow/devflow/bin/lib/builtin-audit.cjs
- **Commit:** b81b29bf

### Interpretation choices (not rule deviations)

- **Bare `Options:` heads (error_recovery).** The five findings cannot have a row of their own (Before needs 12 characters) and the pattern is right to flag them, so the repo test applies a rule (test 9b): a finding whose whole text is a bare list head is covered by a row in the same file whose Before sits within 12 lines of it. All five resolve to the rows 62-02 named (BS-061, BS-112, BS-073, BS-074, BS-093).
- **BS-002.** Set to `scan` because the scanner flags it. To keep the "Before gone" resolved check from blocking 62-04 (converted calls may keep the `AskUserQuestion(` opener), an `ask-misuse` row is resolved when no `ask-without-options` finding holds its text, instead of the literal "Before no longer occurs".
- **Test 9b is an addition** to the TRD's test 9: every scanner finding must have an inventory row, so a hand-added baseline entry cannot hide pending work from the inventory.
- **Commit messages.** Task 1 is one `feat(62-03)` commit (test + doc; the module is unchanged); the TRD's wording "with the module" assumed a scanner change.

## Notes for the wave-3 conversion TRDs

- Each TRD edits only its own baseline file(s). Deleting an entry before converting is the RED step (test 2 fails naming the finding); converting makes it green, and a converted line whose entry is still listed fails test 3 as stale. Delete the file when it is empty; a missing file is empty.
- A prompt entry is matched on file + kind + exact trimmed line text. Reword a flagged line and the old entry goes stale, the new text must not be a finding.
- A `scan` row that is neither pending nor resolved fails test 9a naming the row. A conversion that keeps its `Before` text only on marked lines counts as resolved.
- `adopt` needs `disallowed-tools: AskUserQuestion` (62-08); `ALLOWED_TOOLS_EXEMPT` stays empty.
- build and plan-objective are the only skills that declare `ExitPlanMode`; remove it (62-05).

## Post-TRD Verification

- Auto-fix cycles used: 0 (one Rule 1 fix, applied once)
- Must-haves verified: 6/6 (CI fails on a new prompt, missing progress, missing plan-mode review, undeclared or forbidden built-in; every inventory row is pending or resolved; scanner and inventory agree)
- Gate failures: None in the scoped and prose gates; `npm test` has 3 failures unrelated to this TRD (listed above)
- Files changed outside the TRD's `files_modified`: none

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/builtin-sweep.repo.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/builtin-sweep-baseline/ (8 files)
- FOUND: plugins/devflow/devflow/bin/lib/builtin-audit.test.cjs, docs/built-in-sweep.md
- FOUND commits: 16566875, e1bdec4b, b81b29bf, 0339efdd
