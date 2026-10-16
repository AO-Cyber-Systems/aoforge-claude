---
objective: 54-codeql-cleanup
trd: "08"
subsystem: tooling
tags: [codeql, incomplete-sanitization, markdown-table, adopt, stack-report, node-cjs]

requires:
  - "54-01: lib/text-escape.cjs mdCell"
provides:
  - "ADOPT-REPORT.md tables escape every cell once, at render, with mdCell"
  - "renderHighTable emits a three-column delimiter under its three-column header"
  - "STACK-REPORT.md cell() = em-dash placeholder + mdCell"
affects: [54-09]

tech-stack:
  added: []
  patterns:
    - "Escape at the render boundary, never at row construction: row builders pass raw values, the JSON payload keeps them raw"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-report.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.cjs
    - plugins/devflow/devflow/bin/lib/stack-report.test.cjs

key-decisions:
  - "Escaping moved from four row-construction sites into the two renderers, so nothing is escaped twice and inference rows (never escaped before) are covered"
  - "adopt report's JSON needs_review/high rows now carry raw values (previously the stack-note and gap rows carried pipe-escaped text)"

requirements-completed: ["54-B"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 4min
completed: 2026-10-04
tokens_input: 4226384
tokens_output: 26122
tokens_cache_read: 4130077
tokens_cache_write: 96221
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 54 TRD 08: Markdown table cells in adopt and stack-report Summary

**ADOPT-REPORT.md and STACK-REPORT.md now escape every table cell once through the shared `mdCell` (backslash, then pipe, then newlines), so no value can add or remove a column; CodeQL alerts 130-133 and 135 have no remaining source pattern.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-04T18:43:12Z (exec-context claim time)
- **Completed:** 2026-10-04T18:46:42Z (last task commit)
- **Tasks:** 2 of 2
- **Files modified:** 4, 178 insertions and 9 deletions (code and tests)

## Progress
- [x] Task 1: adopt.cjs escapes every table cell once at render (alerts 130-133) — RED 9e956d1a, GREEN b559274d
- [x] Task 2: stack-report cell escapes via mdCell (alert 135) — RED 31863eaf, GREEN 76ed736a

## Accomplishments

- `renderNeedsReviewTable` and `renderHighTable` in `adopt.cjs` wrap every data cell in `mdCell`. The `#` index, header and delimiter rows are untouched.
- The four per-site `.replace(/\|/g, '\\|')` calls (alerts 130, 131, 132, 133) are gone. `rg -nF "replace(/\|/g"` over `adopt.cjs` and `stack-report.cjs` prints nothing.
- Rows that were never escaped before now render as single cells: inference field/value/evidence, and the literal `expected confidence: high|medium|low` evidence of the malformed-inference row (it used to add two extra columns).
- `renderHighTable`'s delimiter is `|---|---|---|`, matching its three-column header, so GFM now recognises the table.
- `stack-report.cjs` `cell` keeps its em-dash placeholder for null, undefined and empty values and delegates everything else to `mdCell` (alert 135). The `(root)` default and both callers are unchanged.
- A scratch end-to-end check (`adopt report` over hostile inference values: pipes, trailing backslashes, embedded newlines, a malformed entry) wrote an ADOPT-REPORT.md where all 10 table rows, delimiters included, had the header's cell count.

## Task Commits

1. Task 1 RED: `9e956d1a` test(54-08): failing tests for pipes and backslashes in ADOPT-REPORT tables
2. Task 1 GREEN: `b559274d` fix(54-08): escape ADOPT-REPORT table cells once at render with mdCell; three-column delimiter for the high table
3. Task 2 RED: `31863eaf` test(54-08): failing test for backslash-pipe in STACK-REPORT cells
4. Task 2 GREEN: `76ed736a` fix(54-08): escape STACK-REPORT cells with the shared mdCell

## Decisions Made

- **Render-boundary escaping.** Row builders now pass raw text. The JSON payload of `adopt report` (`needs_review`, `high`) therefore carries raw values too; before, the stack-note and STACK-REPORT gap rows carried pipe-escaped text there. Nothing in the repo consumes the escaped form: `needs_review` is read only by `adopt-cli.cjs` (a row count), and the e2e checker looks for field names. The existing assertions on those rows (`item === 'test: ginkgo -r -p — binary_missing'` and the `startsWith(`${g.id}: `)` check) pass unchanged.
- **Test numbering.** The new adopt tests are named `54-08/1` to `54-08/4` (TRD list items 1-4) and the stack-report ones sit in a `report table cells (TRD 54-08 tests 6-8)` suite. Item 7 has an extra guard, `7b`, for the draft-notes table (em-dash for a missing candidate, four columns). Items 5 and 8 are the existing tests, which passed without edits.
- **Local `cellsOf`.** Defined in each test file, as the TRD asked, rather than shared through a fixture module.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: adopt cells | `node --test adopt-report.test.cjs adopt-e2e.test.cjs adopt-scaffold.test.cjs adopt-preflight.test.cjs` | 0 (82/82 pass) | PASS |
| 1: done-check | `rg -nF "replace(/\|/g" plugins/devflow/devflow/bin/lib/adopt.cjs` | 1 (no output, as required) | PASS |
| 2: stack-report cell | `node --test stack-report.test.cjs adopt-report.test.cjs` | 0 (47/47 pass) | PASS |
| 2: done-check | `rg -nF "replace(/\|/g" plugins/devflow/devflow/bin/lib/stack-report.cjs` | 1 (no output, as required) | PASS |
| TRD verification: scratch adopt report | one-off `node` script over a go-service fixture with hostile inferences | 0 (10 rows, 0 cell-count mismatches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test --test-name-pattern="54-08" adopt-report.test.cjs` | 1 (4 of 4 fail: 6, 7, 6 and 4 cells instead of 5, 5, 5 and 3) | FAIL (correct) |
| GREEN (task 1) | `node --test adopt-report.test.cjs adopt-e2e.test.cjs adopt-scaffold.test.cjs adopt-preflight.test.cjs` | 0 (82/82) | PASS (correct) |
| RED (task 2) | `node --test --test-name-pattern="TRD 54-08" stack-report.test.cjs` | 1 (test 6 fails with 6 cells instead of 5; guards 7 and 7b pass, as designed) | FAIL (correct) |
| GREEN (task 2) | `node --test stack-report.test.cjs adopt-report.test.cjs` | 0 (47/47) | PASS (correct) |
| REFACTOR | not needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over the five test files above | 0 | PASS |
| test (full) | `npm test` | not run | not_available: deferred to TRD 54-09 by the dispatch instruction to run only tests relevant to the changed files |

The TRD's `<validation_gates>` names `npm test`. This run did not execute it, so the full suite is not claimed as passing. `verification.gates_passed` is 0 for that reason; the scoped runs are supporting evidence only.

## Deviations from Plan

None: the TRD was executed as written. No existing test asserted raw `|` inside a cell, so none had to be updated.

## Auth Gates

None.

## Discovered commands

None. The `general` stack profile supplied `test` as `npm test` with the scoped form `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (every cell escaped at render with `mdCell`; the four per-site escapes gone; previously unescaped inference and literal rows are single cells; `|---|---|---|` under the high table; stack-report `cell` = placeholder + `mdCell`)
- Gate failures: None. The full `npm test` gate was not run (deferred to TRD 54-09).

## Next Phase Readiness

Objective 54 group B is done. TRD 54-09 runs the full suite and the final alert check.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/adopt.cjs` (imports `mdCell`, renders with it)
- FOUND: `plugins/devflow/devflow/bin/lib/stack-report.cjs` (imports `mdCell`, `cell` delegates to it)
- FOUND: `plugins/devflow/devflow/bin/lib/adopt-report.test.cjs` and `stack-report.test.cjs` (new tests)
- FOUND: commits `9e956d1a`, `b559274d`, `31863eaf`, `76ed736a` on branch `df/exec-54-08`
- The main checkout `/Users/justin/dev/devflow-claude` carries no files from this run.
